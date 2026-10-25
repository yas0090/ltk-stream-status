// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { buildView, EMPTY_FILTER, type Filter } from "../../src/shared/filter";
import type { TeamStatus } from "../../src/shared/types";
import { renderStatusBar, renderTeams } from "../../src/web/render";

const teams: TeamStatus[] = [
  {
    id: "a",
    name: "チームA",
    color: "#EF6400",
    players: [
      {
        name: "配信中の人",
        tier: "Core",
        role: "MID",
        avatarUrl: "https://img/live.png",
        channels: [
          {
            platform: "youtube",
            channelUrl: "https://www.youtube.com/channel/UCx",
            state: "live",
            streams: [
              { title: "<b>ソロ</b>", url: "https://www.youtube.com/watch?v=1", ltk: false },
              { title: "LTK スクリム", url: "https://www.youtube.com/watch?v=2", ltk: true },
            ],
          },
          { platform: "twitch", channelUrl: "https://www.twitch.tv/x", state: "offline", streams: [] },
        ],
      },
      {
        name: "配信していない人",
        tier: "Next",
        role: "TOP",
        channels: [{ platform: "twitch", channelUrl: "https://www.twitch.tv/y", state: "offline", streams: [] }],
      },
      {
        name: "取得失敗の人",
        tier: "Next",
        role: "SUP",
        avatarUrl: "https://img/fail.png",
        channels: [{ platform: "twitch", channelUrl: "https://www.twitch.tv/w", state: "error", streams: [] }],
      },
    ],
  },
  {
    id: "b",
    name: "チームB",
    color: "#D10015",
    players: [
      {
        name: "B の人",
        tier: "Masters",
        role: "JG",
        channels: [{ platform: "twitch", channelUrl: "https://www.twitch.tv/z", state: "offline", streams: [] }],
      },
    ],
  },
];

const render = (filter: Filter = EMPTY_FILTER) => renderTeams(buildView(teams, filter));
const card = (root: HTMLElement, name: string) =>
  [...root.querySelectorAll<HTMLElement>(".player-card")].find((el) => el.querySelector(".player-name")?.textContent === name)!;
// 階級の行ごとに、マスの中身（選手名 or 空欄）をロール順に並べる
const grid = (root: HTMLElement, teamId: string) =>
  [...root.querySelectorAll(`[data-team="${teamId}"] .tier-row`)].map((row) => [
    row.querySelector(".tier-name")?.textContent,
    ...[...row.children].slice(1).map((cell) => cell.querySelector(".player-name")?.textContent ?? "-"),
  ]);

