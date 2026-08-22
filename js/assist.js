/**
 * 힌트(F-18)와 정답 보기(F-11). 계단 하나로 세운다 — 힌트가 먼저, 정답이 나중이다.
 *
 * 실패 횟수는 진행 데이터에 넣지 않는다. 어제 두 번 틀린 사람에게 오늘 처음부터
 * 힌트가 보이면 안 된다. 그렇다고 메모리에만 두면 새로고침에 사라지는데,
 * 캐시 안내가 학습자에게 새로고침을 시키므로 도구가 두 번 방해하게 된다.
 * sessionStorage 는 탭을 닫으면 비고 새로고침은 견딘다. 그 사이가 맞다.
 */
const KEY = (lessonId, stepIndex) => 'hint:' + lessonId + ':' + stepIndex;

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
 * @param {{ hintButton, solutionButton, panelEl, onReveal: () => void }} options
 *   onReveal 은 정답을 처음 펼친 순간 한 번 불린다. 진행 기록에 남기는 쪽이 판단한다.
 */
export function createAssist({ hintButton, solutionButton, panelEl, onReveal }) {
  let ctx = { lessonId: null, stepIndex: 0, hints: [], solution: '', checked: false };
  let fails = 0;
  let opened = 0; // 펼친 힌트 수
  let showing = false; // 정답을 펼쳤는가

  const render = () => {
    const parts = [];
    ctx.hints.slice(0, opened).forEach((text, i) => {
      const p = document.createElement('p');
      p.className = 'assist__hint';
      p.textContent = '힌트 ' + (i + 1) + '. ' + text;
      parts.push(p);
    });
    if (showing) {
      const head = document.createElement('p');
      head.className = 'assist__label';
      head.textContent = '참고 답안입니다. 옮겨 적을지는 직접 정하세요.';
      const pre = document.createElement('pre');
      pre.className = 'assist__code';
      pre.tabIndex = 0;
      pre.textContent = ctx.solution;
      parts.push(head, pre);
    }
    panelEl.replaceChildren(...parts);
    panelEl.hidden = parts.length === 0;
  };

  const sync = () => {
    const hintLeft = ctx.hints.length - opened;
    hintButton.hidden = !(ctx.checked && ctx.hints.length && fails >= HINT_AFTER);
    hintButton.textContent = hintLeft > 0
      ? '힌트 (' + (opened + 1) + '/' + ctx.hints.length + ')'
      : '힌트 접기';
    solutionButton.hidden = !(ctx.checked && ctx.solution && fails >= SOLUTION_AFTER);
    solutionButton.textContent = showing ? '정답 접기' : '정답 보기';
  };

  const setContext = (lessonId, stepIndex, step) => {
    ctx = {
      lessonId,
      stepIndex,
      hints: step.hints || [],
      solution: step.solutionCode || '',
      checked: Boolean((step.asserts || []).length),
    };
    fails = readCount(lessonId, stepIndex);
    opened = 0;
    showing = false;
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
