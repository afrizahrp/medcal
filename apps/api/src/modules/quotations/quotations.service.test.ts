import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, prisma } from "@medcal/db";
import { isValidDocumentNumber } from "@medcal/db";
import {
  quotationCreateSchema,
  quotationPreviewSchema,
  quotationUpdateSchema,
} from "@medcal/shared";
import { CalibrationRequestsService } from "../calibration-requests/calibration-requests.service";
import { QuotationsService } from "./quotations.service";

const quotationsService = new QuotationsService();
const requestsService = new CalibrationRequestsService();
const realCompanyId = "PKM";
const staffUserId = "qt-staff-user";

const createdQuotationIds: string[] = [];
const createdCalibrationRequestIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdCompanyIds: string[] = [];
const createdDeviceTypeIds: string[] = [];
const createdDeviceCategoryIds: string[] = [];
const createdTaxIds: string[] = [];
const createdPriceListItemIds: string[] = [];

function rand() {
  return randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
}

async function ensureStaffUser() {
  await prisma.user.upsert({
    where: { id: staffUserId },
    create: {
      id: staffUserId,
      email: `${staffUserId}@medcal.test`,
      name: "QT Staff",
      status: "ACTIVE",
    },
    update: {},
  });
}

async function cleanupQuotations(ids: string[]) {
  if (ids.length === 0) return;
  await prisma.quotationItem.deleteMany({ where: { quotationId: { in: ids } } });
  await prisma.quotation.deleteMany({ where: { id: { in: ids } } });
}

async function cleanupCalibrationRequests(ids: string[]) {
  if (ids.length === 0) return;
  await prisma.calibrationRequestItem.deleteMany({ where: { requestId: { in: ids } } });
  await prisma.calibrationRequest.deleteMany({ where: { id: { in: ids } } });
}

async function cleanupCustomers(ids: string[]) {
  if (ids.length === 0) return;
  await prisma.customerContact.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.customer.deleteMany({ where: { id: { in: ids } } });
}

async function cleanupSequences(companyId: string) {
  await prisma.documentNumberSequence.deleteMany({
    where: { companyId, documentType: { in: ["QUOTATION", "CALIBRATION_REQUEST"] } },
  });
}

async function createTestCustomer(companyId: string, name?: string) {
  const customer = await prisma.customer.create({
    data: {
      companyId,
      number: `CUS/TEST/${randomUUID().slice(0, 8)}`,
      name: name ?? `Test Customer ${randomUUID().slice(0, 6)}`,
    },
  });
  createdCustomerIds.push(customer.id);
  return customer;
}

/** A fresh, isolated DeviceType per call — keeps Price List rows non-overlapping. */
async function makeDeviceType(name?: string): Promise<{ id: string; name: string }> {
  const category = await prisma.deviceCategory.create({
    data: { code: `C${rand()}`, name: "Test Category" },
  });
  createdDeviceCategoryIds.push(category.id);
  const deviceType = await prisma.deviceType.create({
    data: { categoryId: category.id, code: `T${rand()}`, name: name ?? `Test Device ${rand()}` },
  });
  createdDeviceTypeIds.push(deviceType.id);
  return { id: deviceType.id, name: deviceType.name };
}

async function seedPrice(
  companyId: string,
  deviceTypeId: string,
  unitPrice: number,
  opts: { effectiveFrom?: Date; effectiveUntil?: Date | null; isActive?: boolean } = {},
) {
  const row = await prisma.priceListItem.create({
    data: {
      companyId,
      deviceTypeId,
      unitPrice: new Prisma.Decimal(unitPrice),
      effectiveFrom: opts.effectiveFrom ?? new Date("2020-01-01T00:00:00.000Z"),
      effectiveUntil: opts.effectiveUntil ?? null,
      isActive: opts.isActive ?? true,
    },
  });
  createdPriceListItemIds.push(row.id);
  return row;
}

async function ensureTestTax(
  input: { taxCode: string; taxRate: number; isExclude: boolean; description: string },
  companyId = realCompanyId,
) {
  const existing = await prisma.tax.findUnique({
    where: { companyId_taxCode: { companyId, taxCode: input.taxCode } },
  });
  if (existing) {
    return prisma.tax.update({
      where: { id: existing.id },
      data: {
        taxRate: input.taxRate,
        isExclude: input.isExclude,
        description: input.description,
        isActive: true,
      },
    });
  }
  const tax = await prisma.tax.create({
    data: {
      companyId,
      taxCode: input.taxCode,
      taxRate: input.taxRate,
      isExclude: input.isExclude,
      description: input.description,
    },
  });
  createdTaxIds.push(tax.id);
  return tax;
}

