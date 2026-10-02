import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SharedSpkChild, SharedSpkDetail } from "./shared-spk-types";
import { SharedSpkParentView } from "./shared-spk-parent-view";
import { SharedSpkRevisionEditor, type RevisionUser } from "./shared-spk-revision-editor";
import {
  initRevisionState,
  revisionReducer,
  validateRevision,
  type PoItemAvailability,
  type RevisionAction,
  type RevisionState,
} from "./shared-spk-revision";

// Server-rendered markup tests: they verify WHICH controls each Child exposes
// (editable vs locked). They do not click — behaviour of the edit actions,
// review summary, request body and error handling is covered in
// shared-spk-revision.test.ts against the same state model.

const PARENT_NUMBER = "SPK/2026/10/00001";

function child(sequence: number, overrides: Partial<SharedSpkChild> = {}): SharedSpkChild {
  const status = overrides.status ?? "ASSIGNED";
  return {
    id: `c${sequence}`,
    number: `${PARENT_NUMBER}-${sequence}`,
    childSequence: sequence,
    status,
    scheduledStart: `2026-10-0${sequence}T00:00:00.000Z`,
    scheduledEnd: `2026-10-0${sequence}T00:00:00.000Z`,
    technicians: [{ id: `t${sequence}`, name: `Teknisi ${sequence}`, email: `t${sequence}@x.id`, roleOnJob: "LEAD" }],
    items: [{ id: `wi${sequence}`, purchaseOrderItemId: "item-1", description: "Centrifuge", qty: 100 }],
    progress: { total: 100, completed: 0, percentage: 0 },
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
    progress: { total: 400, completed: 100, percentage: 25 },
    children,
  };
}

const ITEMS: PoItemAvailability[] = [
  { purchaseOrderItemId: "item-1", label: "Centrifuge", total: 400, remaining: 0 },
];
const USERS: RevisionUser[] = [
  { id: "t1", label: "Teknisi 1" },
  { id: "t2", label: "Teknisi 2" },
];

function renderEditor(parent: SharedSpkDetail, state: RevisionState = initRevisionState(parent)): string {
  return renderToStaticMarkup(
    <SharedSpkRevisionEditor
      parent={parent}
      items={ITEMS}
      users={USERS}
      state={state}
      validation={validateRevision(state, parent, ITEMS)}
      dispatch={vi.fn()}
      onRequestRemove={vi.fn()}
    />,
  );
}

function count(markup: string, needle: string): number {
  return markup.split(needle).length - 1;
}

describe("Parent view", () => {
  const started = parentOf([child(1, { status: "IN_PROGRESS" }), child(2), child(3)]);

  it("renders the Children, offers revision, and has no Start action", () => {
    const markup = renderToStaticMarkup(<SharedSpkParentView parent={started} canRevise />);
    for (const number of [1, 2, 3]) expect(markup).toContain(`${PARENT_NUMBER}-${number}`);
    expect(markup).toContain("Revisi Distribusi");
    expect(markup).toContain('/work-orders/shared/parent-1/revise');
    expect(markup).toContain("Progress");
    // The Parent is a container: nothing executable on it.
    expect(markup).not.toMatch(/>\s*Start\s*</);
    expect(markup).not.toContain("Mulai");
  });

  it("marks each Child as revisable or locked — one started Child does not lock the Parent", () => {
    const markup = renderToStaticMarkup(<SharedSpkParentView parent={started} canRevise />);
    expect(count(markup, "Terkunci")).toBe(1);
    expect(count(markup, "Dapat direvisi")).toBe(2);
    expect(markup).toContain("Revisi Distribusi");
  });

  it("hides the revision action and explains when every Child is locked", () => {
    const allLocked = parentOf([
      child(1, { status: "IN_PROGRESS" }),
      child(2, { status: "DONE" }),
      child(3, { status: "CANCELLED" }),
    ]);
    const markup = renderToStaticMarkup(<SharedSpkParentView parent={allLocked} canRevise />);
    expect(markup).not.toContain("Revisi Distribusi");
    expect(markup).not.toContain("/revise");
    expect(markup).toContain("Semua SPK Child terkunci");
    expect(markup).toContain("Tidak ada revisi yang tersedia");
  });

  it("hides the revision action from users without update + assign permission", () => {
    const markup = renderToStaticMarkup(<SharedSpkParentView parent={started} canRevise={false} />);
    expect(markup).not.toContain("Revisi Distribusi");
  });
});

