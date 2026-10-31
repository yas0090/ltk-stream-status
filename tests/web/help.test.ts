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
    expect(dialog.querySelectorAll(".star-icon").length).toBe(3);
    expect(dialog.querySelectorAll(".help-icons .platform-icon").length).toBe(2);
  });

  it("配信中の選手カードのサンプルが入り、サムネイルはサンプル画像で操作できない", () => {
    const { dialog } = renderHelp(memoryStorage());
    const card = dialog.querySelector(".help-sample .player-card");
    expect(card?.getAttribute("data-live")).toBe("true");
    expect(card?.hasAttribute("inert")).toBe(true);
    expect(card?.querySelector<HTMLImageElement>(".thumb-img")?.src).toContain("data:image/svg+xml");
    expect(card?.querySelector(".fav-btn .star-icon")).not.toBeNull();
  });

  it("フィルタの説明が画面の名前と合っている", () => {
    const { dialog } = renderHelp(memoryStorage());
    const text = dialog.textContent ?? "";
    for (const word of ["絞り込み", "配信中", "LTK", "解除", "詳細フィルタ"]) expect(text).toContain(word);
    expect(text).not.toContain("簡易絞り込み");
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

describe("ヘルプの文章（AC-93, AC-94）", () => {
  it("配信タイトルの LTK タグの説明がある", () => {
    const { dialog } = renderHelp(memoryStorage());
    const tag = dialog.querySelector(".help-line .ltk-tag");
    expect(tag?.textContent).toBe("LTK");
    expect(tag?.parentElement?.textContent).toContain("配信タイトルの左に付くタグ");
  });

  it("句点のあとで改行する", () => {
    const { dialog } = renderHelp(memoryStorage());
    const p = dialog.querySelector(".help-section p");
    expect(p?.querySelectorAll("br").length).toBe(1);
    expect(p?.firstChild?.textContent?.endsWith("。")).toBe(true);
  });
});
