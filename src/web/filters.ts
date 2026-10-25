import { EMPTY_FILTER, type Filter } from "../shared/filter";
import { TIERS, type Tier } from "../shared/types";
import { h } from "./dom";

// color を渡すと、チップにその色の丸を付け、選択中はその色で塗る
const checkbox = (name: string, value: string, label: string, color?: string) =>
  h(
    "label",
    { class: color ? "chip chip--colored" : "chip", style: color && `--chip-color: ${color}` },
    h("input", { type: "checkbox", name, value }),
    h("span", {}, label),
  );

// カテゴリごとに1行にし、左端にカテゴリ名を置く。
// legend はブラウザごとに描画が違うので読み上げ用にだけ使い、見た目のカテゴリ名は span で描く
const group = (legend: string, ...chips: HTMLElement[]) =>
  h(
    "fieldset",
    { class: "filter-group" },
    h("legend", { class: "visually-hidden" }, legend),
    h(
      "div",
      { class: "filter-row" },
      h("span", { class: "filter-label", "aria-hidden": "true" }, legend),
      h("div", { class: "chips" }, chips),
    ),
  );

const readFilter = (form: HTMLFormElement): Filter => {
  const checked = (name: string) =>
    [...form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]:checked`)].map((input) => input.value);
  return {
    teams: checked("team"),
    tiers: checked("tier") as Tier[],
    liveOnly: checked("liveOnly").length > 0,
    ltkOnly: checked("ltkOnly").length > 0,
  };
};

// チーム・階級は複数選択、配信中のみ・LTK のみは切り替え（AC-15〜19）
export function renderFilters(
  teams: readonly { id: string; name: string; color?: string }[],
  onChange: (filter: Filter) => void,
): HTMLFormElement {
  const form = h(
    "form",
    { class: "filters", "aria-label": "絞り込み" },
    h(
      "div",
      { class: "filters-head" },
      h("span", { class: "filters-title" }, "絞り込み"),
      h("button", { type: "reset", class: "reset" }, "解除"),
    ),
    group("チーム", ...teams.map((team) => checkbox("team", team.id, team.name, team.color))),
    group("階級", ...TIERS.map((tier) => checkbox("tier", tier, tier))),
    group("配信", checkbox("liveOnly", "1", "配信中のみ"), checkbox("ltkOnly", "1", "LTK のみ")),
  );

  form.addEventListener("change", () => onChange(readFilter(form)));
  form.addEventListener("submit", (event) => event.preventDefault());
  // reset イベントはチェックが外れる前に発生するので、結果は EMPTY_FILTER を直接渡す
  form.addEventListener("reset", () => onChange(EMPTY_FILTER));
  return form;
}
