import { ROLES, TIERS, type Role, type Tier } from "./types";

export type TierGroup<P> = { tier: Tier; players: P[] };

// チームの順はデータの順のまま使い（AC-2）、チーム内を階級・ロール順に分ける（AC-3, AC-4）
export function groupByTier<P extends { tier: Tier; role: Role }>(players: readonly P[]): TierGroup<P>[] {
  return TIERS.map((tier) => ({
    tier,
    players: players
      .filter((player) => player.tier === tier)
      .sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role)),
  })).filter((group) => group.players.length > 0);
}
