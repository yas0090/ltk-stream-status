import { describe, expect, it, vi } from "vitest";
import { createTwitchTokenProvider, fetchTwitchAvatars, fetchTwitchStatuses } from "../../src/fetch/twitch";
import type { FetchFn } from "../../src/fetch/types";

const credentials = { clientId: "cid", clientSecret: "secret" };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const stream = (login: string, title: string) => ({ user_login: login, title, type: "live" });

// /helix/streams への呼び出しごとに handler の結果を返すモック
function mockFetch(handler: (logins: string[]) => Response) {
  return vi.fn<FetchFn>(async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "id.twitch.tv") return json({ access_token: "token", expires_in: 3600 });
    return handler(url.searchParams.getAll("user_login"));
  });
}

describe("fetchTwitchStatuses", () => {
  it("配信中と配信していない人を判定する", async () => {
    const fetchFn = mockFetch(() => json({ data: [stream("alice", "LTK スクリム")] }));
    const result = await fetchTwitchStatuses(["alice", "bob"], credentials, fetchFn);

    expect(result.get("alice")).toEqual({
      state: "live",
      streams: [{ title: "LTK スクリム", url: "https://www.twitch.tv/alice" }],
    });
    expect(result.get("bob")).toEqual({ state: "offline", streams: [] });
  });

  it("ログイン名の大文字・小文字の違いを吸収する", async () => {
    const fetchFn = mockFetch(() => json({ data: [stream("alice", "t")] }));
    const result = await fetchTwitchStatuses(["Alice"], credentials, fetchFn);
    expect(result.get("alice")?.state).toBe("live");
  });

  it("Client-ID とトークンを付けて呼ぶ", async () => {
    const fetchFn = mockFetch(() => json({ data: [] }));
    await fetchTwitchStatuses(["alice"], credentials, fetchFn);

    const [, init] = fetchFn.mock.calls[1]!;
    const headers = new Headers(init?.headers);
    expect(headers.get("Client-Id")).toBe("cid");
    expect(headers.get("Authorization")).toBe("Bearer token");
  });

  it("100件を超える場合は分けて呼ぶ", async () => {
    const logins = Array.from({ length: 150 }, (_, i) => `user${i}`);
    const batches: string[][] = [];
    const fetchFn = mockFetch((batch) => {
      batches.push(batch);
      return json({ data: batch.includes("user120") ? [stream("user120", "t")] : [] });
    });
    const result = await fetchTwitchStatuses(logins, credentials, fetchFn);

    expect(batches.map((b) => b.length)).toEqual([100, 50]);
    expect(result.size).toBe(150);
    expect(result.get("user120")?.state).toBe("live");
  });

  it("失敗したバッチのチャンネルだけ error になる（AC-22）", async () => {
    const logins = Array.from({ length: 150 }, (_, i) => `user${i}`);
    const fetchFn = mockFetch((batch) => (batch.includes("user0") ? json({}, 500) : json({ data: [] })));
    const result = await fetchTwitchStatuses(logins, credentials, fetchFn);

    expect(result.get("user0")?.state).toBe("error");
    expect(result.get("user99")?.state).toBe("error");
    expect(result.get("user100")?.state).toBe("offline");
  });

  it("通信そのものが失敗しても例外を投げずに error にする", async () => {
    const fetchFn = mockFetch(() => {
      throw new TypeError("network");
    });
    const result = await fetchTwitchStatuses(["alice"], credentials, fetchFn);
    expect(result.get("alice")?.state).toBe("error");
  });

  it("トークンを取得できなければ全員 error になる", async () => {
    const fetchFn = vi.fn<FetchFn>(async () => json({}, 401));
    const result = await fetchTwitchStatuses(["alice", "bob"], credentials, fetchFn);
    expect([...result.values()].map((r) => r.state)).toEqual(["error", "error"]);
  });

  it("チャンネルがなければ API を呼ばない", async () => {
    const fetchFn = mockFetch(() => json({ data: [] }));
    expect((await fetchTwitchStatuses([], credentials, fetchFn)).size).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("fetchTwitchAvatars（AC-27）", () => {
  const usersFetch = (handler: (logins: string[]) => Response) =>
    vi.fn<FetchFn>(async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "id.twitch.tv") return json({ access_token: "token" });
      return handler(url.searchParams.getAll("login"));
    });

  it("ログイン名ごとのアイコン画像を返す", async () => {
    const fetchFn = usersFetch((logins) =>
      json({ data: logins.filter((l) => l !== "ghost").map((l) => ({ login: l, profile_image_url: `https://img/${l}.png` })) }),
    );
    const avatars = await fetchTwitchAvatars(["Alice", "ghost"], credentials, fetchFn);
    expect(Object.fromEntries(avatars)).toEqual({ alice: "https://img/alice.png" });
  });

  it("失敗しても例外を投げずに空を返す", async () => {
    const fetchFn = usersFetch(() => json({}, 500));
    expect((await fetchTwitchAvatars(["alice"], credentials, fetchFn)).size).toBe(0);
  });

  it("トークンを配信状態の取得と使い回せる", async () => {
    const fetchFn = mockFetch(() => json({ data: [] }));
    const getToken = createTwitchTokenProvider(credentials, fetchFn);
    await fetchTwitchStatuses(["alice"], credentials, fetchFn, getToken);
    await fetchTwitchAvatars(["alice"], credentials, fetchFn, getToken);
    const tokenCalls = fetchFn.mock.calls.filter(([input]) => new URL(String(input)).hostname === "id.twitch.tv");
    expect(tokenCalls).toHaveLength(1);
  });
});

