import { isLtk } from "../shared/ltk";
import { isOfficialWindow } from "../shared/schedule";
import { toMatches, type ChannelInput, type KeywordsFile, type ScheduleFile, type TeamsFile } from "../shared/schema";
import type { ChannelStatus, Schedule, SiteData } from "../shared/types";
import { avatarsDue, planYouTube, type Budget, type YouTubePlan } from "./budget";
import { initialState, withCurrentQuotaDay, type FetchState } from "./state";
import { twitchChannelUrl } from "./twitch";
import { FAILED, type ChannelResult } from "./types";
import { youtubeChannelUrl, type YouTubeRequest, type YouTubeResult } from "./youtube";

export type Fetchers = {
  twitch: (logins: string[]) => Promise<Map<string, ChannelResult>>;
  youtube: (request: YouTubeRequest) => Promise<YouTubeResult>;
  // アイコン画像（AC-27）。失敗しても配信状態には影響させない
  twitchAvatars?: (logins: string[]) => Promise<Map<string, string>>;
  youtubeAvatars?: (channelIds: string[]) => Promise<Map<string, string>>;
  // この回の YouTube API の使用量と、クォータ超過の応答を受けたか（AC-43）
  youtubeUsage?: () => { used: number; exceeded: boolean };
};

export type GenerateOptions = {
  now?: Date;
  previousState?: FetchState;
  budget?: Budget;
  // 本戦の日程（AC-45）。なければ site-data.json に schedule を出さない
  schedule?: ScheduleFile;
};

export type GenerateResult = {
  siteData: SiteData;
  state: FetchState;
  plan: YouTubePlan;
};

const fetchAvatars = async (fetcher: ((ids: string[]) => Promise<Map<string, string>>) | undefined, ids: string[]) => {
  if (!fetcher || ids.length === 0) return new Map<string, string>();
  try {
    return await fetcher(ids);
  } catch (error) {
    console.warn(String(error));
    return new Map<string, string>();
  }
};

const allChannels = (teams: TeamsFile) => teams.teams.flatMap((t) => t.players.flatMap((p) => p.channels));

const channelKey = (c: ChannelInput) =>
  c.platform === "twitch" ? `twitch:${c.login.toLowerCase()}` : `youtube:${c.channelId}`;

// 予算の指定がなければ、いつでも確認・取り直しをする
const ALWAYS: YouTubePlan = { discover: true, fallback: true, reason: "予算の指定なし" };

