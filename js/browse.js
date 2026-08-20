import { createNav, createStepNav } from './nav.js';
import { createOverlay } from './overlay.js';
import { readLessons, lessonStatus } from './storage.js';

/**
 * 탐색 묶음. 레슨 목록 오버레이와 상단 단계 칩을 함께 관리한다.
 * 목록은 가끔 보는 탐색 정보이고 지문은 계속 보는 작업 정보라 칸을 나눠 둔다.
 * @param {{ listEl, chipsEl, overlayRoot, trigger, closeButton,
 *           onLesson: (id: string) => void, onStep: (index: number) => void,
 *           labelOf: (kind: string) => string }} options
 */
export function createBrowse({ listEl, chipsEl, overlayRoot, trigger, closeButton, onLesson, onStep, labelOf }) {
  const nav = createNav({
    listEl,
    onSelect: (id) => {
      overlay.close(); // 고르면 닫힌다
      onLesson(id);
    },
  });

  const stepNav = createStepNav({ listEl: chipsEl, onSelect: onStep });

  const overlay = createOverlay({
    root: overlayRoot,
    trigger,
    closeButton,
    // 레슨이 20개로 늘면 오버레이 안에도 스크롤이 생긴다. 열자마자 현재 레슨이 보여야 한다.
    onOpen: () => {
      const current = nav.currentEl();
      if (current) current.scrollIntoView({ block: 'center' });
      return current;
    },
  });

  const refresh = ({ index, lesson, stepIndex, isStepDone }) => {
    const saved = readLessons();
    nav.render(index, {
      currentId: lesson ? lesson.id : null,
      statusOf: (id) => lessonStatus(saved[id]),
    });
    if (lesson) {
      stepNav.render(lesson.steps, { currentIndex: stepIndex, isCompleted: isStepDone, labelOf });
    }
  };

  return {
    refresh,
    dispose: () => {
      nav.dispose();
      stepNav.dispose();
      overlay.dispose();
    },
  };
}
