import fs from 'node:fs';
import assert from 'node:assert/strict';
import { stepNumberOf } from '../js/nav.js';

const coreIds = [];
for (const track of [0, 1, 2, 3]) {
  const files = fs.readdirSync(new URL('../lessons/', import.meta.url))
    .filter((name) => name.startsWith(`t${track}-`) && name.endsWith('.json'))
    .sort();
  for (const file of files) {
    const order = Number(file.slice(3, 5));
    if ((track === 0 && order <= 5)
      || (track === 1 && order <= 22)
      || (track === 2 && order <= 20)
      || (track === 3 && (order <= 15 || order >= 21))) {
      coreIds.push(file.slice(0, -5));
    }
  }
}

assert.equal(coreIds.length, 76, '신규 개념 레슨 수');
const counts = { T0: 0, T1: 0, T2: 0, T3: 0 };
for (const id of coreIds) {
  const lesson = JSON.parse(fs.readFileSync(new URL(`../lessons/${id}.json`, import.meta.url)));
  const [read, run, tweak] = lesson.steps;
  assert.equal(read.kind, 'read', `${id}: 첫 단계가 READ가 아님`);
  assert.equal(run.kind, 'run', `${id}: 둘째 단계가 RUN이 아님`);
  assert.equal(tweak.kind, 'tweak', `${id}: 셋째 단계가 TWEAK가 아님`);
  const readCode = JSON.stringify(read.brief.filter((part) => part && typeof part === 'object'));
  const runCode = run.code || JSON.stringify(run.files);
  const tweakCode = tweak.code || JSON.stringify(tweak.files);
  assert.equal(new Set([readCode, runCode, tweakCode]).size, 3, `${id}: READ/RUN/TWEAK 예제 중복`);

  const writes = lesson.steps.filter((step) => step.kind === 'write');
  assert(writes.length >= 2 && writes.length <= 4, `${id}: WRITE가 ${writes.length}개`);
  writes.forEach((step, index) => {
    assert(step.asserts?.length, `${id}: WRITE ${index + 1} assert 없음`);
    assert(step.hints?.length === 2, `${id}: WRITE ${index + 1} hint 2개가 아님`);
    assert(step.files?.some((file) => file.solutionCode) || step.solutionCode, `${id}: WRITE ${index + 1} 정답 없음`);
  });
  const firstWrite = lesson.steps.findIndex((step) => step.kind === 'write');
  writes.forEach((step, index) => {
    const actualIndex = lesson.steps.indexOf(step);
    assert.equal(stepNumberOf(lesson.steps, actualIndex), `${firstWrite + 1}-${index + 1}`, `${id}: WRITE 번호`);
  });
  counts[lesson.track] += writes.length;
}

console.log(`핵심 연습 검사 통과: 76개, 예제 분리 76, WRITE T0 ${counts.T0} / T1 ${counts.T1} / T2 ${counts.T2} / T3 ${counts.T3}, 4-n 번호 PASS`);
