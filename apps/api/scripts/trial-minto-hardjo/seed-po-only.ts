/**
 * Minto Hardjo High-Volume Trial — PO-only seed orchestration.
 *
 * Builds the Requisition -> Quotation -> Purchase Order chain (56 items,
 * Σqty=406) through the same real service-layer calls as `seed.ts`, using the
 * same fixtures (`TRIAL_SOURCE_ROWS`, `TRIAL_DEVICE_TYPE_MAPPING`) and the
 * same shared helpers from `lib.ts`. Unlike `seed.ts`, it stops immediately
 * after `PurchaseOrdersService.approve()` — no WorkOrder, no CalibrationJob
 * fan-out, no allocation. This exists specifically so the resulting PO can be
 * taken through Allocation -> WorkOrder manually via the Management Portal.
 *
 * Idempotent guard: refuses to run if a PO-only manifest already exists, or
 * if the target Customer (TRIAL_CUSTOMER_ID, a real, permanent, pre-existing
 * Customer — never created or deleted by this script) already has a live
 * CalibrationRequest attached.
 *
 * Run manually:
 *   pnpm --filter @medcal/api run seed:trial-minto-hardjo-po-only
 */
import "reflect-metadata";
import { resolve } from "node:path";
import { prisma } from "@medcal/db";
import { CalibrationRequestsService } from "../../src/modules/calibration-requests/calibration-requests.service";
import { QuotationsService } from "../../src/modules/quotations/quotations.service";
import { PurchaseOrdersService } from "../../src/modules/purchase-orders/purchase-orders.service";
import { TRIAL_SOURCE_ROWS } from "../../../../packages/db/fixtures/trial-minto-hardjo/source-rows";
import { TRIAL_DEVICE_TYPE_MAPPING } from "../../../../packages/db/fixtures/trial-minto-hardjo/device-type-mapping";
import { seedTrialMintoHardjoDeviceTypes } from "../../../../packages/db/prisma/seed-trial-minto-hardjo-device-types";
import {
  TRIAL_CUSTOMER_ID,
  TRIAL_STAFF_USER_ID,
  FIXTURES_DIR,
  resolveDeviceTypeIdsByCode,
  ensureNonPpnTax,
  ensurePriceListItems,
  ensureTrialUsers,
} from "./lib";
import { PO_ONLY_MANIFEST_PATH, readPoOnlyManifest, writePoOnlyManifest, type TrialPoOnlyManifest } from "./po-only-manifest";

const COMPANY_ID = process.env.COMPANY_ID ?? "PKM";

const calibrationRequestsService = new CalibrationRequestsService();
const quotationsService = new QuotationsService();
const purchaseOrdersService = new PurchaseOrdersService();

