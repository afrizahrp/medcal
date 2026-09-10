import { randomUUID } from "node:crypto";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma, prisma } from "@medcal/db";
import type { MembershipRole } from "@medcal/db";
import { hasPermission } from "@medcal/auth";
import { CalibrationRequestsService } from "../calibration-requests/calibration-requests.service";
import { QuotationsService } from "../quotations/quotations.service";
import { PurchaseOrdersService } from "../purchase-orders/purchase-orders.service";
import { WorkOrdersService } from "../work-orders/work-orders.service";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { CalibrationJobsController } from "./calibration-jobs.controller";
import { CalibrationJobsService } from "./calibration-jobs.service";
import { MeasurementResultsService } from "./measurement-results.service";
import {
  assertPhysicalCheckRowEditable,
  PhysicalCheckResultsService,
} from "./physical-check-results.service";

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));
vi.mock("@medcal/auth", async () => {
  const actual = await vi.importActual<typeof import("@medcal/auth")>("@medcal/auth");
  return { ...actual, auth: { api: { getSession: getSessionMock } } };
});

const svc = new PhysicalCheckResultsService();
const jobsService = new CalibrationJobsService();
const controller = new CalibrationJobsController(
  jobsService,
  new MeasurementResultsService(),
  new PhysicalCheckResultsService(),
);
const calibrationRequestsService = new CalibrationRequestsService();
const quotationsService = new QuotationsService();
const purchaseOrdersService = new PurchaseOrdersService();
const workOrdersService = new WorkOrdersService();

const companyId = "PKM";
const staffUserId = "pc-staff-user";

const createdWorkOrderIds: string[] = [];
const createdQuotationIds: string[] = [];
const createdCalibrationRequestIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdDeviceTypeIds: string[] = [];
const createdDeviceCategoryIds: string[] = [];
const createdUserIds: string[] = [];
const createdMembershipKeys: Array<{ userId: string; companyId: string }> = [];

async function ensureNonPpnTax() {
  const existing = await prisma.tax.findUnique({
    where: { companyId_taxCode: { companyId, taxCode: "T0" } },
  });
  if (existing) return;
  await prisma.tax.create({
    data: { companyId, taxCode: "T0", taxRate: 0, isExclude: false, description: "Non PPN" },
  });
}

async function makeMember(role: MembershipRole) {
  const user = await prisma.user.create({
    data: { email: `pc-${randomUUID().slice(0, 10)}@x.co`, name: `PC ${role}`, status: "ACTIVE" },
  });
  createdUserIds.push(user.id);
  await prisma.userMembership.create({ data: { userId: user.id, companyId, role, isDefault: false } });
  createdMembershipKeys.push({ userId: user.id, companyId });
  return user;
}

async function startedJob() {
  await ensureNonPpnTax();
  const category = await prisma.deviceCategory.create({
    data: { code: `PCCAT${randomUUID().slice(0, 8)}`, name: "PC Cat" },
  });
  createdDeviceCategoryIds.push(category.id);
  const deviceType = await prisma.deviceType.create({
    data: { categoryId: category.id, code: `PCDT${randomUUID().slice(0, 8)}`, name: "PC Device" },
  });
  createdDeviceTypeIds.push(deviceType.id);

  const customer = await prisma.customer.create({
    data: { companyId, number: `CUS/PC/${randomUUID().slice(0, 8)}`, name: `PC Cust ${randomUUID().slice(0, 6)}` },
  });
  createdCustomerIds.push(customer.id);

  const request = await calibrationRequestsService.create(companyId, {
    customerId: customer.id,
    serviceMode: "SEND_TO_LAB",
    items: [{ deviceTypeId: deviceType.id, deviceId: "DEV-1" }],
  });
  createdCalibrationRequestIds.push(request.id);
  await calibrationRequestsService.submit(companyId, request.id);
  await prisma.priceListItem.create({
    data: {
      companyId,
      deviceTypeId: deviceType.id,
      unitPrice: new Prisma.Decimal(100_000),
      effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
    },
  });
  const quotation = await quotationsService.create(companyId, { requestId: request.id, taxCode: "T0" });
  createdQuotationIds.push(quotation.id);
  await quotationsService.send(companyId, quotation.id);
  await quotationsService.approve(companyId, quotation.id, staffUserId);
  const po = await purchaseOrdersService.create(companyId, {
    quotationId: quotation.id,
    customerPoNumber: `CPO-${randomUUID().slice(0, 8).toUpperCase()}`,
    customerPoDate: new Date("2026-08-15T00:00:00.000Z"),
  });
  await purchaseOrdersService.approve(companyId, po.id, staffUserId);
  const workOrder = await workOrdersService.create(companyId, { purchaseOrderId: po.id });
  createdWorkOrderIds.push(workOrder.id);

  const technician = await makeMember("TECHNICIAN");
  await workOrdersService.assign(companyId, workOrder.id, {
    technicians: [{ technicianUserId: technician.id }],
  });
  await workOrdersService.start(companyId, workOrder.id);

  const job = await prisma.calibrationJob.findFirstOrThrow({ where: { workOrderId: workOrder.id } });
  await prisma.calibrationJob.update({
    where: { id: job.id },
    data: { status: "IN_PROGRESS", startedAt: new Date() },
  });

  return { jobId: job.id, deviceTypeId: deviceType.id, technician };
}

