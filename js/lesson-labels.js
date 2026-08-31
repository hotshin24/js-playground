// 내부 ID(T0 등)가 아니라 목차 순서로 사용자용 번호를 표시한다.
export function chapterLabel(tracks, trackId) {
  const index = tracks.findIndex(track => track.id === trackId);
  return index < 0 ? '' : `${index + 1}. ${tracks[index].title}`;
}

export function lessonHeading(tracks, lesson) {
  const chapter = chapterLabel(tracks, lesson.track);
  const title = `${lesson.order}. ${lesson.title}`;
  return chapter ? `${chapter} / ${title}` : title;
}