async function ensureNonPpnTax(companyId = realCompanyId) {
  return ensureTestTax(
    { taxCode: "T0", taxRate: 0, isExclude: false, description: "Non PPN" },
    companyId,
  );
}

type CreateInput = Parameters<QuotationsService["create"]>[1];

async function createQuoted(
  companyId: string,
  input: Omit<CreateInput, "taxCode"> & { taxCode?: string },
) {
  await ensureNonPpnTax(companyId);
  return quotationsService.create(companyId, { ...input, taxCode: input.taxCode ?? "T0" });
}

interface RequestItemSpec {
  deviceTypeId?: string;
  deviceId?: string | null;
  qty?: number;
}

async function createSubmittedRequest(
  companyId: string,
  opts: { deviceTypeId?: string; items?: RequestItemSpec[] } = {},
) {
  await ensureStaffUser();
  const customer = await createTestCustomer(companyId);
  const fallbackTypeId = opts.deviceTypeId ?? (await makeDeviceType()).id;
  const specs = opts.items ?? [{ deviceId: "DEV-1" }];
  const created = await requestsService.create(companyId, staffUserId, {
    customerId: customer.id,
    serviceMode: "ON_SITE",
    items: specs.map((spec, index) => ({
      deviceTypeId: spec.deviceTypeId ?? fallbackTypeId,
      ...(spec.deviceId === null ? {} : { deviceId: spec.deviceId ?? `DEV-${index + 1}` }),
      ...(spec.qty !== undefined ? { qty: spec.qty } : {}),
    })),
  });
  createdCalibrationRequestIds.push(created.id);
  const request = await requestsService.submit(companyId, created.id);
  return { customerId: customer.id, request, deviceTypeId: fallbackTypeId };
}

beforeAll(async () => {
  await ensureStaffUser();
});

afterAll(async () => {
  await cleanupQuotations(createdQuotationIds);
  if (createdPriceListItemIds.length > 0) {
    await prisma.priceListItem.deleteMany({ where: { id: { in: createdPriceListItemIds } } });
  }
  if (createdTaxIds.length > 0) {
    await prisma.tax.deleteMany({ where: { id: { in: createdTaxIds } } });
  }
  await cleanupCalibrationRequests(createdCalibrationRequestIds);
  if (createdDeviceTypeIds.length > 0) {
    await prisma.priceListItem.deleteMany({ where: { deviceTypeId: { in: createdDeviceTypeIds } } });
    await prisma.deviceType.deleteMany({ where: { id: { in: createdDeviceTypeIds } } });
  }
  if (createdDeviceCategoryIds.length > 0) {
    await prisma.deviceCategory.deleteMany({ where: { id: { in: createdDeviceCategoryIds } } });
  }
  await cleanupCustomers(createdCustomerIds);
  await cleanupSequences(realCompanyId);
  for (const companyId of createdCompanyIds) {
    await cleanupSequences(companyId);
    await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
  }
});

