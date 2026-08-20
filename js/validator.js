const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/**
 * iframe 내부에 주입되는 assert 실행기. 프렐류드 바로 뒤, 사용자 코드 앞에 놓인다.
 * 주의 — 템플릿 리터럴이므로 내부에서 백틱과 `${` 를 쓰지 않는다.
 */
export const ASSERT_RUNTIME = `
(() => {
  // 사용자 코드가 실행되기 전에 참조를 확보한다
  const rt = window.__pgRuntime;
  const ASYNC_TIMEOUT_MS = 2000;

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

  // assert 는 파싱 도중 실행된다. 학습자가 DOMContentLoaded 로 코드를 감싸면
  // 핸들러가 붙기 전에 클릭이 날아가 정답인데도 전부 실패한다.
  const domReady = () =>
    document.readyState === 'loading'
      ? new Promise((done) => document.addEventListener('DOMContentLoaded', done, { once: true }))
      : Promise.resolve();

  // 보이는 문자열을 읽는다. 폼 컨트롤은 타이핑한 값이 textContent 에 없다.
  const visibleText = (node) =>
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(node.tagName) ? node.value : node.textContent;

  const runActions = async (actions) => {
    for (const step of actions) {
      const target = document.querySelector(step.selector);
      if (!target) throw new Error('요소를 찾지 못했습니다: ' + step.selector);

      if (step.action === 'click') {
        target.click();
      } else if (step.action === 'fill') {
        target.value = step.value;
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        throw new Error('알 수 없는 동작: ' + step.action);
      }

      // 마이크로태스크 한 번만 양보한다. setTimeout 은 백그라운드 탭에서 1초로 조여진다.
      await null;
    }
  };

  const readDom = async (spec) => {
    await runActions(spec.actions || []);
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

  window.__runAsserts = async (specs, target) => {
    if (specs.some((spec) => spec.type === 'dom')) await domReady();

    for (let index = 0; index < specs.length; index += 1) {
      const spec = specs[index];
      const base = { type: 'assert', index: index, label: spec.label };

      if (spec.type === 'dom') {
        // 액션 대상이 없으면 fail 이 아니라 error 다. 학습자가 볼 곳이 다르다.
        let seen;
        try {
          seen = await readDom(spec);
        } catch (err) {
          rt.post(Object.assign({}, base, { status: 'error', message: describe(err) }));
          continue;
        }
        const want = spec.count !== undefined ? spec.count : spec.text;
        rt.post(Object.assign({}, base, {
          status: deepEqual(seen, want) ? 'pass' : 'fail',
          expected: rt.fmt(want),
          actual: rt.fmt(seen),
        }));
        continue;
      }

      if (typeof target !== 'function') {
        rt.post(Object.assign({}, base, { status: 'error', message: '함수를 찾을 수 없습니다' }));
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
        expected: rt.fmt(spec.expected),
        actual: rt.fmt(actual),
      }));
    }
  };
})();
`;

/**
 * 레슨의 value assert 들을 실행하는 script 태그 본문을 만든다.
 * 사용자 코드 뒤, done 앞에 놓이므로 줄 번호 오프셋에는 영향이 없다.
 * 결과 Promise 를 __assertsPromise 에 남겨, done 이 그것을 기다린 뒤 발신되게 한다.
 * @returns {string} assert 가 없으면 빈 문자열
 */
export function buildAssertScript(lesson) {
  const specs = (lesson.asserts || []).filter((spec) => spec.type === 'value' || spec.type === 'dom');
  if (!specs.length) return '';

  const needsEntry = specs.some((spec) => spec.type === 'value');
  if (needsEntry && !IDENTIFIER.test(lesson.entry || '')) {
    throw new Error('entry 가 유효한 식별자가 아닙니다: ' + lesson.entry);
  }

  // JSON 안의 '<' 는 HTML 파서를 끊을 수 있어 이스케이프한다
  const json = JSON.stringify(specs).replace(/</g, '\\u003c');
  // const/let/class 로 선언한 함수는 window 에 붙지 않는다. 식별자를 그대로 적어 렉시컬 스코프로 찾는다.
  const lookup = needsEntry
    ? '(() => { try { return ' + lesson.entry + '; } catch (e) { return undefined; } })()'
    : 'undefined';
  return 'window.__assertsPromise = window.__runAsserts(' + json + ', ' + lookup + ');';
}

/** assert 이벤트 → 결과 목록에 그릴 한 줄 */
export function formatAssert(event) {
  if (event.status === 'pass') {
    return { status: 'pass', text: '통과 — ' + event.label };
  }
  if (event.status === 'error') {
    return { status: 'error', text: '오류 — ' + event.label + ' · ' + event.message };
  }
  return {
    status: 'fail',
    text: '실패 — ' + event.label + '\n  기대: ' + event.expected + '\n  실제: ' + event.actual,
  };
}
