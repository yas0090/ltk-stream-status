import { playerKey } from "./hidden";
import type { PlayerStatus, TeamStatus } from "./types";

// お気に入りの選手を、登録した順のキー（`playerKey`）の配列で持つ（AC-68）

// なければ末尾に追加し、あれば除く（AC-65）
export function toggleFavorite(list: readonly string[], key: string): string[] {
  return list.includes(key) ? list.filter((item) => item !== key) : [...list, key];
}

// 今のデータにいない選手と重複を取り除く。順序は保つ（AC-76）
export function pruneFavorites(list: readonly string[], teams: readonly TeamStatus[]): string[] {
  const existing = new Set(teams.flatMap((team) => team.players.map((player) => playerKey(team.id, player.name))));
  return [...new Set(list)].filter((key) => existing.has(key));
}

export type FavoritePlayer = { team: TeamStatus; player: PlayerStatus; key: string };

// 登録順にチームと選手を返す。絞り込みや非表示の影響を受けない（AC-70）
export function favoritePlayers(list: readonly string[], teams: readonly TeamStatus[]): FavoritePlayer[] {
  const byKey = new Map<string, FavoritePlayer>();
  for (const team of teams) {
    for (const player of team.players) {
      const key = playerKey(team.id, player.name);
      byKey.set(key, { team, player, key });
    }
  }
  return [...new Set(list)].flatMap((key) => byKey.get(key) ?? []);
}
