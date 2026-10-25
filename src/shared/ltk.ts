// 大文字・小文字と全角・半角の違いを無視して比べる（AC-12）
const normalize = (s: string) => s.normalize("NFKC").toLowerCase();

export const isLtk = (title: string, keywords: readonly string[]): boolean => {
  const normalizedTitle = normalize(title);
  return keywords.some((keyword) => normalizedTitle.includes(normalize(keyword)));
};
