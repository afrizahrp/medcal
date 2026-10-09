import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  BUSINESS_TIME_ZONE,
  DocumentNumberService,
  Prisma,
  allocateRevisionNumber,
  getZonedYearMonth,
  prisma,
} from "@medcal/db";
import {
  QUOTATION_SORTABLE_FIELDS,
  resolveHeaderDiscount,
  type CustomerPricingMode,
  type DiscountInputMode,
  type QuotationCreateInput,
  type QuotationListQuery,
  type QuotationPreviewInput,
  type QuotationReviseInput,
  type QuotationUpdateInput,
} from "@medcal/shared";
import { resolveSortOrder, withIdTieBreaker } from "../../common/sort-query";
import { recordAuditLog } from "../calibration-jobs/audit-log";
import { resolveActivePriceListItem } from "../price-list-items/price-list-items.service";
import { renderQuotationPdf, type QuotationPdfResult } from "./quotation-pdf";

/**
 * MOM #1 — Transaction Revision + Immutable History.
 * Statuses eligible for `Revise` (as opposed to the normal DRAFT `Edit`/PATCH).
 * REJECTED/EXPIRED/CANCELLED are terminal/read-only.
 */
const REVISABLE_QUOTATION_STATUSES = ["SENT", "APPROVED"] as const;

const quotationHistoryInclude = {
  items: true,
  additionalItems: true,
  revisedBy: { select: { id: true, name: true, email: true } },
} as const;

export type QuotationHistoryWithItems = Prisma.QuotationHistoryGetPayload<{
  include: typeof quotationHistoryInclude;
}>;

export type QuotationHistorySummary = Omit<QuotationHistoryWithItems, "items" | "additionalItems">;

const DEFAULT_PAGE_SIZE = 10;
const MONEY_DECIMAL_PLACES = 2;
const DEFAULT_QTY = 1;

const QUOTABLE_REQUEST_STATUSES = ["SUBMITTED", "IN_QUOTATION"] as const;

const deviceTypeSelect = {
  id: true,
  code: true,
  name: true,
} as const;

const quotationInclude = {
  // MOM #1 — Revision Scope Design: a retired (isActive: false) item is no
  // longer part of the quotation's current desired scope; it stays in the
  // database only for downstream traceability, never shown as a current row.
  items: {
    where: { isActive: true },
    include: {
      requestItem: { include: { deviceType: { select: deviceTypeSelect } } },
      tariff: { select: { id: true, code: true, name: true, unitPrice: true, currency: true } },
      device: { select: { id: true, brand: true, model: true, serialNumber: true } },
    },
  },
  // Commercial additional items (snapshot lines). Retired rows (isActive: false)
  // stay in the database only for PO traceability, never shown as current.
  additionalItems: { where: { isActive: true }, orderBy: { createdAt: "asc" } },
  customer: { include: { contacts: true } },
  request: {
    select: { id: true, number: true, status: true, customerId: true, serviceMode: true },
  },
  // Who approved the quotation, resolved for display — `name` is nullable, so
  // `email` is carried as the fallback. Not rendered anywhere yet; this closes
  // the same missing-relation gap that PurchaseOrder had.
  approvedBy: { select: { id: true, name: true, email: true } },
} as const;

export type QuotationWithItems = Prisma.QuotationGetPayload<{
  include: typeof quotationInclude;
}>;

