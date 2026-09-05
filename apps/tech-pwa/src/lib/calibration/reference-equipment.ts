import type { CalibrationJobStatus } from "./types";

/**
 * Reference equipment used on a CalibrationJob — local mirrors of the apps/api
 * shapes (job-reference-equipment.ts), dates as ISO strings. tech-pwa had zero
 * equipment awareness before this; this module introduces it.
 */

/** Mirrors JobEquipmentValidityStatus in apps/api job-reference-equipment.ts. */
export type JobEquipmentValidityStatus =
  | "VALID"
  | "EXPIRED"
  | "NOT_YET_VALID"
  | "NO_RECORD"
  | "NOT_ACCEPTED_FOR_USE";

export const REFERENCE_EQUIPMENT_VALIDITY_LABELS: Record<JobEquipmentValidityStatus, string> = {
  VALID: "Valid",
  EXPIRED: "Kalibrasi kedaluwarsa",
  NOT_YET_VALID: "Belum berlaku",
  NO_RECORD: "Tanpa sertifikat",
  NOT_ACCEPTED_FOR_USE: "Tidak diterima untuk pemakaian",
};

export const REFERENCE_EQUIPMENT_VALIDITY_BADGE_CLASS: Record<JobEquipmentValidityStatus, string> = {
  VALID: "bg-emerald-600",
  EXPIRED: "bg-red-600",
  NOT_YET_VALID: "bg-amber-500",
  NO_RECORD: "bg-slate-500",
  NOT_ACCEPTED_FOR_USE: "bg-orange-500",
};

/** Only VALID can be submitted without a TECHNICIAN_MANAGER override. */
export function isReferenceEquipmentUsable(status: JobEquipmentValidityStatus): boolean {
  return status === "VALID";
}

// ── API response mirrors ─────────────────────────────────────────────────────

export interface TechReferenceEquipmentCandidateValidity {
  status: JobEquipmentValidityStatus;
  recordId: string | null;
  validUntil: string | null;
}

export interface TechReferenceEquipmentCandidate {
  equipmentId: string;
  code: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  equipmentTypeId: string;
  equipmentTypeName: string;
  isActive: boolean;
  validity: TechReferenceEquipmentCandidateValidity;
  requiredForDeviceType: boolean;
}

export interface TechReferenceEquipmentUsed {
  id: string;
  calibrationJobId: string;
  equipmentId: string;
  equipmentCalibrationRecordId: string | null;
  notes: string | null;
  validityOverridden: boolean;
  overrideReason: string | null;
  overriddenByUserId: string | null;
  overriddenAt: string | null;
  createdAt: string;
  updatedAt: string;
  equipment: {
    id: string;
    code: string;
    brand: string | null;
    model: string | null;
    serialNumber: string | null;
    equipmentType: { id: string; code: string; name: string };
  };
  equipmentCalibrationRecord: {
    id: string;
    calibrationDate: string;
    validFrom: string | null;
    validUntil: string;
    certificateNumber: string | null;
  } | null;
  overriddenBy: { id: string; name: string | null } | null;
}

/** One item of the full-set PUT body. `override` is TECHNICIAN_MANAGER-only. */
export interface JobReferenceEquipmentReplaceItem {
  equipmentId: string;
  override?: { reason: string };
}

// ── Gate helpers (mirror REFERENCE_EQUIPMENT_LOCKED_JOB_STATUSES) ─────────────

const REFERENCE_EQUIPMENT_LOCKED_JOB_STATUSES: readonly CalibrationJobStatus[] = [
  "SUBMITTED",
  "ACCEPTED_BY_QA",
];

export function isReferenceEquipmentLocked(job: { status: CalibrationJobStatus }): boolean {
  return REFERENCE_EQUIPMENT_LOCKED_JOB_STATUSES.includes(job.status);
}

/** Recording is possible once the job has started and before it is submitted. */
export function canRecordReferenceEquipment(job: {
  status: CalibrationJobStatus;
  startedAt: string | null;
}): boolean {
  return job.startedAt !== null && !isReferenceEquipmentLocked(job);
}
