import { describe, expect, it } from "vitest";
import { deviceDisplayNames } from "./device-name-display";

describe("deviceDisplayNames", () => {
  it("puts the customer alias on top and the master name below it", () => {
    expect(
      deviceDisplayNames({
        customerDeviceName: "tensimeter digital",
        deviceTypeName: "Blood Pressure Monitor",
      }),
    ).toEqual({ primary: "tensimeter digital", secondary: "Blood Pressure Monitor" });
  });

  it("shows the master name alone when there is no alias — no empty second line", () => {
    expect(
      deviceDisplayNames({ customerDeviceName: null, deviceTypeName: "Blood Pressure Monitor" }),
    ).toEqual({ primary: "Blood Pressure Monitor", secondary: null });
    expect(
      deviceDisplayNames({ customerDeviceName: "   ", deviceTypeName: "Blood Pressure Monitor" }),
    ).toEqual({ primary: "Blood Pressure Monitor", secondary: null });
  });

  it("never repeats the same name twice", () => {
    expect(
      deviceDisplayNames({ customerDeviceName: "Dental Unit", deviceTypeName: "Dental Unit" }),
    ).toEqual({ primary: "Dental Unit", secondary: null });
  });

  it("falls back to the given description only when both names are missing", () => {
    expect(
      deviceDisplayNames({ deviceTypeName: null, fallback: "Kalibrasi alat medis" }),
    ).toEqual({ primary: "Kalibrasi alat medis", secondary: null });
    expect(deviceDisplayNames({})).toEqual({ primary: null, secondary: null });
  });
});
