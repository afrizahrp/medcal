/**
 * Minto Hardjo High-Volume Trial (PO-only variant) — manifest I/O.
 *
 * Deliberately a SEPARATE file/manifest from `lib.ts`'s `manifest.json` /
 * `TrialManifest`. That manifest always carries a `workOrderId` and a `jobs`
 * array because the full trial (`seed.ts`) always fans out CalibrationJobs.
 * The PO-only trial (`seed-po-only.ts`) never creates a WorkOrder, so it
 * cannot reuse that shape or that file — doing so would make
 * `reset:trial-minto-hardjo` (which assumes a WorkOrder exists) operate on
 * data it doesn't own, or `reset:trial-minto-hardjo-po-only` collide with a
 * full-trial run. Keeping the two manifests on disk side by side lets both
 * lifecycles coexist without either script needing to know about the other.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { FIXTURES_DIR } from "./lib";

export const PO_ONLY_MANIFEST_PATH = resolve(FIXTURES_DIR, "manifest-po-only.json");

export interface TrialPoOnlyManifest {
  createdAt: string;
  companyId: string;
  /** Always TRIAL_CUSTOMER_ID (lib.ts) — the real, permanent Customer this trial models. Never created/deleted by this script. */
  customerId: string;
  calibrationRequestId: string;
  quotationId: string;
  purchaseOrderId: string;
  staffUserId: string;
  taxCode: string;
  priceListItemIds: string[];
  syntheticDeviceCategoryIds: string[];
  syntheticDeviceTypeIds: string[];
  syntheticParameterIds: string[];
}

export function writePoOnlyManifest(manifest: TrialPoOnlyManifest): void {
  mkdirSync(dirname(PO_ONLY_MANIFEST_PATH), { recursive: true });
  writeFileSync(PO_ONLY_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
}

export function readPoOnlyManifest(): TrialPoOnlyManifest | null {
  if (!existsSync(PO_ONLY_MANIFEST_PATH)) return null;
  return JSON.parse(readFileSync(PO_ONLY_MANIFEST_PATH, "utf-8")) as TrialPoOnlyManifest;
}
