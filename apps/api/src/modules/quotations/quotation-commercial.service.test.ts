/**
 * Quotation Requirements (Revision 2): quotation date, Customer.pricingMode,
 * bidirectional header discount, and commercial additional items
 * (catalog -> quotation snapshot -> PO snapshot -> STOP).
 * See docs/audits/quotation-requirements-audit-report.md.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, prisma } from "@medcal/db";
import {
  additionalItemTypeCreateSchema,
  quotationCreateSchema,
  quotationReviseSchema,
  quotationUpdateSchema,
} from "@medcal/shared";
import { AdditionalItemTypesService } from "../additional-item-types/additional-item-types.service";
import { CalibrationRequestsService } from "../calibration-requests/calibration-requests.service";
import { CustomersService } from "../customers/customers.service";
import { PurchaseOrdersService } from "../purchase-orders/purchase-orders.service";
import { computePoProgress } from "../purchase-orders/po-progress";
import { WorkOrdersService } from "../work-orders/work-orders.service";
import { additionalCalculationText } from "./quotation-pdf";
import { QuotationsService } from "./quotations.service";

const quotationsService = new QuotationsService();
const requestsService = new CalibrationRequestsService();
const purchaseOrdersService = new PurchaseOrdersService();
const workOrdersService = new WorkOrdersService();
const customersService = new CustomersService();
const typesService = new AdditionalItemTypesService();
const companyId = "PKM";
const staffUserId = "qc-staff-user";

const createdWorkOrderIds: string[] = [];
const createdPurchaseOrderIds: string[] = [];
const createdQuotationIds: string[] = [];
const createdRequestIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdDeviceTypeIds: string[] = [];
const createdCategoryIds: string[] = [];
const createdTypeIds: string[] = [];
const createdUserIds: string[] = [];
const createdTaxIds: string[] = [];

function rand() {
  return randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
}

function utcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** Today's calendar day in Asia/Jakarta as YYYY-MM-DD (independent of the service helper). */
function jakartaToday(offsetDays = 0): string {
  const base = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(base);
}

async function ensureStaffUser() {
  await prisma.user.upsert({
    where: { id: staffUserId },
    create: { id: staffUserId, email: `${staffUserId}@medcal.test`, name: "QC Staff", status: "ACTIVE" },
    update: {},
  });
}

async function ensureTax(taxCode: string, taxRate: number, isExclude: boolean) {
  const existing = await prisma.tax.findUnique({
    where: { companyId_taxCode: { companyId, taxCode } },
  });
  if (existing) {
    await prisma.tax.update({
      where: { id: existing.id },
      data: { taxRate, isExclude, isActive: true },
    });
    return;
  }
  const tax = await prisma.tax.create({
    data: { companyId, taxCode, taxRate, isExclude, description: taxCode },
  });
  createdTaxIds.push(tax.id);
}

async function makeDeviceType() {
  const category = await prisma.deviceCategory.create({
    data: { code: `C${rand()}`, name: "Test Category" },
  });
  createdCategoryIds.push(category.id);
  const deviceType = await prisma.deviceType.create({
    data: { categoryId: category.id, code: `T${rand()}`, name: `Test Device ${rand()}` },
  });
  createdDeviceTypeIds.push(deviceType.id);
  return deviceType;
}

async function seedPrice(
  deviceTypeId: string,
  unitPrice: number,
  effectiveFrom: string,
  effectiveUntil: string | null = null,
) {
  await prisma.priceListItem.create({
    data: {
      companyId,
      deviceTypeId,
      unitPrice: new Prisma.Decimal(unitPrice),
      effectiveFrom: utcDate(effectiveFrom),
      effectiveUntil: effectiveUntil ? utcDate(effectiveUntil) : null,
    },
  });
}

interface RequestOptions {
  deviceTypeId: string;
  pricingMode?: "STANDARD" | "MANUAL";
  serviceMode?: "ON_SITE" | "SEND_TO_LAB";
  qty?: number;
}

async function submittedRequest(opts: RequestOptions) {
  await ensureStaffUser();
  const customer = await prisma.customer.create({
    data: {
      companyId,
      number: `CUS/TEST/${randomUUID().slice(0, 8)}`,
      name: `QC Customer ${rand()}`,
      pricingMode: opts.pricingMode ?? "STANDARD",
    },
  });
  createdCustomerIds.push(customer.id);
  await prisma.device.create({
    data: {
      companyId,
      customerId: customer.id,
      deviceTypeId: opts.deviceTypeId,
      code: `DVC${rand()}`,
      serialNumber: "DEV-1",
    },
  });
  const created = await requestsService.create(companyId, staffUserId, {
    customerId: customer.id,
    serviceMode: opts.serviceMode ?? "ON_SITE",
    items: [
      {
        deviceTypeId: opts.deviceTypeId,
        deviceId: "DEV-1",
        ...(opts.qty !== undefined ? { qty: opts.qty } : {}),
      },
    ],
  });
  createdRequestIds.push(created.id);
  const request = await requestsService.submit(companyId, created.id);
  return { customer, request };
}

type CreateInput = Parameters<QuotationsService["create"]>[1];

/** A fresh DeviceType priced at `unitPrice` (effective since 2020) + a submitted request. */
async function pricedRequest(unitPrice: number, opts: Partial<RequestOptions> = {}) {
  const dt = await makeDeviceType();
  await seedPrice(dt.id, unitPrice, "2020-01-01");
  return submittedRequest({ ...opts, deviceTypeId: dt.id });
}

async function makeQuotation(
  unitPrice: number,
  input: Partial<Omit<CreateInput, "requestId">> = {},
  opts: Partial<RequestOptions> = {},
) {
  await ensureTax("T0", 0, false);
  const { request, customer } = await pricedRequest(unitPrice, opts);
  const quotation = await quotationsService.create(
    companyId,
    { requestId: request.id, taxCode: "T0", ...input },
    staffUserId,
  );
  createdQuotationIds.push(quotation.id);
  return { quotation, request, customer };
}

async function makeType(
  overrides: Partial<{
    name: string;
    unitLabel: string;
    multiplierLabel: string | null;
    defaultUnitPrice: number | null;
    serviceMode: "ON_SITE" | "SEND_TO_LAB" | null;
  }> = {},
) {
  const row = await typesService.create(
    companyId,
    additionalItemTypeCreateSchema.parse({
      name: overrides.name ?? "Akomodasi",
      unitLabel: overrides.unitLabel ?? "malam",
      multiplierLabel: overrides.multiplierLabel ?? null,
      defaultUnitPrice: overrides.defaultUnitPrice === undefined ? 500_000 : overrides.defaultUnitPrice,
      serviceMode: overrides.serviceMode === undefined ? "ON_SITE" : overrides.serviceMode,
    }),
  );
  createdTypeIds.push(row.id);
  return row;
}

async function createTechnician() {
  const user = await prisma.user.create({
    data: {
      email: `qc-tech-${randomUUID().slice(0, 8)}@kalibrasimedika.co.id`,
      name: "QC Technician",
      status: "ACTIVE",
    },
  });
  createdUserIds.push(user.id);
  await prisma.userMembership.create({
    data: { userId: user.id, companyId, role: "TECHNICIAN", isDefault: false },
  });
  return user;
}

beforeAll(async () => {
  await ensureStaffUser();
});