async function makeItem(
  deviceTypeId: string,
  data: Partial<Prisma.DevicePhysicalCheckItemUncheckedCreateInput> = {},
) {
  return prisma.devicePhysicalCheckItem.create({
    data: {
      deviceTypeId,
      code: `PC${randomUUID().slice(0, 8).toUpperCase()}`,
      name: "Body",
      inspectionLimit: "Periksa kabel, tidak ada isolasi terkelupas",
      sortOrder: 10,
      isActive: true,
      ...data,
    },
  });
}

afterAll(async () => {
  await prisma.physicalCheckResult.deleteMany({
    where: { calibrationJob: { workOrderId: { in: createdWorkOrderIds } } },
  });
  if (createdWorkOrderIds.length > 0) {
    await prisma.workOrder.deleteMany({ where: { id: { in: createdWorkOrderIds } } });
  }
  if (createdQuotationIds.length > 0) {
    await prisma.purchaseOrder.deleteMany({ where: { quotationId: { in: createdQuotationIds } } });
    await prisma.quotationItem.deleteMany({ where: { quotationId: { in: createdQuotationIds } } });
    await prisma.quotation.deleteMany({ where: { id: { in: createdQuotationIds } } });
  }
  if (createdCalibrationRequestIds.length > 0) {
    await prisma.calibrationRequestItem.deleteMany({
      where: { requestId: { in: createdCalibrationRequestIds } },
    });
    await prisma.calibrationRequest.deleteMany({ where: { id: { in: createdCalibrationRequestIds } } });
  }
  if (createdDeviceTypeIds.length > 0) {
    await prisma.devicePhysicalCheckItem.deleteMany({ where: { deviceTypeId: { in: createdDeviceTypeIds } } });
    await prisma.deviceCalibrationParameter.deleteMany({ where: { deviceTypeId: { in: createdDeviceTypeIds } } });
    await prisma.device.deleteMany({ where: { deviceTypeId: { in: createdDeviceTypeIds } } });
    await prisma.priceListItem.deleteMany({ where: { deviceTypeId: { in: createdDeviceTypeIds } } });
    await prisma.deviceType.deleteMany({ where: { id: { in: createdDeviceTypeIds } } });
  }
  if (createdDeviceCategoryIds.length > 0) {
    await prisma.deviceCategory.deleteMany({ where: { id: { in: createdDeviceCategoryIds } } });
  }
  for (const key of createdMembershipKeys) {
    await prisma.userMembership.deleteMany({ where: key }).catch(() => undefined);
  }
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  for (const id of createdCustomerIds) {
    await prisma.customer.delete({ where: { id } }).catch(() => undefined);
  }
  await prisma.documentNumberSequence.deleteMany({
    where: {
      companyId,
      documentType: { in: ["WORK_ORDER", "WORK_ORDER_SEND_TO_LAB", "PURCHASE_ORDER", "QUOTATION", "CALIBRATION_REQUEST"] },
    },
  });
});

beforeAll(() => {
  process.env.COMPANY_ID = companyId;
});

