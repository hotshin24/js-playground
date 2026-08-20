const STATUS_TEXT = { done: '완료', partial: '진행 중' };

/**
 * 레슨 목록 오버레이 내용. 트랙별로 묶고 현재 레슨을 표시한다.
 * @param {{ listEl: HTMLElement, onSelect: (id: string) => void }} options
 */
export function createNav({ listEl, onSelect }) {
  const handleClick = (event) => {
    const button = event.target.closest('button[data-lesson-id]');
    if (button) onSelect(button.dataset.lessonId);
  };

  listEl.addEventListener('click', handleClick);

  /**
   * @param {{tracks: Array, lessons: Array}} index
   * @param {{ currentId: string, statusOf: (id: string) => 'done'|'partial'|'none' }} state
   */
  const render = (index, { currentId, statusOf }) => {
    const groups = index.tracks.length ? index.tracks : [{ id: null, title: '레슨' }];
    listEl.replaceChildren(
      ...groups.flatMap((track) => {
        const lessons = index.lessons.filter((entry) => !track.id || entry.track === track.id);
        if (!lessons.length) return [];

        const heading = document.createElement('h3');
        heading.className = 'overlay-group';
        heading.textContent = track.title; // 화면에는 우리말만. T0/T1 은 내부 이름이다

        const list = document.createElement('ol');
        list.className = 'overlay-list';
        list.replaceChildren(
          ...lessons.map((entry) => {
            const li = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'lesson-link';
            button.dataset.lessonId = entry.id;
            button.textContent = entry.order + '. ' + entry.title;

            const status = statusOf(entry.id);
            if (STATUS_TEXT[status]) {
              const badge = document.createElement('span');
              badge.className = 'lesson-status lesson-status--' + status;
              badge.textContent = STATUS_TEXT[status];
              button.appendChild(badge);
            }
            if (entry.id === currentId) {
              button.classList.add('lesson-link--current');
              button.setAttribute('aria-current', 'true');
            }

            li.appendChild(button);
            return li;
          })
        );
        return [heading, list];
      })
    );
  };

  return {
    render,
    currentEl: () => listEl.querySelector('[aria-current="true"]'),
    dispose: () => listEl.removeEventListener('click', handleClick),
  };
}

/**
 * 상단 진행 바의 단계 칩. 어느 단계로든 이동할 수 있어야 한다 —
 * 막힌 학습자를 붙잡아 두면 도구를 닫는다.
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
        button.className = 'chip';
        button.dataset.stepIndex = String(index);

        const num = document.createElement('span');
        num.className = 'chip__num';
        num.textContent = String(index + 1);

        const label = document.createElement('span');
        label.className = 'chip__label';
        label.textContent = labelOf(step.kind);

        button.append(num, label);

        if (index === currentIndex) {
          button.classList.add('chip--current');
          button.setAttribute('aria-current', 'step');
        }
        if (isCompleted(index)) {
          button.classList.add('chip--done');
          // 색과 기호만으로 구분하지 않는다
          const done = document.createElement('span');
          done.className = 'visually-hidden';
          done.textContent = ' 완료';
          button.appendChild(done);
        }

        li.appendChild(button);
        return li;
      })
    );
  };

  return { render, dispose: () => listEl.removeEventListener('click', handleClick) };
}
