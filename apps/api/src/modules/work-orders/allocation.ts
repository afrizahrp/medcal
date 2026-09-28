import { BadRequestException, ConflictException } from "@nestjs/common";
import { Prisma, prisma } from "@medcal/db";

type AllocationQueryClient = Prisma.TransactionClient | typeof prisma;

/**
 * Allocation & Multi-WOL Architecture
 * (docs/audits/final-po-allocation-wol-spk-architecture-decision.md).
 *
 * `PurchaseOrderItemAllocation` is item-scoped: it represents an immutable
 * commitment of a specific quantity of exactly one PurchaseOrderItem to
 * exactly one WorkOrder, created atomically together with that WorkOrder's
 * corresponding WorkOrderItem (see `createAllocationsAndWorkOrderItems`).
 * Whole-item allocation is the degenerate case (qty == remaining qty) — there
 * is only one allocation mechanism, not a separate "whole item" path.
 */

export interface AllocationRequestItem {
  purchaseOrderItemId: string;
  qty: number;
}

/**
 * `PurchaseOrderItem.qty - SUM(ACTIVE allocation qty)` per item — the derived
 * "remaining, unallocated" quantity (final architecture decision §9/§16).
 * Not persisted anywhere; recomputed on demand. Items with no allocations at
 * all are not returned by the underlying query, so callers should default to
 * the item's own `qty` for any id missing from the result.
 */
export async function computeRemainingQtyByItemId(
  client: AllocationQueryClient,
  itemsById: Map<string, { qty: Prisma.Decimal }>,
): Promise<Map<string, Prisma.Decimal>> {
  const itemIds = [...itemsById.keys()];
  const grouped = await client.purchaseOrderItemAllocation.groupBy({
    by: ["purchaseOrderItemId"],
    where: { purchaseOrderItemId: { in: itemIds }, status: "ACTIVE" },
    _sum: { qty: true },
  });

  const allocatedById = new Map(
    grouped.map((row) => [row.purchaseOrderItemId, row._sum.qty ?? new Prisma.Decimal(0)]),
  );
  const remainingById = new Map<string, Prisma.Decimal>();
  for (const [id, item] of itemsById) {
    const allocated = allocatedById.get(id) ?? new Prisma.Decimal(0);
    remainingById.set(id, item.qty.minus(allocated));
  }
  return remainingById;
}

const OVER_ALLOCATION_CODE = "OVER_ALLOCATION";

/**
 * Resolves the final (purchaseOrderItemId, qty) plan for a WorkOrder being
 * created:
 *  - When the caller explicitly requests items (the allocation-aware path),
 *    those exact (item, qty) pairs are used, validated against the PO's own
 *    active items.
 *  - When no items are requested (back-compat default — every caller before
 *    this architecture shipped, and every caller that doesn't yet need
 *    partial allocation), every active PurchaseOrderItem with a non-zero
 *    REMAINING quantity is claimed at exactly that remaining amount (not
 *    necessarily its full PurchaseOrderItem.qty — an item that already has an
 *    active allocation elsewhere only offers its unallocated remainder; an
 *    item with zero remaining is simply skipped, not an error). This
 *    reproduces today's exact "claim everything" behavior for a PO that has
 *    never been partially allocated, and extends naturally to "claim
 *    whatever's left" for a PO that already has sibling WorkOrders.
 */
export function resolveAllocationPlan(
  activePurchaseOrderItems: { id: string; qty: Prisma.Decimal }[],
  requestedItems: AllocationRequestItem[] | undefined,
  remainingByItemId: Map<string, Prisma.Decimal>,
): AllocationRequestItem[] {
  if (!requestedItems || requestedItems.length === 0) {
    return activePurchaseOrderItems
      .map((item) => ({
        purchaseOrderItemId: item.id,
        remaining: remainingByItemId.get(item.id) ?? item.qty,
      }))
      .filter((row) => row.remaining.greaterThan(0))
      .map((row) => ({
        purchaseOrderItemId: row.purchaseOrderItemId,
        qty: row.remaining.toNumber(),
      }));
  }

  const activeIds = new Set(activePurchaseOrderItems.map((item) => item.id));
  const seen = new Set<string>();
  for (const row of requestedItems) {
    if (!activeIds.has(row.purchaseOrderItemId)) {
      throw new BadRequestException({
        message: `Purchase order item ${row.purchaseOrderItemId} is not an active item on this purchase order`,
        code: "PURCHASE_ORDER_ITEM_NOT_ACTIVE",
        purchaseOrderItemId: row.purchaseOrderItemId,
      });
    }
    if (seen.has(row.purchaseOrderItemId)) {
      throw new BadRequestException({
        message: `Purchase order item ${row.purchaseOrderItemId} was requested more than once in the same allocation plan`,
        code: "DUPLICATE_ALLOCATION_ITEM",
        purchaseOrderItemId: row.purchaseOrderItemId,
      });
    }
    seen.add(row.purchaseOrderItemId);
    if (!Number.isInteger(row.qty) || row.qty <= 0) {
      throw new BadRequestException({
        message: `Allocation qty for purchase order item ${row.purchaseOrderItemId} must be a positive whole number`,
        code: "INVALID_ALLOCATION_QTY",
        purchaseOrderItemId: row.purchaseOrderItemId,
      });
    }
  }
  return requestedItems;
}

