import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { buildCurrentCallAssertPlan } from '../js/validator.js';
import { ASSERT_RUNTIME } from '../js/assert-runtime.js';
import { readState, writeState } from '../js/storage.js';

const index = JSON.parse(fs.readFileSync(new URL('../lessons/index.json', import.meta.url)));
let checks = 0;
for (const item of index.lessons.filter(item => item.track === 'T1')) {
  const lesson = JSON.parse(fs.readFileSync(new URL(`../lessons/${item.id}.json`, import.meta.url)));
  for (const step of lesson.steps) {
    const snippets = [step.code, step.solutionCode, ...(step.brief || []).filter(part => part.code).map(part => part.code.join('\n'))].filter(Boolean);
    for (const code of snippets) assert(!/\bfunction\b|=>|\breturn\b/.test(code), `${item.id}: 함수 선행 문법`);
    if (!step.asserts?.length) continue;
    assert(step.asserts.every(spec => spec.type === 'console'));
    for (const [code, expectedPass] of [[step.solutionCode, true], [step.code, false], [step.solutionCode + "\nconsole.log('extra');", false]]) {
      const lines = [];
      const events = [];
      const context = vm.createContext({
        console: { log: (...args) => lines.push(args.map(String).join(' ')) },
        window: { __pgRuntime: { consoleLines: () => lines.slice(), fmt: JSON.stringify, post: event => events.push(event) } },
      });
      vm.runInContext(ASSERT_RUNTIME, context);
      vm.runInContext(code, context, { timeout: 1000 });
      const plan = buildCurrentCallAssertPlan(step, code);
      vm.runInContext(plan.script, context);
      await context.window.__assertsPromise;
      assert.equal(events.length === plan.total && events.every(event => event.status === 'pass'), expectedPass, item.id);
      checks += 1;
    }
  }
}

globalThis.localStorage = { raw: '', getItem() { return this.raw; }, setItem(key, value) { this.raw = value; } };
for (const revision of [3, 4, 5, 6]) {
  const lessons = {};
  for (let n = 31; n <= 45; n += 1) lessons[`t1-${n}`] = { signature: 'read-run-write', steps: { 2: { code: `answer ${n}`, completedAt: 'done' } } };
  for (let n = 15; n <= 30; n += 1) lessons[`t1-${n}`] = { steps: { 0: { completedAt: 'read' }, 2: { code: 'old function' }, 4: { code: 'tweak function' }, 6: { code: 'fill function' } } };
  localStorage.raw = JSON.stringify({ schemaVersion: 1, revision, lessons, lastLessonId: 't1-45', lastStepIndex: 2 });
  const state = readState();
  assert.equal(state.lastLessonId, 't2-46');
  assert.equal(state.lastStepIndex, 2);
  for (let n = 31; n <= 45; n += 1) {
    assert.deepEqual(state.lessons[`t2-${n + 1}`], lessons[`t1-${n}`]);
    assert.equal(state.lessons[`t1-${n}`], undefined);
  }
  for (let n = 15; n <= 30; n += 1) {
    const entry = state.lessons[`t1-${n}`];
    assert.equal(entry.steps[0].completedAt, 'read');
    for (const i of n === 15 ? [4, 6] : [2]) {
      assert.equal(entry.steps[i], undefined);
      assert.deepEqual(entry.archivedBeforeRevision7[i], lessons[`t1-${n}`].steps[i]);
    }
  }
  state.lessons['t1-16'].steps[2] = { code: 'new console answer', completedAt: 'new' };
  writeState(state);
  assert.deepEqual(readState(), state);
}
localStorage.raw = JSON.stringify({ schemaVersion: 1, revision: 6, lessons: {}, lastLessonId: 't1-31' });
assert.equal(readState().lastLessonId, 't2-32');
localStorage.raw = JSON.stringify({ schemaVersion: 1, revision: 6, lessons: {
  't1-31': { steps: { 2: { code: 'source' } } }, 't2-32': { steps: { 2: { code: 'destination' } } },
} });
assert.equal(readState().lessons['t2-32'].steps[2].code, 'destination');
assert.equal(readState().lessons['t2-32'].archivedFromT1.steps[2].code, 'source');
console.log(`T1 30개 레슨 함수 선행 문법 검사 및 출력 검사 ${checks}건 통과; revision 3~6 이전·답안 보관·재실행 안정성 통과`);
