import type { Notice } from "../shared/schedule";
import type { ChannelStatus, Match, Schedule, TeamStatus } from "../shared/types";
import { externalLink, h } from "./dom";
import { platformIcon } from "./icons";

// 日付と時刻は日本時間で表示する（AC-49）
const jstParts = (iso: string) => {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return { date: `${get("month")}/${get("day")}（${get("weekday")}）`, time: `${get("hour")}:${get("minute")}` };
};

const matchName = (match: Match) => `${match.stage} ${match.day}`;

// 対戦カード。チームカラーの丸と正式なチーム名、階級を並べる
function renderGame(game: Match["games"][number], teams: readonly TeamStatus[]): HTMLElement {
  const team = (id: string) => {
    const t = teams.find((x) => x.id === id);
    return h("span", { class: "mn-team", style: t && `--chip-color: ${t.color}` }, t?.name ?? id);
  };
  return h(
    "li",
    { class: "mn-game" },
    team(game.blue),
    h("span", { class: "mn-vs" }, "vs"),
    team(game.red),
    h("span", { class: "mn-tiers" }, game.tiers.join(" / ")),
  );
}

const OFFICIAL_LABEL = { twitch: "公式 Twitch", youtube: "公式 YouTube" } as const;

// 配信中なら配信ページ、それ以外はチャンネルページへのリンク（AC-46, AC-47）
function renderOfficialLink(channel: ChannelStatus): HTMLElement {
  const live = channel.state === "live";
  return externalLink(
    channel.streams[0]?.url ?? channel.channelUrl,
    { class: `mn-link mn-link--${channel.platform}`, "data-live": String(live) },
    platformIcon(channel.platform),
    h("span", {}, OFFICIAL_LABEL[channel.platform]),
    live && h("span", { class: "mn-live" }, "LIVE"),
  );
}

// 本戦の案内（AC-46, AC-48）。当日はステージ・時刻・対戦カード・公式チャンネル、それ以外は次回を1行と対戦カードで出す
export function renderNotice(notice: Notice, schedule: Schedule, teams: readonly TeamStatus[], now: Date): HTMLElement {
  const { match } = notice;
  const { date, time } = jstParts(match.startAt);
  if (notice.kind === "next") {
    return h(
      "section",
      { class: "match-notice match-notice--next", "aria-label": "本戦スケジュール" },
      h(
        "p",
        { class: "mn-head" },
        h("span", { class: "mn-label" }, "本戦スケジュール"),
        h("time", { datetime: match.startAt }, `${notice.today ? "本日" : date} ${time}〜`),
        h("span", {}, matchName(match)),
      ),
      h("ul", { class: "mn-games" }, match.games.map((g) => renderGame(g, teams))),
    );
  }
  const status = notice.live ? "配信中" : now >= new Date(match.startAt) ? `${time}〜` : `${time} 開始`;
  return h(
    "section",
    { class: "match-notice match-notice--today", "aria-label": "本戦スケジュール" },
    h(
      "div",
      { class: "mn-head" },
      h("span", { class: "mn-label" }, "本戦スケジュール"),
      h("strong", { class: "mn-name" }, matchName(match)),
      h("span", { class: "mn-status", "data-live": String(notice.live) }, status),
    ),
    h("ul", { class: "mn-games" }, match.games.map((g) => renderGame(g, teams))),
    h("div", { class: "mn-links" }, renderOfficialLink(schedule.official.twitch), renderOfficialLink(schedule.official.youtube)),
  );
}
