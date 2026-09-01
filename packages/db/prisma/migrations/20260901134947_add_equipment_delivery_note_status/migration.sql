-- CreateEnum
CREATE TYPE "EquipmentDeliveryNoteStatus" AS ENUM ('ISSUED', 'CANCELLED');

-- AlterTable
ALTER TABLE "EquipmentDeliveryNote" ADD COLUMN     "status" "EquipmentDeliveryNoteStatus" NOT NULL DEFAULT 'ISSUED';
