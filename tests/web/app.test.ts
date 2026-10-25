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

describe("fetchSiteData", () => {
  it("キャッシュを避けるためタイムスタンプ付きで読み込む", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(siteData(T0))));
    vi.stubGlobal("fetch", fetchMock);
    await fetchSiteData();
    expect(fetchMock).toHaveBeenCalledWith(`./site-data.json?t=${T0.getTime()}`, { cache: "no-store" });
  });
});
