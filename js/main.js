import { createSession } from './session.js';
import { createWorkspace } from './workspace.js';
import { createLayout } from './layout.js';
import { createBrowse } from './browse.js';
import { createPreview } from './preview.js';
import { createFileTabs } from './file-tabs.js';
import { createAssist } from './assist.js';
import { createStepView } from './step-view.js';
import { createStepControls } from './step-controls.js';
import { createBrief } from './brief.js';
import { createTheme } from './theme.js';
import { createProgress } from './progress.js';
import { loadIndex } from './lessons.js';
import { checkBuild } from './build-info.js';
import { policyOf, labelOf } from './steps.js';
import { readLastPosition } from './storage.js';

const el = (id) => document.querySelector('#' + id);

const theme = createTheme({ button: el('theme-toggle'), labelEl: el('theme-toggle-label') });
const runButton = el('run');
const resetButton = el('reset');
const nextButton = el('next-step');

let index = { tracks: [], lessons: [] };

const progress = createProgress({
  noticeEl: el('notice'),
  getCode: () => workspace.getCode(),
  getFiles: () => workspace.getFiles(),
  onChanged: () => refreshNav(),
});

// 캐시된 옛 앱이 새 레슨 데이터를 읽으면 학습자가 자기 코드를 의심한다.
// 자동 새로고침은 하지 않는다 — 작업 중인 코드가 저장 타이밍과 겹치면 잃는다.
checkBuild().then((s) => s && progress.notify('stale'));

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
  onFileError: (name) => tabs.markError(name),
  onChecked: (allPassed) => assist.recordResult(allPassed),
  onTimeout: () => {
    progress.discard();
    progress.notify('discarded');
  },
});

const workspace = createWorkspace({
  hostEl: el('editor-host'),
  readonlyEl: el('readonly-code'),
  onChange: () => progress.schedule(),
  onFallback: () => progress.notify('fallback'),
  onReadonly: () => progress.notify('readonly'),
  onEditableChange: (editable, mode) => {
    applyPolicy(editable);
    if (!editable) progress.flush();
    progress.editorChanged(editable, mode);
  },
});

// 정답을 보고 통과한 것과 스스로 푼 것을 진행률에서 갈라 두되, 화면에는 표시하지 않는다.
// PRD §7.1 의 '정답 보기 사용 비율' 은 이 기록으로만 계산된다.
const assist = createAssist({
  hintButton: el('hint'),
  solutionButton: el('solution'),
  panelEl: el('assist'),
  onReveal: () => progress.markRevealed(),
});

const tabs = createFileTabs({
  anchorEl: el('editor-host'),
  panelEl: el('editor-host'),
  onSelect: (name) => {
    workspace.select(name);
    tabs.select(name);
    applyPolicy(layout.isEditable());
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
    const { lesson } = view.current();
    if (!lesson || id !== lesson.id) view.openLesson(id);
  },
  onStep: (next) => {
    if (next !== view.current().stepIndex) view.showStep(next);
  },
});

const refreshNav = () => {
  const { lesson, stepIndex } = view.current();
  browse.refresh({ index, lesson, stepIndex, isStepDone: progress.isStepDone });
};

const handleKeydown = (e) => {
  const { step } = view.current();
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && step && policyOf(step.kind).run) {
    e.preventDefault();
    run();
  }
};

const layout = createLayout({
  root: el('main'),
  toggleButton: el('brief-toggle'),
  onEditableChange: (editable) => {
    const { step } = view.current();
    if (step && policyOf(step.kind).editor && editable) workspace.mount();
    else workspace.unmount(editable ? 'step' : 'narrow');
  },
});

// layout 뒤에 세운다 — 조작부가 layout 을 즉시 받아 쥔다.
const controls = createStepControls({
  runButton, resetButton, tabs, workspace, session, progress, preview, layout,
  current: () => view.current(),
  onRan: () => view.markRan(),
});
const { applyPolicy, run, reset } = controls;

const view = createStepView({
  mainEl: el('main'), titleEl: el('lesson-title'), nextButton,
  deps: { progress, assist, brief, preview, session, workspace, layout },
  applyPolicy,
  onChanged: () => refreshNav(),
});
const { showStep, openLesson, goNext } = view;

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
