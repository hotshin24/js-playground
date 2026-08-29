const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

const maskStringsAndComments = (code) => {
  const chars = [...code];
  let state = 'code';
  let escaped = false;
  for (let i = 0; i < chars.length; i += 1) {
    const char = chars[i];
    const next = chars[i + 1];
    if (state === 'line') {
      if (char === '\n') state = 'code';
      else chars[i] = ' ';
      continue;
    }
    if (state === 'block') {
      if (char === '*' && next === '/') { chars[i] = chars[i + 1] = ' '; i += 1; state = 'code'; }
      else if (char !== '\n') chars[i] = ' ';
      continue;
    }
    if (state !== 'code') {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if ((state === 'single' && char === "'") || (state === 'double' && char === '"') || (state === 'template' && char === '`')) state = 'code';
      if (char !== '\n') chars[i] = ' ';
      continue;
    }
    if (char === '/' && next === '/') { chars[i] = chars[i + 1] = ' '; i += 1; state = 'line'; }
    else if (char === '/' && next === '*') { chars[i] = chars[i + 1] = ' '; i += 1; state = 'block'; }
    else if (char === "'") { chars[i] = ' '; state = 'single'; }
    else if (char === '"') { chars[i] = ' '; state = 'double'; }
    else if (char === '`') { chars[i] = ' '; state = 'template'; }
  }
  return chars.join('');
};

/** 사용자 코드에 실제로 작성된 entry(...) 호출의 인자 소스를 찾는다. */
export function findEntryCalls(code, entry) {
  if (!IDENTIFIER.test(entry || '')) return [];
  const masked = maskStringsAndComments(code);
  const pattern = new RegExp('\\b' + entry.replace(/[$]/g, '\\$&') + '\\s*\\(', 'g');
  const calls = [];
  let match;
  while ((match = pattern.exec(masked))) {
    const before = masked.slice(Math.max(0, match.index - 30), match.index);
    if (/function\s*$/.test(before)) continue;
    const open = masked.indexOf('(', match.index + entry.length);
    let depth = 1;
    let close = open + 1;
    for (; close < masked.length && depth; close += 1) {
      if (masked[close] === '(') depth += 1;
      else if (masked[close] === ')') depth -= 1;
    }
    if (depth === 0) {
      calls.push(code.slice(open + 1, close - 1).trim());
      pattern.lastIndex = close;
    }
  }
  return calls;
}

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

/** 편집 코드에 작성된 함수 호출을 같은 입력의 정답 함수와 비교하는 검사 계획. */
export function buildCurrentCallAssertPlan(lesson, code, { react = false } = {}) {
  const specs = (lesson.asserts || []).filter((spec) => spec.type === 'value' || spec.type === 'dom');
  const valueSpecs = specs.filter((spec) => spec.type === 'value');
  if (!valueSpecs.length || !IDENTIFIER.test(lesson.entry || '')) {
    return { script: buildAssertScript(lesson, { react }), total: specs.length };
  }

  const calls = findEntryCalls(code, lesson.entry);
  if (!calls.length) {
    const label = JSON.stringify(lesson.entry + '(...) 호출 확인');
    const message = JSON.stringify('검사할 입력을 알 수 없습니다. 코드에서 ' + lesson.entry + '(...)를 한 번 이상 호출하세요.');
    return {
      script: 'window.__assertsPromise = window.__reportAssertError(' + label + ', ' + message + ');',
      total: 1,
    };
  }

  const domSpecs = specs.filter((spec) => spec.type === 'dom');
  const callsJson = JSON.stringify(calls).replace(/</g, '\\u003c');
  const domJson = JSON.stringify(domSpecs).replace(/</g, '\\u003c');
  const solutionJson = JSON.stringify(lesson.solutionCode || '').replace(/</g, '\\u003c');
  const entryJson = JSON.stringify(lesson.entry);
  const lookup = '(() => { try { return ' + lesson.entry + '; } catch (e) { return undefined; } })()';
  const script = [
    'window.__assertsPromise = (async () => {',
    '  const __calls = ' + callsJson + ';',
    '  const __entryName = ' + entryJson + ';',
    '  const __solution = ' + solutionJson + ';',
    "  const __reference = (0, eval)('(function () {\\n' + __solution + '\\n; return ' + __entryName + ';\\n})()');",
    '  const __specs = ' + domJson + ';',
    '  for (let __index = 0; __index < __calls.length; __index += 1) {',
    "    const __args = eval('[' + __calls[__index] + ']');",
    '    const __expected = await __reference.apply(null, __args);',
    "    __specs.push({ type: 'value', label: '내가 작성한 호출 ' + (__index + 1), args: __args, expected: __expected });",
    '  }',
    '  return window.__runAsserts(__specs, ' + lookup + ', ' + (react ? 'true' : 'false') + ');',
    '})();',
  ].join('\n');
  return { script, total: domSpecs.length + calls.length };
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
