import fs from 'node:fs';
import assert from 'node:assert/strict';
import { readState, writeState } from '../js/storage.js';

const index = JSON.parse(fs.readFileSync(new URL('../lessons/index.json', import.meta.url)));
const expected = { T0: 13, T1: 30, T2: 30, T3: 34 };
const codeOf = lesson => lesson.steps.flatMap(step => [
  step.code, step.solutionCode,
  ...(step.brief || []).filter(part => part?.code).flatMap(part => part.code),
]).filter(Boolean).join('\n');

for (const [track, count] of Object.entries(expected)) {
  const items = index.lessons.filter(item => item.track === track);
  assert.equal(items.length, count, `${track} 레슨 수`);
  assert.deepEqual(items.map(item => item.order), Array.from({ length: count }, (_, i) => i + 1));
  for (const item of items) {
    const lesson = JSON.parse(fs.readFileSync(new URL(`../lessons/${item.id}.json`, import.meta.url)));
    assert.equal(lesson.id, item.id);
    assert.equal(lesson.title, item.title);
  }
}

const firstUse = (track, pattern) => index.lessons
  .filter(item => item.track === track)
  .find(item => pattern.test(codeOf(JSON.parse(fs.readFileSync(new URL(`../lessons/${item.id}.json`, import.meta.url))))))?.order;
assert.equal(firstUse('T1', /`[^`]*\$\{/), 6, '템플릿 리터럴 최초 등장');
assert.equal(firstUse('T1', /parseInt\(/), 12, 'parseInt 최초 등장');
assert.equal(firstUse('T1', /\+\+|--/), 17, '증감 연산자 최초 등장');
assert.equal(firstUse('T1', /\?\? /), 20, 'null 병합 최초 등장');
assert.equal(firstUse('T2', /\bfunction\b/), 9, '함수 선언 최초 등장');
assert.equal(firstUse('T2', /=>/), 17, '화살표 함수 최초 등장');
assert.equal(firstUse('T3', /const \w+ = \{/), 1, '객체 최초 등장');
assert.equal(firstUse('T3', /const \w+ = \[/), 11, '배열 최초 등장');

globalThis.localStorage = { raw: '', getItem() { return this.raw; }, setItem(key, value) { this.raw = value; } };
const oldLessons = { 't1-06': { steps: { 3: { code: 'old answer' } } }, 't4-01': { steps: { 0: { completedAt: 'done' } } } };
localStorage.raw = JSON.stringify({ schemaVersion: 1, revision: 7, lessons: oldLessons, lastLessonId: 't1-06', lastStepIndex: 3, settings: { theme: 'dark' } });
const migrated = readState();
assert.equal(migrated.lastLessonId, 't0-01');
assert.equal(migrated.lastStepIndex, 0);
assert.equal(migrated.lessons['t1-06'], undefined);
assert.deepEqual(migrated.lessons['t4-01'], oldLessons['t4-01']);
assert.deepEqual(migrated.retiredLessons.bookSyncBeforeRevision8['t1-06'], oldLessons['t1-06']);
assert.equal(migrated.settings.theme, 'dark');
writeState(migrated);
assert.deepEqual(readState(), migrated, 'revision 8 재실행 안정성');

console.log('책 PDF 1~4 순서·최초 등장 8항목·revision 8 기록 보관 검사 통과');
