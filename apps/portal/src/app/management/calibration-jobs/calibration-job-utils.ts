import {
  ApiError,
  isCalibrationJobBenchLocked,
  isIdentityIncomplete,
  jobNeedsAction,
  type CalibrationJobActionSignals,
} from "@medcal/shared";
import type { JobEquipmentValidityStatus } from "./use-reference-equipment-used-query";

export type AkdAklApprovalStatus = "NOT_REQUIRED" | "PENDING_REVIEW" | "APPROVED" | "REJECTED";

export type CalibrationJobStatus =
  "PENDING" | "IN_PROGRESS" | "SUBMITTED" | "REWORK" | "ACCEPTED_BY_QA";

export const AKD_AKL_APPROVAL_STATUS_VALUES: AkdAklApprovalStatus[] = [
  "NOT_REQUIRED",
  "PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
];

export const CALIBRATION_JOB_STATUS_VALUES: CalibrationJobStatus[] = [
  "PENDING",
  "IN_PROGRESS",
  "SUBMITTED",
  "REWORK",
  "ACCEPTED_BY_QA",
];

export const AKD_AKL_APPROVAL_STATUS_LABELS: Record<AkdAklApprovalStatus, string> = {
  NOT_REQUIRED: "Not Required",
  PENDING_REVIEW: "Pending Review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export const CALIBRATION_JOB_STATUS_LABELS: Record<CalibrationJobStatus, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In Progress",
  SUBMITTED: "Submitted",
  REWORK: "Rework",
  ACCEPTED_BY_QA: "Accepted by QA",
};

export { isIdentityIncomplete };

type IdentityGateJob = {
  status: string;
  akdAklApprovalStatus: string;
};

/**
 * Once the job has advanced past the bench, the identity gate (escalate /
 * decide AKD-AKL / submit or decide an identity correction) is closed
 * server-side. Shared with `@medcal/shared` action-signal builders.
 */
export function isIdentityGateLocked(job: Pick<IdentityGateJob, "status">): boolean {
  return isCalibrationJobBenchLocked(job.status);
}

/** NOT_REQUIRED / REJECTED → PENDING_REVIEW is the only escalation transition. */
export function canEscalateIdentity(job: IdentityGateJob): boolean {
  return (
    !isIdentityGateLocked(job) &&
    (job.akdAklApprovalStatus === "NOT_REQUIRED" || job.akdAklApprovalStatus === "REJECTED")
  );
}

/** Approve / reject is only offered while the declaration is under review. */
export function canDecideIdentity(job: IdentityGateJob): boolean {
  return !isIdentityGateLocked(job) && job.akdAklApprovalStatus === "PENDING_REVIEW";
}

/**
 * An identity correction BA can be submitted whenever the identity gate is open —
 * for first-time device resolution AND for correcting an already-bound identity.
 * A pending BA already existing is enforced server-side (IDENTITY_CORRECTION_ALREADY_PENDING).
 */
export function canSubmitIdentityCorrection(job: Pick<IdentityGateJob, "status">): boolean {
  return !isIdentityGateLocked(job);
}

/** Human-readable list of missing identity fields (Device ID / Serial). */
export function describeMissingIdentityFields(job: {
  deviceId: string | null;
  technicianObservedSerial: string | null;
}): string {
  const missing: string[] = [];
  if (job.deviceId == null) missing.push("Device ID");
  const serial = job.technicianObservedSerial?.trim() ?? "";
  if (serial.length === 0) missing.push("Serial observasi teknisi");
  if (missing.length === 0) return "identitas perangkat";
  if (missing.length === 1) return missing[0]!;
  return `${missing[0]} dan ${missing[1]}`;
}

/** Deep-link into an existing detail section (Identity / corrections / ref-eq). */
export function calibrationJobActionFocusHref(jobId: string): string {
  return `/calibration-jobs/${jobId}?focus=action`;
}

export function firstActionableJobId(
  jobs: { id: string; actionSignals: CalibrationJobActionSignals }[],
): string | undefined {
  return jobs.find((job) => jobNeedsAction(job.actionSignals))?.id;
}

type QualityReviewLike = {
  status: string;
};

type JobWithQualityReview = {
  status: string;
  reviews?: QualityReviewLike[] | null;
};

export function latestQualityReview<T extends QualityReviewLike>(
  job: { reviews?: T[] | null },
): T | null {
  return job.reviews?.[0] ?? null;
}

