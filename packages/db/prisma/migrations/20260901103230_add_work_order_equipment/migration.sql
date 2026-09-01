-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "equipmentConfirmedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "WorkOrderEquipment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "equipmentTypeId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrderEquipment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkOrderEquipment_workOrderId_idx" ON "WorkOrderEquipment"("workOrderId");

-- CreateIndex
CREATE INDEX "WorkOrderEquipment_equipmentId_idx" ON "WorkOrderEquipment"("equipmentId");

-- CreateIndex
CREATE INDEX "WorkOrderEquipment_companyId_idx" ON "WorkOrderEquipment"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrderEquipment_workOrderId_equipmentId_key" ON "WorkOrderEquipment"("workOrderId", "equipmentId");

-- AddForeignKey
ALTER TABLE "WorkOrderEquipment" ADD CONSTRAINT "WorkOrderEquipment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderEquipment" ADD CONSTRAINT "WorkOrderEquipment_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderEquipment" ADD CONSTRAINT "WorkOrderEquipment_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
