import { meetsCompletion } from './steps.js';
import { hashText, readStep, saveStep, saveStepFiles, clearStep, clearStepFile } from './storage.js';

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
 * @param {{ noticeEl: HTMLElement, getCode: () => string,
 *           getFiles: () => Array<{name, code, readOnly}>|null, onChanged: () => void }} options
 */
export function createProgress({ noticeEl, getCode, getFiles, onChanged }) {
  // 지금 떠 있는 안내의 열쇠. 빈 문자열이면 아무것도 떠 있지 않다.
  let current = '';
  let timer = 0;
  // 강제 종료된 코드를 버린 뒤에는, 학습자가 다시 손대기 전까지 아무것도 저장하지 않는다.
  // 그러지 않으면 단계를 옮기거나 창을 닫을 때 flush 가 그 코드를 도로 써 넣는다.
  let discarded = false;
  let ctx = { lessonId: null, stepIndex: 0, kind: 'write', codeHash: '', files: null };

  /**
   * 안내는 한 번에 하나만 뜬다. 열쇠로 다루는 이유는 사라뜨릴 시점이 안내마다 다르기 때문이다 —
   * 좁은 폭 안내는 편집기가 생기면, 저장 실패는 다음 저장이 성공하면, 폴백은 편집기가 사라지면.
   * 조건이 끝났는데 글자가 남으면 그 순간부터 거짓말이 된다(F-016).
   */
  const notify = (key) => {
    if (current === key) return; // 같은 안내를 반복해 띄우지 않는다
    current = key;
    noticeEl.textContent = NOTICE[key] || key;
  };

  /** 그 안내가 지금 떠 있을 때만 지운다. 다른 안내를 덮어 지우지 않는다. */
  const dismiss = (key) => {
    if (current !== key) return;
    current = '';
    noticeEl.textContent = '';
  };

  // readOnly 파일은 저장하지 않는다. 학습자가 고칠 수 없어 저장할 것이 없고 레슨이 이긴다.
  const saveFiles = () => {
    const now = getFiles() || [];
    const records = {};
    now.filter((file) => !file.readOnly).forEach((file) => {
      const meta = ctx.files.find((entry) => entry.name === file.name);
      records[file.name] = { code: file.code, codeHash: meta ? meta.hash : '' };
    });
    return saveStepFiles(ctx.lessonId, ctx.stepIndex, records);
  };

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = 0;
    if (!ctx.lessonId || discarded) return;
    const ok = ctx.files
      ? saveFiles()
      : saveStep(ctx.lessonId, ctx.stepIndex, { code: getCode(), codeHash: ctx.codeHash });
    if (ok) dismiss('saveFailed');
    else notify('saveFailed');
  };

  const schedule = () => {
    discarded = false; // 다시 손댔으면 저장을 재개한다
    dismiss('discarded'); // 다시 손댔으면 '버렸습니다' 안내는 더 이상 맞지 않는다
    if (timer) clearTimeout(timer);
    timer = window.setTimeout(flush, SAVE_DELAY_MS);
  };

  /**
   * 편집기 상태가 바뀌면 그 상태를 말하던 안내를 걷는다.
   * 편집기가 없으면 폴백 안내는 가리킬 대상이 없고, 편집기가 생기면 '좁아서 읽기 전용' 은 거짓이다.
   */
  const editorChanged = (editable, mode) => {
    if (!editable) {
      dismiss('fallback');
      return;
    }
    dismiss('readonly');
    if (mode !== 'textarea') dismiss('fallback');
  };

  const setContext = (lessonId, stepIndex, step) => {
    discarded = false;
    // 단계가 바뀌면 앞 단계의 사정을 말하던 안내는 전부 무효다.
    current = '';
    noticeEl.textContent = '';
    ctx = {
      lessonId,
      stepIndex,
      kind: step.kind,
      codeHash: hashText(step.code),
      // 서명을 파일별로 둔다. 한 파일의 예제 코드만 바뀌면 그 파일만 새 코드로 시작한다.
      files: step.files
        ? step.files.map((file) => ({ name: file.name, readOnly: file.readOnly, hash: hashText(file.code) }))
        : null,
    };
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
    notify('codeChanged');
    return saved.code;
  };

  /** 파일 하나만 되돌린다. 저장이 파일별로 나뉘어 있어 다른 파일은 그대로 남는다. */
  const resetFile = (name) => {
    dismiss('codeChanged'); // 예제 코드로 돌아갔으니 '코드가 바뀌었다' 는 끝난 이야기다
    clearStepFile(ctx.lessonId, ctx.stepIndex, name);
    onChanged();
  };

  const reset = () => {
    dismiss('codeChanged');
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

  /** 파일별 이어하기. 판단 기준은 코드 한 벌일 때와 같다. 안내는 한 번만 띄운다. */
  const resolveFiles = (step) => {
    const saved = readStep(ctx.lessonId, ctx.stepIndex);
    const savedFiles = (saved && saved.files) || {};
    let noticed = false;
    return step.files.map((file) => {
      if (file.readOnly) return { ...file };
      const rec = savedFiles[file.name];
      if (!rec || typeof rec.code !== 'string') return { ...file };
      const starterHash = hashText(file.code);
      if (rec.codeHash === starterHash) return { ...file, code: rec.code };
      if (hashText(rec.code) === rec.codeHash) return { ...file };
      if (!noticed) {
        notify('codeChanged');
        noticed = true;
      }
      return { ...file, code: rec.code };
    });
  };

  const anyFileChanged = () => {
    const now = getFiles() || [];
    return now.some((file) => {
      const meta = ctx.files.find((entry) => entry.name === file.name);
      return meta && !meta.readOnly && hashText(file.code) !== meta.hash;
    });
  };

  return {
    notify,
    dismiss,
    editorChanged,
    resolveFiles,
    resetFile,
    flush,
    schedule,
    discard,
    setContext,
    complete,
    resolveCode,
    reset,
    isCurrentCodeChanged: () => (ctx.files ? anyFileChanged() : hashText(getCode()) !== ctx.codeHash),
    isStepDone: (index) => Boolean((readStep(ctx.lessonId, index) || {}).completedAt),
  };
}
