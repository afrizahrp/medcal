-- CreateTable
CREATE TABLE "PriceListItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "deviceTypeId" TEXT NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "effectiveFrom" DATE NOT NULL,
    "effectiveUntil" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceListItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceListItem_companyId_deviceTypeId_effectiveFrom_idx" ON "PriceListItem"("companyId", "deviceTypeId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "PriceListItem_companyId_isActive_idx" ON "PriceListItem"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PriceListItem_companyId_deviceTypeId_effectiveFrom_key" ON "PriceListItem"("companyId", "deviceTypeId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "PriceListItem" ADD CONSTRAINT "PriceListItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceListItem" ADD CONSTRAINT "PriceListItem_deviceTypeId_fkey" FOREIGN KEY ("deviceTypeId") REFERENCES "DeviceType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "QuotationItem" ADD COLUMN "pricePending" BOOLEAN NOT NULL DEFAULT false;
