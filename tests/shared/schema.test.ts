import { describe, expect, it } from "vitest";
import { DataValidationError, parseKeywordsData, parseTeamsData } from "../../src/shared/schema";

const YT_ID = "UC" + "a".repeat(22);

const player = (overrides: Record<string, unknown> = {}) => ({
  name: "選手1",
  tier: "Next",
  role: "TOP",
  channels: [{ platform: "twitch", login: "player_1" }],
  ...overrides,
});

const teams = (players: unknown[], extraTeams: unknown[] = []) => ({
  teams: [{ id: "team-a", name: "チームA", players }, ...extraTeams],
});

describe("parseTeamsData（AC-23）", () => {
  it("正しいデータを受け付ける", () => {
    const data = parseTeamsData(
      teams([
        player(),
        player({
          name: "選手2",
          role: "JG",
          channels: [
            { platform: "youtube", channelId: YT_ID },
            { platform: "twitch", login: "player_2" },
          ],
        }),
      ]),
    );
    expect(data.teams[0]?.players).toHaveLength(2);
  });

  it.each(["name", "tier", "role", "channels"])("選手の %s が欠けているとエラー", (key) => {
    const p: Record<string, unknown> = player();
    delete p[key];
    expect(() => parseTeamsData(teams([p]))).toThrow(DataValidationError);
  });

  it("チャンネルが0個だとエラー", () => {
    expect(() => parseTeamsData(teams([player({ channels: [] })]))).toThrow(DataValidationError);
  });

  it("チームの id か name が欠けているとエラー", () => {
    expect(() => parseTeamsData({ teams: [{ name: "A", players: [] }] })).toThrow(DataValidationError);
    expect(() => parseTeamsData({ teams: [{ id: "a", players: [] }] })).toThrow(DataValidationError);
  });

  it("定義外の階級・ロールはエラー", () => {
    expect(() => parseTeamsData(teams([player({ tier: "Pro" })]))).toThrow(DataValidationError);
    expect(() => parseTeamsData(teams([player({ role: "BOT" })]))).toThrow(DataValidationError);
  });

  it("同じチーム内で階級とロールが重複するとエラー", () => {
    const data = teams([player(), player({ name: "選手2", channels: [{ platform: "twitch", login: "p2" }] })]);
    expect(() => parseTeamsData(data)).toThrow(/Next.*TOP/);
  });

  it("別のチームなら同じ階級とロールでもよい", () => {
    const data = teams(
      [player()],
      [{ id: "team-b", name: "チームB", players: [player({ channels: [{ platform: "twitch", login: "p2" }] })] }],
    );
    expect(() => parseTeamsData(data)).not.toThrow();
  });

  it("チーム id が重複するとエラー", () => {
    const data = teams([], [{ id: "team-a", name: "チームB", players: [] }]);
    expect(() => parseTeamsData(data)).toThrow(/team-a/);
  });

  it("同じチャンネルの重複登録はエラー（Twitch の login は大文字・小文字を区別しない）", () => {
    const data = teams([
      player(),
      player({ name: "選手2", role: "JG", channels: [{ platform: "twitch", login: "Player_1" }] }),
    ]);
    expect(() => parseTeamsData(data)).toThrow(/player_1/i);

    const yt = teams([
      player({ channels: [{ platform: "youtube", channelId: YT_ID }] }),
      player({ name: "選手2", role: "JG", channels: [{ platform: "youtube", channelId: YT_ID }] }),
    ]);
    expect(() => parseTeamsData(yt)).toThrow(DataValidationError);
  });

  it("YouTube のチャンネル ID の形式が違うとエラー", () => {
    for (const channelId of ["UCshort", "XX" + "a".repeat(22), "@handle"]) {
      expect(() => parseTeamsData(teams([player({ channels: [{ platform: "youtube", channelId }] })]))).toThrow(
        DataValidationError,
      );
    }
  });

  it("定義外のプラットフォームや、プラットフォームに合わないキーはエラー", () => {
    expect(() => parseTeamsData(teams([player({ channels: [{ platform: "kick", login: "a" }] })]))).toThrow(
      DataValidationError,
    );
    expect(() => parseTeamsData(teams([player({ channels: [{ platform: "youtube", login: "a" }] })]))).toThrow(
      DataValidationError,
    );
  });

  it("エラーメッセージに問題の場所が含まれる", () => {
    expect(() => parseTeamsData(teams([player({ role: "BOT" })]))).toThrow(/teams\.0\.players\.0\.role/);
  });
});

describe("parseKeywordsData", () => {
  it("正しいデータを受け付ける", () => {
    expect(parseKeywordsData({ ltkKeywords: ["LTK"] }).ltkKeywords).toEqual(["LTK"]);
  });

  it("キーワードが0個、または空文字を含むとエラー", () => {
    expect(() => parseKeywordsData({ ltkKeywords: [] })).toThrow(DataValidationError);
    expect(() => parseKeywordsData({ ltkKeywords: ["LTK", ""] })).toThrow(DataValidationError);
    expect(() => parseKeywordsData({})).toThrow(DataValidationError);
  });
});
