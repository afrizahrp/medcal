import { randomUUID } from "node:crypto";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma, prisma } from "@medcal/db";
import type { MembershipRole } from "@medcal/db";
import { CalibrationRequestsService } from "../calibration-requests/calibration-requests.service";
import { QuotationsService } from "../quotations/quotations.service";
import { PurchaseOrdersService } from "../purchase-orders/purchase-orders.service";
import { WorkOrdersService } from "../work-orders/work-orders.service";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { CalibrationJobsController } from "./calibration-jobs.controller";
import type { CalibrationJobsService } from "./calibration-jobs.service";
import {
  assertMeasurementRowEditable,
  MeasurementResultsService,
} from "./measurement-results.service";
import { PhysicalCheckResultsService } from "./physical-check-results.service";
import { KontrolAlatService } from "./kontrol-alat.service";

// Only the Better Auth session boundary is mocked; hasPermission stays real,
// backed by the RolePermission cache primed in vitest.setup.ts.
const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));
vi.mock("@medcal/auth", async () => {
  const actual = await vi.importActual<typeof import("@medcal/auth")>("@medcal/auth");
  return { ...actual, auth: { api: { getSession: getSessionMock } } };
});

const svc = new MeasurementResultsService();
const controller = new CalibrationJobsController(
  {} as CalibrationJobsService,
  new MeasurementResultsService(),
  new PhysicalCheckResultsService(),
  new KontrolAlatService(),
);
const calibrationRequestsService = new CalibrationRequestsService();
const quotationsService = new QuotationsService();
const purchaseOrdersService = new PurchaseOrdersService();
const workOrdersService = new WorkOrdersService();

const companyId = "PKM";
const staffUserId = "mr-staff-user";

const createdWorkOrderIds: string[] = [];
const createdQuotationIds: string[] = [];
const createdCalibrationRequestIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdDeviceTypeIds: string[] = [];
const createdDeviceCategoryIds: string[] = [];
const createdCapabilityIds: string[] = [];
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
    data: { email: `mr-${randomUUID().slice(0, 10)}@x.co`, name: `MR ${role}`, status: "ACTIVE" },
  });
  createdUserIds.push(user.id);
  await prisma.userMembership.create({ data: { userId: user.id, companyId, role, isDefault: false } });
  createdMembershipKeys.push({ userId: user.id, companyId });
  return user;
}

