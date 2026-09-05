import fs from 'node:fs';
import assert from 'node:assert/strict';

const index = JSON.parse(fs.readFileSync(new URL('../lessons/index.json', import.meta.url)));
const items = index.lessons.filter((item) => Number(item.track.slice(1)) <= 3);
const isCore = (id) => {
  const track = Number(id[1]);
  const order = Number(id.slice(3));
  return (track === 0 && order <= 5)
    || (track === 1 && order <= 22)
    || (track === 2 && order <= 20)
    || (track === 3 && (order <= 15 || order >= 21));
};
const forbidden = /책에서|책의 순서|책으로|첨부 자료|첨부자료|PDF에서|PDF \d|PDF 범위|커리큘럼 순서/;
const lengths = [];
let coreCount = 0;

assert.equal(items.length, 107);
for (const item of items) {
  const lesson = JSON.parse(fs.readFileSync(new URL(`../lessons/${item.id}.json`, import.meta.url)));
  const read = lesson.steps.find((step) => step.kind === 'read');
  assert(read, `${item.id}: READ 없음`);
  const prose = read.brief.filter((value) => typeof value === 'string').join(' ');
  const examples = read.brief.filter((value) => value && typeof value === 'object').flatMap((value) => value.code || []);
  assert.doesNotMatch(prose, forbidden, `${item.id}: 책/PDF 메타 문구`);
  assert.match(prose, /코드 읽기:|1번째 줄|첫 번째 줄|이번 문제|변수를 선언/, `${item.id}: 코드 해설 없음`);
  assert.match(prose, /실행 과정과 결과:|출력|반환|결과/, `${item.id}: 실행 결과 설명 없음`);
  assert.match(prose, /헷갈리기 쉬운 점:|주의|구분|반대로/, `${item.id}: 혼동 지점 설명 없음`);
  if (isCore(item.id)) {
    coreCount += 1;
    assert(examples.length > 0, `${item.id}: 핵심 READ 코드 예제댓글 없음`);
    assert(prose.length >= 500, `${item.id}: 핵심 READ 설명 부족 (${prose.length}자)`);
  } else {
    assert(prose.length >= 350, `${item.id}: 복습 READ 설명 부족 (${prose.length}자)`);
  }
  lengths.push({ id: item.id, core: isCore(item.id), length: prose.length });
}

const average = (values) => Math.round(values.reduce((sum, value) => sum + value.length, 0) / values.length);
const core = lengths.filter((value) => value.core);
console.log(`READ 품질 검사 통과: 107개(핵심 ${coreCount}, 복습 ${107 - coreCount}), 전체 평균 ${average(lengths)}자, 핵심 평균 ${average(core)}자`);
