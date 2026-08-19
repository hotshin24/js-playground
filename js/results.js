import { formatAssert } from './validator.js';

/**
 * 검사 결과 패널. 판정은 done 시점에 한 번에 그린다.
 * @param {{ listEl: HTMLElement, summaryEl: HTMLElement }} options
 */
export function createResultPanel({ listEl, summaryEl }) {
  const setSummary = (text, kind) => {
    summaryEl.textContent = text;
    summaryEl.className = 'status' + (kind ? ' status--' + kind : '');
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
    setSummary(passed + ' / ' + total + ' 통과', passed === total ? 'pass' : 'fail');
    return passed;
  };

  return { setSummary, clear, render };
}
