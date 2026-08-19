import { createSession } from './session.js';
import { createEditor } from './editor.js';
import { createLayout } from './layout.js';
import { loadLesson } from './lessons.js';
import { buildAssertScript } from './validator.js';
import { hashText, readLesson, saveLesson, clearLesson } from './storage.js';

// M1b 도 레슨 1개 고정. 목록·네비게이션은 M1c.
const LESSON_ID = 't1-03';
const SAVE_DELAY_MS = 600;

const NOTICE = {
  fallback: '편집기를 불러오지 못해 기본 입력창으로 대체했습니다. 구문 강조가 없지만 실행과 검사는 그대로 동작합니다.',
  saveFailed: '진행 상황을 저장하지 못했습니다. 학습은 그대로 계속할 수 있습니다.',
  readonly: '화면이 좁아 읽기 전용입니다. 768px 이상에서 편집하고 실행할 수 있습니다.',
  starterChanged: '이 레슨의 초기 코드가 바뀌었습니다. 되돌리기를 누르면 새 초기 코드로 시작합니다.',
};

const el = (id) => document.querySelector('#' + id);
const hostEl = el('editor-host');
const readonlyEl = el('readonly-code');
const runButton = el('run');
const resetButton = el('reset');

let lesson = null;
let assertScript = '';
let assertTotal = 0;
let starterHash = '';
let currentCode = '';
let editor = null;
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
  onAllPassed: () => saveLesson(LESSON_ID, { completedAt: new Date().toISOString() }),
});

const flushSave = () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = 0;
  if (!lesson) return;
  if (!saveLesson(LESSON_ID, { code: currentCode, starterHash })) notify(NOTICE.saveFailed);
};

const handleCodeChange = (code) => {
  currentCode = code;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = window.setTimeout(flushSave, SAVE_DELAY_MS);
};

const run = () => {
  if (editor) currentCode = editor.getValue();
  session.run(currentCode, { assertScript, total: assertTotal });
};

const reset = () => {
  if (!lesson) return;
  clearLesson(LESSON_ID); // 저장분까지 초기화한다
  currentCode = lesson.starterCode;
  if (editor) {
    editor.setValue(currentCode);
    editor.focus();
  } else {
    readonlyEl.textContent = currentCode;
  }
  session.setStatus('초기 코드로 되돌렸습니다');
};

const setControls = (enabled) => {
  runButton.disabled = !enabled;
  resetButton.disabled = !enabled;
};

const mountEditor = async () => {
  if (editor) return;
  readonlyEl.hidden = true;
  hostEl.hidden = false;
  editor = await createEditor({ parent: hostEl, doc: currentCode, onChange: handleCodeChange });
  if (editor.mode === 'textarea') notify(NOTICE.fallback);
  setControls(true);
};

// <768 은 에디터를 아예 만들지 않는다. 띄워놓고 편집만 막지 않는다.
const unmountEditor = () => {
  if (editor) {
    currentCode = editor.getValue();
    flushSave();
    editor.destroy();
    editor = null;
  }
  hostEl.hidden = true;
  hostEl.replaceChildren();
  readonlyEl.textContent = currentCode;
  readonlyEl.hidden = false;
  setControls(false);
  notify(NOTICE.readonly);
};

const layout = createLayout({
  root: el('main'),
  toggleButton: el('brief-toggle'),
  onEditableChange: (editable) => (editable ? mountEditor() : unmountEditor()),
});

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

const handleKeydown = (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    run();
  }
};

runButton.addEventListener('click', run);
resetButton.addEventListener('click', reset);
document.addEventListener('keydown', handleKeydown);

const dispose = () => {
  flushSave();
  runButton.removeEventListener('click', run);
  resetButton.removeEventListener('click', reset);
  document.removeEventListener('keydown', handleKeydown);
  if (editor) editor.destroy();
  layout.dispose();
  session.dispose();
};
window.addEventListener('pagehide', dispose, { once: true });

loadLesson(LESSON_ID)
  .then((data) => {
    lesson = data;
    assertScript = buildAssertScript(data);
    assertTotal = (data.asserts || []).filter((spec) => spec.type === 'value').length;
    starterHash = hashText(data.starterCode);
    currentCode = resolveCode(data, readLesson(LESSON_ID));
    renderLesson(data);
    return layout.isEditable() ? mountEditor() : unmountEditor();
  })
  .catch((err) => {
    el('lesson-title').textContent = '레슨을 불러오지 못했습니다';
    session.setStatus(err.message);
  });
