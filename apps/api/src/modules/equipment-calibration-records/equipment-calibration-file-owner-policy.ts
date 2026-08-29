import { prisma } from "@medcal/db";
import type { FileOwnerPolicy } from "../files/owner-policy";

/**
 * The EQUIPMENT_CALIBRATION FileOwnerPolicy registered with the generic
 * FilesModule. Certificate PDFs attach to an EquipmentCalibrationRecord
 * (ownerId = record id); file authorization reuses the
 * `equipmentCalibrationRecord` permission, and evidence becomes immutable
 * once the record is CONFIRMED.
 */
export const equipmentCalibrationFileOwnerPolicy: FileOwnerPolicy = {
  ownerType: "EQUIPMENT_CALIBRATION",
  permissionResource: "equipmentCalibrationRecord",
  readAction: "read",
  writeAction: "update",
  fileTypePolicy: {
    mimeTypes: ["application/pdf"],
    extensions: [".pdf"],
    maxBytes: 10 * 1024 * 1024,
  },
  async resolveOwner(companyId, ownerId) {
    const record = await prisma.equipmentCalibrationRecord.findFirst({
      where: { id: ownerId, companyId },
      select: { status: true },
    });
    return { exists: Boolean(record), locked: record?.status === "CONFIRMED" };
  },
};