async function main(): Promise<void> {
  const existingManifest = readPoOnlyManifest();
  if (existingManifest) {
    console.error(
      `[seed-po-only] Refusing to double-seed: manifest already exists at ${PO_ONLY_MANIFEST_PATH}. ` +
        "Run reset:trial-minto-hardjo-po-only first if you want to reseed.",
    );
    process.exitCode = 1;
    return;
  }

  console.log("[seed-po-only] 1/6 synthetic master data (TRIAL_MH_* DeviceTypes)...");
  const syntheticManifest = await seedTrialMintoHardjoDeviceTypes();

  console.log("[seed-po-only] 2/6 resolving DeviceType ids for all 56 rows...");
  const deviceTypesByCode = await resolveDeviceTypeIdsByCode();

  console.log("[seed-po-only] 3/6 tax + price list + trial users...");
  const taxCode = await ensureNonPpnTax(COMPANY_ID);
  const allDeviceTypeIds = TRIAL_DEVICE_TYPE_MAPPING.map((m) => deviceTypesByCode.get(m.deviceTypeCode)!.id);
  const priceListItemIds = await ensurePriceListItems(COMPANY_ID, allDeviceTypeIds);
  await ensureTrialUsers(COMPANY_ID);

  console.log("[seed-po-only] 4/6 target Customer...");
  const customer = await prisma.customer.findUnique({ where: { id: TRIAL_CUSTOMER_ID } });
  if (!customer) {
    console.error(
      `[seed-po-only] Target Customer ${TRIAL_CUSTOMER_ID} not found. This trial no longer creates its ` +
        "own Customer — it reuses this fixed, real Customer id. Confirm the id in lib.ts is still correct.",
    );
    process.exitCode = 1;
    return;
  }
  const liveRequestCount = await prisma.calibrationRequest.count({ where: { customerId: TRIAL_CUSTOMER_ID } });
  if (liveRequestCount > 0) {
    console.error(
      `[seed-po-only] Refusing to seed: Customer ${TRIAL_CUSTOMER_ID} (${customer.name}) already has ` +
        `${liveRequestCount} CalibrationRequest row(s) attached. Run reset:trial-minto-hardjo-po-only first, ` +
        "or investigate manually before reseeding.",
    );
    process.exitCode = 1;
    return;
  }
  const customerId = customer.id;
  console.log(`[seed-po-only] Using ${customer.name} (${customerId}).`);

  console.log("[seed-po-only] 5/6 CalibrationRequest -> Quotation -> PurchaseOrder (real service calls)...");
  const items = TRIAL_SOURCE_ROWS.map((row) => {
    const mapping = TRIAL_DEVICE_TYPE_MAPPING.find((m) => m.rowNumber === row.rowNumber)!;
    const deviceTypeId = deviceTypesByCode.get(mapping.deviceTypeCode)!.id;
    return {
      deviceTypeId,
      customerDeviceName: row.customerDeviceName,
      qty: row.qty,
    };
  });

  const createdRequest = await calibrationRequestsService.create(COMPANY_ID, TRIAL_STAFF_USER_ID, {
    customerId,
    serviceMode: "SEND_TO_LAB",
    items,
  } as never);

  await calibrationRequestsService.submit(COMPANY_ID, createdRequest.id);

  const quotation = await quotationsService.create(COMPANY_ID, { requestId: createdRequest.id, taxCode } as never);
  await quotationsService.send(COMPANY_ID, quotation.id);
  await quotationsService.approve(COMPANY_ID, quotation.id, TRIAL_STAFF_USER_ID);

  const po = await purchaseOrdersService.create(COMPANY_ID, {
    quotationId: quotation.id,
    customerPoNumber: `CPO-TRIAL-MH-PO-ONLY-${Date.now()}`,
    customerPoDate: new Date(),
  } as never);
  await purchaseOrdersService.approve(COMPANY_ID, po.id, TRIAL_STAFF_USER_ID);

  console.log("[seed-po-only] 6/6 writing manifest (STOPPING at approved PurchaseOrder)...");
  const manifest: TrialPoOnlyManifest = {
    createdAt: new Date().toISOString(),
    companyId: COMPANY_ID,
    customerId,
    calibrationRequestId: createdRequest.id,
    quotationId: quotation.id,
    purchaseOrderId: po.id,
    staffUserId: TRIAL_STAFF_USER_ID,
    taxCode,
    priceListItemIds,
    syntheticDeviceCategoryIds: syntheticManifest.categories.map((c) => c.id),
    syntheticDeviceTypeIds: syntheticManifest.deviceTypes.map((d) => d.id),
    syntheticParameterIds: syntheticManifest.parameters.map((p) => p.id),
  };
  writePoOnlyManifest(manifest);

  const finalItemCount = await prisma.purchaseOrderItem.count({ where: { purchaseOrderId: po.id } });
  const finalQtyAgg = await prisma.purchaseOrderItem.aggregate({
    where: { purchaseOrderId: po.id },
    _sum: { qty: true },
  });
  console.log(`[seed-po-only] Done. PurchaseOrder ${po.id} — ${finalItemCount} items, Σqty = ${finalQtyAgg._sum.qty}.`);
  console.log(`[seed-po-only] Manifest written to ${resolve(FIXTURES_DIR, "manifest-po-only.json")}`);
  console.log(
    "[seed-po-only] STOP: no WorkOrder/Allocation/CalibrationJob created. " +
      "Perform Allocation -> WorkOrder manually via the Management Portal.",
  );
}

if (require.main === module) {
  main()
    .then(() => prisma.$disconnect())
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error("[seed-po-only] FAILED:", err);
      await prisma.$disconnect();
      process.exit(1);
    });
}

export { main as seedTrialMintoHardjoPoOnly };
