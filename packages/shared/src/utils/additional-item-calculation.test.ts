import { describe, expect, it } from "vitest";
import { additionalLineTotal, describeAdditionalCalculation } from "./additional-item-calculation";

describe("additionalLineTotal", () => {
  it("simple qty: 100.000 x 1 = 100.000", () => {
    expect(additionalLineTotal(100_000, 1)).toBe(100_000);
  });
  it("people x days: 100.000 x 3 x 2 = 600.000", () => {
    expect(additionalLineTotal(100_000, 3, 2)).toBe(600_000);
  });
  it("lunch: 50.000 x 3 x 2 = 300.000; transport + lunch contribute 900.000", () => {
    expect(additionalLineTotal(50_000, 3, 2)).toBe(300_000);
    expect(additionalLineTotal(100_000, 3, 2) + additionalLineTotal(50_000, 3, 2)).toBe(900_000);
  });
  it("is exact to the cent for 2-decimal prices and whole multipliers (no float drift)", () => {
    expect(additionalLineTotal(19.99, 3, 7)).toBe(419.79);
    expect(additionalLineTotal(0.1, 3)).toBe(0.3);
    expect(additionalLineTotal(10, 2, null)).toBe(20);
  });
});

describe("describeAdditionalCalculation", () => {
  it("prints unit price x qty [x multiplier] with labels", () => {
    expect(
      describeAdditionalCalculation("Rp100.000", {
        qty: "3.0000",
        unitLabel: "orang",
        multiplier: "2.0000",
        multiplierLabel: "hari",
      }),
    ).toBe("Rp100.000 × 3 orang × 2 hari");
  });
  it("omits the second dimension for a simple line", () => {
    expect(
      describeAdditionalCalculation("Rp150.000", { qty: 1, unitLabel: "paket", multiplier: null }),
    ).toBe("Rp150.000 × 1 paket");
  });
});
