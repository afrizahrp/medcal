import { describe, expect, it } from "vitest";
import {
  attrsValid,
  currentBrand,
  currentModel,
  currentSerial,
  initialWizardState,
  step1Valid,
  type WizardState,
} from "./wizard-state";
import type { TechCalibrationJob } from "../../../../lib/calibration/types";

function emptyJob(): TechCalibrationJob {
  return {
    technicianObservedBrand: null,
    technicianObservedModel: null,
    technicianObservedSerial: null,
    device: null,
  } as TechCalibrationJob;
}

function baseState(overrides: Partial<WizardState> = {}): WizardState {
  return { ...initialWizardState(emptyJob()), reason: "Label alat sudah luntur", ...overrides };
}

describe("attrsValid / step1Valid", () => {
  it("no attribute checked stays invalid", () => {
    const state = baseState();
    expect(attrsValid(state)).toBe(false);
    expect(step1Valid(state)).toBe(false);
  });

  it("Serial No checked + filled is valid on its own", () => {
    const state = baseState({
      attrs: { brand: false, model: false, serial: true },
      serial: "SN-001",
    });
    expect(attrsValid(state)).toBe(true);
    expect(step1Valid(state)).toBe(true);
  });

  it("Merk checked + filled is valid on its own", () => {
    const state = baseState({
      attrs: { brand: true, model: false, serial: false },
      brand: "Mindray",
    });
    expect(attrsValid(state)).toBe(true);
    expect(step1Valid(state)).toBe(true);
  });

  it("Model checked + filled is valid on its own", () => {
    const state = baseState({
      attrs: { brand: false, model: true, serial: false },
      model: "uMEC12",
    });
    expect(attrsValid(state)).toBe(true);
    expect(step1Valid(state)).toBe(true);
  });

  it("a checked attribute left empty does not block a different valid attribute", () => {
    const state = baseState({
      attrs: { brand: true, model: false, serial: true },
      brand: "   ",
      serial: "SN-001",
    });
    expect(attrsValid(state)).toBe(true);
    expect(step1Valid(state)).toBe(true);
  });

  it("a checked-but-empty attribute that is the ONLY one checked stays invalid", () => {
    const state = baseState({
      attrs: { brand: false, model: true, serial: false },
      model: "   ",
    });
    expect(attrsValid(state)).toBe(false);
    expect(step1Valid(state)).toBe(false);
  });

  it("reason left blank keeps the step invalid even with a valid attribute", () => {
    const state = baseState({
      reason: "",
      attrs: { brand: false, model: false, serial: true },
      serial: "SN-001",
    });
    expect(attrsValid(state)).toBe(true);
    expect(step1Valid(state)).toBe(false);
  });
});

describe("current* prefill precedence (observed first, Device master fallback)", () => {
  const job = {
    technicianObservedBrand: "Observed Brand",
    technicianObservedModel: null,
    technicianObservedSerial: null,
    device: { id: "d1", code: "DVC-1", brand: "Master Brand", model: "Master Model", serialNumber: "SN-MASTER" },
  } as TechCalibrationJob;

  it("uses the observed value when the job has one", () => {
    expect(currentBrand(job)).toBe("Observed Brand");
  });

  it("falls back to the Device master per field, independently", () => {
    expect(currentModel(job)).toBe("Master Model");
    expect(currentSerial(job)).toBe("SN-MASTER");
  });

  it("is empty when neither side has a value", () => {
    expect(currentBrand(emptyJob())).toBe("");
  });
});
