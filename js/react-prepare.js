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

/**
 * files[] 단계의 React 준비. 파일마다 JSX 를 변환한다.
 * sourceType 을 module 로 넘겨도 import/export 는 그대로 통과하고 retainLines 가 줄 수를 지킨다(실측).
 * React 는 classic script 로 먼저 들어가므로 모듈 스코프에서 전역으로 보인다(실측).
 *
 * @returns {Promise<{ react: string, files: Array }>} js 레슨은 받은 것을 그대로 돌려준다.
 */
export function prepareFiles(files, isReact) {
  if (!isReact) return Promise.resolve({ react: '', files: files });
  return REACT_MODULES()
    .then(([tp, rt]) =>
      Promise.all([
        rt.loadReact().catch(() => { throw rt.LOAD_FAILED; }),
        Promise.all(
          files.map((file) =>
            tp
              .transpile(file.code, { sourceType: 'module' })
              .then((code) => ({ ...file, code: code }))
              // 어느 파일에서 났는지 밝히지 않으면 파일이 셋일 때 찾을 수가 없다
              .catch((err) => {
                if (!err || !err.message) throw tp.LOAD_FAILED;
                throw { ...err, message: file.name + ' — ' + err.message };
              })
          )
        ),
      ])
    )
    .then(([react, out]) => ({ react: react, files: out }));
}
