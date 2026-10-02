import { describe, expect, it } from "vitest";
import { CalibrationJobStatus, WorkOrderStatus } from "@medcal/db";
import {
  JOB_STATUSES_BY_CUSTOMER_STATUS,
  WORK_ORDER_STATUSES_BY_CUSTOMER_STATUS,
  computeCustomerProgress,
  customerJobStatus,
  customerWorkOrderStatus,
  progressBucket,
  progressPercentage,
  toCertificateView,
  toUnitIdentity,
  summarizeGroupCounts,
  unitGroupKey,
} from "./customer-progress";

describe("customerJobStatus", () => {
  it("maps the internal lifecycle onto the three customer-facing states", () => {
    expect(customerJobStatus("PENDING")).toBe("NOT_STARTED");
    expect(customerJobStatus("IN_PROGRESS")).toBe("IN_PROGRESS");
    expect(customerJobStatus("SUBMITTED")).toBe("IN_PROGRESS");
    expect(customerJobStatus("REWORK")).toBe("IN_PROGRESS");
    expect(customerJobStatus("ACCEPTED_BY_QA")).toBe("COMPLETED");
  });
});

describe("customerWorkOrderStatus", () => {
  it("keeps a cancelled work order visible as cancelled and collapses pre-start states", () => {
    expect(customerWorkOrderStatus("PLANNED")).toBe("NOT_STARTED");
    expect(customerWorkOrderStatus("ASSIGNED")).toBe("NOT_STARTED");
    expect(customerWorkOrderStatus("IN_PROGRESS")).toBe("IN_PROGRESS");
    expect(customerWorkOrderStatus("DONE")).toBe("COMPLETED");
    expect(customerWorkOrderStatus("TECHNICALLY_DONE")).toBe("COMPLETED");
    expect(customerWorkOrderStatus("CLOSED")).toBe("COMPLETED");
    expect(customerWorkOrderStatus("CANCELLED")).toBe("CANCELLED");
  });
});

describe("computeCustomerProgress", () => {
  it("uses the work-order item quantity when no calibration jobs have been fanned out", () => {
    expect(computeCustomerProgress({ itemQtyTotal: 3, statusCounts: {} })).toEqual({
      total: 3,
      completed: 0,
      inProgress: 0,
      notStarted: 3,
      percentage: 0,
    });
  });

  it("counts jobs, not certificates, once fan-out has happened", () => {
    const progress = computeCustomerProgress({
      itemQtyTotal: 99,
      statusCounts: { PENDING: 1, IN_PROGRESS: 1, SUBMITTED: 1, REWORK: 1, ACCEPTED_BY_QA: 2 },
    });
    expect(progress).toEqual({
      total: 6,
      completed: 2,
      inProgress: 3,
      notStarted: 1,
      percentage: 33,
    });
  });

  it("rounds the percentage and stays at 0 when there is nothing to divide by", () => {
    expect(progressPercentage(64, 100)).toBe(64);
    expect(progressPercentage(1, 3)).toBe(33);
    expect(progressPercentage(2, 3)).toBe(67);
    expect(progressPercentage(0, 0)).toBe(0);
    expect(progressPercentage(1, 0)).toBe(0);
    expect(progressPercentage(1, Number.NaN)).toBe(0);
    expect(computeCustomerProgress({ itemQtyTotal: 0, statusCounts: {} })).toEqual({
      total: 0,
      completed: 0,
      inProgress: 0,
      notStarted: 0,
      percentage: 0,
    });
    expect(computeCustomerProgress({ itemQtyTotal: -4, statusCounts: {} }).percentage).toBe(0);
    expect(computeCustomerProgress({ itemQtyTotal: Number.NaN, statusCounts: {} }).total).toBe(0);
  });
});

describe("toCertificateView", () => {
  const issuedAt = new Date("2026-09-01T00:00:00.000Z");

  it("treats a missing, draft, revoked or superseded row as unavailable and hides its number", () => {
    expect(toCertificateView(null)).toEqual({
      availability: "UNAVAILABLE",
      number: null,
      issuedAt: null,
    });
    for (const status of ["DRAFT", "REVOKED", "SUPERSEDED"]) {
      expect(
        toCertificateView({ status, number: "SHOULD-NOT-LEAK", issuedAt, pdfFileObjectId: "file" }),
      ).toEqual({ availability: "UNAVAILABLE", number: null, issuedAt: null });
    }
  });

  it("distinguishes an issued certificate with a PDF from one without", () => {
    expect(
      toCertificateView({ status: "ISSUED", number: "CRT/2026/09/00001", issuedAt, pdfFileObjectId: "file" }),
    ).toEqual({ availability: "AVAILABLE", number: "CRT/2026/09/00001", issuedAt });
    expect(
      toCertificateView({ status: "ISSUED", number: "CRT/2026/09/00002", issuedAt, pdfFileObjectId: null }),
    ).toEqual({ availability: "ISSUED_WITHOUT_PDF", number: "CRT/2026/09/00002", issuedAt });
  });
});

