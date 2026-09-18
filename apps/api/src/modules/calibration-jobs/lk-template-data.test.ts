import { describe, expect, it } from "vitest";
import {
  replicatesFor,
  replicatesForLabel,
  settingLabelMatches,
  type LkMeasurementHit,
} from "./lk-template-data";

function hit(partial: Partial<LkMeasurementHit> & Pick<LkMeasurementHit, "parameterCode" | "formattedValue">): LkMeasurementHit {
  return {
    settingLabel: "",
    settingValue: null,
    replicateIndex: 1,
    ...partial,
  };
}

describe("named-point LK template matching", () => {
  it("matches settingLabel independently of replicateIndex", () => {
    expect(
      settingLabelMatches(hit({ parameterCode: "ENV_TEMP", formattedValue: "22", settingLabel: "Awal", replicateIndex: 3 }), "Awal"),
    ).toBe(true);
    expect(
      settingLabelMatches(hit({ parameterCode: "ENV_TEMP", formattedValue: "22", settingLabel: "Akhir" }), "Awal"),
    ).toBe(false);
  });

  it("does not treat unlabeled Pattern A (historical NULL TP) as Awal/Akhir/L-N", () => {
    const unlabeled = hit({ parameterCode: "BSM_ROOM_TEMP", formattedValue: "24.0", settingLabel: "" });
    expect(settingLabelMatches(unlabeled, "Awal")).toBe(false);
    expect(settingLabelMatches(unlabeled, "Akhir")).toBe(false);
    expect(replicatesForLabel([unlabeled], ["BSM_ROOM_TEMP"], "Awal", 1)).toEqual([""]);
  });

  it("fills L-N / L-G / N-G from labels, not array position", () => {
    const measurements: LkMeasurementHit[] = [
      hit({ parameterCode: "VIN", formattedValue: "1.1", settingLabel: "N-G", replicateIndex: 1 }),
      hit({ parameterCode: "VIN", formattedValue: "220", settingLabel: "L-N", replicateIndex: 1 }),
      hit({ parameterCode: "VIN", formattedValue: "219", settingLabel: "L-G", replicateIndex: 1 }),
    ];
    expect(replicatesForLabel(measurements, ["VIN"], "L-N", 1)[0]).toBe("220");
    expect(replicatesForLabel(measurements, ["VIN"], "L-G", 1)[0]).toBe("219");
    expect(replicatesForLabel(measurements, ["VIN"], "N-G", 1)[0]).toBe("1.1");
  });

  it("printed one-cell format uses first replicate, not an invented average", () => {
    const measurements: LkMeasurementHit[] = [
      hit({ parameterCode: "TEMP", formattedValue: "22.0", settingLabel: "Awal", replicateIndex: 1 }),
      hit({ parameterCode: "TEMP", formattedValue: "22.5", settingLabel: "Awal", replicateIndex: 2 }),
      hit({ parameterCode: "TEMP", formattedValue: "23.0", settingLabel: "Awal", replicateIndex: 3 }),
    ];
    expect(replicatesForLabel(measurements, ["TEMP"], "Awal", 1)).toEqual(["22.0"]);
  });

  it("keeps numeric setpoint replicate matching for Pattern B NIBP-style cells", () => {
    const measurements: LkMeasurementHit[] = [
      hit({ parameterCode: "HR", formattedValue: "31", settingLabel: "30", settingValue: 30, replicateIndex: 1 }),
      hit({ parameterCode: "HR", formattedValue: "32", settingLabel: "30", settingValue: 30, replicateIndex: 2 }),
    ];
    expect(replicatesFor(measurements, ["HR"], 30, 5)).toEqual(["31", "32", "", "", ""]);
  });
});