afterAll(async () => {
  if (createdWorkOrderIds.length > 0) {
    await prisma.workOrder.deleteMany({ where: { id: { in: createdWorkOrderIds } } });
  }
  if (createdQuotationIds.length > 0) {
    // PO additional rows restrict-reference quotation additional rows, so POs go first.
    await prisma.purchaseOrder.deleteMany({ where: { quotationId: { in: createdQuotationIds } } });
    await prisma.quotationItem.deleteMany({ where: { quotationId: { in: createdQuotationIds } } });
    await prisma.quotation.deleteMany({ where: { id: { in: createdQuotationIds } } });
  }
  if (createdTypeIds.length > 0) {
    await prisma.additionalItemType.deleteMany({ where: { id: { in: createdTypeIds } } });
  }
  await prisma.masterCodeSequence.deleteMany({ where: { scope: `ADDITIONAL_ITEM_TYPE#${companyId}` } });
  await prisma.auditLog.deleteMany({
    where: { action: "QUOTATION_BACKDATED", userId: staffUserId },
  });
  if (createdRequestIds.length > 0) {
    await prisma.calibrationRequestItem.deleteMany({ where: { requestId: { in: createdRequestIds } } });
    await prisma.calibrationRequest.deleteMany({ where: { id: { in: createdRequestIds } } });
  }
  if (createdCustomerIds.length > 0) {
    await prisma.device.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
  }
  if (createdDeviceTypeIds.length > 0) {
    await prisma.priceListItem.deleteMany({ where: { deviceTypeId: { in: createdDeviceTypeIds } } });
    await prisma.deviceType.deleteMany({ where: { id: { in: createdDeviceTypeIds } } });
  }
  if (createdCategoryIds.length > 0) {
    await prisma.deviceCategory.deleteMany({ where: { id: { in: createdCategoryIds } } });
  }
  if (createdCustomerIds.length > 0) {
    await prisma.customerContact.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
  }
  if (createdUserIds.length > 0) {
    await prisma.userMembership.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  if (createdTaxIds.length > 0) {
    await prisma.tax.deleteMany({ where: { id: { in: createdTaxIds } } });
  }
  await prisma.documentNumberSequence.deleteMany({
    where: {
      companyId,
      documentType: {
        in: ["QUOTATION", "CALIBRATION_REQUEST", "PURCHASE_ORDER", "WORK_ORDER", "KONTROL_ALAT"],
      },
    },
  });
});

// =============================================================================
// Quotation date
// =============================================================================

describe("Quotation date — backdating, numbering, price lookup", () => {
  it("defaults to today (Asia/Jakarta) and keeps createdAt as the separate system timestamp", async () => {
    const { quotation } = await makeQuotation(100_000);
    expect(quotation.quotationDate.toISOString().slice(0, 10)).toBe(jakartaToday());
    expect(Math.abs(quotation.createdAt.getTime() - Date.now())).toBeLessThan(60_000);
  });

  it("accepts a backdated quotation: stored date, number follows the date, createdAt untouched", async () => {
    const { quotation } = await makeQuotation(100_000, { quotationDate: utcDate("2026-03-15") });
    expect(quotation.quotationDate.toISOString().slice(0, 10)).toBe("2026-03-15");
    expect(quotation.number).toMatch(/^QUO\/2026\/03\/\d{5}$/);
    // createdAt is the real entry time, not the business date.
    expect(quotation.createdAt.getUTCFullYear()).toBeGreaterThanOrEqual(2026);
    expect(quotation.createdAt.toISOString().slice(0, 10)).not.toBe("2026-03-15");
  });

  it("numbers a previous-year quotation from that year's counter", async () => {
    const { quotation } = await makeQuotation(100_000, { quotationDate: utcDate("2025-06-10") });
    expect(quotation.number).toMatch(/^QUO\/2025\/06\/\d{5}$/);
  });

  it("rejects a future quotation date", async () => {
    await ensureTax("T0", 0, false);
    const { request } = await pricedRequest(100_000);
    await expect(
      quotationsService.create(companyId, {
        requestId: request.id,
        taxCode: "T0",
        quotationDate: utcDate(jakartaToday(2)),
      }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: "QUOTATION_DATE_IN_FUTURE" }) });
  });

  it("rejects validUntil earlier than the quotation date", async () => {
    await ensureTax("T0", 0, false);
    const { request } = await pricedRequest(100_000);
    await expect(
      quotationsService.create(companyId, {
        requestId: request.id,
        taxCode: "T0",
        quotationDate: utcDate("2026-03-15"),
        validUntil: utcDate("2026-03-14"),
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "VALID_UNTIL_BEFORE_QUOTATION_DATE" }),
    });
  });

  it("price lookup follows the quotation date (old tariff window vs current tariff)", async () => {
    await ensureTax("T0", 0, false);
    const dt = await makeDeviceType();
    await seedPrice(dt.id, 100_000, "2026-01-01", "2026-03-31");
    await seedPrice(dt.id, 200_000, "2026-04-01");

    const first = await submittedRequest({ deviceTypeId: dt.id });
    const old = await quotationsService.create(companyId, {
      requestId: first.request.id,
      taxCode: "T0",
      quotationDate: utcDate("2026-03-15"),
    });
    createdQuotationIds.push(old.id);
    expect(Number(old.items[0]!.unitPrice)).toBe(100_000);

    const second = await submittedRequest({ deviceTypeId: dt.id });
    const current = await quotationsService.create(companyId, {
      requestId: second.request.id,
      taxCode: "T0",
      quotationDate: utcDate("2026-04-02"),
    });
    createdQuotationIds.push(current.id);
    expect(Number(current.items[0]!.unitPrice)).toBe(200_000);

    // Before the first tariff exists => no price for that date => pricePending.
    const third = await submittedRequest({ deviceTypeId: dt.id });
    const tooOld = await quotationsService.create(companyId, {
      requestId: third.request.id,
      taxCode: "T0",
      quotationDate: utcDate("2025-12-31"),
    });
    createdQuotationIds.push(tooOld.id);
    expect(tooOld.items[0]!.pricePending).toBe(true);
    expect(Number(tooOld.items[0]!.unitPrice)).toBe(0);
  });

  it("preview resolves exactly what create would for the same backdated date", async () => {
    await ensureTax("T0", 0, false);
    const dt = await makeDeviceType();
    await seedPrice(dt.id, 100_000, "2026-01-01", "2026-03-31");
    await seedPrice(dt.id, 200_000, "2026-04-01");
    const { request } = await submittedRequest({ deviceTypeId: dt.id });

    const preview = await quotationsService.preview(companyId, {
      requestId: request.id,
      quotationDate: utcDate("2026-02-10"),
    });
    expect(Number(preview.items[0]!.unitPrice)).toBe(100_000);
    const created = await quotationsService.create(companyId, {
      requestId: request.id,
      taxCode: "T0",
      quotationDate: utcDate("2026-02-10"),
    });
    createdQuotationIds.push(created.id);
    expect(Number(created.items[0]!.unitPrice)).toBe(Number(preview.items[0]!.unitPrice));
  });

  it("writes an audit row for a backdated create but not for a same-day one", async () => {
    const backdated = await makeQuotation(100_000, { quotationDate: utcDate("2026-02-01") });
    const sameDay = await makeQuotation(100_000);
    const rows = await prisma.auditLog.findMany({
      where: { action: "QUOTATION_BACKDATED", targetId: { in: [backdated.quotation.id, sameDay.quotation.id] } },
    });
    expect(rows.map((row) => row.targetId)).toEqual([backdated.quotation.id]);
    expect(rows[0]!.metadata).toMatchObject({ quotationDate: "2026-02-01" });
  });

  it("DRAFT date edit: same month keeps the number; a different month re-issues it for the new period", async () => {
    const { quotation } = await makeQuotation(100_000, { quotationDate: utcDate("2026-03-15") });

    const sameMonth = await quotationsService.update(
      companyId,
      quotation.id,
      { quotationDate: utcDate("2026-03-20") },
      staffUserId,
    );
    expect(sameMonth.number).toBe(quotation.number);
    expect(sameMonth.quotationDate.toISOString().slice(0, 10)).toBe("2026-03-20");

    const otherMonth = await quotationsService.update(
      companyId,
      quotation.id,
      { quotationDate: utcDate("2026-02-05") },
      staffUserId,
    );
    expect(otherMonth.number).toMatch(/^QUO\/2026\/02\/\d{5}$/);
    expect(otherMonth.number).not.toBe(quotation.number);
  });

  it("a non-DRAFT quotation's date cannot be edited", async () => {
    const { quotation } = await makeQuotation(100_000);
    await quotationsService.send(companyId, quotation.id);
    await expect(
      quotationsService.update(companyId, quotation.id, { quotationDate: utcDate("2026-01-01") }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "INVALID_STATUS_FOR_UPDATE" }),
    });
  });

  it("revise snapshots the quotation date into history and never changes it", async () => {
    const { quotation } = await makeQuotation(100_000, { quotationDate: utcDate("2026-03-15") });
    const sent = await quotationsService.send(companyId, quotation.id);
    const revised = await quotationsService.revise(companyId, sent.id, staffUserId, {
      items: [
        {
          id: sent.items[0]!.id,
          requestItemId: sent.items[0]!.requestItemId!,
          unitPrice: 120_000,
          description: sent.items[0]!.description,
        },
      ],
    });
    expect(revised.quotationDate.toISOString().slice(0, 10)).toBe("2026-03-15");
    const history = await quotationsService.getHistoryRevision(companyId, sent.id, 1);
    expect(history.quotationDate.toISOString().slice(0, 10)).toBe("2026-03-15");
  });

  it("the PDF is named after the quotation date, not the entry date", async () => {
    const { quotation } = await makeQuotation(100_000, { quotationDate: utcDate("2026-03-15") });
    const pdf = await quotationsService.buildPdf(companyId, quotation.id);
    expect(pdf.filename).toMatch(/^PKM-QUO-20260315-\d{5}\.pdf$/);
    expect(pdf.buffer.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("migration backfill expression: UTC createdAt -> Asia/Jakarta calendar day", async () => {
    const rows = await prisma.$queryRaw<{ boundary: string; before: string }[]>`
      SELECT
        ((('2026-09-30 18:30:00'::timestamp) AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date::text AS boundary,
        ((('2026-09-30 16:59:59'::timestamp) AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date::text AS before
    `;
    expect(rows[0]).toEqual({ boundary: "2026-10-01", before: "2026-09-30" });
  });

  it("quotationDate is NOT NULL in the database (no fallback)", async () => {
    const rows = await prisma.$queryRaw<{ table_name: string; is_nullable: string }[]>`
      SELECT table_name, is_nullable FROM information_schema.columns
      WHERE column_name = 'quotationDate' AND table_name IN ('Quotation', 'QuotationHistory')
      ORDER BY table_name
    `;
    expect(rows).toEqual([
      { table_name: "Quotation", is_nullable: "NO" },
      { table_name: "QuotationHistory", is_nullable: "NO" },
    ]);
  });
});

// =============================================================================
// Customer.pricingMode
// =============================================================================

describe("Customer.pricingMode", () => {
  it("defaults to STANDARD and is settable on create/update through CustomersService", async () => {
    const created = await customersService.createCustomer(companyId, {
      name: `Mode Customer ${rand()}`,
    });
    createdCustomerIds.push(created.id);
    expect(created.pricingMode).toBe("STANDARD");

    const manual = await customersService.createCustomer(companyId, {
      name: `Manual Customer ${rand()}`,
      pricingMode: "MANUAL",
    });
    createdCustomerIds.push(manual.id);
    expect(manual.pricingMode).toBe("MANUAL");

    const updated = await customersService.update(
      companyId,
      created.id,
      { pricingMode: "MANUAL" },
      staffUserId,
    );
    expect(updated.pricingMode).toBe("MANUAL");

    // A real mode change is audited; re-sending the same mode is not.
    await customersService.update(companyId, created.id, { pricingMode: "MANUAL" }, staffUserId);
    const audits = await prisma.auditLog.findMany({
      where: { action: "CUSTOMER_PRICING_MODE_CHANGE", targetId: created.id },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]!.metadata).toEqual({ from: "STANDARD", to: "MANUAL" });
    await prisma.auditLog.deleteMany({ where: { action: "CUSTOMER_PRICING_MODE_CHANGE", targetId: created.id } });
  });

  it("STANDARD customers get the Price List price", async () => {
    const { quotation } = await makeQuotation(150_000);
    expect(Number(quotation.items[0]!.unitPrice)).toBe(150_000);
    expect(quotation.items[0]!.pricePending).toBe(false);
  });

  it("MANUAL customers never resolve the Price List — even when a price exists", async () => {
    const { quotation } = await makeQuotation(150_000, {}, { pricingMode: "MANUAL" });
    expect(quotation.items[0]!.pricePending).toBe(true);
    expect(Number(quotation.items[0]!.unitPrice)).toBe(0);
    expect(Number(quotation.subtotal)).toBe(0);
  });

  it("preview reports MANUAL and pending lines; STANDARD reports the resolved price", async () => {
    const dt = await makeDeviceType();
    await seedPrice(dt.id, 90_000, "2020-01-01");
    const manual = await submittedRequest({ deviceTypeId: dt.id, pricingMode: "MANUAL" });
    const manualPreview = await quotationsService.preview(companyId, { requestId: manual.request.id });
    expect(manualPreview.pricingMode).toBe("MANUAL");
    expect(manualPreview.items[0]!.pricePending).toBe(true);

    const standard = await submittedRequest({ deviceTypeId: dt.id });
    const standardPreview = await quotationsService.preview(companyId, { requestId: standard.request.id });
    expect(standardPreview.pricingMode).toBe("STANDARD");
    expect(Number(standardPreview.items[0]!.unitPrice)).toBe(90_000);
  });

  it("a MANUAL quotation cannot be sent/approved until a price is entered, then can", async () => {
    const { quotation } = await makeQuotation(150_000, {}, { pricingMode: "MANUAL" });

    await expect(quotationsService.send(companyId, quotation.id)).rejects.toMatchObject({
      response: expect.objectContaining({ code: "QUOTATION_PRICE_NOT_CONFIGURED" }),
    });
    await expect(quotationsService.approve(companyId, quotation.id, staffUserId)).rejects.toMatchObject({
      response: expect.objectContaining({ code: "QUOTATION_PRICE_NOT_CONFIGURED" }),
    });

    const priced = await quotationsService.update(companyId, quotation.id, {
      items: [
        {
          requestItemId: quotation.items[0]!.requestItemId!,
          description: quotation.items[0]!.description,
          unitPrice: 175_000,
        },
      ],
    });
    expect(priced.items[0]!.pricePending).toBe(false);
    expect(Number(priced.subtotal)).toBe(175_000);

    const sent = await quotationsService.send(companyId, quotation.id);
    expect(sent.status).toBe("SENT");
  });

  it("a price typed at create is honoured for MANUAL customers — no save-then-edit round trip", async () => {
    await ensureTax("T0", 0, false);
    const { request } = await pricedRequest(150_000, { pricingMode: "MANUAL" });
    const created = await quotationsService.create(companyId, {
      requestId: request.id,
      taxCode: "T0",
      items: [{ requestItemId: request.items[0]!.id, unitPrice: 175_000 }],
    });
    createdQuotationIds.push(created.id);
    expect(created.items[0]!.pricePending).toBe(false);
    expect(Number(created.items[0]!.unitPrice)).toBe(175_000);
    expect(Number(created.subtotal)).toBe(175_000);
    // Immediately sendable: the price is already present.
    expect((await quotationsService.send(companyId, created.id)).status).toBe("SENT");
  });

  it("a typed price is also accepted for a STANDARD line with no Price List price", async () => {
    await ensureTax("T0", 0, false);
    const dt = await makeDeviceType(); // no tariff seeded
    const { request } = await submittedRequest({ deviceTypeId: dt.id });
    const created = await quotationsService.create(companyId, {
      requestId: request.id,
      taxCode: "T0",
      items: [{ requestItemId: request.items[0]!.id, unitPrice: 90_000 }],
    });
    createdQuotationIds.push(created.id);
    expect(Number(created.items[0]!.unitPrice)).toBe(90_000);
    expect(created.items[0]!.pricePending).toBe(false);
  });

  it("a typed price is rejected where the Price List has one (it cannot be bypassed)", async () => {
    await ensureTax("T0", 0, false);
    const { request } = await pricedRequest(150_000); // STANDARD customer with a tariff
    await expect(
      quotationsService.create(companyId, {
        requestId: request.id,
        taxCode: "T0",
        items: [{ requestItemId: request.items[0]!.id, unitPrice: 1 }],
      }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: "UNIT_PRICE_NOT_ALLOWED" }) });
  });

  it("changing the customer's mode never re-prices an existing quotation", async () => {
    const { quotation, customer } = await makeQuotation(150_000);
    await customersService.update(companyId, customer.id, { pricingMode: "MANUAL" });
    const reloaded = await quotationsService.findOne(companyId, quotation.id);
    expect(Number(reloaded.items[0]!.unitPrice)).toBe(150_000);
    expect(reloaded.items[0]!.pricePending).toBe(false);
  });
});

