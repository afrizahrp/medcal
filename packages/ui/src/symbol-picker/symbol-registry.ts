export type SymbolCategory =
  | "common"
  | "mathematical"
  | "units"
  | "superscript"
  | "subscript"
  | "arrows";

export interface SymbolEntry {
  symbol: string;
  name: string;
  keywords: string[];
  /** A symbol may appear in more than one category without duplicating its definition. */
  categories: SymbolCategory[];
}

export const SYMBOL_CATEGORY_ORDER: SymbolCategory[] = [
  "common",
  "mathematical",
  "units",
  "superscript",
  "subscript",
  "arrows",
];

export const SYMBOL_CATEGORY_LABELS: Record<SymbolCategory, string> = {
  common: "Common",
  mathematical: "Mathematical",
  units: "Units / Measurement",
  superscript: "Superscript",
  subscript: "Subscript",
  arrows: "Arrows / Other",
};

export const QUICK_SYMBOLS = ["±", "°", "µ", "Ω", "×", "÷", "≤", "≥", "≠", "≈"] as const;

export const SYMBOL_REGISTRY: readonly SymbolEntry[] = [
  {
    symbol: "±",
    name: "plus minus",
    keywords: ["plus minus", "plus-minus", "tolerance", "variation"],
    categories: ["common", "mathematical"],
  },
  {
    symbol: "°",
    name: "degree",
    keywords: ["degree", "degrees", "angle", "temperature"],
    categories: ["common", "units"],
  },
  {
    symbol: "µ",
    name: "micro",
    keywords: ["micro", "mu", "micron", "micro sign"],
    categories: ["common", "units"],
  },
  {
    symbol: "Ω",
    name: "ohm",
    keywords: ["ohm", "omega", "resistance"],
    categories: ["common", "units"],
  },
  {
    symbol: "×",
    name: "multiply",
    keywords: ["multiply", "times", "multiplication", "product"],
    categories: ["common", "mathematical"],
  },
  {
    symbol: "÷",
    name: "divide",
    keywords: ["divide", "division", "quotient"],
    categories: ["common", "mathematical"],
  },
  {
    symbol: "≤",
    name: "less equal",
    keywords: ["less equal", "less than or equal", "lte"],
    categories: ["common", "mathematical"],
  },
  {
    symbol: "≥",
    name: "greater equal",
    keywords: ["greater equal", "greater than or equal", "gte"],
    categories: ["common", "mathematical"],
  },
  {
    symbol: "≠",
    name: "not equal",
    keywords: ["not equal", "inequality", "unequal"],
    categories: ["common", "mathematical"],
  },
  {
    symbol: "≈",
    name: "approximately",
    keywords: ["approximately", "approx", "almost equal"],
    categories: ["common", "mathematical"],
  },
  {
    symbol: "√",
    name: "square root",
    keywords: ["square root", "sqrt", "root"],
    categories: ["mathematical"],
  },
  {
    symbol: "∞",
    name: "infinity",
    keywords: ["infinity", "infinite"],
    categories: ["mathematical"],
  },
  {
    symbol: "Δ",
    name: "delta",
    keywords: ["delta", "difference", "change", "increment"],
    categories: ["mathematical"],
  },
  {
    symbol: "Σ",
    name: "sigma",
    keywords: ["sigma", "sum", "summation", "capital sigma"],
    categories: ["mathematical"],
  },
  {
    symbol: "σ",
    name: "small sigma",
    keywords: ["sigma", "standard deviation", "stddev", "small sigma", "greek sigma"],
    categories: ["mathematical", "units"],
  },
  {
    symbol: "℃",
    name: "degree celsius",
    keywords: ["celsius", "centigrade", "degree c", "deg c"],
    categories: ["units"],
  },
  {
    symbol: "℉",
    name: "degree fahrenheit",
    keywords: ["fahrenheit", "degree f", "deg f"],
    categories: ["units"],
  },
  {
    symbol: "⁰",
    name: "superscript 0",
    keywords: ["superscript 0", "power 0"],
    categories: ["superscript"],
  },
  {
    symbol: "¹",
    name: "superscript 1",
    keywords: ["superscript 1", "power 1"],
    categories: ["superscript"],
  },
  {
    symbol: "²",
    name: "superscript 2",
    keywords: ["superscript 2", "squared", "power 2"],
    categories: ["superscript"],
  },
  {
    symbol: "³",
    name: "superscript 3",
    keywords: ["superscript 3", "cubed", "cubic", "power 3"],
    categories: ["superscript"],
  },
  {
    symbol: "⁴",
    name: "superscript 4",
    keywords: ["superscript 4", "power 4"],
    categories: ["superscript"],
  },
  {
    symbol: "⁵",
    name: "superscript 5",
    keywords: ["superscript 5", "power 5"],
    categories: ["superscript"],
  },
  {
    symbol: "⁶",
    name: "superscript 6",
    keywords: ["superscript 6", "power 6"],
    categories: ["superscript"],
  },
  {
    symbol: "⁷",
    name: "superscript 7",
    keywords: ["superscript 7", "power 7"],
    categories: ["superscript"],
  },
  {
    symbol: "⁸",
    name: "superscript 8",
    keywords: ["superscript 8", "power 8"],
    categories: ["superscript"],
  },
  {
    symbol: "⁹",
    name: "superscript 9",
    keywords: ["superscript 9", "power 9"],
    categories: ["superscript"],
  },
  {
    symbol: "₀",
    name: "subscript 0",
    keywords: ["subscript 0"],
    categories: ["subscript"],
  },
  {
    symbol: "₁",
    name: "subscript 1",
    keywords: ["subscript 1"],
    categories: ["subscript"],
  },
  {
    symbol: "₂",
    name: "subscript 2",
    keywords: ["subscript 2"],
    categories: ["subscript"],
  },
  {
    symbol: "₃",
    name: "subscript 3",
    keywords: ["subscript 3"],
    categories: ["subscript"],
  },
  {
    symbol: "₄",
    name: "subscript 4",
    keywords: ["subscript 4"],
    categories: ["subscript"],
  },
  {
    symbol: "₅",
    name: "subscript 5",
    keywords: ["subscript 5"],
    categories: ["subscript"],
  },
  {
    symbol: "₆",
    name: "subscript 6",
    keywords: ["subscript 6"],
    categories: ["subscript"],
  },
  {
    symbol: "₇",
    name: "subscript 7",
    keywords: ["subscript 7"],
    categories: ["subscript"],
  },
  {
    symbol: "₈",
    name: "subscript 8",
    keywords: ["subscript 8"],
    categories: ["subscript"],
  },
  {
    symbol: "₉",
    name: "subscript 9",
    keywords: ["subscript 9"],
    categories: ["subscript"],
  },
  {
    symbol: "→",
    name: "right arrow",
    keywords: ["right arrow", "arrow"],
    categories: ["arrows"],
  },
  {
    symbol: "←",
    name: "left arrow",
    keywords: ["left arrow", "arrow"],
    categories: ["arrows"],
  },
  {
    symbol: "↑",
    name: "up arrow",
    keywords: ["up arrow", "arrow"],
    categories: ["arrows"],
  },
  {
    symbol: "↓",
    name: "down arrow",
    keywords: ["down arrow", "arrow"],
    categories: ["arrows"],
  },
  {
    symbol: "↔",
    name: "left right arrow",
    keywords: ["left right arrow", "bidirectional", "arrow"],
    categories: ["arrows"],
  },
  {
    symbol: "⇒",
    name: "double right arrow",
    keywords: ["double arrow", "implies", "arrow"],
    categories: ["arrows"],
  },
  {
    symbol: "•",
    name: "bullet",
    keywords: ["bullet", "dot", "list"],
    categories: ["arrows"],
  },
  {
    symbol: "©",
    name: "copyright",
    keywords: ["copyright"],
    categories: ["arrows"],
  },
  {
    symbol: "®",
    name: "registered",
    keywords: ["registered", "trademark"],
    categories: ["arrows"],
  },
  {
    symbol: "™",
    name: "trademark",
    keywords: ["trademark", "tm"],
    categories: ["arrows"],
  },
];

const bySymbol = new Map(SYMBOL_REGISTRY.map((entry) => [entry.symbol, entry]));

export function findSymbolEntry(symbol: string): SymbolEntry | undefined {
  return bySymbol.get(symbol);
}

export function symbolsInCategory(category: SymbolCategory): SymbolEntry[] {
  return SYMBOL_REGISTRY.filter((entry) => entry.categories.includes(category));
}

export function quickSymbolEntries(): SymbolEntry[] {
  return QUICK_SYMBOLS.map((symbol) => bySymbol.get(symbol)).filter(
    (entry): entry is SymbolEntry => entry != null,
  );
}
