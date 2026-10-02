import { ApiError } from "@medcal/shared";
import type { SharedSpkReviseBody } from "@medcal/shared";
import { fmtDateOnly, toDateInputValue } from "@/lib/date-utils";
import type { SharedSpkChild, SharedSpkDetail } from "./shared-spk-types";

/**
 * Shared ON_SITE SPK — revision UX logic (pure, framework-free).
 *
 * This module only shapes what the user edits, previews the change and builds
 * the request body. It does NOT decide what is allowed: PUT
 * /work-orders/shared/:id/distribution is authoritative for locking, allocation
 * and validity. The checks here exist to prevent obviously invalid submits and
 * to explain the outcome — never to override the backend.
 */

// ---------------------------------------------------------------------------
// Eligibility — per Child, never Parent-wide
// ---------------------------------------------------------------------------

/** `null` when the Child may be revised; otherwise a concise, factual reason. */
export function childLockReason(child: Pick<SharedSpkChild, "status" | "locked">): string | null {
  if (child.status === "CANCELLED") {
    return "SPK Child ini sudah dibatalkan dan tidak dapat direvisi.";
  }
  if (child.status === "DONE") {
    return "SPK Child ini sudah selesai dan tidak dapat direvisi.";
  }
  if (child.status === "IN_PROGRESS" || child.locked) {
    return "Pekerjaan sudah dimulai — SPK Child ini terkunci dan tidak dapat direvisi.";
  }
  return null;
}

export function isChildEditable(child: Pick<SharedSpkChild, "status" | "locked">): boolean {
  return childLockReason(child) === null;
}

/** The revision entry point is offered while at least one Child is still revisable. */
export function canReviseParent(parent: Pick<SharedSpkDetail, "children">): boolean {
  return parent.children.some(isChildEditable);
}

// ---------------------------------------------------------------------------
// Editing model
// ---------------------------------------------------------------------------

/** One purchase-order item, with the quantity that can still be handed out. */
export interface PoItemAvailability {
  purchaseOrderItemId: string;
  label: string;
  /** PurchaseOrderItem.qty */
  total: number;
  /** total − SUM(ACTIVE allocations) as of the last allocation-summary fetch. */
  remaining: number;
}

export interface RowSnapshot {
  technicianUserId: string;
  /** purchaseOrderItemId → qty (> 0 only). */
  qty: Record<string, number>;
  /** `YYYY-MM-DD` or "". */
  start: string;
  end: string;
}

export interface RevisionRow extends RowSnapshot {
  key: string;
  /** null = a Child that does not exist yet (the backend assigns its sequence). */
  workOrderId: string | null;
  /** Existing Child number; null for a new Child. */
  number: string | null;
  /** Child had >1 technician — a revision replaces them with the single one chosen. */
  technicianCount: number;
  /** Existing Child marked for cancellation (new Children are simply deleted). */
  removed: boolean;
  /** What the user saw when the row was loaded — the baseline for the diff. */
  original: RowSnapshot | null;
}

export interface RevisionState {
  /** Editable existing Children + new Children. Locked Children are not editable rows. */
  rows: RevisionRow[];
  nextNewKey: number;
  /** One-off messages produced by reconciliation (e.g. a Child became locked). */
  notices: string[];
}

function snapshotOf(child: SharedSpkChild): RowSnapshot {
  const qty: Record<string, number> = {};
  for (const item of child.items) {
    qty[item.purchaseOrderItemId] = (qty[item.purchaseOrderItemId] ?? 0) + item.qty;
  }
  return {
    technicianUserId: child.technicians[0]?.id ?? "",
    qty,
    start: toDateInputValue(child.scheduledStart),
    end: toDateInputValue(child.scheduledEnd),
  };
}

function rowFromChild(child: SharedSpkChild): RevisionRow {
  const snapshot = snapshotOf(child);
  return {
    key: child.id,
    workOrderId: child.id,
    number: child.number,
    technicianCount: child.technicians.length,
    removed: false,
    original: snapshot,
    ...snapshot,
    qty: { ...snapshot.qty },
  };
}