describe("customer filter status maps", () => {
  it("are the exact inverse of the forward mapping and cover every internal status once", () => {
    const jobStatuses = Object.values(CalibrationJobStatus);
    const mappedJobs = Object.entries(JOB_STATUSES_BY_CUSTOMER_STATUS).flatMap(([customer, internal]) => {
      for (const status of internal) expect(customerJobStatus(status)).toBe(customer);
      return internal;
    });
    expect([...mappedJobs].sort()).toEqual([...jobStatuses].sort());

    const workOrderStatuses = Object.values(WorkOrderStatus);
    const mappedWorkOrders = Object.entries(WORK_ORDER_STATUSES_BY_CUSTOMER_STATUS).flatMap(
      ([customer, internal]) => {
        for (const status of internal) expect(customerWorkOrderStatus(status)).toBe(customer);
        return internal;
      },
    );
    expect([...mappedWorkOrders].sort()).toEqual([...workOrderStatuses].sort());
  });
});

describe("progressBucket", () => {
  it("separates none, some and all completed, and treats an empty work order as none", () => {
    expect(progressBucket(0, 10)).toBe("NONE_COMPLETED");
    expect(progressBucket(1, 10)).toBe("PARTIALLY_COMPLETED");
    expect(progressBucket(9, 10)).toBe("PARTIALLY_COMPLETED");
    expect(progressBucket(10, 10)).toBe("ALL_COMPLETED");
    expect(progressBucket(0, 0)).toBe("NONE_COMPLETED");
    expect(progressBucket(3, 0)).toBe("NONE_COMPLETED");
  });
});

describe("toUnitIdentity", () => {
  const device = { brand: "Master Brand", model: "M-1", serialNumber: "SN-MASTER", deviceType: { name: "Syringe Pump" } };
  const empty = {
    customerDeclaredDeviceName: null,
    technicianObservedBrand: null,
    technicianObservedModel: null,
    technicianObservedSerial: null,
  };

  it("prefers the customer's wording and the on-site reading, then falls back to the device master", () => {
    expect(
      toUnitIdentity({
        customerDeclaredDeviceName: " Pompa Infus Ruang 3 ",
        technicianObservedBrand: "Observed",
        technicianObservedModel: null,
        technicianObservedSerial: "SN-OBSERVED",
        device,
      }),
    ).toEqual({ name: "Pompa Infus Ruang 3", brand: "Observed", model: "M-1", serialNumber: "SN-OBSERVED" });
    expect(toUnitIdentity({ ...empty, device })).toEqual({
      name: "Syringe Pump",
      brand: "Master Brand",
      model: "M-1",
      serialNumber: "SN-MASTER",
    });
  });

  it("returns nulls, never empty strings, when nothing is known, and never an id or device code", () => {
    expect(toUnitIdentity({ ...empty, customerDeclaredDeviceName: "  ", device: null })).toEqual({
      name: null,
      brand: null,
      model: null,
      serialNumber: null,
    });
    expect(Object.keys(toUnitIdentity({ ...empty, device })).sort()).toEqual(["brand", "model", "name", "serialNumber"]);
  });
});

describe("unitGroupKey", () => {
  it("is stable, opaque, and separates order lines and work orders", () => {
    const key = unitGroupKey("wo-1", "cmitemabc123def456");
    expect(unitGroupKey("wo-1", "cmitemabc123def456")).toBe(key);
    expect(key).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(key).not.toContain("cmitemabc123def456");
    expect(key).not.toContain("wo-1");
    expect(unitGroupKey("wo-1", "cmitemxyz")).not.toBe(key);
    expect(unitGroupKey("wo-2", "cmitemabc123def456")).not.toBe(key);
  });

  it("gives units without an order line a group of their own", () => {
    expect(unitGroupKey("wo-1", null)).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(unitGroupKey("wo-1", null)).not.toBe(unitGroupKey("wo-1", "none"));
    expect(unitGroupKey("wo-1", null)).not.toBe(unitGroupKey("wo-2", null));
  });
});

describe("summarizeGroupCounts", () => {
  it("collapses internal statuses into the customer-facing counts of a group", () => {
    expect(
      summarizeGroupCounts({ PENDING: 17, IN_PROGRESS: 20, SUBMITTED: 10, REWORK: 5, ACCEPTED_BY_QA: 42 }),
    ).toEqual({ total: 94, completed: 42, inProgress: 35, notStarted: 17 });
    expect(summarizeGroupCounts({})).toEqual({ total: 0, completed: 0, inProgress: 0, notStarted: 0 });
  });
});
