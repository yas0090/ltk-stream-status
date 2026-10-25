import { chunk, FAILED, OFFLINE, type ChannelResult, type FetchFn, type RawStream } from "./types";

type VideosResponse = {
  items: {
    id: string;
    snippet: { title: string; liveBroadcastContent: "live" | "upcoming" | "none" };
    contentDetails: { duration: string };
  }[];
};

type FeedEntry = { videoId: string; published: Date };

const BATCH_SIZE = 50;
const CANDIDATE_WINDOW_MS = 7 * 24 * 60 * 60_000;
const FEED_CONCURRENCY = 10;

export const youtubeChannelUrl = (channelId: string) => `https://www.youtube.com/channel/${channelId}`;
const videoUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;

// RSS は構造が決まっているので、XML パーサーを使わずに必要な要素だけ取り出す
export function parseFeed(xml: string): FeedEntry[] {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].flatMap(([, entry = ""]) => {
    const videoId = /<yt:videoId>([^<]+)<\/yt:videoId>/.exec(entry)?.[1];
    const published = /<published>([^<]+)<\/published>/.exec(entry)?.[1];
    return videoId && published ? [{ videoId, published: new Date(published) }] : [];
  });
}

async function fetchFeed(channelId: string, fetchFn: FetchFn): Promise<FeedEntry[]> {
  const url = new URL("https://www.youtube.com/feeds/videos.xml");
  url.searchParams.set("channel_id", channelId);
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`YouTube の RSS 取得に失敗しました (${channelId}, HTTP ${res.status})`);
  return parseFeed(await res.text());
}

// URL に API キーが含まれるので、エラーには URL を含めない
async function fetchVideos(videoIds: string[], apiKey: string, fetchFn: FetchFn) {
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet,contentDetails");
  url.searchParams.set("id", videoIds.join(","));
  url.searchParams.set("maxResults", String(BATCH_SIZE));
  url.searchParams.set("key", apiKey);
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`YouTube の動画情報の取得に失敗しました (HTTP ${res.status})`);
  return ((await res.json()) as VideosResponse).items;
}

// 配信予定（upcoming）は liveBroadcastContent で、プレミア公開は長さ（P0D 以外）で除外する
const isLiveStream = (item: VideosResponse["items"][number]) =>
  item.snippet.liveBroadcastContent === "live" && item.contentDetails.duration === "P0D";

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

// キーはチャンネル ID。失敗したチャンネルは error にし、例外は投げない（AC-22）
export async function fetchYouTubeStatuses(
  channelIds: readonly string[],
  apiKey: string,
  fetchFn: FetchFn = fetch,
  now: Date = new Date(),
): Promise<Map<string, ChannelResult>> {
  const ids = [...new Set(channelIds)];
  const results = new Map<string, ChannelResult>();
  const candidateOwner = new Map<string, string>();

  await mapWithConcurrency(ids, FEED_CONCURRENCY, async (channelId) => {
    try {
      const entries = await fetchFeed(channelId, fetchFn);
      results.set(channelId, OFFLINE);
      for (const entry of entries) {
        if (now.getTime() - entry.published.getTime() <= CANDIDATE_WINDOW_MS) {
          candidateOwner.set(entry.videoId, channelId);
        }
      }
    } catch (error) {
      console.warn(String(error));
      results.set(channelId, FAILED);
    }
  });

  const liveStreams = new Map<string, RawStream[]>();
  for (const batch of chunk([...candidateOwner.keys()], BATCH_SIZE)) {
    try {
      for (const item of await fetchVideos(batch, apiKey, fetchFn)) {
        const channelId = candidateOwner.get(item.id);
        if (!channelId || !isLiveStream(item)) continue;
        liveStreams.set(channelId, [
          ...(liveStreams.get(channelId) ?? []),
          { title: item.snippet.title, url: videoUrl(item.id) },
        ]);
      }
    } catch (error) {
      console.warn(String(error));
      for (const videoId of batch) results.set(candidateOwner.get(videoId)!, FAILED);
    }
  }

  for (const [channelId, streams] of liveStreams) {
    if (results.get(channelId)?.state !== "error") results.set(channelId, { state: "live", streams });
  }
  return results;
}
