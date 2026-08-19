const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/**
 * iframe 내부에 주입되는 assert 실행기. 프렐류드 바로 뒤, 사용자 코드 앞에 놓인다.
 * 주의 — 템플릿 리터럴이므로 내부에서 백틱과 `${` 를 쓰지 않는다.
 */
export const ASSERT_RUNTIME = `
(() => {
  // 사용자 코드가 실행되기 전에 참조를 확보한다
  const rt = window.__pgRuntime;

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

  window.__runAsserts = (specs, target) => {
    specs.forEach((spec, index) => {
      const base = { type: 'assert', index: index, label: spec.label };

      if (typeof target !== 'function') {
        rt.post(Object.assign({}, base, { status: 'error', message: '함수를 찾을 수 없습니다' }));
        return;
      }

      let actual;
      try {
        actual = target.apply(null, spec.args || []);
      } catch (err) {
        rt.post(Object.assign({}, base, { status: 'error', message: describe(err) }));
        return;
      }

      rt.post(Object.assign({}, base, {
        status: deepEqual(actual, spec.expected) ? 'pass' : 'fail',
        expected: rt.fmt(spec.expected),
        actual: rt.fmt(actual),
      }));
    });
  };
})();
`;

/**
 * 레슨의 value assert 들을 실행하는 script 태그 본문을 만든다.
 * 사용자 코드 뒤, done 앞에 놓이므로 줄 번호 오프셋에는 영향이 없다.
 * @returns {string} assert 가 없으면 빈 문자열
 */
export function buildAssertScript(lesson) {
  const specs = (lesson.asserts || []).filter((spec) => spec.type === 'value');
  if (!specs.length) return '';

  if (!IDENTIFIER.test(lesson.entry || '')) {
    throw new Error('entry 가 유효한 식별자가 아닙니다: ' + lesson.entry);
  }

  // JSON 안의 '<' 는 HTML 파서를 끊을 수 있어 이스케이프한다
  const json = JSON.stringify(specs).replace(/</g, '\\u003c');
  // const/let/class 로 선언한 함수는 window 에 붙지 않는다. 식별자를 그대로 적어 렉시컬 스코프로 찾는다.
  const lookup = '(() => { try { return ' + lesson.entry + '; } catch (e) { return undefined; } })()';
  return 'window.__runAsserts(' + json + ', ' + lookup + ');';
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
