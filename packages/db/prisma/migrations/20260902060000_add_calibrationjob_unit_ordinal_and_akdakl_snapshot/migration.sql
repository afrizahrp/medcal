-- CalibrationJob: per-unit fan-out ordinal + customer-declared AKD/AKL snapshot.
--
-- unitOrdinal / unitTotal: when a WorkOrderItem.qty of N produces N CalibrationJob
-- rows (all initially deviceId = NULL, same purchaseOrderItemId), these let the
-- technician UI label "unit 2 of 3" before device matching. Added NOT NULL with
-- no default: fan-out must assign them explicitly. Safe because CalibrationJob
-- has zero rows at the time this migration is authored.
--
-- customerDeclaredAkdAkl: frozen snapshot of CalibrationRequestItem.akdAkl at job
-- creation, mirroring the existing customerDeclaredDeviceName. Nullable — "not
-- declared" is a valid state.

-- AlterTable
ALTER TABLE "CalibrationJob" ADD COLUMN     "customerDeclaredAkdAkl" TEXT,
ADD COLUMN     "unitOrdinal" INTEGER NOT NULL,
ADD COLUMN     "unitTotal" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "CalibrationJob_workOrderId_purchaseOrderItemId_unitOrdinal_key" ON "CalibrationJob"("workOrderId", "purchaseOrderItemId", "unitOrdinal");

-- Enforce the unit-bounds business rule at the database level. Prisma cannot
-- model CHECK constraints, so it is added in raw SQL (same pattern as
-- CalibrationRequestItem_qty_positive / DeviceCalibrationParameter_decimalPlaces_range).
ALTER TABLE "CalibrationJob"
  ADD CONSTRAINT "CalibrationJob_unit_bounds_check"
  CHECK ("unitOrdinal" >= 1 AND "unitTotal" >= 1 AND "unitOrdinal" <= "unitTotal");
