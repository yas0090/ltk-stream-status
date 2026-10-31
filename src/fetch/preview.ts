import { sortChangelog } from "../shared/changelog";
import { parseChangelogData } from "../shared/schema";

// プレビュー用に、本番から借りた site-data.json の更新履歴だけを PR の changelog.yaml に差し替える（AC-11）。
// changelogInput が undefined（ファイルがない）なら、generate と同じく changelog を出さない
export function withChangelog(siteData: unknown, changelogInput: unknown): Record<string, unknown> {
  if (typeof siteData !== "object" || siteData === null || Array.isArray(siteData)) {
    throw new Error("site-data.json の内容がオブジェクトではありません");
  }
  const { changelog: _, ...rest } = siteData as Record<string, unknown>;
  if (changelogInput === undefined) return rest;
  return { ...rest, changelog: sortChangelog(parseChangelogData(changelogInput).entries) };
}
