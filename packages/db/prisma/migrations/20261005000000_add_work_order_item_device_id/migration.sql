-- deviceId lineage: Requisition item -> QuotationItem -> PurchaseOrderItem ->
-- WorkOrderItem -> CalibrationJob. WorkOrderItem (and its history snapshot)
-- previously had no deviceId, so the value was dropped at the WorkOrder stage.
--
-- Purely additive and nullable. No existing row is backfilled: pre-existing
-- WorkOrderItems keep deviceId = NULL.

-- AlterTable
ALTER TABLE "WorkOrderItem" ADD COLUMN     "deviceId" TEXT;

-- AlterTable
ALTER TABLE "WorkOrderItemHistory" ADD COLUMN     "deviceId" TEXT;

-- CreateIndex
CREATE INDEX "WorkOrderItem_deviceId_idx" ON "WorkOrderItem"("deviceId");

-- AddForeignKey
ALTER TABLE "WorkOrderItem" ADD CONSTRAINT "WorkOrderItem_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
