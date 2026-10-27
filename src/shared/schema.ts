import { z } from "zod";
import { jstAt } from "./schedule";
import { ROLES, TIERS, type Match } from "./types";

const twitchChannelSchema = z.strictObject({
  platform: z.literal("twitch"),
  login: z.string().regex(/^[A-Za-z0-9_]{1,25}$/, "Twitch のログイン名の形式が正しくありません"),
});

const youtubeChannelSchema = z.strictObject({
  platform: z.literal("youtube"),
  channelId: z.string().regex(/^UC[A-Za-z0-9_-]{22}$/, "YouTube のチャンネル ID は UC で始まる24文字です"),
});

const channelSchema = z.discriminatedUnion("platform", [twitchChannelSchema, youtubeChannelSchema]);

const playerSchema = z.strictObject({
  name: z.string().min(1),
  tier: z.enum(TIERS),
  role: z.enum(ROLES),
  channels: z.array(channelSchema).min(1, "チャンネルを1つ以上登録してください"),
});

const teamSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/, "チーム id は英小文字・数字・ハイフンだけで書いてください"),
  name: z.string().min(1),
  // チームカラー（AC-28）
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "チームカラーは #RRGGBB 形式で書いてください"),
  players: z.array(playerSchema),
});

const channelKey = (c: z.infer<typeof channelSchema>) =>
  c.platform === "twitch" ? `twitch:${c.login.toLowerCase()}` : `youtube:${c.channelId}`;

const teamsFileSchema = z
  .strictObject({ teams: z.array(teamSchema) })
  .superRefine((data, ctx) => {
    const teamIds = new Set<string>();
    const channels = new Set<string>();

    data.teams.forEach((team, ti) => {
      if (teamIds.has(team.id)) {
        ctx.addIssue({ code: "custom", path: ["teams", ti, "id"], message: `チーム id「${team.id}」が重複しています` });
      }
      teamIds.add(team.id);

      const slots = new Set<string>();
      team.players.forEach((player, pi) => {
        const slot = `${player.tier}/${player.role}`;
        if (slots.has(slot)) {
          ctx.addIssue({
            code: "custom",
            path: ["teams", ti, "players", pi],
            message: `チーム「${team.id}」で ${player.tier} の ${player.role} が重複しています`,
          });
        }
        slots.add(slot);

        player.channels.forEach((channel, ci) => {
          const key = channelKey(channel);
          if (channels.has(key)) {
            ctx.addIssue({
              code: "custom",
              path: ["teams", ti, "players", pi, "channels", ci],
              message: `チャンネル「${key}」が重複して登録されています`,
            });
          }
          channels.add(key);
        });
      });
    });
  });

const keywordsFileSchema = z.strictObject({
  ltkKeywords: z.array(z.string().min(1)).min(1, "キーワードを1つ以上登録してください"),
});

// 本戦の日程（AC-45）。日付と時刻は日本時間で書く。終了が日をまたぐ場合は 24:00 以降で書く
const timeSchema = z.string().regex(/^([01][0-9]|2[0-9]|3[0-9]|4[0-7]):[0-5][0-9]$/, "時刻は HH:MM 形式で書いてください（00:00〜47:59）");

const gameSchema = z.strictObject({
  blue: z.string().min(1),
  red: z.string().min(1),
  tiers: z.array(z.enum(TIERS)).min(1, "階級を1つ以上書いてください"),
});

const matchSchema = z.strictObject({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付は YYYY-MM-DD 形式で書いてください"),
  stage: z.string().min(1),
  day: z.string().min(1),
  start: timeSchema,
  end: timeSchema,
  // 対戦カードが未定の本戦は games を省略（または空に）し、本戦単位の tiers を書く（AC-50）
  games: z.array(gameSchema).optional(),
  tiers: z.array(z.enum(TIERS)).optional(),
});

