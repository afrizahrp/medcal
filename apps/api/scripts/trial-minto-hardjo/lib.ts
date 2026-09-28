/**
 * Minto Hardjo High-Volume Calibration Trial — shared orchestration helpers.
 *
 * Used by both seed.ts and reset.ts. Everything here calls real, unmodified
 * service methods / plain Prisma reads — no raw status writes on any
 * transaction table. See docs/claude/plans/Calibration-management/
 * MINTO-HARDJO-HIGH-VOLUME-TRIAL-IMPLEMENTATION-PLAN.md for the design this
 * implements.
 *
 * Relocation note (deviation from the plan's literal file layout): the plan
 * put orchestration scripts under packages/db/scripts/. That would make
 * packages/db import apps/api's NestJS services — the wrong dependency
 * direction for this monorepo (packages/db must never import from apps/api).
 * These scripts live under apps/api/scripts/trial-minto-hardjo/ instead,
 * calling the real services in-process exactly as
 * apps/api/src/modules/calibration-jobs/calibration-jobs.service.test.ts does
 * (plain `new XyzService()`, no HTTP layer, no auth mocking).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as ExcelJS from "exceljs";
import { Prisma, prisma } from "@medcal/db";
import {
  TRIAL_SOURCE_ROWS,
  type TrialSourceRow,
} from "../../../../packages/db/fixtures/trial-minto-hardjo/source-rows";
import {
  TRIAL_DEVICE_TYPE_MAPPING,
  type TrialDeviceTypeMappingRow,
} from "../../../../packages/db/fixtures/trial-minto-hardjo/device-type-mapping";
import { MeasurementResultsService } from "../../src/modules/calibration-jobs/measurement-results.service";

export const TRIAL_CUSTOMER_NAME = "RS Minto Hardjo (Trial)";
export const TRIAL_STAFF_USER_ID = "trial-mh-staff-user";
export const TRIAL_TECHNICIAN_USER_IDS = [
  "trial-mh-tech-1",
  "trial-mh-tech-2",
  "trial-mh-tech-3",
  "trial-mh-tech-4",
];
export const TRIAL_MANAGER_USER_IDS = ["trial-mh-manager-1", "trial-mh-manager-2"];

export const FIXTURES_DIR = resolve(__dirname, "../../../../packages/db/fixtures/trial-minto-hardjo");
export const MANIFEST_PATH = resolve(FIXTURES_DIR, "manifest.json");

export interface TrialManifest {
  createdAt: string;
  companyId: string;
  customerId: string;
  calibrationRequestId: string;
  quotationId: string;
  purchaseOrderId: string;
  workOrderId: string;
  staffUserId: string;
  technicianUserIds: string[];
  managerUserIds: string[];
  taxCode: string;
  priceListItemIds: string[];
  syntheticDeviceCategoryIds: string[];
  syntheticDeviceTypeIds: string[];
  syntheticParameterIds: string[];
  referenceEquipment: {
    equipmentTypeId: string;
    equipmentId: string;
    equipmentCalibrationRecordId: string;
    deviceTypeEquipmentRequirementId: string;
    jobId: string;
  } | null;
  jobs: Array<{
    id: string;
    unitOrdinal: number;
    unitTotal: number;
    deviceTypeCode: string;
    tier: TrialDeviceTypeMappingRow["tier"];
    targetStatus: "PENDING" | "IN_PROGRESS" | "SUBMITTED" | "REWORK" | "ACCEPTED_BY_QA";
  }>;
  identityCorrections: Array<{
    jobId: string;
    correctionId: string;
    finalStatus: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
    deviceTypeCode: string;
    unitOrdinal: number;
  }>;
  techPwaRepresentativeJobs: Array<{ jobId: string; scenario: string; deviceTypeCode: string }>;
}

export function writeManifest(manifest: TrialManifest): void {
  mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
}

export function readManifest(): TrialManifest | null {
  if (!existsSync(MANIFEST_PATH)) return null;
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")) as TrialManifest;
}

// ── Fixture workbook (same shape a real upload would have) ──────────────────
export async function buildTrialWorkbookBuffer(rows: readonly TrialSourceRow[] = TRIAL_SOURCE_ROWS): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Data Alat");
  sheet.columns = [
    { header: "Nama Alat", key: "namaAlat", width: 40 },
    { header: "Model", key: "model", width: 20 },
    { header: "Qty", key: "qty", width: 10 },
    { header: "Serial No", key: "deviceId", width: 20 },
  ];
  for (const row of rows) {
    sheet.addRow({ namaAlat: row.customerDeviceName, model: "", qty: row.qty, deviceId: "" });
  }
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export function writeTrialWorkbookFixture(): Promise<void> {
  return buildTrialWorkbookBuffer().then((buffer) => {
    mkdirSync(FIXTURES_DIR, { recursive: true });
    writeFileSync(resolve(FIXTURES_DIR, "po-mintohardjo.xlsx"), buffer);
  });
}

// ── Master-data resolution ───────────────────────────────────────────────────
export async function resolveDeviceTypeIdsByCode(): Promise<Map<string, { id: string; code: string }>> {
  const codes = [...new Set(TRIAL_DEVICE_TYPE_MAPPING.map((m) => m.deviceTypeCode))];
  const rows = await prisma.deviceType.findMany({
    where: { code: { in: codes } },
    select: { id: true, code: true },
  });
  const byCode = new Map(rows.map((r) => [r.code, r]));
  const missing = codes.filter((c) => !byCode.has(c));
  if (missing.length > 0) {
    throw new Error(
      `Cannot resolve DeviceType.code for: ${missing.join(", ")}. Run seed:trial-minto-hardjo-device-types first.`,
    );
  }
  return byCode;
}

export async function ensureNonPpnTax(companyId: string): Promise<string> {
  const code = "T0";
  const existing = await prisma.tax.findUnique({ where: { companyId_taxCode: { companyId, taxCode: code } } });
  if (existing) return code;
  await prisma.tax.create({
    data: { companyId, taxCode: code, taxRate: 0, isExclude: false, description: "Non PPN" },
  });
  return code;
}

/** Only creates a PriceListItem for a deviceTypeId that doesn't already have an active one. */
export async function ensurePriceListItems(
  companyId: string,
  deviceTypeIds: readonly string[],
): Promise<string[]> {
  const created: string[] = [];
  for (const deviceTypeId of [...new Set(deviceTypeIds)]) {
    const existing = await prisma.priceListItem.findFirst({
      where: { companyId, deviceTypeId, effectiveFrom: { lte: new Date() } },
    });
    if (existing) continue;
    const row = await prisma.priceListItem.create({
      data: {
        companyId,
        deviceTypeId,
        unitPrice: new Prisma.Decimal(150_000),
        effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
      },
    });
    created.push(row.id);
  }
  return created;
}

