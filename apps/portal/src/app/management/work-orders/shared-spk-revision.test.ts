import { describe, expect, it, vi } from "vitest";
import { ApiError, sharedSpkReviseSchema } from "@medcal/shared";
import type { SharedSpkChild, SharedSpkDetail } from "./shared-spk-types";
import {
  buildRevisePayload,
  buildRevisionSummary,
  canReviseParent,
  childLockReason,
  classifyRevisionError,
  computeAvailability,
  computeUnallocated,
  executeRevision,
  expectedChildNumber,
  hasRevisionChanges,
  initRevisionState,
  isChildEditable,
  reconcileRevisionState,
  revisionReducer,
  validateRevision,
  type PoItemAvailability,
  type RevisionState,
} from "./shared-spk-revision";

const PARENT_NUMBER = "SPK/2026/10/00001";

function child(
  sequence: number,
  overrides: Partial<SharedSpkChild> & { qty?: number; techId?: string } = {},
): SharedSpkChild {
  const qty = overrides.qty ?? 100;
  const status = overrides.status ?? "ASSIGNED";
  return {
    id: `c${sequence}`,
    number: `${PARENT_NUMBER}-${sequence}`,
    childSequence: sequence,
    status,
    scheduledStart: `2026-10-0${sequence}T00:00:00.000Z`,
    scheduledEnd: `2026-10-0${sequence}T00:00:00.000Z`,
    technicians: [{ id: overrides.techId ?? `t${sequence}`, name: `Tech ${sequence}`, email: `t${sequence}@x.id`, roleOnJob: "LEAD" }],
    items: [{ id: `wi${sequence}`, purchaseOrderItemId: "item-1", description: "Centrifuge", qty }],
    progress: { total: qty, completed: 0, percentage: 0 },
    deliveryNote: null,
    locked: status !== "ASSIGNED" && status !== "PLANNED",
    ...overrides,
  };
}

function parentOf(children: SharedSpkChild[]): SharedSpkDetail {
  return {
    id: "parent-1",
    number: PARENT_NUMBER,
    createdAt: "2026-10-01T00:00:00.000Z",
    purchaseOrder: { id: "po-1", number: "PUR/2026/10/00001", customerPoNumber: "CPO-1", status: "APPROVED" },
    customer: { id: "cust-1", name: "RS Contoh" },
    createdBy: null,
    status: "IN_PROGRESS",
    progress: { total: 406, completed: 0, percentage: 0 },
    children,
  };
}

/** Child #1 started (locked); #2–#4 still ASSIGNED. All 406 units are allocated. */
function startedFirst(): SharedSpkDetail {
  return parentOf([
    child(1, { status: "IN_PROGRESS", qty: 100 }),
    child(2, { qty: 120 }),
    child(3, { qty: 86 }),
    child(4, { qty: 100 }),
  ]);
}

const ITEMS: PoItemAvailability[] = [
  { purchaseOrderItemId: "item-1", label: "Centrifuge", total: 406, remaining: 0 },
];
const context = {
  userName: (id: string) => ({ t2: "Budi", t5: "Siti", t9: "Andi" })[id] ?? id,
  itemLabel: () => "Centrifuge",
};

function edit(state: RevisionState, ...actions: Parameters<typeof revisionReducer>[1][]): RevisionState {
  return actions.reduce(revisionReducer, state);
}

describe("per-Child revision eligibility", () => {
  it("only an unstarted Child is revisable; started, done and cancelled are locked with a reason", () => {
    expect(childLockReason(child(1))).toBeNull();
    expect(childLockReason(child(1, { status: "PLANNED", locked: false }))).toBeNull();
    expect(childLockReason(child(1, { status: "IN_PROGRESS" }))).toContain("dimulai");
    expect(childLockReason(child(1, { status: "DONE" }))).toContain("selesai");
    expect(childLockReason(child(1, { status: "CANCELLED" }))).toContain("dibatalkan");
    expect(isChildEditable(child(1, { status: "DONE" }))).toBe(false);
  });

  it("the Parent entry point is offered while at least one Child is revisable — one started Child does not lock the Parent", () => {
    expect(canReviseParent(startedFirst())).toBe(true);
    expect(
      canReviseParent(
        parentOf([child(1, { status: "IN_PROGRESS" }), child(2, { status: "DONE" }), child(3, { status: "CANCELLED" })]),
      ),
    ).toBe(false);
  });

  it("the editing state contains only revisable Children; locked ones are not rows", () => {
    const state = initRevisionState(startedFirst());
    expect(state.rows.map((row) => row.workOrderId)).toEqual(["c2", "c3", "c4"]);
    expect(hasRevisionChanges(state)).toBe(false);
  });
});

