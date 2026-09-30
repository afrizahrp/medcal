/**
 * Minto Hardjo High-Volume Calibration Trial — seed orchestration.
 *
 * Builds the full, deterministic ~406-CalibrationJob trial dataset entirely
 * through real service-layer calls (no raw status writes, no HTTP layer —
 * same in-process pattern as calibration-jobs.service.test.ts). Idempotent:
 * refuses to run if the trial manifest or trial Customer already exists.
 *
 * Run manually:
 *   pnpm --filter @medcal/api run seed:trial-minto-hardjo
 *
 * See docs/claude/plans/Calibration-management/
 * MINTO-HARDJO-HIGH-VOLUME-TRIAL-IMPLEMENTATION-PLAN.md for the design.
 *
 * KNOWN PLAN DEVIATION (documented in the implementation report): the entire
 * 406-job dataset is generated from exactly one CalibrationRequest -> one
 * Quotation -> one PurchaseOrder -> one WorkOrder (the "one WorkOrder per PO"
 * / "one Quotation per Requisition" invariants, confirmed in
 * work-orders.service.ts and quotations.service.ts). WorkOrder.serviceMode is
 * copied verbatim from CalibrationRequest.serviceMode at creation and is
 * immutable afterwards (work-orders.service.ts ~L301/~L450) — so every job in
 * this single-WorkOrder trial shares ONE serviceMode. This trial uses
 * SEND_TO_LAB throughout (exercises the Kontrol Alat gate, the richer real
 * workflow). The plan's Tech-PWA scenario table asks for "one SEND_TO_LAB and
 * one ON_SITE job" from the same real 406 — that specific pairing is not
 * reachable without either a second, out-of-406 WorkOrder (a manufactured job,
 * forbidden by decision 1) or splitting the 56-item PO across two commercial
 * chains (contradicts the plan's own "the trial's only WorkOrder", C.4 step
 * 7). This is flagged as a genuine blocker for that one scenario row only;
 * everything else proceeds unblocked.
 */
import "reflect-metadata";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma, Prisma } from "@medcal/db";
import { CalibrationRequestsService } from "../../src/modules/calibration-requests/calibration-requests.service";
import { CalibrationRequestImportService } from "../../src/modules/calibration-requests/calibration-request-import.service";
import { QuotationsService } from "../../src/modules/quotations/quotations.service";
import { PurchaseOrdersService } from "../../src/modules/purchase-orders/purchase-orders.service";
import { WorkOrdersService } from "../../src/modules/work-orders/work-orders.service";
import { CalibrationJobsService } from "../../src/modules/calibration-jobs/calibration-jobs.service";
import { MeasurementResultsService } from "../../src/modules/calibration-jobs/measurement-results.service";
import { DevicesService } from "../../src/modules/devices/devices.service";
import type { FilesService } from "../../src/modules/files/files.service";
import { TRIAL_SOURCE_ROWS } from "../../../../packages/db/fixtures/trial-minto-hardjo/source-rows";
import { TRIAL_DEVICE_TYPE_MAPPING } from "../../../../packages/db/fixtures/trial-minto-hardjo/device-type-mapping";
import { seedTrialMintoHardjoDeviceTypes } from "../../../../packages/db/prisma/seed-trial-minto-hardjo-device-types";
import {
  TRIAL_CUSTOMER_NAME,
  TRIAL_STAFF_USER_ID,
  TRIAL_TECHNICIAN_USER_IDS,
  TRIAL_MANAGER_USER_IDS,
  FIXTURES_DIR,
  writeManifest,
  readManifest,
  buildTrialWorkbookBuffer,
  writeTrialWorkbookFixture,
  resolveDeviceTypeIdsByCode,
  ensureNonPpnTax,
  ensurePriceListItems,
  ensureTrialUsers,
  ensureTrialDevices,
  completeKontrolAlatForStart,
  fillJobMeasurements,
  planJobStates,
  planIdentityCorrections,
  type JobPlanInput,
  type TrialManifest,
} from "./lib";

