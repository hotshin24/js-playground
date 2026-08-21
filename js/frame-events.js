/**
 * 프레임이 보낸 메시지를 앱이 쓰는 이벤트로 옮긴다.
 * 신뢰 판정(source 동일성)과 워치독 상태는 러너가 쥐고, 여기서는 모양만 바꾼다.
 */

/**
 * @param {object} msg 프레임에서 온 메시지
 * @param {number} lineOffset 사용자 코드 1행 앞의 줄 수. files[] 단계는 0
 * @returns {object|null} 옮길 것이 없으면 null
 */
export function toEvent(msg, lineOffset) {
  if (msg.type === 'done') {
    return { type: 'done' };
  }

  if (msg.type === 'error') {
    const line = msg.line > lineOffset ? msg.line - lineOffset : null;
    // file 은 files[] 단계에서만 채워진다. 어느 파일의 몇 행인지가 함께 있어야 고칠 수 있다.
    return {
      type: 'error',
      message: msg.message,
      line: line,
      col: line ? msg.col || null : null,
      file: msg.file || '',
    };
  }

  if (msg.type === 'console') {
    return { type: 'console', level: msg.level, args: msg.args };
  }

  if (msg.type === 'assert') {
    return {
      type: 'assert',
      index: msg.index,
      status: msg.status,
      label: msg.label,
      expected: msg.expected,
      actual: msg.actual,
      message: msg.message,
    };
  }

  return null;
}
