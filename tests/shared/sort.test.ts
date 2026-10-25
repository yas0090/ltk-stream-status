import { describe, expect, it } from "vitest";
import { groupByTier } from "../../src/shared/sort";
import type { Role, Tier } from "../../src/shared/types";

const p = (tier: Tier, role: Role) => ({ name: `${tier}-${role}`, tier, role });

describe("groupByTier（AC-3, AC-4）", () => {
  it("階級を Next → Core → Masters の順に分ける", () => {
    const groups = groupByTier([p("Masters", "TOP"), p("Next", "TOP"), p("Core", "TOP")]);
    expect(groups.map((g) => g.tier)).toEqual(["Next", "Core", "Masters"]);
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
    const tiers: Tier[] = ["Masters", "Core", "Next"];
    const roles: Role[] = ["SUP", "ADC", "MID", "JG", "TOP"];
    const players = tiers.flatMap((t) => roles.map((r) => p(t, r)));
    const names = groupByTier(players).flatMap((g) => g.players.map((x) => x.name));
    expect(names.slice(0, 5)).toEqual(["Next-TOP", "Next-JG", "Next-MID", "Next-ADC", "Next-SUP"]);
    expect(names.at(-1)).toBe("Masters-SUP");
    expect(names).toHaveLength(15);
  });
});
