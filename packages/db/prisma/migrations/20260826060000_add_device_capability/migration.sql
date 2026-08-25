-- CreateTable
CREATE TABLE "DeviceCapability" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceCapabilityItem" (
    "id" TEXT NOT NULL,
    "capabilityId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceCapabilityItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceCapability_code_key" ON "DeviceCapability"("code");

-- CreateIndex
CREATE INDEX "DeviceCapabilityItem_capabilityId_idx" ON "DeviceCapabilityItem"("capabilityId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceCapabilityItem_capabilityId_code_key" ON "DeviceCapabilityItem"("capabilityId", "code");

-- AddForeignKey
ALTER TABLE "DeviceCapabilityItem" ADD CONSTRAINT "DeviceCapabilityItem_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "DeviceCapability"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