export function isQualityReviewApproved(job: JobWithQualityReview): boolean {
  return latestQualityReview(job)?.status === "APPROVED";
}

export function isQualityReviewRejected(job: JobWithQualityReview): boolean {
  return latestQualityReview(job)?.status === "REJECTED";
}

export function isAwaitingQualityReview(job: JobWithQualityReview): boolean {
  return job.status === "SUBMITTED" && !isQualityReviewApproved(job);
}

export function canDecideQualityReview(job: JobWithQualityReview): boolean {
  return isAwaitingQualityReview(job);
}

/**
 * Show MT rejection notes. SUBMITTED + latest REJECTED is a new review cycle.
 */
export function shouldShowRejectionFeedback(job: JobWithQualityReview): boolean {
  return (
    isQualityReviewRejected(job) &&
    (job.status === "REWORK" || job.status === "IN_PROGRESS")
  );
}

/** While REWORK, currentAttempt is already N+1 with no rows — show the rejected attempt. */
export function qualityReviewDisplayAttempt(job: {
  status: string;
  currentAttempt?: number | null;
}): number {
  const current = job.currentAttempt ?? 1;
  if (job.status === "REWORK" && current > 1) return current - 1;
  return current;
}

/** Reject payload. Empty / whitespace-only notes are not sent. */
export function toQualityReviewRejectInput(
  notes: string,
): { decision: "REJECT"; notes: string } | null {
  const trimmed = notes.trim();
  if (!trimmed) return null;
  return { decision: "REJECT", notes: trimmed };
}

// ── Identity correction display helpers ───────────────────────────────────────

type CorrectionChangeRow = {
  attr: "Device" | "Merk" | "Model / Tipe" | "Serial No" | "AKD/AKL/NIE";
  prev: string;
  next: string;
};

interface CorrectionLike {
  prevDevice: { code: string | null } | null;
  newDevice: { code: string | null } | null;
  newDeviceId: string | null;
  prevBrand: string | null;
  newBrand: string | null;
  prevModel: string | null;
  newModel: string | null;
  prevSerial: string | null;
  newSerial: string | null;
  prevAkdAkl: string | null;
  newAkdAkl: string | null;
}

const dash = (v: string | null | undefined) => (v && v.trim() ? v : "—");

/** The attributes a BA actually changes, as before → after rows. */
export function summarizeCorrectionChanges(c: CorrectionLike): CorrectionChangeRow[] {
  const rows: CorrectionChangeRow[] = [];
  // Historical only: the Device is locked to the WO/SPK assignment (MoM #6),
  // so no new BA carries these — older ones keep their evidence.
  if (c.newDeviceId !== null) {
    rows.push({
      attr: "Device",
      prev: dash(c.prevDevice?.code),
      next: dash(c.newDevice?.code),
    });
  }
  if (c.newBrand !== null) {
    rows.push({ attr: "Merk", prev: dash(c.prevBrand), next: dash(c.newBrand) });
  }
  if (c.newModel !== null) {
    rows.push({ attr: "Model / Tipe", prev: dash(c.prevModel), next: dash(c.newModel) });
  }
  if (c.newSerial !== null) {
    rows.push({ attr: "Serial No", prev: dash(c.prevSerial), next: dash(c.newSerial) });
  }
  if (c.newAkdAkl !== null) {
    rows.push({ attr: "AKD/AKL/NIE", prev: dash(c.prevAkdAkl), next: dash(c.newAkdAkl) });
  }
  return rows;
}

interface CorrectionPhotoLike {
  files: { id: string }[];
  signatures: { status: "SIGNED" | "UNAVAILABLE" | "REFUSED" }[];
}

/**
 * Both signatures live on one physical sheet — the BA is photographed once,
 * not once per signer. True when at least one signer actually signed but the
 * correction has no photo on file yet.
 */
export function correctionMissingImage(correction: CorrectionPhotoLike): boolean {
  return correction.signatures.some((s) => s.status === "SIGNED") && correction.files.length === 0;
}

export const MISSING_CORRECTION_IMAGE_MESSAGE =
  "Foto BA (lembar tanda tangan) belum diunggah. Unggah dulu di detail BA sebelum menyetujui.";

