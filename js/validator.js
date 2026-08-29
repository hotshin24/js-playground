const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/**
 * 레슨의 value assert 들을 실행하는 script 태그 본문을 만든다.
 * 사용자 코드 뒤, done 앞에 놓이므로 줄 번호 오프셋에는 영향이 없다.
 * 결과 Promise 를 __assertsPromise 에 남겨, done 이 그것을 기다린 뒤 발신되게 한다.
 * @returns {string} assert 가 없으면 빈 문자열
 */
export function buildAssertScript(lesson, { react = false } = {}) {
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
  return 'window.__assertsPromise = window.__runAsserts(' + json + ', ' + lookup + ', ' + (react ? 'true' : 'false') + ');';
}

/** assert 이벤트 → 결과 목록에 그릴 한 줄 */
export function formatAssert(event) {
  const details = event.input === undefined
    ? ''
    : '\n  검사 입력: ' + event.input + '\n  기대 결과: ' + event.expected + '\n  실제 결과: ' + event.actual;

  if (event.status === 'pass') {
    return { status: 'pass', text: '통과 — ' + event.label + details };
  }
  if (event.status === 'error') {
    return { status: 'error', text: '오류 — ' + event.label + ' · ' + event.message };
  }
  return {
    status: 'fail',
    text: '실패 — ' + event.label + details,
  };
}
