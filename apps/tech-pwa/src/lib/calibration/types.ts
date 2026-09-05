// Local, trimmed mirrors of apps/api CalibrationJobDetail / IdentityCorrectionDetail —
// no cross-app import from apps/portal (rebuilt here on purpose).

export type AkdAklApprovalStatus = "NOT_REQUIRED" | "PENDING_REVIEW" | "APPROVED" | "REJECTED";

export type CalibrationJobStatus = "PENDING" | "IN_PROGRESS" | "SUBMITTED" | "REWORK" | "ACCEPTED_BY_QA";

export const AKD_AKL_APPROVAL_STATUS_LABELS: Record<AkdAklApprovalStatus, string> = {
  NOT_REQUIRED: "Tidak Diperlukan",
  PENDING_REVIEW: "Menunggu Review",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
};

export const CALIBRATION_JOB_STATUS_LABELS: Record<CalibrationJobStatus, string> = {
  PENDING: "Menunggu",
  IN_PROGRESS: "Berlangsung",
  SUBMITTED: "Terkirim",
  REWORK: "Perbaikan",
  ACCEPTED_BY_QA: "Diterima QA",
};

export interface TechCalibrationJob {
  id: string;
  workOrderId: string;
  deviceId: string | null;
  unitOrdinal: number;
  unitTotal: number;
  customerDeclaredDeviceName: string | null;
  customerDeclaredAkdAkl: string | null;
  technicianObservedSerial: string | null;
  technicianObservedAkdAkl: string | null;
  akdAklApprovalStatus: AkdAklApprovalStatus;
  akdAklApprovedAt: string | null;
  akdAklDecisionNote: string | null;
  status: CalibrationJobStatus;
  startedAt: string | null;
  createdAt: string;
  workOrder: {
    id: string;
    number: string;
    status?: string;
    customerId: string;
    customer: { id: string; name: string };
  };
  device: { id: string; code: string | null; serialNumber: string | null } | null;
  calibrationRequestItem: { customerDeviceName: string | null; akdAkl: string | null } | null;
  akdAklApprovedBy: { id: string; name: string | null } | null;
}

export interface TechJobListResponse {
  data: TechCalibrationJob[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type IdentityCorrectionStatus = "PENDING_REVIEW" | "APPROVED" | "REJECTED";
export type IdentityCorrectionSignerRole = "TECHNICIAN" | "CUSTOMER";
export type SignatureStatus = "SIGNED" | "UNAVAILABLE" | "REFUSED";

export const IDENTITY_CORRECTION_STATUS_LABELS: Record<IdentityCorrectionStatus, string> = {
  PENDING_REVIEW: "Menunggu Review",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
};

export interface TechIdentityCorrectionSignature {
  id: string;
  signerRole: IdentityCorrectionSignerRole;
  signerName: string | null;
  status: SignatureStatus;
  unavailableReason: string | null;
  signedAt: string | null;
}

export interface TechIdentityCorrection {
  id: string;
  calibrationJobId: string;
  number: string;
  status: IdentityCorrectionStatus;
  prevDevice: { id: string; code: string | null } | null;
  newDevice: { id: string; code: string | null } | null;
  newDeviceId: string | null;
  prevSerial: string | null;
  newSerial: string | null;
  prevAkdAkl: string | null;
  newAkdAkl: string | null;
  reason: string;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
  submittedBy: { id: string; name: string | null } | null;
  decidedBy: { id: string; name: string | null } | null;
  signatures: TechIdentityCorrectionSignature[];
  /** Photo of the signed BA sheet — one per correction, not per signer. */
  files: { id: string; originalName: string | null; mimeType: string | null }[];
}

export interface IdentityCorrectionSignatureInput {
  status: SignatureStatus;
  signerName?: string;
  unavailableReason?: string;
}

export interface IdentityCorrectionSubmitInput {
  reason: string;
  newDeviceId?: string;
  newSerial?: string;
  newAkdAkl?: string;
  signatures: {
    TECHNICIAN: IdentityCorrectionSignatureInput;
    CUSTOMER: IdentityCorrectionSignatureInput;
  };
}

export interface IdentityCorrectionSubmitResult {
  job: TechCalibrationJob;
  correction: TechIdentityCorrection;
  deviceTypeValidated: boolean;
}

export interface CalibrationJobDeviceCandidate {
  id: string;
  code: string | null;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
}
