import { createRunner, WATCHDOG_TIMEOUT_MS } from './runner.js';
import { createConsolePanel, formatEvent } from './console.js';
import { loadLesson } from './lessons.js';
import { buildAssertScript, formatAssert } from './validator.js';

// M1a 는 레슨 1개 고정. 목록·네비게이션은 이후 단계.
const LESSON_ID = 't1-01';

const SECONDS = WATCHDOG_TIMEOUT_MS / 1000;
// 블로킹 중에는 postMessage 가 플러시되지 않아 직전 로그가 도착하지 못한다(F-006).
// 도구 버그로 오해하지 않도록 한 줄 덧붙인다.
const LOG_NOTE = ' 이 시점까지 도착한 로그만 표시됩니다.';
const TIMEOUT_TEXT = {
  startup:
    '실행 프레임이 ' + SECONDS + '초 안에 시작하지 못했습니다. 코드 문제가 아닐 수 있으니 다시 실행해 보세요.',
  sync: SECONDS + '초 안에 끝나지 않아 실행을 강제 종료했습니다. 무한 루프를 확인하세요.' + LOG_NOTE,
  async: '비동기 콜백이 ' + SECONDS + '초 넘게 응답하지 않아 실행을 강제 종료했습니다.' + LOG_NOTE,
};

const titleEl = document.querySelector('#lesson-title');
const briefEl = document.querySelector('#lesson-brief');
const codeEl = document.querySelector('#code');
const runButton = document.querySelector('#run');
const resetButton = document.querySelector('#reset');
const assertListEl = document.querySelector('#asserts');
const assertSummaryEl = document.querySelector('#assert-summary');

const panel = createConsolePanel({
  logEl: document.querySelector('#log'),
  statusEl: document.querySelector('#status'),
});

let lesson = null;
let assertScript = '';
let assertTotal = 0;

// 실행 1회분 상태
let results = [];
let errorSeen = false;
let settled = false;

const setSummary = (text, kind) => {
  assertSummaryEl.textContent = text;
  assertSummaryEl.className = 'status' + (kind ? ' status--' + kind : '');
};

const appendResult = (line) => {
  const li = document.createElement('li');
  li.className = 'assert--' + line.status;
  li.textContent = line.text;
  assertListEl.appendChild(li);
};

// done 을 마감 신호로 쓴다. 그 전까지 도착한 것만 이번 실행의 판정 재료다.
const settle = () => {
  if (settled) return;
  settled = true;
  if (!assertTotal) return;

  // 구문 에러가 나면 사용자 코드 스크립트만 죽고 assert 스크립트는 그대로 돈다.
  // 그 결과 '함수를 찾을 수 없습니다'가 뜨는데 진짜 원인은 문법이다.
  // error 는 assert 보다 먼저 도착하므로 여기서 구분해 낼 수 있다.
  if (errorSeen) {
    setSummary('코드에 에러가 있어 검사하지 못했습니다.', 'error');
    return;
  }

  results.sort((a, b) => a.index - b.index).forEach((event) => appendResult(formatAssert(event)));
  const passed = results.filter((event) => event.status === 'pass').length;
  setSummary(passed + ' / ' + assertTotal + ' 통과', passed === assertTotal ? 'pass' : 'fail');
};

const runner = createRunner({
  mount: document.querySelector('#sandbox-host'),
  onEvent: (event) => {
    if (event.type === 'assert') {
      results.push(event);
      return;
    }
    if (event.type === 'done') {
      // done 은 동기 실행이 끝났다는 뜻일 뿐, 프레임은 계속 감시 대상이다
      panel.setStatus('동기 실행 완료 (' + event.ms + 'ms) · 감시 중');
      settle();
      return;
    }
    if (event.type === 'timeout') {
      panel.append('system', TIMEOUT_TEXT[event.phase]);
      panel.setStatus('강제 종료됨');
      if (!settled && assertTotal) {
        settled = true;
        setSummary('실행이 중단되어 검사하지 못했습니다.', 'error');
      }
      return;
    }
    if (event.type === 'error') errorSeen = true;

    const line = formatEvent(event);
    if (line) panel.append(line.level, line.text);
  },
});

const run = () => {
  panel.clear();
  panel.setStatus('실행 중…');
  assertListEl.replaceChildren();
  setSummary(assertTotal ? '검사 중…' : '');
  results = [];
  errorSeen = false;
  settled = false;
  runner.run(codeEl.value, { assertScript });
};

const reset = () => {
  if (!lesson) return;
  codeEl.value = lesson.starterCode;
  codeEl.focus();
  panel.setStatus('초기 코드로 되돌렸습니다');
};

const handleKeydown = (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    run();
  }
};

const renderLesson = (data) => {
  titleEl.textContent = data.title;
  briefEl.replaceChildren(
    ...data.brief.map((text) => {
      const p = document.createElement('p');
      p.textContent = text;
      return p;
    })
  );
  codeEl.value = data.starterCode;
  runButton.disabled = false;
  resetButton.disabled = false;
};

runButton.addEventListener('click', run);
resetButton.addEventListener('click', reset);
codeEl.addEventListener('keydown', handleKeydown);

// 해제 경로. 지금은 페이지 언로드가 유일한 소멸 시점이다.
const dispose = () => {
  runButton.removeEventListener('click', run);
  resetButton.removeEventListener('click', reset);
  codeEl.removeEventListener('keydown', handleKeydown);
  runner.dispose();
};
window.addEventListener('pagehide', dispose, { once: true });

loadLesson(LESSON_ID)
  .then((data) => {
    lesson = data;
    assertScript = buildAssertScript(data);
    assertTotal = (data.asserts || []).filter((spec) => spec.type === 'value').length;
    renderLesson(data);
  })
  .catch((err) => {
    titleEl.textContent = '레슨을 불러오지 못했습니다';
    panel.setStatus(err.message);
  });
