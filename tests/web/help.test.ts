// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { renderHelp } from "../../src/web/help";
import { HELP_SEEN_KEY, markHelpSeen, shouldAutoShowHelp } from "../../src/web/storage";

const memoryStorage = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    data,
  };
};

describe("自動表示の判定（AC-77〜79）", () => {
  it("未設定なら true、記録済みなら false", () => {
    expect(shouldAutoShowHelp(memoryStorage())).toBe(true);
    expect(shouldAutoShowHelp(memoryStorage({ [HELP_SEEN_KEY]: "1" }))).toBe(false);
  });

  it("getItem が例外なら false", () => {
    const storage = {
      ...memoryStorage(),
      getItem: (): string | null => {
        throw new Error("SecurityError");
      },
    };
    expect(shouldAutoShowHelp(storage)).toBe(false);
  });

  it("setItem が例外なら false。保存領域がなければ false", () => {
    const storage = {
      ...memoryStorage(),
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(shouldAutoShowHelp(storage)).toBe(false);
  });

  it("localStorage へのアクセス自体が例外なら false", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage")!;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => {
        throw new Error("SecurityError");
      },
    });
    try {
      expect(shouldAutoShowHelp()).toBe(false);
    } finally {
      Object.defineProperty(window, "localStorage", original);
    }
  });

  it("試し書きは残さない", () => {
    const storage = memoryStorage();
    shouldAutoShowHelp(storage);
    expect(storage.data.size).toBe(0);
  });

  it("markHelpSeen は例外でも投げない", () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("x");
      },
    };
    expect(() => markHelpSeen(storage)).not.toThrow();
  });
});

describe("ヘルプのモーダル（AC-81〜89）", () => {
  beforeEach(() => document.body.replaceChildren());

  it("ボタンの読み上げ名は「ヘルプ」で、押すと開く", () => {
    const { button, dialog } = renderHelp(memoryStorage());
    document.body.replaceChildren(button, dialog);
    expect(button.getAttribute("aria-label")).toBe("ヘルプ");
    expect(button.textContent).toBe("?");
    button.click();
    expect(dialog.open).toBe(true);
  });

  it("5 つの見出しが順に並び、星と LIVE と配信サービスのアイコンが入る", () => {
    const { dialog } = renderHelp(memoryStorage());
    expect([...dialog.querySelectorAll("h3")].map((el) => el.textContent)).toEqual([
      "このサイトについて",
      "選手カードの見方",
      "フィルタの使い方",
      "お気に入りの使い方",
      "本戦スケジュール",
    ]);
    expect(dialog.querySelector(".live-badge")?.textContent).toBe("LIVE");
    expect(dialog.querySelectorAll(".star-icon").length).toBe(2);
    expect(dialog.querySelectorAll(".platform-icon").length).toBe(2);
  });

  it("閉じたときに記録する。表示しただけでは記録しない", () => {
    const storage = memoryStorage();
    const { button, dialog, autoOpen } = renderHelp(storage);
    document.body.replaceChildren(button, dialog);
    autoOpen();
    expect(dialog.open).toBe(true);
    expect(storage.data.has(HELP_SEEN_KEY)).toBe(false);
    dialog.querySelector<HTMLButtonElement>(".help-close")!.click();
    expect(dialog.open).toBe(false);
    expect(storage.data.get(HELP_SEEN_KEY)).toBe("1");
  });

  it("Esc 相当の close でも記録する", () => {
    const storage = memoryStorage();
    const { button, dialog } = renderHelp(storage);
    document.body.replaceChildren(button, dialog);
    button.click();
    dialog.dispatchEvent(new Event("close"));
    expect(storage.data.get(HELP_SEEN_KEY)).toBe("1");
  });

  it("記録済みなら自動で開かない", () => {
    const { button, dialog, autoOpen } = renderHelp(memoryStorage({ [HELP_SEEN_KEY]: "1" }));
    document.body.replaceChildren(button, dialog);
    autoOpen();
    expect(dialog.open).toBe(false);
  });
});