describe("renderTeams", () => {
  it("チームごとに分かれ、全員が表示される（AC-1）", () => {
    const root = render();
    expect([...root.querySelectorAll(".team-name")].map((el) => el.textContent)).toEqual(["チームA", "チームB"]);
    expect(root.querySelectorAll(".player-card")).toHaveLength(4);
  });

  it("階級（行）× ロール（列）の格子に並び、いないマスは空欄になる（AC-3, AC-4）", () => {
    expect(grid(render(), "a")).toEqual([
      ["Next", "配信していない人", "-", "-", "-", "取得失敗の人"],
      ["Core", "-", "-", "配信中の人", "-", "-"],
    ]);
    const header = render().querySelector('[data-team="a"] .role-header');
    expect([...header!.children].map((el) => el.textContent)).toEqual(["", "TOP", "JG", "MID", "ADC", "SUP"]);
  });

  it("絞り込みで外れた選手は空欄になり、空の階級とチームは表示しない（AC-18）", () => {
    const root = render({ ...EMPTY_FILTER, liveOnly: true });
    expect(root.querySelectorAll(".team")).toHaveLength(1);
    expect(grid(root, "a")).toEqual([["Core", "-", "-", "配信中の人", "-", "-"]]);
  });

  it("配信中かどうかで配信中マークと data-live が変わる（AC-5）", () => {
    const root = render();
    expect(card(root, "配信中の人").dataset.live).toBe("true");
    expect(card(root, "配信中の人").querySelector(".live-mark")?.getAttribute("aria-label")).toBe("配信中");
    expect(card(root, "配信していない人").dataset.live).toBe("false");
  });

  it("どの選手カードも同じ3行構成になる", () => {
    for (const el of render().querySelectorAll(".player-card")) {
      expect([...el.children].map((c) => c.className)).toEqual(["card-head", "platforms", "stream-line"]);
    }
  });

  it("チャンネルごとにプラットフォームアイコンがあり、配信中は配信ページ、それ以外はチャンネルページへリンクする（AC-6, AC-7）", () => {
    const links = [...card(render(), "配信中の人").querySelectorAll<HTMLAnchorElement>(".platform-link")];
    expect(links.map((a) => [a.getAttribute("aria-label"), a.getAttribute("href")])).toEqual([
      ["YouTube（配信中）", "https://www.youtube.com/watch?v=1"],
      ["Twitch（配信していない）", "https://www.twitch.tv/x"],
    ]);
    expect(links.every((a) => a.querySelector("svg") && a.target === "_blank" && a.rel === "noopener noreferrer")).toBe(true);
  });

  it("配信タイトルは最初の1件と残りの件数を表示し、全タイトルをツールチップに入れる（AC-7, AC-8）", () => {
    const line = card(render(), "配信中の人").querySelector(".stream-line")!;
    const link = line.querySelector<HTMLAnchorElement>(".stream-link")!;
    expect(link.textContent).toBe("<b>ソロ</b>");
    expect(link.getAttribute("href")).toBe("https://www.youtube.com/watch?v=1");
    expect(link.title).toBe("<b>ソロ</b>\nLTK スクリム");
    expect(line.querySelector(".more-streams")?.textContent).toBe("+1");
  });

  it("配信タイトルは HTML として解釈しない", () => {
    expect(render().querySelector("b")).toBeNull();
  });

  it("LTK 判定された配信があれば LTK タグを付ける", () => {
    const root = render();
    expect(card(root, "配信中の人").querySelector(".ltk-tag")?.textContent).toBe("LTK");
    expect(card(root, "配信していない人").querySelector(".ltk-tag")).toBeNull();
  });

  it("配信していない選手のタイトル行は空になる", () => {
    expect(card(render(), "配信していない人").querySelector(".stream-line")?.textContent).toBe("");
  });

  it("取得に失敗したチャンネルがあれば「取得失敗」と表示する（AC-22）", () => {
    const el = card(render(), "取得失敗の人");
    expect(el.querySelector(".fetch-error")?.textContent).toBe("取得失敗");
    expect(el.querySelector(".platform-link")?.getAttribute("data-state")).toBe("error");
  });

  it("アイコン画像があれば表示し、なければ頭文字を表示する（AC-27）", () => {
    const root = render();
    expect(card(root, "配信中の人").querySelector<HTMLImageElement>("img.avatar")?.getAttribute("src")).toBe(
      "https://img/live.png",
    );
    expect(card(root, "配信していない人").querySelector(".avatar--fallback")?.textContent).toBe("配");
  });

  it("アイコン画像を読み込めなければ頭文字に切り替える（AC-27）", () => {
    const img = card(render(), "取得失敗の人").querySelector<HTMLImageElement>("img.avatar")!;
    const parent = img.parentElement!;
    img.dispatchEvent(new Event("error"));
    expect(parent.querySelector(".avatar--fallback")?.textContent).toBe("取");
  });

  it("チームのカードにチームカラーを渡す（AC-28）", () => {
    const team = render().querySelector<HTMLElement>('[data-team="a"]')!;
    expect(team.style.getPropertyValue("--team-color")).toBe("#EF6400");
  });

  it("配信中の選手カードにだけ LIVE バッジを付ける（AC-5）", () => {
    const root = render();
    expect(card(root, "配信中の人").querySelector(".live-badge")?.textContent).toBe("LIVE");
    expect(card(root, "配信していない人").querySelector(".live-badge")).toBeNull();
  });

  it("ロールの列見出しと選手カードにロールアイコンを付ける（AC-29）", () => {
    const root = render();
    const header = root.querySelector('[data-team="a"] .role-header')!;
    expect([...header.querySelectorAll(".role-icon")].map((el) => el.className)).toEqual([
      "role-icon role-icon--top",
      "role-icon role-icon--jg",
      "role-icon role-icon--mid",
      "role-icon role-icon--adc",
      "role-icon role-icon--sup",
    ]);
    expect(card(root, "配信中の人").querySelector(".role .role-icon--mid")).not.toBeNull();
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
