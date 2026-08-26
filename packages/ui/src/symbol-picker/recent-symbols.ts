export const SYMBOL_PICKER_RECENT_KEY = "medcal.symbol-picker.recent";
export const SYMBOL_PICKER_RECENT_MAX = 8;

export function readRecentSymbols(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SYMBOL_PICKER_RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && item.length > 0).slice(0, SYMBOL_PICKER_RECENT_MAX);
  } catch {
    return [];
  }
}

export function rememberRecentSymbol(symbol: string, current: string[]): string[] {
  const next = [symbol, ...current.filter((item) => item !== symbol)].slice(0, SYMBOL_PICKER_RECENT_MAX);
  try {
    window.localStorage.setItem(SYMBOL_PICKER_RECENT_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota / private-mode failures; recent is optional.
  }
  return next;
}
