import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DocumentNumberService, Prisma, prisma } from "@medcal/db";
import {
  PURCHASE_ORDER_SORTABLE_FIELDS,
  type PurchaseOrderCreateInput,
  type PurchaseOrderListQuery,
  type PurchaseOrderUpdateInput,
} from "@medcal/shared";
import { resolveSortOrder, withIdTieBreaker } from "../../common/sort-query";
import { renderPurchaseOrderPdf, type PurchaseOrderPdfResult } from "./purchase-order-pdf";

const DEFAULT_PAGE_SIZE = 10;

const deviceTypeSelect = {
  id: true,
  code: true,
  name: true,
} as const;

const purchaseOrderInclude = {
  items: {
    include: {
      quotationItem: {
        include: {
          requestItem: { include: { deviceType: { select: deviceTypeSelect } } },
        },
      },
      tariff: { select: { id: true, code: true, name: true, unitPrice: true, currency: true } },
      device: { select: { id: true, brand: true, model: true, serialNumber: true } },
    },
  },
  customer: { include: { contacts: true } },
  quotation: {
    select: {
      id: true,
      number: true,
      status: true,
      requestId: true,
      customerId: true,
      request: { select: { number: true } },
    },
  },
  // Who approved the PO, resolved for display — `name` is nullable, so `email`
  // is carried as the fallback the UI falls back to before "—".
  confirmedBy: { select: { id: true, name: true, email: true } },
} as const;

export type PurchaseOrderWithItems = Prisma.PurchaseOrderGetPayload<{
  include: typeof purchaseOrderInclude;
}>;

