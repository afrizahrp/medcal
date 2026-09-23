import { ApiError } from "@medcal/shared";

/**
 * Phase 4C — Portal CRUD for CalibrationTestPoint (Named Measurement Points).
 * `sequence` is deliberately NOT a form field here: display order changes only
 * through the dedicated reorder mechanism (move up/down in the embedded list),
 * never through this create/edit form — see calibrationTestPointUpdateSchema.
 *
 * Kept as a plain .ts module (no JSX) — separate from
 * calibration-test-point-form-fields.tsx — so this logic is unit-testable
 * without a JSX/React transform, mirroring
 * device-calibration-parameter-ordering.ts.
 */
export interface CalibrationTestPointFormValue {
  settingLabel: string;
  settingValue: string;
  toleranceMin: string;
  toleranceMax: string;
  toleranceMinInclusive: boolean;
  toleranceMaxInclusive: boolean;
  toleranceNote: string;
  isActive: boolean;
}

export const emptyCalibrationTestPointForm: CalibrationTestPointFormValue = {
  settingLabel: "",
  settingValue: "",
  toleranceMin: "",
  toleranceMax: "",
  toleranceMinInclusive: true,
  toleranceMaxInclusive: true,
  toleranceNote: "",
  isActive: true,
};

export function calibrationTestPointFormFromRow(row: {
  settingLabel: string;
  settingValue: string | number | null;
  toleranceMin: string | number | null;
  toleranceMax: string | number | null;
  toleranceMinInclusive?: boolean;
  toleranceMaxInclusive?: boolean;
  toleranceNote: string | null;
  isActive: boolean;
}): CalibrationTestPointFormValue {
  return {
    settingLabel: row.settingLabel,
    settingValue:
      row.settingValue == null || row.settingValue === "" ? "" : String(Number(row.settingValue)),
    toleranceMin:
      row.toleranceMin == null || row.toleranceMin === "" ? "" : String(Number(row.toleranceMin)),
    toleranceMax:
      row.toleranceMax == null || row.toleranceMax === "" ? "" : String(Number(row.toleranceMax)),
    toleranceMinInclusive: row.toleranceMinInclusive !== false,
    toleranceMaxInclusive: row.toleranceMaxInclusive !== false,
    toleranceNote: row.toleranceNote ?? "",
    isActive: row.isActive,
  };
}

export function validateCalibrationTestPointForm(
  form: CalibrationTestPointFormValue,
): string | null {
  if (!form.settingLabel.trim()) {
    return "Nama Titik wajib diisi.";
  }
  const svRaw = form.settingValue.trim();
  if (svRaw !== "" && !Number.isFinite(Number(svRaw))) {
    return "Setting tidak valid.";
  }
  const minRaw = form.toleranceMin.trim();
  const maxRaw = form.toleranceMax.trim();
  const min = minRaw === "" ? null : Number(minRaw);
  const max = maxRaw === "" ? null : Number(maxRaw);
  if (minRaw !== "" && !Number.isFinite(min)) return "Toleransi minimum tidak valid.";
  if (maxRaw !== "" && !Number.isFinite(max)) return "Toleransi maksimum tidak valid.";
  if (min != null && max != null && min > max) {
    return "Toleransi minimum tidak boleh lebih besar dari maksimum.";
  }
  return null;
}

export function buildCalibrationTestPointCreatePayload(form: CalibrationTestPointFormValue) {
  const svRaw = form.settingValue.trim();
  const minRaw = form.toleranceMin.trim();
  const maxRaw = form.toleranceMax.trim();
  const note = form.toleranceNote.trim();
  return {
    settingLabel: form.settingLabel.trim(),
    ...(svRaw !== "" ? { settingValue: Number(svRaw) } : {}),
    ...(minRaw !== ""
      ? { toleranceMin: Number(minRaw), toleranceMinInclusive: form.toleranceMinInclusive }
      : {}),
    ...(maxRaw !== ""
      ? { toleranceMax: Number(maxRaw), toleranceMaxInclusive: form.toleranceMaxInclusive }
      : {}),
    ...(note ? { toleranceNote: note } : {}),
  };
}

export function buildCalibrationTestPointUpdatePayload(form: CalibrationTestPointFormValue) {
  const svRaw = form.settingValue.trim();
  const minRaw = form.toleranceMin.trim();
  const maxRaw = form.toleranceMax.trim();
  return {
    settingLabel: form.settingLabel.trim(),
    settingValue: svRaw === "" ? null : Number(svRaw),
    toleranceMin: minRaw === "" ? null : Number(minRaw),
    toleranceMax: maxRaw === "" ? null : Number(maxRaw),
    toleranceMinInclusive: minRaw === "" ? true : form.toleranceMinInclusive,
    toleranceMaxInclusive: maxRaw === "" ? true : form.toleranceMaxInclusive,
    toleranceNote: form.toleranceNote.trim() ? form.toleranceNote.trim() : null,
    isActive: form.isActive,
  };
}

export function formatCalibrationTestPointApiError(error: unknown): string {
  if (error instanceof ApiError) {
    const code = error.data?.code;
    if (code === "DUPLICATE_CALIBRATION_TEST_POINT_LABEL") {
      return "Sudah ada titik ukur dengan nama ini pada parameter ini.";
    }
    if (code === "DUPLICATE_CALIBRATION_TEST_POINT_SEQUENCE") {
      return "Urutan ini sudah dipakai titik ukur lain pada parameter ini.";
    }
    if (code === "CALIBRATION_TEST_POINT_NOT_FOUND") {
      return "Titik ukur tidak ditemukan.";
    }
    if (code === "CALIBRATION_TEST_POINT_ORDER_MISMATCH") {
      return "Urutan titik ukur tidak sinkron. Muat ulang halaman dan coba lagi.";
    }
    if (code === "INVALID_CALIBRATION_TOLERANCE") {
      return "Rentang toleransi tidak valid. Minimum tidak boleh lebih besar dari maksimum.";
    }
    if (
      code === "INVALID_CALIBRATION_TEST_POINT" ||
      code === "INVALID_CALIBRATION_TEST_POINT_UPDATE" ||
      code === "INVALID_CALIBRATION_TEST_POINT_ORDER" ||
      code === "INVALID_CALIBRATION_TEST_POINT_BULK"
    ) {
      return "Data titik ukur tidak valid. Periksa kembali isian form.";
    }
    if (typeof error.data?.message === "string") return error.data.message;
    return error.message;
  }
  return "Gagal menyimpan titik ukur. Silakan coba lagi.";
}
