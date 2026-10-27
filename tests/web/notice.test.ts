// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { pickNotice } from "../../src/shared/schedule";
import type { ChannelStatus, Schedule, TeamStatus } from "../../src/shared/types";
import { renderNotice } from "../../src/web/notice";

const teams: TeamStatus[] = [
  { id: "a", name: "Dahlia Diadem", color: "#EF6400", players: [] },
  { id: "b", name: "Camellia Crown", color: "#D10015", players: [] },
];

const official = (platform: "twitch" | "youtube", live: boolean): ChannelStatus => ({
  platform,
  channelUrl: `https://example.com/${platform}`,
  state: live ? "live" : "offline",
  streams: live ? [{ title: "本戦", url: `https://example.com/${platform}/live`, ltk: false }] : [],
});

const schedule = (twitchLive = false): Schedule => ({
  matches: [
    {
      stage: "Regular Stage",
      day: "DAY 4",
      startAt: "2026-10-27T09:00:00.000Z",
      endAt: "2026-10-27T14:00:00.000Z",
      games: [{ blue: "a", red: "b", tiers: ["Next", "Core"] }],
    },
    {
      stage: "Masters Cup",
      day: "DAY 2",
      startAt: "2026-10-28T08:00:00.000Z",
      endAt: "2026-10-28T14:00:00.000Z",
      games: [{ blue: "b", red: "a", tiers: ["Masters"] }],
    },
  ],
  official: { twitch: official("twitch", twitchLive), youtube: official("youtube", false) },
});

const render = (s: Schedule, now: Date) => {
  const notice = pickNotice(s, now)!;
  return renderNotice(notice, s, teams, now);
};

describe("renderNotice（AC-46, AC-48, AC-49）", () => {
  it("当日の案内に、ステージと Day、開始時刻、対戦カード、公式チャンネルを載せる", () => {
    const el = render(schedule(), new Date("2026-10-27T17:00:00+09:00"));
    expect(el.classList.contains("match-notice--today")).toBe(true);
    expect(el.querySelector(".mn-name")?.textContent).toBe("Regular Stage DAY 4");
    expect(el.querySelector(".mn-status")?.textContent).toBe("18:00 開始");
    const game = el.querySelector(".mn-game")!;
    expect([...game.querySelectorAll(".mn-team")].map((t) => t.textContent)).toEqual(["Dahlia Diadem", "Camellia Crown"]);
    expect(game.querySelector<HTMLElement>(".mn-team")?.style.getPropertyValue("--chip-color")).toBe("#EF6400");
    expect(game.querySelector(".mn-tiers")?.textContent).toBe("Next / Core");
    const links = [...el.querySelectorAll<HTMLAnchorElement>(".mn-link")];
    expect(links.map((a) => [a.textContent, a.href])).toEqual([
      ["公式 Twitch", "https://example.com/twitch"],
      ["公式 YouTube", "https://example.com/youtube"],
    ]);
  });

  it("開始後は「18:00〜」、公式チャンネルが配信中なら「配信中」と LIVE を付け、配信ページへリンクする", () => {
    expect(render(schedule(), new Date("2026-10-27T19:00:00+09:00")).querySelector(".mn-status")?.textContent).toBe("18:00〜");

    const el = render(schedule(true), new Date("2026-10-27T19:00:00+09:00"));
    expect(el.querySelector(".mn-status")?.textContent).toBe("配信中");
    const twitch = el.querySelector<HTMLAnchorElement>(".mn-link--twitch")!;
    expect(twitch.href).toBe("https://example.com/twitch/live");
    expect(twitch.querySelector(".mn-live")?.textContent).toBe("LIVE");
    expect(el.querySelector(".mn-link--youtube .mn-live")).toBeNull();
  });

  it("次回の案内は 1 行で、日付（曜日）と開始時刻、ステージと Day を日本時間で出し、その下に対戦カードを並べる", () => {
    const el = render(schedule(), new Date("2026-10-27T23:30:00+09:00"));
    expect(el.classList.contains("match-notice--next")).toBe(true);
    expect(el.querySelector(".mn-head")?.textContent).toBe("本戦スケジュール10/28（水） 17:00〜Masters Cup DAY 2");
    expect(el.querySelector("time")?.getAttribute("datetime")).toBe("2026-10-28T08:00:00.000Z");
    expect([...el.querySelectorAll(".mn-game")].map((g) => g.textContent)).toEqual(["Camellia CrownvsDahlia DiademMasters"]);
    expect(el.querySelector(".mn-link")).toBeNull();
  });

  it("本戦の日の 16:00 より前は「本日」と書く", () => {
    expect(render(schedule(), new Date("2026-10-27T12:00:00+09:00")).querySelector("time")?.textContent).toBe("本日 18:00〜");
  });
});

describe("対戦カードのない本戦（AC-53）", () => {
  const tierOnly = (): Schedule => ({
    matches: [
      {
        stage: "Playoffs",
        day: "DAY 1",
        startAt: "2026-11-21T01:00:00.000Z",
        endAt: "2026-11-21T14:00:00.000Z",
        games: [],
        tiers: ["Next", "Core", "Masters"],
      },
    ],
    official: { twitch: official("twitch", false), youtube: official("youtube", false) },
  });

  it("当日の案内に、対戦カードの代わりに階級を出す", () => {
    const el = render(tierOnly(), new Date("2026-11-21T10:00:00+09:00"));
    expect(el.classList.contains("match-notice--today")).toBe(true);
    expect(el.querySelector(".mn-name")?.textContent).toBe("Playoffs DAY 1");
    expect(el.querySelector(".mn-team")).toBeNull();
    expect(el.querySelector(".mn-tiers")?.textContent).toBe("Next / Core / Masters");
  });

  it("次回の案内にも階級を出す", () => {
    const el = render(tierOnly(), new Date("2026-11-20T12:00:00+09:00"));
    expect(el.classList.contains("match-notice--next")).toBe(true);
    expect(el.querySelector(".mn-team")).toBeNull();
    expect(el.querySelector(".mn-tiers")?.textContent).toBe("Next / Core / Masters");
  });
});
