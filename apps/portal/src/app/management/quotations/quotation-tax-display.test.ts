import { describe, expect, it } from "vitest";
import { shouldShowTaxLine } from "./quotation-tax-display";

describe("shouldShowTaxLine", () => {
  it("hides the tax line when the tax is Include (isExclude false) — Total is already inclusive", () => {
    expect(shouldShowTaxLine({ taxCode: "T2", taxAmount: 99000, taxIsExclude: false })).toBe(false);
  });

  it("keeps the tax line when the tax is Exclude", () => {
    expect(shouldShowTaxLine({ taxCode: "T1", taxAmount: 99000, taxIsExclude: true })).toBe(true);
  });

  it("keeps the tax line when the tax mode is unknown (code no longer in the active list)", () => {
    expect(shouldShowTaxLine({ taxCode: "T1", taxAmount: 99000, taxIsExclude: null })).toBe(true);
    expect(shouldShowTaxLine({ taxCode: "T1", taxAmount: 99000 })).toBe(true);
  });

  it("hides the tax line when no tax is selected at all, as before", () => {
    expect(shouldShowTaxLine({ taxCode: null, taxAmount: null })).toBe(false);
  });
});
