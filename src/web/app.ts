import { buildView, EMPTY_FILTER, type Filter } from "../shared/filter";
import { pruneHidden } from "../shared/hidden";
import type { SiteData } from "../shared/types";
import { renderDetailFilter } from "./detail-filter";
import { h } from "./dom";
import { renderFilters, setHiddenCount } from "./filters";
import { renderStaleWarning, renderTeams, renderUpdatedAt } from "./render";
import { loadFilter, loadHiddenPlayers, saveFilter, saveHiddenPlayers } from "./storage";
import { renderThemeToggle } from "./theme";

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

// 非公式であることと、Riot Games の免責表示（AC-30）
const renderFooter = () =>
  h(
    "footer",
    { class: "site-footer" },
    h(
      "p",
      {},
      "このサイトは非公式のファンサイトで、League The k4sen（LTK）の運営とは関係ありません。配信状態は Twitch API と YouTube Data API から取得しています。",
    ),
    h(
      "p",
      {},
      "LTK4 Live Now は Riot Games の承認を受けたものではなく、Riot Games または League of Legends の制作・運営に公式に関わる人物の見解や意見を反映したものではありません。League of Legends および Riot Games は Riot Games, Inc. の商標または登録商標です。League of Legends © Riot Games, Inc.",
    ),
  );

export function createApp(root: HTMLElement, { loadData, now = () => new Date() }: AppOptions) {
  let data: SiteData | undefined;
  let filter: Filter = EMPTY_FILTER;
  // 詳細フィルタで非表示にした選手（AC-34）。簡易絞り込みとは別に持ち、変更のたびに保存する
  let hiddenPlayers: ReadonlySet<string> = loadHiddenPlayers();
  let teamsKey = "";
  let filtersForm: HTMLFormElement | undefined;

  const updatedSlot = h("div", { class: "updated-slot" });
  const staleSlot = h("div", { class: "stale-slot" });
  const filtersSlot = h("div", { class: "filters-slot" });
  const detailSlot = h("div", { class: "detail-slot" });
  const listSlot = h("main", { class: "list-slot" });
  const errorSlot = h("p", { class: "load-error", role: "alert", hidden: true });

  // スクロールしても常に表示されるヘッダー（AC-38）
  root.replaceChildren(
    h(
      "div",
      { class: "site-top" },
      h(
        "header",
        { class: "site-header" },
        h("h1", { class: "site-title" }, "LTK4 Live Now"),
        h("div", { class: "header-meta" }, updatedSlot, renderThemeToggle()),
      ),
      staleSlot,
    ),
    h("div", { class: "page" }, errorSlot, filtersSlot, listSlot, renderFooter()),
    detailSlot,
  );

  // 今のデータにいない選手のキーは表示の判定にも件数にも使わない（AC-37）
  const visibleHidden = () => (data ? pruneHidden(hiddenPlayers, data.teams) : new Set<string>());

  const renderStatus = () => {
    if (!data) return;
    updatedSlot.replaceChildren(renderUpdatedAt(data.generatedAt));
    staleSlot.replaceChildren(renderStaleWarning(data.generatedAt, now()) ?? "");
  };

  const renderList = () => {
    if (!data) return;
    const hidden = visibleHidden();
    listSlot.replaceChildren(renderTeams(buildView(data.teams, filter, hidden)));
    if (filtersForm) setHiddenCount(filtersForm, hidden.size);
  };

  // チーム構成が変わったときだけ絞り込み UI と詳細フィルタを作り直す（操作中のチェックを消さないため）
  const renderFiltersIfChanged = () => {
    if (!data) return;
    const key = data.teams.map((t) => `${t.id}:${t.name}:${t.players.map((p) => p.name).join(",")}`).join("\n");
    if (key === teamsKey) return;
    teamsKey = key;
    // 簡易絞り込みは保存しておいた条件から始める（AC-44）
    filter = loadFilter(data.teams.map((t) => t.id));
    const detail = renderDetailFilter(data.teams, visibleHidden(), (next) => {
      hiddenPlayers = next;
      saveHiddenPlayers(next);
      renderList();
    });
    detailSlot.replaceChildren(detail.dialog);
    filtersForm = renderFilters(
      data.teams,
      (next) => {
        filter = next;
        saveFilter(next);
        renderList();
      },
      detail.open,
      filter,
    );
    filtersSlot.replaceChildren(filtersForm);
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
