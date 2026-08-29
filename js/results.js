import { formatAssert } from './validator.js';

/**
 * 검사 결과 패널. 판정은 done 시점에 한 번에 그린다.
 * @param {{ listEl: HTMLElement, summaryEl: HTMLElement }} options
 */
export function createResultPanel({ listEl, summaryEl }) {
  const detailsEl = listEl.closest('details');

  const setSummary = (text, kind) => {
    summaryEl.textContent = text;
    summaryEl.className = 'status' + (kind ? ' status--' + kind : '');
    if (detailsEl && (kind === 'fail' || kind === 'error')) detailsEl.open = true;
  };

  const clear = () => {
    listEl.replaceChildren();
  };

  /** @returns {number} 통과 건수 */
  const render = (events, total) => {
    clear();
    [...events]
      .sort((a, b) => a.index - b.index)
      .forEach((event) => {
        const line = formatAssert(event);
        const li = document.createElement('li');
        li.className = 'assert--' + line.status;
        li.textContent = line.text;
        listEl.appendChild(li);
      });

    const passed = events.filter((event) => event.status === 'pass').length;
    const allPassed = passed === total;
    setSummary(passed + ' / ' + total + ' 통과', allPassed ? 'pass' : 'fail');
    if (detailsEl && allPassed) detailsEl.open = false;
    return passed;
  };

  return { setSummary, clear, render };
}
