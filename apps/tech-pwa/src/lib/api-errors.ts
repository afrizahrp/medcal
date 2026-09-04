import { ApiError } from "@medcal/shared";

/**
 * Error-message mapping for the tech-pwa read + escalate flows. Mirrors
 * Portal's formatCalibrationJobApiError, trimmed to codes reachable from this
 * app — Identity Correction submit/decide codes are out of scope until the
 * submit-wizard task lands.
 */
const MESSAGES: Record<string, string> = {
  CALIBRATION_JOB_NOT_FOUND: "Calibration job tidak ditemukan.",
  CALIBRATION_JOB_IDENTITY_GATE_LOCKED:
    "Job sudah melewati tahap verifikasi identitas — aksi ini tidak lagi tersedia.",
  CALIBRATION_JOB_DEVICE_TYPE_UNRESOLVED: "Jenis alat untuk job ini belum dapat ditentukan.",
  INVALID_CALIBRATION_JOB_IDENTITY_ESCALATION: "Data eskalasi identitas tidak valid.",
  INVALID_AKD_AKL_TRANSITION: "Perubahan status persetujuan AKD/AKL tidak diizinkan.",
};

export function isOffline(): boolean {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

export function formatApiError(err: unknown, fallback: string): string {
  if (isOffline()) {
    return "Anda sedang offline atau koneksi bermasalah. Coba lagi.";
  }
  if (err instanceof ApiError) {
    const code = err.data?.code;
    if (code && MESSAGES[code]) return MESSAGES[code];
    if (typeof err.data?.message === "string") return err.data.message;
    return err.message;
  }
  return fallback;
}
