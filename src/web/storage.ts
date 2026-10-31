import { EMPTY_FILTER, type Filter } from "../shared/filter";
import { TIERS, type Tier } from "../shared/types";

// ブラウザへの設定の保存。保存領域が使えない環境でも例外を外に出さない（AC-36, AC-39, AC-44）
type KeyValueStorage = Pick<Storage, "getItem" | "setItem"> & Partial<Pick<Storage, "removeItem">>;

export const HIDDEN_PLAYERS_KEY = "ltk-stream-status:hidden-players:v1";
export const FAVORITES_KEY = "ltk-stream-status:favorites:v1";
export const FILTER_KEY = "ltk-stream-status:filter:v1";
export const HELP_SEEN_KEY = "ltk-stream-status:help-seen:v1";

// localStorage へのアクセス自体が例外を投げるブラウザがあるので、取得も try で囲む
export function browserStorage(): KeyValueStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function readItem(key: string, storage = browserStorage()): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeItem(key: string, value: string, storage = browserStorage()): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // 保存できなくても、メモリ上の状態で動き続ける
  }
}

// 詳細フィルタで非表示にした選手のキー（AC-34）。形式が違えば空として扱う
export function loadHiddenPlayers(storage = browserStorage()): Set<string> {
  try {
    const value: unknown = JSON.parse(readItem(HIDDEN_PLAYERS_KEY, storage) ?? "[]");
    return Array.isArray(value) && value.every((key) => typeof key === "string") ? new Set(value) : new Set();
  } catch {
    return new Set();
  }
}

export function saveHiddenPlayers(hidden: ReadonlySet<string>, storage = browserStorage()): void {
  writeItem(HIDDEN_PLAYERS_KEY, JSON.stringify([...hidden].sort()), storage);
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

// お気に入りの選手のキー（AC-73〜75）。登録順を保つので並べ替えない。形式が違えば空として扱う
export function loadFavorites(storage = browserStorage()): string[] {
  try {
    const value: unknown = JSON.parse(readItem(FAVORITES_KEY, storage) ?? "[]");
    return isStringArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function saveFavorites(favorites: readonly string[], storage = browserStorage()): void {
  writeItem(FAVORITES_KEY, JSON.stringify(favorites), storage);
}

// 簡易絞り込みの条件（AC-44）。項目ごとに検証し、形式が違う項目は未選択にする。今のデータにないチームは捨てる
export function loadFilter(teamIds: readonly string[], storage = browserStorage()): Filter {
  let value: unknown;
  try {
    value = JSON.parse(readItem(FILTER_KEY, storage) ?? "null");
  } catch {
    return EMPTY_FILTER;
  }
  if (typeof value !== "object" || value === null) return EMPTY_FILTER;
  const saved = value as Record<string, unknown>;
  return {
    teams: isStringArray(saved.teams) ? saved.teams.filter((id) => teamIds.includes(id)) : [],
    tiers: isStringArray(saved.tiers) ? saved.tiers.filter((tier): tier is Tier => (TIERS as readonly string[]).includes(tier)) : [],
    liveOnly: saved.liveOnly === true,
    ltkOnly: saved.ltkOnly === true,
  };
}

export function saveFilter(filter: Filter, storage = browserStorage()): void {
  writeItem(FILTER_KEY, JSON.stringify(filter), storage);
}

// 保存領域が読み書きできるか。読めても書けない環境（容量超過、プライベートモード）では閉じた記録が残らず毎回出てしまうので、試し書きで確かめる
function canUseStorage(storage: KeyValueStorage | undefined): storage is KeyValueStorage {
  if (!storage) return false;
  const probe = "ltk-stream-status:probe";
  try {
    storage.setItem(probe, "1");
    storage.removeItem?.(probe);
    return true;
  } catch {
    return false;
  }
}

// ヘルプを自動で表示するか（AC-77〜79）。保存領域が使えて、まだ閉じた記録がないときだけ true
export function shouldAutoShowHelp(storage = browserStorage()): boolean {
  if (!canUseStorage(storage)) return false;
  try {
    return storage.getItem(HELP_SEEN_KEY) === null;
  } catch {
    return false;
  }
}

// ヘルプを閉じた記録。内容のバージョンは持たない（AC-80）
export function markHelpSeen(storage = browserStorage()): void {
  writeItem(HELP_SEEN_KEY, "1", storage);
}
