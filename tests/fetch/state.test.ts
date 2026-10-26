import { describe, expect, it, vi } from "vitest";
import {
  initialState,
  jstHour,
  loadState,
  minutesSince,
  pacificDate,
  parseState,
  withCurrentQuotaDay,
} from "../../src/fetch/state";
import type { FetchFn } from "../../src/fetch/types";

// 2026-10-26 10:00 JST = 2026-10-26 01:00 UTC = 2026-10-25 18:00 PDT
const NOW = new Date("2026-10-26T01:00:00Z");

describe("state.json（AC-43）", () => {
  it("太平洋時間の日付と日本時間の時を求める", () => {
    expect(pacificDate(NOW)).toBe("2026-10-25");
    expect(jstHour(NOW)).toBe(10);
    expect(jstHour(new Date("2026-10-26T15:30:00Z"))).toBe(0);
  });

  it("初期状態は使用量 0、前回の配信なし", () => {
    expect(initialState(NOW)).toEqual({
      version: 1,
      quota: { day: "2026-10-25", used: 0, exceeded: false },
      youtubeLive: {},
      youtubeErrors: [],
      avatars: {},
    });
  });

  it("形式が違えば初期状態にする", () => {
    expect(parseState({ version: 2 }, NOW)).toEqual(initialState(NOW));
    expect(parseState(null, NOW)).toEqual(initialState(NOW));
    const valid = { ...initialState(NOW), youtubeLive: { UCx: ["v1"] } };
    expect(parseState(valid, NOW)).toEqual(valid);
  });

  it("太平洋時間の日付が変わったら使用量を 0 に戻す", () => {
    const state = { ...initialState(NOW), quota: { day: "2026-10-24", used: 5000, exceeded: true } };
    expect(withCurrentQuotaDay(state, NOW).quota).toEqual({ day: "2026-10-25", used: 0, exceeded: false });
    const today = { ...initialState(NOW), quota: { day: "2026-10-25", used: 5000, exceeded: false } };
    expect(withCurrentQuotaDay(today, NOW).quota.used).toBe(5000);
  });

  it("経過時間（分）を求める。記録がなければ無限大", () => {
    expect(minutesSince("2026-10-26T00:50:00Z", NOW)).toBe(10);
    expect(minutesSince(undefined, NOW)).toBe(Infinity);
    expect(minutesSince("invalid", NOW)).toBe(Infinity);
  });

  it("公開サイトから読み込む", async () => {
    const saved = { ...initialState(NOW), avatars: { "twitch:a": "https://img/a.png" } };
    const fetchFn = vi.fn<FetchFn>(async () => new Response(JSON.stringify(saved)));
    expect(await loadState("https://example.pages.dev", NOW, fetchFn)).toEqual(saved);
    expect(String(fetchFn.mock.calls[0]![0])).toBe(`https://example.pages.dev/state.json?t=${NOW.getTime()}`);
  });

  it("読めないとき・URL がないときは初期状態にする", async () => {
    const failing = vi.fn<FetchFn>(async () => new Response("", { status: 404 }));
    expect(await loadState("https://example.pages.dev/", NOW, failing)).toEqual(initialState(NOW));
    expect(await loadState(undefined, NOW, failing)).toEqual(initialState(NOW));
    const throwing = vi.fn<FetchFn>(async () => {
      throw new TypeError("network");
    });
    expect(await loadState("https://example.pages.dev", NOW, throwing)).toEqual(initialState(NOW));
  });
});
