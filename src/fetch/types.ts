import type { ChannelState } from "../shared/types";

export type FetchFn = typeof fetch;

// LTK 判定前の、プラットフォームから取得したままの配信情報
export type RawStream = { title: string; url: string };

export type ChannelResult = { state: ChannelState; streams: RawStream[] };

export const OFFLINE: ChannelResult = { state: "offline", streams: [] };
export const FAILED: ChannelResult = { state: "error", streams: [] };

export const chunk = <T>(items: readonly T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
};
