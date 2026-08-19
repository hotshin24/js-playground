// codemirror 메타 패키지(basicSetup)는 쓰지 않는다. autocomplete·lint·search·fold 가 통째로 딸려온다.
// deps 로 @codemirror/state 를 한 버전에 고정한다 — 사본이 둘이면 CM6 는 확장을 거부한다.
const CDN = 'https://esm.sh/';
const DEPS = '?deps=@codemirror/state@6';

const loadModules = () =>
  Promise.all([
    import(CDN + '@codemirror/state@6'),
    import(CDN + '@codemirror/view@6' + DEPS),
    import(CDN + '@codemirror/commands@6' + DEPS),
    import(CDN + '@codemirror/language@6' + DEPS),
    import(CDN + '@codemirror/lang-javascript@6' + DEPS),
  ]);

function buildCodeMirror([stateMod, viewMod, cmdMod, langMod, jsMod], { parent, doc, onChange }) {
  const { EditorState } = stateMod;
  const { EditorView, keymap, lineNumbers } = viewMod;
  const { defaultKeymap, history, historyKeymap, indentMore, indentLess } = cmdMod;
  const { indentOnInput, bracketMatching, syntaxHighlighting, defaultHighlightStyle } = langMod;
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

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        escapeAwareTab, // defaultKeymap 보다 먼저 와야 Tab 을 가로챈다
        lineNumbers(),
        history(),
        bracketMatching(),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
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
      ],
    }),
  });

  return {
    mode: 'codemirror',
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
 * @returns {Promise<{mode: 'codemirror'|'textarea', getValue, setValue, focus, destroy}>}
 *          mode 로 폴백 여부를 알 수 있다. 호출부가 학습자에게 알려야 한다.
 */
export async function createEditor({ parent, doc, onChange }) {
  try {
    return buildCodeMirror(await loadModules(), { parent, doc, onChange });
  } catch (err) {
    return buildTextarea({ parent, doc, onChange });
  }
}