describe("assertPhysicalCheckRowEditable", () => {
  const base = { status: "IN_PROGRESS", currentAttempt: 2, submittedAt: null as Date | null };

  it("rejects a write on a superseded attempt", () => {
    expect(() => assertPhysicalCheckRowEditable(base, { attemptNumber: 1 })).toThrow(
      /superseded attempt/,
    );
  });

  it("rejects SUBMITTED and ACCEPTED_BY_QA", () => {
    expect(() =>
      assertPhysicalCheckRowEditable({ ...base, status: "SUBMITTED" }, { attemptNumber: 2 }),
    ).toThrow(/locked once the job attempt has been submitted/);
    expect(() =>
      assertPhysicalCheckRowEditable({ ...base, status: "ACCEPTED_BY_QA" }, { attemptNumber: 2 }),
    ).toThrow();
  });

  it("rejects when submittedAt is set even if status is not locked", () => {
    expect(() =>
      assertPhysicalCheckRowEditable(
        { status: "IN_PROGRESS", currentAttempt: 1, submittedAt: new Date() },
        { attemptNumber: 1 },
      ),
    ).toThrow();
  });

  it("allows a write on the current attempt of an IN_PROGRESS job", () => {
    expect(() => assertPhysicalCheckRowEditable(base, { attemptNumber: 2 })).not.toThrow();
  });

  it("rejects REWORK even if submittedAt is null", () => {
    expect(() =>
      assertPhysicalCheckRowEditable(
        { status: "REWORK", currentAttempt: 2, submittedAt: null },
        { attemptNumber: 2 },
      ),
    ).toThrow(/only while the job is in progress/);
  });

  it("rejects PENDING even if submittedAt is null", () => {
    expect(() =>
      assertPhysicalCheckRowEditable(
        { status: "PENDING", currentAttempt: 1, submittedAt: null },
        { attemptNumber: 1 },
      ),
    ).toThrow(/only while the job is in progress/);
  });
});

describe("PhysicalCheckResultsService — catalog", () => {
  it("returns only active items for the job DeviceType, in sortOrder", async () => {
    const ctx = await startedJob();
    await makeItem(ctx.deviceTypeId, { name: "Fuse", code: "FUSE", sortOrder: 30 });
    await makeItem(ctx.deviceTypeId, { name: "Body", code: "BODY", sortOrder: 10 });
    await makeItem(ctx.deviceTypeId, {
      name: "Inactive",
      code: "OFF",
      sortOrder: 5,
      isActive: false,
    });
    const otherType = await prisma.deviceType.create({
      data: {
        categoryId: (await prisma.deviceType.findUniqueOrThrow({ where: { id: ctx.deviceTypeId } }))
          .categoryId,
        code: `PCOTHER${randomUUID().slice(0, 6)}`,
        name: "Other",
      },
    });
    createdDeviceTypeIds.push(otherType.id);
    await makeItem(otherType.id, { name: "Other Body", code: "OTHER_BODY", sortOrder: 1 });

    const items = await svc.listItems(companyId, ctx.jobId);
    expect(items.map((i) => i.code)).toEqual(["BODY", "FUSE"]);
    expect(items.every((i) => i.isActive)).toBe(true);
  });

  it("returns [] when the DeviceType has zero physical inspection items", async () => {
    const ctx = await startedJob();
    const items = await svc.listItems(companyId, ctx.jobId);
    expect(items).toEqual([]);
  });

  it("returns [] when the job DeviceType cannot be resolved", async () => {
    const ctx = await startedJob();
    await makeItem(ctx.deviceTypeId, { name: "Body", code: "BODY" });
    await prisma.calibrationJob.update({
      where: { id: ctx.jobId },
      data: { calibrationRequestItemId: null, purchaseOrderItemId: null },
    });
    expect(await svc.listItems(companyId, ctx.jobId)).toEqual([]);
  });
});

describe("PhysicalCheckResultsService — create", () => {
  it("technician can create in IN_PROGRESS with BAIK, optional note omitted, server stamps", async () => {
    const ctx = await startedJob();
    const item = await makeItem(ctx.deviceTypeId, {
      inspectionLimit: "Periksa kabel, tidak ada isolasi terkelupas",
    });

    const row = await svc.create(
      companyId,
      { calibrationJobId: ctx.jobId, devicePhysicalCheckItemId: item.id, verdict: "BAIK" },
      ctx.technician.id,
    );

    expect(row.verdict).toBe("BAIK");
    expect(row.note).toBeNull();
    expect(row.inspectionLimitSnapshot).toBe("Periksa kabel, tidak ada isolasi terkelupas");
    expect(row.attemptNumber).toBe(1);
    expect(row.companyId).toBe(companyId);
    expect(row.recordedByUserId).toBe(ctx.technician.id);
    expect(row.recordedAt).toBeInstanceOf(Date);
    expect(row.devicePhysicalCheckItem.code).toBe(item.code);
  });

  it("stores TIDAK_BAIK and an optional note", async () => {
    const ctx = await startedJob();
    const item = await makeItem(ctx.deviceTypeId);
    const row = await svc.create(
      companyId,
      {
        calibrationJobId: ctx.jobId,
        devicePhysicalCheckItemId: item.id,
        verdict: "TIDAK_BAIK",
        note: "Isolasi terkelupas",
      },
      ctx.technician.id,
    );
    expect(row.verdict).toBe("TIDAK_BAIK");
    expect(row.note).toBe("Isolasi terkelupas");
  });

  it("rejects when the job has not started", async () => {
    const ctx = await startedJob();
    await prisma.calibrationJob.update({
      where: { id: ctx.jobId },
      data: { status: "PENDING", startedAt: null },
    });
    const item = await makeItem(ctx.deviceTypeId);
    await expect(
      svc.create(
        companyId,
        { calibrationJobId: ctx.jobId, devicePhysicalCheckItemId: item.id, verdict: "BAIK" },
        ctx.technician.id,
      ),
    ).rejects.toMatchObject({ response: { code: "CALIBRATION_JOB_NOT_STARTED" } });
  });
});

