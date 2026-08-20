import { BUILD } from './version.js';

const short = (sha) => (typeof sha === 'string' && sha.length > 7 ? sha.slice(0, 7) : sha);

// 캐시된 번들이 싣고 온 BUILD 와 방금 새로 받은 배포본의 커밋을 비교한다.
// 값이 갈리면 브라우저가 옛 자산을 쓰고 있다는 뜻이다.
const report = async () => {
  if (BUILD === 'dev') return;

  let live = null;
  try {
    const res = await fetch('version.json', { cache: 'no-store' });
    if (res.ok) live = await res.json();
  } catch {
    // 오프라인이거나 파일이 없을 수 있다. 진단용 장치가 학습을 막아서는 안 된다.
  }

  console.info('로드된 버전: ' + short(BUILD) + (live && live.builtAt ? ' · ' + live.builtAt : ''));

  if (live && live.commit && live.commit !== BUILD) {
    console.warn(
      '배포본이 갱신됐습니다(' + short(live.commit) + '). 강력 새로고침(⌘⇧R) 하세요.',
    );
  }
};

report();
