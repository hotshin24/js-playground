import { validateLesson } from './lessons.js';
import { createRunner } from './runner.js';
import { buildAssertScript } from './validator.js';

const statusEl = document.querySelector('#status');
const summaryEl = document.querySelector('#summary');
const failuresEl = document.querySelector('#failures');
const mount = document.querySelector('#mount');
const checkedKinds = new Set(['fill', 'wrap', 'write']);

const state = {
  total: 0,
  passed: 0,
  failed: [],
  currentResolve: null,
  events: [],
};

const runner = createRunner({
  mount,
  onEvent(event) {
    state.events.push(event);
    if ((event.type === 'done' || event.type === 'timeout') && state.currentResolve) {
      const resolve = state.currentResolve;
      state.currentResolve = null;
      resolve(state.events);
    }
  },
});

const specsOf = (step) => step.asserts.filter((spec) => spec.type === 'value' || spec.type === 'dom');
const filesWith = (step, solution) =>
  step.files && step.files.map((file) => ({ ...file, code: solution && file.solutionCode ? file.solutionCode : file.code }));

const execute = (lesson, step, code, solution) =>
  new Promise((resolve) => {
    state.events = [];
    state.currentResolve = resolve;
    const specs = specsOf(step);
    const files = filesWith(step, solution);
    runner.run(code, {
      runtime: lesson.runtime,
      scaffold: step.scaffold,
      env: step.env,
      assertScript: files ? '' : buildAssertScript(step, { react: lesson.runtime === 'react' }),
      files,
      entry: step.entry,
      specs,
    });
  });

const record = (label, ok, events) => {
  state.total += 1;
  if (ok) state.passed += 1;
  else {
    const detail = events
      .filter((event) => ['error', 'timeout', 'assert'].includes(event.type))
      .map((event) => event.message || `${event.label || event.type}: ${event.status || ''} (기대 ${event.expected || '-'} / 실제 ${event.actual || '-'})`)
      .join(' / ');
    state.failed.push(`${label}${detail ? ` — ${detail}` : ''}`);
  }
  statusEl.textContent = `${state.total}건 검사 중 · 통과 ${state.passed} · 실패 ${state.failed.length}`;
};

const hasExecutionError = (events) => events.some((event) => event.type === 'error' || event.type === 'timeout');
const allAssertsPass = (events, expectedCount) => {
  const asserts = events.filter((event) => event.type === 'assert');
  return asserts.length === expectedCount && asserts.every((event) => event.status === 'pass');
};

async function audit() {
  const index = await fetch('lessons/index.json', { cache: 'no-store' }).then((response) => response.json());

  for (const item of index.lessons) {
    const raw = await fetch(`lessons/${item.id}.json`, { cache: 'no-store' }).then((response) => response.json());
    const lesson = validateLesson(raw, item.id);

    for (const [stepIndex, step] of lesson.steps.entries()) {
      if (step.kind === 'run') {
        const events = await execute(lesson, step, step.code, false);
        const errors = events.filter((event) => event.type === 'error');
        const expectedError = step.expectedError;
        const ok = expectedError
          ? errors.some((event) => event.message.includes(expectedError))
          : !hasExecutionError(events);
        record(`${item.id} ${stepIndex + 1}단계 완성 예제`, ok, events);
      }

      if (checkedKinds.has(step.kind)) {
        const expectedCount = specsOf(step).length;
        const solutionEvents = await execute(lesson, step, step.solutionCode, true);
        record(
          `${item.id} ${stepIndex + 1}단계 정답`,
          !hasExecutionError(solutionEvents) && allAssertsPass(solutionEvents, expectedCount),
          solutionEvents
        );

        const starterEvents = await execute(lesson, step, step.code, false);
        record(
          `${item.id} ${stepIndex + 1}단계 시작 코드`,
          hasExecutionError(starterEvents) || !allAssertsPass(starterEvents, expectedCount),
          starterEvents
        );
      }
    }
  }

  runner.dispose();
  statusEl.textContent = state.failed.length ? '브라우저 감사 실패' : '브라우저 감사 통과';
  summaryEl.textContent = `전체 ${state.total}건 · 통과 ${state.passed} · 실패 ${state.failed.length}`;
  failuresEl.textContent = state.failed.join('\n');
  document.documentElement.dataset.audit = state.failed.length ? 'failed' : 'passed';
}

audit().catch((error) => {
  runner.dispose();
  statusEl.textContent = '브라우저 감사 실행 오류';
  failuresEl.textContent = error.stack || error.message;
  document.documentElement.dataset.audit = 'failed';
});
