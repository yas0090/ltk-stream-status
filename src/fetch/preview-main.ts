import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { parse as parseYaml } from "yaml";
import { withChangelog } from "./preview";

// プレビューの site-data.json に PR の更新履歴を入れる（AC-11）。
// ファイルの読み書きだけで、配信状態の取得はしない（YouTube のクォータを使わない）
async function main() {
  const { values } = parseArgs({
    options: {
      data: { type: "string", default: "data" },
      site: { type: "string", default: "dist/site-data.json" },
    },
  });

  const changelogPath = join(values.data, "changelog.yaml");
  const changelog = existsSync(changelogPath) ? parseYaml(await readFile(changelogPath, "utf8")) : undefined;
  const siteData = withChangelog(JSON.parse(await readFile(values.site, "utf8")), changelog);

  await writeFile(values.site, JSON.stringify(siteData));
  const count = Array.isArray(siteData.changelog) ? siteData.changelog.length : 0;
  console.log(`${values.site} の更新履歴を ${changelogPath} の内容（${count} 件）に差し替えました`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