describe("editing actions", () => {
  const base = initRevisionState(startedFirst());

  it("changes technician, schedule and allocation of an editable Child", () => {
    const next = edit(
      base,
      { type: "setTechnician", key: "c2", technicianUserId: "t9" },
      { type: "setSchedule", key: "c2", start: "2026-10-03", end: "2026-10-04" },
      { type: "setQty", key: "c2", itemId: "item-1", qty: 140 },
    );
    const row = next.rows.find((r) => r.key === "c2")!;
    expect(row.technicianUserId).toBe("t9");
    expect([row.start, row.end]).toEqual(["2026-10-03", "2026-10-04"]);
    expect(row.qty).toEqual({ "item-1": 140 });
    expect(hasRevisionChanges(next)).toBe(true);
    // The baseline for the diff is untouched.
    expect(row.original?.qty).toEqual({ "item-1": 120 });
  });

  it("qty 0 drops the item; addItem puts it back at 1", () => {
    const dropped = edit(base, { type: "setQty", key: "c2", itemId: "item-1", qty: 0 });
    expect(dropped.rows.find((r) => r.key === "c2")!.qty).toEqual({});
    const added = edit(dropped, { type: "addItem", key: "c2", itemId: "item-1" });
    expect(added.rows.find((r) => r.key === "c2")!.qty).toEqual({ "item-1": 1 });
  });

  it("adds a new Child (no workOrderId, no authoritative sequence) and discards it again", () => {
    const added = edit(base, { type: "addChild" });
    const row = added.rows.at(-1)!;
    expect(row.workOrderId).toBeNull();
    expect(row.number).toBeNull();
    const removed = edit(added, { type: "toggleRemove", key: row.key });
    expect(removed.rows).toHaveLength(base.rows.length);
  });

  it("marks an existing Child for cancellation and can restore it", () => {
    const removed = edit(base, { type: "toggleRemove", key: "c3" });
    expect(removed.rows.find((r) => r.key === "c3")!.removed).toBe(true);
    const restored = edit(removed, { type: "toggleRemove", key: "c3" });
    expect(restored.rows.find((r) => r.key === "c3")!.removed).toBe(false);
    expect(hasRevisionChanges(restored)).toBe(false);
  });
});

describe("availability and validation", () => {
  const parent = startedFirst();
  const base = initRevisionState(parent);

  it("available = unallocated + what the revisable Children currently hold (locked quantity stays committed)", () => {
    expect(computeAvailability(ITEMS, parent)).toEqual({ "item-1": 306 });
    expect(computeUnallocated(computeAvailability(ITEMS, parent), base)).toBe(0);
  });

  it("flags a distribution that exceeds what is available", () => {
    const over = edit(base, { type: "setQty", key: "c2", itemId: "item-1", qty: 200 }); // 200+86+100 = 386 > 306
    const result = validateRevision(over, parent, ITEMS);
    expect(result.valid).toBe(false);
    expect(result.byItem["item-1"]).toContain("tersedia 306");
  });

  it("allows moving quantity between editable Children within the available total", () => {
    const moved = edit(
      base,
      { type: "setQty", key: "c2", itemId: "item-1", qty: 100 },
      { type: "setQty", key: "c3", itemId: "item-1", qty: 106 },
    );
    expect(validateRevision(moved, parent, ITEMS).valid).toBe(true);
  });

  it("requires a technician, at least one item, and a sane schedule", () => {
    const withNew = edit(base, { type: "addChild" });
    const newKey = withNew.rows.at(-1)!.key;
    const result = validateRevision(withNew, parent, ITEMS);
    expect(result.valid).toBe(false);
    expect(result.byRow[newKey]).toEqual(
      expect.arrayContaining(["Pilih teknisi.", expect.stringContaining("minimal satu item")]),
    );

    const badDates = edit(base, { type: "setSchedule", key: "c2", start: "2026-10-09", end: "2026-10-01" });
    expect(validateRevision(badDates, parent, ITEMS).byRow["c2"]).toEqual([
      "Tanggal selesai tidak boleh sebelum tanggal mulai.",
    ]);
  });

  it("reports 'no changes' and does not let the last active Child be removed", () => {
    expect(validateRevision(base, parent, ITEMS).global).toContain("Belum ada perubahan untuk disimpan.");

    const allUnstartedParent = parentOf([child(1), child(2)]);
    const all = initRevisionState(allUnstartedParent);
    const gone = edit(all, { type: "toggleRemove", key: "c1" }, { type: "toggleRemove", key: "c2" });
    expect(validateRevision(gone, allUnstartedParent, ITEMS).global).toContain(
      "SPK bersama harus memiliki minimal satu SPK Child aktif.",
    );
    // …but with a started Child still active, removing every unstarted Child is fine.
    const startedGone = edit(
      base,
      { type: "toggleRemove", key: "c2" },
      { type: "toggleRemove", key: "c3" },
      { type: "toggleRemove", key: "c4" },
    );
    expect(validateRevision(startedGone, parent, ITEMS).global).not.toContain(
      "SPK bersama harus memiliki minimal satu SPK Child aktif.",
    );
  });
});

