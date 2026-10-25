import { EMPTY_FILTER, type Filter } from "../shared/filter";
import { TIERS, type Tier } from "../shared/types";
import { h } from "./dom";

const checkbox = (name: string, value: string, label: string) =>
  h("label", { class: "chip" }, h("input", { type: "checkbox", name, value }), h("span", {}, label));

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
  teams: readonly { id: string; name: string }[],
  onChange: (filter: Filter) => void,
): HTMLFormElement {
  const form = h(
    "form",
    { class: "filters", "aria-label": "絞り込み" },
    h(
      "fieldset",
      {},
      h("legend", {}, "チーム"),
      teams.map((team) => checkbox("team", team.id, team.name)),
    ),
    h(
      "fieldset",
      {},
      h("legend", {}, "階級"),
      TIERS.map((tier) => checkbox("tier", tier, tier)),
    ),
    h(
      "fieldset",
      {},
      h("legend", {}, "配信"),
      checkbox("liveOnly", "1", "配信中のみ"),
      checkbox("ltkOnly", "1", "LTK のみ"),
    ),
    h("button", { type: "reset", class: "reset" }, "解除"),
  );

  form.addEventListener("change", () => onChange(readFilter(form)));
  form.addEventListener("submit", (event) => event.preventDefault());
  // reset イベントはチェックが外れる前に発生するので、結果は EMPTY_FILTER を直接渡す
  form.addEventListener("reset", () => onChange(EMPTY_FILTER));
  return form;
}