describe("PhysicalCheckResultsService — validation", () => {
  it("rejects an item belonging to another DeviceType", async () => {
    const ctx = await startedJob();
    const otherType = await prisma.deviceType.create({
      data: {
        categoryId: (await prisma.deviceType.findUniqueOrThrow({ where: { id: ctx.deviceTypeId } }))
          .categoryId,
        code: `PCX${randomUUID().slice(0, 8)}`,
        name: "Other Type",
      },
    });
    createdDeviceTypeIds.push(otherType.id);
    const foreign = await makeItem(otherType.id, { name: "Foreign", code: "FOREIGN" });

    await expect(
      svc.create(
        companyId,
        { calibrationJobId: ctx.jobId, devicePhysicalCheckItemId: foreign.id, verdict: "BAIK" },
        ctx.technician.id,
      ),
    ).rejects.toMatchObject({ response: { code: "PHYSICAL_CHECK_DEVICE_TYPE_MISMATCH" } });
  });

  it("rejects an inactive item for NEW writes", async () => {
    const ctx = await startedJob();
    const item = await makeItem(ctx.deviceTypeId, { isActive: false, code: "DEAD" });
    await expect(
      svc.create(
        companyId,
        { calibrationJobId: ctx.jobId, devicePhysicalCheckItemId: item.id, verdict: "BAIK" },
        ctx.technician.id,
      ),
    ).rejects.toMatchObject({ response: { code: "PHYSICAL_CHECK_ITEM_INACTIVE" } });
  });

  it("rejects when the job DeviceType cannot be resolved", async () => {
    const ctx = await startedJob();
    const item = await makeItem(ctx.deviceTypeId);
    await prisma.calibrationJob.update({
      where: { id: ctx.jobId },
      data: { calibrationRequestItemId: null, purchaseOrderItemId: null },
    });
    await expect(
      svc.create(
        companyId,
        { calibrationJobId: ctx.jobId, devicePhysicalCheckItemId: item.id, verdict: "BAIK" },
        ctx.technician.id,
      ),
    ).rejects.toMatchObject({ response: { code: "PHYSICAL_CHECK_DEVICE_TYPE_UNRESOLVED" } });
  });

  it("duplicate natural key → PHYSICAL_CHECK_DUPLICATE_ENTRY", async () => {
    const ctx = await startedJob();
    const item = await makeItem(ctx.deviceTypeId);
    const make = () =>
      svc.create(
        companyId,
        { calibrationJobId: ctx.jobId, devicePhysicalCheckItemId: item.id, verdict: "BAIK" },
        ctx.technician.id,
      );
    await make();
    await expect(make()).rejects.toMatchObject({ response: { code: "PHYSICAL_CHECK_DUPLICATE_ENTRY" } });
  });
});

