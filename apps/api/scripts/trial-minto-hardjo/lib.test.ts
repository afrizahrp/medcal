import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { Prisma, prisma } from "@medcal/db";
import type { FilesService } from "../../src/modules/files/files.service";
import { CalibrationRequestsService } from "../../src/modules/calibration-requests/calibration-requests.service";
import { QuotationsService } from "../../src/modules/quotations/quotations.service";
import { PurchaseOrdersService } from "../../src/modules/purchase-orders/purchase-orders.service";
import { WorkOrdersService } from "../../src/modules/work-orders/work-orders.service";
import { CalibrationJobsService } from "../../src/modules/calibration-jobs/calibration-jobs.service";
import { MeasurementResultsService } from "../../src/modules/calibration-jobs/measurement-results.service";
import { DevicesService } from "../../src/modules/devices/devices.service";
import {
  completeKontrolAlatForStart,
  ensureNonPpnTax,
  ensurePriceListItems,
  ensureTrialUsers,
  fillJobMeasurements,
  planIdentityCorrections,
  planJobStates,
  type JobPlanInput,
} from "./lib";

// Only the Better Auth session boundary would need mocking for HTTP-layer
// calls — this suite calls services directly in-process (same pattern as
// calibration-jobs.service.test.ts), so no auth mock is required.
vi.mock("@medcal/auth", async () => {
  const actual = await vi.importActual<typeof import("@medcal/auth")>("@medcal/auth");
  return actual;
});

const realCompanyId = "PKM";

function makeJobs(overrides: Partial<JobPlanInput>[] = []): JobPlanInput[] {
  const base: JobPlanInput[] = Array.from({ length: 100 }, (_, i) => ({
    id: `job-${i + 1}`,
    unitOrdinal: (i % 10) + 1,
    unitTotal: 10,
    deviceTypeCode: `DT_${i % 20}`,
    tier: "SYNTHETIC" as const,
  }));
  for (const [i, o] of overrides.entries()) Object.assign(base[i]!, o);
  return base;
}

describe("planJobStates (deterministic state-distribution planner)", () => {
  it("forces every Ambulatory ECG job to PENDING regardless of distribution math", () => {
    const jobs = makeJobs([
      { id: "holter-1", deviceTypeCode: "AMBULATORY_ECG" },
      { id: "holter-2", deviceTypeCode: "AMBULATORY_ECG" },
    ]);
    const plan = planJobStates(jobs);
    expect(plan.get("holter-1")).toBe("PENDING");
    expect(plan.get("holter-2")).toBe("PENDING");
  });

  it("produces an approximately 60/15/10/4/11% split over the eligible jobs", () => {
    const jobs = makeJobs();
    const plan = planJobStates(jobs);
    const counts: Record<string, number> = {};
    for (const status of plan.values()) counts[status] = (counts[status] ?? 0) + 1;

    expect(counts.PENDING ?? 0).toBeGreaterThan(50);
    expect(counts.IN_PROGRESS ?? 0).toBeCloseTo(15, -1);
    expect(counts.SUBMITTED ?? 0).toBeCloseTo(10, -1);
    expect(counts.REWORK ?? 0).toBeCloseTo(4, -1);
    expect(counts.ACCEPTED_BY_QA ?? 0).toBeCloseTo(11, -1);
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    expect(total).toBe(jobs.length);
  });

  it("is deterministic: the same job list always yields the same plan (reproducible reseed)", () => {
    const jobs = makeJobs();
    const planA = planJobStates(jobs);
    const planB = planJobStates(jobs);
    expect([...planA.entries()]).toEqual([...planB.entries()]);
  });
});