/** WorkOrder → IN_PROGRESS with one fanned-out job, plus a calibration parameter for its DeviceType. */
async function startedJob() {
  await ensureNonPpnTax();
  await prisma.user.upsert({
    where: { id: staffUserId },
    create: {
      id: staffUserId,
      email: `${staffUserId}@medcal.test`,
      name: "MR Staff",
      status: "ACTIVE",
    },
    update: {},
  });
  const category = await prisma.deviceCategory.create({
    data: { code: `MRCAT${randomUUID().slice(0, 8)}`, name: "MR Cat" },
  });
  createdDeviceCategoryIds.push(category.id);
  const deviceType = await prisma.deviceType.create({
    data: { categoryId: category.id, code: `MRDT${randomUUID().slice(0, 8)}`, name: "MR Device" },
  });
  createdDeviceTypeIds.push(deviceType.id);

  const customer = await prisma.customer.create({
    data: { companyId, number: `CUS/MR/${randomUUID().slice(0, 8)}`, name: `MR Cust ${randomUUID().slice(0, 6)}` },
  });
  createdCustomerIds.push(customer.id);

  const request = await calibrationRequestsService.create(companyId, staffUserId, {
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

  const capability = await prisma.deviceCapability.create({
    data: { code: `MRCAP${randomUUID().slice(0, 8)}`, name: "MR Capability" },
  });
  createdCapabilityIds.push(capability.id);
  const item = await prisma.deviceCapabilityItem.create({
    data: { capabilityId: capability.id, name: "MR Item" },
  });

  return { jobId: job.id, deviceTypeId: deviceType.id, capabilityItemId: item.id, technician };
}

async function makeParameter(
  ctx: { deviceTypeId: string; capabilityItemId: string },
  data: Partial<Prisma.DeviceCalibrationParameterUncheckedCreateInput>,
) {
  return prisma.deviceCalibrationParameter.create({
    data: {
      deviceTypeId: ctx.deviceTypeId,
      capabilityItemId: ctx.capabilityItemId,
      code: `MRP${randomUUID().slice(0, 8).toUpperCase()}`,
      name: "MR Param",
      valueType: "NUMBER",
      ...data,
    },
  });
}

afterAll(async () => {
    await prisma.measurementResult.deleteMany({ where: { calibrationJob: { workOrderId: { in: createdWorkOrderIds } } } });
    if (createdWorkOrderIds.length > 0) {
      await prisma.jobCalibrationTestPoint.deleteMany({
        where: { calibrationJob: { workOrderId: { in: createdWorkOrderIds } } },
      });
    }
  if (createdWorkOrderIds.length > 0) {
    await prisma.workOrder.deleteMany({ where: { id: { in: createdWorkOrderIds } } });
  }
  if (createdQuotationIds.length > 0) {
    await prisma.purchaseOrder.deleteMany({ where: { quotationId: { in: createdQuotationIds } } });
    await prisma.quotationItem.deleteMany({ where: { quotationId: { in: createdQuotationIds } } });
    await prisma.quotation.deleteMany({ where: { id: { in: createdQuotationIds } } });
  }
  if (createdCalibrationRequestIds.length > 0) {
    await prisma.calibrationRequestItem.deleteMany({ where: { requestId: { in: createdCalibrationRequestIds } } });
    await prisma.calibrationRequest.deleteMany({ where: { id: { in: createdCalibrationRequestIds } } });
  }
  if (createdDeviceTypeIds.length > 0) {
    await prisma.calibrationTestPoint.deleteMany({
      where: { parameter: { deviceTypeId: { in: createdDeviceTypeIds } } },
    });
    await prisma.deviceCalibrationParameter.deleteMany({ where: { deviceTypeId: { in: createdDeviceTypeIds } } });
    await prisma.device.deleteMany({ where: { deviceTypeId: { in: createdDeviceTypeIds } } });
    await prisma.priceListItem.deleteMany({ where: { deviceTypeId: { in: createdDeviceTypeIds } } });
    await prisma.deviceType.deleteMany({ where: { id: { in: createdDeviceTypeIds } } });
  }
  if (createdCapabilityIds.length > 0) {
    await prisma.deviceCapabilityItem.deleteMany({ where: { capabilityId: { in: createdCapabilityIds } } });
    await prisma.deviceCapability.deleteMany({ where: { id: { in: createdCapabilityIds } } });
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
    where: { companyId, documentType: { in: ["WORK_ORDER", "WORK_ORDER_SEND_TO_LAB", "PURCHASE_ORDER", "QUOTATION", "CALIBRATION_REQUEST"] } },
  });
});

beforeAll(() => {
  process.env.COMPANY_ID = companyId;
});

describe("assertMeasurementRowEditable (guard, §7.1)", () => {
  const base = { status: "IN_PROGRESS", currentAttempt: 2, submittedAt: null as Date | null };

  it("rejects a write on a superseded attempt", () => {
    expect(() => assertMeasurementRowEditable(base, { attemptNumber: 1 })).toThrow(
      /superseded attempt/,
    );
  });

  it("rejects a write when the job status is locked", () => {
    expect(() =>
      assertMeasurementRowEditable({ ...base, status: "SUBMITTED" }, { attemptNumber: 2 }),
    ).toThrow(/locked once the job attempt has been submitted/);
    expect(() =>
      assertMeasurementRowEditable({ ...base, status: "ACCEPTED_BY_QA" }, { attemptNumber: 2 }),
    ).toThrow();
  });

  it("rejects a write when submittedAt is set even if the status is not (yet) locked", () => {
    expect(() =>
      assertMeasurementRowEditable(
        { status: "IN_PROGRESS", currentAttempt: 1, submittedAt: new Date() },
        { attemptNumber: 1 },
      ),
    ).toThrow();
  });

  it("allows a write on the current attempt of an IN_PROGRESS job", () => {
    expect(() => assertMeasurementRowEditable(base, { attemptNumber: 2 })).not.toThrow();
  });

  it("rejects a write when status is REWORK even if submittedAt is null (Option A)", () => {
    expect(() =>
      assertMeasurementRowEditable(
        { status: "REWORK", currentAttempt: 2, submittedAt: null },
        { attemptNumber: 2 },
      ),
    ).toThrow(/only while the job is in progress/);
  });

  it("rejects a write when status is PENDING even if submittedAt is null", () => {
    expect(() =>
      assertMeasurementRowEditable(
        { status: "PENDING", currentAttempt: 1, submittedAt: null },
        { attemptNumber: 1 },
      ),
    ).toThrow(/only while the job is in progress/);
  });
});

describe("MeasurementResultsService — CRUD", () => {
  it("create stamps attemptNumber, recordedBy, and snapshots the resolved tolerance", async () => {
    const ctx = await startedJob();
    const param = await makeParameter(ctx, { toleranceMin: 15000, toleranceMax: null });

    const row = await svc.create(
      companyId,
      {
        calibrationJobId: ctx.jobId,
        deviceCalibrationParameterId: param.id,
        replicateIndex: 1,
        measuredValue: 16200,
      },
      ctx.technician.id,
    );

    expect(row.attemptNumber).toBe(1);
    expect(row.recordedByUserId).toBe(ctx.technician.id);
    expect(row.effectiveToleranceMin?.toNumber()).toBe(15000);
    expect(row.effectiveToleranceMax).toBeNull();
    expect(row.isWithinTolerance).toBe(true);
  });

  it("evaluates a strict lower bound and stores over-range OR as text", async () => {
    const ctx = await startedJob();
    const param = await makeParameter(ctx, {
      toleranceMin: 2,
      toleranceMax: null,
      toleranceMinInclusive: false,
      toleranceNote: "> 2 MΩ",
    });

    const overRange = await svc.create(
      companyId,
      {
        calibrationJobId: ctx.jobId,
        deviceCalibrationParameterId: param.id,
        replicateIndex: 1,
        measuredValue: null,
        measuredText: "OR",
      },
      ctx.technician.id,
    );
    expect(overRange.measuredValue).toBeNull();
    expect(overRange.measuredText).toBe("OR");
    expect(overRange.isWithinTolerance).toBe(true);

    const atBound = await svc.create(
      companyId,
      {
        calibrationJobId: ctx.jobId,
        deviceCalibrationParameterId: param.id,
        replicateIndex: 2,
        measuredValue: 2,
      },
      ctx.technician.id,
    );
    expect(atBound.isWithinTolerance).toBe(false);

    const above = await svc.create(
      companyId,
      {
        calibrationJobId: ctx.jobId,
        deviceCalibrationParameterId: param.id,
        replicateIndex: 3,
        measuredValue: 3,
      },
      ctx.technician.id,
    );
    expect(above.isWithinTolerance).toBe(true);

    const arbitrary = await svc.create(
      companyId,
      {
        calibrationJobId: ctx.jobId,
        deviceCalibrationParameterId: param.id,
        replicateIndex: 4,
        measuredValue: null,
        measuredText: "ABC",
      },
      ctx.technician.id,
    );
    expect(arbitrary.measuredText).toBe("ABC");
    expect(arbitrary.isWithinTolerance).toBeNull();
  });

  it("create rejects when the job has not started (CALIBRATION_JOB_NOT_STARTED)", async () => {
    const ctx = await startedJob();
    await prisma.calibrationJob.update({
      where: { id: ctx.jobId },
      data: { status: "PENDING", startedAt: null },
    });
    const param = await makeParameter(ctx, { toleranceMin: 0, toleranceMax: 10 });

    await expect(
      svc.create(
        companyId,
        { calibrationJobId: ctx.jobId, deviceCalibrationParameterId: param.id, replicateIndex: 1, measuredValue: 5 },
        ctx.technician.id,
      ),
    ).rejects.toMatchObject({ response: { code: "CALIBRATION_JOB_NOT_STARTED" } });
  });

  it("create resolves a note-only ± delta via the test point's settingValue (BSM_SYSTOLIC)", async () => {
    const ctx = await startedJob();
    const param = await makeParameter(ctx, {
      toleranceMin: null,
      toleranceMax: null,
      toleranceNote: "± 5 mmHg",
    });
    const tp = await prisma.calibrationTestPoint.create({
      data: { deviceCalibrationParameterId: param.id, sequence: 1, settingLabel: "60 mmHg", settingValue: 60 },
    });

    const row = await svc.create(
      companyId,
      {
        calibrationJobId: ctx.jobId,
        deviceCalibrationParameterId: param.id,
        calibrationTestPointId: tp.id,
        replicateIndex: 1,
        measuredValue: 107,
      },
      ctx.technician.id,
    );

    expect(row.appliedNominalValue?.toNumber()).toBe(60);
    expect([row.effectiveToleranceMin?.toNumber(), row.effectiveToleranceMax?.toNumber()]).toEqual([55, 65]);
    expect(row.isWithinTolerance).toBe(false);
  });

  it("duplicate natural key → MEASUREMENT_DUPLICATE_ENTRY, not a raw P2002", async () => {
    const ctx = await startedJob();
    const param = await makeParameter(ctx, { toleranceMin: 0, toleranceMax: 10 });
    const make = () =>
      svc.create(
        companyId,
        { calibrationJobId: ctx.jobId, deviceCalibrationParameterId: param.id, replicateIndex: 1, measuredValue: 5 },
        ctx.technician.id,
      );
    await make();
    await expect(make()).rejects.toMatchObject({ response: { code: "MEASUREMENT_DUPLICATE_ENTRY" } });
  });

  it("update re-resolves the snapshot + verdict and re-stamps recordedBy/recordedAt", async () => {
    const ctx = await startedJob();
    const param = await makeParameter(ctx, { toleranceMin: 0, toleranceMax: 100 });
    const row = await svc.create(
      companyId,
      { calibrationJobId: ctx.jobId, deviceCalibrationParameterId: param.id, replicateIndex: 1, measuredValue: 50 },
      ctx.technician.id,
    );
    expect(row.isWithinTolerance).toBe(true);

    const editor = await makeMember("TECHNICIAN");
    const before = Date.now();
    const updated = await svc.update(companyId, row.id, { measuredValue: 150 }, editor.id);
    expect(updated.measuredValue?.toNumber()).toBe(150);
    expect(updated.isWithinTolerance).toBe(false);
    expect(updated.recordedByUserId).toBe(editor.id);
    expect(updated.recordedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(updated.recordedAt.getTime()).toBeGreaterThan(row.recordedAt.getTime());
  });

  it("update re-stamps recordedByUserId to the editing actor, not the creator (note-only edit)", async () => {
    const ctx = await startedJob();
    const param = await makeParameter(ctx, { toleranceMin: 0, toleranceMax: 100 });
    const userB = await makeMember("TECHNICIAN");
    const row = await svc.create(
      companyId,
      { calibrationJobId: ctx.jobId, deviceCalibrationParameterId: param.id, replicateIndex: 1, measuredValue: 50 },
      ctx.technician.id,
    );
    expect(row.recordedByUserId).toBe(ctx.technician.id);

    const updated = await svc.update(companyId, row.id, { note: "re-checked by B" }, userB.id);
    expect(updated.recordedByUserId).toBe(userB.id);
    expect(updated.note).toBe("re-checked by B");
    // Value untouched → verdict unchanged.
    expect(updated.isWithinTolerance).toBe(true);
  });

  it("update is blocked once the job is submitted", async () => {
    const ctx = await startedJob();
    const param = await makeParameter(ctx, { toleranceMin: 0, toleranceMax: 100 });
    const row = await svc.create(
      companyId,
      { calibrationJobId: ctx.jobId, deviceCalibrationParameterId: param.id, replicateIndex: 1, measuredValue: 50 },
      ctx.technician.id,
    );
    await prisma.calibrationJob.update({
      where: { id: ctx.jobId },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });

    await expect(
      svc.update(companyId, row.id, { measuredValue: 60 }, ctx.technician.id),
    ).rejects.toMatchObject({
      response: { code: "MEASUREMENT_JOB_SUBMITTED" },
    });
  });

  it("remove hard-deletes a draft row and is blocked after submit", async () => {
    const ctx = await startedJob();
    const param = await makeParameter(ctx, { toleranceMin: 0, toleranceMax: 100 });
    const row = await svc.create(
      companyId,
      { calibrationJobId: ctx.jobId, deviceCalibrationParameterId: param.id, replicateIndex: 1, measuredValue: 50 },
      ctx.technician.id,
    );

    await svc.remove(companyId, row.id);
    expect(await prisma.measurementResult.findUnique({ where: { id: row.id } })).toBeNull();
  });

  it("createMany writes a batch of replicates in one transaction", async () => {
    const ctx = await startedJob();
    const param = await makeParameter(ctx, { toleranceMin: 0, toleranceMax: 100 });
    const rows = await svc.createMany(
      companyId,
      [1, 2, 3].map((replicateIndex) => ({
        calibrationJobId: ctx.jobId,
        deviceCalibrationParameterId: param.id,
        replicateIndex,
        measuredValue: 50 + replicateIndex,
      })),
      ctx.technician.id,
    );
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.isWithinTolerance === true)).toBe(true);
  });
});

