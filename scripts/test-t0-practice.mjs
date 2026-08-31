import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { buildCurrentCallAssertPlan } from '../js/validator.js';
import { ASSERT_RUNTIME } from '../js/assert-runtime.js';
import { readState, writeState } from '../js/storage.js';

let checks = 0;
for (let n = 6; n <= 13; n += 1) {
  const id = `t0-${String(n).padStart(2, '0')}`;
  const lesson = JSON.parse(fs.readFileSync(new URL(`../lessons/${id}.json`, import.meta.url)));
  const step = lesson.steps[3];
  assert(!/\bfunction\b|=>|\breturn\b/.test(step.solutionCode));
  for (const [code, expectedPass] of [[step.solutionCode, true], [step.code, false], [step.solutionCode + "\nconsole.log('extra');", false]]) {
    const lines = [];
    const events = [];
    const context = vm.createContext({
      console: { log: (...args) => lines.push(args.join(' ')) },
      window: { __pgRuntime: { consoleLines: () => lines.slice(), fmt: JSON.stringify, post: event => events.push(event) } },
    });
    vm.runInContext(ASSERT_RUNTIME, context);
    vm.runInContext(code, context, { timeout: 1000 });
    const plan = buildCurrentCallAssertPlan(step, code);
    vm.runInContext(plan.script, context);
    await context.window.__assertsPromise;
    assert.equal(events.length === plan.total && events.every(event => event.status === 'pass'), expectedPass, id);
    checks += 1;
  }
}

globalThis.localStorage = {
  raw: '', getItem() { return this.raw; }, setItem(key, value) { this.raw = value; },
};
for (const revision of [3, 4, 5]) {
  const lessons = { 't0-06': { steps: { 4: { code: 'old function' } } }, 't1-31': { steps: { 0: { code: 'keep' } } } };
  for (let n = 7; n <= 11; n += 1) lessons[`t0-${String(n).padStart(2, '0')}`] = {
    signature: 'read-run-tweak-write', steps: { 3: { code: `practice ${n}`, completedAt: 'done' } },
  };
  localStorage.raw = JSON.stringify({ schemaVersion: 1, revision, lessons, lastLessonId: 't0-11', lastStepIndex: 3 });
  const state = readState();
  assert.equal(state.lastLessonId, 't0-10');
  assert.equal(state.retiredLessons['t0-function-intro'].steps[4].code, 'old function');
  for (let n = 6; n <= 10; n += 1) assert.equal(state.lessons[`t0-${String(n).padStart(2, '0')}`].steps[3].code, `practice ${n + 1}`);
  assert.equal(state.lessons['t0-11'], undefined);
  assert.equal(state.lessons['t2-32'].steps[0].code, 'keep');
  state.lessons['t0-11'] = { signature: 'read-run-tweak-write', steps: { 3: { code: 'new answer' } } };
  writeState(state);
  assert.deepEqual(readState(), state);
}
// 최초 계산 문제를 아직 옮기지 않은 사용자도 T1 이전 후 T0 재번호를 처리한다.
localStorage.raw = JSON.stringify({ schemaVersion: 1, revision: 3, lessons: {
  't0-07': { signature: 'read-run-write', steps: { 2: { code: 'calculation' } } },
}, lastLessonId: 't0-07' });
assert.equal(readState().lessons['t2-32'].steps[2].code, 'calculation');
assert.equal(readState().lastLessonId, 't2-32');
console.log(`T0 출력 검사 ${checks}건 통과; revision 3~5 이전·기록 보관·재실행 안정성 통과`);