describe("planIdentityCorrections", () => {
  it("only assigns PENDING_REVIEW to jobs whose own target status is IN_PROGRESS", () => {
    const jobs = makeJobs();
    const statusPlan = planJobStates(jobs);
    const entries = planIdentityCorrections(jobs, statusPlan);

    for (const entry of entries) {
      if (entry.finalStatus === "PENDING_REVIEW") {
        expect(statusPlan.get(entry.jobId)).toBe("IN_PROGRESS");
      } else {
        expect(["SUBMITTED", "REWORK", "ACCEPTED_BY_QA"]).toContain(statusPlan.get(entry.jobId));
      }
    }
  });

  it("spreads picks across at least 5 distinct device types", () => {
    const jobs = makeJobs();
    const statusPlan = planJobStates(jobs);
    const entries = planIdentityCorrections(jobs, statusPlan);
    const byId = new Map(jobs.map((j) => [j.id, j]));
    const types = new Set(entries.map((e) => byId.get(e.jobId)!.deviceTypeCode));
    expect(types.size).toBeGreaterThanOrEqual(5);
  });

  it("never picks the same job twice", () => {
    const jobs = makeJobs();
    const statusPlan = planJobStates(jobs);
    const entries = planIdentityCorrections(jobs, statusPlan);
    const ids = entries.map((e) => e.jobId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("fillJobMeasurements + completeKontrolAlatForStart (small real-service integration)", () => {
  it("fills every eligible Pattern-A parameter and lets the real submitForReview gate pass", async () => {
    const calibrationRequestsService = new CalibrationRequestsService();
    const quotationsService = new QuotationsService();
    const purchaseOrdersService = new PurchaseOrdersService();
    const workOrdersService = new WorkOrdersService();
    const devicesService = new DevicesService();
    const calibrationJobsService = new CalibrationJobsService(undefined as unknown as FilesService, devicesService);
    const measurementResultsService = new MeasurementResultsService();

    const staffUser = await prisma.user.upsert({
      where: { id: "lib-test-staff" },
      create: { id: "lib-test-staff", email: "lib-test-staff@medcal.test", name: "Lib Test Staff", status: "ACTIVE" },
      update: {},
    });
    const technician = await prisma.user.create({
      data: { email: `lib-test-tech-${randomUUID().slice(0, 8)}@medcal.test`, name: "Lib Test Tech", status: "ACTIVE" },
    });
    await prisma.userMembership.create({
      data: { userId: technician.id, companyId: realCompanyId, role: "TECHNICIAN", isDefault: false },
    });

    const category = await prisma.deviceCategory.create({
      data: { code: `LIBTEST-CAT-${randomUUID().slice(0, 8).toUpperCase()}`, name: "Lib Test Category" },
    });
    const deviceType = await prisma.deviceType.create({
      data: { code: `LIBTEST-DT-${randomUUID().slice(0, 8).toUpperCase()}`, name: "Lib Test Device Type", categoryId: category.id },
    });
    const capability = await prisma.deviceCapability.create({
      data: { code: `LIBTEST-CAP-${randomUUID().slice(0, 8).toUpperCase()}`, name: "Lib Test Capability" },
    });
    const capabilityItem = await prisma.deviceCapabilityItem.create({
      data: { capabilityId: capability.id, name: "Lib Test Item" },
    });
    await prisma.deviceCalibrationParameter.create({
      data: {
        deviceTypeId: deviceType.id,
        capabilityItemId: capabilityItem.id,
        code: "LIBTEST_PARAM",
        name: "Lib Test Param",
        valueType: "NUMBER",
        toleranceMin: 0,
        toleranceMax: 100,
        decimalPlaces: 0,
      },
    });

    const customer = await prisma.customer.create({
      data: { companyId: realCompanyId, number: `CUS/LIBTEST/${randomUUID().slice(0, 8)}`, name: "Lib Test Customer" },
    });

    const taxCode = await ensureNonPpnTax(realCompanyId);
    await ensurePriceListItems(realCompanyId, [deviceType.id]);
    await ensureTrialUsers(realCompanyId);

    const request = await calibrationRequestsService.create(realCompanyId, staffUser.id, {
      customerId: customer.id,
      serviceMode: "SEND_TO_LAB",
      items: [{ deviceTypeId: deviceType.id, customerDeviceName: "Lib Test Device", qty: 1 }],
    } as never);
    await calibrationRequestsService.submit(realCompanyId, request.id);
    const quotation = await quotationsService.create(realCompanyId, { requestId: request.id, taxCode } as never);
    await quotationsService.send(realCompanyId, quotation.id);
    await quotationsService.approve(realCompanyId, quotation.id, staffUser.id);
    const po = await purchaseOrdersService.create(realCompanyId, {
      quotationId: quotation.id,
      customerPoNumber: `CPO-LIBTEST-${randomUUID().slice(0, 8)}`,
      customerPoDate: new Date(),
    } as never);
    await purchaseOrdersService.approve(realCompanyId, po.id, staffUser.id);
    const workOrder = await workOrdersService.create(realCompanyId, { purchaseOrderId: po.id } as never);
    await workOrdersService.assign(realCompanyId, workOrder.id, {
      technicians: [{ technicianUserId: technician.id }],
    } as never);
    await workOrdersService.start(realCompanyId, workOrder.id);

    const job = await prisma.calibrationJob.findFirstOrThrow({ where: { workOrderId: workOrder.id } });

    await completeKontrolAlatForStart(realCompanyId, job.id);
    await calibrationJobsService.start(realCompanyId, job.id);

    await fillJobMeasurements({
      companyId: realCompanyId,
      measurementResultsService,
      jobId: job.id,
      deviceTypeId: deviceType.id,
      technicianId: technician.id,
    });

    const results = await prisma.measurementResult.findMany({ where: { calibrationJobId: job.id } });
    expect(results).toHaveLength(1);
    expect(results[0]!.measuredValue?.toNumber()).toBe(50);

    const submitted = await calibrationJobsService.submitForReview(realCompanyId, job.id);
    expect(submitted.status).toBe("SUBMITTED");

    // ── cleanup ──
    await prisma.workOrder.deleteMany({ where: { id: workOrder.id } });
    await prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
    await prisma.purchaseOrder.deleteMany({ where: { id: po.id } });
    await prisma.quotationItem.deleteMany({ where: { quotationId: quotation.id } });
    await prisma.quotation.deleteMany({ where: { id: quotation.id } });
    await prisma.calibrationRequestItem.deleteMany({ where: { requestId: request.id } });
    await prisma.calibrationRequest.deleteMany({ where: { id: request.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
    await prisma.deviceCalibrationParameter.deleteMany({ where: { deviceTypeId: deviceType.id } });
    await prisma.priceListItem.deleteMany({ where: { deviceTypeId: deviceType.id } });
    await prisma.deviceType.delete({ where: { id: deviceType.id } });
    await prisma.deviceCapabilityItem.deleteMany({ where: { capabilityId: capability.id } });
    await prisma.deviceCapability.delete({ where: { id: capability.id } });
    await prisma.deviceCategory.delete({ where: { id: category.id } });
    await prisma.userMembership.deleteMany({ where: { userId: technician.id, companyId: realCompanyId } });
    await prisma.user.delete({ where: { id: technician.id } });
  });
});
