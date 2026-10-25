import { isLtk } from "../shared/ltk";
import type { ChannelInput, KeywordsFile, TeamsFile } from "../shared/schema";
import type { ChannelStatus, SiteData } from "../shared/types";
import { twitchChannelUrl } from "./twitch";
import { FAILED, type ChannelResult } from "./types";
import { youtubeChannelUrl } from "./youtube";

export type Fetchers = {
  twitch: (logins: string[]) => Promise<Map<string, ChannelResult>>;
  youtube: (channelIds: string[]) => Promise<Map<string, ChannelResult>>;
  // アイコン画像（AC-27）。失敗しても配信状態には影響させない
  twitchAvatars?: (logins: string[]) => Promise<Map<string, string>>;
  youtubeAvatars?: (channelIds: string[]) => Promise<Map<string, string>>;
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

export async function generateSiteData(
  teams: TeamsFile,
  keywords: KeywordsFile,
  fetchers: Fetchers,
  now: Date = new Date(),
): Promise<SiteData> {
  const channels = allChannels(teams);
  const twitchLogins = channels.flatMap((c) => (c.platform === "twitch" ? [c.login] : []));
  const youtubeIds = channels.flatMap((c) => (c.platform === "youtube" ? [c.channelId] : []));

  const [twitch, youtube, twitchAvatars, youtubeAvatars] = await Promise.all([
    twitchLogins.length > 0 ? fetchers.twitch(twitchLogins) : new Map<string, ChannelResult>(),
    youtubeIds.length > 0 ? fetchers.youtube(youtubeIds) : new Map<string, ChannelResult>(),
    fetchAvatars(fetchers.twitchAvatars, twitchLogins),
    fetchAvatars(fetchers.youtubeAvatars, youtubeIds),
  ]);

  // データファイルに書いた順で、最初に取得できたアイコン画像を使う
  const avatarOf = (channels: readonly ChannelInput[]) =>
    channels
      .map((c) => (c.platform === "twitch" ? twitchAvatars.get(c.login.toLowerCase()) : youtubeAvatars.get(c.channelId)))
      .find((url) => url !== undefined);

  const withAvatar = (avatarUrl: string | undefined) => (avatarUrl ? { avatarUrl } : {});

  const toStatus = (channel: ChannelInput): ChannelStatus => {
    const [channelUrl, result] =
      channel.platform === "twitch"
        ? [twitchChannelUrl(channel.login), twitch.get(channel.login.toLowerCase())]
        : [youtubeChannelUrl(channel.channelId), youtube.get(channel.channelId)];
    const { state, streams } = result ?? FAILED;
    return {
      platform: channel.platform,
      channelUrl,
      state,
      streams: streams.map((s) => ({ ...s, ltk: isLtk(s.title, keywords.ltkKeywords) })),
    };
  };

  return {
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
        channels: player.channels.map(toStatus),
      })),
    })),
  };
}

export const requiredSecrets = (teams: TeamsFile) => {
  const platforms = new Set(allChannels(teams).map((c) => c.platform));
  return [
    ...(platforms.has("twitch") ? ["TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET"] : []),
    ...(platforms.has("youtube") ? ["YOUTUBE_API_KEY"] : []),
  ];
};
