import type { TechCalibrationJob, TechIdentityCorrection } from "./types";

export function declaredDeviceName(job: TechCalibrationJob): string {
  return job.customerDeclaredDeviceName ?? job.calibrationRequestItem?.customerDeviceName ?? "—";
}

export function declaredAkdAkl(job: TechCalibrationJob): string {
  return job.customerDeclaredAkdAkl ?? job.calibrationRequestItem?.akdAkl ?? "—";
}

/**
 * Terminal job only. SUBMITTED is still open: waiting for MT review, or waiting
 * for the technician to complete after an APPROVED QualityReview.
 */
export function isJobDone(job: TechCalibrationJob): boolean {
  return job.status === "ACCEPTED_BY_QA";
}

export interface WorkOrderJobGroup {
  workOrderId: string;
  workOrderNumber: string;
  customerId: string;
  customerName: string;
  jobs: TechCalibrationJob[];
  /** Units the technician has handed off and are not awaiting rework. */
  doneCount: number;
  openCount: number;
}

export interface CustomerJobGroup {
  customerId: string;
  customerName: string;
  workOrders: WorkOrderJobGroup[];
  spkCount: number;
  deviceCount: number;
  doneCount: number;
  openCount: number;
}

function compareIdLocale(a: string, b: string): number {
  return a.localeCompare(b, "id", { sensitivity: "base" });
}

/**
 * Sort key for technician work-queue ordering:
 * 1. Groups with unfinished work first
 * 2. More unfinished work first (actionable volume)
 * 3. Name / number alphabetical (id locale)
 * 4. Stable id tie-break
 */
function compareQueueGroups(
  a: { openCount: number; label: string; id: string },
  b: { openCount: number; label: string; id: string },
): number {
  const aOpen = a.openCount > 0 ? 1 : 0;
  const bOpen = b.openCount > 0 ? 1 : 0;
  if (aOpen !== bOpen) return bOpen - aOpen;
  if (a.openCount !== b.openCount) return b.openCount - a.openCount;
  const byLabel = compareIdLocale(a.label, b.label);
  if (byLabel !== 0) return byLabel;
  return a.id.localeCompare(b.id);
}

function finalizeWorkOrderGroup(group: WorkOrderJobGroup): void {
  group.jobs.sort((a, b) => a.unitOrdinal - b.unitOrdinal);
  group.doneCount = group.jobs.filter(isJobDone).length;
  group.openCount = group.jobs.length - group.doneCount;
}

/**
 * Groups a flat job list by work order (SPK), preserving deterministic queue
 * order (unfinished first). Pure presentation transform — no API/field changes.
 */
export function groupJobsByWorkOrder(jobs: TechCalibrationJob[]): WorkOrderJobGroup[] {
  const byWorkOrder = new Map<string, WorkOrderJobGroup>();

  for (const job of jobs) {
    let group = byWorkOrder.get(job.workOrderId);
    if (!group) {
      group = {
        workOrderId: job.workOrderId,
        workOrderNumber: job.workOrder.number,
        customerId: job.workOrder.customerId,
        customerName: job.workOrder.customer.name,
        jobs: [],
        doneCount: 0,
        openCount: 0,
      };
      byWorkOrder.set(job.workOrderId, group);
    }
    group.jobs.push(job);
  }

  const groups = [...byWorkOrder.values()];
  for (const group of groups) finalizeWorkOrderGroup(group);
  groups.sort((a, b) =>
    compareQueueGroups(
      { openCount: a.openCount, label: a.workOrderNumber, id: a.workOrderId },
      { openCount: b.openCount, label: b.workOrderNumber, id: b.workOrderId },
    ),
  );
  return groups;
}

/**
 * Groups flat assigned jobs Customer → SPK → units.
 * Customer / SPK order: unfinished first, then open volume, then name/number.
 */
export function groupJobsByCustomer(jobs: TechCalibrationJob[]): CustomerJobGroup[] {
  const byCustomer = new Map<string, Map<string, WorkOrderJobGroup>>();
  const customerNames = new Map<string, string>();

  for (const job of jobs) {
    const customerId = job.workOrder.customerId;
    customerNames.set(customerId, job.workOrder.customer.name);

    let byWorkOrder = byCustomer.get(customerId);
    if (!byWorkOrder) {
      byWorkOrder = new Map();
      byCustomer.set(customerId, byWorkOrder);
    }

    let group = byWorkOrder.get(job.workOrderId);
    if (!group) {
      group = {
        workOrderId: job.workOrderId,
        workOrderNumber: job.workOrder.number,
        customerId,
        customerName: job.workOrder.customer.name,
        jobs: [],
        doneCount: 0,
        openCount: 0,
      };
      byWorkOrder.set(job.workOrderId, group);
    }
    group.jobs.push(job);
  }

  const customers: CustomerJobGroup[] = [];
  for (const [customerId, byWorkOrder] of byCustomer) {
    const workOrders = [...byWorkOrder.values()];
    for (const group of workOrders) finalizeWorkOrderGroup(group);
    workOrders.sort((a, b) =>
      compareQueueGroups(
        { openCount: a.openCount, label: a.workOrderNumber, id: a.workOrderId },
        { openCount: b.openCount, label: b.workOrderNumber, id: b.workOrderId },
      ),
    );

    const doneCount = workOrders.reduce((sum, g) => sum + g.doneCount, 0);
    const deviceCount = workOrders.reduce((sum, g) => sum + g.jobs.length, 0);
    customers.push({
      customerId,
      customerName: customerNames.get(customerId) ?? "—",
      workOrders,
      spkCount: workOrders.length,
      deviceCount,
      doneCount,
      openCount: deviceCount - doneCount,
    });
  }

  customers.sort((a, b) =>
    compareQueueGroups(
      { openCount: a.openCount, label: a.customerName, id: a.customerId },
      { openCount: b.openCount, label: b.customerName, id: b.customerId },
    ),
  );
  return customers;
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
