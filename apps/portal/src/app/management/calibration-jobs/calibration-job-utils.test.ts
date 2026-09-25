import { describe, expect, it } from "vitest";
import { ApiError, buildCalibrationJobActionSignals } from "@medcal/shared";
import {
  canDecideIdentity,
  canEscalateIdentity,
  canSubmitIdentityCorrection,
  canDecideQualityReview,
  canReviseJobWorksheet,
  canReplaceReferenceEquipment,
  isReferenceEquipmentApprovalPending,
  calibrationJobActionFocusHref,
  correctionMissingImage,
  describeMissingIdentityFields,
  firstActionableJobId,
  formatCalibrationJobApiError,
  formatEffectiveToleranceBounds,
  formatMeasurementHasilDisplay,
  formatMeasurementNormalValue,
  groupMeasurementRowsByPoint,
  isAwaitingQualityReview,
  isIdentityGateLocked,
  isQualityReviewApproved,
  qualityReviewDisplayAttempt,
  shouldShowRejectionFeedback,
  summarizeCorrectionChanges,
  toQualityReviewRejectInput,
  toRomanNumeral,
} from "./calibration-job-utils";

const base = { status: "IN_PROGRESS", akdAklApprovalStatus: "NOT_REQUIRED" };

describe("calibration-job identity gate helpers", () => {
  it("allows escalation from NOT_REQUIRED and REJECTED only", () => {
    expect(canEscalateIdentity({ ...base, akdAklApprovalStatus: "NOT_REQUIRED" })).toBe(true);
    expect(canEscalateIdentity({ ...base, akdAklApprovalStatus: "REJECTED" })).toBe(true);
    expect(canEscalateIdentity({ ...base, akdAklApprovalStatus: "PENDING_REVIEW" })).toBe(false);
    expect(canEscalateIdentity({ ...base, akdAklApprovalStatus: "APPROVED" })).toBe(false);
  });

  it("offers approve/reject only while PENDING_REVIEW", () => {
    expect(canDecideIdentity({ ...base, akdAklApprovalStatus: "PENDING_REVIEW" })).toBe(true);
    expect(canDecideIdentity({ ...base, akdAklApprovalStatus: "NOT_REQUIRED" })).toBe(false);
  });

  it("offers identity-correction submit whenever the gate is open", () => {
    expect(canSubmitIdentityCorrection({ status: "IN_PROGRESS" })).toBe(true);
    expect(canSubmitIdentityCorrection({ status: "PENDING" })).toBe(true);
    expect(canSubmitIdentityCorrection({ status: "SUBMITTED" })).toBe(false);
    expect(canSubmitIdentityCorrection({ status: "ACCEPTED_BY_QA" })).toBe(false);
  });

  it("closes every gate action once the job is past the bench", () => {
    for (const status of ["SUBMITTED", "ACCEPTED_BY_QA"]) {
      const job = { ...base, status, akdAklApprovalStatus: "PENDING_REVIEW" };
      expect(isIdentityGateLocked(job)).toBe(true);
      expect(canEscalateIdentity({ ...job, akdAklApprovalStatus: "REJECTED" })).toBe(false);
      expect(canDecideIdentity(job)).toBe(false);
      expect(canSubmitIdentityCorrection(job)).toBe(false);
    }
  });

  it("describeMissingIdentityFields lists Serial when missing", () => {
    expect(describeMissingIdentityFields({ technicianObservedSerial: null })).toBe(
      "Serial observasi teknisi",
    );
    expect(describeMissingIdentityFields({ technicianObservedSerial: "SN" })).toBe(
      "identitas perangkat",
    );
  });

  it("deep-links the first workflow-available job, skipping locked-incomplete siblings", () => {
    const started = "2026-09-12T00:00:00.000Z";
    const locked = buildCalibrationJobActionSignals({
      status: "SUBMITTED",
      startedAt: started,
      technicianObservedSerial: null,
      hasPendingIdentityCorrection: false,
      needsReferenceEquipmentApproval: false,
    });
    const pending = buildCalibrationJobActionSignals({
      status: "IN_PROGRESS",
      startedAt: started,
      technicianObservedSerial: "SN-1",
      hasPendingIdentityCorrection: true,
      needsReferenceEquipmentApproval: false,
    });
    expect(
      firstActionableJobId([
        { id: "job-a", actionSignals: locked },
        { id: "job-b", actionSignals: pending },
      ]),
    ).toBe("job-b");
    expect(calibrationJobActionFocusHref("job-b")).toBe("/calibration-jobs/job-b?focus=action");
    expect(
      firstActionableJobId([
        { id: "a", actionSignals: locked },
        {
          id: "b",
          actionSignals: buildCalibrationJobActionSignals({
            status: "ACCEPTED_BY_QA",
            startedAt: started,
            technicianObservedSerial: null,
            hasPendingIdentityCorrection: false,
            needsReferenceEquipmentApproval: false,
          }),
        },
      ]),
    ).toBeUndefined();
  });
});