describe("PhysicalCheckResultsService — lifecycle", () => {
  async function createOn(ctx: Awaited<ReturnType<typeof startedJob>>, status: string) {
    const item = await makeItem(ctx.deviceTypeId);
    await prisma.calibrationJob.update({
      where: { id: ctx.jobId },
      data: {
        status: status as "PENDING" | "IN_PROGRESS" | "SUBMITTED" | "REWORK" | "ACCEPTED_BY_QA",
        submittedAt: status === "SUBMITTED" || status === "ACCEPTED_BY_QA" ? new Date() : null,
        startedAt: status === "PENDING" ? null : new Date(),
      },
    });
    return svc.create(
      companyId,
      { calibrationJobId: ctx.jobId, devicePhysicalCheckItemId: item.id, verdict: "BAIK" },
      ctx.technician.id,
    );
  }

  it("PENDING rejected", async () => {
    const ctx = await startedJob();
    await expect(createOn(ctx, "PENDING")).rejects.toMatchObject({
      response: { code: "CALIBRATION_JOB_NOT_STARTED" },
    });
  });

  it("IN_PROGRESS allowed", async () => {
    const ctx = await startedJob();
    const item = await makeItem(ctx.deviceTypeId);
    const row = await svc.create(
      companyId,
      { calibrationJobId: ctx.jobId, devicePhysicalCheckItemId: item.id, verdict: "BAIK" },
      ctx.technician.id,
    );
    expect(row.verdict).toBe("BAIK");
  });

  it("SUBMITTED rejected", async () => {
    const ctx = await startedJob();
    await expect(createOn(ctx, "SUBMITTED")).rejects.toMatchObject({
      response: { code: "PHYSICAL_CHECK_JOB_SUBMITTED" },
    });
  });

  it("REWORK rejected", async () => {
    const ctx = await startedJob();
    await expect(createOn(ctx, "REWORK")).rejects.toMatchObject({
      response: { code: "PHYSICAL_CHECK_JOB_NOT_IN_PROGRESS" },
    });
  });

  it("ACCEPTED_BY_QA rejected", async () => {
    const ctx = await startedJob();
    await expect(createOn(ctx, "ACCEPTED_BY_QA")).rejects.toMatchObject({
      response: { code: "PHYSICAL_CHECK_JOB_SUBMITTED" },
    });
  });
});

describe("PhysicalCheckResultsService — attempt / REWORK (no copy-forward)", () => {
  it("attempt 1 stays historical; REJECT +1; RESUME does not +1; attempt 2 starts empty and attempt 1 is immutable", async () => {
    const ctx = await startedJob();
    const body = await makeItem(ctx.deviceTypeId, { name: "Body", code: "BODY", sortOrder: 10 });
    const cable = await makeItem(ctx.deviceTypeId, { name: "Cable", code: "CABLE", sortOrder: 20 });
    const fuse = await makeItem(ctx.deviceTypeId, { name: "Fuse", code: "FUSE", sortOrder: 30 });

    const a1Body = await svc.create(
      companyId,
      { calibrationJobId: ctx.jobId, devicePhysicalCheckItemId: body.id, verdict: "BAIK" },
      ctx.technician.id,
    );
    await svc.create(
      companyId,
      { calibrationJobId: ctx.jobId, devicePhysicalCheckItemId: cable.id, verdict: "BAIK" },
      ctx.technician.id,
    );
    await svc.create(
      companyId,
      { calibrationJobId: ctx.jobId, devicePhysicalCheckItemId: fuse.id, verdict: "TIDAK_BAIK" },
      ctx.technician.id,
    );

    await jobsService.submitForReview(companyId, ctx.jobId);
    const manager = await makeMember("TECHNICIAN_MANAGER");
    const rejected = await jobsService.decideQualityReview(companyId, ctx.jobId, manager.id, {
      decision: "REJECT",
      notes: "Ulangi pemeriksaan fisik",
    });
    expect(rejected.currentAttempt).toBe(2);
    expect(rejected.status).toBe("REWORK");

    await expect(
      svc.create(
        companyId,
        { calibrationJobId: ctx.jobId, devicePhysicalCheckItemId: body.id, verdict: "BAIK" },
        ctx.technician.id,
      ),
    ).rejects.toMatchObject({ response: { code: "PHYSICAL_CHECK_JOB_NOT_IN_PROGRESS" } });

    const resumed = await jobsService.resumeAfterRework(companyId, ctx.jobId);
    expect(resumed.currentAttempt).toBe(2);
    expect(resumed.status).toBe("IN_PROGRESS");

    const listed = await svc.list(companyId, ctx.jobId);
    expect(listed.every((r) => r.attemptNumber === 1)).toBe(true);
    expect(listed).toHaveLength(3);

    await expect(
      svc.update(companyId, a1Body.id, { verdict: "TIDAK_BAIK" }, ctx.technician.id, ctx.jobId),
    ).rejects.toMatchObject({ response: { code: "PHYSICAL_CHECK_ATTEMPT_SUPERSEDED" } });
    await expect(svc.remove(companyId, a1Body.id, ctx.jobId)).rejects.toMatchObject({
      response: { code: "PHYSICAL_CHECK_ATTEMPT_SUPERSEDED" },
    });

    const a2Body = await svc.create(
      companyId,
      { calibrationJobId: ctx.jobId, devicePhysicalCheckItemId: body.id, verdict: "BAIK" },
      ctx.technician.id,
    );
    expect(a2Body.attemptNumber).toBe(2);
    expect(a2Body.id).not.toBe(a1Body.id);

    const after = await svc.list(companyId, ctx.jobId);
    expect(after.filter((r) => r.attemptNumber === 1)).toHaveLength(3);
    expect(after.filter((r) => r.attemptNumber === 2)).toHaveLength(1);
  });
});

