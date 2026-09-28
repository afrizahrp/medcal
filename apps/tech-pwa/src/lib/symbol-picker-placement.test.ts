import { describe, expect, it } from "vitest";
import { needsElevatedSymbolPickerOffset } from "./symbol-picker-placement";

describe("needsElevatedSymbolPickerOffset", () => {
  it("does not elevate the bare Job Saya list (no StickyActionBar there)", () => {
    expect(needsElevatedSymbolPickerOffset("/jobs")).toBe(false);
  });

  it("does not elevate sign-in", () => {
    expect(needsElevatedSymbolPickerOffset("/sign-in")).toBe(false);
    expect(needsElevatedSymbolPickerOffset("/sign-in/register")).toBe(false);
  });

  it("elevates Job Detail (Kirim/Selesai sticky footer)", () => {
    expect(needsElevatedSymbolPickerOffset("/jobs/job-1")).toBe(true);
  });

  it("elevates Kontrol Alat, Physical Check, and both Measurement entry variants", () => {
    expect(needsElevatedSymbolPickerOffset("/jobs/job-1/kontrol-alat")).toBe(true);
    expect(needsElevatedSymbolPickerOffset("/jobs/job-1/physical-check")).toBe(true);
    expect(needsElevatedSymbolPickerOffset("/jobs/job-1/measurements")).toBe(true);
    expect(needsElevatedSymbolPickerOffset("/jobs/job-1/measurements/param-1")).toBe(true);
    expect(needsElevatedSymbolPickerOffset("/jobs/job-1/measurements/nibp")).toBe(true);
  });

  it("elevates Reference Equipment and every identity-correction wizard step", () => {
    expect(needsElevatedSymbolPickerOffset("/jobs/job-1/reference-equipment")).toBe(true);
    expect(needsElevatedSymbolPickerOffset("/jobs/job-1/identity-correction")).toBe(true);
    expect(needsElevatedSymbolPickerOffset("/jobs/job-1/identity-correction/review")).toBe(true);
  });

  it("handles null (pathname not yet resolved)", () => {
    expect(needsElevatedSymbolPickerOffset(null)).toBe(false);
  });
});
