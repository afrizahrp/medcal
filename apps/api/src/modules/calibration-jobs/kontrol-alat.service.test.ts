import { randomUUID } from "node:crypto";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { afterAll, describe, expect, it, vi } from "vitest";
import { Prisma, prisma } from "@medcal/db";
import type { MembershipRole } from "@medcal/db";
import { hasPermission, loadRolePermissionCache } from "@medcal/auth";
import { CalibrationRequestsService } from "../calibration-requests/calibration-requests.service";
import { QuotationsService } from "../quotations/quotations.service";
import { PurchaseOrdersService } from "../purchase-orders/purchase-orders.service";
import { WorkOrdersService } from "../work-orders/work-orders.service";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import { CalibrationJobsController } from "./calibration-jobs.controller";
import { CalibrationJobsService } from "./calibration-jobs.service";
import { MeasurementResultsService } from "./measurement-results.service";
import { PhysicalCheckResultsService } from "./physical-check-results.service";
import { KontrolAlatService } from "./kontrol-alat.service";

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));
vi.mock("@medcal/auth", async () => {
  const actual = await vi.importActual<typeof import("@medcal/auth")>("@medcal/auth");
  return { ...actual, auth: { api: { getSession: getSessionMock } } };
});

const svc = new KontrolAlatService();
const jobsService = new CalibrationJobsService();
const controller = new CalibrationJobsController(
  jobsService,
  new MeasurementResultsService(),
  new PhysicalCheckResultsService(),
  svc,
);
const calibrationRequestsService = new CalibrationRequestsService();
const quotationsService = new QuotationsService();
const purchaseOrdersService = new PurchaseOrdersService();
const workOrdersService = new WorkOrdersService();

const companyId = "PKM";
const staffUserId = "ka-staff-user";

const createdWorkOrderIds: string[] = [];
const createdQuotationIds: string[] = [];
const createdCalibrationRequestIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdDeviceTypeIds: string[] = [];
const createdDeviceCategoryIds: string[] = [];
const createdUserIds: string[] = [];
const createdMembershipKeys: Array<{ userId: string; companyId: string }> = [];

