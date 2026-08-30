import { storageKey } from './curriculum.js';

// 단일 키에 전체 상태를 담는다. F-017(export/import)이 통째 직렬화를 요구하기 때문이다.
const KEY = storageKey;
const SCHEMA_VERSION = 1;
// 저장 개정 번호. 레슨이 다른 번호로 옮겨 가면 옛 저장분이 남의 레슨에 붙는다.
// 3: 2026 새 커리큘럼으로 전체 레슨을 교체했다.
const REVISION = 3;

// T0의 옛 종합 문제 15개는 내용상 T1에 속하므로 번호만 옮겼다.
// 이미 푼 기록은 새 레슨 ID로 이어져야 한다.
const MOVED_LESSON_IDS = Object.fromEntries(
  Array.from({ length: 15 }, (_, index) => [
    `t0-${String(index + 7).padStart(2, '0')}`,
    `t1-${String(index + 31).padStart(2, '0')}`,
  ]),
);

const empty = () => ({
  schemaVersion: SCHEMA_VERSION,
  revision: REVISION,
  lastLessonId: null,
  lessons: {},
  settings: {},
});

/**
 * FNV-1a 32비트. starterCode 원문을 저장에 끌고 들어가지 않기 위한 용도다.
 * @returns {string} 16진 문자열
 */
export function hashText(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

// v1 항목(레슨당 코드 1벌)을 단계 구조로 옮긴다. 저장해 둔 코드를 잃지 않기 위해서다.
const migrateLesson = (entry) => {
  if (!entry || entry.steps) return entry;
  const { code, starterHash, completedAt, updatedAt, ...rest } = entry;
  if (typeof code !== 'string') return { ...rest, steps: {} };
  // starterHash → codeHash. 이름을 안 옮기면 이어하기가 '코드가 바뀌었다'로 오판한다.
  return { ...rest, steps: { 0: { code, codeHash: starterHash, completedAt, updatedAt } } };
};

// 새 커리큘럼 전환 전 저장분은 레슨 ID의 뜻이 달라졌으므로 사용하지 않는다.
const applyRevision = (lessons, revision) => {
  if ((revision || 1) >= REVISION) return lessons;
  return {};
};

const NEW_T0_SIGNATURE = 'read-run-tweak-write';

const moveLessonProgress = (lessons, lastLessonId) => {
  const moved = { ...lessons };
  let movedLastLessonId = lastLessonId || null;
  Object.entries(MOVED_LESSON_IDS).forEach(([oldId, newId]) => {
    const oldEntry = moved[oldId];
    // 새 T0 종합 문제의 기록은 그대로 둔다. 옛 문제는 단계 구성이 달라 구별할 수 있다.
    if (!oldEntry || oldEntry.signature === NEW_T0_SIGNATURE) return;
    if (!moved[newId]) moved[newId] = oldEntry;
    delete moved[oldId];
    if (movedLastLessonId === oldId) movedLastLessonId = newId;
  });
  return { lessons: moved, lastLessonId: movedLastLessonId };
};

// 손상된 JSON 도 프라이빗 모드 예외도 결말은 같다: 빈 상태로 학습을 계속한다.
export function readState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION) return empty();
    const lessons = {};
    Object.entries(parsed.lessons || {}).forEach(([id, entry]) => {
      lessons[id] = migrateLesson(entry);
    });
    const revised = applyRevision(lessons, parsed.revision);
    const moved = moveLessonProgress(revised, parsed.lastLessonId);
    return {
      ...empty(),
      ...parsed,
      lessons: moved.lessons,
      lastLessonId: moved.lastLessonId,
      settings: parsed.settings || {},
      revision: REVISION,
    };
  } catch (err) {
    return empty();
  }
}

/** @returns {boolean} 저장 성공 여부. 실패해도 던지지 않는다. */
export function writeState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    return false;
  }
}

/** 화면 설정. 새 키를 만들지 않고 같은 저장소 안에 둔다. */
export function readSettings() {
  return readState().settings;
}

/** @returns {boolean} 저장 성공 여부 */
export function saveSetting(key, value) {
  const state = readState();
  state.settings = { ...state.settings, [key]: value };
  return writeState(state);
}

