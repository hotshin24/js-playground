import { meetsCompletion } from './steps.js';
import { hashText, readStep, saveStep, clearStep } from './storage.js';

const SAVE_DELAY_MS = 600;

export const NOTICE = {
  fallback: '편집기를 불러오지 못해 기본 입력창으로 대체했습니다. 구문 강조가 없지만 실행과 검사는 그대로 동작합니다.',
  saveFailed: '진행 상황을 저장하지 못했습니다. 학습은 그대로 계속할 수 있습니다.',
  readonly: '화면이 좁아 읽기 전용입니다. 768px 이상에서 편집하고 실행할 수 있습니다.',
  codeChanged: '이 단계의 예제 코드가 바뀌었습니다. 되돌리기를 누르면 새 코드로 시작합니다.',
  discarded: '강제 종료된 코드는 저장하지 않았습니다. 다시 열면 예제 코드로 시작합니다.',
};

/**
 * 단계 진행 상태와 코드 저장. 저장 실패는 던지지 않고 알림으로만 알린다.
 * @param {{ noticeEl: HTMLElement, getCode: () => string, onChanged: () => void }} options
 */
export function createProgress({ noticeEl, getCode, onChanged }) {
  const shown = new Set();
  let timer = 0;
  // 강제 종료된 코드를 버린 뒤에는, 학습자가 다시 손대기 전까지 아무것도 저장하지 않는다.
  // 그러지 않으면 단계를 옮기거나 창을 닫을 때 flush 가 그 코드를 도로 써 넣는다.
  let discarded = false;
  let ctx = { lessonId: null, stepIndex: 0, kind: 'write', codeHash: '' };

  const notify = (message) => {
    if (shown.has(message)) return; // 같은 안내를 반복해 띄우지 않는다
    shown.add(message);
    noticeEl.textContent = message;
  };

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = 0;
    if (!ctx.lessonId || discarded) return;
    if (!saveStep(ctx.lessonId, ctx.stepIndex, { code: getCode(), codeHash: ctx.codeHash })) {
      notify(NOTICE.saveFailed);
    }
  };

  const schedule = () => {
    discarded = false; // 다시 손댔으면 저장을 재개한다
    if (timer) clearTimeout(timer);
    timer = window.setTimeout(flush, SAVE_DELAY_MS);
  };

  const setContext = (lessonId, stepIndex, step) => {
    discarded = false;
    ctx = { lessonId, stepIndex, kind: step.kind, codeHash: hashText(step.code) };
  };

  /** 완료 판정은 기록일 뿐 관문이 아니다 */
  const complete = (signals) => {
    if (!meetsCompletion(ctx.kind, signals)) return;
    saveStep(ctx.lessonId, ctx.stepIndex, { completedAt: new Date().toISOString() });
    onChanged();
  };

  /** 이어하기 우선순위: 저장분 > 예제 코드. 단 손대지 않은 저장분은 조용히 갱신한다. */
  const resolveCode = (step) => {
    const saved = readStep(ctx.lessonId, ctx.stepIndex);
    if (!saved || typeof saved.code !== 'string') return step.code;
    if (saved.codeHash === ctx.codeHash) return saved.code;
    if (hashText(saved.code) === saved.codeHash) return step.code;
    notify(NOTICE.codeChanged);
    return saved.code;
  };

  const reset = () => {
    clearStep(ctx.lessonId, ctx.stepIndex);
    onChanged();
  };

  /**
   * 강제 종료된 실행의 코드는 남기지 않는다.
   * 남기면 다시 열 때마다 그 코드가 복원되어 실행할 때마다 3초를 기다리게 된다.
   * 대기 중인 저장도 함께 취소한다 — 그러지 않으면 방금 지운 것을 곧바로 다시 쓴다.
   */
  const discard = () => {
    if (timer) clearTimeout(timer);
    timer = 0;
    discarded = true;
    clearStep(ctx.lessonId, ctx.stepIndex);
    onChanged();
  };

  return {
    notify,
    flush,
    schedule,
    discard,
    setContext,
    complete,
    resolveCode,
    reset,
    isCurrentCodeChanged: () => hashText(getCode()) !== ctx.codeHash,
    isStepDone: (index) => Boolean((readStep(ctx.lessonId, index) || {}).completedAt),
  };
}
