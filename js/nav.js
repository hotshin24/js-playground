/**
 * 레슨 목록. 완료 여부를 함께 표시한다.
 * @param {{ listEl: HTMLElement, onSelect: (id: string) => void }} options
 */
export function createNav({ listEl, onSelect }) {
  const handleClick = (event) => {
    const button = event.target.closest('button[data-lesson-id]');
    if (button && !button.disabled) onSelect(button.dataset.lessonId);
  };

  listEl.addEventListener('click', handleClick);

  /**
   * @param {Array<{id, order, title}>} entries
   * @param {{ currentId: string, isCompleted: (id: string) => boolean }} state
   */
  const render = (entries, { currentId, isCompleted }) => {
    listEl.replaceChildren(
      ...entries.map((entry) => {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'lesson-link';
        button.dataset.lessonId = entry.id;
        button.textContent = entry.order + '. ' + entry.title;

        if (entry.id === currentId) {
          button.classList.add('lesson-link--current');
          button.setAttribute('aria-current', 'true');
        }
        if (isCompleted(entry.id)) {
          button.classList.add('lesson-link--done');
          const mark = document.createElement('span');
          mark.className = 'lesson-done';
          // 체크 표시가 장식으로만 읽히지 않도록 텍스트를 함께 준다
          mark.textContent = '완료';
          button.appendChild(mark);
        }

        li.appendChild(button);
        return li;
      })
    );
  };

  return {
    render,
    dispose: () => listEl.removeEventListener('click', handleClick),
  };
}
