-- CreateTable
CREATE TABLE "EquipmentType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceTypeEquipmentRequirement" (
    "id" TEXT NOT NULL,
    "deviceTypeId" TEXT NOT NULL,
    "equipmentTypeId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceTypeEquipmentRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentType_code_key" ON "EquipmentType"("code");

-- CreateIndex
CREATE INDEX "EquipmentType_isActive_idx" ON "EquipmentType"("isActive");

-- CreateIndex
CREATE INDEX "DeviceTypeEquipmentRequirement_deviceTypeId_idx" ON "DeviceTypeEquipmentRequirement"("deviceTypeId");

-- CreateIndex
CREATE INDEX "DeviceTypeEquipmentRequirement_equipmentTypeId_idx" ON "DeviceTypeEquipmentRequirement"("equipmentTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceTypeEquipmentRequirement_deviceTypeId_equipmentTypeId_key" ON "DeviceTypeEquipmentRequirement"("deviceTypeId", "equipmentTypeId");

-- AddForeignKey
ALTER TABLE "DeviceTypeEquipmentRequirement" ADD CONSTRAINT "DeviceTypeEquipmentRequirement_deviceTypeId_fkey" FOREIGN KEY ("deviceTypeId") REFERENCES "DeviceType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceTypeEquipmentRequirement" ADD CONSTRAINT "DeviceTypeEquipmentRequirement_equipmentTypeId_fkey" FOREIGN KEY ("equipmentTypeId") REFERENCES "EquipmentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
