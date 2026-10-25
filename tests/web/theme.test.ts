// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { loadTheme, renderThemeToggle, THEME_KEY } from "../../src/web/theme";

const memoryStorage = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
};

describe("表示テーマ（AC-39）", () => {
  it("初期値はライト", () => {
    expect(loadTheme(memoryStorage())).toBe("light");
    renderThemeToggle(memoryStorage());
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("保存したテーマを復元する", () => {
    expect(loadTheme(memoryStorage({ [THEME_KEY]: "dark" }))).toBe("dark");
    expect(loadTheme(memoryStorage({ [THEME_KEY]: "purple" }))).toBe("light");
  });

  it("押すたびに切り替えて保存する", () => {
    const storage = memoryStorage();
    const button = renderThemeToggle(storage);
    expect(button.getAttribute("aria-label")).toBe("ダークモードに切り替える");

    button.click();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(storage.data.get(THEME_KEY)).toBe("dark");
    expect(button.getAttribute("aria-label")).toBe("ライトモードに切り替える");

    button.click();
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(storage.data.get(THEME_KEY)).toBe("light");
  });

  it("保存できなくても切り替え自体は動く", () => {
    const throwing = {
      getItem: (): string | null => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
    };
    const button = renderThemeToggle(throwing);
    button.click();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
