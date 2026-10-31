import { sortChangelog } from "../shared/changelog";
import type { ChangelogEntry } from "../shared/types";
import { h } from "./dom";

// 更新履歴のボタンとモーダル。0 件のときは何も作らない。本文はテキストとして出す
export function renderChangelog(entries: readonly ChangelogEntry[]) {
  if (entries.length === 0) return undefined;

  const close = h("button", { type: "button", class: "cl-close" }, "閉じる");
  const dialog = h(
    "dialog",
    { class: "changelog", "aria-labelledby": "changelog-title" },
    h("div", { class: "cl-head" }, h("h2", { id: "changelog-title" }, "更新履歴")),
    h(
      "ul",
      { class: "cl-list" },
      sortChangelog(entries).map((entry) =>
        h(
          "li",
          { class: "cl-item" },
          h(
            "div",
            { class: "cl-meta" },
            h("time", { class: "cl-date", datetime: entry.date }, entry.date),
            h("span", { class: "cl-type", "data-type": entry.type }, entry.type),
          ),
          h("p", { class: "cl-body" }, entry.body),
        ),
      ),
    ),
    h("div", { class: "cl-foot" }, close),
  );
  const button = h("button", { type: "button", class: "changelog-button" }, "更新履歴");

  button.addEventListener("click", () => {
    if (!dialog.open) dialog.showModal();
  });
  close.addEventListener("click", () => dialog.close());

  return { button, dialog };
}
