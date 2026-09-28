import { describe, expect, it } from "vitest";
import { COMPLETE_JOB_CONFIRMATION, SUBMIT_FOR_REVIEW_CONFIRMATION } from "./job-action-confirmations";

describe("SUBMIT_FOR_REVIEW_CONFIRMATION", () => {
  it("conveys review by Manajer Teknis, attempt-locking, and a verify-before-continuing ask", () => {
    expect(SUBMIT_FOR_REVIEW_CONFIRMATION.message).toMatch(/Manajer Teknis/);
    expect(SUBMIT_FOR_REVIEW_CONFIRMATION.message).toMatch(/terkunci/);
    expect(SUBMIT_FOR_REVIEW_CONFIRMATION.message).toMatch(/[Pp]astikan/);
  });

  it("has a non-empty confirm label distinct from the cancel action", () => {
    expect(SUBMIT_FOR_REVIEW_CONFIRMATION.confirmLabel.trim().length).toBeGreaterThan(0);
    expect(SUBMIT_FOR_REVIEW_CONFIRMATION.confirmLabel.toLowerCase()).not.toBe("batal");
  });
});

describe("COMPLETE_JOB_CONFIRMATION", () => {
  it("conveys finalization and a verify-work-is-finished ask", () => {
    expect(COMPLETE_JOB_CONFIRMATION.message).toMatch(/[Ss]elesai/);
    expect(COMPLETE_JOB_CONFIRMATION.message).toMatch(/[Pp]astikan/);
    expect(COMPLETE_JOB_CONFIRMATION.message).toMatch(/lengkap/);
  });

  it("has a non-empty confirm label distinct from the cancel action", () => {
    expect(COMPLETE_JOB_CONFIRMATION.confirmLabel.trim().length).toBeGreaterThan(0);
    expect(COMPLETE_JOB_CONFIRMATION.confirmLabel.toLowerCase()).not.toBe("batal");
  });
});