export async function ensureTrialUsers(companyId: string): Promise<void> {
  await prisma.user.upsert({
    where: { id: TRIAL_STAFF_USER_ID },
    create: { id: TRIAL_STAFF_USER_ID, email: `${TRIAL_STAFF_USER_ID}@medcal.test`, name: "Trial MH Staff", status: "ACTIVE" },
    update: { status: "ACTIVE" },
  });
  await prisma.userMembership.upsert({
    where: { userId_companyId: { userId: TRIAL_STAFF_USER_ID, companyId } },
    create: { userId: TRIAL_STAFF_USER_ID, companyId, role: "ADMIN", isDefault: true },
    update: {},
  });

  for (const [i, id] of TRIAL_TECHNICIAN_USER_IDS.entries()) {
    await prisma.user.upsert({
      where: { id },
      create: { id, email: `${id}@medcal.test`, name: `Teknisi Trial ${i + 1}`, status: "ACTIVE" },
      update: { status: "ACTIVE" },
    });
    await prisma.userMembership.upsert({
      where: { userId_companyId: { userId: id, companyId } },
      create: { userId: id, companyId, role: "TECHNICIAN", isDefault: false },
      update: {},
    });
  }

  for (const [i, id] of TRIAL_MANAGER_USER_IDS.entries()) {
    await prisma.user.upsert({
      where: { id },
      create: { id, email: `${id}@medcal.test`, name: `Manajer Trial ${i + 1}`, status: "ACTIVE" },
      update: { status: "ACTIVE" },
    });
    await prisma.userMembership.upsert({
      where: { userId_companyId: { userId: id, companyId } },
      create: { userId: id, companyId, role: "TECHNICIAN_MANAGER", isDefault: false },
      update: {},
    });
  }
}

