import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, prisma } from "@medcal/db";
import type { MembershipRole } from "@medcal/db";
import { hasPermission } from "@medcal/auth";
import { CalibrationRequestsService } from "../calibration-requests/calibration-requests.service";
import { QuotationsService } from "../quotations/quotations.service";
import { PurchaseOrdersService } from "../purchase-orders/purchase-orders.service";
import { WorkOrdersService } from "../work-orders/work-orders.service";
import { FilesService } from "../files/files.service";
import { FileOwnerPolicyRegistry } from "../files/owner-policy";
import { LocalDiskDriver } from "../files/storage/local-disk.driver";
import type { UploadedFile } from "../files/files.constants";
import { certificateFileOwnerPolicy } from "./certificate-file-owner-policy";
import { CertificateService } from "./certificate.service";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const PDF_2 = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\nX");

function pdfFile(name: string, buf: Buffer = PDF): UploadedFile {
  return { originalname: name, mimetype: "application/pdf", size: buf.length, buffer: buf };
}

const companyId = "PKM";
const staffUserId = "cert-staff-user";

let root: string;
let driver: LocalDiskDriver;
let registry: FileOwnerPolicyRegistry;
let filesService: FilesService;
let service: CertificateService;

const calibrationRequestsService = new CalibrationRequestsService();
const quotationsService = new QuotationsService();
const purchaseOrdersService = new PurchaseOrdersService();
const workOrdersService = new WorkOrdersService();

const createdWorkOrderIds: string[] = [];
const createdQuotationIds: string[] = [];
const createdCalibrationRequestIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdDeviceTypeIds: string[] = [];
const createdDeviceCategoryIds: string[] = [];
const createdDeviceIds: string[] = [];
const createdUserIds: string[] = [];
const createdMembershipKeys: Array<{ userId: string; companyId: string }> = [];

async function cleanup() {
  if (createdWorkOrderIds.length > 0) {
    const certificates = await prisma.certificate.findMany({
      where: { calibrationJob: { workOrderId: { in: createdWorkOrderIds } } },
      select: { id: true },
    });
    const certificateIds = certificates.map((c) => c.id);
    if (certificateIds.length > 0) {
      await prisma.fileObject.deleteMany({
        where: { ownerType: "CERTIFICATE", ownerId: { in: certificateIds } },
      });
    }
    await prisma.certificate.deleteMany({ where: { id: { in: certificateIds } } });
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
  if (createdDeviceIds.length > 0) {
    await prisma.device.deleteMany({ where: { id: { in: createdDeviceIds } } });
  }
  if (createdDeviceTypeIds.length > 0) {
    await prisma.priceListItem.deleteMany({ where: { deviceTypeId: { in: createdDeviceTypeIds } } });
    await prisma.deviceType.deleteMany({ where: { id: { in: createdDeviceTypeIds } } });
  }
  if (createdDeviceCategoryIds.length > 0) {
    await prisma.deviceCategory.deleteMany({ where: { id: { in: createdDeviceCategoryIds } } });
  }
  if (createdCustomerIds.length > 0) {
    await prisma.customerContact.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
  }
  if (createdMembershipKeys.length > 0) {
    await prisma.userMembership.deleteMany({ where: { OR: createdMembershipKeys } });
  }
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.auditLog.deleteMany({ where: { companyId, targetType: "Certificate" } });
  rmSync(root, { recursive: true, force: true });
}

afterAll(async () => {
  await cleanup();
});

async function ensureNonPpnTax() {
  const existing = await prisma.tax.findUnique({ where: { companyId_taxCode: { companyId, taxCode: "T0" } } });
  if (existing) return;
  await prisma.tax.create({
    data: { companyId, taxCode: "T0", taxRate: 0, isExclude: false, description: "Non PPN" },
  });
}

async function ensureStaffUser() {
  await prisma.user.upsert({
    where: { id: staffUserId },
    create: { id: staffUserId, email: `${staffUserId}@medcal.test`, name: "Cert Staff", status: "ACTIVE" },
    update: {},
  });
}

async function makeMember(role: MembershipRole) {
  const user = await prisma.user.create({
    data: { email: `cert-${randomUUID().slice(0, 10)}@x.co`, name: `Cert ${role}`.slice(0, 50), status: "ACTIVE" },
  });
  createdUserIds.push(user.id);
  await prisma.userMembership.create({ data: { userId: user.id, companyId, role, isDefault: false } });
  createdMembershipKeys.push({ userId: user.id, companyId });
  return user;
}

/** Builds a PENDING CalibrationJob (before start()) — no QA involvement at all. */
async function makeJob(opts: { withDevice: boolean }) {
  await ensureNonPpnTax();
  await ensureStaffUser();
  const category = await prisma.deviceCategory.create({
    data: { code: `CERTCAT${randomUUID().slice(0, 8)}`, name: "Cert Cat" },
  });
  createdDeviceCategoryIds.push(category.id);
  const deviceType = await prisma.deviceType.create({
    data: { categoryId: category.id, code: `CERTDT${randomUUID().slice(0, 8).toUpperCase()}`, name: "Cert Device Type" },
  });
  createdDeviceTypeIds.push(deviceType.id);

  const customer = await prisma.customer.create({
    data: { companyId, number: `CUS/CERT/${randomUUID().slice(0, 8)}`, name: `Cert Cust ${randomUUID().slice(0, 6)}` },
  });
  createdCustomerIds.push(customer.id);

  const request = await calibrationRequestsService.create(companyId, staffUserId, {
    customerId: customer.id,
    serviceMode: "SEND_TO_LAB",
    items: [{ deviceTypeId: deviceType.id, deviceId: "DEV-CERT-1" }],
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
  await workOrdersService.assign(companyId, workOrder.id, { technicians: [{ technicianUserId: technician.id }] });
  await workOrdersService.start(companyId, workOrder.id);
  const jobs = await prisma.calibrationJob.findMany({ where: { workOrderId: workOrder.id } });
  const jobId = jobs[0]!.id;

  if (opts.withDevice) {
    const device = await prisma.device.create({
      data: {
        companyId,
        code: `DVC-CERT-${randomUUID().slice(0, 8).toUpperCase()}`,
        customerId: customer.id,
        deviceTypeId: deviceType.id,
      },
    });
    createdDeviceIds.push(device.id);
    await prisma.calibrationJob.update({ where: { id: jobId }, data: { deviceId: device.id } });
  }

  return { jobId, workOrderId: workOrder.id };
}

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), "medcal-certificate-"));
  driver = new LocalDiskDriver(root);
  registry = new FileOwnerPolicyRegistry();
  registry.register(certificateFileOwnerPolicy);
  filesService = new FilesService(driver, registry);
  service = new CertificateService(filesService);
});

