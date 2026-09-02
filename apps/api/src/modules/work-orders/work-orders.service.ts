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
  type WorkOrderEquipmentReplaceInput,
  type WorkOrderListQuery,
  type WorkOrderUpdateInput,
} from "@medcal/shared";
import { resolveSortOrder } from "../../common/sort-query";
import { renderWorkOrderPdf, type WorkOrderPdfResult } from "./work-order-pdf";
import {
  WORK_ORDER_EQUIPMENT_ORDER_STEP,
  deviceTypeIdsFromItems,
  loadEquipmentCandidates,
  resolveRequiredEquipmentTypes,
  validateEquipmentSelection,
  type EquipmentProposalRow,
  type EquipmentValidationResult,
} from "./work-order-equipment";

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
  equipment: {
    include: {
      equipment: {
        select: {
          id: true,
          code: true,
          brand: true,
          model: true,
          serialNumber: true,
          isActive: true,
          equipmentType: { select: { id: true, code: true, name: true, category: true } },
        },
      },
    },
    orderBy: { sortOrder: "asc" as const },
  },
  deliveryNote: {
    include: { items: { orderBy: { sortOrder: "asc" as const } } },
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

/**
 * While a delivery note (Surat Jalan Alat) is ISSUED, the work order's equipment
 * list is frozen and the work order cannot be cancelled — the delivery note must
 * be cancelled first. A CANCELLED delivery note lifts the lock. `deliveryNote` is
 * always loaded via `workOrderInclude`.
 */
function assertNoActiveDeliveryNote(
  deliveryNote: { status: string } | null,
  code: string,
  message: string,
): void {
  if (deliveryNote && deliveryNote.status === "ISSUED") {
    throw new BadRequestException({ message, code });
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

        // ON_SITE only: optional initial reference-equipment selection.
        // SEND_TO_LAB never carries equipment-to-bring.
        const equipmentInput = input.equipment ?? [];
        if (equipmentInput.length > 0) {
          if (request.serviceMode !== "ON_SITE") {
            throw new BadRequestException({
              message: "Equipment selection is only applicable to on-site work orders",
              code: "EQUIPMENT_NOT_APPLICABLE_FOR_SEND_TO_LAB",
            });
          }
          const { rows } = await validateEquipmentSelection(
            tx,
            companyId,
            equipmentInput,
            input.scheduledStart ?? null,
          );
          await tx.workOrderEquipment.createMany({
            data: rows.map((row) => ({
              companyId,
              workOrderId: workOrder.id,
              equipmentId: row.equipmentId,
              equipmentTypeId: row.equipmentTypeId,
              notes: row.notes,
              sortOrder: row.sortOrder,
            })),
          });
        }

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

    // ON_SITE work orders must have a confirmed reference-equipment list before
    // work begins — but only when there is something to confirm (the device
    // types carry equipment requirements, or units have already been selected).
    // SEND_TO_LAB carries no equipment-to-bring and is unaffected.
    if (existing.serviceMode === "ON_SITE" && existing.equipmentConfirmedAt === null) {
      const requiredTypes = await resolveRequiredEquipmentTypes(
        prisma,
        deviceTypeIdsFromItems(existing.items),
      );
      if (existing.equipment.length > 0 || requiredTypes.length > 0) {
        throw new BadRequestException({
          message: "Confirm the equipment list before starting this on-site work order",
          code: "WORK_ORDER_EQUIPMENT_NOT_CONFIRMED",
        });
      }
    }

    try {
      return await prisma.$transaction(async (tx) => {
        await tx.workOrder.update({
          where: { id },
          data: { status: "IN_PROGRESS" },
        });
        await this.fanOutCalibrationJobs(tx, existing);
        return tx.workOrder.findFirstOrThrow({
          where: { id, companyId },
          include: workOrderInclude,
        });
      });
    } catch (error) {
      // Backstop for a genuine concurrent double-start race: the unique
      // constraint @@unique([workOrderId, purchaseOrderItemId, unitOrdinal])
      // trips with P2002 and Postgres aborts the whole transaction (so the
      // status update rolled back too). The other transaction has already
      // fanned out the jobs — just apply the status update and return.
      if (isUniqueConstraintError(error)) {
        await prisma.workOrder.update({
          where: { id },
          data: { status: "IN_PROGRESS" },
        });
        return this.findOne(companyId, id);
      }
      throw error;
    }
  }

  /**
   * Coerce a WorkOrderItem.qty (Decimal(18,4)) to the positive integer unit
   * count used for CalibrationJob fan-out. Fails loudly on a fractional or
   * non-positive qty rather than flooring/rounding — a "3.5 units" line is a
   * data error the planner must fix, not something fan-out should paper over.
   */
  private coerceFanOutQty(qty: Prisma.Decimal, workOrderItemId: string): number {
    if (!qty.isInteger() || qty.lessThanOrEqualTo(0)) {
      throw new BadRequestException({
        message: `WorkOrderItem qty must be a positive whole number to fan out calibration jobs (got ${qty.toString()})`,
        code: "WORK_ORDER_ITEM_QTY_NOT_FANOUT_SAFE",
        workOrderItemId,
        qty: qty.toString(),
      });
    }
    return qty.toNumber();
  }

  /**
   * Fan out CalibrationJob rows for every WorkOrderItem on a WorkOrder that is
   * entering IN_PROGRESS: qty jobs per item, unitOrdinal 1..qty. Idempotent —
   * if any job already exists for this WorkOrder it does nothing. Runs inside
   * the caller's transaction.
   */
  private async fanOutCalibrationJobs(
    tx: Prisma.TransactionClient,
    workOrder: WorkOrderWithItems,
  ): Promise<void> {
    const alreadyFannedOut = await tx.calibrationJob.count({
      where: { workOrderId: workOrder.id },
    });
    if (alreadyFannedOut > 0) return;

    const rows: Prisma.CalibrationJobCreateManyInput[] = [];
    for (const item of workOrder.items) {
      const unitTotal = this.coerceFanOutQty(item.qty, item.id);
      const requestItem = item.purchaseOrderItem.quotationItem.requestItem ?? null;
      for (let unitOrdinal = 1; unitOrdinal <= unitTotal; unitOrdinal++) {
        rows.push({
          companyId: workOrder.companyId,
          workOrderId: workOrder.id,
          purchaseOrderItemId: item.purchaseOrderItemId,
          deviceId: null,
          calibrationRequestItemId: requestItem?.id ?? null,
          customerDeclaredDeviceName: requestItem?.customerDeviceName ?? null,
          customerDeclaredAkdAkl: requestItem?.akdAkl ?? null,
          unitOrdinal,
          unitTotal,
          // status -> PENDING (schema default)
          // akdAklApprovalStatus -> NOT_REQUIRED (schema default); whether a null
          // customerDeclaredAkdAkl should instead force PENDING_REVIEW here is a
          // decision deferred to the AKD/AKL escalation task.
        });
      }
    }
    if (rows.length > 0) {
      await tx.calibrationJob.createMany({ data: rows });
    }
  }

  // ---------------------------------------------------------------------------
  // Reference-equipment selection ("Equipment yang akan dibawa") — ON_SITE only
  // ---------------------------------------------------------------------------

  /** Default equipment proposal + candidate units for an existing work order. */
  async getEquipmentProposal(
    companyId: string,
    id: string,
  ): Promise<{ serviceMode: string; proposal: EquipmentProposalRow[] }> {
    const workOrder = await this.findOne(companyId, id);
    if (workOrder.serviceMode !== "ON_SITE") {
      return { serviceMode: workOrder.serviceMode, proposal: [] };
    }

    const deviceTypeIds = deviceTypeIdsFromItems(workOrder.items);
    const proposedTypes = await resolveRequiredEquipmentTypes(prisma, deviceTypeIds);

    const selectedByType = new Map(
      workOrder.equipment.map((row) => [row.equipmentTypeId, row.equipmentId]),
    );

    // Include the types of any off-template selections so they still render.
    const extraTypes = workOrder.equipment
      .filter((row) => !proposedTypes.some((type) => type.equipmentType.id === row.equipmentTypeId))
      .map((row) => row.equipment.equipmentType);
    const seenExtra = new Set<string>();
    let nextSort = (proposedTypes.length + 1) * 10;
    const extraRows: EquipmentProposalRow[] = [];
    for (const type of extraTypes) {
      if (seenExtra.has(type.id)) continue;
      seenExtra.add(type.id);
      extraRows.push({
        equipmentType: type,
        sortOrder: nextSort,
        coveredFromDeviceTypeId: "",
        candidates: [],
        selectedEquipmentId: selectedByType.get(type.id) ?? null,
      });
      nextSort += 10;
    }

    const allTypeIds = [
      ...proposedTypes.map((type) => type.equipmentType.id),
      ...extraRows.map((row) => row.equipmentType.id),
    ];
    const candidatesByType = await loadEquipmentCandidates(
      prisma,
      companyId,
      allTypeIds,
      workOrder.scheduledStart ?? new Date(),
    );

    const proposal: EquipmentProposalRow[] = [
      ...proposedTypes.map((type) => ({
        equipmentType: type.equipmentType,
        sortOrder: type.sortOrder,
        coveredFromDeviceTypeId: type.coveredFromDeviceTypeId,
        candidates: candidatesByType.get(type.equipmentType.id) ?? [],
        selectedEquipmentId: selectedByType.get(type.equipmentType.id) ?? null,
      })),
      ...extraRows.map((row) => ({
        ...row,
        candidates: candidatesByType.get(row.equipmentType.id) ?? [],
      })),
    ];

    return { serviceMode: workOrder.serviceMode, proposal };
  }

  /** Pre-create proposal: resolve DeviceTypes straight from an APPROVED PO. */
  async getEquipmentProposalForPurchaseOrder(
    companyId: string,
    purchaseOrderId: string,
  ): Promise<{ serviceMode: string; proposal: EquipmentProposalRow[] }> {
    const purchaseOrder = await prisma.purchaseOrder.findFirst({
      where: { id: purchaseOrderId, companyId },
      include: {
        items: {
          include: {
            quotationItem: { include: { requestItem: { select: { deviceTypeId: true } } } },
          },
        },
        quotation: { include: { request: { select: { serviceMode: true } } } },
      },
    });
    if (!purchaseOrder) {
      throw new NotFoundException({
        message: "Purchase order not found",
        code: "PURCHASE_ORDER_NOT_FOUND",
      });
    }
    const serviceMode = purchaseOrder.quotation.request?.serviceMode ?? "SEND_TO_LAB";
    if (serviceMode !== "ON_SITE") {
      return { serviceMode, proposal: [] };
    }

    const deviceTypeIds = [
      ...new Set(
        purchaseOrder.items
          .map((item) => item.quotationItem.requestItem?.deviceTypeId)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const proposedTypes = await resolveRequiredEquipmentTypes(prisma, deviceTypeIds);
    const candidatesByType = await loadEquipmentCandidates(
      prisma,
      companyId,
      proposedTypes.map((type) => type.equipmentType.id),
      new Date(),
    );

    return {
      serviceMode,
      proposal: proposedTypes.map((type) => ({
        equipmentType: type.equipmentType,
        sortOrder: type.sortOrder,
        coveredFromDeviceTypeId: type.coveredFromDeviceTypeId,
        candidates: candidatesByType.get(type.equipmentType.id) ?? [],
        selectedEquipmentId: null,
      })),
    };
  }

  /** Full-set replace of the work order's reference-equipment selection. */
  async replaceEquipment(
    companyId: string,
    id: string,
    input: WorkOrderEquipmentReplaceInput,
  ): Promise<{ workOrder: WorkOrderWithItems; warnings: EquipmentValidationResult["warnings"] }> {
    const existing = await this.findOne(companyId, id);
    if (existing.serviceMode !== "ON_SITE") {
      throw new BadRequestException({
        message: "Equipment selection is only applicable to on-site work orders",
        code: "EQUIPMENT_NOT_APPLICABLE_FOR_SEND_TO_LAB",
      });
    }
    assertNonTerminal(
      existing.status,
      "INVALID_STATUS_FOR_EQUIPMENT_UPDATE",
      "Cannot change equipment on a terminal work order",
    );
    assertNoActiveDeliveryNote(
      existing.deliveryNote,
      "DELIVERY_NOTE_ISSUED_EQUIPMENT_LOCKED",
      "The equipment list is locked — a delivery note (Surat Jalan) has been issued",
    );

    const { rows, warnings } = await validateEquipmentSelection(
      prisma,
      companyId,
      input.equipment,
      existing.scheduledStart,
    );

    const workOrder = await prisma.$transaction(async (tx) => {
      await tx.workOrderEquipment.deleteMany({ where: { workOrderId: id } });
      if (rows.length > 0) {
        await tx.workOrderEquipment.createMany({
          data: rows.map((row) => ({
            companyId,
            workOrderId: id,
            equipmentId: row.equipmentId,
            equipmentTypeId: row.equipmentTypeId,
            notes: row.notes,
            sortOrder: row.sortOrder,
          })),
        });
      }
      // Editing the list always clears a prior confirmation.
      await tx.workOrder.update({
        where: { id },
        data: { equipmentConfirmedAt: null },
      });
      return tx.workOrder.findFirstOrThrow({
        where: { id, companyId },
        include: workOrderInclude,
      });
    });

    return { workOrder, warnings };
  }

  /** Explicit planner confirmation of the equipment list (D1 gate). */
  async confirmEquipment(companyId: string, id: string): Promise<WorkOrderWithItems> {
    const existing = await this.findOne(companyId, id);
    if (existing.serviceMode !== "ON_SITE") {
      throw new BadRequestException({
        message: "Equipment confirmation is only applicable to on-site work orders",
        code: "EQUIPMENT_NOT_APPLICABLE_FOR_SEND_TO_LAB",
      });
    }
    assertNonTerminal(
      existing.status,
      "INVALID_STATUS_FOR_EQUIPMENT_UPDATE",
      "Cannot confirm equipment on a terminal work order",
    );
    assertNoActiveDeliveryNote(
      existing.deliveryNote,
      "DELIVERY_NOTE_ISSUED_EQUIPMENT_LOCKED",
      "The equipment list is locked — a delivery note (Surat Jalan) has been issued",
    );
    if (existing.equipment.length === 0) {
      throw new BadRequestException({
        message: "Select at least one equipment unit before confirming",
        code: "WORK_ORDER_EQUIPMENT_EMPTY",
      });
    }

    return prisma.workOrder.update({
      where: { id },
      data: { equipmentConfirmedAt: new Date() },
      include: workOrderInclude,
    });
  }

  /**
   * Persist the operational order of the work order's reference equipment
   * ("Equipment yang akan dibawa"). This is the authoritative order for the
   * future Delivery Note / Surat Jalan.
   *
   * `equipmentIds` must be the FULL set of equipment currently attached to this
   * work order — a mismatch (unknown id, missing id, duplicate, or an id from
   * another work order) is rejected so a reorder can NEVER add, remove, or
   * reassign equipment. Only `WorkOrderEquipment.sortOrder` changes, written in
   * one transaction as contiguous multiples of 10. Confirmation is deliberately
   * NOT cleared: it attests to the equipment set, which `assertSameSet`
   * guarantees is unchanged.
   */
  async reorderEquipment(
    companyId: string,
    id: string,
    equipmentIds: string[],
  ): Promise<WorkOrderWithItems> {
    const existing = await this.findOne(companyId, id);
    if (existing.serviceMode !== "ON_SITE") {
      throw new BadRequestException({
        message: "Equipment ordering is only applicable to on-site work orders",
        code: "EQUIPMENT_NOT_APPLICABLE_FOR_SEND_TO_LAB",
      });
    }
    assertNonTerminal(
      existing.status,
      "INVALID_STATUS_FOR_EQUIPMENT_UPDATE",
      "Cannot reorder equipment on a terminal work order",
    );
    assertNoActiveDeliveryNote(
      existing.deliveryNote,
      "DELIVERY_NOTE_ISSUED_EQUIPMENT_LOCKED",
      "The equipment order is locked — a delivery note (Surat Jalan) has been issued",
    );

    const rowByEquipmentId = new Map(
      existing.equipment.map((row) => [row.equipmentId, row.id]),
    );
    const providedSet = new Set(equipmentIds);
    const sameSet =
      providedSet.size === equipmentIds.length &&
      providedSet.size === rowByEquipmentId.size &&
      [...rowByEquipmentId.keys()].every((equipmentId) => providedSet.has(equipmentId));
    if (!sameSet) {
      throw new BadRequestException({
        message:
          "equipmentIds must contain exactly the equipment currently attached to this work order, with no duplicates",
        code: "WORK_ORDER_EQUIPMENT_ORDER_MISMATCH",
      });
    }

    await prisma.$transaction(
      equipmentIds.map((equipmentId, index) =>
        prisma.workOrderEquipment.update({
          where: { id: rowByEquipmentId.get(equipmentId)! },
          data: { sortOrder: (index + 1) * WORK_ORDER_EQUIPMENT_ORDER_STEP },
        }),
      ),
    );

    return this.findOne(companyId, id);
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
    assertNoActiveDeliveryNote(
      existing.deliveryNote,
      "DELIVERY_NOTE_MUST_BE_CANCELLED_FIRST",
      "Cancel the delivery note (Surat Jalan) before cancelling this work order",
    );
    assertTransition(existing.status, "CANCELLED");

    return prisma.workOrder.update({
      where: { id },
      data: { status: "CANCELLED" },
      include: workOrderInclude,
    });
  }
}
