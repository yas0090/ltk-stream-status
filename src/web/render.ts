import { isPlayerLive, type TeamView } from "../shared/filter";
import { isStale } from "../shared/stale";
import { ROLES, type ChannelStatus, type Platform, type PlayerStatus } from "../shared/types";
import { externalLink, h } from "./dom";
import { platformIcon } from "./icons";

const PLATFORM_LABEL: Record<Platform, string> = { twitch: "Twitch", youtube: "YouTube" };

export const formatUpdatedAt = (generatedAt: string) =>
  new Date(generatedAt).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

// 最終更新日時と、30分以上たっていれば警告（AC-9, AC-10）
export function renderStatusBar(generatedAt: string, now: Date): HTMLElement {
  const stale = isStale(generatedAt, now);
  return h(
    "div",
    { class: "status-bar" },
    h("p", { class: "updated-at" }, "最終更新 ", h("time", { datetime: generatedAt }, formatUpdatedAt(generatedAt))),
    stale &&
      h(
        "p",
        { class: "stale-warning", role: "alert" },
        "配信状態が30分以上更新されていません。表示が実際と違う可能性があります。",
      ),
  );
}

// アイコン画像がない、または読み込めないときは名前の頭文字を出す（AC-27）
function renderAvatar(player: PlayerStatus): HTMLElement {
  const fallback = h("span", { class: "avatar avatar--fallback", "aria-hidden": "true" }, [...player.name][0] ?? "?");
  if (!player.avatarUrl) return fallback;
  const img = h("img", {
    class: "avatar",
    src: player.avatarUrl,
    alt: "",
    loading: "lazy",
    referrerpolicy: "no-referrer",
  });
  img.addEventListener("error", () => img.replaceWith(fallback), { once: true });
  return img;
}

const STATE_LABEL = { live: "配信中", offline: "配信していない", error: "取得失敗" } as const;

// 配信中なら配信ページ、それ以外はチャンネルページへのリンク（AC-6, AC-7）
function renderPlatformLink(channel: ChannelStatus): HTMLElement {
  const label = `${PLATFORM_LABEL[channel.platform]}（${STATE_LABEL[channel.state]}）`;
  const href = channel.streams[0]?.url ?? channel.channelUrl;
  return externalLink(
    href,
    {
      class: `platform-link platform-link--${channel.platform}`,
      "data-state": channel.state,
      "aria-label": label,
      title: label,
    },
    platformIcon(channel.platform),
  );
}

// 配信タイトルは1行。複数配信は最初のタイトルと残りの件数（AC-7, AC-8, AC-22）
function renderStreamLine(player: PlayerStatus): HTMLElement {
  const streams = player.channels.flatMap((c) => c.streams);
  const [first, ...rest] = streams;
  if (first) {
    return h(
      "div",
      { class: "stream-line" },
      streams.some((s) => s.ltk) && h("span", { class: "ltk-tag" }, "LTK"),
      externalLink(
        first.url,
        { class: "stream-link", title: streams.map((s) => s.title).join("\n") },
        first.title || "（タイトルなし）",
      ),
      rest.length > 0 && h("span", { class: "more-streams" }, `+${rest.length}`),
    );
  }
  const failed = player.channels.some((c) => c.state === "error");
  return h("div", { class: "stream-line" }, failed && h("span", { class: "fetch-error" }, "取得失敗"));
}

// 選手カード。配信の有無にかかわらず同じ3行構成（AC-5〜8, AC-22, AC-27）
function renderPlayerCard(player: PlayerStatus): HTMLElement {
  const live = isPlayerLive(player);
  return h(
    "article",
    { class: "player-card", "data-live": String(live), "data-role": player.role },
    h(
      "div",
      { class: "card-head" },
      renderAvatar(player),
      h("span", { class: "live-mark", role: "img", "aria-label": live ? "配信中" : "配信していない" }),
      h("span", { class: "player-name", title: player.name }, player.name),
    ),
    // ロール名はスマートフォンでだけ表示する（PC では列の見出しでわかる）
    h("div", { class: "platforms" }, player.channels.map(renderPlatformLink), h("span", { class: "role" }, player.role)),
    renderStreamLine(player),
  );
}

// チームのカード。PC ではロール（列）× 階級（行）の格子にし、該当者のいないマスは空欄にする
function renderTeam(team: TeamView): HTMLElement {
  return h(
    "section",
    { class: "team", "data-team": team.id },
    h("h2", { class: "team-name" }, team.name),
    h(
      "div",
      { class: "team-grid" },
      h("div", { class: "role-header", "aria-hidden": "true" }, h("span", {}), ROLES.map((role) => h("span", {}, role))),
      team.tiers.map((group) =>
        h(
          "div",
          { class: "tier-row", "data-tier": group.tier },
          h("h3", { class: "tier-name" }, group.tier),
          ROLES.map((role) => {
            const player = group.players.find((p) => p.role === role);
            return player ? renderPlayerCard(player) : h("div", { class: "slot-empty", "data-role": role });
          }),
        ),
      ),
    ),
  );
}

// チーム → 階級 → ロールの一覧（AC-1〜8, AC-18, AC-22, AC-27）
export function renderTeams(view: readonly TeamView[]): HTMLElement {
  if (view.length === 0) {
    return h("p", { class: "empty" }, "条件に当てはまる出場者はいません。");
  }
  return h("div", { class: "teams" }, view.map(renderTeam));
}
