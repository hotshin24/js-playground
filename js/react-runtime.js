// 개발 빌드를 쓴다. production 은 class 와 className 을 똑같이 통과시켜(실측)
// 학습자가 무엇을 잘못했는지 알 방법이 없다. 개발 빌드는 그것을 콘솔로 알려 준다.
// 대가는 +1,023KB 이지만 Babel(888ms)과 병렬로 받으므로 체감 시간은 늘지 않는다.
const REACT_URLS = [
  'https://unpkg.com/react@18.3.1/umd/react.development.js',
  'https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js',
];

// 프레임은 실행마다 새로 만들어진다. 매번 받지 않도록 부모가 텍스트를 들고 있는다.
let cached = null;
let loading = null;

const fetchAll = async () => {
  const sources = [];
  for (const url of REACT_URLS) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(url.split('/').pop() + ' (' + res.status + ')');
    sources.push(await res.text());
  }
  // 세미콜론으로 잇는다. UMD 파일이 세미콜론 없이 끝나도 다음 파일과 붙지 않는다.
  return sources.join('\n;\n');
};

/**
 * React·ReactDOM UMD 원문을 돌려준다.
 * 프레임 안에서 <script src> 로 받지 않는 이유는 샌드박스 안의 실패를 관측할 길이 없기 때문이다.
 * 부모가 받아 두면 실패를 잡아 학습자에게 알릴 수 있다.
 */
export const loadReact = () => {
  if (cached) return Promise.resolve(cached);
  if (!loading) {
    loading = fetchAll()
      .then((text) => { cached = text; return cached; })
      .catch((err) => { loading = null; throw err; });
  }
  return loading;
};

// React 는 대체할 것이 없다. CodeMirror 처럼 폴백을 두지 못하므로 안내로 끝낸다.
export const LOAD_FAILED = {
  message: 'React 를 불러오지 못했습니다. 네트워크를 확인하고 다시 실행해 주세요. 코드 문제가 아닙니다.',
  line: null,
  col: null,
  frame: '',
  blocked: true,
};
