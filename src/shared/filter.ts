import { groupByTier, type TierGroup } from "./sort";
import type { PlayerStatus, TeamStatus, Tier } from "./types";

// teams と tiers は空なら「すべて」と同じ扱い
export type Filter = {
  teams: readonly string[];
  tiers: readonly Tier[];
  liveOnly: boolean;
  ltkOnly: boolean;
};

export const EMPTY_FILTER: Filter = { teams: [], tiers: [], liveOnly: false, ltkOnly: false };

export type TeamView = {
  id: string;
  name: string;
  tiers: TierGroup<PlayerStatus>[];
};

export const isPlayerLive = (player: PlayerStatus) => player.channels.some((c) => c.state === "live");

export const hasLtkStream = (player: PlayerStatus) =>
  player.channels.some((c) => c.streams.some((s) => s.ltk));

// 軸の中は OR、軸の間は AND（AC-16, AC-17）
const matches = (team: TeamStatus, player: PlayerStatus, filter: Filter) =>
  (filter.teams.length === 0 || filter.teams.includes(team.id)) &&
  (filter.tiers.length === 0 || filter.tiers.includes(player.tier)) &&
  (!filter.liveOnly || isPlayerLive(player)) &&
  (!filter.ltkOnly || hasLtkStream(player));

// 出場者が0人になったチームと階級は含めない（AC-18）
export function buildView(teams: readonly TeamStatus[], filter: Filter): TeamView[] {
  return teams
    .map((team) => ({
      id: team.id,
      name: team.name,
      tiers: groupByTier(team.players.filter((player) => matches(team, player, filter))),
    }))
    .filter((team) => team.tiers.length > 0);
}
