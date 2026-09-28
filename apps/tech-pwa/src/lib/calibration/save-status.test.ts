import { describe, expect, it } from "vitest";
import { computeSaveStatus, saveStatusPresentation } from "./save-status";

describe("computeSaveStatus", () => {
  it("reports idle when nothing has happened yet", () => {
    expect(computeSaveStatus({ isPending: false, isError: false, justSaved: false })).toBe(
      "idle",
    );
  });

  it("reports saving while the mutation is in flight", () => {
    expect(computeSaveStatus({ isPending: true, isError: false, justSaved: false })).toBe(
      "saving",
    );
  });

  it("reports error once the mutation has settled with a failure", () => {
    expect(computeSaveStatus({ isPending: false, isError: true, justSaved: false })).toBe(
      "error",
    );
  });

  it("reports saved when the caller's transient justSaved flag is set", () => {
    expect(computeSaveStatus({ isPending: false, isError: false, justSaved: true })).toBe(
      "saved",
    );
  });

  it("prioritizes saving over a stale justSaved flag (a new save started before the old flag cleared)", () => {
    expect(computeSaveStatus({ isPending: true, isError: false, justSaved: true })).toBe(
      "saving",
    );
  });

  it("prioritizes saving over isError (a retry is in flight)", () => {
    expect(computeSaveStatus({ isPending: true, isError: true, justSaved: false })).toBe(
      "saving",
    );
  });

  it("prioritizes a settled error over a stale justSaved flag — never falsely claims saved", () => {
    expect(computeSaveStatus({ isPending: false, isError: true, justSaved: true })).toBe(
      "error",
    );
  });
});

describe("saveStatusPresentation", () => {
  it("returns null for idle so the shared indicator renders nothing", () => {
    expect(saveStatusPresentation("idle")).toBeNull();
  });

  it("gives each non-idle status a distinct label", () => {
    const labels = new Set(
      (["saving", "saved", "error"] as const).map(
        (status) => saveStatusPresentation(status)?.label,
      ),
    );
    expect(labels.size).toBe(3);
  });

  it("never mislabels an error as saved", () => {
    expect(saveStatusPresentation("error")?.label).not.toMatch(/tersimpan/i);
  });
});
