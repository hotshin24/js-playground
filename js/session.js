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
export function createSession({ mount, previewMount, logEl, statusEl, listEl, summaryEl,
  onAllPassed, onPreview, onTimeout, onFileError = () => {}, onChecked = () => {} }) {
  const panel = createConsolePanel({ logEl, statusEl });
  const results = createResultPanel({ listEl, summaryEl });

  let assertEvents = [];
  let assertTotal = 0;
  let errorSeen = false;
  // 도구를 준비하지 못한 것과 학습자 코드가 틀린 것은 다른 안내여야 한다
  let blockedSeen = false;
  let settled = false;
  // files[] 단계는 오류의 진단을 검사 결과가 직접 들고 온다(어느 파일 몇 행 · export 누락 …).
  // 그것을 '코드에 에러가 있어 검사하지 못했습니다' 로 덮으면 학습자가 고칠 곳을 잃는다.
  let filesMode = false;

  // done 을 마감 신호로 쓴다. 그 전까지 도착한 것만 이번 실행의 판정 재료다.
  const settle = () => {
    if (settled) return;
    settled = true;
    if (!assertTotal) return;

    // 구문 에러가 나면 사용자 코드 스크립트만 죽고 assert 스크립트는 그대로 돈다.
    // error 가 assert 보다 먼저 도착하는 점으로 진짜 원인을 가려낸다.
    if (errorSeen && !filesMode) {
      onChecked(false);
      results.clear();
      results.setSummary(
        blockedSeen ? '실행 준비가 되지 않아 검사하지 못했습니다.' : '코드에 에러가 있어 검사하지 못했습니다.',
        'error'
      );
      return;
    }
    const passed = results.render(assertEvents, assertTotal);
    // 막힌 횟수를 세는 쪽이 있다. 통과든 실패든 한 번의 판정이 끝났음을 알린다.
    onChecked(passed === assertTotal);
    if (passed === assertTotal) onAllPassed();
  };

  const runner = createRunner({
    mount,
    onEvent: (event) => {
      if (event.type === 'assert') return void assertEvents.push(event);
      if (event.type === 'ready') return void onPreview('ready');
      if (event.type === 'done') {
        // 프레임이 뜨지 못한 경우에는 감시할 대상도 없다. 같은 문구를 쓰면 거짓이 된다.
        panel.setStatus(
          event.started === false ? '실행하지 못했습니다' : '실행·검사 완료 (' + event.ms + 'ms) · 감시 중'
        );
        settle();
        return;
      }
      if (event.type === 'timeout') {
        panel.append('system', TIMEOUT_TEXT[event.phase]);
        panel.setStatus('강제 종료됨');
        onPreview('stopped');
        onTimeout();
        if (!settled && assertTotal) {
          settled = true;
          results.setSummary('실행이 중단되어 검사하지 못했습니다.', 'error');
        }
        return;
      }
      if (event.type === 'error') {
        errorSeen = true;
        if (event.blocked) blockedSeen = true;
        // 오류가 활성 탭이 아닌 파일에서 났을 수 있다. 탭을 넘기지는 않고 표시만 남긴다.
        if (event.file) onFileError(event.file);
      }
      const line = formatEvent(event);
      if (line) panel.append(line.level, line.text);
      // Babel 의 코드 프레임은 본문과 분리해 붙인다. .log 가 pre-wrap 이라 정렬이 유지된다.
      if (event.frame) panel.append('system', event.frame);
    },
  });

  const run = (code, options = {}) => {
    const { assertScript = '', total = 0, scaffold, env = '', preview = false, runtime = 'js' } = options;
    // files 단계는 assert 를 프레임 안 로더가 돌린다. 원본 명세와 검사할 이름을 그대로 넘긴다.
    const { files = null, entry = '', specs = [] } = options;
    assertEvents = [];
    assertTotal = total;
    errorSeen = false;
    blockedSeen = false;
    settled = false;
    filesMode = Boolean(files);

    panel.clear();
    panel.setStatus('실행 중…');
    results.clear();
    results.setSummary(total ? '검사 중…' : '');
    if (preview) onPreview('running');
    runner.run(code, {
      assertScript, scaffold, env, preview, runtime, files, entry, specs,
      mount: preview ? previewMount : mount,
    });
  };

  // 레슨을 옮길 때 이전 레슨의 출력이 남아 있으면 안 된다
  const clear = () => {
    panel.clear();
    panel.setStatus('');
    results.clear();
    results.setSummary('');
  };

  return { run, clear, setStatus: panel.setStatus, dispose: runner.dispose };
}
