import { describe, expect, it } from "vitest";
import {
  SYMBOL_REGISTRY,
  applySymbolInsert,
  filterSymbols,
  isCompatibleInputType,
} from "@medcal/ui";

describe("filterSymbols", () => {
  it("finds ohm", () => {
    expect(filterSymbols("ohm").map((entry) => entry.symbol)).toContain("Ω");
  });

  it("finds degree", () => {
    expect(filterSymbols("degree").map((entry) => entry.symbol)).toContain("°");
  });

  it("finds plus minus", () => {
    expect(filterSymbols("plus minus").map((entry) => entry.symbol)).toContain("±");
  });

  it("finds micro", () => {
    expect(filterSymbols("micro").map((entry) => entry.symbol)).toContain("µ");
  });

  it("finds sigma", () => {
    const symbols = filterSymbols("sigma").map((entry) => entry.symbol);
    expect(symbols).toContain("Σ");
    expect(symbols).toContain("σ");
  });
});

describe("applySymbolInsert", () => {
  it("inserts at the caret in the middle of the value", () => {
    expect(applySymbolInsert("10 20", 3, 3, "×")).toEqual({ nextValue: "10 ×20", caret: 4 });
  });

  it("replaces the selected range", () => {
    expect(applySymbolInsert("10 20", 3, 5, "±")).toEqual({ nextValue: "10 ±", caret: 4 });
  });

  it("appends when the caret is at the end", () => {
    expect(applySymbolInsert("10 ", 3, 3, "±")).toEqual({ nextValue: "10 ±", caret: 4 });
  });

  it("inserts micro after a UOM prefix", () => {
    expect(applySymbolInsert("m", 1, 1, "µ")).toEqual({ nextValue: "mµ", caret: 2 });
  });

  it("respects maxLength", () => {
    expect(applySymbolInsert("m", 1, 1, "µ", 1)).toEqual({ nextValue: "m", caret: 1 });
  });
});

describe("isCompatibleInputType", () => {
  it("allows text inputs", () => {
    expect(isCompatibleInputType("text")).toBe(true);
    expect(isCompatibleInputType(undefined)).toBe(true);
    expect(isCompatibleInputType("")).toBe(true);
  });

  it("skips number, email, and other non-text types", () => {
    expect(isCompatibleInputType("number")).toBe(false);
    expect(isCompatibleInputType("email")).toBe(false);
    expect(isCompatibleInputType("search")).toBe(false);
    expect(isCompatibleInputType("password")).toBe(false);
    expect(isCompatibleInputType("checkbox")).toBe(false);
    expect(isCompatibleInputType("date")).toBe(false);
    expect(isCompatibleInputType("file")).toBe(false);
  });
});

describe("SYMBOL_REGISTRY", () => {
  it("has unique symbols", () => {
    const symbols = SYMBOL_REGISTRY.map((entry) => entry.symbol);
    expect(new Set(symbols).size).toBe(symbols.length);
  });
});