describe("Revision editor — locked Children are read-only", () => {
  it.each([
    ["started (IN_PROGRESS)", "IN_PROGRESS" as const, "dimulai"],
    ["done", "DONE" as const, "selesai"],
    ["cancelled", "CANCELLED" as const, "dibatalkan"],
  ])("%s Child: visible, no inputs, no schedule/technician controls, no cancel or remove", (_label, status, reason) => {
    const parent = parentOf([child(1, { status })]);
    const markup = renderEditor(parent);

    expect(markup).toContain(`${PARENT_NUMBER}-1`);
    expect(markup).toContain('data-locked="true"');
    expect(markup).toContain("Terkunci");
    expect(markup).toContain(reason);
    // The Child's current values are shown as text only.
    expect(markup).toContain("Teknisi 1");
    expect(markup).toContain("01/10/2026");
    expect(markup).not.toContain("<input");
    expect(markup).not.toContain("<select");
    expect(markup).not.toContain("Batalkan SPK Child");
    expect(markup).not.toContain("Hapus");
    expect(markup).not.toContain("Jadwal Mulai");
  });

  it("shows a started Child read-only next to editable ones — only the editable ones expose controls", () => {
    const parent = parentOf([child(1, { status: "IN_PROGRESS" }), child(2), child(3)]);
    const markup = renderEditor(parent);

    expect(count(markup, 'data-locked="true"')).toBe(1);
    expect(count(markup, 'data-locked="false"')).toBe(2);
    // One technician select per editable Child, none for the locked one.
    expect(count(markup, 'aria-label="Teknisi ')).toBe(2);
    expect(markup).not.toContain(`aria-label="Teknisi ${PARENT_NUMBER}-1"`);
    expect(count(markup, "Batalkan SPK Child")).toBe(2);
  });
});

describe("Revision editor — editable Children", () => {
  const parent = parentOf([child(1, { status: "IN_PROGRESS" }), child(2), child(3)]);

  it("exposes technician, schedule and allocation controls", () => {
    const markup = renderEditor(parent);
    expect(markup).toContain("Dapat direvisi");
    expect(markup).toContain(`aria-label="Teknisi ${PARENT_NUMBER}-2"`);
    expect(markup).toContain(`aria-label="Jadwal mulai ${PARENT_NUMBER}-2"`);
    expect(markup).toContain(`aria-label="Jadwal selesai ${PARENT_NUMBER}-2"`);
    expect(markup).toContain(`aria-label="Jumlah Centrifuge ${PARENT_NUMBER}-2"`);
    expect(markup).toContain('value="100"');
    expect(markup).toContain("Tambah SPK Child");
  });

  it("reflects edited values from the state (technician, schedule, allocation)", () => {
    const actions: RevisionAction[] = [
      { type: "setTechnician", key: "c2", technicianUserId: "t1" },
      { type: "setSchedule", key: "c2", start: "2026-11-03", end: "2026-11-04" },
      { type: "setQty", key: "c2", itemId: "item-1", qty: 140 },
    ];
    const state = actions.reduce(revisionReducer, initRevisionState(parent));
    const markup = renderEditor(parent, state);
    expect(markup).toContain('value="140"');
    expect(markup).toMatch(/<option value="t1" selected/);
    expect(markup).toContain("03/11/2026");
  });

  it("shows a new Child with its expected (backend-assigned) number and a discard action", () => {
    const state = revisionReducer(initRevisionState(parent), { type: "addChild" });
    const markup = renderEditor(parent, state);
    expect(markup).toContain("SPK Child baru");
    expect(markup).toContain(`${PARENT_NUMBER}-4`);
    expect(markup).toContain("Hapus");
  });

  it("shows a Child marked for cancellation as cancelled-on-save, with restore and no inputs", () => {
    const state = revisionReducer(initRevisionState(parent), { type: "toggleRemove", key: "c3" });
    const markup = renderEditor(parent, state);
    expect(markup).toContain("Akan dibatalkan");
    expect(markup).toContain("Pulihkan");
    expect(markup).toContain("tidak dipakai ulang");
    // Only c2's controls remain.
    expect(count(markup, 'aria-label="Teknisi ')).toBe(1);
  });

  it("prevents cancelling a Child whose delivery note (DLN) is still issued", () => {
    const withDln = parentOf([
      child(1, { deliveryNote: { id: "d1", number: "DLN/2026/10/00001", status: "ISSUED", issuedAt: "2026-10-01T00:00:00.000Z" } }),
      child(2),
    ]);
    const markup = renderEditor(withDln);
    expect(markup).toContain("Batalkan Surat Jalan (DLN) SPK Child ini terlebih dahulu.");
    expect(markup).toMatch(/<button[^>]*disabled[^>]*>(?:(?!<\/button>).)*Batalkan SPK Child/);
  });

  it("surfaces over-allocation next to the item", () => {
    const state = revisionReducer(initRevisionState(parent), {
      type: "setQty",
      key: "c2",
      itemId: "item-1",
      qty: 999,
    });
    const markup = renderEditor(parent, state);
    expect(markup).toContain("dibagikan 1099, tersedia 200");
  });
});
