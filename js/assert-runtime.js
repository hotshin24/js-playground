/**
 * iframe 내부에 주입되는 assert 실행기. 프렐류드 바로 뒤, 사용자 코드 앞에 놓인다.
 * 주의 — 템플릿 리터럴이므로 내부에서 백틱과 `${` 를 쓰지 않는다.
 */
export const ASSERT_RUNTIME = `
(() => {
  // 사용자 코드가 실행되기 전에 참조를 확보한다
  const rt = window.__pgRuntime;
  const ASYNC_TIMEOUT_MS = 5000;

  const deepEqual = (a, b) => {
    if (Object.is(a, b)) return true;
    if (a === null || b === null) return false;
    if (typeof a !== 'object' || typeof b !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
  };

  const describe = (err) => (err && err.name ? err.name + ': ' + err.message : String(err));
  const isThenable = (value) => Boolean(value) && typeof value.then === 'function';

  window.__reportAssertError = (label, message) => {
    rt.post({ type: 'assert', index: 0, label: label, status: 'error', message: message });
    return Promise.resolve();
  };

  // assert 는 파싱 도중 실행된다. 학습자가 DOMContentLoaded 로 코드를 감싸면
  // 핸들러가 붙기 전에 클릭이 날아가 정답인데도 전부 실패한다.
  const domReady = () =>
    document.readyState === 'loading'
      ? new Promise((done) => document.addEventListener('DOMContentLoaded', done, { once: true }))
      : Promise.resolve();

  // 보이는 문자열을 읽는다. 폼 컨트롤은 타이핑한 값이 textContent 에 없다.
  const visibleText = (node) =>
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(node.tagName) ? node.value : node.textContent;

  // React 는 폼 요소의 value 세터를 인스턴스에 덮어써서 값 추적기를 함께 갱신한다.
  // 그래서 node.value = x 로 넣으면 추적기도 같이 바뀌고, 뒤이어 input 이벤트가 와도
  // "바뀐 것이 없다"고 보아 onChange 를 부르지 않는다. 제어 컴포넌트가 통째로 검사 불가가 된다.
  // 프로토타입의 원래 세터를 직접 부르면 추적기가 옛 값으로 남아 React 가 변화를 알아챈다.
  const setNativeValue = (node, value) => {
    const proto =
      node.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : node.tagName === 'SELECT'
          ? window.HTMLSelectElement.prototype
          : window.HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) {
      desc.set.call(node, value);
    } else {
      node.value = value;
    }
  };

  const runActions = async (actions, react) => {
    for (const step of actions) {
      const target = document.querySelector(step.selector);
      if (!target) throw new Error('요소를 찾지 못했습니다: ' + step.selector);

      if (step.action === 'click') {
        target.click();
      } else if (step.action === 'submit') {
        if (target.tagName !== 'FORM') throw new Error('submit 동작의 대상은 form이어야 합니다');
        target.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      } else if (step.action === 'fill') {
        setNativeValue(target, step.value);
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        throw new Error('알 수 없는 동작: ' + step.action);
      }

      // 상태 갱신이 화면과 효과에 모두 반영될 때까지 기다린다
      await settle(react);
    }
  };

  const readDom = async (spec, react) => {
    await runActions(spec.actions || [], react);
    const nodes = Array.prototype.slice.call(document.querySelectorAll(spec.select));
    return spec.count !== undefined ? nodes.length : nodes.map(visibleText);
  };

  // 영영 resolve 되지 않는 Promise 는 워치독이 잡지 못한다(ping 이 계속 흐르므로).
  // assert 레벨에서 끊어야 학습자에게 멈춘 화면을 보여주지 않는다.
  const withTimeout = (value) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('결과가 ' + ASYNC_TIMEOUT_MS / 1000 + '초 안에 완료되지 않았습니다')),
        ASYNC_TIMEOUT_MS
      );
      Promise.resolve(value).then(
        (settled) => { clearTimeout(timer); resolve(settled); },
        (err) => { clearTimeout(timer); reject(err); }
      );
    });

  // React 18 의 렌더는 스케줄러를 거쳐 매크로태스크에 실린다.
  // DOMContentLoaded 나 마이크로태스크까지 기다려도 DOM 은 아직 비어 있다(실측).
  // setTimeout 은 쓰지 않는다 — 배경 탭에서 1초로 조여진다. MessageChannel 은 그 대상이 아니고
  // React 스케줄러가 쓰는 통로라 우리 메시지가 렌더 뒤에 도착한다.
  const yieldMacrotask = () =>
    new Promise((done) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => done();
      channel.port2.postMessage(0);
    });

  // 렌더 커밋과 효과 실행은 서로 다른 매크로태스크에 실린다. 실측:
  //   양보 1회 → 화면은 그려졌지만 useEffect 는 아직 돌지 않았다
  //   양보 2회 → 효과까지 끝났다
  // 효과가 React 바깥을 건드리는 레슨을 검사하려면 두 번 양보해야 한다.
  // React 가 아닌 레슨은 마이크로태스크 한 번으로 충분하다.
  const settle = async (react) => {
    if (!react) {
      await null;
      return;
    }
    await yieldMacrotask();
    await yieldMacrotask();
  };

  // entryProblem: files[] 단계에서 진입 함수를 못 찾은 이유. 고칠 곳이 경우마다 달라
  // 로더가 문구를 정해 넘긴다. files[] 가 없는 단계는 넘기지 않아 기존 문구가 그대로 쓰인다.
  window.__runAsserts = async (specs, target, waitRender, entryProblem) => {
    if (specs.some((spec) => spec.type === 'dom')) await domReady();
    await settle(waitRender);

    for (let index = 0; index < specs.length; index += 1) {
      const spec = specs[index];
      const base = { type: 'assert', index: index, label: spec.label };

      if (spec.type === 'dom') {
        // 액션 대상이 없으면 fail 이 아니라 error 다. 학습자가 볼 곳이 다르다.
        let seen;
        try {
          seen = await readDom(spec, waitRender);
        } catch (err) {
          rt.post(Object.assign({}, base, { status: 'error', message: describe(err) }));
          continue;
        }
        const want = spec.count !== undefined ? spec.count : spec.text;
        rt.post(Object.assign({}, base, {
          status: deepEqual(seen, want) ? 'pass' : 'fail',
          input: spec.actions && spec.actions.length
            ? '화면 동작 ' + rt.fmt(spec.actions) + ' 뒤 ' + spec.select + ' 확인'
            : '화면에서 ' + spec.select + ' 확인',
          expected: rt.fmt(want),
          actual: rt.fmt(seen),
        }));
        continue;
      }

      if (typeof target !== 'function') {
        rt.post(Object.assign({}, base, { status: 'error', message: entryProblem || '함수를 찾을 수 없습니다' }));
        continue;
      }

      let actual;
      try {
        actual = target.apply(null, spec.args || []);
        // 반환값이 thenable 이면 기다렸다가 비교한다. Promise 자체를 비교하면 항상 실패한다.
        if (isThenable(actual)) actual = await withTimeout(actual);
      } catch (err) {
        rt.post(Object.assign({}, base, { status: 'error', message: describe(err) }));
        continue;
      }

      rt.post(Object.assign({}, base, {
        status: deepEqual(actual, spec.expected) ? 'pass' : 'fail',
        input: rt.fmt(spec.args || []),
        expected: rt.fmt(spec.expected),
        actual: rt.fmt(actual),
      }));
    }
  };
})();
`;