export function initRevisionState(parent: SharedSpkDetail): RevisionState {
  return {
    rows: parent.children.filter(isChildEditable).map(rowFromChild),
    nextNewKey: 1,
    notices: [],
  };
}

export type RevisionAction =
  | { type: "setTechnician"; key: string; technicianUserId: string }
  | { type: "setQty"; key: string; itemId: string; qty: number }
  | { type: "addItem"; key: string; itemId: string }
  | { type: "setSchedule"; key: string; start?: string; end?: string }
  | { type: "toggleRemove"; key: string }
  | { type: "addChild" }
  | { type: "dismissNotices" };

function updateRow(
  state: RevisionState,
  key: string,
  patch: (row: RevisionRow) => RevisionRow,
): RevisionState {
  return { ...state, rows: state.rows.map((row) => (row.key === key ? patch(row) : row)) };
}

export function revisionReducer(state: RevisionState, action: RevisionAction): RevisionState {
  switch (action.type) {
    case "setTechnician":
      return updateRow(state, action.key, (row) => ({ ...row, technicianUserId: action.technicianUserId }));
    case "setQty":
      return updateRow(state, action.key, (row) => {
        const qty = { ...row.qty };
        const next = Number.isFinite(action.qty) ? Math.trunc(action.qty) : 0;
        if (next > 0) qty[action.itemId] = next;
        else delete qty[action.itemId];
        return { ...row, qty };
      });
    case "addItem":
      return updateRow(state, action.key, (row) =>
        row.qty[action.itemId] ? row : { ...row, qty: { ...row.qty, [action.itemId]: 1 } },
      );
    case "setSchedule":
      return updateRow(state, action.key, (row) => ({
        ...row,
        ...(action.start !== undefined ? { start: action.start } : {}),
        ...(action.end !== undefined ? { end: action.end } : {}),
      }));
    case "toggleRemove": {
      const target = state.rows.find((row) => row.key === action.key);
      if (!target) return state;
      // A not-yet-created Child is just discarded; an existing Child is marked for cancellation.
      if (target.workOrderId === null) {
        return { ...state, rows: state.rows.filter((row) => row.key !== action.key) };
      }
      return updateRow(state, action.key, (row) => ({ ...row, removed: !row.removed }));
    }
    case "addChild":
      return {
        ...state,
        rows: [
          ...state.rows,
          {
            key: `new-${state.nextNewKey}`,
            workOrderId: null,
            number: null,
            technicianCount: 0,
            technicianUserId: "",
            qty: {},
            start: "",
            end: "",
            removed: false,
            original: null,
          },
        ],
        nextNewKey: state.nextNewKey + 1,
      };
    case "dismissNotices":
      return state.notices.length === 0 ? state : { ...state, notices: [] };
    default:
      return state;
  }
}

function sameQty(a: Record<string, number>, b: Record<string, number>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if ((a[key] ?? 0) !== (b[key] ?? 0)) return false;
  }
  return true;
}

function sameSnapshot(a: RowSnapshot, b: RowSnapshot): boolean {
  return (
    a.technicianUserId === b.technicianUserId &&
    a.start === b.start &&
    a.end === b.end &&
    sameQty(a.qty, b.qty)
  );
}

export function rowTotal(row: Pick<RowSnapshot, "qty">): number {
  return Object.values(row.qty).reduce((sum, qty) => sum + qty, 0);
}

/** An existing Child row differs from what the user loaded (or is being cancelled). */
export function isRowChanged(row: RevisionRow): boolean {
  if (row.workOrderId === null) return !row.removed;
  if (row.removed) return true;
  return row.original ? !sameSnapshot(row, row.original) : true;
}

export function hasRevisionChanges(state: RevisionState): boolean {
  return state.rows.some(isRowChanged);
}

