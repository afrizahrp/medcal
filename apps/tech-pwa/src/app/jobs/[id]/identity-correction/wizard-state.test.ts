import { describe, expect, it } from "vitest";
import { attrsValid, initialWizardState, step1Valid, type WizardState } from "./wizard-state";
import type { TechCalibrationJob } from "../../../../lib/calibration/types";

function baseState(overrides: Partial<WizardState> = {}): WizardState {
  const job = { technicianObservedSerial: null } as TechCalibrationJob;
  return { ...initialWizardState(job), reason: "Label alat sudah luntur", ...overrides };
}

describe("attrsValid / step1Valid", () => {
  it("no attribute checked stays invalid", () => {
    const state = baseState();
    expect(attrsValid(state)).toBe(false);
    expect(step1Valid(state)).toBe(false);
  });

  it("Serial checked + filled is valid on its own (Device untouched)", () => {
    const state = baseState({
      attrs: { device: false, serial: true },
      serial: "SN-001",
    });
    expect(attrsValid(state)).toBe(true);
    expect(step1Valid(state)).toBe(true);
  });

  it("Device checked + resolved (deviceId set) is valid on its own", () => {
    const state = baseState({
      attrs: { device: true, serial: false },
      deviceId: "device-1",
      deviceLabel: "SN-001 — Brand Model",
    });
    expect(attrsValid(state)).toBe(true);
    expect(step1Valid(state)).toBe(true);
  });

  it("Device checked but unresolved (no candidate match) does NOT block an otherwise-valid Serial", () => {
    // Exact reported repro: Reason filled, Device checked with no match,
    // Serial checked+filled — must be ENABLED.
    const state = baseState({
      attrs: { device: true, serial: true },
      deviceId: "",
      serial: "SN-001",
    });
    expect(attrsValid(state)).toBe(true);
    expect(step1Valid(state)).toBe(true);
  });

  it("Device checked but unresolved, and it is the ONLY checked attribute, stays invalid", () => {
    const state = baseState({
      attrs: { device: true, serial: false },
      deviceId: "",
    });
    expect(attrsValid(state)).toBe(false);
    expect(step1Valid(state)).toBe(false);
  });

  it("reason left blank keeps the step invalid even with a valid attribute", () => {
    const state = baseState({
      reason: "",
      attrs: { device: false, serial: true },
      serial: "SN-001",
    });
    expect(attrsValid(state)).toBe(true);
    expect(step1Valid(state)).toBe(false);
  });

  it("a checked attribute left empty does not count as valid, but does not block a different valid attribute", () => {
    const state = baseState({
      attrs: { device: true, serial: true },
      deviceId: "device-1",
      serial: "   ",
    });
    expect(attrsValid(state)).toBe(true);
    expect(step1Valid(state)).toBe(true);
  });
});
