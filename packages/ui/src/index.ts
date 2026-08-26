/** Thin shared UI — extract shadcn components here only when reused ≥2 apps */
export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export {
  GlobalSymbolPicker,
  SYMBOL_CATEGORY_LABELS,
  SYMBOL_CATEGORY_ORDER,
  SYMBOL_PICKER_RECENT_KEY,
  SYMBOL_PICKER_RECENT_MAX,
  SYMBOL_REGISTRY,
  QUICK_SYMBOLS,
  applySymbolInsert,
  filterSymbols,
  findSymbolEntry,
  insertSymbolAtSelection,
  isCompatibleInputType,
  isCompatibleTextField,
  normalizeSymbolQuery,
  quickSymbolEntries,
  readRecentSymbols,
  rememberRecentSymbol,
  symbolsInCategory,
} from "./symbol-picker";
export type { SymbolCategory, SymbolEntry, TextField } from "./symbol-picker";