// =============================================================================
// Header discount — percent <-> amount
// =============================================================================

describe("Header discount — bidirectional percent/amount", () => {
  it("percent input -> amount derived (10% of 1.000.000 = 100.000), persisted and reloaded", async () => {
    const { quotation } = await makeQuotation(1_000_000, { headerDiscountPercent: 10 });
    expect(Number(quotation.headerDiscountAmount)).toBe(100_000);
    expect(Number(quotation.headerDiscountPercent)).toBe(10);
    expect(quotation.headerDiscountInputMode).toBe("PERCENT");
    expect(Number(quotation.totalAmount)).toBe(900_000);

    const reloaded = await quotationsService.findOne(companyId, quotation.id);
    expect(Number(reloaded.headerDiscountAmount)).toBe(100_000);
    expect(Number(reloaded.headerDiscountPercent)).toBe(10);
    expect(reloaded.headerDiscountInputMode).toBe("PERCENT");
  });

  it("amount input -> percent derived (100.000 of 1.000.000 = 10%)", async () => {
    const { quotation } = await makeQuotation(1_000_000, { headerDiscountAmount: 100_000 });
    expect(Number(quotation.headerDiscountAmount)).toBe(100_000);
    expect(Number(quotation.headerDiscountPercent)).toBe(10);
    expect(quotation.headerDiscountInputMode).toBe("AMOUNT");
  });

  it("supports decimal percentages and rounds the derived amount half-up to cents", async () => {
    const decimal = await makeQuotation(1_000_000, { headerDiscountPercent: 12.5 });
    expect(Number(decimal.quotation.headerDiscountAmount)).toBe(125_000);
    expect(Number(decimal.quotation.headerDiscountPercent)).toBe(12.5);

    const rounded = await makeQuotation(333_333, { headerDiscountPercent: 10 });
    expect(Number(rounded.quotation.headerDiscountAmount)).toBe(33_333.3);
    expect(Number(rounded.quotation.totalAmount)).toBe(299_999.7);

    const fraction = await makeQuotation(1_000_000, { headerDiscountAmount: 333_333.33 });
    expect(Number(fraction.quotation.headerDiscountPercent)).toBe(33.3333);
  });

  it("no discount => zero amount, zero percent", async () => {
    const { quotation } = await makeQuotation(1_000_000);
    expect(Number(quotation.headerDiscountAmount)).toBe(0);
    expect(Number(quotation.headerDiscountPercent)).toBe(0);
    expect(quotation.headerDiscountInputMode).toBe("AMOUNT");
  });

  it("rejects an invalid discount (percent above 100, amount above subtotal)", async () => {
    await ensureTax("T0", 0, false);
    const { request } = await pricedRequest(1_000_000);
    await expect(
      quotationsService.create(companyId, { requestId: request.id, taxCode: "T0", headerDiscountPercent: 100.5 }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "INVALID_HEADER_DISCOUNT_PERCENT" }),
    });
    await expect(
      quotationsService.create(companyId, {
        requestId: request.id,
        taxCode: "T0",
        headerDiscountAmount: 1_000_001,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "HEADER_DISCOUNT_EXCEEDS_SUBTOTAL" }),
    });
  });

  it("the wire contract refuses both fields at once and negative values", () => {
    const both = quotationCreateSchema.safeParse({
      requestId: "r",
      taxCode: "T0",
      headerDiscountAmount: 150_000,
      headerDiscountPercent: 10,
    });
    expect(both.success).toBe(false);
    expect(JSON.stringify(both.error?.issues)).toContain("DISCOUNT_FIELDS_CONFLICT");
    expect(
      quotationUpdateSchema.safeParse({ headerDiscountAmount: 1, headerDiscountPercent: 1 }).success,
    ).toBe(false);
    expect(
      quotationReviseSchema.safeParse({
        headerDiscountAmount: 1,
        headerDiscountPercent: 1,
        items: [{ requestItemId: "x", description: "d", unitPrice: 1 }],
      }).success,
    ).toBe(false);
    expect(quotationCreateSchema.safeParse({ requestId: "r", taxCode: "T0", headerDiscountPercent: -1 }).success).toBe(false);
    expect(quotationCreateSchema.safeParse({ requestId: "r", taxCode: "T0", headerDiscountAmount: -1 }).success).toBe(false);
  });

  it("editing percent after amount, and amount after percent, keeps the pair consistent", async () => {
    const { quotation } = await makeQuotation(1_000_000, { headerDiscountAmount: 100_000 });

    const toPercent = await quotationsService.update(companyId, quotation.id, {
      headerDiscountPercent: 20,
    });
    expect(Number(toPercent.headerDiscountAmount)).toBe(200_000);
    expect(Number(toPercent.headerDiscountPercent)).toBe(20);
    expect(toPercent.headerDiscountInputMode).toBe("PERCENT");

    const toAmount = await quotationsService.update(companyId, quotation.id, {
      headerDiscountAmount: 50_000,
    });
    expect(Number(toAmount.headerDiscountAmount)).toBe(50_000);
    expect(Number(toAmount.headerDiscountPercent)).toBe(5);
    expect(toAmount.headerDiscountInputMode).toBe("AMOUNT");
  });

  it("PERCENT mode is re-applied to a changed subtotal; AMOUNT mode keeps the exact amount", async () => {
    const pct = await makeQuotation(1_000_000, { headerDiscountPercent: 10 });
    const repriced = await quotationsService.update(companyId, pct.quotation.id, {
      items: [
        {
          requestItemId: pct.quotation.items[0]!.requestItemId!,
          description: pct.quotation.items[0]!.description,
          unitPrice: 2_000_000,
        },
      ],
    });
    expect(Number(repriced.subtotal)).toBe(2_000_000);
    expect(Number(repriced.headerDiscountPercent)).toBe(10);
    expect(Number(repriced.headerDiscountAmount)).toBe(200_000);

    const amt = await makeQuotation(1_000_000, { headerDiscountAmount: 100_000 });
    const repriced2 = await quotationsService.update(companyId, amt.quotation.id, {
      items: [
        {
          requestItemId: amt.quotation.items[0]!.requestItemId!,
          description: amt.quotation.items[0]!.description,
          unitPrice: 2_000_000,
        },
      ],
    });
    expect(Number(repriced2.headerDiscountAmount)).toBe(100_000);
    expect(Number(repriced2.headerDiscountPercent)).toBe(5);
  });

  it("applies the discount before tax (exclusive 11%): 1.000.000 - 10% => net 900.000, tax 99.000, total 999.000", async () => {
    await ensureTax("TX11", 0.11, true);
    const { quotation } = await makeQuotation(1_000_000, {
      taxCode: "TX11",
      headerDiscountPercent: 10,
    });
    expect(Number(quotation.subtotal)).toBe(1_000_000);
    expect(Number(quotation.taxAmount)).toBe(99_000);
    expect(Number(quotation.totalAmount)).toBe(999_000);
  });

  it("revise re-applies the stored mode and snapshots the old discount into history", async () => {
    const { quotation } = await makeQuotation(1_000_000, { headerDiscountPercent: 10 });
    const sent = await quotationsService.send(companyId, quotation.id);

    const revised = await quotationsService.revise(companyId, sent.id, staffUserId, {
      items: [
        {
          id: sent.items[0]!.id,
          requestItemId: sent.items[0]!.requestItemId!,
          description: sent.items[0]!.description,
          unitPrice: 1_500_000,
        },
      ],
    });
    expect(Number(revised.headerDiscountPercent)).toBe(10);
    expect(Number(revised.headerDiscountAmount)).toBe(150_000);
    expect(revised.headerDiscountInputMode).toBe("PERCENT");

    const history = await quotationsService.getHistoryRevision(companyId, sent.id, 1);
    expect(Number(history.headerDiscountAmount)).toBe(100_000);
    expect(Number(history.headerDiscountPercent)).toBe(10);
    expect(history.headerDiscountInputMode).toBe("PERCENT");

    const switched = await quotationsService.revise(companyId, sent.id, staffUserId, {
      headerDiscountAmount: 75_000,
      items: [
        {
          id: revised.items[0]!.id,
          requestItemId: revised.items[0]!.requestItemId!,
          description: revised.items[0]!.description,
          unitPrice: 1_500_000,
        },
      ],
    });
    expect(Number(switched.headerDiscountPercent)).toBe(5);
    expect(switched.headerDiscountInputMode).toBe("AMOUNT");
  });

  it("the PO copies amount, percent and mode verbatim (it never recomputes)", async () => {
    const { quotation } = await makeQuotation(1_000_000, { headerDiscountPercent: 10 });
    await quotationsService.send(companyId, quotation.id);
    await quotationsService.approve(companyId, quotation.id, staffUserId);
    const po = await purchaseOrdersService.create(companyId, {
      quotationId: quotation.id,
      customerPoNumber: `CPO-${rand()}`,
      customerPoDate: utcDate("2026-08-15"),
    });
    createdPurchaseOrderIds.push(po.id);
    expect(Number(po.headerDiscountAmount)).toBe(100_000);
    expect(Number(po.headerDiscountPercent)).toBe(10);
    expect(po.headerDiscountInputMode).toBe("PERCENT");
    expect(Number(po.totalAmount)).toBe(900_000);
  });
});

