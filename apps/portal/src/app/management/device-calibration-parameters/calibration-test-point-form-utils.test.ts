import { describe, expect, it } from "vitest";
import { ApiError } from "@medcal/shared";
import {
  buildCalibrationTestPointCreatePayload,
  buildCalibrationTestPointUpdatePayload,
  calibrationTestPointFormFromRow,
  emptyCalibrationTestPointForm,
  formatCalibrationTestPointApiError,
  validateCalibrationTestPointForm,
  type CalibrationTestPointFormValue,
} from "./calibration-test-point-form-utils";

function form(overrides: Partial<CalibrationTestPointFormValue> = {}): CalibrationTestPointFormValue {
  return { ...emptyCalibrationTestPointForm, ...overrides };
}

describe("validateCalibrationTestPointForm", () => {
  it("requires settingLabel", () => {
    expect(validateCalibrationTestPointForm(form())).toMatch(/Nama Titik/);
  });

  it("accepts a minimal valid form (label only)", () => {
    expect(validateCalibrationTestPointForm(form({ settingLabel: "Awal" }))).toBeNull();
  });

  it("rejects a non-numeric settingValue", () => {
    expect(
      validateCalibrationTestPointForm(form({ settingLabel: "Awal", settingValue: "abc" })),
    ).toMatch(/Setting/);
  });

  it("rejects a non-numeric toleranceMin/Max", () => {
    expect(
      validateCalibrationTestPointForm(form({ settingLabel: "Awal", toleranceMin: "abc" })),
    ).toMatch(/minimum/);
    expect(
      validateCalibrationTestPointForm(form({ settingLabel: "Awal", toleranceMax: "abc" })),
    ).toMatch(/maksimum/);
  });

  it("rejects toleranceMin greater than toleranceMax", () => {
    expect(
      validateCalibrationTestPointForm(
        form({ settingLabel: "Awal", toleranceMin: "10", toleranceMax: "5" }),
      ),
    ).toMatch(/lebih besar/);
  });

  it("accepts equal toleranceMin and toleranceMax", () => {
    expect(
      validateCalibrationTestPointForm(
        form({ settingLabel: "Awal", toleranceMin: "5", toleranceMax: "5" }),
      ),
    ).toBeNull();
  });
});

describe("calibrationTestPointFormFromRow", () => {
  it("hydrates every field from an API row", () => {
    const hydrated = calibrationTestPointFormFromRow({
      settingLabel: "Awal",
      settingValue: "25",
      toleranceMin: "20",
      toleranceMax: "30",
      toleranceNote: "25 +/- 5",
      isActive: false,
    });
    expect(hydrated).toEqual({
      settingLabel: "Awal",
      settingValue: "25",
      toleranceMin: "20",
      toleranceMax: "30",
      toleranceMinInclusive: true,
      toleranceMaxInclusive: true,
      toleranceNote: "25 +/- 5",
      isActive: false,
    });
  });

  it("renders NULL numeric fields as empty strings", () => {
    const hydrated = calibrationTestPointFormFromRow({
      settingLabel: "Titik ukur 1",
      settingValue: null,
      toleranceMin: null,
      toleranceMax: null,
      toleranceNote: null,
      isActive: true,
    });
    expect(hydrated.settingValue).toBe("");
    expect(hydrated.toleranceMin).toBe("");
    expect(hydrated.toleranceMax).toBe("");
    expect(hydrated.toleranceNote).toBe("");
  });
});

describe("buildCalibrationTestPointCreatePayload", () => {
  it("sends only settingLabel when every optional field is empty", () => {
    expect(buildCalibrationTestPointCreatePayload(form({ settingLabel: "Awal" }))).toEqual({
      settingLabel: "Awal",
    });
  });

  it("trims settingLabel and includes filled optional numeric/text fields", () => {
    const payload = buildCalibrationTestPointCreatePayload(
      form({
        settingLabel: "  Awal  ",
        settingValue: "25",
        toleranceMin: "20",
        toleranceMax: "30",
        toleranceNote: " 25 +/- 5 ",
      }),
    );
    expect(payload).toEqual({
      settingLabel: "Awal",
      settingValue: 25,
      toleranceMin: 20,
      toleranceMax: 30,
      toleranceMinInclusive: true,
      toleranceMaxInclusive: true,
      toleranceNote: "25 +/- 5",
    });
  });

  it("never includes isActive (a new test point always starts active server-side)", () => {
    const payload = buildCalibrationTestPointCreatePayload(
      form({ settingLabel: "Awal", isActive: false }),
    );
    expect(payload).not.toHaveProperty("isActive");
  });
});

describe("buildCalibrationTestPointUpdatePayload", () => {
  it("sends explicit null for cleared optional fields", () => {
    const payload = buildCalibrationTestPointUpdatePayload(
      form({ settingLabel: "Awal", isActive: true }),
    );
    expect(payload).toEqual({
      settingLabel: "Awal",
      settingValue: null,
      toleranceMin: null,
      toleranceMax: null,
      toleranceMinInclusive: true,
      toleranceMaxInclusive: true,
      toleranceNote: null,
      isActive: true,
    });
  });

  it("carries isActive through as given (activate/deactivate)", () => {
    expect(
      buildCalibrationTestPointUpdatePayload(form({ settingLabel: "Awal", isActive: false })),
    ).toMatchObject({ isActive: false });
  });
});

describe("formatCalibrationTestPointApiError", () => {
  it("maps DUPLICATE_CALIBRATION_TEST_POINT_LABEL", () => {
    expect(
      formatCalibrationTestPointApiError(
        new ApiError(409, "conflict", { code: "DUPLICATE_CALIBRATION_TEST_POINT_LABEL" }),
      ),
    ).toMatch(/nama ini/);
  });

  it("maps DUPLICATE_CALIBRATION_TEST_POINT_SEQUENCE", () => {
    expect(
      formatCalibrationTestPointApiError(
        new ApiError(409, "conflict", { code: "DUPLICATE_CALIBRATION_TEST_POINT_SEQUENCE" }),
      ),
    ).toMatch(/Urutan ini/);
  });

  it("maps CALIBRATION_TEST_POINT_NOT_FOUND", () => {
    expect(
      formatCalibrationTestPointApiError(
        new ApiError(404, "not found", { code: "CALIBRATION_TEST_POINT_NOT_FOUND" }),
      ),
    ).toMatch(/tidak ditemukan/);
  });

  it("maps CALIBRATION_TEST_POINT_ORDER_MISMATCH", () => {
    expect(
      formatCalibrationTestPointApiError(
        new ApiError(400, "mismatch", { code: "CALIBRATION_TEST_POINT_ORDER_MISMATCH" }),
      ),
    ).toMatch(/tidak sinkron/);
  });

  it("falls back to the server message for an unmapped code", () => {
    expect(
      formatCalibrationTestPointApiError(
        new ApiError(400, "fallback", { code: "SOME_OTHER_CODE", message: "Server said so" }),
      ),
    ).toBe("Server said so");
  });

  it("falls back to a generic message for a non-ApiError", () => {
    expect(formatCalibrationTestPointApiError(new Error("boom"))).toMatch(/Gagal menyimpan/);
  });
});
