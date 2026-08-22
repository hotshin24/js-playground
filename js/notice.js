/**
 * 안내 한 줄. 한 번에 하나만 뜬다.
 *
 * 열쇠로 다루는 이유는 사라뜨릴 시점이 안내마다 다르기 때문이다 — 좁은 폭 안내는
 * 편집기가 생기면, 저장 실패는 다음 저장이 성공하면, 폴백은 편집기가 사라지면.
 * 조건이 끝났는데 글자가 남으면 그 순간부터 거짓말이 된다(F-016).
 */
export const NOTICE = {
  fallback: '편집기를 불러오지 못해 기본 입력창으로 대체했습니다. 구문 강조가 없지만 실행과 검사는 그대로 동작합니다.',
  saveFailed: '진행 상황을 저장하지 못했습니다. 학습은 그대로 계속할 수 있습니다.',
  readonly: '화면이 좁아 읽기 전용입니다. 768px 이상에서 편집하고 실행할 수 있습니다.',
  codeChanged: '이 단계의 예제 코드가 바뀌었습니다. 되돌리기를 누르면 새 코드로 시작합니다.',
  discarded: '강제 종료된 코드는 저장하지 않았습니다. 다시 열면 예제 코드로 시작합니다.',
  stale: '도구가 새 버전으로 바뀌었습니다. 지금 열려 있는 화면은 이전 버전이라 일부 레슨이 열리지 않을 수 있습니다. 여러분의 코드 문제가 아닙니다. 새로고침해 주세요 (⌘⇧R 또는 Ctrl+Shift+R).',
};

// 단계와 무관한 안내. 페이지를 다시 열기 전에는 사실이 바뀌지 않으므로 단계를 옮겨도 지우지 않는다.
const STICKY = ['stale'];

export function createNotice(noticeEl) {
  // 지금 떠 있는 안내의 열쇠. 빈 문자열이면 아무것도 떠 있지 않다.
  let current = '';

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

  /** 단계가 바뀌면 앞 단계의 사정을 말하던 안내는 무효다. 붙박이는 남긴다. */
  const clearForStep = () => {
    if (STICKY.includes(current)) return;
    current = '';
    noticeEl.textContent = '';
  };

  return { notify, dismiss, editorChanged, clearForStep };
}