// =============================================================================
// Additional items
// =============================================================================

describe("AdditionalItemType catalog", () => {
  it("issues the code automatically (ADC-nnn, per company, sequential) — the user never supplies it", async () => {
    const first = await makeType({ name: "Akomodasi Penginapan" });
    const second = await makeType({ name: "Transport" });
    expect(first.code).toMatch(/^ADC-\d{3,}$/);
    expect(second.code).toMatch(/^ADC-\d{3,}$/);
    expect(Number(second.code.slice(4))).toBe(Number(first.code.slice(4)) + 1);

    // A client-supplied code is not part of the contract: it is ignored, not stored.
    const parsed = additionalItemTypeCreateSchema.parse({
      code: "MY-OWN-CODE",
      name: "Ignored code",
      unitLabel: "hari",
    });
    expect(parsed).not.toHaveProperty("code");
    const third = await typesService.create(companyId, parsed);
    createdTypeIds.push(third.id);
    expect(third.code).toMatch(/^ADC-\d{3,}$/);
    expect(third.code).not.toBe("MY-OWN-CODE");
  });

  it("updates (code immutable), deactivates, filters by service mode", async () => {
    const type = await makeType({ name: "Akomodasi Penginapan" });
    const labOnly = await makeType({ serviceMode: "SEND_TO_LAB" });
    const anyMode = await makeType({ serviceMode: null });

    const onSite = await typesService.findAll(companyId, {
      page: 1,
      pageSize: 100,
      serviceMode: "ON_SITE",
      sortDir: "asc",
    } as never);
    const ids = onSite.data.map((row) => row.id);
    expect(ids).toContain(type.id);
    expect(ids).toContain(anyMode.id);
    expect(ids).not.toContain(labOnly.id);

    const updated = await typesService.update(companyId, type.id, { name: "Renamed", isActive: false });
    expect(updated.name).toBe("Renamed");
    expect(updated.isActive).toBe(false);
    expect(updated.code).toBe(type.code);
  });
});

