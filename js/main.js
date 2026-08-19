import { createSession } from './session.js';
import { createWorkspace } from './workspace.js';
import { createLayout } from './layout.js';
import { createNav } from './nav.js';
import { loadIndex, loadLesson } from './lessons.js';
import { buildAssertScript } from './validator.js';
import {
  hashText, readLesson, readLessons, saveLesson, clearLesson, setLastLesson, readLastLesson,
} from './storage.js';

const SAVE_DELAY_MS = 600;

const NOTICE = {
  fallback: '편집기를 불러오지 못해 기본 입력창으로 대체했습니다. 구문 강조가 없지만 실행과 검사는 그대로 동작합니다.',
  saveFailed: '진행 상황을 저장하지 못했습니다. 학습은 그대로 계속할 수 있습니다.',
  readonly: '화면이 좁아 읽기 전용입니다. 768px 이상에서 편집하고 실행할 수 있습니다.',
  starterChanged: '이 레슨의 초기 코드가 바뀌었습니다. 되돌리기를 누르면 새 초기 코드로 시작합니다.',
};

const el = (id) => document.querySelector('#' + id);
const runButton = el('run');
const resetButton = el('reset');

let index = [];
let lesson = null;
let assertScript = '';
let assertTotal = 0;
let starterHash = '';
let saveTimer = 0;

const shown = new Set();
const notify = (message) => {
  if (shown.has(message)) return; // 같은 안내를 반복해 띄우지 않는다
  shown.add(message);
  el('notice').textContent = message;
};

const session = createSession({
  mount: el('sandbox-host'),
  logEl: el('log'),
  statusEl: el('status'),
  listEl: el('asserts'),
  summaryEl: el('assert-summary'),
  onAllPassed: () => {
    saveLesson(lesson.id, { completedAt: new Date().toISOString() });
    refreshNav();
  },
});

const flushSave = () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = 0;
  if (!lesson) return;
  if (!saveLesson(lesson.id, { code: workspace.getCode(), starterHash })) notify(NOTICE.saveFailed);
};

const workspace = createWorkspace({
  hostEl: el('editor-host'),
  readonlyEl: el('readonly-code'),
  onChange: () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = window.setTimeout(flushSave, SAVE_DELAY_MS);
  },
  onFallback: () => notify(NOTICE.fallback),
  onReadonly: () => notify(NOTICE.readonly),
  onEditableChange: (editable) => {
    runButton.disabled = !editable;
    resetButton.disabled = !editable;
    if (!editable) flushSave();
  },
});

const nav = createNav({
  listEl: el('lesson-list'),
  onSelect: (id) => {
    if (!lesson || id !== lesson.id) openLesson(id);
  },
});

const refreshNav = () => {
  const saved = readLessons();
  nav.render(index, {
    currentId: lesson ? lesson.id : null,
    isCompleted: (id) => Boolean(saved[id] && saved[id].completedAt),
  });
};

const run = () => session.run(workspace.getCode(), { assertScript, total: assertTotal });

const reset = () => {
  if (!lesson) return;
  clearLesson(lesson.id); // 저장분까지 초기화한다
  setLastLesson(lesson.id);
  workspace.setCode(lesson.starterCode);
  workspace.focus();
  session.setStatus('초기 코드로 되돌렸습니다');
  refreshNav();
};

/** 이어하기 우선순위: 저장분 > 초기 코드. 단 손대지 않은 저장분은 조용히 갱신한다. */
const resolveCode = (data, saved) => {
  if (!saved || typeof saved.code !== 'string') return data.starterCode;
  if (saved.starterHash === starterHash) return saved.code;
  if (hashText(saved.code) === saved.starterHash) return data.starterCode;
  notify(NOTICE.starterChanged);
  return saved.code;
};

const renderLesson = (data) => {
  el('lesson-title').textContent = data.title;
  el('lesson-brief').replaceChildren(
    ...data.brief.map((text) => {
      const p = document.createElement('p');
      p.textContent = text;
      return p;
    })
  );
};

const openLesson = async (id) => {
  flushSave(); // 옮기기 전에 이전 레슨을 저장한다
  const data = await loadLesson(id);

  lesson = data;
  assertScript = buildAssertScript(data);
  assertTotal = (data.asserts || []).filter((spec) => spec.type === 'value').length;
  starterHash = hashText(data.starterCode);

  session.clear();
  renderLesson(data);
  workspace.setCode(resolveCode(data, readLesson(id)));
  setLastLesson(id);
  refreshNav();
};

const handleKeydown = (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    run();
  }
};

const layout = createLayout({
  root: el('main'),
  toggleButton: el('brief-toggle'),
  onEditableChange: (editable) => (editable ? workspace.mount() : workspace.unmount()),
});

runButton.addEventListener('click', run);
resetButton.addEventListener('click', reset);
document.addEventListener('keydown', handleKeydown);

const dispose = () => {
  flushSave();
  runButton.removeEventListener('click', run);
  resetButton.removeEventListener('click', reset);
  document.removeEventListener('keydown', handleKeydown);
  workspace.destroy();
  layout.dispose();
  nav.dispose();
  session.dispose();
};
window.addEventListener('pagehide', dispose, { once: true });

loadIndex()
  .then(async (entries) => {
    index = entries;
    const last = readLastLesson();
    const start = entries.some((entry) => entry.id === last) ? last : entries[0].id;
    await openLesson(start);
    return layout.isEditable() ? workspace.mount() : workspace.unmount();
  })
  .catch((err) => {
    el('lesson-title').textContent = '레슨을 불러오지 못했습니다';
    session.setStatus(err.message);
  });
