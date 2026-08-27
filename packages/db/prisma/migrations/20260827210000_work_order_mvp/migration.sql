-- AlterEnum: add MVP terminal-complete status. Legacy TECHNICALLY_DONE / CLOSED are kept.
ALTER TYPE "WorkOrderStatus" ADD VALUE 'DONE';

-- WorkOrder is created only from a PurchaseOrder; purchaseOrderId becomes required.
-- Safe: no WorkOrder rows exist in current environments (new domain, no API yet).
ALTER TABLE "WorkOrder" DROP CONSTRAINT "WorkOrder_purchaseOrderId_fkey";

ALTER TABLE "WorkOrder" ALTER COLUMN "purchaseOrderId" SET NOT NULL;

ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "WorkOrderItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "purchaseOrderItemId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(18,4) NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkOrderItem_workOrderId_idx" ON "WorkOrderItem"("workOrderId");

-- CreateIndex
CREATE INDEX "WorkOrderItem_purchaseOrderItemId_idx" ON "WorkOrderItem"("purchaseOrderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrderItem_workOrderId_purchaseOrderItemId_key" ON "WorkOrderItem"("workOrderId", "purchaseOrderItemId");

-- AddForeignKey
ALTER TABLE "WorkOrderItem" ADD CONSTRAINT "WorkOrderItem_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderItem" ADD CONSTRAINT "WorkOrderItem_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "PurchaseOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Cardinality: 1 PurchaseOrder → 1 active WorkOrder.
-- CANCELLED rows are excluded so a replacement WorkOrder can be created after cancellation.
-- Prisma cannot express partial unique indexes; application guard remains the primary check.
CREATE UNIQUE INDEX "WorkOrder_purchaseOrderId_active_key" ON "WorkOrder"("purchaseOrderId") WHERE "status" <> 'CANCELLED';
