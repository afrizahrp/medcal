import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DocumentNumberService, Prisma, prisma } from "@medcal/db";
import {
  QUOTATION_SORTABLE_FIELDS,
  type QuotationCreateInput,
  type QuotationListQuery,
  type QuotationUpdateInput,
} from "@medcal/shared";
import { resolveSortOrder } from "../../common/sort-query";

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
  items: {
    include: {
      requestItem: { include: { deviceType: { select: deviceTypeSelect } } },
      tariff: { select: { id: true, code: true, name: true, unitPrice: true, currency: true } },
      device: { select: { id: true, brand: true, model: true, serialNumber: true } },
    },
  },
  customer: true,
  request: { select: { id: true, number: true, status: true, customerId: true } },
  tax: true,
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

type ItemInput = QuotationCreateInput["items"][number];

function toDecimal(value: number | string | Prisma.Decimal): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

function money(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(MONEY_DECIMAL_PLACES, Prisma.Decimal.ROUND_HALF_UP);
}

function computeLineTotal(qty: Prisma.Decimal, unitPrice: Prisma.Decimal): Prisma.Decimal {
  return money(qty.mul(unitPrice));
}

function computeHeaderTotals(
  lineTotals: Prisma.Decimal[],
  taxRate: Prisma.Decimal | null,
): { subtotal: Prisma.Decimal; taxAmount: Prisma.Decimal | null; totalAmount: Prisma.Decimal } {
  const subtotal = money(
    lineTotals.reduce((acc, line) => acc.plus(line), new Prisma.Decimal(0)),
  );
  if (taxRate == null) {
    return { subtotal, taxAmount: null, totalAmount: subtotal };
  }
  const taxAmount = money(subtotal.mul(taxRate));
  return { subtotal, taxAmount, totalAmount: money(subtotal.plus(taxAmount)) };
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

async function resolveTaxRate(
  tx: Prisma.TransactionClient,
  companyId: string,
  taxId: string | null | undefined,
): Promise<Prisma.Decimal | null> {
  if (taxId == null) return null;
  const tax = await tx.tax.findFirst({
    where: { id: taxId, companyId },
  });
  if (!tax) {
    throw new BadRequestException({
      message: "Tax not found",
      code: "TAX_NOT_FOUND",
    });
  }
  return tax.taxRate;
}

async function assertFullScopeItems(
  tx: Prisma.TransactionClient,
  requestId: string,
  items: ItemInput[],
): Promise<void> {
  const requestItems = await tx.calibrationRequestItem.findMany({
    where: { requestId },
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

function buildItemRows(
  companyId: string,
  quotationId: string,
  items: ItemInput[],
): Array<{
  companyId: string;
  quotationId: string;
  requestItemId: string;
  deviceId: string | null;
  tariffId: string | null;
  description: string;
  qty: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
}> {
  return items.map((item) => {
    const qty = toDecimal(item.qty ?? DEFAULT_QTY);
    const unitPrice = toDecimal(item.unitPrice);
    return {
      companyId,
      quotationId,
      requestItemId: item.requestItemId,
      deviceId: item.deviceId ?? null,
      tariffId: item.tariffId ?? null,
      description: item.description,
      qty,
      unitPrice,
      lineTotal: computeLineTotal(qty, unitPrice),
    };
  });
}

@Injectable()
export class QuotationsService {
  async create(companyId: string, input: QuotationCreateInput): Promise<QuotationWithItems> {
    return prisma.$transaction(async (tx) => {
      const request = await tx.calibrationRequest.findFirst({
        where: { id: input.requestId, companyId },
        include: { items: true },
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

      await assertFullScopeItems(tx, request.id, input.items);
      await assertTariffsExist(
        tx,
        companyId,
        input.items.flatMap((item) => (item.tariffId ? [item.tariffId] : [])),
      );
      await assertDevicesBelongToCustomer(
        tx,
        companyId,
        request.customerId,
        input.items.flatMap((item) => (item.deviceId ? [item.deviceId] : [])),
      );

      const taxRate = await resolveTaxRate(tx, companyId, input.taxId);
      const issuedAt = new Date();
      const number = await DocumentNumberService.allocate({
        companyId,
        documentType: "QUOTATION",
        issuedAt,
        tx,
      });

      const draftRows = buildItemRows(companyId, "pending", input.items);
      const totals = computeHeaderTotals(
        draftRows.map((row) => row.lineTotal),
        taxRate,
      );

      const quotation = await tx.quotation.create({
        data: {
          companyId,
          customerId: request.customerId,
          number,
          requestId: request.id,
          source: input.source ?? "PORTAL",
          status: "DRAFT",
          validUntil: input.validUntil,
          taxId: input.taxId,
          subtotal: totals.subtotal,
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
        orderBy: { [sortField]: sortDir },
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

  async update(
    companyId: string,
    id: string,
    input: QuotationUpdateInput,
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

    return prisma.$transaction(async (tx) => {
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
          data: buildItemRows(companyId, id, input.items),
        });
      }

      const taxId = input.taxId !== undefined ? input.taxId : existing.taxId;
      const taxRate = await resolveTaxRate(tx, companyId, taxId);

      const itemRows = await tx.quotationItem.findMany({ where: { quotationId: id } });
      const totals = computeHeaderTotals(
        itemRows.map((row) => toDecimal(row.lineTotal)),
        taxRate,
      );

      await tx.quotation.update({
        where: { id },
        data: {
          ...(input.source !== undefined ? { source: input.source } : {}),
          ...(input.validUntil !== undefined ? { validUntil: input.validUntil } : {}),
          ...(input.taxId !== undefined ? { taxId: input.taxId } : {}),
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          totalAmount: totals.totalAmount,
        },
      });

      return tx.quotation.findFirstOrThrow({
        where: { id, companyId },
        include: quotationInclude,
      });
    });
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

    if (existing.status !== "SENT") {
      throw new BadRequestException({
        message: "Only SENT quotations can be approved",
        code: "INVALID_STATUS_FOR_APPROVE",
      });
    }

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
}
