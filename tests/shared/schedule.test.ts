import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { isOfficialWindow, jstAt, pickNotice } from "../../src/shared/schedule";
import { DataValidationError, parseScheduleData, parseTeamsData, toMatches } from "../../src/shared/schema";
import type { ChannelStatus, Schedule } from "../../src/shared/types";

const TEAM_IDS = ["team-a", "team-b"];

const match = (overrides: Record<string, unknown> = {}) => ({
  date: "2026-10-27",
  stage: "Regular Stage",
  day: "DAY 4",
  start: "18:00",
  end: "23:00",
  games: [{ blue: "team-a", red: "team-b", tiers: ["Next", "Core"] }],
  ...overrides,
});

const file = (matches: unknown[]) => ({
  official: { twitch: "lolthek4sen", youtube: "UC" + "a".repeat(22) },
  matches,
});

describe("parseScheduleData（AC-45）", () => {
  it("正しいデータを受け付ける", () => {
    expect(parseScheduleData(file([match(), match({ date: "2026-10-28", end: "25:30" })]), TEAM_IDS).matches).toHaveLength(2);
  });

  it.each([
    ["日付の形式", match({ date: "10/27" }), /matches\.0\.date/],
    ["時刻の形式", match({ start: "6pm" }), /matches\.0\.start/],
    ["開始と終了の前後", match({ start: "23:00", end: "18:00" }), /終了予定時刻は開始時刻より後/],
    ["teams.yaml にないチーム", match({ games: [{ blue: "team-a", red: "team-x", tiers: ["Core"] }] }), /team-x/],
    ["同じチーム同士", match({ games: [{ blue: "team-a", red: "team-a", tiers: ["Core"] }] }), /同じチーム同士/],
    ["定義外の階級", match({ games: [{ blue: "team-a", red: "team-b", tiers: ["Pro"] }] }), /tiers/],
  ])("%s の誤りを、場所が分かる形で報告する", (_label, m, message) => {
    expect(() => parseScheduleData(file([m]), TEAM_IDS)).toThrow(DataValidationError);
    expect(() => parseScheduleData(file([m]), TEAM_IDS)).toThrow(message);
  });

  it("同じ日付が重複していればエラー", () => {
    expect(() => parseScheduleData(file([match(), match()]), TEAM_IDS)).toThrow(/2026-10-27」が重複/);
  });

  it("リポジトリの schedule.yaml は teams.yaml と矛盾しない", () => {
    const teams = parseTeamsData(parseYaml(readFileSync("data/teams.yaml", "utf8")));
    const schedule = parseScheduleData(parseYaml(readFileSync("data/schedule.yaml", "utf8")), teams.teams.map((t) => t.id));
    expect(schedule.matches.length).toBeGreaterThan(0);
  });
});

describe("toMatches", () => {
  it("日本時間の日付と時刻を ISO 8601 にし、開始時刻の順に並べる", () => {
    const parsed = parseScheduleData(file([match({ date: "2026-10-28", start: "17:00", end: "25:30" }), match()]), TEAM_IDS);
    const matches = toMatches(parsed);
    expect(matches.map((m) => [m.startAt, m.endAt])).toEqual([
      ["2026-10-27T09:00:00.000Z", "2026-10-27T14:00:00.000Z"],
      ["2026-10-28T08:00:00.000Z", "2026-10-28T16:30:00.000Z"],
    ]);
  });

  it("24:00 以降は翌日の時刻になる", () => {
    expect(jstAt("2026-10-27", "25:30").toISOString()).toBe("2026-10-27T16:30:00.000Z");
  });
});

const jst = (time: string, date = "2026-10-27") => new Date(`${date}T${time}:00+09:00`);
const status = (platform: "twitch" | "youtube", live: boolean): ChannelStatus => ({
  platform,
  channelUrl: `https://example.com/${platform}`,
  state: live ? "live" : "offline",
  streams: live ? [{ title: "本戦", url: `https://example.com/${platform}/live`, ltk: false }] : [],
});
const schedule = (live = false): Schedule => ({
  matches: toMatches(parseScheduleData(file([match(), match({ date: "2026-10-28", stage: "Masters Cup", day: "DAY 2", start: "17:00" })]), TEAM_IDS)),
  official: { twitch: status("twitch", live), youtube: status("youtube", false) },
});

describe("isOfficialWindow（AC-47）", () => {
  const matches = schedule().matches;

  it.each([
    ["当日 15:59", jst("15:59"), false],
    ["当日 16:00", jst("16:00"), true],
    ["終了予定の 3 時間後の直前", jst("01:59", "2026-10-28"), true],
    ["終了予定の 3 時間後", jst("02:00", "2026-10-28"), false],
    ["本戦のない日", jst("20:00", "2026-10-26"), false],
  ])("%s は %s", (_label, now, expected) => {
    expect(isOfficialWindow(matches, now)).toBe(expected);
  });
});

describe("pickNotice（AC-46, AC-48）", () => {
  it("本戦の日の 16:00 より前は、次回の案内に「本日」の印を付ける", () => {
    expect(pickNotice(schedule(), jst("15:59"))).toMatchObject({ kind: "next", today: true, match: { day: "DAY 4" } });
  });

  it("16:00 から終了予定時刻までは当日の案内", () => {
    expect(pickNotice(schedule(), jst("16:00"))).toMatchObject({ kind: "today", live: false, match: { day: "DAY 4" } });
    expect(pickNotice(schedule(), jst("22:59"))).toMatchObject({ kind: "today" });
  });

  it("終了予定時刻を過ぎたら次回の案内（別の日なので「本日」は付けない）", () => {
    expect(pickNotice(schedule(), jst("23:00"))).toMatchObject({ kind: "next", today: false, match: { day: "DAY 2" } });
  });

  it("終了予定時刻を過ぎても公式チャンネルが配信中なら当日の案内を続ける", () => {
    expect(pickNotice(schedule(true), jst("23:30"))).toMatchObject({ kind: "today", live: true, match: { day: "DAY 4" } });
  });

  it("本戦のない日は、次の本戦を案内する", () => {
    expect(pickNotice(schedule(), jst("12:00", "2026-10-20"))).toMatchObject({ kind: "next", today: false, match: { day: "DAY 4" } });
  });

  it("すべての本戦が終わったら何も出さない。日程がなければ何も出さない", () => {
    expect(pickNotice(schedule(), jst("23:00", "2026-10-28"))).toBeUndefined();
    expect(pickNotice(undefined, jst("12:00"))).toBeUndefined();
  });
});
