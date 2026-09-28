-- Allocation & Multi-WOL Architecture
-- See docs/audits/final-po-allocation-wol-spk-architecture-decision.md
--
-- Purely additive: no existing row (PurchaseOrder, PurchaseOrderItem,
-- WorkOrder, WorkOrderItem, CalibrationJob) is modified or backfilled.
-- allocationId is added nullable and left NULL on every pre-existing
-- WorkOrderItem row (see the model's own doc comment for why that is
-- correct, not a gap).

-- CreateEnum
CREATE TYPE "AllocationStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- AlterTable
ALTER TABLE "WorkOrderItem" ADD COLUMN     "allocationId" TEXT;

-- CreateTable
CREATE TABLE "PurchaseOrderItemAllocation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "purchaseOrderItemId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "qty" DECIMAL(18,4) NOT NULL,
    "status" "AllocationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrderItemAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseOrderItemAllocation_purchaseOrderItemId_status_idx" ON "PurchaseOrderItemAllocation"("purchaseOrderItemId", "status");

-- CreateIndex
CREATE INDEX "PurchaseOrderItemAllocation_workOrderId_idx" ON "PurchaseOrderItemAllocation"("workOrderId");

-- CreateIndex
CREATE INDEX "PurchaseOrderItemAllocation_companyId_idx" ON "PurchaseOrderItemAllocation"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrderItem_allocationId_key" ON "WorkOrderItem"("allocationId");

-- AddForeignKey
ALTER TABLE "WorkOrderItem" ADD CONSTRAINT "WorkOrderItem_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "PurchaseOrderItemAllocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItemAllocation" ADD CONSTRAINT "PurchaseOrderItemAllocation_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "PurchaseOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- CASCADE matches WorkOrderItem.workOrderId's own onDelete: Cascade — an
-- Allocation is owned by its WorkOrder exactly as tightly as its paired
-- WorkOrderItem (both created atomically, same lifecycle).
ALTER TABLE "PurchaseOrderItemAllocation" ADD CONSTRAINT "PurchaseOrderItemAllocation_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Remove the 1-active-WorkOrder-per-PO constraint. Exclusivity is now
-- enforced at the PurchaseOrderItemAllocation layer (SUM(ACTIVE qty) <=
-- PurchaseOrderItem.qty, row-locked per item at allocation-creation time —
-- see AllocationService), not at the PurchaseOrder level. A PurchaseOrder
-- may now have any number of simultaneously active WorkOrders.
DROP INDEX IF EXISTS "WorkOrder_purchaseOrderId_active_key";
