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
  /**
   * MoM #6: a BA corrects the observed identity of the Device assigned by the
   * WO/SPK — Brand, Model and Serial No. The Device itself is locked and is
   * never an attribute here.
   */
  attrs: { brand: boolean; model: boolean; serial: boolean };
  brand: string;
  model: string;
  serial: string;
  signatures: { TECHNICIAN: WizardSignatureValue; CUSTOMER: WizardSignatureValue };
  photo: File | null;
}

function emptySignature(): WizardSignatureValue {
  return { status: "SIGNED", signerName: "", unavailableReason: "" };
}

/**
 * Each field is pre-filled with what the job currently shows: the value this
 * calibration observed, falling back to the assigned Device master — the same
 * precedence the API compares against and the LK prints.
 */
export function initialWizardState(job: TechCalibrationJob): WizardState {
  return {
    reason: "",
    attrs: { brand: false, model: false, serial: false },
    brand: currentBrand(job),
    model: currentModel(job),
    serial: currentSerial(job),
    signatures: { TECHNICIAN: emptySignature(), CUSTOMER: emptySignature() },
    photo: null,
  };
}

export function currentBrand(job: TechCalibrationJob): string {
  return job.technicianObservedBrand ?? job.device?.brand ?? "";
}

export function currentModel(job: TechCalibrationJob): string {
  return job.technicianObservedModel ?? job.device?.model ?? "";
}

export function currentSerial(job: TechCalibrationJob): string {
  return job.technicianObservedSerial ?? job.device?.serialNumber ?? "";
}

export function signatureValid(v: WizardSignatureValue): boolean {
  if (v.status === "SIGNED") return v.signerName.trim().length > 0;
  return v.unavailableReason.trim().length > 0;
}

export function brandCorrectionValid(state: WizardState): boolean {
  return state.attrs.brand && state.brand.trim().length > 0;
}

export function modelCorrectionValid(state: WizardState): boolean {
  return state.attrs.model && state.model.trim().length > 0;
}

export function serialCorrectionValid(state: WizardState): boolean {
  return state.attrs.serial && state.serial.trim().length > 0;
}

/**
 * At least one checked attribute must carry a value — a checked-but-empty
 * attribute must not hard-block the others that ARE filled in.
 */
export function attrsValid(state: WizardState): boolean {
  return brandCorrectionValid(state) || modelCorrectionValid(state) || serialCorrectionValid(state);
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
