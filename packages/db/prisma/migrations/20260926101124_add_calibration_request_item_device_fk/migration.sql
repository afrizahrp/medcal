/*
  Business context: CalibrationRequestItem.deviceId previously held free-text
  customer-declared Serial No. It is now a real (but still NULLABLE) FK to
  Device.id — Device identity is not necessarily known yet at Requisition
  stage, so NULL remains a valid, common business state, never an error.

  Written to be safe to apply regardless of whether an earlier, since-
  corrected draft of this same change (which briefly made the column
  required) already ran against this database: every statement below is
  idempotent, so this migration converges any starting state to the same
  final nullable-FK shape without erroring on already-existing objects.

  Before adding the FK constraint, this migration makes one best-effort
  attempt to resolve any existing free-text value against an existing Device
  (scoped to that item's own request customer + company, exact Serial No
  match). Rows that resolve unambiguously are updated in place. Rows that are
  already NULL, unmatched, or ambiguous (more than one Device shares that
  Serial No for that customer) are set to NULL — "identity not yet known" is
  exactly what an unresolvable legacy value means now, so this is not
  guessing, fabricating a Device, or discarding data; the row itself is
  untouched. See
  docs/claude/plans/Calibration-management/device-id-inheritance-comprehensive-audit.md
  for the full audit this decision is based on.
*/
DO $$
BEGIN
  -- Best-effort resolution: replace an old free-text Serial No with the
  -- matching Device.id, only when exactly one Device matches for that
  -- item's own request customer + company.
  UPDATE "CalibrationRequestItem" cri
  SET "deviceId" = (
    SELECT d.id
    FROM "Device" d
    JOIN "CalibrationRequest" cr ON cr.id = cri."requestId"
    WHERE d."companyId" = cr."companyId"
      AND d."customerId" = cr."customerId"
      AND d."serialNumber" = cri."deviceId"
  )
  WHERE cri."deviceId" IS NOT NULL
    AND (
      SELECT COUNT(*)
      FROM "Device" d
      JOIN "CalibrationRequest" cr ON cr.id = cri."requestId"
      WHERE d."companyId" = cr."companyId"
        AND d."customerId" = cr."customerId"
        AND d."serialNumber" = cri."deviceId"
    ) = 1;

  -- Anything left that isn't an actual Device.id (unmatched / ambiguous
  -- Serial No left untouched above) cannot be safely resolved automatically.
  -- NULL is a valid state for this column, so mark identity as not-yet-known
  -- instead of leaving stale free text behind or guessing a Device.
  UPDATE "CalibrationRequestItem" cri
  SET "deviceId" = NULL
  WHERE cri."deviceId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "Device" d WHERE d.id = cri."deviceId");
END $$;

-- Converge to nullable regardless of starting state (a corrected draft of
-- this migration briefly made it required on some databases).
ALTER TABLE "CalibrationRequestItem" ALTER COLUMN "deviceId" DROP NOT NULL;

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "CalibrationRequestItem_deviceId_idx" ON "CalibrationRequestItem"("deviceId");

-- AddForeignKey (idempotent — Postgres has no ADD CONSTRAINT IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CalibrationRequestItem_deviceId_fkey'
  ) THEN
    ALTER TABLE "CalibrationRequestItem"
      ADD CONSTRAINT "CalibrationRequestItem_deviceId_fkey"
      FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
