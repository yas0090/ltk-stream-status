export const STALE_AFTER_MS = 30 * 60_000;

// 最終更新から30分以上たっていたら古いとみなす（AC-10）
export const isStale = (generatedAt: string, now: Date): boolean => {
  const generated = Date.parse(generatedAt);
  return Number.isNaN(generated) || now.getTime() - generated >= STALE_AFTER_MS;
};