// データファイルを検証済みの前提で、配信状態を取得して site-data.json と state.json の中身を作る
export async function generateSiteData(
  teams: TeamsFile,
  keywords: KeywordsFile,
  fetchers: Fetchers,
  { now = new Date(), previousState, budget, schedule }: GenerateOptions = {},
): Promise<GenerateResult> {
  const channels = allChannels(teams);
  // 公式チャンネルは本戦の日だけ、選手と同じ取得に加える（AC-47）
  const matches = schedule ? toMatches(schedule) : [];
  const official: readonly ChannelInput[] =
    schedule && isOfficialWindow(matches, now)
      ? [
          { platform: "twitch", login: schedule.official.twitch },
          { platform: "youtube", channelId: schedule.official.youtube },
        ]
      : [];
  const targets = [...channels, ...official];
  const twitchLogins = targets.flatMap((c) => (c.platform === "twitch" ? [c.login] : []));
  const youtubeIds = targets.flatMap((c) => (c.platform === "youtube" ? [c.channelId] : []));

  const previous = withCurrentQuotaDay(previousState ?? initialState(now), now);
  const plan = budget ? planYouTube(previous, budget, now) : ALWAYS;

  // アイコン画像は 1 時間に 1 回だけ全員分を取り直し、それ以外は前回の URL を使う。新しく加わったチャンネルだけは取りにいく（節約 B）
  const due = avatarsDue(previous, now);
  const needsAvatar = (c: ChannelInput) => due || previous.avatars[channelKey(c)] === undefined;
  const avatarTwitch = channels.flatMap((c) => (c.platform === "twitch" && needsAvatar(c) ? [c.login] : []));
  const avatarYouTube = channels.flatMap((c) => (c.platform === "youtube" && needsAvatar(c) ? [c.channelId] : []));

  const emptyYouTube: YouTubeResult = { results: new Map(), live: {}, errors: [], discovered: false, fellBack: false };
  const [twitch, youtube, twitchAvatars, youtubeAvatars] = await Promise.all([
    twitchLogins.length > 0 ? fetchers.twitch(twitchLogins) : new Map<string, ChannelResult>(),
    youtubeIds.length > 0
      ? fetchers.youtube({
          channelIds: youtubeIds,
          previousLive: previous.youtubeLive,
          previousErrors: previous.youtubeErrors,
          plan,
        })
      : emptyYouTube,
    fetchAvatars(fetchers.twitchAvatars, avatarTwitch),
    fetchAvatars(fetchers.youtubeAvatars, avatarYouTube),
  ]);

  // 今のデータにあるチャンネルだけを残し、取得できたものは新しい URL で上書きする
  const avatars: Record<string, string> = {};
  for (const c of channels) {
    const key = channelKey(c);
    const fresh = c.platform === "twitch" ? twitchAvatars.get(c.login.toLowerCase()) : youtubeAvatars.get(c.channelId);
    const url = fresh ?? previous.avatars[key];
    if (url) avatars[key] = url;
  }

  // データファイルに書いた順で、最初に取得できたアイコン画像を使う
  const avatarOf = (playerChannels: readonly ChannelInput[]) =>
    playerChannels.map((c) => avatars[channelKey(c)]).find((url) => url !== undefined);

  const withAvatar = (avatarUrl: string | undefined) => (avatarUrl ? { avatarUrl } : {});

  const toStatus = (channel: ChannelInput, ltkKeywords = keywords.ltkKeywords): ChannelStatus => {
    const [channelUrl, result] =
      channel.platform === "twitch"
        ? [twitchChannelUrl(channel.login), twitch.get(channel.login.toLowerCase())]
        : [youtubeChannelUrl(channel.channelId), youtube.results.get(channel.channelId)];
    const { state, streams } = result ?? FAILED;
    return {
      platform: channel.platform,
      channelUrl,
      state,
      // videoId は state.json だけに引き継ぎ、site-data.json には出さない
      streams: streams.map(({ title, url, thumbnailUrl }) => ({
        title,
        url,
        ltk: isLtk(title, ltkKeywords),
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
      })),
    };
  };

  const siteData: SiteData = {
    generatedAt: now.toISOString(),
    teams: teams.teams.map((team) => ({
      id: team.id,
      name: team.name,
      color: team.color,
      players: team.players.map((player) => ({
        name: player.name,
        tier: player.tier,
        role: player.role,
        ...withAvatar(avatarOf(player.channels)),
        channels: player.channels.map((c) => toStatus(c)),
      })),
    })),
  };

  if (schedule) {
    // 公式チャンネルは LTK タグを判定しない。取得しない時間帯は配信していない扱いにする
    const officialStatus = (channel: ChannelInput): ChannelStatus =>
      official.length > 0
        ? toStatus(channel, [])
        : {
            platform: channel.platform,
            channelUrl: channel.platform === "twitch" ? twitchChannelUrl(channel.login) : youtubeChannelUrl(channel.channelId),
            state: "offline",
            streams: [],
          };
    const result: Schedule = {
      matches,
      official: {
        twitch: officialStatus({ platform: "twitch", login: schedule.official.twitch }),
        youtube: officialStatus({ platform: "youtube", channelId: schedule.official.youtube }),
      },
    };
    siteData.schedule = result;
  }

  const usage = fetchers.youtubeUsage?.() ?? { used: 0, exceeded: false };
  const nowIso = now.toISOString();
  const state: FetchState = {
    version: 1,
    quota: {
      day: previous.quota.day,
      used: previous.quota.used + usage.used,
      exceeded: previous.quota.exceeded || usage.exceeded,
    },
    lastDiscoveryAt: youtube.discovered ? nowIso : previous.lastDiscoveryAt,
    lastFallbackAt: youtube.fellBack ? nowIso : previous.lastFallbackAt,
    avatarsFetchedAt: due ? nowIso : previous.avatarsFetchedAt,
    youtubeLive: youtube.live,
    youtubeErrors: youtube.errors,
    avatars,
  };
  // 値が undefined のキーは出力しない
  for (const key of ["lastDiscoveryAt", "lastFallbackAt", "avatarsFetchedAt"] as const) {
    if (state[key] === undefined) delete state[key];
  }

  return { siteData, state, plan };
}

export const requiredSecrets = (teams: TeamsFile) => {
  const platforms = new Set(allChannels(teams).map((c) => c.platform));
  return [
    ...(platforms.has("twitch") ? ["TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET"] : []),
    ...(platforms.has("youtube") ? ["YOUTUBE_API_KEY"] : []),
  ];
};
