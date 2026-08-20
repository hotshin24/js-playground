const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * 모달 오버레이. 포커스 트랩은 배선에 섞으면 반드시 새는 종류의 코드라 따로 둔다.
 * @param {{ root: HTMLElement, trigger: HTMLElement, closeButton: HTMLElement,
 *           onOpen: () => (HTMLElement|null) }} options onOpen 은 포커스를 줄 요소를 돌려준다
 */
export function createOverlay({ root, trigger, closeButton, onOpen }) {
  let open = false;

  const focusables = () => [...root.querySelectorAll(FOCUSABLE)].filter((node) => node.offsetParent !== null);

  const openOverlay = () => {
    if (open) return;
    open = true;
    root.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    const target = onOpen();
    (target || focusables()[0] || closeButton).focus();
  };

  const closeOverlay = () => {
    if (!open) return;
    open = false;
    root.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.focus(); // 열기 전 자리로 돌려놓는다
  };

  const handleKeydown = (event) => {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeOverlay();
      return;
    }
    if (event.key !== 'Tab') return;

    // 열려 있는 동안 Tab 은 오버레이 안에서만 돈다
    const nodes = focusables();
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || !root.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleBackdrop = (event) => {
    if (event.target === root) closeOverlay();
  };

  trigger.addEventListener('click', () => (open ? closeOverlay() : openOverlay()));
  closeButton.addEventListener('click', closeOverlay);
  root.addEventListener('click', handleBackdrop);
  document.addEventListener('keydown', handleKeydown);

  return {
    close: closeOverlay,
    isOpen: () => open,
    dispose: () => {
      closeButton.removeEventListener('click', closeOverlay);
      root.removeEventListener('click', handleBackdrop);
      document.removeEventListener('keydown', handleKeydown);
    },
  };
}