describe("PhysicalCheckResultsService — batch", () => {
  it("writes a valid batch and stamps attempt/company/user server-side", async () => {
    const ctx = await startedJob();
    const body = await makeItem(ctx.deviceTypeId, { name: "Body", code: "BODY", sortOrder: 10 });
    const cable = await makeItem(ctx.deviceTypeId, { name: "Cable", code: "CABLE", sortOrder: 20 });

    const rows = await svc.createMany(
      companyId,
      [
        { calibrationJobId: ctx.jobId, devicePhysicalCheckItemId: body.id, verdict: "BAIK" },
        {
          calibrationJobId: ctx.jobId,
          devicePhysicalCheckItemId: cable.id,
          verdict: "TIDAK_BAIK",
          note: "retak",
        },
      ],
      ctx.technician.id,
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.attemptNumber === 1)).toBe(true);
    expect(rows.every((r) => r.companyId === companyId)).toBe(true);
    expect(rows.every((r) => r.recordedByUserId === ctx.technician.id)).toBe(true);
  });

  it("duplicate natural key in batch rolls back", async () => {
    const ctx = await startedJob();
    const item = await makeItem(ctx.deviceTypeId);
    await expect(
      svc.createMany(
        companyId,
        [
          { calibrationJobId: ctx.jobId, devicePhysicalCheckItemId: item.id, verdict: "BAIK" },
          { calibrationJobId: ctx.jobId, devicePhysicalCheckItemId: item.id, verdict: "TIDAK_BAIK" },
        ],
        ctx.technician.id,
      ),
    ).rejects.toMatchObject({ response: { code: "PHYSICAL_CHECK_DUPLICATE_ENTRY" } });
    expect(await prisma.physicalCheckResult.count({ where: { calibrationJobId: ctx.jobId } })).toBe(0);
  });

  it("mixed invalid item rejects the whole batch", async () => {
    const ctx = await startedJob();
    const body = await makeItem(ctx.deviceTypeId, { code: "BODY" });
    const otherType = await prisma.deviceType.create({
      data: {
        categoryId: (await prisma.deviceType.findUniqueOrThrow({ where: { id: ctx.deviceTypeId } }))
          .categoryId,
        code: `PCMIX${randomUUID().slice(0, 6)}`,
        name: "Mix",
      },
    });
    createdDeviceTypeIds.push(otherType.id);
    const foreign = await makeItem(otherType.id, { code: "FOREIGN" });

    await expect(
      svc.createMany(
        companyId,
        [
          { calibrationJobId: ctx.jobId, devicePhysicalCheckItemId: body.id, verdict: "BAIK" },
          { calibrationJobId: ctx.jobId, devicePhysicalCheckItemId: foreign.id, verdict: "BAIK" },
        ],
        ctx.technician.id,
      ),
    ).rejects.toMatchObject({ response: { code: "PHYSICAL_CHECK_DEVICE_TYPE_MISMATCH" } });
    expect(await prisma.physicalCheckResult.count({ where: { calibrationJobId: ctx.jobId } })).toBe(0);
  });

  it("batch does not copy-forward after REWORK", async () => {
    const ctx = await startedJob();
    const body = await makeItem(ctx.deviceTypeId, { code: "BODY" });
    await svc.create(
      companyId,
      { calibrationJobId: ctx.jobId, devicePhysicalCheckItemId: body.id, verdict: "BAIK" },
      ctx.technician.id,
    );
    await jobsService.submitForReview(companyId, ctx.jobId);
    const manager = await makeMember("TECHNICIAN_MANAGER");
    await jobsService.decideQualityReview(companyId, ctx.jobId, manager.id, {
      decision: "REJECT",
      notes: "ulang",
    });
    await jobsService.resumeAfterRework(companyId, ctx.jobId);

    const batch = await svc.createMany(
      companyId,
      [{ calibrationJobId: ctx.jobId, devicePhysicalCheckItemId: body.id, verdict: "TIDAK_BAIK" }],
      ctx.technician.id,
    );
    expect(batch).toHaveLength(1);
    expect(batch[0]!.attemptNumber).toBe(2);
    expect(batch[0]!.verdict).toBe("TIDAK_BAIK");
    const listed = await svc.list(companyId, ctx.jobId);
    expect(listed).toHaveLength(2);
    expect(listed.find((r) => r.attemptNumber === 1)?.verdict).toBe("BAIK");
  });

  it("batch does not delete missing rows", async () => {
    const ctx = await startedJob();
    const body = await makeItem(ctx.deviceTypeId, { code: "BODY", sortOrder: 10 });
    const cable = await makeItem(ctx.deviceTypeId, { code: "CABLE", sortOrder: 20 });
    await svc.create(
      companyId,
      { calibrationJobId: ctx.jobId, devicePhysicalCheckItemId: body.id, verdict: "BAIK" },
      ctx.technician.id,
    );
    await svc.createMany(
      companyId,
      [{ calibrationJobId: ctx.jobId, devicePhysicalCheckItemId: cable.id, verdict: "BAIK" }],
      ctx.technician.id,
    );
    expect(await prisma.physicalCheckResult.count({ where: { calibrationJobId: ctx.jobId } })).toBe(2);
  });
});

