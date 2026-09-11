-- Kontrol Alat (F.MU.08) Phase 1 schema:
-- - WorkOrder customer request review fields (shared per WOL)
-- - WorkOrderItemAccessory (manual initial UUT accessory list)
-- - KontrolAlat 1:1 CalibrationJob (SEND_TO_LAB only; application-enforced)
-- - KontrolAlatAccessory + KontrolAlatSignature
-- Backfill: empty KontrolAlat rows for existing SEND_TO_LAB CalibrationJobs.
-- Design: kontrol-alat-implementation-planning-report.md + FINAL constraints 2026-09-11.

-- CreateEnum
CREATE TYPE "KontrolAlatSignerKind" AS ENUM ('ADMINISTRATION', 'TECHNICAL_OFFICER');

-- AlterTable: WorkOrder customer request review (F.MU.08 II)
ALTER TABLE "WorkOrder"
ADD COLUMN "requestReviewMethodOk" BOOLEAN,
ADD COLUMN "requestReviewEquipmentOk" BOOLEAN,
ADD COLUMN "requestReviewPersonnelOk" BOOLEAN,
ADD COLUMN "requestReviewConfirmAgree" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "requestReviewConfirmEmail" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "requestReviewConfirmLetter" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "requestReviewConfirmOther" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "requestReviewConfirmOtherText" TEXT,
ADD COLUMN "requestReviewCompletedAt" TIMESTAMP(3),
ADD COLUMN "requestReviewCompletedByUserId" TEXT;

-- CreateTable
CREATE TABLE "WorkOrderItemAccessory" (
    "id" TEXT NOT NULL,
    "workOrderItemId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderItemAccessory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KontrolAlat" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "calibrationJobId" TEXT NOT NULL,
    "workExecuted" BOOLEAN,
    "notExecutedReason" TEXT,
    "capacity" TEXT,
    "visualPowerCable" BOOLEAN,
    "visualDisplay" BOOLEAN,
    "visualButtons" BOOLEAN,
    "functionInitialOk" BOOLEAN,
    "functionFinalOk" BOOLEAN,
    "certificateNumber" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KontrolAlat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KontrolAlatAccessory" (
    "id" TEXT NOT NULL,
    "kontrolAlatId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "present" BOOLEAN,
    "sourceWorkOrderItemAccessoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KontrolAlatAccessory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KontrolAlatSignature" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kontrolAlatId" TEXT NOT NULL,
    "signerKind" "KontrolAlatSignerKind" NOT NULL,
    "signerUserId" TEXT,
    "signerName" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KontrolAlatSignature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkOrder_requestReviewCompletedByUserId_idx" ON "WorkOrder"("requestReviewCompletedByUserId");

-- CreateIndex
CREATE INDEX "WorkOrderItemAccessory_workOrderItemId_idx" ON "WorkOrderItemAccessory"("workOrderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "KontrolAlat_calibrationJobId_key" ON "KontrolAlat"("calibrationJobId");

-- CreateIndex
CREATE INDEX "KontrolAlat_companyId_idx" ON "KontrolAlat"("companyId");

-- CreateIndex
CREATE INDEX "KontrolAlat_createdByUserId_idx" ON "KontrolAlat"("createdByUserId");

-- CreateIndex
CREATE INDEX "KontrolAlatAccessory_kontrolAlatId_idx" ON "KontrolAlatAccessory"("kontrolAlatId");

-- CreateIndex
CREATE INDEX "KontrolAlatAccessory_sourceWorkOrderItemAccessoryId_idx" ON "KontrolAlatAccessory"("sourceWorkOrderItemAccessoryId");

-- CreateIndex
CREATE INDEX "KontrolAlatSignature_companyId_idx" ON "KontrolAlatSignature"("companyId");

-- CreateIndex
CREATE INDEX "KontrolAlatSignature_signerUserId_idx" ON "KontrolAlatSignature"("signerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "KontrolAlatSignature_kontrolAlatId_signerKind_key" ON "KontrolAlatSignature"("kontrolAlatId", "signerKind");

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_requestReviewCompletedByUserId_fkey" FOREIGN KEY ("requestReviewCompletedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderItemAccessory" ADD CONSTRAINT "WorkOrderItemAccessory_workOrderItemId_fkey" FOREIGN KEY ("workOrderItemId") REFERENCES "WorkOrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KontrolAlat" ADD CONSTRAINT "KontrolAlat_calibrationJobId_fkey" FOREIGN KEY ("calibrationJobId") REFERENCES "CalibrationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KontrolAlat" ADD CONSTRAINT "KontrolAlat_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KontrolAlatAccessory" ADD CONSTRAINT "KontrolAlatAccessory_kontrolAlatId_fkey" FOREIGN KEY ("kontrolAlatId") REFERENCES "KontrolAlat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KontrolAlatSignature" ADD CONSTRAINT "KontrolAlatSignature_kontrolAlatId_fkey" FOREIGN KEY ("kontrolAlatId") REFERENCES "KontrolAlat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KontrolAlatSignature" ADD CONSTRAINT "KontrolAlatSignature_signerUserId_fkey" FOREIGN KEY ("signerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: one empty KontrolAlat per existing SEND_TO_LAB CalibrationJob.
-- ON_SITE / SPK jobs are intentionally excluded. Accessories are empty because
-- historical WorkOrderItemAccessory rows do not exist (new table). Idempotent
-- via NOT EXISTS. Deterministic ids (ka_ + job id) keep re-runs safe.
INSERT INTO "KontrolAlat" (
    "id",
    "companyId",
    "calibrationJobId",
    "createdAt",
    "updatedAt"
)
SELECT
    'ka_' || cj."id",
    cj."companyId",
    cj."id",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "CalibrationJob" AS cj
INNER JOIN "WorkOrder" AS wo ON wo."id" = cj."workOrderId"
WHERE wo."serviceMode" = 'SEND_TO_LAB'
  AND NOT EXISTS (
    SELECT 1
    FROM "KontrolAlat" AS ka
    WHERE ka."calibrationJobId" = cj."id"
  );
