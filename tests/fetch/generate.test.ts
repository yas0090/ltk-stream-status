import { execFile } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseBudget } from "../../src/fetch/budget";
import { generateSiteData, requiredSecrets, type Fetchers, type GenerateOptions } from "../../src/fetch/generate";
import { initialState } from "../../src/fetch/state";
import type { ChannelResult } from "../../src/fetch/types";
import type { YouTubeRequest } from "../../src/fetch/youtube";
import { parse as parseYaml } from "yaml";
import { readFileSync } from "node:fs";
import { parseKeywordsData, parseTeamsData } from "../../src/shared/schema";

const YT = "UC" + "y".repeat(22);

const teamsData = (playerName = "選手1") =>
  parseTeamsData({
    teams: [
      {
        id: "team-a",
        name: "チームA",
        color: "#EF6400",
        players: [
          {
            name: playerName,
            tier: "Core",
            role: "MID",
            channels: [
              { platform: "twitch", login: "Alice" },
              { platform: "youtube", channelId: YT },
            ],
          },
        ],
      },
    ],
  });

const live = (title: string, url: string): ChannelResult => ({ state: "live", streams: [{ title, url }] });

const youtubeResult = (request: YouTubeRequest, result: ChannelResult) => ({
  results: new Map(request.channelIds.map((id) => [id, result])),
  live: result.state === "live" ? Object.fromEntries(request.channelIds.map((id) => [id, ["v-live"]])) : {},
  errors: result.state === "error" ? [...request.channelIds] : [],
  discovered: request.plan.discover,
  fellBack: false,
});

const fetchers = (twitch: ChannelResult, youtube: ChannelResult): Fetchers => ({
  twitch: async (logins) => new Map(logins.map((l) => [l.toLowerCase(), twitch])),
  youtube: async (request) => youtubeResult(request, youtube),
});

const NOW = new Date("2026-10-25T12:00:00Z");
const keywords = parseKeywordsData({ ltkKeywords: ["LTK"] });
const gen = async (f: Fetchers, options: GenerateOptions = {}, teams = teamsData(), kw = keywords) =>
  generateSiteData(teams, kw, f, { now: NOW, ...options });
const offline: ChannelResult = { state: "offline", streams: [] };

