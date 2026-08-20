// 단일 키에 전체 상태를 담는다. F-017(export/import)이 통째 직렬화를 요구하기 때문이다.
const KEY = 'js-playground:v1';
const SCHEMA_VERSION = 1;

const empty = () => ({ schemaVersion: SCHEMA_VERSION, lastLessonId: null, lessons: {}, settings: {} });

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
    return { ...empty(), ...parsed, lessons, settings: parsed.settings || {} };
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

/** 레슨을 열 때 단계 수를 기록해 둔다. 목록에서 완료 여부를 계산하려면 총 수가 필요하다. */
export function setLessonMeta(id, stepCount) {
  const state = readState();
  const entry = state.lessons[id] || { steps: {} };
  state.lessons[id] = { ...entry, stepCount };
  return writeState(state);
}

/** 레슨의 모든 단계가 완료됐는지 */
export function lessonStatus(entry) {
  if (!entry || !entry.steps) return 'none';
  const done = Object.values(entry.steps).filter((step) => step && step.completedAt).length;
  if (!done) return 'none';
  // 총 단계 수는 레슨을 한 번이라도 연 뒤에만 안다. 모르면 '진행 중'까지만 말한다.
  return entry.stepCount && done >= entry.stepCount ? 'done' : 'partial';
}

/** 첫 미완료 단계. 다 끝냈으면 0 */
export function firstUnfinishedStep(entry, stepCount) {
  if (!entry || !entry.steps) return 0;
  for (let i = 0; i < stepCount; i += 1) {
    if (!(entry.steps[i] && entry.steps[i].completedAt)) return i;
  }
  return 0;
}
