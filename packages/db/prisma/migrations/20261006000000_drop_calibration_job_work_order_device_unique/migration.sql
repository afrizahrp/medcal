-- deviceId identifies the device; CalibrationJob.id identifies the job. Every
-- fan-out job of a WorkOrderItem inherits its deviceId (including qty > 1), so
-- deviceId must not be unique per WorkOrder. Fan-out idempotency remains
-- guarded by @@unique([workOrderId, purchaseOrderItemId, unitOrdinal]).

-- DropIndex
DROP INDEX "CalibrationJob_workOrderId_deviceId_key";
