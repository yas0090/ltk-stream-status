import { h } from "./dom";
import { browserStorage, readItem, writeItem } from "./storage";

// 表示テーマ（AC-39）。初期値は OS の設定に関係なくライト
export type Theme = "light" | "dark";

export const THEME_KEY = "ltk-stream-status:theme:v1";

export const loadTheme = (storage = browserStorage()): Theme => (readItem(THEME_KEY, storage) === "dark" ? "dark" : "light");

export const applyTheme = (theme: Theme) => {
  document.documentElement.dataset.theme = theme;
};

const LABEL: Record<Theme, { icon: string; next: string }> = {
  light: { icon: "☀", next: "ダークモードに切り替える" },
  dark: { icon: "☾", next: "ライトモードに切り替える" },
};

// 押すたびにテーマを切り替えて保存する。保存できなくても切り替え自体は動く
export function renderThemeToggle(storage = browserStorage()): HTMLButtonElement {
  let theme = loadTheme(storage);
  const button = h("button", { type: "button", class: "theme-toggle" });
  const render = () => {
    applyTheme(theme);
    button.textContent = LABEL[theme].icon;
    button.setAttribute("aria-label", LABEL[theme].next);
    button.title = LABEL[theme].next;
  };
  button.addEventListener("click", () => {
    theme = theme === "light" ? "dark" : "light";
    writeItem(THEME_KEY, theme, storage);
    render();
  });
  render();
  return button;
}