describe("Quotation additional items", () => {
  it("snapshots catalog values; totals include calibration + additional lines; discount applies to the combined subtotal", async () => {
    const type = await makeType({ defaultUnitPrice: 500_000, name: "Akomodasi", unitLabel: "malam" });
    const { quotation } = await makeQuotation(1_000_000, {
      headerDiscountPercent: 10,
      additionalItems: [{ additionalItemTypeId: type.id, qty: 2, notes: "2 teknisi" }],
    });

    expect(quotation.additionalItems).toHaveLength(1);
    const line = quotation.additionalItems[0]!;
    expect(line.code).toBe(type.code);
    expect(line.description).toBe("Akomodasi");
    expect(line.unitLabel).toBe("malam");
    expect(Number(line.qty)).toBe(2);
    expect(Number(line.unitPrice)).toBe(500_000); // catalog default
    expect(Number(line.lineTotal)).toBe(1_000_000);
    expect(line.notes).toBe("2 teknisi");

    // subtotal = 1.000.000 (calibration) + 1.000.000 (additional); 10% of 2.000.000.
    expect(Number(quotation.subtotal)).toBe(2_000_000);
    expect(Number(quotation.headerDiscountAmount)).toBe(200_000);
    expect(Number(quotation.totalAmount)).toBe(1_800_000);
    // Calibration scope is untouched: still exactly one QuotationItem.
    expect(quotation.items).toHaveLength(1);
  });

  it("includes additional lines in an exclusive tax calculation", async () => {
    await ensureTax("TX11", 0.11, true);
    const type = await makeType({ defaultUnitPrice: 500_000 });
    const { quotation } = await makeQuotation(1_000_000, {
      taxCode: "TX11",
      additionalItems: [{ additionalItemTypeId: type.id, qty: 2 }],
    });
    expect(Number(quotation.subtotal)).toBe(2_000_000);
    expect(Number(quotation.taxAmount)).toBe(220_000);
    expect(Number(quotation.totalAmount)).toBe(2_220_000);
  });

  it("is a snapshot: later catalog edits and deactivation never change the quotation", async () => {
    const type = await makeType({ defaultUnitPrice: 500_000, name: "Akomodasi" });
    const { quotation } = await makeQuotation(1_000_000, {
      additionalItems: [{ additionalItemTypeId: type.id, qty: 1 }],
    });
    await typesService.update(companyId, type.id, {
      name: "Totally different",
      unitLabel: "bulan",
      defaultUnitPrice: 9_999_999,
      isActive: false,
    });
    const reloaded = await quotationsService.findOne(companyId, quotation.id);
    expect(reloaded.additionalItems[0]).toMatchObject({
      description: "Akomodasi",
      unitLabel: "malam",
    });
    expect(Number(reloaded.additionalItems[0]!.unitPrice)).toBe(500_000);
    expect(Number(reloaded.totalAmount)).toBe(Number(quotation.totalAmount));
  });

  it("rejects unknown, inactive and mode-mismatched types, and a missing price", async () => {
    await ensureTax("T0", 0, false);
    const { request } = await pricedRequest(100_000);
    const base = { requestId: request.id, taxCode: "T0" };

    await expect(
      quotationsService.create(companyId, {
        ...base,
        additionalItems: [{ additionalItemTypeId: "does-not-exist", qty: 1 }],
      }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: "ADDITIONAL_ITEM_TYPE_NOT_FOUND" }) });

    const inactive = await makeType();
    await typesService.update(companyId, inactive.id, { isActive: false });
    await expect(
      quotationsService.create(companyId, {
        ...base,
        additionalItems: [{ additionalItemTypeId: inactive.id, qty: 1 }],
      }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: "ADDITIONAL_ITEM_TYPE_INACTIVE" }) });

    const labOnly = await makeType({ serviceMode: "SEND_TO_LAB" });
    await expect(
      quotationsService.create(companyId, {
        ...base,
        additionalItems: [{ additionalItemTypeId: labOnly.id, qty: 1 }],
      }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: "ADDITIONAL_ITEM_TYPE_MODE_MISMATCH" }) });

    const noPrice = await makeType({ defaultUnitPrice: null });
    await expect(
      quotationsService.create(companyId, {
        ...base,
        additionalItems: [{ additionalItemTypeId: noPrice.id, qty: 1 }],
      }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: "ADDITIONAL_ITEM_PRICE_REQUIRED" }) });

    // ...but a price supplied by the user is enough, and overrides the catalog default.
    const ok = await quotationsService.create(companyId, {
      ...base,
      additionalItems: [{ additionalItemTypeId: noPrice.id, qty: 1, unitPrice: 250_000 }],
    });
    createdQuotationIds.push(ok.id);
    expect(Number(ok.additionalItems[0]!.unitPrice)).toBe(250_000);
  });

  it("there is no customer-eligibility step: the same type can be used by any customer or omitted", async () => {
    const type = await makeType();
    const withItem = await makeQuotation(100_000, {
      additionalItems: [{ additionalItemTypeId: type.id, qty: 1 }],
    });
    const without = await makeQuotation(100_000);
    expect(withItem.quotation.additionalItems).toHaveLength(1);
    expect(without.quotation.additionalItems).toHaveLength(0);
    expect(Number(without.quotation.subtotal)).toBe(100_000);
  });

  it("DRAFT PATCH replaces the full set; omitting additionalItems leaves it untouched", async () => {
    const type = await makeType({ defaultUnitPrice: 300_000 });
    const { quotation } = await makeQuotation(100_000, {
      additionalItems: [{ additionalItemTypeId: type.id, qty: 1 }],
    });

    const untouched = await quotationsService.update(companyId, quotation.id, {});
    expect(untouched.additionalItems).toHaveLength(1);

    const replaced = await quotationsService.update(companyId, quotation.id, {
      additionalItems: [{ additionalItemTypeId: type.id, qty: 3, unitPrice: 200_000 }],
    });
    expect(replaced.additionalItems).toHaveLength(1);
    expect(Number(replaced.additionalItems[0]!.lineTotal)).toBe(600_000);
    expect(Number(replaced.subtotal)).toBe(700_000);

    const cleared = await quotationsService.update(companyId, quotation.id, { additionalItems: [] });
    expect(cleared.additionalItems).toHaveLength(0);
    expect(Number(cleared.subtotal)).toBe(100_000);
  });

  it("revise (unconsumed): add / update in place / remove, with a complete history snapshot", async () => {
    const type = await makeType({ defaultUnitPrice: 300_000 });
    const { quotation } = await makeQuotation(100_000, {
      additionalItems: [{ additionalItemTypeId: type.id, qty: 1 }],
    });
    const sent = await quotationsService.send(companyId, quotation.id);
    const reviseItems = [
      {
        id: sent.items[0]!.id,
        requestItemId: sent.items[0]!.requestItemId!,
        description: sent.items[0]!.description,
        unitPrice: 100_000,
      },
    ];

    const updated = await quotationsService.revise(companyId, sent.id, staffUserId, {
      items: reviseItems,
      additionalItems: [
        { id: sent.additionalItems[0]!.id, additionalItemTypeId: type.id, qty: 2 },
        { additionalItemTypeId: type.id, qty: 1, unitPrice: 50_000, notes: "tambahan" },
      ],
    });
    expect(updated.additionalItems).toHaveLength(2);
    expect(Number(updated.subtotal)).toBe(100_000 + 600_000 + 50_000);

    const history = await quotationsService.getHistoryRevision(companyId, sent.id, 1);
    expect(history.additionalItems).toHaveLength(1);
    expect(Number(history.additionalItems[0]!.qty)).toBe(1);

    const removed = await quotationsService.revise(companyId, sent.id, staffUserId, {
      items: reviseItems,
      additionalItems: [],
    });
    expect(removed.additionalItems).toHaveLength(0);
    expect(Number(removed.subtotal)).toBe(100_000);
    // Unconsumed => hard-deleted (the history snapshot keeps the evidence).
    expect(await prisma.quotationAdditionalItem.count({ where: { quotationId: sent.id } })).toBe(0);
    const history2 = await quotationsService.getHistoryRevision(companyId, sent.id, 2);
    expect(history2.additionalItems).toHaveLength(2);
  });

  it("revise leaves additional items unchanged when the array is omitted", async () => {
    const type = await makeType({ defaultUnitPrice: 300_000 });
    const { quotation } = await makeQuotation(100_000, {
      additionalItems: [{ additionalItemTypeId: type.id, qty: 1 }],
    });
    const sent = await quotationsService.send(companyId, quotation.id);
    const revised = await quotationsService.revise(companyId, sent.id, staffUserId, {
      items: [
        {
          id: sent.items[0]!.id,
          requestItemId: sent.items[0]!.requestItemId!,
          description: sent.items[0]!.description,
          unitPrice: 110_000,
        },
      ],
    });
    expect(revised.additionalItems).toHaveLength(1);
    expect(Number(revised.subtotal)).toBe(110_000 + 300_000);
  });

  it("revise rejects an additional item id that is not on the quotation", async () => {
    const { quotation } = await makeQuotation(100_000);
    const sent = await quotationsService.send(companyId, quotation.id);
    const type = await makeType();
    await expect(
      quotationsService.revise(companyId, sent.id, staffUserId, {
        items: [
          {
            id: sent.items[0]!.id,
            requestItemId: sent.items[0]!.requestItemId!,
            description: sent.items[0]!.description,
            unitPrice: 100_000,
          },
        ],
        additionalItems: [{ id: "nope", additionalItemTypeId: type.id, qty: 1 }],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "QUOTATION_ADDITIONAL_ITEM_NOT_FOUND" }),
    });
  });

  it("the quotation PDF renders with additional items", async () => {
    const type = await makeType();
    const { quotation } = await makeQuotation(100_000, {
      headerDiscountPercent: 5,
      additionalItems: [{ additionalItemTypeId: type.id, qty: 1, notes: "kamar 2" }],
    });
    const pdf = await quotationsService.buildPdf(companyId, quotation.id);
    expect(pdf.buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.buffer.length).toBeGreaterThan(1000);
  });
});

