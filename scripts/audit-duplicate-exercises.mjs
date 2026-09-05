import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const index = JSON.parse(fs.readFileSync(path.join(root, 'lessons/index.json'), 'utf8')).lessons
  .filter(item => /^T[0-3]$/.test(item.track));
const kinds = new Set(['run', 'tweak', 'fill', 'wrap', 'write']);
const steps = [];
const textUses = new Map();
const stopWords = new Set('직접 작성 사용 출력 확인 결과 코드 문제 값 변수 다음 먼저 합니다 하세요 바꾸세요 만들기 적용하기'.split(' '));

const compact = value => String(value ?? '').replace(/\/\/.*$/gm, '').replace(/\s+/g, ' ').trim();
const normalized = value => compact(value)
  .replace(/(['"`])(?:\\.|(?!\1).)*\1/g, 'STR')
  .replace(/\b\d+(?:\.\d+)?\b/g, 'NUM')
  .replace(/\b[A-Za-z_$][\w$]*\b/g, word => [
    'console', 'log', 'true', 'false', 'null', 'undefined', 'function', 'return',
    'if', 'else', 'for', 'switch', 'case', 'default', 'break', 'continue',
    'Number', 'String', 'Boolean', 'typeof'
  ].includes(word) ? word : 'ID');
const wordsOf = value => new Set((String(value).match(/[가-힣A-Za-z0-9_]+/g) ?? [])
  .filter(word => word.length > 1 && !stopWords.has(word)));
const jaccard = (left, right) => {
  const a = wordsOf(left);
  const b = wordsOf(right);
  const intersection = [...a].filter(word => b.has(word)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
};

for (const item of index) {
  const lesson = JSON.parse(fs.readFileSync(path.join(root, `lessons/${item.id}.json`), 'utf8'));
  assert.ok(typeof lesson.learningGoal === 'string' && lesson.learningGoal.trim(), `${item.id}: learningGoal 없음`);
  lesson.steps.forEach((step, index) => {
    if (!kinds.has(step.kind)) return;
    const code = step.solutionCode ?? step.code ?? JSON.stringify(step.solutionFiles ?? step.files ?? '');
    const exerciseText = [step.title, ...(step.brief ?? []).flat(Infinity).filter(value => typeof value === 'string'), ...(step.hints ?? [])].join(' ');
    steps.push({ lessonId: item.id, index, kind: step.kind, title: step.title, code, exerciseText });
    for (const text of [...(step.brief ?? []).filter(value => typeof value === 'string'), ...(step.hints ?? [])]) {
      if (text.trim().length < 25) continue;
      const uses = textUses.get(text) ?? [];
      uses.push({ lessonId: item.id, kind: step.kind, title: step.title });
      textUses.set(text, uses);
    }
  });
}

const exactCross = [];
const exactInside = [];
const structureCandidates = [];
const internalStructureCandidates = [];
for (let left = 0; left < steps.length; left += 1) {
  for (let right = left + 1; right < steps.length; right += 1) {
    const a = steps[left];
    const b = steps[right];
    const aCode = compact(a.code);
    const bCode = compact(b.code);
    if (!aCode || !bCode) continue;
    if (aCode === bCode) {
      (a.lessonId === b.lessonId ? exactInside : exactCross).push([a, b]);
    } else if (normalized(aCode) === normalized(bCode)) {
      (a.lessonId === b.lessonId ? internalStructureCandidates : structureCandidates).push([a, b]);
    }
  }
}

const duplicateTexts = [...textUses.entries()].filter(([, uses]) => new Set(uses.map(use => use.lessonId)).size > 1);
const highSimilarityCandidates = structureCandidates.filter(([a, b]) => jaccard(a.exerciseText, b.exerciseText) >= 0.35);
const internalHighSimilarity = internalStructureCandidates.filter(([a, b]) => jaccard(a.exerciseText, b.exerciseText) >= 0.35);
const intentionalHighSimilarity = new Map([
  ['t1-02:number 직접 사용하기|t1-04:string 직접 사용하기', '숫자 리터럴과 문자열 리터럴의 표기 차이를 처음 직접 작성하는 최소 예제'],
  ['t3-02:key와 value 직접 작성하기|t3-03:점 표기법 직접 작성하기', '프로퍼티 선언과 프로퍼티 접근이라는 서로 다른 사용자 행동'],
  ['t3-06:프로퍼티 추가 직접 작성하기|t3-07:프로퍼티 수정 직접 작성하기', '없는 key 추가와 기존 key 수정의 의미 차이를 대조하는 연속 개념'],
  ['t0-02:직접 작성하기|t0-04:직접 작성하기', 'let 변수 선언과 const 상수 선언의 최초 최소 문법 예제']
]);
const pairKey = ([a, b]) => [`${a.lessonId}:${a.title}`, `${b.lessonId}:${b.title}`].sort().join('|');
const t006T007Candidates = structureCandidates.filter(pair => new Set(pair.map(step => step.lessonId)).size === 2
  && pair.some(step => step.lessonId === 't0-06') && pair.some(step => step.lessonId === 't0-07'));
const copiedPhrases = [
  '다른 데이터에 적용하기', '조건을 더해 응용하기', '실행 단계와 다른 상황에서',
  '앞 단계의 코드를 복사하지 말고'
];
for (const phrase of copiedPhrases) {
  const lessonIds = new Set();
  for (const item of index) {
    const source = fs.readFileSync(path.join(root, `lessons/${item.id}.json`), 'utf8');
    if (source.includes(phrase)) lessonIds.add(item.id);
  }
  assert.ok(lessonIds.size <= 1, `복붙 패턴 '${phrase}'가 ${lessonIds.size}개 레슨에 남음`);
}

assert.equal(index.length, 107, 'T0~T3 레슨 수');
assert.equal(exactCross.length, 0, '서로 다른 레슨의 완전 동일 코드');
assert.equal(exactInside.length, 0, '같은 레슨 내부의 완전 동일 코드');
assert.equal(duplicateTexts.length, 0, '서로 다른 레슨의 동일 brief/hint');
assert.equal(internalHighSimilarity.length, 0, '같은 레슨 내부의 코드·지문 고유사도 중복');
assert.deepEqual(new Set(highSimilarityCandidates.map(pairKey)), new Set(intentionalHighSimilarity.keys()), '검토되지 않은 코드·지문 고유사도 후보');
assert.equal(t006T007Candidates.length, 0, 'T0-06과 T0-07 사이 구조 중복');

const counts = Object.fromEntries(['run', 'tweak', 'fill', 'wrap', 'write'].map(kind => [kind, steps.filter(step => step.kind === kind).length]));
console.log(`중복 연습 검사 통과: 레슨 ${index.length}, step ${steps.length}, pair ${steps.length * (steps.length - 1) / 2}`);
console.log(`RUN ${counts.run}, TWEAK ${counts.tweak}, FILL ${counts.fill}, WRAP ${counts.wrap}, WRITE ${counts.write}`);
console.log(`완전 동일 0, 내부 완전 복사 0, brief/hint 복붙 0, 정규화 구조 검토 후보 ${structureCandidates.length}`);
console.log(`코드·지문 고유사도 후보 ${highSimilarityCandidates.length}: 의도적 ${intentionalHighSimilarity.size}, 의도하지 않은 중복 0`);

if (process.argv.includes('--verbose')) {
  for (const [a, b] of structureCandidates) {
    console.log(`${a.lessonId}:${a.kind}:${a.title} ~~ ${b.lessonId}:${b.kind}:${b.title}`);
  }
}
