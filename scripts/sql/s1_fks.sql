\echo '=== FK constraints touching the trial chain (child -> parent, delete rule) ==='
SELECT
  tc.table_name    AS child_table,
  kcu.column_name  AS child_column,
  ccu.table_name   AS parent_table,
  rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name AND tc.table_schema = rc.constraint_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND (
    tc.table_name IN ('CalibrationRequest','CalibrationRequestItem','Quotation','QuotationItem',
      'PurchaseOrder','PurchaseOrderItem','WorkOrder','WorkOrderItem','WorkOrderAssignment',
      'WorkOrderEquipment','EquipmentDeliveryNote','EquipmentDeliveryNoteItem','CalibrationJob',
      'MeasurementResult','JobEvidence','JobReferenceEquipmentUsed','CustomerSignature',
      'IdentityCorrection','IdentityCorrectionSignature','QualityReview','Certificate')
    OR ccu.table_name IN ('CalibrationRequest','CalibrationRequestItem','Quotation','QuotationItem',
      'PurchaseOrder','PurchaseOrderItem','WorkOrder','CalibrationJob')
  )
ORDER BY parent_table, child_table, child_column;

\echo ''
\echo '=== Lead row detail ==='
SELECT id, "companyId", "customerId", status, "createdAt" FROM "Lead";

\echo ''
\echo '=== Any CalibrationRequestItem referenced by a QuotationItem/CalibrationJob? ==='
SELECT 'QuotationItem.requestItemId set' t, count(*) c FROM "QuotationItem" WHERE "requestItemId" IS NOT NULL
UNION ALL SELECT 'CalibrationJob total', count(*) FROM "CalibrationJob";
