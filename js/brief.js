import { labelOf } from './steps.js';

/**
 * 지문 패널. 단계 종류는 상단 칩이 담당하므로 제목은 그 단계가 무엇을 하는지만 말한다.
 * @param {{ titleEl: HTMLElement, bodyEl: HTMLElement }} options
 */
export function createBrief({ titleEl, bodyEl }) {
  const render = (step) => {
    titleEl.textContent = step.title || labelOf(step.kind);
    bodyEl.replaceChildren(
      ...step.brief.map((text) => {
        const p = document.createElement('p');
        p.textContent = text;
        return p;
      })
    );
  };

  return { render };
}