describe("generateSiteData", () => {
  it("データファイルと取得結果を組み合わせて SiteData を作る", async () => {
    const { siteData: data } = await gen(
      fetchers(live("ＬＴＫ スクリム", "https://www.twitch.tv/alice"), { state: "error", streams: [] }),
    );

    expect(data).toEqual({
      generatedAt: "2026-10-25T12:00:00.000Z",
      teams: [
        {
          id: "team-a",
          name: "チームA",
          color: "#EF6400",
          players: [
            {
              name: "選手1",
              tier: "Core",
              role: "MID",
              channels: [
                {
                  platform: "twitch",
                  channelUrl: "https://www.twitch.tv/alice",
                  state: "live",
                  streams: [{ title: "ＬＴＫ スクリム", url: "https://www.twitch.tv/alice", ltk: true }],
                },
                { platform: "youtube", channelUrl: `https://www.youtube.com/channel/${YT}`, state: "error", streams: [] },
              ],
            },
          ],
        },
      ],
    });
  });

  it("キーワードを変えると次の生成から判定が変わる（AC-14）", async () => {
    const f = fetchers(live("k4sen杯 練習", "u"), { state: "offline", streams: [] });
    const ltkOf = async (ltkKeywords: string[]) =>
      (await gen(f, {}, teamsData(), parseKeywordsData({ ltkKeywords }))).siteData.teams[0]?.players[0]?.channels[0]
        ?.streams[0]?.ltk;

    expect(await ltkOf(["LTK"])).toBe(false);
    expect(await ltkOf(["LTK", "k4sen杯"])).toBe(true);
  });

  it("出場者データの変更が出力に反映される（AC-20）", async () => {
    const { siteData } = await gen(fetchers(offline, offline), {}, teamsData("改名した選手"));
    expect(siteData.teams[0]?.players[0]?.name).toBe("改名した選手");
  });

  it("取得結果にないチャンネルは取得失敗として扱う", async () => {
    const { siteData } = await gen({
      twitch: async () => new Map(),
      youtube: async () => ({ results: new Map(), live: {}, errors: [], discovered: true, fellBack: false }),
    });
    expect(siteData.teams[0]?.players[0]?.channels.map((c) => c.state)).toEqual(["error", "error"]);
  });

  it("アイコン画像はデータの順で最初に取得できたものを使う（AC-27）", async () => {
    const base = fetchers(offline, offline);
    const avatarOf = async (twitch: Record<string, string>, youtube: Record<string, string>) =>
      (
        await gen({
          ...base,
          twitchAvatars: async () => new Map(Object.entries(twitch)),
          youtubeAvatars: async () => new Map(Object.entries(youtube)),
        })
      ).siteData.teams[0]?.players[0]?.avatarUrl;

    expect(await avatarOf({ alice: "tw.png" }, { [YT]: "yt.png" })).toBe("tw.png");
    expect(await avatarOf({}, { [YT]: "yt.png" })).toBe("yt.png");
    expect(await avatarOf({}, {})).toBeUndefined();
  });

  it("アイコン画像の取得が失敗しても配信状態は出力される", async () => {
    const { siteData } = await gen({
      ...fetchers(live("t", "u"), offline),
      twitchAvatars: async () => {
        throw new Error("boom");
      },
    });
    const player = siteData.teams[0]?.players[0];
    expect(player?.avatarUrl).toBeUndefined();
    expect(player?.channels[0]?.state).toBe("live");
  });

  it("サムネイルを出力し、YouTube の動画 ID は site-data.json に出さない（AC-42）", async () => {
    const { siteData } = await gen(
      fetchers(
        { state: "live", streams: [{ title: "t", url: "u", thumbnailUrl: "https://thumb/t.jpg" }] },
        { state: "live", streams: [{ title: "y", url: "w", thumbnailUrl: "https://thumb/y.jpg", videoId: "v1" }] },
      ),
    );
    const channels = siteData.teams[0]?.players[0]?.channels;
    expect(channels?.map((c) => c.streams[0])).toEqual([
      { title: "t", url: "u", ltk: false, thumbnailUrl: "https://thumb/t.jpg" },
      { title: "y", url: "w", ltk: false, thumbnailUrl: "https://thumb/y.jpg" },
    ]);
  });

  it("使うプラットフォームの秘密情報だけを要求する", () => {
    expect(requiredSecrets(teamsData())).toEqual(["TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET", "YOUTUBE_API_KEY"]);
    expect(requiredSecrets(parseTeamsData({ teams: [] }))).toEqual([]);
  });
});

