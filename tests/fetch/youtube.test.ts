import { describe, expect, it, vi } from "vitest";
import type { FetchFn } from "../../src/fetch/types";
import {
  createYouTubeClient,
  fetchYouTube,
  fetchYouTubeAvatars,
  parseFeed,
  QuotaExceededError,
  type YouTubeRequest,
} from "../../src/fetch/youtube";

const NOW = new Date("2026-10-25T12:00:00Z");
const CH_A = "UC" + "a".repeat(22);
const CH_B = "UC" + "b".repeat(22);
const recent = "2026-10-25T10:00:00+00:00";

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
  snippet: { title, liveBroadcastContent: live, thumbnails: { medium: { url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` } } },
  contentDetails: { duration },
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const quotaError = () => json({ error: { errors: [{ reason: "quotaExceeded" }] } }, 403);

type MockOptions = {
  feeds?: Record<string, string | number>;
  uploads?: Record<string, { id: string; published?: string }[] | number>;
  videos?: Video[];
  videosStatus?: () => Response | undefined;
};

function mockFetch({ feeds = {}, uploads = {}, videos = [], videosStatus }: MockOptions) {
  return vi.fn<FetchFn>(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/feeds/videos.xml") {
      const body = feeds[url.searchParams.get("channel_id") ?? ""];
      return typeof body === "string" ? new Response(body) : new Response("", { status: body ?? 404 });
    }
    if (url.pathname === "/youtube/v3/playlistItems") {
      const body = uploads[`UC${(url.searchParams.get("playlistId") ?? "").slice(2)}`];
      if (typeof body !== "object") return json({}, body ?? 404);
      return json({ items: body.map((v) => ({ contentDetails: { videoId: v.id, videoPublishedAt: v.published } })) });
    }
    const failure = videosStatus?.();
    if (failure) return failure;
    const ids = (url.searchParams.get("id") ?? "").split(",");
    return json({ items: videos.filter((v) => ids.includes(v.id)).map(video) });
  });
}

const request = (overrides: Partial<YouTubeRequest> = {}): YouTubeRequest => ({
  channelIds: [CH_A, CH_B],
  previousLive: {},
  previousErrors: [],
  plan: { discover: true, fallback: true },
  ...overrides,
});

const run = async (options: MockOptions, req: Partial<YouTubeRequest> = {}) => {
  const fetchFn = mockFetch(options);
  const client = createYouTubeClient("key", fetchFn);
  const result = await fetchYouTube(request(req), client, fetchFn, NOW);
  const apiCalls = fetchFn.mock.calls.map(([input]) => new URL(String(input))).filter((u) => u.hostname === "www.googleapis.com");
  const rssCalls = fetchFn.mock.calls.filter(([input]) => new URL(String(input)).pathname === "/feeds/videos.xml");
  return { result, client, apiCalls, rssCalls, state: (id: string) => result.results.get(id)?.state };
};

describe("parseFeed", () => {
  it("動画 ID と公開日時を取り出す", () => {
    expect(parseFeed(feed([{ id: "v1", published: recent }]))).toEqual([{ videoId: "v1", published: new Date(recent) }]);
    expect(parseFeed(feed([]))).toEqual([]);
  });
});

describe("createYouTubeClient（AC-43）", () => {
  it("呼んだ回数を使用量として数え、キーを付けて呼ぶ", async () => {
    const fetchFn = vi.fn<FetchFn>(async () => json({ items: [] }));
    const client = createYouTubeClient("secret-key", fetchFn);
    await client.get("videos", { id: "v1" });
    await client.get("channels", { id: "c1" });
    expect(client.used).toBe(2);
    expect(new URL(String(fetchFn.mock.calls[0]![0])).searchParams.get("key")).toBe("secret-key");
  });

  it("クォータ超過の応答を記録し、エラーに API キーを含めない", async () => {
    const client = createYouTubeClient("secret-key", vi.fn<FetchFn>(async () => quotaError()));
    const error = await client.get("videos", {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(QuotaExceededError);
    expect(String(error)).not.toContain("secret-key");
    expect(client.exceeded).toBe(true);
  });
});

describe("fetchYouTube: 新しい配信の確認", () => {
  it("配信中の動画があれば live（サムネイル付き）、なければ offline", async () => {
    const { result, state } = await run({
      feeds: { [CH_A]: feed([{ id: "v1", published: recent }]), [CH_B]: feed([{ id: "v2", published: recent }]) },
      videos: [
        { id: "v1", title: "LTK 本番", live: "live", duration: "P0D" },
        { id: "v2", live: "none", duration: "PT1H" },
      ],
    });
    expect(result.results.get(CH_A)).toEqual({
      state: "live",
      streams: [
        {
          title: "LTK 本番",
          url: "https://www.youtube.com/watch?v=v1",
          thumbnailUrl: "https://i.ytimg.com/vi/v1/mqdefault.jpg",
          videoId: "v1",
        },
      ],
    });
    expect(state(CH_B)).toBe("offline");
    expect(result.live).toEqual({ [CH_A]: ["v1"] });
    expect(result.discovered).toBe(true);
  });

  it("配信予定とプレミア公開は配信中に含めない", async () => {
    const { state } = await run({
      feeds: { [CH_A]: feed([{ id: "up", published: recent }, { id: "pre", published: recent }]), [CH_B]: feed([]) },
      videos: [
        { id: "up", live: "upcoming", duration: "P0D" },
        { id: "pre", live: "live", duration: "PT3M20S" },
      ],
    });
    expect(state(CH_A)).toBe("offline");
  });

  it("同時に複数配信していればすべて返す（AC-8）", async () => {
    const { result } = await run({
      feeds: { [CH_A]: feed([{ id: "v1", published: recent }, { id: "v2", published: recent }]), [CH_B]: feed([]) },
      videos: [
        { id: "v1", title: "1", live: "live", duration: "P0D" },
        { id: "v2", title: "2", live: "live", duration: "P0D" },
      ],
    });
    expect(result.results.get(CH_A)?.streams.map((s) => s.title)).toEqual(["1", "2"]);
  });

  it("7日より前に公開された動画は問い合わせない", async () => {
    const { state, apiCalls } = await run({
      feeds: { [CH_A]: feed([{ id: "old", published: "2026-10-17T12:00:00+00:00" }]), [CH_B]: feed([]) },
      videos: [{ id: "old", live: "live", duration: "P0D" }],
    });
    expect(state(CH_A)).toBe("offline");
    expect(apiCalls).toHaveLength(0);
  });

  it("videos.list は 50 件ずつ呼ぶ", async () => {
    const channels = Array.from({ length: 4 }, (_, i) => `UC${String(i).repeat(22)}`);
    const entries = (ci: number) => Array.from({ length: 15 }, (_, i) => ({ id: `${ci}-v${i}`, published: recent }));
    const { apiCalls } = await run(
      { feeds: Object.fromEntries(channels.map((c, ci) => [c, feed(entries(ci))])) },
      { channelIds: channels },
    );
    expect(apiCalls.map((u) => u.searchParams.get("id")?.split(",").length)).toEqual([50, 10]);
    expect(apiCalls[0]?.searchParams.get("part")).toBe("snippet,contentDetails");
  });

  it("RSS に失敗したチャンネルはアップロード再生リストで取り直す（AC-40）", async () => {
    const { result, state, apiCalls } = await run({
      feeds: { [CH_A]: 404, [CH_B]: feed([]) },
      uploads: { [CH_A]: [{ id: "v1", published: recent }] },
      videos: [{ id: "v1", live: "live", duration: "P0D" }],
    });
    expect(state(CH_A)).toBe("live");
    expect(apiCalls[0]?.pathname).toBe("/youtube/v3/playlistItems");
    expect(apiCalls[0]?.searchParams.get("playlistId")).toBe(`UU${"a".repeat(22)}`);
    expect(result.fellBack).toBe(true);
  });

  it("取り直しにも失敗したチャンネルだけ error になる（AC-22, AC-40）", async () => {
    const { result, state } = await run({ feeds: { [CH_A]: 404, [CH_B]: feed([]) }, uploads: { [CH_A]: 500 } });
    expect(state(CH_A)).toBe("error");
    expect(state(CH_B)).toBe("offline");
    expect(result.errors).toEqual([CH_A]);
  });

  it("取り直しが許されていなければ、RSS に失敗したチャンネルは error", async () => {
    const { state, apiCalls, result } = await run(
      { feeds: { [CH_A]: 404, [CH_B]: feed([]) } },
      { plan: { discover: true, fallback: false } },
    );
    expect(state(CH_A)).toBe("error");
    expect(apiCalls).toHaveLength(0);
    expect(result.fellBack).toBe(false);
  });

  it("RSS がすべて成功したときは、取り直しをしたことにしない", async () => {
    const { result } = await run({ feeds: { [CH_A]: feed([]), [CH_B]: feed([]) } });
    expect(result.fellBack).toBe(false);
  });

  it("videos.list が失敗したら、問い合わせたチャンネルが error になる", async () => {
    const { state } = await run({
      feeds: { [CH_A]: feed([{ id: "v1", published: recent }]), [CH_B]: feed([]) },
      videosStatus: () => json({}, 500),
    });
    expect(state(CH_A)).toBe("error");
    expect(state(CH_B)).toBe("offline");
  });

  it("通信そのものが失敗しても例外を投げない", async () => {
    const fetchFn = vi.fn<FetchFn>(async () => {
      throw new TypeError("network");
    });
    const result = await fetchYouTube(request(), createYouTubeClient("key", fetchFn), fetchFn, NOW);
    expect(result.results.get(CH_A)?.state).toBe("error");
  });
});

describe("fetchYouTube: 終了チェック（節約 A）", () => {
  it("前回配信中だったチャンネルは RSS を呼ばず、前回の動画 ID だけ確かめる", async () => {
    const { result, rssCalls, apiCalls } = await run(
      {
        feeds: { [CH_B]: feed([]) },
        videos: [{ id: "v1", live: "live", duration: "P0D" }],
      },
      { previousLive: { [CH_A]: ["v1"] } },
    );
    expect(result.results.get(CH_A)?.state).toBe("live");
    expect(rssCalls.map(([input]) => new URL(String(input)).searchParams.get("channel_id"))).toEqual([CH_B]);
    expect(apiCalls.map((u) => u.searchParams.get("id"))).toEqual(["v1"]);
  });

  it("配信が終わっていれば offline になり、次の回から確認の対象に戻る", async () => {
    const { result } = await run(
      { feeds: { [CH_B]: feed([]) }, videos: [{ id: "v1", live: "none", duration: "PT2H" }] },
      { previousLive: { [CH_A]: ["v1"] } },
    );
    expect(result.results.get(CH_A)?.state).toBe("offline");
    expect(result.live).toEqual({});
  });

  it("新しい配信の確認をしない回も、終了チェックは行う", async () => {
    const { result, rssCalls } = await run(
      { videos: [{ id: "v1", live: "live", duration: "P0D" }] },
      { previousLive: { [CH_A]: ["v1"] }, previousErrors: [CH_B], plan: { discover: false, fallback: false } },
    );
    expect(rssCalls).toHaveLength(0);
    expect(result.results.get(CH_A)?.state).toBe("live");
    // 確認しない回は、前回失敗したチャンネルの error を引き継ぐ
    expect(result.results.get(CH_B)?.state).toBe("error");
    expect(result.discovered).toBe(false);
  });

  it("データからいなくなったチャンネルの前回の配信は無視する", async () => {
    const { apiCalls } = await run(
      { feeds: { [CH_A]: feed([]), [CH_B]: feed([]) } },
      { previousLive: { UCgone: ["vx"] } },
    );
    expect(apiCalls).toHaveLength(0);
  });
});

describe("fetchYouTube: クォータ超過（AC-43）", () => {
  it("RSS も取り直しも失敗して候補がなければ、videos.list は呼ばない", async () => {
    const { client, state, apiCalls } = await run({
      feeds: { [CH_A]: 404, [CH_B]: 404 },
      uploads: {},
      videosStatus: () => quotaError(),
    });
    expect(state(CH_A)).toBe("error");
    expect(apiCalls.map((u) => u.pathname)).toEqual(["/youtube/v3/playlistItems", "/youtube/v3/playlistItems"]);
    expect(client.exceeded).toBe(false);
  });

  it("取り直しの途中で超過したら、残りのチャンネルは呼ばずに error にする", async () => {
    const fetchFn = vi.fn<FetchFn>(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/feeds/videos.xml") return new Response("", { status: 404 });
      return quotaError();
    });
    const client = createYouTubeClient("key", fetchFn);
    const result = await fetchYouTube(request(), client, fetchFn, NOW);
    expect(client.exceeded).toBe(true);
    expect(client.used).toBe(1);
    expect([...result.results.values()].map((r) => r.state)).toEqual(["error", "error"]);
  });
});

describe("fetchYouTubeAvatars（AC-27）", () => {
  it("チャンネル ID ごとのアイコン画像を返す（medium がなければ default）", async () => {
    const fetchFn = vi.fn<FetchFn>(async () =>
      json({
        items: [
          { id: CH_A, snippet: { thumbnails: { default: { url: "a-default" }, medium: { url: "a-medium" } } } },
          { id: CH_B, snippet: { thumbnails: { default: { url: "b-default" } } } },
        ],
      }),
    );
    const client = createYouTubeClient("key", fetchFn);
    const avatars = await fetchYouTubeAvatars([CH_A, CH_B], client);
    expect(Object.fromEntries(avatars)).toEqual({ [CH_A]: "a-medium", [CH_B]: "b-default" });
    expect(new URL(String(fetchFn.mock.calls[0]![0])).pathname).toBe("/youtube/v3/channels");
    expect(client.used).toBe(1);
  });

  it("失敗しても例外を投げずに空を返す", async () => {
    const client = createYouTubeClient("key", vi.fn<FetchFn>(async () => json({}, 403)));
    expect((await fetchYouTubeAvatars([CH_A], client)).size).toBe(0);
  });
});
