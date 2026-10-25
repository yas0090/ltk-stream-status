import { describe, expect, it, vi } from "vitest";
import { fetchYouTubeStatuses, parseFeed } from "../../src/fetch/youtube";
import type { FetchFn } from "../../src/fetch/types";

const NOW = new Date("2026-10-25T12:00:00Z");
const CH_A = "UC" + "a".repeat(22);
const CH_B = "UC" + "b".repeat(22);

const feed = (entries: { id: string; published: string }[]) => `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">
  <title>channel</title>
  ${entries
    .map(
      (e) => `<entry>
    <id>yt:video:${e.id}</id>
    <yt:videoId>${e.id}</yt:videoId>
    <title>title</title>
    <published>${e.published}</published>
  </entry>`,
    )
    .join("\n")}
</feed>`;

type Video = { id: string; title?: string; live: "live" | "upcoming" | "none"; duration: string };
const video = ({ id, title = "配信", live, duration }: Video) => ({
  id,
  snippet: { title, liveBroadcastContent: live },
  contentDetails: { duration },
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function mockFetch(options: {
  feeds: Record<string, string | number>;
  videos?: Video[];
  videosStatus?: number;
}) {
  return vi.fn<FetchFn>(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/feeds/videos.xml") {
      const body = options.feeds[url.searchParams.get("channel_id") ?? ""];
      return typeof body === "string" ? new Response(body) : new Response("", { status: body ?? 404 });
    }
    if (options.videosStatus) return json({}, options.videosStatus);
    const ids = (url.searchParams.get("id") ?? "").split(",");
    return json({ items: (options.videos ?? []).filter((v) => ids.includes(v.id)).map(video) });
  });
}

const recent = "2026-10-25T10:00:00+00:00";

describe("parseFeed", () => {
  it("動画 ID と公開日時を取り出す", () => {
    expect(parseFeed(feed([{ id: "v1", published: recent }]))).toEqual([{ videoId: "v1", published: new Date(recent) }]);
  });

  it("動画がなければ空", () => {
    expect(parseFeed(feed([]))).toEqual([]);
  });
});

describe("fetchYouTubeStatuses", () => {
  it("配信中の動画があれば live、なければ offline", async () => {
    const fetchFn = mockFetch({
      feeds: { [CH_A]: feed([{ id: "v1", published: recent }]), [CH_B]: feed([{ id: "v2", published: recent }]) },
      videos: [
        { id: "v1", title: "LTK 本番", live: "live", duration: "P0D" },
        { id: "v2", live: "none", duration: "PT1H" },
      ],
    });
    const result = await fetchYouTubeStatuses([CH_A, CH_B], "key", fetchFn, NOW);

    expect(result.get(CH_A)).toEqual({
      state: "live",
      streams: [{ title: "LTK 本番", url: "https://www.youtube.com/watch?v=v1" }],
    });
    expect(result.get(CH_B)).toEqual({ state: "offline", streams: [] });
  });

  it("配信予定とプレミア公開は配信中に含めない", async () => {
    const fetchFn = mockFetch({
      feeds: { [CH_A]: feed([{ id: "up", published: recent }, { id: "pre", published: recent }]) },
      videos: [
        { id: "up", live: "upcoming", duration: "P0D" },
        { id: "pre", live: "live", duration: "PT3M20S" },
      ],
    });
    expect((await fetchYouTubeStatuses([CH_A], "key", fetchFn, NOW)).get(CH_A)?.state).toBe("offline");
  });

  it("同時に複数配信していればすべて返す（AC-8）", async () => {
    const fetchFn = mockFetch({
      feeds: { [CH_A]: feed([{ id: "v1", published: recent }, { id: "v2", published: recent }]) },
      videos: [
        { id: "v1", title: "1", live: "live", duration: "P0D" },
        { id: "v2", title: "2", live: "live", duration: "P0D" },
      ],
    });
    const result = await fetchYouTubeStatuses([CH_A], "key", fetchFn, NOW);
    expect(result.get(CH_A)?.streams.map((s) => s.title)).toEqual(["1", "2"]);
  });

  it("7日より前に公開された動画は問い合わせない", async () => {
    const fetchFn = mockFetch({
      feeds: { [CH_A]: feed([{ id: "old", published: "2026-10-17T12:00:00+00:00" }]) },
      videos: [{ id: "old", live: "live", duration: "P0D" }],
    });
    const result = await fetchYouTubeStatuses([CH_A], "key", fetchFn, NOW);
    expect(result.get(CH_A)?.state).toBe("offline");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("videos.list は 50 件ずつ、キーを付けて呼ぶ", async () => {
    const entries = Array.from({ length: 15 }, (_, i) => ({ id: `v${i}`, published: recent }));
    const channels = Array.from({ length: 4 }, (_, i) => `UC${String(i).repeat(22)}`);
    const feeds = Object.fromEntries(
      channels.map((c, ci) => [c, feed(entries.map((e) => ({ ...e, id: `${ci}-${e.id}` })))]),
    );
    const fetchFn = mockFetch({ feeds });
    await fetchYouTubeStatuses(channels, "key", fetchFn, NOW);

    const apiCalls = fetchFn.mock.calls.map(([input]) => new URL(String(input))).filter((u) => u.pathname === "/youtube/v3/videos");
    expect(apiCalls.map((u) => u.searchParams.get("id")?.split(",").length)).toEqual([50, 10]);
    expect(apiCalls[0]?.searchParams.get("key")).toBe("key");
    expect(apiCalls[0]?.searchParams.get("part")).toBe("snippet,contentDetails");
  });

  it("RSS の取得に失敗したチャンネルだけ error になる（AC-22）", async () => {
    const fetchFn = mockFetch({ feeds: { [CH_A]: 500, [CH_B]: feed([]) } });
    const result = await fetchYouTubeStatuses([CH_A, CH_B], "key", fetchFn, NOW);
    expect(result.get(CH_A)?.state).toBe("error");
    expect(result.get(CH_B)?.state).toBe("offline");
  });

  it("videos.list が失敗したら、問い合わせたチャンネルが error になる（AC-22）", async () => {
    const fetchFn = mockFetch({
      feeds: { [CH_A]: feed([{ id: "v1", published: recent }]), [CH_B]: feed([]) },
      videosStatus: 403,
    });
    const result = await fetchYouTubeStatuses([CH_A, CH_B], "key", fetchFn, NOW);
    expect(result.get(CH_A)?.state).toBe("error");
    expect(result.get(CH_B)?.state).toBe("offline");
  });

  it("通信そのものが失敗しても例外を投げない", async () => {
    const fetchFn = vi.fn<FetchFn>(async () => {
      throw new TypeError("network");
    });
    const result = await fetchYouTubeStatuses([CH_A], "key", fetchFn, NOW);
    expect(result.get(CH_A)?.state).toBe("error");
  });
});
