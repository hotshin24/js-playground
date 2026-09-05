import { chapterLabel } from './lesson-labels.js';

const STATUS_TEXT = { done: '완료', partial: '진행 중' };

/**
 * 레슨 목록 오버레이 내용. 트랙별로 묶고 현재 레슨을 표시한다.
 * @param {{ listEl: HTMLElement, onSelect: (id: string) => void }} options
 */
export function createNav({ listEl, onSelect }) {
  let expandedTrackId = null;

  const setExpanded = (trackId) => {
    expandedTrackId = trackId;
    listEl.querySelectorAll('[data-track-id]').forEach((button) => {
      const expanded = button.dataset.trackId === trackId;
      button.setAttribute('aria-expanded', String(expanded));
      const panel = document.getElementById(button.getAttribute('aria-controls'));
      if (panel) panel.hidden = !expanded;
    });
  };

  const handleClick = (event) => {
    const trackButton = event.target.closest('button[data-track-id]');
    if (trackButton) {
      const next = trackButton.dataset.trackId === expandedTrackId ? null : trackButton.dataset.trackId;
      setExpanded(next);
      return;
    }
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
    const currentLesson = index.lessons.find((entry) => entry.id === currentId);
    const trackIds = groups.map((track, groupIndex) => track.id || 'group-' + groupIndex);
    if (!trackIds.includes(expandedTrackId)) {
      expandedTrackId = (currentLesson && currentLesson.track) || trackIds[0] || null;
    }

    listEl.replaceChildren(
      ...groups.map((track, groupIndex) => {
        const lessons = index.lessons.filter((entry) => !track.id || entry.track === track.id);
        if (!lessons.length) return document.createDocumentFragment();

        const trackId = track.id || 'group-' + groupIndex;
        const section = document.createElement('section');
        section.className = 'lesson-accordion';

        const heading = document.createElement('h3');
        heading.className = 'overlay-group';

        const toggle = document.createElement('button');
        const panelId = 'lesson-track-' + trackId.toLowerCase();
        toggle.type = 'button';
        toggle.className = 'track-toggle';
        toggle.dataset.trackId = trackId;
        toggle.setAttribute('aria-controls', panelId);
        toggle.setAttribute('aria-expanded', String(trackId === expandedTrackId));

        const title = document.createElement('span');
        title.textContent = chapterLabel(groups, track.id);
        const count = document.createElement('span');
        count.className = 'track-toggle__count';
        count.textContent = lessons.length + '개';
        const arrow = document.createElement('span');
        arrow.className = 'track-toggle__arrow';
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = '⌄';
        toggle.append(title, count, arrow);
        heading.appendChild(toggle);

        const list = document.createElement('ol');
        list.className = 'overlay-list';
        list.id = panelId;
        list.hidden = trackId !== expandedTrackId;
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
        section.append(heading, list);
        return section;
      })
    );
  };

  const revealCurrent = () => {
    const current = listEl.querySelector('[aria-current="true"]');
    const section = current && current.closest('.lesson-accordion');
    const toggle = section && section.querySelector('[data-track-id]');
    if (toggle) setExpanded(toggle.dataset.trackId);
    return current;
  };

  return {
    render,
    currentEl: () => listEl.querySelector('[aria-current="true"]'),
    revealCurrent,
    dispose: () => listEl.removeEventListener('click', handleClick),
  };
}

export function stepNumberOf(steps, index) {
  const writeIndexes = steps
    .map((step, stepIndex) => step.kind === 'write' ? stepIndex : -1)
    .filter((stepIndex) => stepIndex >= 0);
  if (steps[index].kind !== 'write' || writeIndexes.length < 2) return String(index + 1);
  return `${writeIndexes[0] + 1}-${writeIndexes.indexOf(index) + 1}`;
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
        num.textContent = stepNumberOf(steps, index);

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
