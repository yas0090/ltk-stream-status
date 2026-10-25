import { describe, expect, it } from "vitest";
import { buildView, EMPTY_FILTER } from "../../src/shared/filter";
import { playerKey, pruneHidden, setHidden, visibilityOf } from "../../src/shared/hidden";
import type { ChannelStatus, Role, TeamStatus, Tier } from "../../src/shared/types";

const live: ChannelStatus = {
  platform: "twitch",
  channelUrl: "https://www.twitch.tv/x",
  state: "live",
  streams: [{ title: "LTK", url: "https://www.twitch.tv/x", ltk: true }],
};
const offline: ChannelStatus = { ...live, state: "offline", streams: [] };
const p = (name: string, tier: Tier, role: Role, channels = [offline]) => ({ name, tier, role, channels });

const teams: TeamStatus[] = [
  {
    id: "a",
    name: "A",
    color: "#EF6400",
    players: [p("a1", "Masters", "TOP", [live]), p("a2", "Masters", "JG"), p("a3", "Core", "TOP", [live])],
  },
  { id: "b", name: "B", color: "#D10015", players: [p("b1", "Next", "SUP", [live])] },
];

const names = (hidden: Set<string>, filter = EMPTY_FILTER) =>
  buildView(teams, filter, hidden).flatMap((t) => t.tiers.flatMap((g) => g.players.map((pl) => pl.name)));

describe("詳細フィルタの判定（AC-31〜33, AC-37）", () => {
  it("選手のキーはチーム ID と選手名で作る", () => {
    expect(playerKey("camellia-crown", "k4sen")).toBe("camellia-crown:k4sen");
  });

  it("配下の選手の状態から、全員表示・全員非表示・一部を判定する（AC-32）", () => {
    const keys = ["a:a1", "a:a2"];
    expect(visibilityOf(keys, new Set())).toBe("all");
    expect(visibilityOf(keys, new Set(["a:a1"]))).toBe("some");
    expect(visibilityOf(keys, new Set(["a:a1", "a:a2", "b:b1"]))).toBe("none");
  });

  it("チーム・階級・選手の単位でまとめて切り替えられる（AC-32）", () => {
    const team = ["a:a1", "a:a2", "a:a3"];
    const hidden = setHidden(new Set(["b:b1"]), team, true);
    expect([...hidden].sort()).toEqual(["a:a1", "a:a2", "a:a3", "b:b1"]);
    expect([...setHidden(hidden, ["a:a1", "a:a2"], false)].sort()).toEqual(["a:a3", "b:b1"]);
  });

  it("元の集合は変更しない", () => {
    const hidden = new Set(["a:a1"]);
    setHidden(hidden, ["a:a2"], true);
    expect([...hidden]).toEqual(["a:a1"]);
  });

  it("非表示の選手は一覧に出ず、空になった階級とチームも出ない", () => {
    expect(names(new Set(["a:a2"]))).toEqual(["a1", "a3", "b1"]);
    const view = buildView(teams, EMPTY_FILTER, new Set(["b:b1", "a:a3"]));
    expect(view.map((t) => t.id)).toEqual(["a"]);
    expect(view[0]?.tiers.map((g) => g.tier)).toEqual(["Masters"]);
  });

  it("簡易絞り込みと AND で組み合わさる（AC-33）", () => {
    expect(names(new Set(["a:a1"]), { ...EMPTY_FILTER, liveOnly: true })).toEqual(["a3", "b1"]);
    expect(names(new Set(["a:a1"]), { ...EMPTY_FILTER, teams: ["a"] })).toEqual(["a2", "a3"]);
  });

  it("今のデータにいない選手のキーは取り除く（AC-37）", () => {
    expect([...pruneHidden(new Set(["a:a1", "a:gone", "z:x"]), teams)]).toEqual(["a:a1"]);
  });
});
