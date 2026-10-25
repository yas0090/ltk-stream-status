import { playerKey, setHidden, visibilityOf } from "../shared/hidden";
import { groupByTier } from "../shared/sort";
import type { TeamStatus } from "../shared/types";
import { h } from "./dom";
import { renderAvatar } from "./render";

const KEY_SEPARATOR = "\n";

// data-keys に配下の選手のキーを持たせ、チーム・階級・選手を同じ処理で切り替える
const toggle = (label: string, keys: readonly string[], className: string, ...extra: (Node | string)[]) =>
  h(
    "label",
    { class: className },
    h("input", { type: "checkbox", "data-keys": keys.join(KEY_SEPARATOR) }),
    ...extra,
    h("span", { class: "df-label" }, label),
  );

function renderTeamBlock(team: TeamStatus): HTMLElement {
  const teamKeys = team.players.map((player) => playerKey(team.id, player.name));
  return h(
    "section",
    { class: "df-team", style: `--team-color: ${team.color}` },
    toggle(team.name, teamKeys, "df-team-toggle"),
    groupByTier(team.players).map((group) =>
      h(
        "div",
        { class: "df-tier" },
        toggle(
          group.tier,
          group.players.map((player) => playerKey(team.id, player.name)),
          "df-tier-toggle",
        ),
        h(
          "div",
          { class: "df-players" },
          group.players.map((player) =>
            toggle(
              player.name,
              [playerKey(team.id, player.name)],
              "df-player-toggle",
              renderAvatar(player),
              h("span", { class: "df-role" }, player.role),
            ),
          ),
        ),
      ),
    ),
  );
}

// 詳細フィルタのモーダル（AC-31, AC-32, AC-35）。変更はその場で onChange に渡す
export function renderDetailFilter(
  teams: readonly TeamStatus[],
  initialHidden: ReadonlySet<string>,
  onChange: (hidden: Set<string>) => void,
) {
  let hidden: ReadonlySet<string> = initialHidden;

  const body = h("div", { class: "df-body" }, teams.map(renderTeamBlock));
  const showAll = h("button", { type: "button", class: "df-show-all" }, "すべて表示");
  const close = h("button", { type: "button", class: "df-close" }, "閉じる");
  const dialog = h(
    "dialog",
    { class: "detail-filter", "aria-labelledby": "detail-filter-title" },
    h(
      "div",
      { class: "df-head" },
      h("h2", { id: "detail-filter-title" }, "詳細フィルタ"),
      h("p", { class: "df-hint" }, "チェックを外した選手は一覧に表示されません。設定はこのブラウザに保存されます。"),
    ),
    body,
    h("div", { class: "df-foot" }, showAll, close),
  );

  const inputs = () => [...body.querySelectorAll<HTMLInputElement>("input[data-keys]")];
  const keysOf = (input: HTMLInputElement) => (input.dataset.keys ?? "").split(KEY_SEPARATOR);

  // 配下が全員表示なら ON、全員非表示なら OFF、一部だけなら「一部選択」（AC-32）
  const sync = () => {
    for (const input of inputs()) {
      const visibility = visibilityOf(keysOf(input), hidden);
      input.checked = visibility === "all";
      input.indeterminate = visibility === "some";
    }
  };

  const update = (next: Set<string>) => {
    hidden = next;
    sync();
    onChange(next);
  };

  body.addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement;
    if (input.dataset.keys !== undefined) update(setHidden(hidden, keysOf(input), !input.checked));
  });
  showAll.addEventListener("click", () => update(new Set()));
  close.addEventListener("click", () => dialog.close());
  sync();

  return {
    dialog,
    open: () => {
      if (!dialog.open) dialog.showModal();
    },
  };
}
