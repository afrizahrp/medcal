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
  items: { include: { deviceType: { select: deviceTypeSelect } } },
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
   * MOM #1 — Transaction Revision + Immutable History.
   *
   * The `Revise` counterpart to `update()`: reachable once the requisition has
   * left DRAFT (see REVISABLE_CALIBRATION_REQUEST_STATUSES). Snapshots the
   * complete current header + items into CalibrationRequestHistory /
   * CalibrationRequestItemHistory (append-only) before applying the change.
   * The customer-facing `number` never changes.
   *
   * Per-item semantics (mom-1-item-revision-rule): a `qty` change on an item
   * that has NOT yet been snapshotted into a QuotationItem is applied in
   * place. Once a QuotationItem already references it, the row is frozen and
   * additional quantity is carried by a new sibling row instead.
   */
  async revise(
    companyId: string,
    id: string,
    userId: string,
    input: CalibrationRequestReviseInput,
  ): Promise<CalibrationRequestWithItems> {
    const existing = await prisma.calibrationRequest.findFirst({
      where: { id, companyId },
      include: { items: true },
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

    const existingItemsById = new Map(existing.items.map((item) => [item.id, item]));
    for (const item of input.items) {
      if (item.id && !existingItemsById.has(item.id)) {
        throw new BadRequestException({
          message: "One or more revised items do not belong to this requisition",
          code: "CALIBRATION_REQUEST_ITEM_NOT_FOUND",
        });
      }
    }

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

      for (const item of input.items) {
        if (!item.id) {
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

        const currentItem = existingItemsById.get(item.id);
        if (!currentItem) continue; // validated above

        const consumedCount = await tx.quotationItem.count({
          where: { requestItemId: item.id },
        });

        if (consumedCount === 0) {
          await tx.calibrationRequestItem.update({
            where: { id: item.id },
            data: {
              deviceTypeId: item.deviceTypeId,
              customerDeviceName: item.customerDeviceName || null,
              model: item.model || null,
              deviceId: item.deviceId || null,
              qty: item.qty ?? currentItem.qty,
              akdAkl: item.akdAkl || null,
              akdAklDeclaration:
                item.akdAklDeclaration ??
                (item.akdAkl ? "CUSTOMER_PROVIDED" : currentItem.akdAklDeclaration),
              notes: item.notes ?? currentItem.notes,
            },
          });
          continue;
        }

        // Already snapshotted into a QuotationItem — the row is frozen
        // (mom-1-item-revision-rule). Growth is represented by a new sibling
        // row cloned from the frozen row's identity, carrying only the delta.
        if (item.qty === undefined || item.qty <= currentItem.qty) {
          throw new BadRequestException({
            message:
              "This item already has a Quotation generated from it and cannot be shrunk or edited in place. " +
              "Provide a qty greater than the current value to add scope as a new line.",
            code: "CALIBRATION_REQUEST_ITEM_ALREADY_CONSUMED",
            itemId: item.id,
          });
        }

        await tx.calibrationRequestItem.create({
          data: {
            companyId,
            requestId: id,
            deviceTypeId: currentItem.deviceTypeId,
            customerDeviceName: currentItem.customerDeviceName,
            model: currentItem.model,
            deviceId: currentItem.deviceId,
            qty: item.qty - currentItem.qty,
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