describe("quotationCreateSchema", () => {
  it("accepts a minimal payload with just requestId + taxCode (server generates items)", () => {
    expect(quotationCreateSchema.safeParse({ requestId: "req-1", taxCode: "T0" }).success).toBe(true);
  });

  it("accepts an optional items array with description / discount tweaks only", () => {
    const parsed = quotationCreateSchema.safeParse({
      requestId: "req-1",
      taxCode: "T0",
      items: [{ requestItemId: "item-1", description: "Kalibrasi BPM", discountAmount: 1000 }],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a client-supplied unitPrice on a create item (server is authoritative)", () => {
    const parsed = quotationCreateSchema.safeParse({
      requestId: "req-1",
      taxCode: "T0",
      items: [{ requestItemId: "item-1", unitPrice: 999 }],
    });
    // unknown key is stripped by zod; the important guarantee is that the
    // parsed output never carries a unitPrice.
    if (parsed.success) {
      expect(parsed.data.items?.[0]).not.toHaveProperty("unitPrice");
    }
  });

  it("rejects a missing taxCode", () => {
    expect(quotationCreateSchema.safeParse({ requestId: "req-1" }).success).toBe(false);
  });

  it("rejects a missing requestId", () => {
    expect(quotationCreateSchema.safeParse({ taxCode: "T0" }).success).toBe(false);
  });

  it("rejects an empty items array", () => {
    expect(quotationCreateSchema.safeParse({ requestId: "req-1", taxCode: "T0", items: [] }).success).toBe(
      false,
    );
  });

  it("rejects a negative item discountAmount", () => {
    expect(
      quotationCreateSchema.safeParse({
        requestId: "req-1",
        taxCode: "T0",
        items: [{ requestItemId: "item-1", discountAmount: -1 }],
      }).success,
    ).toBe(false);
  });

  it("rejects a negative headerDiscountAmount", () => {
    expect(
      quotationCreateSchema.safeParse({
        requestId: "req-1",
        taxCode: "T0",
        headerDiscountAmount: -1,
      }).success,
    ).toBe(false);
  });
});

describe("QuotationsService.preview — read-only Price List preview", () => {
  it("resolves the tariff for a submitted request without persisting a quotation", async () => {
    const dt = await makeDeviceType();
    await seedPrice(realCompanyId, dt.id, 150_000);
    const { request } = await createSubmittedRequest(realCompanyId, { deviceTypeId: dt.id });

    const preview = await quotationsService.preview(realCompanyId, { requestId: request.id });

    expect(preview.items).toHaveLength(1);
    expect(preview.items[0]?.requestItemId).toBe(request.items[0]?.id);
    expect(preview.items[0]?.pricePending).toBe(false);
    expect(Number(preview.items[0]?.unitPrice)).toBe(150_000);
    expect(Number(preview.items[0]?.lineTotal)).toBe(150_000);

    const count = await prisma.quotation.count({ where: { requestId: request.id } });
    expect(count).toBe(0);
    const cr = await prisma.calibrationRequest.findFirstOrThrow({ where: { id: request.id } });
    expect(cr.status).toBe("SUBMITTED");
  });

  it("returns each line's own tariff for a multi-device request", async () => {
    const a = await makeDeviceType("Bio Safety Cabinet");
    const b = await makeDeviceType("Audiometer");
    await seedPrice(realCompanyId, a.id, 1_250_000);
    await seedPrice(realCompanyId, b.id, 800_000);
    const { request } = await createSubmittedRequest(realCompanyId, {
      items: [
        { deviceTypeId: a.id, qty: 3 },
        { deviceTypeId: b.id, qty: 1 },
      ],
    });

    const preview = await quotationsService.preview(realCompanyId, { requestId: request.id });
    const byDesc = new Map(preview.items.map((i) => [i.description, i]));
    expect(Number(byDesc.get("Bio Safety Cabinet")?.unitPrice)).toBe(1_250_000);
    expect(Number(byDesc.get("Audiometer")?.unitPrice)).toBe(800_000);
  });

  it("keeps unitPrice per-unit and lineTotal = qty × unitPrice for qty > 1", async () => {
    const dt = await makeDeviceType();
    await seedPrice(realCompanyId, dt.id, 100_000);
    const { request } = await createSubmittedRequest(realCompanyId, {
      deviceTypeId: dt.id,
      items: [{ deviceId: null, qty: 4 }],
    });

    const preview = await quotationsService.preview(realCompanyId, { requestId: request.id });
    expect(Number(preview.items[0]?.qty)).toBe(4);
    expect(Number(preview.items[0]?.unitPrice)).toBe(100_000);
    expect(Number(preview.items[0]?.lineTotal)).toBe(400_000);
  });

  it("flags a line with no active tariff as pricePending (unitPrice 0)", async () => {
    const dt = await makeDeviceType(); // no seedPrice
    const { request } = await createSubmittedRequest(realCompanyId, { deviceTypeId: dt.id });

    const preview = await quotationsService.preview(realCompanyId, { requestId: request.id });
    expect(preview.items[0]?.pricePending).toBe(true);
    expect(Number(preview.items[0]?.unitPrice)).toBe(0);
  });

  it("the previewed unit price equals the value the quotation is created with", async () => {
    const dt = await makeDeviceType();
    await seedPrice(realCompanyId, dt.id, 137_500);
    const { request } = await createSubmittedRequest(realCompanyId, {
      deviceTypeId: dt.id,
      items: [{ deviceId: null, qty: 2 }],
    });

    const preview = await quotationsService.preview(realCompanyId, { requestId: request.id });
    const created = await createQuoted(realCompanyId, { requestId: request.id });
    createdQuotationIds.push(created.id);

    expect(Number(preview.items[0]?.unitPrice)).toBe(Number(created.items[0]?.unitPrice));
    expect(Number(preview.items[0]?.lineTotal)).toBe(Number(created.items[0]?.lineTotal));
    const previewSubtotal = preview.items.reduce((sum, i) => sum + Number(i.lineTotal), 0);
    expect(previewSubtotal).toBe(Number(created.subtotal));
  });

  it("rejects a preview for a requisition from another company", async () => {
    const dt = await makeDeviceType();
    await seedPrice(realCompanyId, dt.id, 100_000);
    const { request } = await createSubmittedRequest(realCompanyId, { deviceTypeId: dt.id });
    await expect(
      quotationsService.preview("OTHER", { requestId: request.id }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "CALIBRATION_REQUEST_NOT_FOUND" }),
    });
  });
});

