import { describe, expect, it } from "vitest";
import { formatIdr } from "./index";

describe("formatIdr", () => {
  it("formats whole rupiah with '.' thousands separators and no decimals", () => {
    expect(formatIdr(0)).toBe("Rp 0");
    expect(formatIdr(1)).toBe("Rp 1");
    expect(formatIdr(1000)).toBe("Rp 1.000");
    expect(formatIdr(10000)).toBe("Rp 10.000");
    expect(formatIdr(1000000)).toBe("Rp 1.000.000");
    expect(formatIdr(10500000)).toBe("Rp 10.500.000");
    expect(formatIdr(15000000)).toBe("Rp 15.000.000");
  });

  it("accepts numeric strings (API decimal values)", () => {
    expect(formatIdr("1250000")).toBe("Rp 1.250.000");
    expect(formatIdr("800000.00")).toBe("Rp 800.000");
  });

  it("handles negative amounts", () => {
    expect(formatIdr(-1000)).toBe("-Rp 1.000");
    expect(formatIdr(-1500000)).toBe("-Rp 1.500.000");
  });

  it("renders null / empty / non-finite as Rp 0", () => {
    expect(formatIdr(null)).toBe("Rp 0");
    expect(formatIdr(undefined)).toBe("Rp 0");
    expect(formatIdr("")).toBe("Rp 0");
    expect(formatIdr(Number.NaN)).toBe("Rp 0");
    expect(formatIdr("not-a-number")).toBe("Rp 0");
  });

  it("uses a plain ASCII space after the Rp symbol", () => {
    expect(formatIdr(1000).charCodeAt(2)).toBe(32);
  });
});
