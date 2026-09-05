\echo '=== All CalibrationRequest rows ==='
SELECT r.id, r.number, r."companyId", r."customerId", c.name AS customer, r.status, r."serviceMode",
       r."createdAt", (SELECT count(*) FROM "CalibrationRequestItem" i WHERE i."requestId" = r.id) AS item_count
FROM "CalibrationRequest" r
LEFT JOIN "Customer" c ON c.id = r."customerId"
ORDER BY r."createdAt";

\echo ''
\echo '=== All CalibrationRequestItem rows ==='
SELECT i.id, i."requestId", i."deviceTypeId", dt.name AS device_type, i."customerDeviceName",
       i.model, i."deviceId", i.qty, i."akdAkl", i."createdAt"
FROM "CalibrationRequestItem" i
LEFT JOIN "DeviceType" dt ON dt.id = i."deviceTypeId"
ORDER BY i."createdAt";

\echo ''
\echo '=== Row counts across the whole chain ==='
SELECT 'CalibrationRequest' t, count(*) FROM "CalibrationRequest"
UNION ALL SELECT 'CalibrationRequestItem', count(*) FROM "CalibrationRequestItem"
UNION ALL SELECT 'Quotation', count(*) FROM "Quotation"
UNION ALL SELECT 'QuotationItem', count(*) FROM "QuotationItem"
UNION ALL SELECT 'PurchaseOrder', count(*) FROM "PurchaseOrder"
UNION ALL SELECT 'PurchaseOrderItem', count(*) FROM "PurchaseOrderItem"
UNION ALL SELECT 'WorkOrder', count(*) FROM "WorkOrder"
UNION ALL SELECT 'WorkOrderItem', count(*) FROM "WorkOrderItem"
UNION ALL SELECT 'WorkOrderAssignment', count(*) FROM "WorkOrderAssignment"
UNION ALL SELECT 'WorkOrderEquipment', count(*) FROM "WorkOrderEquipment"
UNION ALL SELECT 'EquipmentDeliveryNote', count(*) FROM "EquipmentDeliveryNote"
UNION ALL SELECT 'EquipmentDeliveryNoteItem', count(*) FROM "EquipmentDeliveryNoteItem"
UNION ALL SELECT 'CalibrationJob', count(*) FROM "CalibrationJob"
UNION ALL SELECT 'MeasurementResult', count(*) FROM "MeasurementResult"
UNION ALL SELECT 'JobEvidence', count(*) FROM "JobEvidence"
UNION ALL SELECT 'JobReferenceEquipmentUsed', count(*) FROM "JobReferenceEquipmentUsed"
UNION ALL SELECT 'CustomerSignature', count(*) FROM "CustomerSignature"
UNION ALL SELECT 'IdentityCorrection', count(*) FROM "IdentityCorrection"
UNION ALL SELECT 'IdentityCorrectionSignature', count(*) FROM "IdentityCorrectionSignature"
UNION ALL SELECT 'QualityReview', count(*) FROM "QualityReview"
UNION ALL SELECT 'Certificate', count(*) FROM "Certificate"
UNION ALL SELECT 'FileObject', count(*) FROM "FileObject"
UNION ALL SELECT 'DocumentNumberSequence', count(*) FROM "DocumentNumberSequence"
UNION ALL SELECT 'Customer', count(*) FROM "Customer"
UNION ALL SELECT 'Device', count(*) FROM "Device"
ORDER BY 1;

\echo ''
\echo '=== DocumentNumberSequence rows ==='
SELECT "companyId", "documentType", prefix, year, "lastSequence", "updatedAt"
FROM "DocumentNumberSequence" ORDER BY "documentType", year;
