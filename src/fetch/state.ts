import { z } from "zod";
import type { FetchFn } from "./types";

// 前回の取得結果のうち、次の取得に引き継ぐもの（AC-43）。公開サイトに state.json として置く
const fetchStateSchema = z.object({
  version: z.literal(1),
  // day は太平洋時間の日付。YouTube のクォータはこの日付ごとにリセットされる
  quota: z.object({ day: z.string(), used: z.number().int().nonnegative(), exceeded: z.boolean() }),
  lastDiscoveryAt: z.string().optional(),
  lastFallbackAt: z.string().optional(),
  avatarsFetchedAt: z.string().optional(),
  // 配信中だった YouTube のチャンネル ID → 動画 ID（終了チェックに使う）
  youtubeLive: z.record(z.string(), z.array(z.string())),
  // 前回の新しい配信の確認で取得に失敗したチャンネル（確認しない回は引き継ぐ）
  youtubeErrors: z.array(z.string()),
  // チャンネルのキー（twitch:login / youtube:channelId）→ アイコン画像の URL
  avatars: z.record(z.string(), z.string()),
});

export type FetchState = z.infer<typeof fetchStateSchema>;

export const initialState = (now: Date): FetchState => ({
  version: 1,
  quota: { day: pacificDate(now), used: 0, exceeded: false },
  youtubeLive: {},
  youtubeErrors: [],
  avatars: {},
});

// 形式が違えば初期状態にする
export function parseState(input: unknown, now: Date): FetchState {
  const result = fetchStateSchema.safeParse(input);
  return result.success ? result.data : initialState(now);
}

export const pacificDate = (now: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", dateStyle: "short" }).format(now);

export const jstHour = (now: Date) =>
  Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", hour: "numeric", hourCycle: "h23" }).format(now));

// 太平洋時間の日付が変わっていたら、使用量を 0 に戻す
export function withCurrentQuotaDay(state: FetchState, now: Date): FetchState {
  const day = pacificDate(now);
  return state.quota.day === day ? state : { ...state, quota: { day, used: 0, exceeded: false } };
}

export const minutesSince = (iso: string | undefined, now: Date) =>
  iso === undefined || Number.isNaN(Date.parse(iso)) ? Infinity : (now.getTime() - Date.parse(iso)) / 60_000;

// 公開サイトから前回の state.json を読む。読めないときは初期状態（AC-43）
export async function loadState(siteUrl: string | undefined, now: Date, fetchFn: FetchFn = fetch): Promise<FetchState> {
  if (!siteUrl) return initialState(now);
  try {
    const res = await fetchFn(new URL(`state.json?t=${now.getTime()}`, siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseState(await res.json(), now);
  } catch (error) {
    console.warn(`前回の state.json を読み込めませんでした（${String(error)}）。初期状態で取得します`);
    return initialState(now);
  }
}
