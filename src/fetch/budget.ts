import { z } from "zod";
import { DataValidationError } from "../shared/schema";
import { jstHour, minutesSince, type FetchState } from "./state";

// YouTube Data API の使用量に応じた、新しい配信の確認の間隔（AC-43）。data/youtube-budget.yaml で定義する
const budgetSchema = z
  .strictObject({
    limit: z.number().int().positive(),
    peakHours: z.strictObject({ start: z.number().int().min(0).max(23), end: z.number().int().min(0).max(23) }),
    peakDiscoveryMinutes: z.number().positive(),
    tiers: z
      .array(
        z.strictObject({
          upTo: z.number().int().positive(),
          discoveryMinutes: z.number().positive(),
          // null は取り直し（RSS 失敗時の playlistItems.list）をしない
          fallbackMinutes: z.number().positive().nullable(),
        }),
      )
      .min(1),
  })
  .superRefine((budget, ctx) => {
    budget.tiers.forEach((tier, i) => {
      const prev = budget.tiers[i - 1];
      if (prev && tier.upTo <= prev.upTo) {
        ctx.addIssue({ code: "custom", path: ["tiers", i, "upTo"], message: "upTo は小さい順に書いてください" });
      }
    });
    if ((budget.tiers.at(-1)?.upTo ?? 0) > budget.limit) {
      ctx.addIssue({ code: "custom", path: ["tiers"], message: "最後の upTo は limit 以下にしてください" });
    }
  });

export type Budget = z.infer<typeof budgetSchema>;

export function parseBudget(input: unknown): Budget {
  const result = budgetSchema.safeParse(input);
  if (result.success) return result.data;
  const lines = result.error.issues.map((issue) => `- ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  throw new DataValidationError(`youtube-budget.yaml の内容に誤りがあります\n${lines.join("\n")}`);
}

export type YouTubePlan = { discover: boolean; fallback: boolean; reason: string };

// cron の遅れを吸収するため、間隔から 1 分を引いた時間が経っていれば実行する
const SLACK_MINUTES = 1;

const isPeak = (hour: number, { start, end }: Budget["peakHours"]) =>
  start <= end ? hour >= start && hour < end : hour >= start || hour < end;

// 時間帯と使用量から、この回に新しい配信の確認と取り直しをするかを決める。state は今日の日付に揃えたもの
export function planYouTube(state: FetchState, budget: Budget, now: Date): YouTubePlan {
  const { used, exceeded } = state.quota;
  if (exceeded) return { discover: false, fallback: false, reason: "クォータ超過の応答を受けたため停止中" };
  const tier = budget.tiers.find((t) => used < t.upTo);
  if (used >= budget.limit || !tier) return { discover: false, fallback: false, reason: `使用量 ${used} が上限に達したため停止中` };

  const peak = isPeak(jstHour(now), budget.peakHours);
  const interval = peak ? budget.peakDiscoveryMinutes : tier.discoveryMinutes;
  const discover = minutesSince(state.lastDiscoveryAt, now) >= interval - SLACK_MINUTES;
  const fallback =
    discover &&
    tier.fallbackMinutes !== null &&
    minutesSince(state.lastFallbackAt, now) >= tier.fallbackMinutes - SLACK_MINUTES;
  return { discover, fallback, reason: `${peak ? "夜" : "朝・昼"}・使用量 ${used}・間隔 ${interval} 分` };
}

// アイコン画像は 1 時間に 1 回だけ取り直す（節約 B）
export const avatarsDue = (state: FetchState, now: Date) => minutesSince(state.avatarsFetchedAt, now) >= 60 - SLACK_MINUTES;
