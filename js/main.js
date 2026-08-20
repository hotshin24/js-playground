import { createSession } from './session.js';
import { createWorkspace } from './workspace.js';
import { createLayout } from './layout.js';
import { createNav, createStepNav } from './nav.js';
import { createProgress, NOTICE } from './progress.js';
import { loadIndex, loadLesson } from './lessons.js';
import { buildAssertScript } from './validator.js';
import { policyOf, labelOf, isChecked } from './steps.js';
import { setLastLesson, readLastPosition } from './storage.js';

const el = (id) => document.querySelector('#' + id);
const runButton = el('run');
const resetButton = el('reset');
const nextButton = el('next-step');

let index = [];
let lesson = null;
let stepIndex = 0;
let step = null;
let ran = false;

const progress = createProgress({
  noticeEl: el('notice'),
  getCode: () => workspace.getCode(),
  onChanged: () => refreshNav(),
});

const session = createSession({
  mount: el('sandbox-host'),
  logEl: el('log'),
  statusEl: el('status'),
  listEl: el('asserts'),
  summaryEl: el('assert-summary'),
  onAllPassed: () => progress.complete({ ran: true, changed: true, allPassed: true }),
});

const workspace = createWorkspace({
  hostEl: el('editor-host'),
  readonlyEl: el('readonly-code'),
  onChange: () => progress.schedule(),
  onFallback: () => progress.notify(NOTICE.fallback),
  onReadonly: () => progress.notify(NOTICE.readonly),
  onEditableChange: (editable) => {
    applyPolicy(editable);
    if (!editable) progress.flush();
  },
});

const nav = createNav({
  listEl: el('lesson-list'),
  onSelect: (id) => {
    if (!lesson || id !== lesson.id) openLesson(id, 0);
  },
});

const stepNav = createStepNav({
  listEl: el('step-list'),
  onSelect: (next) => {
    if (next !== stepIndex) showStep(next);
  },
});

const refreshNav = () => {
  nav.render(index, {
    currentId: lesson ? lesson.id : null,
    isCompleted: (id) => progress.isLessonDone(id, lesson && lesson.id === id ? lesson.steps.length : 0),
  });
  if (lesson) {
    stepNav.render(lesson.steps, { currentIndex: stepIndex, isCompleted: progress.isStepDone, labelOf });
  }
};

const applyPolicy = (editable) => {
  const policy = policyOf(step ? step.kind : 'write');
  runButton.hidden = !policy.run;
  resetButton.hidden = !policy.reset;
  runButton.disabled = !editable;
  resetButton.disabled = !editable;
};

const assertTotal = () => (step.asserts || []).filter((spec) => spec.type === 'value').length;

const run = () => {
  ran = true;
  const changed = progress.isCurrentCodeChanged();
  session.run(workspace.getCode(), { assertScript: buildAssertScript(step), total: assertTotal() });
  // 검사가 없는 단계는 실행 자체가 완료 신호다
  if (!isChecked(step.kind)) progress.complete({ ran: true, changed, allPassed: false });
};

const reset = () => {
  progress.reset();
  workspace.setCode(step.code);
  workspace.focus();
  session.setStatus('예제 코드로 되돌렸습니다');
};

const renderBrief = (brief) => {
  el('lesson-brief').replaceChildren(
    ...brief.map((text) => {
      const p = document.createElement('p');
      p.textContent = text;
      return p;
    })
  );
};

const showStep = (next) => {
  progress.flush();
  stepIndex = next;
  step = lesson.steps[next];
  ran = false;
  progress.setContext(lesson.id, next, step);

  el('main').className = 'layout layout--' + step.kind;
  // 제목이 단계 이름과 같으면 "실행해 보기 · 실행해 보기"가 된다
  const kindLabel = labelOf(step.kind);
  el('step-title').textContent = step.title && step.title !== kindLabel ? step.title + ' · ' + kindLabel : kindLabel;
  renderBrief(step.brief);
  session.clear();
  nextButton.hidden = next >= lesson.steps.length - 1;

  workspace.setCode(progress.resolveCode(step));
  setLastLesson(lesson.id, next);
  refreshNav();

  // read 단계는 에디터를 만들지 않는다. CodeMirror 를 받지 않아 첫 화면이 즉시 뜬다.
  const editable = policyOf(step.kind).editor && layout.isEditable();
  if (editable) workspace.mount();
  else workspace.unmount();
  applyPolicy(editable);
};

const openLesson = async (id, from) => {
  lesson = await loadLesson(id);
  el('lesson-title').textContent = lesson.title;
  showStep(Math.min(from, lesson.steps.length - 1));
};

const goNext = () => {
  progress.complete({ ran, changed: true, allPassed: false }); // read 의 유일한 완료 신호
  if (stepIndex < lesson.steps.length - 1) showStep(stepIndex + 1);
};

const handleKeydown = (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && step && policyOf(step.kind).run) {
    e.preventDefault();
    run();
  }
};

const layout = createLayout({
  root: el('main'),
  toggleButton: el('brief-toggle'),
  onEditableChange: (editable) => {
    if (step && policyOf(step.kind).editor && editable) workspace.mount();
    else workspace.unmount();
  },
});

runButton.addEventListener('click', run);
resetButton.addEventListener('click', reset);
nextButton.addEventListener('click', goNext);
document.addEventListener('keydown', handleKeydown);

const dispose = () => {
  progress.flush();
  runButton.removeEventListener('click', run);
  resetButton.removeEventListener('click', reset);
  nextButton.removeEventListener('click', goNext);
  document.removeEventListener('keydown', handleKeydown);
  workspace.destroy();
  layout.dispose();
  nav.dispose();
  stepNav.dispose();
  session.dispose();
};
window.addEventListener('pagehide', dispose, { once: true });

loadIndex()
  .then((entries) => {
    index = entries;
    const last = readLastPosition();
    const start = entries.some((entry) => entry.id === last.lessonId) ? last.lessonId : entries[0].id;
    return openLesson(start, start === last.lessonId ? last.stepIndex : 0);
  })
  .catch((err) => {
    el('lesson-title').textContent = '레슨을 불러오지 못했습니다';
    session.setStatus(err.message);
  });
