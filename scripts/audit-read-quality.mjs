import fs from 'node:fs';
import assert from 'node:assert/strict';

const index = JSON.parse(fs.readFileSync(new URL('../lessons/index.json', import.meta.url)));
const items = index.lessons.filter((item) => Number(item.track.slice(1)) <= 3);
const forbiddenBook = /책에서|책의 순서|책으로|첨부 자료|첨부자료|PDF에서|PDF \d|PDF 범위|커리큘럼 순서/;
const forbiddenTemplate = /이 문법이 필요한 이유는|값, 계산 또는 실행 흐름|괄호 안 표현식을 계산해|현재 결과를 콘솔에 출력|각 값은 해당 `?console\.log`?가 실행되는 순간|겉으로 비슷하게 보여도|코드에 값이 적힌 모양|완성된 예제의 결과를 먼저 확인|직접 작성하고 실행 결과를 확인/;
const forbiddenMeta = /RUN에서는|TWEAK에서는|WRITE에서는|작성 단계에서는|다음 단계에서는|실습에서는|직접 확인하세요|RUN, TWEAK, WRITE/;
const proseById = new Map();

assert.equal(items.length, 107, 'T0~T3 레슨 수');
for (const item of items) {
  const lesson = JSON.parse(fs.readFileSync(new URL(`../lessons/${item.id}.json`, import.meta.url)));
  const read = lesson.steps.find((step) => step.kind === 'read');
  assert(read, `${item.id}: READ 없음`);
  const prose = read.brief.filter((value) => typeof value === 'string').join(' ').trim();
  assert(prose, `${item.id}: READ 설명 없음`);
  assert.doesNotMatch(prose, forbiddenBook, `${item.id}: 책/PDF 메타 문구`);
  assert.doesNotMatch(prose, forbiddenTemplate, `${item.id}: 기계적 템플릿 문구`);
  assert.doesNotMatch(prose, forbiddenMeta, `${item.id}: 실습 단계 메타 안내`);
  assert(!proseById.has(prose), `${item.id}: ${proseById.get(prose)}와 동일한 READ 설명`);
  proseById.set(prose, item.id);
}

console.log('READ 내용 검사 통과: 107개, 빈 설명 0, 중복 설명 0, 금지 템플릿 0, 단계 메타 안내 0, 책/PDF 언급 0');