// ── Kontrol Alat start-gate (every job in this trial is SEND_TO_LAB) ────────
export async function completeKontrolAlatForStart(companyId: string, jobId: string): Promise<void> {
  const row = await prisma.kontrolAlat.findUniqueOrThrow({ where: { calibrationJobId: jobId } });
  const signedAt = new Date();
  await prisma.$transaction([
    prisma.kontrolAlat.update({
      where: { id: row.id },
      data: { workExecuted: true, completedAt: signedAt, functionInitialOk: true },
    }),
    prisma.kontrolAlatSignature.upsert({
      where: { kontrolAlatId_signerKind: { kontrolAlatId: row.id, signerKind: "ADMINISTRATION" } },
      create: { companyId, kontrolAlatId: row.id, signerKind: "ADMINISTRATION", signerName: "Admin Trial", signedAt },
      update: { signedAt, signerName: "Admin Trial" },
    }),
    prisma.kontrolAlatSignature.upsert({
      where: { kontrolAlatId_signerKind: { kontrolAlatId: row.id, signerKind: "TECHNICAL_OFFICER" } },
      create: { companyId, kontrolAlatId: row.id, signerKind: "TECHNICAL_OFFICER", signerName: "Petugas Teknis Trial", signedAt },
      update: { signedAt, signerName: "Petugas Teknis Trial" },
    }),
  ]);
}

// ── Measurement completeness filler (mirrors assertMeasurementsCompleteForSubmit) ──
const EXCLUDED_PARAMETER_CODES = new Set<string>(["SUCT_VACUUM_GAUGE"]);

export async function fillJobMeasurements(params: {
  companyId: string;
  measurementResultsService: MeasurementResultsService;
  jobId: string;
  deviceTypeId: string;
  technicianId: string;
  wantOutOfTolerance?: boolean;
}): Promise<void> {
  const { companyId, measurementResultsService, jobId, deviceTypeId, technicianId, wantOutOfTolerance } = params;

  const eligible = await prisma.deviceCalibrationParameter.findMany({
    where: { deviceTypeId, isActive: true, valueType: "NUMBER", entryStyle: "DIRECT_REPLICATES" },
    select: { id: true, code: true, toleranceMin: true, toleranceMax: true, decimalPlaces: true },
  });
  const filtered = eligible.filter((p) => !EXCLUDED_PARAMETER_CODES.has(p.code));
  if (filtered.length === 0) return;

  // Pattern B: the frozen JobCalibrationTestPoint snapshot already carries the
  // RESOLVED per-point bounds (copied at start() from whichever source won the
  // tolerance priority chain — explicit test-point override, or a "± X%" note
  // resolved against that point's own settingValue). Reading the *parameter*-
  // level toleranceMin/Max here would be wrong for exactly this case (those
  // columns are frequently NULL on a Pattern-B parameter whose bounds live
  // only in the per-point note) — this must read the snapshot's own resolved
  // bounds, never guess a flat fallback range.
  const snapshotRows = await prisma.jobCalibrationTestPoint.findMany({
    where: { calibrationJobId: jobId, excludedAt: null },
    select: {
      deviceCalibrationParameterId: true,
      sourceCalibrationTestPointId: true,
      toleranceMin: true,
      toleranceMax: true,
      settingValue: true,
    },
  });
  const testPointsByParam = new Map<
    string,
    Array<{ id: string; min: number | null; max: number | null; settingValue: number | null }>
  >();
  for (const row of snapshotRows) {
    const list = testPointsByParam.get(row.deviceCalibrationParameterId) ?? [];
    list.push({
      id: row.sourceCalibrationTestPointId,
      min: row.toleranceMin ? row.toleranceMin.toNumber() : null,
      max: row.toleranceMax ? row.toleranceMax.toNumber() : null,
      settingValue: row.settingValue ? row.settingValue.toNumber() : null,
    });
    testPointsByParam.set(row.deviceCalibrationParameterId, list);
  }

  let outOfToleranceUsed = false;
  for (const param of filtered) {
    const dp = param.decimalPlaces ?? 0;
    const points = testPointsByParam.get(param.id);

    if (!points || points.length === 0) {
      // Pattern A: use the parameter's own bounds when set; otherwise there is
      // genuinely no resolvable tolerance for this parameter (toleranceNote-only
      // percentage bounds need a nominal value this generic filler does not
      // supply) — record a plausible mid-range reading and let
      // isWithinTolerance come back unresolved rather than fabricating a
      // false in/out-of-tolerance verdict.
      const min = param.toleranceMin ? param.toleranceMin.toNumber() : 0;
      const max = param.toleranceMax ? param.toleranceMax.toNumber() : 100;
      const useOutOfTolerance = Boolean(wantOutOfTolerance) && !outOfToleranceUsed;
      const rawValue = useOutOfTolerance ? max + Math.max(1, (max - min) * 0.5) : (min + max) / 2;
      if (useOutOfTolerance) outOfToleranceUsed = true;
      await measurementResultsService.create(
        companyId,
        {
          calibrationJobId: jobId,
          deviceCalibrationParameterId: param.id,
          replicateIndex: 1,
          measuredValue: Number(rawValue.toFixed(dp)),
        },
        technicianId,
      );
      continue;
    }

    for (const point of points) {
      const min = point.min ?? point.settingValue ?? 0;
      const max = point.max ?? point.settingValue ?? 100;
      const useOutOfTolerance = Boolean(wantOutOfTolerance) && !outOfToleranceUsed;
      const rawValue = useOutOfTolerance ? max + Math.max(1, (max - min) * 0.5 || 1) : (min + max) / 2;
      if (useOutOfTolerance) outOfToleranceUsed = true;

      await measurementResultsService.create(
        companyId,
        {
          calibrationJobId: jobId,
          deviceCalibrationParameterId: param.id,
          calibrationTestPointId: point.id,
          replicateIndex: 1,
          measuredValue: Number(rawValue.toFixed(dp)),
        },
        technicianId,
      );
    }
  }
}

