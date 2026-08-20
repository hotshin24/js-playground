/**
 * 단계 종류별 정책. 화면 구성과 완료 판정이 여기 모여 있다.
 * 통과/실패가 없는 단계에 빈 검사 패널을 띄우면 학습자는 자기가 뭘 놓쳤다고 생각한다.
 */
const POLICY = {
  read: { editor: false, result: false, run: false, reset: false },
  run: { editor: true, result: false, run: true, reset: false },
  tweak: { editor: true, result: false, run: true, reset: true },
  fill: { editor: true, result: true, run: true, reset: true },
  write: { editor: true, result: true, run: true, reset: true },
};

const LABEL = {
  read: '읽기',
  run: '실행해 보기',
  tweak: '바꿔 보기',
  fill: '빈칸 채우기',
  write: '직접 쓰기',
};

export const policyOf = (kind) => POLICY[kind] || POLICY.write;
export const labelOf = (kind) => LABEL[kind] || kind;
export const isChecked = (kind) => kind === 'fill' || kind === 'write';

/**
 * 완료 판정. 관문이 아니라 기록이다 — 이동은 언제나 자유롭다.
 * @param {string} kind
 * @param {{ ran: boolean, changed: boolean, allPassed: boolean }} signals
 */
export function meetsCompletion(kind, { ran, changed, allPassed }) {
  if (kind === 'read') return true; // 읽었는지는 관측할 수 없다. 다음으로 넘어간 것이 유일한 신호다
  if (kind === 'run') return ran;
  if (kind === 'tweak') return ran && changed; // 바꿔 봤는지가 이 단계의 목적이다
  return allPassed;
}
