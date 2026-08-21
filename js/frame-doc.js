import { PRELUDE } from './sandbox-prelude.js';
import { ASSERT_RUNTIME } from './assert-runtime.js';
import { MODULE_LOADER } from './module-loader.js';

// 사용자 코드와 scaffold 안의 </script> 는 HTML 파서를 먼저 끊어버린다
export const escapeScriptEnd = (code) => code.replace(/<\/(script)/gi, '<\\/$1');

// 프레임은 별도 문서라 부모의 CSS 변수가 상속되지 않는다.
// 값을 읽어 넘겨야 다크 모드에서 미리보기만 흰 판으로 남지 않는다.
const THEME_TOKENS = [
  '--c-bg', '--c-surface', '--c-surface-alt', '--c-border',
  '--c-text-strong', '--c-text-muted', '--c-accent', '--c-accent-weak', '--c-on-accent',
  '--c-text-error', '--c-text-ok', '--c-text-warn',
];

const themeStyle = () => {
  const parent = getComputedStyle(document.documentElement);
  const lines = THEME_TOKENS.map((name) => '  ' + name + ': ' + parent.getPropertyValue(name).trim() + ';');
  return ':root {\n' + lines.join('\n') + '\n}\n';
};

// 공통 바닥. 레슨의 scaffold CSS 는 그 레슨 고유의 상태 표현만 담는다.
const BASE_STYLE = [
  'body { margin: 0; padding: 12px; background: var(--c-bg); color: var(--c-text-strong);',
  '  font: 14px/1.6 -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", system-ui, sans-serif; }',
  'ul, ol { margin: 0; padding-left: 1.2em; }',
  'h1, h2, h3 { margin: 0 0 4px; font-size: 1rem; }',
  'p { margin: 0 0 4px; }',
  'a { color: var(--c-accent); }',
  'img { max-width: 100%; }',
  'button { font: inherit; padding: 4px 10px; border: 1px solid var(--c-border); border-radius: 6px;',
  '  background: var(--c-surface); color: var(--c-text-strong); cursor: pointer; }',
  'input, select, textarea { font: inherit; padding: 4px 8px; border: 1px solid var(--c-border);',
  '  border-radius: 6px; background: var(--c-bg); color: var(--c-text-strong); }',
].join('\n');

/**
 * 레슨이 주는 무대(scaffold)를 사용자 코드보다 앞에 놓는다.
 * classic inline script 는 파싱 위치에서 동기 실행되므로 앞선 마크업은 이미 DOM 에 있다.
 * 그래서 사용자 코드의 querySelector 가 동작한다.
 */
const buildPrologue = ({ html = '', css = '' } = {}, withStyle, react = '', env = '') =>
  '<!doctype html>\n<html>\n<head>\n<meta charset="utf-8">\n' +
  (withStyle ? '<style>\n' + themeStyle() + BASE_STYLE + '\n<\/style>\n' : '') +
  (css ? '<style>\n' + css + '\n<\/style>\n' : '') +
  '</head>\n<body>\n' +
  (html ? escapeScriptEnd(html) + '\n' : '') +
  '<script>' + PRELUDE + ASSERT_RUNTIME + '<\/script>\n' +
  // 레슨이 정한 환경(가짜 fetch 등). 프렐류드 뒤라 console 미러를 쓸 수 있고,
  // 사용자 코드 앞이라 학습자가 부를 때는 이미 준비돼 있다. 없으면 아무것도 넣지 않는다.
  (env ? '<script>' + escapeScriptEnd(env) + '<\/script>\n' : '') +
  // React 는 사용자 코드보다 앞에 놓는다. 여기서 늘어난 줄 수는 offsetOf 가 그대로 센다.
  (react ? '<script>' + escapeScriptEnd(react) + '<\/script>\n' : '');

export const buildHead = (scaffold, withStyle, react = '', env = '') =>
  buildPrologue(scaffold, withStyle, react, env) + '<script>\n';

const DONE_SCRIPT = '<script>Promise.resolve(window.__assertsPromise).then(() => window.__done());<\/script>\n';
const CLOSE = '</body>\n</html>';

export const buildTail = (assertScript) =>
  '\n<\/script>\n' +
  (assertScript ? '<script>' + assertScript + '<\/script>\n' : '') +
  DONE_SCRIPT +
  CLOSE;

/**
 * files[] 단계의 문서. 사용자 코드가 인라인으로 들어가지 않고 프레임 안에서 blob 이 된다.
 * 그래서 줄 번호가 이미 파일 기준이고 offsetOf 보정이 필요 없다.
 * assert 는 로더가 모듈 적재 뒤에 돌리므로 별도 assert script 를 두지 않는다.
 */
export const buildModuleDoc = (scaffold, withStyle, env, payload) =>
  buildPrologue(scaffold, withStyle, '', env) +
  '<script>' + MODULE_LOADER + '<\/script>\n' +
  // JSON 안의 '<' 는 HTML 파서를 끊을 수 있어 이스케이프한다
  '<script>window.__pgStart(' + JSON.stringify(payload).replace(/</g, '\\u003c') + ');<\/script>\n' +
  DONE_SCRIPT +
  CLOSE;

// window.onerror 의 lineno 는 srcdoc 문서 기준이다. 사용자 코드 1행 앞의 줄 수를 세어 빼준다.
// scaffold 가 레슨마다 다르므로 상수로 둘 수 없다. 실행 시점에 센다.
// React 를 넣으면 앞이 300줄 넘게 늘어나는데, 이 함수가 최종 head 를 세므로 자동으로 맞는다.
export const offsetOf = (head) => head.split('\n').length - 1;

