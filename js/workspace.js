import { createEditor } from './editor.js';

/**
 * 코드 작업 공간. 편집 가능 구간에서는 에디터를, 그렇지 않으면 읽기 전용 표시를 맡는다.
 * 코드의 소유권이 여기 있어서 에디터가 없는 동안에도 값이 유지된다.
 * @param {{ hostEl, readonlyEl, onChange: (code) => void,
 *           onFallback: () => void, onReadonly: () => void,
 *           onEditableChange: (editable: boolean) => void }} options
 * onReadonly 는 '화면이 좁아서' 에디터가 없을 때만 불린다. read 단계는 해당하지 않는다.
 */
export function createWorkspace({ hostEl, readonlyEl, onChange, onFallback, onReadonly, onEditableChange }) {
  let editor = null;
  let code = '';
  // 에디터 생성은 비동기다. 만드는 도중에 단계가 바뀌면 뒤늦게 도착한 에디터가
  // 엉뚱한 단계 화면에 붙는다. 세대 번호로 그 결과를 버린다.
  let generation = 0;

  const getCode = () => (editor ? editor.getValue() : code);

  const setCode = (text) => {
    code = text;
    if (editor) editor.setValue(text);
    else readonlyEl.textContent = text;
  };

  const mount = async () => {
    if (editor) return;
    const mine = (generation += 1);
    readonlyEl.hidden = true;
    hostEl.hidden = false;

    const created = await createEditor({
      parent: hostEl,
      doc: code,
      onChange: (next) => {
        code = next;
        onChange(next);
      },
    });

    if (mine !== generation) {
      created.destroy(); // 만드는 사이에 단계가 바뀌었다
      return;
    }

    editor = created;
    if (editor.mode === 'textarea') onFallback();
    onEditableChange(true);
  };

  /**
   * 에디터를 내린다.
   * 사유가 둘이라 구분해야 한다 — 화면이 좁아서('narrow')와 read 단계라서('step').
   * 둘을 같은 경로로 두면 넓은 화면에서 read 단계를 거친 뒤
   * "화면이 좁아 읽기 전용" 안내가 잘못 남는다.
   * <768 은 에디터를 아예 만들지 않는다. 띄워놓고 편집만 막지 않는다.
   * @param {'narrow'|'step'} reason
   */
  const unmount = (reason = 'narrow') => {
    generation += 1; // 진행 중인 mount 결과를 무효화한다
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
    if (reason === 'narrow') onReadonly();
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
