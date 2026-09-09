-- ============================================================================
--  Trial commercial-chain data wipe
--  Target DB : pkmdb @ localhost:5432  (the DB apps/api uses via DATABASE_URL)
--  Run with  : psql -h localhost -p 5432 -U postgres -d pkmdb -f trial-data-wipe.sql
--
--  Everything runs inside ONE transaction.
--    * DRY RUN : change the final  COMMIT;  (bottom of file) to  ROLLBACK;
--                -> you still see BEFORE + AFTER output, nothing is persisted.
--    * REAL RUN: leave it as  COMMIT;
--
--  Scope wiped : CalibrationRequest / Quotation / PurchaseOrder chains and all
--                WorkOrder + CalibrationJob + QA + Certificate descendants,
--                plus all 2026 DocumentNumberSequence counters owned by that chain
--                (CRQ/QUO/PUR/SPK/WOL/DLN/BAI/CER).
--  NOT touched : Device, DeviceType, Equipment, EquipmentType,
--                EquipmentCalibrationRecord, Customer, Lead, User, Company,
--                UserMembership, DeviceCalibrationParameter, PriceListItem,
--                and the CUSTOMER (CUS) DocumentNumberSequence row.
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off
\timing off

\echo ''
\echo '################  DB IDENTITY  ################'
SELECT current_database()  AS db,
       inet_server_addr()  AS host,
       inet_server_port()  AS port,
       current_user        AS role;

BEGIN;

-- Capture file metadata owned by the trial chain before its owner rows disappear.
-- This removes FileObject database rows only; storage objects must be cleaned
-- separately using their storageKey values when required.
CREATE TEMP TABLE "_TrialFileObjectToDelete" ON COMMIT DROP AS
SELECT DISTINCT f.id
FROM "FileObject" f
WHERE
      (f."ownerType" = 'REQUEST_ATTACHMENT'
       AND f."ownerId" IN (SELECT id FROM "CalibrationRequest"))
   OR (f."ownerType" = 'JOB_EVIDENCE'
       AND f."ownerId" IN (SELECT id FROM "JobEvidence"))
   OR (f."ownerType" = 'SIGNATURE'
       AND f."ownerId" IN (SELECT id FROM "CustomerSignature"))
   OR (f."ownerType" = 'IDENTITY_CORRECTION'
       AND f."ownerId" IN (SELECT id FROM "IdentityCorrection"))
   OR (f."ownerType" = 'MEASUREMENT_RESULT'
       AND f."ownerId" IN (SELECT id FROM "MeasurementResult"))
   OR (f."ownerType" = 'CERTIFICATE'
       AND f."ownerId" IN (SELECT id FROM "Certificate"))
   OR f.id IN (SELECT "fileObjectId" FROM "JobEvidence")
   OR f.id IN (SELECT "fileObjectId" FROM "CustomerSignature" WHERE "fileObjectId" IS NOT NULL)
   OR f.id IN (SELECT "pdfFileObjectId" FROM "Certificate" WHERE "pdfFileObjectId" IS NOT NULL);

-- ----------------------------------------------------------------------------
--  BEFORE
-- ----------------------------------------------------------------------------
\echo ''
\echo '################  BEFORE - in-scope tables (to be wiped)  ################'
SELECT 'CalibrationRequest'          AS "table", count(*) AS rows FROM "CalibrationRequest"
UNION ALL SELECT 'CalibrationRequestItem',      count(*) FROM "CalibrationRequestItem"
UNION ALL SELECT 'Quotation',                   count(*) FROM "Quotation"
UNION ALL SELECT 'QuotationItem',               count(*) FROM "QuotationItem"
UNION ALL SELECT 'PurchaseOrder',               count(*) FROM "PurchaseOrder"
UNION ALL SELECT 'PurchaseOrderItem',           count(*) FROM "PurchaseOrderItem"
UNION ALL SELECT 'WorkOrder',                   count(*) FROM "WorkOrder"
UNION ALL SELECT 'WorkOrderItem',               count(*) FROM "WorkOrderItem"
UNION ALL SELECT 'WorkOrderEquipment',          count(*) FROM "WorkOrderEquipment"
UNION ALL SELECT 'WorkOrderAssignment',         count(*) FROM "WorkOrderAssignment"
UNION ALL SELECT 'EquipmentDeliveryNote',       count(*) FROM "EquipmentDeliveryNote"
UNION ALL SELECT 'EquipmentDeliveryNoteItem',   count(*) FROM "EquipmentDeliveryNoteItem"
UNION ALL SELECT 'CalibrationJob',              count(*) FROM "CalibrationJob"
UNION ALL SELECT 'IdentityCorrection',          count(*) FROM "IdentityCorrection"
UNION ALL SELECT 'IdentityCorrectionSignature', count(*) FROM "IdentityCorrectionSignature"
UNION ALL SELECT 'JobReferenceEquipmentUsed',   count(*) FROM "JobReferenceEquipmentUsed"
UNION ALL SELECT 'MeasurementResult',           count(*) FROM "MeasurementResult"
UNION ALL SELECT 'JobEvidence',                 count(*) FROM "JobEvidence"
UNION ALL SELECT 'CustomerSignature',           count(*) FROM "CustomerSignature"
UNION ALL SELECT 'QualityReview',               count(*) FROM "QualityReview"
UNION ALL SELECT 'Certificate',                 count(*) FROM "Certificate"
UNION ALL SELECT 'InvoiceCertificate',          count(*) FROM "InvoiceCertificate"
UNION ALL SELECT 'FileObject (trial-owned)',    count(*) FROM "_TrialFileObjectToDelete"
ORDER BY 1;

