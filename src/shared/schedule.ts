import type { ChannelStatus, Match, Schedule } from "./types";

// 日本時間の日付と時刻（24:00 以降も可）を Date にする
export const jstAt = (date: string, time: string) => {
  const [h, m] = time.split(":").map(Number) as [number, number];
  return new Date(new Date(`${date}T00:00:00+09:00`).getTime() + (h * 60 + m) * 60_000);
};

const HOUR = 60 * 60_000;
// 当日の案内を出し始める時刻（AC-46）
export const NOTICE_FROM = "16:00";
// 公式チャンネルを取得し続ける、終了予定時刻からの延長（AC-47）
export const OFFICIAL_GRACE_MS = 3 * HOUR;

const jstDate = (iso: string) => new Date(new Date(iso).getTime() + 9 * HOUR).toISOString().slice(0, 10);

// その本戦の日の 16:00（日本時間）
export const noticeFrom = (match: Match) => jstAt(jstDate(match.startAt), NOTICE_FROM);

// 公式チャンネルの配信状態を取得する時間帯か（AC-47）
export const isOfficialWindow = (matches: readonly Match[], now: Date) =>
  matches.some(
    (m) => now >= noticeFrom(m) && now.getTime() < new Date(m.endAt).getTime() + OFFICIAL_GRACE_MS,
  );

export type Notice = { kind: "today"; match: Match; live: boolean } | { kind: "next"; match: Match; today: boolean };

const isLive = (official: Schedule["official"]) =>
  (Object.values(official) as ChannelStatus[]).some((c) => c.state === "live");

// ページ先頭に出す案内を決める（AC-46, AC-48）。出すものがなければ undefined
export function pickNotice(schedule: Schedule | undefined, now: Date): Notice | undefined {
  if (!schedule) return undefined;
  const live = isLive(schedule.official);
  const today = schedule.matches.find(
    (m) =>
      now >= noticeFrom(m) &&
      (now < new Date(m.endAt) || (live && now.getTime() < new Date(m.endAt).getTime() + OFFICIAL_GRACE_MS)),
  );
  if (today) return { kind: "today", match: today, live };
  const next = schedule.matches.find((m) => new Date(m.endAt) > now);
  if (next) return { kind: "next", match: next, today: jstDate(next.startAt) === jstDate(now.toISOString()) };
  return undefined;
}