describe("quotationPreviewSchema", () => {
  it("accepts a bare requestId", () => {
    expect(quotationPreviewSchema.safeParse({ requestId: "req-1" }).success).toBe(true);
  });
  it("rejects a missing requestId", () => {
    expect(quotationPreviewSchema.safeParse({}).success).toBe(false);
  });
});

describe("QuotationsService.create — Price List generation", () => {
  it("creates a Quotation, allocates a QUO number, links the request, snapshots the tariff", async () => {
    const dt = await makeDeviceType();
    await seedPrice(realCompanyId, dt.id, 150_000);
    const { customerId, request } = await createSubmittedRequest(realCompanyId, { deviceTypeId: dt.id });

    const result = await createQuoted(realCompanyId, { requestId: request.id });
    createdQuotationIds.push(result.id);

    expect(result.customerId).toBe(customerId);
    expect(result.requestId).toBe(request.id);
    expect(result.status).toBe("DRAFT");
    expect(isValidDocumentNumber(result.number)).toBe(true);
    expect(result.number.startsWith("QUO/")).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.requestItemId).toBe(request.items[0]?.id);
    expect(result.items[0]?.description).toBe(dt.name);
    expect(result.items[0]?.pricePending).toBe(false);
    expect(Number(result.items[0]?.qty)).toBe(1);
    expect(Number(result.items[0]?.unitPrice)).toBe(150_000);
    expect(Number(result.items[0]?.lineTotal)).toBe(150_000);
    expect(Number(result.subtotal)).toBe(150_000);
    expect(Number(result.totalAmount)).toBe(150_000);
  });

  it("test 8/9/10 — every requisition item becomes exactly one quotation item, full scope", async () => {
    const dt = await makeDeviceType();
    await seedPrice(realCompanyId, dt.id, 100_000);
    const { request } = await createSubmittedRequest(realCompanyId, {
      deviceTypeId: dt.id,
      items: [{ deviceId: "A" }, { deviceId: "B" }, { deviceId: "C" }],
    });

    const result = await createQuoted(realCompanyId, { requestId: request.id });
    createdQuotationIds.push(result.id);

    expect(result.items).toHaveLength(3);
    const reqIds = new Set(request.items.map((i) => i.id));
    const quoIds = new Set(result.items.map((i) => i.requestItemId));
    expect(quoIds).toEqual(reqIds);
  });

  it("test 11/12 — requisition qty is copied exactly and NOT exploded into rows", async () => {
    const dt = await makeDeviceType();
    await seedPrice(realCompanyId, dt.id, 100_000);
    const { request } = await createSubmittedRequest(realCompanyId, {
      deviceTypeId: dt.id,
      items: [{ deviceId: null, qty: 5 }],
    });
    expect(request.items[0]?.qty).toBe(5);

    const result = await createQuoted(realCompanyId, { requestId: request.id });
    createdQuotationIds.push(result.id);

    expect(result.items).toHaveLength(1);
    expect(Number(result.items[0]?.qty)).toBe(5);
    expect(Number(result.items[0]?.unitPrice)).toBe(100_000);
    expect(Number(result.items[0]?.lineTotal)).toBe(500_000);
  });

  it("test 13 — a NULL customer Serial No does not prevent pricing", async () => {
    const dt = await makeDeviceType();
    await seedPrice(realCompanyId, dt.id, 100_000);
    const { request } = await createSubmittedRequest(realCompanyId, {
      deviceTypeId: dt.id,
      items: [{ deviceId: null }],
    });
    expect(request.items[0]?.deviceId).toBeNull();

    const result = await createQuoted(realCompanyId, { requestId: request.id });
    createdQuotationIds.push(result.id);
    expect(result.items[0]?.pricePending).toBe(false);
    expect(Number(result.items[0]?.unitPrice)).toBe(100_000);
  });

  it("test 14/15 — customerDeviceName / alias wording never becomes the pricing key", async () => {
    const canonical = await makeDeviceType("Sphygmomanometer");
    const decoy = await makeDeviceType("Tensimeter");
    await seedPrice(realCompanyId, canonical.id, 100_000);
    await seedPrice(realCompanyId, decoy.id, 999_999); // must NOT be selected

    const customer = await createTestCustomer(realCompanyId);
    const created = await requestsService.create(realCompanyId, staffUserId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceTypeId: canonical.id, customerDeviceName: "Tensimeter", model: "XYZ" }],
    });
    createdCalibrationRequestIds.push(created.id);
    const request = await requestsService.submit(realCompanyId, created.id);

    const result = await createQuoted(realCompanyId, { requestId: request.id });
    createdQuotationIds.push(result.id);
    expect(Number(result.items[0]?.unitPrice)).toBe(100_000);
  });

  it("test 17 — unitPrice is a snapshot: later Price List changes do not touch the quotation", async () => {
    const dt = await makeDeviceType();
    const price = await seedPrice(realCompanyId, dt.id, 100_000);
    const { request } = await createSubmittedRequest(realCompanyId, { deviceTypeId: dt.id });

    const result = await createQuoted(realCompanyId, { requestId: request.id });
    createdQuotationIds.push(result.id);
    expect(Number(result.items[0]?.unitPrice)).toBe(100_000);

    // Supersede the tariff.
    await prisma.priceListItem.update({ where: { id: price.id }, data: { isActive: false } });
    const newPrice = await seedPrice(realCompanyId, dt.id, 250_000, {
      effectiveFrom: new Date("2099-01-01T00:00:00.000Z"),
    });
    createdPriceListItemIds.push(newPrice.id);

    const reloaded = await quotationsService.findOne(realCompanyId, result.id);
    expect(Number(reloaded.items[0]?.unitPrice)).toBe(100_000);
    expect(Number(reloaded.subtotal)).toBe(100_000);
  });

  it("test 16 — effective-dated selection picks the tariff active on the quotation date", async () => {
    const dt = await makeDeviceType();
    // Historic window closed in the past.
    await seedPrice(realCompanyId, dt.id, 80_000, {
      effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
      effectiveUntil: new Date("2020-12-31T00:00:00.000Z"),
    });
    // Current open-ended window.
    await seedPrice(realCompanyId, dt.id, 120_000, {
      effectiveFrom: new Date("2021-01-01T00:00:00.000Z"),
    });
    const { request } = await createSubmittedRequest(realCompanyId, { deviceTypeId: dt.id });

    const result = await createQuoted(realCompanyId, { requestId: request.id });
    createdQuotationIds.push(result.id);
    expect(Number(result.items[0]?.unitPrice)).toBe(120_000);
  });

  it("test 19 — missing tariff → pricePending line, quotation still DRAFT, cannot be sent", async () => {
    const dt = await makeDeviceType(); // no seedPrice
    const { request } = await createSubmittedRequest(realCompanyId, { deviceTypeId: dt.id });

    const result = await createQuoted(realCompanyId, { requestId: request.id });
    createdQuotationIds.push(result.id);

    expect(result.status).toBe("DRAFT");
    expect(result.items[0]?.pricePending).toBe(true);
    expect(Number(result.items[0]?.unitPrice)).toBe(0);

    await expect(quotationsService.send(realCompanyId, result.id)).rejects.toMatchObject({
      response: expect.objectContaining({ code: "QUOTATION_PRICE_NOT_CONFIGURED" }),
    });
    await expect(
      quotationsService.approve(realCompanyId, result.id, "user-x"),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "QUOTATION_PRICE_NOT_CONFIGURED" }),
    });

    // Manually price the line via PATCH, then send succeeds.
    await quotationsService.update(realCompanyId, result.id, {
      items: [
        {
          requestItemId: request.items[0]!.id,
          description: dt.name,
          unitPrice: 90_000,
        },
      ],
    });
    const sent = await quotationsService.send(realCompanyId, result.id);
    expect(sent.status).toBe("SENT");
  });

  it("inactive tariff is not selected (falls back to pricePending)", async () => {
    const dt = await makeDeviceType();
    await seedPrice(realCompanyId, dt.id, 100_000, { isActive: false });
    const { request } = await createSubmittedRequest(realCompanyId, { deviceTypeId: dt.id });

    const result = await createQuoted(realCompanyId, { requestId: request.id });
    createdQuotationIds.push(result.id);
    expect(result.items[0]?.pricePending).toBe(true);
  });

  it("moves CalibrationRequest from SUBMITTED to IN_QUOTATION", async () => {
    const dt = await makeDeviceType();
    await seedPrice(realCompanyId, dt.id, 100_000);
    const { request } = await createSubmittedRequest(realCompanyId, { deviceTypeId: dt.id });
    expect(request.status).toBe("SUBMITTED");

    const result = await createQuoted(realCompanyId, { requestId: request.id });
    createdQuotationIds.push(result.id);

    const updated = await prisma.calibrationRequest.findFirstOrThrow({ where: { id: request.id } });
    expect(updated.status).toBe("IN_QUOTATION");
  });

  it("rejects a create-items payload that does not cover the full request scope", async () => {
    const dt = await makeDeviceType();
    await seedPrice(realCompanyId, dt.id, 100_000);
    const { request } = await createSubmittedRequest(realCompanyId, {
      deviceTypeId: dt.id,
      items: [{ deviceId: "A" }, { deviceId: "B" }],
    });

    await expect(
      createQuoted(realCompanyId, {
        requestId: request.id,
        items: [{ requestItemId: request.items[0]!.id, description: "subset" }],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "QUOTATION_SCOPE_MISMATCH" }),
    });
  });

  it("rejects a second quotation for the same request and leaves the first untouched", async () => {
    const dt = await makeDeviceType();
    await seedPrice(realCompanyId, dt.id, 100_000);
    const { request } = await createSubmittedRequest(realCompanyId, { deviceTypeId: dt.id });

    const first = await createQuoted(realCompanyId, { requestId: request.id });
    createdQuotationIds.push(first.id);

    await expect(createQuoted(realCompanyId, { requestId: request.id })).rejects.toBeInstanceOf(
      ConflictException,
    );
    const count = await prisma.quotation.count({ where: { requestId: request.id } });
    expect(count).toBe(1);
  });

  it("rejects creation when the CalibrationRequest is still DRAFT", async () => {
    const dt = await makeDeviceType();
    await seedPrice(realCompanyId, dt.id, 100_000);
    const customer = await createTestCustomer(realCompanyId);
    const draft = await requestsService.create(realCompanyId, staffUserId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [{ deviceTypeId: dt.id, deviceId: "DEV-1" }],
    });
    createdCalibrationRequestIds.push(draft.id);

    await expect(createQuoted(realCompanyId, { requestId: draft.id })).rejects.toMatchObject({
      response: expect.objectContaining({ code: "INVALID_STATUS_FOR_QUOTATION" }),
    });
  });

  it("rejects a nonexistent taxCode", async () => {
    const dt = await makeDeviceType();
    await seedPrice(realCompanyId, dt.id, 100_000);
    const { request } = await createSubmittedRequest(realCompanyId, { deviceTypeId: dt.id });
    await expect(
      createQuoted(realCompanyId, { requestId: request.id, taxCode: "NOPE" }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: "TAX_NOT_FOUND" }) });
  });
});

