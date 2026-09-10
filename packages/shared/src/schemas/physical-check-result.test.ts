import { describe, expect, it } from "vitest";
import {
  physicalCheckResultBatchCreateSchema,
  physicalCheckResultCreateSchema,
  physicalCheckResultUpdateSchema,
} from "./index";

describe("physicalCheckResultCreateSchema", () => {
  it("accepts BAIK and TIDAK_BAIK with optional note", () => {
    expect(
      physicalCheckResultCreateSchema.parse({
        devicePhysicalCheckItemId: "item_1",
        verdict: "BAIK",
      }),
    ).toEqual({ devicePhysicalCheckItemId: "item_1", verdict: "BAIK" });

    expect(
      physicalCheckResultCreateSchema.parse({
        devicePhysicalCheckItemId: "item_1",
        verdict: "TIDAK_BAIK",
        note: "Isolasi terkelupas",
      }).note,
    ).toBe("Isolasi terkelupas");

    expect(
      physicalCheckResultCreateSchema.parse({
        devicePhysicalCheckItemId: "item_1",
        verdict: "BAIK",
        note: null,
      }).note,
    ).toBeNull();
  });

  it("rejects an invalid verdict", () => {
    const result = physicalCheckResultCreateSchema.safeParse({
      devicePhysicalCheckItemId: "item_1",
      verdict: "PASS",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing item id", () => {
    const result = physicalCheckResultCreateSchema.safeParse({ verdict: "BAIK" });
    expect(result.success).toBe(false);
  });

  it("does not trust client-supplied server-controlled fields", () => {
    const parsed = physicalCheckResultCreateSchema.parse({
      devicePhysicalCheckItemId: "item_1",
      verdict: "BAIK",
      companyId: "HACK",
      attemptNumber: 99,
      recordedByUserId: "someone",
      recordedAt: "2020-01-01",
      inspectionLimitSnapshot: "forged",
    });
    expect(parsed).toEqual({ devicePhysicalCheckItemId: "item_1", verdict: "BAIK" });
    expect("companyId" in parsed).toBe(false);
    expect("attemptNumber" in parsed).toBe(false);
    expect("inspectionLimitSnapshot" in parsed).toBe(false);
  });
});

describe("physicalCheckResultBatchCreateSchema", () => {
  it("accepts 1..200 items", () => {
    expect(
      physicalCheckResultBatchCreateSchema.parse({
        items: [{ devicePhysicalCheckItemId: "a", verdict: "BAIK" }],
      }).items,
    ).toHaveLength(1);
  });

  it("rejects an empty batch", () => {
    expect(physicalCheckResultBatchCreateSchema.safeParse({ items: [] }).success).toBe(false);
  });
});

describe("physicalCheckResultUpdateSchema", () => {
  it("accepts verdict and/or note", () => {
    expect(physicalCheckResultUpdateSchema.parse({ verdict: "TIDAK_BAIK" }).verdict).toBe(
      "TIDAK_BAIK",
    );
    expect(physicalCheckResultUpdateSchema.parse({ note: "ok" }).note).toBe("ok");
  });

  it("rejects an empty object", () => {
    expect(physicalCheckResultUpdateSchema.safeParse({}).success).toBe(false);
  });
});
