const RUNTIMES = ['js', 'react'];
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const LESSON_FIELDS = ['schemaVersion', 'id', 'title'];
const STEP_KINDS = ['read', 'run', 'tweak', 'fill', 'write'];
const CHECKED_KINDS = ['fill', 'write'];

const fail = (message) => {
  throw new Error(message);
};

/**
 * 지문 문단은 문자열이거나 코드 블록 객체다.
 * 코드는 줄 배열로 적는다 — scaffold·env 와 같은 관례이고, JSON 안에서 \n 이스케이프를 없앤다.
 * 기존 113레슨의 문단 2341개는 전부 문자열이라 해석이 달라지지 않는다.
 */
const isBriefPart = (p) =>
  typeof p === 'string' ||
  (Boolean(p) && typeof p === 'object' && (Array.isArray(p.code) || typeof p.code === 'string'));

const checkBrief = (brief, where) => {
  if (!Array.isArray(brief) || brief.some((p) => !isBriefPart(p))) {
    fail(where + ' 의 brief 는 문자열 또는 { code } 문단의 배열이어야 합니다');
  }
};

// 코드 블록의 줄 배열을 한 덩어리로 잇는다. 그리는 쪽은 문자열만 보면 된다.
const normalizeBrief = (brief) =>
  brief.map((p) => (typeof p === 'string' ? p : { code: joinLines(p.code) }));

const checkAsserts = (step, where) => {
  const asserts = step.asserts || [];
  if (!Array.isArray(asserts)) fail(where + ' 의 asserts 는 배열이어야 합니다');
  asserts.forEach((spec, i) => {
    if (!spec || typeof spec.type !== 'string') fail(where + ' asserts[' + i + '] 에 type 이 없습니다');
    if (spec.type !== 'dom') return;
    const at = where + ' asserts[' + i + ']';
    if (typeof spec.select !== 'string') fail(at + ' 의 dom assert 에는 select 가 필요합니다');
    // 둘 다 있으면 무엇을 검사하는지가 모호해진다
    const hasCount = spec.count !== undefined;
    const hasText = spec.text !== undefined;
    if (hasCount === hasText) fail(at + ' 의 dom assert 는 count 와 text 중 하나만 있어야 합니다');
    if (hasText && !Array.isArray(spec.text)) fail(at + ' 의 text 는 배열이어야 합니다');
  });
  // entry 는 무조건 필수가 아니다. 반환값을 읽어야 하는 value assert 가 있을 때만 요구한다.
  if (asserts.some((spec) => spec.type === 'value') && !IDENTIFIER.test(step.entry || '')) {
    fail(where + ' 에 value assert 가 있으면 entry 가 유효한 식별자여야 합니다: ' + step.entry);
  }
};

// scaffold 는 줄 배열로 적는다. JSON 안에서 \n 이스케이프를 없애기 위해서다.
const joinLines = (value) => (Array.isArray(value) ? value.join('\n') : typeof value === 'string' ? value : '');

/**
 * files[] 는 여러 파일로 이루어진 단계다. 배열 순서가 곧 탭 순서라 순서 필드를 따로 두지 않는다.
 * 지정자 해석은 실행 시점에 module-graph 가 한다.
 * 여기서는 실행해 보지 않아도 아는 것(이름 규칙 · entry 개수)만 잡는다.
 */
const normalizeFiles = (files, where) => {
  if (!Array.isArray(files) || !files.length) fail(where + ' 의 files 가 비어 있습니다');
  const names = [];
  const out = files.map((file, i) => {
    const at = where + '.files[' + i + ']';
    if (!file || typeof file.name !== 'string' || !file.name) fail(at + ' 에 name 이 없습니다');
    if (names.includes(file.name)) fail(at + ' 의 파일 이름이 중복됩니다: ' + file.name);
    names.push(file.name);
    if (file.readOnly && file.solutionCode !== undefined) {
      fail(at + ' 는 readOnly 인데 solutionCode 가 있습니다: ' + file.name);
    }
    return {
      name: file.name,
      entry: Boolean(file.entry),
      readOnly: Boolean(file.readOnly),
      code: joinLines(file.code),
      solutionCode: joinLines(file.solutionCode),
    };
  });
  const entries = out.filter((file) => file.entry);
  if (entries.length !== 1) fail(where + ' 에 entry: true 인 파일이 정확히 하나여야 합니다 (지금 ' + entries.length + '개)');
  return out;
};