\echo ''
\echo '################  BEFORE - excluded master tables (must NOT change)  ################'
SELECT 'Company'                    AS "table", count(*) AS rows FROM "Company"
UNION ALL SELECT 'User',                       count(*) FROM "User"
UNION ALL SELECT 'UserMembership',             count(*) FROM "UserMembership"
UNION ALL SELECT 'Customer',                   count(*) FROM "Customer"
UNION ALL SELECT 'Lead',                       count(*) FROM "Lead"
UNION ALL SELECT 'Device',                     count(*) FROM "Device"
UNION ALL SELECT 'DeviceType',                 count(*) FROM "DeviceType"
UNION ALL SELECT 'DeviceCalibrationParameter', count(*) FROM "DeviceCalibrationParameter"
UNION ALL SELECT 'Equipment',                  count(*) FROM "Equipment"
UNION ALL SELECT 'EquipmentType',              count(*) FROM "EquipmentType"
UNION ALL SELECT 'EquipmentCalibrationRecord', count(*) FROM "EquipmentCalibrationRecord"
UNION ALL SELECT 'PriceListItem',              count(*) FROM "PriceListItem"
UNION ALL SELECT 'ServiceTariff',              count(*) FROM "ServiceTariff"
ORDER BY 1;

\echo ''
\echo '################  BEFORE - DocumentNumberSequence  ################'
SELECT "companyId", "documentType", "prefix", "year", "lastSequence", "updatedAt"
FROM "DocumentNumberSequence"
ORDER BY "documentType", "year";

-- ----------------------------------------------------------------------------
--  DELETE - commercial chain, FK-safe order (children before parents)
--  RESTRICT edges honoured:
--    PurchaseOrder->Quotation, PurchaseOrderItem->QuotationItem,
--    Quotation->CalibrationRequest, WorkOrder->Quotation/PurchaseOrder,
--    WorkOrderItem->PurchaseOrderItem, Certificate->CalibrationJob,
--    JobEvidence->FileObject
--  psql prints "DELETE <n>" per statement as evidence.
-- ----------------------------------------------------------------------------
\echo ''
\echo '################  DELETE - commercial chain  ################'
DELETE FROM "IdentityCorrectionSignature";
DELETE FROM "IdentityCorrection";
DELETE FROM "InvoiceCertificate"
WHERE "certificateId" IN (SELECT id FROM "Certificate");
DELETE FROM "Certificate";
DELETE FROM "QualityReview";
DELETE FROM "CustomerSignature";
DELETE FROM "JobEvidence";
DELETE FROM "MeasurementResult";
DELETE FROM "JobReferenceEquipmentUsed";
DELETE FROM "CalibrationJob";
DELETE FROM "EquipmentDeliveryNoteItem";
DELETE FROM "EquipmentDeliveryNote";
DELETE FROM "WorkOrderItem";
DELETE FROM "WorkOrderEquipment";
DELETE FROM "WorkOrderAssignment";
DELETE FROM "WorkOrder";
DELETE FROM "PurchaseOrderItem";
DELETE FROM "PurchaseOrder";
DELETE FROM "QuotationItem";
DELETE FROM "Quotation";
DELETE FROM "CalibrationRequestItem";
DELETE FROM "CalibrationRequest";
DELETE FROM "FileObject"
WHERE id IN (SELECT id FROM "_TrialFileObjectToDelete");

-- ----------------------------------------------------------------------------
--  RESET - DocumentNumberSequence counters used during the trial
--  Deletes every counter owned by the wiped chain for 2026 so the next real
--  document re-seeds from 1 (INSERT path of DocumentNumberService.allocate).
--  The CUSTOMER (CUS) row is intentionally left in place.
-- ----------------------------------------------------------------------------
\echo ''
\echo '################  RESET - DocumentNumberSequence (trial chain, PKM/2026)  ################'
DELETE FROM "DocumentNumberSequence"
WHERE "companyId" = 'PKM'
  AND "year" = 2026
  AND "documentType" IN (
        'CALIBRATION_REQUEST',
        'QUOTATION',
        'PURCHASE_ORDER',
        'WORK_ORDER',
        'WORK_ORDER_SEND_TO_LAB',
        'EQUIPMENT_DELIVERY_NOTE',
        'IDENTITY_CORRECTION_BA',
        'CERTIFICATE'
      );