describe("MeasurementResultsService — decimalPlaces enforcement", () => {
  it("create rejects excess decimals (MEASUREMENT_DECIMAL_PLACES_EXCEEDED)", async () => {
    const ctx = await startedJob();
    const param = await makeParameter(ctx, {
      decimalPlaces: 1,
      toleranceMin: 20,
      toleranceMax: 30,
    });

    await expect(
      svc.create(
        companyId,
        {
          calibrationJobId: ctx.jobId,
          deviceCalibrationParameterId: param.id,
          replicateIndex: 1,
          measuredValue: "23.23",
        },
        ctx.technician.id,
      ),
    ).rejects.toMatchObject({
      response: {
        code: "MEASUREMENT_DECIMAL_PLACES_EXCEEDED",
        decimalPlaces: 1,
        measuredValue: "23.23",
      },
    });

    expect(
      await prisma.measurementResult.count({
        where: { calibrationJobId: ctx.jobId, deviceCalibrationParameterId: param.id },
      }),
    ).toBe(0);
  });

  it("create accepts values within the parameter decimalPlaces maximum", async () => {
    const ctx = await startedJob();
    const param = await makeParameter(ctx, {
      decimalPlaces: 1,
      toleranceMin: 20,
      toleranceMax: 30,
    });

    const row = await svc.create(
      companyId,
      {
        calibrationJobId: ctx.jobId,
        deviceCalibrationParameterId: param.id,
        replicateIndex: 1,
        measuredValue: "23.2",
      },
      ctx.technician.id,
    );

    expect(row.measuredValue?.toString()).toBe("23.2");
    expect(row.isWithinTolerance).toBe(true);
  });

  it("create accepts integers and one trailing zero when decimalPlaces = 1", async () => {
    const ctx = await startedJob();
    const param = await makeParameter(ctx, { decimalPlaces: 1, toleranceMin: 0, toleranceMax: 100 });

    const a = await svc.create(
      companyId,
      {
        calibrationJobId: ctx.jobId,
        deviceCalibrationParameterId: param.id,
        replicateIndex: 1,
        measuredValue: "23",
      },
      ctx.technician.id,
    );
    const b = await svc.create(
      companyId,
      {
        calibrationJobId: ctx.jobId,
        deviceCalibrationParameterId: param.id,
        replicateIndex: 2,
        measuredValue: "23.0",
      },
      ctx.technician.id,
    );
    expect(a.measuredValue?.toString()).toBe("23");
    expect(b.measuredValue?.toString()).toBe("23");
  });

  it("create rejects any fractional part when decimalPlaces = 0", async () => {
    const ctx = await startedJob();
    const param = await makeParameter(ctx, { decimalPlaces: 0, toleranceMin: 0, toleranceMax: 100 });

    await expect(
      svc.create(
        companyId,
        {
          calibrationJobId: ctx.jobId,
          deviceCalibrationParameterId: param.id,
          replicateIndex: 1,
          measuredValue: "23.0",
        },
        ctx.technician.id,
      ),
    ).rejects.toMatchObject({ response: { code: "MEASUREMENT_DECIMAL_PLACES_EXCEEDED" } });

    const row = await svc.create(
      companyId,
      {
        calibrationJobId: ctx.jobId,
        deviceCalibrationParameterId: param.id,
        replicateIndex: 1,
        measuredValue: "23",
      },
      ctx.technician.id,
    );
    expect(row.measuredValue?.toString()).toBe("23");
  });

  it("create does not restrict fractional digits when decimalPlaces is null", async () => {
    const ctx = await startedJob();
    const param = await makeParameter(ctx, {
      decimalPlaces: null,
      toleranceMin: 0,
      toleranceMax: 100,
    });

    const row = await svc.create(
      companyId,
      {
        calibrationJobId: ctx.jobId,
        deviceCalibrationParameterId: param.id,
        replicateIndex: 1,
        measuredValue: "23.234567",
      },
      ctx.technician.id,
    );
    expect(row.measuredValue?.toString()).toBe("23.234567");
  });

  it("createMany rejects the whole batch when any item exceeds decimalPlaces", async () => {
    const ctx = await startedJob();
    const param = await makeParameter(ctx, { decimalPlaces: 1, toleranceMin: 0, toleranceMax: 100 });

    await expect(
      svc.createMany(
        companyId,
        [
          {
            calibrationJobId: ctx.jobId,
            deviceCalibrationParameterId: param.id,
            replicateIndex: 1,
            measuredValue: "23.2",
          },
          {
            calibrationJobId: ctx.jobId,
            deviceCalibrationParameterId: param.id,
            replicateIndex: 2,
            measuredValue: "23.23",
          },
        ],
        ctx.technician.id,
      ),
    ).rejects.toMatchObject({ response: { code: "MEASUREMENT_DECIMAL_PLACES_EXCEEDED" } });

    expect(
      await prisma.measurementResult.count({
        where: { calibrationJobId: ctx.jobId, deviceCalibrationParameterId: param.id },
      }),
    ).toBe(0);
  });

  it("createMany accepts a batch within decimalPlaces", async () => {
    const ctx = await startedJob();
    const param = await makeParameter(ctx, { decimalPlaces: 2, toleranceMin: 0, toleranceMax: 100 });

    const rows = await svc.createMany(
      companyId,
      [
        {
          calibrationJobId: ctx.jobId,
          deviceCalibrationParameterId: param.id,
          replicateIndex: 1,
          measuredValue: "23.23",
        },
        {
          calibrationJobId: ctx.jobId,
          deviceCalibrationParameterId: param.id,
          replicateIndex: 2,
          measuredValue: "23.2",
        },
      ],
      ctx.technician.id,
    );
    expect(rows).toHaveLength(2);
  });

  it("update rejects excess decimals and leaves the stored value unchanged", async () => {
    const ctx = await startedJob();
    const param = await makeParameter(ctx, { decimalPlaces: 1, toleranceMin: 0, toleranceMax: 100 });
    const row = await svc.create(
      companyId,
      {
        calibrationJobId: ctx.jobId,
        deviceCalibrationParameterId: param.id,
        replicateIndex: 1,
        measuredValue: "23.2",
      },
      ctx.technician.id,
    );

    await expect(
      svc.update(companyId, row.id, { measuredValue: "23.23" }, ctx.technician.id),
    ).rejects.toMatchObject({ response: { code: "MEASUREMENT_DECIMAL_PLACES_EXCEEDED" } });

    const reloaded = await prisma.measurementResult.findUniqueOrThrow({ where: { id: row.id } });
    expect(reloaded.measuredValue?.toString()).toBe("23.2");
  });

  it("update accepts a value within decimalPlaces", async () => {
    const ctx = await startedJob();
    const param = await makeParameter(ctx, { decimalPlaces: 1, toleranceMin: 0, toleranceMax: 100 });
    const row = await svc.create(
      companyId,
      {
        calibrationJobId: ctx.jobId,
        deviceCalibrationParameterId: param.id,
        replicateIndex: 1,
        measuredValue: "20",
      },
      ctx.technician.id,
    );

    const updated = await svc.update(companyId, row.id, { measuredValue: "23.0" }, ctx.technician.id);
    expect(updated.measuredValue?.toString()).toBe("23");
  });

  it("GRID create uses the parameter decimalPlaces (not test-point fields)", async () => {
    const ctx = await startedJob();
    const param = await makeParameter(ctx, {
      decimalPlaces: 1,
      toleranceMin: null,
      toleranceMax: null,
      toleranceNote: "± 5",
    });
    const tp = await prisma.calibrationTestPoint.create({
      data: {
        deviceCalibrationParameterId: param.id,
        sequence: 1,
        settingLabel: "60",
        settingValue: 60,
      },
    });

    await expect(
      svc.create(
        companyId,
        {
          calibrationJobId: ctx.jobId,
          deviceCalibrationParameterId: param.id,
          calibrationTestPointId: tp.id,
          replicateIndex: 1,
          measuredValue: "60.12",
        },
        ctx.technician.id,
      ),
    ).rejects.toMatchObject({ response: { code: "MEASUREMENT_DECIMAL_PLACES_EXCEEDED" } });

    const row = await svc.create(
      companyId,
      {
        calibrationJobId: ctx.jobId,
        deviceCalibrationParameterId: param.id,
        calibrationTestPointId: tp.id,
        replicateIndex: 1,
        measuredValue: "60.1",
      },
      ctx.technician.id,
    );
    expect(row.calibrationTestPointId).toBe(tp.id);
    expect(row.measuredValue?.toString()).toBe("60.1");
  });

  it("stores MeasurementResult.calibrationTestPointId as the master id when the point is in the snapshot", async () => {
    const ctx = await startedJob();
    const param = await makeParameter(ctx, { toleranceMin: 0, toleranceMax: 100 });
    const tp = await prisma.calibrationTestPoint.create({
      data: {
        deviceCalibrationParameterId: param.id,
        sequence: 1,
        settingLabel: "Awal",
      },
    });
    await prisma.jobCalibrationTestPoint.create({
      data: {
        calibrationJobId: ctx.jobId,
        deviceCalibrationParameterId: param.id,
        sourceCalibrationTestPointId: tp.id,
        sequence: 1,
        settingLabel: "Awal",
      },
    });
    await prisma.calibrationJob.update({
      where: { id: ctx.jobId },
      data: { measurementTestPointsSnapshottedAt: new Date() },
    });

    const row = await svc.create(
      companyId,
      {
        calibrationJobId: ctx.jobId,
        deviceCalibrationParameterId: param.id,
        calibrationTestPointId: tp.id,
        replicateIndex: 1,
        measuredValue: 1,
      },
      ctx.technician.id,
    );
    expect(row.calibrationTestPointId).toBe(tp.id);
    expect(row.replicateIndex).toBe(1);
  });

  it("rejects a test point that is not in the started job snapshot", async () => {
    const ctx = await startedJob();
    await prisma.calibrationJob.update({
      where: { id: ctx.jobId },
      data: { measurementTestPointsSnapshottedAt: new Date() },
    });
    const param = await makeParameter(ctx, { toleranceMin: 0, toleranceMax: 100 });
    const tp = await prisma.calibrationTestPoint.create({
      data: {
        deviceCalibrationParameterId: param.id,
        sequence: 1,
        settingLabel: "Awal",
      },
    });

    await expect(
      svc.create(
        companyId,
        {
          calibrationJobId: ctx.jobId,
          deviceCalibrationParameterId: param.id,
          calibrationTestPointId: tp.id,
          replicateIndex: 1,
          measuredValue: 1,
        },
        ctx.technician.id,
      ),
    ).rejects.toMatchObject({ response: { code: "MEASUREMENT_TEST_POINT_NOT_IN_JOB" } });
  });

  it("keeps Pattern A calibrationTestPointId NULL under a frozen snapshot", async () => {
    const ctx = await startedJob();
    await prisma.calibrationJob.update({
      where: { id: ctx.jobId },
      data: { measurementTestPointsSnapshottedAt: new Date() },
    });
    const param = await makeParameter(ctx, { toleranceMin: 0, toleranceMax: 100 });
    const row = await svc.create(
      companyId,
      {
        calibrationJobId: ctx.jobId,
        deviceCalibrationParameterId: param.id,
        replicateIndex: 5,
        measuredValue: 22.1,
      },
      ctx.technician.id,
    );
    expect(row.calibrationTestPointId).toBeNull();
    expect(row.replicateIndex).toBe(5);
  });

  it("does not round excess decimals — rejects instead of storing 23.2", async () => {
    const ctx = await startedJob();
    const param = await makeParameter(ctx, { decimalPlaces: 1, toleranceMin: 0, toleranceMax: 100 });

    await expect(
      svc.create(
        companyId,
        {
          calibrationJobId: ctx.jobId,
          deviceCalibrationParameterId: param.id,
          replicateIndex: 1,
          measuredValue: "23.23",
        },
        ctx.technician.id,
      ),
    ).rejects.toMatchObject({ response: { code: "MEASUREMENT_DECIMAL_PLACES_EXCEEDED" } });
  });
});

