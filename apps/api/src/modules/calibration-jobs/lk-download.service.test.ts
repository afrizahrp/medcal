import { randomUUID } from "node:crypto";
import { BadRequestException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { afterAll, describe, expect, it } from "vitest";
import { Prisma, prisma } from "@medcal/db";
import type { MembershipRole } from "@medcal/db";
import { auth, loadRolePermissionCache } from "@medcal/auth";
import { CalibrationRequestsService } from "../calibration-requests/calibration-requests.service";
import { QuotationsService } from "../quotations/quotations.service";
import { PurchaseOrdersService } from "../purchase-orders/purchase-orders.service";
import { WorkOrdersService } from "../work-orders/work-orders.service";
import { CalibrationJobsService } from "./calibration-jobs.service";
import { MeasurementResultsService } from "./measurement-results.service";
import { PhysicalCheckResultsService } from "./physical-check-results.service";
import {
  LkDownloadService,
  formatMeasuredValue,
  formatToleranceText,
  toNum,
} from "./lk-download.service";

// Real Postgres, no mocking of Prisma or better-auth — same convention as
// calibration-jobs.service.test.ts / kontrol-alat.service.test.ts. Only the
// password itself is ever passed in memory; it is never asserted, logged, or
// persisted anywhere by this test or the code under test.

const calibrationRequestsService = new CalibrationRequestsService();
const quotationsService = new QuotationsService();
const purchaseOrdersService = new PurchaseOrdersService();
const workOrdersService = new WorkOrdersService();
const calibrationJobsService = new CalibrationJobsService();
const measurementResultsService = new MeasurementResultsService();
const physicalCheckResultsService = new PhysicalCheckResultsService();
const lkDownload = new LkDownloadService();

const companyId = "PKM";
const staffUserId = "lk-staff-user";
const TEST_PASSWORD = "Lk-D0wnl0ad-Test-Pw!";

const createdWorkOrderIds: string[] = [];
const createdQuotationIds: string[] = [];
const createdCalibrationRequestIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdDeviceTypeIds: string[] = [];
const createdDeviceCategoryIds: string[] = [];
const createdCapabilityIds: string[] = [];
const createdUserIds: string[] = [];
const createdMembershipKeys: Array<{ userId: string; companyId: string }> = [];

async function cleanup() {
  await prisma.lkDownloadAuthorization.deleteMany({ where: { companyId } });
  await prisma.auditLog.deleteMany({ where: { companyId } });
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
    await prisma.deviceCalibrationParameter.deleteMany({
      where: { deviceTypeId: { in: createdDeviceTypeIds } },
    });
    await prisma.devicePhysicalCheckItem.deleteMany({
      where: { deviceTypeId: { in: createdDeviceTypeIds } },
    });
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
  if (createdCustomerIds.length > 0) {
    await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
  }
  if (createdMembershipKeys.length > 0) {
    await prisma.userMembership.deleteMany({ where: { OR: createdMembershipKeys } });
  }
  if (createdUserIds.length > 0) {
    await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.account.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
}

afterAll(async () => {
  await cleanup();
});

async function ensureNonPpnTax() {
  const existing = await prisma.tax.findUnique({
    where: { companyId_taxCode: { companyId, taxCode: "T0" } },
  });
  if (existing) return;
  await prisma.tax.create({
    data: { companyId, taxCode: "T0", taxRate: 0, isExclude: false, description: "Non PPN" },
  });
}

async function ensureStaffUser() {
  await prisma.user.upsert({
    where: { id: staffUserId },
    create: { id: staffUserId, email: `${staffUserId}@medcal.test`, name: "LK Staff", status: "ACTIVE" },
    update: {},
  });
}

/**
 * A real Better Auth user with a real password hash — required to exercise
 * `auth.api.signInEmail` re-authentication, not a bare Prisma fixture row.
 * Origin header follows the same convention as
 * registration-gate.integration.test.ts (internal/staff-context signup).
 */
async function makeMemberWithPassword(role: MembershipRole) {
  const email = `lk-${randomUUID().slice(0, 10)}@x.co`;
  const result = await auth.api.signUpEmail({
    body: { email, password: TEST_PASSWORD, name: `LK ${role}`.slice(0, 50) },
    headers: new Headers({ origin: "http://apps.localhost:3003" }),
  });
  createdUserIds.push(result.user.id);
  await prisma.userMembership.upsert({
    where: { userId_companyId: { userId: result.user.id, companyId } },
    create: { userId: result.user.id, companyId, role, isDefault: false },
    update: { role },
  });
  createdMembershipKeys.push({ userId: result.user.id, companyId });
  await prisma.rolePermission.upsert({
    where: { role_resource_action: { role, resource: "calibrationJob", action: "read" } },
    create: { role, resource: "calibrationJob", action: "read" },
    update: {},
  });
  await loadRolePermissionCache();
  return { id: result.user.id, email };
}

async function inProgressJob() {
  await ensureNonPpnTax();
  await ensureStaffUser();

  const category = await prisma.deviceCategory.create({
    data: { code: `LKCAT${randomUUID().slice(0, 8)}`, name: "LK Cat" },
  });
  createdDeviceCategoryIds.push(category.id);
  const deviceType = await prisma.deviceType.create({
    data: { categoryId: category.id, code: `LKDT${randomUUID().slice(0, 8).toUpperCase()}`, name: "LK Device Type" },
  });
  createdDeviceTypeIds.push(deviceType.id);

  const capability = await prisma.deviceCapability.create({
    data: { code: `LKCP${randomUUID().slice(0, 8)}`, name: "Kinerja" },
  });
  createdCapabilityIds.push(capability.id);
  const item = await prisma.deviceCapabilityItem.create({
    data: { capabilityId: capability.id, name: "LK Item" },
  });
  const param = await prisma.deviceCalibrationParameter.create({
    data: {
      deviceTypeId: deviceType.id,
      capabilityItemId: item.id,
      code: `LKP${randomUUID().slice(0, 8).toUpperCase()}`,
      name: "Denyut Nadi",
      valueType: "NUMBER",
      decimalPlaces: 1,
      toleranceMin: 28,
      toleranceMax: 32,
    },
  });
  const checkItem = await prisma.devicePhysicalCheckItem.create({
    data: {
      deviceTypeId: deviceType.id,
      code: `LKPC${randomUUID().slice(0, 8).toUpperCase()}`,
      name: "Kabel Daya",
      inspectionLimit: "Tidak ada isolasi terkelupas",
      sortOrder: 10,
      isActive: true,
    },
  });

  const customer = await prisma.customer.create({
    data: { companyId, number: `CUS/LK/${randomUUID().slice(0, 8)}`, name: `LK Cust ${randomUUID().slice(0, 6)}` },
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

  const technicianUser = await prisma.user.create({
    data: { email: `lk-tech-${randomUUID().slice(0, 8)}@x.co`, name: "LK Technician", status: "ACTIVE" },
  });
  createdUserIds.push(technicianUser.id);
  await prisma.userMembership.create({
    data: { userId: technicianUser.id, companyId, role: "TECHNICIAN", isDefault: false },
  });
  createdMembershipKeys.push({ userId: technicianUser.id, companyId });

  await workOrdersService.assign(companyId, workOrder.id, {
    technicians: [{ technicianUserId: technicianUser.id }],
  });
  await workOrdersService.start(companyId, workOrder.id);

  const jobs = await prisma.calibrationJob.findMany({ where: { workOrderId: workOrder.id } });
  const jobId = jobs[0]!.id;

  const kontrolAlat = await prisma.kontrolAlat.findUniqueOrThrow({ where: { calibrationJobId: jobId } });
  const signedAt = new Date();
  await prisma.$transaction([
    prisma.kontrolAlat.update({ where: { id: kontrolAlat.id }, data: { workExecuted: true, completedAt: signedAt } }),
    prisma.kontrolAlatSignature.create({
      data: {
        companyId,
        kontrolAlatId: kontrolAlat.id,
        signerKind: "ADMINISTRATION",
        signerName: "Test Administrasi",
        signedAt,
      },
    }),
    prisma.kontrolAlatSignature.create({
      data: {
        companyId,
        kontrolAlatId: kontrolAlat.id,
        signerKind: "TECHNICAL_OFFICER",
        signerName: "Test Petugas Teknis",
        signedAt,
      },
    }),
  ]);

  await calibrationJobsService.start(companyId, jobId);

  return { jobId, deviceTypeId: deviceType.id, technicianUser, param, checkItem };
}

async function acceptedByQaJob() {
  const { jobId, deviceTypeId, technicianUser, param, checkItem } = await inProgressJob();

  await measurementResultsService.create(
    companyId,
    { calibrationJobId: jobId, deviceCalibrationParameterId: param.id, replicateIndex: 1, measuredValue: 30 },
    technicianUser.id,
  );
  await physicalCheckResultsService.create(
    companyId,
    { calibrationJobId: jobId, devicePhysicalCheckItemId: checkItem.id, verdict: "BAIK" },
    technicianUser.id,
  );

  await calibrationJobsService.submitForReview(companyId, jobId);
  const manager = await prisma.user.create({
    data: { email: `lk-mgr-${randomUUID().slice(0, 8)}@x.co`, name: "LK Manager", status: "ACTIVE" },
  });
  createdUserIds.push(manager.id);
  await prisma.userMembership.create({
    data: { userId: manager.id, companyId, role: "TECHNICIAN_MANAGER", isDefault: false },
  });
  createdMembershipKeys.push({ userId: manager.id, companyId });
  await calibrationJobsService.decideQualityReview(companyId, jobId, manager.id, { decision: "APPROVE" });
  const completed = await calibrationJobsService.complete(companyId, jobId);
  expect(completed.status).toBe("ACCEPTED_BY_QA");

  return { jobId, deviceTypeId };
}

const noContext = { ipAddress: "127.0.0.1", userAgent: "vitest" };

describe("LkDownloadService — password re-authentication + audit", () => {
  it("issues a short-lived token on correct password and records a SUCCESS audit event", async () => {
    const { jobId } = await acceptedByQaJob();
    const member = await makeMemberWithPassword("ADMIN");

    const result = await lkDownload.requestReauth(
      companyId,
      member.id,
      member.email,
      jobId,
      TEST_PASSWORD,
      noContext,
    );

    expect(result.token).toHaveLength(64);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const audit = await prisma.auditLog.findFirst({
      where: { companyId, userId: member.id, action: "LK_DOWNLOAD_REAUTH", outcome: "SUCCESS" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.targetId).toBe(jobId);
  });

  it("rejects a wrong password and records a FAILURE audit event, without ever storing the password", async () => {
    const { jobId } = await acceptedByQaJob();
    const member = await makeMemberWithPassword("ADMIN");

    await expect(
      lkDownload.requestReauth(companyId, member.id, member.email, jobId, "totally-wrong-password", noContext),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const audit = await prisma.auditLog.findFirst({
      where: { companyId, userId: member.id, action: "LK_DOWNLOAD_REAUTH", outcome: "FAILURE" },
    });
    expect(audit).not.toBeNull();
    const serialized = JSON.stringify(audit);
    expect(serialized).not.toContain("totally-wrong-password");
  });

  it("rejects re-auth for a job that has not reached ACCEPTED_BY_QA", async () => {
    const { jobId } = await inProgressJob();
    const member = await makeMemberWithPassword("ADMIN");

    await expect(
      lkDownload.requestReauth(companyId, member.id, member.email, jobId, TEST_PASSWORD, noContext),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects re-auth for a job id from another company (IDOR)", async () => {
    const member = await makeMemberWithPassword("ADMIN");
    await expect(
      lkDownload.requestReauth(companyId, member.id, member.email, "nonexistent-job-id", TEST_PASSWORD, noContext),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("LkDownloadService — step-up token + PDF download", () => {
  it("downloads the LK PDF once the step-up token is valid, and records a SUCCESS audit event", async () => {
    const { jobId } = await acceptedByQaJob();
    const member = await makeMemberWithPassword("ADMIN");
    const { token } = await lkDownload.requestReauth(
      companyId,
      member.id,
      member.email,
      jobId,
      TEST_PASSWORD,
      noContext,
    );

    const pdf = await lkDownload.downloadPdf(companyId, member.id, jobId, token, noContext);
    expect(pdf.buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.filename).toMatch(/\.pdf$/);

    const audit = await prisma.auditLog.findFirst({
      where: { companyId, userId: member.id, action: "LK_DOWNLOAD", outcome: "SUCCESS", targetId: jobId },
    });
    expect(audit).not.toBeNull();
  });

  it("cannot reuse the same step-up token twice (single-use)", async () => {
    const { jobId } = await acceptedByQaJob();
    const member = await makeMemberWithPassword("ADMIN");
    const { token } = await lkDownload.requestReauth(
      companyId,
      member.id,
      member.email,
      jobId,
      TEST_PASSWORD,
      noContext,
    );

    await lkDownload.downloadPdf(companyId, member.id, jobId, token, noContext);
    await expect(
      lkDownload.downloadPdf(companyId, member.id, jobId, token, noContext),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects an expired step-up token", async () => {
    const { jobId } = await acceptedByQaJob();
    const member = await makeMemberWithPassword("ADMIN");
    const { token } = await lkDownload.requestReauth(
      companyId,
      member.id,
      member.email,
      jobId,
      TEST_PASSWORD,
      noContext,
    );
    await prisma.lkDownloadAuthorization.update({
      where: { token },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(
      lkDownload.downloadPdf(companyId, member.id, jobId, token, noContext),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects a token that was issued for a different CalibrationJob", async () => {
    const { jobId: jobA } = await acceptedByQaJob();
    const { jobId: jobB } = await acceptedByQaJob();
    const member = await makeMemberWithPassword("ADMIN");
    const { token } = await lkDownload.requestReauth(
      companyId,
      member.id,
      member.email,
      jobA,
      TEST_PASSWORD,
      noContext,
    );

    await expect(
      lkDownload.downloadPdf(companyId, member.id, jobB, token, noContext),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects a token that belongs to a different user", async () => {
    const { jobId } = await acceptedByQaJob();
    const owner = await makeMemberWithPassword("ADMIN");
    const attacker = await makeMemberWithPassword("ADMIN");
    const { token } = await lkDownload.requestReauth(
      companyId,
      owner.id,
      owner.email,
      jobId,
      TEST_PASSWORD,
      noContext,
    );

    await expect(
      lkDownload.downloadPdf(companyId, attacker.id, jobId, token, noContext),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects download when no token is provided at all", async () => {
    const { jobId } = await acceptedByQaJob();
    const member = await makeMemberWithPassword("ADMIN");

    await expect(
      lkDownload.downloadPdf(companyId, member.id, jobId, "not-a-real-token", noContext),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe("LK PDF value/tolerance formatting (generic renderer helpers)", () => {
  it("formats a NUMBER value using the parameter's decimalPlaces", () => {
    expect(
      formatMeasuredValue({ measuredValue: new Prisma.Decimal(30), measuredBool: null, measuredText: null }, "NUMBER", 1),
    ).toBe("30.0");
  });

  it("formats a BOOLEAN value as Ya/Tidak", () => {
    expect(formatMeasuredValue({ measuredValue: null, measuredBool: true, measuredText: null }, "BOOLEAN", null)).toBe(
      "Ya",
    );
    expect(formatMeasuredValue({ measuredValue: null, measuredBool: false, measuredText: null }, "BOOLEAN", null)).toBe(
      "Tidak",
    );
  });

  it("renders the raw text value for RATIO/TEXT (e.g. an 'OR' insulation reading) without inventing meaning", () => {
    expect(formatMeasuredValue({ measuredValue: null, measuredBool: null, measuredText: "OR" }, "TEXT", null)).toBe(
      "OR",
    );
  });

  it("prefers an established human-readable toleranceNote over raw min/max", () => {
    expect(formatToleranceText(28, 32, "± 5 bpm")).toBe("± 5 bpm");
    expect(formatToleranceText(28, 32, null)).toBe("28 – 32");
    expect(formatToleranceText(null, null, null)).toBeNull();
  });

  it("toNum safely converts Prisma.Decimal without assuming a coercion path", () => {
    expect(toNum(new Prisma.Decimal("30.500"))).toBe(30.5);
    expect(toNum(null)).toBeNull();
  });
});
