const BABEL_URL = 'https://esm.sh/@babel/standalone@7.26.4';

// Babel 은 T3 진입 시에만 받는다. 정적 import 를 넣는 순간 T1·T2 의 초기 로드가 늘어난다(F-007).
let babel = null;
let loading = null;

const loadBabel = () => {
  if (babel) return Promise.resolve(babel);
  if (!loading) {
    loading = import(BABEL_URL)
      .then((mod) => {
        babel = mod.default || mod;
        if (typeof babel.transform !== 'function') throw new Error('transform 이 없습니다');
        return babel;
      })
      // 실패를 캐시하면 다시 실행해도 영영 안 된다
      .catch((err) => { loading = null; throw err; });
  }
  return loading;
};

// Babel 메시지는 "unknown: 본문 (5:10)\n\n  3 | ..." 모양이다.
// 위치는 콘솔이 "줄:칸" 으로 따로 찍으므로 본문에서 떼어낸다.
const LOC_TAIL = /\s*\((\d+):(\d+)\)\s*$/;

const normalizeError = (err) => {
  const raw = String((err && err.message) || err);
  const [first, ...rest] = raw.split('\n');
  const found = first.match(LOC_TAIL);
  const loc = err && err.loc;
  return {
    message: first.replace(/^unknown:\s*/, '').replace(LOC_TAIL, ''),
    line: found ? Number(found[1]) : loc ? loc.line : null,
    col: found ? Number(found[2]) : loc ? loc.column : null,
    frame: rest.join('\n').replace(/^\n+/, ''),
  };
};

/**
 * JSX 를 프레임에 주입할 classic script 로 바꾼다.
 *
 * retainLines 는 줄 번호를 지키는 유일한 장치다. 빼면 runner 의
 * `lineno - offsetOf(head)` 산술이 통째로 어긋난다(PRD §6.3).
 * sourceType 을 script 로 두는 이유는 실제로 classic script 로 넣기 때문이다.
 * 최상위 const 는 전역 렉시컬 환경에 남아 뒤따르는 assert 스크립트가 이름으로 찾을 수 있다.
 *
 * @throws {{ message, line, col, frame }} 변환 실패. 프레임 밖이라 window.onerror 가 잡지 못한다.
 */
export const transpile = async (code) => {
  const engine = await loadBabel();
  try {
    return engine.transform(code, {
      presets: [['react', { runtime: 'classic' }]],
      retainLines: true,
      sourceType: 'script',
      compact: false,
      babelrc: false,
      configFile: false,
    }).code;
  } catch (err) {
    throw normalizeError(err);
  }
};

/** 로드 자체가 실패한 경우. 학습자에게는 코드 문제가 아니라는 것이 먼저 보여야 한다. */
export const LOAD_FAILED = {
  message: 'JSX 변환기를 불러오지 못했습니다. 네트워크를 확인하고 다시 실행해 주세요.',
  line: null,
  col: null,
  frame: '',
  blocked: true,
};
