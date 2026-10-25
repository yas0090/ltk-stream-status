import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { generateSiteData, requiredSecrets, type Fetchers } from "../../src/fetch/generate";
import type { ChannelResult } from "../../src/fetch/types";
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

const fetchers = (twitch: ChannelResult, youtube: ChannelResult): Fetchers => ({
  twitch: async (logins) => new Map(logins.map((l) => [l.toLowerCase(), twitch])),
  youtube: async (ids) => new Map(ids.map((id) => [id, youtube])),
});

const NOW = new Date("2026-10-25T12:00:00Z");

describe("generateSiteData", () => {
  it("データファイルと取得結果を組み合わせて SiteData を作る", async () => {
    const data = await generateSiteData(
      teamsData(),
      parseKeywordsData({ ltkKeywords: ["LTK"] }),
      fetchers(live("ＬＴＫ スクリム", "https://www.twitch.tv/alice"), { state: "error", streams: [] }),
      NOW,
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
      (await generateSiteData(teamsData(), parseKeywordsData({ ltkKeywords }), f, NOW)).teams[0]?.players[0]
        ?.channels[0]?.streams[0]?.ltk;

    expect(await ltkOf(["LTK"])).toBe(false);
    expect(await ltkOf(["LTK", "k4sen杯"])).toBe(true);
  });

  it("出場者データの変更が出力に反映される（AC-20）", async () => {
    const f = fetchers({ state: "offline", streams: [] }, { state: "offline", streams: [] });
    const data = await generateSiteData(teamsData("改名した選手"), parseKeywordsData({ ltkKeywords: ["LTK"] }), f, NOW);
    expect(data.teams[0]?.players[0]?.name).toBe("改名した選手");
  });

  it("取得結果にないチャンネルは取得失敗として扱う", async () => {
    const data = await generateSiteData(
      teamsData(),
      parseKeywordsData({ ltkKeywords: ["LTK"] }),
      { twitch: async () => new Map(), youtube: async () => new Map() },
      NOW,
    );
    expect(data.teams[0]?.players[0]?.channels.map((c) => c.state)).toEqual(["error", "error"]);
  });

  it("アイコン画像はデータの順で最初に取得できたものを使う（AC-27）", async () => {
    const base = fetchers({ state: "offline", streams: [] }, { state: "offline", streams: [] });
    const avatarOf = async (twitch: Record<string, string>, youtube: Record<string, string>) =>
      (
        await generateSiteData(
          teamsData(),
          parseKeywordsData({ ltkKeywords: ["LTK"] }),
          {
            ...base,
            twitchAvatars: async () => new Map(Object.entries(twitch)),
            youtubeAvatars: async () => new Map(Object.entries(youtube)),
          },
          NOW,
        )
      ).teams[0]?.players[0]?.avatarUrl;

    expect(await avatarOf({ alice: "tw.png" }, { [YT]: "yt.png" })).toBe("tw.png");
    expect(await avatarOf({}, { [YT]: "yt.png" })).toBe("yt.png");
    expect(await avatarOf({}, {})).toBeUndefined();
  });

  it("アイコン画像の取得が失敗しても配信状態は出力される", async () => {
    const data = await generateSiteData(
      teamsData(),
      parseKeywordsData({ ltkKeywords: ["LTK"] }),
      {
        ...fetchers(live("t", "u"), { state: "offline", streams: [] }),
        twitchAvatars: async () => {
          throw new Error("boom");
        },
      },
      NOW,
    );
    const player = data.teams[0]?.players[0];
    expect(player?.avatarUrl).toBeUndefined();
    expect(player?.channels[0]?.state).toBe("live");
  });

  it("使うプラットフォームの秘密情報だけを要求する", () => {
    expect(requiredSecrets(teamsData())).toEqual(["TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET", "YOUTUBE_API_KEY"]);
    expect(requiredSecrets(parseTeamsData({ teams: [] }))).toEqual([]);
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

  it("正しいデータなら出力を書き出す", async () => {
    await expect(runMain("teams: []\n")).resolves.toMatchObject({ stdout: expect.stringMatching(/out\.json/) });
  }, 30_000);
});
