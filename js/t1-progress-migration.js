// 함수 종합 문제는 답안을 유지해 T2로 옮기고, 교체한 T1 답안만 따로 보관한다.
export function migrateT1Progress(state) {
  const lessons = { ...state.lessons };
  let lastLessonId = state.lastLessonId;
  for (let number = 31; number <= 45; number += 1) {
    const oldId = `t1-${number}`;
    const newId = `t2-${number + 1}`;
    if (lessons[oldId]) {
      if (!lessons[newId]) lessons[newId] = lessons[oldId];
      else lessons[newId] = { ...lessons[newId], archivedFromT1: lessons[oldId] };
      delete lessons[oldId];
    }
    if (lastLessonId === oldId) lastLessonId = newId;
  }
  for (let number = 15; number <= 30; number += 1) {
    const id = `t1-${number}`;
    const entry = lessons[id];
    if (!entry?.steps) continue;
    const steps = { ...entry.steps };
    const archived = { ...entry.archivedBeforeRevision7 };
    for (const index of number === 15 ? [4, 6] : [2]) {
      if (steps[index]) archived[index] = steps[index];
      delete steps[index];
    }
    lessons[id] = { ...entry, steps, archivedBeforeRevision7: archived };
  }
  return { ...state, lessons, lastLessonId };
}
