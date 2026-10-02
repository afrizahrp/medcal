import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ConflictException, ForbiddenException, Module, NotFoundException } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { BUSINESS_TIME_ZONE, MAX_COLLISION_ATTEMPTS, MAX_DOCUMENT_SEQUENCE, Prisma, getZonedYearMonth, prisma } from "@medcal/db";
import type { MembershipRole } from "@medcal/db";
import { auth, hasPermission } from "@medcal/auth";
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
import { CertificateVerificationService } from "../certificate-verification/certificate-verification.service";
import { CertificateVerificationController } from "../certificate-verification/certificate-verification.controller";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { CalibrationJobsController } from "./calibration-jobs.controller";
import { CalibrationJobsService } from "./calibration-jobs.service";
import { MeasurementResultsService } from "./measurement-results.service";
import { PhysicalCheckResultsService } from "./physical-check-results.service";
import { KontrolAlatService } from "./kontrol-alat.service";
import { LkDownloadService } from "./lk-download.service";

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
  if (createdCustomerIds.length > 0) {
    // The requisition-resolution Device (createTestDevice-style, "DEV-CERT-1")
    // isn't tracked in createdDeviceIds — clear by customer before deviceType cleanup.
    await prisma.device.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
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
  await prisma.device.create({
    data: {
      companyId,
      code: `DVC-REQ-${randomUUID().slice(0, 8).toUpperCase()}`,
      customerId: customer.id,
      deviceTypeId: deviceType.id,
      serialNumber: "DEV-CERT-1",
    },
  });

  // qty: 2 — a qty>1 line always fans out with CalibrationJob.deviceId left
  // null (ambiguous, one Device per line vs. N physical units), regardless of
  // this fixture's own resolved CalibrationRequestItem.deviceId. This keeps
  // `withDevice: false` producing a genuinely unresolved job, unaffected by
  // the (separate, qty=1-only) automatic PurchaseOrderItem -> CalibrationJob
  // propagation this fixture would otherwise trigger.
  const request = await calibrationRequestsService.create(companyId, staffUserId, {
    customerId: customer.id,
    serviceMode: "SEND_TO_LAB",
    items: [{ deviceTypeId: deviceType.id, deviceId: "DEV-CERT-1", qty: 2 }],
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

const savedPortalUrl = process.env.NEXT_PUBLIC_CUSTOMER_PORTAL_URL;

afterAll(() => {
  if (savedPortalUrl === undefined) delete process.env.NEXT_PUBLIC_CUSTOMER_PORTAL_URL;
  else process.env.NEXT_PUBLIC_CUSTOMER_PORTAL_URL = savedPortalUrl;
});

beforeAll(() => {
  process.env.NEXT_PUBLIC_CUSTOMER_PORTAL_URL = "https://customer.example.test";
  root = mkdtempSync(path.join(tmpdir(), "medcal-certificate-"));
  driver = new LocalDiskDriver(root);
  registry = new FileOwnerPolicyRegistry();
  registry.register(certificateFileOwnerPolicy);
  filesService = new FilesService(driver, registry);
  service = new CertificateService(filesService);
});

const ctx = { ipAddress: "127.0.0.1", userAgent: "vitest" };

const PORTAL_ORIGIN = "https://customer.example.test";

function upload(
  jobId: string,
  userId: string,
  file: UploadedFile,
  number: unknown,
  role: MembershipRole = "TECHNICIAN_MANAGER",
) {
  return service.uploadVersion(companyId, jobId, userId, role, file, number, ctx);
}

function issue(jobId: string, userId: string, role: MembershipRole = "GENERAL_MANAGER") {
  return service.issueGenerated(companyId, jobId, userId, role, ctx);
}

async function markAccepted(jobId: string) {
  await prisma.calibrationJob.update({ where: { id: jobId }, data: { status: "ACCEPTED_BY_QA" } });
}

async function makeAcceptedJob() {
  const made = await makeJob({ withDevice: true });
  await markAccepted(made.jobId);
  return made;
}

async function generatedSequenceCount() {
  return prisma.documentNumberSequence.count({
    where: { companyId, documentType: { in: ["CERTIFICATE", "CERTIFICATE_GENERATED"] } },
  });
}

async function readAll(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

describe("CertificateService — UPLOADED certificates", () => {
  it("returns null for a job with no certificate yet — independent of job status/QA", async () => {
    const { jobId } = await makeJob({ withDevice: false });
    expect(await service.getForJob(companyId, jobId)).toBeNull();
  });

  it("requires an explicit certificate number: none, empty or whitespace-only is refused and nothing is created", async () => {
    const { jobId } = await makeJob({ withDevice: true });
    const mt = await makeMember("TECHNICIAN_MANAGER");
    for (const bad of [undefined, null, "", "   ", 42]) {
      await expect(upload(jobId, mt.id, pdfFile("PKM-CERT-2026-00123.pdf"), bad)).rejects.toMatchObject({
        response: { code: "CERTIFICATE_NUMBER_REQUIRED" },
      });
    }
    expect(await service.getForJob(companyId, jobId)).toBeNull();
  });

  it("stores the user-provided external number verbatim — the filename is NOT authoritative — as UPLOADED + ISSUED with a token, and allocates no Medcal number", async () => {
    const { jobId } = await makeJob({ withDevice: true });
    const mt = await makeMember("TECHNICIAN_MANAGER");
    const sequencesBefore = await generatedSequenceCount();
    const auditBefore = await prisma.auditLog.count({ where: { action: "CERTIFICATE_ISSUED" } });

    const detail = await upload(jobId, mt.id, pdfFile("some-other-name.pdf"), "  PKM-CERT-2026-00123  ");

    expect(detail.number).toBe("PKM-CERT-2026-00123");
    expect(detail.source).toBe("UPLOADED");
    expect(detail.status).toBe("ISSUED");
    expect(detail.issuedAt).toBeInstanceOf(Date);
    expect(detail.versions).toHaveLength(1);
    expect(detail.versions[0]!.originalName).toBe("some-other-name.pdf");
    expect(detail.currentVersionId).toBe(detail.versions[0]!.id);

    const row = await prisma.certificate.findUniqueOrThrow({ where: { id: detail.id } });
    expect(row.verificationToken).toMatch(TOKEN_SHAPE);
    expect(row.verificationToken).not.toContain(row.id);
    expect(detail.verificationUrl).toBe(`${PORTAL_ORIGIN}/verify/certificate/${row.verificationToken}`);

    // No CER and no CRT number was allocated for the upload.
    expect(await generatedSequenceCount()).toBe(sequencesBefore);
    expect(row.number.startsWith("CER/")).toBe(false);
    expect(row.number.startsWith("CRT/")).toBe(false);

    // Uploading must never touch QA or job status.
    expect(await prisma.qualityReview.count({ where: { calibrationJobId: jobId } })).toBe(0);
    expect((await prisma.calibrationJob.findUniqueOrThrow({ where: { id: jobId } })).status).toBe("PENDING");

    // Audit: ISSUED (identity) + UPLOADED (file), both reconstructable.
    expect(await prisma.auditLog.count({ where: { action: "CERTIFICATE_ISSUED" } })).toBe(auditBefore + 1);
    const issued = await prisma.auditLog.findFirstOrThrow({
      where: { action: "CERTIFICATE_ISSUED", targetId: detail.id },
    });
    expect(issued.metadata).toMatchObject({
      certificateId: detail.id,
      certificateNumber: "PKM-CERT-2026-00123",
      source: "UPLOADED",
      calibrationJobId: jobId,
    });
    const uploaded = await prisma.auditLog.findFirstOrThrow({
      where: { action: "CERTIFICATE_UPLOADED", targetId: detail.id },
    });
    expect(uploaded.outcome).toBe("SUCCESS");
  });

  it("preserves the case and inner characters of an external number, collapsing only whitespace runs", async () => {
    const { jobId } = await makeJob({ withDevice: true });
    const mt = await makeMember("TECHNICIAN_MANAGER");
    const detail = await upload(jobId, mt.id, pdfFile("a.pdf"), "Kal/2026/00123  rev.A");
    expect(detail.number).toBe("Kal/2026/00123 rev.A");
  });

  it("rejects the reserved CRT/ namespace (any case, any spacing, well-formed or not)", async () => {
    const { jobId } = await makeJob({ withDevice: true });
    const mt = await makeMember("TECHNICIAN_MANAGER");
    for (const reserved of ["CRT/2026/09/00001", "crt/2026/09/00001", "CRT/anything", " CRT /1", "CRT/"]) {
      await expect(upload(jobId, mt.id, pdfFile("a.pdf"), reserved)).rejects.toMatchObject({
        response: { code: "CERTIFICATE_NUMBER_RESERVED" },
      });
    }
    expect(await service.getForJob(companyId, jobId)).toBeNull();
  });

  it("rejects malformed external numbers (too long, illegal characters, bad start) but does not force a Medcal format", async () => {
    const { jobId } = await makeJob({ withDevice: true });
    const mt = await makeMember("TECHNICIAN_MANAGER");
    await expect(upload(jobId, mt.id, pdfFile("a.pdf"), "A".repeat(65))).rejects.toMatchObject({
      response: { code: "CERTIFICATE_NUMBER_TOO_LONG" },
    });
    for (const bad of ["ABC;001", "<b>1</b>", "-ABC", "/ABC", "AB\u0000C", "ABC'--"]) {
      await expect(upload(jobId, mt.id, pdfFile("a.pdf"), bad)).rejects.toMatchObject({
        response: { code: "CERTIFICATE_NUMBER_INVALID" },
      });
    }
    expect(await service.getForJob(companyId, jobId)).toBeNull();

    // Numbers unlike Medcal's own shape are fine.
    for (const [i, ok] of ["ABC-001", "KAL/2026/00123", "12345", "PKM CERT 7.B_2"].entries()) {
      const made = await makeJob({ withDevice: true });
      const d = await upload(made.jobId, mt.id, pdfFile(`ok-${i}.pdf`), ok);
      expect(d.number).toBe(ok);
    }
  });

  it("rejects a duplicate external number on another job in the same company (case-insensitive) without creating anything", async () => {
    const first = await makeJob({ withDevice: true });
    const second = await makeJob({ withDevice: true });
    const mt = await makeMember("TECHNICIAN_MANAGER");
    await upload(first.jobId, mt.id, pdfFile("a.pdf"), "DUP-2026-0001");

    for (const dup of ["DUP-2026-0001", "dup-2026-0001"]) {
      await expect(upload(second.jobId, mt.id, pdfFile("b.pdf", PDF_2), dup)).rejects.toMatchObject({
        response: { code: "CERTIFICATE_NUMBER_DUPLICATE" },
      });
    }
    expect(await service.getForJob(companyId, second.jobId)).toBeNull();
  });

  it("stays 1 certificate per job: a second upload for the same job replaces the PDF, never creates another row", async () => {
    const { jobId } = await makeJob({ withDevice: true });
    const mt = await makeMember("TECHNICIAN_MANAGER");
    await upload(jobId, mt.id, pdfFile("v1.pdf"), "ONE-PER-JOB-1");
    await upload(jobId, mt.id, pdfFile("v2.pdf", PDF_2), "ONE-PER-JOB-1");
    expect(await prisma.certificate.count({ where: { calibrationJobId: jobId } })).toBe(1);
  });

  it("refuses to create a certificate before the job's device identity is resolved", async () => {
    const { jobId } = await makeJob({ withDevice: false });
    const mt = await makeMember("TECHNICIAN_MANAGER");
    await expect(upload(jobId, mt.id, pdfFile("cert.pdf"), "NODEV-1")).rejects.toMatchObject({
      response: { code: "CERTIFICATE_DEVICE_NOT_RESOLVED" },
    });
    expect(await service.getForJob(companyId, jobId)).toBeNull();
  });

  it("rejects upload from a role without certificate:update and leaves NO issued certificate behind", async () => {
    const { jobId } = await makeJob({ withDevice: true });
    const tech = await makeMember("TECHNICIAN");
    expect(hasPermission("TECHNICIAN", "certificate", "update")).toBe(false);
    await expect(upload(jobId, tech.id, pdfFile("nope.pdf"), "NOPE-1", "TECHNICIAN")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    // The row established by the failed request was rolled back.
    expect(await service.getForJob(companyId, jobId)).toBeNull();
    expect(await prisma.certificate.count({ where: { number: "NOPE-1" } })).toBe(0);
  });

  it("rejects an invalid file before creating anything", async () => {
    const { jobId } = await makeJob({ withDevice: true });
    const mt = await makeMember("TECHNICIAN_MANAGER");
    await expect(
      upload(jobId, mt.id, { originalname: "x.pdf", mimetype: "application/pdf", size: 3, buffer: Buffer.from("abc") }, "BADFILE-1"),
    ).rejects.toMatchObject({ response: { code: "FILE_CONTENT_MISMATCH" } });
    await expect(upload(jobId, mt.id, undefined, "BADFILE-1")).rejects.toMatchObject({
      response: { code: "FILE_EMPTY" },
    });
    expect(await service.getForJob(companyId, jobId)).toBeNull();
  });

  it("replaces the PDF: previous version stays queryable; number, token, issuedAt and source are immutable", async () => {
    const { jobId } = await makeJob({ withDevice: true });
    const mt = await makeMember("TECHNICIAN_MANAGER");
    const first = await upload(jobId, mt.id, pdfFile("v1.pdf"), "IMMUT-2026-1");
    const firstRow = await prisma.certificate.findUniqueOrThrow({ where: { id: first.id } });
    const firstVersionId = first.currentVersionId!;

    // number omitted, or repeated identically: both accepted as a plain replace.
    const second = await upload(jobId, mt.id, pdfFile("v2.pdf", PDF_2), undefined);
    const third = await upload(jobId, mt.id, pdfFile("v1.pdf"), "IMMUT-2026-1");

    expect(second.id).toBe(first.id);
    expect(third.versions).toHaveLength(3);
    expect(third.currentVersionId).not.toBe(firstVersionId);
    expect(third.versions.find((v) => v.id === firstVersionId)!.isCurrent).toBe(false);
    const priorFileObject = await prisma.fileObject.findUniqueOrThrow({ where: { id: firstVersionId } });
    expect(await driver.exists(priorFileObject.storageKey)).toBe(true);

    const after = await prisma.certificate.findUniqueOrThrow({ where: { id: first.id } });
    expect(after.number).toBe(firstRow.number);
    expect(after.source).toBe("UPLOADED");
    expect(after.verificationToken).toBe(firstRow.verificationToken);
    expect(after.issuedAt!.getTime()).toBe(firstRow.issuedAt!.getTime());

    // A different number can never overwrite the issued identity.
    await expect(upload(jobId, mt.id, pdfFile("v9.pdf", Buffer.concat([PDF, Buffer.from("9")])), "OTHER-NUMBER")).rejects.toMatchObject({
      response: { code: "CERTIFICATE_NUMBER_IMMUTABLE" },
    });
    expect((await prisma.certificate.findUniqueOrThrow({ where: { id: first.id } })).number).toBe(firstRow.number);

    expect(await prisma.auditLog.findFirst({ where: { action: "CERTIFICATE_REPLACED", targetId: first.id } })).not.toBeNull();
  });

  it("refuses a byte-identical re-upload of the current version, but allows re-uploading an older version", async () => {
    const { jobId } = await makeJob({ withDevice: true });
    const mt = await makeMember("TECHNICIAN_MANAGER");
    await upload(jobId, mt.id, pdfFile("v1.pdf"), "DUPFILE-1");
    await expect(upload(jobId, mt.id, pdfFile("v1-again.pdf"), "DUPFILE-1")).rejects.toMatchObject({
      response: { code: "CERTIFICATE_DUPLICATE_FILE" },
    });
    await upload(jobId, mt.id, pdfFile("v2.pdf", PDF_2), "DUPFILE-1");
    const third = await upload(jobId, mt.id, pdfFile("v1.pdf"), "DUPFILE-1");
    expect(third.versions).toHaveLength(3);
  });

  it("REGRESSION: a legacy DRAFT row (historical CER number) is never renumbered, promoted or given a token by an upload", async () => {
    const { jobId } = await makeJob({ withDevice: true });
    const mt = await makeMember("TECHNICIAN_MANAGER");
    const job = await prisma.calibrationJob.findUniqueOrThrow({
      where: { id: jobId },
      select: { deviceId: true, workOrder: { select: { customerId: true } } },
    });
    const legacy = await prisma.certificate.create({
      data: {
        companyId,
        customerId: job.workOrder.customerId,
        deviceId: job.deviceId!,
        calibrationJobId: jobId,
        number: "CER/2026/08/00042",
      },
    });
    const filesBefore = await prisma.fileObject.count({ where: { ownerType: "CERTIFICATE", ownerId: legacy.id } });
    const auditBefore = await prisma.auditLog.count({ where: { targetId: legacy.id } });

    // With or without an explicit external number: rejected, nothing changes.
    for (const number of [undefined, "LEGACY-EXT-77", "ANOTHER-1"]) {
      await expect(upload(jobId, mt.id, pdfFile("legacy.pdf"), number)).rejects.toMatchObject({
        response: { code: "CERTIFICATE_LEGACY_DRAFT_EXISTS" },
      });
    }

    const after = await prisma.certificate.findUniqueOrThrow({ where: { id: legacy.id } });
    expect(after.number).toBe("CER/2026/08/00042");
    expect(after.status).toBe("DRAFT");
    expect(after.source).toBe("UPLOADED");
    expect(after.verificationToken).toBeNull();
    expect(after.issuedAt).toBeNull();
    expect(after.pdfFileObjectId).toBeNull();
    expect(await prisma.fileObject.count({ where: { ownerType: "CERTIFICATE", ownerId: legacy.id } })).toBe(filesBefore);
    expect(await prisma.auditLog.count({ where: { targetId: legacy.id } })).toBe(auditBefore);
    expect(await prisma.certificate.count({ where: { calibrationJobId: jobId } })).toBe(1);
  });

  it("maps a unique-number race (pre-check passed, insert collides) to 409 CERTIFICATE_NUMBER_DUPLICATE and creates nothing", async () => {
    const first = await makeJob({ withDevice: true });
    const second = await makeJob({ withDevice: true });
    const mt = await makeMember("TECHNICIAN_MANAGER");
    await upload(first.jobId, mt.id, pdfFile("a.pdf"), "RACE-2026-0001");

    // Simulate the race: the free-number pre-check is blind, the DB unique index decides.
    const spy = vi
      .spyOn(service as unknown as { assertNumberFree: () => Promise<void> }, "assertNumberFree")
      .mockResolvedValueOnce(undefined);
    await expect(upload(second.jobId, mt.id, pdfFile("b.pdf", PDF_2), "RACE-2026-0001")).rejects.toMatchObject({
      response: { code: "CERTIFICATE_NUMBER_DUPLICATE" },
    });
    spy.mockRestore();
    expect(await service.getForJob(companyId, second.jobId)).toBeNull();
    expect(await prisma.certificate.count({ where: { number: "RACE-2026-0001" } })).toBe(1);
  });

  it("REGRESSION: if attaching the PDF to the new certificate fails, no ISSUED-without-PDF row and no orphan file remain", async () => {
    const { jobId } = await makeJob({ withDevice: true });
    const mt = await makeMember("TECHNICIAN_MANAGER");
    const removeBytes = vi.spyOn(driver, "delete");
    const updateSpy = vi
      .spyOn(prisma.certificate, "update")
      .mockRejectedValueOnce(new Error("attach failed"));

    await expect(upload(jobId, mt.id, pdfFile("attach-fail.pdf"), "ATTACH-FAIL-1")).rejects.toThrow("attach failed");
    updateSpy.mockRestore();

    expect(await service.getForJob(companyId, jobId)).toBeNull();
    expect(await prisma.certificate.count({ where: { number: "ATTACH-FAIL-1" } })).toBe(0);
    expect(await prisma.fileObject.count({ where: { originalName: "attach-fail.pdf" } })).toBe(0);
    expect(removeBytes).toHaveBeenCalled();
    removeBytes.mockRestore();
    const failure = await prisma.auditLog.findFirst({
      where: { action: "CERTIFICATE_UPLOADED", outcome: "FAILURE" },
      orderBy: { createdAt: "desc" },
    });
    expect(failure?.metadata).toMatchObject({ certificateNumber: "ATTACH-FAIL-1", rolledBack: true, stage: "attach" });

    // The same job can still be uploaded normally afterwards.
    const ok = await upload(jobId, mt.id, pdfFile("attach-ok.pdf"), "ATTACH-FAIL-1");
    expect(ok.status).toBe("ISSUED");
  });

  it("issues a QR PNG for the verification URL (locator only)", async () => {
    const { jobId } = await makeJob({ withDevice: true });
    const mt = await makeMember("TECHNICIAN_MANAGER");
    await upload(jobId, mt.id, pdfFile("q.pdf"), "QR-2026-1");
    const png = await service.getQrPng(companyId, jobId);
    expect(png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
  });

  it("downloads a version scoped to the certificate's own job (cross-job access is refused) and audits it", async () => {
    const { jobId } = await makeJob({ withDevice: true });
    const other = await makeJob({ withDevice: true });
    const mt = await makeMember("TECHNICIAN_MANAGER");
    const detail = await upload(jobId, mt.id, pdfFile("v1.pdf"), "DL-2026-1");
    await upload(other.jobId, mt.id, pdfFile("other.pdf"), "DL-2026-2");

    const { stream, fileObject } = await service.downloadVersion(
      companyId,
      jobId,
      detail.currentVersionId!,
      "TECHNICIAN_MANAGER",
      mt.id,
      ctx,
    );
    expect(fileObject.originalName).toBe("v1.pdf");
    expect((await readAll(stream)).equals(PDF)).toBe(true);

    const otherDetail = await service.getForJob(companyId, other.jobId);
    await expect(
      service.downloadVersion(companyId, jobId, otherDetail!.currentVersionId!, "TECHNICIAN_MANAGER", mt.id, ctx),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(await prisma.auditLog.findFirst({ where: { action: "CERTIFICATE_DOWNLOADED", targetId: detail.id } })).not.toBeNull();
  });

  it("deletes a superseded version but refuses to delete the current one; delete is SUPERADMIN-only", async () => {
    const { jobId } = await makeJob({ withDevice: true });
    const mt = await makeMember("TECHNICIAN_MANAGER");
    const admin = await makeMember("ADMIN");
    const superadmin = await makeMember("SUPERADMIN");
    const first = await upload(jobId, mt.id, pdfFile("v1.pdf"), "DEL-2026-1");
    const firstId = first.currentVersionId!;
    const second = await upload(jobId, mt.id, pdfFile("v2.pdf", PDF_2), "DEL-2026-1");

    await expect(
      service.deleteVersion(companyId, jobId, second.currentVersionId!, "SUPERADMIN", superadmin.id, ctx),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(service.deleteVersion(companyId, jobId, firstId, "ADMIN", admin.id, ctx)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect((await service.deleteVersion(companyId, jobId, firstId, "SUPERADMIN", superadmin.id, ctx)).deleted).toBe(true);
  });

  it("keeps the existing role matrix", () => {
    for (const role of ["TECHNICIAN_MANAGER", "SUPERVISOR", "ADMIN", "GENERAL_MANAGER"] as MembershipRole[]) {
      expect(hasPermission(role, "certificate", "update")).toBe(true);
      expect(hasPermission(role, "certificate", "delete")).toBe(false);
    }
    expect(hasPermission("TECHNICIAN", "certificate", "update")).toBe(false);
    expect(hasPermission("SUPERADMIN", "certificate", "delete")).toBe(true);
  });
});

describe("CertificateService — GENERATED certificates", () => {
  beforeAll(async () => {
    await prisma.documentNumberSequence.deleteMany({ where: { companyId, documentType: "CERTIFICATE_GENERATED" } });
    await prisma.certificate.deleteMany({ where: { number: { startsWith: "CRT/" }, companyId } });
  });

  it("creates the certificate only AT ISSUE: no row and no number before, none if the job is not accepted", async () => {
    const { jobId } = await makeJob({ withDevice: true }); // PENDING
    const gm = await makeMember("GENERAL_MANAGER");
    const sequencesBefore = await generatedSequenceCount();
    expect(await service.getForJob(companyId, jobId)).toBeNull();

    await expect(issue(jobId, gm.id)).rejects.toMatchObject({ response: { code: "CERTIFICATE_JOB_NOT_ACCEPTED" } });
    expect(await service.getForJob(companyId, jobId)).toBeNull();
    expect(await generatedSequenceCount()).toBe(sequencesBefore);
  });

  it("refuses to issue before the device identity is resolved", async () => {
    const { jobId } = await makeJob({ withDevice: false });
    await markAccepted(jobId);
    const gm = await makeMember("GENERAL_MANAGER");
    await expect(issue(jobId, gm.id)).rejects.toMatchObject({ response: { code: "CERTIFICATE_DEVICE_NOT_RESOLVED" } });
  });

  it("issues CRT/YYYY/MM/NNNNN (Asia/Jakarta month) as GENERATED + ISSUED with token, PDF and audit; the counter starts at 00001 and is per company", async () => {
    const { jobId } = await makeAcceptedJob();
    const gm = await makeMember("GENERAL_MANAGER");

    const detail = await issue(jobId, gm.id);
    const { year, month } = getZonedYearMonth(detail.issuedAt!, BUSINESS_TIME_ZONE);
    expect(detail.number).toBe(`CRT/${year}/${String(month).padStart(2, "0")}/00001`);
    expect(detail.source).toBe("GENERATED");
    expect(detail.status).toBe("ISSUED");

    const row = await prisma.certificate.findUniqueOrThrow({ where: { id: detail.id } });
    expect(row.verificationToken).toMatch(TOKEN_SHAPE);
    expect(detail.verificationUrl).toBe(`${PORTAL_ORIGIN}/verify/certificate/${row.verificationToken}`);
    expect(row.createdByUserId).toBe(gm.id);

    // PDF: persisted FileObject, linked, downloadable, a real PDF.
    expect(detail.versions).toHaveLength(1);
    expect(detail.currentVersionId).toBe(detail.versions[0]!.id);
    expect(detail.versions[0]!.originalName).toBe(`CRT-${year}-${String(month).padStart(2, "0")}-00001.pdf`);
    const { stream } = await service.downloadVersion(companyId, jobId, detail.currentVersionId!, "GENERAL_MANAGER", gm.id, ctx);
    const bytes = await readAll(stream);
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1000);

    const issued = await prisma.auditLog.findFirstOrThrow({ where: { action: "CERTIFICATE_ISSUED", targetId: detail.id } });
    expect(issued.metadata).toMatchObject({
      certificateId: detail.id,
      certificateNumber: detail.number,
      source: "GENERATED",
      calibrationJobId: jobId,
    });
    expect(await prisma.auditLog.findFirst({ where: { action: "CERTIFICATE_PDF_GENERATED", targetId: detail.id } })).not.toBeNull();

    // Second issue for the same job is refused (1 job = 1 certificate).
    await expect(issue(jobId, gm.id)).rejects.toMatchObject({ response: { code: "CERTIFICATE_ALREADY_EXISTS" } });
    expect(await prisma.certificate.count({ where: { calibrationJobId: jobId } })).toBe(1);
  });

  it("links the approved QualityReview when one exists", async () => {
    const { jobId } = await makeAcceptedJob();
    const gm = await makeMember("GENERAL_MANAGER");
    const review = await prisma.qualityReview.create({
      data: { companyId, calibrationJobId: jobId, reviewerUserId: gm.id, status: "APPROVED", decision: "APPROVE", reviewedAt: new Date() },
    });
    const detail = await issue(jobId, gm.id);
    expect((await prisma.certificate.findUniqueOrThrow({ where: { id: detail.id } })).qualityReviewId).toBe(review.id);
  });

  it("allocates unique, gap-free numbers under concurrent issuance", async () => {
    const jobs = await Promise.all(Array.from({ length: 4 }, () => makeAcceptedJob()));
    const gm = await makeMember("GENERAL_MANAGER");
    const before = await prisma.certificate.count({ where: { companyId, number: { startsWith: "CRT/" } } });

    const details = await Promise.all(jobs.map((j) => issue(j.jobId, gm.id)));

    const seqs = details.map((d) => Number(d.number.split("/")[3])).sort((a, b) => a - b);
    expect(new Set(details.map((d) => d.number)).size).toBe(4);
    expect(seqs).toEqual(Array.from({ length: 4 }, (_, i) => before + 1 + i));
    for (const d of details) expect(d.number).toMatch(/^CRT\/\d{4}\/\d{2}\/\d{5}$/);
  });

  it("skips a legacy/foreign number that already sits where the counter is heading (collision backstop), without touching the legacy row", async () => {
    const gm = await makeMember("GENERAL_MANAGER");
    const first = await makeAcceptedJob();
    const a = await issue(first.jobId, gm.id);
    const [, yyyy, mm, seq] = a.number.split("/");
    const nextTaken = `CRT/${yyyy}/${mm}/${String(Number(seq) + 1).padStart(5, "0")}`;

    // A pre-existing certificate (inserted outside the service, as legacy data would be).
    const legacyJob = await makeJob({ withDevice: true });
    const jobRow = await prisma.calibrationJob.findUniqueOrThrow({
      where: { id: legacyJob.jobId },
      select: { deviceId: true, workOrder: { select: { customerId: true } } },
    });
    const legacy = await prisma.certificate.create({
      data: {
        companyId,
        customerId: jobRow.workOrder.customerId,
        deviceId: jobRow.deviceId!,
        calibrationJobId: legacyJob.jobId,
        number: nextTaken,
        status: "ISSUED",
      },
    });

    const second = await makeAcceptedJob();
    const b = await issue(second.jobId, gm.id);
    expect(b.number).toBe(`CRT/${yyyy}/${mm}/${String(Number(seq) + 2).padStart(5, "0")}`);
    expect((await prisma.certificate.findUniqueOrThrow({ where: { id: legacy.id } })).number).toBe(nextTaken);
  });

  it("self-heals when MORE contiguous legacy CRT numbers than the attempt bound sit ahead of the counter", async () => {
    const gm = await makeMember("GENERAL_MANAGER");
    const first = await makeAcceptedJob();
    const a = await issue(first.jobId, gm.id);
    const [, yyyy, mm, seq] = a.number.split("/");

    const contiguous = MAX_COLLISION_ATTEMPTS + 1;
    for (let i = 1; i <= contiguous; i++) {
      const legacyJob = await makeJob({ withDevice: true });
      const jobRow = await prisma.calibrationJob.findUniqueOrThrow({
        where: { id: legacyJob.jobId },
        select: { deviceId: true, workOrder: { select: { customerId: true } } },
      });
      await prisma.certificate.create({
        data: {
          companyId,
          customerId: jobRow.workOrder.customerId,
          deviceId: jobRow.deviceId!,
          calibrationJobId: legacyJob.jobId,
          number: `CRT/${yyyy}/${mm}/${String(Number(seq) + i).padStart(5, "0")}`,
          status: "ISSUED",
        },
      });
    }

    const second = await makeAcceptedJob();
    const b = await issue(second.jobId, gm.id);
    expect(b.number).toBe(`CRT/${yyyy}/${mm}/${String(Number(seq) + contiguous + 1).padStart(5, "0")}`);

    // The healed counter was committed: the next issue continues right after, no re-skipping.
    const third = await makeAcceptedJob();
    const c = await issue(third.jobId, gm.id);
    expect(c.number).toBe(`CRT/${yyyy}/${mm}/${String(Number(seq) + contiguous + 2).padStart(5, "0")}`);
  });

  it("survives a malformed/over-long foreign CRT-looking number when the year's counter is created (seed cannot be poisoned)", async () => {
    const gm = await makeMember("GENERAL_MANAGER");
    await prisma.documentNumberSequence.deleteMany({ where: { companyId, documentType: "CERTIFICATE_GENERATED" } });
    const year = getZonedYearMonth(new Date(), BUSINESS_TIME_ZONE).year;
    for (const number of [`CRT/${year}/ABC`, `CRT/${year}/09/123456`]) {
      const legacyJob = await makeJob({ withDevice: true });
      const jobRow = await prisma.calibrationJob.findUniqueOrThrow({
        where: { id: legacyJob.jobId },
        select: { deviceId: true, workOrder: { select: { customerId: true } } },
      });
      await prisma.certificate.create({
        data: {
          companyId,
          customerId: jobRow.workOrder.customerId,
          deviceId: jobRow.deviceId!,
          calibrationJobId: legacyJob.jobId,
          number,
          status: "ISSUED",
        },
      });
    }
    const wellFormed = (
      await prisma.certificate.findMany({ where: { companyId, number: { startsWith: `CRT/${year}/` } }, select: { number: true } })
    )
      .map((c) => c.number)
      .filter((n) => /^CRT\/\d{4}\/\d{2}\/\d{5}$/.test(n))
      .map((n) => Number(n.split("/")[3]));
    const { jobId } = await makeAcceptedJob();
    const detail = await issue(jobId, gm.id);
    expect(Number(detail.number.split("/")[3])).toBe(Math.max(0, ...wellFormed) + 1);
  });

  it("PDF failure leaves an ISSUED certificate (number is official) without a PDF, audits it, and a retry regenerates the PDF under the SAME number", async () => {
    const { jobId } = await makeAcceptedJob();
    const gm = await makeMember("GENERAL_MANAGER");
    const sequencesSpy = await prisma.certificate.count({ where: { companyId, number: { startsWith: "CRT/" } } });
    const spy = vi.spyOn(filesService, "upload").mockRejectedValueOnce(new Error("disk full"));

    await expect(issue(jobId, gm.id)).rejects.toMatchObject({ response: { code: "CERTIFICATE_PDF_GENERATION_FAILED" } });
    spy.mockRestore();

    const broken = await service.getForJob(companyId, jobId);
    expect(broken).not.toBeNull();
    expect(broken!.status).toBe("ISSUED");
    expect(broken!.source).toBe("GENERATED");
    expect(broken!.currentVersionId).toBeNull();
    expect(await prisma.certificate.count({ where: { companyId, number: { startsWith: "CRT/" } } })).toBe(sequencesSpy + 1);
    const failure = await prisma.auditLog.findFirstOrThrow({
      where: { action: "CERTIFICATE_PDF_GENERATION_FAILED", targetId: broken!.id },
    });
    expect(failure.outcome).toBe("FAILURE");

    const retried = await issue(jobId, gm.id);
    expect(retried.id).toBe(broken!.id);
    expect(retried.number).toBe(broken!.number);
    expect(retried.currentVersionId).not.toBeNull();
    expect(await prisma.certificate.count({ where: { calibrationJobId: jobId } })).toBe(1);
  });

  it("fails before allocating anything when the customer portal origin is not configured", async () => {
    const { jobId } = await makeAcceptedJob();
    const gm = await makeMember("GENERAL_MANAGER");
    const sequencesBefore = await prisma.certificate.count({ where: { companyId, number: { startsWith: "CRT/" } } });
    const saved = process.env.NEXT_PUBLIC_CUSTOMER_PORTAL_URL;
    delete process.env.NEXT_PUBLIC_CUSTOMER_PORTAL_URL;
    try {
      await expect(issue(jobId, gm.id)).rejects.toMatchObject({
        response: { code: "CERTIFICATE_VERIFICATION_ORIGIN_NOT_CONFIGURED" },
      });
    } finally {
      process.env.NEXT_PUBLIC_CUSTOMER_PORTAL_URL = saved;
    }
    expect(await service.getForJob(companyId, jobId)).toBeNull();
    expect(await prisma.certificate.count({ where: { companyId, number: { startsWith: "CRT/" } } })).toBe(sequencesBefore);
  });

  it("is immutable: an upload cannot replace a generated PDF, and the file layer locks the owner", async () => {
    const { jobId } = await makeAcceptedJob();
    const gm = await makeMember("GENERAL_MANAGER");
    const detail = await issue(jobId, gm.id);

    await expect(upload(jobId, gm.id, pdfFile("swap.pdf"), "SWAP-1", "GENERAL_MANAGER")).rejects.toMatchObject({
      response: { code: "CERTIFICATE_GENERATED_IMMUTABLE" },
    });
    await expect(
      filesService.upload({ companyId, userId: gm.id, role: "GENERAL_MANAGER", ownerType: "CERTIFICATE", ownerId: detail.id, file: pdfFile("swap2.pdf") }),
    ).rejects.toMatchObject({ response: { code: "FILE_OWNER_LOCKED" } });
    const after = await service.getForJob(companyId, jobId);
    expect(after!.versions).toHaveLength(1);
    expect(after!.number).toBe(detail.number);
  });

  it("uploads never consume generated numbers: interleaved uploads and issues keep the CRT sequence contiguous", async () => {
    const gm = await makeMember("GENERAL_MANAGER");
    const mt = await makeMember("TECHNICIAN_MANAGER");
    const j1 = await makeAcceptedJob();
    const a = await issue(j1.jobId, gm.id);
    for (let i = 0; i < 3; i++) {
      const up = await makeJob({ withDevice: true });
      await upload(up.jobId, mt.id, pdfFile(`ext-${i}.pdf`), `EXT-INTERLEAVED-${i}`);
    }
    const j2 = await makeAcceptedJob();
    const b = await issue(j2.jobId, gm.id);
    expect(Number(b.number.split("/")[3])).toBe(Number(a.number.split("/")[3]) + 1);
  });
});

describe("CertificateService — generated numbering exhaustion", () => {
  it("maps sequence exhaustion at 99999 to 409 CERTIFICATE_NUMBER_SEQUENCE_EXHAUSTED and issues nothing", async () => {
    const gm = await makeMember("GENERAL_MANAGER");
    const { jobId } = await makeAcceptedJob();
    const year = getZonedYearMonth(new Date(), BUSINESS_TIME_ZONE).year;
    await prisma.documentNumberSequence.deleteMany({ where: { companyId, documentType: "CERTIFICATE_GENERATED", year } });
    await prisma.documentNumberSequence.create({
      data: { companyId, documentType: "CERTIFICATE_GENERATED", prefix: "CRT", year, lastSequence: MAX_DOCUMENT_SEQUENCE },
    });
    try {
      await expect(issue(jobId, gm.id)).rejects.toMatchObject({
        response: { code: "CERTIFICATE_NUMBER_SEQUENCE_EXHAUSTED" },
      });
      expect(await service.getForJob(companyId, jobId)).toBeNull();
      const seq = await prisma.documentNumberSequence.findFirstOrThrow({
        where: { companyId, documentType: "CERTIFICATE_GENERATED", year },
      });
      expect(seq.lastSequence).toBe(MAX_DOCUMENT_SEQUENCE); // rolled back, not corrupted
    } finally {
      await prisma.documentNumberSequence.deleteMany({ where: { companyId, documentType: "CERTIFICATE_GENERATED", year } });
    }
  });
});

describe("CertificateVerificationService", () => {
  let verification: CertificateVerificationService;
  let customerUserId: string;
  let strangerUserId: string;
  let staffUserId2: string;
  let uploadedToken: string;
  let generatedToken: string;
  let uploadedJobId: string;
  let generatedCertId: string;
  let uploadedCertId: string;

  beforeAll(async () => {
    verification = new CertificateVerificationService(filesService);
    const gm = await makeMember("GENERAL_MANAGER");
    const mt = await makeMember("TECHNICIAN_MANAGER");
    staffUserId2 = mt.id;

    const up = await makeJob({ withDevice: true });
    uploadedJobId = up.jobId;
    const uploaded = await upload(up.jobId, mt.id, pdfFile("PKM-CERT-2026-00123.pdf"), "PKM-VERIFY-2026-00123");
    uploadedCertId = uploaded.id;
    uploadedToken = (await prisma.certificate.findUniqueOrThrow({ where: { id: uploaded.id } })).verificationToken!;

    const gen = await makeAcceptedJob();
    const generated = await issue(gen.jobId, gm.id);
    generatedCertId = generated.id;
    generatedToken = (await prisma.certificate.findUniqueOrThrow({ where: { id: generated.id } })).verificationToken!;

    // A customer user linked to the uploaded certificate's customer, and to the generated one's.
    const customer = await prisma.user.create({
      data: { email: `cust-${randomUUID().slice(0, 10)}@x.co`, name: "Cust User", status: "ACTIVE" },
    });
    createdUserIds.push(customer.id);
    customerUserId = customer.id;
    await prisma.userMembership.create({ data: { userId: customer.id, companyId, role: "CUSTOMER", isDefault: false } });
    createdMembershipKeys.push({ userId: customer.id, companyId });
    for (const id of [uploaded.id, generated.id]) {
      const c = await prisma.certificate.findUniqueOrThrow({ where: { id }, select: { customerId: true } });
      await prisma.customerUserLink.create({ data: { userId: customer.id, customerId: c.customerId } });
    }

    const stranger = await prisma.user.create({
      data: { email: `strg-${randomUUID().slice(0, 10)}@x.co`, name: "Stranger", status: "ACTIVE" },
    });
    createdUserIds.push(stranger.id);
    strangerUserId = stranger.id;
  });

  const notFound = { response: { code: "CERTIFICATE_NOT_FOUND", message: "Certificate not found" } };

  it("resolves an UPLOADED certificate by token and shows the actual external number", async () => {
    const dto = await verification.resolve(uploadedToken, customerUserId);
    expect(dto.number).toBe("PKM-VERIFY-2026-00123");
    expect(dto.status).toBe("VALID");
    expect(dto.pdfAvailable).toBe(true);
    expect(dto.issuedAt).toBeInstanceOf(Date);
  });

  it("resolves a GENERATED certificate by token and shows the actual CRT number", async () => {
    const dto = await verification.resolve(generatedToken, customerUserId);
    expect(dto.number).toMatch(/^CRT\/\d{4}\/\d{2}\/\d{5}$/);
    expect(dto.status).toBe("VALID");
    expect(dto.pdfAvailable).toBe(true);
  });

  it("returns only a minimal, id-free DTO", async () => {
    const dto = await verification.resolve(uploadedToken, customerUserId);
    expect(Object.keys(dto).sort()).toEqual(
      ["customerName", "device", "issuedAt", "number", "pdfAvailable", "status", "validUntil"].sort(),
    );
    expect(Object.keys(dto.device).sort()).toEqual(["brand", "model", "name"]);
    const json = JSON.stringify(dto);
    expect(json).not.toContain(uploadedCertId);
    expect(json).not.toContain(uploadedToken);
    expect(json).not.toContain(uploadedJobId);
  });

  it("serves the stored PDF through the same path for both sources and audits the view", async () => {
    const up = await verification.openPdf(uploadedToken, customerUserId, ctx);
    expect((await readAll(up.stream)).equals(PDF)).toBe(true);
    expect(up.mimeType).toBe("application/pdf");
    const gen = await verification.openPdf(generatedToken, customerUserId, ctx);
    expect((await readAll(gen.stream)).subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: "CERTIFICATE_PDF_VIEWED_VIA_VERIFICATION", targetId: generatedCertId },
    });
    expect(log.userId).toBe(customerUserId);
  });

  it("a leftover CustomerUserLink grants nothing once the user's membership is removed", async () => {
    await prisma.userMembership.delete({ where: { userId_companyId: { userId: customerUserId, companyId } } });
    try {
      for (const attempt of [
        () => verification.resolve(uploadedToken, customerUserId),
        () => verification.openPdf(uploadedToken, customerUserId, ctx),
      ]) {
        await expect(attempt()).rejects.toMatchObject(notFound);
      }
    } finally {
      await prisma.userMembership.create({ data: { userId: customerUserId, companyId, role: "CUSTOMER", isDefault: false } });
    }
    // Restored membership → access is back (the link was never the problem).
    await expect(verification.resolve(uploadedToken, customerUserId)).resolves.toMatchObject({ status: "VALID" });
  });

  it("gives the identical not-found response for a malformed token, an unknown token and a certificate that is not yours", async () => {
    const unknownWellFormed = "A".repeat(43);
    const responses: unknown[] = [];
    for (const attempt of [
      () => verification.resolve("garbage", customerUserId),
      () => verification.resolve(unknownWellFormed, customerUserId),
      () => verification.resolve(uploadedToken.slice(0, -1) + (uploadedToken.endsWith("A") ? "B" : "A"), customerUserId),
      () => verification.resolve(uploadedToken, strangerUserId),
      () => verification.openPdf(uploadedToken, strangerUserId, ctx),
    ]) {
      const err = await attempt().then(
        () => null,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(NotFoundException);
      expect(err).toMatchObject(notFound);
      responses.push(JSON.stringify((err as NotFoundException).getResponse()));
    }
    expect(new Set(responses).size).toBe(1);
  });

  it("lets a staff member with certificate:read view it, but not a member without it or a disabled user", async () => {
    expect((await verification.resolve(uploadedToken, staffUserId2)).number).toBe("PKM-VERIFY-2026-00123");

    const cs = await makeMember("CUSTOMER_SERVICE");
    await expect(verification.resolve(uploadedToken, cs.id)).rejects.toMatchObject(notFound);

    await prisma.user.update({ where: { id: customerUserId }, data: { status: "DISABLED" } });
    await expect(verification.resolve(uploadedToken, customerUserId)).rejects.toMatchObject(notFound);
    await prisma.user.update({ where: { id: customerUserId }, data: { status: "ACTIVE" } });
  });

  it("evaluates status: EXPIRED (still viewable), REVOKED and SUPERSEDED (PDF withheld)", async () => {
    const past = new Date(Date.now() - 24 * 3600 * 1000);
    await prisma.certificate.update({ where: { id: uploadedCertId }, data: { validUntil: past } });
    const expired = await verification.resolve(uploadedToken, customerUserId);
    expect(expired.status).toBe("EXPIRED");
    expect(expired.pdfAvailable).toBe(true);

    const future = new Date(Date.now() + 24 * 3600 * 1000);
    await prisma.certificate.update({ where: { id: uploadedCertId }, data: { validUntil: future } });
    expect((await verification.resolve(uploadedToken, customerUserId)).status).toBe("VALID");

    await prisma.certificate.update({ where: { id: uploadedCertId }, data: { status: "REVOKED", revokeReason: "test" } });
    const revoked = await verification.resolve(uploadedToken, customerUserId);
    expect(revoked.status).toBe("REVOKED");
    expect(revoked.pdfAvailable).toBe(false);
    expect(JSON.stringify(revoked)).not.toContain("test");
    await expect(verification.openPdf(uploadedToken, customerUserId, ctx)).rejects.toMatchObject({
      response: { code: "CERTIFICATE_PDF_UNAVAILABLE" },
    });

    await prisma.certificate.update({ where: { id: uploadedCertId }, data: { status: "SUPERSEDED", revokeReason: null } });
    const superseded = await verification.resolve(uploadedToken, customerUserId);
    expect(superseded.status).toBe("SUPERSEDED");
    expect(superseded.pdfAvailable).toBe(false);

    await prisma.certificate.update({ where: { id: uploadedCertId }, data: { status: "ISSUED" } });
    expect((await verification.resolve(uploadedToken, customerUserId)).status).toBe("VALID");
  });

  it("does not expose a DRAFT row (no token, no public identity)", async () => {
    const draftJob = await makeJob({ withDevice: true });
    const jobRow = await prisma.calibrationJob.findUniqueOrThrow({
      where: { id: draftJob.jobId },
      select: { deviceId: true, workOrder: { select: { customerId: true } } },
    });
    const draft = await prisma.certificate.create({
      data: {
        companyId,
        customerId: jobRow.workOrder.customerId,
        deviceId: jobRow.deviceId!,
        calibrationJobId: draftJob.jobId,
        number: "CER/2026/08/00099",
        verificationToken: "D".repeat(43),
      },
    });
    expect(draft.status).toBe("DRAFT");
    await expect(verification.resolve("D".repeat(43), staffUserId2)).rejects.toMatchObject(notFound);
  });
});

describe("HTTP layer (multipart upload, issue, QR and verification routes)", () => {
  let app: Awaited<ReturnType<typeof NestFactory.create>>;
  let base = "";
  // The REAL CompanyRoleGuard runs (session -> ACTIVE membership -> RBAC); only
  // Better Auth's session lookup is stubbed.
  let session: { user: { id: string; email: string } } | null = null;
  let tmUserId = "";
  let getSessionSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    class HttpTestModule {}
    Module({
      controllers: [CalibrationJobsController, CertificateVerificationController],
      providers: [
        { provide: CalibrationJobsService, useValue: {} },
        { provide: MeasurementResultsService, useValue: {} },
        { provide: PhysicalCheckResultsService, useValue: {} },
        { provide: KontrolAlatService, useValue: {} },
        { provide: LkDownloadService, useValue: {} },
        { provide: CertificateService, useFactory: () => service },
        { provide: CertificateVerificationService, useFactory: () => new CertificateVerificationService(filesService) },
        CompanyRoleGuard,
      ],
    })(HttpTestModule);
    app = await NestFactory.create(HttpTestModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    base = (await app.getUrl()).replace("[::1]", "127.0.0.1");
    getSessionSpy = vi.spyOn(auth.api, "getSession").mockImplementation((async () => session) as never);
    const tm = await makeMember("TECHNICIAN_MANAGER");
    tmUserId = tm.id;
    session = { user: { id: tm.id, email: "http-tm@test.local" } };
  });

  afterAll(async () => {
    getSessionSpy?.mockRestore();
    await app?.close();
  });

  function multipart(fields: Record<string, string>, file?: { name: string; bytes: Buffer }, fileFirst = false) {
    const form = new FormData();
    const addFile = () => file && form.append("file", new Blob([new Uint8Array(file.bytes)], { type: "application/pdf" }), file.name);
    if (fileFirst) addFile();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    if (!fileFirst) addFile();
    return form;
  }

  const post = (jobId: string, form: FormData) =>
    fetch(`${base}/calibration-jobs/${jobId}/certificate/versions`, { method: "POST", body: form });

  it("POST multipart with certificateNumber: 201, UPLOADED + ISSUED, number stored verbatim (filename ignored)", async () => {
    const { jobId } = await makeJob({ withDevice: true });
    const res = await post(jobId, multipart({ certificateNumber: "HTTP-PKM-2026-00123" }, { name: "totally-different.pdf", bytes: PDF }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { number: string; source: string; status: string; verificationUrl: string };
    expect(body).toMatchObject({ number: "HTTP-PKM-2026-00123", source: "UPLOADED", status: "ISSUED" });
    expect(body.verificationUrl).toMatch(/^https:\/\/customer\.example\.test\/verify\/certificate\/[A-Za-z0-9_-]{43}$/);
    const row = await prisma.certificate.findUniqueOrThrow({ where: { calibrationJobId: jobId } });
    expect(row.number).toBe("HTTP-PKM-2026-00123");
  });

  it("the number field is read even when it arrives AFTER the file part", async () => {
    const { jobId } = await makeJob({ withDevice: true });
    const res = await post(jobId, multipart({ certificateNumber: "HTTP-LATE-FIELD-1" }, { name: "x.pdf", bytes: PDF }, true));
    expect(res.status).toBe(201);
    expect(((await res.json()) as { number: string }).number).toBe("HTTP-LATE-FIELD-1");
  });

  it("rejects, over HTTP, a missing number (400), a reserved CRT/ number (400) and a non-PDF (400) without creating anything", async () => {
    const { jobId } = await makeJob({ withDevice: true });
    const missing = await post(jobId, multipart({}, { name: "a.pdf", bytes: PDF }));
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({ code: "CERTIFICATE_NUMBER_REQUIRED" });

    const reserved = await post(jobId, multipart({ certificateNumber: "CRT/2026/09/00001" }, { name: "a.pdf", bytes: PDF }));
    expect(reserved.status).toBe(400);
    expect(await reserved.json()).toMatchObject({ code: "CERTIFICATE_NUMBER_RESERVED" });

    const notPdf = await post(jobId, multipart({ certificateNumber: "HTTP-NOT-PDF" }, { name: "a.pdf", bytes: Buffer.from("plain text") }));
    expect(notPdf.status).toBe(400);
    expect(await service.getForJob(companyId, jobId)).toBeNull();
  });

  it("returns 409 for a duplicate number and for a legacy DRAFT record", async () => {
    const a = await makeJob({ withDevice: true });
    const b = await makeJob({ withDevice: true });
    expect((await post(a.jobId, multipart({ certificateNumber: "HTTP-DUP-1" }, { name: "a.pdf", bytes: PDF }))).status).toBe(201);
    const dup = await post(b.jobId, multipart({ certificateNumber: "HTTP-DUP-1" }, { name: "b.pdf", bytes: PDF_2 }));
    expect(dup.status).toBe(409);
    expect(await dup.json()).toMatchObject({ code: "CERTIFICATE_NUMBER_DUPLICATE" });

    const legacyJob = await makeJob({ withDevice: true });
    const jr = await prisma.calibrationJob.findUniqueOrThrow({
      where: { id: legacyJob.jobId },
      select: { deviceId: true, workOrder: { select: { customerId: true } } },
    });
    await prisma.certificate.create({
      data: { companyId, customerId: jr.workOrder.customerId, deviceId: jr.deviceId!, calibrationJobId: legacyJob.jobId, number: "CER/2026/08/00777" },
    });
    const legacy = await post(legacyJob.jobId, multipart({ certificateNumber: "HTTP-LEGACY-1" }, { name: "c.pdf", bytes: PDF }));
    expect(legacy.status).toBe(409);
    expect(await legacy.json()).toMatchObject({ code: "CERTIFICATE_LEGACY_DRAFT_EXISTS" });
  });

  it("POST issue creates a GENERATED certificate and GET qr returns a PNG", async () => {
    const { jobId } = await makeAcceptedJob();
    const gm = await makeMember("GENERAL_MANAGER");
    session = { user: { id: gm.id, email: "http-gm@test.local" } };
    const res = await fetch(`${base}/calibration-jobs/${jobId}/certificate/issue`, { method: "POST" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { number: string; source: string; status: string };
    expect(body.source).toBe("GENERATED");
    expect(body.status).toBe("ISSUED");
    expect(body.number).toMatch(/^CRT\/\d{4}\/\d{2}\/\d{5}$/);

    const qr = await fetch(`${base}/calibration-jobs/${jobId}/certificate/qr`);
    expect(qr.status).toBe(200);
    expect(qr.headers.get("content-type")).toContain("image/png");
    expect((await qr.arrayBuffer()).byteLength).toBeGreaterThan(200);

    // RBAC is real: a technician manager may not issue.
    const denied = await makeAcceptedJob();
    session = { user: { id: tmUserId, email: "http-tm@test.local" } };
    const forbidden = await fetch(`${base}/calibration-jobs/${denied.jobId}/certificate/issue`, { method: "POST" });
    expect(forbidden.status).toBe(403);
    expect(await service.getForJob(companyId, denied.jobId)).toBeNull();
  });

  describe("GET /certificate-verification/:token", () => {
    let token: string;
    let customerUserId: string;
    let strangerUserId: string;

    beforeAll(async () => {
      const { jobId } = await makeJob({ withDevice: true });
      const uploaded = await service.uploadVersion(companyId, jobId, tmUserId, "TECHNICIAN_MANAGER", pdfFile("verify-http.pdf"), "HTTP-VERIFY-2026-1", ctx);
      const row = await prisma.certificate.findUniqueOrThrow({ where: { id: uploaded.id } });
      token = row.verificationToken!;
      const customer = await prisma.user.create({ data: { email: `http-cust-${randomUUID().slice(0, 8)}@x.co`, name: "Http Cust", status: "ACTIVE" } });
      const stranger = await prisma.user.create({ data: { email: `http-strg-${randomUUID().slice(0, 8)}@x.co`, name: "Http Stranger", status: "ACTIVE" } });
      createdUserIds.push(customer.id, stranger.id);
      customerUserId = customer.id;
      strangerUserId = stranger.id;
      await prisma.userMembership.create({ data: { userId: customer.id, companyId, role: "CUSTOMER", isDefault: false } });
      createdMembershipKeys.push({ userId: customer.id, companyId });
      await prisma.customerUserLink.create({ data: { userId: customer.id, customerId: row.customerId } });
    });

    it("401 without a session (anonymous callers never see a certificate)", async () => {
      session = null;
      expect((await fetch(`${base}/certificate-verification/${token}`)).status).toBe(401);
      expect((await fetch(`${base}/certificate-verification/${token}/pdf`)).status).toBe(401);
    });

    it("200 with the minimal DTO for the linked customer, showing the actual external number", async () => {
      session = { user: { id: customerUserId, email: "c@test.local" } };
      const res = await fetch(`${base}/certificate-verification/${token}`);
      expect(res.status).toBe(200);
      const dto = (await res.json()) as Record<string, unknown>;
      expect(dto).toMatchObject({ number: "HTTP-VERIFY-2026-1", status: "VALID", pdfAvailable: true });
      expect(Object.keys(dto).sort()).toEqual(["customerName", "device", "issuedAt", "number", "pdfAvailable", "status", "validUntil"]);
      expect(JSON.stringify(dto)).not.toContain(token);
    });

    it("streams the stored PDF inline for the linked customer", async () => {
      session = { user: { id: customerUserId, email: "c@test.local" } };
      const res = await fetch(`${base}/certificate-verification/${token}/pdf`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/pdf");
      expect(res.headers.get("content-disposition")).toContain("inline");
      expect(Buffer.from(await res.arrayBuffer()).equals(PDF)).toBe(true);
    });

    it("404 with the SAME body for someone else's certificate, an unknown token and a malformed token", async () => {
      session = { user: { id: strangerUserId, email: "s@test.local" } };
      const bodies: string[] = [];
      for (const t of [token, "B".repeat(43), "not-a-token"]) {
        const res = await fetch(`${base}/certificate-verification/${t}`);
        expect(res.status).toBe(404);
        bodies.push(JSON.stringify(await res.json()));
      }
      expect(new Set(bodies).size).toBe(1);
      expect(JSON.parse(bodies[0]!)).toMatchObject({ code: "CERTIFICATE_NOT_FOUND" });
      expect((await fetch(`${base}/certificate-verification/${token}/pdf`)).status).toBe(404);
    });
  });
});
