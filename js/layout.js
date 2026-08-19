// PRD §6.5: ≥1280 3분할 / 768~1279 2분할+토글 / <768 읽기 전용.
// <768 은 에디터를 아예 마운트하지 않는다. 띄워놓고 편집만 막지 않는다.
const EDITABLE_QUERY = '(min-width: 768px)';
const COLLAPSED_CLASS = 'layout--brief-collapsed';

/**
 * @param {{ root: HTMLElement, toggleButton: HTMLElement, onEditableChange: (editable: boolean) => void }} options
 */
export function createLayout({ root, toggleButton, onEditableChange }) {
  const editableQuery = window.matchMedia(EDITABLE_QUERY);

  const handleQuery = (event) => onEditableChange(event.matches);

  // 접힘은 클래스로만 표현한다. 접힘 CSS 가 768~1279 에서만 적용되므로
  // 폭이 바뀌어도 상태를 되돌리는 코드가 필요 없다.
  const handleToggle = () => {
    const collapsed = root.classList.toggle(COLLAPSED_CLASS);
    toggleButton.setAttribute('aria-expanded', String(!collapsed));
    toggleButton.textContent = collapsed ? '문제 보기' : '문제 숨기기';
  };

  editableQuery.addEventListener('change', handleQuery);
  toggleButton.addEventListener('click', handleToggle);

  return {
    isEditable: () => editableQuery.matches,
    dispose: () => {
      editableQuery.removeEventListener('change', handleQuery);
      toggleButton.removeEventListener('click', handleToggle);
    },
  };
}