// =============================================================================
// Additional items -> PO snapshot -> STOP
// =============================================================================

describe("PurchaseOrderAdditionalItem — PO snapshot and pipeline isolation", () => {
  async function approvedPoWithAdditional() {
    const type = await makeType({ defaultUnitPrice: 500_000, name: "Akomodasi" });
    const made = await makeQuotation(1_000_000, {
      additionalItems: [{ additionalItemTypeId: type.id, qty: 2, notes: "inap" }],
    });
    await quotationsService.send(companyId, made.quotation.id);
    const approved = await quotationsService.approve(companyId, made.quotation.id, staffUserId);
    const created = await purchaseOrdersService.create(companyId, {
      quotationId: approved.id,
      customerPoNumber: `CPO-${rand()}`,
      customerPoDate: utcDate("2026-08-15"),
    });
    createdPurchaseOrderIds.push(created.id);
    return { ...made, type, approved, po: created };
  }

  it("copies additional items into PurchaseOrderAdditionalItem and creates NO PurchaseOrderItem for them", async () => {
    const { po, approved, type } = await approvedPoWithAdditional();

    expect(po.items).toHaveLength(1); // the calibration line only
    expect(po.additionalItems).toHaveLength(1);
    const copy = po.additionalItems[0]!;
    expect(copy).toMatchObject({
      code: type.code,
      description: "Akomodasi",
      unitLabel: "malam",
      notes: "inap",
      quotationAdditionalItemId: approved.additionalItems[0]!.id,
    });
    expect(Number(copy.qty)).toBe(2);
    expect(Number(copy.unitPrice)).toBe(500_000);
    expect(Number(copy.lineTotal)).toBe(1_000_000);
    // Header totals mirror the quotation (which includes the additional line).
    expect(Number(po.subtotal)).toBe(2_000_000);
    expect(Number(po.totalAmount)).toBe(Number(approved.totalAmount));
    expect(await prisma.purchaseOrderItem.count({ where: { purchaseOrderId: po.id } })).toBe(1);
  });

  it("the PO is its own snapshot: a later quotation revision does not touch it until PO revise", async () => {
    const { po, approved, type } = await approvedPoWithAdditional();
    const rowId = approved.additionalItems[0]!.id;

    // Consumed row: changing it retires the old row and creates a replacement.
    const revised = await quotationsService.revise(companyId, approved.id, staffUserId, {
      items: [
        {
          id: approved.items[0]!.id,
          requestItemId: approved.items[0]!.requestItemId!,
          description: approved.items[0]!.description,
          unitPrice: Number(approved.items[0]!.unitPrice),
        },
      ],
      additionalItems: [{ id: rowId, additionalItemTypeId: type.id, qty: 3 }],
    });
    expect(revised.additionalItems).toHaveLength(1);
    expect(revised.additionalItems[0]!.id).not.toBe(rowId);
    expect(Number(revised.additionalItems[0]!.qty)).toBe(3);
    const retired = await prisma.quotationAdditionalItem.findUniqueOrThrow({ where: { id: rowId } });
    expect(retired.isActive).toBe(false);
    expect(Number(retired.qty)).toBe(2); // frozen

    // The PO still shows its original snapshot.
    const beforeRevise = await purchaseOrdersService.findOne(companyId, po.id);
    expect(beforeRevise.additionalItems).toHaveLength(1);
    expect(Number(beforeRevise.additionalItems[0]!.qty)).toBe(2);
    expect(Number(beforeRevise.totalAmount)).toBe(2_000_000);

    // PO revise pulls the new scope, snapshots history first, and copies the totals.
    await purchaseOrdersService.approve(companyId, po.id, staffUserId);
    const poRevised = await purchaseOrdersService.revise(companyId, po.id, staffUserId);
    expect(poRevised.additionalItems).toHaveLength(1);
    expect(Number(poRevised.additionalItems[0]!.qty)).toBe(3);
    expect(poRevised.additionalItems[0]!.quotationAdditionalItemId).toBe(revised.additionalItems[0]!.id);
    expect(Number(poRevised.subtotal)).toBe(2_500_000);

    const history = await purchaseOrdersService.getHistoryRevision(companyId, po.id, 1);
    expect(history.additionalItems).toHaveLength(1);
    expect(Number(history.additionalItems[0]!.qty)).toBe(2);
    expect(Number(history.subtotal)).toBe(2_000_000);

    // Nothing left to pick up => the existing guard applies.
    await expect(purchaseOrdersService.revise(companyId, po.id, staffUserId)).rejects.toMatchObject({
      response: expect.objectContaining({ code: "NO_PENDING_SCOPE_CHANGE" }),
    });
  });

  it("unchanged consumed rows are kept as-is on revise (no churn)", async () => {
    const { approved, type } = await approvedPoWithAdditional();
    const rowId = approved.additionalItems[0]!.id;
    const revised = await quotationsService.revise(companyId, approved.id, staffUserId, {
      items: [
        {
          id: approved.items[0]!.id,
          requestItemId: approved.items[0]!.requestItemId!,
          description: approved.items[0]!.description,
          unitPrice: Number(approved.items[0]!.unitPrice),
        },
      ],
      additionalItems: [{ id: rowId, additionalItemTypeId: type.id, qty: 2, notes: "inap" }],
    });
    expect(revised.additionalItems.map((row) => row.id)).toEqual([rowId]);
  });

  it("removing a consumed additional item retires it; PO revise then drops it from the PO snapshot", async () => {
    const { po, approved } = await approvedPoWithAdditional();
    const rowId = approved.additionalItems[0]!.id;
    const revised = await quotationsService.revise(companyId, approved.id, staffUserId, {
      items: [
        {
          id: approved.items[0]!.id,
          requestItemId: approved.items[0]!.requestItemId!,
          description: approved.items[0]!.description,
          unitPrice: Number(approved.items[0]!.unitPrice),
        },
      ],
      additionalItems: [],
    });
    expect(revised.additionalItems).toHaveLength(0);
    expect((await prisma.quotationAdditionalItem.findUniqueOrThrow({ where: { id: rowId } })).isActive).toBe(false);

    await purchaseOrdersService.approve(companyId, po.id, staffUserId);
    const poRevised = await purchaseOrdersService.revise(companyId, po.id, staffUserId);
    expect(poRevised.additionalItems).toHaveLength(0);
    expect(Number(poRevised.subtotal)).toBe(1_000_000);
  });

  it("additional items never reach allocation, WorkOrderItem, CalibrationJob or PO progress", async () => {
    const { po } = await approvedPoWithAdditional();
    await purchaseOrdersService.approve(companyId, po.id, staffUserId);

    const wo = await workOrdersService.create(companyId, { purchaseOrderId: po.id });
    createdWorkOrderIds.push(wo.id);

    // Only the calibration line was allocated / became a WorkOrderItem.
    expect(wo.items).toHaveLength(1);
    expect(wo.items[0]!.purchaseOrderItemId).toBe(po.items[0]!.id);
    expect(await prisma.purchaseOrderItemAllocation.count({ where: { workOrderId: wo.id } })).toBe(1);
    expect(await prisma.workOrderItem.count({ where: { workOrderId: wo.id } })).toBe(1);

    // Starting the work order fans out exactly the calibration quantity.
    const technician = await createTechnician();
    await workOrdersService.assign(companyId, wo.id, {
      technicians: [{ technicianUserId: technician.id }],
    });
    await workOrdersService.start(companyId, wo.id);
    expect(await prisma.calibrationJob.count({ where: { workOrderId: wo.id } })).toBe(1);

    // PO progress counts calibration quantity only.
    const progress = await computePoProgress(companyId, po.id);
    expect(progress.totalQty).toBe(1);
    expect(progress.buckets.unallocated).toBe(0);
  });

  it("the PO PDF renders with additional items", async () => {
    const { po } = await approvedPoWithAdditional();
    const pdf = await purchaseOrdersService.buildPdf(companyId, po.id);
    expect(pdf.buffer.subarray(0, 4).toString()).toBe("%PDF");
  });
});

