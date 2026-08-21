// 이 두 모듈은 정적 import 하지 않는다. 정적으로 걸면 T1·T2 에서도 요청이 나가
// F-007 의 요청 수가 늘어난다. React 레슨에서만 처음 받는다.
const REACT_MODULES = () => Promise.all([import('./transpile.js'), import('./react-runtime.js')]);

export const PREPARE_FAILED = {
  message: 'JSX 변환기를 불러오지 못했습니다. 네트워크를 확인하고 다시 실행해 주세요.',
  blocked: true,
};

/**
 * React 레슨의 실행 준비. Babel 과 React 를 이 시점에 처음 받는다.
 * @returns {Promise<{ react: string, source: string }>}
 *   거절 값은 {message, line?, col?} 모양이거나 PREPARE_FAILED 로 넘긴다.
 */
export function prepareReact(code) {
  return REACT_MODULES()
    .then(([tp, rt]) =>
      Promise.all([
        rt.loadReact().catch(() => { throw rt.LOAD_FAILED; }),
        tp.transpile(code).catch((err) => { throw err && err.message ? err : tp.LOAD_FAILED; }),
      ])
    )
    .then(([react, source]) => ({ react: react, source: source }));
}
