// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChangelogEntry, SiteData } from "../../src/shared/types";
import { createApp } from "../../src/web/app";
import { renderChangelog } from "../../src/web/changelog";

const entries: ChangelogEntry[] = [
  { date: "2026-10-01", type: "新機能", body: "古い項目" },
  { date: "2026-10-28", type: "修正", body: "<b>新しい項目</b>" },
];

describe("更新履歴のモーダル（AC-58〜61）", () => {
  it("0 件のときは何も作らない", () => {
    expect(renderChangelog([])).toBeUndefined();
  });

  it("新しい順に日付・種類・本文を表示する。本文は HTML として解釈しない", () => {
    const { dialog } = renderChangelog(entries)!;
    const items = [...dialog.querySelectorAll(".cl-item")];
    expect(items.map((el) => el.querySelector(".cl-date")?.textContent)).toEqual(["2026-10-28", "2026-10-01"]);
    expect(items[0]!.querySelector(".cl-type")?.textContent).toBe("修正");
    expect(items[0]!.querySelector(".cl-body")?.textContent).toBe("<b>新しい項目</b>");
    expect(dialog.querySelector(".cl-body b")).toBeNull();
  });

  it("ボタンで開き、閉じるボタンで閉じる", () => {
    const { button, dialog } = renderChangelog(entries)!;
    document.body.replaceChildren(button, dialog);
    expect(button.textContent).toBe("更新履歴");
    button.click();
    expect(dialog.open).toBe(true);
    dialog.querySelector<HTMLButtonElement>(".cl-close")!.click();
    expect(dialog.open).toBe(false);
  });
});

describe("アプリへの組み込み", () => {
  const site = (changelog?: ChangelogEntry[]): SiteData => ({
    generatedAt: new Date().toISOString(),
    teams: [],
    ...(changelog ? { changelog } : {}),
  });
  let stop: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    localStorage.clear();
  });
  afterEach(() => {
    stop?.();
    vi.useRealTimers();
  });

  const start = async (loadData: () => Promise<SiteData>) => {
    const root = document.createElement("div");
    document.body.replaceChildren(root);
    const app = createApp(root, { loadData });
    stop = app.stop;
    await app.ready;
    return root;
  };

  it("ヘッダーにボタンを置く。更新履歴がなければ置かない", async () => {
    const withLog = await start(async () => site(entries));
    expect(withLog.querySelector(".header-meta .changelog-button")).not.toBeNull();
    const without = await start(async () => site());
    expect(without.querySelector(".changelog-button")).toBeNull();
    expect(without.querySelector("dialog.changelog")).toBeNull();
  });

  it("再読み込みで内容が同じなら、開いているモーダルを作り直さない", async () => {
    const loadData = vi.fn(async () => site(entries));
    const root = await start(loadData);
    root.querySelector<HTMLButtonElement>(".changelog-button")!.click();
    const dialog = root.querySelector<HTMLDialogElement>("dialog.changelog")!;
    expect(dialog.open).toBe(true);

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(loadData).toHaveBeenCalledTimes(2);
    expect(root.querySelector("dialog.changelog")).toBe(dialog);
    expect(dialog.open).toBe(true);
  });
});
