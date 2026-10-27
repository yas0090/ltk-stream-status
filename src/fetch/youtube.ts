import { chunk, FAILED, OFFLINE, type ChannelResult, type FetchFn, type RawStream } from "./types";

type VideosResponse = {
  items: {
    id: string;
    snippet: {
      title: string;
      liveBroadcastContent: "live" | "upcoming" | "none";
      thumbnails?: Record<string, { url: string } | undefined>;
    };
    contentDetails: { duration: string };
  }[];
};

type PlaylistItemsResponse = {
  items?: { contentDetails: { videoId: string; videoPublishedAt?: string } }[];
};

type ChannelsResponse = {
  items?: { id: string; snippet: { thumbnails: Record<string, { url: string } | undefined> } }[];
};

type FeedEntry = { videoId: string; published: Date };

const BATCH_SIZE = 50;
const CANDIDATE_WINDOW_MS = 7 * 24 * 60 * 60_000;
const CONCURRENCY = 10;

export const youtubeChannelUrl = (channelId: string) => `https://www.youtube.com/channel/${channelId}`;
const videoUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;

// RSS は構造が決まっているので、XML パーサーを使わずに必要な要素だけ取り出す。
// 事前に枠を作った配信は published が古いまま配信が始まるので、updated の方が新しければそちらを使う
export function parseFeed(xml: string): FeedEntry[] {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].flatMap(([, entry = ""]) => {
    const videoId = /<yt:videoId>([^<]+)<\/yt:videoId>/.exec(entry)?.[1];
    const published = /<published>([^<]+)<\/published>/.exec(entry)?.[1];
    const updated = /<updated>([^<]+)<\/updated>/.exec(entry)?.[1];
    if (!videoId || !published) return [];
    const dates = [new Date(published), ...(updated ? [new Date(updated)] : [])];
    return [{ videoId, published: new Date(Math.max(...dates.map((d) => d.getTime()))) }];
  });
}

export class QuotaExceededError extends Error {
  override name = "QuotaExceededError";
}

// YouTube Data API の呼び出し。呼んだ回数を使用量として数え、クォータ超過を記録する（AC-43）。
// 今回使う list 系のメソッドは、どれも 1 回 1 ユニット
export type YouTubeClient = {
  get: <T>(resource: string, params: Record<string, string>) => Promise<T>;
  readonly used: number;
  readonly exceeded: boolean;
};

export function createYouTubeClient(apiKey: string, fetchFn: FetchFn = fetch): YouTubeClient {
  let used = 0;
  let exceeded = false;
  return {
    get: async <T>(resource: string, params: Record<string, string>) => {
      const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
      url.searchParams.set("key", apiKey);
      used++;
      const res = await fetchFn(url);
      if (res.ok) return (await res.json()) as T;
      // URL に API キーが含まれるので、エラーには URL を含めない
      const body = (await res.json().catch(() => ({}))) as { error?: { errors?: { reason?: string }[] } };
      const reason = body.error?.errors?.[0]?.reason;
      if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
        exceeded = true;
        throw new QuotaExceededError(`YouTube API のクォータを超えました (${resource})`);
      }
      throw new Error(`YouTube API の呼び出しに失敗しました (${resource}, HTTP ${res.status})`);
    },
    get used() {
      return used;
    },
    get exceeded() {
      return exceeded;
    },
  };
}

async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const recentIds = (entries: FeedEntry[], now: Date) =>
  entries.filter((e) => now.getTime() - e.published.getTime() <= CANDIDATE_WINDOW_MS).map((e) => e.videoId);

async function fetchFeed(channelId: string, fetchFn: FetchFn, now: Date): Promise<string[]> {
  const url = new URL("https://www.youtube.com/feeds/videos.xml");
  url.searchParams.set("channel_id", channelId);
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`YouTube の RSS 取得に失敗しました (${channelId}, HTTP ${res.status})`);
  return recentIds(parseFeed(await res.text()), now);
}

// RSS に失敗したときの取り直し（AC-40）。アップロード再生リストの ID はチャンネル ID の UC を UU に変えたもの
async function fetchUploads(channelId: string, client: YouTubeClient, now: Date): Promise<string[]> {
  const body = await client.get<PlaylistItemsResponse>("playlistItems", {
    part: "contentDetails",
    playlistId: `UU${channelId.slice(2)}`,
    maxResults: "10",
  });
  return recentIds(
    (body.items ?? []).map(({ contentDetails: c }) => ({
      videoId: c.videoId,
      // 配信予定などで公開日時がないものは、候補に含める
      published: c.videoPublishedAt ? new Date(c.videoPublishedAt) : now,
    })),
    now,
  );
}

// 配信予定（upcoming）は liveBroadcastContent で、プレミア公開は長さ（P0D 以外）で除外する
const isLiveStream = (item: VideosResponse["items"][number]) =>
  item.snippet.liveBroadcastContent === "live" && item.contentDetails.duration === "P0D";