describe("review summary", () => {
  it("lists what will change before committing: locked, changed, removed and new Children", () => {
    const parent = startedFirst();
    let state = initRevisionState(parent);
    state = edit(
      state,
      { type: "setTechnician", key: "c2", technicianUserId: "t9" },
      { type: "setSchedule", key: "c2", start: "2026-10-03", end: "2026-10-03" },
      { type: "setQty", key: "c2", itemId: "item-1", qty: 140 },
      { type: "setQty", key: "c3", itemId: "item-1", qty: 76 },
      { type: "toggleRemove", key: "c4" },
      { type: "addChild" },
    );
    const newKey = state.rows.at(-1)!.key;
    state = edit(
      state,
      { type: "setTechnician", key: newKey, technicianUserId: "t5" },
      { type: "setSchedule", key: newKey, start: "2026-10-05", end: "2026-10-05" },
      { type: "addItem", key: newKey, itemId: "item-1" },
    );
    state = edit(state, { type: "setQty", key: newKey, itemId: "item-1", qty: 10 });

    const summary = buildRevisionSummary(parent, state, context);
    const byLabel = Object.fromEntries(summary.map((entry) => [entry.label, entry]));

    expect(byLabel[`${PARENT_NUMBER}-1`]).toMatchObject({ kind: "locked", lines: ["Tidak ada perubahan — terkunci"] });
    expect(byLabel[`${PARENT_NUMBER}-2`]!.kind).toBe("changed");
    expect(byLabel[`${PARENT_NUMBER}-2`]!.lines).toEqual(
      expect.arrayContaining([
        "Teknisi: Budi → Andi",
        "Jadwal: 02/10/2026 → 03/10/2026",
        "Alokasi: 120 → 140 unit",
        "Centrifuge: 120 → 140 unit",
      ]),
    );
    expect(byLabel[`${PARENT_NUMBER}-3`]!.lines).toContain("Alokasi: 86 → 76 unit");
    expect(byLabel[`${PARENT_NUMBER}-4`]!.kind).toBe("removed");
    // New Child: the backend assigns the real sequence; the next free one is only previewed.
    expect(byLabel[`${PARENT_NUMBER}-5`]).toMatchObject({ kind: "new" });
    expect(byLabel[`${PARENT_NUMBER}-5`]!.lines).toEqual(
      expect.arrayContaining(["Teknisi: Siti", "Alokasi: 10 unit"]),
    );
  });

  it("previews the next unused sequence without reusing a cancelled Child's", () => {
    const parent = parentOf([child(1), child(2, { status: "CANCELLED" }), child(3)]);
    const state = edit(initRevisionState(parent), { type: "addChild" }, { type: "addChild" });
    const [a, b] = state.rows.slice(-2);
    expect(expectedChildNumber(parent, state, a!.key)).toBe(`${PARENT_NUMBER}-4`);
    expect(expectedChildNumber(parent, state, b!.key)).toBe(`${PARENT_NUMBER}-5`);
  });
});

describe("revision request body", () => {
  const parent = startedFirst();

  it("sends only what changed, never a locked Child, and satisfies the API schema", () => {
    let state = initRevisionState(parent);
    state = edit(
      state,
      { type: "setTechnician", key: "c2", technicianUserId: "t9" },
      { type: "setQty", key: "c3", itemId: "item-1", qty: 76 },
      { type: "toggleRemove", key: "c4" },
      { type: "addChild" },
    );
    const newKey = state.rows.at(-1)!.key;
    state = edit(
      state,
      { type: "setTechnician", key: newKey, technicianUserId: "t5" },
      { type: "addItem", key: newKey, itemId: "item-1" },
      { type: "setSchedule", key: newKey, start: "2026-10-05" },
    );

    const body = buildRevisePayload(state);
    expect(body.removeWorkOrderIds).toEqual(["c4"]);
    const sentIds = body.children!.map((entry) => entry.workOrderId);
    expect(sentIds).toEqual(["c2", "c3", undefined]);
    expect(sentIds).not.toContain("c1");
    // Schedule fields are sent only when the user changed them.
    expect(body.children![0]).not.toHaveProperty("scheduledStart");
    expect(body.children![2]).toMatchObject({ technicianUserId: "t5", scheduledStart: "2026-10-05" });
    expect(sharedSpkReviseSchema.safeParse(body).success).toBe(true);
  });

  it("clears a schedule explicitly with null", () => {
    const state = edit(initRevisionState(parent), { type: "setSchedule", key: "c2", start: "", end: "" });
    expect(buildRevisePayload(state).children![0]).toMatchObject({ scheduledStart: null, scheduledEnd: null });
  });
});

