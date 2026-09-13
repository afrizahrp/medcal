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

/** Device is only a valid correction once a candidate has actually been resolved — a typed search string is never enough. */
export function deviceCorrectionValid(state: WizardState): boolean {
  return state.attrs.device && state.deviceId.length > 0;
}

export function serialCorrectionValid(state: WizardState): boolean {
  return state.attrs.serial && state.serial.trim().length > 0;
}

export function akdAklCorrectionValid(state: WizardState): boolean {
  return state.attrs.akdAkl && state.akdAkl.trim().length > 0;
}

/**
 * At least one checked attribute must be a resolved, valid correction —
 * but an unresolved/incomplete checked attribute (e.g. Device search with no
 * match) must not hard-block the other attributes that ARE valid. Missing
 * identity information is warn/flag territory (MT decides), not a hard stop.
 */
export function attrsValid(state: WizardState): boolean {
  return deviceCorrectionValid(state) || serialCorrectionValid(state) || akdAklCorrectionValid(state);
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