const scheduleFileSchema = z.strictObject({
  official: z.strictObject({
    twitch: z.string().regex(/^[A-Za-z0-9_]{1,25}$/, "Twitch のログイン名の形式が正しくありません"),
    youtube: z.string().regex(/^UC[A-Za-z0-9_-]{22}$/, "YouTube のチャンネル ID は UC で始まる24文字です"),
  }),
  matches: z.array(matchSchema),
});


export type ChannelInput = z.infer<typeof channelSchema>;
export type PlayerInput = z.infer<typeof playerSchema>;
export type TeamInput = z.infer<typeof teamSchema>;
export type TeamsFile = z.infer<typeof teamsFileSchema>;
export type KeywordsFile = z.infer<typeof keywordsFileSchema>;
export type ScheduleFile = z.infer<typeof scheduleFileSchema>;

export class DataValidationError extends Error {
  override name = "DataValidationError";
}

function parseWith<T>(schema: z.ZodType<T>, input: unknown, label: string): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const lines = result.error.issues.map((issue) => `- ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  throw new DataValidationError(`${label} の内容に誤りがあります\n${lines.join("\n")}`);
}

export const parseTeamsData = (input: unknown): TeamsFile => parseWith(teamsFileSchema, input, "teams.yaml");

export const parseKeywordsData = (input: unknown): KeywordsFile =>
  parseWith(keywordsFileSchema, input, "keywords.yaml");

// teams.yaml にあるチーム id だけを対戦カードに使える
export function parseScheduleData(input: unknown, teamIds: readonly string[]): ScheduleFile {
  const schema = scheduleFileSchema
    .superRefine((data, ctx) => {
      const dates = new Set<string>();
      data.matches.forEach((match, mi) => {
        if (Number.isNaN(jstAt(match.date, "00:00").getTime())) {
          ctx.addIssue({ code: "custom", path: ["matches", mi, "date"], message: `日付「${match.date}」が正しくありません` });
        }
        if (dates.has(match.date)) {
          ctx.addIssue({ code: "custom", path: ["matches", mi, "date"], message: `日付「${match.date}」が重複しています` });
        }
        dates.add(match.date);
        if (match.start >= match.end) {
          ctx.addIssue({ code: "custom", path: ["matches", mi, "end"], message: "終了予定時刻は開始時刻より後にしてください" });
        }
        const games = match.games ?? [];
        if (games.length === 0 && !match.tiers?.length) {
          ctx.addIssue({
            code: "custom",
            path: ["matches", mi],
            message: "対戦カード（games）か、本戦の階級（tiers）のどちらかを書いてください",
          });
        }
        if (games.length > 0 && match.tiers !== undefined) {
          ctx.addIssue({
            code: "custom",
            path: ["matches", mi, "tiers"],
            message: "games がある本戦には、本戦単位の tiers は書けません（階級は games の中に書いてください）",
          });
        }
        games.forEach((game, gi) => {
          for (const side of ["blue", "red"] as const) {
            if (!teamIds.includes(game[side])) {
              ctx.addIssue({
                code: "custom",
                path: ["matches", mi, "games", gi, side],
                message: `チーム id「${game[side]}」は teams.yaml にありません`,
              });
            }
          }
          if (game.blue === game.red) {
            ctx.addIssue({ code: "custom", path: ["matches", mi, "games", gi], message: "同じチーム同士の対戦になっています" });
          }
        });
      });
    });
  return parseWith(schema, input, "schedule.yaml");
}

// 開始時刻の順に並べ、日時を ISO 8601 にする
export const toMatches = (file: ScheduleFile): Match[] =>
  file.matches
    .map((m) => ({
      stage: m.stage,
      day: m.day,
      startAt: jstAt(m.date, m.start).toISOString(),
      endAt: jstAt(m.date, m.end).toISOString(),
      games: (m.games ?? []).map((g) => ({ blue: g.blue, red: g.red, tiers: [...g.tiers] })),
      ...(m.tiers?.length ? { tiers: [...m.tiers] } : {}),
    }))
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