const ctx = { ipAddress: "127.0.0.1", userAgent: "vitest" };

describe("CertificateService", () => {
  it("returns null for a job with no certificate yet — independent of job status/QA", async () => {
    const { jobId } = await makeJob({ withDevice: false });
    const result = await service.getForJob(companyId, jobId);
    expect(result).toBeNull();
  });

  it("refuses to create a certificate before the job's device identity is resolved", async () => {
    const { jobId } = await makeJob({ withDevice: false });
    const mt = await makeMember("TECHNICIAN_MANAGER");
    await expect(
      service.uploadVersion(companyId, jobId, mt.id, "TECHNICIAN_MANAGER", pdfFile("cert.pdf"), ctx),
    ).rejects.toMatchObject({ response: { code: "CERTIFICATE_DEVICE_NOT_RESOLVED" } });
    expect(await service.getForJob(companyId, jobId)).toBeNull();
  });

  it("uploads a certificate while the job is PENDING (no QA decision exists at all)", async () => {
    const { jobId } = await makeJob({ withDevice: true });
    const job = await prisma.calibrationJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.status).toBe("PENDING");
    expect(await prisma.qualityReview.count({ where: { calibrationJobId: jobId } })).toBe(0);

    const mt = await makeMember("TECHNICIAN_MANAGER");
    const detail = await service.uploadVersion(
      companyId,
      jobId,
      mt.id,
      "TECHNICIAN_MANAGER",
      pdfFile("cert-v1.pdf"),
      ctx,
    );

    expect(detail.number).toMatch(/^CER\/\d{4}\/\d{2}\/\d{5}$/);
    expect(detail.versions).toHaveLength(1);
    expect(detail.versions[0]!.isCurrent).toBe(true);
    expect(detail.versions[0]!.originalName).toBe("cert-v1.pdf");
    expect(detail.currentVersionId).toBe(detail.versions[0]!.id);

    // Uploading must never touch QA.
    expect(await prisma.qualityReview.count({ where: { calibrationJobId: jobId } })).toBe(0);
    const jobAfter = await prisma.calibrationJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(jobAfter.status).toBe("PENDING");

    const log = await prisma.auditLog.findFirst({
      where: { action: "CERTIFICATE_UPLOADED", targetId: detail.id },
      orderBy: { createdAt: "desc" },
    });
    expect(log).not.toBeNull();
    expect(log!.outcome).toBe("SUCCESS");
  });

  it("replaces the certificate: previous version stays queryable, never deleted", async () => {
    const { jobId } = await makeJob({ withDevice: true });
    const mt = await makeMember("TECHNICIAN_MANAGER");
    const first = await service.uploadVersion(companyId, jobId, mt.id, "TECHNICIAN_MANAGER", pdfFile("v1.pdf"), ctx);
    const firstVersionId = first.currentVersionId!;

    const second = await service.uploadVersion(
      companyId,
      jobId,
      mt.id,
      "TECHNICIAN_MANAGER",
      pdfFile("v2.pdf", PDF_2),
      ctx,
    );

    expect(second.id).toBe(first.id); // same Certificate row (1:1 with the job)
    expect(second.versions).toHaveLength(2);
    expect(second.currentVersionId).not.toBe(firstVersionId);
    const prior = second.versions.find((v) => v.id === firstVersionId)!;
    expect(prior.isCurrent).toBe(false);
    // Bytes for the prior version are still physically present.
    const priorFileObject = await prisma.fileObject.findUniqueOrThrow({ where: { id: firstVersionId } });
    expect(await driver.exists(priorFileObject.storageKey)).toBe(true);

    const replaceLog = await prisma.auditLog.findFirst({
      where: { action: "CERTIFICATE_REPLACED", targetId: second.id },
    });
    expect(replaceLog).not.toBeNull();
  });

  it("rejects upload from a role without certificate:update (e.g. TECHNICIAN)", async () => {
    const { jobId } = await makeJob({ withDevice: true });
    const tech = await makeMember("TECHNICIAN");
    expect(hasPermission("TECHNICIAN", "certificate", "update")).toBe(false);
    await expect(
      service.uploadVersion(companyId, jobId, tech.id, "TECHNICIAN", pdfFile("nope.pdf"), ctx),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("grants upload to TECHNICIAN_MANAGER, SUPERVISOR, ADMIN and GENERAL_MANAGER, never TECHNICIAN", () => {
    for (const role of ["TECHNICIAN_MANAGER", "SUPERVISOR", "ADMIN", "GENERAL_MANAGER"] as MembershipRole[]) {
      expect(hasPermission(role, "certificate", "update")).toBe(true);
    }
    expect(hasPermission("TECHNICIAN", "certificate", "update")).toBe(false);
    expect(hasPermission("CUSTOMER_SERVICE", "certificate", "update")).toBe(false);
  });

  it("restricts delete to SUPERADMIN only", () => {
    expect(hasPermission("SUPERADMIN", "certificate", "delete")).toBe(true);
    for (const role of ["TECHNICIAN_MANAGER", "SUPERVISOR", "ADMIN", "GENERAL_MANAGER"] as MembershipRole[]) {
      expect(hasPermission(role, "certificate", "delete")).toBe(false);
    }
  });

  it("downloads a version and scopes it to the certificate's own job (Case 6: cross-job access is refused)", async () => {
    const { jobId } = await makeJob({ withDevice: true });
    const other = await makeJob({ withDevice: true });
    const mt = await makeMember("TECHNICIAN_MANAGER");
    const detail = await service.uploadVersion(companyId, jobId, mt.id, "TECHNICIAN_MANAGER", pdfFile("v1.pdf"), ctx);
    await service.uploadVersion(companyId, other.jobId, mt.id, "TECHNICIAN_MANAGER", pdfFile("other.pdf"), ctx);

    const { stream, fileObject } = await service.downloadVersion(
      companyId,
      jobId,
      detail.currentVersionId!,
      "TECHNICIAN_MANAGER",
      mt.id,
      ctx,
    );
    expect(fileObject.originalName).toBe("v1.pdf");
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    expect(Buffer.concat(chunks).equals(PDF)).toBe(true);

    const otherDetail = await service.getForJob(companyId, other.jobId);
    await expect(
      service.downloadVersion(companyId, jobId, otherDetail!.currentVersionId!, "TECHNICIAN_MANAGER", mt.id, ctx),
    ).rejects.toBeInstanceOf(NotFoundException);

    const log = await prisma.auditLog.findFirst({
      where: { action: "CERTIFICATE_DOWNLOADED", targetId: detail.id },
    });
    expect(log).not.toBeNull();
  });

  it("deletes a superseded (non-current) version but refuses to delete the current one", async () => {
    const { jobId } = await makeJob({ withDevice: true });
    const mt = await makeMember("TECHNICIAN_MANAGER");
    const superadmin = await makeMember("SUPERADMIN");
    const first = await service.uploadVersion(companyId, jobId, mt.id, "TECHNICIAN_MANAGER", pdfFile("v1.pdf"), ctx);
    const firstId = first.currentVersionId!;
    const second = await service.uploadVersion(companyId, jobId, mt.id, "TECHNICIAN_MANAGER", pdfFile("v2.pdf", PDF_2), ctx);

    await expect(
      service.deleteVersion(companyId, jobId, second.currentVersionId!, "SUPERADMIN", superadmin.id, ctx),
    ).rejects.toBeInstanceOf(ConflictException);

    const deleted = await service.deleteVersion(companyId, jobId, firstId, "SUPERADMIN", superadmin.id, ctx);
    expect(deleted.deleted).toBe(true);
    expect(await prisma.fileObject.findUnique({ where: { id: firstId } })).toBeNull();

    const log = await prisma.auditLog.findFirst({
      where: { action: "CERTIFICATE_DELETED", targetId: second.id },
    });
    expect(log).not.toBeNull();
  });

  it("rejects delete from a non-SUPERADMIN role even though it can upload/replace", async () => {
    const { jobId } = await makeJob({ withDevice: true });
    const mt = await makeMember("TECHNICIAN_MANAGER");
    const admin = await makeMember("ADMIN");
    const detail = await service.uploadVersion(companyId, jobId, mt.id, "TECHNICIAN_MANAGER", pdfFile("v1.pdf"), ctx);
    await service.uploadVersion(companyId, jobId, mt.id, "TECHNICIAN_MANAGER", pdfFile("v2.pdf", PDF_2), ctx);

    await expect(
      service.deleteVersion(companyId, jobId, detail.currentVersionId!, "ADMIN", admin.id, ctx),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
