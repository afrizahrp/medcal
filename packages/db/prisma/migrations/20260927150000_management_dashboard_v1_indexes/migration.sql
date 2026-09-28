-- Management Dashboard V1 lookup indexes.
-- Customer-scoped Volume joins WorkOrder.customerId.
-- Customer-scoped Customer PO filters PurchaseOrder.customerId.
-- Customer PO period bucketing filters status = APPROVED and confirmedAt.
-- Volume period bucketing filters CalibrationJob.createdAt within a company.

CREATE INDEX "PurchaseOrder_customerId_idx" ON "PurchaseOrder"("customerId");

CREATE INDEX "PurchaseOrder_companyId_status_confirmedAt_idx" ON "PurchaseOrder"("companyId", "status", "confirmedAt");

CREATE INDEX "WorkOrder_customerId_idx" ON "WorkOrder"("customerId");

CREATE INDEX "CalibrationJob_companyId_createdAt_idx" ON "CalibrationJob"("companyId", "createdAt");
