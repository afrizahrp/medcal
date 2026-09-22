import { describe, expect, it } from "vitest";
import { Prisma } from "@medcal/db";
import {
  computeIsWithinTolerance,
  parseToleranceNote,
  resolveEffectiveTolerance,
} from "./measurement-tolerance";

const D = (v: number | string) => new Prisma.Decimal(v);
const num = (d: Prisma.Decimal | null) => (d === null ? null : d.toNumber());

describe("parseToleranceNote", () => {
  it("parses the BSM_SYSTOLIC '± 5 mmHg' absolute-delta note (§4.2)", () => {
    const parsed = parseToleranceNote("± 5 mmHg");
    expect(parsed).toEqual({ kind: "ABSOLUTE_DELTA", delta: D(5) });
  });

  it("parses percent notes in every live spelling", () => {
    for (const note of ["± 10 %", "±10%", "± 3 % SPO2", "± 6 %"]) {
      expect(parseToleranceNote(note)?.kind).toBe("PERCENT_DELTA");
    }
    expect(parseToleranceNote("± 10 %")).toEqual({ kind: "PERCENT_DELTA", percent: D(10) });
  });

  it("parses a '± N' embedded mid-sentence (SPHYG_PRESSURE_ACC, STER_TEMP)", () => {
    expect(parseToleranceNote("Akurasi tekanan ± 4 mmHg, dengan U95 maksimum 1,5 mmhg ≤ MPE")).toEqual(
      { kind: "ABSOLUTE_DELTA", delta: D(4) },
    );
    expect(
      parseToleranceNote("Setting suhu 150 ˚C - 200 ˚C, atau sesuai dengan settingan customer.; suhu : ± 3 °C"),
    ).toEqual({ kind: "ABSOLUTE_DELTA", delta: D(3) });
  });

  it("handles the Indonesian decimal comma", () => {
    expect(parseToleranceNote("Down Flow Velocity : 0,25 - 0,50 m/s; ± 0,025")).toEqual({
      kind: "ABSOLUTE_DELTA",
      delta: D("0.025"),
    });
  });

  it("parses explicit Min/Max bounds (BSC_INFLOW)", () => {
    expect(parseToleranceNote("≥ 0,40 m/s; Min : 0,4; Max : 1")).toEqual({
      kind: "EXPLICIT_BOUNDS",
      min: D("0.4"),
      max: D(1),
    });
  });

  it("returns null for deliberately multi-class notes (INCU_AIR_TEMP, SUCT_MAX_VACUUM)", () => {
    expect(
      parseToleranceNote(
        "± 1.5 oC (TM/T5); ± 0.8 oC terhadap rata-rata TM (T5). Catatan : ... ± 1.5 oC ... ± 0.8 oC",
      ),
    ).toBeNull();
    expect(
      parseToleranceNote(
        "Low Vacuum < 150 mmHg; Medium Vacuum 150 mmHg – 450 mmHg; High Vacuum ˃ 450 mmHg. *isi salah satu sesuai dengan UUT",
      ),
    ).toBeNull();
  });

  it("returns null for blank / absent notes", () => {
    expect(parseToleranceNote(null)).toBeNull();
    expect(parseToleranceNote("   ")).toBeNull();
    expect(parseToleranceNote("Pass / Fail")).toBeNull();
  });
});

