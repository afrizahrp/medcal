\echo '=== IN-SCOPE tables (to be wiped) ==='
SELECT 'CalibrationRequest' t, count(*) c FROM "CalibrationRequest"
UNION ALL SELECT 'CalibrationRequestItem', count(*) FROM "CalibrationRequestItem"
UNION ALL SELECT 'Quotation', count(*) FROM "Quotation"
UNION ALL SELECT 'QuotationItem', count(*) FROM "QuotationItem"
UNION ALL SELECT 'PurchaseOrder', count(*) FROM "PurchaseOrder"
UNION ALL SELECT 'PurchaseOrderItem', count(*) FROM "PurchaseOrderItem"
UNION ALL SELECT 'WorkOrder', count(*) FROM "WorkOrder"
UNION ALL SELECT 'WorkOrderItem', count(*) FROM "WorkOrderItem"
UNION ALL SELECT 'WorkOrderEquipment', count(*) FROM "WorkOrderEquipment"
UNION ALL SELECT 'WorkOrderAssignment', count(*) FROM "WorkOrderAssignment"
UNION ALL SELECT 'EquipmentDeliveryNote', count(*) FROM "EquipmentDeliveryNote"
UNION ALL SELECT 'EquipmentDeliveryNoteItem', count(*) FROM "EquipmentDeliveryNoteItem"
UNION ALL SELECT 'CalibrationJob', count(*) FROM "CalibrationJob"
UNION ALL SELECT 'IdentityCorrection', count(*) FROM "IdentityCorrection"
UNION ALL SELECT 'IdentityCorrectionSignature', count(*) FROM "IdentityCorrectionSignature"
UNION ALL SELECT 'JobReferenceEquipmentUsed', count(*) FROM "JobReferenceEquipmentUsed"
UNION ALL SELECT 'MeasurementResult', count(*) FROM "MeasurementResult"
UNION ALL SELECT 'JobEvidence', count(*) FROM "JobEvidence"
UNION ALL SELECT 'CustomerSignature', count(*) FROM "CustomerSignature"
UNION ALL SELECT 'QualityReview', count(*) FROM "QualityReview"
UNION ALL SELECT 'Certificate', count(*) FROM "Certificate"
UNION ALL SELECT 'FileObject (total)', count(*) FROM "FileObject"
ORDER BY 1;

\echo ''
\echo '=== EXCLUDED tables (must be identical after wipe) ==='
SELECT 'Company' t, count(*) c FROM "Company"
UNION ALL SELECT 'User', count(*) FROM "User"
UNION ALL SELECT 'UserMembership', count(*) FROM "UserMembership"
UNION ALL SELECT 'Customer', count(*) FROM "Customer"
UNION ALL SELECT 'Lead', count(*) FROM "Lead"
UNION ALL SELECT 'Device', count(*) FROM "Device"
UNION ALL SELECT 'DeviceType', count(*) FROM "DeviceType"
UNION ALL SELECT 'DeviceCalibrationParameter', count(*) FROM "DeviceCalibrationParameter"
UNION ALL SELECT 'Equipment', count(*) FROM "Equipment"
UNION ALL SELECT 'EquipmentType', count(*) FROM "EquipmentType"
UNION ALL SELECT 'EquipmentCalibrationRecord', count(*) FROM "EquipmentCalibrationRecord"
UNION ALL SELECT 'PriceListItem', count(*) FROM "PriceListItem"
UNION ALL SELECT 'ServiceTariff', count(*) FROM "ServiceTariff"
ORDER BY 1;

\echo ''
\echo '=== DocumentNumberSequence (counter table — see note) ==='
SELECT "companyId", "documentType", prefix, year, "lastSequence" FROM "DocumentNumberSequence" ORDER BY "documentType", year;
