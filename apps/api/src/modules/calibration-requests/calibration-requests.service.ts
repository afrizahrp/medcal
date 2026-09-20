import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DocumentNumberService, allocateRevisionNumber, prisma } from "@medcal/db";
import type { Prisma } from "@medcal/db";
import {
  CALIBRATION_REQUEST_SORTABLE_FIELDS,
  type CalibrationRequestCreateInput,
  type CalibrationRequestListQuery,
  type CalibrationRequestReviseInput,
  type CalibrationRequestUpdateInput,
} from "@medcal/shared";
import { resolveSortOrder, withIdTieBreaker } from "../../common/sort-query";
import { recordAuditLog } from "../calibration-jobs/audit-log";

/**
 * MOM #1 — Transaction Revision + Immutable History.
 * Statuses eligible for the `Revise` action (as opposed to the normal DRAFT
 * `Edit`/PATCH). Mirrors the non-DRAFT, non-terminal window: CANCELLED and
 * FULFILLED are terminal/read-only (see calibration-requests.service.ts
 * cancel()); DRAFT already uses update().
 */
const REVISABLE_CALIBRATION_REQUEST_STATUSES = ["SUBMITTED", "IN_QUOTATION"] as const;

const calibrationRequestHistoryInclude = {
  items: true,
  revisedBy: { select: { id: true, name: true, email: true } },
} as const;

export type CalibrationRequestHistoryWithItems = Prisma.CalibrationRequestHistoryGetPayload<{
  include: typeof calibrationRequestHistoryInclude;
}>;

export type CalibrationRequestHistorySummary = Omit<CalibrationRequestHistoryWithItems, "items">;

const DEFAULT_PAGE_SIZE = 10;

const deviceTypeSelect = {
  id: true,
  code: true,
  name: true,
  category: { select: { id: true, name: true } },
} as const;

const calibrationRequestInclude = {
  // MOM #1 — Revision Scope Design: a retired (isActive: false) item is no
  // longer part of the requisition's current desired scope; it stays in the
  // database only for downstream traceability, never shown as a current row.
  items: { where: { isActive: true }, include: { deviceType: { select: deviceTypeSelect } } },
  customer: true,
} as const;

export type CalibrationRequestWithItems = Prisma.CalibrationRequestGetPayload<{
  include: typeof calibrationRequestInclude;
}>;