export function readLesson(id) {
  return readState().lessons[id] || null;
}

/** 목록 렌더용. 레슨 수만큼 readState() 를 반복하지 않기 위해 한 번에 준다. */
export function readLessons() {
  return readState().lessons;
}

/** 이어하기용 마지막 위치. 레슨 항목을 만들지 않고 위치만 남긴다. */
export function setLastLesson(id, stepIndex) {
  const state = readState();
  state.lastLessonId = id;
  if (stepIndex !== undefined) state.lastStepIndex = stepIndex;
  return writeState(state);
}

export function readLastPosition() {
  const state = readState();
  return { lessonId: state.lastLessonId, stepIndex: state.lastStepIndex || 0 };
}

export function readStep(lessonId, stepIndex) {
  const entry = readState().lessons[lessonId];
  return (entry && entry.steps && entry.steps[stepIndex]) || null;
}

/** @returns {boolean} 저장 성공 여부 */
export function saveStep(lessonId, stepIndex, patch) {
  const state = readState();
  const entry = state.lessons[lessonId] || { steps: {} };
  const steps = entry.steps || {};
  steps[stepIndex] = { ...(steps[stepIndex] || {}), ...patch, updatedAt: new Date().toISOString() };
  state.lessons[lessonId] = { ...entry, steps };
  state.lastLessonId = lessonId;
  state.lastStepIndex = stepIndex;
  return writeState(state);
}

/** 단계 하나만 초기화한다. 같은 레슨의 다른 단계는 건드리지 않는다. */
export function clearStep(lessonId, stepIndex) {
  const state = readState();
  const entry = state.lessons[lessonId];
  if (!entry || !entry.steps) return true;
  delete entry.steps[stepIndex];
  return writeState(state);
}

/**
 * 레슨을 열 때 단계 구성을 기록해 둔다. 목록의 완료 여부 계산에 총 수가 필요하고,
 * 서명은 다음에 열었을 때 구성이 바뀌었는지 판단하는 데 쓴다.
 *
 * 기록된 서명과 지금 구성이 다르면 그 레슨 저장분만 조용히 버린다.
 * 레슨 구조는 앞으로도 바뀐다 — 학습자에게 오류를 보이는 대신 그 레슨만 처음부터 하게 한다.
 * 서명이 없던 예전 항목은 버리지 않고 지금 서명을 받아들인다.
 *
 * @param {string} id
 * @param {number} stepCount
 * @param {string} signature 단계 종류를 순서대로 이은 문자열
 */
export function setLessonMeta(id, stepCount, signature) {
  const state = readState();
  const entry = state.lessons[id] || { steps: {} };
  const stale = entry.signature !== undefined && entry.signature !== signature;
  state.lessons[id] = stale
    ? { steps: {}, stepCount, signature }
    : { ...entry, stepCount, signature };
  return writeState(state);
}

/**
 * files[] 단계의 파일별 저장. 합쳐서 한 덩어리로 두지 않는다.
 * 합치면 ① 파일을 잇는 구분자를 학습자 코드가 그대로 담을 수 있고
 * ② 한 파일의 starter 만 고쳐도 서명이 깨져 전부 날아가며
 * ③ 레슨에 파일이 하나 늘면 옛 저장분을 어디에 붙일지 알 수 없다.
 *
 * 기존 단계의 { code, codeHash } 는 형태 그대로다. files 는 새 키라
 * SCHEMA_VERSION 도 REVISION 도 올리지 않는다. 읽는 쪽이 files 유무로 갈린다.
 *
 * @param {Object<string, {code: string, codeHash: string}>} records 이번에 저장할 파일들
 */
export function saveStepFiles(lessonId, stepIndex, records) {
  const prev = readStep(lessonId, stepIndex);
  return saveStep(lessonId, stepIndex, { files: { ...((prev && prev.files) || {}), ...records } });
}

/** 파일 하나만 되돌린다. 같은 단계의 다른 파일은 그대로 둔다. */
export function clearStepFile(lessonId, stepIndex, name) {
  const prev = readStep(lessonId, stepIndex);
  if (!prev || !prev.files || !(name in prev.files)) return true;
  const files = { ...prev.files };
  delete files[name];
  return saveStep(lessonId, stepIndex, { files });
}
