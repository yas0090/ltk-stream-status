// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SiteData } from "../../src/shared/types";
import { createApp, fetchSiteData, RELOAD_INTERVAL_MS } from "../../src/web/app";

const T0 = new Date("2026-10-25T09:00:00.000Z");

const siteData = (generatedAt: Date, title = "LTK 練習"): SiteData => ({
  generatedAt: generatedAt.toISOString(),
  teams: [
    {
      id: "a",
      name: "チームA",
      color: "#EF6400",
      players: [
        {
          name: "選手1",
          tier: "Next",
          role: "TOP",
          channels: [
            {
              platform: "twitch",
              channelUrl: "https://www.twitch.tv/x",
              state: "live",
              streams: [{ title, url: "https://www.twitch.tv/x", ltk: true }],
            },
          ],
        },
      ],
    },
  ],
});

let stop: (() => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(T0);
  // 絞り込みの条件は保存されるので、テストの間で持ち越さない（AC-44）
  localStorage.clear();
});

afterEach(() => {
  stop?.();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const start = async (loadData: () => Promise<SiteData>) => {
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  const app = createApp(root, { loadData });
  stop = app.stop;
  await app.ready;
  return root;
};

describe("createApp（AC-10）", () => {
  it("読み込んだデータを表示する", async () => {
    const root = await start(async () => siteData(T0));
    expect(root.querySelector(".stream-link")?.textContent).toBe("LTK 練習");
    expect(root.querySelector("time")?.getAttribute("datetime")).toBe(T0.toISOString());
  });

  it("ページ下部に非公式である旨と Riot Games の免責表示を載せる（AC-30）", async () => {
    const root = await start(async () => siteData(T0));
    const footer = root.querySelector("footer")?.textContent ?? "";
    expect(footer).toContain("非公式のファンサイト");
    expect(footer).toContain("Riot Games の承認を受けたものではなく");
  });

  it("ページ下部に訂正・削除の依頼を受ける連絡先（X）を載せる（AC-30）", async () => {
    const root = await start(async () => siteData(T0));
    const link = root.querySelector<HTMLAnchorElement>('footer a[href="https://x.com/yascrim83"]');
    expect(link?.textContent).toBe("@yascrim83");
    expect(link?.target).toBe("_blank");
  });

  it("ページ下部に古い X の ID（yascrime）が残っていない（AC-30）", async () => {
    const root = await start(async () => siteData(T0));
    expect(root.querySelector('footer a[href*="yascrime"]')).toBeNull();
    expect(root.querySelector("footer")?.textContent).not.toContain("yascrime");
  });

  it("5分ごとにデータを読み直す", async () => {
    const loadData = vi.fn(async () => siteData(new Date(), `更新 ${Date.now()}`));
    const root = await start(loadData);

    await vi.advanceTimersByTimeAsync(RELOAD_INTERVAL_MS);
    expect(loadData).toHaveBeenCalledTimes(2);
    expect(root.querySelector(".stream-link")?.textContent).toBe(`更新 ${T0.getTime() + RELOAD_INTERVAL_MS}`);
  });

  it("データが更新されないまま30分たつと警告を出す", async () => {
    const root = await start(async () => siteData(T0));
    expect(root.querySelector(".stale-warning")).toBeNull();

    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(root.querySelector(".stale-warning")).not.toBeNull();
  });

  it("再読み込みに失敗しても前回のデータを表示し続ける", async () => {
    let fail = false;
    const root = await start(async () => {
      if (fail) throw new Error("network");
      return siteData(T0);
    });
    fail = true;
    await vi.advanceTimersByTimeAsync(RELOAD_INTERVAL_MS);

    expect(root.querySelector(".stream-link")?.textContent).toBe("LTK 練習");
    expect(root.querySelector<HTMLElement>(".load-error")?.hidden).toBe(false);
  });

  it("絞り込みの状態は再読み込みしても保たれる", async () => {
    const root = await start(async () => siteData(T0));
    const tier = root.querySelector<HTMLInputElement>('input[name="tier"][value="Core"]')!;
    tier.click();
    expect(root.querySelector(".empty")).not.toBeNull();

    await vi.advanceTimersByTimeAsync(RELOAD_INTERVAL_MS);
    expect(tier.checked).toBe(true);
    expect(root.querySelector(".empty")).not.toBeNull();
  });
});

describe("固定ヘッダー（AC-38）", () => {
  it("サイト名・最終更新日時・テーマの切り替えがヘッダーにある", async () => {
    const root = await start(async () => siteData(T0));
    const header = root.querySelector(".site-header")!;
    expect(header.querySelector(".site-title")?.textContent).toBe("LTK4 Live Now");
    expect(header.querySelector("time")?.getAttribute("datetime")).toBe(T0.toISOString());
    expect(header.querySelector(".theme-toggle")).not.toBeNull();
  });

  it("古いデータの警告はヘッダーの下の帯に出る（AC-10）", async () => {
    const root = await start(async () => siteData(T0));
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(root.querySelector(".site-top .stale-slot .stale-warning")).not.toBeNull();
  });
});

describe("詳細フィルタの組み込み（AC-33〜35）", () => {
  beforeEach(() => localStorage.clear());

  it("詳細フィルタで非表示にした選手は一覧から消え、人数が表示され、保存される", async () => {
    const root = await start(async () => siteData(T0));
    root.querySelector<HTMLButtonElement>(".detail-open")!.click();
    expect(root.querySelector<HTMLDialogElement>("dialog.detail-filter")?.open).toBe(true);

    const box = [...root.querySelectorAll<HTMLLabelElement>(".df-player-toggle")]
      .find((l) => l.textContent?.includes("選手1"))!
      .querySelector("input")!;
    box.click();

    expect(root.querySelector(".player-card")).toBeNull();
    expect(root.querySelector(".hidden-count")?.textContent).toBe("1人を非表示");
    expect(localStorage.getItem("ltk-stream-status:hidden-players:v1")).toBe('["a:選手1"]');
  });

  it("保存済みの設定を読み込んで適用し、簡易絞り込みの「解除」では戻らない", async () => {
    localStorage.setItem("ltk-stream-status:hidden-players:v1", '["a:選手1","a:いない人"]');
    const root = await start(async () => siteData(T0));
    expect(root.querySelector(".player-card")).toBeNull();
    expect(root.querySelector(".hidden-count")?.textContent).toBe("1人を非表示");

    root.querySelector<HTMLButtonElement>("button.reset")!.click();
    expect(root.querySelector(".player-card")).toBeNull();
  });
});

describe("簡易絞り込みの保存（AC-44）", () => {
  it("変更すると保存され、次に開いたときに復元される", async () => {
    const first = await start(async () => siteData(T0));
    first.querySelector<HTMLInputElement>('input[name="tier"][value="Core"]')!.click();
    expect(JSON.parse(localStorage.getItem("ltk-stream-status:filter:v1")!)).toMatchObject({ tiers: ["Core"] });
    stop?.();

    const root = await start(async () => siteData(T0));
    expect(root.querySelector<HTMLInputElement>('input[name="tier"][value="Core"]')!.checked).toBe(true);
    expect(root.querySelector(".empty")).not.toBeNull();
  });

  it("解除すると条件なしが保存される", async () => {
    localStorage.setItem("ltk-stream-status:filter:v1", JSON.stringify({ teams: [], tiers: ["Core"], liveOnly: false, ltkOnly: false }));
    const root = await start(async () => siteData(T0));
    root.querySelector<HTMLButtonElement>("button.reset")!.click();
    expect(root.querySelector(".player-card")).not.toBeNull();
    expect(JSON.parse(localStorage.getItem("ltk-stream-status:filter:v1")!)).toEqual({
      teams: [],
      tiers: [],
      liveOnly: false,
      ltkOnly: false,
    });
  });
});

describe("本戦の案内（AC-46, AC-48, AC-49）", () => {
  const withSchedule = (): SiteData => ({
    ...siteData(T0),
    schedule: {
      matches: [
        {
          stage: "Regular Stage",
          day: "DAY 4",
          startAt: "2026-10-27T09:00:00.000Z",
          endAt: "2026-10-27T14:00:00.000Z",
          games: [{ blue: "a", red: "a", tiers: ["Core"] }],
        },
      ],
      official: {
        twitch: { platform: "twitch", channelUrl: "https://www.twitch.tv/lolthek4sen", state: "offline", streams: [] },
        youtube: { platform: "youtube", channelUrl: "https://www.youtube.com/channel/x", state: "offline", streams: [] },
      },
    },
  });

  it("絞り込みの上に出し、データの更新を待たずに端末の時刻で当日の案内に切り替える", async () => {
    vi.setSystemTime(new Date("2026-10-27T15:59:00+09:00"));
    const root = await start(async () => withSchedule());
    const notice = () => root.querySelector(".notice-slot .match-notice");
    expect(notice()?.classList.contains("match-notice--next")).toBe(true);
    expect(root.querySelector(".notice-slot + .filters-slot")).not.toBeNull();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(notice()?.classList.contains("match-notice--today")).toBe(true);
  });

  it("日程がなければ何も出さない", async () => {
    const root = await start(async () => siteData(T0));
    expect(root.querySelector(".notice-slot")?.childElementCount).toBe(0);
  });
});

describe("fetchSiteData", () => {
  it("キャッシュを避けるためタイムスタンプ付きで読み込む", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(siteData(T0))));
    vi.stubGlobal("fetch", fetchMock);
    await fetchSiteData();
    expect(fetchMock).toHaveBeenCalledWith(`./site-data.json?t=${T0.getTime()}`, { cache: "no-store" });
  });
});
