import { isPlayerLive, type TeamView } from "../shared/filter";
import { isStale } from "../shared/stale";
import type { ChannelStatus, Platform, PlayerStatus } from "../shared/types";
import { externalLink, h } from "./dom";

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

function renderChannel(channel: ChannelStatus): HTMLElement {
  const label = PLATFORM_LABEL[channel.platform];
  return h(
    "li",
    { class: `channel channel--${channel.platform}`, "data-state": channel.state },
    h(
      "div",
      { class: "channel-head" },
      externalLink(channel.channelUrl, { class: "channel-link" }, label),
      channel.state === "error" && h("span", { class: "fetch-error" }, "取得失敗"),
    ),
    // 同時に複数配信していればすべて表示する（AC-8）
    channel.streams.map((stream) =>
      h(
        "div",
        { class: "stream" },
        stream.ltk && h("span", { class: "ltk-tag" }, "LTK"),
        externalLink(stream.url, { class: "stream-link" }, stream.title || "（タイトルなし）"),
      ),
    ),
  );
}

function renderPlayer(player: PlayerStatus): HTMLElement {
  const live = isPlayerLive(player);
  return h(
    "li",
    { class: "player", "data-live": String(live) },
    h(
      "div",
      { class: "player-head" },
      h("span", { class: "live-mark", role: "img", "aria-label": live ? "配信中" : "配信していない" }),
      h("span", { class: "role" }, player.role),
      h("span", { class: "player-name" }, player.name),
    ),
    h("ul", { class: "channels" }, player.channels.map(renderChannel)),
  );
}

// チーム → 階級 → 出場者の一覧（AC-1, AC-5〜8, AC-22）
export function renderTeams(view: readonly TeamView[]): HTMLElement {
  if (view.length === 0) {
    return h("p", { class: "empty" }, "条件に当てはまる出場者はいません。");
  }
  return h(
    "div",
    { class: "teams" },
    view.map((team) =>
      h(
        "section",
        { class: "team", "data-team": team.id },
        h("h2", { class: "team-name" }, team.name),
        team.tiers.map((group) =>
          h(
            "section",
            { class: "tier", "data-tier": group.tier },
            h("h3", { class: "tier-name" }, group.tier),
            h("ul", { class: "players" }, group.players.map(renderPlayer)),
          ),
        ),
      ),
    ),
  );
}