// =============================================================================
// Notes / remarks — independent of pricing mode
// =============================================================================

describe("Quotation notes", () => {
  it("is stored on create for both STANDARD and MANUAL customers; blank is stored as none", async () => {
    const standard = await makeQuotation(100_000, { notes: "  Termasuk transport  " });
    expect(standard.quotation.notes).toBe("Termasuk transport");

    const manual = await makeQuotation(100_000, { notes: "Harga nego" }, { pricingMode: "MANUAL" });
    expect(manual.quotation.notes).toBe("Harga nego");

    const blank = await makeQuotation(100_000, { notes: "   " });
    expect(blank.quotation.notes).toBeNull();
    const omitted = await makeQuotation(100_000);
    expect(omitted.quotation.notes).toBeNull();
  });

  it("DRAFT PATCH edits and clears it; omitting it leaves it untouched", async () => {
    const { quotation } = await makeQuotation(100_000, { notes: "awal" });
    expect((await quotationsService.update(companyId, quotation.id, {})).notes).toBe("awal");
    expect((await quotationsService.update(companyId, quotation.id, { notes: "baru" })).notes).toBe("baru");
    expect((await quotationsService.update(companyId, quotation.id, { notes: null })).notes).toBeNull();
  });

  it("revise can change it and snapshots the previous remarks into history", async () => {
    const { quotation } = await makeQuotation(100_000, { notes: "versi 1" });
    const sent = await quotationsService.send(companyId, quotation.id);
    const items = [
      {
        id: sent.items[0]!.id,
        requestItemId: sent.items[0]!.requestItemId!,
        description: sent.items[0]!.description,
        unitPrice: 100_000,
      },
    ];
    const revised = await quotationsService.revise(companyId, sent.id, staffUserId, {
      notes: "versi 2",
      items,
    });
    expect(revised.notes).toBe("versi 2");
    expect((await quotationsService.getHistoryRevision(companyId, sent.id, 1)).notes).toBe("versi 1");

    // Omitted on a later revise => unchanged.
    const again = await quotationsService.revise(companyId, sent.id, staffUserId, { items });
    expect(again.notes).toBe("versi 2");
  });

  it("the quotation PDF renders with remarks", async () => {
    const { quotation } = await makeQuotation(100_000, { notes: "Syarat pembayaran 30 hari." });
    const pdf = await quotationsService.buildPdf(companyId, quotation.id);
    expect(pdf.buffer.subarray(0, 4).toString()).toBe("%PDF");
  });
});

// =============================================================================
// Additional items — second multiplier, customer-facing breakdown, no line discount
// =============================================================================

