/**
 * 단계 종류별 정책. 화면 구성과 완료 판정이 여기 모여 있다.
 * 통과/실패가 없는 단계에 빈 검사 패널을 띄우면 학습자는 자기가 뭘 놓쳤다고 생각한다.
 *
 * 되돌리기는 여기에 없다. 단계 종류가 아니라 에디터가 있는지로 정한다 —
 * 고칠 수 있는 곳이면 되돌릴 수도 있어야 한다.
 */
const POLICY = {
  read: { editor: false, result: false, run: false },
  run: { editor: true, result: false, run: true },
  tweak: { editor: true, result: false, run: true },
  fill: { editor: true, result: true, run: true },
  wrap: { editor: true, result: true, run: true },
  write: { editor: true, result: true, run: true },
};

// read/run/tweak/fill/wrap/write 는 레슨 JSON 안에서만 쓰는 이름이다.
// 화면에는 우리말만 보인다 — 아무것도 모르는 상태로 시작하는 학습자에게
// 영어 단어 여섯 개가 먼저 보이면 그것부터 장벽이 된다.
const LABEL = {
  read: '읽기',
  run: '실행',
  tweak: '바꾸기',
  fill: '채우기',
  wrap: '감싸기',
  write: '쓰기',
};

export const policyOf = (kind) => POLICY[kind] || POLICY.write;
export const labelOf = (kind) => LABEL[kind] || kind;
// 통과·실패가 있는 단계. wrap 은 fill 과 write 사이에서 같은 검사 화면을 쓴다.
const CHECKED = new Set(['fill', 'wrap', 'write']);
export const isChecked = (kind) => CHECKED.has(kind);

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
