import { describe, expect, it } from "vitest";
import { EMPTY_FILTER } from "../../src/shared/filter";
import {
  FILTER_KEY,
  HIDDEN_PLAYERS_KEY,
  loadFilter,
  loadHiddenPlayers,
  readItem,
  saveFilter,
  saveHiddenPlayers,
  writeItem,
} from "../../src/web/storage";

const memoryStorage = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  };
};

const throwingStorage = {
  getItem: (): string | null => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

describe("詳細フィルタの保存と読み込み（AC-34, AC-36）", () => {
  it("保存して読み込むと元に戻る", () => {
    const storage = memoryStorage();
    saveHiddenPlayers(new Set(["b:x", "a:y"]), storage);
    expect(storage.data.get(HIDDEN_PLAYERS_KEY)).toBe('["a:y","b:x"]');
    expect([...loadHiddenPlayers(storage)].sort()).toEqual(["a:y", "b:x"]);
  });

  it("何も保存されていなければ空", () => {
    expect(loadHiddenPlayers(memoryStorage()).size).toBe(0);
  });

  it.each(["not json", '{"a":1}', "[1,2]", '"a:x"', "null"])("形式が違う値（%s）は空として扱う", (value) => {
    expect(loadHiddenPlayers(memoryStorage({ [HIDDEN_PLAYERS_KEY]: value })).size).toBe(0);
  });

  it("保存領域が例外を投げても、例外を外に出さない（AC-36）", () => {
    expect(loadHiddenPlayers(throwingStorage).size).toBe(0);
    expect(() => saveHiddenPlayers(new Set(["a:x"]), throwingStorage)).not.toThrow();
    expect(readItem("k", throwingStorage)).toBeNull();
    expect(() => writeItem("k", "v", throwingStorage)).not.toThrow();
  });

  it("保存領域がない環境でも動く", () => {
    expect(readItem("k", undefined)).toBeNull();
    expect(() => writeItem("k", "v", undefined)).not.toThrow();
  });
});

describe("簡易絞り込みの保存と読み込み（AC-44）", () => {
  const teamIds = ["a", "b"];

  it("保存して読み込むと元に戻る", () => {
    const storage = memoryStorage();
    const filter = { teams: ["b"], tiers: ["Masters" as const], liveOnly: true, ltkOnly: false };
    saveFilter(filter, storage);
    expect(storage.data.has(FILTER_KEY)).toBe(true);
    expect(loadFilter(teamIds, storage)).toEqual(filter);
  });

  it("何も保存されていなければ条件なし", () => {
    expect(loadFilter(teamIds, memoryStorage())).toEqual(EMPTY_FILTER);
  });

  it.each(["not json", "null", "[1]", '"a"'])("形式が違う値（%s）は条件なしとして扱う", (value) => {
    expect(loadFilter(teamIds, memoryStorage({ [FILTER_KEY]: value }))).toEqual(EMPTY_FILTER);
  });

  it("今のデータにないチームと定義外の階級は捨て、形式が違う項目は未選択にする", () => {
    const value = JSON.stringify({ teams: ["a", "gone"], tiers: ["Core", "Bronze"], liveOnly: "yes", ltkOnly: true });
    expect(loadFilter(teamIds, memoryStorage({ [FILTER_KEY]: value }))).toEqual({
      teams: ["a"],
      tiers: ["Core"],
      liveOnly: false,
      ltkOnly: true,
    });
    expect(loadFilter(teamIds, memoryStorage({ [FILTER_KEY]: '{"teams":"a","tiers":[1]}' }))).toEqual(EMPTY_FILTER);
  });

  it("保存領域が例外を投げても、例外を外に出さない", () => {
    expect(loadFilter(teamIds, throwingStorage)).toEqual(EMPTY_FILTER);
    expect(() => saveFilter(EMPTY_FILTER, throwingStorage)).not.toThrow();
  });
});