describe("Additional item multiplier (unitPrice x qty x multiplier)", () => {
  async function perPersonPerDayType(name: string, price: number) {
    return makeType({
      name,
      unitLabel: "orang",
      multiplierLabel: "hari",
      defaultUnitPrice: price,
    });
  }

  it("simple line: 100.000 x 1 = 100.000 (no multiplier)", async () => {
    const type = await makeType({ name: "Biaya administrasi", unitLabel: "paket", defaultUnitPrice: 100_000 });
    const { quotation } = await makeQuotation(100_000, {
      additionalItems: [{ additionalItemTypeId: type.id, qty: 1 }],
    });
    const line = quotation.additionalItems[0]!;
    expect(Number(line.lineTotal)).toBe(100_000);
    expect(line.multiplier).toBeNull();
    expect(line.multiplierLabel).toBeNull();
  });

  it("people x days: 100.000 x 3 orang x 2 hari = 600.000, fully snapshotted", async () => {
    const type = await perPersonPerDayType("Biaya transport", 100_000);
    const { quotation } = await makeQuotation(100_000, {
      additionalItems: [{ additionalItemTypeId: type.id, qty: 3, multiplier: 2 }],
    });
    const line = quotation.additionalItems[0]!;
    expect(Number(line.unitPrice)).toBe(100_000);
    expect(Number(line.qty)).toBe(3);
    expect(Number(line.multiplier)).toBe(2);
    expect(line.unitLabel).toBe("orang");
    expect(line.multiplierLabel).toBe("hari");
    expect(Number(line.lineTotal)).toBe(600_000);
    expect(additionalCalculationText(line)).toContain("3 orang × 2 hari");
  });

  it("the amount is computed by the backend: a client-supplied total or discount is never accepted", () => {
    const parsed = quotationCreateSchema.parse({
      requestId: "r",
      taxCode: "T0",
      additionalItems: [
        {
          additionalItemTypeId: "t",
          qty: 3,
          multiplier: 2,
          unitPrice: 100_000,
          lineTotal: 1,
          discountAmount: 50_000,
        },
      ],
    });
    expect(parsed.additionalItems![0]).not.toHaveProperty("lineTotal");
    expect(parsed.additionalItems![0]).not.toHaveProperty("discountAmount");
  });

  it("validates multipliers: positive whole numbers only; required iff the type defines one", async () => {
    for (const bad of [0, -1, 1.5]) {
      expect(
        quotationCreateSchema.safeParse({
          requestId: "r",
          taxCode: "T0",
          additionalItems: [{ additionalItemTypeId: "t", qty: 1, multiplier: bad }],
        }).success,
      ).toBe(false);
    }
    await ensureTax("T0", 0, false);
    const { request } = await pricedRequest(100_000);
    const withLabel = await perPersonPerDayType("Makan siang", 50_000);
    const simple = await makeType({ name: "Biaya pengiriman", unitLabel: "paket", defaultUnitPrice: 150_000 });

    await expect(
      quotationsService.create(companyId, {
        requestId: request.id,
        taxCode: "T0",
        additionalItems: [{ additionalItemTypeId: withLabel.id, qty: 3 }],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "ADDITIONAL_ITEM_MULTIPLIER_REQUIRED" }),
    });
    await expect(
      quotationsService.create(companyId, {
        requestId: request.id,
        taxCode: "T0",
        additionalItems: [{ additionalItemTypeId: simple.id, qty: 1, multiplier: 2 }],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "ADDITIONAL_ITEM_MULTIPLIER_NOT_APPLICABLE" }),
    });
  });

  it("several additional items + the header discount: 600.000 + 300.000 = 900.000, 10% of the combined subtotal", async () => {
    const transport = await perPersonPerDayType("Biaya transport", 100_000);
    const lunch = await perPersonPerDayType("Makan siang", 50_000);
    const { quotation } = await makeQuotation(100_000, {
      headerDiscountPercent: 10,
      additionalItems: [
        { additionalItemTypeId: transport.id, qty: 3, multiplier: 2 },
        { additionalItemTypeId: lunch.id, qty: 3, multiplier: 2 },
      ],
    });
    const lines = quotation.additionalItems.map((line) => ({
      name: line.description,
      total: Number(line.lineTotal),
    }));
    expect(lines).toEqual([
      { name: "Biaya transport", total: 600_000 },
      { name: "Makan siang", total: 300_000 },
    ]);
    // 100.000 calibration + 900.000 additional = 1.000.000; header discount 10% = 100.000.
    expect(Number(quotation.subtotal)).toBe(1_000_000);
    expect(Number(quotation.headerDiscountAmount)).toBe(100_000);
    expect(Number(quotation.totalAmount)).toBe(900_000);
  });

  it("changing the catalog afterwards changes neither the quotation nor its history", async () => {
    const type = await perPersonPerDayType("Biaya transport", 100_000);
    const { quotation } = await makeQuotation(100_000, {
      additionalItems: [{ additionalItemTypeId: type.id, qty: 3, multiplier: 2 }],
    });
    await typesService.update(companyId, type.id, {
      name: "Renamed",
      unitLabel: "unit",
      multiplierLabel: null,
      defaultUnitPrice: 9_999,
      isActive: false,
    });
    const reloaded = await quotationsService.findOne(companyId, quotation.id);
    expect(reloaded.additionalItems[0]).toMatchObject({
      description: "Biaya transport",
      unitLabel: "orang",
      multiplierLabel: "hari",
    });
    expect(Number(reloaded.additionalItems[0]!.lineTotal)).toBe(600_000);
    expect(Number(reloaded.totalAmount)).toBe(Number(quotation.totalAmount));

    // The row keeps ITS snapshot shape on revise, even though the catalog type changed.
    const sent = await quotationsService.send(companyId, quotation.id);
    const revised = await quotationsService.revise(companyId, sent.id, staffUserId, {
      items: [
        {
          id: sent.items[0]!.id,
          requestItemId: sent.items[0]!.requestItemId!,
          description: sent.items[0]!.description,
          unitPrice: 100_000,
        },
      ],
      additionalItems: [
        { id: sent.additionalItems[0]!.id, additionalItemTypeId: type.id, qty: 4, multiplier: 2 },
      ],
    });
    expect(Number(revised.additionalItems[0]!.lineTotal)).toBe(800_000);
    expect(revised.additionalItems[0]!.multiplierLabel).toBe("hari");
    const history = await quotationsService.getHistoryRevision(companyId, sent.id, 1);
    expect(Number(history.additionalItems[0]!.multiplier)).toBe(2);
    expect(history.additionalItems[0]!.multiplierLabel).toBe("hari");
    expect(Number(history.additionalItems[0]!.lineTotal)).toBe(600_000);
  });

  it("PO snapshot: copies qty, multiplier, labels and amount; a quotation revise does not mutate it until PO revise", async () => {
    const type = await perPersonPerDayType("Biaya transport", 100_000);
    const made = await makeQuotation(100_000, {
      additionalItems: [{ additionalItemTypeId: type.id, qty: 3, multiplier: 2 }],
    });
    await quotationsService.send(companyId, made.quotation.id);
    const approved = await quotationsService.approve(companyId, made.quotation.id, staffUserId);
    const po = await purchaseOrdersService.create(companyId, {
      quotationId: approved.id,
      customerPoNumber: `CPO-${rand()}`,
      customerPoDate: utcDate("2026-08-15"),
    });
    createdPurchaseOrderIds.push(po.id);

    expect(po.items).toHaveLength(1); // calibration line only
    const copy = po.additionalItems[0]!;
    expect(copy).toMatchObject({ description: "Biaya transport", unitLabel: "orang", multiplierLabel: "hari" });
    expect(Number(copy.qty)).toBe(3);
    expect(Number(copy.multiplier)).toBe(2);
    expect(Number(copy.lineTotal)).toBe(600_000);

    const revised = await quotationsService.revise(companyId, approved.id, staffUserId, {
      items: [
        {
          id: approved.items[0]!.id,
          requestItemId: approved.items[0]!.requestItemId!,
          description: approved.items[0]!.description,
          unitPrice: Number(approved.items[0]!.unitPrice),
        },
      ],
      additionalItems: [
        { id: approved.additionalItems[0]!.id, additionalItemTypeId: type.id, qty: 3, multiplier: 5 },
      ],
    });
    expect(Number(revised.additionalItems[0]!.lineTotal)).toBe(1_500_000);
    const stillOld = await purchaseOrdersService.findOne(companyId, po.id);
    expect(Number(stillOld.additionalItems[0]!.multiplier)).toBe(2);
    expect(Number(stillOld.additionalItems[0]!.lineTotal)).toBe(600_000);

    await purchaseOrdersService.approve(companyId, po.id, staffUserId);
    const poRevised = await purchaseOrdersService.revise(companyId, po.id, staffUserId);
    expect(Number(poRevised.additionalItems[0]!.multiplier)).toBe(5);
    const poHistory = await purchaseOrdersService.getHistoryRevision(companyId, po.id, 1);
    expect(Number(poHistory.additionalItems[0]!.multiplier)).toBe(2);
    expect(poHistory.additionalItems[0]!.multiplierLabel).toBe("hari");
  });

  it("still never reaches PurchaseOrderItem / WorkOrderItem / CalibrationJob / allocation", async () => {
    const type = await perPersonPerDayType("Biaya transport", 100_000);
    const made = await makeQuotation(100_000, {
      additionalItems: [{ additionalItemTypeId: type.id, qty: 3, multiplier: 2 }],
    });
    await quotationsService.send(companyId, made.quotation.id);
    await quotationsService.approve(companyId, made.quotation.id, staffUserId);
    const po = await purchaseOrdersService.create(companyId, {
      quotationId: made.quotation.id,
      customerPoNumber: `CPO-${rand()}`,
      customerPoDate: utcDate("2026-08-15"),
    });
    createdPurchaseOrderIds.push(po.id);
    await purchaseOrdersService.approve(companyId, po.id, staffUserId);
    const wo = await workOrdersService.create(companyId, { purchaseOrderId: po.id });
    createdWorkOrderIds.push(wo.id);
    expect(wo.items).toHaveLength(1);
    expect(await prisma.purchaseOrderItem.count({ where: { purchaseOrderId: po.id } })).toBe(1);
    expect(await prisma.purchaseOrderItemAllocation.count({ where: { workOrderId: wo.id } })).toBe(1);
    const progress = await computePoProgress(companyId, po.id);
    expect(progress.totalQty).toBe(1);
  });

  it("both PDFs render the itemised additional lines", async () => {
    const transport = await perPersonPerDayType("Biaya transport", 100_000);
    const lunch = await perPersonPerDayType("Makan siang", 50_000);
    const made = await makeQuotation(100_000, {
      additionalItems: [
        { additionalItemTypeId: transport.id, qty: 3, multiplier: 2 },
        { additionalItemTypeId: lunch.id, qty: 3, multiplier: 2, notes: "nasi kotak" },
      ],
    });
    const pdf = await quotationsService.buildPdf(companyId, made.quotation.id);
    expect(pdf.buffer.subarray(0, 4).toString()).toBe("%PDF");
    await quotationsService.send(companyId, made.quotation.id);
    await quotationsService.approve(companyId, made.quotation.id, staffUserId);
    const po = await purchaseOrdersService.create(companyId, {
      quotationId: made.quotation.id,
      customerPoNumber: `CPO-${rand()}`,
      customerPoDate: utcDate("2026-08-15"),
    });
    createdPurchaseOrderIds.push(po.id);
    const poPdf = await purchaseOrdersService.buildPdf(companyId, po.id);
    expect(poPdf.buffer.subarray(0, 4).toString()).toBe("%PDF");
  });
});

describe("additional item calculation text (shared by the PDFs and the portal)", () => {
  it("names the factors: unit price × qty unit × multiplier unit", () => {
    expect(
      additionalCalculationText({
        description: "Biaya transport",
        unitLabel: "orang",
        qty: "3.0000",
        multiplier: "2.0000",
        multiplierLabel: "hari",
        unitPrice: "100000.00",
        lineTotal: "600000.00",
      }),
    ).toMatch(/100\.000.* × 3 orang × 2 hari$/);
    expect(
      additionalCalculationText({
        description: "Biaya pengiriman",
        unitLabel: "paket",
        qty: 1,
        multiplier: null,
        multiplierLabel: null,
        unitPrice: 150_000,
        lineTotal: 150_000,
      }),
    ).toMatch(/150\.000.* × 1 paket$/);
  });
});