describe("QuotationsService.create — calculation engine (reused, unchanged)", () => {
  it("test 20 — qty × unitPrice with per-line + header discount and exclusive tax", async () => {
    const dt = await makeDeviceType();
    await seedPrice(realCompanyId, dt.id, 100_000);
    await ensureTestTax({ taxCode: "T1", taxRate: 0.11, description: "PPN 11%", isExclude: true });
    const { request } = await createSubmittedRequest(realCompanyId, {
      deviceTypeId: dt.id,
      items: [{ deviceId: null, qty: 2 }],
    });

    const result = await createQuoted(realCompanyId, {
      requestId: request.id,
      taxCode: "T1",
      headerDiscountAmount: 30_000,
      items: [{ requestItemId: request.items[0]!.id, discountAmount: 20_000 }],
    });
    createdQuotationIds.push(result.id);

    expect(Number(result.items[0]?.lineTotal)).toBe(180_000); // 2*100000 - 20000
    expect(Number(result.subtotal)).toBe(180_000);
    expect(Number(result.headerDiscountAmount)).toBe(30_000);
    expect(Number(result.taxAmount)).toBe(16_500); // (180000-30000)*0.11
    expect(Number(result.totalAmount)).toBe(166_500);
  });

  it("inclusive tax path is unchanged", async () => {
    const dt = await makeDeviceType();
    await seedPrice(realCompanyId, dt.id, 111_000);
    await ensureTestTax({ taxCode: "T2", taxRate: 0.11, description: "PPN 11%", isExclude: false });
    const { request } = await createSubmittedRequest(realCompanyId, { deviceTypeId: dt.id });

    const result = await createQuoted(realCompanyId, { requestId: request.id, taxCode: "T2" });
    createdQuotationIds.push(result.id);

    expect(Number(result.subtotal)).toBe(111_000);
    expect(Number(result.taxAmount)).toBe(11_000);
    expect(Number(result.totalAmount)).toBe(111_000);
  });

  it("rejects item discount greater than the gross line amount", async () => {
    const dt = await makeDeviceType();
    await seedPrice(realCompanyId, dt.id, 100_000);
    const { request } = await createSubmittedRequest(realCompanyId, { deviceTypeId: dt.id });

    await expect(
      createQuoted(realCompanyId, {
        requestId: request.id,
        items: [{ requestItemId: request.items[0]!.id, discountAmount: 100_001 }],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "ITEM_DISCOUNT_EXCEEDS_GROSS" }),
    });
  });

  it("rejects headerDiscountAmount greater than subtotal", async () => {
    const dt = await makeDeviceType();
    await seedPrice(realCompanyId, dt.id, 100_000);
    const { request } = await createSubmittedRequest(realCompanyId, { deviceTypeId: dt.id });

    await expect(
      createQuoted(realCompanyId, { requestId: request.id, headerDiscountAmount: 100_001 }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "HEADER_DISCOUNT_EXCEEDS_SUBTOTAL" }),
    });
  });
});

