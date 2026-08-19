import { PRELUDE } from './sandbox-prelude.js';

// 마지막 ping 이후 이 시간이 지나면 프레임이 멈춘 것으로 본다
export const WATCHDOG_TIMEOUT_MS = 3000;
const WATCHDOG_CHECK_MS = 500;
const PROTOCOL_VERSION = 1;

/**
 * srcdoc 구성: [프렐류드] → [사용자 코드] → [완료 신호].
 * script 태그를 분리해 두면 사용자 코드가 구문 에러로 죽어도 마지막 태그는 실행되어
 * done 이 발신된다. done 은 '동기 실행 완료'일 뿐 실행 종료가 아니다.
 */
const DOC_HEAD =
  '<!doctype html>\n<html>\n<head>\n<meta charset="utf-8">\n</head>\n<body>\n' +
  '<script>' + PRELUDE + '<\/script>\n' +
  '<script>\n';
const DOC_TAIL = '\n<\/script>\n<script>window.__done();<\/script>\n</body>\n</html>';

// window.onerror 의 lineno 는 srcdoc 문서 기준이다. 사용자 코드 1행 앞의 줄 수를 세어 빼준다.
const LINE_OFFSET = DOC_HEAD.split('\n').length - 1;

// 사용자 코드 안의 </script> 는 HTML 파서를 먼저 끊어버린다
const escapeScriptEnd = (code) => code.replace(/<\/(script)/gi, '<\\/$1');

/**
 * @param {{ mount: HTMLElement, onEvent: (e: object) => void }} options
 * @returns {{ run: (code: string) => void, dispose: () => void }}
 */
export function createRunner({ mount, onEvent }) {
  let frame = null;
  let checkId = 0;
  let startedAt = 0;
  let lastPingAt = 0;
  let doneSeen = false;

  const teardown = () => {
    if (checkId) {
      clearInterval(checkId);
      checkId = 0;
    }
    if (frame) {
      frame.remove();
      frame = null;
    }
  };

  const check = () => {
    // 탭이 숨겨지면 자식의 ping 타이머가 스로틀돼 멀쩡한 프레임을 죽이게 된다.
    // 프레임 단위 스로틀까지는 못 막는다 — 알려진 이슈.
    if (document.hidden) return;
    if (performance.now() - lastPingAt < WATCHDOG_TIMEOUT_MS) return;

    const phase = doneSeen ? 'async' : 'sync';
    teardown();
    onEvent({ type: 'timeout', phase, ms: WATCHDOG_TIMEOUT_MS });
  };

  // 다시 보이는 순간 묵은 lastPing 으로 즉사시키지 않도록 리시드한다
  const handleVisibility = () => {
    if (!document.hidden) lastPingAt = performance.now();
  };

  const handleMessage = (event) => {
    // opaque origin 이라 event.origin 은 "null" 로만 온다. 신뢰 판정은 source 동일성으로 한다.
    // 타임아웃으로 제거한 이전 프레임의 뒤늦은 메시지도 여기서 걸러진다.
    if (!frame || event.source !== frame.contentWindow) return;

    const msg = event.data;
    if (!msg || msg.v !== PROTOCOL_VERSION) return;

    if (msg.type === 'ping') {
      lastPingAt = performance.now();
      return;
    }

    if (msg.type === 'done') {
      doneSeen = true;
      onEvent({ type: 'done', ms: Math.round(performance.now() - startedAt) });
      return;
    }

    if (msg.type === 'error') {
      const line = msg.line > LINE_OFFSET ? msg.line - LINE_OFFSET : null;
      onEvent({ type: 'error', message: msg.message, line, col: line ? msg.col || null : null });
      return;
    }

    if (msg.type === 'console') {
      onEvent({ type: 'console', level: msg.level, args: msg.args });
    }
  };

  window.addEventListener('message', handleMessage);
  document.addEventListener('visibilitychange', handleVisibility);

  const run = (code) => {
    teardown(); // 실행마다 프레임 재생성 → 상태 초기화

    doneSeen = false;
    // 프레임이 아예 뜨지 않는 경우(프렐류드 미실행)도 이 시드 덕분에 같은 경로로 잡힌다
    lastPingAt = performance.now();

    frame = document.createElement('iframe');
    frame.title = '코드 실행 샌드박스';
    // allow-same-origin 을 절대 넣지 않는다. 넣는 순간 부모 DOM/스토리지가 열린다.
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.srcdoc = DOC_HEAD + escapeScriptEnd(code) + DOC_TAIL;

    startedAt = performance.now();
    mount.appendChild(frame);

    // 프레임 수명 내내 돈다. done 이후에도 멈추지 않는다.
    checkId = window.setInterval(check, WATCHDOG_CHECK_MS);
  };

  const dispose = () => {
    window.removeEventListener('message', handleMessage);
    document.removeEventListener('visibilitychange', handleVisibility);
    teardown();
  };

  return { run, dispose };
}
