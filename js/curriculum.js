export const lessonRoot = 'lessons';
export const storageKey = 'js-playground:v2';

// 미리보기 전환이 끝난 뒤 남아 있는 옛 링크는 같은 정식 과정으로 열되,
// 주소창에서는 더 이상 존재하지 않는 curriculum 파라미터를 제거한다.
if (typeof location !== 'undefined') {
  const url = new URL(location.href);
  if (url.searchParams.has('curriculum')) {
    url.searchParams.delete('curriculum');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
}
