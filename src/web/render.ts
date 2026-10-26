import { hasLtkStream, isPlayerLive, type TeamView } from "../shared/filter";
import { isStale } from "../shared/stale";
import { ROLES, type ChannelStatus, type Platform, type PlayerStatus, type Role } from "../shared/types";
import { externalLink, h } from "./dom";
import { platformIcon } from "./icons";

const PLATFORM_LABEL: Record<Platform, string> = { twitch: "Twitch", youtube: "YouTube" };

// LoL 公式のポジションアイコン（AC-29）。画像は CSS の mask-image で表示する
const roleIcon = (role: Role) => h("span", { class: `role-icon role-icon--${role.toLowerCase()}`, "aria-hidden": "true" });

export const formatUpdatedAt = (generatedAt: string) =>
  new Date(generatedAt).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

// 最終更新日時（AC-9）。ヘッダーに置く
export const renderUpdatedAt = (generatedAt: string): HTMLElement =>
  h("p", { class: "updated-at" }, "最終更新 ", h("time", { datetime: generatedAt }, formatUpdatedAt(generatedAt)));

// 30分以上たっていれば警告（AC-10）。ヘッダーのすぐ下に帯で出す
export const renderStaleWarning = (generatedAt: string, now: Date): HTMLElement | null =>
  isStale(generatedAt, now)
    ? h(
        "p",
        { class: "stale-warning", role: "alert" },
        "配信状態が30分以上更新されていません。表示が実際と違う可能性があります。",
      )
    : null;

// アイコン画像がない、または読み込めないときは名前の頭文字を出す（AC-27）
export function renderAvatar(player: PlayerStatus): HTMLElement {
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

// サムネイルの代わりに、アイコン画像を大きく置いて状態を示す（AC-42）
const renderThumbPlaceholder = (player: PlayerStatus, label: string) =>
  h("div", { class: "thumb-placeholder" }, renderAvatar(player), h("span", { class: "thumb-label" }, label));

// 16:9 の画像枠。配信中は最初の配信のサムネイル、配信していないときはアイコン画像と OFFLINE（AC-42）。
// 画像を読み込めないときは、アイコン画像と配信状態の表示に切り替える
function renderThumb(player: PlayerStatus, live: boolean): HTMLElement {
  const stream = player.channels.flatMap((c) => c.streams).find((s) => s.thumbnailUrl);
  const thumb = h("div", { class: "thumb" });
  if (!stream?.thumbnailUrl) {
    thumb.append(renderThumbPlaceholder(player, live ? "LIVE" : "OFFLINE"));
    return thumb;
  }
  const img = h("img", { class: "thumb-img", src: stream.thumbnailUrl, alt: "", loading: "lazy", referrerpolicy: "no-referrer" });
  img.addEventListener("error", () => thumb.replaceChildren(renderThumbPlaceholder(player, "LIVE")), { once: true });
  thumb.append(externalLink(stream.url, { class: "thumb-link", "aria-label": `${player.name} の配信を開く` }, img));
  return thumb;
}

// 選手カード。配信の有無にかかわらず同じ構成・同じ大きさ（AC-5〜8, AC-22, AC-27, AC-42）
function renderPlayerCard(player: PlayerStatus): HTMLElement {
  const live = isPlayerLive(player);
  return h(
    "article",
    // data-ltk で、LTK 関連の配信とそれ以外の配信の枠を分ける
    { class: "player-card", "data-live": String(live), "data-ltk": String(hasLtkStream(player)), "data-role": player.role },
    renderThumb(player, live),
    h(
      "div",
      { class: "card-head" },
      // チームカラーの赤と区別できるよう、配信中は色だけでなくバッジでも示す（AC-5）。
      // バッジはアイコン画像の下端に重ね、名前の幅を確保する
      h("span", { class: "avatar-wrap" }, renderAvatar(player), live && h("span", { class: "live-badge" }, "LIVE")),
      h("span", { class: "live-mark", role: "img", "aria-label": live ? "配信中" : "配信していない" }),
      h("span", { class: "player-name", title: player.name }, player.name),
    ),
    // ロール名はスマートフォンでだけ表示する（PC では列の見出しでわかる）
    h("div", { class: "platforms" }, player.channels.map(renderPlatformLink), h("span", { class: "role" }, roleIcon(player.role), player.role)),
    renderStreamLine(player),
  );
}

// チームのカード。PC ではロール（列）× 階級（行）の格子にし、該当者のいないマスは空欄にする
function renderTeam(team: TeamView): HTMLElement {
  return h(
    "section",
    // チームカラーは検証済みの #RRGGBB なので、そのまま CSS 変数に渡せる（AC-28）
    { class: "team", "data-team": team.id, style: `--team-color: ${team.color}` },
    h("h2", { class: "team-name" }, team.name),
    h(
      "div",
      { class: "team-grid" },
      h(
        "div",
        { class: "role-header", "aria-hidden": "true" },
        h("span", {}),
        ROLES.map((role) => h("span", {}, roleIcon(role), role)),
      ),
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
