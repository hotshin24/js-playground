import { labelOf } from './steps.js';

/**
 * 지문 패널. 단계 종류는 상단 칩이 담당하므로 제목은 그 단계가 무엇을 하는지만 말한다.
 * @param {{ titleEl: HTMLElement, bodyEl: HTMLElement }} options
 */
export function createBrief({ titleEl, bodyEl }) {
  const render = (step) => {
    titleEl.textContent = step.title || labelOf(step.kind);
    bodyEl.replaceChildren(
      ...step.brief.map((part) => {
        if (typeof part === 'string') {
          const p = document.createElement('p');
          p.textContent = part;
          return p;
        }
        // 코드는 들여쓰기를 지키고 제 안에서 스크롤한다. 산문처럼 접으면 모양이 무너진다.
        const pre = document.createElement('pre');
        pre.className = 'prose__code';
        pre.tabIndex = 0;
        pre.textContent = part.code;
        return pre;
      })
    );
  };

  return { render };
}