/**
 * Creates one PurchaseOrderItemAllocation + its paired WorkOrderItem per plan
 * row, inside the caller's transaction. This is the ONLY place that may
 * insert a PurchaseOrderItemAllocation — it is never created independently of
 * its WorkOrderItem (see the model's own doc comment: there is no persisted
 * DRAFT state).
 *
 * Concurrency: for each PurchaseOrderItem touched, takes a row lock
 * (`SELECT ... FOR UPDATE`) before summing existing ACTIVE allocations and
 * validating the new request against the item's own `qty`. Rows are locked
 * in a deterministic order (sorted by id) to avoid lock-order deadlocks when
 * two concurrent WorkOrder creations both touch overlapping sets of items.
 * Locking is scoped per PurchaseOrderItem — allocations against different
 * items never contend with each other.
 */
export async function createAllocationsAndWorkOrderItems(
  tx: Prisma.TransactionClient,
  params: {
    companyId: string;
    workOrderId: string;
    plan: AllocationRequestItem[];
    /** description + full qty per item, for WorkOrderItem.description and the remaining-qty check */
    itemsById: Map<string, { description: string; qty: Prisma.Decimal }>;
  },
): Promise<void> {
  const { companyId, workOrderId, plan, itemsById } = params;
  const sortedPlan = [...plan].sort((a, b) =>
    a.purchaseOrderItemId.localeCompare(b.purchaseOrderItemId),
  );

  for (const row of sortedPlan) {
    const source = itemsById.get(row.purchaseOrderItemId);
    if (!source) {
      // Defensive — resolveAllocationPlan already validated membership.
      throw new BadRequestException({
        message: `Purchase order item ${row.purchaseOrderItemId} not found on this purchase order`,
        code: "PURCHASE_ORDER_ITEM_NOT_ACTIVE",
      });
    }

    // Row lock: serializes concurrent allocation attempts against THIS item
    // only. Allocations against other items proceed fully in parallel.
    await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "PurchaseOrderItem" WHERE "id" = ${row.purchaseOrderItemId} FOR UPDATE
    `;

    const activeSum = await tx.purchaseOrderItemAllocation.aggregate({
      where: { purchaseOrderItemId: row.purchaseOrderItemId, status: "ACTIVE" },
      _sum: { qty: true },
    });
    const existingActiveQty = activeSum._sum.qty ?? new Prisma.Decimal(0);
    const itemQty = source.qty;
    const requestedQty = new Prisma.Decimal(row.qty);
    const remainingQty = itemQty.minus(existingActiveQty);

    if (requestedQty.greaterThan(remainingQty)) {
      throw new ConflictException({
        message:
          `Requested allocation of ${requestedQty.toString()} for purchase order item ` +
          `${row.purchaseOrderItemId} exceeds its remaining quantity (${remainingQty.toString()} of ${itemQty.toString()}).`,
        code: OVER_ALLOCATION_CODE,
        purchaseOrderItemId: row.purchaseOrderItemId,
        requestedQty: requestedQty.toString(),
        remainingQty: remainingQty.toString(),
        itemQty: itemQty.toString(),
      });
    }

    const allocation = await tx.purchaseOrderItemAllocation.create({
      data: {
        companyId,
        purchaseOrderItemId: row.purchaseOrderItemId,
        workOrderId,
        qty: requestedQty,
        status: "ACTIVE",
      },
    });

    await tx.workOrderItem.create({
      data: {
        companyId,
        workOrderId,
        purchaseOrderItemId: row.purchaseOrderItemId,
        allocationId: allocation.id,
        description: source.description,
        qty: requestedQty,
      },
    });
  }
}

/**
 * Cancels every ACTIVE allocation backing a WorkOrder's WorkOrderItems,
 * releasing their quantity back to "remaining". Called as part of
 * `WorkOrder.cancel()` — a cancelled WorkOrder must never continue to hold
 * quantity as consumed. This is unconditional on job/fan-out state: it is a
 * side effect of WorkOrder-level cancellation (already governed by its own
 * existing transition rules and consequences for in-flight jobs), not a
 * direct Allocation-level cancellation (which remains pre-fan-out-only —
 * see `assertAllocationsCancellableStandalone` for that separate check).
 */
export async function cancelActiveAllocationsForWorkOrder(
  tx: Prisma.TransactionClient,
  workOrderId: string,
): Promise<void> {
  await tx.purchaseOrderItemAllocation.updateMany({
    where: { workOrderId, status: "ACTIVE" },
    data: { status: "CANCELLED" },
  });
}
