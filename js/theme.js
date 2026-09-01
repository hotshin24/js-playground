import { readSettings, saveSetting } from './storage.js';

const LABEL = { light: '어두운 화면으로 바꾸기', dark: '밝은 화면으로 바꾸기' };

// Codex 스타일은 어두운 작업 화면이 기본이다. 사용자가 고른 테마는 계속 유지한다.
const systemTheme = () => 'dark';

/** 저장된 선택이 있으면 그것이 시스템 설정을 이긴다 */
const currentTheme = () => readSettings().theme || systemTheme();

/**
 * @param {{ button: HTMLElement, labelEl: HTMLElement }} options
 */
export function createTheme({ button, labelEl }) {
  const apply = () => {
    const theme = currentTheme();
    document.documentElement.dataset.theme = theme;
    labelEl.textContent = LABEL[theme];
    button.setAttribute('aria-pressed', String(theme === 'dark'));
  };

  const toggle = () => {
    saveSetting('theme', currentTheme() === 'dark' ? 'light' : 'dark');
    apply();
  };

  button.addEventListener('click', toggle);
  apply();

  return {
    dispose: () => {
      button.removeEventListener('click', toggle);
    },
  };
}
