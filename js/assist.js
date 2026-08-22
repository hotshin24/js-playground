import { labelOf } from './steps.js';

/**
 * 앞 단계 코드(F-19) · 힌트(F-18) · 정답 보기(F-11).
 *
 * 앞 단계 코드는 나머지 둘과 성격이 다르다. 막혀서 주는 도움이 아니라 화면 구조의
 * 결손을 메우는 것이다 — 단계를 옮기면 편집기가 그 단계 것으로 바뀌어, 앞에서 본 코드를
 * 다시 보려면 지금 쓰던 것을 두고 돌아가야 했다. 그래서 실패를 조건으로 걸지 않는다.
 *
 * 힌트와 정답은 계단 하나다 — 힌트가 먼저, 정답이 나중이다.
 *
 * 실패 횟수는 진행 데이터에 넣지 않는다. 어제 두 번 틀린 사람에게 오늘 처음부터
 * 힌트가 보이면 안 된다. 그렇다고 메모리에만 두면 새로고침에 사라지는데,
 * 캐시 안내가 학습자에게 새로고침을 시키므로 도구가 두 번 방해하게 된다.
 * sessionStorage 는 탭을 닫으면 비고 새로고침은 견딘다. 그 사이가 맞다.
 */
const KEY = (lessonId, stepIndex) => 'hint:' + lessonId + ':' + stepIndex;

// 앞 단계 코드로 쓸 만한 최소 길이. 이보다 짧으면 주석 한 줄짜리 뼈대다.
const REF_MIN = 40;

/**
 * 그 단계가 보여 준 코드. `fill` 은 빈칸이 아니라 채워진 모습을 보여야 한다 —
 * 학습자가 기억하려는 것은 자기가 완성한 판이지 빈칸이 뚫린 판이 아니다.
 * `tweak`·`run` 은 solutionCode 가 없으므로 그대로 동작하는 예제가 나온다.
 */
const codeOf = (step) => {
  if (step.files) {
    return step.files
      .map((file) => '// ' + file.name + '\n' + (file.solutionCode || file.code || ''))
      .join('\n\n');
  }
  return step.solutionCode || step.code || '';
};

/**
 * 같은 레슨 안에서만 뒤로 훑는다. 레슨 경계를 넘으면 무엇을 보여줄지 규칙이 무너진다 —
 * 레슨 간 왕복은 레슨 목록이 맡는다.
 */
const referenceOf = (steps, index) => {
  for (let i = index - 1; i >= 0; i -= 1) {
    const text = codeOf(steps[i]);
    if (text.trim().length > REF_MIN) {
      return { index: i, label: (i + 1) + ' ' + labelOf(steps[i].kind), text: text };
    }
  }
  return null;
};

const HINT_AFTER = 2; // 1회 실패는 대개 오타이고 검사의 기대/실제 병기가 이미 답을 준다
const SOLUTION_AFTER = 4; // 힌트를 다 보고도 막힌 뒤라야 계단이 생긴다

const readCount = (lessonId, stepIndex) => {
  try {
    return Number(sessionStorage.getItem(KEY(lessonId, stepIndex))) || 0;
  } catch {
    return 0; // 저장이 막혀 있어도 학습을 멈추지 않는다. 힌트가 늦게 열릴 뿐이다
  }
};

const writeCount = (lessonId, stepIndex, n) => {
  try {
    sessionStorage.setItem(KEY(lessonId, stepIndex), String(n));
  } catch {
    /* 무시 */
  }
};

/**
 * @param {{ referenceButton, hintButton, solutionButton, panelEl, onReveal: () => void }} options
 *   onReveal 은 정답을 처음 펼친 순간 한 번 불린다. 진행 기록에 남기는 쪽이 판단한다.
 */
export function createAssist({ referenceButton, hintButton, solutionButton, panelEl, onReveal }) {
  let ctx = { lessonId: null, stepIndex: 0, hints: [], solution: '', checked: false, reference: null };
  let fails = 0;
  let opened = 0; // 펼친 힌트 수
  let showing = false; // 정답을 펼쳤는가
  let refOpen = false; // 앞 단계 코드를 펼쳤는가

  const codeBlock = (text) => {
    const pre = document.createElement('pre');
    pre.className = 'assist__code';
    pre.tabIndex = 0;
    pre.textContent = text;
    return pre;
  };

  const heading = (text) => {
    const p = document.createElement('p');
    p.className = 'assist__label';
    p.textContent = text;
    return p;
  };

  const render = () => {
    const parts = [];
    // 앞 단계 코드가 먼저다. 도움이 아니라 맥락이라 읽는 순서가 앞이다.
    if (refOpen && ctx.reference) {
      parts.push(heading(ctx.reference.label + ' 단계에서 본 코드입니다.'), codeBlock(ctx.reference.text));
    }
    ctx.hints.slice(0, opened).forEach((text, i) => {
      const p = document.createElement('p');
      p.className = 'assist__hint';
      p.textContent = '힌트 ' + (i + 1) + '. ' + text;
      parts.push(p);
    });
    if (showing) {
      parts.push(heading('참고 답안입니다. 옮겨 적을지는 직접 정하세요.'), codeBlock(ctx.solution));
    }
    panelEl.replaceChildren(...parts);
    panelEl.hidden = parts.length === 0;
  };

  const sync = () => {
    // 칩에 보이는 이름을 그대로 쓴다. 학습자가 위에서 보고 있는 그것이어야 헷갈리지 않는다.
    referenceButton.hidden = !(ctx.checked && ctx.reference);
    if (ctx.reference) {
      referenceButton.textContent = ctx.reference.label + ' 단계 코드 ' + (refOpen ? '접기' : '보기');
    }
    const hintLeft = ctx.hints.length - opened;
    hintButton.hidden = !(ctx.checked && ctx.hints.length && fails >= HINT_AFTER);
    hintButton.textContent = hintLeft > 0
      ? '힌트 (' + (opened + 1) + '/' + ctx.hints.length + ')'
      : '힌트 접기';
    solutionButton.hidden = !(ctx.checked && ctx.solution && fails >= SOLUTION_AFTER);
    solutionButton.textContent = showing ? '정답 접기' : '정답 보기';
  };

  const setContext = (lessonId, stepIndex, step, steps) => {
    ctx = {
      lessonId,
      stepIndex,
      hints: step.hints || [],
      solution: step.solutionCode || '',
      checked: Boolean((step.asserts || []).length),
      reference: referenceOf(steps || [], stepIndex),
    };
    fails = readCount(lessonId, stepIndex);
    opened = 0;
    showing = false;
    refOpen = false;
    render();
    sync();
  };

  /** 검사가 끝날 때마다 부른다. 통과하면 세지 않는다 — 막힌 횟수만 센다. */
  const recordResult = (allPassed) => {
    if (!ctx.checked || allPassed) return;
    fails += 1;
    writeCount(ctx.lessonId, ctx.stepIndex, fails);
    sync();
  };

  referenceButton.addEventListener('click', () => {
    refOpen = !refOpen;
    render();
    sync();
  });

  hintButton.addEventListener('click', () => {
    opened = opened < ctx.hints.length ? opened + 1 : 0;
    render();
    sync();
  });

  solutionButton.addEventListener('click', () => {
    showing = !showing;
    // 화면을 먼저 맞춘다. 기록하는 쪽이 실패해도 버튼과 패널이 어긋나면 안 된다.
    render();
    sync();
    if (showing) onReveal();
  });

  return { setContext, recordResult };
}
