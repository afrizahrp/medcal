import { describe, expect, it } from "vitest";
import { groupJobsByCustomer, isJobDone } from "./job-display";
import type { TechCalibrationJob } from "./types";

function job(
  overrides: Partial<TechCalibrationJob> & {
    id: string;
    workOrderId: string;
    customerId: string;
    customerName: string;
    workOrderNumber: string;
    unitOrdinal?: number;
    status?: TechCalibrationJob["status"];
  },
): TechCalibrationJob {
  const {
    id,
    workOrderId,
    customerId,
    customerName,
    workOrderNumber,
    unitOrdinal = 1,
    status = "PENDING",
    ...rest
  } = overrides;
  return {
    id,
    workOrderId,
    deviceId: null,
    unitOrdinal,
    unitTotal: 1,
    customerDeclaredDeviceName: "Device",
    customerDeclaredAkdAkl: null,
    technicianObservedSerial: null,
    technicianObservedAkdAkl: null,
    akdAklApprovalStatus: "NOT_REQUIRED",
    akdAklApprovedAt: null,
    akdAklDecisionNote: null,
    status,
    startedAt: null,
    submittedAt: null,
    currentAttempt: 1,
    createdAt: "2026-09-01T00:00:00.000Z",
    actionSignals: {
      identityCorrectionPending: false,
      referenceEquipmentNeedsApproval: false,
      identityIncomplete: false,
    },
    workOrder: {
      id: workOrderId,
      number: workOrderNumber,
      customerId,
      customer: { id: customerId, name: customerName },
      serviceMode: "ON_SITE",
    },
    device: null,
    calibrationRequestItem: null,
    akdAklApprovedBy: null,
    identityCorrections: [],
    reviews: [],
    kontrolAlat: null,
    ...rest,
  };
}

describe("isJobDone", () => {
  it("treats only ACCEPTED_BY_QA as done — SUBMITTED is still open", () => {
    expect(isJobDone(job({ id: "1", workOrderId: "w", customerId: "c", customerName: "A", workOrderNumber: "SPK/1", status: "SUBMITTED" }))).toBe(false);
    expect(isJobDone(job({ id: "2", workOrderId: "w", customerId: "c", customerName: "A", workOrderNumber: "SPK/1", status: "ACCEPTED_BY_QA" }))).toBe(true);
    expect(isJobDone(job({ id: "3", workOrderId: "w", customerId: "c", customerName: "A", workOrderNumber: "SPK/1", status: "REWORK" }))).toBe(false);
  });
});

describe("groupJobsByCustomer", () => {
  it("groups Customer → SPK → units and sorts unfinished customers first", () => {
    const jobs = [
      job({
        id: "done-1",
        workOrderId: "wo-b",
        customerId: "cust-b",
        customerName: "Beta Clinic",
        workOrderNumber: "SPK/B",
        status: "ACCEPTED_BY_QA",
      }),
      job({
        id: "open-1",
        workOrderId: "wo-a2",
        customerId: "cust-a",
        customerName: "Alpha Hospital",
        workOrderNumber: "SPK/A2",
        unitOrdinal: 1,
        status: "PENDING",
      }),
      job({
        id: "open-2",
        workOrderId: "wo-a1",
        customerId: "cust-a",
        customerName: "Alpha Hospital",
        workOrderNumber: "SPK/A1",
        unitOrdinal: 2,
        status: "IN_PROGRESS",
      }),
      job({
        id: "open-3",
        workOrderId: "wo-a1",
        customerId: "cust-a",
        customerName: "Alpha Hospital",
        workOrderNumber: "SPK/A1",
        unitOrdinal: 1,
        status: "PENDING",
      }),
    ];

    const groups = groupJobsByCustomer(jobs);
    expect(groups.map((g) => g.customerId)).toEqual(["cust-a", "cust-b"]);
    expect(groups[0]!.spkCount).toBe(2);
    expect(groups[0]!.deviceCount).toBe(3);
    expect(groups[0]!.openCount).toBe(3);
    expect(groups[0]!.doneCount).toBe(0);
    expect(groups[0]!.workOrders.map((w) => w.workOrderNumber)).toEqual(["SPK/A1", "SPK/A2"]);
    expect(groups[0]!.workOrders[0]!.jobs.map((j) => j.unitOrdinal)).toEqual([1, 2]);
    expect(groups[1]!.openCount).toBe(0);
  });

  it("does not merge distinct CalibrationJobs with the same declared name", () => {
    const jobs = [
      job({
        id: "u1",
        workOrderId: "wo",
        customerId: "c",
        customerName: "Cust",
        workOrderNumber: "SPK/1",
        unitOrdinal: 1,
        unitTotal: 2,
      }),
      job({
        id: "u2",
        workOrderId: "wo",
        customerId: "c",
        customerName: "Cust",
        workOrderNumber: "SPK/1",
        unitOrdinal: 2,
        unitTotal: 2,
      }),
    ];
    const groups = groupJobsByCustomer(jobs);
    expect(groups[0]!.workOrders[0]!.jobs).toHaveLength(2);
    expect(groups[0]!.workOrders[0]!.jobs.map((j) => j.id)).toEqual(["u1", "u2"]);
  });
});
