import { createEditor } from './editor.js';

/**
 * 코드 작업 공간. 편집 가능 구간에서는 에디터를, 그렇지 않으면 읽기 전용 표시를 맡는다.
 * 코드의 소유권이 여기 있어서 에디터가 없는 동안에도 값이 유지된다.
 * @param {{ hostEl, readonlyEl, onChange: (code) => void,
 *           onFallback: () => void, onReadonly: () => void,
 *           onEditableChange: (editable: boolean) => void }} options
 */
export function createWorkspace({ hostEl, readonlyEl, onChange, onFallback, onReadonly, onEditableChange }) {
  let editor = null;
  let code = '';

  const getCode = () => (editor ? editor.getValue() : code);

  const setCode = (text) => {
    code = text;
    if (editor) editor.setValue(text);
    else readonlyEl.textContent = text;
  };

  const mount = async () => {
    if (editor) return;
    readonlyEl.hidden = true;
    hostEl.hidden = false;
    editor = await createEditor({
      parent: hostEl,
      doc: code,
      onChange: (next) => {
        code = next;
        onChange(next);
      },
    });
    if (editor.mode === 'textarea') onFallback();
    onEditableChange(true);
  };

  // <768 은 에디터를 아예 만들지 않는다. 띄워놓고 편집만 막지 않는다.
  const unmount = () => {
    if (editor) {
      code = editor.getValue();
      editor.destroy();
      editor = null;
    }
    hostEl.hidden = true;
    hostEl.replaceChildren();
    readonlyEl.textContent = code;
    readonlyEl.hidden = false;
    onEditableChange(false);
    onReadonly();
  };

  return {
    getCode,
    setCode,
    mount,
    unmount,
    focus: () => editor && editor.focus(),
    destroy: () => editor && editor.destroy(),
  };
}