describe("QuotationsService.create — realistic 5 / 3 / 2 scenario", () => {
  it("test 11 — generates exactly 3 lines with the expected amounts", async () => {
    const sphyg = await makeDeviceType("Sphygmomanometer");
    const monitor = await makeDeviceType("Bedside Monitor");
    const pump = await makeDeviceType("Infusion Pump");
    await seedPrice(realCompanyId, sphyg.id, 100_000);
    await seedPrice(realCompanyId, monitor.id, 250_000);
    await seedPrice(realCompanyId, pump.id, 175_000);

    const customer = await createTestCustomer(realCompanyId);
    const created = await requestsService.create(realCompanyId, staffUserId, {
      customerId: customer.id,
      serviceMode: "ON_SITE",
      items: [
        { deviceTypeId: sphyg.id, qty: 5 },
        { deviceTypeId: monitor.id, qty: 3 },
        { deviceTypeId: pump.id, qty: 2 },
      ],
    });
    createdCalibrationRequestIds.push(created.id);
    const request = await requestsService.submit(realCompanyId, created.id);

    const result = await createQuoted(realCompanyId, { requestId: request.id });
    createdQuotationIds.push(result.id);

    expect(result.items).toHaveLength(3);
    const byType = new Map(
      result.items.map((i) => [i.requestItem?.deviceType.name, i]),
    );
    expect(Number(byType.get("Sphygmomanometer")?.qty)).toBe(5);
    expect(Number(byType.get("Sphygmomanometer")?.unitPrice)).toBe(100_000);
    expect(Number(byType.get("Sphygmomanometer")?.lineTotal)).toBe(500_000);
    expect(Number(byType.get("Bedside Monitor")?.lineTotal)).toBe(750_000);
    expect(Number(byType.get("Infusion Pump")?.lineTotal)).toBe(350_000);
    expect(Number(result.subtotal)).toBe(1_600_000);
    expect(Number(result.totalAmount)).toBe(1_600_000);
  });
});