describe("quality-review helpers", () => {
  const approved = { status: "APPROVED" };
  const rejected = { status: "REJECTED" };

  it("treats SUBMITTED without APPROVED as awaiting MT review", () => {
    expect(isAwaitingQualityReview({ status: "SUBMITTED", reviews: [] })).toBe(true);
    expect(isAwaitingQualityReview({ status: "SUBMITTED", reviews: [approved] })).toBe(false);
    expect(isQualityReviewApproved({ status: "SUBMITTED", reviews: [approved] })).toBe(true);
    expect(canDecideQualityReview({ status: "SUBMITTED", reviews: [] })).toBe(true);
    expect(canDecideQualityReview({ status: "SUBMITTED", reviews: [approved] })).toBe(false);
    expect(canDecideQualityReview({ status: "IN_PROGRESS", reviews: [] })).toBe(false);
  });

  it("treats SUBMITTED + latest REJECTED as awaiting the current cycle, not active rejection", () => {
    expect(isAwaitingQualityReview({ status: "SUBMITTED", reviews: [rejected] })).toBe(true);
    expect(canDecideQualityReview({ status: "SUBMITTED", reviews: [rejected] })).toBe(true);
    expect(shouldShowRejectionFeedback({ status: "SUBMITTED", reviews: [rejected] })).toBe(false);
  });

  it("shows rejection feedback on REWORK, not on SUBMITTED, and hides decide", () => {
    expect(shouldShowRejectionFeedback({ status: "REWORK", reviews: [rejected] })).toBe(true);
    expect(canDecideQualityReview({ status: "REWORK", reviews: [rejected] })).toBe(false);
    expect(isAwaitingQualityReview({ status: "REWORK", reviews: [rejected] })).toBe(false);
    expect(shouldShowRejectionFeedback({ status: "IN_PROGRESS", reviews: [rejected] })).toBe(true);
  });

  it("shows the rejected attempt while REWORK, then the current attempt after resume", () => {
    expect(qualityReviewDisplayAttempt({ status: "REWORK", currentAttempt: 2 })).toBe(1);
    expect(qualityReviewDisplayAttempt({ status: "IN_PROGRESS", currentAttempt: 2 })).toBe(2);
    expect(qualityReviewDisplayAttempt({ status: "SUBMITTED", currentAttempt: 1 })).toBe(1);
  });

  it("hides decide after REJECT until the job is SUBMITTED again", () => {
    expect(canDecideQualityReview({ status: "REWORK", reviews: [rejected] })).toBe(false);
    expect(canDecideQualityReview({ status: "IN_PROGRESS", reviews: [rejected] })).toBe(false);
    expect(canDecideQualityReview({ status: "SUBMITTED", reviews: [rejected] })).toBe(true);
    expect(canDecideQualityReview({ status: "SUBMITTED", reviews: [approved] })).toBe(false);
  });

  it("rejects empty or whitespace-only notes and sends trimmed REJECT notes", () => {
    expect(toQualityReviewRejectInput("")).toBeNull();
    expect(toQualityReviewRejectInput("   ")).toBeNull();
    expect(toQualityReviewRejectInput("\n\t")).toBeNull();
    expect(toQualityReviewRejectInput("  NIBP diukur ulang  ")).toEqual({
      decision: "REJECT",
      notes: "NIBP diukur ulang",
    });
  });
});