// ---------------------------------------------------------------------------
// Stale-state reconciliation (a Child may start while the screen is open)
// ---------------------------------------------------------------------------

/**
 * Re-aligns the editing state with fresh server data. Rows whose Child is no
 * longer revisable (started / done / cancelled, or gone) are dropped with a
 * notice — the lock is never overridden client-side. Other edits, including new
 * Children, are preserved. Returns the SAME state object when nothing changed so
 * polling/refetching never causes render loops.
 */
export function reconcileRevisionState(
  state: RevisionState,
  parent: SharedSpkDetail,
): RevisionState {
  const childById = new Map(parent.children.map((child) => [child.id, child]));
  const notices: string[] = [];
  let changed = false;

  const rows: RevisionRow[] = [];
  for (const row of state.rows) {
    if (row.workOrderId === null) {
      rows.push(row);
      continue;
    }
    const child = childById.get(row.workOrderId);
    if (!child || !isChildEditable(child)) {
      changed = true;
      if (isRowChanged(row)) {
        notices.push(
          `${row.number ?? "SPK Child"} sudah tidak dapat direvisi (sudah dimulai atau ditutup). Perubahan Anda pada SPK Child ini dibuang.`,
        );
      } else {
        notices.push(`${row.number ?? "SPK Child"} sekarang terkunci dan tidak dapat direvisi.`);
      }
      continue;
    }
    const fresh = snapshotOf(child);
    if (row.original && !sameSnapshot(row.original, fresh)) {
      // Changed by someone else: re-baseline the diff, keep the user's edits.
      changed = true;
      rows.push({ ...row, original: fresh, technicianCount: child.technicians.length });
      notices.push(`${child.number} diubah oleh pengguna lain. Tinjau kembali nilainya.`);
    } else {
      rows.push(row);
    }
  }

  const known = new Set(state.rows.flatMap((row) => (row.workOrderId ? [row.workOrderId] : [])));
  for (const child of parent.children) {
    if (isChildEditable(child) && !known.has(child.id)) {
      changed = true;
      rows.push(rowFromChild(child));
      notices.push(`${child.number} ditambahkan oleh pengguna lain.`);
    }
  }

  if (!changed) return state;
  return { ...state, rows, notices: [...state.notices, ...notices] };
}

// ---------------------------------------------------------------------------
// Availability + validation
// ---------------------------------------------------------------------------

/**
 * Units of each PO item that this revision may hand out: what is unallocated
 * now, plus what the still-revisable Children currently hold (their allocations
 * are released and re-created by the revision). Locked Children's quantity stays
 * committed and is therefore never available.
 */
export function computeAvailability(
  items: PoItemAvailability[],
  parent: Pick<SharedSpkDetail, "children">,
): Record<string, number> {
  const held: Record<string, number> = {};
  for (const child of parent.children) {
    if (!isChildEditable(child)) continue;
    for (const item of child.items) {
      held[item.purchaseOrderItemId] = (held[item.purchaseOrderItemId] ?? 0) + item.qty;
    }
  }
  const available: Record<string, number> = {};
  for (const item of items) {
    available[item.purchaseOrderItemId] = item.remaining + (held[item.purchaseOrderItemId] ?? 0);
  }
  return available;
}

export function computeUsage(state: RevisionState): Record<string, number> {
  const used: Record<string, number> = {};
  for (const row of state.rows) {
    if (row.removed) continue;
    for (const [itemId, qty] of Object.entries(row.qty)) used[itemId] = (used[itemId] ?? 0) + qty;
  }
  return used;
}

/** Units not handed out to any Child after this revision. */
export function computeUnallocated(
  availability: Record<string, number>,
  state: RevisionState,
): number {
  const used = computeUsage(state);
  return Object.entries(availability).reduce(
    (sum, [itemId, available]) => sum + Math.max(0, available - (used[itemId] ?? 0)),
    0,
  );
}

