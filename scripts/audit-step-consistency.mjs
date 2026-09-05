import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const index = JSON.parse(fs.readFileSync(new URL('../lessons/index.json', import.meta.url)));
const lessons = index.lessons.filter((item) => Number(item.track.slice(1)) <= 3);
const checkedKinds = new Set(['write', 'fill', 'wrap']);
const tweakOnly = /수정한 뒤 다시 실행|바꾸기 전 결과와 비교|값 하나를 바꾸고 다시 실행/;
const generic = /TODO 아래에 요구한 코드를 직접 작성|RUN 코드를 다시 확인|앞 단계를 다시 확인/;
let steps = 0;
let writes = 0;
let hints = 0;
let asserts = 0;
let executed = 0;

assert.equal(lessons.length, 107, 'T0~T3 레슨 수');

for (const item of lessons) {
  const lesson = JSON.parse(fs.readFileSync(new URL(`../lessons/${item.id}.json`, import.meta.url)));
  steps += lesson.steps.length;
  const seenBriefs = new Map();

  for (const step of lesson.steps) {
    const prose = [...(step.brief || []).filter((value) => typeof value === 'string'), ...(step.hints || [])];
    hints += (step.hints || []).length;
    asserts += (step.asserts || []).length;

    if (lesson.runtime === 'js' && step.kind !== 'read' && step.code && !step.files) {
      const context = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
      assert.doesNotThrow(
        () => vm.runInContext(step.code, context, { timeout: 1000 }),
        `${item.id}: ${step.kind} starter 실행 오류`,
      );
      executed += 1;
    }

    for (const sentence of (step.brief || []).filter((value) => typeof value === 'string' && value.length >= 20)) {
      const previous = seenBriefs.get(sentence);
      assert(!previous || previous === step.kind, `${item.id}: ${previous}와 ${step.kind}에 같은 brief`);
      seenBriefs.set(sentence, step.kind);
    }

    if (!checkedKinds.has(step.kind)) continue;
    writes += 1;
    assert(step.solutionCode || step.files?.some((file) => file.solutionCode), `${item.id}: 정답 코드 없음`);
    assert.notDeepEqual(step.code, step.solutionCode, `${item.id}: starter와 solution이 같음`);
    assert((step.asserts || []).length > 0, `${item.id}: 검사 항목 없음`);
    assert.doesNotMatch(prose.join('\n'), tweakOnly, `${item.id}: WRITE에 TWEAK 지시가 남음`);
    assert.doesNotMatch(prose.join('\n'), generic, `${item.id}: 구체적이지 않은 공통 문구가 남음`);

    const todo = (step.code || '').match(/\/\/\s*(?:TODO:)?\s*([^\n]+)/)?.[1];
    if (todo) {
      const keywords = todo.match(/[A-Za-z_$][\w$]*/g) || [];
      const target = `${step.solutionCode || ''}\n${JSON.stringify(step.asserts || [])}`;
      for (const word of keywords.filter((word) => /[A-Z_$]|^[a-z]+[A-Z]/.test(word))) {
        assert(target.includes(word), `${item.id}: TODO의 ${word}가 solution/assert에 없음`);
      }
    }
  }
}

console.log(`단계 일치성 검사 통과: ${lessons.length}개 레슨, ${steps}개 step, ${writes}개 작성 단계, ${hints}개 hint, ${asserts}개 assert, ${executed}개 starter 실행`);
