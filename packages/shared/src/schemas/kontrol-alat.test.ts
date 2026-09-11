import { describe, expect, it } from "vitest";
import {
  kontrolAlatPatchSchema,
  kontrolAlatSignatureCreateSchema,
  workOrderItemAccessoriesReplaceSchema,
  workOrderRequestReviewSchema,
} from "./index";

describe("kontrolAlatPatchSchema", () => {
  it("requires at least one field", () => {
    expect(kontrolAlatPatchSchema.safeParse({}).success).toBe(false);
    expect(kontrolAlatPatchSchema.safeParse({ workExecuted: true }).success).toBe(true);
  });

  it("treats blank certificateNumber as null", () => {
    expect(kontrolAlatPatchSchema.parse({ certificateNumber: "  " }).certificateNumber).toBeNull();
  });
});

describe("kontrolAlatSignatureCreateSchema", () => {
  it("accepts the two F.MU.08 signer kinds", () => {
    expect(kontrolAlatSignatureCreateSchema.parse({ signerKind: "ADMINISTRATION" }).signerKind).toBe(
      "ADMINISTRATION",
    );
    expect(kontrolAlatSignatureCreateSchema.parse({ signerKind: "TECHNICAL_OFFICER" }).signerKind).toBe(
      "TECHNICAL_OFFICER",
    );
    expect(kontrolAlatSignatureCreateSchema.safeParse({ signerKind: "CUSTOMER" }).success).toBe(false);
  });
});

describe("workOrderRequestReviewSchema", () => {
  it("accepts a completed review payload", () => {
    expect(
      workOrderRequestReviewSchema.safeParse({
        requestReviewMethodOk: true,
        completed: true,
      }).success,
    ).toBe(true);
  });

  it("coerces a blank other-text to null", () => {
    expect(
      workOrderRequestReviewSchema.parse({ requestReviewConfirmOtherText: "  " })
        .requestReviewConfirmOtherText,
    ).toBeNull();
  });
});

describe("workOrderItemAccessoriesReplaceSchema", () => {
  it("accepts an empty list (clear)", () => {
    expect(workOrderItemAccessoriesReplaceSchema.parse({ accessories: [] }).accessories).toEqual([]);
  });
});
