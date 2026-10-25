// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { buildView, EMPTY_FILTER } from "../../src/shared/filter";
import type { TeamStatus } from "../../src/shared/types";
import { renderStatusBar, renderTeams } from "../../src/web/render";

const teams: TeamStatus[] = [
  {
    id: "a",
    name: "チームA",
    players: [
      {
        name: "配信中の人",
        tier: "Core",
        role: "MID",
        channels: [
          {
            platform: "youtube",
            channelUrl: "https://www.youtube.com/channel/UCx",
            state: "live",
            streams: [
              { title: "LTK スクリム", url: "https://www.youtube.com/watch?v=1", ltk: true },
              { title: "<b>ソロ</b>", url: "https://www.youtube.com/watch?v=2", ltk: false },
            ],
          },
          { platform: "twitch", channelUrl: "https://www.twitch.tv/x", state: "error", streams: [] },
        ],
      },
      {
        name: "配信していない人",
        tier: "Next",
        role: "TOP",
        channels: [{ platform: "twitch", channelUrl: "https://www.twitch.tv/y", state: "offline", streams: [] }],
      },
    ],
  },
  {
    id: "b",
    name: "チームB",
    players: [
      {
        name: "B の人",
        tier: "Masters",
        role: "SUP",
        channels: [{ platform: "twitch", channelUrl: "https://www.twitch.tv/z", state: "offline", streams: [] }],
      },
    ],
  },
];

const render = () => renderTeams(buildView(teams, EMPTY_FILTER));
const playerEl = (root: HTMLElement, name: string) =>
  [...root.querySelectorAll<HTMLElement>(".player")].find((el) => el.querySelector(".player-name")?.textContent === name)!;

describe("renderTeams", () => {
  it("チームごとに分かれ、全員が表示される（AC-1）", () => {
    const root = render();
    expect([...root.querySelectorAll(".team-name")].map((el) => el.textContent)).toEqual(["チームA", "チームB"]);
    expect(root.querySelectorAll(".player")).toHaveLength(3);
  });

  it("チーム内は階級ごとに分かれ、Next → Core の順に並ぶ", () => {
    const team = render().querySelector('[data-team="a"]')!;
    expect([...team.querySelectorAll(".tier-name")].map((el) => el.textContent)).toEqual(["Next", "Core"]);
  });

  it("配信中かどうかで配信中マークが変わる（AC-5）", () => {
    const root = render();
    expect(playerEl(root, "配信中の人").dataset.live).toBe("true");
    expect(playerEl(root, "配信中の人").querySelector(".live-mark")?.getAttribute("aria-label")).toBe("配信中");
    expect(playerEl(root, "配信していない人").dataset.live).toBe("false");
  });

  it("すべてのチャンネルにプラットフォーム名とチャンネルリンクがある（AC-6）", () => {
    const links = [...render().querySelectorAll<HTMLAnchorElement>(".channel-link")];
    // 階級順（Next → Core）に並ぶので、チームAは配信していない人が先
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Twitch", "https://www.twitch.tv/y"],
      ["YouTube", "https://www.youtube.com/channel/UCx"],
      ["Twitch", "https://www.twitch.tv/x"],
      ["Twitch", "https://www.twitch.tv/z"],
    ]);
    expect(links.every((a) => a.target === "_blank" && a.rel === "noopener noreferrer")).toBe(true);
  });

  it("配信中のチャンネルには、タイトルと配信リンクがすべて表示される（AC-7, AC-8）", () => {
    const streams = [...playerEl(render(), "配信中の人").querySelectorAll<HTMLAnchorElement>(".stream-link")];
    expect(streams.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["LTK スクリム", "https://www.youtube.com/watch?v=1"],
      ["<b>ソロ</b>", "https://www.youtube.com/watch?v=2"],
    ]);
  });

  it("配信タイトルは HTML として解釈しない", () => {
    expect(render().querySelector("b")).toBeNull();
  });

  it("LTK タグは LTK 判定された配信にだけ付く", () => {
    const streams = [...playerEl(render(), "配信中の人").querySelectorAll(".stream")];
    expect(streams.map((s) => s.querySelector(".ltk-tag")?.textContent ?? null)).toEqual(["LTK", null]);
  });

  it("取得に失敗したチャンネルには「取得失敗」と表示する（AC-22）", () => {
    const errors = [...render().querySelectorAll(".fetch-error")];
    expect(errors).toHaveLength(1);
    expect(errors[0]?.textContent).toBe("取得失敗");
    expect(errors[0]?.closest(".channel")?.getAttribute("data-state")).toBe("error");
  });

  it("該当者がいなければメッセージを出す", () => {
    expect(renderTeams([]).textContent).toContain("当てはまる出場者はいません");
  });
});

describe("renderStatusBar（AC-9, AC-10）", () => {
  const generatedAt = "2026-10-25T09:00:00.000Z";

  it("最終更新日時を表示する", () => {
    const el = renderStatusBar(generatedAt, new Date(generatedAt));
    expect(el.querySelector("time")?.getAttribute("datetime")).toBe(generatedAt);
    expect(el.querySelector(".stale-warning")).toBeNull();
  });

  it("30分以上たっていれば警告を表示する", () => {
    const el = renderStatusBar(generatedAt, new Date(Date.parse(generatedAt) + 30 * 60_000));
    expect(el.querySelector(".stale-warning")).not.toBeNull();
  });
});
