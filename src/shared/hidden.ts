import type { TeamStatus } from "./types";

// 詳細フィルタで非表示にした選手を表すキー（AC-31）
export const playerKey = (teamId: string, playerName: string) => `${teamId}:${playerName}`;

export type Visibility = "all" | "none" | "some";

// チームや階級の配下の選手が、全員表示・全員非表示・一部だけ表示のどれか（AC-32）
export function visibilityOf(keys: readonly string[], hidden: ReadonlySet<string>): Visibility {
  const hiddenCount = keys.filter((key) => hidden.has(key)).length;
  if (hiddenCount === 0) return "all";
  return hiddenCount === keys.length ? "none" : "some";
}

// チーム・階級・選手の単位でまとめて表示・非表示を切り替える（AC-32）
export function setHidden(hidden: ReadonlySet<string>, keys: readonly string[], hide: boolean): Set<string> {
  const next = new Set(hidden);
  for (const key of keys) {
    if (hide) next.add(key);
    else next.delete(key);
  }
  return next;
}

// 今のデータにいない選手のキーを取り除く（AC-37）
export function pruneHidden(hidden: ReadonlySet<string>, teams: readonly TeamStatus[]): Set<string> {
  const existing = new Set(teams.flatMap((team) => team.players.map((player) => playerKey(team.id, player.name))));
  return new Set([...hidden].filter((key) => existing.has(key)));
}
