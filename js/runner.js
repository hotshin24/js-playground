import { buildHead, buildTail, offsetOf, escapeScriptEnd } from './frame-doc.js';

// 이 두 모듈은 정적 import 하지 않는다. 정적으로 걸면 T1·T2 에서도 요청이 나가
// F-007 의 요청 수가 늘어난다. React 레슨에서만 처음 받는다.
const REACT_MODULES = () => Promise.all([import('./transpile.js'), import('./react-runtime.js')]);

// 마지막 ping 이후 이 시간이 지나면 프레임이 멈춘 것으로 본다
export const WATCHDOG_TIMEOUT_MS = 3000;
const WATCHDOG_CHECK_MS = 500;
const PROTOCOL_VERSION = 1;

/**
 * srcdoc 구성: [프렐류드+assert 런타임] → [사용자 코드] → [assert 실행] → [완료 신호].
 * script 태그를 분리해 두면 사용자 코드가 구문 에러로 죽어도 뒤 태그는 실행되어
 * assert 결과와 done 이 발신된다.
 * done 은 '이번 실행의 판정이 전부 끝났다'는 뜻이다. assert 가 비동기면 그것까지 기다린다.
 * 다만 프레임은 done 이후에도 살아 있어 워치독의 감시 대상으로 남는다.
 */
/**
 * @param {{ mount: HTMLElement, onEvent: (e: object) => void }} options
 * @returns {{ run: (code: string) => void, dispose: () => void }}
 */