describe("formatCalibrationJobApiError", () => {
  it("maps known backend codes to Indonesian copy", () => {
    const err = new ApiError(400, "raw", { code: "DEVICE_TYPE_MISMATCH" });
    expect(formatCalibrationJobApiError(err, "fallback")).toContain("Jenis alat");
  });

  it("maps the new identity-correction codes", () => {
    for (const code of [
      "IDENTITY_CORRECTION_NO_CHANGE",
      "IDENTITY_CORRECTION_ALREADY_PENDING",
      "IDENTITY_CORRECTION_ALREADY_DECIDED",
      "IDENTITY_CORRECTION_SIGNATURE_IMAGE_MISSING",
    ]) {
      const msg = formatCalibrationJobApiError(new ApiError(400, "raw", { code }), "fb");
      expect(msg).not.toBe("fb");
      expect(msg.length).toBeGreaterThan(5);
    }
  });

  it("maps quality-review happy-path codes", () => {
    for (const code of [
      "CALIBRATION_JOB_ALREADY_SUBMITTED",
      "CALIBRATION_JOB_NOT_SUBMITTED",
      "QUALITY_REVIEW_ALREADY_APPROVED",
      "QUALITY_REVIEW_NOT_APPROVED",
      "QUALITY_REVIEW_NOTES_REQUIRED",
      "CALIBRATION_JOB_ALREADY_COMPLETED",
      "INVALID_QUALITY_REVIEW_DECISION",
      "CALIBRATION_JOB_NOT_IN_REWORK",
    ]) {
      const msg = formatCalibrationJobApiError(new ApiError(400, "raw", { code }), "fb");
      expect(msg).not.toBe("fb");
      expect(msg.length).toBeGreaterThan(5);
    }
  });

  it("falls back to the server message, then the provided fallback", () => {
    expect(
      formatCalibrationJobApiError(new ApiError(400, "srv", { message: "srv detail" }), "fb"),
    ).toBe("srv detail");
    expect(formatCalibrationJobApiError(new Error("x"), "fb")).toBe("fb");
  });
});

describe("summarizeCorrectionChanges", () => {
  const empty = {
    prevDevice: null,
    newDevice: null,
    newDeviceId: null,
    prevBrand: null,
    newBrand: null,
    prevModel: null,
    newModel: null,
    prevSerial: null,
    newSerial: null,
    prevAkdAkl: null,
    newAkdAkl: null,
  };

  it("returns only the attributes the BA actually changed", () => {
    expect(
      summarizeCorrectionChanges({ ...empty, prevBrand: "Old", newBrand: "Mindray" }),
    ).toEqual([{ attr: "Merk", prev: "Old", next: "Mindray" }]);

    expect(
      summarizeCorrectionChanges({ ...empty, prevModel: null, newModel: "uMEC12" }),
    ).toEqual([{ attr: "Model / Tipe", prev: "—", next: "uMEC12" }]);

    expect(
      summarizeCorrectionChanges({ ...empty, prevSerial: null, newSerial: "SN-9" }),
    ).toEqual([{ attr: "Serial No", prev: "—", next: "SN-9" }]);

    expect(summarizeCorrectionChanges(empty)).toEqual([]);
  });

  it("still renders a pre-MoM#6 Device correction from history", () => {
    expect(
      summarizeCorrectionChanges({
        ...empty,
        newDeviceId: "dev-2",
        prevDevice: { code: "DVC-000001" },
        newDevice: { code: "DVC-000002" },
      }),
    ).toEqual([{ attr: "Device", prev: "DVC-000001", next: "DVC-000002" }]);
  });

  it("reports Merk, Model and Serial No independently in one BA", () => {
    expect(
      summarizeCorrectionChanges({
        ...empty,
        newBrand: "Mindray",
        newSerial: "SN-9",
      }),
    ).toEqual([
      { attr: "Merk", prev: "—", next: "Mindray" },
      { attr: "Serial No", prev: "—", next: "SN-9" },
    ]);
  });
});

