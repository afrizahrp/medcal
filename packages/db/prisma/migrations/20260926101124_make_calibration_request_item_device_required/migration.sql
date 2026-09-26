/*
  Warnings:

  - Made the column `deviceId` on table `CalibrationRequestItem` required. This step will fail if there are existing NULL/unresolvable values in that column.

  Business context: CalibrationRequestItem.deviceId previously held free-text
  customer-declared Serial No. It is now a real, required FK to Device.id.
  Before enforcing NOT NULL + the FK, this migration makes one best-effort
  attempt to resolve any existing free-text value against an existing Device
  (scoped to that item's own request customer + company, exact Serial No
  match). Rows that resolve unambiguously are updated in place. Rows that are
  NULL, unmatched, or ambiguous (more than one Device shares that Serial No
  for that customer) are left untouched, and the migration aborts with a
  count instead of silently nulling, fabricating a Device, or blindly casting
  the free-text value into the FK column. See
  docs/claude/plans/Calibration-management/device-id-inheritance-comprehensive-audit.md
  for the full audit this decision is based on.
*/
DO $$
DECLARE
  unresolved_count integer;
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

  -- Anything still NULL, or not an actual Device.id (unmatched / ambiguous
  -- Serial No left untouched above), cannot be safely migrated automatically.
  SELECT COUNT(*) INTO unresolved_count
  FROM "CalibrationRequestItem" cri
  WHERE cri."deviceId" IS NULL
     OR NOT EXISTS (SELECT 1 FROM "Device" d WHERE d.id = cri."deviceId");

  IF unresolved_count > 0 THEN
    RAISE EXCEPTION 'Migration blocked: % CalibrationRequestItem row(s) could not be resolved to an existing Device (NULL, unmatched, or ambiguous Serial No). Resolve these manually (e.g. create the missing Device master records, or disambiguate duplicate Serial No values) before re-running this migration.', unresolved_count;
  END IF;
END $$;

-- AlterTable
ALTER TABLE "CalibrationRequestItem" ALTER COLUMN "deviceId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "CalibrationRequestItem_deviceId_idx" ON "CalibrationRequestItem"("deviceId");

-- AddForeignKey
ALTER TABLE "CalibrationRequestItem" ADD CONSTRAINT "CalibrationRequestItem_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
