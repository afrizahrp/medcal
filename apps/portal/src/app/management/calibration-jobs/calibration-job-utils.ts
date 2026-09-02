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
 * job has advanced past the bench, the identity gate (escalate / decide / assign)
 * is closed server-side.
 */
const IDENTITY_LOCKED_JOB_STATUSES: readonly string[] = ["SUBMITTED", "ACCEPTED_BY_QA"];

type IdentityGateJob = {
  status: string;
  akdAklApprovalStatus: string;
  deviceId: string | null;
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

/** Device binding is a one-time action while the job is still unidentified. */
export function canAssignDevice(job: IdentityGateJob): boolean {
  return !isIdentityGateLocked(job) && job.deviceId === null;
}

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
      CALIBRATION_JOB_DEVICE_ALREADY_ASSIGNED:
        "Calibration job ini sudah memiliki device. Penggantian device ditangani oleh alur Identity Correction.",
      DEVICE_ALREADY_ASSIGNED_ON_WORK_ORDER:
        "Device ini sudah di-assign ke job lain pada work order yang sama.",
      DEVICE_CUSTOMER_MISMATCH: "Device milik customer yang berbeda dari work order ini.",
      DEVICE_NOT_FOUND: "Device tidak ditemukan.",
      INVALID_AKD_AKL_TRANSITION: "Perubahan status persetujuan AKD/AKL tidak diizinkan.",
      CALIBRATION_JOB_NOT_FOUND: "Calibration job tidak ditemukan.",
      INVALID_CALIBRATION_JOB_IDENTITY_ESCALATION: "Data eskalasi identitas tidak valid.",
      INVALID_CALIBRATION_JOB_IDENTITY_DECISION: "Data keputusan identitas tidak valid.",
      INVALID_CALIBRATION_JOB_ASSIGN_DEVICE: "Data assign device tidak valid.",
      INVALID_CALIBRATION_JOB_REGISTER_DEVICE: "Data registrasi device tidak valid.",
    };
    if (code && messages[code]) return messages[code];
    if (typeof err.data?.message === "string") return err.data.message;
    return err.message;
  }
  return fallback;
}
