/**
 * 여러 파일로 이루어진 단계(files[])를 프레임이 그대로 blob 으로 만들 수 있는
 * 순서와 형태로 바꾼다.
 *
 * URL 을 여기서 만들지 않는 이유: blob URL 은 만든 문서의 출처에 묶인다.
 * 부모(http)가 만든 blob 을 opaque origin 프레임이 가져오려 하면 실패한다(실측).
 * 그래서 URL 생성은 프레임 안에서 하고, 여기서는 자리표시자만 심는다.
 */

/** 프레임 안 로더가 실제 blob URL 로 바꿔 끼울 자리표시자 */
export const MOD_TOKEN = '__PG_MOD__';

// 하위 디렉터리를 두지 않는다. 지정자 해석이 './이름' 한 가지로 끝난다.
const NAME = /^[A-Za-z0-9_-]+\.js$/;

// import … from 'x' · export … from 'x'
const FROM = /\bfrom\s*(['"])([^'"\n]+)\1/g;
// import 'x' · import('x')
const IMPORT = /\bimport\s*\(?\s*(['"])([^'"\n]+)\1/g;

/**
 * 진짜 파서가 아니라 정규식이다. 문자열 안의 문자열도 지정자로 본다.
 * 진짜 파서를 쓰려면 Babel 이 필요한데 T8 은 그 비용을 내지 않기로 했다(FINDINGS).
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
    return { message: from + ' 가 ' + JSON.stringify(spec) + ' 를 불러오려 합니다. 이 레슨에서는 외부 패키지를 쓸 수 없습니다. 같은 폴더의 파일은 ' + JSON.stringify('./파일이름.js') + ' 로 불러옵니다.' };
  }
  const name = spec.slice(2);
  if (!names.includes(name)) {
    return { message: from + ' 가 ' + JSON.stringify(spec) + ' 를 불러오려 하지만 그런 파일이 없습니다. 지금 있는 파일은 ' + listOf(names) + ' 입니다.' };
  }
  return { name: name };
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

/**
 * 의존이 먼저 오도록 세운다. 재작성하려면 대상의 URL 이 먼저 있어야 하기 때문이다.
 * 순환은 여기서 걸린다 — 실행 전에 막아야 학습자가 빈 화면을 보지 않는다.
 */
const sortByDependency = (files, deps) => {
  const order = [];
  const done = [];
  const path = [];
  let failure = null;

  const visit = (file) => {
    if (failure || done.includes(file.name)) return;
    const cycleAt = path.indexOf(file.name);
    if (cycleAt !== -1) {
      const loop = path.slice(cycleAt).concat(file.name);
      failure = { message: loop.join(' → ') + ' 가 서로를 불러오고 있습니다. 한쪽만 다른 쪽을 부르도록 정리해 주세요.' };
      return;
    }
    path.push(file.name);
    deps[file.name].forEach((dep) => visit(files.find((f) => f.name === dep)));
    path.pop();
    if (failure) return;
    done.push(file.name);
    order.push(file);
  };

  files.forEach(visit);
  return failure || { order: order };
};

/** 지정자 리터럴을 자리표시자로 바꾼다. 따옴표 두 종류를 모두 본다. */
const withTokens = (code, specs) =>
  specs.reduce((acc, spec) => {
    const token = MOD_TOKEN + spec.name + '__';
    return acc
      .split("'" + spec.raw + "'").join("'" + token + "'")
      .split('"' + spec.raw + '"').join('"' + token + '"');
  }, code);

/**
 * @param {Array<{name: string, code: string, entry?: boolean}>} files
 * @returns {{ ok: true, entry: string, order: Array<{name: string, code: string}> }
 *          | { ok: false, message: string }}
 *   ok: false 는 학습자가 고칠 수 있는 문제다. 레슨 데이터의 잘못은 던진다.
 */
export function planModules(files) {
  const entry = assertShape(files);
  const names = files.map((file) => file.name);

  const deps = {};
  const tokenized = {};
  for (const file of files) {
    const specs = [];
    for (const raw of specifiersOf(file.code)) {
      const hit = resolveSpec(raw, names, file.name);
      if (hit.message) return { ok: false, message: hit.message };
      specs.push({ raw: raw, name: hit.name });
    }
    deps[file.name] = specs.map((spec) => spec.name);
    tokenized[file.name] = withTokens(file.code, specs);
  }

  const sorted = sortByDependency(files, deps);
  if (sorted.message) return { ok: false, message: sorted.message };

  return {
    ok: true,
    entry: entry,
    order: sorted.order.map((file) => ({ name: file.name, code: tokenized[file.name] })),
  };
}
