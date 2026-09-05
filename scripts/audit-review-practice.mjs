import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { stepNumberOf } from '../js/nav.js';

const root = path.resolve(import.meta.dirname, '..');
const index = JSON.parse(fs.readFileSync(path.join(root, 'lessons/index.json'), 'utf8')).lessons;
const reviews = index.filter(item => /^T[0-3]$/.test(item.track) && item.title.includes('종합 문제'));

const codeOf = step => {
  if (typeof step.code === 'string') return step.code;
  return (step.brief ?? []).flatMap(part => typeof part === 'object' && part.code ? part.code : []).join('\n');
};
const normalized = step => codeOf(step).replace(/\/\/.*$/gm, '').replace(/\s+/g, ' ').trim();

assert.equal(reviews.length, 31, 'T0~T3 종합 문제 수가 달라졌습니다.');
const totals = { T0: 0, T1: 0, T2: 0, T3: 0 };

for (const item of reviews) {
  const lesson = JSON.parse(fs.readFileSync(path.join(root, `lessons/${item.id}.json`), 'utf8'));
  assert.deepEqual(lesson.steps.slice(0, 3).map(step => step.kind), ['read', 'run', 'tweak'], `${item.id}: READ/RUN/TWEAK 순서`);
  const writes = lesson.steps.filter(step => step.kind === 'write');
  assert.ok(writes.length >= 2 && writes.length <= 4, `${item.id}: WRITE는 2~4개여야 합니다.`);
  totals[item.track] += writes.length;
  assert.equal(new Set(lesson.steps.slice(0, 3).map(normalized)).size, 3, `${item.id}: READ/RUN/TWEAK 코드 중복`);
  const writeSignatures = writes.map(step => (step.solutionCode ?? JSON.stringify(step.solutionFiles ?? [])).replace(/\s+/g, ' ').trim());
  assert.equal(new Set(writeSignatures).size, writes.length, `${item.id}: WRITE 정답 코드 중복`);
  writes.forEach((step, index) => {
    assert.ok(step.solutionCode || step.solutionFiles, `${item.id} WRITE ${index + 1}: 정답 없음`);
    assert.ok(step.asserts?.length, `${item.id} WRITE ${index + 1}: assert 없음`);
    assert.ok(step.hints?.length >= 2, `${item.id} WRITE ${index + 1}: hint 부족`);
    assert.equal(stepNumberOf(lesson.steps, lesson.steps.indexOf(step)), `4-${index + 1}`, `${item.id}: 4-n 번호`);
  });
}

console.log(`종합 문제 검사 통과: ${reviews.length}개, WRITE T0 ${totals.T0} / T1 ${totals.T1} / T2 ${totals.T2} / T3 ${totals.T3}, 4-n 번호 PASS`);
