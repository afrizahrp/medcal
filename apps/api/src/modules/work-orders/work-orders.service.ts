import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DocumentNumberService, Prisma, prisma } from "@medcal/db";
import {
  WORK_ORDER_SORTABLE_FIELDS,
  type WorkOrderAssignInput,
  type WorkOrderCreateInput,
  type WorkOrderListQuery,
  type WorkOrderUpdateInput,
} from "@medcal/shared";
import { resolveSortOrder } from "../../common/sort-query";
import { renderWorkOrderPdf, type WorkOrderPdfResult } from "./work-order-pdf";

const DEFAULT_PAGE_SIZE = 10;

const MVP_STATUSES = ["PLANNED", "ASSIGNED", "IN_PROGRESS", "DONE", "CANCELLED"] as const;
type MvpWorkOrderStatus = (typeof MVP_STATUSES)[number];

const TERMINAL_STATUSES = new Set<string>(["DONE", "CANCELLED", "TECHNICALLY_DONE", "CLOSED"]);
const NON_TERMINAL_STATUSES = new Set<string>(["PLANNED", "ASSIGNED", "IN_PROGRESS"]);

const ALLOWED_TRANSITIONS: Record<MvpWorkOrderStatus, readonly MvpWorkOrderStatus[]> = {
  PLANNED: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["DONE", "CANCELLED"],
  DONE: [],
  CANCELLED: [],
};

const deviceTypeSelect = {
  id: true,
  code: true,
  name: true,
} as const;