describe("PhysicalCheckResultsService — snapshot", () => {
  it("keeps the original inspectionLimitSnapshot after the master is edited", async () => {
    const ctx = await startedJob();
    const item = await makeItem(ctx.deviceTypeId, {
      inspectionLimit: "Periksa kabel, tidak ada isolasi terkelupas",
    });
    const row = await svc.create(
      companyId,
      { calibrationJobId: ctx.jobId, devicePhysicalCheckItemId: item.id, verdict: "TIDAK_BAIK" },
      ctx.technician.id,
    );
    await prisma.devicePhysicalCheckItem.update({
      where: { id: item.id },
      data: { inspectionLimit: "Teks master baru yang berbeda" },
    });

    const listed = await svc.list(companyId, ctx.jobId);
    expect(listed[0]!.inspectionLimitSnapshot).toBe("Periksa kabel, tidak ada isolasi terkelupas");

    const patched = await svc.update(companyId, row.id, { note: "diperiksa ulang" }, ctx.technician.id);
    expect(patched.inspectionLimitSnapshot).toBe("Periksa kabel, tidak ada isolasi terkelupas");
    expect(patched.note).toBe("diperiksa ulang");
  });
});

describe("PhysicalCheckResultsService — submit is not gated on completeness", () => {
  it("submitForReview still succeeds with incomplete physical checks", async () => {
    const ctx = await startedJob();
    const body = await makeItem(ctx.deviceTypeId, { code: "BODY" });
    await makeItem(ctx.deviceTypeId, { code: "CABLE" });
    await svc.create(
      companyId,
      { calibrationJobId: ctx.jobId, devicePhysicalCheckItemId: body.id, verdict: "BAIK" },
      ctx.technician.id,
    );
    const submitted = await jobsService.submitForReview(companyId, ctx.jobId);
    expect(submitted.status).toBe("SUBMITTED");
  });
});

