import type { TechCalibrationJob, TechIdentityCorrection } from "./types";

export function declaredDeviceName(job: TechCalibrationJob): string {
  return job.customerDeclaredDeviceName ?? job.calibrationRequestItem?.customerDeviceName ?? "—";
}

export function declaredAkdAkl(job: TechCalibrationJob): string {
  return job.customerDeclaredAkdAkl ?? job.calibrationRequestItem?.akdAkl ?? "—";
}

const dash = (v: string | null | undefined) => (v && v.trim() ? v : "—");

export interface CorrectionChangeRow {
  attr: "Alat" | "Serial" | "AKD/AKL/NIE";
  prev: string;
  next: string;
}

export function summarizeCorrectionChanges(c: TechIdentityCorrection): CorrectionChangeRow[] {
  const rows: CorrectionChangeRow[] = [];
  if (c.newDeviceId !== null) {
    rows.push({ attr: "Alat", prev: dash(c.prevDevice?.code), next: dash(c.newDevice?.code) });
  }
  if (c.newSerial !== null) {
    rows.push({ attr: "Serial", prev: dash(c.prevSerial), next: dash(c.newSerial) });
  }
  if (c.newAkdAkl !== null) {
    rows.push({ attr: "AKD/AKL/NIE", prev: dash(c.prevAkdAkl), next: dash(c.newAkdAkl) });
  }
  return rows;
}
