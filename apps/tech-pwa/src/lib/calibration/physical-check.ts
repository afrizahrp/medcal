import type { CalibrationJobStatus } from "./types";

/**
 * Physical Inspection — Tech-PWA helpers.
 *
 * Separate domain from MeasurementResult: catalog DevicePhysicalCheckItem →
 * PhysicalCheckResult with verdict BAIK | TIDAK_BAIK (+ optional note).
 * Lock / REWORK / attempt filtering mirror measurement.ts (IN_PROGRESS only;
 * REWORK section visible but locked; no copy-forward).
 */

export const PHYSICAL_CHECK_VERDICTS = ["BAIK", "TIDAK_BAIK"] as const;
export type PhysicalCheckVerdict = (typeof PHYSICAL_CHECK_VERDICTS)[number];

// ── API response mirrors ─────────────────────────────────────────────────────

export interface TechPhysicalCheckItem {
  id: string;
  deviceTypeId: string;
  code: string;
  name: string;
  inspectionLimit: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TechPhysicalCheckResult {
  id: string;
  companyId: string;
  calibrationJobId: string;
  devicePhysicalCheckItemId: string;
  attemptNumber: number;
  verdict: PhysicalCheckVerdict;
  note: string | null;
  inspectionLimitSnapshot: string;
  recordedByUserId: string | null;
  recordedAt: string;
  createdAt: string;
  updatedAt: string;
  devicePhysicalCheckItem?: Pick<
    TechPhysicalCheckItem,
    "id" | "deviceTypeId" | "code" | "name" | "inspectionLimit" | "sortOrder" | "isActive"
  >;
}

/** One item of `POST .../physical-check-results/batch`. */
export interface PhysicalCheckBatchItem {
  devicePhysicalCheckItemId: string;
  verdict: PhysicalCheckVerdict;
  note?: string | null;
}

/** Editable subset for `PATCH .../physical-check-results/:resultId`. */
export interface PhysicalCheckUpdateInput {
  verdict?: PhysicalCheckVerdict;
  note?: string | null;
}

export interface PhysicalCheckDraft {
  verdict: PhysicalCheckVerdict | null;
  note: string;
}

// ── Lock state (mirrors MEASUREMENT / PHYSICAL_CHECK_LOCKED_JOB_STATUSES) ────

const PHYSICAL_CHECK_LOCKED_JOB_STATUSES: readonly CalibrationJobStatus[] = [
  "SUBMITTED",
  "ACCEPTED_BY_QA",
];

export function isPhysicalCheckLocked(job: { status: CalibrationJobStatus }): boolean {
  return PHYSICAL_CHECK_LOCKED_JOB_STATUSES.includes(job.status);
}

/** Entry is possible only while the job's current attempt is IN_PROGRESS. */
export function canRecordPhysicalCheck(job: {
  status: CalibrationJobStatus;
  startedAt: string | null;
}): boolean {
  return job.status === "IN_PROGRESS" && job.startedAt !== null;
}

/**
 * Section visibility is separate from editability. REWORK keeps Pemeriksaan Fisik
 * visible (locked) even when the new attempt has zero rows.
 */
export function shouldShowPhysicalCheckSection(
  job: { status: CalibrationJobStatus },
  hasRecordCapability: boolean,
  hasCurrentAttemptRows: boolean,
): boolean {
  return (
    hasRecordCapability &&
    (job.status === "IN_PROGRESS" || job.status === "REWORK" || hasCurrentAttemptRows)
  );
}

/** Human reason the entry UI is read-only, or null when it is editable. */
export function physicalCheckLockedReason(job: {
  status: CalibrationJobStatus;
  startedAt: string | null;
}): string | null {
  if (job.startedAt === null || job.status === "PENDING") {
    return "Job belum dimulai — pemeriksaan fisik dicatat setelah kalibrasi berjalan.";
  }
  if (isPhysicalCheckLocked(job)) {
    return "Job sudah dikirim — pemeriksaan fisik terkunci.";
  }
  if (job.status === "REWORK") {
    return "Job dikembalikan untuk perbaikan — mulai ulang attempt sebelum mencatat pemeriksaan fisik.";
  }
  if (job.status !== "IN_PROGRESS") {
    return "Pemeriksaan fisik hanya dapat dicatat saat job berlangsung.";
  }
  return null;
}

// ── Attempt filter / status / save plan (pure) ───────────────────────────────

/** Rows belonging to the job's current attempt (backend stamps attemptNumber). */
export function filterCurrentAttemptResults<T extends { attemptNumber: number }>(
  results: T[],
  currentAttempt: number,
): T[] {
  return results.filter((r) => r.attemptNumber === currentAttempt);
}

export interface PhysicalCheckEntryStatus {
  filled: number;
  total: number;
  complete: boolean;
  anyTidakBaik: boolean;
}

/**
 * Fold current-attempt results against the catalog into a compact "n/total"
 * summary. Does not invent PASS/FAIL at job level.
 */
export function physicalCheckEntryStatus(
  catalog: Pick<TechPhysicalCheckItem, "id">[],
  currentAttemptResults: Pick<
    TechPhysicalCheckResult,
    "devicePhysicalCheckItemId" | "verdict"
  >[],
): PhysicalCheckEntryStatus {
  const byItem = new Map(
    currentAttemptResults.map((r) => [r.devicePhysicalCheckItemId, r] as const),
  );
  let filled = 0;
  let anyTidakBaik = false;
  for (const item of catalog) {
    const row = byItem.get(item.id);
    if (!row) continue;
    filled += 1;
    if (row.verdict === "TIDAK_BAIK") anyTidakBaik = true;
  }
  const total = catalog.length;
  return {
    filled,
    total,
    complete: total > 0 && filled >= total,
    anyTidakBaik,
  };
}

export type PhysicalCheckStatusTone = "baik" | "tidak_baik" | "pending";

export interface PhysicalCheckStatusChip {
  tone: PhysicalCheckStatusTone;
  label: string;
  className: string;
}

const STATUS_CHIP_CLASS: Record<PhysicalCheckStatusTone, string> = {
  baik: "bg-emerald-100 text-emerald-800",
  tidak_baik: "bg-red-100 text-red-800",
  pending: "bg-slate-100 text-slate-600",
};

/** Compact chip for Job Detail / list — BAIK / TIDAK_BAIK semantics, not Sesuai. */
export function physicalCheckStatusChip(status: PhysicalCheckEntryStatus): PhysicalCheckStatusChip {
  if (!status.complete) {
    return {
      tone: "pending",
      label: `${status.filled}/${status.total}`,
      className: STATUS_CHIP_CLASS.pending,
    };
  }
  if (status.anyTidakBaik) {
    return {
      tone: "tidak_baik",
      label: "Ada TIDAK BAIK",
      className: STATUS_CHIP_CLASS.tidak_baik,
    };
  }
  return {
    tone: "baik",
    label: "Selesai",
    className: STATUS_CHIP_CLASS.baik,
  };
}

/** Per-catalog-item chip on Job Detail (one verdict, or belum diisi). */
export function physicalCheckItemChip(
  verdict: PhysicalCheckVerdict | null | undefined,
): PhysicalCheckStatusChip {
  if (verdict === "BAIK") {
    return { tone: "baik", label: "BAIK", className: STATUS_CHIP_CLASS.baik };
  }
  if (verdict === "TIDAK_BAIK") {
    return { tone: "tidak_baik", label: "TIDAK BAIK", className: STATUS_CHIP_CLASS.tidak_baik };
  }
  return { tone: "pending", label: "Belum", className: STATUS_CHIP_CLASS.pending };
}

export function draftFromResult(
  result: Pick<TechPhysicalCheckResult, "verdict" | "note"> | undefined,
): PhysicalCheckDraft {
  return {
    verdict: result?.verdict ?? null,
    note: result?.note ?? "",
  };
}

export function normalizePhysicalCheckNote(note: string): string | null {
  const trimmed = note.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export interface PhysicalCheckSavePlan {
  creates: PhysicalCheckBatchItem[];
  updates: Array<{ resultId: string; input: PhysicalCheckUpdateInput }>;
}

/**
 * Diff local drafts vs current-attempt server rows. Only items with a verdict
 * are created; note is optional for both BAIK and TIDAK_BAIK.
 */
export function buildPhysicalCheckSavePlan(
  catalog: Pick<TechPhysicalCheckItem, "id">[],
  currentAttemptResults: TechPhysicalCheckResult[],
  drafts: Record<string, PhysicalCheckDraft>,
): PhysicalCheckSavePlan {
  const byItem = new Map(
    currentAttemptResults.map((r) => [r.devicePhysicalCheckItemId, r] as const),
  );
  const creates: PhysicalCheckBatchItem[] = [];
  const updates: PhysicalCheckSavePlan["updates"] = [];

  for (const item of catalog) {
    if (!(item.id in drafts)) continue;
    const draft = drafts[item.id]!;
    const existing = byItem.get(item.id);
    const note = normalizePhysicalCheckNote(draft.note);

    if (!existing) {
      if (draft.verdict === null) continue;
      creates.push({
        devicePhysicalCheckItemId: item.id,
        verdict: draft.verdict,
        note,
      });
      continue;
    }

    const storedNote = existing.note ?? null;
    const verdictChanged = draft.verdict !== null && draft.verdict !== existing.verdict;
    const noteChanged = note !== storedNote;
    if (!verdictChanged && !noteChanged) continue;

    const input: PhysicalCheckUpdateInput = {};
    if (verdictChanged && draft.verdict !== null) input.verdict = draft.verdict;
    if (noteChanged) input.note = note;
    if (input.verdict === undefined && input.note === undefined) continue;
    updates.push({ resultId: existing.id, input });
  }

  return { creates, updates };
}
