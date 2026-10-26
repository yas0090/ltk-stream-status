// 配列の順番がそのまま表示順になる（AC-3, AC-4）
export const TIERS = ["Masters", "Core", "Next"] as const;
export const ROLES = ["TOP", "JG", "MID", "ADC", "SUP"] as const;
export const PLATFORMS = ["twitch", "youtube"] as const;

export type Tier = (typeof TIERS)[number];
export type Role = (typeof ROLES)[number];
export type Platform = (typeof PLATFORMS)[number];

// error は取得失敗（AC-22）
export type ChannelState = "live" | "offline" | "error";

export type Stream = {
  title: string;
  url: string;
  ltk: boolean;
  // 配信のサムネイル（AC-42）
  thumbnailUrl?: string;
};

export type ChannelStatus = {
  platform: Platform;
  channelUrl: string;
  state: ChannelState;
  // state が live のときだけ要素がある
  streams: Stream[];
};

export type PlayerStatus = {
  name: string;
  tier: Tier;
  role: Role;
  // チャンネルのアイコン画像。取得できなければ省略（AC-27）
  avatarUrl?: string;
  channels: ChannelStatus[];
};

export type TeamStatus = {
  id: string;
  name: string;
  // チームカラー（AC-28）
  color: string;
  players: PlayerStatus[];
};

// 本戦の対戦カード。blue / red はチーム id（AC-45）
export type Game = { blue: string; red: string; tiers: Tier[] };

export type Match = {
  stage: string;
  day: string;
  // ISO 8601
  startAt: string;
  endAt: string;
  games: Game[];
};

export type Schedule = {
  // 開始時刻の順
  matches: Match[];
  // 公式チャンネル。取得しない時間帯は offline（AC-47）
  official: { twitch: ChannelStatus; youtube: ChannelStatus };
};

// site-data.json の形式
export type SiteData = {
  generatedAt: string;
  teams: TeamStatus[];
  // 本戦の案内（AC-45〜49）。schedule.yaml がなければ省略
  schedule?: Schedule;
};