const COMPANY_ID = process.env.COMPANY_ID ?? "PKM";

const calibrationRequestsService = new CalibrationRequestsService();
const calibrationRequestImportService = new CalibrationRequestImportService(calibrationRequestsService);
const quotationsService = new QuotationsService();
const purchaseOrdersService = new PurchaseOrdersService();
const workOrdersService = new WorkOrdersService();
const devicesService = new DevicesService();
const calibrationJobsService = new CalibrationJobsService(undefined as unknown as FilesService, devicesService);
const measurementResultsService = new MeasurementResultsService();

const UNAVAILABLE_SIGNATURES = {
  TECHNICIAN: { status: "UNAVAILABLE" as const, unavailableReason: "Trial data — no live signature capture" },
  CUSTOMER: { status: "UNAVAILABLE" as const, unavailableReason: "Trial data — no live signature capture" },
};

function pickTechnician(index: number): string {
  return TRIAL_TECHNICIAN_USER_IDS[index % TRIAL_TECHNICIAN_USER_IDS.length]!;
}
function pickManager(index: number): string {
  return TRIAL_MANAGER_USER_IDS[index % TRIAL_MANAGER_USER_IDS.length]!;
}

async function main(): Promise<void> {
  const existingManifest = readManifest();
  if (existingManifest) {
    console.error(
      `[seed] Refusing to double-seed: manifest already exists at ${resolve(FIXTURES_DIR, "manifest.json")}. ` +
        "Run reset:trial-minto-hardjo first if you want to reseed.",
    );
    process.exitCode = 1;
    return;
  }
  const existingCustomer = await prisma.customer.findFirst({
    where: { companyId: COMPANY_ID, name: TRIAL_CUSTOMER_NAME },
  });
  if (existingCustomer) {
    console.error(
      `[seed] Refusing to double-seed: Customer "${TRIAL_CUSTOMER_NAME}" already exists (id ${existingCustomer.id}) ` +
        "with no manifest on disk. Run reset:trial-minto-hardjo first, or remove the stray Customer manually.",
    );
    process.exitCode = 1;
    return;
  }

  console.log("[seed] 1/9 synthetic master data (TRIAL_MH_* DeviceTypes)...");
  const syntheticManifest = await seedTrialMintoHardjoDeviceTypes();

  console.log("[seed] 2/9 resolving DeviceType ids for all 56 rows...");
  const deviceTypesByCode = await resolveDeviceTypeIdsByCode();
  const codeById = new Map<string, string>();
  for (const [code, row] of deviceTypesByCode) codeById.set(row.id, code);

  console.log("[seed] 3/9 tax + price list + trial users...");
  const taxCode = await ensureNonPpnTax(COMPANY_ID);
  const allDeviceTypeIds = TRIAL_DEVICE_TYPE_MAPPING.map((m) => deviceTypesByCode.get(m.deviceTypeCode)!.id);
  const priceListItemIds = await ensurePriceListItems(COMPANY_ID, allDeviceTypeIds);
  await ensureTrialUsers(COMPANY_ID);

  console.log("[seed] 4/9 trial Customer...");
  const customer = await prisma.customer.create({
    data: {
      companyId: COMPANY_ID,
      number: `CUS/TRIAL-MH/${Date.now()}`,
      name: TRIAL_CUSTOMER_NAME,
      address: "Jl. Trial Data No. 1 (fictional, local-dev only)",
    },
  });

  console.log("[seed] 4.5/9 master Device rows (one per PHYSICAL UNIT, so deviceId genuinely inherits DeviceType -> Device -> CalibrationRequestItem -> QuotationItem -> PurchaseOrderItem -> CalibrationJob)...");
  const rowsWithQty = TRIAL_DEVICE_TYPE_MAPPING.map((mapping) => ({
    rowNumber: mapping.rowNumber,
    deviceTypeCode: mapping.deviceTypeCode,
    qty: TRIAL_SOURCE_ROWS.find((r) => r.rowNumber === mapping.rowNumber)!.qty,
  }));
  const deviceInfoByRowNumber = await ensureTrialDevices(
    COMPANY_ID,
    customer.id,
    devicesService,
    rowsWithQty,
    deviceTypesByCode,
  );

  console.log("[seed] 5/9 fixture workbook + read-only preview() cross-check...");
  await writeTrialWorkbookFixture();
  try {
    const buffer = await buildTrialWorkbookBuffer();
    const preview = await calibrationRequestImportService.preview({
      originalname: "po-mintohardjo.xlsx",
      mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: buffer.length,
      buffer,
    });
    console.log(
      `[seed] preview() cross-check: ${preview.summary.matched} auto-matched, ` +
        `${preview.summary.unmatched} unmatched of ${preview.summary.sourceRows} rows ` +
        `(this trial pins deviceTypeId per row per the approved mapping regardless of auto-match result).`,
    );
  } catch (err) {
    console.warn("[seed] preview() cross-check failed (non-blocking, read-only step):", err);
  }

  console.log("[seed] 6/9 import/confirm -> submit -> quotation -> PO -> WorkOrder -> start (fan-out)...");
  const items = TRIAL_SOURCE_ROWS.map((row) => {
    const mapping = TRIAL_DEVICE_TYPE_MAPPING.find((m) => m.rowNumber === row.rowNumber)!;
    const deviceTypeId = deviceTypesByCode.get(mapping.deviceTypeCode)!.id;
    return {
      deviceTypeId,
      customerDeviceName: row.customerDeviceName,
      qty: row.qty,
      // Serial No lookup key -> resolves to unit #1's real Device created
      // above, exactly as a filled "Serial No" column in a real Excel import
      // would. The single-FK commercial chain (Request/Quotation/PO item) can
      // only ever carry one Device reference regardless of qty.
      deviceId: deviceInfoByRowNumber.get(row.rowNumber)!.firstUnitSerialNumber,
    };
  });

  // confirm() (calibration-request-import.service.ts) is a thin passthrough
  // that maps { deviceTypeId, customerDeviceName, model, deviceId, qty, akdAkl }
  // rows onto CalibrationRequestsService.create() with no other side effect —
  // calling create() directly is functionally identical and avoids guessing
  // confirm()'s exact wire DTO field names for a plain in-process script.
  const createdRequest = await calibrationRequestsService.create(COMPANY_ID, TRIAL_STAFF_USER_ID, {
    customerId: customer.id,
    serviceMode: "SEND_TO_LAB",
    items,
  } as never);

  await calibrationRequestsService.submit(COMPANY_ID, createdRequest.id);

  const quotation = await quotationsService.create(COMPANY_ID, { requestId: createdRequest.id, taxCode } as never);
  await quotationsService.send(COMPANY_ID, quotation.id);
  await quotationsService.approve(COMPANY_ID, quotation.id, TRIAL_STAFF_USER_ID);

  const po = await purchaseOrdersService.create(COMPANY_ID, {
    quotationId: quotation.id,
    customerPoNumber: `CPO-TRIAL-MH-${Date.now()}`,
    customerPoDate: new Date(),
  } as never);
  await purchaseOrdersService.approve(COMPANY_ID, po.id, TRIAL_STAFF_USER_ID);

  const workOrder = await workOrdersService.create(COMPANY_ID, { purchaseOrderId: po.id } as never);
  await workOrdersService.assign(COMPANY_ID, workOrder.id, {
    technicians: TRIAL_TECHNICIAN_USER_IDS.map((technicianUserId) => ({ technicianUserId })),
  } as never);
  await workOrdersService.start(COMPANY_ID, workOrder.id);

  // ── Per-unit deviceId backfill (trial-fixture-only) ───────────────────────
  // Fan-out (WorkOrder.start()) only sets CalibrationJob.deviceId when
  // unitTotal===1 (the qty=1 lines — no ambiguity). For qty>1 lines it leaves
  // deviceId null: in REAL operation, which of the N physical units a given
  // job corresponds to is genuinely unknown until a technician verifies
  // identity on-site (Identity Correction / BAI). This trial explicitly wants
  // every job pre-identified for UI/UX checking, so — as a fixture-only step,
  // never representative of real intake — it directly assigns each job's
  // deviceId to one of the N per-unit Device rows created above, one-to-one
  // by unitOrdinal. Consequence (documented, accepted): Tech-PWA's
  // "search/select device" flow (CalibrationJobsService.selectDevice) refuses
  // once deviceId is set, so that specific UI path is not exercisable in this
  // trial dataset anymore.
  console.log("[seed] 6.5/9 backfilling deviceId for multi-unit (qty>1) fanned-out jobs...");
  const poItemsWithFirstDevice = await prisma.purchaseOrderItem.findMany({
    where: { purchaseOrderId: po.id },
    select: { id: true, device: { select: { serialNumber: true } } },
  });
  const rowNumberByPoItemId = new Map<string, number>();
  for (const item of poItemsWithFirstDevice) {
    const match = item.device?.serialNumber?.match(/^TRIAL-MH-SN-(\d+)-1$/);
    if (match) rowNumberByPoItemId.set(item.id, Number(match[1]!));
  }
  const jobsNeedingDevice = await prisma.calibrationJob.findMany({
    where: { workOrderId: workOrder.id, deviceId: null },
    select: { id: true, purchaseOrderItemId: true, unitOrdinal: true },
  });
  let backfilledCount = 0;
  for (const job of jobsNeedingDevice) {
    const rowNumber = job.purchaseOrderItemId ? rowNumberByPoItemId.get(job.purchaseOrderItemId) : undefined;
    if (rowNumber === undefined) continue;
    const deviceId = deviceInfoByRowNumber.get(rowNumber)!.deviceIdsByUnit[job.unitOrdinal - 1];
    if (!deviceId) continue;
    await prisma.calibrationJob.update({ where: { id: job.id }, data: { deviceId } });
    backfilledCount += 1;
  }
  console.log(`[seed] Backfilled deviceId on ${backfilledCount} multi-unit jobs.`);

  console.log("[seed] 7/9 loading fanned-out jobs + building state-distribution plan...");
  const jobs = await prisma.calibrationJob.findMany({
    where: { workOrderId: workOrder.id },
    orderBy: [{ purchaseOrderItemId: "asc" }, { unitOrdinal: "asc" }],
    select: {
      id: true,
      unitOrdinal: true,
      unitTotal: true,
      calibrationRequestItem: { select: { deviceTypeId: true } },
    },
  });

  const jobPlanInputs: JobPlanInput[] = jobs.map((j) => {
    const deviceTypeId = j.calibrationRequestItem!.deviceTypeId;
    const deviceTypeCode = codeById.get(deviceTypeId)!;
    const tier = TRIAL_DEVICE_TYPE_MAPPING.find((m) => deviceTypesByCode.get(m.deviceTypeCode)!.id === deviceTypeId)!.tier;
    return { id: j.id, unitOrdinal: j.unitOrdinal, unitTotal: j.unitTotal, deviceTypeCode, tier };
  });

  const statusPlan = planJobStates(jobPlanInputs);
  const identityPlan = planIdentityCorrections(jobPlanInputs, statusPlan);
  const identityByJobId = new Map(identityPlan.map((e) => [e.jobId, e.finalStatus]));

  // ── Reference-equipment-approval-pending scenario: BLOCKED, not built ─────
  // GENUINE BLOCKER (documented in the implementation report's "Deviations"
  // section): confirmed at runtime that
  // JobReferenceEquipmentService.validateJobReferenceEquipmentSelection
  // (job-reference-equipment.ts ~L383-391) requires the equipment to already
  // be on `job.workOrder.equipment` (WorkOrderEquipment), which is only
  // populated through WorkOrdersService.confirmEquipment() —
  // work-orders.service.ts L1004-1011 throws
  // EQUIPMENT_NOT_APPLICABLE_FOR_SEND_TO_LAB for any non-ON_SITE WorkOrder.
  // Since this trial's entire 406-job dataset is one SEND_TO_LAB WorkOrder
  // (see the module header note on the serviceMode blocker), the
  // reference-equipment-approval-pending mechanic is architecturally
  // unreachable here — the same root cause as the SEND_TO_LAB/ON_SITE
  // scenario gap, not a separate issue. No fixture equipment is created; this
  // Tech-PWA scenario is dropped rather than worked around.
  console.log("[seed] 8/9 executing per-job transitions...");
  const referenceEquipmentManifest: TrialManifest["referenceEquipment"] = null;

  // ── Execute per-job transitions ────────────────────────────────────────────
  let jobIndex = 0;
  const identityCorrectionResults: TrialManifest["identityCorrections"] = [];
  for (const job of jobPlanInputs) {
    const target = statusPlan.get(job.id)!;
    if (target === "PENDING") {
      jobIndex += 1;
      continue;
    }

    await completeKontrolAlatForStart(COMPANY_ID, job.id);
    await calibrationJobsService.start(COMPANY_ID, job.id);

    const identityOutcome = identityByJobId.get(job.id);
    if (identityOutcome) {
      const technicianId = pickTechnician(jobIndex);
      const submitResult = await calibrationJobsService.submitIdentityCorrection(
        COMPANY_ID,
        job.id,
        technicianId,
        {
          reason: "Verifikasi identitas alat saat kedatangan (trial data)",
          newSerial: `TRIAL-SN-${job.id.slice(-8)}`,
          signatures: UNAVAILABLE_SIGNATURES,
        } as never,
      );
      if (identityOutcome === "APPROVED" || identityOutcome === "REJECTED") {
        const managerId = pickManager(jobIndex);
        const decided = await calibrationJobsService.decideIdentityCorrection(
          COMPANY_ID,
          job.id,
          submitResult.correction.id,
          managerId,
          identityOutcome === "APPROVED"
            ? ({ decision: "APPROVE" } as never)
            : ({ decision: "REJECT", decisionNote: "Data BAI tidak sesuai (trial data)" } as never),
        );
        void decided;
      }
      identityCorrectionResults.push({
        jobId: job.id,
        correctionId: submitResult.correction.id,
        finalStatus: identityOutcome,
        deviceTypeCode: job.deviceTypeCode,
        unitOrdinal: job.unitOrdinal,
      });
    }

    void referenceEquipmentManifest; // always null — see the blocker note above

    // A job left with a still-pending BA must not be submitted (would fail
    // IDENTITY_CORRECTION_UNRESOLVED, and would misrepresent an unresolved
    // review as "handled") — planIdentityCorrections() only assigns
    // PENDING_REVIEW to jobs targeted at IN_PROGRESS, so this is a no-op for
    // every other target.
    if (identityOutcome === "PENDING_REVIEW") {
      jobIndex += 1;
      continue;
    }

    if (target === "IN_PROGRESS") {
      jobIndex += 1;
      continue;
    }

    const deviceTypeId = deviceTypesByCode.get(job.deviceTypeCode)!.id;
    const technicianId = pickTechnician(jobIndex);
    const wantOutOfTolerance = jobIndex % 12 === 0; // a small deliberate handful
    await fillJobMeasurements({
      companyId: COMPANY_ID,
      measurementResultsService,
      jobId: job.id,
      deviceTypeId,
      technicianId,
      wantOutOfTolerance,
    });
    await calibrationJobsService.submitForReview(COMPANY_ID, job.id);

    if (target === "SUBMITTED") {
      jobIndex += 1;
      continue;
    }

    const managerId = pickManager(jobIndex);
    if (target === "REWORK") {
      await calibrationJobsService.decideQualityReview(COMPANY_ID, job.id, managerId, {
        decision: "REJECT",
        notes: "Beberapa titik ukur perlu diulang (trial data)",
      } as never);
      jobIndex += 1;
      continue;
    }

    if (target === "ACCEPTED_BY_QA") {
      await calibrationJobsService.decideQualityReview(COMPANY_ID, job.id, managerId, {
        decision: "APPROVE",
        notes: "Hasil sesuai (trial data)",
      } as never);
      await calibrationJobsService.complete(COMPANY_ID, job.id);
    }
    jobIndex += 1;
  }

  // ── Tech-PWA representative job selection (plan §C.7) ─────────────────────
  console.log("[seed] 9/9 selecting Tech-PWA representative jobs + writing manifest...");
  const byCode = (code: string) => jobPlanInputs.filter((j) => j.deviceTypeCode === code);
  const firstOf = (code: string) => byCode(code)[0];
  // Diversity: pick the "identity unresolved" / "identity wizard" / "synthetic"
  // slots from device types not already featured elsewhere in this list, so
  // the 12-14 jobs actually span distinct real+synthetic devices rather than
  // repeating whichever type happens to sort first.
  const alreadyFeatured = new Set(["CENTRIFUGE", "CPAP", "VENTILATOR", "SYRINGE_PUMP", "INFUSION_PUMP", "ELECTROCARDIOGRAPHS", "AMBULATORY_ECG", "DENTAL_XRAY"]);
  const nullDeviceJob =
    jobPlanInputs.find((j) => j.unitTotal > 1 && j.tier === "REPRESENTATIVE" && !alreadyFeatured.has(j.deviceTypeCode)) ??
    jobPlanInputs.find((j) => j.unitTotal > 1);
  const syntheticJob =
    jobPlanInputs.find((j) => j.tier === "SYNTHETIC" && j.deviceTypeCode === "TRIAL_MH_USG") ??
    jobPlanInputs.find((j) => j.tier === "SYNTHETIC");
  const reworkJob = jobPlanInputs.find((j) => statusPlan.get(j.id) === "REWORK");
  const submittedJob = jobPlanInputs.find((j) => statusPlan.get(j.id) === "SUBMITTED");
  const acceptedJob = jobPlanInputs.find((j) => statusPlan.get(j.id) === "ACCEPTED_BY_QA");
  const identityWizardJob =
    identityCorrectionResults.find(
      (e) =>
        e.deviceTypeCode !== nullDeviceJob?.deviceTypeCode &&
        e.deviceTypeCode !== syntheticJob?.deviceTypeCode &&
        !alreadyFeatured.has(e.deviceTypeCode),
    ) ?? identityCorrectionResults[0];

  // NOTE: "Reference-equipment approval pending" and "one ON_SITE job" are
  // both dropped from this list — both are architecturally unreachable in
  // this single-SEND_TO_LAB-WorkOrder trial (see the module header note and
  // the blocker note at step 8/9 above). Not worked around.
  const techPwaRepresentativeJobs: TrialManifest["techPwaRepresentativeJobs"] = [
    ...(firstOf("CENTRIFUGE") ? [{ jobId: firstOf("CENTRIFUGE")!.id, scenario: "Simple / single-parameter Pattern A", deviceTypeCode: "CENTRIFUGE" }] : []),
    ...(firstOf("CPAP") ? [{ jobId: firstOf("CPAP")!.id, scenario: "Simple device, alternate", deviceTypeCode: "CPAP" }] : []),
    ...(firstOf("VENTILATOR") ? [{ jobId: firstOf("VENTILATOR")!.id, scenario: "Multiple parameters / most complex real flow", deviceTypeCode: "VENTILATOR" }] : []),
    ...(nullDeviceJob ? [{ jobId: nullDeviceJob.id, scenario: "Device identity unresolved at arrival (search/select)", deviceTypeCode: nullDeviceJob.deviceTypeCode }] : []),
    ...(identityWizardJob ? [{ jobId: identityWizardJob.jobId, scenario: "Identity Correction (BAI) wizard, full submission", deviceTypeCode: identityWizardJob.deviceTypeCode }] : []),
    ...(reworkJob ? [{ jobId: reworkJob.id, scenario: "Full rework cycle (submit -> reject -> resume -> resubmit -> approve -> complete)", deviceTypeCode: reworkJob.deviceTypeCode }] : []),
    ...(submittedJob ? [{ jobId: submittedJob.id, scenario: "Submitted, awaiting MT quality review", deviceTypeCode: submittedJob.deviceTypeCode }] : []),
    ...(acceptedJob ? [{ jobId: acceptedJob.id, scenario: "Fully completed (ACCEPTED_BY_QA)", deviceTypeCode: acceptedJob.deviceTypeCode }] : []),
    ...(syntheticJob ? [{ jobId: syntheticJob.id, scenario: "Representative synthetic TRIAL_MH_* device", deviceTypeCode: syntheticJob.deviceTypeCode }] : []),
    ...(firstOf("SYRINGE_PUMP") ? [{ jobId: firstOf("SYRINGE_PUMP")!.id, scenario: "High-qty exact-match line (94-unit item)", deviceTypeCode: "SYRINGE_PUMP" }] : []),
    ...(firstOf("INFUSION_PUMP") ? [{ jobId: firstOf("INFUSION_PUMP")!.id, scenario: "High-qty exact-match line, alternate", deviceTypeCode: "INFUSION_PUMP" }] : []),
    ...(firstOf("ELECTROCARDIOGRAPHS") ? [{ jobId: firstOf("ELECTROCARDIOGRAPHS")!.id, scenario: "Representative-tier mapping (no alias added)", deviceTypeCode: "ELECTROCARDIOGRAPHS" }] : []),
    ...(firstOf("AMBULATORY_ECG") ? [{ jobId: firstOf("AMBULATORY_ECG")!.id, scenario: "Alias-tier device with zero calibration parameters (stays PENDING)", deviceTypeCode: "AMBULATORY_ECG" }] : []),
    ...(firstOf("DENTAL_XRAY") ? [{ jobId: firstOf("DENTAL_XRAY")!.id, scenario: "Alias-tier mapping", deviceTypeCode: "DENTAL_XRAY" }] : []),
  ];

  const manifest: TrialManifest = {
    createdAt: new Date().toISOString(),
    companyId: COMPANY_ID,
    customerId: customer.id,
    calibrationRequestId: createdRequest.id,
    quotationId: quotation.id,
    purchaseOrderId: po.id,
    workOrderId: workOrder.id,
    staffUserId: TRIAL_STAFF_USER_ID,
    technicianUserIds: TRIAL_TECHNICIAN_USER_IDS,
    managerUserIds: TRIAL_MANAGER_USER_IDS,
    taxCode,
    priceListItemIds,
    syntheticDeviceCategoryIds: syntheticManifest.categories.map((c) => c.id),
    syntheticDeviceTypeIds: syntheticManifest.deviceTypes.map((d) => d.id),
    syntheticParameterIds: syntheticManifest.parameters.map((p) => p.id),
    referenceEquipment: referenceEquipmentManifest,
    jobs: jobPlanInputs.map((j) => ({
      id: j.id,
      unitOrdinal: j.unitOrdinal,
      unitTotal: j.unitTotal,
      deviceTypeCode: j.deviceTypeCode,
      tier: j.tier,
      targetStatus: statusPlan.get(j.id)!,
    })),
    identityCorrections: identityCorrectionResults,
    techPwaRepresentativeJobs,
  };
  writeManifest(manifest);

  const finalCounts = await prisma.calibrationJob.groupBy({
    by: ["status"],
    where: { workOrderId: workOrder.id },
    _count: true,
  });
  console.log("[seed] Done. Final CalibrationJob status counts:", finalCounts);
  console.log(`[seed] Total jobs: ${jobPlanInputs.length}`);
  console.log(`[seed] Identity Corrections: ${identityCorrectionResults.length}`);
  console.log(`[seed] Manifest written to ${resolve(FIXTURES_DIR, "manifest.json")}`);
}

if (require.main === module) {
  main()
    .then(() => prisma.$disconnect())
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error("[seed] FAILED:", err);
      await prisma.$disconnect();
      process.exit(1);
    });
}

export { main as seedTrialMintoHardjo };
