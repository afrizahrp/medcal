import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@medcal/db";

const sourcePurchaseOrderInclude = {
  // MOM #1 — Revision Scope Design: only active PO scope may ever propagate
  // downstream.
  items: { where: { status: { not: "CANCELLED" as const } }, orderBy: { createdAt: "asc" as const } },
  quotation: {
    include: { request: { select: { id: true, serviceMode: true } } },
  },
} satisfies Prisma.PurchaseOrderInclude;

export type WorkOrderSourcePurchaseOrder = Prisma.PurchaseOrderGetPayload<{
  include: typeof sourcePurchaseOrderInclude;
}>;

/**
 * Loads and validates the PurchaseOrder a WorkOrder (single or shared Child) is
 * created from: it must exist, be APPROVED, have active items, and carry its
 * source CalibrationRequest (which supplies the serviceMode). Shared by
 * `WorkOrdersService.create` and `SharedSpkService.create` so both paths apply
 * identical source rules.
 */
export async function loadWorkOrderSourcePurchaseOrder(
  tx: Prisma.TransactionClient,
  companyId: string,
  purchaseOrderId: string,
): Promise<{
  purchaseOrder: WorkOrderSourcePurchaseOrder;
  request: NonNullable<WorkOrderSourcePurchaseOrder["quotation"]["request"]>;
}> {
  const purchaseOrder = await tx.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, companyId },
    include: sourcePurchaseOrderInclude,
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

  return { purchaseOrder, request };
}
