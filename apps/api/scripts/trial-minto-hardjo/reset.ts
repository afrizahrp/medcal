/**
 * Minto Hardjo High-Volume Calibration Trial — reset orchestration.
 *
 * Tears down the trial transaction chain in dependency order (Certificate ->
 * CalibrationJob -> WorkOrder -> PurchaseOrder -> Quotation ->
 * CalibrationRequest -> per-unit Device rows) and deactivates (isActive=false,
 * never hard-deletes) every manifested synthetic master-data row. The target
 * Customer (TRIAL_CUSTOMER_ID, a real, permanent record) is NEVER deleted —
 * only the transaction chain and Device rows this trial created under it. The
 * manifest written by seed.ts is the SOLE authority for what belongs to the
 * trial — never a heuristic "looks like trial data" query (plan §C.8 / §D.6).
 *
 * Run manually:
 *   pnpm --filter @medcal/api run reset:trial-minto-hardjo
 */
import "reflect-metadata";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@medcal/db";
import { FIXTURES_DIR, MANIFEST_PATH, readManifest } from "./lib";

async function main(): Promise<void> {
  const manifest = readManifest();
  if (!manifest) {
    console.log("[reset] No manifest found at", MANIFEST_PATH, "- nothing to reset.");
    return;
  }

  console.log(`[reset] Tearing down trial dataset created at ${manifest.createdAt}...`);

  // 1. Certificate has NO cascade from CalibrationJob (onDelete: Restrict) —
  //    a Certificate created through real UI usage during the trial (manual
  //    testing, not part of the deterministic seed) would otherwise block the
  //    WorkOrder delete below with a foreign key violation. Must go first.
  const jobIdsForCertCleanup = (
    await prisma.calibrationJob.findMany({
      where: { workOrderId: manifest.workOrderId },
      select: { id: true },
    })
  ).map((j) => j.id);
  if (jobIdsForCertCleanup.length > 0) {
    const certCount = await prisma.certificate.count({
      where: { calibrationJobId: { in: jobIdsForCertCleanup } },
    });
    if (certCount > 0) {
      console.log(`[reset] Deleting ${certCount} Certificate row(s) created during manual trial testing...`);
      await prisma.certificate.deleteMany({ where: { calibrationJobId: { in: jobIdsForCertCleanup } } });
    }
  }

  // 2. CalibrationJob and everything else cascading from it (MeasurementResult,
  //    QualityReview, IdentityCorrection, KontrolAlat, JobCalibrationTestPoint,
  //    JobReferenceEquipment*, etc.) is removed by deleting the WorkOrder —
  //    CalibrationJob.workOrder has onDelete: Cascade in schema.prisma.
  const jobCount = jobIdsForCertCleanup.length;
  console.log(`[reset] Deleting WorkOrder ${manifest.workOrderId} (cascades ${jobCount} CalibrationJob rows)...`);
  await prisma.workOrder.deleteMany({ where: { id: manifest.workOrderId } });

  console.log(`[reset] Deleting PurchaseOrder ${manifest.purchaseOrderId}...`);
  await prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: manifest.purchaseOrderId } });
  await prisma.purchaseOrder.deleteMany({ where: { id: manifest.purchaseOrderId } });

  console.log(`[reset] Deleting Quotation ${manifest.quotationId}...`);
  await prisma.quotationItem.deleteMany({ where: { quotationId: manifest.quotationId } });
  await prisma.quotation.deleteMany({ where: { id: manifest.quotationId } });

  console.log(`[reset] Deleting CalibrationRequest ${manifest.calibrationRequestId}...`);
  await prisma.calibrationRequestItem.deleteMany({ where: { requestId: manifest.calibrationRequestId } });
  await prisma.calibrationRequest.deleteMany({ where: { id: manifest.calibrationRequestId } });

  if (manifest.referenceEquipment) {
    console.log("[reset] Deleting reference-equipment trial fixture rows...");
    await prisma.equipmentCalibrationRecord.deleteMany({
      where: { id: manifest.referenceEquipment.equipmentCalibrationRecordId },
    });
    await prisma.equipment.deleteMany({ where: { id: manifest.referenceEquipment.equipmentId } });
    await prisma.deviceTypeEquipmentRequirement.deleteMany({
      where: { id: manifest.referenceEquipment.deviceTypeEquipmentRequirementId },
    });
    await prisma.equipmentType.deleteMany({ where: { id: manifest.referenceEquipment.equipmentTypeId } });
  }

  if (manifest.priceListItemIds.length > 0) {
    console.log(`[reset] Deleting ${manifest.priceListItemIds.length} trial PriceListItem rows...`);
    await prisma.priceListItem.deleteMany({ where: { id: { in: manifest.priceListItemIds } } });
  }

  // Target Customer is a real, permanent record — never deleted. Its Device
  // rows ARE owned by this trial, though, and no longer get cleaned up via a
  // Customer cascade now that the Customer itself is left in place — delete
  // them explicitly instead. Must run after the WorkOrder/CalibrationJob
  // delete above: CalibrationJob.deviceId has onDelete: Restrict, so a
  // still-referenced Device cannot be removed first. Matches BOTH serial
  // conventions this trial produces: "TRIAL-MH-SN-*" (ensureTrialDevices,
  // lib.ts) and "TRIAL-SN-*" (a real Device created by the Identity
  // Correction approval flow itself when a job's proposed newSerial didn't
  // match an existing Device) — this Customer had zero Device rows before
  // the trial, so every "TRIAL-" prefixed row under it is this trial's own.
  const deletedDevices = await prisma.device.deleteMany({
    where: { customerId: manifest.customerId, serialNumber: { startsWith: "TRIAL-" } },
  });
  console.log(`[reset] Deleted ${deletedDevices.count} trial Device rows under Customer ${manifest.customerId}.`);

  // 2. Deactivate (never hard-delete) every manifested synthetic master-data
  //    row — the project's existing soft-delete convention (plan §B.1/§C.8).
  if (manifest.syntheticParameterIds.length > 0) {
    console.log(`[reset] Deactivating ${manifest.syntheticParameterIds.length} synthetic DeviceCalibrationParameter rows...`);
    await prisma.deviceCalibrationParameter.updateMany({
      where: { id: { in: manifest.syntheticParameterIds } },
      data: { isActive: false },
    });
  }
  if (manifest.syntheticDeviceTypeIds.length > 0) {
    console.log(`[reset] Deactivating ${manifest.syntheticDeviceTypeIds.length} synthetic DeviceType rows...`);
    await prisma.deviceType.updateMany({
      where: { id: { in: manifest.syntheticDeviceTypeIds } },
      data: { isActive: false },
    });
  }
  if (manifest.syntheticDeviceCategoryIds.length > 0) {
    console.log(`[reset] Deactivating ${manifest.syntheticDeviceCategoryIds.length} synthetic DeviceCategory rows...`);
    await prisma.deviceCategory.updateMany({
      where: { id: { in: manifest.syntheticDeviceCategoryIds } },
      data: { isActive: false },
    });
  }

  // Trial Users/Tax are left in place (shared identity/tax-code concepts, not
  // trial-scoped master-data catalog rows) — harmless, documented in the
  // implementation report.

  rmSync(MANIFEST_PATH, { force: true });
  console.log(`[reset] Manifest removed from ${resolve(FIXTURES_DIR, "manifest.json")}. Reset complete.`);
}

if (require.main === module) {
  main()
    .then(() => prisma.$disconnect())
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error("[reset] FAILED:", err);
      await prisma.$disconnect();
      process.exit(1);
    });
}

export { main as resetTrialMintoHardjo };
