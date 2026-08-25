-- CreateEnum
CREATE TYPE "UomCategory" AS ENUM ('PRESSURE', 'TEMPERATURE', 'RATE', 'FLOW', 'PERCENTAGE', 'LENGTH', 'MASS', 'VOLUME', 'TIME', 'ELECTRICAL', 'OTHER');

-- CreateTable
CREATE TABLE "Uom" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "category" "UomCategory" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Uom_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Uom_code_key" ON "Uom"("code");

-- CreateIndex
CREATE INDEX "Uom_category_idx" ON "Uom"("category");

-- CreateIndex
CREATE INDEX "Uom_isActive_idx" ON "Uom"("isActive");
