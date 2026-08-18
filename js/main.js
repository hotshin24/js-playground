import { createRunner, TIMEOUT_MS } from './runner.js';
import { createConsolePanel, formatEvent } from './console.js';

const codeEl = document.querySelector('#code');
const runButton = document.querySelector('#run');
const panel = createConsolePanel({
  logEl: document.querySelector('#log'),
  statusEl: document.querySelector('#status'),
});

const runner = createRunner({
  mount: document.querySelector('#sandbox-host'),
  onEvent: (event) => {
    if (event.type === 'done') {
      panel.setStatus('완료 (' + event.ms + 'ms)');
      return;
    }
    if (event.type === 'timeout') {
      panel.append('system', TIMEOUT_MS / 1000 + '초 안에 끝나지 않아 실행을 강제 종료했습니다. 무한 루프를 확인하세요.');
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

const handleKeydown = (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    run();
  }
};

runButton.addEventListener('click', run);
codeEl.addEventListener('keydown', handleKeydown);

// 해제 경로. 지금은 페이지 언로드가 유일한 소멸 시점이다.
const dispose = () => {
  runButton.removeEventListener('click', run);
  codeEl.removeEventListener('keydown', handleKeydown);
  runner.dispose();
};
window.addEventListener('pagehide', dispose, { once: true });