describe("resolveEffectiveTolerance", () => {
  it("uses explicit parameter bounds (Pattern A/C — DUNIT_HP_SPEED_LOW)", () => {
    const r = resolveEffectiveTolerance({
      valueType: "NUMBER",
      parameter: { toleranceMin: 5000, toleranceMax: 11000, toleranceNote: "5000 rpm-11.000 rpm" },
      testPoint: null,
    });
    expect(r.source).toBe("PARAMETER_BOUNDS");
    expect([num(r.effectiveToleranceMin), num(r.effectiveToleranceMax)]).toEqual([5000, 11000]);
  });

  it("uses lower-bound-only parameter bounds (DUNIT_ILLUMINANCE)", () => {
    const r = resolveEffectiveTolerance({
      valueType: "NUMBER",
      parameter: { toleranceMin: 15000, toleranceMax: null, toleranceNote: ">15.000 lux" },
      testPoint: null,
    });
    expect([num(r.effectiveToleranceMin), num(r.effectiveToleranceMax)]).toEqual([15000, null]);
  });

  it("prefers a test-point override over the parent parameter bounds", () => {
    const r = resolveEffectiveTolerance({
      valueType: "NUMBER",
      parameter: { toleranceMin: 0, toleranceMax: 100, toleranceNote: null },
      testPoint: { settingValue: 50, toleranceMin: 45, toleranceMax: 55, toleranceNote: null },
    });
    expect(r.source).toBe("TEST_POINT_OVERRIDE");
    expect([num(r.effectiveToleranceMin), num(r.effectiveToleranceMax)]).toEqual([45, 55]);
  });

  it("inherits the parent note when the test point does not override (BSM_SYSTOLIC ± 5 mmHg @ 60)", () => {
    const r = resolveEffectiveTolerance({
      valueType: "NUMBER",
      parameter: { toleranceMin: null, toleranceMax: null, toleranceNote: "± 5 mmHg" },
      testPoint: { settingValue: 60, toleranceMin: null, toleranceMax: null, toleranceNote: null },
    });
    expect(r.source).toBe("NOTE");
    expect(num(r.appliedNominalValue)).toBe(60);
    expect([num(r.effectiveToleranceMin), num(r.effectiveToleranceMax)]).toEqual([55, 65]);
  });

  it("resolves a percent note against the technician-supplied nominal (SUCT_VACUUM_GAUGE ± 10% @ 100)", () => {
    const r = resolveEffectiveTolerance({
      valueType: "NUMBER",
      parameter: { toleranceMin: null, toleranceMax: null, toleranceNote: "± 10%" },
      testPoint: { settingValue: null, toleranceMin: null, toleranceMax: null, toleranceNote: null },
      suppliedNominalValue: 100,
    });
    expect([num(r.effectiveToleranceMin), num(r.effectiveToleranceMax)]).toEqual([90, 110]);
  });

  it("stays fully NULL for an unresolvable row (INCU_RECOVERY_TIME — no bounds, no note)", () => {
    const r = resolveEffectiveTolerance({
      valueType: "NUMBER",
      parameter: { toleranceMin: null, toleranceMax: null, toleranceNote: null },
      testPoint: null,
    });
    expect(r.source).toBe("NONE");
    expect([num(r.effectiveToleranceMin), num(r.effectiveToleranceMax)]).toEqual([null, null]);
  });

  it("keeps omitted operators inclusive and passes a stored exclusive lower bound", () => {
    const inclusive = resolveEffectiveTolerance({
      valueType: "NUMBER",
      parameter: { toleranceMin: 2, toleranceMax: null, toleranceNote: "> 2 MΩ" },
      testPoint: null,
    });
    expect(inclusive.toleranceMinInclusive).toBe(true);
    expect(inclusive.toleranceMaxInclusive).toBe(true);

    const exclusive = resolveEffectiveTolerance({
      valueType: "NUMBER",
      parameter: {
        toleranceMin: 2,
        toleranceMax: null,
        toleranceMinInclusive: false,
        toleranceNote: "> 2 MΩ",
      },
      testPoint: null,
    });
    expect(exclusive.source).toBe("PARAMETER_BOUNDS");
    expect(exclusive.toleranceMinInclusive).toBe(false);
  });

  it("takes exclusivity from a test-point override, not the parent", () => {
    const r = resolveEffectiveTolerance({
      valueType: "NUMBER",
      parameter: { toleranceMin: 0, toleranceMax: 1, toleranceMinInclusive: false, toleranceNote: null },
      testPoint: {
        settingValue: null,
        toleranceMin: 2,
        toleranceMax: null,
        toleranceMinInclusive: false,
        toleranceNote: null,
      },
    });
    expect(r.source).toBe("TEST_POINT_OVERRIDE");
    expect(num(r.effectiveToleranceMin)).toBe(2);
    expect(r.toleranceMinInclusive).toBe(false);
  });

  it("keeps note-parsed bounds inclusive even when the note says >", () => {
    const r = resolveEffectiveTolerance({
      valueType: "NUMBER",
      parameter: { toleranceMin: null, toleranceMax: null, toleranceNote: "> 2 MΩ" },
      testPoint: null,
    });
    expect(r.source).toBe("NOTE");
    expect(r.toleranceMinInclusive).toBe(true);
    expect(r.toleranceMaxInclusive).toBe(true);
  });

  it("stays NULL for a ± note with no nominal to resolve against", () => {
    const r = resolveEffectiveTolerance({
      valueType: "NUMBER",
      parameter: { toleranceMin: null, toleranceMax: null, toleranceNote: "± 5 mmHg" },
      testPoint: null,
    });
    expect(r.source).toBe("NONE");
    expect(num(r.effectiveToleranceMin)).toBeNull();
  });
});

