import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { parse as parseYaml } from "yaml";
import { parseChangelogData, parseKeywordsData, parseScheduleData, parseTeamsData } from "../shared/schema";
import { parseBudget } from "./budget";
import { generateSiteData, requiredSecrets } from "./generate";
import { loadState } from "./state";
import { createTwitchTokenProvider, fetchTwitchAvatars, fetchTwitchStatuses } from "./twitch";
import { createYouTubeClient, fetchYouTube, fetchYouTubeAvatars } from "./youtube";

// データファイルを検証し、配信状態を取得して site-data.json と state.json を書き出す。
// 検証エラーや設定不足のときは終了コード 1 で終える（AC-23）
async function main() {
  const { values } = parseArgs({
    options: {
      data: { type: "string", default: "data" },
      out: { type: "string", default: "src/web/public/site-data.json" },
    },
  });

  if (existsSync(".env")) process.loadEnvFile(".env");

  const readYaml = async (name: string) => parseYaml(await readFile(join(values.data, name), "utf8"));
  const teams = parseTeamsData(await readYaml("teams.yaml"));
  const keywords = parseKeywordsData(await readYaml("keywords.yaml"));
  const budget = parseBudget(await readYaml("youtube-budget.yaml"));
  // 本戦の日程（AC-45）。ファイルがなければ案内を出さない
  const schedule = existsSync(join(values.data, "schedule.yaml"))
    ? parseScheduleData(await readYaml("schedule.yaml"), teams.teams.map((t) => t.id))
    : undefined;

  // 更新履歴。ファイルがなければ出さない
  const changelog = existsSync(join(values.data, "changelog.yaml"))
    ? parseChangelogData(await readYaml("changelog.yaml"))
    : undefined;

  const missing = requiredSecrets(teams).filter((name) => !process.env[name]);
  if (missing.length > 0) throw new Error(`環境変数が設定されていません: ${missing.join(", ")}`);

  const env = process.env as Record<string, string>;
  const now = new Date();
  // 前回の結果は公開サイトの state.json から読む（AC-43）。PUBLIC_SITE_URL がなければ初期状態で取得する
  const previousState = await loadState(env.PUBLIC_SITE_URL || undefined, now);
  const twitchCredentials = { clientId: env.TWITCH_CLIENT_ID!, clientSecret: env.TWITCH_CLIENT_SECRET! };
  const getTwitchToken = createTwitchTokenProvider(twitchCredentials);
  const youtube = createYouTubeClient(env.YOUTUBE_API_KEY ?? "");
  const { siteData, state, plan } = await generateSiteData(
    teams,
    keywords,
    {
      twitch: (logins) => fetchTwitchStatuses(logins, twitchCredentials, fetch, getTwitchToken, now),
      youtube: (request) => fetchYouTube(request, youtube, fetch, now),
      twitchAvatars: (logins) => fetchTwitchAvatars(logins, twitchCredentials, fetch, getTwitchToken),
      youtubeAvatars: (channelIds) => fetchYouTubeAvatars(channelIds, youtube),
      youtubeUsage: () => ({ used: youtube.used, exceeded: youtube.exceeded }),
    },
    { now, previousState, budget, schedule, changelog },
  );

  await mkdir(dirname(values.out), { recursive: true });
  await writeFile(values.out, JSON.stringify(siteData));
  await writeFile(join(dirname(values.out), "state.json"), JSON.stringify(state));

  const channels = siteData.teams.flatMap((t) => t.players.flatMap((p) => p.channels));
  const count = (state: string) => channels.filter((c) => c.state === state).length;
  console.log(`${values.out} を書き出しました（配信中 ${count("live")} / 配信なし ${count("offline")} / 取得失敗 ${count("error")}）`);
  console.log(
    `YouTube: 新しい配信の確認 ${plan.discover ? "あり" : "なし"}・取り直し ${plan.fallback ? "可" : "不可"}（${plan.reason}）。` +
      `今回の使用量 ${youtube.used}、今日（太平洋時間 ${state.quota.day}）の合計 ${state.quota.used}${state.quota.exceeded ? "（超過）" : ""}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
