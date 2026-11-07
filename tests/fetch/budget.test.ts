import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { avatarsDue, fallbackAllowance, parseBudget, planYouTube } from "../../src/fetch/budget";
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

const base = { limit: 9000, reservePerRun: 10, runIntervalMinutes: 5, peakHours: { start: 16, end: 3 }, peakDiscoveryMinutes: 5 };

describe("data/youtube-budget.yaml", () => {
  it("同梱の設定は正しい", () => {
    expect(budget.limit).toBe(9000);
    expect(budget.tiers.map((t) => t.upTo)).toEqual([5000, 7000, 8000, 9000]);
  });

  it("upTo が小さい順でないか、limit を超えるとエラー", () => {
    const tiers = [
      { upTo: 5000, discoveryMinutes: 5 },
      { upTo: 3000, discoveryMinutes: 10 },
    ];
    expect(() => parseBudget({ ...base, tiers })).toThrow(DataValidationError);
    expect(() => parseBudget({ ...base, limit: 4000, tiers: [tiers[0]] })).toThrow(/limit/);
  });

  it("fallbackMinutes が残っていたり、reservePerRun・runIntervalMinutes が不正だとエラー", () => {
    const tiers = [{ upTo: 5000, discoveryMinutes: 5 }];
    expect(parseBudget({ ...base, tiers }).reservePerRun).toBe(10);
    expect(() => parseBudget({ ...base, tiers: [{ ...tiers[0], fallbackMinutes: 5 }] })).toThrow(DataValidationError);
    expect(() => parseBudget({ ...base, tiers, reservePerRun: -1 })).toThrow(DataValidationError);
    expect(() => parseBudget({ ...base, tiers, runIntervalMinutes: 0 })).toThrow(DataValidationError);
  });
});

describe("planYouTube（AC-21, AC-43）", () => {
  it("朝・昼は使用量の段階ごとに間隔が広がる", () => {
    const cases: [number, number][] = [
      [0, 5],
      [5000, 10],
      [7000, 15],
      [8000, 30],
    ];
    for (const [used, interval] of cases) {
      expect(planYouTube(state(DAY, used, { lastDiscoveryAt: ago(DAY, interval - 1) }), budget, DAY).discover).toBe(true);
      expect(planYouTube(state(DAY, used, { lastDiscoveryAt: ago(DAY, interval - 2) }), budget, DAY).discover).toBe(false);
    }
  });

  it("夜は使用量が多くても 5 分ごと", () => {
    expect(planYouTube(state(NIGHT, 8500, { lastDiscoveryAt: ago(NIGHT, 5) }), budget, NIGHT).discover).toBe(true);
  });

  it("取り直しの枠は、確認する回に残りの使用量と実行回数から決まる", () => {
    // DAY = 太平洋時間 2026-10-25 18:00 → 残り 6 時間 = 72 回、(9000 - 0 - 720) ÷ 72 = 115
    expect(planYouTube(state(DAY, 0), budget, DAY)).toMatchObject({ discover: true, fallbackLimit: 115 });
    // 確認しない回は枠 0
    const recent = { lastDiscoveryAt: ago(DAY, 1) };
    expect(planYouTube(state(DAY, 0, recent), budget, DAY)).toMatchObject({ discover: false, fallbackLimit: 0 });
  });

  it("上限（9,000）以上、またはクォータ超過の応答を受けたら止める", () => {
    expect(planYouTube(state(NIGHT, 9000), budget, NIGHT)).toMatchObject({ discover: false, fallbackLimit: 0 });
    const exceeded = { ...state(NIGHT, 100), quota: { day: "2026-10-26", used: 100, exceeded: true } };
    expect(planYouTube(exceeded, budget, NIGHT)).toMatchObject({ discover: false, fallbackLimit: 0 });
  });

  it("前回の確認の記録がなければ確認する", () => {
    expect(planYouTube(state(DAY, 0), budget, DAY).discover).toBe(true);
  });
});

describe("fallbackAllowance（AC-40）", () => {
  // 2026-11-07 23:00 UTC = 太平洋時間 15:00（冬時間）。リセットまで 9 時間 = 108 回
  const WINTER = new Date("2026-11-07T23:00:00Z");

  it("Issue の試算: 使用量 1,800・残り 108 回・予約 10 → 56", () => {
    expect(fallbackAllowance(1800, budget, WINTER)).toBe(56);
  });

  it("残りの使用量が予約分に足りなければ枠 0（負にならない）", () => {
    expect(fallbackAllowance(8000, budget, WINTER)).toBe(0);
    expect(fallbackAllowance(9000, budget, WINTER)).toBe(0);
    expect(fallbackAllowance(12000, budget, WINTER)).toBe(0);
  });

  it("リセット直前は残り 1 回として計算し、0 で割らない", () => {
    expect(fallbackAllowance(1000, budget, new Date("2026-11-08T07:59:30Z"))).toBe(7990);
  });

  it("日付が変わった直後は 1 日分（288 回）で割る", () => {
    // (9000 - 0 - 2880) ÷ 288 = 21.25
    expect(fallbackAllowance(0, budget, new Date("2026-11-08T08:00:00Z"))).toBe(21);
  });

  it("夏時間の切り替え日は 23 時間（276 回）・25 時間（300 回）で割る", () => {
    // (9000 - 2760) ÷ 276 = 22.6、(9000 - 3000) ÷ 300 = 20
    expect(fallbackAllowance(0, budget, new Date("2026-03-08T08:00:00Z"))).toBe(22);
    expect(fallbackAllowance(0, budget, new Date("2026-11-01T07:00:00Z"))).toBe(20);
  });
});

describe("avatarsDue（節約 B）", () => {
  it("1 時間に 1 回だけ取り直す", () => {
    expect(avatarsDue(state(DAY, 0), DAY)).toBe(true);
    expect(avatarsDue(state(DAY, 0, { avatarsFetchedAt: ago(DAY, 30) }), DAY)).toBe(false);
    expect(avatarsDue(state(DAY, 0, { avatarsFetchedAt: ago(DAY, 59) }), DAY)).toBe(true);
  });
});
