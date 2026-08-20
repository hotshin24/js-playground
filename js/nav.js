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
        // 트랙마다 order 가 1부터 다시 시작하므로 트랙을 함께 보여야 구분된다
        button.textContent = (entry.track || '') + '-' + entry.order + ' ' + entry.title;

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

/**
 * 단계 목록. 어느 단계로든 이동할 수 있어야 한다 — 막힌 학습자를 붙잡아 두면 도구를 닫는다.
 * @param {{ listEl: HTMLElement, onSelect: (index: number) => void }} options
 */
export function createStepNav({ listEl, onSelect }) {
  const handleClick = (event) => {
    const button = event.target.closest('button[data-step-index]');
    if (button) onSelect(Number(button.dataset.stepIndex));
  };

  listEl.addEventListener('click', handleClick);

  const render = (steps, { currentIndex, isCompleted, labelOf }) => {
    listEl.replaceChildren(
      ...steps.map((step, index) => {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'step-link';
        button.dataset.stepIndex = String(index);
        button.textContent = index + 1 + '. ' + (step.title || labelOf(step.kind));

        const kind = document.createElement('span');
        kind.className = 'step-kind';
        kind.textContent = labelOf(step.kind);
        button.appendChild(kind);

        if (index === currentIndex) {
          button.classList.add('step-link--current');
          button.setAttribute('aria-current', 'step');
        }
        if (isCompleted(index)) button.classList.add('step-link--done');

        li.appendChild(button);
        return li;
      })
    );
  };

  return { render, dispose: () => listEl.removeEventListener('click', handleClick) };
}