describe("computeIsWithinTolerance", () => {
  const base = { effectiveToleranceMin: D(55), effectiveToleranceMax: D(65) };

  it("NUMBER in bounds → true, out of bounds → false", () => {
    expect(
      computeIsWithinTolerance({ valueType: "NUMBER", measuredValue: 62, measuredBool: null, ...base }),
    ).toBe(true);
    expect(
      computeIsWithinTolerance({ valueType: "NUMBER", measuredValue: 107, measuredBool: null, ...base }),
    ).toBe(false);
  });

  it("NUMBER lower-bound-only (DUNIT_ILLUMINANCE)", () => {
    const b = { effectiveToleranceMin: D(15000), effectiveToleranceMax: null };
    expect(
      computeIsWithinTolerance({ valueType: "NUMBER", measuredValue: 16200, measuredBool: null, ...b }),
    ).toBe(true);
    expect(
      computeIsWithinTolerance({ valueType: "NUMBER", measuredValue: 14920, measuredBool: null, ...b }),
    ).toBe(false);
  });

  it("BOOLEAN mirrors measuredBool and is never NULL for a recorded reading", () => {
    const b = { effectiveToleranceMin: null, effectiveToleranceMax: null };
    expect(
      computeIsWithinTolerance({ valueType: "BOOLEAN", measuredValue: null, measuredBool: true, ...b }),
    ).toBe(true);
    expect(
      computeIsWithinTolerance({ valueType: "BOOLEAN", measuredValue: null, measuredBool: false, ...b }),
    ).toBe(false);
    expect(
      computeIsWithinTolerance({ valueType: "BOOLEAN", measuredValue: null, measuredBool: null, ...b }),
    ).toBeNull();
  });

  it("RATIO evaluates the numeric measuredValue (VENT_IE_RATIO ± 10% of 0.5)", () => {
    const b = { effectiveToleranceMin: D("0.45"), effectiveToleranceMax: D("0.55") };
    expect(
      computeIsWithinTolerance({ valueType: "RATIO", measuredValue: "0.476", measuredBool: null, ...b }),
    ).toBe(true);
    expect(
      computeIsWithinTolerance({ valueType: "RATIO", measuredValue: "0.6", measuredBool: null, ...b }),
    ).toBe(false);
  });

  it("NULL when there is no measured value or no computable bound", () => {
    expect(
      computeIsWithinTolerance({ valueType: "NUMBER", measuredValue: null, measuredBool: null, ...base }),
    ).toBeNull();
    expect(
      computeIsWithinTolerance({
        valueType: "NUMBER",
        measuredValue: 10,
        measuredBool: null,
        effectiveToleranceMin: null,
        effectiveToleranceMax: null,
      }),
    ).toBeNull();
  });

  it("inclusive upper bound keeps the boundary itself (≤ 0.3)", () => {
    const bound = {
      valueType: "NUMBER" as const,
      measuredBool: null,
      effectiveToleranceMin: null,
      effectiveToleranceMax: "0.3",
      toleranceMaxInclusive: true,
    };
    expect(computeIsWithinTolerance({ ...bound, measuredValue: "0.3" })).toBe(true);
    expect(computeIsWithinTolerance({ ...bound, measuredValue: "0.3001" })).toBe(false);
  });

  it("strict lower bound excludes the boundary itself (> 2)", () => {
    const bound = {
      valueType: "NUMBER" as const,
      measuredBool: null,
      effectiveToleranceMin: 2,
      effectiveToleranceMax: null,
      toleranceMinInclusive: false,
    };
    expect(computeIsWithinTolerance({ ...bound, measuredValue: 2 })).toBe(false);
    expect(computeIsWithinTolerance({ ...bound, measuredValue: "2.0001" })).toBe(true);
    expect(computeIsWithinTolerance({ ...bound, measuredValue: "1.9999" })).toBe(false);
    expect(computeIsWithinTolerance({ ...bound, measuredValue: 1 })).toBe(false);
    expect(computeIsWithinTolerance({ ...bound, measuredValue: 3 })).toBe(true);
    expect(computeIsWithinTolerance({ ...bound, measuredValue: "2.1" })).toBe(true);
  });

  it("evaluates over-range OR only for a lower-bound-only limit", () => {
    const insulation = {
      valueType: "NUMBER" as const,
      measuredValue: null,
      measuredBool: null,
      measuredText: "OR",
      effectiveToleranceMin: 2,
      effectiveToleranceMax: null,
      toleranceMinInclusive: false,
    };
    expect(computeIsWithinTolerance(insulation)).toBe(true);
    expect(computeIsWithinTolerance({ ...insulation, measuredText: " or " })).toBe(true);
    expect(
      computeIsWithinTolerance({
        ...insulation,
        valueType: "TEXT",
      }),
    ).toBeNull();
    expect(
      computeIsWithinTolerance({
        ...insulation,
        effectiveToleranceMax: 10,
      }),
    ).toBeNull();
    expect(
      computeIsWithinTolerance({
        ...insulation,
        effectiveToleranceMin: null,
      }),
    ).toBeNull();
  });

  it("does not treat arbitrary text as conforming", () => {
    expect(
      computeIsWithinTolerance({
        valueType: "NUMBER",
        measuredValue: null,
        measuredBool: null,
        measuredText: "ABC",
        effectiveToleranceMin: 2,
        effectiveToleranceMax: null,
        toleranceMinInclusive: false,
      }),
    ).toBeNull();
    expect(
      computeIsWithinTolerance({
        valueType: "NUMBER",
        measuredValue: null,
        measuredBool: null,
        measuredText: "OL",
        effectiveToleranceMin: 2,
        effectiveToleranceMax: null,
        toleranceMinInclusive: false,
      }),
    ).toBeNull();
  });

  it("keeps existing inclusive upper bounds for the BSM electrical limits", () => {
    const upper = (max: string, value: string) =>
      computeIsWithinTolerance({
        valueType: "NUMBER",
        measuredValue: value,
        measuredBool: null,
        effectiveToleranceMin: null,
        effectiveToleranceMax: max,
      });
    expect(upper("0.3", "0.3")).toBe(true);
    expect(upper("0.3", "0.3001")).toBe(false);
    expect(upper("500", "500")).toBe(true);
    expect(upper("500", "500.1")).toBe(false);
    expect(upper("50", "50")).toBe(true);
    expect(upper("50", "50.1")).toBe(false);
  });

  it("TEXT is always NULL", () => {
    expect(
      computeIsWithinTolerance({
        valueType: "TEXT",
        measuredValue: null,
        measuredBool: null,
        effectiveToleranceMin: null,
        effectiveToleranceMax: null,
      }),
    ).toBeNull();
  });
});