const normalizeStep = (step, i) => {
  const where = 'steps[' + i + ']';
  if (!step || !STEP_KINDS.includes(step.kind)) {
    fail(where + ' 의 kind 가 ' + STEP_KINDS.join('/') + ' 중 하나가 아닙니다: ' + (step && step.kind));
  }
  checkBrief(step.brief, where);
  const files = step.files === undefined ? null : normalizeFiles(step.files, where);
  // 어느 쪽이 이기는지 규칙을 만들면 반드시 틀린다. 함께 두는 것 자체를 막는다.
  if (files && (step.code !== undefined || step.solutionCode !== undefined)) {
    fail(where + ' 는 files 와 code/solutionCode 를 함께 둘 수 없습니다');
  }
  if (!files && step.kind !== 'read' && typeof step.code !== 'string') {
    fail(where + '(' + step.kind + ') 에는 code 또는 files 가 필요합니다');
  }
  if (CHECKED_KINDS.includes(step.kind)) checkAsserts(step, where);

  return {
    kind: step.kind,
    title: step.title || '',
    brief: normalizeBrief(step.brief),
    code: typeof step.code === 'string' ? step.code : '',
    files: files,
    // 힌트는 최대 둘이다. 셋째는 대개 정답을 쪼갠 것이고, 그럴 바에 정답 보기를 여는 편이 정직하다.
    hints: (step.hints || []).slice(0, 2),
    entry: step.entry || '',
    solutionCode: step.solutionCode || '',
    asserts: step.asserts || [],
    // env 는 무대가 아니라 환경이다. 미리보기 판정(preview.isOn)은 scaffold.html 만 본다.
    env: joinLines(step.env),
    scaffold: {
      html: joinLines(step.scaffold && step.scaffold.html),
      css: joinLines(step.scaffold && step.scaffold.css),
    },
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

  // 트랙 접두어나 코드 훑기로 추측하지 않는다. 데이터가 스스로 밝힌다.
  // 기본값이 'js' 라 기존 레슨 파일은 한 글자도 고칠 필요가 없다.
  const runtime = lesson.runtime === undefined ? 'js' : lesson.runtime;
  if (!RUNTIMES.includes(runtime)) fail('runtime 은 ' + RUNTIMES.join('/') + ' 중 하나여야 합니다: ' + runtime);

  return { id: lesson.id, track: lesson.track, order: lesson.order, title: lesson.title, runtime, steps };
}

/**
 * 레슨 목록과 트랙 이름. 레슨 추가 비용은 JSON 파일 1건 + 이 목록 1줄이며
 * 앱 코드는 건드리지 않는다. 트랙의 화면용 이름도 여기 데이터로 둔다.
 * @returns {Promise<{tracks: Array<{id, title}>, lessons: Array<{id, track, order, title}>}>}
 */
export async function loadIndex() {
  const res = await fetch('lessons/index.json');
  if (!res.ok) fail('레슨 목록을 불러오지 못했습니다 (' + res.status + ')');
  const data = await res.json();
  if (data.schemaVersion !== 1) fail('지원하지 않는 목록 schemaVersion: ' + data.schemaVersion);
  if (!Array.isArray(data.lessons) || !data.lessons.length) fail('레슨 목록이 비어 있습니다');
  return { tracks: data.tracks || [], lessons: [...data.lessons] };
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
