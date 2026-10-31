import { describe, expect, it } from "vitest";
import { sortChangelog } from "../../src/shared/changelog";
import { DataValidationError, parseChangelogData } from "../../src/shared/schema";
import type { ChangelogEntry } from "../../src/shared/types";

const entry: ChangelogEntry = { date: "2026-10-28", type: "修正", body: "直しました。" };

describe("更新履歴の検証（AC-56, AC-57）", () => {
  it("正しい内容は通る", () => {
    expect(parseChangelogData({ entries: [entry] }).entries).toEqual([entry]);
    expect(parseChangelogData({ entries: [] }).entries).toEqual([]);
  });

  it.each([
    ["日付の形式が違う", { ...entry, date: "2026/10/28" }],
    ["実在しない日付", { ...entry, date: "2026-02-30" }],
    ["種類が定義にない", { ...entry, type: "その他" }],
    ["本文が空", { ...entry, body: "  " }],
    ["定義外のキー", { ...entry, extra: 1 }],
  ])("%s ときはエラー", (_, bad) => {
    expect(() => parseChangelogData({ entries: [bad] })).toThrow(DataValidationError);
  });
});

describe("更新履歴の並べ替え（AC-59）", () => {
  it("新しい順に並べ、同じ日付はファイルの順にする", () => {
    const a = { ...entry, date: "2026-10-01", body: "a" };
    const b = { ...entry, date: "2026-10-30", body: "b" };
    const c = { ...entry, date: "2026-10-30", body: "c" };
    expect(sortChangelog([a, b, c]).map((e) => e.body)).toEqual(["b", "c", "a"]);
  });
});