export interface QuotationListResult {
  data: QuotationWithItems[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** One line of the read-only New-Quotation price preview. */
export interface QuotationPreviewItem {
  requestItemId: string;
  description: string;
  qty: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  /** No active Price List tariff on the preview date — unitPrice is 0. */
  pricePending: boolean;
}

export interface QuotationPreviewResult {
  items: QuotationPreviewItem[];
  /** The customer's pricing mode: MANUAL means no line is priced from the Price List. */
  pricingMode: CustomerPricingMode;
}

/** Full per-line shape accepted on PATCH (manual edit of a DRAFT quotation). */
type ItemInput = NonNullable<QuotationUpdateInput["items"]>[number];
/** Minimal per-line shape accepted on POST (description / discount tweak only). */
type CreateItemInput = NonNullable<QuotationCreateInput["items"]>[number];
/** Additional-item shape accepted on create / PATCH (full desired set). */
type AdditionalItemInput = NonNullable<QuotationCreateInput["additionalItems"]>[number];
/** Additional-item shape accepted on revise (optional `id` targets a current row). */
type ReviseAdditionalItemInput = NonNullable<QuotationReviseInput["additionalItems"]>[number];

function toDecimal(value: number | string | Prisma.Decimal): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

function money(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(MONEY_DECIMAL_PLACES, Prisma.Decimal.ROUND_HALF_UP);
}

function computeGrossLine(qty: Prisma.Decimal, unitPrice: Prisma.Decimal): Prisma.Decimal {
  return money(qty.mul(unitPrice));
}

function computeItemLine(
  qty: Prisma.Decimal,
  unitPrice: Prisma.Decimal,
  discountAmount: Prisma.Decimal,
): { discountAmount: Prisma.Decimal; lineTotal: Prisma.Decimal } {
  const grossLineAmount = computeGrossLine(qty, unitPrice);
  const discount = money(discountAmount);
  if (discount.isNegative()) {
    throw new BadRequestException({
      message: "Item discount cannot be negative",
      code: "INVALID_ITEM_DISCOUNT",
    });
  }
  if (discount.greaterThan(grossLineAmount)) {
    throw new BadRequestException({
      message: "Item discount cannot exceed the line gross amount",
      code: "ITEM_DISCOUNT_EXCEEDS_GROSS",
    });
  }
  return { discountAmount: discount, lineTotal: money(grossLineAmount.minus(discount)) };
}

/**
 * The header discount as the USER entered it: the typed field is the source of
 * truth (`mode`), the other representation is derived from the subtotal by
 * resolveHeaderDiscount (packages/shared — the same function the portal uses).
 */
interface HeaderDiscountSpec {
  mode: DiscountInputMode;
  /** A percentage for PERCENT, rupiah for AMOUNT. */
  value: Prisma.Decimal;
}

/**
 * Chooses the discount spec for a write:
 *  - the request carried a percent  -> PERCENT, that percent;
 *  - the request carried an amount  -> AMOUNT, that amount;
 *  - neither, existing quotation    -> re-apply the stored mode + its stored input
 *    value to the NEW subtotal (so a 10 % discount stays 10 % when lines change);
 *  - neither, new quotation         -> AMOUNT 0.
 */
function resolveDiscountSpec(
  input: { headerDiscountAmount?: number; headerDiscountPercent?: number },
  existing?: {
    headerDiscountAmount: Prisma.Decimal;
    headerDiscountPercent: Prisma.Decimal;
    headerDiscountInputMode: DiscountInputMode;
  },
): HeaderDiscountSpec {
  if (input.headerDiscountPercent !== undefined) {
    return { mode: "PERCENT", value: toDecimal(input.headerDiscountPercent) };
  }
  if (input.headerDiscountAmount !== undefined) {
    return { mode: "AMOUNT", value: toDecimal(input.headerDiscountAmount) };
  }
  if (existing) {
    return existing.headerDiscountInputMode === "PERCENT"
      ? { mode: "PERCENT", value: toDecimal(existing.headerDiscountPercent) }
      : { mode: "AMOUNT", value: toDecimal(existing.headerDiscountAmount) };
  }
  return { mode: "AMOUNT", value: new Prisma.Decimal(0) };
}

/** Blank / whitespace-only remarks are stored as null. */
function normalizeNotes(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

const HEADER_DISCOUNT_ERROR_MESSAGES = {
  INVALID_HEADER_DISCOUNT: "Header discount cannot be negative",
  INVALID_HEADER_DISCOUNT_PERCENT: "Header discount percent must be between 0 and 100",
  HEADER_DISCOUNT_EXCEEDS_SUBTOTAL: "Header discount cannot exceed subtotal",
} as const;

/**
 * Calculation order (unchanged apart from the combined subtotal and the
 * percent/amount input):
 *   subtotal = Σ lineTotal over ACTIVE calibration + ACTIVE additional lines
 *   discount = resolveHeaderDiscount(subtotal, mode, value).amount
 *   net      = subtotal − discount
 *   tax      = 0 | money(net × rate) [exclusive] | money(net × rate / (1 + rate)) [inclusive]
 *   total    = net + tax [exclusive] | net [inclusive / zero rate]
 */
function computeHeaderTotals(
  lineTotals: Prisma.Decimal[],
  discount: HeaderDiscountSpec,
  tax: { taxRate: Prisma.Decimal; isExclude: boolean },
): {
  subtotal: Prisma.Decimal;
  headerDiscountAmount: Prisma.Decimal;
  headerDiscountPercent: Prisma.Decimal;
  headerDiscountInputMode: DiscountInputMode;
  taxAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
} {
  const subtotal = money(lineTotals.reduce((acc, line) => acc.plus(line), new Prisma.Decimal(0)));
  const resolved = resolveHeaderDiscount({
    subtotal: subtotal.toNumber(),
    mode: discount.mode,
    value: discount.value.toNumber(),
  });
  if (!resolved.ok) {
    throw new BadRequestException({
      message: HEADER_DISCOUNT_ERROR_MESSAGES[resolved.code],
      code: resolved.code,
    });
  }
  const headerDiscount = money(new Prisma.Decimal(resolved.amount.toFixed(MONEY_DECIMAL_PLACES)));
  const headerDiscountPercent = new Prisma.Decimal(resolved.percent.toFixed(4));
  const netAmount = money(subtotal.minus(headerDiscount));
  const discountFields = {
    subtotal,
    headerDiscountAmount: headerDiscount,
    headerDiscountPercent,
    headerDiscountInputMode: discount.mode,
  };
  if (tax.taxRate.isZero()) {
    return {
      ...discountFields,
      taxAmount: money(new Prisma.Decimal(0)),
      totalAmount: netAmount,
    };
  }
  if (tax.isExclude) {
    const taxAmount = money(netAmount.mul(tax.taxRate));
    return { ...discountFields, taxAmount, totalAmount: money(netAmount.plus(taxAmount)) };
  }
  const taxAmount = money(netAmount.mul(tax.taxRate).div(tax.taxRate.plus(1)));
  return { ...discountFields, taxAmount, totalAmount: netAmount };
}

// -----------------------------------------------------------------------------
// Quotation date (business date, date-only, Asia/Jakarta calendar day)
// -----------------------------------------------------------------------------

/** UTC-midnight Date for a calendar day — the `@db.Date` representation. */
function toDateOnlyUtc(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

/** Today's calendar day in the business zone (Asia/Jakarta) as a UTC-midnight Date. */
function todayInBusinessZone(now: Date = new Date()): Date {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return new Date(`${iso}T00:00:00.000Z`);
}

function assertQuotationDateNotInFuture(quotationDate: Date): void {
  if (quotationDate.getTime() > todayInBusinessZone().getTime()) {
    throw new BadRequestException({
      message: "Quotation date cannot be in the future",
      code: "QUOTATION_DATE_IN_FUTURE",
    });
  }
}

function assertValidUntilNotBeforeQuotationDate(
  validUntil: Date | null | undefined,
  quotationDate: Date,
): void {
  if (validUntil && toDateOnlyUtc(validUntil).getTime() < quotationDate.getTime()) {
    throw new BadRequestException({
      message: "Valid-until date cannot be earlier than the quotation date",
      code: "VALID_UNTIL_BEFORE_QUOTATION_DATE",
    });
  }
}

function backdatedDays(quotationDate: Date): number {
  return Math.round(
    (todayInBusinessZone().getTime() - quotationDate.getTime()) / (24 * 60 * 60 * 1000),
  );
}

/** Audit trail for a quotation whose business date is earlier than today. */
async function auditIfBackdated(params: {
  companyId: string;
  userId: string | null | undefined;
  quotationId: string;
  number: string;
  quotationDate: Date;
  action: "QUOTATION_BACKDATED";
}): Promise<void> {
  const days = backdatedDays(params.quotationDate);
  if (days <= 0) return;
  await recordAuditLog({
    companyId: params.companyId,
    userId: params.userId ?? null,
    action: params.action,
    outcome: "SUCCESS",
    targetType: "Quotation",
    targetId: params.quotationId,
    metadata: {
      number: params.number,
      quotationDate: params.quotationDate.toISOString().slice(0, 10),
      backdatedDays: days,
    },
  });
}

// -----------------------------------------------------------------------------
// Commercial additional items (catalog -> quotation snapshot)
// -----------------------------------------------------------------------------

interface AdditionalItemRow {
  companyId: string;
  quotationId: string;
  additionalItemTypeId: string;
  code: string;
  description: string;
  unitLabel: string;
  qty: Prisma.Decimal;
  /** Optional second multiplier (e.g. days) + its label; both null for a simple qty line. */
  multiplier: Prisma.Decimal | null;
  multiplierLabel: string | null;
  unitPrice: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  notes: string | null;
}

type AdditionalItemTypeRow = Prisma.AdditionalItemTypeGetPayload<object>;

async function loadAdditionalItemTypes(
  tx: Prisma.TransactionClient,
  companyId: string,
  typeIds: string[],
): Promise<Map<string, AdditionalItemTypeRow>> {
  const uniqueIds = [...new Set(typeIds)];
  if (uniqueIds.length === 0) return new Map();
  const rows = await tx.additionalItemType.findMany({
    where: { id: { in: uniqueIds }, companyId },
  });
  if (rows.length !== uniqueIds.length) {
    throw new BadRequestException({
      message: "One or more additional item types not found",
      code: "ADDITIONAL_ITEM_TYPE_NOT_FOUND",
    });
  }
  return new Map(rows.map((row) => [row.id, row]));
}

/** A type may be newly attached only while active and applicable to the requisition's service mode. */
function assertAdditionalItemTypeUsable(
  type: AdditionalItemTypeRow,
  serviceMode: "ON_SITE" | "SEND_TO_LAB",
): void {
  if (!type.isActive) {
    throw new BadRequestException({
      message: `Additional item type ${type.code} is inactive`,
      code: "ADDITIONAL_ITEM_TYPE_INACTIVE",
    });
  }
  if (type.serviceMode !== null && type.serviceMode !== serviceMode) {
    throw new BadRequestException({
      message: `Additional item type ${type.code} is not applicable to ${serviceMode} requisitions`,
      code: "ADDITIONAL_ITEM_TYPE_MODE_MISMATCH",
    });
  }
}

/**
 * The second multiplier follows the line's (snapshotted) multiplier label: a line
 * that has one REQUIRES a multiplier, a line without one REJECTS it - so the shape
 * of the calculation is decided by the catalog type, never guessed.
 */
function resolveAdditionalMultiplier(
  code: string,
  label: string | null,
  multiplier: number | undefined,
): Prisma.Decimal | null {
  if (label === null) {
    if (multiplier !== undefined) {
      throw new BadRequestException({
        message: `Additional item ${code} has no multiplier (e.g. days); do not send one`,
        code: "ADDITIONAL_ITEM_MULTIPLIER_NOT_APPLICABLE",
      });
    }
    return null;
  }
  if (multiplier === undefined) {
    throw new BadRequestException({
      message: `Additional item ${code} requires a number of ${label}`,
      code: "ADDITIONAL_ITEM_MULTIPLIER_REQUIRED",
    });
  }
  return toDecimal(multiplier);
}

/**
 * THE additional-line amount (backend-authoritative, deterministic):
 *   lineTotal = round2(unitPrice x qty x (multiplier ?? 1))
 * No per-line discount exists on additional items; the quotation-level header
 * discount is applied to the combined subtotal.
 */
function additionalLineTotal(
  unitPrice: Prisma.Decimal,
  qty: Prisma.Decimal,
  multiplier: Prisma.Decimal | null,
): Prisma.Decimal {
  const total = money(unitPrice.mul(qty).mul(multiplier ?? 1));
  if (!total.greaterThan(0)) {
    throw new BadRequestException({
      message: "Additional item amount must be greater than zero",
      code: "INVALID_ADDITIONAL_ITEM_AMOUNT",
    });
  }
  return total;
}

/**
 * Snapshot a NEW additional line from the catalog entry + the user's input.
 * `description` defaults to the catalog name and `unitPrice` to its default
 * price; there is no pending-price state for add-ons, so a missing price is an
 * error. The catalog's unit / multiplier labels are copied here and the line
 * never reads the catalog again.
 */
function buildAdditionalRowFromType(
  companyId: string,
  quotationId: string,
  type: AdditionalItemTypeRow,
  input: {
    description?: string;
    qty: number;
    multiplier?: number;
    unitPrice?: number;
    notes?: string | null;
  },
): AdditionalItemRow {
  const unitPriceSource = input.unitPrice ?? type.defaultUnitPrice;
  if (unitPriceSource === null || unitPriceSource === undefined) {
    throw new BadRequestException({
      message: `Unit price is required for additional item ${type.code}`,
      code: "ADDITIONAL_ITEM_PRICE_REQUIRED",
    });
  }
  const unitPrice = toDecimal(unitPriceSource);
  if (!unitPrice.greaterThan(0)) {
    throw new BadRequestException({
      message: "Additional item unit price must be greater than zero",
      code: "INVALID_ADDITIONAL_ITEM_PRICE",
    });
  }
  const qty = toDecimal(input.qty);
  const multiplier = resolveAdditionalMultiplier(type.code, type.multiplierLabel, input.multiplier);
  return {
    companyId,
    quotationId,
    additionalItemTypeId: type.id,
    code: type.code,
    description: input.description ?? type.name,
    unitLabel: type.unitLabel,
    qty,
    multiplier,
    multiplierLabel: type.multiplierLabel,
    unitPrice,
    lineTotal: additionalLineTotal(unitPrice, qty, multiplier),
    notes: input.notes ?? null,
  };
}

/** Full-set build used by create and by PATCH (DRAFT full replace). */
async function buildAdditionalRows(
  tx: Prisma.TransactionClient,
  companyId: string,
  quotationId: string,
  serviceMode: "ON_SITE" | "SEND_TO_LAB",
  inputs: AdditionalItemInput[],
): Promise<AdditionalItemRow[]> {
  if (inputs.length === 0) return [];
  const types = await loadAdditionalItemTypes(
    tx,
    companyId,
    inputs.map((input) => input.additionalItemTypeId),
  );
  return inputs.map((input) => {
    const type = types.get(input.additionalItemTypeId)!;
    assertAdditionalItemTypeUsable(type, serviceMode);
    return buildAdditionalRowFromType(companyId, quotationId, type, input);
  });
}

async function resolveDocumentTax(
  tx: Prisma.TransactionClient,
  companyId: string,
  taxCode: string,
): Promise<{ taxCode: string; taxRate: Prisma.Decimal; isExclude: boolean }> {
  const tax = await tx.tax.findFirst({
    where: { companyId, taxCode, isActive: true },
  });
  if (!tax) {
    throw new BadRequestException({
      message: "Tax not found",
      code: "TAX_NOT_FOUND",
    });
  }
  return { taxCode: tax.taxCode, taxRate: tax.taxRate, isExclude: tax.isExclude };
}

/**
 * Display-only lookup of the tax mode for a document that is being rendered.
 * Unlike resolveDocumentTax this never throws: a quotation may reference a tax
 * code that has since been deactivated or removed, and printing it must still
 * work — the caller then falls back to the previous "always show the tax line"
 * behaviour.
 */
async function findTaxIsExclude(companyId: string, taxCode: string): Promise<boolean | null> {
  if (!taxCode) return null;
  const tax = await prisma.tax.findFirst({
    where: { companyId, taxCode },
    select: { isExclude: true },
  });
  return tax?.isExclude ?? null;
}

async function assertTariffsExist(
  tx: Prisma.TransactionClient,
  companyId: string,
  tariffIds: string[],
): Promise<void> {
  const uniqueIds = [...new Set(tariffIds)];
  if (uniqueIds.length === 0) return;
  const count = await tx.serviceTariff.count({
    where: { id: { in: uniqueIds }, companyId },
  });
  if (count !== uniqueIds.length) {
    throw new BadRequestException({
      message: "One or more service tariffs not found",
      code: "TARIFF_NOT_FOUND",
    });
  }
}

async function assertDevicesBelongToCustomer(
  tx: Prisma.TransactionClient,
  companyId: string,
  customerId: string,
  deviceIds: string[],
): Promise<void> {
  const uniqueIds = [...new Set(deviceIds)];
  if (uniqueIds.length === 0) return;
  const count = await tx.device.count({
    where: { id: { in: uniqueIds }, companyId, customerId },
  });
  if (count !== uniqueIds.length) {
    throw new BadRequestException({
      message: "One or more devices not found for this customer",
      code: "DEVICE_NOT_FOUND",
    });
  }
}

/**
 * MOM #1 — Final Revision Scope Design §10 (cross-chain safety guard).
 * Before retiring a consumed QuotationItem (isActive -> false), confirm no
 * WorkOrderItem derived from it belongs to a WorkOrder that has already
 * left PLANNED/ASSIGNED — retiring it past that point would silently
 * invalidate scope a WorkOrder has already committed to (or fanned out
 * CalibrationJobs for).
 */
async function assertRetirementSafe(
  tx: Prisma.TransactionClient,
  quotationItemIds: string[],
): Promise<void> {
  const blocking = await tx.workOrderItem.findFirst({
    where: {
      purchaseOrderItem: { quotationItemId: { in: quotationItemIds } },
      workOrder: { status: { notIn: ["PLANNED", "ASSIGNED"] } },
    },
    select: { workOrder: { select: { number: true, status: true } } },
  });
  if (blocking) {
    throw new BadRequestException({
      message:
        `This item has already reached Work Order ${blocking.workOrder.number} ` +
        `(status ${blocking.workOrder.status}), which is no longer PLANNED/ASSIGNED. ` +
        "It cannot be removed by a revision.",
      code: "RETIREMENT_BLOCKED_BY_WORK_ORDER_PROGRESS",
    });
  }
}

async function assertFullScopeItems(
  tx: Prisma.TransactionClient,
  requestId: string,
  items: Array<{ requestItemId: string }>,
): Promise<void> {
  const requestItems = await tx.calibrationRequestItem.findMany({
    where: { requestId, isActive: true },
    select: { id: true },
  });
  const requestItemIds = new Set(requestItems.map((item) => item.id));
  const inputIds = items.map((item) => item.requestItemId);

  if (new Set(inputIds).size !== inputIds.length) {
    throw new BadRequestException({
      message: "Duplicate requisition items are not allowed on a quotation",
      code: "DUPLICATE_REQUEST_ITEM",
    });
  }

  const missingFromInput = [...requestItemIds].filter((id) => !inputIds.includes(id));
  const unknownInInput = inputIds.filter((id) => !requestItemIds.has(id));
  if (missingFromInput.length > 0 || unknownInInput.length > 0) {
    throw new BadRequestException({
      message: "Quotation items must cover the full Requisition scope",
      code: "QUOTATION_SCOPE_MISMATCH",
    });
  }
}

/**
 * Requisition-owned device identity per request item. The manual PATCH/revise
 * paths accept an optional per-line `deviceId`; when the caller omits it the
 * line must inherit CalibrationRequestItem.deviceId verbatim rather than
 * silently nulling the lineage.
 */
async function loadRequestItemDeviceIds(
  tx: Prisma.TransactionClient,
  requestId: string,
): Promise<Map<string, string | null>> {
  const rows = await tx.calibrationRequestItem.findMany({
    where: { requestId },
    select: { id: true, deviceId: true },
  });
  return new Map(rows.map((row) => [row.id, row.deviceId]));
}

interface QuotationItemRow {
  companyId: string;
  quotationId: string;
  requestItemId: string;
  deviceId: string | null;
  tariffId: string | null;
  description: string;
  qty: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  pricePending: boolean;
}

/**
 * PATCH path — the caller supplies the full commercial line (manual override of
 * a DRAFT quotation). A line is still flagged `pricePending` if its manually
 * entered unit price is not positive.
 */
function buildItemRows(
  companyId: string,
  quotationId: string,
  items: ItemInput[],
  requestItemDeviceIds: Map<string, string | null>,
): QuotationItemRow[] {
  return items.map((item) => {
    const qty = toDecimal(item.qty ?? DEFAULT_QTY);
    const unitPrice = toDecimal(item.unitPrice);
    const line = computeItemLine(qty, unitPrice, toDecimal(item.discountAmount ?? 0));
    return {
      companyId,
      quotationId,
      requestItemId: item.requestItemId,
      deviceId: item.deviceId ?? requestItemDeviceIds.get(item.requestItemId) ?? null,
      tariffId: item.tariffId ?? null,
      description: item.description,
      qty,
      unitPrice,
      discountAmount: line.discountAmount,
      lineTotal: line.lineTotal,
      pricePending: unitPrice.lessThanOrEqualTo(0),
    };
  });
}

/**
 * BR-11: a quotation with any line whose Price List tariff was not configured at
 * generation time (unitPrice 0, `pricePending`) must not advance to SENT or
 * APPROVED. The user must enter a real unit price via PATCH first.
 */
async function assertNoPendingPrices(quotationId: string): Promise<void> {
  const pending = await prisma.quotationItem.count({
    where: { quotationId, pricePending: true },
  });
  if (pending > 0) {
    throw new BadRequestException({
      message:
        "Quotation has line(s) with no configured price. Enter a unit price for every line before sending.",
      code: "QUOTATION_PRICE_NOT_CONFIGURED",
      pendingCount: pending,
    });
  }
}

type RequestForGeneration = Prisma.CalibrationRequestGetPayload<{
  include: { items: { include: { deviceType: { select: { name: true } } } } };
}>;

/**
 * POST path — the server GENERATES one quotation line per CalibrationRequestItem.
 * `qty` is copied verbatim from the requisition (BR-03); `unitPrice` is resolved
 * from the Price List as of the QUOTATION DATE and SNAPSHOTTED (BR-07/BR-10).
 * When no active tariff exists the line is created with unitPrice 0 and
 * `pricePending = true` (BR-11) — such a quotation cannot be sent/approved.
 *
 * `pricingMode` is the customer's: MANUAL never consults the Price List, so
 * every line is created `pricePending` and the user types the price (the
 * existing send/approve gate then applies unchanged).
 */
async function buildGeneratedRows(
  tx: Prisma.TransactionClient | typeof prisma,
  companyId: string,
  quotationId: string,
  request: RequestForGeneration,
  overrides: Map<string, CreateItemInput>,
  quotationDate: Date,
  pricingMode: CustomerPricingMode,
): Promise<QuotationItemRow[]> {
  const rows: QuotationItemRow[] = [];
  for (const requestItem of request.items) {
    const override = overrides.get(requestItem.id);
    const resolved =
      pricingMode === "MANUAL"
        ? null
        : await resolveActivePriceListItem(tx, companyId, requestItem.deviceTypeId, quotationDate);
    // A price typed by the user is accepted only where the Price List has none
    // (MANUAL customer, or no active tariff) — never to override a Price List price.
    if (override?.unitPrice !== undefined && resolved !== null) {
      throw new BadRequestException({
        message: "A unit price can only be entered for a line without a Price List price",
        code: "UNIT_PRICE_NOT_ALLOWED",
        requestItemId: requestItem.id,
      });
    }
    const manualPrice = resolved === null ? override?.unitPrice : undefined;
    const pricePending = resolved === null && manualPrice === undefined;
    const qty = toDecimal(requestItem.qty ?? DEFAULT_QTY);
    const unitPrice = resolved
      ? toDecimal(resolved.unitPrice)
      : manualPrice !== undefined
        ? toDecimal(manualPrice)
        : new Prisma.Decimal(0);
    // A pending (zero) price cannot carry a discount — force it to 0 so
    // computeItemLine's "discount exceeds gross" guard is not tripped.
    const discountInput = pricePending
      ? new Prisma.Decimal(0)
      : toDecimal(override?.discountAmount ?? 0);
    const line = computeItemLine(qty, unitPrice, discountInput);
    rows.push({
      companyId,
      quotationId,
      requestItemId: requestItem.id,
      // CalibrationRequestItem.deviceId is a required, real Device.id FK
      // (resolved server-side from the customer's Serial No at Requisition
      // stage) — copy it forward verbatim, never re-resolve, never null it.
      deviceId: requestItem.deviceId,
      tariffId: null,
      description: override?.description ?? requestItem.deviceType.name,
      qty,
      unitPrice,
      discountAmount: line.discountAmount,
      lineTotal: line.lineTotal,
      pricePending,
    });
  }
  return rows;
}

@Injectable()
export class QuotationsService {
  async create(
    companyId: string,
    input: QuotationCreateInput,
    userId?: string | null,
  ): Promise<QuotationWithItems> {
    const quotationDate = input.quotationDate
      ? toDateOnlyUtc(input.quotationDate)
      : todayInBusinessZone();
    assertQuotationDateNotInFuture(quotationDate);
    assertValidUntilNotBeforeQuotationDate(input.validUntil, quotationDate);

    const created = await prisma.$transaction(async (tx) => {
      const request = await tx.calibrationRequest.findFirst({
        where: { id: input.requestId, companyId },
        include: {
          items: { where: { isActive: true }, include: { deviceType: { select: { name: true } } } },
          customer: { select: { pricingMode: true } },
        },
      });
      if (!request) {
        throw new BadRequestException({
          message: "Requisition not found",
          code: "CALIBRATION_REQUEST_NOT_FOUND",
        });
      }

      if (
        !QUOTABLE_REQUEST_STATUSES.includes(
          request.status as (typeof QUOTABLE_REQUEST_STATUSES)[number],
        )
      ) {
        throw new BadRequestException({
          message: "Requisition is not in a status that allows quotation",
          code: "INVALID_STATUS_FOR_QUOTATION",
        });
      }

      const existingQuotation = await tx.quotation.findFirst({
        where: { requestId: request.id, companyId },
        select: { id: true },
      });
      if (existingQuotation) {
        throw new ConflictException({
          message: "A quotation already exists for this requisition",
          code: "DUPLICATE_QUOTATION_FOR_REQUEST",
          quotationId: existingQuotation.id,
        });
      }

      // Requisition is the sole source of quotation scope (BR-01). When the
      // caller passes an explicit `items` array it may only tweak
      // description / line discount, and it must still cover the full scope.
      const overrides = new Map<string, CreateItemInput>();
      if (input.items) {
        await assertFullScopeItems(tx, request.id, input.items);
        for (const item of input.items) overrides.set(item.requestItemId, item);
      }

      const documentTax = await resolveDocumentTax(tx, companyId, input.taxCode);
      // The number follows the QUOTATION DATE (not the moment of entry): a
      // @db.Date value is UTC midnight and QUOTATION numbers are built in UTC,
      // so the printed year/month are exactly the document date's.
      const number = await DocumentNumberService.allocate({
        companyId,
        documentType: "QUOTATION",
        issuedAt: quotationDate,
        tx,
      });

      const draftRows = await buildGeneratedRows(
        tx,
        companyId,
        "pending",
        request,
        overrides,
        quotationDate,
        request.customer.pricingMode,
      );
      const additionalRows = await buildAdditionalRows(
        tx,
        companyId,
        "pending",
        request.serviceMode,
        input.additionalItems ?? [],
      );
      const totals = computeHeaderTotals(
        [...draftRows, ...additionalRows].map((row) => row.lineTotal),
        resolveDiscountSpec(input),
        documentTax,
      );

      const quotation = await tx.quotation.create({
        data: {
          companyId,
          customerId: request.customerId,
          number,
          requestId: request.id,
          source: input.source ?? "PORTAL",
          status: "DRAFT",
          quotationDate,
          validUntil: input.validUntil,
          notes: normalizeNotes(input.notes),
          taxCode: documentTax.taxCode,
          taxRate: documentTax.taxRate,
          subtotal: totals.subtotal,
          headerDiscountAmount: totals.headerDiscountAmount,
          headerDiscountPercent: totals.headerDiscountPercent,
          headerDiscountInputMode: totals.headerDiscountInputMode,
          taxAmount: totals.taxAmount,
          totalAmount: totals.totalAmount,
        },
      });

      await tx.quotationItem.createMany({
        data: draftRows.map((row) => ({
          ...row,
          quotationId: quotation.id,
        })),
      });

      if (additionalRows.length > 0) {
        await tx.quotationAdditionalItem.createMany({
          data: additionalRows.map((row) => ({ ...row, quotationId: quotation.id })),
        });
      }

      if (request.status === "SUBMITTED") {
        await tx.calibrationRequest.update({
          where: { id: request.id },
          data: { status: "IN_QUOTATION" },
        });
      }

      return tx.quotation.findFirstOrThrow({
        where: { id: quotation.id, companyId },
        include: quotationInclude,
      });
    });

    await auditIfBackdated({
      companyId,
      userId,
      quotationId: created.id,
      number: created.number,
      quotationDate,
      action: "QUOTATION_BACKDATED",
    });

    return created;
  }

  /**
   * Read-only price preview for the New Quotation screen. Resolves the Price
   * List tariff for every requisition line exactly the way `create` snapshots it
   * (buildGeneratedRows) — but persists nothing. The unit price shown here is
   * therefore the same authoritative value the quotation will carry once created.
   */
  async preview(companyId: string, input: QuotationPreviewInput): Promise<QuotationPreviewResult> {
    const quotationDate = input.quotationDate
      ? toDateOnlyUtc(input.quotationDate)
      : todayInBusinessZone();
    assertQuotationDateNotInFuture(quotationDate);

    const request = await prisma.calibrationRequest.findFirst({
      where: { id: input.requestId, companyId },
      include: {
        items: { where: { isActive: true }, include: { deviceType: { select: { name: true } } } },
        customer: { select: { pricingMode: true } },
      },
    });
    if (!request) {
      throw new BadRequestException({
        message: "Requisition not found",
        code: "CALIBRATION_REQUEST_NOT_FOUND",
      });
    }

    const rows = await buildGeneratedRows(
      prisma,
      companyId,
      "preview",
      request,
      new Map(),
      quotationDate,
      request.customer.pricingMode,
    );

    return {
      pricingMode: request.customer.pricingMode,
      items: rows.map((row) => ({
        requestItemId: row.requestItemId,
        description: row.description,
        qty: row.qty,
        unitPrice: row.unitPrice,
        lineTotal: row.lineTotal,
        pricePending: row.pricePending,
      })),
    };
  }

  async findAll(companyId: string, query: QuotationListQuery): Promise<QuotationListResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.QuotationWhereInput = {
      companyId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.requestId ? { requestId: query.requestId } : {}),
      ...(query.search
        ? {
            OR: [
              { number: { contains: query.search, mode: "insensitive" } },
              { customer: { name: { contains: query.search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const { field: sortField, dir: sortDir } = resolveSortOrder(
      QUOTATION_SORTABLE_FIELDS,
      query.sortBy,
      query.sortDir,
      "createdAt",
    );

    const [total, data] = await Promise.all([
      prisma.quotation.count({ where }),
      prisma.quotation.findMany({
        where,
        orderBy: withIdTieBreaker(sortField, sortDir),
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: quotationInclude,
      }),
    ]);

    return { data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async findOne(companyId: string, id: string): Promise<QuotationWithItems> {
    const quotation = await prisma.quotation.findFirst({
      where: { id, companyId },
      include: quotationInclude,
    });
    if (!quotation) {
      throw new NotFoundException({
        message: "Quotation not found",
        code: "QUOTATION_NOT_FOUND",
      });
    }
    return quotation;
  }

  async buildPdf(companyId: string, id: string): Promise<QuotationPdfResult> {
    const quotation = await this.findOne(companyId, id);
    const company = await prisma.company.findFirst({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException({
        message: "Company not found",
        code: "COMPANY_NOT_FOUND",
      });
    }
    const taxIsExclude = await findTaxIsExclude(companyId, quotation.taxCode);
    return renderQuotationPdf({ quotation: { ...quotation, taxIsExclude }, company });
  }

  async update(
    companyId: string,
    id: string,
    input: QuotationUpdateInput,
    userId?: string | null,
  ): Promise<QuotationWithItems> {
    const existing = await prisma.quotation.findFirst({
      where: { id, companyId },
    });
    if (!existing) {
      throw new NotFoundException({
        message: "Quotation not found",
        code: "QUOTATION_NOT_FOUND",
      });
    }

    // Commercial freeze: only DRAFT may be edited. SENT and later statuses
    // keep historical commercial meaning (locked planning contract).
    if (existing.status !== "DRAFT") {
      throw new BadRequestException({
        message: "Cannot update quotation that is not in DRAFT status",
        code: "INVALID_STATUS_FOR_UPDATE",
      });
    }

    const quotationDate = input.quotationDate
      ? toDateOnlyUtc(input.quotationDate)
      : existing.quotationDate;
    if (input.quotationDate !== undefined) assertQuotationDateNotInFuture(quotationDate);
    if (input.quotationDate !== undefined || input.validUntil !== undefined) {
      assertValidUntilNotBeforeQuotationDate(
        input.validUntil !== undefined ? input.validUntil : existing.validUntil,
        quotationDate,
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const requestId = existing.requestId;

      if (input.items) {
        await assertFullScopeItems(tx, requestId, input.items);
        await assertTariffsExist(
          tx,
          companyId,
          input.items.flatMap((item) => (item.tariffId ? [item.tariffId] : [])),
        );
        await assertDevicesBelongToCustomer(
          tx,
          companyId,
          existing.customerId,
          input.items.flatMap((item) => (item.deviceId ? [item.deviceId] : [])),
        );

        await tx.quotationItem.deleteMany({ where: { quotationId: id } });
        await tx.quotationItem.createMany({
          data: buildItemRows(
            companyId,
            id,
            input.items,
            await loadRequestItemDeviceIds(tx, requestId),
          ),
        });
      }

      // DRAFT: nothing can be consumed yet (a PO needs an APPROVED quotation),
      // so the additional items are a plain full replace, like `items`.
      if (input.additionalItems) {
        const request = await tx.calibrationRequest.findFirstOrThrow({
          where: { id: requestId, companyId },
          select: { serviceMode: true },
        });
        const rows = await buildAdditionalRows(
          tx,
          companyId,
          id,
          request.serviceMode,
          input.additionalItems,
        );
        await tx.quotationAdditionalItem.deleteMany({ where: { quotationId: id } });
        if (rows.length > 0) await tx.quotationAdditionalItem.createMany({ data: rows });
      }

      const taxCode = input.taxCode !== undefined ? input.taxCode : existing.taxCode;
      const documentTax = await resolveDocumentTax(tx, companyId, taxCode);

      const itemRows = await tx.quotationItem.findMany({ where: { quotationId: id } });
      const additionalRows = await tx.quotationAdditionalItem.findMany({
        where: { quotationId: id },
      });
      const totals = computeHeaderTotals(
        [...itemRows, ...additionalRows].map((row) => toDecimal(row.lineTotal)),
        resolveDiscountSpec(input, existing),
        documentTax,
      );

      // The DRAFT number follows the quotation date: re-issue it only when the
      // date moved to a different year/month (a DRAFT has not been sent, and a
      // sequence number is never reused). Lines are NOT repriced.
      const dateChanged = quotationDate.getTime() !== existing.quotationDate.getTime();
      const oldPeriod = getZonedYearMonth(existing.quotationDate);
      const newPeriod = getZonedYearMonth(quotationDate);
      const reissueNumber =
        dateChanged && (oldPeriod.year !== newPeriod.year || oldPeriod.month !== newPeriod.month);
      const number = reissueNumber
        ? await DocumentNumberService.allocate({
            companyId,
            documentType: "QUOTATION",
            issuedAt: quotationDate,
            tx,
          })
        : existing.number;

      await tx.quotation.update({
        where: { id },
        data: {
          ...(input.source !== undefined ? { source: input.source } : {}),
          ...(input.validUntil !== undefined ? { validUntil: input.validUntil } : {}),
          ...(input.notes !== undefined ? { notes: normalizeNotes(input.notes) } : {}),
          ...(dateChanged ? { quotationDate } : {}),
          ...(reissueNumber ? { number } : {}),
          taxCode: documentTax.taxCode,
          taxRate: documentTax.taxRate,
          subtotal: totals.subtotal,
          headerDiscountAmount: totals.headerDiscountAmount,
          headerDiscountPercent: totals.headerDiscountPercent,
          headerDiscountInputMode: totals.headerDiscountInputMode,
          taxAmount: totals.taxAmount,
          totalAmount: totals.totalAmount,
        },
      });

      return tx.quotation.findFirstOrThrow({
        where: { id, companyId },
        include: quotationInclude,
      });
    });

    if (input.quotationDate !== undefined && quotationDate.getTime() !== existing.quotationDate.getTime()) {
      await auditIfBackdated({
        companyId,
        userId,
        quotationId: id,
        number: updated.number,
        quotationDate,
        action: "QUOTATION_BACKDATED",
      });
    }

    return updated;
  }

  async send(companyId: string, id: string): Promise<QuotationWithItems> {
    const existing = await prisma.quotation.findFirst({
      where: { id, companyId },
    });
    if (!existing) {
      throw new NotFoundException({
        message: "Quotation not found",
        code: "QUOTATION_NOT_FOUND",
      });
    }

    if (existing.status !== "DRAFT") {
      throw new BadRequestException({
        message: "Only DRAFT quotations can be sent",
        code: "INVALID_STATUS_FOR_SEND",
      });
    }

    await assertNoPendingPrices(id);

    return prisma.quotation.update({
      where: { id },
      data: { status: "SENT" },
      include: quotationInclude,
    });
  }

  async approve(companyId: string, id: string, userId: string): Promise<QuotationWithItems> {
    const existing = await prisma.quotation.findFirst({
      where: { id, companyId },
    });
    if (!existing) {
      throw new NotFoundException({
        message: "Quotation not found",
        code: "QUOTATION_NOT_FOUND",
      });
    }

    if (existing.status !== "DRAFT" && existing.status !== "SENT") {
      throw new BadRequestException({
        message: "Only DRAFT or SENT quotations can be approved",
        code: "INVALID_STATUS_FOR_APPROVE",
      });
    }

    await assertNoPendingPrices(id);

    const now = new Date();
    return prisma.quotation.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedAt: now,
        approvedByUserId: userId,
        customerApprovedAt: now,
      },
      include: quotationInclude,
    });
  }

  async reject(companyId: string, id: string): Promise<QuotationWithItems> {
    const existing = await prisma.quotation.findFirst({
      where: { id, companyId },
    });
    if (!existing) {
      throw new NotFoundException({
        message: "Quotation not found",
        code: "QUOTATION_NOT_FOUND",
      });
    }

    if (existing.status !== "SENT") {
      throw new BadRequestException({
        message: "Only SENT quotations can be rejected",
        code: "INVALID_STATUS_FOR_REJECT",
      });
    }

    return prisma.quotation.update({
      where: { id },
      data: { status: "REJECTED" },
      include: quotationInclude,
    });
  }

  async cancel(companyId: string, id: string): Promise<QuotationWithItems> {
    const existing = await prisma.quotation.findFirst({
      where: { id, companyId },
    });
    if (!existing) {
      throw new NotFoundException({
        message: "Quotation not found",
        code: "QUOTATION_NOT_FOUND",
      });
    }

    if (existing.status === "CANCELLED") {
      throw new BadRequestException({
        message: "Quotation is already cancelled",
        code: "ALREADY_CANCELLED",
      });
    }

    if (existing.status === "APPROVED") {
      throw new BadRequestException({
        message: "Cannot cancel an approved quotation",
        code: "CANNOT_CANCEL_APPROVED",
      });
    }

    return prisma.quotation.update({
      where: { id },
      data: { status: "CANCELLED" },
      include: quotationInclude,
    });
  }

  /**
   * MOM #1 — Final Revision Scope Design (desired-scope reconciliation).
   * See mom-1-final-revision-scope-design-20260920.md.
   *
   * `input.items` is the COMPLETE desired active scope, not a set of edits:
   * a current active item's `id` absent from `input.items` is REMOVED.
   * Matching is by row `id` only. Device replacement is REMOVE (old id) +
   * ADD (new, no id) — there is no separate "replace" persistence concept.
   *
   * Reachable once the quotation has left DRAFT (see
   * REVISABLE_QUOTATION_STATUSES). Snapshots the complete current header +
   * all current active items into QuotationHistory / QuotationItemHistory
   * (append-only) before applying the reconciliation. The customer-facing
   * `number` never changes.
   *
   * Per-item semantics: unconsumed rows are freely updated/deleted in
   * place. A consumed row (already snapshotted into a PurchaseOrderItem) is
   * frozen — removal retires it (`isActive: false`) instead of deleting it,
   * a qty increase is a new active sibling row carrying the delta, and a
   * qty decrease retires the frozen row and adds a new row carrying the
   * full new desired qty.
   */
  async revise(
    companyId: string,
    id: string,
    userId: string,
    input: QuotationReviseInput,
  ): Promise<QuotationWithItems> {
    const existing = await prisma.quotation.findFirst({
      where: { id, companyId },
      include: {
        items: { where: { isActive: true } },
        additionalItems: { where: { isActive: true } },
        request: { select: { serviceMode: true } },
      },
    });
    if (!existing) {
      throw new NotFoundException({
        message: "Quotation not found",
        code: "QUOTATION_NOT_FOUND",
      });
    }

    if (
      !REVISABLE_QUOTATION_STATUSES.includes(
        existing.status as (typeof REVISABLE_QUOTATION_STATUSES)[number],
      )
    ) {
      throw new BadRequestException({
        message:
          existing.status === "DRAFT"
            ? "DRAFT quotations must use the normal edit action, not revise"
            : "Quotation is not in a status that allows revision",
        code: "INVALID_STATUS_FOR_REVISE",
      });
    }

    const currentItemsById = new Map(existing.items.map((item) => [item.id, item]));
    for (const item of input.items) {
      if (item.id && !currentItemsById.has(item.id)) {
        throw new BadRequestException({
          message: "One or more revised items do not belong to this quotation",
          code: "QUOTATION_ITEM_NOT_FOUND",
        });
      }
    }
    const desiredIds = new Set(input.items.flatMap((item) => (item.id ? [item.id] : [])));
    const removedItems = existing.items.filter((item) => !desiredIds.has(item.id));

    const currentAdditionalById = new Map(existing.additionalItems.map((item) => [item.id, item]));
    for (const item of input.additionalItems ?? []) {
      if (item.id && !currentAdditionalById.has(item.id)) {
        throw new BadRequestException({
          message: "One or more revised additional items do not belong to this quotation",
          code: "QUOTATION_ADDITIONAL_ITEM_NOT_FOUND",
        });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // Row lock for concurrent revise() calls on the same quotation — see
      // allocateRevisionNumber for why this must happen before it is called.
      await tx.quotation.update({ where: { id }, data: {} });

      await assertTariffsExist(
        tx,
        companyId,
        input.items.flatMap((item) => (item.tariffId ? [item.tariffId] : [])),
      );
      await assertDevicesBelongToCustomer(
        tx,
        companyId,
        existing.customerId,
        input.items.flatMap((item) => (item.deviceId ? [item.deviceId] : [])),
      );

      const revisionNumber = await allocateRevisionNumber({
        tx,
        historyTable: "QuotationHistory",
        parentIdColumn: "quotationId",
        parentId: id,
      });

      await tx.quotationHistory.create({
        data: {
          quotationId: id,
          revisionNumber,
          companyId,
          customerId: existing.customerId,
          number: existing.number,
          requestId: existing.requestId,
          source: existing.source,
          status: existing.status,
          quotationDate: existing.quotationDate,
          validUntil: existing.validUntil,
          notes: existing.notes,
          subtotal: existing.subtotal,
          headerDiscountAmount: existing.headerDiscountAmount,
          headerDiscountPercent: existing.headerDiscountPercent,
          headerDiscountInputMode: existing.headerDiscountInputMode,
          taxCode: existing.taxCode,
          taxRate: existing.taxRate,
          taxAmount: existing.taxAmount,
          totalAmount: existing.totalAmount,
          currency: existing.currency,
          approvedAt: existing.approvedAt,
          approvedByUserId: existing.approvedByUserId,
          customerApprovedAt: existing.customerApprovedAt,
          revisedByUserId: userId,
          items: {
            create: existing.items.map((item) => ({
              sourceItemId: item.id,
              deviceId: item.deviceId,
              requestItemId: item.requestItemId,
              tariffId: item.tariffId,
              description: item.description,
              qty: item.qty,
              unitPrice: item.unitPrice,
              discountAmount: item.discountAmount,
              lineTotal: item.lineTotal,
              pricePending: item.pricePending,
            })),
          },
          additionalItems: {
            create: existing.additionalItems.map((item) => ({
              sourceItemId: item.id,
              additionalItemTypeId: item.additionalItemTypeId,
              code: item.code,
              description: item.description,
              unitLabel: item.unitLabel,
              qty: item.qty,
              multiplier: item.multiplier,
              multiplierLabel: item.multiplierLabel,
              unitPrice: item.unitPrice,
              lineTotal: item.lineTotal,
              notes: item.notes,
            })),
          },
        },
      });

      // REMOVED: a current active item whose id is absent from the desired scope.
      for (const item of removedItems) {
        const consumedCount = await tx.purchaseOrderItem.count({
          where: { quotationItemId: item.id },
        });
        if (consumedCount === 0) {
          await tx.quotationItem.delete({ where: { id: item.id } });
        } else {
          await assertRetirementSafe(tx, [item.id]);
          await tx.quotationItem.update({ where: { id: item.id }, data: { isActive: false } });
        }
      }

      const requestItemDeviceIds = await loadRequestItemDeviceIds(tx, existing.requestId);

      // ADDED / UNCHANGED / QTY_CHANGED.
      for (const item of input.items) {
        if (!item.id) {
          // ADDED — a genuinely new line, fresh lineage, no id carried over.
          const requestItem = await tx.calibrationRequestItem.findFirst({
            where: { id: item.requestItemId, requestId: existing.requestId, isActive: true },
            select: { id: true },
          });
          if (!requestItem) {
            throw new BadRequestException({
              message: "requestItemId does not belong to this quotation's requisition",
              code: "CALIBRATION_REQUEST_ITEM_NOT_FOUND",
            });
          }
          const qty = toDecimal(item.qty ?? DEFAULT_QTY);
          const unitPrice = toDecimal(item.unitPrice);
          const line = computeItemLine(qty, unitPrice, toDecimal(item.discountAmount ?? 0));
          await tx.quotationItem.create({
            data: {
              companyId,
              quotationId: id,
              requestItemId: item.requestItemId,
              deviceId: item.deviceId ?? requestItemDeviceIds.get(item.requestItemId) ?? null,
              tariffId: item.tariffId ?? null,
              description: item.description,
              qty,
              unitPrice,
              discountAmount: line.discountAmount,
              lineTotal: line.lineTotal,
              pricePending: unitPrice.lessThanOrEqualTo(0),
            },
          });
          continue;
        }

        const currentItem = currentItemsById.get(item.id);
        if (!currentItem) continue; // validated above

        const consumedCount = await tx.purchaseOrderItem.count({
          where: { quotationItemId: item.id },
        });

        if (consumedCount === 0) {
          // Unconsumed — freely updated in place.
          const qty = toDecimal(item.qty ?? currentItem.qty);
          const unitPrice = toDecimal(item.unitPrice);
          const line = computeItemLine(
            qty,
            unitPrice,
            toDecimal(item.discountAmount ?? currentItem.discountAmount),
          );
          await tx.quotationItem.update({
            where: { id: item.id },
            data: {
              requestItemId: item.requestItemId,
              deviceId: item.deviceId ?? requestItemDeviceIds.get(item.requestItemId) ?? null,
              tariffId: item.tariffId ?? null,
              description: item.description,
              qty,
              unitPrice,
              discountAmount: line.discountAmount,
              lineTotal: line.lineTotal,
              pricePending: unitPrice.lessThanOrEqualTo(0),
            },
          });
          continue;
        }

        // Consumed — the row is frozen, never mutated.
        const requestedQty = item.qty !== undefined ? toDecimal(item.qty) : toDecimal(currentItem.qty);
        if (requestedQty.equals(toDecimal(currentItem.qty))) {
          continue; // UNCHANGED
        }
        if (requestedQty.greaterThan(toDecimal(currentItem.qty))) {
          // QTY_CHANGED (increase) — additive sibling carrying only the delta.
          const deltaQty = requestedQty.minus(toDecimal(currentItem.qty));
          const line = computeItemLine(
            deltaQty,
            toDecimal(currentItem.unitPrice),
            new Prisma.Decimal(0),
          );
          await tx.quotationItem.create({
            data: {
              companyId,
              quotationId: id,
              requestItemId: currentItem.requestItemId,
              deviceId: currentItem.deviceId,
              tariffId: currentItem.tariffId,
              description: currentItem.description,
              qty: deltaQty,
              unitPrice: currentItem.unitPrice,
              discountAmount: line.discountAmount,
              lineTotal: line.lineTotal,
              pricePending: currentItem.pricePending,
            },
          });
          continue;
        }
        // QTY_CHANGED (decrease) — retire the frozen row, add a new one
        // carrying the full new desired qty.
        await assertRetirementSafe(tx, [item.id]);
        await tx.quotationItem.update({ where: { id: item.id }, data: { isActive: false } });
        const line = computeItemLine(
          requestedQty,
          toDecimal(currentItem.unitPrice),
          new Prisma.Decimal(0),
        );
        await tx.quotationItem.create({
          data: {
            companyId,
            quotationId: id,
            requestItemId: currentItem.requestItemId,
            deviceId: currentItem.deviceId,
            tariffId: currentItem.tariffId,
            description: currentItem.description,
            qty: requestedQty,
            unitPrice: currentItem.unitPrice,
            discountAmount: line.discountAmount,
            lineTotal: line.lineTotal,
            pricePending: currentItem.pricePending,
          },
        });
      }

      if (input.additionalItems) {
        await this.reviseAdditionalItems(
          tx,
          companyId,
          id,
          existing.request.serviceMode,
          existing.additionalItems,
          input.additionalItems,
        );
      }

      const taxCode = input.taxCode !== undefined ? input.taxCode : existing.taxCode;
      const documentTax = await resolveDocumentTax(tx, companyId, taxCode);

      const itemRows = await tx.quotationItem.findMany({
        where: { quotationId: id, isActive: true },
      });
      const additionalRows = await tx.quotationAdditionalItem.findMany({
        where: { quotationId: id, isActive: true },
      });
      const totals = computeHeaderTotals(
        [...itemRows, ...additionalRows].map((row) => toDecimal(row.lineTotal)),
        resolveDiscountSpec(input, existing),
        documentTax,
      );

      await tx.quotation.update({
        where: { id },
        data: {
          ...(input.notes !== undefined ? { notes: normalizeNotes(input.notes) } : {}),
          taxCode: documentTax.taxCode,
          taxRate: documentTax.taxRate,
          subtotal: totals.subtotal,
          headerDiscountAmount: totals.headerDiscountAmount,
          headerDiscountPercent: totals.headerDiscountPercent,
          headerDiscountInputMode: totals.headerDiscountInputMode,
          taxAmount: totals.taxAmount,
          totalAmount: totals.totalAmount,
        },
      });

      return tx.quotation.findFirstOrThrow({
        where: { id, companyId },
        include: quotationInclude,
      });
    });

    await recordAuditLog({
      companyId,
      userId,
      action: "QUOTATION_REVISE",
      outcome: "SUCCESS",
      targetType: "Quotation",
      targetId: id,
      metadata: {
        number: existing.number,
        ...(input.additionalItems ? { additionalItemCount: input.additionalItems.length } : {}),
      },
    });

    return result;
  }

  /**
   * Desired-set reconciliation of the quotation's additional items (matched by
   * row `id`), inside the revise transaction. Same MOM #1 rule as QuotationItem:
   *  - a row NO PurchaseOrderAdditionalItem has copied yet is "unconsumed" and
   *    is updated in place / hard-deleted (its prior state is already in the
   *    history snapshot written by the caller);
   *  - a "consumed" row is frozen: unchanged => kept, changed => retired
   *    (`isActive = false`) and replaced by a NEW row, removed => retired.
   * Add-time checks (type active + applicable) apply to new rows and to rows
   * whose type changes; an untouched row keeps its snapshot even if its catalog
   * type has since been deactivated.
   */
  private async reviseAdditionalItems(
    tx: Prisma.TransactionClient,
    companyId: string,
    quotationId: string,
    serviceMode: "ON_SITE" | "SEND_TO_LAB",
    current: Prisma.QuotationAdditionalItemGetPayload<object>[],
    desired: ReviseAdditionalItemInput[],
  ): Promise<void> {
    const currentById = new Map(current.map((row) => [row.id, row]));
    const types = await loadAdditionalItemTypes(
      tx,
      companyId,
      desired.map((item) => item.additionalItemTypeId),
    );
    const desiredIds = new Set(desired.flatMap((item) => (item.id ? [item.id] : [])));

    const isConsumed = async (rowId: string): Promise<boolean> =>
      (await tx.purchaseOrderAdditionalItem.count({ where: { quotationAdditionalItemId: rowId } })) >
      0;

    // REMOVED
    for (const row of current.filter((candidate) => !desiredIds.has(candidate.id))) {
      if (await isConsumed(row.id)) {
        await tx.quotationAdditionalItem.update({ where: { id: row.id }, data: { isActive: false } });
      } else {
        await tx.quotationAdditionalItem.delete({ where: { id: row.id } });
      }
    }

    for (const item of desired) {
      const type = types.get(item.additionalItemTypeId)!;
      const row = item.id ? currentById.get(item.id) : undefined;

      // ADDED
      if (!row) {
        assertAdditionalItemTypeUsable(type, serviceMode);
        await tx.quotationAdditionalItem.create({
          data: buildAdditionalRowFromType(companyId, quotationId, type, item),
        });
        continue;
      }

      const sameType = row.additionalItemTypeId === item.additionalItemTypeId;
      let next: AdditionalItemRow;
      if (sameType) {
        // Keep the existing snapshot (code / unit label / description / price) unless overridden.
        const unitPrice = toDecimal(item.unitPrice ?? row.unitPrice);
        if (!unitPrice.greaterThan(0)) {
          throw new BadRequestException({
            message: "Additional item unit price must be greater than zero",
            code: "INVALID_ADDITIONAL_ITEM_PRICE",
          });
        }
        const qty = toDecimal(item.qty);
        // The multiplier shape is the ROW's snapshot (not the current catalog).
        const multiplier = resolveAdditionalMultiplier(
          row.code,
          row.multiplierLabel,
          item.multiplier ?? (row.multiplier ? Number(row.multiplier) : undefined),
        );
        next = {
          companyId,
          quotationId,
          additionalItemTypeId: row.additionalItemTypeId,
          code: row.code,
          description: item.description ?? row.description,
          unitLabel: row.unitLabel,
          qty,
          multiplier,
          multiplierLabel: row.multiplierLabel,
          unitPrice,
          lineTotal: additionalLineTotal(unitPrice, qty, multiplier),
          notes: item.notes !== undefined ? item.notes : row.notes,
        };
      } else {
        assertAdditionalItemTypeUsable(type, serviceMode);
        next = buildAdditionalRowFromType(companyId, quotationId, type, item);
      }

      if (!(await isConsumed(row.id))) {
        await tx.quotationAdditionalItem.update({
          where: { id: row.id },
          data: {
            additionalItemTypeId: next.additionalItemTypeId,
            code: next.code,
            description: next.description,
            unitLabel: next.unitLabel,
            qty: next.qty,
            multiplier: next.multiplier,
            multiplierLabel: next.multiplierLabel,
            unitPrice: next.unitPrice,
            lineTotal: next.lineTotal,
            notes: next.notes,
          },
        });
        continue;
      }

      const unchanged =
        next.additionalItemTypeId === row.additionalItemTypeId &&
        next.description === row.description &&
        next.qty.equals(row.qty) &&
        (next.multiplier === null
          ? row.multiplier === null
          : row.multiplier !== null && next.multiplier.equals(row.multiplier)) &&
        next.unitPrice.equals(row.unitPrice) &&
        next.notes === row.notes;
      if (unchanged) continue;

      await tx.quotationAdditionalItem.update({ where: { id: row.id }, data: { isActive: false } });
      await tx.quotationAdditionalItem.create({ data: next });
    }
  }

  /** MOM #1 — read-only revision list (header snapshots only, no items). */
  async listHistory(companyId: string, id: string): Promise<QuotationHistorySummary[]> {
    await this.findOne(companyId, id);
    return prisma.quotationHistory.findMany({
      where: { quotationId: id, companyId },
      orderBy: { revisionNumber: "desc" },
      include: { revisedBy: { select: { id: true, name: true, email: true } } },
    });
  }

  /** MOM #1 — read-only single revision snapshot, including its items. */
  async getHistoryRevision(
    companyId: string,
    id: string,
    revisionNumber: number,
  ): Promise<QuotationHistoryWithItems> {
    await this.findOne(companyId, id);
    const revision = await prisma.quotationHistory.findFirst({
      where: { quotationId: id, companyId, revisionNumber },
      include: quotationHistoryInclude,
    });
    if (!revision) {
      throw new NotFoundException({
        message: "Revision not found",
        code: "QUOTATION_REVISION_NOT_FOUND",
      });
    }
    return revision;
  }
}
