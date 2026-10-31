// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { favoritePlayers } from "../../src/shared/favorites";
import { buildView, EMPTY_FILTER } from "../../src/shared/filter";
import type { ChannelStatus, SiteData, TeamStatus } from "../../src/shared/types";
import { createApp, RELOAD_INTERVAL_MS } from "../../src/web/app";
import { renderFavorites, renderTeams } from "../../src/web/render";

const T0 = new Date("2026-10-25T09:00:00.000Z");

const offlineChannel: ChannelStatus = { platform: "twitch", channelUrl: "https://www.twitch.tv/x", state: "offline", streams: [] };

const teams: TeamStatus[] = [
  {
    id: "a",
    name: "チームA",
    color: "#EF6400",
    players: [
      { name: "選手1", tier: "Next", role: "TOP", channels: [offlineChannel] },
      { name: "選手2", tier: "Core", role: "MID", channels: [offlineChannel] },
    ],
  },
  { id: "b", name: "チームB", color: "#D10015", players: [{ name: "B の人", tier: "Masters", role: "JG", channels: [offlineChannel] }] },
];

const siteData = (): SiteData => ({ generatedAt: T0.toISOString(), teams });

const KEY = "ltk-stream-status:favorites:v1";

describe("星ボタンとお気に入り欄の描画（AC-64〜70）", () => {
  const noop = () => {};
  const button = (root: HTMLElement, name: string) =>
    [...root.querySelectorAll<HTMLElement>(".player-card")]
      .find((el) => el.querySelector(".player-name")?.textContent === name)!
      .querySelector<HTMLButtonElement>(".fav-btn")!;

  it("操作の指定がなければ星ボタンを出さない", () => {
    expect(renderTeams(buildView(teams, EMPTY_FILTER)).querySelector(".fav-btn")).toBeNull();
  });

  it("選手カードに星のボタンがあり、aria-pressed で状態を伝える（AC-64, AC-66）", () => {
    const root = renderTeams(buildView(teams, EMPTY_FILTER), { favorites: ["a:選手1"], onToggle: noop });
    expect(root.querySelectorAll(".fav-btn")).toHaveLength(3);
    expect(button(root, "選手1").getAttribute("aria-pressed")).toBe("true");
    expect(button(root, "選手2").getAttribute("aria-pressed")).toBe("false");
    expect(button(root, "選手1").getAttribute("aria-label")).toBe("選手1 のお気に入り");
    expect(button(root, "選手1").type).toBe("button");
  });

  it("押すとキーを渡して切り替えを依頼する（AC-65）", () => {
    const keys: string[] = [];
    const root = renderTeams(buildView(teams, EMPTY_FILTER), { favorites: [], onToggle: (key) => keys.push(key) });
    button(root, "B の人").click();
    expect(keys).toEqual(["b:B の人"]);
  });

  it("お気に入りが 0 人なら欄を作らない（AC-67）", () => {
    expect(renderFavorites([], { favorites: [], onToggle: noop })).toBeNull();
  });

  it("欄は登録順に並び、その選手のチームカラーで出す（AC-68, AC-69）", () => {
    const favorites = ["b:B の人", "a:選手2"];
    const section = renderFavorites(favoritePlayers(favorites, teams), { favorites, onToggle: noop })!;
    expect(section.querySelector("h2")?.textContent).toBe("FAVORITES");
    expect([...section.querySelectorAll(".player-name")].map((el) => el.textContent)).toEqual(["B の人", "選手2"]);
    expect([...section.querySelectorAll(".fav-item")].map((el) => el.getAttribute("style"))).toEqual([
      "--team-color: #D10015",
      "--team-color: #EF6400",
    ]);
    for (const card of section.querySelectorAll(".player-card")) {
      for (const part of [".thumb", ".card-head", ".platforms", ".stream-line"]) expect(card.querySelector(part)).not.toBeNull();
    }
    expect(section.querySelectorAll('.fav-btn[aria-pressed="true"]')).toHaveLength(2);
  });

  it("配信していない選手も欄に出る（AC-70）", () => {
    const favorites = ["a:選手1"];
    const section = renderFavorites(favoritePlayers(favorites, teams), { favorites, onToggle: noop })!;
    expect(section.querySelector(".player-card")?.getAttribute("data-live")).toBe("false");
  });
});

