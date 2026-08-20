import { policyOf } from './steps.js';

const TEXT = {
  running: '실행 중…',
  ready: '',
  stopped: '실행이 멈춰 미리보기를 지웠습니다. 다시 실행하면 처음 상태로 돌아갑니다.',
};

/**
 * 미리보기 패널. 무대(scaffold)가 있는 단계에만 보인다.
 * T1 코드는 화면을 건드리지 않으므로 빈 미리보기를 띄우면
 * "내 코드가 아무것도 안 했나"로 읽힌다.
 * @param {{ panelEl: HTMLElement, statusEl: HTMLElement, hostEl: HTMLElement }} options
 */
export function createPreview({ panelEl, statusEl, hostEl }) {
  /**
   * 이 단계에 보여줄 무대가 있는가.
   * 좁은 화면은 읽기 전용이라 실행 자체가 없다. 빈 무대만 남으므로 띄우지 않는다.
   */
  const isOn = (step, editable) =>
    Boolean(step && step.scaffold && step.scaffold.html) && policyOf(step.kind).editor && editable;

  const setState = (state) => {
    statusEl.textContent = TEXT[state] || '';
  };

  /** 단계를 옮길 때 이전 화면이 남아 있으면 안 된다 */
  const reset = (step, editable) => {
    panelEl.hidden = !isOn(step, editable);
    hostEl.replaceChildren();
    setState('ready');
  };

  return { isOn, setState, reset, host: hostEl };
}
