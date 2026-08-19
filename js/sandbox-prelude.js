/**
 * iframe 내부(srcdoc)에 인라인으로 주입되는 부트 스크립트.
 * 문자열인 이유: sandbox="allow-scripts" 는 same-origin 이 없어 외부 파일/blob 로드가 막힌다.
 * 주의 — 이 문자열은 템플릿 리터럴이므로 내부에서 백틱과 `${` 를 쓰지 않는다.
 */
export const PRELUDE = `
(() => {
  const V = 1;
  const MAX_DEPTH = 3;
  const MAX_ITEMS = 100;

  // 부모 origin 은 검증하지 않는다. 이 프레임은 opaque origin 이라 신뢰 판정은 부모 쪽에서 source 동일성으로 한다.
  const post = (msg) => {
    msg.v = V;
    parent.postMessage(msg, '*');
  };

  // 구조화 복제로는 함수/DOM 노드가 못 넘어가고 순환 참조도 깨진다. 여기서 미리 문자열화한다.
  const fmt = (value, depth, seen) => {
    if (value === null) return 'null';
    const t = typeof value;
    if (t === 'undefined') return 'undefined';
    if (t === 'string') return depth === 0 ? value : JSON.stringify(value);
    if (t === 'number' || t === 'boolean') return String(value);
    if (t === 'bigint') return String(value) + 'n';
    if (t === 'symbol') return value.toString();
    if (t === 'function') return '[Function: ' + (value.name || 'anonymous') + ']';
    if (value instanceof Error) return value.name + ': ' + value.message;
    if (typeof Node !== 'undefined' && value instanceof Node) {
      return '<' + String(value.nodeName).toLowerCase() + '>';
    }
    if (seen.has(value)) return '[Circular]';
    if (depth >= MAX_DEPTH) return Array.isArray(value) ? '[Array]' : '[Object]';

    seen.add(value);
    try {
      if (Array.isArray(value)) {
        const items = value.slice(0, MAX_ITEMS).map((item) => fmt(item, depth + 1, seen));
        if (value.length > MAX_ITEMS) items.push('... ' + (value.length - MAX_ITEMS) + ' more');
        return '[' + items.join(', ') + ']';
      }
      if (value instanceof Map) return 'Map(' + value.size + ')';
      if (value instanceof Set) return 'Set(' + value.size + ')';
      const keys = Object.keys(value).slice(0, MAX_ITEMS);
      const body = keys.map((k) => k + ': ' + fmt(value[k], depth + 1, seen)).join(', ');
      const ctor = value.constructor && value.constructor.name;
      const prefix = ctor && ctor !== 'Object' ? ctor + ' ' : '';
      return prefix + '{' + body + '}';
    } catch (err) {
      return '[Unserializable]';
    } finally {
      // 형제 노드에 같은 객체가 또 나오는 것은 순환이 아니다
      seen.delete(value);
    }
  };

  const toArgs = (args) => Array.prototype.map.call(args, (a) => fmt(a, 0, new Set()));

  ['log', 'info', 'warn', 'error', 'debug'].forEach((level) => {
    const original = console[level];
    console[level] = function () {
      post({ type: 'console', level: level, args: toArgs(arguments) });
      if (typeof original === 'function') original.apply(console, arguments);
    };
  });

  window.addEventListener('error', (e) => {
    post({
      type: 'error',
      message: e.message || 'Unknown error',
      line: e.lineno || 0,
      col: e.colno || 0,
    });
  });

  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    const text = r instanceof Error ? r.name + ': ' + r.message : fmt(r, 0, new Set());
    post({ type: 'error', message: 'Uncaught (in promise) ' + text, line: 0, col: 0 });
  });

  // done 은 '동기 실행 완료'만 뜻한다. 실행 종료가 아니다 — 이후 비동기 코드는 워치독이 본다.
  window.__done = () => post({ type: 'done' });

  // --- 하트비트 워치독 ---
  // 이 프레임의 이벤트 루프가 아직 도는지를 부모에게 알리는 유일한 신호.
  // 동기든 비동기든 루프가 막히면 이 타이머부터 멈추므로 부모가 그것으로 감지한다.
  const nativeClearInterval = window.clearInterval;
  const nativeClearTimeout = window.clearTimeout;

  post({ type: 'ping' });
  const watchdogId = setInterval(() => post({ type: 'ping' }), 500);

  // 타이머 id 는 작은 정수라 사용자 코드가 clearInterval(1..n) 으로 긁으면 워치독이 죽는다.
  // id 를 클로저에 가두는 것만으로는 부족해 해제 함수 자체를 막는다.
  // setTimeout/setInterval 은 id 네임스페이스를 공유하므로 둘 다 막아야 한다.
  window.clearInterval = function (id) {
    if (id !== watchdogId) nativeClearInterval.call(window, id);
  };
  window.clearTimeout = function (id) {
    if (id !== watchdogId) nativeClearTimeout.call(window, id);
  };
})();
`;
