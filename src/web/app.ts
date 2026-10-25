import { buildView, EMPTY_FILTER, type Filter } from "../shared/filter";
import type { SiteData } from "../shared/types";
import { h } from "./dom";
import { renderFilters } from "./filters";
import { renderStatusBar, renderTeams } from "./render";

export const RELOAD_INTERVAL_MS = 5 * 60_000;
export const STALE_CHECK_INTERVAL_MS = 60_000;

export type AppOptions = {
  loadData: () => Promise<SiteData>;
  now?: () => Date;
};

// GitHub Pages のキャッシュ（最大10分）を避けるため、毎回タイムスタンプを付けて読み込む
export const fetchSiteData = async (): Promise<SiteData> => {
  const res = await fetch(`./site-data.json?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as SiteData;
};

export function createApp(root: HTMLElement, { loadData, now = () => new Date() }: AppOptions) {
  let data: SiteData | undefined;
  let filter: Filter = EMPTY_FILTER;
  let teamsKey = "";

  const statusSlot = h("div", { class: "status-slot" });
  const filtersSlot = h("div", { class: "filters-slot" });
  const listSlot = h("main", { class: "list-slot" });
  const errorSlot = h("p", { class: "load-error", role: "alert", hidden: true });
  root.replaceChildren(
    h("header", { class: "site-header" }, h("h1", {}, "LTK 配信状況"), statusSlot),
    errorSlot,
    filtersSlot,
    listSlot,
  );

  const renderStatus = () => {
    if (data) statusSlot.replaceChildren(renderStatusBar(data.generatedAt, now()));
  };

  const renderList = () => {
    if (data) listSlot.replaceChildren(renderTeams(buildView(data.teams, filter)));
  };

  // チーム構成が変わったときだけ絞り込み UI を作り直す（操作中のチェックを消さないため）
  const renderFiltersIfChanged = () => {
    if (!data) return;
    const key = data.teams.map((t) => `${t.id}:${t.name}`).join("\n");
    if (key === teamsKey) return;
    teamsKey = key;
    filter = EMPTY_FILTER;
    filtersSlot.replaceChildren(
      renderFilters(data.teams, (next) => {
        filter = next;
        renderList();
      }),
    );
  };

  const reload = async () => {
    try {
      data = await loadData();
      errorSlot.hidden = true;
    } catch {
      // 読み込みに失敗しても、前回のデータがあればそのまま表示を続ける
      errorSlot.textContent = data
        ? "最新の配信状態を読み込めませんでした。前回のデータを表示しています。"
        : "配信状態を読み込めませんでした。時間をおいて再読み込みしてください。";
      errorSlot.hidden = false;
    }
    renderFiltersIfChanged();
    renderStatus();
    renderList();
  };

  const timers = [setInterval(reload, RELOAD_INTERVAL_MS), setInterval(renderStatus, STALE_CHECK_INTERVAL_MS)];

  return {
    ready: reload(),
    stop: () => timers.forEach(clearInterval),
  };
}