export interface RevisionValidation {
  valid: boolean;
  /** Not tied to one row (e.g. nothing to save, no active Child left). */
  global: string[];
  byRow: Record<string, string[]>;
  byItem: Record<string, string>;
}

export function validateRevision(
  state: RevisionState,
  parent: Pick<SharedSpkDetail, "children">,
  items: PoItemAvailability[],
): RevisionValidation {
  const global: string[] = [];
  const byRow: Record<string, string[]> = {};
  const byItem: Record<string, string> = {};
  const add = (key: string, message: string) => {
    (byRow[key] ??= []).push(message);
  };

  for (const row of state.rows) {
    if (row.removed) continue;
    if (!row.technicianUserId) add(row.key, "Pilih teknisi.");
    if (rowTotal(row) <= 0) add(row.key, "SPK Child harus memiliki minimal satu item dengan jumlah lebih dari 0.");
    if (row.start && row.end && row.end < row.start) {
      add(row.key, "Tanggal selesai tidak boleh sebelum tanggal mulai.");
    }
  }

  const availability = computeAvailability(items, parent);
  const used = computeUsage(state);
  const labelOf = new Map(items.map((item) => [item.purchaseOrderItemId, item.label]));
  for (const [itemId, qty] of Object.entries(used)) {
    const available = availability[itemId] ?? 0;
    if (qty > available) {
      byItem[itemId] = `${labelOf.get(itemId) ?? "Item"}: dibagikan ${qty}, tersedia ${available}.`;
    }
  }

  const lockedActive = parent.children.filter(
    (child) => !isChildEditable(child) && child.status !== "CANCELLED",
  ).length;
  const keptRows = state.rows.filter((row) => !row.removed).length;
  if (lockedActive + keptRows === 0) {
    global.push("SPK bersama harus memiliki minimal satu SPK Child aktif.");
  }
  if (!hasRevisionChanges(state)) global.push("Belum ada perubahan untuk disimpan.");

  const valid =
    global.length === 0 && Object.keys(byRow).length === 0 && Object.keys(byItem).length === 0;
  return { valid, global, byRow, byItem };
}

// ---------------------------------------------------------------------------
// Display helpers + change summary
// ---------------------------------------------------------------------------

/** Number a new Child is EXPECTED to get — display only; the backend assigns it. */
export function expectedChildNumber(
  parent: Pick<SharedSpkDetail, "number" | "children">,
  state: RevisionState,
  key: string,
): string | null {
  const maxSequence = parent.children.reduce((max, child) => Math.max(max, child.childSequence), 0);
  const newRows = state.rows.filter((row) => row.workOrderId === null && !row.removed);
  const index = newRows.findIndex((row) => row.key === key);
  return index < 0 ? null : `${parent.number}-${maxSequence + 1 + index}`;
}

export function scheduleText(start: string, end: string): string {
  if (!start && !end) return "—";
  const from = fmtDateOnly(start || null);
  const to = fmtDateOnly(end || null);
  if (!end || from === to) return from;
  if (!start) return to;
  return `${from} – ${to}`;
}

export interface SummaryEntry {
  key: string;
  label: string;
  kind: "locked" | "changed" | "removed" | "new";
  lines: string[];
}

export interface SummaryContext {
  userName: (userId: string) => string;
  itemLabel: (itemId: string) => string;
}

function describeQtyChanges(
  before: Record<string, number>,
  after: Record<string, number>,
  context: SummaryContext,
): string[] {
  const lines: string[] = [];
  const itemIds = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  for (const itemId of itemIds) {
    const from = before[itemId] ?? 0;
    const to = after[itemId] ?? 0;
    if (from !== to) lines.push(`${context.itemLabel(itemId)}: ${from} → ${to} unit`);
  }
  return lines;
}