export type YouTubeRequest = {
  channelIds: readonly string[];
  // 前回配信中だったチャンネル ID → 動画 ID（終了チェックに使う）
  previousLive: Readonly<Record<string, readonly string[]>>;
  // 前回の新しい配信の確認で失敗したチャンネル（確認しない回は引き継ぐ）
  previousErrors: readonly string[];
  plan: { discover: boolean; fallback: boolean };
};

export type YouTubeResult = {
  results: Map<string, ChannelResult>;
  live: Record<string, string[]>;
  errors: string[];
  discovered: boolean;
  fellBack: boolean;
};

// 配信中だったチャンネルは終了チェックだけにし（節約 A）、それ以外は plan に従って新しい配信を確認する。
// 失敗したチャンネルは error にし、例外は投げない（AC-22, AC-40, AC-43）
export async function fetchYouTube(
  request: YouTubeRequest,
  client: YouTubeClient,
  fetchFn: FetchFn = fetch,
  now: Date = new Date(),
): Promise<YouTubeResult> {
  const ids = [...new Set(request.channelIds)];
  const previousLive = Object.fromEntries(
    Object.entries(request.previousLive).filter(([id, videos]) => ids.includes(id) && videos.length > 0),
  );
  const owner = new Map<string, string>();
  for (const [channelId, videos] of Object.entries(previousLive)) for (const v of videos) owner.set(v, channelId);

  const errors = new Set<string>();
  let fellBack = false;
  const targets = ids.filter((id) => !(id in previousLive));
  const addCandidates = (channelId: string, videoIds: string[]) => videoIds.forEach((v) => owner.set(v, channelId));

  if (request.plan.discover) {
    const failed: string[] = [];
    await mapWithConcurrency(targets, CONCURRENCY, async (channelId) => {
      try {
        addCandidates(channelId, await fetchFeed(channelId, fetchFn, now));
      } catch (error) {
        console.warn(String(error));
        failed.push(channelId);
      }
    });
    if (request.plan.fallback) {
      fellBack = failed.length > 0;
      for (const channelId of failed) {
        if (client.exceeded) {
          errors.add(channelId);
          continue;
        }
        try {
          addCandidates(channelId, await fetchUploads(channelId, client, now));
        } catch (error) {
          console.warn(String(error));
          errors.add(channelId);
        }
      }
    } else {
      failed.forEach((channelId) => errors.add(channelId));
    }
  } else {
    request.previousErrors.filter((id) => targets.includes(id)).forEach((id) => errors.add(id));
  }

  const liveStreams = new Map<string, RawStream[]>();
  for (const batch of chunk([...owner.keys()], BATCH_SIZE)) {
    try {
      if (client.exceeded) throw new QuotaExceededError("YouTube API のクォータを超えています");
      const body = await client.get<VideosResponse>("videos", {
        part: "snippet,contentDetails",
        id: batch.join(","),
        maxResults: String(BATCH_SIZE),
      });
      for (const item of body.items) {
        const channelId = owner.get(item.id);
        if (!channelId || !isLiveStream(item)) continue;
        const thumbnail = item.snippet.thumbnails?.medium ?? item.snippet.thumbnails?.default;
        liveStreams.set(channelId, [
          ...(liveStreams.get(channelId) ?? []),
          { title: item.snippet.title, url: videoUrl(item.id), thumbnailUrl: thumbnail?.url, videoId: item.id },
        ]);
      }
    } catch (error) {
      console.warn(String(error));
      for (const videoId of batch) errors.add(owner.get(videoId)!);
    }
  }

  const results = new Map<string, ChannelResult>();
  const live: Record<string, string[]> = {};
  for (const id of ids) {
    const streams = liveStreams.get(id);
    if (streams && !errors.has(id)) {
      results.set(id, { state: "live", streams });
      live[id] = streams.map((s) => s.videoId!);
    } else {
      results.set(id, errors.has(id) ? FAILED : OFFLINE);
    }
  }
  return {
    results,
    live,
    errors: ids.filter((id) => errors.has(id) && !(id in live)),
    discovered: request.plan.discover,
    fellBack,
  };
}

// キーはチャンネル ID。取得できなかったチャンネルは含めない（AC-27）
export async function fetchYouTubeAvatars(channelIds: readonly string[], client: YouTubeClient): Promise<Map<string, string>> {
  const avatars = new Map<string, string>();
  for (const batch of chunk([...new Set(channelIds)], BATCH_SIZE)) {
    try {
      const body = await client.get<ChannelsResponse>("channels", {
        part: "snippet",
        id: batch.join(","),
        maxResults: String(BATCH_SIZE),
      });
      for (const item of body.items ?? []) {
        const thumbnail = item.snippet.thumbnails.medium ?? item.snippet.thumbnails.default;
        if (thumbnail?.url) avatars.set(item.id, thumbnail.url);
      }
    } catch (error) {
      console.warn(String(error));
    }
  }
  return avatars;
}
