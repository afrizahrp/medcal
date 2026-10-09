import { describe, expect, it } from "vitest";
import { resolveHeaderDiscount, roundMoney } from "./quotation-discount";

describe("resolveHeaderDiscount — percent input", () => {
  it("10% of 1.000.000 = 100.000", () => {
    expect(resolveHeaderDiscount({ subtotal: 1_000_000, mode: "PERCENT", value: 10 })).toEqual({
      ok: true,
      amount: 100_000,
      percent: 10,
    });
  });

  it("supports decimal percentages (12.5% of 1.000.000 = 125.000)", () => {
    expect(resolveHeaderDiscount({ subtotal: 1_000_000, mode: "PERCENT", value: 12.5 })).toEqual({
      ok: true,
      amount: 125_000,
      percent: 12.5,
    });
  });

  it("rounds the derived amount half-up to cents (10% of 333.333 = 33.333,30)", () => {
    expect(resolveHeaderDiscount({ subtotal: 333_333, mode: "PERCENT", value: 10 })).toEqual({
      ok: true,
      amount: 33_333.3,
      percent: 10,
    });
    // 0.5 cent boundary rounds UP: 1.05 x 50% = 0.525 -> 0.53
    expect(resolveHeaderDiscount({ subtotal: 1.05, mode: "PERCENT", value: 50 })).toMatchObject({
      amount: 0.53,
    });
  });

  it("keeps at most 4 decimal places of the entered percentage (half-up)", () => {
    expect(
      resolveHeaderDiscount({ subtotal: 1_000_000, mode: "PERCENT", value: 33.33335 }),
    ).toMatchObject({ percent: 33.3334 });
  });

  it("zero percent -> zero amount", () => {
    expect(resolveHeaderDiscount({ subtotal: 500_000, mode: "PERCENT", value: 0 })).toEqual({
      ok: true,
      amount: 0,
      percent: 0,
    });
  });

  it("100% is allowed and discounts the whole subtotal; > 100% is rejected", () => {
    expect(resolveHeaderDiscount({ subtotal: 250_000, mode: "PERCENT", value: 100 })).toEqual({
      ok: true,
      amount: 250_000,
      percent: 100,
    });
    expect(resolveHeaderDiscount({ subtotal: 250_000, mode: "PERCENT", value: 100.0001 })).toEqual({
      ok: false,
      code: "INVALID_HEADER_DISCOUNT_PERCENT",
    });
  });
});

describe("resolveHeaderDiscount — amount input", () => {
  it("100.000 of 1.000.000 = 10%", () => {
    expect(resolveHeaderDiscount({ subtotal: 1_000_000, mode: "AMOUNT", value: 100_000 })).toEqual({
      ok: true,
      amount: 100_000,
      percent: 10,
    });
  });

  it("derives a 4-dp percentage half-up (333.333,33 of 1.000.000 = 33.3333%)", () => {
    expect(
      resolveHeaderDiscount({ subtotal: 1_000_000, mode: "AMOUNT", value: 333_333.33 }),
    ).toEqual({ ok: true, amount: 333_333.33, percent: 33.3333 });
  });

  it("the entered amount is kept exactly (it is the source of truth)", () => {
    const r = resolveHeaderDiscount({ subtotal: 999_999, mode: "AMOUNT", value: 12_345.67 });
    expect(r).toMatchObject({ ok: true, amount: 12_345.67 });
  });

  it("zero amount on a zero subtotal is valid with 0%", () => {
    expect(resolveHeaderDiscount({ subtotal: 0, mode: "AMOUNT", value: 0 })).toEqual({
      ok: true,
      amount: 0,
      percent: 0,
    });
  });

  it("rejects an amount above the subtotal", () => {
    expect(resolveHeaderDiscount({ subtotal: 1_000_000, mode: "AMOUNT", value: 1_000_000.01 })).toEqual({
      ok: false,
      code: "HEADER_DISCOUNT_EXCEEDS_SUBTOTAL",
    });
    expect(resolveHeaderDiscount({ subtotal: 0, mode: "AMOUNT", value: 1 })).toEqual({
      ok: false,
      code: "HEADER_DISCOUNT_EXCEEDS_SUBTOTAL",
    });
  });
});

describe("resolveHeaderDiscount — invalid input", () => {
  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])("rejects value %s", (value) => {
    for (const mode of ["AMOUNT", "PERCENT"] as const) {
      expect(resolveHeaderDiscount({ subtotal: 1_000, mode, value })).toEqual({
        ok: false,
        code: "INVALID_HEADER_DISCOUNT",
      });
    }
  });
});

describe("resolveHeaderDiscount — consistency", () => {
  it("PERCENT mode: amount always equals round2(subtotal x percent / 100)", () => {
    for (const subtotal of [1, 99.99, 12_345.67, 1_000_000, 7_654_321.09]) {
      for (const percent of [0.0001, 0.5, 3.3333, 10, 12.5, 99.9999, 100]) {
        const r = resolveHeaderDiscount({ subtotal, mode: "PERCENT", value: percent });
        expect(r.ok).toBe(true);
        if (!r.ok) continue;
        expect(r.amount).toBe(roundMoney((subtotal * percent) / 100 + 1e-9));
        expect(r.amount).toBeLessThanOrEqual(subtotal);
      }
    }
  });

  it("AMOUNT mode: percent is the 4-dp rendering of amount/subtotal", () => {
    const r = resolveHeaderDiscount({ subtotal: 1_000_000, mode: "AMOUNT", value: 150_000 });
    expect(r).toEqual({ ok: true, amount: 150_000, percent: 15 });
  });

  it("amount -> percent -> amount round-trips exactly for round figures", () => {
    const first = resolveHeaderDiscount({ subtotal: 1_000_000, mode: "AMOUNT", value: 100_000 });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const back = resolveHeaderDiscount({ subtotal: 1_000_000, mode: "PERCENT", value: first.percent });
    expect(back).toMatchObject({ ok: true, amount: 100_000, percent: 10 });
  });
});

describe("roundMoney", () => {
  it("rounds half-up on the decimal representation (1.005 -> 1.01)", () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(2.675)).toBe(2.68);
    expect(roundMoney(0)).toBe(0);
  });
});
