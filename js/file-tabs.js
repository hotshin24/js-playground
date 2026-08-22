/**
 * 파일 탭. files[] 단계에서만 존재한다.
 *
 * 요소를 index.html 에 미리 두지 않고 여기서 만들었다 지운다. hidden 으로 숨겨 두면
 * 보이지는 않아도 105레슨의 DOM 이 달라진다 — 한 픽셀도 바뀌지 않아야 한다는 조건은
 * 마크업까지 포함한다.
 *
 * @param {{ anchorEl: HTMLElement, panelEl: HTMLElement, onSelect: (name: string) => void }} options
 *   anchorEl 앞에 끼워 넣는다. panelEl 은 탭이 가리키는 곳(에디터 자리)이다.
 */
export function createFileTabs({ anchorEl, panelEl, onSelect }) {
  let root = null;
  let listEl = null;
  let noteEl = null;
  let items = [];
  let active = '';
  // 같은 단계에서 다시 그릴 때 오류 표시를 지우지 않기 위한 지문
  let signature = '';
  const errored = new Set();

  const idOf = (name) => 'file-tab-' + name.replace(/[^\w-]/g, '-');

  const build = () => {
    root = document.createElement('div');
    root.className = 'file-tabs';

    listEl = document.createElement('div');
    listEl.className = 'file-tabs__list';
    listEl.setAttribute('role', 'tablist');
    listEl.setAttribute('aria-label', '파일');

    noteEl = document.createElement('p');
    noteEl.className = 'file-tabs__note';
    noteEl.setAttribute('role', 'status');

    root.append(listEl, noteEl);
    anchorEl.parentNode.insertBefore(root, anchorEl);
    panelEl.setAttribute('role', 'tabpanel');
    listEl.addEventListener('keydown', handleKeydown);
  };

  // 전환이 0.4~1.1ms 라 초점이 닿는 즉시 바꾼다. 탭마다 Enter 를 더 누르게 하지 않는다.
  const move = (delta, absolute) => {
    const at = items.findIndex((item) => item.name === active);
    const next = absolute !== undefined ? absolute : (at + delta + items.length) % items.length;
    const target = items[Math.max(0, Math.min(items.length - 1, next))];
    if (!target) return;
    onSelect(target.name);
    const button = listEl.querySelector('#' + idOf(target.name));
    if (button) button.focus();
  };

  function handleKeydown(event) {
    const map = { ArrowLeft: () => move(-1), ArrowRight: () => move(1), Home: () => move(0, 0), End: () => move(0, items.length - 1) };
    const run = map[event.key];
    if (!run) return;
    event.preventDefault();
    run();
  }

  const paint = () => {
    listEl.replaceChildren(
      ...items.map((item) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.id = idOf(item.name);
        button.className = 'file-tab';
        button.setAttribute('role', 'tab');
        const on = item.name === active;
        button.setAttribute('aria-selected', String(on));
        button.tabIndex = on ? 0 : -1;
        button.classList.toggle('file-tab--on', on);

        const label = document.createElement('span');
        label.textContent = item.name;
        button.append(label);

        // 자물쇠와 점은 장식이다. 낭독은 아래 visually-hidden 글자가 맡는다.
        if (item.readOnly) button.append(mark('🔒', ' (읽기 전용)'));
        if (errored.has(item.name)) {
          button.classList.add('file-tab--error');
          button.append(mark('●', ' (오류 있음)'));
        }
        button.addEventListener('click', () => onSelect(item.name));
        return button;
      })
    );
    panelEl.setAttribute('aria-labelledby', idOf(active));
  };

  const mark = (glyph, text) => {
    const wrap = document.createDocumentFragment();
    const icon = document.createElement('span');
    icon.className = 'file-tab__mark';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = glyph;
    const sr = document.createElement('span');
    sr.className = 'visually-hidden';
    sr.textContent = text;
    wrap.append(icon, sr);
    return wrap;
  };

  /** 왜 못 고치는지는 장식이 아니라 글로 말한다 */
  const setNote = (editableName) => {
    const item = items.find((entry) => entry.name === active);
    if (item && item.readOnly) {
      noteEl.textContent =
        active + ' 은(는) 읽기 전용입니다.' + (editableName ? ' 이 단계에서 고칠 파일은 ' + editableName + ' 입니다.' : '');
      return;
    }
    noteEl.textContent = '';
  };

  return {
    /** @param {Array<{name, readOnly}>} files */
    render: (files, activeName) => {
      const next = files.map((file) => file.name).join('\u0000');
      // 탭을 옮기거나 폭이 바뀔 때마다 이 함수가 다시 불린다.
      // 파일 구성이 그대로면 오류 표시를 지우지 않는다 — 지우면 학습자가 단서를 잃는다.
      if (root && next === signature) {
        active = activeName;
        paint();
        setNote((items.find((item) => !item.readOnly) || {}).name || '');
        return;
      }
      if (!root) build();
      signature = next;
      items = files.map((file) => ({ name: file.name, readOnly: Boolean(file.readOnly) }));
      active = activeName;
      errored.clear();
      paint();
      setNote((items.find((item) => !item.readOnly) || {}).name || '');
    },
    select: (name) => {
      active = name;
      paint();
      setNote((items.find((item) => !item.readOnly) || {}).name || '');
    },
    /** 활성 탭이 아닌 파일에서 난 오류를 알린다. 탭을 자동으로 넘기지는 않는다. */
    markError: (name) => {
      if (!root || !items.some((item) => item.name === name) || errored.has(name)) return;
      errored.add(name);
      paint();
    },
    remove: () => {
      if (!root) return;
      listEl.removeEventListener('keydown', handleKeydown);
      root.remove();
      root = null;
      items = [];
      signature = '';
      errored.clear();
      panelEl.removeAttribute('role');
      panelEl.removeAttribute('aria-labelledby');
    },
  };
}