export function formatCalibrationJobApiError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const code = err.data?.code;
    const messages: Record<string, string> = {
      DEVICE_TYPE_MISMATCH:
        "Jenis alat device tidak cocok dengan jenis alat pada calibration job ini.",
      CALIBRATION_JOB_DEVICE_TYPE_UNRESOLVED:
        "Jenis alat untuk job ini tidak dapat ditentukan dari requisition atau purchase order. Cocokkan dengan device yang sudah terdaftar.",
      CALIBRATION_JOB_IDENTITY_GATE_LOCKED:
        "Calibration job sudah melewati tahap verifikasi identitas — aksi ini tidak lagi tersedia.",
      DEVICE_ALREADY_ASSIGNED_ON_WORK_ORDER:
        "Device ini sudah di-assign ke job lain pada work order yang sama.",
      DEVICE_CUSTOMER_MISMATCH: "Device milik customer yang berbeda dari work order ini.",
      DEVICE_NOT_FOUND: "Device tidak ditemukan.",
      INVALID_AKD_AKL_TRANSITION: "Perubahan status persetujuan AKD/AKL tidak diizinkan.",
      CALIBRATION_JOB_NOT_FOUND: "Calibration job tidak ditemukan.",
      INVALID_CALIBRATION_JOB_IDENTITY_ESCALATION: "Data eskalasi identitas tidak valid.",
      INVALID_CALIBRATION_JOB_IDENTITY_DECISION: "Data keputusan identitas tidak valid.",
      // Identity Correction (BA)
      IDENTITY_CORRECTION_NO_CHANGE:
        "Koreksi tidak mengubah nilai identitas job saat ini. Ubah minimal satu atribut.",
      IDENTITY_CORRECTION_ALREADY_PENDING:
        "Job ini sudah punya BA koreksi identitas yang menunggu review.",
      IDENTITY_CORRECTION_ALREADY_DECIDED:
        "BA koreksi ini sudah diputuskan dan tidak dapat diubah.",
      IDENTITY_CORRECTION_SIGNATURE_IMAGE_MISSING: MISSING_CORRECTION_IMAGE_MESSAGE,
      IDENTITY_CORRECTION_NOT_FOUND: "BA koreksi identitas tidak ditemukan.",
      INVALID_IDENTITY_CORRECTION_SUBMIT: "Data pengajuan koreksi identitas tidak valid.",
      INVALID_IDENTITY_CORRECTION_DECISION: "Data keputusan koreksi identitas tidak valid.",
      ASSIGN_DEVICE_ENDPOINT_REMOVED:
        "Fitur assign device lama sudah diganti alur Koreksi Identitas. Muat ulang halaman.",
      FILE_MIME_NOT_ALLOWED: "Hanya gambar PNG/JPEG atau PDF yang diperbolehkan.",
      FILE_EXTENSION_NOT_ALLOWED: "Hanya gambar PNG/JPEG atau PDF yang diperbolehkan.",
      FILE_CONTENT_MISMATCH: "Isi file tidak sesuai dengan tipe yang dinyatakan.",
      FILE_TOO_LARGE: "Ukuran file melebihi batas (1 MB).",
      FILE_OWNER_LOCKED: "BA sudah diputuskan — lampiran tidak dapat diubah.",
      // Reference equipment used (PUT /calibration-jobs/:id/reference-equipment-used)
      CALIBRATION_JOB_NOT_STARTED:
        "Job belum dimulai — alat referensi baru dapat dicatat setelah kalibrasi berjalan.",
      CALIBRATION_JOB_REFERENCE_EQUIPMENT_LOCKED:
        "Job sudah dikirim — daftar alat referensi tidak dapat diubah lagi.",
      REFERENCE_EQUIPMENT_APPROVAL_ALREADY_PENDING:
        "Permintaan persetujuan alat referensi sedang menunggu review.",
      REFERENCE_EQUIPMENT_APPROVAL_NOT_REQUIRED:
        "Tidak ada alat referensi yang memerlukan persetujuan manajer teknis.",
      REFERENCE_EQUIPMENT_APPROVAL_ALREADY_DECIDED:
        "Permintaan persetujuan alat referensi ini sudah diputuskan.",
      REFERENCE_EQUIPMENT_APPROVAL_NOT_FOUND: "Permintaan persetujuan alat referensi tidak ditemukan.",
      REFERENCE_EQUIPMENT_APPROVAL_UNRESOLVED:
        "Selesaikan persetujuan alat referensi sebelum mengirim hasil ke review mutu.",
      INVALID_REFERENCE_EQUIPMENT_APPROVAL_DECISION:
        "Data keputusan persetujuan alat referensi tidak valid.",
      EQUIPMENT_NOT_CONFIRMED_ON_WORK_ORDER:
        "Alat ini tidak ada pada daftar work order job. Muat ulang halaman.",
      EQUIPMENT_INACTIVE: "Alat referensi ini berstatus nonaktif dan tidak dapat dipakai.",
      EQUIPMENT_TYPE_NOT_REQUIRED_FOR_DEVICE:
        "Jenis alat ini tidak diperlukan untuk jenis perangkat pada job ini.",
      DUPLICATE_JOB_REFERENCE_EQUIPMENT: "Ada alat yang terpilih lebih dari sekali.",
      INVALID_JOB_REFERENCE_EQUIPMENT: "Data pilihan alat referensi tidak valid.",
      // Quality-review happy path
      CALIBRATION_JOB_ALREADY_SUBMITTED: "Job sudah dikirim — hasil pengukuran terkunci.",
      CALIBRATION_JOB_NOT_IN_PROGRESS: "Hasil pengukuran hanya dapat dicatat saat job berlangsung.",
      CALIBRATION_JOB_NOT_SUBMITTED: "Job belum dikirim.",
      QUALITY_REVIEW_ALREADY_APPROVED: "Sudah Disetujui.",
      QUALITY_REVIEW_NOT_APPROVED: "Menunggu Review.",
      QUALITY_REVIEW_NOTES_REQUIRED: "Catatan keputusan wajib diisi saat menolak.",
      QUALITY_REVIEW_ALREADY_DECIDED: "Keputusan untuk pengiriman ini sudah dibuat.",
      CALIBRATION_JOB_ALREADY_COMPLETED: "Job sudah Diterima QA.",
      INVALID_QUALITY_REVIEW_DECISION: "Keputusan review tidak valid.",
      CALIBRATION_JOB_NOT_IN_REWORK: "Job harus dalam perbaikan untuk dilanjutkan.",
      CALIBRATION_JOB_ALREADY_RESUMED: "Job sudah dilanjutkan.",
      MEASUREMENT_JOB_NOT_IN_PROGRESS: "Hasil pengukuran hanya dapat dicatat saat job berlangsung.",
    };
    if (code && messages[code]) return messages[code];
    if (typeof err.data?.message === "string") return err.data.message;
    return err.message;
  }
  return fallback;
}

