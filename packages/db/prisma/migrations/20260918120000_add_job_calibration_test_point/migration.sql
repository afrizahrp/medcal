-- JobCalibrationTestPoint: frozen allowlist of catalog CalibrationTestPoint
-- rows copied when a CalibrationJob starts (or backfilled for jobs that already
-- had startedAt). MeasurementResult.calibrationTestPointId is unchanged.
--
-- Backfill copies the CURRENT live catalog for started jobs and MUST run before
-- named BSM environment test points are seeded. Idempotent via unique
-- (calibrationJobId, sourceCalibrationTestPointId) and snapshottedAt IS NULL.

-- AlterTable
ALTER TABLE "CalibrationJob" ADD COLUMN "measurementTestPointsSnapshottedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "JobCalibrationTestPoint" (
    "id" TEXT NOT NULL,
    "calibrationJobId" TEXT NOT NULL,
    "deviceCalibrationParameterId" TEXT NOT NULL,
    "sourceCalibrationTestPointId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "settingLabel" TEXT NOT NULL,
    "settingValue" DECIMAL(18,4),
    "toleranceMin" DECIMAL(18,4),
    "toleranceMax" DECIMAL(18,4),
    "toleranceNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobCalibrationTestPoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobCalibrationTestPoint_calibrationJobId_idx" ON "JobCalibrationTestPoint"("calibrationJobId");

-- CreateIndex
CREATE INDEX "JobCalibrationTestPoint_deviceCalibrationParameterId_idx" ON "JobCalibrationTestPoint"("deviceCalibrationParameterId");

-- CreateIndex
CREATE INDEX "JobCalibrationTestPoint_sourceCalibrationTestPointId_idx" ON "JobCalibrationTestPoint"("sourceCalibrationTestPointId");

-- CreateIndex
CREATE UNIQUE INDEX "JobCalibrationTestPoint_calibrationJobId_sourceCalibra_key" ON "JobCalibrationTestPoint"("calibrationJobId", "sourceCalibrationTestPointId");

-- AddForeignKey
ALTER TABLE "JobCalibrationTestPoint" ADD CONSTRAINT "JobCalibrationTestPoint_calibrationJobId_fkey" FOREIGN KEY ("calibrationJobId") REFERENCES "CalibrationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCalibrationTestPoint" ADD CONSTRAINT "JobCalibrationTestPoint_deviceCalibrationParameterId_fkey" FOREIGN KEY ("deviceCalibrationParameterId") REFERENCES "DeviceCalibrationParameter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCalibrationTestPoint" ADD CONSTRAINT "JobCalibrationTestPoint_sourceCalibrationTestPointId_fkey" FOREIGN KEY ("sourceCalibrationTestPointId") REFERENCES "CalibrationTestPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Snapshot backfill for jobs that already started. Does NOT touch MeasurementResult.
INSERT INTO "JobCalibrationTestPoint" (
    "id",
    "calibrationJobId",
    "deviceCalibrationParameterId",
    "sourceCalibrationTestPointId",
    "sequence",
    "settingLabel",
    "settingValue",
    "toleranceMin",
    "toleranceMax",
    "toleranceNote",
    "createdAt",
    "updatedAt"
)
SELECT
    'jtp_' || replace(gen_random_uuid()::text, '-', ''),
    j.id,
    tp."deviceCalibrationParameterId",
    tp.id,
    tp.sequence,
    tp."settingLabel",
    tp."settingValue",
    tp."toleranceMin",
    tp."toleranceMax",
    tp."toleranceNote",
    NOW(),
    NOW()
FROM "CalibrationJob" j
LEFT JOIN "CalibrationRequestItem" cri ON cri.id = j."calibrationRequestItemId"
LEFT JOIN "PurchaseOrderItem" poi ON poi.id = j."purchaseOrderItemId"
LEFT JOIN "QuotationItem" qi ON qi.id = poi."quotationItemId"
LEFT JOIN "CalibrationRequestItem" cri2 ON cri2.id = qi."requestItemId"
JOIN "DeviceCalibrationParameter" p
  ON p."deviceTypeId" = COALESCE(cri."deviceTypeId", cri2."deviceTypeId")
JOIN "CalibrationTestPoint" tp
  ON tp."deviceCalibrationParameterId" = p.id
 AND tp."isActive" = true
WHERE j."startedAt" IS NOT NULL
  AND j."measurementTestPointsSnapshottedAt" IS NULL
ON CONFLICT ("calibrationJobId", "sourceCalibrationTestPointId") DO NOTHING;

UPDATE "CalibrationJob"
SET "measurementTestPointsSnapshottedAt" = "startedAt"
WHERE "startedAt" IS NOT NULL
  AND "measurementTestPointsSnapshottedAt" IS NULL;