// ── Deterministic state-distribution planner (plan §C.5) ────────────────────
export type TargetStatus = "PENDING" | "IN_PROGRESS" | "SUBMITTED" | "REWORK" | "ACCEPTED_BY_QA";

export interface JobPlanInput {
  id: string;
  unitOrdinal: number;
  unitTotal: number;
  deviceTypeCode: string;
  tier: TrialDeviceTypeMappingRow["tier"];
}

/**
 * Assigns a target terminal status to every job, honoring the ~60/15/10/4/11%
 * split (plan §C.5) while forcing every Ambulatory ECG (Holter alias) job to
 * PENDING — that DeviceType has zero calibration parameters (plan §C.2).
 * Deterministic (no RNG): walks jobs in a fixed round-robin so the same input
 * order always yields the same distribution (reproducible reseed, plan
 * decision 9).
 */
export function planJobStates(jobs: readonly JobPlanInput[]): Map<string, TargetStatus> {
  const plan = new Map<string, TargetStatus>();
  const eligible = jobs.filter((j) => j.deviceTypeCode !== "AMBULATORY_ECG");
  for (const j of jobs) {
    if (j.deviceTypeCode === "AMBULATORY_ECG") plan.set(j.id, "PENDING");
  }

  const total = eligible.length;
  const targetCounts: Record<Exclude<TargetStatus, "PENDING">, number> = {
    IN_PROGRESS: Math.round(total * 0.15),
    SUBMITTED: Math.round(total * 0.1),
    REWORK: Math.round(total * 0.04),
    ACCEPTED_BY_QA: Math.round(total * 0.11),
  };

  // Spread selections evenly across the eligible list (stride sampling) rather
  // than taking contiguous blocks, so every non-PENDING bucket is scattered
  // across device types/lines instead of clustering on whichever line sorts
  // first.
  const order: Array<Exclude<TargetStatus, "PENDING">> = ["IN_PROGRESS", "SUBMITTED", "REWORK", "ACCEPTED_BY_QA"];
  const assigned = new Set<string>();
  let cursor = 0;
  for (const status of order) {
    const count = targetCounts[status];
    const stride = Math.max(1, Math.floor(total / Math.max(1, count)));
    let placed = 0;
    let i = cursor % total;
    let guard = 0;
    while (placed < count && guard < total * 2) {
      const job = eligible[i]!;
      if (!assigned.has(job.id)) {
        plan.set(job.id, status);
        assigned.add(job.id);
        placed += 1;
        i = (i + stride) % total;
      } else {
        i = (i + 1) % total;
      }
      guard += 1;
    }
    cursor += 1;
  }
  for (const j of eligible) {
    if (!plan.has(j.id)) plan.set(j.id, "PENDING");
  }
  return plan;
}

