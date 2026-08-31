import { policyOf } from './steps.js';
import { setLastLesson, setLessonMeta, readLessons } from './storage.js';
import { firstUnfinishedStep } from './lesson-status.js';
import { loadLesson } from './lessons.js';

/**
 * 단계와 레슨 전환. 지금 어느 레슨의 몇 번째 단계인지를 이 모듈이 쥔다.
 * 조작부(step-controls)와 목록(browse)은 여기서 읽어 간다.
 *
 * @param {{ mainEl, titleEl, nextButton, deps: object, applyPolicy: (editable) => void,
 *           onChanged: () => void }} options
 *   deps 는 progress · assist · brief · preview · session · workspace · layout 이다.
 */
export function createStepView({ mainEl, titleEl, nextButton, deps, applyPolicy, onChanged, titleOf = lesson => lesson.title }) {
  const { progress, assist, brief, preview, session, workspace, layout } = deps;
  let lesson = null;
  let stepIndex = 0;
  let step = null;
  let ran = false;

  const showStep = (next) => {
    progress.flush();
    stepIndex = next;
    step = lesson.steps[next];
    ran = false;
    progress.setContext(lesson.id, next, step);
    assist.setContext(lesson.id, next, step, lesson.steps);

    mainEl.className = 'layout layout--' + step.kind;
    brief.render(step);
    mainEl.classList.toggle('layout--with-preview', preview.reset(step, layout.isEditable()));
    session.clear();
    nextButton.hidden = next >= lesson.steps.length - 1;

    // 탭은 applyPolicy 가 붙였다 뗀다. 편집 가능 여부에 따라 존재 자체가 갈리기 때문이다.
    if (step.files) workspace.setFiles(progress.resolveFiles(step));
    else workspace.setCode(progress.resolveCode(step));
    setLastLesson(lesson.id, next);
    onChanged();

    // read 단계는 에디터를 만들지 않는다. CodeMirror 를 받지 않아 첫 화면이 즉시 뜬다.
    const editable = policyOf(step.kind).editor && layout.isEditable();
    if (editable) workspace.mount();
    else workspace.unmount(layout.isEditable() ? 'step' : 'narrow');
    applyPolicy(editable);
  };

  const openLesson = async (id, from) => {
    lesson = await loadLesson(id);
    titleEl.textContent = titleOf(lesson);
    // 단계 구성이 바뀌면 그 레슨 저장분만 조용히 버려진다
    setLessonMeta(id, lesson.steps.length, lesson.steps.map((s) => s.kind).join('-'));
    // 레슨을 고르면 첫 미완료 단계로 보낸다. 새 저장 필드 없이 완료 기록으로 계산된다.
    const start = from === undefined ? firstUnfinishedStep(readLessons()[id], lesson.steps.length) : from;
    showStep(Math.min(start, lesson.steps.length - 1));
  };

  const goNext = () => {
    progress.complete({ ran, changed: true, allPassed: false }); // read 의 유일한 완료 신호
    if (stepIndex < lesson.steps.length - 1) showStep(stepIndex + 1);
  };

  return {
    showStep,
    openLesson,
    goNext,
    current: () => ({ lesson, step, stepIndex }),
    markRan: () => { ran = true; },
  };
}
