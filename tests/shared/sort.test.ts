import { describe, expect, it } from "vitest";
import { groupByTier } from "../../src/shared/sort";
import type { Role, Tier } from "../../src/shared/types";

const p = (tier: Tier, role: Role) => ({ name: `${tier}-${role}`, tier, role });

describe("groupByTier（AC-3, AC-4）", () => {
  it("階級を Masters → Core → Next の順に分ける", () => {
    const groups = groupByTier([p("Next", "TOP"), p("Masters", "TOP"), p("Core", "TOP")]);
    expect(groups.map((g) => g.tier)).toEqual(["Masters", "Core", "Next"]);
  });

  it("階級内をロール順（TOP → JG → MID → ADC → SUP）に並べる", () => {
    const groups = groupByTier([
      p("Next", "SUP"),
      p("Next", "MID"),
      p("Next", "TOP"),
      p("Next", "ADC"),
      p("Next", "JG"),
    ]);
    expect(groups[0]?.players.map((x) => x.role)).toEqual(["TOP", "JG", "MID", "ADC", "SUP"]);
  });

  it("出場者がいない階級は含めない", () => {
    const groups = groupByTier([p("Core", "JG")]);
    expect(groups).toEqual([{ tier: "Core", players: [p("Core", "JG")] }]);
  });

  it("元の配列を変更しない", () => {
    const players = [p("Next", "SUP"), p("Next", "TOP")];
    groupByTier(players);
    expect(players.map((x) => x.role)).toEqual(["SUP", "TOP"]);
  });

  it("15人を正しく並べる", () => {
    const tiers: Tier[] = ["Next", "Core", "Masters"];
    const roles: Role[] = ["SUP", "ADC", "MID", "JG", "TOP"];
    const players = tiers.flatMap((t) => roles.map((r) => p(t, r)));
    const names = groupByTier(players).flatMap((g) => g.players.map((x) => x.name));
    expect(names.slice(0, 5)).toEqual(["Masters-TOP", "Masters-JG", "Masters-MID", "Masters-ADC", "Masters-SUP"]);
    expect(names.at(-1)).toBe("Next-SUP");
    expect(names).toHaveLength(15);
  });
});