describe("QuotationsService.update (manual override of a DRAFT quotation)", () => {
  it("BR-12 — a user may manually edit the unit price while DRAFT", async () => {
    const dt = await makeDeviceType();
    await seedPrice(realCompanyId, dt.id, 100_000);
    const { request } = await createSubmittedRequest(realCompanyId, { deviceTypeId: dt.id });
    const created = await createQuoted(realCompanyId, { requestId: request.id });
    createdQuotationIds.push(created.id);

    const updated = await quotationsService.update(realCompanyId, created.id, {
      items: [{ requestItemId: request.items[0]!.id, description: dt.name, unitPrice: 175_000 }],
    });
    expect(Number(updated.items[0]?.unitPrice)).toBe(175_000);
    expect(updated.items[0]?.pricePending).toBe(false);
    expect(Number(updated.subtotal)).toBe(175_000);
  });

  it("rejects update when status is not DRAFT", async () => {
    const dt = await makeDeviceType();
    await seedPrice(realCompanyId, dt.id, 100_000);
    const { request } = await createSubmittedRequest(realCompanyId, { deviceTypeId: dt.id });
    const created = await createQuoted(realCompanyId, { requestId: request.id });
    createdQuotationIds.push(created.id);
    await quotationsService.send(realCompanyId, created.id);

    await expect(
      quotationsService.update(realCompanyId, created.id, { source: "WHATSAPP" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("does not allow clearing taxCode to null", () => {
    expect(quotationUpdateSchema.safeParse({ taxCode: null }).success).toBe(false);
  });
});

describe("QuotationsService lifecycle", () => {
  async function draft() {
    const dt = await makeDeviceType();
    await seedPrice(realCompanyId, dt.id, 100_000);
    const { request } = await createSubmittedRequest(realCompanyId, { deviceTypeId: dt.id });
    const created = await createQuoted(realCompanyId, { requestId: request.id });
    createdQuotationIds.push(created.id);
    return created;
  }

  it("sends a DRAFT quotation", async () => {
    const created = await draft();
    const sent = await quotationsService.send(realCompanyId, created.id);
    expect(sent.status).toBe("SENT");
  });

  it("approves a SENT quotation and records timestamps", async () => {
    const created = await draft();
    await quotationsService.send(realCompanyId, created.id);
    const approved = await quotationsService.approve(realCompanyId, created.id, "user-1");
    expect(approved.status).toBe("APPROVED");
    expect(approved.approvedByUserId).toBe("user-1");
  });

  it("cancels a DRAFT quotation", async () => {
    const created = await draft();
    const cancelled = await quotationsService.cancel(realCompanyId, created.id);
    expect(cancelled.status).toBe("CANCELLED");
  });

  it("rejects cancelling an approved quotation", async () => {
    const created = await draft();
    await quotationsService.send(realCompanyId, created.id);
    await quotationsService.approve(realCompanyId, created.id, "user-1");
    await expect(quotationsService.cancel(realCompanyId, created.id)).rejects.toMatchObject({
      response: expect.objectContaining({ code: "CANNOT_CANCEL_APPROVED" }),
    });
  });
});

describe("QuotationsService tenant isolation", () => {
  it("throws NotFoundException when accessing a Quotation from another company", async () => {
    const otherCompanyId = `Q${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({ data: { id: otherCompanyId, name: "Foreign Co", status: "ACTIVE" } });
    createdCompanyIds.push(otherCompanyId);
    await cleanupSequences(otherCompanyId);

    const dt = await makeDeviceType();
    await seedPrice(otherCompanyId, dt.id, 100_000);
    const { request } = await createSubmittedRequest(otherCompanyId, { deviceTypeId: dt.id });
    const foreign = await createQuoted(otherCompanyId, { requestId: request.id });
    createdQuotationIds.push(foreign.id);

    await expect(quotationsService.findOne(realCompanyId, foreign.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe("QuotationsService transaction rollback (test 21)", () => {
  it("rolls back fully if generation fails (scope mismatch)", async () => {
    const dt = await makeDeviceType();
    await seedPrice(realCompanyId, dt.id, 100_000);
    const { request } = await createSubmittedRequest(realCompanyId, {
      deviceTypeId: dt.id,
      items: [{ deviceId: "A" }, { deviceId: "B" }],
    });

    await expect(
      createQuoted(realCompanyId, {
        requestId: request.id,
        items: [{ requestItemId: request.items[0]!.id }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const countAfter = await prisma.quotation.count({ where: { requestId: request.id } });
    expect(countAfter).toBe(0);
    const cr = await prisma.calibrationRequest.findFirstOrThrow({ where: { id: request.id } });
    expect(cr.status).toBe("SUBMITTED");
  });
});

describe("QuotationsService.buildPdf", () => {
  it("returns a PDF without changing quotation status", async () => {
    const dt = await makeDeviceType();
    await seedPrice(realCompanyId, dt.id, 150_000);
    const { request } = await createSubmittedRequest(realCompanyId, { deviceTypeId: dt.id });
    const created = await createQuoted(realCompanyId, { requestId: request.id });
    createdQuotationIds.push(created.id);

    const pdf = await quotationsService.buildPdf(realCompanyId, created.id);
    expect(pdf.filename).toMatch(/^PKM-QUO-\d{8}-\d{5}\.pdf$/);
    expect(pdf.buffer.subarray(0, 4).toString()).toBe("%PDF");

    const after = await prisma.quotation.findFirstOrThrow({ where: { id: created.id } });
    expect(after.status).toBe("DRAFT");
  });
});