describe("CalibrationJobsController — measurement-results routes", () => {
  it("POST creates a row and returns it with the resolved verdict (no second round-trip)", async () => {
    const ctx = await startedJob();
    const param = await makeParameter(ctx, { toleranceMin: 0, toleranceMax: 100 });

    const row = await controller.createMeasurementResult(companyId, ctx.technician.id, ctx.jobId, {
      deviceCalibrationParameterId: param.id,
      replicateIndex: 1,
      measuredValue: 42,
    });

    expect(row.isWithinTolerance).toBe(true);
    expect(row.effectiveToleranceMax?.toString()).toBe("100");
    expect(row.recordedByUserId).toBe(ctx.technician.id);
  });

  it("POST /batch creates many and GET lists them in worksheet order", async () => {
    const ctx = await startedJob();
    const param = await makeParameter(ctx, { toleranceMin: 0, toleranceMax: 100 });

    const created = await controller.createMeasurementResultsBatch(companyId, ctx.technician.id, ctx.jobId, {
      items: [1, 2, 3].map((replicateIndex) => ({
        deviceCalibrationParameterId: param.id,
        replicateIndex,
        measuredValue: 10 * replicateIndex,
      })),
    });
    expect(created).toHaveLength(3);

    const listed = await controller.listMeasurementResults(companyId, ctx.jobId);
    expect(listed.map((r) => r.replicateIndex)).toEqual([1, 2, 3]);
  });

  it("PATCH updates the value, re-stamps the editor, and recomputes the verdict", async () => {
    const ctx = await startedJob();
    const param = await makeParameter(ctx, { toleranceMin: 0, toleranceMax: 100 });
    const editor = await makeMember("TECHNICIAN");
    const row = await controller.createMeasurementResult(companyId, ctx.technician.id, ctx.jobId, {
      deviceCalibrationParameterId: param.id,
      replicateIndex: 1,
      measuredValue: 50,
    });

    const updated = await controller.updateMeasurementResult(companyId, editor.id, ctx.jobId, row.id, {
      measuredValue: 500,
    });
    expect(updated.isWithinTolerance).toBe(false);
    expect(updated.recordedByUserId).toBe(editor.id);
  });

  it("DELETE removes the row", async () => {
    const ctx = await startedJob();
    const param = await makeParameter(ctx, { toleranceMin: 0, toleranceMax: 100 });
    const row = await controller.createMeasurementResult(companyId, ctx.technician.id, ctx.jobId, {
      deviceCalibrationParameterId: param.id,
      replicateIndex: 1,
      measuredValue: 50,
    });

    await controller.deleteMeasurementResult(companyId, ctx.jobId, row.id);
    expect(await prisma.measurementResult.findUnique({ where: { id: row.id } })).toBeNull();
  });

  it("rejects a body missing deviceCalibrationParameterId (INVALID_MEASUREMENT_RESULT)", async () => {
    const ctx = await startedJob();
    await expect(
      controller.createMeasurementResult(companyId, ctx.technician.id, ctx.jobId, {
        replicateIndex: 1,
        measuredValue: 5,
      }),
    ).rejects.toMatchObject({ response: { code: "INVALID_MEASUREMENT_RESULT" } });
  });

  it("surfaces the post-submit guard rejection as MEASUREMENT_JOB_SUBMITTED (HTTP 400)", async () => {
    const ctx = await startedJob();
    const param = await makeParameter(ctx, { toleranceMin: 0, toleranceMax: 100 });
    const row = await controller.createMeasurementResult(companyId, ctx.technician.id, ctx.jobId, {
      deviceCalibrationParameterId: param.id,
      replicateIndex: 1,
      measuredValue: 50,
    });
    await prisma.calibrationJob.update({
      where: { id: ctx.jobId },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });

    await expect(
      controller.updateMeasurementResult(companyId, ctx.technician.id, ctx.jobId, row.id, {
        measuredValue: 60,
      }),
    ).rejects.toMatchObject({ status: 400, response: { code: "MEASUREMENT_JOB_SUBMITTED" } });
    // BadRequestException → HTTP 400, consistent with how IdentityCorrection
    // guard errors surface (assertIdentityGateOpen also throws BadRequestException).
  });

  it("a PATCH for a measurement on a different job 404s (nested-route integrity)", async () => {
    const a = await startedJob();
    const b = await startedJob();
    const param = await makeParameter(a, { toleranceMin: 0, toleranceMax: 100 });
    const row = await controller.createMeasurementResult(companyId, a.technician.id, a.jobId, {
      deviceCalibrationParameterId: param.id,
      replicateIndex: 1,
      measuredValue: 50,
    });

    await expect(
      controller.updateMeasurementResult(companyId, a.technician.id, b.jobId, row.id, {
        measuredValue: 60,
      }),
    ).rejects.toMatchObject({ response: { code: "MEASUREMENT_RESULT_NOT_FOUND" } });
  });
});

