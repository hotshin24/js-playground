import { createSession } from './session.js';
import { createWorkspace } from './workspace.js';
import { createLayout } from './layout.js';
import { createBrowse } from './browse.js';
import { createPreview } from './preview.js';
import { createBrief } from './brief.js';
import { createTheme } from './theme.js';
import { createProgress, NOTICE } from './progress.js';
import { loadIndex, loadLesson } from './lessons.js';
import { buildAssertScript } from './validator.js';
import { policyOf, labelOf, isChecked } from './steps.js';
import { setLastLesson, readLastPosition, setLessonMeta, readLessons } from './storage.js';
import { firstUnfinishedStep } from './lesson-status.js';

const el = (id) => document.querySelector('#' + id);

const theme = createTheme({ button: el('theme-toggle'), labelEl: el('theme-toggle-label') });
const runButton = el('run');
const resetButton = el('reset');
const nextButton = el('next-step');

let index = { tracks: [], lessons: [] };
let lesson = null;
let stepIndex = 0;
let step = null;
let ran = false;

const progress = createProgress({
  noticeEl: el('notice'),
  getCode: () => workspace.getCode(),
  onChanged: () => refreshNav(),
});

const brief = createBrief({ titleEl: el('step-title'), bodyEl: el('lesson-brief') });

const preview = createPreview({
  panelEl: el('preview-panel'),
  statusEl: el('preview-status'),
  hostEl: el('preview-host'),
});

const session = createSession({
  mount: el('sandbox-host'),
  previewMount: preview.host,
  onPreview: preview.setState,
  logEl: el('log'),
  statusEl: el('status'),
  listEl: el('asserts'),
  summaryEl: el('assert-summary'),
  onAllPassed: () => progress.complete({ ran: true, changed: true, allPassed: true }),
  onTimeout: () => {
    progress.discard();
    progress.notify(NOTICE.discarded);
  },
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

const browse = createBrowse({
  listEl: el('lesson-list'),
  chipsEl: el('step-list'),
  overlayRoot: el('lesson-overlay'),
  trigger: el('lesson-menu'),
  closeButton: el('overlay-close'),
  labelOf,
  onLesson: (id) => {
    if (!lesson || id !== lesson.id) openLesson(id);
  },
  onStep: (next) => {
    if (next !== stepIndex) showStep(next);
  },
});

const refreshNav = () =>
  browse.refresh({ index, lesson, stepIndex, isStepDone: progress.isStepDone });

const applyPolicy = (editable) => {
  runButton.hidden = !policyOf(step ? step.kind : 'write').run;
  // 고칠 수 있는 곳이면 되돌릴 수도 있어야 한다. 무한 루프를 넣고 빠져나올 길이 없으면 안 된다.
  resetButton.hidden = !editable;
  runButton.disabled = !editable;
  resetButton.disabled = !editable;
};

const run = () => {
  ran = true;
  const changed = progress.isCurrentCodeChanged();
  const react = lesson.runtime === 'react';
  session.run(workspace.getCode(), {
    assertScript: buildAssertScript(step, { react }),
    total: (step.asserts || []).filter((spec) => spec.type === 'value' || spec.type === 'dom').length,
    scaffold: step.scaffold,
    env: step.env,
    preview: preview.isOn(step, layout.isEditable()),
    runtime: lesson.runtime,
  });
  // 검사가 없는 단계는 실행 자체가 완료 신호다
  if (!isChecked(step.kind)) progress.complete({ ran: true, changed, allPassed: false });
};

const reset = () => {
  progress.reset();
  workspace.setCode(step.code);
  workspace.focus();
  session.setStatus('예제 코드로 되돌렸습니다');
};

const showStep = (next) => {
  progress.flush();
  stepIndex = next;
  step = lesson.steps[next];
  ran = false;
  progress.setContext(lesson.id, next, step);

  el('main').className = 'layout layout--' + step.kind;
  brief.render(step);
  el('main').classList.toggle('layout--with-preview', preview.reset(step, layout.isEditable()));
  session.clear();
  nextButton.hidden = next >= lesson.steps.length - 1;

  workspace.setCode(progress.resolveCode(step));
  setLastLesson(lesson.id, next);
  refreshNav();

  // read 단계는 에디터를 만들지 않는다. CodeMirror 를 받지 않아 첫 화면이 즉시 뜬다.
  const editable = policyOf(step.kind).editor && layout.isEditable();
  if (editable) workspace.mount();
  else workspace.unmount(layout.isEditable() ? 'step' : 'narrow');
  applyPolicy(editable);
};

const openLesson = async (id, from) => {
  lesson = await loadLesson(id);
  el('lesson-title').textContent = lesson.title;
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
    else workspace.unmount(editable ? 'step' : 'narrow');
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
  browse.dispose();
  theme.dispose();
  session.dispose();
};
window.addEventListener('pagehide', dispose, { once: true });

loadIndex()
  .then((data) => {
    index = data;
    const last = readLastPosition();
    const known = data.lessons.some((entry) => entry.id === last.lessonId);
    return known ? openLesson(last.lessonId, last.stepIndex) : openLesson(data.lessons[0].id, 0);
  })
  .catch((err) => {
    el('lesson-title').textContent = '레슨을 불러오지 못했습니다';
    session.setStatus(err.message);
  });