// ── Reference equipment used ─────────────────────────────────────────────────

/**
 * Mirrors REFERENCE_EQUIPMENT_LOCKED_JOB_STATUSES in calibration-jobs.service.ts —
 * once execution is past the bench, which reference equipment was used is final.
 */
const REFERENCE_EQUIPMENT_LOCKED_JOB_STATUSES: readonly string[] = ["SUBMITTED", "ACCEPTED_BY_QA"];

/** Recording is possible once the job has started and before it is submitted. */
export function canRecordReferenceEquipment(job: {
  status: string;
  startedAt: string | null;
}): boolean {
  return job.startedAt !== null && !REFERENCE_EQUIPMENT_LOCKED_JOB_STATUSES.includes(job.status);
}

export function latestReferenceEquipmentApproval<
  T extends { status: string },
>(job: { referenceEquipmentApprovals?: T[] | null }): T | null {
  return job.referenceEquipmentApprovals?.[0] ?? null;
}

export function isReferenceEquipmentApprovalPending(job: {
  referenceEquipmentApprovals?: { status: string }[] | null;
}): boolean {
  return latestReferenceEquipmentApproval(job)?.status === "PENDING_REVIEW";
}

export function canReplaceReferenceEquipment(job: {
  status: string;
  startedAt: string | null;
  referenceEquipmentApprovals?: { status: string }[] | null;
}): boolean {
  return canRecordReferenceEquipment(job) && !isReferenceEquipmentApprovalPending(job);
}

export const REFERENCE_EQUIPMENT_VALIDITY_LABELS: Record<JobEquipmentValidityStatus, string> = {
  VALID: "Valid",
  EXPIRED: "Kalibrasi kedaluwarsa",
  NOT_YET_VALID: "Belum berlaku",
  NO_RECORD: "Tanpa sertifikat",
  NOT_ACCEPTED_FOR_USE: "Tidak diterima untuk pemakaian",
};

