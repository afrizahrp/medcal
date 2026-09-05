import type {
  IdentityCorrectionSignatureInput,
  SignatureStatus,
  TechCalibrationJob,
} from "../../../../lib/calibration/types";

export interface WizardSignatureValue {
  status: SignatureStatus;
  signerName: string;
  unavailableReason: string;
}

export interface WizardState {
  reason: string;
  attrs: { device: boolean; serial: boolean; akdAkl: boolean };
  deviceId: string;
  deviceLabel: string;
  serial: string;
  akdAkl: string;
  signatures: { TECHNICIAN: WizardSignatureValue; CUSTOMER: WizardSignatureValue };
  photo: File | null;
}

function emptySignature(): WizardSignatureValue {
  return { status: "SIGNED", signerName: "", unavailableReason: "" };
}

export function initialWizardState(job: TechCalibrationJob): WizardState {
  return {
    reason: "",
    attrs: { device: false, serial: false, akdAkl: false },
    deviceId: "",
    deviceLabel: "",
    serial: job.technicianObservedSerial ?? "",
    akdAkl: job.technicianObservedAkdAkl ?? "",
    signatures: { TECHNICIAN: emptySignature(), CUSTOMER: emptySignature() },
    photo: null,
  };
}

export function signatureValid(v: WizardSignatureValue): boolean {
  if (v.status === "SIGNED") return v.signerName.trim().length > 0;
  return v.unavailableReason.trim().length > 0;
}

export function attrsValid(state: WizardState): boolean {
  const any = state.attrs.device || state.attrs.serial || state.attrs.akdAkl;
  return (
    any &&
    (!state.attrs.device || state.deviceId.length > 0) &&
    (!state.attrs.serial || state.serial.trim().length > 0) &&
    (!state.attrs.akdAkl || state.akdAkl.trim().length > 0)
  );
}

export function step1Valid(state: WizardState): boolean {
  return state.reason.trim().length > 0 && attrsValid(state);
}

/** Only require a photo where there is something on the sheet to photograph. */
export function photoRequired(state: WizardState): boolean {
  return state.signatures.TECHNICIAN.status === "SIGNED" || state.signatures.CUSTOMER.status === "SIGNED";
}

export function photoStepValid(state: WizardState): boolean {
  return !photoRequired(state) || state.photo !== null;
}

export function toSignatureInput(v: WizardSignatureValue): IdentityCorrectionSignatureInput {
  return {
    status: v.status,
    ...(v.status === "SIGNED" ? { signerName: v.signerName.trim() } : {}),
    ...(v.status !== "SIGNED" ? { unavailableReason: v.unavailableReason.trim() } : {}),
  };
}
