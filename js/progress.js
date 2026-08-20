import { meetsCompletion } from './steps.js';
import { hashText, readStep, saveStep, clearStep } from './storage.js';

const SAVE_DELAY_MS = 600;

export const NOTICE = {
  fallback: '편집기를 불러오지 못해 기본 입력창으로 대체했습니다. 구문 강조가 없지만 실행과 검사는 그대로 동작합니다.',
  saveFailed: '진행 상황을 저장하지 못했습니다. 학습은 그대로 계속할 수 있습니다.',
  readonly: '화면이 좁아 읽기 전용입니다. 768px 이상에서 편집하고 실행할 수 있습니다.',
  codeChanged: '이 단계의 예제 코드가 바뀌었습니다. 되돌리기를 누르면 새 코드로 시작합니다.',
};

/**
 * 단계 진행 상태와 코드 저장. 저장 실패는 던지지 않고 알림으로만 알린다.
 * @param {{ noticeEl: HTMLElement, getCode: () => string, onChanged: () => void }} options
 */
export function createProgress({ noticeEl, getCode, onChanged }) {
  const shown = new Set();
  let timer = 0;
  let ctx = { lessonId: null, stepIndex: 0, kind: 'write', codeHash: '' };

  const notify = (message) => {
    if (shown.has(message)) return; // 같은 안내를 반복해 띄우지 않는다
    shown.add(message);
    noticeEl.textContent = message;
  };

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = 0;
    if (!ctx.lessonId) return;
    if (!saveStep(ctx.lessonId, ctx.stepIndex, { code: getCode(), codeHash: ctx.codeHash })) {
      notify(NOTICE.saveFailed);
    }
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = window.setTimeout(flush, SAVE_DELAY_MS);
  };

  const setContext = (lessonId, stepIndex, step) => {
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

  return {
    notify,
    flush,
    schedule,
    setContext,
    complete,
    resolveCode,
    reset,
    isCurrentCodeChanged: () => hashText(getCode()) !== ctx.codeHash,
    isStepDone: (index) => Boolean((readStep(ctx.lessonId, index) || {}).completedAt),
  };
}
