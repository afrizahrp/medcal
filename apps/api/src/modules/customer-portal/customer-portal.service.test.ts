import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ForbiddenException, Module, NotFoundException } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma, prisma } from "@medcal/db";
import type { CalibrationJobStatus, MembershipRole } from "@medcal/db";
import { auth } from "@medcal/auth";
import { CalibrationRequestsService } from "../calibration-requests/calibration-requests.service";
import { QuotationsService } from "../quotations/quotations.service";
import { PurchaseOrdersService } from "../purchase-orders/purchase-orders.service";
import { WorkOrdersService } from "../work-orders/work-orders.service";
import { FilesService } from "../files/files.service";
import { FileOwnerPolicyRegistry } from "../files/owner-policy";
import { LocalDiskDriver } from "../files/storage/local-disk.driver";
import { buildStorageKey } from "../files/storage/storage-key";
import { certificateFileOwnerPolicy } from "../calibration-jobs/certificate-file-owner-policy";
import {
  CustomerCalibrationJobsController,
  CustomerWorkOrdersController,
} from "./customer-portal.controller";
import { CustomerPortalService } from "./customer-portal.service";

const companyId = "PKM";
const staffUserId = "customer-portal-staff";
const PDF = Buffer.from("%PDF-1.4\ncustomer-portal\n%%EOF\n");

const calibrationRequestsService = new CalibrationRequestsService();
const quotationsService = new QuotationsService();
const workOrdersService = new WorkOrdersService();
const purchaseOrdersService = new PurchaseOrdersService();

const createdWorkOrderIds: string[] = [];
const createdQuotationIds: string[] = [];
const createdCalibrationRequestIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdDeviceTypeIds: string[] = [];
const createdDeviceCategoryIds: string[] = [];
const createdDeviceIds: string[] = [];
const createdCertificateIds: string[] = [];
const createdFileIds: string[] = [];
const createdUserIds: string[] = [];
const createdMembershipKeys: Array<{ userId: string; companyId: string }> = [];

let root = "";
let driver: LocalDiskDriver;
let portal: CustomerPortalService;

let customerAId = "";
let customerBId = "";
let userAId = "";
let userBId = "";
let unlinkedUserId = "";
let revokedUserId = "";
let notStartedId = "";
let activeId = "";
let cancelledId = "";
let otherId = "";
let jobs: Array<{ id: string; unitOrdinal: number }> = [];

const JOB_STATUSES: CalibrationJobStatus[] = [
  "PENDING",
  "IN_PROGRESS",
  "SUBMITTED",
  "REWORK",
  "ACCEPTED_BY_QA",
  "ACCEPTED_BY_QA",
  "ACCEPTED_BY_QA",
  "IN_PROGRESS",
];

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
    create: { id: staffUserId, email: `${staffUserId}@medcal.test`, name: "Portal Staff", status: "ACTIVE" },
    update: {},
  });
  createdUserIds.push(staffUserId);
}

async function makeMember(role: MembershipRole) {
  const user = await prisma.user.create({
    data: { email: `cp-${randomUUID().slice(0, 10)}@x.co`, name: `CP ${role}`.slice(0, 50), status: "ACTIVE" },
  });
  createdUserIds.push(user.id);
  await prisma.userMembership.create({ data: { userId: user.id, companyId, role, isDefault: false } });
  createdMembershipKeys.push({ userId: user.id, companyId });
  return user;
}

async function linkCustomer(customerId: string) {
  const user = await makeMember("CUSTOMER");
  await prisma.customerUserLink.create({ data: { userId: user.id, customerId } });
  return user;
}

