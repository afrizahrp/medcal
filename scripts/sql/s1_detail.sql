\echo '=== CalibrationRequest full ==='
SELECT id, number, "companyId", "customerId", "leadId", "serviceMode", "expectedDate", status, notes, "createdAt", "updatedAt"
FROM "CalibrationRequest";

\echo ''
\echo '=== Quotation full ==='
SELECT id, number, "companyId", "customerId", "requestId", source, status, "validUntil", subtotal, "taxCode", "taxRate", "taxAmount", "totalAmount", "approvedAt", "customerApprovedAt", "createdAt"
FROM "Quotation";

\echo ''
\echo '=== QuotationItem full ==='
SELECT id, "quotationId", "requestItemId", "deviceId", "tariffId", description, qty, "unitPrice", "lineTotal", "pricePending", "createdAt"
FROM "QuotationItem" ORDER BY "createdAt";

\echo ''
\echo '=== PurchaseOrder full ==='
SELECT id, number, "companyId", "customerId", "quotationId", "customerPoNumber", "customerPoDate", status, subtotal, "totalAmount", "receivedAt", "confirmedAt", notes, "createdAt"
FROM "PurchaseOrder";

\echo ''
\echo '=== PurchaseOrderItem full ==='
SELECT id, "purchaseOrderId", "quotationItemId", "deviceId", "tariffId", description, qty, "unitPrice", "lineTotal", "workOrderId", status, "createdAt"
FROM "PurchaseOrderItem" ORDER BY "createdAt";

\echo ''
\echo '=== Customer (trial) ==='
SELECT id, "companyId", code, name, status, "createdAt" FROM "Customer";

\echo ''
\echo '=== Lead rows ==='
SELECT id, "companyId", "customerId", status, "createdAt" FROM "Lead";

\echo ''
\echo '=== Device / Equipment / DeviceType counts (must stay untouched) ==='
SELECT 'Device' t, count(*) FROM "Device"
UNION ALL SELECT 'Equipment', count(*) FROM "Equipment"
UNION ALL SELECT 'EquipmentCalibrationRecord', count(*) FROM "EquipmentCalibrationRecord"
UNION ALL SELECT 'DeviceType', count(*) FROM "DeviceType"
UNION ALL SELECT 'User', count(*) FROM "User"
UNION ALL SELECT 'MasterCodeSequence', count(*) FROM "MasterCodeSequence";

\echo ''
\echo '=== FileObject rows (any) ==='
SELECT id, "companyId", "ownerType", "ownerId", "storageKey", "originalName", "sizeBytes", "createdAt" FROM "FileObject";

\echo ''
\echo '=== Invoice / Certificate / CreditNote (downstream billing) ==='
SELECT 'Invoice' t, count(*) FROM "Invoice"
UNION ALL SELECT 'InvoiceItem', count(*) FROM "InvoiceItem"
UNION ALL SELECT 'Certificate', count(*) FROM "Certificate"
UNION ALL SELECT 'CreditNote', count(*) FROM "CreditNote"
UNION ALL SELECT 'ReminderEvent', count(*) FROM "ReminderEvent";
