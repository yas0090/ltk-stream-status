// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { EMPTY_FILTER, type Filter } from "../../src/shared/filter";
import { renderFilters } from "../../src/web/filters";

const setup = () => {
  const onChange = vi.fn<(filter: Filter) => void>();
  const form = renderFilters(
    [
      { id: "a", name: "チームA", color: "#EF6400" },
      { id: "b", name: "チームB", color: "#D10015" },
    ],
    onChange,
  );
  document.body.replaceChildren(form);
  const input = (name: string, value: string) =>
    form.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`)!;
  const toggle = (name: string, value: string) => input(name, value).click();
  return { form, onChange, toggle, input };
};

describe("renderFilters（AC-15〜19）", () => {
  it("チーム・階級・配信中のみ・LTK のみの選択肢がある", () => {
    const { form } = setup();
    const labels = [...form.querySelectorAll("label")].map((l) => l.textContent);
    expect(labels).toEqual(["チームA", "チームB", "Masters", "Core", "Next", "配信中のみ", "LTK のみ"]);
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
