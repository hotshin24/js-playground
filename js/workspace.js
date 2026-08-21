import { createEditor } from './editor.js';

/**
 * 코드 작업 공간. 편집 가능 구간에서는 에디터를, 그렇지 않으면 읽기 전용 표시를 맡는다.
 * 코드의 소유권이 여기 있어서 에디터가 없는 동안에도 값이 유지된다.
 *
 * 단계는 코드 한 벌이거나 파일 여럿이다. 둘을 한 표현으로 합치지 않는다 —
 * 합치면 105레슨이 새 경로를 타게 되고, 그 경로가 옳은지 매번 다시 증명해야 한다.
 *
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

  // 다중 파일 단계에서만 채워진다. null 이면 코드 한 벌짜리 단계다.
  let files = null;
  let active = '';
  // showDoc 도 문서 변경으로 관측된다. 전환을 학습자의 입력으로 세면 안 된다.
  let swapping = false;

  const record = (name) => (files ? files.find((file) => file.name === name) : null);

  const getCode = () => (editor ? editor.getValue() : code);

  const setCode = (text) => {
    files = null;
    active = '';
    code = text;
    if (editor) editor.setValue(text);
    else readonlyEl.textContent = text;
  };

  /** 지금 보고 있는 파일의 코드와 편집 상태를 그 파일 칸에 붙잡아 둔다 */
  const capture = () => {
    const rec = record(active);
    if (!rec || !editor) return;
    rec.code = editor.getValue();
    rec.doc = editor.captureDoc();
  };

  /** 에디터가 없을 때의 표시. 파일마다 이름을 달아 세로로 잇는다. */
  const renderReadonly = () => {
    if (!files) {
      readonlyEl.textContent = code;
      return;
    }
    readonlyEl.replaceChildren(
      ...files.flatMap((file) => {
        const head = document.createElement('b');
        head.className = 'readonly-code__name';
        head.textContent = file.name;
        return [head, document.createTextNode(file.code + '\n\n')];
      })
    );
  };

  const showActive = () => {
    if (!editor || !files) return;
    const rec = record(active);
    if (!rec) return;
    if (!rec.doc) rec.doc = editor.createDoc(rec.code, { readOnly: rec.readOnly });
    swapping = true;
    editor.showDoc(rec.doc);
    swapping = false;
  };

  /**
   * @param {Array<{name, code, readOnly}>} list 배열 순서가 곧 탭 순서다
   */
  const setFiles = (list) => {
    code = '';
    files = list.map((file) => ({ name: file.name, code: file.code, readOnly: file.readOnly, doc: null }));
    const first = files.find((file) => !file.readOnly) || files[0];
    active = first.name;
    if (editor) showActive();
    else renderReadonly();
  };

  /** 실행에 넘길 파일 묶음. 지금 편집 중인 것이 반영된다. */
  const getFiles = () => {
    capture();
    return files ? files.map((file) => ({ name: file.name, code: file.code, readOnly: file.readOnly })) : null;
  };

  /**
   * 파일 하나의 코드를 갈아 끼운다(되돌리기).
   * 상태를 새로 만들지 않고 문서를 치환한다 — 코드 한 벌 단계의 되돌리기와 같은 동작이어야 하고,
   * 지금 동작은 되돌린 뒤 실행 취소로 되살릴 수 있다.
   */
  const setFileCode = (name, text) => {
    const rec = record(name);
    if (!rec) return;
    rec.code = text;
    if (editor && name === active) editor.setValue(text);
    else if (!editor) renderReadonly();
    else rec.doc = null;
  };

  const select = (name) => {
    if (!files || name === active || !record(name)) return;
    capture();
    active = name;
    showActive();
  };

  const mount = async () => {
    if (editor) return;
    const mine = (generation += 1);
    readonlyEl.hidden = true;
    hostEl.hidden = false;

    const created = await createEditor({
      parent: hostEl,
      doc: files ? (record(active) || { code: '' }).code : code,
      onChange: (next) => {
        if (swapping) return;
        const rec = record(active);
        if (rec) rec.code = next;
        else code = next;
        onChange(next);
      },
    });

    if (mine !== generation) {
      created.destroy(); // 만드는 사이에 단계가 바뀌었다
      return;
    }

    editor = created;
    // 첫 문서는 생성자가 이미 그렸다. 파일 단계면 활성 파일의 상태로 다시 세운다 —
    // readOnly 여부와 파일별 이력이 여기서 붙는다.
    if (files) {
      const rec = record(active);
      if (rec) rec.doc = null;
      showActive();
    }
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
      capture();
      if (!files) code = editor.getValue();
      editor.destroy();
      editor = null;
    }
    // 편집기가 사라지면 상태 객체도 쓸 수 없다. 다음 마운트에서 다시 만든다.
    if (files) files.forEach((file) => { file.doc = null; });
    hostEl.hidden = true;
    hostEl.replaceChildren();
    renderReadonly();
    readonlyEl.hidden = false;
    onEditableChange(false);
    if (reason === 'narrow') onReadonly();
  };

  return {
    getCode,
    setCode,
    setFiles,
    getFiles,
    setFileCode,
    select,
    activeName: () => active,
    isReadOnly: (name) => Boolean((record(name || active) || {}).readOnly),
    mount,
    unmount,
    focus: () => editor && editor.focus(),
    destroy: () => editor && editor.destroy(),
  };
}
