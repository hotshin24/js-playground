# CLAUDE.md

JS/React 학습 플레이그라운드. 상세 요구사항은 `docs/PRD.md` 참조.

---

## 이 프로젝트가 아닌 것

- SPA 프레임워크 앱이 아니다. React는 **학습 대상**이지 이 앱의 구현 수단이 아니다.
- 빌드 파이프라인이 없다. npm install, webpack, vite 설정을 제안하지 마라.
- 서버가 없다. API, DB, 인증 코드를 작성하지 마라.

## 스택 제약 (변경 불가)

| 항목 | 값 |
|---|---|
| 앱 코드 | Vanilla JS, ES Modules, 빌드 없음 |
| 배포 | GitHub Pages (정적) |
| 외부 의존 | CDN ESM 임포트만. `package.json` 없음 |
| 에디터 | CodeMirror 6 (CDN) |
| React | iframe 내부에서 UMD CDN으로만 로드 |
| 저장소 | `localStorage` |
| 브라우저 | 최신 Chrome / Safari / Edge. 레거시 대응 불필요 |

## 디렉터리

```
/
├─ index.html
├─ CLAUDE.md
├─ docs/
│  └─ PRD.md
├─ css/
│  ├─ tokens.css      # primitive → semantic 2단 토큰
│  ├─ base.css
│  └─ app.css
├─ js/
│  ├─ main.js
│  ├─ editor.js       # CodeMirror 래핑
│  ├─ runner.js       # iframe 실행 엔진
│  ├─ console.js      # 콘솔 미러
│  ├─ validator.js    # assert 실행
│  ├─ storage.js      # localStorage
│  └─ lessons.js      # 레슨 로더
└─ lessons/
   └─ t1-03.json
```

모듈 1개는 200줄을 넘기지 않는다. 넘으면 분리하고 이유를 보고한다.

레슨 파일은 파일명·`id`·`order`가 PRD §4의 트랙·순서와 항상 일치해야 한다. 그 순서는 난이도가 아니라 의존 관계다.

학습자에게 보이는 모든 문구는 경어체로 쓴다. 내부 문서와 코드 주석은 해당하지 않는다.

## 코드 규약

### CSS
- `!important` 사용 금지 (0건 유지)
- 하드코딩 색상값 금지. `white`, `#fff`, `rgb()` 직접 사용 금지 → 반드시 토큰 경유
- 토큰은 2단: `--c-gray-900` (primitive) → `--c-text-strong` (semantic). 컴포넌트는 semantic만 참조
- 간격은 `--sp-*` 토큰 사용
- 셀렉터 중복은 `:is()`로 압축
- 브레이크포인트 3개: `<768` / `768~1279` / `≥1280`

### HTML / 접근성
- 모든 `<img>`에 alt. 장식 이미지는 `alt=""` + `aria-hidden="true"`
- 페이지에 `<main>` 랜드마크 1개, skip link 필수
- 인터랙티브 요소는 키보드 도달·조작 가능해야 한다
- 에디터는 포커스 트랩이 생기기 쉽다. **Esc → Tab 탈출 경로를 반드시 구현**하고 테스트하라
- 상태 변화(검증 통과/실패)는 `aria-live`로 알린다

### JS
- ES Modules, named export 우선
- `var` 금지. 재할당 없으면 `const`
- 전역 변수 금지. 상태는 모듈 스코프 또는 명시적 전달
- 이벤트 리스너는 해제 경로를 함께 작성한다
- 주석은 "무엇"이 아니라 "왜"를 쓴다

### 보안
- 실행 iframe은 `sandbox="allow-scripts"` 만. **`allow-same-origin`을 절대 추가하지 마라** (부모 DOM·스토리지 접근이 열린다)
- 사용자 코드를 부모 컨텍스트에서 `eval`하지 마라

## 작업 방식

1. **한 번에 한 마일스톤.** 다음 단계를 미리 만들지 마라.
2. 코드를 쓰기 전에 **무엇을 만들지 3~5줄로 먼저 말하라.** 승인 후 작성한다.
3. 요구사항이 모호하면 **추측하지 말고 물어라.** 특히 스코프가 커지는 방향의 추측은 금지.
4. PRD의 "비범위"(§3.3) 항목을 구현하지 마라. 필요해 보이면 제안만 하고 멈춰라.
5. 라이브러리를 추가하려면 **먼저 물어라.** CDN 한 줄이라도 마찬가지.
6. 리팩터링은 요청받았을 때만. 지나가다 눈에 띈 코드를 고치지 마라.

## 보고 규약

- 수치는 **실측만** 기재한다. "약 2MB", "대략 300ms" 같은 추정치 금지. 측정하지 않았으면 "미측정"이라고 쓴다.
- 구현하지 못했거나 우회한 부분은 숨기지 말고 명시한다.
- 작업 종료 시: 변경 파일 목록 / 검증 방법 / 알려진 미해결 이슈 3항목을 보고한다.

## 커밋

Conventional Commits. 한 커밋은 한 가지 일만.

```
feat(runner): iframe 기반 코드 실행 엔진 추가
fix(console): 객체 직렬화 시 순환 참조 처리
docs(prd): 트랜스파일러 선택 근거 기록
```

`.gitignore`에 `.DS_Store`, `._*` (AppleDouble) 포함.