describe("stale state (a Child starts while the screen is open)", () => {
  it("drops the Child that became locked, keeps every other edit, and never overrides the lock", () => {
    const parent = startedFirst();
    let state = initRevisionState(parent);
    state = edit(
      state,
      { type: "setTechnician", key: "c2", technicianUserId: "t9" },
      { type: "setQty", key: "c3", itemId: "item-1", qty: 76 },
    );

    const refreshed = parentOf([
      child(1, { status: "IN_PROGRESS", qty: 100 }),
      child(2, { status: "IN_PROGRESS", qty: 120 }), // started by someone else
      child(3, { qty: 86 }),
      child(4, { qty: 100 }),
    ]);
    const next = reconcileRevisionState(state, refreshed);

    expect(next.rows.map((row) => row.key)).toEqual(["c3", "c4"]);
    expect(next.rows.find((row) => row.key === "c3")!.qty).toEqual({ "item-1": 76 });
    expect(next.notices.join(" ")).toContain(`${PARENT_NUMBER}-2`);
    expect(buildRevisePayload(next).children!.map((entry) => entry.workOrderId)).toEqual(["c3"]);
  });

  it("is a no-op (same object) when nothing changed, and picks up Children added elsewhere", () => {
    const parent = startedFirst();
    const state = initRevisionState(parent);
    expect(reconcileRevisionState(state, parent)).toBe(state);

    const withExtra = parentOf([...parent.children, child(5, { qty: 10 })]);
    const next = reconcileRevisionState(state, withExtra);
    expect(next.rows.map((row) => row.key)).toContain("c5");
  });
});

describe("API errors", () => {
  it("SHARED_CHILD_LOCKED → tell the user, refresh, nothing saved", () => {
    const info = classifyRevisionError(
      new ApiError(409, "Conflict", { code: "SHARED_CHILD_LOCKED", workOrderId: "c2" }),
    );
    expect(info).toMatchObject({ kind: "locked", refresh: true, workOrderId: "c2" });
    expect(info.message).toContain("tidak lagi dapat direvisi");
    expect(info.message).toContain("Tidak ada perubahan yang tersimpan");
  });

  it("allocation / stale-reference errors refresh; plain validation errors do not", () => {
    expect(classifyRevisionError(new ApiError(409, "Conflict", { code: "OVER_ALLOCATION" }))).toMatchObject({
      kind: "stale",
      refresh: true,
    });
    expect(classifyRevisionError(new ApiError(404, "Not Found", { code: "SHARED_CHILD_NOT_FOUND" }))).toMatchObject({
      kind: "stale",
      refresh: true,
    });
    expect(
      classifyRevisionError(new ApiError(400, "Bad Request", { code: "SHARED_SPK_NO_ACTIVE_CHILD" })),
    ).toMatchObject({ kind: "validation", refresh: false });
    expect(
      classifyRevisionError(new ApiError(400, "Bad Request", { code: "DELIVERY_NOTE_MUST_BE_CANCELLED_FIRST" })).message,
    ).toContain("Surat Jalan");
  });

  it("an unknown failure is surfaced, never swallowed", () => {
    const info = classifyRevisionError(new Error("network down"));
    expect(info.kind).toBe("unknown");
    expect(info.message).toContain("Gagal menyimpan revisi");
  });
});

describe("executeRevision", () => {
  const parent = startedFirst();
  const changed = edit(initRevisionState(parent), { type: "setTechnician", key: "c2", technicianUserId: "t9" });

  it("calls the revision API exactly once with the built body and reports success", async () => {
    const revise = vi.fn().mockResolvedValue({});
    const result = await executeRevision({ state: changed, revise });
    expect(result).toEqual({ ok: true });
    expect(revise).toHaveBeenCalledTimes(1);
    expect(revise).toHaveBeenCalledWith(buildRevisePayload(changed));
  });

  it("does not report success when the API rejects", async () => {
    const revise = vi
      .fn()
      .mockRejectedValue(new ApiError(409, "Conflict", { code: "SHARED_CHILD_LOCKED", workOrderId: "c2" }));
    const result = await executeRevision({ state: changed, revise });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ kind: "locked", refresh: true });
    expect(revise).toHaveBeenCalledTimes(1);
  });

  it("does not call the API when there is nothing to save", async () => {
    const revise = vi.fn();
    const result = await executeRevision({ state: initRevisionState(parent), revise });
    expect(result.ok).toBe(false);
    expect(revise).not.toHaveBeenCalled();
  });
});
