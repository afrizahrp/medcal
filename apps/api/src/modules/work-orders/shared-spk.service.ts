import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DocumentNumberService, Prisma, prisma } from "@medcal/db";
import type { SharedSpkCreateInput, SharedSpkReviseInput } from "@medcal/shared";
import { recordAuditLog } from "../calibration-jobs/audit-log";
import {
  cancelActiveAllocationsForWorkOrder,
  createAllocationsAndWorkOrderItems,
  resolveAllocationPlan,
  type AllocationRequestItem,
} from "./allocation";
import {
  aggregateParentProgress,
  deriveParentStatus,
  isChildRevisableStatus,
  progressOf,
  type SharedSpkDerivedStatus,
  type SpkProgress,
} from "./spk-parent";
import { snapshotWorkOrderHistory } from "./work-order-history";
import { loadWorkOrderSourcePurchaseOrder } from "./work-order-source";

/** Many Children x many items are written in one transaction — allow more than Prisma's 5s default. */
const SHARED_TX_OPTIONS = { maxWait: 10_000, timeout: 60_000 } as const;

const parentInclude = {
  purchaseOrder: {
    select: { id: true, number: true, customerPoNumber: true, status: true },
  },
  customer: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  children: {
    orderBy: { childSequence: "asc" as const },
    include: {
      items: {
        orderBy: { createdAt: "asc" as const },
        select: { id: true, purchaseOrderItemId: true, description: true, qty: true },
      },
      assignments: {
        orderBy: { createdAt: "asc" as const },
        include: { technician: { select: { id: true, name: true, email: true } } },
      },
      deliveryNote: { select: { id: true, number: true, status: true, issuedAt: true } },
    },
  },
} satisfies Prisma.SpkParentInclude;

type ParentRow = Prisma.SpkParentGetPayload<{ include: typeof parentInclude }>;

export interface SharedSpkChildSummary {
  id: string;
  number: string;
  childSequence: number;
  status: ParentRow["children"][number]["status"];
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  technicians: { id: string; name: string | null; email: string; roleOnJob: string }[];
  items: { id: string; purchaseOrderItemId: string; description: string; qty: number }[];
  progress: SpkProgress;
  deliveryNote: { id: string; number: string; status: string; issuedAt: Date } | null;
  /** True once the Child has left PLANNED/ASSIGNED — execution-locked for revision. */
  locked: boolean;
}

export interface SharedSpkDetail {
  id: string;
  number: string;
  createdAt: Date;
  purchaseOrder: ParentRow["purchaseOrder"];
  customer: ParentRow["customer"];
  createdBy: ParentRow["createdBy"];
  /** Derived from Children — a Parent has no stored status. */
  status: SharedSpkDerivedStatus;
  /** Quantity-weighted aggregate of non-cancelled Children. */
  progress: SpkProgress;
  children: SharedSpkChildSummary[];
}

type TxClient = Prisma.TransactionClient;
type ReadClient = Prisma.TransactionClient | typeof prisma;
type ItemSource = Map<string, { description: string; qty: Prisma.Decimal }>;

function notFound(): NotFoundException {
  return new NotFoundException({
    message: "Shared SPK not found",
    code: "SHARED_SPK_NOT_FOUND",
  });
}

async function assertAssignableTechnicians(
  client: ReadClient,
  companyId: string,
  technicianUserIds: string[],
): Promise<void> {
  const unique = [...new Set(technicianUserIds)];
  if (unique.length === 0) return;
  const technicians = await client.user.findMany({
    where: {
      id: { in: unique },
      status: "ACTIVE",
      memberships: { some: { companyId } },
    },
    select: { id: true },
  });
  if (technicians.length !== unique.length) {
    throw new BadRequestException({
      message: "Assigned user must be an active member of this company",
      code: "INVALID_WORK_ORDER_ASSIGNEE",
    });
  }
}

