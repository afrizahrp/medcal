import { allocateRevisionNumber, Prisma } from "@medcal/db";

type WorkOrderWithPlainItems = Prisma.WorkOrderGetPayload<{ include: { items: true } }>;

/**
 * MOM #1 — Transaction Revision + Immutable History. Appends one
 * WorkOrderHistory header (+ N WorkOrderItemHistory rows) capturing the
 * WorkOrder exactly as it stands BEFORE a revision mutates it. Must run inside
 * the revising transaction. Shared by `WorkOrdersService.revise` and the shared
 * ON_SITE distribution revision so both write identical, append-only history.
 *
 * Takes a row lock on the WorkOrder first — see allocateRevisionNumber for why
 * the lock must precede the MAX(revisionNumber)+1 read.
 */
export async function snapshotWorkOrderHistory(
  tx: Prisma.TransactionClient,
  existing: WorkOrderWithPlainItems,
  userId: string | null,
): Promise<void> {
  await tx.workOrder.update({ where: { id: existing.id }, data: {} });

  const revisionNumber = await allocateRevisionNumber({
    tx,
    historyTable: "WorkOrderHistory",
    parentIdColumn: "workOrderId",
    parentId: existing.id,
  });

  await tx.workOrderHistory.create({
    data: {
      workOrderId: existing.id,
      revisionNumber,
      companyId: existing.companyId,
      quotationId: existing.quotationId,
      purchaseOrderId: existing.purchaseOrderId,
      customerId: existing.customerId,
      number: existing.number,
      serviceMode: existing.serviceMode,
      addressText: existing.addressText,
      geoLat: existing.geoLat,
      geoLng: existing.geoLng,
      locationNotes: existing.locationNotes,
      scheduledStart: existing.scheduledStart,
      scheduledEnd: existing.scheduledEnd,
      status: existing.status,
      equipmentConfirmedAt: existing.equipmentConfirmedAt,
      revisedByUserId: userId,
      items: {
        create: existing.items.map((item) => ({
          sourceItemId: item.id,
          purchaseOrderItemId: item.purchaseOrderItemId,
          description: item.description,
          qty: item.qty,
        })),
      },
    },
  });
}
