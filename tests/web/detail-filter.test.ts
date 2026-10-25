// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import type { Role, TeamStatus, Tier } from "../../src/shared/types";
import { renderDetailFilter } from "../../src/web/detail-filter";

const p = (name: string, tier: Tier, role: Role) => ({ name, tier, role, channels: [] });
const teams: TeamStatus[] = [
  {
    id: "a",
    name: "チームA",
    color: "#EF6400",
    players: [p("a-next", "Next", "TOP"), p("a-m-jg", "Masters", "JG"), p("a-m-top", "Masters", "TOP")],
  },
  { id: "b", name: "チームB", color: "#D10015", players: [p("b1", "Core", "SUP")] },
];

const setup = (hidden: string[] = []) => {
  const onChange = vi.fn<(hidden: Set<string>) => void>();
  const filter = renderDetailFilter(teams, new Set(hidden), onChange);
  document.body.replaceChildren(filter.dialog);
  const box = (label: string) =>
    [...filter.dialog.querySelectorAll("label")]
      .find((l) => l.querySelector(".df-label")?.textContent === label)!
      .querySelector("input")!;
  return { ...filter, onChange, box };
};

describe("詳細フィルタのモーダル（AC-31, AC-32, AC-35）", () => {
  it("チーム → 階級（Masters から）→ 選手（ロール順）の階層で並ぶ", () => {
    const { dialog } = setup();
    const team = dialog.querySelector(".df-team")!;
    expect(team.querySelector(".df-team-toggle")?.textContent).toBe("チームA");
    expect([...team.querySelectorAll(".df-tier-toggle")].map((el) => el.textContent)).toEqual(["Masters", "Next"]);
    expect([...team.querySelectorAll(".df-player-toggle .df-label")].map((el) => el.textContent)).toEqual([
      "a-m-top",
      "a-m-jg",
      "a-next",
    ]);
  });

  it("保存済みの非表示の選手を反映し、一部だけ非表示の親は「一部選択」になる（AC-32）", () => {
    const { box } = setup(["a:a-m-jg"]);
    expect(box("a-m-jg").checked).toBe(false);
    expect(box("a-m-top").checked).toBe(true);
    expect(box("Masters").indeterminate).toBe(true);
    expect(box("チームA").indeterminate).toBe(true);
    expect(box("Next").checked).toBe(true);
    expect(box("チームB").checked).toBe(true);
  });

  it("選手のチェックを外すと非表示になり、すぐに通知される", () => {
    const { box, onChange } = setup();
    box("b1").click();
    expect([...onChange.mock.lastCall![0]]).toEqual(["b:b1"]);
    expect(box("チームB").checked).toBe(false);
    expect(box("チームB").indeterminate).toBe(false);
  });

  it("チームや階級を切り替えると配下がまとめて切り替わる（AC-32）", () => {
    const { box, onChange } = setup();
    box("チームA").click();
    expect([...onChange.mock.lastCall![0]].sort()).toEqual(["a:a-m-jg", "a:a-m-top", "a:a-next"]);
    expect(box("a-next").checked).toBe(false);

    box("Masters").click();
    expect([...onChange.mock.lastCall![0]]).toEqual(["a:a-next"]);
    expect(box("チームA").indeterminate).toBe(true);
  });

  it("「すべて表示」で全員を表示に戻す（AC-35）", () => {
    const { dialog, box, onChange } = setup(["a:a-next", "b:b1"]);
    dialog.querySelector<HTMLButtonElement>(".df-show-all")!.click();
    expect(onChange.mock.lastCall![0].size).toBe(0);
    expect(box("チームB").checked).toBe(true);
  });

  it("開いて、「閉じる」で閉じられる", () => {
    const { dialog, open } = setup();
    open();
    expect(dialog.open).toBe(true);
    dialog.querySelector<HTMLButtonElement>(".df-close")!.click();
    expect(dialog.open).toBe(false);
  });
});
