const CHANGED_TRACK = /^t[0-3]-/;

// 책의 순서에 맞춰 T0~T3의 의미와 번호를 함께 바꿨다. 예전 완료 표시를
// 다른 개념에 붙이지 않고 답안 원문은 복구할 수 있도록 별도 보관한다.
export function migrateBookProgress(state) {
  const lessons = {};
  const archived = {};
  Object.entries(state.lessons || {}).forEach(([id, entry]) => {
    if (CHANGED_TRACK.test(id)) archived[id] = entry;
    else lessons[id] = entry;
  });
  const inChangedTrack = CHANGED_TRACK.test(state.lastLessonId || '');
  return {
    ...state,
    lessons,
    lastLessonId: inChangedTrack ? 't0-01' : state.lastLessonId,
    lastStepIndex: inChangedTrack ? 0 : state.lastStepIndex,
    retiredLessons: {
      ...(state.retiredLessons || {}),
      bookSyncBeforeRevision8: archived,
    },
  };
}