describe("correction photo helpers", () => {
  it("correctionMissingImage is true when a signer signed but the correction has no photo", () => {
    expect(
      correctionMissingImage({
        files: [],
        signatures: [{ status: "SIGNED" }, { status: "UNAVAILABLE" }],
      }),
    ).toBe(true);
  });

  it("correctionMissingImage is false once the correction has a photo", () => {
    expect(
      correctionMissingImage({
        files: [{ id: "f1" }],
        signatures: [{ status: "SIGNED" }, { status: "SIGNED" }],
      }),
    ).toBe(false);
  });

  it("correctionMissingImage is false when no signer actually signed", () => {
    expect(
      correctionMissingImage({
        files: [],
        signatures: [{ status: "UNAVAILABLE" }, { status: "REFUSED" }],
      }),
    ).toBe(false);
  });
});

describe("measurement Hasil display precision", () => {
  it("formats decimalPlaces = 0 as a whole number", () => {
    expect(formatMeasurementHasilDisplay("20", 0)).toBe("20");
    expect(formatMeasurementHasilDisplay("20.4", 0)).toBe("20");
  });

  it("pads and trims to decimalPlaces = 1", () => {
    expect(formatMeasurementHasilDisplay("20", 1)).toBe("20.0");
    expect(formatMeasurementHasilDisplay("20.1", 1)).toBe("20.1");
    expect(formatMeasurementHasilDisplay("20.10", 1)).toBe("20.1");
  });

  it("pads and trims to decimalPlaces = 2", () => {
    expect(formatMeasurementHasilDisplay("20", 2)).toBe("20.00");
    expect(formatMeasurementHasilDisplay("20.1", 2)).toBe("20.10");
    expect(formatMeasurementHasilDisplay("20.12", 2)).toBe("20.12");
  });

  it("preserves raw string when decimalPlaces is null", () => {
    expect(formatMeasurementHasilDisplay("20", null)).toBe("20");
    expect(formatMeasurementHasilDisplay("20.123", null)).toBe("20.123");
    expect(formatMeasurementHasilDisplay("20.10", null)).toBe("20.10");
  });

  it("formats negative numbers with the same precision rules", () => {
    expect(formatMeasurementHasilDisplay("-20", 1)).toBe("-20.0");
    expect(formatMeasurementHasilDisplay("-20.1", 2)).toBe("-20.10");
  });

  it("does not mutate the source measuredValue string", () => {
    const stored = "20";
    expect(formatMeasurementHasilDisplay(stored, 1)).toBe("20.0");
    expect(stored).toBe("20");
  });

  it("returns null for empty measuredValue so callers keep text/bool fallback", () => {
    expect(formatMeasurementHasilDisplay(null, 1)).toBeNull();
    expect(formatMeasurementHasilDisplay("", 1)).toBeNull();
  });
});

