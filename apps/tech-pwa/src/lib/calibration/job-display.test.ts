import { describe, expect, it } from "vitest";
import { filterUnits, groupJobsByCustomer, isJobDone } from "./job-display";
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
    technicianObservedBrand: null,
    technicianObservedModel: null,
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
      purchaseOrder: null,
      requestReviewCompletedAt: null,
    },
    device: null,
    calibrationRequestItem: null,
    akdAklApprovedBy: null,
    identityCorrections: [],
    referenceEquipmentApprovals: [],
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

describe("filterUnits", () => {
  function unit(
    id: string,
    unitOrdinal: number,
    status: TechCalibrationJob["status"],
    customerDeclaredDeviceName: string,
  ): TechCalibrationJob {
    return job({
      id,
      workOrderId: "wo",
      customerId: "c",
      customerName: "Cust",
      workOrderNumber: "SPK/1",
      unitOrdinal,
      status,
      customerDeclaredDeviceName,
    });
  }

  const units = [
    unit("u1", 1, "PENDING", "Bed Patient"),
    unit("u2", 2, "ACCEPTED_BY_QA", "Bed Patient"),
    unit("u3", 3, "IN_PROGRESS", "Infusion Pump"),
    unit("u4", 4, "ACCEPTED_BY_QA", "Ventilator"),
  ];

  it("defaults to ALL and returns every unit when status is ALL", () => {
    const result = filterUnits(units, { search: "", status: "ALL" });
    expect(result.map((j) => j.id)).toEqual(["u1", "u2", "u3", "u4"]);
  });

  it("Selesai (DONE) returns only isJobDone === true units", () => {
    const result = filterUnits(units, { search: "", status: "DONE" });
    expect(result.map((j) => j.id)).toEqual(["u2", "u4"]);
    expect(result.every(isJobDone)).toBe(true);
  });

  it("Belum selesai (OPEN) returns only isJobDone === false units", () => {
    const result = filterUnits(units, { search: "", status: "OPEN" });
    expect(result.map((j) => j.id)).toEqual(["u1", "u3"]);
    expect(result.every((j) => !isJobDone(j))).toBe(true);
  });

  it("empty search does not filter by name", () => {
    const result = filterUnits(units, { search: "   ", status: "ALL" });
    expect(result).toHaveLength(4);
  });

  it("search matches customerDeclaredDeviceName", () => {
    const result = filterUnits(units, { search: "pump", status: "ALL" });
    expect(result.map((j) => j.id)).toEqual(["u3"]);
  });

  it("search is case-insensitive", () => {
    const result = filterUnits(units, { search: "BED patient", status: "ALL" });
    expect(result.map((j) => j.id)).toEqual(["u1", "u2"]);
  });

  it("combines search and status with AND semantics", () => {
    const result = filterUnits(units, { search: "bed", status: "DONE" });
    expect(result.map((j) => j.id)).toEqual(["u2"]);
  });

  it("preserves unitOrdinal ascending order in the filtered output", () => {
    const reordered = [units[3]!, units[0]!, units[2]!, units[1]!];
    const result = filterUnits(reordered, { search: "", status: "ALL" });
    expect(result.map((j) => j.id)).toEqual(["u4", "u1", "u3", "u2"]);
  });

  it("does not mutate the source array or job objects", () => {
    const source = [...units];
    const snapshot = source.map((j) => ({ ...j }));
    const result = filterUnits(source, { search: "bed", status: "OPEN" });
    expect(source).toEqual(snapshot);
    expect(source).toHaveLength(4);
    expect(result).not.toBe(source);
  });

  it("returns an empty array when nothing matches", () => {
    const result = filterUnits(units, { search: "nonexistent-device", status: "ALL" });
    expect(result).toEqual([]);
  });

  it("no filtering when search is empty and status is ALL, combined default", () => {
    const result = filterUnits(units, { search: "", status: "ALL" });
    expect(result).toHaveLength(units.length);
  });
});
