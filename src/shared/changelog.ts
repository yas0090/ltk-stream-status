import type { ChangelogEntry } from "./types";

// 日付の新しい順に並べる。同じ日付はファイルに書いた順（上が先）
export const sortChangelog = (entries: readonly ChangelogEntry[]): ChangelogEntry[] =>
  entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => b.entry.date.localeCompare(a.entry.date) || a.index - b.index)
    .map(({ entry }) => ({ ...entry }));
