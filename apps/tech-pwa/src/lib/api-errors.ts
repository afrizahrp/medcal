import { ApiError } from "@medcal/shared";

/**
 * Error-message mapping for the tech-pwa read + escalate + identity-correction
 * submit flows. Mirrors Portal's formatCalibrationJobApiError, trimmed to
 * codes reachable from this app.
 */
const MESSAGES: Record<string, string> = {
  CALIBRATION_JOB_NOT_FOUND: "Calibration job tidak ditemukan.",
  CALIBRATION_JOB_IDENTITY_GATE_LOCKED:
    "Job sudah melewati tahap verifikasi identitas — aksi ini tidak lagi tersedia.",
  CALIBRATION_JOB_DEVICE_TYPE_UNRESOLVED: "Jenis alat untuk job ini belum dapat ditentukan.",
  INVALID_CALIBRATION_JOB_IDENTITY_ESCALATION: "Data eskalasi identitas tidak valid.",
  INVALID_AKD_AKL_TRANSITION: "Perubahan status persetujuan AKD/AKL tidak diizinkan.",
  // Identity Correction (BA) submit
  IDENTITY_CORRECTION_NO_CHANGE:
    "Koreksi tidak mengubah nilai identitas job saat ini. Ubah minimal satu atribut.",
  IDENTITY_CORRECTION_ALREADY_PENDING:
    "Job ini sudah punya BA koreksi identitas yang menunggu review.",
  IDENTITY_CORRECTION_NOT_FOUND: "BA koreksi identitas tidak ditemukan.",
  INVALID_IDENTITY_CORRECTION_SUBMIT: "Data pengajuan koreksi identitas tidak valid.",
  DEVICE_NOT_FOUND: "Alat yang dipilih tidak ditemukan.",
  DEVICE_CUSTOMER_MISMATCH: "Alat yang dipilih bukan milik pelanggan pada job ini.",
  DEVICE_TYPE_MISMATCH: "Jenis alat yang dipilih tidak sesuai.",
  // File upload (foto BA)
  FILE_MIME_NOT_ALLOWED: "Format foto tidak didukung — gunakan JPG atau PNG.",
  FILE_EXTENSION_NOT_ALLOWED: "Format foto tidak didukung — gunakan JPG atau PNG.",
  FILE_CONTENT_MISMATCH: "Isi file tidak sesuai dengan tipe yang dinyatakan.",
  FILE_TOO_LARGE: "Ukuran foto melebihi batas (5 MB).",
  FILE_OWNER_LOCKED: "BA ini sudah tidak dapat menerima foto baru.",
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