const workOrderInclude = {
  items: {
    include: {
      purchaseOrderItem: {
        include: {
          quotationItem: {
            include: {
              requestItem: { include: { deviceType: { select: deviceTypeSelect } } },
            },
          },
          device: { select: { id: true, brand: true, model: true, serialNumber: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" as const },
  },
  customer: { include: { contacts: true } },
  purchaseOrder: {
    select: {
      id: true,
      number: true,
      status: true,
      customerPoNumber: true,
      customerPoDate: true,
      quotationId: true,
    },
  },
  quotation: {
    select: {
      id: true,
      number: true,
      status: true,
      requestId: true,
      customerId: true,
      request: { select: { id: true, number: true, serviceMode: true } },
    },
  },
  assignments: {
    include: {
      technician: { select: { id: true, name: true, email: true, status: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

export type WorkOrderWithItems = Prisma.WorkOrderGetPayload<{
  include: typeof workOrderInclude;
}>;

export interface WorkOrderListResult {
  data: WorkOrderWithItems[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function assertMvpStatus(status: string): asserts status is MvpWorkOrderStatus {
  if (!(MVP_STATUSES as readonly string[]).includes(status)) {
    throw new BadRequestException({
      message: "Work order status is not a valid MVP status",
      code: "INVALID_STATUS_TRANSITION",
      from: status,
    });
  }
}

function assertTransition(from: string, to: MvpWorkOrderStatus): void {
  assertMvpStatus(from);
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new BadRequestException({
      message: `Cannot transition work order from ${from} to ${to}`,
      code: "INVALID_STATUS_TRANSITION",
      from,
      to,
    });
  }
}

function assertNonTerminal(status: string, actionCode: string, message: string): void {
  if (!NON_TERMINAL_STATUSES.has(status) || TERMINAL_STATUSES.has(status)) {
    throw new BadRequestException({
      message,
      code: actionCode,
      status,
    });
  }
}

@Injectable()
export class WorkOrdersService {
  async create(companyId: string, input: WorkOrderCreateInput): Promise<WorkOrderWithItems> {
    try {
      return await prisma.$transaction(async (tx) => {
        const purchaseOrder = await tx.purchaseOrder.findFirst({
          where: { id: input.purchaseOrderId, companyId },
          include: {
            items: { orderBy: { createdAt: "asc" } },
            quotation: {
              include: { request: { select: { id: true, serviceMode: true } } },
            },
          },
        });
        if (!purchaseOrder) {
          throw new NotFoundException({
            message: "Purchase order not found",
            code: "PURCHASE_ORDER_NOT_FOUND",
          });
        }

        if (purchaseOrder.status !== "APPROVED") {
          throw new BadRequestException({
            message: "Only APPROVED purchase orders can create a work order",
            code: "INVALID_STATUS_FOR_WORK_ORDER",
          });
        }

        if (purchaseOrder.items.length === 0) {
          throw new BadRequestException({
            message: "Purchase order has no items to snapshot",
            code: "PURCHASE_ORDER_HAS_NO_ITEMS",
          });
        }

        const request = purchaseOrder.quotation.request;
        if (!request) {
          throw new BadRequestException({
            message: "Purchase order is missing its source calibration request",
            code: "CALIBRATION_REQUEST_NOT_FOUND",
          });
        }

        const existingActive = await tx.workOrder.findFirst({
          where: {
            companyId,
            purchaseOrderId: purchaseOrder.id,
            status: { not: "CANCELLED" },
          },
          select: { id: true },
        });
        if (existingActive) {
          throw new ConflictException({
            message: "An active work order already exists for this purchase order",
            code: "DUPLICATE_ACTIVE_WORK_ORDER",
            workOrderId: existingActive.id,
          });
        }

        const issuedAt = new Date();
        // serviceMode determines the Work Order document identity:
        //   ON_SITE      -> WORK_ORDER              -> SPK/YYYY/MM/NNNNN
        //   SEND_TO_LAB  -> WORK_ORDER_SEND_TO_LAB  -> WOL/YYYY/MM/NNNNN
        // The two series have independent sequences keyed (companyId, documentType, year).
        const documentType =
          request.serviceMode === "ON_SITE" ? "WORK_ORDER" : "WORK_ORDER_SEND_TO_LAB";
        const number = await DocumentNumberService.allocate({
          companyId,
          documentType,
          issuedAt,
          tx,
        });

        const workOrder = await tx.workOrder.create({
          data: {
            companyId,
            customerId: purchaseOrder.customerId,
            quotationId: purchaseOrder.quotationId,
            purchaseOrderId: purchaseOrder.id,
            number,
            serviceMode: request.serviceMode,
            addressText: input.addressText,
            geoLat: input.geoLat,
            geoLng: input.geoLng,
            locationNotes: input.locationNotes,
            scheduledStart: input.scheduledStart,
            scheduledEnd: input.scheduledEnd,
            status: "PLANNED",
          },
        });

        await tx.workOrderItem.createMany({
          data: purchaseOrder.items.map((item) => ({
            companyId,
            workOrderId: workOrder.id,
            purchaseOrderItemId: item.id,
            description: item.description,
            qty: item.qty,
          })),
        });

        return tx.workOrder.findFirstOrThrow({
          where: { id: workOrder.id, companyId },
          include: workOrderInclude,
        });
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException({
          message: "An active work order already exists for this purchase order",
          code: "DUPLICATE_ACTIVE_WORK_ORDER",
        });
      }
      throw error;
    }
  }

  async findAll(companyId: string, query: WorkOrderListQuery): Promise<WorkOrderListResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.WorkOrderWhereInput = {
      companyId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.purchaseOrderId ? { purchaseOrderId: query.purchaseOrderId } : {}),
      ...(query.quotationId ? { quotationId: query.quotationId } : {}),
      ...(query.search
        ? {
            OR: [
              { number: { contains: query.search, mode: "insensitive" } },
              { customer: { name: { contains: query.search, mode: "insensitive" } } },
              { purchaseOrder: { number: { contains: query.search, mode: "insensitive" } } },
              { quotation: { number: { contains: query.search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const { field: sortField, dir: sortDir } = resolveSortOrder(
      WORK_ORDER_SORTABLE_FIELDS,
      query.sortBy,
      query.sortDir,
      "createdAt",
    );

    const [total, data] = await Promise.all([
      prisma.workOrder.count({ where }),
      prisma.workOrder.findMany({
        where,
        orderBy: { [sortField]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: workOrderInclude,
      }),
    ]);

    return { data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async findOne(companyId: string, id: string): Promise<WorkOrderWithItems> {
    const workOrder = await prisma.workOrder.findFirst({
      where: { id, companyId },
      include: workOrderInclude,
    });
    if (!workOrder) {
      throw new NotFoundException({
        message: "Work order not found",
        code: "WORK_ORDER_NOT_FOUND",
      });
    }
    return workOrder;
  }

  async buildPdf(companyId: string, id: string): Promise<WorkOrderPdfResult> {
    const workOrder = await this.findOne(companyId, id);
    const company = await prisma.company.findFirst({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException({
        message: "Company not found",
        code: "COMPANY_NOT_FOUND",
      });
    }
    return renderWorkOrderPdf({ workOrder, company });
  }

  async update(
    companyId: string,
    id: string,
    input: WorkOrderUpdateInput,
  ): Promise<WorkOrderWithItems> {
    const existing = await this.findOne(companyId, id);
    assertNonTerminal(
      existing.status,
      "INVALID_STATUS_FOR_UPDATE",
      "Cannot update a terminal work order",
    );

    await prisma.workOrder.update({
      where: { id },
      data: {
        // serviceMode is immutable after create — it drives the document number.
        ...(input.addressText !== undefined ? { addressText: input.addressText } : {}),
        ...(input.geoLat !== undefined ? { geoLat: input.geoLat } : {}),
        ...(input.geoLng !== undefined ? { geoLng: input.geoLng } : {}),
        ...(input.locationNotes !== undefined ? { locationNotes: input.locationNotes } : {}),
        ...(input.scheduledStart !== undefined ? { scheduledStart: input.scheduledStart } : {}),
        ...(input.scheduledEnd !== undefined ? { scheduledEnd: input.scheduledEnd } : {}),
      },
    });

    return this.findOne(companyId, id);
  }

  async assign(
    companyId: string,
    id: string,
    input: WorkOrderAssignInput,
  ): Promise<WorkOrderWithItems> {
    const existing = await this.findOne(companyId, id);
    assertTransition(existing.status, "ASSIGNED");

    const technicianIds = input.technicians.map((row) => row.technicianUserId);
    if (new Set(technicianIds).size !== technicianIds.length) {
      throw new BadRequestException({
        message: "Duplicate technician in assignment payload",
        code: "INVALID_WORK_ORDER_ASSIGNEE",
      });
    }

    const technicians = await prisma.user.findMany({
      where: {
        id: { in: technicianIds },
        status: "ACTIVE",
        memberships: { some: { companyId } },
      },
      select: { id: true },
    });
    if (technicians.length !== technicianIds.length) {
      throw new BadRequestException({
        message: "Assigned user must be an active member of this company",
        code: "INVALID_WORK_ORDER_ASSIGNEE",
      });
    }

    return prisma.$transaction(async (tx) => {
      await tx.workOrderAssignment.createMany({
        data: input.technicians.map((row) => ({
          companyId,
          workOrderId: existing.id,
          technicianUserId: row.technicianUserId,
          roleOnJob: row.roleOnJob ?? "LEAD",
        })),
      });

      await tx.workOrder.update({
        where: { id: existing.id },
        data: { status: "ASSIGNED" },
      });

      return tx.workOrder.findFirstOrThrow({
        where: { id: existing.id, companyId },
        include: workOrderInclude,
      });
    });
  }

  async start(companyId: string, id: string): Promise<WorkOrderWithItems> {
    const existing = await this.findOne(companyId, id);
    assertTransition(existing.status, "IN_PROGRESS");

    if (existing.assignments.length === 0) {
      throw new BadRequestException({
        message: "Work order has no assigned technician",
        code: "INVALID_STATUS_TRANSITION",
        from: existing.status,
        to: "IN_PROGRESS",
      });
    }

    return prisma.workOrder.update({
      where: { id },
      data: { status: "IN_PROGRESS" },
      include: workOrderInclude,
    });
  }

  async done(companyId: string, id: string): Promise<WorkOrderWithItems> {
    const existing = await this.findOne(companyId, id);
    assertTransition(existing.status, "DONE");

    return prisma.workOrder.update({
      where: { id },
      data: { status: "DONE" },
      include: workOrderInclude,
    });
  }

  async cancel(companyId: string, id: string): Promise<WorkOrderWithItems> {
    const existing = await this.findOne(companyId, id);
    if (existing.status === "CANCELLED") {
      throw new BadRequestException({
        message: "Work order is already cancelled",
        code: "ALREADY_CANCELLED",
      });
    }
    assertTransition(existing.status, "CANCELLED");

    return prisma.workOrder.update({
      where: { id },
      data: { status: "CANCELLED" },
      include: workOrderInclude,
    });
  }
}
