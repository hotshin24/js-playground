import { policyOf, isChecked } from './steps.js';
import { buildCurrentCallAssertPlan } from './validator.js';

/**
 * 단계의 조작부 — 실행·되돌리기 버튼의 상태와 그 두 동작.
 * 파일이 여럿이면 무엇을 실행하고 무엇을 되돌리는지가 달라지므로 그 갈림도 여기 모은다.
 *
 * @param {{ runButton, resetButton, tabs, workspace, session, progress, preview, layout,
 *           current: () => ({lesson, step}), onRan: () => void }} deps
 */
export function createStepControls({
  runButton, resetButton, tabs, workspace, session, progress, preview, layout, current, onRan,
}) {
  const specsOf = (step) => (step.asserts || []).filter((spec) => spec.type === 'value' || spec.type === 'dom');

  const applyPolicy = (editable) => {
    const { step } = current();
    runButton.hidden = !policyOf(step ? step.kind : 'write').run;
    // 고칠 수 있는 곳이면 되돌릴 수도 있어야 한다. 무한 루프를 넣고 빠져나올 길이 없으면 안 된다.
    resetButton.hidden = !editable;
    runButton.disabled = !editable;

    // <768 은 편집기를 만들지 않는다. 읽기만 하는 화면에 전환 조작을 얹지 않고
    // 파일을 세로로 이어 보여준다. 그래서 탭은 편집 가능 구간에서만 존재한다.
    if (step && step.files && editable) tabs.render(step.files, workspace.activeName());
    else tabs.remove();

    // 파일이 여럿이면 되돌리기가 무엇을 되돌리는지 라벨이 말한다.
    const name = step && step.files ? workspace.activeName() : '';
    resetButton.textContent = name ? name + ' 되돌리기' : '코드 되돌리기';
    resetButton.disabled = !editable || (Boolean(name) && workspace.isReadOnly(name));
  };

  const run = () => {
    const { lesson, step } = current();
    onRan();
    const changed = progress.isCurrentCodeChanged();
    const react = lesson.runtime === 'react';
    const specs = specsOf(step);
    const code = workspace.getCode();
    const currentCallPlan = step.files ? null : buildCurrentCallAssertPlan(step, code, { react });
    // files 단계는 코드가 문서에 인라인으로 들어가지 않는다. 조립을 러너가 갈라 맡는다.
    const forFiles = step.files ? { files: workspace.getFiles(), entry: step.entry, specs } : {};
    session.run(code, {
      assertScript: step.files ? '' : currentCallPlan.script,
      total: step.files ? specs.length : currentCallPlan.total,
      scaffold: step.scaffold,
      env: step.env,
      preview: preview.isOn(step, layout.isEditable()),
      runtime: lesson.runtime,
      ...forFiles,
    });
    // 검사가 없는 단계는 실행 자체가 완료 신호다
    if (!isChecked(step.kind)) progress.complete({ ran: true, changed, allPassed: false });
  };

  const reset = () => {
    const { step } = current();
    // 파일이 여럿이면 보고 있는 파일만 되돌린다. 다른 파일의 작업을 함께 날리지 않는다.
    if (step.files) {
      const name = workspace.activeName();
      const source = step.files.find((file) => file.name === name);
      if (!source) return;
      progress.resetFile(name);
      // 상태를 새로 만들지 않고 문서를 치환한다. 그래야 되돌린 뒤 실행 취소로 되살릴 수 있다.
      workspace.setFileCode(name, source.code);
      workspace.focus();
      session.setStatus(name + ' 을(를) 예제 코드로 되돌렸습니다');
      return;
    }
    progress.reset();
    workspace.setCode(step.code);
    workspace.focus();
    session.setStatus('예제 코드로 되돌렸습니다');
  };

  return { applyPolicy, run, reset };
}
