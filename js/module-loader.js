import { MOD_TOKEN } from './module-graph.js';

/**
 * 프레임 안에서 파일들을 blob 으로 만들고 진입 모듈을 붙이는 로더.
 * 부모가 아니라 여기서 URL 을 만드는 이유는 blob 이 만든 문서의 출처에 묶이기 때문이다.
 * 주의 — 템플릿 리터럴이므로 내부에서 백틱과 달러-중괄호를 쓰지 않는다.
 */
export const MODULE_LOADER = `
(() => {
  const rt = window.__pgRuntime;
  const TOKEN = '${MOD_TOKEN}';

  window.__pgStart = (payload) => {
    // 의존이 먼저 오도록 세워져 있다. 앞선 파일의 URL 이 이미 있으므로 그 자리표시자를 바꿔 끼운다.
    const urls = {};
    const names = {};
    payload.files.forEach((file) => {
      let src = file.code;
      Object.keys(urls).forEach((dep) => {
        src = src.split(TOKEN + dep + '__').join(urls[dep]);
      });
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      urls[file.name] = url;
      names[url] = file.name;
    });
    // 오류의 filename 은 blob URL 로 온다. 학습자에게는 파일 이름으로 보여야 한다.
    rt.setFiles(names);

    let settled = false;
    let release;
    // done 이 이 약속을 기다린다. 부트가 실패해도 반드시 풀어야 세션이 마감된다.
    window.__assertsPromise = new Promise((resolve) => { release = resolve; });

    const finish = (problem) => {
      if (settled) return;
      settled = true;
      const ns = window.__pgEntry;
      const target = ns && payload.check ? ns[payload.check] : undefined;
      Promise.resolve(window.__runAsserts(payload.specs || [], target, false, problem))
        .then(release, release);
    };

    // 부트 모듈이 평가되는 도중에 불린다. 요소의 load 보다 먼저 온다.
    window.__pgModuleReady = () => finish(null);

    const boot = URL.createObjectURL(new Blob([
      'import * as ns from ' + JSON.stringify(urls[payload.entry]) + ';\\n' +
      'window.__pgEntry = ns;\\n' +
      'window.__pgModuleReady();\\n',
    ], { type: 'text/javascript' }));

    const el = document.createElement('script');
    el.type = 'module';
    el.src = boot;
    // load 는 성공 신호가 아니라 마감 신호다. 문법 오류든 최상위 throw 든
    // 2~3ms 안에 온다(실측). 그래서 실패도 워치독 3초를 기다리지 않고 여기서 끊는다.
    el.addEventListener('load', () => finish('모듈을 불러오지 못했습니다. 콘솔에 나온 오류를 먼저 확인해 주세요.'));
    // 요소의 error 는 파싱 실패가 아니라 가져오기 실패에만 온다(실측).
    el.addEventListener('error', () => finish('모듈 파일을 가져오지 못했습니다.'));
    document.body.appendChild(el);
  };
})();
`;
