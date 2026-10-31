import { describe, expect, it } from "vitest";
import { withChangelog } from "../../src/fetch/preview";
import { DataValidationError } from "../../src/shared/schema";

const production = {
  generatedAt: "2026-10-31T00:00:00.000Z",
  teams: [{ id: "a", name: "チームA", players: [] }],
  changelog: [{ date: "2026-10-28", type: "修正", body: "本番の更新履歴" }],
};

const prChangelog = {
  entries: [
    { date: "2026-10-28", type: "修正", body: "前からある履歴" },
    { date: "2026-10-31", type: "新機能", body: "PR で足した履歴" },
  ],
};

describe("プレビューの更新履歴（AC-11）", () => {
  it("更新履歴を PR の changelog.yaml の内容に差し替え、日付の新しい順に並べる", () => {
    expect(withChangelog(production, prChangelog).changelog).toEqual([
      { date: "2026-10-31", type: "新機能", body: "PR で足した履歴" },
      { date: "2026-10-28", type: "修正", body: "前からある履歴" },
    ]);
  });

  it("更新履歴以外の項目は本番のまま変えない", () => {
    const { changelog: _, ...rest } = withChangelog(production, prChangelog);
    const { changelog: __, ...expected } = production;
    expect(rest).toEqual(expected);
  });

  it("changelog.yaml がなければ更新履歴を出さない", () => {
    expect(withChangelog(production, undefined)).not.toHaveProperty("changelog");
  });

  it("changelog.yaml の形式が違うときは失敗する", () => {
    expect(() => withChangelog(production, { entries: [{ date: "2026/10/31", type: "新機能", body: "x" }] })).toThrow(
      DataValidationError,
    );
  });

  it.each([["配列", []], ["null", null], ["文字列", "x"]])("site-data.json が%sのときは失敗する", (_, input) => {
    expect(() => withChangelog(input, prChangelog)).toThrow("site-data.json");
  });
});
