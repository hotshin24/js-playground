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

  // sandbox="allow-scripts" 프레임은 opaque origin 이라 브라우저의 Web Storage 접근이 차단된다.
  // allow-same-origin 을 추가하면 학습자 코드가 부모 페이지에 접근할 수 있으므로 권한을 넓히지 않는다.
  // 대신 실행 프레임 안에서만 유지되는 Storage 호환 객체를 제공한다.
  const createMemoryStorage = () => {
    const values = Object.create(null);
    return {
      get length() { return Object.keys(values).length; },
      key(index) { return Object.keys(values)[index] ?? null; },
      getItem(key) {
        const name = String(key);
        return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : null;
      },
      setItem(key, value) { values[String(key)] = String(value); },
      removeItem(key) { delete values[String(key)]; },
      clear() { Object.keys(values).forEach((key) => delete values[key]); },
    };
  };

  for (const name of ['localStorage', 'sessionStorage']) {
    try {
      window[name].length;
    } catch {
      Object.defineProperty(window, name, { value: createMemoryStorage(), configurable: true });
    }
  }

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
  const consoleLines = [];

  ['log', 'info', 'warn', 'error', 'debug'].forEach((level) => {
    const original = console[level];
    console[level] = function () {
      const args = toArgs(arguments);
      if (level === 'log') consoleLines.push(args.join(' '));
      post({ type: 'console', level: level, args: args });
      if (typeof original === 'function') original.apply(console, arguments);
    };
  });

  // 미리보기에서 링크를 누르면 프레임이 그 주소로 떠나 무대가 사라진다.
  // sandbox 를 넓히지 않고 여기서 막는다. allow-top-navigation 도 allow-popups 도 넣지 않는다.
  document.addEventListener('click', (event) => {
    const link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!link) return;
    // 이미 누군가 기본 동작을 막았으면 그쪽이 처리한 것이다. 경고할 일이 아니다.
    // 해시 라우팅(T6)의 무대 장치가 캡처 단계에서 막고 주소만 바꾼다.
    if (event.defaultPrevented) return;
    event.preventDefault();
    post({
      type: 'console',
      level: 'info',
      args: ['미리보기에서는 링크가 이동하지 않습니다: ' + link.getAttribute('href')],
    });
  });

  // 모듈 실행 시 오류의 filename 은 blob URL 로 온다. 학습자에게는 파일 이름으로 보여야 한다.
  // 표는 모듈 로더가 채운다. files[] 가 없는 단계에서는 비어 있고 file 은 빈 문자열로 나간다.
  let fileNames = {};

  // 링크 오류 본문에 blob URL 이 그대로 실린다("does not provide an export named …").
  // 학습자에게 blob:null/uuid 를 보여줄 이유가 없다.
  const withNames = (text) =>
    Object.keys(fileNames).reduce((acc, url) => acc.split(url).join(fileNames[url]), String(text));

  window.addEventListener('error', (e) => {
    post({
      type: 'error',
      message: withNames(e.message || 'Unknown error'),
      line: e.lineno || 0,
      col: e.colno || 0,
      file: fileNames[e.filename] || '',
    });
  });

  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    const text = r instanceof Error ? r.name + ': ' + r.message : fmt(r, 0, new Set());
    post({ type: 'error', message: withNames('Uncaught (in promise) ' + text), line: 0, col: 0 });
  });

  // assert 런타임이 쓸 수 있게 최소한만 노출한다. 사용자 코드보다 먼저 참조를 잡아가므로
  // 이후 사용자 코드가 이 전역을 덮어써도 assert 런타임은 영향받지 않는다.
  window.__pgRuntime = {
    post: post,
    fmt: (value) => fmt(value, 0, new Set()),
    consoleLines: () => consoleLines.slice(),
    setFiles: (map) => { fileNames = map; },
  };

  // done 은 '이번 실행의 판정이 전부 끝났다'는 뜻이다. 프레임 종료가 아니다 —
  // done 이후에도 프레임은 살아 있고 워치독이 계속 본다.
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
