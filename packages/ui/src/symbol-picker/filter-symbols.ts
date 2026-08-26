import { SYMBOL_REGISTRY, type SymbolEntry } from "./symbol-registry";

export function normalizeSymbolQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

export function filterSymbols(
  query: string,
  registry: readonly SymbolEntry[] = SYMBOL_REGISTRY,
): SymbolEntry[] {
  const q = normalizeSymbolQuery(query);
  if (!q) return [...registry];
  return registry.filter((entry) => {
    if (entry.symbol.toLowerCase().includes(q)) return true;
    if (entry.name.toLowerCase().includes(q)) return true;
    return entry.keywords.some((keyword) => keyword.toLowerCase().includes(q));
  });
}
