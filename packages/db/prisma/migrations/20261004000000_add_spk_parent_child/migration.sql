-- Shared ON_SITE SPK: non-executable Parent SPK + Child SPK (WorkOrder) link.
--
-- Purely additive: no existing WorkOrder is modified or backfilled. Every
-- pre-existing row keeps parentSpkId / childSequence = NULL and remains a
-- single/flat SPK (or WOL). SpkParent is intentionally not a WorkOrder: no
-- status, schedule, Start/Done or DLN.

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "childSequence" INTEGER,
ADD COLUMN     "parentSpkId" TEXT;

-- CreateTable
CREATE TABLE "SpkParent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpkParent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpkParent_purchaseOrderId_idx" ON "SpkParent"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "SpkParent_customerId_idx" ON "SpkParent"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "SpkParent_companyId_number_key" ON "SpkParent"("companyId", "number");

-- CreateIndex
CREATE INDEX "WorkOrder_parentSpkId_idx" ON "WorkOrder"("parentSpkId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_parentSpkId_childSequence_key" ON "WorkOrder"("parentSpkId", "childSequence");

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_parentSpkId_fkey" FOREIGN KEY ("parentSpkId") REFERENCES "SpkParent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpkParent" ADD CONSTRAINT "SpkParent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpkParent" ADD CONSTRAINT "SpkParent_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpkParent" ADD CONSTRAINT "SpkParent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpkParent" ADD CONSTRAINT "SpkParent_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Invariant (not expressible in Prisma): parentSpkId and childSequence are
-- either both NULL (single/flat SPK) or both set (Child SPK), and a Child
-- sequence is 1-based.
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_parent_child_pair_check"
  CHECK (("parentSpkId" IS NULL) = ("childSequence" IS NULL) AND ("childSequence" IS NULL OR "childSequence" >= 1));