describe("CalibrationJobsController — measurement RBAC (guard chain)", () => {
  const guard = new CompanyRoleGuard(new Reflector());

  function contextFor(handlerName: keyof CalibrationJobsController) {
    return {
      switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
      getHandler: () => CalibrationJobsController.prototype[handlerName],
      getClass: () => CalibrationJobsController,
    } as never;
  }

  it("allows a TECHNICIAN to create a measurement", async () => {
    const tech = await makeMember("TECHNICIAN");
    getSessionMock.mockResolvedValueOnce({ user: { id: tech.id, email: "mr-t@x.co" } });
    await expect(guard.canActivate(contextFor("createMeasurementResult"))).resolves.toBe(true);
  });

  it("blocks a FINANCE user from creating a measurement (403)", async () => {
    const finance = await makeMember("FINANCE");
    getSessionMock.mockResolvedValueOnce({ user: { id: finance.id, email: "mr-f@x.co" } });
    await expect(guard.canActivate(contextFor("createMeasurementResult"))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("allows a TECHNICIAN to list measurements (read-level)", async () => {
    const tech = await makeMember("TECHNICIAN");
    getSessionMock.mockResolvedValueOnce({ user: { id: tech.id, email: "mr-tl@x.co" } });
    await expect(guard.canActivate(contextFor("listMeasurementResults"))).resolves.toBe(true);
  });

  it("blocks a TECHNICIAN_MANAGER from creating a measurement (403)", async () => {
    const manager = await makeMember("TECHNICIAN_MANAGER");
    getSessionMock.mockResolvedValueOnce({ user: { id: manager.id, email: "mr-m@x.co" } });
    await expect(guard.canActivate(contextFor("createMeasurementResult"))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