async function cleanup() {
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
    await prisma.calibrationRequest.deleteMany({
      where: { id: { in: createdCalibrationRequestIds } },
    });
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
    await prisma.userMembership.deleteMany({
      where: { OR: createdMembershipKeys },
    });
  }
  if (createdUserIds.length > 0) {
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

async function makeMember(role: MembershipRole) {
  const user = await prisma.user.create({
    data: {
      email: `ka-${randomUUID().slice(0, 10)}@x.co`,
      name: `KA ${role}`.slice(0, 50),
      status: "ACTIVE",
    },
  });
  createdUserIds.push(user.id);
  await prisma.userMembership.create({
    data: { userId: user.id, companyId, role, isDefault: false },
  });
  createdMembershipKeys.push({ userId: user.id, companyId });
  return user;
}

async function ensureStaffUser() {
  await prisma.user.upsert({
    where: { id: staffUserId },
    create: {
      id: staffUserId,
      email: `${staffUserId}@medcal.test`,
      name: "KA Staff",
      status: "ACTIVE",
    },
    update: {},
  });
}

async function startedJob(serviceMode: "SEND_TO_LAB" | "ON_SITE" = "SEND_TO_LAB") {
  await ensureNonPpnTax();
  await ensureStaffUser();
  const category = await prisma.deviceCategory.create({
    data: { code: `KACAT${randomUUID().slice(0, 8)}`, name: "KA Cat" },
  });
  createdDeviceCategoryIds.push(category.id);
  const deviceType = await prisma.deviceType.create({
    data: {
      categoryId: category.id,
      code: `KADT${randomUUID().slice(0, 8).toUpperCase()}`,
      name: "KA Device Type",
    },
  });
  createdDeviceTypeIds.push(deviceType.id);

  const customer = await prisma.customer.create({
    data: {
      companyId,
      number: `CUS/KA/${randomUUID().slice(0, 8)}`,
      name: `KA Cust ${randomUUID().slice(0, 6)}`,
    },
  });
  createdCustomerIds.push(customer.id);

  const request = await calibrationRequestsService.create(companyId, staffUserId, {
    customerId: customer.id,
    serviceMode,
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
  const quotation = await quotationsService.create(companyId, {
    requestId: request.id,
    taxCode: "T0",
  });
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
  const jobs = await prisma.calibrationJob.findMany({ where: { workOrderId: workOrder.id } });
  return { jobId: jobs[0]!.id, workOrderId: workOrder.id, technician, customerPoNumber: po.customerPoNumber };
}

describe("KontrolAlatService", () => {
  it("GET/PATCH inspection fields on a WOL job", async () => {
    const { jobId, technician } = await startedJob("SEND_TO_LAB");
    const got = await svc.get(companyId, jobId);
    expect(got.calibrationJobId).toBe(jobId);
    expect(got.completedAt).toBeNull();

    const patched = await svc.patch(companyId, jobId, technician.id, {
      workExecuted: true,
      visualPowerCable: true,
      functionInitialOk: true,
      capacity: "6 x 50 ml",
    });
    expect(patched.workExecuted).toBe(true);
    expect(patched.visualPowerCable).toBe(true);
    expect(patched.capacity).toBe("6 x 50 ml");
    expect(patched.createdByUserId).toBe(technician.id);
  });

  it("rejects ON_SITE jobs with KONTROL_ALAT_NOT_APPLICABLE", async () => {
    const { jobId, technician } = await startedJob("ON_SITE");
    await expect(svc.get(companyId, jobId)).rejects.toMatchObject({
      response: { code: "KONTROL_ALAT_NOT_APPLICABLE" },
    });
    await expect(
      svc.patch(companyId, jobId, technician.id, { workExecuted: true }),
    ).rejects.toMatchObject({ response: { code: "KONTROL_ALAT_NOT_APPLICABLE" } });
  });

  it("adds, updates, and removes accessories", async () => {
    const { jobId, technician } = await startedJob("SEND_TO_LAB");
    const added = await svc.addAccessory(companyId, jobId, technician.id, { label: "Adaptor" });
    expect(added.accessories).toHaveLength(1);
    expect(added.accessories[0]!.present).toBeNull();
    expect(added.createdByUserId).toBe(technician.id);

    const accessoryId = added.accessories[0]!.id;
    const updated = await svc.updateAccessory(companyId, jobId, accessoryId, { present: true });
    expect(updated.accessories[0]!.present).toBe(true);

    await svc.removeAccessory(companyId, jobId, accessoryId);
    const after = await svc.get(companyId, jobId);
    expect(after.accessories).toHaveLength(0);
  });

  it("sets completedAt when both signatures are present", async () => {
    const { jobId, technician } = await startedJob("SEND_TO_LAB");
    const admin = await makeMember("ADMIN");
    const afterAdmin = await svc.sign(companyId, jobId, admin.id, {
      signerKind: "ADMINISTRATION",
    });
    expect(afterAdmin.completedAt).toBeNull();
    expect(afterAdmin.createdByUserId).toBe(admin.id);
    expect(afterAdmin.signatures).toHaveLength(1);

    const afterTech = await svc.sign(companyId, jobId, technician.id, {
      signerKind: "TECHNICAL_OFFICER",
    });
    expect(afterTech.completedAt).toBeInstanceOf(Date);
    expect(afterTech.signatures).toHaveLength(2);
    expect(afterTech.createdByUserId).toBe(admin.id);
  });

  it("rejects certificateNumber before MT APPROVE and allows it after", async () => {
    const { jobId, technician } = await startedJob("SEND_TO_LAB");
    await expect(
      svc.patch(companyId, jobId, technician.id, { certificateNumber: "S.642" }),
    ).rejects.toMatchObject({ response: { code: "KONTROL_ALAT_CERTIFICATE_NOT_ALLOWED" } });

    await svc.patch(companyId, jobId, technician.id, { workExecuted: true });
    const admin = await makeMember("ADMIN");
    await svc.sign(companyId, jobId, admin.id, { signerKind: "ADMINISTRATION" });
    await svc.sign(companyId, jobId, technician.id, { signerKind: "TECHNICAL_OFFICER" });
    await jobsService.start(companyId, jobId);
    await jobsService.submitForReview(companyId, jobId);
    const manager = await makeMember("TECHNICIAN_MANAGER");
    await jobsService.decideQualityReview(companyId, jobId, manager.id, { decision: "APPROVE" });

    const patched = await svc.patch(companyId, jobId, technician.id, {
      certificateNumber: "S.642",
    });
    expect(patched.certificateNumber).toBe("S.642");
  });

  it("treats a blank certificateNumber as clear, not as an MT-gated write", async () => {
    const { jobId, technician } = await startedJob("SEND_TO_LAB");
    const cleared = await controller.patchKontrolAlat(companyId, technician.id, jobId, {
      certificateNumber: "  ",
    });
    expect(cleared.certificateNumber).toBeNull();
  });

  it("ON_SITE job payload exposes serviceMode and has no Kontrol Alat row", async () => {
    const { jobId } = await startedJob("ON_SITE");
    const row = await jobsService.findOneRow(companyId, jobId);
    expect(row.workOrder.serviceMode).toBe("ON_SITE");
    expect(row.kontrolAlat).toBeNull();
  });

  it("GET job includes serviceMode, customerPoNumber, and Kontrol Alat summary", async () => {
    const { jobId, customerPoNumber } = await startedJob("SEND_TO_LAB");
    const row = await jobsService.findOneRow(companyId, jobId);
    expect(row.workOrder.serviceMode).toBe("SEND_TO_LAB");
    expect(row.workOrder.purchaseOrder.customerPoNumber).toBe(customerPoNumber);
    expect(row.kontrolAlat?.id).toBeTruthy();
    expect(row.kontrolAlat?.completedAt).toBeNull();
  });

  it("controller PATCH rejects an empty body", async () => {
    const { jobId, technician } = await startedJob("SEND_TO_LAB");
    await expect(controller.patchKontrolAlat(companyId, technician.id, jobId, {})).rejects.toMatchObject({
      response: { code: "INVALID_KONTROL_ALAT" },
    });
  });

  it("requires a reason when workExecuted is false", async () => {
    const { jobId, technician } = await startedJob("SEND_TO_LAB");
    await expect(
      svc.patch(companyId, jobId, technician.id, { workExecuted: false }),
    ).rejects.toMatchObject({ response: { code: "KONTROL_ALAT_REASON_REQUIRED" } });
  });
});

describe("CalibrationJobsController — kontrol-alat RBAC", () => {
  const guard = new CompanyRoleGuard(new Reflector());

  async function ensureGrants() {
    for (const role of ["TECHNICIAN", "TECHNICIAN_MANAGER", "ADMIN"] as const) {
      await prisma.rolePermission.upsert({
        where: {
          role_resource_action: {
            role,
            resource: "calibrationJob",
            action: "recordKontrolAlat",
          },
        },
        create: { role, resource: "calibrationJob", action: "recordKontrolAlat" },
        update: {},
      });
    }
    await loadRolePermissionCache();
  }

  function contextFor(handlerName: keyof CalibrationJobsController) {
    return {
      switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
      getHandler: () => CalibrationJobsController.prototype[handlerName],
      getClass: () => CalibrationJobsController,
    } as never;
  }

  it("grants recordKontrolAlat to TECHNICIAN, TECHNICIAN_MANAGER, and ADMIN", async () => {
    await ensureGrants();
    expect(hasPermission("TECHNICIAN", "calibrationJob", "recordKontrolAlat")).toBe(true);
    expect(hasPermission("TECHNICIAN_MANAGER", "calibrationJob", "recordKontrolAlat")).toBe(true);
    expect(hasPermission("ADMIN", "calibrationJob", "recordKontrolAlat")).toBe(true);
    expect(hasPermission("CUSTOMER_SERVICE", "calibrationJob", "recordKontrolAlat")).toBe(false);
  });

  it("allows TECHNICIAN to PATCH Kontrol Alat", async () => {
    await ensureGrants();
    const tech = await makeMember("TECHNICIAN");
    getSessionMock.mockResolvedValueOnce({ user: { id: tech.id, email: "ka-t@x.co" } });
    await expect(guard.canActivate(contextFor("patchKontrolAlat"))).resolves.toBe(true);
  });

  it("allows ADMIN to sign as Administrasi", async () => {
    await ensureGrants();
    const admin = await makeMember("ADMIN");
    getSessionMock.mockResolvedValueOnce({ user: { id: admin.id, email: "ka-a@x.co" } });
    await expect(guard.canActivate(contextFor("signKontrolAlat"))).resolves.toBe(true);
  });

  it("blocks CUSTOMER_SERVICE from writing Kontrol Alat", async () => {
    await ensureGrants();
    const cs = await makeMember("CUSTOMER_SERVICE");
    getSessionMock.mockResolvedValueOnce({ user: { id: cs.id, email: "ka-cs@x.co" } });
    await expect(guard.canActivate(contextFor("patchKontrolAlat"))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
