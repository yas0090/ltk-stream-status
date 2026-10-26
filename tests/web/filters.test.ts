// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { EMPTY_FILTER, type Filter } from "../../src/shared/filter";
import { renderFilters } from "../../src/web/filters";

const setup = (initial?: Filter) => {
  const onChange = vi.fn<(filter: Filter) => void>();
  const form = renderFilters(
    [
      { id: "a", name: "チームA", color: "#EF6400" },
      { id: "b", name: "チームB", color: "#D10015" },
    ],
    onChange,
    undefined,
    initial,
  );
  document.body.replaceChildren(form);
  const input = (name: string, value: string) =>
    form.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`)!;
  const toggle = (name: string, value: string) => input(name, value).click();
  return { form, onChange, toggle, input };
};

describe("renderFilters（AC-15〜19）", () => {
  it("チーム・階級・配信中・LTK の選択肢がある", () => {
    const { form } = setup();
    const labels = [...form.querySelectorAll("label")].map((l) => l.textContent);
    expect(labels).toEqual(["チームA", "チームB", "Masters", "Core", "Next", "配信中", "LTK"]);
  });

  it("カテゴリごとに分かれ、チームのチップにはチームカラーが付く", () => {
    const { form, input } = setup();
    expect([...form.querySelectorAll(".filter-group legend")].map((l) => l.textContent)).toEqual(["チーム", "階級", "配信"]);
    expect(input("team", "a").closest<HTMLElement>(".chip")?.style.getPropertyValue("--chip-color")).toBe("#EF6400");
    expect(input("tier", "Core").closest(".chip")?.classList.contains("chip--colored")).toBe(false);
  });

  it("選んだ条件を Filter として通知する", () => {
    const { onChange, toggle } = setup();
    toggle("team", "b");
    toggle("tier", "Next");
    toggle("tier", "Masters");
    toggle("liveOnly", "1");
    toggle("ltkOnly", "1");
    expect(onChange).toHaveBeenLastCalledWith({
      teams: ["b"],
      tiers: ["Masters", "Next"],
      liveOnly: true,
      ltkOnly: true,
    });
  });

  it("チェックを外すと条件から外れる", () => {
    const { onChange, toggle } = setup();
    toggle("team", "a");
    toggle("team", "a");
    expect(onChange).toHaveBeenLastCalledWith(EMPTY_FILTER);
  });

  it("解除ですべてのチェックが外れ、条件なしに戻る（AC-19）", () => {
    const { form, onChange, toggle, input } = setup();
    toggle("team", "a");
    toggle("liveOnly", "1");
    form.querySelector<HTMLButtonElement>("button.reset")!.click();

    expect(onChange).toHaveBeenLastCalledWith(EMPTY_FILTER);
    expect(input("team", "a").checked).toBe(false);
    expect(input("liveOnly", "1").checked).toBe(false);
  });
});

describe("renderFilters の初期状態（AC-44）", () => {
  const saved: Filter = { teams: ["b"], tiers: ["Core"], liveOnly: true, ltkOnly: false };

  it("保存しておいた条件をチェックの初期状態にする", () => {
    const { form } = setup(saved);
    const checked = [...form.querySelectorAll<HTMLInputElement>("input:checked")].map((i) => `${i.name}=${i.value}`);
    expect(checked).toEqual(["team=b", "tier=Core", "liveOnly=1"]);
  });

  it("初期状態があっても、解除ですべてのチェックが外れる", () => {
    const { form, onChange } = setup(saved);
    form.querySelector<HTMLButtonElement>("button.reset")!.click();
    expect(onChange).toHaveBeenLastCalledWith(EMPTY_FILTER);
    expect(form.querySelectorAll("input:checked")).toHaveLength(0);
  });
});
