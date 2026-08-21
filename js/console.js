// 무한 루프 안에서 로그를 찍으면 DOM 노드가 무제한으로 늘어난다. 오래된 줄부터 버린다.
const MAX_LINES = 1000;

const LEVEL_CLASS = {
  warn: 'log-line--warn',
  error: 'log-line--error',
  system: 'log-line--system',
};

/**
 * @param {{ logEl: HTMLElement, statusEl: HTMLElement }} options
 */
export function createConsolePanel({ logEl, statusEl }) {
  let dropped = 0;
  let noticeEl = null;

  // 버린 줄이 있다는 사실 자체를 숨기지 않는다
  const showNotice = () => {
    if (!noticeEl) {
      noticeEl = document.createElement('li');
      noticeEl.className = 'log-line log-line--system';
      logEl.prepend(noticeEl);
    }
    noticeEl.textContent =
      '앞의 ' + dropped + '줄은 생략했습니다 (최대 ' + MAX_LINES + '줄까지 표시)';
  };

  const trim = () => {
    while (logEl.children.length - (noticeEl ? 1 : 0) > MAX_LINES) {
      const oldest = noticeEl ? noticeEl.nextElementSibling : logEl.firstElementChild;
      if (!oldest) return;
      oldest.remove();
      dropped += 1;
    }
    if (dropped) showNotice();
  };

  const append = (level, text) => {
    const li = document.createElement('li');
    li.className = 'log-line';
    const extra = LEVEL_CLASS[level];
    if (extra) li.classList.add(extra);
    li.textContent = text;
    logEl.appendChild(li);
    trim();
    logEl.scrollTop = logEl.scrollHeight;
  };

  const clear = () => {
    logEl.replaceChildren();
    dropped = 0;
    noticeEl = null;
  };

  // 상태 변화는 aria-live 로 알린다 (statusEl 에 role="status")
  const setStatus = (text) => {
    statusEl.textContent = text;
  };

  return { append, clear, setStatus };
}

/** 런너 이벤트 → 콘솔 패널에 찍을 한 줄 */
export function formatEvent(event) {
  if (event.type === 'console') {
    return { level: event.level, text: event.args.join(' ') };
  }
  if (event.type === 'error') {
    // file 은 files[] 단계에서만 온다. 없으면 표기가 지금까지와 한 글자도 다르지 않다.
    const at = [event.file, event.line ? event.line + ':' + (event.col || 0) : ''].filter(Boolean).join(' ');
    return { level: 'error', text: event.message + (at ? '  (' + at + ')' : '') };
  }
  return null;
}
