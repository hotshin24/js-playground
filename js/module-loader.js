/**
 * 프레임 안에서 파일들을 blob 으로 만들고 이름 → URL 의 import map 을 심은 뒤 진입 모듈을 붙인다.
 * 부모가 아니라 여기서 URL 을 만드는 이유는 blob 이 만든 문서의 출처에 묶이기 때문이다.
 * URL 을 코드에 박지 않고 import map 에 맡기는 이유는 순환이다 — blob 의 내용은 만드는 순간
 * 굳고 URL 은 그전에 알 수 없어, 서로를 부르는 두 파일을 만들 수조차 없다.
 *
 * 진입 함수를 못 찾는 경우를 한 문구로 뭉개지 않는다. 학습자가 고칠 곳이 경우마다 다르다 —
 * 파일이 안 열린 것 / 아무것도 안 내보낸 것 / 이름이 다른 것 / default 로 내보낸 것.
 *
 * 주의 — 템플릿 리터럴이므로 내부에서 백틱과 달러-중괄호를 쓰지 않는다.
 */
export const MODULE_LOADER = `
(() => {
  const rt = window.__pgRuntime;

  const KIND = {
    number: '숫자', string: '문자열', boolean: '참/거짓',
    object: '객체', undefined: '값이 없는 것', symbol: '심벌', bigint: '정수',
  };
  const listOf = (names) => names.join(', ');

  window.__pgStart = (payload) => {
    // 이름이 먼저 정해져 있으므로 순서가 의미를 잃는다. 그대로 만들어 표에 올린다.
    const urls = {};
    const names = {};
    payload.files.forEach((file) => {
      const url = URL.createObjectURL(new Blob([file.code], { type: 'text/javascript' }));
      urls[file.name] = url;
      names[url] = file.name;
    });

    // 모듈이 하나라도 뜨기 전에 심어야 한다. 뜬 뒤에는 늦다.
    const map = document.createElement('script');
    map.type = 'importmap';
    map.textContent = JSON.stringify({ imports: urls });
    document.head.appendChild(map);
    // 오류의 filename 과 본문에 blob URL 이 그대로 실린다. 학습자에게는 파일 이름으로 보여야 한다.
    rt.setFiles(names);

    // 실패 문구가 어느 파일 몇 행을 가리킬지는 마지막 오류가 정한다.
    let lastError = null;
    window.addEventListener('error', (e) => {
      lastError = { file: names[e.filename] || '', line: e.lineno || 0 };
    });

    const loadFailure = () => {
      const where = lastError && lastError.file
        ? lastError.file + ' ' + lastError.line + '행의 오류 때문에 '
        : '';
      return {
        fatal: true,
        message: where + '파일을 불러오지 못했습니다. 검사는 파일을 모두 불러온 뒤에만 할 수 있습니다. 위에 나온 오류를 먼저 고쳐 주세요.',
      };
    };

    const entryFile = payload.entry;
    const check = payload.check;

    /** @returns {{fatal?: boolean, message: string}|null} 문제가 없으면 null */
    const diagnose = () => {
      const ns = window.__pgEntry;
      if (!ns) return loadFailure();
      if (!check) return null;

      const keys = Object.keys(ns);
      if (!keys.length) {
        return { message: entryFile + ' 가 아무것도 내보내지 않았습니다. 검사기는 export 로 내보낸 것만 볼 수 있습니다. 확인하려는 함수 앞에 export 를 붙이거나, 파일 끝에 export { ' + check + ' } 라고 적어 주세요.' };
      }

      const named = keys.filter((key) => key !== 'default');
      if (!Object.prototype.hasOwnProperty.call(ns, check)) {
        if (!named.length) {
          return { message: entryFile + ' 가 ' + check + ' 을(를) export default 로 내보냈습니다. 이 레슨은 이름 있는 export 를 확인합니다. export default 대신 export function ' + check + ' 로 바꿔 주세요.' };
        }
        return { message: entryFile + ' 가 ' + check + ' 을(를) 내보내지 않았습니다. 지금 내보내고 있는 것은 ' + listOf(named) + ' 입니다. 이름이 다른지 확인하시고, 맞다면 그 이름 앞에 export 를 붙여 주세요.' };
      }

      if (typeof ns[check] !== 'function') {
        return { message: entryFile + ' 의 ' + check + ' 은(는) 함수가 아닙니다 (지금은 ' + (KIND[typeof ns[check]] || typeof ns[check]) + '입니다). 함수를 내보내 주세요.' };
      }
      return null;
    };

    let settled = false;
    let release;
    // done 이 이 약속을 기다린다. 부트가 실패해도 반드시 풀어야 세션이 마감된다.
    window.__assertsPromise = new Promise((resolve) => { release = resolve; });

    // 파일이 안 열렸으면 assert 를 돌려 봐야 엉뚱한 실패만 쌓인다. 전부 오류로 마감한다.
    const failAll = (message) => {
      (payload.specs || []).forEach((spec, index) => {
        rt.post({ type: 'assert', index: index, label: spec.label, status: 'error', message: message });
      });
    };

    const finish = (forced) => {
      if (settled) return;
      settled = true;
      const problem = forced || diagnose();
      if (problem && problem.fatal) {
        failAll(problem.message);
        release();
        return;
      }
      const ns = window.__pgEntry;
      const target = ns && check ? ns[check] : undefined;
      Promise.resolve(window.__runAsserts(payload.specs || [], target, Boolean(payload.react), problem && problem.message))
        .then(release, release);
    };

    // 부트 모듈이 평가되는 도중에 불린다. 요소의 load 보다 먼저 온다.
    window.__pgModuleReady = () => finish(null);

    const boot = URL.createObjectURL(new Blob([
      // 진입 파일도 이름으로 부른다. import map 이 풀어 준다.
      'import * as ns from ' + JSON.stringify(entryFile) + ';\\n' +
      'window.__pgEntry = ns;\\n' +
      'window.__pgModuleReady();\\n',
    ], { type: 'text/javascript' }));

    const el = document.createElement('script');
    el.type = 'module';
    el.src = boot;
    // load 는 성공 신호가 아니라 마감 신호다. 문법 오류든 최상위 throw 든
    // 2~3ms 안에 온다(실측). 그래서 실패도 워치독 3초를 기다리지 않고 여기서 끊는다.
    el.addEventListener('load', () => finish(null));
    // 요소의 error 는 파싱 실패가 아니라 가져오기 실패에만 온다(실측).
    el.addEventListener('error', () => finish({ fatal: true, message: '모듈 파일을 가져오지 못했습니다.' }));
    document.body.appendChild(el);
  };
})();
`;
