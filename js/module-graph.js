/**
 * files[] 단계의 지정자를 검사하고, 프레임이 import map 으로 이어 붙일 수 있는 형태로 바꾼다.
 *
 * URL 을 여기서 만들지 않는 이유: blob URL 은 만든 문서의 출처에 묶인다.
 * 부모(http)가 만든 blob 을 opaque origin 프레임이 가져오려 하면 실패한다(실측).
 *
 * 지정자를 blob URL 로 바꿔 끼우지 않는 이유: blob 의 내용은 만드는 순간 굳고 URL 은
 * 그전에 알 수 없다. 그래서 두 파일이 서로를 부르는 순환을 만들 수조차 없다.
 * 이름은 blob 이 생기기 전에 정해져 있으므로, './' 만 떼고 이름을 import map 에 맡긴다.
 * 부수 효과로 파일 순서가 의미를 잃는다 — 위상 정렬이 필요 없다.
 */

// 하위 디렉터리를 두지 않는다. 지정자 해석이 './이름' 한 가지로 끝난다.
const NAME = /^[A-Za-z0-9_-]+\.js$/;

// import … from 'x' · export … from 'x'
const FROM = /\bfrom\s*(['"])([^'"\n]+)\1/g;
// import 'x' · import('x')
const IMPORT = /\bimport\s*\(?\s*(['"])([^'"\n]+)\1/g;

/**
 * 진짜 파서가 아니라 정규식이다. 문자열 안의 문자열도 지정자로 본다.
 * 진짜 파서를 쓰려면 Babel 이 필요한데 js 레슨은 그 비용을 내지 않기로 했다(FINDINGS).
 * 대신 T8 레슨 소재에 그런 코드를 넣지 않는다.
 */
const specifiersOf = (code) => {
  const found = [];
  [FROM, IMPORT].forEach((re) => {
    re.lastIndex = 0;
    let m = re.exec(code);
    while (m) {
      if (!found.includes(m[2])) found.push(m[2]);
      m = re.exec(code);
    }
  });
  return found;
};

const listOf = (names) => names.join(', ');

/** 지정자 하나를 파일 이름으로 바꾼다. 학습자가 고칠 것이 달라 메시지를 나눈다. */
const resolveSpec = (spec, names, from) => {
  if (spec.startsWith('../')) {
    return { message: from + ' 가 상위 폴더를 불러오려 합니다. 이 레슨의 파일은 모두 같은 폴더에 있습니다.' };
  }
  if (spec.startsWith('/')) {
    return { message: from + ' 의 ' + JSON.stringify(spec) + ' 는 쓸 수 없습니다. 같은 폴더의 파일은 ' + JSON.stringify('./파일이름.js') + ' 로 불러옵니다.' };
  }
  if (!spec.startsWith('./')) {
    return { message: from + ' 가 ' + JSON.stringify(spec) + ' 를 불러오려 합니다. 이 레슨에서는 외부 패키지를 쓸 수 없고, 같은 폴더의 파일도 ' + JSON.stringify('./파일이름.js') + ' 처럼 앞에 ' + JSON.stringify('./') + ' 를 붙여야 합니다.' };
  }
  const name = spec.slice(2);
  if (names.includes(name)) return { name: name };

  // 아래 셋은 모두 '그런 파일이 없다' 지만 고칠 곳이 다르다.
  if (names.includes(name + '.js')) {
    return { message: from + ' 의 ' + JSON.stringify(spec) + ' 에 확장자가 빠졌습니다. 브라우저는 ' + JSON.stringify('.js') + ' 를 대신 붙여 주지 않습니다. ' + JSON.stringify(spec + '.js') + ' 라고 적어 주세요.' };
  }
  if (name.includes('/')) {
    return { message: from + ' 가 ' + JSON.stringify(spec) + ' 를 불러오려 합니다. 이 레슨에는 하위 폴더가 없고 모든 파일이 같은 폴더에 있습니다. 지금 있는 파일은 ' + listOf(names) + ' 입니다.' };
  }
  return { message: from + ' 가 ' + JSON.stringify(spec) + ' 를 불러오려 하지만 그런 파일이 없습니다. 지금 있는 파일은 ' + listOf(names) + ' 입니다.' };
};

/** 레슨 데이터 자체의 잘못. 학습자가 고칠 수 없으므로 던진다. */
const assertShape = (files) => {
  if (!Array.isArray(files) || !files.length) throw new Error('files 가 비어 있습니다');
  const seen = [];
  files.forEach((file) => {
    if (!NAME.test(file.name || '')) throw new Error('파일 이름이 규칙에 맞지 않습니다: ' + file.name);
    if (seen.includes(file.name)) throw new Error('파일 이름이 중복됩니다: ' + file.name);
    if (typeof file.code !== 'string') throw new Error('code 가 없습니다: ' + file.name);
    seen.push(file.name);
  });
  const entries = files.filter((file) => file.entry);
  if (entries.length !== 1) throw new Error('entry: true 인 파일이 정확히 하나여야 합니다 (지금 ' + entries.length + '개)');
  return entries[0].name;
};

/** './이름' 을 '이름' 으로 바꾼다. 따옴표 두 종류를 모두 본다. */
const toBare = (code, specs) =>
  specs.reduce(
    (acc, spec) =>
      acc
        .split("'" + spec.raw + "'").join("'" + spec.name + "'")
        .split('"' + spec.raw + '"').join('"' + spec.name + '"'),
    code
  );

/**
 * @param {Array<{name: string, code: string, entry?: boolean}>} files
 * @returns {{ ok: true, entry: string, files: Array<{name: string, code: string}> }
 *          | { ok: false, message: string }}
 *   ok: false 는 학습자가 고칠 수 있는 문제다. 레슨 데이터의 잘못은 던진다.
 */
export function planModules(files) {
  const entry = assertShape(files);
  const names = files.map((file) => file.name);
  const out = [];

  for (const file of files) {
    const specs = [];
    for (const raw of specifiersOf(file.code)) {
      const hit = resolveSpec(raw, names, file.name);
      if (hit.message) return { ok: false, message: hit.message };
      specs.push({ raw: raw, name: hit.name });
    }
    out.push({ name: file.name, code: toBare(file.code, specs) });
  }

  return { ok: true, entry: entry, files: out };
}

/**
 * 레슨 데이터의 잘못(던짐)과 학습자가 고칠 수 있는 문제({ok:false})를 한 모양으로 합친다.
 * 부르는 쪽은 둘을 똑같이 '실행 전에 마감' 으로 다루면 된다.
 */
export function planOrMessage(files) {
  try {
    return planModules(files);
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

/**
 * planModules 결과를 프레임 로더가 받는 모양으로 옮긴다.
 * check 는 레슨이 검사할 export 이름이다. 파일의 entry(어느 파일부터 여는가)와 다르다.
 */
export function toPayload(plan, { entry = '', specs = [], runtime = 'js' } = {}) {
  // react 는 검사기가 렌더를 기다려야 하는지를 정한다. 안 넘기면 dom assert 가 빈 화면을 읽는다.
  return { files: plan.files, entry: plan.entry, check: entry, specs: specs, react: runtime === 'react' };
}