describe("お気に入りの組み込み（AC-67〜76）", () => {
  let stop: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(T0);
    localStorage.clear();
  });

  afterEach(() => {
    stop?.();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const start = async () => {
    const root = document.createElement("div");
    document.body.replaceChildren(root);
    const app = createApp(root, { loadData: async () => siteData() });
    stop = app.stop;
    await app.ready;
    return root;
  };
  const listButton = (root: HTMLElement, key: string) =>
    [...root.querySelectorAll<HTMLButtonElement>(".list-slot .fav-btn")].find((b) => b.dataset.key === key)!;
  const favButton = (root: HTMLElement, key: string) =>
    [...root.querySelectorAll<HTMLButtonElement>(".favorites .fav-btn")].find((b) => b.dataset.key === key)!;
  const favNames = (root: HTMLElement) => [...root.querySelectorAll(".favorites .player-name")].map((el) => el.textContent);

  it("お気に入りが 0 人なら欄を出さない（AC-67）", async () => {
    const root = await start();
    expect(root.querySelector(".favorites")).toBeNull();
  });

  it("一覧の星で登録すると、フィルタの上に欄が出て、一覧にも残る（AC-67, AC-71）", async () => {
    const root = await start();
    listButton(root, "a:選手1").click();
    expect(root.querySelector(".favorites-slot .favorites")).not.toBeNull();
    expect(root.querySelector(".favorites-slot + .filters-slot + .list-slot")).not.toBeNull();
    expect(favNames(root)).toEqual(["選手1"]);
    expect(listButton(root, "a:選手1").getAttribute("aria-pressed")).toBe("true");
    expect(root.querySelectorAll(".list-slot .player-card")).toHaveLength(3);
  });

  it("欄のボタンで解除すると、欄も一覧も揃う（AC-72）", async () => {
    const root = await start();
    listButton(root, "a:選手1").click();
    favButton(root, "a:選手1").click();
    expect(root.querySelector(".favorites")).toBeNull();
    expect(listButton(root, "a:選手1").getAttribute("aria-pressed")).toBe("false");
  });

  it("登録順に並ぶ（AC-68）", async () => {
    const root = await start();
    listButton(root, "a:選手2").click();
    listButton(root, "a:選手1").click();
    expect(favNames(root)).toEqual(["選手2", "選手1"]);
  });

  it("簡易絞り込みで一覧から消えても、欄には残る（AC-70）", async () => {
    const root = await start();
    listButton(root, "a:選手1").click();
    root.querySelector<HTMLInputElement>('input[name="tier"][value="Core"]')!.click();
    expect(root.querySelectorAll(".list-slot .player-card")).toHaveLength(1);
    expect(favNames(root)).toEqual(["選手1"]);
  });

  it("押した後、同じ選手のボタンにフォーカスが戻る。欄から外れたときは一覧側へ戻る", async () => {
    const root = await start();
    listButton(root, "a:選手1").click();
    expect(document.activeElement).toBe(favButton(root, "a:選手1"));
    favButton(root, "a:選手1").click();
    expect(document.activeElement).toBe(listButton(root, "a:選手1"));
  });

  it("ページを開き直しても残る（AC-73）", async () => {
    const first = await start();
    listButton(first, "a:選手2").click();
    expect(localStorage.getItem(KEY)).toBe('["a:選手2"]');
    stop?.();
    const root = await start();
    expect(favNames(root)).toEqual(["選手2"]);
  });

  it("5 分ごとの再読み込みでも欄を保つ", async () => {
    const root = await start();
    listButton(root, "a:選手1").click();
    await vi.advanceTimersByTimeAsync(RELOAD_INTERVAL_MS);
    expect(favNames(root)).toEqual(["選手1"]);
  });

  it("保存された値の形式が違うときは空として扱う（AC-75）", async () => {
    localStorage.setItem(KEY, '{"a":1}');
    const root = await start();
    expect(root.querySelector(".favorites")).toBeNull();
  });

  it("今のデータにいない選手は表示せず、保存からも取り除く（AC-76）", async () => {
    localStorage.setItem(KEY, JSON.stringify(["a:いない人", "a:選手2"]));
    const root = await start();
    expect(favNames(root)).toEqual(["選手2"]);
    expect(localStorage.getItem(KEY)).toBe('["a:選手2"]');
  });

  it("保存領域が使えなくても、その場では切り替えられる（AC-74）", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const root = await start();
    listButton(root, "a:選手1").click();
    expect(favNames(root)).toEqual(["選手1"]);
  });
});
