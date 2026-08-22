import { BUILD } from './version.js';

const short = (sha) => (typeof sha === 'string' && sha.length > 7 ? sha.slice(0, 7) : sha);

/**
 * 캐시된 번들이 싣고 온 BUILD 와 방금 새로 받은 배포본의 커밋을 비교한다.
 * 값이 갈리면 브라우저가 옛 자산을 쓰고 있다는 뜻이다.
 *
 * 콘솔만으로는 부족하다. 학습자는 콘솔이 아니라 오류 화면을 본다 —
 * 옛 lessons.js 가 새 레슨 JSON 을 검증하면 "code 가 필요합니다" 로 끊긴다.
 * 그래서 판정을 돌려주고 부르는 쪽이 화면에도 알린다.
 *
 * @returns {Promise<boolean>} 캐시가 배포본보다 낡았으면 true
 */
export const checkBuild = async () => {
  if (BUILD === 'dev') return false;

  let live = null;
  try {
    const res = await fetch('version.json', { cache: 'no-store' });
    if (res.ok) live = await res.json();
  } catch {
    // 오프라인이거나 파일이 없을 수 있다. 진단용 장치가 학습을 막아서는 안 된다.
  }

  console.info('로드된 버전: ' + short(BUILD) + (live && live.builtAt ? ' · ' + live.builtAt : ''));

  const stale = Boolean(live && live.commit && live.commit !== BUILD);
  if (stale) {
    console.warn(
      '배포본이 갱신됐습니다(' + short(live.commit) + '). 강력 새로고침(⌘⇧R) 하세요.',
    );
  }
  return stale;
};
