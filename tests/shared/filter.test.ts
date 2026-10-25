import { describe, expect, it } from "vitest";
import { buildView, EMPTY_FILTER, isPlayerLive, hasLtkStream, type Filter } from "../../src/shared/filter";
import type { ChannelStatus, PlayerStatus, Role, TeamStatus, Tier } from "../../src/shared/types";

const offline: ChannelStatus = { platform: "twitch", channelUrl: "https://www.twitch.tv/x", state: "offline", streams: [] };
const live = (ltk: boolean): ChannelStatus => ({
  platform: "twitch",
  channelUrl: "https://www.twitch.tv/x",
  state: "live",
  streams: [{ title: ltk ? "LTK" : "ソロ", url: "https://www.twitch.tv/x", ltk }],
});
const failed: ChannelStatus = { ...offline, state: "error" };

const player = (name: string, tier: Tier, role: Role, channels: ChannelStatus[]): PlayerStatus => ({
  name,
  tier,
  role,
  channels,
});

// a: 配信中(LTK) / 配信中(非LTK) / 配信なし、b: 配信なし / 配信中(LTK)
const teams: TeamStatus[] = [
  {
    id: "a",
    name: "A",
    color: "#EF6400",
    players: [
      player("a-next-top", "Next", "TOP", [live(true)]),
      player("a-core-top", "Core", "TOP", [offline, live(false)]),
      player("a-masters-top", "Masters", "TOP", [offline]),
    ],
  },
  {
    id: "b",
    name: "B",
    color: "#D10015",
    players: [player("b-next-top", "Next", "TOP", [failed]), player("b-masters-top", "Masters", "TOP", [live(true)])],
  },
];

const names = (filter: Filter) =>
  buildView(teams, filter).flatMap((t) => t.tiers.flatMap((g) => g.players.map((p) => p.name)));
const f = (overrides: Partial<Filter>): Filter => ({ ...EMPTY_FILTER, ...overrides });

describe("判定", () => {
  it("どれかのチャンネルが live なら配信中", () => {
    expect(isPlayerLive(player("x", "Next", "TOP", [offline, live(false)]))).toBe(true);
    expect(isPlayerLive(player("x", "Next", "TOP", [offline, failed]))).toBe(false);
  });

  it("LTK タグ付きの配信が1つでもあれば LTK", () => {
    expect(hasLtkStream(player("x", "Next", "TOP", [live(false), live(true)]))).toBe(true);
    expect(hasLtkStream(player("x", "Next", "TOP", [live(false)]))).toBe(false);
  });
});

describe("buildView（AC-15〜19）", () => {
  it("条件なしなら全員を表示する（AC-19）", () => {
    expect(names(EMPTY_FILTER)).toHaveLength(5);
  });

  it("チームで絞り込む（同じ軸の中は OR）", () => {
    expect(names(f({ teams: ["b"] }))).toEqual(["b-next-top", "b-masters-top"]);
    expect(names(f({ teams: ["a", "b"] }))).toHaveLength(5);
  });

  it("階級で絞り込む（同じ軸の中は OR）", () => {
    expect(names(f({ tiers: ["Next"] }))).toEqual(["a-next-top", "b-next-top"]);
    expect(names(f({ tiers: ["Next", "Masters"] }))).toEqual([
      "a-next-top",
      "a-masters-top",
      "b-next-top",
      "b-masters-top",
    ]);
  });

  it("配信中のみ", () => {
    expect(names(f({ liveOnly: true }))).toEqual(["a-next-top", "a-core-top", "b-masters-top"]);
  });

  it("LTK のみ", () => {
    expect(names(f({ ltkOnly: true }))).toEqual(["a-next-top", "b-masters-top"]);
  });

  it("異なる軸の間は AND", () => {
    expect(names(f({ teams: ["a"], liveOnly: true }))).toEqual(["a-next-top", "a-core-top"]);
    expect(names(f({ teams: ["a"], tiers: ["Core", "Masters"], liveOnly: true }))).toEqual(["a-core-top"]);
    expect(names(f({ tiers: ["Masters"], ltkOnly: true }))).toEqual(["b-masters-top"]);
  });

  it("出場者が0人になったチームと階級は表示しない（AC-18）", () => {
    const view = buildView(teams, f({ ltkOnly: true, tiers: ["Masters"] }));
    expect(view.map((t) => t.id)).toEqual(["b"]);
    expect(view[0]?.tiers.map((g) => g.tier)).toEqual(["Masters"]);
    expect(buildView(teams, f({ teams: ["a"], tiers: ["Next"], ltkOnly: false, liveOnly: true }))[0]?.tiers).toHaveLength(1);
  });

  it("該当者がいなければ空になる", () => {
    expect(buildView(teams, f({ teams: ["b"], tiers: ["Core"] }))).toEqual([]);
  });

  it("チームはデータの順、チーム内は階級順で並ぶ", () => {
    const view = buildView(teams, EMPTY_FILTER);
    expect(view.map((t) => t.id)).toEqual(["a", "b"]);
    expect(view[0]?.tiers.map((g) => g.tier)).toEqual(["Next", "Core", "Masters"]);
  });
});
