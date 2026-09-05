\echo '=== Customer ==='
SELECT id, "companyId", number, name, "legalName", status, "createdAt" FROM "Customer";

\echo ''
\echo '=== Lead rows ==='
SELECT count(*) AS lead_count FROM "Lead";

\echo ''
\echo '=== Master/reference table counts (must stay untouched) ==='
SELECT 'Device' t, count(*) c FROM "Device"
UNION ALL SELECT 'Equipment', count(*) FROM "Equipment"
UNION ALL SELECT 'EquipmentCalibrationRecord', count(*) FROM "EquipmentCalibrationRecord"
UNION ALL SELECT 'DeviceType', count(*) FROM "DeviceType"
UNION ALL SELECT 'User', count(*) FROM "User"
UNION ALL SELECT 'MasterCodeSequence', count(*) FROM "MasterCodeSequence"
ORDER BY 1;

\echo ''
\echo '=== FileObject rows (any) ==='
SELECT id, "companyId", "ownerType", "ownerId", "storageKey", "originalName", "sizeBytes", "createdAt" FROM "FileObject";

\echo ''
\echo '=== Downstream billing counts ==='
SELECT 'Invoice' t, count(*) c FROM "Invoice"
UNION ALL SELECT 'InvoiceItem', count(*) FROM "InvoiceItem"
UNION ALL SELECT 'InvoiceCertificate', count(*) FROM "InvoiceCertificate"
UNION ALL SELECT 'Payment', count(*) FROM "Payment"
UNION ALL SELECT 'Certificate', count(*) FROM "Certificate"
UNION ALL SELECT 'CreditNote', count(*) FROM "CreditNote"
UNION ALL SELECT 'ReminderEvent', count(*) FROM "ReminderEvent"
ORDER BY 1;

\echo ''
\echo '=== MasterCodeSequence rows ==='
SELECT scope, "lastSequence", "updatedAt" FROM "MasterCodeSequence" ORDER BY scope;

\echo ''
\echo '=== ServiceTariff / PriceListItem counts ==='
SELECT 'ServiceTariff' t, count(*) c FROM "ServiceTariff"
UNION ALL SELECT 'PriceListItem', count(*) FROM "PriceListItem";