export interface PurchaseOrderListResult {
  data: PurchaseOrderWithItems[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

@Injectable()
export class PurchaseOrdersService {
  async create(
    companyId: string,
    input: PurchaseOrderCreateInput,
  ): Promise<PurchaseOrderWithItems> {
    try {
      return await prisma.$transaction(async (tx) => {
        const quotation = await tx.quotation.findFirst({
          where: { id: input.quotationId, companyId },
          include: { items: { orderBy: { createdAt: "asc" } } },
        });
        if (!quotation) {
          throw new NotFoundException({
            message: "Quotation not found",
            code: "QUOTATION_NOT_FOUND",
          });
        }

        if (quotation.status !== "APPROVED") {
          throw new BadRequestException({
            message: "Only APPROVED quotations can create a purchase order",
            code: "INVALID_STATUS_FOR_PURCHASE_ORDER",
          });
        }

        if (quotation.customerApprovedAt == null) {
          throw new BadRequestException({
            message: "Quotation is not customer-approved",
            code: "QUOTATION_NOT_CUSTOMER_APPROVED",
          });
        }

        if (quotation.items.length === 0) {
          throw new BadRequestException({
            message: "Quotation has no items to snapshot",
            code: "QUOTATION_HAS_NO_ITEMS",
          });
        }

        if (
          quotation.taxCode == null ||
          quotation.taxCode.trim() === "" ||
          quotation.taxRate == null ||
          quotation.taxAmount == null
        ) {
          throw new BadRequestException({
            message: "Quotation tax is required before creating a purchase order",
            code: "QUOTATION_TAX_REQUIRED",
          });
        }

        const existingActive = await tx.purchaseOrder.findFirst({
          where: {
            companyId,
            quotationId: quotation.id,
            status: { not: "CANCELLED" },
          },
          select: { id: true },
        });
        if (existingActive) {
          throw new ConflictException({
            message: "An active purchase order already exists for this quotation",
            code: "DUPLICATE_ACTIVE_PO_FOR_QUOTATION",
            purchaseOrderId: existingActive.id,
          });
        }

        const issuedAt = new Date();
        const number = await DocumentNumberService.allocate({
          companyId,
          documentType: "PURCHASE_ORDER",
          issuedAt,
          tx,
        });

        const purchaseOrder = await tx.purchaseOrder.create({
          data: {
            companyId,
            customerId: quotation.customerId,
            quotationId: quotation.id,
            number,
            customerPoNumber: input.customerPoNumber,
            customerPoDate: input.customerPoDate,
            status: "DRAFT",
            subtotal: quotation.subtotal,
            headerDiscountAmount: quotation.headerDiscountAmount,
            taxCode: quotation.taxCode,
            taxRate: quotation.taxRate,
            taxAmount: quotation.taxAmount,
            totalAmount: quotation.totalAmount,
            currency: quotation.currency,
            notes: input.notes,
          },
        });

        await tx.purchaseOrderItem.createMany({
          data: quotation.items.map((item) => ({
            companyId,
            purchaseOrderId: purchaseOrder.id,
            quotationItemId: item.id,
            deviceId: item.deviceId,
            tariffId: item.tariffId,
            description: item.description,
            qty: item.qty,
            unitPrice: item.unitPrice,
            discountAmount: item.discountAmount,
            lineTotal: item.lineTotal,
            status: "OPEN",
          })),
        });

        return tx.purchaseOrder.findFirstOrThrow({
          where: { id: purchaseOrder.id, companyId },
          include: purchaseOrderInclude,
        });
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException({
          message: "A purchase order with this customer PO number already exists",
          code: "DUPLICATE_CUSTOMER_PO_NUMBER",
        });
      }
      throw error;
    }
  }

  async findAll(
    companyId: string,
    query: PurchaseOrderListQuery,
  ): Promise<PurchaseOrderListResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.PurchaseOrderWhereInput = {
      companyId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.quotationId ? { quotationId: query.quotationId } : {}),
      ...(query.search
        ? {
            OR: [
              { number: { contains: query.search, mode: "insensitive" } },
              { customerPoNumber: { contains: query.search, mode: "insensitive" } },
              { customer: { name: { contains: query.search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const { field: sortField, dir: sortDir } = resolveSortOrder(
      PURCHASE_ORDER_SORTABLE_FIELDS,
      query.sortBy,
      query.sortDir,
      "createdAt",
    );

    const [total, data] = await Promise.all([
      prisma.purchaseOrder.count({ where }),
      prisma.purchaseOrder.findMany({
        where,
        orderBy: withIdTieBreaker(sortField, sortDir),
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: purchaseOrderInclude,
      }),
    ]);

    return { data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async findOne(companyId: string, id: string): Promise<PurchaseOrderWithItems> {
    const purchaseOrder = await prisma.purchaseOrder.findFirst({
      where: { id, companyId },
      include: purchaseOrderInclude,
    });
    if (!purchaseOrder) {
      throw new NotFoundException({
        message: "Purchase order not found",
        code: "PURCHASE_ORDER_NOT_FOUND",
      });
    }
    return purchaseOrder;
  }

  async buildPdf(companyId: string, id: string): Promise<PurchaseOrderPdfResult> {
    const purchaseOrder = await this.findOne(companyId, id);
    const company = await prisma.company.findFirst({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException({
        message: "Company not found",
        code: "COMPANY_NOT_FOUND",
      });
    }
    return renderPurchaseOrderPdf({ purchaseOrder, company });
  }

  async update(
    companyId: string,
    id: string,
    input: PurchaseOrderUpdateInput,
  ): Promise<PurchaseOrderWithItems> {
    const existing = await this.findOne(companyId, id);

    if (existing.status !== "DRAFT") {
      throw new BadRequestException({
        message: "Cannot update purchase order that is not in DRAFT status",
        code: "INVALID_STATUS_FOR_UPDATE",
      });
    }

    try {
      await prisma.purchaseOrder.update({
        where: { id },
        data: {
          ...(input.customerPoNumber !== undefined
            ? { customerPoNumber: input.customerPoNumber }
            : {}),
          ...(input.customerPoDate !== undefined ? { customerPoDate: input.customerPoDate } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException({
          message: "A purchase order with this customer PO number already exists",
          code: "DUPLICATE_CUSTOMER_PO_NUMBER",
        });
      }
      throw error;
    }

    return this.findOne(companyId, id);
  }

  async approve(companyId: string, id: string, userId: string): Promise<PurchaseOrderWithItems> {
    const existing = await this.findOne(companyId, id);

    if (existing.status !== "DRAFT") {
      throw new BadRequestException({
        message: "Only DRAFT purchase orders can be approved",
        code: "INVALID_STATUS_FOR_APPROVE",
      });
    }

    if (existing.items.length === 0) {
      throw new BadRequestException({
        message: "Purchase order has no items",
        code: "PURCHASE_ORDER_HAS_NO_ITEMS",
      });
    }

    return prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: "APPROVED",
        confirmedAt: new Date(),
        confirmedByUserId: userId,
      },
      include: purchaseOrderInclude,
    });
  }

  async cancel(companyId: string, id: string): Promise<PurchaseOrderWithItems> {
    const existing = await this.findOne(companyId, id);

    if (existing.status === "CANCELLED") {
      throw new BadRequestException({
        message: "Purchase order is already cancelled",
        code: "ALREADY_CANCELLED",
      });
    }

    if (existing.status === "APPROVED") {
      throw new BadRequestException({
        message: "Cannot cancel an approved purchase order",
        code: "CANNOT_CANCEL_APPROVED",
      });
    }

    if (existing.status !== "DRAFT") {
      throw new BadRequestException({
        message: "Only DRAFT purchase orders can be cancelled",
        code: "INVALID_STATUS_FOR_CANCEL",
      });
    }

    return prisma.purchaseOrder.update({
      where: { id },
      data: { status: "CANCELLED" },
      include: purchaseOrderInclude,
    });
  }
}
