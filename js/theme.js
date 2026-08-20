import { readSettings, saveSetting } from './storage.js';

const DARK_QUERY = '(prefers-color-scheme: dark)';
const LABEL = { light: '어두운 화면으로 바꾸기', dark: '밝은 화면으로 바꾸기' };

const systemTheme = () => (window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light');

/** 저장된 선택이 있으면 그것이 시스템 설정을 이긴다 */
const currentTheme = () => readSettings().theme || systemTheme();

/**
 * @param {{ button: HTMLElement, labelEl: HTMLElement }} options
 */
export function createTheme({ button, labelEl }) {
  const query = window.matchMedia(DARK_QUERY);

  const apply = () => {
    const theme = currentTheme();
    // 고르지 않았으면 속성을 비워 CSS 의 prefers-color-scheme 이 그대로 작동하게 둔다
    if (readSettings().theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
    labelEl.textContent = LABEL[theme];
    button.setAttribute('aria-pressed', String(theme === 'dark'));
  };

  const toggle = () => {
    saveSetting('theme', currentTheme() === 'dark' ? 'light' : 'dark');
    apply();
  };

  // 아직 고르지 않은 사용자는 시스템 설정 변경을 그대로 따라간다
  const handleSystem = () => {
    if (!readSettings().theme) apply();
  };

  button.addEventListener('click', toggle);
  query.addEventListener('change', handleSystem);
  apply();

  return {
    dispose: () => {
      button.removeEventListener('click', toggle);
      query.removeEventListener('change', handleSystem);
    },
  };
}