export interface CalibrationRequestListResult {
  data: CalibrationRequestWithItems[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

async function assertDeviceTypesExist(
  tx: Prisma.TransactionClient,
  deviceTypeIds: string[],
): Promise<void> {
  const uniqueIds = [...new Set(deviceTypeIds)];
  const count = await tx.deviceType.count({ where: { id: { in: uniqueIds } } });
  if (count !== uniqueIds.length) {
    throw new BadRequestException({
      message: "One or more device types not found",
      code: "DEVICE_TYPE_NOT_FOUND",
    });
  }
}

/**
 * MOM #1 — Final Revision Scope Design §10 (cross-chain safety guard).
 * Before retiring a consumed CalibrationRequestItem (isActive -> false),
 * confirm no WorkOrderItem derived from it belongs to a WorkOrder that has
 * already left PLANNED/ASSIGNED. Retiring it past that point would silently
 * invalidate scope a WorkOrder has already committed to (or fanned out
 * CalibrationJobs for) — this MOM must not touch job/fan-out behavior, so
 * the revision is rejected outright instead.
 */
async function assertRetirementSafe(
  tx: Prisma.TransactionClient,
  requestItemIds: string[],
): Promise<void> {
  const blocking = await tx.workOrderItem.findFirst({
    where: {
      purchaseOrderItem: { quotationItem: { requestItemId: { in: requestItemIds } } },
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

@Injectable()
export class CalibrationRequestsService {
  async create(
    companyId: string,
    userId: string,
    input: CalibrationRequestCreateInput,
  ): Promise<CalibrationRequestWithItems> {
    return prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findFirst({
        where: { id: input.customerId, companyId },
      });
      if (!customer) {
        throw new BadRequestException({
          message: "Customer not found",
          code: "CUSTOMER_NOT_FOUND",
        });
      }

      if (input.leadId) {
        const lead = await tx.lead.findFirst({
          where: { id: input.leadId, companyId },
        });
        if (!lead) {
          throw new BadRequestException({
            message: "Lead not found",
            code: "LEAD_NOT_FOUND",
          });
        }
      }

      await assertDeviceTypesExist(
        tx,
        input.items.map((item) => item.deviceTypeId),
      );

      const issuedAt = new Date();
      const number = await DocumentNumberService.allocate({
        companyId,
        documentType: "CALIBRATION_REQUEST",
        issuedAt,
        tx,
      });

      const calibrationRequest = await tx.calibrationRequest.create({
        data: {
          companyId,
          customerId: input.customerId,
          number,
          leadId: input.leadId,
          serviceMode: input.serviceMode,
          expectedDate: input.expectedDate,
          status: "DRAFT",
          notes: input.notes,
          createdByUserId: userId,
        },
      });

      await tx.calibrationRequestItem.createMany({
        data: input.items.map((item) => ({
          companyId,
          requestId: calibrationRequest.id,
          deviceTypeId: item.deviceTypeId,
          customerDeviceName: item.customerDeviceName || null,
          model: item.model || null,
          deviceId: item.deviceId || null,
          qty: item.qty ?? 1,
          akdAkl: item.akdAkl || null,
          akdAklDeclaration:
            item.akdAklDeclaration ?? (item.akdAkl ? "CUSTOMER_PROVIDED" : "NOT_PROVIDED"),
          notes: item.notes,
        })),
      });

      return tx.calibrationRequest.findFirstOrThrow({
        where: { id: calibrationRequest.id, companyId },
        include: calibrationRequestInclude,
      });
    });
  }

  async findAll(
    companyId: string,
    query: CalibrationRequestListQuery,
  ): Promise<CalibrationRequestListResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.CalibrationRequestWhereInput = {
      companyId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.search
        ? {
            OR: [
              { number: { contains: query.search, mode: "insensitive" } },
              { notes: { contains: query.search, mode: "insensitive" } },
              { customer: { name: { contains: query.search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const { field: sortField, dir: sortDir } = resolveSortOrder(
      CALIBRATION_REQUEST_SORTABLE_FIELDS,
      query.sortBy,
      query.sortDir,
      "createdAt",
    );

    const [total, data] = await Promise.all([
      prisma.calibrationRequest.count({ where }),
      prisma.calibrationRequest.findMany({
        where,
        orderBy: withIdTieBreaker(sortField, sortDir),
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: calibrationRequestInclude,
      }),
    ]);

    return { data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async findOne(companyId: string, id: string): Promise<CalibrationRequestWithItems> {
    const calibrationRequest = await prisma.calibrationRequest.findFirst({
      where: { id, companyId },
      include: calibrationRequestInclude,
    });
    if (!calibrationRequest) {
      throw new NotFoundException({
        message: "Requisition not found",
        code: "CALIBRATION_REQUEST_NOT_FOUND",
      });
    }
    return calibrationRequest;
  }

  async update(
    companyId: string,
    id: string,
    userId: string,
    input: CalibrationRequestUpdateInput,
  ): Promise<CalibrationRequestWithItems> {
    const existing = await prisma.calibrationRequest.findFirst({
      where: { id, companyId },
    });
    if (!existing) {
      throw new NotFoundException({
        message: "Requisition not found",
        code: "CALIBRATION_REQUEST_NOT_FOUND",
      });
    }

    // TODO: Full edit-permission business rules need confirmation. Currently
    // only allowing edits while status is DRAFT (the initial state).
    if (existing.status !== "DRAFT") {
      throw new BadRequestException({
        message: "Cannot update requisition that is not in DRAFT status",
        code: "INVALID_STATUS_FOR_UPDATE",
      });
    }

    return prisma.$transaction(async (tx) => {
      if (input.customerId) {
        const customer = await tx.customer.findFirst({
          where: { id: input.customerId, companyId },
        });
        if (!customer) {
          throw new BadRequestException({
            message: "Customer not found",
            code: "CUSTOMER_NOT_FOUND",
          });
        }
      }

      if (input.leadId) {
        const lead = await tx.lead.findFirst({
          where: { id: input.leadId, companyId },
        });
        if (!lead) {
          throw new BadRequestException({
            message: "Lead not found",
            code: "LEAD_NOT_FOUND",
          });
        }
      }

      if (input.items) {
        await assertDeviceTypesExist(
          tx,
          input.items.map((item) => item.deviceTypeId),
        );

        await tx.calibrationRequestItem.deleteMany({
          where: { requestId: id },
        });

        await tx.calibrationRequestItem.createMany({
          data: input.items.map((item) => ({
            companyId,
            requestId: id,
            deviceTypeId: item.deviceTypeId,
            customerDeviceName: item.customerDeviceName || null,
            model: item.model || null,
            deviceId: item.deviceId || null,
            qty: item.qty ?? 1,
            akdAkl: item.akdAkl || null,
            akdAklDeclaration:
              item.akdAklDeclaration ?? (item.akdAkl ? "CUSTOMER_PROVIDED" : "NOT_PROVIDED"),
            notes: item.notes,
          })),
        });
      }

      await tx.calibrationRequest.update({
        where: { id },
        data: {
          ...(input.customerId !== undefined ? { customerId: input.customerId } : {}),
          ...(input.leadId !== undefined ? { leadId: input.leadId } : {}),
          ...(input.serviceMode !== undefined ? { serviceMode: input.serviceMode } : {}),
          ...(input.expectedDate !== undefined ? { expectedDate: input.expectedDate } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          updatedByUserId: userId,
        },
      });

      return tx.calibrationRequest.findFirstOrThrow({
        where: { id, companyId },
        include: calibrationRequestInclude,
      });
    });
  }

  async cancel(
    companyId: string,
    id: string,
    userId: string,
  ): Promise<CalibrationRequestWithItems> {
    const existing = await prisma.calibrationRequest.findFirst({
      where: { id, companyId },
    });
    if (!existing) {
      throw new NotFoundException({
        message: "Requisition not found",
        code: "CALIBRATION_REQUEST_NOT_FOUND",
      });
    }

    if (existing.status === "CANCELLED") {
      throw new BadRequestException({
        message: "Requisition is already cancelled",
        code: "ALREADY_CANCELLED",
      });
    }

    if (existing.status === "FULFILLED") {
      throw new BadRequestException({
        message: "Cannot cancel a fulfilled requisition",
        code: "CANNOT_CANCEL_FULFILLED",
      });
    }

    // TODO: Status transition to IN_QUOTATION will be triggered from the
    // Quotation module when it's implemented. This module only handles
    // DRAFT -> SUBMITTED and any status -> CANCELLED transitions.

    return prisma.calibrationRequest.update({
      where: { id },
      data: { status: "CANCELLED", updatedByUserId: userId },
      include: calibrationRequestInclude,
    });
  }

  async submit(
    companyId: string,
    id: string,
    userId: string,
  ): Promise<CalibrationRequestWithItems> {
    const existing = await prisma.calibrationRequest.findFirst({
      where: { id, companyId },
    });
    if (!existing) {
      throw new NotFoundException({
        message: "Requisition not found",
        code: "CALIBRATION_REQUEST_NOT_FOUND",
      });
    }

    if (existing.status !== "DRAFT") {
      throw new BadRequestException({
        message: "Only DRAFT requisitions can be submitted",
        code: "INVALID_STATUS_FOR_SUBMIT",
      });
    }

    return prisma.calibrationRequest.update({
      where: { id },
      data: { status: "SUBMITTED", updatedByUserId: userId },
      include: calibrationRequestInclude,
    });
  }

  /**
   * MOM #1 — Final Revision Scope Design (desired-scope reconciliation).
   * See mom-1-final-revision-scope-design-20260920.md.
   *
   * `input.items` is the COMPLETE desired active scope, not a set of edits:
   * a current active item's `id` absent from `input.items` is REMOVED.
   * Matching is by row `id` only — never by `deviceTypeId` or any other
   * business attribute. Device replacement is REMOVE (old id) + ADD (new,
   * no id) — there is no separate "replace" persistence concept.
   *
   * Reachable once the requisition has left DRAFT (see
   * REVISABLE_CALIBRATION_REQUEST_STATUSES). Snapshots the complete current
   * header + all current active items into CalibrationRequestHistory /
   * CalibrationRequestItemHistory (append-only) before applying the
   * reconciliation. The customer-facing `number` never changes.
   *
   * Per-item semantics: unconsumed rows are freely updated/deleted in
   * place. A consumed row (already snapshotted into a QuotationItem) is
   * frozen — removal retires it (`isActive: false`) instead of deleting it,
   * a qty increase is a new active sibling row carrying the delta, and a
   * qty decrease retires the frozen row and adds a new row carrying the
   * full new desired qty (never a negative delta, never a mutation of the
   * frozen row).
   */
  async revise(
    companyId: string,
    id: string,
    userId: string,
    input: CalibrationRequestReviseInput,
  ): Promise<CalibrationRequestWithItems> {
    const existing = await prisma.calibrationRequest.findFirst({
      where: { id, companyId },
      include: { items: { where: { isActive: true } } },
    });
    if (!existing) {
      throw new NotFoundException({
        message: "Requisition not found",
        code: "CALIBRATION_REQUEST_NOT_FOUND",
      });
    }

    if (
      !REVISABLE_CALIBRATION_REQUEST_STATUSES.includes(
        existing.status as (typeof REVISABLE_CALIBRATION_REQUEST_STATUSES)[number],
      )
    ) {
      throw new BadRequestException({
        message:
          existing.status === "DRAFT"
            ? "DRAFT requisitions must use the normal edit action, not revise"
            : "Requisition is not in a status that allows revision",
        code: "INVALID_STATUS_FOR_REVISE",
      });
    }

    const currentItemsById = new Map(existing.items.map((item) => [item.id, item]));
    for (const item of input.items) {
      if (item.id && !currentItemsById.has(item.id)) {
        throw new BadRequestException({
          message: "One or more revised items do not belong to this requisition",
          code: "CALIBRATION_REQUEST_ITEM_NOT_FOUND",
        });
      }
    }
    const desiredIds = new Set(input.items.flatMap((item) => (item.id ? [item.id] : [])));
    const removedItems = existing.items.filter((item) => !desiredIds.has(item.id));

    const result = await prisma.$transaction(async (tx) => {
      await assertDeviceTypesExist(
        tx,
        input.items.map((item) => item.deviceTypeId),
      );

      // Row lock for concurrent revise() calls on the same requisition — see
      // allocateRevisionNumber for why this must happen before it is called.
      await tx.calibrationRequest.update({
        where: { id },
        data: {
          ...(input.serviceMode !== undefined ? { serviceMode: input.serviceMode } : {}),
          ...(input.expectedDate !== undefined ? { expectedDate: input.expectedDate } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          updatedByUserId: userId,
        },
      });

      const revisionNumber = await allocateRevisionNumber({
        tx,
        historyTable: "CalibrationRequestHistory",
        parentIdColumn: "requestId",
        parentId: id,
      });

      await tx.calibrationRequestHistory.create({
        data: {
          requestId: id,
          revisionNumber,
          companyId,
          customerId: existing.customerId,
          number: existing.number,
          leadId: existing.leadId,
          serviceMode: existing.serviceMode,
          expectedDate: existing.expectedDate,
          status: existing.status,
          notes: existing.notes,
          revisedByUserId: userId,
          items: {
            create: existing.items.map((item) => ({
              sourceItemId: item.id,
              deviceTypeId: item.deviceTypeId,
              customerDeviceName: item.customerDeviceName,
              model: item.model,
              deviceId: item.deviceId,
              qty: item.qty,
              akdAkl: item.akdAkl,
              akdAklDeclaration: item.akdAklDeclaration,
              notes: item.notes,
            })),
          },
        },
      });

      // REMOVED: a current active item whose id is absent from the desired scope.
      for (const item of removedItems) {
        const consumedCount = await tx.quotationItem.count({
          where: { requestItemId: item.id },
        });
        if (consumedCount === 0) {
          await tx.calibrationRequestItem.delete({ where: { id: item.id } });
        } else {
          await assertRetirementSafe(tx, [item.id]);
          await tx.calibrationRequestItem.update({
            where: { id: item.id },
            data: { isActive: false },
          });
        }
      }

      // ADDED / UNCHANGED / QTY_CHANGED.
      for (const item of input.items) {
        if (!item.id) {
          // ADDED — a genuinely new line, fresh lineage, no id carried over.
          await tx.calibrationRequestItem.create({
            data: {
              companyId,
              requestId: id,
              deviceTypeId: item.deviceTypeId,
              customerDeviceName: item.customerDeviceName || null,
              model: item.model || null,
              deviceId: item.deviceId || null,
              qty: item.qty ?? 1,
              akdAkl: item.akdAkl || null,
              akdAklDeclaration:
                item.akdAklDeclaration ?? (item.akdAkl ? "CUSTOMER_PROVIDED" : "NOT_PROVIDED"),
              notes: item.notes,
            },
          });
          continue;
        }

        const currentItem = currentItemsById.get(item.id);
        if (!currentItem) continue; // validated above

        const consumedCount = await tx.quotationItem.count({
          where: { requestItemId: item.id },
        });
        const desiredQty = item.qty ?? currentItem.qty;

        if (consumedCount === 0) {
          // Unconsumed — freely updated in place (UNCHANGED and QTY_CHANGED
          // both flow through the same in-place update; applying identical
          // values is a harmless no-op).
          await tx.calibrationRequestItem.update({
            where: { id: item.id },
            data: {
              deviceTypeId: item.deviceTypeId,
              customerDeviceName: item.customerDeviceName || null,
              model: item.model || null,
              deviceId: item.deviceId || null,
              qty: desiredQty,
              akdAkl: item.akdAkl || null,
              akdAklDeclaration:
                item.akdAklDeclaration ??
                (item.akdAkl ? "CUSTOMER_PROVIDED" : currentItem.akdAklDeclaration),
              notes: item.notes ?? currentItem.notes,
            },
          });
          continue;
        }

        // Consumed — the row is frozen, never mutated.
        if (desiredQty === currentItem.qty) {
          continue; // UNCHANGED
        }
        if (desiredQty > currentItem.qty) {
          // QTY_CHANGED (increase) — additive sibling carrying only the delta.
          await tx.calibrationRequestItem.create({
            data: {
              companyId,
              requestId: id,
              deviceTypeId: currentItem.deviceTypeId,
              customerDeviceName: currentItem.customerDeviceName,
              model: currentItem.model,
              deviceId: currentItem.deviceId,
              qty: desiredQty - currentItem.qty,
              akdAkl: currentItem.akdAkl,
              akdAklDeclaration: currentItem.akdAklDeclaration,
              notes: currentItem.notes,
            },
          });
          continue;
        }
        // QTY_CHANGED (decrease) — retire the frozen row, add a new one
        // carrying the full new desired qty. Never a negative delta, never
        // a mutation of the frozen row.
        await assertRetirementSafe(tx, [item.id]);
        await tx.calibrationRequestItem.update({
          where: { id: item.id },
          data: { isActive: false },
        });
        await tx.calibrationRequestItem.create({
          data: {
            companyId,
            requestId: id,
            deviceTypeId: currentItem.deviceTypeId,
            customerDeviceName: currentItem.customerDeviceName,
            model: currentItem.model,
            deviceId: currentItem.deviceId,
            qty: desiredQty,
            akdAkl: currentItem.akdAkl,
            akdAklDeclaration: currentItem.akdAklDeclaration,
            notes: currentItem.notes,
          },
        });
      }

      return tx.calibrationRequest.findFirstOrThrow({
        where: { id, companyId },
        include: calibrationRequestInclude,
      });
    });

    await recordAuditLog({
      companyId,
      userId,
      action: "CALIBRATION_REQUEST_REVISE",
      outcome: "SUCCESS",
      targetType: "CalibrationRequest",
      targetId: id,
      metadata: { number: existing.number },
    });

    return result;
  }

  /** MOM #1 — read-only revision list (header snapshots only, no items). */
  async listHistory(companyId: string, id: string): Promise<CalibrationRequestHistorySummary[]> {
    await this.findOne(companyId, id);
    return prisma.calibrationRequestHistory.findMany({
      where: { requestId: id, companyId },
      orderBy: { revisionNumber: "desc" },
      include: { revisedBy: { select: { id: true, name: true, email: true } } },
    });
  }

  /** MOM #1 — read-only single revision snapshot, including its items. */
  async getHistoryRevision(
    companyId: string,
    id: string,
    revisionNumber: number,
  ): Promise<CalibrationRequestHistoryWithItems> {
    await this.findOne(companyId, id);
    const revision = await prisma.calibrationRequestHistory.findFirst({
      where: { requestId: id, companyId, revisionNumber },
      include: calibrationRequestHistoryInclude,
    });
    if (!revision) {
      throw new NotFoundException({
        message: "Revision not found",
        code: "CALIBRATION_REQUEST_REVISION_NOT_FOUND",
      });
    }
    return revision;
  }
}