describe("measurement normal-value display", () => {
  it("formats min+max, min-only, and max-only effective bounds", () => {
    expect(formatEffectiveToleranceBounds("20", "30")).toBe("20–30");
    expect(formatEffectiveToleranceBounds("20", null)).toBe("≥ 20");
    expect(formatEffectiveToleranceBounds(null, "30")).toBe("≤ 30");
    expect(formatEffectiveToleranceBounds(null, null)).toBeNull();
  });

  it("prefers effective snapshot over catalog note or bounds", () => {
    expect(
      formatMeasurementNormalValue({
        effectiveToleranceMin: "20",
        effectiveToleranceMax: "30",
        parameter: {
          toleranceMin: "0",
          toleranceMax: "100",
          toleranceNote: "jangan pakai note ini",
        },
      }),
    ).toBe("20–30");
  });

  it("falls back to toleranceNote when effective bounds are null", () => {
    expect(
      formatMeasurementNormalValue({
        effectiveToleranceMin: null,
        effectiveToleranceMax: null,
        parameter: {
          toleranceMin: "20",
          toleranceMax: "30",
          toleranceNote: "20 s/d 30 °C",
        },
      }),
    ).toBe("20 s/d 30 °C");
  });

  it("prefers test-point note over parameter note when effective is null", () => {
    expect(
      formatMeasurementNormalValue({
        effectiveToleranceMin: null,
        effectiveToleranceMax: null,
        testPoint: {
          toleranceMin: null,
          toleranceMax: null,
          toleranceNote: "± 5 mmHg",
        },
        parameter: {
          toleranceMin: null,
          toleranceMax: null,
          toleranceNote: "parameter note",
        },
      }),
    ).toBe("± 5 mmHg");
  });

  it("falls back to structured catalog bounds when note is absent", () => {
    expect(
      formatMeasurementNormalValue({
        effectiveToleranceMin: null,
        effectiveToleranceMax: null,
        testPoint: {
          toleranceMin: "55",
          toleranceMax: "65",
          toleranceNote: null,
        },
        parameter: {
          toleranceMin: "0",
          toleranceMax: "100",
          toleranceNote: null,
        },
      }),
    ).toBe("55–65");
  });

  it("uses a neutral placeholder when no range exists", () => {
    expect(
      formatMeasurementNormalValue({
        effectiveToleranceMin: null,
        effectiveToleranceMax: null,
        parameter: null,
      }),
    ).toBe("—");
  });

  it("keeps GRID-style per-row effective ranges distinct from parameter catalog", () => {
    // Simulates two GRID readings whose snapshots differ (e.g. ±5 around 60 vs 120).
    expect(
      formatMeasurementNormalValue({
        effectiveToleranceMin: "55",
        effectiveToleranceMax: "65",
        parameter: { toleranceMin: null, toleranceMax: null, toleranceNote: "± 5 mmHg" },
      }),
    ).toBe("55–65");
    expect(
      formatMeasurementNormalValue({
        effectiveToleranceMin: "115",
        effectiveToleranceMax: "125",
        parameter: { toleranceMin: null, toleranceMax: null, toleranceNote: "± 5 mmHg" },
      }),
    ).toBe("115–125");
  });
});

describe("reference equipment replace vs pending approval", () => {
  const started = "2026-09-14T00:00:00.000Z";

  it("allows replace while IN_PROGRESS without a pending approval", () => {
    expect(
      canReplaceReferenceEquipment({
        status: "IN_PROGRESS",
        startedAt: started,
        referenceEquipmentApprovals: [],
      }),
    ).toBe(true);
  });

  it("blocks replace while an approval is PENDING_REVIEW", () => {
    expect(
      isReferenceEquipmentApprovalPending({
        referenceEquipmentApprovals: [{ status: "PENDING_REVIEW" }],
      }),
    ).toBe(true);
    expect(
      canReplaceReferenceEquipment({
        status: "IN_PROGRESS",
        startedAt: started,
        referenceEquipmentApprovals: [{ status: "PENDING_REVIEW" }],
      }),
    ).toBe(false);
  });

  it("does not treat SUBMITTED as a pending approval", () => {
    expect(
      canReplaceReferenceEquipment({
        status: "SUBMITTED",
        startedAt: started,
        referenceEquipmentApprovals: [{ status: "PENDING_REVIEW" }],
      }),
    ).toBe(false);
  });
});

describe("canReviseJobWorksheet", () => {
  it("allows IN_PROGRESS and REWORK only", () => {
    expect(canReviseJobWorksheet({ status: "IN_PROGRESS" })).toBe(true);
    expect(canReviseJobWorksheet({ status: "REWORK" })).toBe(true);
    expect(canReviseJobWorksheet({ status: "PENDING" })).toBe(false);
    expect(canReviseJobWorksheet({ status: "SUBMITTED" })).toBe(false);
    expect(canReviseJobWorksheet({ status: "ACCEPTED_BY_QA" })).toBe(false);
  });
});

describe("toRomanNumeral", () => {
  it("renders the LK column sequence", () => {
    expect(toRomanNumeral(1)).toBe("I");
    expect(toRomanNumeral(2)).toBe("II");
    expect(toRomanNumeral(3)).toBe("III");
    expect(toRomanNumeral(4)).toBe("IV");
    expect(toRomanNumeral(5)).toBe("V");
  });

  it("keeps working past the usual 5-replicate LK layout", () => {
    expect(toRomanNumeral(9)).toBe("IX");
    expect(toRomanNumeral(10)).toBe("X");
  });

  it("falls back to the plain number for non-positive input instead of throwing", () => {
    expect(toRomanNumeral(0)).toBe("0");
    expect(toRomanNumeral(-1)).toBe("-1");
  });
});

