// codemirror 메타 패키지(basicSetup)는 쓰지 않는다. autocomplete·lint·search·fold 가 통째로 딸려온다.
// deps 로 @codemirror/state 를 한 버전에 고정한다 — 사본이 둘이면 CM6 는 확장을 거부한다.
const CDN = 'https://esm.sh/';
const DEPS = '?deps=@codemirror/state@6';

// @lezer/highlight 는 lang-javascript 가 이미 끌어오는 패키지다.
// 같은 범위로 요청해 같은 사본을 받는다 — 사본이 둘이면 태그 동일성이 깨져
// 구문 강조가 조용히 사라진다.
const loadModules = () =>
  Promise.all([
    import(CDN + '@codemirror/state@6'),
    import(CDN + '@codemirror/view@6' + DEPS),
    import(CDN + '@codemirror/commands@6' + DEPS),
    import(CDN + '@codemirror/language@6' + DEPS),
    import(CDN + '@codemirror/lang-javascript@6' + DEPS),
    import(CDN + '@lezer/highlight@1'),
  ]);

/**
 * 구문 강조를 우리 토큰으로 정의한다.
 * 색을 값이 아니라 CSS 변수로 넣어 두면 테마 전환이 CSS 만으로 끝난다 —
 * 에디터를 다시 만들 필요가 없어 입력 중이던 코드가 그대로 남는다.
 * 라이브러리 기본값은 밝은 배경 전용이라 다크에서 대비 1.77~2.63 으로 읽히지 않았다.
 */
const buildHighlight = (HighlightStyle, t) =>
  HighlightStyle.define([
    { tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword], color: 'var(--c-syntax-keyword)' },
    { tag: [t.function(t.variableName), t.definition(t.variableName), t.propertyName, t.className], color: 'var(--c-syntax-name)' },
    { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--c-syntax-string)' },
    { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--c-syntax-number)' },
    { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--c-syntax-comment)' },
  ]);

function buildCodeMirror([stateMod, viewMod, cmdMod, langMod, jsMod, hlMod], { parent, doc, onChange }) {
  const { EditorState } = stateMod;
  const { EditorView, keymap, lineNumbers, highlightActiveLine } = viewMod;
  const { defaultKeymap, history, historyKeymap, indentMore, indentLess } = cmdMod;
  const { indentOnInput, bracketMatching, syntaxHighlighting, HighlightStyle } = langMod;
  const { javascript } = jsMod;

  // CodeMirror 는 Tab 을 들여쓰기로 먹어 포커스 트랩을 만든다.
  // Esc 를 누른 다음 Tab 을 누르면 false 를 돌려 브라우저 기본 동작(포커스 이동)을 살린다.
  let tabEscapes = false;
  const escapeAwareTab = keymap.of([
    {
      key: 'Escape',
      run: () => {
        tabEscapes = true;
        return false; // defaultKeymap 의 Escape 동작도 그대로 살린다
      },
    },
    {
      key: 'Tab',
      run: (view) => {
        if (!tabEscapes) return indentMore(view);
        tabEscapes = false;
        return false;
      },
    },
    {
      key: 'Shift-Tab',
      run: (view) => {
        if (!tabEscapes) return indentLess(view);
        tabEscapes = false;
        return false;
      },
    },
  ]);

  const base = [
    escapeAwareTab, // defaultKeymap 보다 먼저 와야 Tab 을 가로챈다
    lineNumbers(),
    // 커서가 어느 줄에 있는지 알려 주는 두 번째 단서다. 캐럿 하나로는 놓치기 쉽다.
    highlightActiveLine(),
    history(),
    bracketMatching(),
    indentOnInput(),
    syntaxHighlighting(buildHighlight(HighlightStyle, hlMod.tags), { fallback: true }),
    javascript(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({
      'aria-label': '코드 편집기',
      'aria-describedby': 'editor-hint',
    }),
    // Esc 다음 키가 Tab 이 아니면 탈출 대기를 취소한다
    EditorView.domEventHandlers({
      keydown: (event) => {
        if (!['Escape', 'Tab', 'Shift'].includes(event.key)) tabEscapes = false;
        return false;
      },
    }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) onChange(update.state.doc.toString());
    }),
  ];

  // 파일 하나가 상태 하나다. 실행 취소 이력과 커서가 상태에 들어 있어
  // 뷰 하나로 바꿔 끼워도 둘 다 남는다(실측: 전환 0.4~1.1ms · 뷰 3개는 DOM 3배).
  const makeState = (text, readOnly) =>
    EditorState.create({
      doc: text,
      extensions: readOnly ? [...base, EditorState.readOnly.of(true), EditorView.editable.of(false)] : base,
    });

  const view = new EditorView({ parent, state: makeState(doc, false) });

  return {
    mode: 'codemirror',
    createDoc: (text, { readOnly = false } = {}) => makeState(text, readOnly),
    captureDoc: () => view.state,
    showDoc: (state) => view.setState(state),
    getValue: () => view.state.doc.toString(),
    setValue: (text) => {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    },
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
}

// CDN 이 죽어도 학습이 멈추면 안 된다. 구문 강조 없는 textarea 로 계속한다.
function buildTextarea({ parent, doc, onChange }) {
  const area = document.createElement('textarea');
  area.className = 'code-input';
  area.rows = 16;
  area.spellcheck = false;
  area.setAttribute('aria-label', '코드 편집기');
  area.setAttribute('aria-describedby', 'editor-hint');
  area.value = doc;

  const handleInput = () => onChange(area.value);
  area.addEventListener('input', handleInput);
  parent.replaceChildren(area);

  return {
    mode: 'textarea',
    createDoc: (text, { readOnly = false } = {}) => ({ text, readOnly }),
    captureDoc: () => ({ text: area.value, readOnly: area.readOnly }),
    showDoc: (docState) => {
      area.value = docState.text;
      area.readOnly = docState.readOnly;
    },
    getValue: () => area.value,
    setValue: (text) => {
      area.value = text;
    },
    focus: () => area.focus(),
    destroy: () => {
      area.removeEventListener('input', handleInput);
      area.remove();
    },
  };
}

/**
 * @returns {Promise<{mode, createDoc, captureDoc, showDoc, getValue, setValue, focus, destroy}>}
 *          mode 로 폴백 여부를 알 수 있다. 호출부가 학습자에게 알려야 한다.
 */
export async function createEditor({ parent, doc, onChange }) {
  try {
    return buildCodeMirror(await loadModules(), { parent, doc, onChange });
  } catch (err) {
    return buildTextarea({ parent, doc, onChange });
  }
}
