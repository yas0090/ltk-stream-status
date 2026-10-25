import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { parse as parseYaml } from "yaml";
import { parseKeywordsData, parseTeamsData } from "../shared/schema";
import { generateSiteData, requiredSecrets } from "./generate";
import { createTwitchTokenProvider, fetchTwitchAvatars, fetchTwitchStatuses } from "./twitch";
import { fetchYouTubeAvatars, fetchYouTubeStatuses } from "./youtube";

// データファイルを検証し、配信状態を取得して site-data.json を書き出す。
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

  const missing = requiredSecrets(teams).filter((name) => !process.env[name]);
  if (missing.length > 0) throw new Error(`環境変数が設定されていません: ${missing.join(", ")}`);

  const env = process.env as Record<string, string>;
  const twitchCredentials = { clientId: env.TWITCH_CLIENT_ID!, clientSecret: env.TWITCH_CLIENT_SECRET! };
  const getTwitchToken = createTwitchTokenProvider(twitchCredentials);
  const siteData = await generateSiteData(teams, keywords, {
    twitch: (logins) => fetchTwitchStatuses(logins, twitchCredentials, fetch, getTwitchToken),
    youtube: (channelIds) => fetchYouTubeStatuses(channelIds, env.YOUTUBE_API_KEY!),
    twitchAvatars: (logins) => fetchTwitchAvatars(logins, twitchCredentials, fetch, getTwitchToken),
    youtubeAvatars: (channelIds) => fetchYouTubeAvatars(channelIds, env.YOUTUBE_API_KEY!),
  });

  await mkdir(dirname(values.out), { recursive: true });
  await writeFile(values.out, JSON.stringify(siteData));

  const channels = siteData.teams.flatMap((t) => t.players.flatMap((p) => p.channels));
  const count = (state: string) => channels.filter((c) => c.state === state).length;
  console.log(`${values.out} を書き出しました（配信中 ${count("live")} / 配信なし ${count("offline")} / 取得失敗 ${count("error")}）`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
