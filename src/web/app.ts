import { buildView, EMPTY_FILTER, type Filter } from "../shared/filter";
import { favoritePlayers, pruneFavorites, toggleFavorite } from "../shared/favorites";
import { pruneHidden } from "../shared/hidden";
import { pickNotice } from "../shared/schedule";
import type { SiteData } from "../shared/types";
import { renderChangelog } from "./changelog";
import { renderDetailFilter } from "./detail-filter";
import { externalLink, h } from "./dom";
import { renderFilters, setHiddenCount } from "./filters";
import { renderNotice } from "./notice";
import { renderFavorites, renderStaleWarning, renderTeams, renderUpdatedAt, type FavoriteControl } from "./render";
import { loadFavorites, loadFilter, loadHiddenPlayers, saveFavorites, saveFilter, saveHiddenPlayers } from "./storage";
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
    // 訂正・削除の依頼や不具合の報告を受ける連絡先。サイト専用のアカウントで、作者の名前やメールアドレスは載せない
    h(
      "p",
      {},
      "掲載内容の訂正・削除のご依頼や不具合の報告は、X の ",
      externalLink("https://x.com/yascrim83", {}, "@yascrim83"),
      " までお願いします。",
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
  // お気に入りの選手のキー（登録順）。変更のたびに保存する（AC-73）
  let favorites: readonly string[] = loadFavorites();
  let teamsKey = "";
  let filtersForm: HTMLFormElement | undefined;
  let changelogKey: string | undefined;

  const changelogSlot = h("div", { class: "changelog-slot" });
  const changelogDialogSlot = h("div", { class: "changelog-dialog-slot" });
  const updatedSlot = h("div", { class: "updated-slot" });
  const staleSlot = h("div", { class: "stale-slot" });
  const noticeSlot = h("div", { class: "notice-slot" });
  const filtersSlot = h("div", { class: "filters-slot" });
  const favoritesSlot = h("div", { class: "favorites-slot" });
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
        h("div", { class: "header-meta" }, updatedSlot, changelogSlot, renderThemeToggle()),
      ),
      staleSlot,
    ),
    h("div", { class: "page" }, errorSlot, noticeSlot, favoritesSlot, filtersSlot, listSlot, renderFooter()),
    detailSlot,
    changelogDialogSlot,
  );

  // 今のデータにいない選手のキーは表示の判定にも件数にも使わない（AC-37）
  const visibleHidden = () => (data ? pruneHidden(hiddenPlayers, data.teams) : new Set<string>());

  const renderStatus = () => {
    if (!data) return;
    updatedSlot.replaceChildren(renderUpdatedAt(data.generatedAt));
    staleSlot.replaceChildren(renderStaleWarning(data.generatedAt, now()) ?? "");
    // 本戦の案内は端末の現在時刻で切り替える（AC-49）
    const notice = pickNotice(data.schedule, now());
    noticeSlot.replaceChildren(notice && data.schedule ? renderNotice(notice, data.schedule, data.teams, now()) : "");
  };

  const favoriteControl: FavoriteControl = {
    get favorites() {
      return favorites;
    },
    onToggle: (key, button) => toggleAndRender(key, button),
  };

  const renderList = () => {
    if (!data) return;
    const hidden = visibleHidden();
    listSlot.replaceChildren(renderTeams(buildView(data.teams, filter, hidden), favoriteControl));
    if (filtersForm) setHiddenCount(filtersForm, hidden.size);
  };

  // お気に入り欄は、簡易絞り込みと非表示の影響を受けない。フィルタ操作では描き直さない（AC-70）
  const renderFavoritesSlot = () => {
    if (!data) return;
    favoritesSlot.replaceChildren(renderFavorites(favoritePlayers(favorites, data.teams), favoriteControl) ?? "");
  };

  // 今のデータにいない選手は取り除き、変わったときだけ保存へ書き戻す（AC-76）
  const pruneSavedFavorites = () => {
    if (!data) return;
    const next = pruneFavorites(favorites, data.teams);
    if (next.length === favorites.length && next.every((key, i) => key === favorites[i])) return;
    favorites = next;
    saveFavorites(next);
  };

  // 切り替えで DOM が作り直されるので、キーボード操作のために押した側（欄か一覧）の同じ選手のボタンへフォーカスを戻す。
  // 欄で解除したときは欄の同じ位置のボタンへ戻す。画面が飛ばないようスクロールさせない
  function toggleAndRender(key: string, pressed: HTMLButtonElement) {
    const slot = favoritesSlot.contains(pressed) ? favoritesSlot : listSlot;
    const index = [...slot.querySelectorAll(".fav-btn")].indexOf(pressed);
    favorites = toggleFavorite(favorites, key);
    saveFavorites(favorites);
    renderFavoritesSlot();
    renderList();
    const buttons = [...slot.querySelectorAll<HTMLButtonElement>(".fav-btn")];
    const target = buttons.find((button) => button.dataset.key === key) ?? buttons[Math.min(index, buttons.length - 1)];
    target?.focus({ preventScroll: true });
  }

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

  // 内容が変わったときだけ作り直す（開いているモーダルを閉じないため）
  const renderChangelogIfChanged = () => {
    if (!data) return;
    const entries = data.changelog ?? [];
    const key = JSON.stringify(entries);
    if (key === changelogKey) return;
    changelogKey = key;
    const changelog = renderChangelog(entries);
    changelogSlot.replaceChildren(changelog?.button ?? "");
    changelogDialogSlot.replaceChildren(changelog?.dialog ?? "");
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
    renderChangelogIfChanged();
    renderStatus();
    pruneSavedFavorites();
    renderFavoritesSlot();
    renderList();
  };

  const timers = [setInterval(reload, RELOAD_INTERVAL_MS), setInterval(renderStatus, STALE_CHECK_INTERVAL_MS)];

  return {
    ready: reload(),
    stop: () => timers.forEach(clearInterval),
  };
}