export const REFERENCE_EQUIPMENT_VALIDITY_BADGE_CLASS: Record<JobEquipmentValidityStatus, string> =
  {
    VALID: "border-transparent bg-emerald-600 text-white hover:bg-emerald-600",
    EXPIRED: "border-transparent bg-red-600 text-white hover:bg-red-600",
    NOT_YET_VALID: "border-transparent bg-amber-500 text-white hover:bg-amber-500",
    NO_RECORD: "border-transparent bg-slate-500 text-white hover:bg-slate-500",
    NOT_ACCEPTED_FOR_USE: "border-transparent bg-orange-500 text-white hover:bg-orange-500",
  };

/** Only VALID can be submitted without a TECHNICIAN_MANAGER override. */
export function isReferenceEquipmentUsable(status: JobEquipmentValidityStatus): boolean {
  return status === "VALID";
}

/**
 * Reference-equipment submit errors. EQUIPMENT_CALIBRATION_INVALID carries the
 * failing validity sub-status in err.data.validityStatus — surface it. Everything
 * else defers to formatCalibrationJobApiError.
 */
export function formatReferenceEquipmentError(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.data?.code === "EQUIPMENT_CALIBRATION_INVALID") {
    const status = err.data.validityStatus as JobEquipmentValidityStatus | undefined;
    const label = status ? REFERENCE_EQUIPMENT_VALIDITY_LABELS[status] : undefined;
    return label
      ? `Kalibrasi alat tidak valid (${label}). Perlu persetujuan manajer teknis.`
      : "Kalibrasi alat tidak valid. Perlu persetujuan manajer teknis.";
  }
  return formatCalibrationJobApiError(err, fallback);
}

// ── Measurement review display (Hasil / Nilai Normal) ────────────────────────

/**
 * Display-only format for `MeasurementResult.measuredValue` on Portal review.
 *
 * - `decimalPlaces` configured → pad/trim fractional digits with `toFixed` for
 *   render only (does not mutate the stored/API string).
 * - `decimalPlaces` null → return the raw stored representation (do not invent
 *   precision). Differs from tech-pwa `formatMeasuredValue`, which treats null as 0.
 *
 * Returns null when there is no numeric measured value so callers can fall back
 * to measuredText / measuredBool / "—".
 */
export function formatMeasurementHasilDisplay(
  measuredValue: string | null | undefined,
  decimalPlaces: number | null | undefined,
): string | null {
  if (measuredValue == null || measuredValue === "") return null;
  if (decimalPlaces == null) return measuredValue;
  const n = Number(measuredValue);
  if (!Number.isFinite(n)) return measuredValue;
  const dp = Math.max(0, Math.trunc(decimalPlaces));
  return n.toFixed(dp);
}

/**
 * Format snapshot or catalog numeric bounds for display.
 * Returns null when neither bound is present (caller chooses fallback / "—").
 */
export function formatEffectiveToleranceBounds(
  min: string | null | undefined,
  max: string | null | undefined,
): string | null {
  const hasMin = min != null && min !== "";
  const hasMax = max != null && max !== "";
  if (hasMin && hasMax) return `${min}–${max}`;
  if (hasMin) return `≥ ${min}`;
  if (hasMax) return `≤ ${max}`;
  return null;
}

type CatalogToleranceFields = {
  toleranceMin: string | null;
  toleranceMax: string | null;
  toleranceNote: string | null;
};

/**
 * Display "Nilai Normal" for one MeasurementResult on Portal MT review.
 *
 * Primary: effectiveToleranceMin/Max snapshotted on the row (audit-locked).
 * Fallback when both effective bounds are null: catalog toleranceNote (test
 * point first, then parameter), then structured catalog min/max. Never invents
 * a range and never uses appliedNominalValue / referenceValue.
 */
export function formatMeasurementNormalValue(input: {
  effectiveToleranceMin: string | null;
  effectiveToleranceMax: string | null;
  testPoint?: CatalogToleranceFields | null;
  parameter?: CatalogToleranceFields | null;
}): string {
  const fromEffective = formatEffectiveToleranceBounds(
    input.effectiveToleranceMin,
    input.effectiveToleranceMax,
  );
  if (fromEffective !== null) return fromEffective;

  const tp = input.testPoint ?? null;
  const param = input.parameter ?? null;
  const note = tp?.toleranceNote?.trim() || param?.toleranceNote?.trim();
  if (note) return note;

  const fromTp = formatEffectiveToleranceBounds(tp?.toleranceMin, tp?.toleranceMax);
  if (fromTp !== null) return fromTp;

  const fromParam = formatEffectiveToleranceBounds(param?.toleranceMin, param?.toleranceMax);
  if (fromParam !== null) return fromParam;

  return "—";
}