async function lockPurchaseOrderItems(tx: TxClient, itemIds: string[]): Promise<void> {
  // Deterministic order → no lock-order deadlocks between concurrent revisions.
  for (const id of [...new Set(itemIds)].sort((a, b) => a.localeCompare(b))) {
    await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "PurchaseOrderItem" WHERE "id" = ${id} FOR UPDATE
    `;
  }
}

/**
 * Shared ON_SITE SPK ("Share Job"): atomic creation, read model and revision of
 * a Parent SPK and its Child SPKs.
 *
 * - The Parent (`SpkParent`) is a non-executable container: no status, no
 *   schedule, no Start/Done, no DLN. Everything about execution lives on the
 *   Child `WorkOrder` rows, which are ordinary executable ON_SITE SPKs.
 * - Quantity allocation is NOT re-implemented here: every Child's
 *   (item, qty) batch goes through the existing
 *   `createAllocationsAndWorkOrderItems` (row-locked
 *   SUM(ACTIVE) <= PurchaseOrderItem.qty invariant).
 */
@Injectable()
export class SharedSpkService {
  async create(
    companyId: string,
    userId: string | null,
    input: SharedSpkCreateInput,
  ): Promise<SharedSpkDetail> {
    const parentId = await prisma.$transaction(async (tx) => {
      const { purchaseOrder, request } = await loadWorkOrderSourcePurchaseOrder(
        tx,
        companyId,
        input.purchaseOrderId,
      );

      if (request.serviceMode !== "ON_SITE") {
        throw new BadRequestException({
          message: "Shared SPK (Share Job) applies only to ON_SITE purchase orders",
          code: "SHARED_SPK_ON_SITE_ONLY",
        });
      }

      await assertAssignableTechnicians(
        tx,
        companyId,
        input.children.map((child) => child.technicianUserId),
      );

      const activeItems = purchaseOrder.items.map((item) => ({ id: item.id, qty: item.qty }));
      const itemsById: ItemSource = new Map(
        purchaseOrder.items.map((item) => [
          item.id,
          { description: item.description, qty: item.qty },
        ]),
      );
      // Validate every Child's batch (active item, positive whole qty, no
      // duplicate item inside one Child) BEFORE consuming any number. The
      // remaining-qty map is only consulted when no items are requested, which
      // the schema forbids here.
      const plans: AllocationRequestItem[][] = input.children.map((child) =>
        resolveAllocationPlan(activeItems, child.items, new Map()),
      );

      const number = await DocumentNumberService.allocate({
        companyId,
        documentType: "WORK_ORDER",
        issuedAt: new Date(),
        tx,
      });

      const parent = await tx.spkParent.create({
        data: {
          companyId,
          purchaseOrderId: purchaseOrder.id,
          customerId: purchaseOrder.customerId,
          number,
          createdByUserId: userId,
        },
      });

      for (const [index, child] of input.children.entries()) {
        const childSequence = index + 1;
        const workOrder = await tx.workOrder.create({
          data: {
            companyId,
            customerId: purchaseOrder.customerId,
            quotationId: purchaseOrder.quotationId,
            purchaseOrderId: purchaseOrder.id,
            number: `${number}-${childSequence}`,
            serviceMode: "ON_SITE",
            addressText: input.addressText,
            geoLat: input.geoLat,
            geoLng: input.geoLng,
            locationNotes: input.locationNotes,
            scheduledStart: child.scheduledStart,
            scheduledEnd: child.scheduledEnd,
            // The technician is chosen in the distribution step, so a Child is
            // born assigned (same end state as create() followed by assign()).
            status: "ASSIGNED",
            parentSpkId: parent.id,
            childSequence,
          },
        });

        await createAllocationsAndWorkOrderItems(tx, {
          companyId,
          workOrderId: workOrder.id,
          plan: plans[index]!,
          itemsById,
        });

        await tx.workOrderAssignment.create({
          data: {
            companyId,
            workOrderId: workOrder.id,
            technicianUserId: child.technicianUserId,
            roleOnJob: "LEAD",
          },
        });
      }

      return parent.id;
    }, SHARED_TX_OPTIONS);

    return this.findOne(companyId, parentId);
  }

  async findOne(companyId: string, id: string): Promise<SharedSpkDetail> {
    return this.loadDetail(prisma, companyId, id);
  }

  private async loadDetail(
    client: ReadClient,
    companyId: string,
    id: string,
  ): Promise<SharedSpkDetail> {
    const parent = await client.spkParent.findFirst({
      where: { id, companyId },
      include: parentInclude,
    });
    if (!parent) throw notFound();

    const childIds = parent.children.map((child) => child.id);
    const jobCounts =
      childIds.length === 0
        ? []
        : await client.calibrationJob.groupBy({
            by: ["workOrderId", "status"],
            where: { workOrderId: { in: childIds } },
            _count: { _all: true },
          });
    const completedByChild = new Map<string, number>();
    for (const row of jobCounts) {
      if (row.status === "ACCEPTED_BY_QA") completedByChild.set(row.workOrderId, row._count._all);
    }

    const children: SharedSpkChildSummary[] = parent.children.map((child) => {
      const total = child.items.reduce((sum, item) => sum.plus(item.qty), new Prisma.Decimal(0));
      return {
        id: child.id,
        number: child.number,
        childSequence: child.childSequence!,
        status: child.status,
        scheduledStart: child.scheduledStart,
        scheduledEnd: child.scheduledEnd,
        technicians: child.assignments.map((row) => ({
          id: row.technician.id,
          name: row.technician.name,
          email: row.technician.email,
          roleOnJob: row.roleOnJob,
        })),
        items: child.items.map((item) => ({ ...item, qty: item.qty.toNumber() })),
        progress: progressOf(total.toNumber(), completedByChild.get(child.id) ?? 0),
        deliveryNote: child.deliveryNote,
        locked: !isChildRevisableStatus(child.status),
      };
    });

    return {
      id: parent.id,
      number: parent.number,
      createdAt: parent.createdAt,
      purchaseOrder: parent.purchaseOrder,
      customer: parent.customer,
      createdBy: parent.createdBy,
      status: deriveParentStatus(children.map((child) => child.status)),
      progress: aggregateParentProgress(children),
      children,
    };
  }

  /**
   * Revise the still-unstarted part of a shared job. Parent identity and
   * numbering are stable. Revision locking is per Child, never Parent-wide:
   *  - a Child that has left PLANNED/ASSIGNED (started, done, cancelled) is
   *    locked and may not be referenced at all;
   *  - unstarted Children may change technician, schedule and allocated
   *    (item, qty) batch, be removed (cancelled — their childSequence is never
   *    reused), or be added (next childSequence).
   *
   * Allocation changes are cancel-and-recreate (allocations are immutable), all
   * inside one transaction: every cancellation happens before any creation, so
   * quantity moving between unstarted Children is possible while the
   * row-locked SUM(ACTIVE) <= PurchaseOrderItem.qty check still guards every
   * creation.
   */
  async revise(
    companyId: string,
    userId: string | null,
    id: string,
    input: SharedSpkReviseInput,
  ): Promise<SharedSpkDetail> {
    await prisma.$transaction(async (tx) => {
      // Serialises concurrent revisions of the same shared job and the
      // MAX(childSequence)+1 allocation below.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "SpkParent" WHERE "id" = ${id} AND "companyId" = ${companyId} FOR UPDATE
      `;
      if (locked.length === 0) throw notFound();

      const parent = await tx.spkParent.findFirstOrThrow({
        where: { id, companyId },
        include: {
          children: {
            orderBy: { childSequence: "asc" },
            include: { items: true, deliveryNote: { select: { status: true } } },
          },
        },
      });
      const childById = new Map(parent.children.map((child) => [child.id, child]));

      const editedIds = input.children.flatMap((child) =>
        child.workOrderId ? [child.workOrderId] : [],
      );
      for (const workOrderId of [...editedIds, ...input.removeWorkOrderIds]) {
        const child = childById.get(workOrderId);
        if (!child) {
          throw new NotFoundException({
            message: `Work order ${workOrderId} is not a Child SPK of this shared job`,
            code: "SHARED_CHILD_NOT_FOUND",
            workOrderId,
          });
        }
        // Lock the Child row, then re-read its status: a concurrent start()
        // either committed first (we see IN_PROGRESS and refuse) or waits.
        await tx.workOrder.update({ where: { id: workOrderId }, data: {} });
        const current = await tx.workOrder.findUniqueOrThrow({
          where: { id: workOrderId },
          select: { status: true },
        });
        if (!isChildRevisableStatus(current.status)) {
          throw new ConflictException({
            message: `Child SPK ${child.number} has started (or is closed) and is locked for revision`,
            code: "SHARED_CHILD_LOCKED",
            workOrderId,
            status: current.status,
          });
        }
      }

      await assertAssignableTechnicians(
        tx,
        companyId,
        input.children.map((child) => child.technicianUserId),
      );

      const purchaseOrder = await tx.purchaseOrder.findFirstOrThrow({
        where: { id: parent.purchaseOrderId, companyId },
        include: { items: { where: { status: { not: "CANCELLED" } } } },
      });
      const activeItems = purchaseOrder.items.map((item) => ({ id: item.id, qty: item.qty }));
      const itemsById: ItemSource = new Map(
        purchaseOrder.items.map((item) => [
          item.id,
          { description: item.description, qty: item.qty },
        ]),
      );

      // Validate every requested batch before mutating anything.
      const requestedPlans = input.children.map((child) =>
        resolveAllocationPlan(activeItems, child.items, new Map()),
      );

      // One lock pass over every PO item this revision can touch.
      const touchedItemIds = [
        ...requestedPlans.flatMap((plan) => plan.map((row) => row.purchaseOrderItemId)),
        ...[...editedIds, ...input.removeWorkOrderIds].flatMap((workOrderId) =>
          childById.get(workOrderId)!.items.map((item) => item.purchaseOrderItemId),
        ),
      ];
      await lockPurchaseOrderItems(tx, touchedItemIds);

      // ── Pass 1: removals + release of every changed/removed allocation ────
      for (const workOrderId of input.removeWorkOrderIds) {
        const child = childById.get(workOrderId)!;
        if (child.deliveryNote?.status === "ISSUED") {
          throw new BadRequestException({
            message: "Cancel the delivery note (Surat Jalan) before removing this Child SPK",
            code: "DELIVERY_NOTE_MUST_BE_CANCELLED_FIRST",
            workOrderId,
          });
        }
        await snapshotWorkOrderHistory(tx, child, userId);
        await tx.workOrder.update({ where: { id: workOrderId }, data: { status: "CANCELLED" } });
        await cancelActiveAllocationsForWorkOrder(tx, workOrderId);
      }

      const additions: { workOrderId: string; plan: AllocationRequestItem[] }[] = [];
      for (const [index, entry] of input.children.entries()) {
        if (!entry.workOrderId) continue;
        const child = childById.get(entry.workOrderId)!;
        const plan = requestedPlans[index]!;
        const currentByItem = new Map(child.items.map((item) => [item.purchaseOrderItemId, item]));
        const requestedByItem = new Map(plan.map((row) => [row.purchaseOrderItemId, row.qty]));

        await snapshotWorkOrderHistory(tx, child, userId);

        // Unchanged (item, qty) rows are left alone so their allocation keeps
        // its identity; only changed or dropped rows are released.
        const releasedItems = child.items.filter((item) => {
          const requestedQty = requestedByItem.get(item.purchaseOrderItemId);
          return requestedQty === undefined || !item.qty.equals(requestedQty);
        });
        if (releasedItems.length > 0) {
          await tx.workOrderItem.deleteMany({
            where: { id: { in: releasedItems.map((item) => item.id) } },
          });
          const allocationIds = releasedItems
            .map((item) => item.allocationId)
            .filter((allocationId): allocationId is string => allocationId !== null);
          if (allocationIds.length > 0) {
            await tx.purchaseOrderItemAllocation.updateMany({
              where: { id: { in: allocationIds }, status: "ACTIVE" },
              data: { status: "CANCELLED" },
            });
          }
        }
        const releasedItemIds = new Set(releasedItems.map((item) => item.purchaseOrderItemId));
        const toAdd = plan.filter(
          (row) =>
            !currentByItem.has(row.purchaseOrderItemId) ||
            releasedItemIds.has(row.purchaseOrderItemId),
        );
        if (toAdd.length > 0) additions.push({ workOrderId: child.id, plan: toAdd });

        await tx.workOrder.update({
          where: { id: child.id },
          data: {
            ...(entry.scheduledStart !== undefined ? { scheduledStart: entry.scheduledStart } : {}),
            ...(entry.scheduledEnd !== undefined ? { scheduledEnd: entry.scheduledEnd } : {}),
          },
        });

        const currentTechnicians = await tx.workOrderAssignment.findMany({
          where: { workOrderId: child.id },
          select: { technicianUserId: true },
        });
        const sameTechnician =
          currentTechnicians.length === 1 &&
          currentTechnicians[0]!.technicianUserId === entry.technicianUserId;
        if (!sameTechnician) {
          await tx.workOrderAssignment.deleteMany({ where: { workOrderId: child.id } });
          await tx.workOrderAssignment.create({
            data: {
              companyId,
              workOrderId: child.id,
              technicianUserId: entry.technicianUserId,
              roleOnJob: "LEAD",
            },
          });
        }
      }

      // ── Pass 2: new Children (next childSequence — never reused) ──────────
      const template = parent.children[0];
      let nextSequence = parent.children.reduce(
        (max, child) => Math.max(max, child.childSequence ?? 0),
        0,
      );
      for (const [index, entry] of input.children.entries()) {
        if (entry.workOrderId) continue;
        nextSequence += 1;
        const workOrder = await tx.workOrder.create({
          data: {
            companyId,
            customerId: parent.customerId,
            quotationId: purchaseOrder.quotationId,
            purchaseOrderId: parent.purchaseOrderId,
            number: `${parent.number}-${nextSequence}`,
            serviceMode: "ON_SITE",
            addressText: template?.addressText,
            geoLat: template?.geoLat,
            geoLng: template?.geoLng,
            locationNotes: template?.locationNotes,
            scheduledStart: entry.scheduledStart,
            scheduledEnd: entry.scheduledEnd,
            status: "ASSIGNED",
            parentSpkId: parent.id,
            childSequence: nextSequence,
          },
        });
        await tx.workOrderAssignment.create({
          data: {
            companyId,
            workOrderId: workOrder.id,
            technicianUserId: entry.technicianUserId,
            roleOnJob: "LEAD",
          },
        });
        additions.push({ workOrderId: workOrder.id, plan: requestedPlans[index]! });
      }

      // ── Pass 3: every creation, after every cancellation ──────────────────
      for (const addition of additions) {
        await createAllocationsAndWorkOrderItems(tx, {
          companyId,
          workOrderId: addition.workOrderId,
          plan: addition.plan,
          itemsById,
        });
      }

      const remainingActive = await tx.workOrder.count({
        where: { parentSpkId: parent.id, status: { not: "CANCELLED" } },
      });
      if (remainingActive === 0) {
        throw new BadRequestException({
          message: "A shared job must keep at least one active Child SPK",
          code: "SHARED_SPK_NO_ACTIVE_CHILD",
        });
      }

      await recordAuditLog(
        {
          companyId,
          userId,
          action: "SHARED_SPK_REVISE",
          outcome: "SUCCESS",
          targetType: "SpkParent",
          targetId: parent.id,
          metadata: { number: parent.number },
        },
        tx,
      );
    }, SHARED_TX_OPTIONS);

    return this.findOne(companyId, id);
  }
}
