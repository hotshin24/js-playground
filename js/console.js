const LEVEL_CLASS = {
  warn: 'log-line--warn',
  error: 'log-line--error',
  system: 'log-line--system',
};

/**
 * @param {{ logEl: HTMLElement, statusEl: HTMLElement }} options
 */
export function createConsolePanel({ logEl, statusEl }) {
  const append = (level, text) => {
    const li = document.createElement('li');
    li.className = 'log-line';
    const extra = LEVEL_CLASS[level];
    if (extra) li.classList.add(extra);
    li.textContent = text;
    logEl.appendChild(li);
    logEl.scrollTop = logEl.scrollHeight;
  };

  const clear = () => {
    logEl.replaceChildren();
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
    const where = event.line ? '  (' + event.line + ':' + (event.col || 0) + ')' : '';
    return { level: 'error', text: event.message + where };
  }
  return null;
}
