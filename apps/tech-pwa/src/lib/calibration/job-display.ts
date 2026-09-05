import type { TechCalibrationJob, TechIdentityCorrection } from "./types";

export function declaredDeviceName(job: TechCalibrationJob): string {
  return job.customerDeclaredDeviceName ?? job.calibrationRequestItem?.customerDeviceName ?? "—";
}

export function declaredAkdAkl(job: TechCalibrationJob): string {
  return job.customerDeclaredAkdAkl ?? job.calibrationRequestItem?.akdAkl ?? "—";
}

export interface WorkOrderJobGroup {
  workOrderId: string;
  workOrderNumber: string;
  jobs: TechCalibrationJob[];
  /** Units the technician has handed off and are not awaiting rework. */
  doneCount: number;
}

/**
 * Groups a flat job list by work order (SPK), preserving the order in which each
 * work order first appears in the input, and sorting units within a group by
 * their ordinal. Pure presentation transform — no API/field changes.
 */
export function groupJobsByWorkOrder(jobs: TechCalibrationJob[]): WorkOrderJobGroup[] {
  const byWorkOrder = new Map<string, WorkOrderJobGroup>();

  for (const job of jobs) {
    let group = byWorkOrder.get(job.workOrderId);
    if (!group) {
      group = {
        workOrderId: job.workOrderId,
        workOrderNumber: job.workOrder.number,
        jobs: [],
        doneCount: 0,
      };
      byWorkOrder.set(job.workOrderId, group);
    }
    group.jobs.push(job);
  }

  const groups = [...byWorkOrder.values()];
  for (const group of groups) {
    group.jobs.sort((a, b) => a.unitOrdinal - b.unitOrdinal);
    group.doneCount = group.jobs.filter(
      (j) => j.status === "SUBMITTED" || j.status === "ACCEPTED_BY_QA",
    ).length;
  }
  return groups;
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
