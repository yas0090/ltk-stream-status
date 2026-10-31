import { describe, expect, it } from "vitest";
import { favoritePlayers, pruneFavorites, toggleFavorite } from "../../src/shared/favorites";
import type { ChannelStatus, Role, TeamStatus, Tier } from "../../src/shared/types";

const offline: ChannelStatus = { platform: "twitch", channelUrl: "https://www.twitch.tv/x", state: "offline", streams: [] };
const p = (name: string, tier: Tier, role: Role) => ({ name, tier, role, channels: [offline] });

const teams: TeamStatus[] = [
  { id: "a", name: "A", color: "#EF6400", players: [p("a1", "Masters", "TOP"), p("a2", "Masters", "JG")] },
  { id: "b", name: "B", color: "#D10015", players: [p("b1", "Next", "SUP")] },
];

describe("お気に入りの切り替え（AC-65）", () => {
  it("なければ末尾に追加する", () => {
    expect(toggleFavorite(["a:a1"], "b:b1")).toEqual(["a:a1", "b:b1"]);
  });

  it("あれば除く", () => {
    expect(toggleFavorite(["a:a1", "b:b1"], "a:a1")).toEqual(["b:b1"]);
  });

  it("解除して再登録すると末尾に並ぶ", () => {
    expect(toggleFavorite(toggleFavorite(["a:a1", "b:b1"], "a:a1"), "a:a1")).toEqual(["b:b1", "a:a1"]);
  });

  it("元の配列を変えない", () => {
    const list = ["a:a1"];
    toggleFavorite(list, "b:b1");
    expect(list).toEqual(["a:a1"]);
  });
});

describe("pruneFavorites（AC-76）", () => {
  it("今のデータにいない選手を除く", () => {
    expect(pruneFavorites(["a:a1", "a:gone", "c:a1"], teams)).toEqual(["a:a1"]);
  });

  it("重複を除き、最初の位置を残す", () => {
    expect(pruneFavorites(["b:b1", "a:a1", "b:b1"], teams)).toEqual(["b:b1", "a:a1"]);
  });

  it("登録順を保つ", () => {
    expect(pruneFavorites(["b:b1", "a:a2", "a:a1"], teams)).toEqual(["b:b1", "a:a2", "a:a1"]);
  });
});

describe("favoritePlayers（AC-68, AC-70）", () => {
  it("登録順にチームと選手を返す", () => {
    const result = favoritePlayers(["b:b1", "a:a2"], teams);
    expect(result.map((r) => [r.team.id, r.player.name, r.key])).toEqual([
      ["b", "b1", "b:b1"],
      ["a", "a2", "a:a2"],
    ]);
  });

  it("いない選手は返さない", () => {
    expect(favoritePlayers(["a:gone"], teams)).toEqual([]);
  });

  it("配信していない選手も返す", () => {
    expect(favoritePlayers(["a:a1"], teams)).toHaveLength(1);
  });
});
