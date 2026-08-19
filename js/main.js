import { createRunner, WATCHDOG_TIMEOUT_MS } from './runner.js';
import { createConsolePanel, formatEvent } from './console.js';
import { loadLesson } from './lessons.js';

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

const panel = createConsolePanel({
  logEl: document.querySelector('#log'),
  statusEl: document.querySelector('#status'),
});

let lesson = null;

const runner = createRunner({
  mount: document.querySelector('#sandbox-host'),
  onEvent: (event) => {
    if (event.type === 'done') {
      // done 은 동기 실행이 끝났다는 뜻일 뿐, 프레임은 계속 감시 대상이다
      panel.setStatus('동기 실행 완료 (' + event.ms + 'ms) · 감시 중');
      return;
    }
    if (event.type === 'timeout') {
      panel.append('system', TIMEOUT_TEXT[event.phase]);
      panel.setStatus('강제 종료됨');
      return;
    }
    const line = formatEvent(event);
    if (line) panel.append(line.level, line.text);
  },
});

const run = () => {
  panel.clear();
  panel.setStatus('실행 중…');
  runner.run(codeEl.value);
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
    renderLesson(data);
  })
  .catch((err) => {
    titleEl.textContent = '레슨을 불러오지 못했습니다';
    panel.setStatus(err.message);
  });