export interface IdentityCorrectionPlanEntry {
  jobId: string;
  finalStatus: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
}

/**
 * Picks ~28 jobs for an IdentityCorrection, deliberately spread across
 * device types and unitOrdinal positions (plan §C.6) — never clustered on one
 * line or on unitOrdinal 1. Only chooses jobs whose planned status keeps the
 * identity gate open long enough to act (PENDING or IN_PROGRESS — SUBMITTED/
 * ACCEPTED_BY_QA jobs have already passed the identity gate boundary,
 * IDENTITY_LOCKED_JOB_STATUSES in calibration-jobs.service.ts).
 */
function scatterPick(candidates: readonly JobPlanInput[], wanted: number): JobPlanInput[] {
  const byType = new Map<string, JobPlanInput[]>();
  for (const c of candidates) {
    const list = byType.get(c.deviceTypeCode) ?? [];
    list.push(c);
    byType.set(c.deviceTypeCode, list);
  }
  for (const list of byType.values()) list.sort((a, b) => a.unitOrdinal - b.unitOrdinal);

  const types = [...byType.keys()];
  if (types.length === 0) return [];
  const picks: JobPlanInput[] = [];
  const perTypeCursor = new Map<string, number>();
  let typeIndex = 0;
  let guard = 0;
  while (picks.length < wanted && guard < wanted * 30 && picks.length < candidates.length) {
    const type = types[typeIndex % types.length]!;
    const list = byType.get(type)!;
    const cursor = perTypeCursor.get(type) ?? 0;
    // Scatter: stride through this type's own ordinal-sorted list so picks
    // land on different unitOrdinal positions, not always #1.
    const idx = (cursor * 3 + Math.floor(typeIndex / types.length)) % list.length;
    const candidate = list[idx];
    if (candidate && !picks.includes(candidate)) {
      picks.push(candidate);
      perTypeCursor.set(type, cursor + 1);
    }
    typeIndex += 1;
    guard += 1;
  }
  return picks;
}

/**
 * jobs already staged for the "decided" (APPROVE/REJECT) bucket are excluded
 * from the "still pending" pool so the same job is never picked twice.
 */
export function planIdentityCorrections(
  jobs: readonly JobPlanInput[],
  statusPlan: Map<string, TargetStatus>,
): IdentityCorrectionPlanEntry[] {
  // A decided (APPROVE/REJECT) correction re-opens the identity gate
  // afterwards, so these can be drawn from jobs headed anywhere past
  // IN_PROGRESS. A correction left PENDING_REVIEW forever must NOT block a
  // later submitForReview, so it may only land on jobs whose OWN target
  // status stops at IN_PROGRESS (the job is never submitted in this seed).
  const decidedCandidates = jobs.filter((j) => {
    const status = statusPlan.get(j.id);
    return status === "SUBMITTED" || status === "REWORK" || status === "ACCEPTED_BY_QA";
  });
  const decidedPicks = scatterPick(decidedCandidates, 6);
  const decidedIds = new Set(decidedPicks.map((j) => j.id));

  const pendingCandidates = jobs.filter(
    (j) => statusPlan.get(j.id) === "IN_PROGRESS" && !decidedIds.has(j.id),
  );
  const pendingPicks = scatterPick(pendingCandidates, 22);

  const entries: IdentityCorrectionPlanEntry[] = [];
  for (const job of pendingPicks) entries.push({ jobId: job.id, finalStatus: "PENDING_REVIEW" });
  decidedPicks.forEach((job, i) => {
    entries.push({ jobId: job.id, finalStatus: i % 3 === 0 ? "REJECTED" : "APPROVED" });
  });
  return entries;
}
