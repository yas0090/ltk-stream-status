import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { avatarsDue, parseBudget, planYouTube } from "../../src/fetch/budget";
import { initialState, type FetchState } from "../../src/fetch/state";
import { DataValidationError } from "../../src/shared/schema";

const budget = parseBudget(parse(readFileSync("data/youtube-budget.yaml", "utf8")));

// 朝・昼: 10:00 JST、夜: 20:00 JST
const DAY = new Date("2026-10-26T01:00:00Z");
const NIGHT = new Date("2026-10-26T11:00:00Z");
const ago = (now: Date, minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();

const state = (now: Date, used: number, overrides: Partial<FetchState> = {}): FetchState => {
  const base = initialState(now);
  return { ...base, quota: { ...base.quota, used }, ...overrides };
};

describe("data/youtube-budget.yaml", () => {
  it("同梱の設定は正しい", () => {
    expect(budget.limit).toBe(9000);
    expect(budget.tiers.map((t) => t.upTo)).toEqual([3000, 5000, 7000, 8000, 9000]);
  });

  it("upTo が小さい順でないか、limit を超えるとエラー", () => {
    const tiers = [
      { upTo: 5000, discoveryMinutes: 5, fallbackMinutes: 5 },
      { upTo: 3000, discoveryMinutes: 10, fallbackMinutes: null },
    ];
    const base = { limit: 9000, peakHours: { start: 16, end: 3 }, peakDiscoveryMinutes: 5 };
    expect(() => parseBudget({ ...base, tiers })).toThrow(DataValidationError);
    expect(() => parseBudget({ ...base, limit: 4000, tiers: [tiers[0]] })).toThrow(/limit/);
  });
});

describe("planYouTube（AC-21, AC-43）", () => {
  it("朝・昼は使用量の段階ごとに間隔が広がる", () => {
    const cases: [number, number][] = [
      [0, 5],
      [3000, 10],
      [5000, 15],
      [7000, 30],
      [8000, 60],
    ];
    for (const [used, interval] of cases) {
      expect(planYouTube(state(DAY, used, { lastDiscoveryAt: ago(DAY, interval - 1) }), budget, DAY).discover).toBe(true);
      expect(planYouTube(state(DAY, used, { lastDiscoveryAt: ago(DAY, interval - 2) }), budget, DAY).discover).toBe(false);
    }
  });

  it("夜は使用量が多くても 5 分ごと", () => {
    expect(planYouTube(state(NIGHT, 8500, { lastDiscoveryAt: ago(NIGHT, 5) }), budget, NIGHT).discover).toBe(true);
  });

  it("取り直しは段階の間隔ごと。8,000 を超えたら取り直さない", () => {
    expect(planYouTube(state(DAY, 0), budget, DAY)).toMatchObject({ discover: true, fallback: true });
    const recent = { lastFallbackAt: ago(DAY, 10) };
    expect(planYouTube(state(DAY, 7500, recent), budget, DAY)).toMatchObject({ discover: true, fallback: false });
    expect(planYouTube(state(DAY, 7500, { lastFallbackAt: ago(DAY, 30) }), budget, DAY).fallback).toBe(true);
    expect(planYouTube(state(DAY, 8500), budget, DAY)).toMatchObject({ discover: true, fallback: false });
  });

  it("上限（9,000）以上、またはクォータ超過の応答を受けたら止める", () => {
    expect(planYouTube(state(NIGHT, 9000), budget, NIGHT)).toMatchObject({ discover: false, fallback: false });
    const exceeded = { ...state(NIGHT, 100), quota: { day: "2026-10-26", used: 100, exceeded: true } };
    expect(planYouTube(exceeded, budget, NIGHT)).toMatchObject({ discover: false, fallback: false });
  });

  it("前回の確認の記録がなければ確認する", () => {
    expect(planYouTube(state(DAY, 0), budget, DAY).discover).toBe(true);
  });
});

describe("avatarsDue（節約 B）", () => {
  it("1 時間に 1 回だけ取り直す", () => {
    expect(avatarsDue(state(DAY, 0), DAY)).toBe(true);
    expect(avatarsDue(state(DAY, 0, { avatarsFetchedAt: ago(DAY, 30) }), DAY)).toBe(false);
    expect(avatarsDue(state(DAY, 0, { avatarsFetchedAt: ago(DAY, 59) }), DAY)).toBe(true);
  });
});