export function createRunner({ mount, onEvent }) {
  let frame = null;
  // 준비(트랜스파일·React 로드)가 비동기라 늦게 도착한 결과가 새 실행을 덮을 수 있다.
  // 세대 번호로 지난 실행의 결과를 버린다(F-008 과 같은 함정).
  let generation = 0;
  let checkId = 0;
  let startedAt = 0;
  let lastPingAt = 0;
  let lineOffset = 0;
  let doneSeen = false;
  let pingSeen = false;
  let loadSeen = false;

  // load 는 부모가 직접 받는 신호라 자식 스레드가 막혀도 도착한다.
  // 자식이 보내는 ping 과 달리 블로킹에 갇히지 않는 유일한 관측점이다.
  const handleLoad = () => {
    loadSeen = true;
    onEvent({ type: 'ready' });
  };

  const teardown = () => {
    if (checkId) {
      clearInterval(checkId);
      checkId = 0;
    }
    if (frame) {
      frame.removeEventListener('load', handleLoad);
      frame.remove();
      frame = null;
    }
  };

  const check = () => {
    // 탭이 숨겨지면 자식의 ping 타이머가 스로틀돼 멀쩡한 프레임을 죽이게 된다.
    // 실측(F-001 정정): 조이는 것은 탭 가시성 하나다. 프레임 크기·화면 부착 여부는
    // 간격을 바꾸지 못한다(0×0 과 833×234 모두 1000ms). 그래서 이 가드로 충분하다.
    // 보고 있지 않은 화면에 "멈췄습니다" 를 띄울 이유도 없다.
    if (document.hidden) return;
    if (performance.now() - lastPingAt < WATCHDOG_TIMEOUT_MS) return;

    // ping 단독으로는 판정할 수 없다. 블로킹 중에는 전달이 플러시되지 않아
    // '무한 루프'와 '프레임 시작 실패' 둘 다 ping 0건으로 보인다(공통 원인 → FINDINGS).
    // load 를 함께 봐야 갈린다: 블로킹은 load 도 함께 밀리고, 시작 실패는 load 만 즉시 온다.
    const phase = doneSeen ? 'async' : loadSeen && !pingSeen ? 'startup' : 'sync';
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
      pingSeen = true;
      lastPingAt = performance.now();
      return;
    }

    if (msg.type === 'done') {
      doneSeen = true;
      onEvent({ type: 'done', ms: Math.round(performance.now() - startedAt) });
      return;
    }

    if (msg.type === 'error') {
      const line = msg.line > lineOffset ? msg.line - lineOffset : null;
      onEvent({ type: 'error', message: msg.message, line, col: line ? msg.col || null : null });
      return;
    }

    if (msg.type === 'console') {
      onEvent({ type: 'console', level: msg.level, args: msg.args });
      return;
    }

    if (msg.type === 'assert') {
      onEvent({
        type: 'assert',
        index: msg.index,
        status: msg.status,
        label: msg.label,
        expected: msg.expected,
        actual: msg.actual,
        message: msg.message,
      });
    }
  };

  window.addEventListener('message', handleMessage);
  document.addEventListener('visibilitychange', handleVisibility);

  const start = (code, { assertScript = '', scaffold, mount: target = mount, preview = false, react = '', env = '' }) => {
    doneSeen = false;
    pingSeen = false;
    loadSeen = false;
    // 프레임이 아예 뜨지 않는 경우(프렐류드 미실행)도 이 시드 덕분에 같은 경로로 잡힌다
    lastPingAt = performance.now();

    frame = document.createElement('iframe');
    frame.title = '코드 실행 샌드박스';
    frame.addEventListener('load', handleLoad);
    // allow-same-origin 을 절대 넣지 않는다. 넣는 순간 부모 DOM/스토리지가 열린다.
    frame.setAttribute('sandbox', 'allow-scripts');
    const head = buildHead(scaffold, preview, react, env);
    lineOffset = offsetOf(head);
    frame.srcdoc = head + escapeScriptEnd(code) + buildTail(assertScript);

    startedAt = performance.now();
    // srcdoc 를 먼저 넣고 붙인다. 순서를 바꾸면 초기 about:blank 로드가
    // load 를 먼저 때려 판정이 무너진다.
    target.appendChild(frame);

    // 프레임 수명 내내 돈다. done 이후에도 멈추지 않는다.
    checkId = window.setInterval(check, WATCHDOG_CHECK_MS);
  };

  /**
   * 프레임을 만들지 못한 채 끝난 경우. done 을 합성하지 않으면 세션이 '실행 중' 에서 마감되지 않는다.
   * 프레임 밖의 실패라 window.onerror 가 잡지 못하므로 부모가 직접 같은 모양의 이벤트를 보낸다.
   */
  const failBeforeStart = (info, startedFrom) => {
    onEvent({
      type: 'error', message: info.message, line: info.line, col: info.col,
      frame: info.frame || '', blocked: Boolean(info.blocked),
    });
    onEvent({ type: 'done', ms: Math.round(performance.now() - startedFrom), started: false });
  };

  const run = (code, options = {}) => {
    teardown(); // 실행마다 프레임 재생성 → 상태 초기화

    const gen = ++generation;
    if (options.runtime !== 'react') {
      start(code, options);
      return;
    }

    // React 레슨만 여기로 온다. Babel 과 React 는 이 시점에 처음 받는다.
    const began = performance.now();
    REACT_MODULES()
      .then(([tp, rt]) =>
        Promise.all([
          rt.loadReact().catch(() => { throw rt.LOAD_FAILED; }),
          tp.transpile(code).catch((err) => { throw err && err.message ? err : tp.LOAD_FAILED; }),
        ])
      )
      .then(([react, source]) => {
        if (gen !== generation) return;
        start(source, { ...options, react });
      })
      .catch((info) => {
        if (gen !== generation) return;
        failBeforeStart(
          info && info.message
            ? info
            : { message: 'JSX 변환기를 불러오지 못했습니다. 네트워크를 확인하고 다시 실행해 주세요.', blocked: true },
          began
        );
      });
  };

  const dispose = () => {
    window.removeEventListener('message', handleMessage);
    document.removeEventListener('visibilitychange', handleVisibility);
    teardown();
  };

  return { run, dispose };
}