/** What will change, shown before the revision is committed. */
export function buildRevisionSummary(
  parent: SharedSpkDetail,
  state: RevisionState,
  context: SummaryContext,
): SummaryEntry[] {
  const entries: SummaryEntry[] = [];

  for (const child of parent.children) {
    if (isChildEditable(child)) continue;
    entries.push({
      key: child.id,
      label: child.number,
      kind: "locked",
      lines: ["Tidak ada perubahan — terkunci"],
    });
  }

  for (const row of state.rows) {
    if (row.workOrderId === null) {
      if (row.removed) continue;
      const lines = [
        `Teknisi: ${row.technicianUserId ? context.userName(row.technicianUserId) : "—"}`,
        `Jadwal: ${scheduleText(row.start, row.end)}`,
        `Alokasi: ${rowTotal(row)} unit`,
        ...describeQtyChanges({}, row.qty, context),
      ];
      entries.push({
        key: row.key,
        label: expectedChildNumber(parent, state, row.key) ?? "SPK Child baru",
        kind: "new",
        lines,
      });
      continue;
    }

    const label = row.number ?? row.key;
    if (row.removed) {
      entries.push({
        key: row.key,
        label,
        kind: "removed",
        lines: [
          `SPK Child dibatalkan — ${rowTotal(row.original ?? row)} unit dilepas kembali ke Purchase Order`,
        ],
      });
      continue;
    }
    if (!isRowChanged(row) || !row.original) continue;

    const lines: string[] = [];
    if (row.technicianUserId !== row.original.technicianUserId) {
      lines.push(
        `Teknisi: ${row.original.technicianUserId ? context.userName(row.original.technicianUserId) : "—"} → ${
          row.technicianUserId ? context.userName(row.technicianUserId) : "—"
        }`,
      );
    }
    if (row.start !== row.original.start || row.end !== row.original.end) {
      lines.push(
        `Jadwal: ${scheduleText(row.original.start, row.original.end)} → ${scheduleText(row.start, row.end)}`,
      );
    }
    if (!sameQty(row.qty, row.original.qty)) {
      lines.push(`Alokasi: ${rowTotal(row.original)} → ${rowTotal(row)} unit`);
      lines.push(...describeQtyChanges(row.original.qty, row.qty, context));
    }
    entries.push({ key: row.key, label, kind: "changed", lines });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Request + error handling
// ---------------------------------------------------------------------------

function itemsOf(row: RowSnapshot): { purchaseOrderItemId: string; qty: number }[] {
  return Object.entries(row.qty)
    .filter(([, qty]) => qty > 0)
    .map(([purchaseOrderItemId, qty]) => ({ purchaseOrderItemId, qty }))
    .sort((a, b) => a.purchaseOrderItemId.localeCompare(b.purchaseOrderItemId));
}

/**
 * Body for PUT /work-orders/shared/:id/distribution. Untouched Children are not
 * sent, so they are not rewritten or snapshotted. A schedule field is sent only
 * when the user changed it (null clears it).
 */
export function buildRevisePayload(state: RevisionState): SharedSpkReviseBody {
  const children: NonNullable<SharedSpkReviseBody["children"]> = [];
  const removeWorkOrderIds: string[] = [];

  for (const row of state.rows) {
    if (row.workOrderId === null) {
      if (row.removed) continue;
      children.push({
        technicianUserId: row.technicianUserId,
        items: itemsOf(row),
        ...(row.start ? { scheduledStart: row.start } : {}),
        ...(row.end ? { scheduledEnd: row.end } : {}),
      });
      continue;
    }
    if (row.removed) {
      removeWorkOrderIds.push(row.workOrderId);
      continue;
    }
    if (!isRowChanged(row)) continue;
    const original = row.original;
    children.push({
      workOrderId: row.workOrderId,
      technicianUserId: row.technicianUserId,
      items: itemsOf(row),
      ...(!original || row.start !== original.start ? { scheduledStart: row.start || null } : {}),
      ...(!original || row.end !== original.end ? { scheduledEnd: row.end || null } : {}),
    });
  }

  return { children, removeWorkOrderIds };
}

export type RevisionErrorKind = "locked" | "stale" | "validation" | "unknown";

export interface RevisionErrorInfo {
  kind: RevisionErrorKind;
  code?: string;
  message: string;
  /** Re-fetch the Parent / allocation data before the user continues. */
  refresh: boolean;
  workOrderId?: string;
}

const VALIDATION_MESSAGES: Record<string, string> = {
  INVALID_SHARED_SPK_REVISION: "Data revisi tidak valid. Periksa kembali isian Anda.",
  SHARED_SPK_NO_ACTIVE_CHILD: "SPK bersama harus memiliki minimal satu SPK Child aktif.",
  INVALID_WORK_ORDER_ASSIGNEE: "Teknisi harus anggota aktif company ini.",
  DUPLICATE_ALLOCATION_ITEM: "Item yang sama dibagikan lebih dari sekali pada satu SPK Child.",
  DELIVERY_NOTE_MUST_BE_CANCELLED_FIRST:
    "Batalkan Surat Jalan (DLN) SPK Child ini terlebih dahulu sebelum membatalkannya.",
};

/** Maps an API failure to what the user should see and whether data must be re-fetched. */
export function classifyRevisionError(err: unknown): RevisionErrorInfo {
  if (err instanceof ApiError) {
    const code = typeof err.data?.code === "string" ? err.data.code : undefined;
    const workOrderId = typeof err.data?.workOrderId === "string" ? err.data.workOrderId : undefined;
    switch (code) {
      case "SHARED_CHILD_LOCKED":
        return {
          kind: "locked",
          code,
          workOrderId,
          refresh: true,
          message:
            "Sebuah SPK Child sudah dimulai dan tidak lagi dapat direvisi. Data telah dimuat ulang — tinjau kembali perubahan Anda lalu simpan lagi. Tidak ada perubahan yang tersimpan.",
        };
      case "SHARED_CHILD_NOT_FOUND":
      case "PURCHASE_ORDER_ITEM_NOT_ACTIVE":
        return {
          kind: "stale",
          code,
          workOrderId,
          refresh: true,
          message:
            "Data berubah sejak layar ini dibuka. Data telah dimuat ulang — tinjau kembali perubahan Anda. Tidak ada perubahan yang tersimpan.",
        };
      case "OVER_ALLOCATION":
        return {
          kind: "stale",
          code,
          refresh: true,
          message:
            "Sisa unit pada Purchase Order telah berubah. Data telah dimuat ulang — periksa kembali jumlah alokasi. Tidak ada perubahan yang tersimpan.",
        };
      default:
        if (code && VALIDATION_MESSAGES[code]) {
          return { kind: "validation", code, workOrderId, refresh: false, message: VALIDATION_MESSAGES[code]! };
        }
        if (err.status === 400 || err.status === 409 || err.status === 422) {
          const detail = typeof err.data?.message === "string" ? err.data.message : null;
          return {
            kind: "validation",
            code,
            workOrderId,
            refresh: false,
            message: detail ?? "Revisi ditolak. Periksa kembali isian Anda.",
          };
        }
    }
  }
  return {
    kind: "unknown",
    refresh: false,
    message: "Gagal menyimpan revisi. Tidak ada perubahan yang tersimpan. Coba lagi.",
  };
}

export type RevisionResult = { ok: true } | { ok: false; error: RevisionErrorInfo };

/**
 * Sends the revision exactly once. The caller refreshes data when
 * `error.refresh` is set; success is reported only after the API accepted it.
 */
export async function executeRevision(args: {
  state: RevisionState;
  revise: (body: SharedSpkReviseBody) => Promise<unknown>;
}): Promise<RevisionResult> {
  const body = buildRevisePayload(args.state);
  if ((body.children?.length ?? 0) === 0 && (body.removeWorkOrderIds?.length ?? 0) === 0) {
    return {
      ok: false,
      error: { kind: "validation", refresh: false, message: "Belum ada perubahan untuk disimpan." },
    };
  }
  try {
    await args.revise(body);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: classifyRevisionError(err) };
  }
}
