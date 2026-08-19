import { createRunner, WATCHDOG_TIMEOUT_MS } from './runner.js';
import { createConsolePanel, formatEvent } from './console.js';
import { createResultPanel } from './results.js';

const SECONDS = WATCHDOG_TIMEOUT_MS / 1000;
// 블로킹 중에는 postMessage 가 플러시되지 않아 직전 로그가 도착하지 못한다(F-006).
const LOG_NOTE = ' 이 시점까지 도착한 로그만 표시됩니다.';
const TIMEOUT_TEXT = {
  startup: '실행 프레임이 ' + SECONDS + '초 안에 시작하지 못했습니다. 코드 문제가 아닐 수 있으니 다시 실행해 보세요.',
  sync: SECONDS + '초 안에 끝나지 않아 실행을 강제 종료했습니다. 무한 루프를 확인하세요.' + LOG_NOTE,
  async: '비동기 콜백이 ' + SECONDS + '초 넘게 응답하지 않아 실행을 강제 종료했습니다.' + LOG_NOTE,
};

/**
 * 실행 1회분의 수명을 관리한다. 콘솔·검사 결과 패널이 여기에 묶인다.
 * @param {{ mount, logEl, statusEl, listEl, summaryEl, onAllPassed: () => void }} options
 */
export function createSession({ mount, logEl, statusEl, listEl, summaryEl, onAllPassed }) {
  const panel = createConsolePanel({ logEl, statusEl });
  const results = createResultPanel({ listEl, summaryEl });

  let assertEvents = [];
  let assertTotal = 0;
  let errorSeen = false;
  let settled = false;

  // done 을 마감 신호로 쓴다. 그 전까지 도착한 것만 이번 실행의 판정 재료다.
  const settle = () => {
    if (settled) return;
    settled = true;
    if (!assertTotal) return;

    // 구문 에러가 나면 사용자 코드 스크립트만 죽고 assert 스크립트는 그대로 돈다.
    // error 가 assert 보다 먼저 도착하는 점으로 진짜 원인을 가려낸다.
    if (errorSeen) {
      results.clear();
      results.setSummary('코드에 에러가 있어 검사하지 못했습니다.', 'error');
      return;
    }
    if (results.render(assertEvents, assertTotal) === assertTotal) onAllPassed();
  };

  const runner = createRunner({
    mount,
    onEvent: (event) => {
      if (event.type === 'assert') return void assertEvents.push(event);
      if (event.type === 'done') {
        panel.setStatus('동기 실행 완료 (' + event.ms + 'ms) · 감시 중');
        settle();
        return;
      }
      if (event.type === 'timeout') {
        panel.append('system', TIMEOUT_TEXT[event.phase]);
        panel.setStatus('강제 종료됨');
        if (!settled && assertTotal) {
          settled = true;
          results.setSummary('실행이 중단되어 검사하지 못했습니다.', 'error');
        }
        return;
      }
      if (event.type === 'error') errorSeen = true;
      const line = formatEvent(event);
      if (line) panel.append(line.level, line.text);
    },
  });

  const run = (code, { assertScript = '', total = 0 } = {}) => {
    assertEvents = [];
    assertTotal = total;
    errorSeen = false;
    settled = false;

    panel.clear();
    panel.setStatus('실행 중…');
    results.clear();
    results.setSummary(total ? '검사 중…' : '');
    runner.run(code, { assertScript });
  };

  return { run, setStatus: panel.setStatus, dispose: runner.dispose };
}
