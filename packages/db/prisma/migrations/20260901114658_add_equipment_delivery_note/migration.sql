-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'EQUIPMENT_DELIVERY_NOTE';

-- CreateTable
CREATE TABLE "EquipmentDeliveryNote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "workOrderNumber" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerAddress" TEXT,
    "locationText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentDeliveryNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentDeliveryNoteItem" (
    "id" TEXT NOT NULL,
    "deliveryNoteId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "equipmentName" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquipmentDeliveryNoteItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentDeliveryNote_workOrderId_key" ON "EquipmentDeliveryNote"("workOrderId");

-- CreateIndex
CREATE INDEX "EquipmentDeliveryNote_companyId_idx" ON "EquipmentDeliveryNote"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentDeliveryNote_companyId_number_key" ON "EquipmentDeliveryNote"("companyId", "number");

-- CreateIndex
CREATE INDEX "EquipmentDeliveryNoteItem_deliveryNoteId_idx" ON "EquipmentDeliveryNoteItem"("deliveryNoteId");

-- AddForeignKey
ALTER TABLE "EquipmentDeliveryNote" ADD CONSTRAINT "EquipmentDeliveryNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentDeliveryNote" ADD CONSTRAINT "EquipmentDeliveryNote_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentDeliveryNoteItem" ADD CONSTRAINT "EquipmentDeliveryNoteItem_deliveryNoteId_fkey" FOREIGN KEY ("deliveryNoteId") REFERENCES "EquipmentDeliveryNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
