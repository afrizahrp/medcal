import { ApiError } from "@medcal/shared";

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

/**
 * Mirrors IDENTITY_LOCKED_JOB_STATUSES in calibration-jobs.service.ts — once the
 * job has advanced past the bench, the identity gate (escalate / decide AKD-AKL /
 * submit or decide an identity correction) is closed server-side.
 */
const IDENTITY_LOCKED_JOB_STATUSES: readonly string[] = ["SUBMITTED", "ACCEPTED_BY_QA"];

type IdentityGateJob = {
  status: string;
  akdAklApprovalStatus: string;
};

export function isIdentityGateLocked(job: Pick<IdentityGateJob, "status">): boolean {
  return IDENTITY_LOCKED_JOB_STATUSES.includes(job.status);
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

// ── Identity correction display helpers ───────────────────────────────────────

type CorrectionChangeRow = { attr: "Device" | "Serial" | "AKD/AKL/NIE"; prev: string; next: string };

interface CorrectionLike {
  prevDevice: { code: string | null } | null;
  newDevice: { code: string | null } | null;
  newDeviceId: string | null;
  prevSerial: string | null;
  newSerial: string | null;
  prevAkdAkl: string | null;
  newAkdAkl: string | null;
}

const dash = (v: string | null | undefined) => (v && v.trim() ? v : "—");

/** The attributes a BA actually changes, as before → after rows. */
export function summarizeCorrectionChanges(c: CorrectionLike): CorrectionChangeRow[] {
  const rows: CorrectionChangeRow[] = [];
  if (c.newDeviceId !== null) {
    rows.push({
      attr: "Device",
      prev: dash(c.prevDevice?.code),
      next: dash(c.newDevice?.code),
    });
  }
  if (c.newSerial !== null) {
    rows.push({ attr: "Serial", prev: dash(c.prevSerial), next: dash(c.newSerial) });
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
      FILE_TOO_LARGE: "Ukuran file melebihi batas (5 MB).",
      FILE_OWNER_LOCKED: "BA sudah diputuskan — lampiran tidak dapat diubah.",
    };
    if (code && messages[code]) return messages[code];
    if (typeof err.data?.message === "string") return err.data.message;
    return err.message;
  }
  return fallback;
}
