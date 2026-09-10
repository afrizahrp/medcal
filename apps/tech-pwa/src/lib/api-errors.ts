import { ApiError } from "@medcal/shared";
import {
  REFERENCE_EQUIPMENT_VALIDITY_LABELS,
  type JobEquipmentValidityStatus,
} from "./calibration/reference-equipment";

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
  FILE_TOO_LARGE: "Ukuran foto melebihi batas (10 MB).",
  FILE_OWNER_LOCKED: "BA ini sudah tidak dapat menerima foto baru.",
  // Reference equipment used (PUT /calibration-jobs/:id/reference-equipment-used)
  CALIBRATION_JOB_NOT_STARTED:
    "Job belum dimulai — alat referensi baru dapat dicatat setelah kalibrasi berjalan.",
  CALIBRATION_JOB_REFERENCE_EQUIPMENT_LOCKED:
    "Job sudah dikirim — daftar alat referensi tidak dapat diubah lagi.",
  EQUIPMENT_NOT_CONFIRMED_ON_WORK_ORDER:
    "Alat ini tidak ada pada daftar work order job. Muat ulang halaman.",
  EQUIPMENT_INACTIVE: "Alat referensi ini berstatus nonaktif dan tidak dapat dipakai.",
  EQUIPMENT_TYPE_NOT_REQUIRED_FOR_DEVICE:
    "Jenis alat ini tidak diperlukan untuk jenis perangkat pada job ini.",
  DUPLICATE_JOB_REFERENCE_EQUIPMENT: "Ada alat yang terpilih lebih dari sekali.",
  INVALID_JOB_REFERENCE_EQUIPMENT: "Data pilihan alat referensi tidak valid.",
  // MeasurementResult entry (Stage A)
  MEASUREMENT_JOB_SUBMITTED: "Job sudah dikirim — hasil pengukuran terkunci.",
  MEASUREMENT_ATTEMPT_SUPERSEDED:
    "Pembacaan ini milik attempt lama dan tidak dapat diubah.",
  MEASUREMENT_DUPLICATE_ENTRY:
    "Baris pembacaan ini sudah tersimpan. Muat ulang halaman.",
  DEVICE_CALIBRATION_PARAMETER_NOT_FOUND: "Parameter kalibrasi tidak ditemukan.",
  MEASUREMENT_RESULT_NOT_FOUND: "Baris pembacaan tidak ditemukan. Muat ulang halaman.",
  INVALID_MEASUREMENT_RESULT: "Data pembacaan tidak valid.",
  INVALID_MEASUREMENT_RESULT_BATCH: "Data pembacaan tidak valid.",
  INVALID_MEASUREMENT_RESULT_UPDATE: "Data perubahan pembacaan tidak valid.",
  // Quality-review happy path (submit → MT APPROVE → complete)
  CALIBRATION_JOB_ALREADY_SUBMITTED: "Job sudah dikirim — hasil pengukuran terkunci.",
  CALIBRATION_JOB_NOT_IN_PROGRESS: "Hasil pengukuran hanya dapat dicatat saat job berlangsung.",
  CALIBRATION_JOB_NOT_SUBMITTED: "Job belum dikirim.",
  QUALITY_REVIEW_ALREADY_APPROVED: "Sudah Disetujui.",
  QUALITY_REVIEW_NOT_APPROVED: "Menunggu Review.",
  CALIBRATION_JOB_ALREADY_COMPLETED: "Job sudah Diterima QA.",
  INVALID_QUALITY_REVIEW_DECISION: "Keputusan review tidak valid.",
  CALIBRATION_JOB_NOT_IN_REWORK: "Job harus dalam perbaikan untuk dilanjutkan.",
  CALIBRATION_JOB_ALREADY_RESUMED: "Job sudah dilanjutkan.",
  MEASUREMENT_JOB_NOT_IN_PROGRESS: "Hasil pengukuran hanya dapat dicatat saat job berlangsung.",
  QUALITY_REVIEW_NOTES_REQUIRED: "Catatan keputusan wajib diisi saat menolak.",
  QUALITY_REVIEW_ALREADY_DECIDED: "Keputusan untuk pengiriman ini sudah dibuat.",
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

/**
 * Reference-equipment submit errors. EQUIPMENT_CALIBRATION_INVALID carries the
 * failing validity sub-status in err.data.validityStatus — surface it the way
 * the API reports it. Everything else defers to formatApiError.
 */
export function formatReferenceEquipmentError(err: unknown, fallback: string): string {
  if (
    !isOffline() &&
    err instanceof ApiError &&
    err.data?.code === "EQUIPMENT_CALIBRATION_INVALID"
  ) {
    const status = err.data.validityStatus as JobEquipmentValidityStatus | undefined;
    const label = status ? REFERENCE_EQUIPMENT_VALIDITY_LABELS[status] : undefined;
    return label
      ? `Kalibrasi alat tidak valid (${label}). Perlu persetujuan manajer teknis.`
      : "Kalibrasi alat tidak valid. Perlu persetujuan manajer teknis.";
  }
  return formatApiError(err, fallback);
}
