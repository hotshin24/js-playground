// revision 6: 함수 맛보기를 제거하고 기존 종합 문제 다섯 개를 한 칸씩 앞당긴다.
export function migrateT0Progress(state) {
  const before = state.lessons;
  const lessons = { ...before };
  const retiredLessons = { ...state.retiredLessons };
  if (before['t0-06']) retiredLessons['t0-function-intro'] = before['t0-06'];
  for (let n = 6; n <= 11; n += 1) delete lessons[`t0-${String(n).padStart(2, '0')}`];
  for (let n = 7; n <= 11; n += 1) {
    const oldId = `t0-${String(n).padStart(2, '0')}`;
    if (before[oldId]) lessons[`t0-${String(n - 1).padStart(2, '0')}`] = before[oldId];
  }
  let { lastLessonId, lastStepIndex } = state;
  if (lastLessonId === 't0-06') lastStepIndex = 0;
  else if (/^t0-(0[7-9]|1[01])$/.test(lastLessonId || '')) {
    lastLessonId = `t0-${String(Number(lastLessonId.slice(3)) - 1).padStart(2, '0')}`;
  }
  return { ...state, lessons, retiredLessons, lastLessonId, lastStepIndex };
}
