import { describe, expect, it } from "vitest";
import { ApiError } from "@medcal/shared";
import {
  canAssignDevice,
  canDecideIdentity,
  canEscalateIdentity,
  formatCalibrationJobApiError,
  isIdentityGateLocked,
} from "./calibration-job-utils";

const base = { status: "IN_PROGRESS", akdAklApprovalStatus: "NOT_REQUIRED", deviceId: null };

describe("calibration-job identity gate helpers", () => {
  it("allows escalation from NOT_REQUIRED and REJECTED only", () => {
    expect(canEscalateIdentity({ ...base, akdAklApprovalStatus: "NOT_REQUIRED" })).toBe(true);
    expect(canEscalateIdentity({ ...base, akdAklApprovalStatus: "REJECTED" })).toBe(true);
    expect(canEscalateIdentity({ ...base, akdAklApprovalStatus: "PENDING_REVIEW" })).toBe(false);
    expect(canEscalateIdentity({ ...base, akdAklApprovalStatus: "APPROVED" })).toBe(false);
  });

  it("offers approve/reject only while PENDING_REVIEW", () => {
    expect(canDecideIdentity({ ...base, akdAklApprovalStatus: "PENDING_REVIEW" })).toBe(true);
    expect(canDecideIdentity({ ...base, akdAklApprovalStatus: "NOT_REQUIRED" })).toBe(false);
  });

  it("offers device assignment only while unidentified", () => {
    expect(canAssignDevice({ ...base, deviceId: null })).toBe(true);
    expect(canAssignDevice({ ...base, deviceId: "dev-1" })).toBe(false);
  });

  it("closes every gate action once the job is past the bench", () => {
    for (const status of ["SUBMITTED", "ACCEPTED_BY_QA"]) {
      const job = { ...base, status, akdAklApprovalStatus: "PENDING_REVIEW" };
      expect(isIdentityGateLocked(job)).toBe(true);
      expect(canEscalateIdentity({ ...job, akdAklApprovalStatus: "REJECTED" })).toBe(false);
      expect(canDecideIdentity(job)).toBe(false);
      expect(canAssignDevice(job)).toBe(false);
    }
  });
});

describe("formatCalibrationJobApiError", () => {
  it("maps known backend codes to Indonesian copy", () => {
    const err = new ApiError(400, "raw", { code: "DEVICE_TYPE_MISMATCH" });
    expect(formatCalibrationJobApiError(err, "fallback")).toContain("Jenis alat");
  });

  it("falls back to the server message, then the provided fallback", () => {
    expect(
      formatCalibrationJobApiError(new ApiError(400, "srv", { message: "srv detail" }), "fb"),
    ).toBe("srv detail");
    expect(formatCalibrationJobApiError(new Error("x"), "fb")).toBe("fb");
  });
});
