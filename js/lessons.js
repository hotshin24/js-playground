const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const LESSON_FIELDS = ['schemaVersion', 'id', 'title'];
const STEP_KINDS = ['read', 'run', 'tweak', 'fill', 'write'];
const CHECKED_KINDS = ['fill', 'write'];

const fail = (message) => {
  throw new Error(message);
};

const checkBrief = (brief, where) => {
  if (!Array.isArray(brief) || brief.some((p) => typeof p !== 'string')) {
    fail(where + ' 의 brief 는 문자열 문단의 배열이어야 합니다');
  }
};

const checkAsserts = (step, where) => {
  const asserts = step.asserts || [];
  if (!Array.isArray(asserts)) fail(where + ' 의 asserts 는 배열이어야 합니다');
  asserts.forEach((spec, i) => {
    if (!spec || typeof spec.type !== 'string') fail(where + ' asserts[' + i + '] 에 type 이 없습니다');
  });
  // entry 는 무조건 필수가 아니다. 반환값을 읽어야 하는 value assert 가 있을 때만 요구한다.
  if (asserts.some((spec) => spec.type === 'value') && !IDENTIFIER.test(step.entry || '')) {
    fail(where + ' 에 value assert 가 있으면 entry 가 유효한 식별자여야 합니다: ' + step.entry);
  }
};

const normalizeStep = (step, i) => {
  const where = 'steps[' + i + ']';
  if (!step || !STEP_KINDS.includes(step.kind)) {
    fail(where + ' 의 kind 가 ' + STEP_KINDS.join('/') + ' 중 하나가 아닙니다: ' + (step && step.kind));
  }
  checkBrief(step.brief, where);
  if (step.kind !== 'read' && typeof step.code !== 'string') {
    fail(where + '(' + step.kind + ') 에는 code 가 필요합니다');
  }
  if (CHECKED_KINDS.includes(step.kind)) checkAsserts(step, where);

  return {
    kind: step.kind,
    title: step.title || '',
    brief: step.brief,
    code: typeof step.code === 'string' ? step.code : '',
    entry: step.entry || '',
    solutionCode: step.solutionCode || '',
    asserts: step.asserts || [],
  };
};

// v1 레슨은 그대로 둔다. 단계 하나짜리 write 로 감싸 v2 와 같은 모양으로 만든다.
const wrapV1 = (lesson) => {
  ['brief', 'starterCode', 'solutionCode'].forEach((key) => {
    if (lesson[key] === undefined) fail('레슨 필수 필드 누락: ' + key);
  });
  checkBrief(lesson.brief, '레슨');
  return [
    normalizeStep(
      {
        kind: 'write',
        title: lesson.title,
        brief: lesson.brief,
        code: lesson.starterCode,
        entry: lesson.entry,
        solutionCode: lesson.solutionCode,
        asserts: lesson.asserts,
      },
      0
    ),
  ];
};

/**
 * 레슨 데이터 검사 후 단계 배열을 가진 형태로 정규화한다.
 * @param {object} lesson
 * @param {string} [expectedId] 불러올 때 요청한 id. 주면 파일명 일치까지 검사한다.
 */
export function validateLesson(lesson, expectedId) {
  if (!lesson || typeof lesson !== 'object') fail('레슨 데이터가 객체가 아닙니다');

  const missing = LESSON_FIELDS.filter((key) => lesson[key] === undefined);
  if (missing.length) fail('레슨 필수 필드 누락: ' + missing.join(', '));
  if (![1, 2].includes(lesson.schemaVersion)) fail('지원하지 않는 schemaVersion: ' + lesson.schemaVersion);

  // 파일명이 곧 학습 순서인 구조다(CLAUDE.md). 사람 주의력에 맡기지 않고 여기서 잡는다.
  if (expectedId !== undefined && lesson.id !== expectedId) {
    fail('파일명과 id 가 다릅니다: ' + expectedId + '.json 의 id 가 "' + lesson.id + '" 입니다');
  }
  if (lesson.order !== undefined) {
    const seq = Number(String(lesson.id).split('-').pop());
    if (!Number.isInteger(seq)) fail('id 에서 순번을 읽을 수 없습니다: ' + lesson.id);
    if (seq !== lesson.order) fail('id 순번과 order 가 다릅니다: id "' + lesson.id + '" / order ' + lesson.order);
  }

  if (lesson.schemaVersion === 2 && (!Array.isArray(lesson.steps) || !lesson.steps.length)) {
    fail('schemaVersion 2 에는 steps 배열이 필요합니다');
  }

  const steps = lesson.schemaVersion === 2 ? lesson.steps.map(normalizeStep) : wrapV1(lesson);

  return { id: lesson.id, track: lesson.track, order: lesson.order, title: lesson.title, steps };
}

/**
 * 레슨 목록. 레슨 추가 비용은 JSON 파일 1건 + 이 목록 1줄이며 앱 코드는 건드리지 않는다.
 * @returns {Promise<Array<{id: string, order: number, title: string}>>}
 */
export async function loadIndex() {
  const res = await fetch('lessons/index.json');
  if (!res.ok) fail('레슨 목록을 불러오지 못했습니다 (' + res.status + ')');
  const data = await res.json();
  if (data.schemaVersion !== 1) fail('지원하지 않는 목록 schemaVersion: ' + data.schemaVersion);
  if (!Array.isArray(data.lessons) || !data.lessons.length) fail('레슨 목록이 비어 있습니다');
  return [...data.lessons];
}

/**
 * @param {string} id 레슨 파일명(확장자 제외)
 * @returns {Promise<object>} 정규화된 레슨
 */
export async function loadLesson(id) {
  const res = await fetch('lessons/' + id + '.json');
  if (!res.ok) fail('레슨 파일을 불러오지 못했습니다: ' + id + '.json (' + res.status + ')');
  return validateLesson(await res.json(), id);
}
