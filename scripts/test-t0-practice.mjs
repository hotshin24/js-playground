import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { buildCurrentCallAssertPlan } from '../js/validator.js';
import { ASSERT_RUNTIME } from '../js/assert-runtime.js';

const track = 'T0';
const index = JSON.parse(fs.readFileSync(new URL('../lessons/index.json', import.meta.url)));
let checks = 0;
for (const item of index.lessons.filter(item => item.track === track)) {
  const lesson = JSON.parse(fs.readFileSync(new URL(`../lessons/${item.id}.json`, import.meta.url)));
  for (const step of lesson.steps.filter(step => step.asserts?.length)) {
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
console.log(`${track} 정답·시작 코드·추가 출력 검사 ${checks}건 통과`);
