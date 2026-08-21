/**
 * 저장된 레슨 항목에서 읽어 내는 값들. localStorage 를 건드리지 않는 순수 함수라
 * 보관(storage.js)과 경계를 나눈다.
 */

/** 레슨의 모든 단계가 완료됐는지 */
export function lessonStatus(entry) {
  if (!entry || !entry.steps) return 'none';
  const done = Object.values(entry.steps).filter((step) => step && step.completedAt).length;
  if (!done) return 'none';
  // 총 단계 수는 레슨을 한 번이라도 연 뒤에만 안다. 모르면 '진행 중'까지만 말한다.
  return entry.stepCount && done >= entry.stepCount ? 'done' : 'partial';
}

/** 첫 미완료 단계. 다 끝냈으면 0 */
export function firstUnfinishedStep(entry, stepCount) {
  if (!entry || !entry.steps) return 0;
  for (let i = 0; i < stepCount; i += 1) {
    if (!(entry.steps[i] && entry.steps[i].completedAt)) return i;
  }
  return 0;
}