describe("前回の結果の引き継ぎとクォータ（AC-43）", () => {
  const budget = parseBudget(parseYaml(readFileSync("data/youtube-budget.yaml", "utf8")));
  // NOW = 2026-10-25 12:00 UTC = 21:00 JST（夜）、太平洋時間では 2026-10-25
  const previous = (overrides = {}) => ({ ...initialState(NOW), ...overrides });

  it("前回の配信中・失敗・予算の判定を YouTube の取得に渡す", async () => {
    const youtube = vi.fn(async (request: YouTubeRequest) => youtubeResult(request, offline));
    await gen(
      { ...fetchers(offline, offline), youtube },
      { budget, previousState: previous({ youtubeLive: { [YT]: ["v1"] }, youtubeErrors: ["UCother"] }) },
    );
    expect(youtube.mock.calls[0]![0]).toMatchObject({
      channelIds: [YT],
      previousLive: { [YT]: ["v1"] },
      previousErrors: ["UCother"],
      plan: { discover: true, fallback: true },
    });
  });

  it("使用量を前回の合計に足し、確認した時刻と配信中の動画 ID を記録する", async () => {
    const { state } = await gen(
      { ...fetchers(offline, live("y", "w")), youtubeUsage: () => ({ used: 9, exceeded: false }) },
      { budget, previousState: previous({ quota: { day: "2026-10-25", used: 100, exceeded: false } }) },
    );
    expect(state.quota).toEqual({ day: "2026-10-25", used: 109, exceeded: false });
    expect(state.lastDiscoveryAt).toBe(NOW.toISOString());
    expect(state.youtubeLive).toEqual({ [YT]: ["v-live"] });
  });

  it("太平洋時間の日付が変わっていれば使用量を 0 から数え直す", async () => {
    const { state } = await gen(
      { ...fetchers(offline, offline), youtubeUsage: () => ({ used: 3, exceeded: false }) },
      { previousState: previous({ quota: { day: "2026-10-24", used: 8999, exceeded: true } }) },
    );
    expect(state.quota).toEqual({ day: "2026-10-25", used: 3, exceeded: false });
  });

  it("クォータ超過の応答を受けたら記録し、次の回は新しい配信の確認をしない", async () => {
    const first = await gen(
      { ...fetchers(offline, offline), youtubeUsage: () => ({ used: 1, exceeded: true }) },
      { budget },
    );
    expect(first.state.quota.exceeded).toBe(true);
    const second = await gen(fetchers(offline, offline), { budget, previousState: first.state });
    expect(second.plan.discover).toBe(false);
  });

  it("アイコン画像は 1 時間以内なら前回の URL を使い、新しいチャンネルだけ取りにいく（節約 B）", async () => {
    const twitchAvatars = vi.fn(async (logins: string[]) => new Map(logins.map((l) => [l.toLowerCase(), "new-tw"])));
    const youtubeAvatars = vi.fn(async (ids: string[]) => new Map(ids.map((id) => [id, "new-yt"])));
    const recent = new Date(NOW.getTime() - 30 * 60_000).toISOString();
    const { siteData, state } = await gen(
      { ...fetchers(offline, offline), twitchAvatars, youtubeAvatars },
      { previousState: previous({ avatarsFetchedAt: recent, avatars: { "twitch:alice": "old-tw" } }) },
    );
    expect(twitchAvatars).not.toHaveBeenCalled();
    expect(youtubeAvatars).toHaveBeenCalledWith([YT]);
    expect(siteData.teams[0]?.players[0]?.avatarUrl).toBe("old-tw");
    expect(state.avatars).toEqual({ "twitch:alice": "old-tw", [`youtube:${YT}`]: "new-yt" });
    expect(state.avatarsFetchedAt).toBe(recent);
  });

  it("1 時間たっていれば全員分を取り直す", async () => {
    const twitchAvatars = vi.fn(async () => new Map([["alice", "new-tw"]]));
    const old = new Date(NOW.getTime() - 61 * 60_000).toISOString();
    const { state } = await gen(
      { ...fetchers(offline, offline), twitchAvatars },
      { previousState: previous({ avatarsFetchedAt: old, avatars: { "twitch:alice": "old-tw", "twitch:gone": "x" } }) },
    );
    expect(twitchAvatars).toHaveBeenCalledWith(["Alice"]);
    expect(state.avatars).toEqual({ "twitch:alice": "new-tw" });
    expect(state.avatarsFetchedAt).toBe(NOW.toISOString());
  });
});

describe("main（AC-23）", () => {
  let dir: string | undefined;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  const runMain = async (teamsYaml: string) => {
    dir = await mkdtemp(join(tmpdir(), "ltk-"));
    await writeFile(join(dir, "teams.yaml"), teamsYaml);
    await writeFile(join(dir, "keywords.yaml"), "ltkKeywords:\n  - LTK\n");
    await copyFile("data/youtube-budget.yaml", join(dir, "youtube-budget.yaml"));
    return promisify(execFile)("npx", ["tsx", "src/fetch/main.ts", "--data", dir, "--out", join(dir, "out.json")], {
      env: { ...process.env, TWITCH_CLIENT_ID: "", TWITCH_CLIENT_SECRET: "", YOUTUBE_API_KEY: "" },
    });
  };

  it("検証エラーなら終了コード 1 で終え、問題の場所を出力する", async () => {
    const yaml = "teams:\n  - id: a\n    name: A\n    color: \"#EF6400\"\n    players:\n      - name: x\n        tier: Pro\n        role: TOP\n        channels:\n          - platform: twitch\n            login: x\n";
    await expect(runMain(yaml)).rejects.toMatchObject({ code: 1, stderr: expect.stringMatching(/players\.0\.tier/) });
  }, 30_000);

  it("必要な環境変数がなければ終了コード 1 で終える", async () => {
    const yaml = "teams:\n  - id: a\n    name: A\n    color: \"#EF6400\"\n    players:\n      - name: x\n        tier: Next\n        role: TOP\n        channels:\n          - platform: twitch\n            login: x\n";
    await expect(runMain(yaml)).rejects.toMatchObject({ code: 1, stderr: expect.stringMatching(/TWITCH_CLIENT_ID/) });
  }, 30_000);

  it("正しいデータなら site-data.json と state.json を書き出す", async () => {
    await expect(runMain("teams: []\n")).resolves.toMatchObject({ stdout: expect.stringMatching(/out\.json/) });
    const state = JSON.parse(await readFile(join(dir!, "state.json"), "utf8"));
    expect(state).toMatchObject({ version: 1, quota: { used: 0 } });
  }, 30_000);
});
