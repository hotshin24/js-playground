// 단일 키에 전체 상태를 담는다. F-017(export/import)이 통째 직렬화를 요구하기 때문이다.
const KEY = 'js-playground:v1';
const SCHEMA_VERSION = 1;

const empty = () => ({ schemaVersion: SCHEMA_VERSION, lastLessonId: null, lessons: {} });

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

// 손상된 JSON 도 프라이빗 모드 예외도 결말은 같다: 빈 상태로 학습을 계속한다.
export function readState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION) return empty();
    return { ...empty(), ...parsed, lessons: parsed.lessons || {} };
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

export function readLesson(id) {
  return readState().lessons[id] || null;
}

/** 목록 렌더용. 레슨 수만큼 readState() 를 반복하지 않기 위해 한 번에 준다. */
export function readLessons() {
  return readState().lessons;
}

/** 이어하기용 마지막 위치. 레슨 항목을 만들지 않고 위치만 남긴다. */
export function setLastLesson(id) {
  const state = readState();
  state.lastLessonId = id;
  return writeState(state);
}

export function readLastLesson() {
  return readState().lastLessonId;
}

/** @returns {boolean} 저장 성공 여부 */
export function saveLesson(id, patch) {
  const state = readState();
  const prev = state.lessons[id] || {};
  state.lessons[id] = { ...prev, ...patch, updatedAt: new Date().toISOString() };
  state.lastLessonId = id;
  return writeState(state);
}

/** 리셋은 저장분까지 지운다. @returns {boolean} */
export function clearLesson(id) {
  const state = readState();
  delete state.lessons[id];
  return writeState(state);
}