async function createApprovedPo(qty: number) {
  await ensureNonPpnTax();
  await ensureStaffUser();
  const category = await prisma.deviceCategory.create({
    data: { code: `CPCAT${randomUUID().slice(0, 8)}`, name: "CP Cat" },
  });
  createdDeviceCategoryIds.push(category.id);
  const deviceType = await prisma.deviceType.create({
    data: { categoryId: category.id, code: `CPDT${randomUUID().slice(0, 8).toUpperCase()}`, name: "CP Device" },
  });
  createdDeviceTypeIds.push(deviceType.id);
  const customer = await prisma.customer.create({
    data: { companyId, number: `CUS/CP/${randomUUID().slice(0, 8)}`, name: `Portal ${randomUUID().slice(0, 6)}` },
  });
  createdCustomerIds.push(customer.id);

  const request = await calibrationRequestsService.create(companyId, staffUserId, {
    customerId: customer.id,
    serviceMode: "ON_SITE",
    items: [{ deviceTypeId: deviceType.id, qty }],
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
  const purchaseOrder = await purchaseOrdersService.create(companyId, {
    quotationId: quotation.id,
    customerPoNumber: `CPO-${randomUUID().slice(0, 8).toUpperCase()}`,
    customerPoDate: new Date("2026-08-15T00:00:00.000Z"),
  });
  await purchaseOrdersService.approve(companyId, purchaseOrder.id, staffUserId);
  const item = purchaseOrder.items[0];
  if (!item) throw new Error("purchase order has no items");
  return { customerId: customer.id, purchaseOrderId: purchaseOrder.id, purchaseOrderItemId: item.id, deviceTypeId: deviceType.id };
}

async function createWorkOrder(purchaseOrderId: string, purchaseOrderItemId: string, qty: number) {
  const workOrder = await workOrdersService.create(companyId, {
    purchaseOrderId,
    items: [{ purchaseOrderItemId, qty }],
  });
  createdWorkOrderIds.push(workOrder.id);
  return workOrder;
}

async function issueCertificate(
  jobId: string,
  customerId: string,
  deviceTypeId: string,
  withPdf: boolean,
) {
  const device = await prisma.device.create({
    data: {
      companyId,
      code: `DVC-CP-${randomUUID().slice(0, 8).toUpperCase()}`,
      customerId,
      deviceTypeId,
    },
  });
  createdDeviceIds.push(device.id);
  await prisma.calibrationJob.update({ where: { id: jobId }, data: { deviceId: device.id } });
  const certificate = await prisma.certificate.create({
    data: {
      companyId,
      customerId,
      deviceId: device.id,
      calibrationJobId: jobId,
      number: `PORTAL-${randomUUID().slice(0, 8).toUpperCase()}`,
      status: "ISSUED",
      source: "UPLOADED",
      issuedAt: new Date("2026-09-01T00:00:00.000Z"),
    },
  });
  createdCertificateIds.push(certificate.id);
  if (!withPdf) return certificate;

  const storageFileId = randomUUID();
  const storageKey = buildStorageKey({
    companyId,
    ownerType: "CERTIFICATE",
    ownerId: certificate.id,
    fileId: storageFileId,
    extension: ".pdf",
  });
  const tmp = path.join(root, `${storageFileId}.pdf`);
  await writeFile(tmp, PDF);
  await driver.put(storageKey, tmp);
  const file = await prisma.fileObject.create({
    data: {
      companyId,
      ownerType: "CERTIFICATE",
      ownerId: certificate.id,
      storageKey,
      mimeType: "application/pdf",
      sizeBytes: PDF.length,
      originalName: "certificate.pdf",
    },
  });
  createdFileIds.push(file.id);
  await prisma.certificate.update({ where: { id: certificate.id }, data: { pdfFileObjectId: file.id } });
  return certificate;
}

function denialBody(err: unknown): unknown {
  if (err instanceof NotFoundException || err instanceof ForbiddenException) return err.getResponse();
  throw err;
}

async function caught(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (err) {
    return denialBody(err);
  }
  throw new Error("expected the call to be rejected");
}

describe("CustomerPortalService", () => {
  let app: Awaited<ReturnType<typeof NestFactory.create>>;
  let base = "";
  let session: { user: { id: string; email: string } } | null = null;
  let getSessionSpy: ReturnType<typeof vi.spyOn>;
  let deviceTypeA = "";

  beforeAll(async () => {
    process.env.COMPANY_ID = companyId;
    root = mkdtempSync(path.join(tmpdir(), "medcal-customer-portal-"));
    driver = new LocalDiskDriver(root);
    const registry = new FileOwnerPolicyRegistry();
    registry.register(certificateFileOwnerPolicy);
    portal = new CustomerPortalService(new FilesService(driver, registry));

    const technician = await makeMember("TECHNICIAN");
    const chainA = await createApprovedPo(12);
    customerAId = chainA.customerId;
    deviceTypeA = chainA.deviceTypeId;
    const notStarted = await createWorkOrder(chainA.purchaseOrderId, chainA.purchaseOrderItemId, 3);
    const active = await createWorkOrder(chainA.purchaseOrderId, chainA.purchaseOrderItemId, 8);
    const cancelled = await createWorkOrder(chainA.purchaseOrderId, chainA.purchaseOrderItemId, 1);
    notStartedId = notStarted.id;
    activeId = active.id;
    cancelledId = cancelled.id;

    for (const workOrderId of [active.id, cancelled.id]) {
      await workOrdersService.assign(companyId, workOrderId, {
        technicians: [{ technicianUserId: technician.id }],
      });
      await workOrdersService.start(companyId, workOrderId);
    }
    await workOrdersService.cancel(companyId, cancelled.id);

    jobs = await prisma.calibrationJob.findMany({
      where: { workOrderId: active.id },
      orderBy: { unitOrdinal: "asc" },
      select: { id: true, unitOrdinal: true },
    });
    if (jobs.length !== JOB_STATUSES.length) {
      throw new Error(`expected ${JOB_STATUSES.length} jobs, got ${jobs.length}`);
    }
    for (let index = 0; index < JOB_STATUSES.length; index += 1) {
      await prisma.calibrationJob.update({
        where: { id: jobs[index]!.id },
        data: { status: JOB_STATUSES[index]! },
      });
    }
    await prisma.calibrationJob.update({
      where: { id: jobs[0]!.id },
      data: { customerDeclaredDeviceName: "Pompa Infus Lantai Dua", technicianObservedSerial: "SN-ALPHA-001" },
    });
    await prisma.calibrationJob.update({
      where: { id: jobs[1]!.id },
      data: { customerDeclaredDeviceName: "Syringe Pump Lantai Dua" },
    });
    // Group fixture: jobs 1-4 stay on the order line, jobs 5-8 have no order line, and one of
    // them carries the SAME declared name - two groups that must stay separate.
    await prisma.calibrationJob.updateMany({
      where: { id: { in: jobs.slice(4).map((job) => job.id) } },
      data: { purchaseOrderItemId: null },
    });
    await prisma.calibrationJob.update({
      where: { id: jobs[4]!.id },
      data: { customerDeclaredDeviceName: "Pompa Infus Lantai Dua" },
    });
    await issueCertificate(jobs[5]!.id, customerAId, deviceTypeA, true);
    await issueCertificate(jobs[6]!.id, customerAId, deviceTypeA, false);
    await issueCertificate(jobs[7]!.id, customerAId, deviceTypeA, true);

    const chainB = await createApprovedPo(1);
    customerBId = chainB.customerId;
    const other = await createWorkOrder(chainB.purchaseOrderId, chainB.purchaseOrderItemId, 1);
    otherId = other.id;

    userAId = (await linkCustomer(customerAId)).id;
    userBId = (await linkCustomer(customerBId)).id;
    const unlinked = await makeMember("CUSTOMER");
    unlinkedUserId = unlinked.id;
    // A leftover link on a Customer of its own (a Customer has one portal user,
    // so it cannot share customer A) whose membership was then removed.
    const revokedCustomer = await prisma.customer.create({
      data: { companyId, number: `CUS/CP/${randomUUID().slice(0, 8)}`, name: `Portal revoked ${randomUUID().slice(0, 6)}` },
    });
    createdCustomerIds.push(revokedCustomer.id);
    const revoked = await linkCustomer(revokedCustomer.id);
    revokedUserId = revoked.id;
    await prisma.userMembership.delete({ where: { userId_companyId: { userId: revoked.id, companyId } } });

    class HttpTestModule {}
    Module({
      controllers: [CustomerWorkOrdersController, CustomerCalibrationJobsController],
      providers: [{ provide: CustomerPortalService, useValue: portal }],
    })(HttpTestModule);
    app = await NestFactory.create(HttpTestModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    base = (await app.getUrl()).replace("[::1]", "127.0.0.1");
    getSessionSpy = vi.spyOn(auth.api, "getSession").mockImplementation((async () => session) as never);
  }, 120_000);

  afterAll(async () => {
    getSessionSpy?.mockRestore();
    await app?.close();
    if (createdCertificateIds.length > 0) {
      await prisma.certificate.deleteMany({ where: { id: { in: createdCertificateIds } } });
    }
    if (createdFileIds.length > 0) {
      await prisma.fileObject.deleteMany({ where: { id: { in: createdFileIds } } });
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
      await prisma.customerUserLink.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
      await prisma.customerContact.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
      await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
    }
    await prisma.auditLog.deleteMany({
      where: { companyId, action: "CERTIFICATE_PDF_VIEWED_VIA_CUSTOMER_PORTAL" },
    });
    if (createdMembershipKeys.length > 0) {
      await prisma.userMembership.deleteMany({ where: { OR: createdMembershipKeys } });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it("reports item quantity, and nothing completed, before fan-out", async () => {
    const detail = await portal.getWorkOrder(userAId, notStartedId);
    expect(detail.progress).toEqual({ total: 3, completed: 0, inProgress: 0, notStarted: 3, percentage: 0 });
    expect((await portal.listJobs(userAId, notStartedId)).data).toEqual([]);
    expect(detail.certificates.availableCount).toBe(0);
    expect(detail.status).toBe("NOT_STARTED");
  });

  it("counts ACCEPTED_BY_QA as completed and keeps SUBMITTED and REWORK in progress", async () => {
    const detail = await portal.getWorkOrder(userAId, activeId);
    expect(detail.progress).toEqual({ total: 8, completed: 3, inProgress: 4, notStarted: 1, percentage: 38 });
    const listed = (await portal.listJobs(userAId, activeId)).data;
    expect([...listed].sort((a, b) => a.unitOrdinal - b.unitOrdinal).map((job) => job.status)).toEqual([
      "NOT_STARTED",
      "IN_PROGRESS",
      "IN_PROGRESS",
      "IN_PROGRESS",
      "COMPLETED",
      "COMPLETED",
      "COMPLETED",
      "IN_PROGRESS",
    ]);
  });

  it("exposes each certificate state without letting certificates change job progress", async () => {
    const detail = await portal.getWorkOrder(userAId, activeId);
    const byOrdinal = new Map((await portal.listJobs(userAId, activeId)).data.map((job) => [job.unitOrdinal, job]));
    expect(byOrdinal.get(5)?.certificate.availability).toBe("UNAVAILABLE");
    expect(byOrdinal.get(5)?.certificate.number).toBeNull();
    expect(byOrdinal.get(6)?.status).toBe("COMPLETED");
    expect(byOrdinal.get(6)?.certificate.availability).toBe("AVAILABLE");
    expect(byOrdinal.get(6)?.certificate.number).toMatch(/^PORTAL-/);
    expect(byOrdinal.get(7)?.certificate.availability).toBe("ISSUED_WITHOUT_PDF");
    expect(byOrdinal.get(7)?.certificate.number).toMatch(/^PORTAL-/);
    // Issued while the job is still in progress: visible, but not counted as completed.
    expect(byOrdinal.get(8)?.status).toBe("IN_PROGRESS");
    expect(byOrdinal.get(8)?.certificate.availability).toBe("AVAILABLE");
    expect(detail.certificates.availableCount).toBe(2);
    expect(detail.progress.completed).toBe(3);

    expect(await portal.getCertificate(userAId, jobs[4]!.id)).toMatchObject({ availability: "UNAVAILABLE" });
    expect(await portal.getCertificate(userAId, jobs[6]!.id)).toMatchObject({
      availability: "ISSUED_WITHOUT_PDF",
    });
    await expect(portal.openCertificatePdf(userAId, jobs[6]!.id, { ipAddress: null, userAgent: null })).rejects.toMatchObject({
      response: { code: "CERTIFICATE_PDF_UNAVAILABLE" },
    });
    const opened = await portal.openCertificatePdf(userAId, jobs[5]!.id, { ipAddress: null, userAgent: "vitest" });
    const chunks: Buffer[] = [];
    for await (const chunk of opened.stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    expect(Buffer.concat(chunks).equals(PDF)).toBe(true);
    expect(opened.mimeType).toContain("pdf");
  });

  it("identifies each unit by customer-safe device details and never exposes internal fields", async () => {
    const page = await portal.listJobs(userAId, activeId, { pageSize: 100 });
    const byOrdinal = new Map(page.data.map((job) => [job.unitOrdinal, job]));
    expect(byOrdinal.get(1)?.identity).toEqual({
      name: "Pompa Infus Lantai Dua",
      brand: null,
      model: null,
      serialNumber: "SN-ALPHA-001",
    });
    // Falls back to the device master name once a device is attached.
    expect(byOrdinal.get(6)?.identity.name).toBe("CP Device");

    const job = page.data[0]!;
    expect(Object.keys(job).sort()).toEqual(["certificate", "id", "identity", "status", "unitOrdinal", "unitTotal"]);
    expect(Object.keys(job.identity).sort()).toEqual(["brand", "model", "name", "serialNumber"]);
    expect(Object.keys(job.certificate).sort()).toEqual(["availability", "issuedAt", "number"]);
    const raw = JSON.stringify(page) + JSON.stringify(await portal.getWorkOrder(userAId, activeId));
    for (const hidden of ["PENDING", "SUBMITTED", "REWORK", "ACCEPTED_BY_QA", "deviceId", "DVC-", "akdAkl", "pdfFileObjectId", "customerId"]) {
      expect(raw).not.toContain(hidden);
    }
  });

  it("keeps a cancelled work order visible to its customer", async () => {
    const list = await portal.listWorkOrders(userAId);
    const cancelled = list.data.find((workOrder) => workOrder.id === cancelledId);
    expect(cancelled?.status).toBe("CANCELLED");
    expect(cancelled?.progress.total).toBe(1);
    const detail = await portal.getWorkOrder(userAId, cancelledId);
    expect(detail.status).toBe("CANCELLED");
    expect((await portal.listJobs(userAId, cancelledId)).data).toHaveLength(1);
  });

  it("lists only the signed-in customer's work orders", async () => {
    const list = await portal.listWorkOrders(userAId);
    expect(list.data.map((workOrder) => workOrder.id).sort()).toEqual(
      [notStartedId, activeId, cancelledId].sort(),
    );
    expect(list.data.map((workOrder) => workOrder.id)).not.toContain(otherId);
    const otherList = await portal.listWorkOrders(userBId);
    expect(otherList.data.map((workOrder) => workOrder.id)).toEqual([otherId]);
  });

  it("rejects another customer's work order, job, certificate and PDF with the same body as a missing id", async () => {
    expect(await caught(() => portal.getWorkOrder(userAId, otherId))).toEqual(
      await caught(() => portal.getWorkOrder(userAId, "missing-work-order")),
    );
    expect(await caught(() => portal.listJobs(userAId, otherId))).toEqual(
      await caught(() => portal.listJobs(userAId, "missing-work-order")),
    );
    const otherJobs = await portal.listJobs(userBId, otherId);
    // Customer B's work order has not started, so it has no job to swap. Use the
    // active job id, which belongs to customer A, from customer B's session.
    expect(await caught(() => portal.getJob(userBId, jobs[5]!.id))).toEqual(
      await caught(() => portal.getJob(userBId, "missing-job")),
    );
    expect(await caught(() => portal.getCertificate(userBId, jobs[5]!.id))).toEqual(
      await caught(() => portal.getCertificate(userBId, "missing-job")),
    );
    expect(await caught(() => portal.openCertificatePdf(userBId, jobs[5]!.id, { ipAddress: null, userAgent: null }))).toEqual(
      await caught(() => portal.openCertificatePdf(userBId, "missing-job", { ipAddress: null, userAgent: null })),
    );
    expect(otherJobs.data).toEqual([]);
    expect(customerBId).not.toBe(customerAId);
  });

  it("denies a user with no link and a user whose membership was removed, with the same response", async () => {
    const unlinked = await caught(() => portal.listWorkOrders(unlinkedUserId));
    const revoked = await caught(() => portal.listWorkOrders(revokedUserId));
    expect(unlinked).toEqual(revoked);
    expect(unlinked).toMatchObject({ code: "CUSTOMER_ACCESS_REQUIRED" });
  });

  describe("search, filters and pagination", () => {
    const ids = async (query: Parameters<CustomerPortalService["listWorkOrders"]>[1], user = userAId) =>
      (await portal.listWorkOrders(user, query)).data.map((workOrder) => workOrder.id).sort();

    it("filters work orders by customer-facing status", async () => {
      expect(await ids({ status: "NOT_STARTED" })).toEqual([notStartedId]);
      expect(await ids({ status: "IN_PROGRESS" })).toEqual([activeId]);
      expect(await ids({ status: "CANCELLED" })).toEqual([cancelledId]);
      expect(await ids({ status: "COMPLETED" })).toEqual([]);
    });

    it("filters work orders by how many units are finished", async () => {
      expect(await ids({ progress: "PARTIALLY_COMPLETED" })).toEqual([activeId]);
      // Includes a work order that has no jobs yet.
      expect(await ids({ progress: "NONE_COMPLETED" })).toEqual([notStartedId, cancelledId].sort());
      expect(await ids({ progress: "ALL_COMPLETED" })).toEqual([]);
    });

    it("filters work orders that have an openable certificate, ignoring issued-without-PDF ones", async () => {
      expect(await ids({ certificate: "AVAILABLE" })).toEqual([activeId]);
      expect((await portal.getWorkOrder(userAId, activeId)).certificates.availableCount).toBe(2);
    });

    it("searches work-order numbers and unit identity, case-insensitively", async () => {
      const list = await portal.listWorkOrders(userAId);
      const activeNumber = list.data.find((workOrder) => workOrder.id === activeId)!.number;
      expect(await ids({ search: activeNumber.toLowerCase() })).toEqual([activeId]);
      expect(await ids({ search: "lantai dua" })).toEqual([activeId]);
      expect(await ids({ search: "sn-alpha" })).toEqual([activeId]);
      expect(await ids({ search: "PORTAL-" })).toEqual([activeId]);
      expect(await ids({ search: "no-such-device" })).toEqual([]);
    });

    it("combines search with every filter", async () => {
      expect(
        await ids({ search: "lantai", status: "IN_PROGRESS", progress: "PARTIALLY_COMPLETED", certificate: "AVAILABLE" }),
      ).toEqual([activeId]);
      expect(await ids({ search: "lantai", status: "NOT_STARTED" })).toEqual([]);
      expect(await ids({ status: "NOT_STARTED", certificate: "AVAILABLE" })).toEqual([]);
    });

    it("paginates on the server and reports totals", async () => {
      const first = await portal.listWorkOrders(userAId, { pageSize: 2, page: 1 });
      const second = await portal.listWorkOrders(userAId, { pageSize: 2, page: 2 });
      expect(first).toMatchObject({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
      expect(first.data).toHaveLength(2);
      expect(second.data).toHaveLength(1);
      expect(new Set([...first.data, ...second.data].map((workOrder) => workOrder.id)).size).toBe(3);
      const beyond = await portal.listWorkOrders(userAId, { pageSize: 2, page: 9 });
      expect(beyond.data).toEqual([]);
      expect(beyond.total).toBe(3);
    });

    it("filters, searches and paginates a work order's units", async () => {
      const pageOne = await portal.listJobs(userAId, activeId, { pageSize: 3, page: 1 });
      expect(pageOne).toMatchObject({ page: 1, pageSize: 3, total: 8, totalPages: 3 });
      expect(pageOne.data).toHaveLength(3);
      const all = [
        ...pageOne.data,
        ...(await portal.listJobs(userAId, activeId, { pageSize: 3, page: 2 })).data,
        ...(await portal.listJobs(userAId, activeId, { pageSize: 3, page: 3 })).data,
      ];
      expect(new Set(all.map((job) => job.id)).size).toBe(8);

      expect((await portal.listJobs(userAId, activeId, { status: "COMPLETED" })).total).toBe(3);
      expect((await portal.listJobs(userAId, activeId, { status: "IN_PROGRESS" })).total).toBe(4);
      expect((await portal.listJobs(userAId, activeId, { status: "NOT_STARTED" })).total).toBe(1);
      expect((await portal.listJobs(userAId, activeId, { certificate: "AVAILABLE" })).total).toBe(2);
      expect((await portal.listJobs(userAId, activeId, { search: "SN-ALPHA" })).data.map((job) => job.unitOrdinal)).toEqual([1]);
      expect((await portal.listJobs(userAId, activeId, { search: "lantai dua" })).total).toBe(3);
      expect((await portal.listJobs(userAId, activeId, { search: "lantai dua", status: "IN_PROGRESS" })).total).toBe(1);
    });

    it("never lets search, filters or pagination reach another customer's records", async () => {
      expect(await ids({ search: "lantai dua" }, userBId)).toEqual([]);
      expect(await ids({ search: "PORTAL-" }, userBId)).toEqual([]);
      expect(await ids({ certificate: "AVAILABLE" }, userBId)).toEqual([]);
      expect(await ids({ progress: "NONE_COMPLETED" }, userBId)).toEqual([otherId]);
      expect((await portal.listWorkOrders(userBId, { pageSize: 100 })).total).toBe(1);
      expect(await caught(() => portal.listJobs(userBId, activeId, { search: "lantai" }))).toEqual(
        await caught(() => portal.listJobs(userBId, "missing-work-order", { search: "lantai" })),
      );
      for (const query of [{ progress: "NONE_COMPLETED" as const }, { status: "NOT_STARTED" as const }, { search: "CUS" }, {}]) {
        expect(await ids(query)).not.toContain(otherId);
      }
    });
  });

  describe("grouped unit list", () => {
    type Group = Awaited<ReturnType<CustomerPortalService["listUnitGroups"]>>["data"][number];
    const byTotal = (groups: Group[]) => [...groups].sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));

    it("groups units by order line, not by device name, with customer-facing counts", async () => {
      const result = await portal.listUnitGroups(userAId, activeId);
      expect(result).toMatchObject({ page: 1, pageSize: 10, total: 2, totalPages: 1, totalUnits: 8 });
      // Both groups carry the same device name but remain two groups.
      expect(result.data.map((group) => group.name)).toEqual(["Pompa Infus Lantai Dua", "Pompa Infus Lantai Dua"]);
      const [first, second] = result.data;
      const line = [first!, second!].find((group) => group.notStarted === 1)!;
      const noLine = [first!, second!].find((group) => group.completed === 3)!;
      expect(line).toMatchObject({ total: 4, completed: 0, inProgress: 3, notStarted: 1, availableCertificates: 0 });
      expect(noLine).toMatchObject({ total: 4, completed: 3, inProgress: 1, notStarted: 0, availableCertificates: 2 });
      expect(line.key).not.toBe(noLine.key);
      expect(line.unit).toBeNull();
    });

    it("never exposes the internal order-line id or any unit id in a group", async () => {
      const lineId = (await prisma.calibrationJob.findUnique({ where: { id: jobs[0]!.id }, select: { purchaseOrderItemId: true } }))!
        .purchaseOrderItemId!;
      const result = await portal.listUnitGroups(userAId, activeId);
      const raw = JSON.stringify(result);
      expect(raw).not.toContain(lineId);
      expect(raw).not.toContain("purchaseOrderItem");
      for (const group of result.data) {
        expect(Object.keys(group).sort()).toEqual(
          ["availableCertificates", "completed", "inProgress", "key", "name", "notStarted", "total", "unit"],
        );
      }
    });

    it("applies search and filters to the units before grouping, so counts cover matches only", async () => {
      const completed = await portal.listUnitGroups(userAId, activeId, { status: "COMPLETED" });
      expect(completed.data).toHaveLength(1);
      expect(completed.data[0]).toMatchObject({ total: 3, completed: 3, inProgress: 0, notStarted: 0 });
      expect(completed.totalUnits).toBe(3);

      const withCertificate = await portal.listUnitGroups(userAId, activeId, { certificate: "AVAILABLE" });
      expect(withCertificate.data).toHaveLength(1);
      expect(withCertificate.data[0]).toMatchObject({ total: 2, availableCertificates: 2 });

      expect((await portal.listUnitGroups(userAId, activeId, { search: "no-such-device" })).data).toEqual([]);
      expect((await portal.listUnitGroups(userAId, activeId, { search: "no-such-device" })).totalUnits).toBe(0);
    });

    it("names a group from the device type when no unit in it has a declared name", async () => {
      const result = await portal.listUnitGroups(userAId, activeId, { search: "cp device" });
      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.name).toBe("CP Device");
    });

    it("returns the unit inline only for a group of exactly one unit", async () => {
      const single = await portal.listUnitGroups(userAId, activeId, { search: "SN-ALPHA" });
      expect(single.data).toHaveLength(1);
      expect(single.data[0]).toMatchObject({ total: 1 });
      expect(single.data[0]!.unit).toMatchObject({
        unitOrdinal: 1,
        identity: { name: "Pompa Infus Lantai Dua", serialNumber: "SN-ALPHA-001" },
      });
      const multi = await portal.listUnitGroups(userAId, activeId);
      expect(multi.data.every((group) => group.unit === null)).toBe(true);
    });

    it("paginates groups", async () => {
      const first = await portal.listUnitGroups(userAId, activeId, { pageSize: 1, page: 1 });
      const second = await portal.listUnitGroups(userAId, activeId, { pageSize: 1, page: 2 });
      expect(first).toMatchObject({ total: 2, totalPages: 2, totalUnits: 8 });
      expect(first.data).toHaveLength(1);
      expect(second.data).toHaveLength(1);
      expect(first.data[0]!.key).not.toBe(second.data[0]!.key);
      expect((await portal.listUnitGroups(userAId, activeId, { pageSize: 1, page: 9 })).data).toEqual([]);
    });

    it("loads exactly one group's units through its key, with filters still applied", async () => {
      const groups = byTotal((await portal.listUnitGroups(userAId, activeId)).data);
      const seen = new Set<string>();
      for (const group of groups) {
        const units = await portal.listJobs(userAId, activeId, { group: group.key, pageSize: 100 });
        expect(units.total).toBe(group.total);
        expect(units.data).toHaveLength(group.total);
        for (const unit of units.data) {
          expect(seen.has(unit.id)).toBe(false);
          seen.add(unit.id);
        }
        const ordinals = units.data.map((unit) => unit.unitOrdinal);
        expect(ordinals).toEqual([...ordinals].sort((a, b) => a - b));
      }
      expect(seen.size).toBe(8);

      const target = groups.find((group) => group.completed === 3)!;
      const completedOnly = await portal.listJobs(userAId, activeId, { group: target.key, status: "COMPLETED" });
      expect(completedOnly.total).toBe(3);
      const notStartedOnly = await portal.listJobs(userAId, activeId, { group: target.key, status: "NOT_STARTED" });
      expect(notStartedOnly.total).toBe(0);
    });

    it("treats an unknown key, or a key from another work order, as an empty group", async () => {
      expect((await portal.listJobs(userAId, activeId, { group: "not-a-real-group-key" })).total).toBe(0);
      const aKey = (await portal.listUnitGroups(userAId, activeId)).data[0]!.key;
      expect((await portal.listJobs(userAId, cancelledId, { group: aKey })).total).toBe(0);
    });

    it("stays inside the signed-in customer's work orders", async () => {
      expect(await caught(() => portal.listUnitGroups(userBId, activeId))).toEqual(
        await caught(() => portal.listUnitGroups(userBId, "missing-work-order")),
      );
      expect(await caught(() => portal.listUnitGroups(unlinkedUserId, activeId))).toMatchObject({
        code: "CUSTOMER_ACCESS_REQUIRED",
      });
      // Customer B has a work order of their own; A's group key opens nothing there.
      const aKey = (await portal.listUnitGroups(userAId, activeId)).data[0]!.key;
      expect((await portal.listJobs(userBId, otherId, { group: aKey })).total).toBe(0);
      expect((await portal.listUnitGroups(userBId, otherId)).data).toEqual([]);
      // ...and A's key is useless against A's own other work orders too (keys are per work order).
      expect((await portal.listUnitGroups(userAId, notStartedId)).data).toEqual([]);
    });
  });

  describe("HTTP", () => {
    it("returns 401 without a session", async () => {
      session = null;
      expect((await fetch(`${base}/customer/work-orders`)).status).toBe(401);
      expect((await fetch(`${base}/customer/work-orders/${activeId}`)).status).toBe(401);
      expect((await fetch(`${base}/customer/calibration-jobs/${jobs[5]!.id}/certificate/pdf`)).status).toBe(401);
    });

    it("serves customer A's work order and ignores a client-supplied customerId", async () => {
      session = { user: { id: userAId, email: "a@test.local" } };
      const res = await fetch(`${base}/customer/work-orders?customerId=${customerBId}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: Array<{ id: string }>; total: number };
      expect(body.data.map((workOrder) => workOrder.id)).not.toContain(otherId);
      expect(body.data).toHaveLength(3);
      expect(body.total).toBe(3);
    });

    it("validates and applies the list query without trusting a customerId", async () => {
      session = { user: { id: userAId, email: "a@test.local" } };
      const filtered = await fetch(
        `${base}/customer/work-orders?status=IN_PROGRESS&certificate=AVAILABLE&search=lantai&customerId=${customerBId}`,
      );
      expect(filtered.status).toBe(200);
      const body = (await filtered.json()) as { data: Array<{ id: string }>; total: number };
      expect(body.data.map((workOrder) => workOrder.id)).toEqual([activeId]);

      const jobsRes = await fetch(`${base}/customer/work-orders/${activeId}/jobs?pageSize=2&page=2&status=COMPLETED`);
      expect(jobsRes.status).toBe(200);
      const jobsBody = (await jobsRes.json()) as { data: unknown[]; total: number; totalPages: number };
      expect(jobsBody).toMatchObject({ total: 3, totalPages: 2 });
      expect(jobsBody.data).toHaveLength(1);

      for (const bad of ["status=PLANNED", "progress=HALF", "certificate=NONE", "pageSize=1000", "page=0", "search="]) {
        expect((await fetch(`${base}/customer/work-orders?${bad}`)).status).toBe(400);
      }
      expect((await fetch(`${base}/customer/work-orders/${activeId}/jobs?status=CANCELLED`)).status).toBe(400);
    });

    it("serves grouped units over HTTP, validates the query, and rejects other customers", async () => {
      session = { user: { id: userAId, email: "a@test.local" } };
      const res = await fetch(`${base}/customer/work-orders/${activeId}/unit-groups?status=COMPLETED&customerId=${customerBId}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: Array<{ key: string; total: number }>; totalUnits: number };
      expect(body.data).toHaveLength(1);
      expect(body.totalUnits).toBe(3);

      const units = await fetch(`${base}/customer/work-orders/${activeId}/jobs?group=${body.data[0]!.key}`);
      expect(units.status).toBe(200);
      expect(((await units.json()) as { total: number }).total).toBe(4); // the unfiltered group has 4 units, 3 of them completed

      for (const bad of ["status=PLANNED", "pageSize=1000", "page=0", "search="]) {
        expect((await fetch(`${base}/customer/work-orders/${activeId}/unit-groups?${bad}`)).status).toBe(400);
      }
      expect((await fetch(`${base}/customer/work-orders/${activeId}/jobs?group=`)).status).toBe(400);

      session = { user: { id: userBId, email: "b@test.local" } };
      const foreign = await fetch(`${base}/customer/work-orders/${activeId}/unit-groups`);
      const missing = await fetch(`${base}/customer/work-orders/missing-work-order/unit-groups`);
      expect(foreign.status).toBe(404);
      expect(await foreign.json()).toEqual(await missing.json());

      session = null;
      expect((await fetch(`${base}/customer/work-orders/${activeId}/unit-groups`)).status).toBe(401);
    });

    it("returns the same 404 body for another customer's id and an unknown id", async () => {
      session = { user: { id: userAId, email: "a@test.local" } };
      const foreign = await fetch(`${base}/customer/work-orders/${otherId}`);
      const missing = await fetch(`${base}/customer/work-orders/missing-work-order`);
      expect(foreign.status).toBe(404);
      expect(missing.status).toBe(404);
      expect(await foreign.json()).toEqual(await missing.json());

      session = { user: { id: userBId, email: "b@test.local" } };
      const foreignPdf = await fetch(`${base}/customer/calibration-jobs/${jobs[5]!.id}/certificate/pdf`);
      const missingPdf = await fetch(`${base}/customer/calibration-jobs/missing-job/certificate/pdf`);
      expect(foreignPdf.status).toBe(404);
      expect(await foreignPdf.json()).toEqual(await missingPdf.json());

      session = { user: { id: userAId, email: "a@test.local" } };
      const pdf = await fetch(`${base}/customer/calibration-jobs/${jobs[5]!.id}/certificate/pdf`);
      expect(pdf.status).toBe(200);
      expect(pdf.headers.get("content-type")).toContain("application/pdf");
      expect(Buffer.from(await pdf.arrayBuffer()).equals(PDF)).toBe(true);
    });
  });
});
