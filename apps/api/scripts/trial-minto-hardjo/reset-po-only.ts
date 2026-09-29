/**
 * Minto Hardjo High-Volume Trial (PO-only variant) — reset orchestration.
 *
 * Tears down the trial's Requisition -> Quotation -> PurchaseOrder chain and
 * deactivates the manifested synthetic master-data rows. Reads/writes ONLY
 * `manifest-po-only.json` (see `po-only-manifest.ts`) — never touches
 * `manifest.json` or anything created by `seed.ts`/`reset.ts`.
 *
 * The trial Customer is deleted only if this script's own manifest recorded
 * that it created the Customer fresh (`customerReused: false`). If the
 * Customer was reused from a prior leftover, it is left alone, since this
 * script never owned its lifecycle.
 *
 * Run manually:
 *   pnpm --filter @medcal/api run reset:trial-minto-hardjo-po-only
 */
import "reflect-metadata";
import { rmSync } from "node:fs";
import { prisma } from "@medcal/db";
import { PO_ONLY_MANIFEST_PATH, readPoOnlyManifest } from "./po-only-manifest";

async function main(): Promise<void> {
  const manifest = readPoOnlyManifest();
  if (!manifest) {
    console.log("[reset-po-only] No manifest found at", PO_ONLY_MANIFEST_PATH, "- nothing to reset.");
    return;
  }

  console.log(`[reset-po-only] Tearing down PO-only trial dataset created at ${manifest.createdAt}...`);

  console.log(`[reset-po-only] Deleting PurchaseOrder ${manifest.purchaseOrderId}...`);
  await prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: manifest.purchaseOrderId } });
  await prisma.purchaseOrder.deleteMany({ where: { id: manifest.purchaseOrderId } });

  console.log(`[reset-po-only] Deleting Quotation ${manifest.quotationId}...`);
  await prisma.quotationItem.deleteMany({ where: { quotationId: manifest.quotationId } });
  await prisma.quotation.deleteMany({ where: { id: manifest.quotationId } });

  console.log(`[reset-po-only] Deleting CalibrationRequest ${manifest.calibrationRequestId}...`);
  await prisma.calibrationRequestItem.deleteMany({ where: { requestId: manifest.calibrationRequestId } });
  await prisma.calibrationRequest.deleteMany({ where: { id: manifest.calibrationRequestId } });

  if (manifest.priceListItemIds.length > 0) {
    console.log(`[reset-po-only] Deleting ${manifest.priceListItemIds.length} trial PriceListItem rows...`);
    await prisma.priceListItem.deleteMany({ where: { id: { in: manifest.priceListItemIds } } });
  }

  if (manifest.customerReused) {
    console.log(
      `[reset-po-only] Leaving Customer ${manifest.customerId} in place (it was reused, not created by this script).`,
    );
  } else {
    console.log(`[reset-po-only] Deleting trial Customer ${manifest.customerId}...`);
    await prisma.customer.deleteMany({ where: { id: manifest.customerId } });
  }

  // Deactivate (never hard-delete) manifested synthetic master-data rows —
  // same soft-delete convention as reset.ts.
  if (manifest.syntheticParameterIds.length > 0) {
    console.log(`[reset-po-only] Deactivating ${manifest.syntheticParameterIds.length} synthetic DeviceCalibrationParameter rows...`);
    await prisma.deviceCalibrationParameter.updateMany({
      where: { id: { in: manifest.syntheticParameterIds } },
      data: { isActive: false },
    });
  }
  if (manifest.syntheticDeviceTypeIds.length > 0) {
    console.log(`[reset-po-only] Deactivating ${manifest.syntheticDeviceTypeIds.length} synthetic DeviceType rows...`);
    await prisma.deviceType.updateMany({
      where: { id: { in: manifest.syntheticDeviceTypeIds } },
      data: { isActive: false },
    });
  }
  if (manifest.syntheticDeviceCategoryIds.length > 0) {
    console.log(`[reset-po-only] Deactivating ${manifest.syntheticDeviceCategoryIds.length} synthetic DeviceCategory rows...`);
    await prisma.deviceCategory.updateMany({
      where: { id: { in: manifest.syntheticDeviceCategoryIds } },
      data: { isActive: false },
    });
  }

  rmSync(PO_ONLY_MANIFEST_PATH, { force: true });
  console.log(`[reset-po-only] Manifest removed from ${PO_ONLY_MANIFEST_PATH}. Reset complete.`);
}

if (require.main === module) {
  main()
    .then(() => prisma.$disconnect())
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error("[reset-po-only] FAILED:", err);
      await prisma.$disconnect();
      process.exit(1);
    });
}

export { main as resetTrialMintoHardjoPoOnly };
