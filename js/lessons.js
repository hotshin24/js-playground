const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const REQUIRED = ['schemaVersion', 'id', 'title', 'brief', 'starterCode', 'solutionCode'];

/**
 * 레슨 데이터의 최소 검사. 여기서 걸러야 화면이 반쯤 그려지다 마는 상황을 막는다.
 * @param {object} lesson
 * @param {string} [expectedId] 불러올 때 요청한 id. 주면 파일명 일치까지 검사한다.
 */
export function validateLesson(lesson, expectedId) {
  if (!lesson || typeof lesson !== 'object') throw new Error('레슨 데이터가 객체가 아닙니다');

  const missing = REQUIRED.filter((key) => lesson[key] === undefined);
  if (missing.length) throw new Error('레슨 필수 필드 누락: ' + missing.join(', '));

  if (lesson.schemaVersion !== 1) {
    throw new Error('지원하지 않는 schemaVersion: ' + lesson.schemaVersion);
  }
  if (!Array.isArray(lesson.brief) || lesson.brief.some((p) => typeof p !== 'string')) {
    throw new Error('brief 는 문자열 문단의 배열이어야 합니다');
  }

  const asserts = lesson.asserts;
  if (asserts !== undefined && !Array.isArray(asserts)) {
    throw new Error('asserts 는 배열이어야 합니다');
  }
  (asserts || []).forEach((spec, i) => {
    if (!spec || typeof spec.type !== 'string') {
      throw new Error('asserts[' + i + '] 에 type 이 없습니다');
    }
  });

  // 파일명이 곧 학습 순서인 구조다(CLAUDE.md). 사람 주의력에 맡기지 않고 여기서 잡는다.
  if (expectedId !== undefined && lesson.id !== expectedId) {
    throw new Error(
      '파일명과 id 가 다릅니다: ' + expectedId + '.json 의 id 가 "' + lesson.id + '" 입니다'
    );
  }
  if (lesson.order !== undefined) {
    const seq = Number(String(lesson.id).split('-').pop());
    if (!Number.isInteger(seq)) {
      throw new Error('id 에서 순번을 읽을 수 없습니다: ' + lesson.id);
    }
    if (seq !== lesson.order) {
      throw new Error('id 순번과 order 가 다릅니다: id "' + lesson.id + '" / order ' + lesson.order);
    }
  }

  // entry 는 무조건 필수가 아니다. 반환값을 읽어야 하는 value assert 가 있을 때만 요구한다.
  // T2(DOM·이벤트)처럼 진입 함수가 없는 레슨이 나온다.
  const needsEntry = (asserts || []).some((spec) => spec.type === 'value');
  if (needsEntry && !IDENTIFIER.test(lesson.entry || '')) {
    throw new Error('value assert 가 있으면 entry 가 유효한 식별자여야 합니다: ' + lesson.entry);
  }

  return lesson;
}

/**
 * @param {string} id 레슨 파일명(확장자 제외)
 * @returns {Promise<object>}
 */
export async function loadLesson(id) {
  const res = await fetch('lessons/' + id + '.json');
  if (!res.ok) {
    throw new Error('레슨 파일을 불러오지 못했습니다: ' + id + '.json (' + res.status + ')');
  }
  return validateLesson(await res.json(), id);
}
