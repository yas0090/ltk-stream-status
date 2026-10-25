import { z } from "zod";
import { ROLES, TIERS } from "./types";

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

export type ChannelInput = z.infer<typeof channelSchema>;
export type PlayerInput = z.infer<typeof playerSchema>;
export type TeamInput = z.infer<typeof teamSchema>;
export type TeamsFile = z.infer<typeof teamsFileSchema>;
export type KeywordsFile = z.infer<typeof keywordsFileSchema>;

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