describe("groupMeasurementRowsByPoint", () => {
  function row(overrides: {
    id: string;
    deviceCalibrationParameterId: string;
    calibrationTestPointId: string | null;
    replicateIndex: number;
    direction?: "NONE" | "UP" | "DOWN";
  }) {
    return overrides;
  }

  it("collapses repetition rows into one group per measurement point, keyed by replicateIndex", () => {
    const rows = [
      row({ id: "r1", deviceCalibrationParameterId: "hr", calibrationTestPointId: "tp-30", replicateIndex: 1 }),
      row({ id: "r2", deviceCalibrationParameterId: "hr", calibrationTestPointId: "tp-30", replicateIndex: 2 }),
      row({ id: "r3", deviceCalibrationParameterId: "hr", calibrationTestPointId: "tp-30", replicateIndex: 3 }),
      row({ id: "r4", deviceCalibrationParameterId: "hr", calibrationTestPointId: "tp-30", replicateIndex: 4 }),
      row({ id: "r5", deviceCalibrationParameterId: "hr", calibrationTestPointId: "tp-30", replicateIndex: 5 }),
    ];
    const groups = groupMeasurementRowsByPoint(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.maxReplicateIndex).toBe(5);
    expect(groups[0]!.byReplicate.get(3)?.id).toBe("r3");
  });

  it("keeps different test points (settings) as separate groups, in first-appearance order", () => {
    const rows = [
      row({ id: "a1", deviceCalibrationParameterId: "hr", calibrationTestPointId: "tp-30", replicateIndex: 1 }),
      row({ id: "b1", deviceCalibrationParameterId: "hr", calibrationTestPointId: "tp-60", replicateIndex: 1 }),
      row({ id: "a2", deviceCalibrationParameterId: "hr", calibrationTestPointId: "tp-30", replicateIndex: 2 }),
    ];
    const groups = groupMeasurementRowsByPoint(rows);
    expect(groups.map((g) => g.calibrationTestPointId)).toEqual(["tp-30", "tp-60"]);
    expect(groups[0]!.maxReplicateIndex).toBe(2);
    expect(groups[1]!.maxReplicateIndex).toBe(1);
  });

  it("does not force a 5-column layout when only one repetition was recorded", () => {
    const groups = groupMeasurementRowsByPoint([
      row({ id: "x1", deviceCalibrationParameterId: "spo2", calibrationTestPointId: "tp-90", replicateIndex: 1 }),
    ]);
    expect(groups[0]!.maxReplicateIndex).toBe(1);
  });

  it("keeps UP/DOWN direction readings separate even at the same replicateIndex", () => {
    const groups = groupMeasurementRowsByPoint([
      row({ id: "u1", deviceCalibrationParameterId: "sphyg", calibrationTestPointId: "tp-100", replicateIndex: 1, direction: "UP" }),
      row({ id: "d1", deviceCalibrationParameterId: "sphyg", calibrationTestPointId: "tp-100", replicateIndex: 1, direction: "DOWN" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.byReplicate.get(1)?.id).toBe("u1");
    expect(groups[1]!.byReplicate.get(1)?.id).toBe("d1");
  });

  it("works generically across parameters without special-casing any code or name", () => {
    const rows = [
      row({ id: "n1", deviceCalibrationParameterId: "nibp-systole", calibrationTestPointId: null, replicateIndex: 1 }),
      row({ id: "n2", deviceCalibrationParameterId: "nibp-systole", calibrationTestPointId: null, replicateIndex: 2 }),
      row({ id: "n3", deviceCalibrationParameterId: "nibp-diastole", calibrationTestPointId: null, replicateIndex: 1 }),
    ];
    const groups = groupMeasurementRowsByPoint(rows);
    expect(groups.map((g) => g.deviceCalibrationParameterId)).toEqual([
      "nibp-systole",
      "nibp-diastole",
    ]);
  });
});