-- ----------------------------------------------------------------------------
--  AFTER
-- ----------------------------------------------------------------------------
\echo ''
\echo '################  AFTER - in-scope tables (expect every count = 0)  ################'
SELECT 'CalibrationRequest'          AS "table", count(*) AS rows FROM "CalibrationRequest"
UNION ALL SELECT 'CalibrationRequestItem',      count(*) FROM "CalibrationRequestItem"
UNION ALL SELECT 'Quotation',                   count(*) FROM "Quotation"
UNION ALL SELECT 'QuotationItem',               count(*) FROM "QuotationItem"
UNION ALL SELECT 'PurchaseOrder',               count(*) FROM "PurchaseOrder"
UNION ALL SELECT 'PurchaseOrderItem',           count(*) FROM "PurchaseOrderItem"
UNION ALL SELECT 'WorkOrder',                   count(*) FROM "WorkOrder"
UNION ALL SELECT 'WorkOrderItem',               count(*) FROM "WorkOrderItem"
UNION ALL SELECT 'WorkOrderEquipment',          count(*) FROM "WorkOrderEquipment"
UNION ALL SELECT 'WorkOrderAssignment',         count(*) FROM "WorkOrderAssignment"
UNION ALL SELECT 'EquipmentDeliveryNote',       count(*) FROM "EquipmentDeliveryNote"
UNION ALL SELECT 'EquipmentDeliveryNoteItem',   count(*) FROM "EquipmentDeliveryNoteItem"
UNION ALL SELECT 'CalibrationJob',              count(*) FROM "CalibrationJob"
UNION ALL SELECT 'IdentityCorrection',          count(*) FROM "IdentityCorrection"
UNION ALL SELECT 'IdentityCorrectionSignature', count(*) FROM "IdentityCorrectionSignature"
UNION ALL SELECT 'JobReferenceEquipmentUsed',   count(*) FROM "JobReferenceEquipmentUsed"
UNION ALL SELECT 'MeasurementResult',           count(*) FROM "MeasurementResult"
UNION ALL SELECT 'JobEvidence',                 count(*) FROM "JobEvidence"
UNION ALL SELECT 'CustomerSignature',           count(*) FROM "CustomerSignature"
UNION ALL SELECT 'QualityReview',               count(*) FROM "QualityReview"
UNION ALL SELECT 'Certificate',                 count(*) FROM "Certificate"
UNION ALL SELECT 'InvoiceCertificate',          count(*) FROM "InvoiceCertificate"
UNION ALL SELECT 'FileObject (trial-owned)',    count(*) FROM "_TrialFileObjectToDelete" f
                                                    WHERE EXISTS (
                                                      SELECT 1 FROM "FileObject" live
                                                      WHERE live.id = f.id
                                                    )
ORDER BY 1;

\echo ''
\echo '################  AFTER - excluded master tables (expect IDENTICAL to BEFORE)  ################'
SELECT 'Company'                    AS "table", count(*) AS rows FROM "Company"
UNION ALL SELECT 'User',                       count(*) FROM "User"
UNION ALL SELECT 'UserMembership',             count(*) FROM "UserMembership"
UNION ALL SELECT 'Customer',                   count(*) FROM "Customer"
UNION ALL SELECT 'Lead',                       count(*) FROM "Lead"
UNION ALL SELECT 'Device',                     count(*) FROM "Device"
UNION ALL SELECT 'DeviceType',                 count(*) FROM "DeviceType"
UNION ALL SELECT 'DeviceCalibrationParameter', count(*) FROM "DeviceCalibrationParameter"
UNION ALL SELECT 'Equipment',                  count(*) FROM "Equipment"
UNION ALL SELECT 'EquipmentType',              count(*) FROM "EquipmentType"
UNION ALL SELECT 'EquipmentCalibrationRecord', count(*) FROM "EquipmentCalibrationRecord"
UNION ALL SELECT 'PriceListItem',              count(*) FROM "PriceListItem"
UNION ALL SELECT 'ServiceTariff',              count(*) FROM "ServiceTariff"
ORDER BY 1;

\echo ''
\echo '################  AFTER - DocumentNumberSequence (trial-chain PKM/2026 rows must be absent)  ################'
SELECT "companyId", "documentType", "prefix", "year", "lastSequence", "updatedAt"
FROM "DocumentNumberSequence"
ORDER BY "documentType", "year";

-- ----------------------------------------------------------------------------
--  Change to  ROLLBACK;  for a dry run.
-- ----------------------------------------------------------------------------
COMMIT;

\echo ''
\echo '################  DONE  ################'
