import { describe, expect, it } from "vitest";
import {
  buildPhysicalCheckSavePlan,
  canRecordPhysicalCheck,
  draftFromResult,
  filterCurrentAttemptResults,
  isPhysicalCheckLocked,
  normalizePhysicalCheckNote,
  physicalCheckEntryStatus,
  physicalCheckItemChip,
  physicalCheckLockedReason,
  physicalCheckStatusChip,
  shouldShowPhysicalCheckSection,
  type TechPhysicalCheckItem,
  type TechPhysicalCheckResult,
} from "./physical-check";

function item(id: string, sortOrder = 0): TechPhysicalCheckItem {
  return {
    id,
    deviceTypeId: "dt1",
    code: `CODE_${id}`,
    name: `Item ${id}`,
    inspectionLimit: "Batas",
    sortOrder,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function result(
  partial: Partial<TechPhysicalCheckResult> &
    Pick<TechPhysicalCheckResult, "id" | "devicePhysicalCheckItemId" | "attemptNumber" | "verdict">,
): TechPhysicalCheckResult {
  return {
    companyId: "c1",
    calibrationJobId: "j1",
    note: null,
    inspectionLimitSnapshot: "Batas",
    recordedByUserId: "u1",
    recordedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("lock helpers", () => {
  it("isPhysicalCheckLocked follows SUBMITTED / ACCEPTED_BY_QA", () => {
    expect(isPhysicalCheckLocked({ status: "SUBMITTED" })).toBe(true);
    expect(isPhysicalCheckLocked({ status: "ACCEPTED_BY_QA" })).toBe(true);
    expect(isPhysicalCheckLocked({ status: "IN_PROGRESS" })).toBe(false);
    expect(isPhysicalCheckLocked({ status: "REWORK" })).toBe(false);
  });

  it("canRecordPhysicalCheck requires started IN_PROGRESS", () => {
    expect(canRecordPhysicalCheck({ status: "IN_PROGRESS", startedAt: "2026-09-08T00:00:00Z" })).toBe(
      true,
    );
    expect(canRecordPhysicalCheck({ status: "IN_PROGRESS", startedAt: null })).toBe(false);
    expect(canRecordPhysicalCheck({ status: "PENDING", startedAt: null })).toBe(false);
    expect(canRecordPhysicalCheck({ status: "SUBMITTED", startedAt: "x" })).toBe(false);
    expect(canRecordPhysicalCheck({ status: "REWORK", startedAt: "x" })).toBe(false);
    expect(canRecordPhysicalCheck({ status: "ACCEPTED_BY_QA", startedAt: "x" })).toBe(false);
  });

  it("keeps Pemeriksaan Fisik visible on REWORK even with zero current-attempt rows, but locked", () => {
    expect(shouldShowPhysicalCheckSection({ status: "REWORK" }, true, false)).toBe(true);
    expect(shouldShowPhysicalCheckSection({ status: "REWORK" }, false, false)).toBe(false);
    expect(shouldShowPhysicalCheckSection({ status: "PENDING" }, true, false)).toBe(false);
    expect(shouldShowPhysicalCheckSection({ status: "IN_PROGRESS" }, true, false)).toBe(true);
    expect(shouldShowPhysicalCheckSection({ status: "SUBMITTED" }, true, true)).toBe(true);
    expect(shouldShowPhysicalCheckSection({ status: "SUBMITTED" }, true, false)).toBe(false);
    expect(physicalCheckLockedReason({ status: "REWORK", startedAt: "x" })).toMatch(/perbaikan/);
  });

  it("physicalCheckLockedReason explains each blocked state", () => {
    expect(physicalCheckLockedReason({ status: "PENDING", startedAt: null })).toMatch(/belum dimulai/);
    expect(physicalCheckLockedReason({ status: "SUBMITTED", startedAt: "x" })).toMatch(/terkunci/);
    expect(physicalCheckLockedReason({ status: "ACCEPTED_BY_QA", startedAt: "x" })).toMatch(
      /terkunci/,
    );
    expect(physicalCheckLockedReason({ status: "IN_PROGRESS", startedAt: "x" })).toBeNull();
  });

  it("after Resume → IN_PROGRESS becomes editable", () => {
    expect(canRecordPhysicalCheck({ status: "REWORK", startedAt: "x" })).toBe(false);
    expect(canRecordPhysicalCheck({ status: "IN_PROGRESS", startedAt: "x" })).toBe(true);
    expect(physicalCheckLockedReason({ status: "IN_PROGRESS", startedAt: "x" })).toBeNull();
  });
});

describe("attempt filtering", () => {
  it("keeps only current-attempt rows (no copy-forward from old attempts)", () => {
    const rows = [
      result({ id: "r1", devicePhysicalCheckItemId: "a", attemptNumber: 1, verdict: "BAIK" }),
      result({
        id: "r2",
        devicePhysicalCheckItemId: "a",
        attemptNumber: 2,
        verdict: "TIDAK_BAIK",
      }),
      result({ id: "r3", devicePhysicalCheckItemId: "b", attemptNumber: 1, verdict: "BAIK" }),
    ];
    const current = filterCurrentAttemptResults(rows, 2);
    expect(current).toHaveLength(1);
    expect(current[0]!.id).toBe("r2");
    expect(current[0]!.verdict).toBe("TIDAK_BAIK");
  });

  it("new attempt starts blank when only old-attempt rows exist", () => {
    const catalog = [item("a"), item("b")];
    const oldOnly = [
      result({ id: "r1", devicePhysicalCheckItemId: "a", attemptNumber: 1, verdict: "BAIK" }),
      result({
        id: "r2",
        devicePhysicalCheckItemId: "b",
        attemptNumber: 1,
        verdict: "TIDAK_BAIK",
        note: "rusak",
      }),
    ];
    const current = filterCurrentAttemptResults(oldOnly, 2);
    const status = physicalCheckEntryStatus(catalog, current);
    expect(status.filled).toBe(0);
    expect(status.total).toBe(2);
    expect(draftFromResult(current.find((r) => r.devicePhysicalCheckItemId === "a"))).toEqual({
      verdict: null,
      note: "",
    });
  });
});

describe("catalog order / status", () => {
  it("preserves catalog order for filled count (API sortOrder, not alpha)", () => {
    const catalog = [item("z", 1), item("a", 2), item("m", 3)];
    const rows = [
      result({ id: "1", devicePhysicalCheckItemId: "z", attemptNumber: 1, verdict: "BAIK" }),
      result({
        id: "2",
        devicePhysicalCheckItemId: "m",
        attemptNumber: 1,
        verdict: "TIDAK_BAIK",
      }),
    ];
    const status = physicalCheckEntryStatus(catalog, rows);
    expect(status.filled).toBe(2);
    expect(status.total).toBe(3);
    expect(status.complete).toBe(false);
    expect(physicalCheckStatusChip(status).label).toBe("2/3");
  });

  it("BAIK-complete chip vs TIDAK_BAIK tone without PASS/FAIL labels", () => {
    const catalog = [item("a"), item("b")];
    const allBaik = [
      result({ id: "1", devicePhysicalCheckItemId: "a", attemptNumber: 1, verdict: "BAIK" }),
      result({ id: "2", devicePhysicalCheckItemId: "b", attemptNumber: 1, verdict: "BAIK" }),
    ];
    expect(physicalCheckStatusChip(physicalCheckEntryStatus(catalog, allBaik))).toMatchObject({
      tone: "baik",
      label: "Selesai",
    });

    const withTidakBaik = [
      result({ id: "1", devicePhysicalCheckItemId: "a", attemptNumber: 1, verdict: "BAIK" }),
      result({
        id: "2",
        devicePhysicalCheckItemId: "b",
        attemptNumber: 1,
        verdict: "TIDAK_BAIK",
      }),
    ];
    const chip = physicalCheckStatusChip(physicalCheckEntryStatus(catalog, withTidakBaik));
    expect(chip.tone).toBe("tidak_baik");
    expect(chip.label).toBe("Ada TIDAK BAIK");
    expect(chip.label).not.toMatch(/Sesuai|PASS|FAIL/i);
  });

  it("per-item chip uses BAIK / TIDAK BAIK labels", () => {
    expect(physicalCheckItemChip("BAIK").label).toBe("BAIK");
    expect(physicalCheckItemChip("TIDAK_BAIK").label).toBe("TIDAK BAIK");
    expect(physicalCheckItemChip(null).label).toBe("Belum");
  });

  it("zero-item catalog is empty / incomplete", () => {
    const status = physicalCheckEntryStatus([], []);
    expect(status).toEqual({ filled: 0, total: 0, complete: false, anyTidakBaik: false });
    expect(physicalCheckStatusChip(status).label).toBe("0/0");
  });
});

describe("note + save plan", () => {
  it("note is optional for BAIK and TIDAK_BAIK", () => {
    expect(normalizePhysicalCheckNote("")).toBeNull();
    expect(normalizePhysicalCheckNote("  ")).toBeNull();
    expect(normalizePhysicalCheckNote(" ok ")).toBe("ok");
  });

  it("new rows use batch creates; existing changed rows use PATCH", () => {
    const catalog = [item("a"), item("b"), item("c")];
    const existing = [
      result({
        id: "ra",
        devicePhysicalCheckItemId: "a",
        attemptNumber: 1,
        verdict: "BAIK",
        note: null,
      }),
    ];
    const plan = buildPhysicalCheckSavePlan(catalog, existing, {
      a: { verdict: "TIDAK_BAIK", note: "gores" },
      b: { verdict: "BAIK", note: "" },
      c: { verdict: null, note: "ignored without verdict" },
    });
    expect(plan.creates).toEqual([
      { devicePhysicalCheckItemId: "b", verdict: "BAIK", note: null },
    ]);
    expect(plan.updates).toEqual([
      { resultId: "ra", input: { verdict: "TIDAK_BAIK", note: "gores" } },
    ]);
  });

  it("unchanged drafts produce an empty save plan (no duplicate write)", () => {
    const catalog = [item("a")];
    const existing = [
      result({
        id: "ra",
        devicePhysicalCheckItemId: "a",
        attemptNumber: 1,
        verdict: "BAIK",
        note: "x",
      }),
    ];
    const plan = buildPhysicalCheckSavePlan(catalog, existing, {
      a: { verdict: "BAIK", note: "x" },
    });
    expect(plan.creates).toEqual([]);
    expect(plan.updates).toEqual([]);
  });

  it("does not copy previous-attempt values into the save plan", () => {
    const catalog = [item("a")];
    const oldAttempt = [
      result({
        id: "old",
        devicePhysicalCheckItemId: "a",
        attemptNumber: 1,
        verdict: "BAIK",
        note: "lama",
      }),
    ];
    const current = filterCurrentAttemptResults(oldAttempt, 2);
    const plan = buildPhysicalCheckSavePlan(catalog, current, {
      a: { verdict: "TIDAK_BAIK", note: "baru" },
    });
    expect(plan.creates).toEqual([
      { devicePhysicalCheckItemId: "a", verdict: "TIDAK_BAIK", note: "baru" },
    ]);
    expect(plan.updates).toEqual([]);
  });
});