describe("CalibrationJobsController — physical-check routes", () => {
  it("GET catalog, POST, PATCH, DELETE, GET results follow MeasurementResult style", async () => {
    const ctx = await startedJob();
    const item = await makeItem(ctx.deviceTypeId, { name: "Body", code: "BODY", sortOrder: 10 });

    const catalog = await controller.listPhysicalCheckItems(companyId, ctx.jobId);
    expect(catalog.map((i) => i.code)).toEqual(["BODY"]);

    const created = await controller.createPhysicalCheckResult(companyId, ctx.technician.id, ctx.jobId, {
      devicePhysicalCheckItemId: item.id,
      verdict: "BAIK",
    });
    expect(created.recordedByUserId).toBe(ctx.technician.id);

    const patched = await controller.updatePhysicalCheckResult(
      companyId,
      ctx.technician.id,
      ctx.jobId,
      created.id,
      { verdict: "TIDAK_BAIK" },
    );
    expect(patched.verdict).toBe("TIDAK_BAIK");
    expect(patched.inspectionLimitSnapshot).toBe(created.inspectionLimitSnapshot);

    const listed = await controller.listPhysicalCheckResults(companyId, ctx.jobId);
    expect(listed).toHaveLength(1);
    expect(listed[0]!.attemptNumber).toBe(1);

    await controller.deletePhysicalCheckResult(companyId, ctx.jobId, created.id);
    expect(await controller.listPhysicalCheckResults(companyId, ctx.jobId)).toHaveLength(0);
  });

  it("rejects an invalid verdict at the controller (INVALID_PHYSICAL_CHECK_RESULT)", async () => {
    const ctx = await startedJob();
    const item = await makeItem(ctx.deviceTypeId);
    await expect(
      controller.createPhysicalCheckResult(companyId, ctx.technician.id, ctx.jobId, {
        devicePhysicalCheckItemId: item.id,
        verdict: "PASS",
      }),
    ).rejects.toMatchObject({ response: { code: "INVALID_PHYSICAL_CHECK_RESULT" } });
  });

  it("POST /batch creates many", async () => {
    const ctx = await startedJob();
    const body = await makeItem(ctx.deviceTypeId, { code: "BODY", sortOrder: 10 });
    const fuse = await makeItem(ctx.deviceTypeId, { code: "FUSE", sortOrder: 20 });
    const created = await controller.createPhysicalCheckResultsBatch(
      companyId,
      ctx.technician.id,
      ctx.jobId,
      {
        items: [
          { devicePhysicalCheckItemId: body.id, verdict: "BAIK" },
          { devicePhysicalCheckItemId: fuse.id, verdict: "TIDAK_BAIK" },
        ],
      },
    );
    expect(created).toHaveLength(2);
  });

  it("PATCH for a result on a different job 404s", async () => {
    const a = await startedJob();
    const b = await startedJob();
    const item = await makeItem(a.deviceTypeId);
    const row = await controller.createPhysicalCheckResult(companyId, a.technician.id, a.jobId, {
      devicePhysicalCheckItemId: item.id,
      verdict: "BAIK",
    });
    await expect(
      controller.updatePhysicalCheckResult(companyId, a.technician.id, b.jobId, row.id, {
        note: "nope",
      }),
    ).rejects.toMatchObject({ response: { code: "PHYSICAL_CHECK_RESULT_NOT_FOUND" } });
  });
});

describe("CalibrationJobsController — physical-check RBAC", () => {
  const guard = new CompanyRoleGuard(new Reflector());

  function contextFor(handlerName: keyof CalibrationJobsController) {
    return {
      switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
      getHandler: () => CalibrationJobsController.prototype[handlerName],
      getClass: () => CalibrationJobsController,
    } as never;
  }

  it("allows a TECHNICIAN to create a physical check", async () => {
    const tech = await makeMember("TECHNICIAN");
    getSessionMock.mockResolvedValueOnce({ user: { id: tech.id, email: "pc-t@x.co" } });
    await expect(guard.canActivate(contextFor("createPhysicalCheckResult"))).resolves.toBe(true);
  });

  it("blocks a TECHNICIAN_MANAGER from writing physical checks (403)", async () => {
    const manager = await makeMember("TECHNICIAN_MANAGER");
    getSessionMock.mockResolvedValueOnce({ user: { id: manager.id, email: "pc-m@x.co" } });
    await expect(guard.canActivate(contextFor("createPhysicalCheckResult"))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("allows TECHNICIAN_MANAGER to list physical checks (read-only)", async () => {
    const manager = await makeMember("TECHNICIAN_MANAGER");
    getSessionMock.mockResolvedValueOnce({ user: { id: manager.id, email: "pc-ml@x.co" } });
    await expect(guard.canActivate(contextFor("listPhysicalCheckResults"))).resolves.toBe(true);
  });

  it("does not change existing recordMeasurement grants", () => {
    expect(hasPermission("TECHNICIAN", "calibrationJob", "recordMeasurement")).toBe(true);
    expect(hasPermission("TECHNICIAN_MANAGER", "calibrationJob", "recordMeasurement")).toBe(false);
    expect(hasPermission("TECHNICIAN", "calibrationJob", "recordPhysicalCheck")).toBe(true);
    expect(hasPermission("TECHNICIAN_MANAGER", "calibrationJob", "recordPhysicalCheck")).toBe(false);
  });

  it("blocks TECHNICIAN_MANAGER from recordMeasurement still (unchanged)", async () => {
    const manager = await makeMember("TECHNICIAN_MANAGER");
    getSessionMock.mockResolvedValueOnce({ user: { id: manager.id, email: "pc-mm@x.co" } });
    await expect(guard.canActivate(contextFor("createMeasurementResult"))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
