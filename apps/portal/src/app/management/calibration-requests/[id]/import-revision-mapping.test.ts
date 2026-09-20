import { describe, expect, it } from "vitest";
import type { CalibrationRequestImportPreviewRow } from "@medcal/shared";
import type { CalibrationRequestItem } from "../calibration-requests-ui";
import { buildImportedDesiredRows } from "./revision-desired-scope";

function item(overrides: Partial<CalibrationRequestItem>): CalibrationRequestItem {
  return {
    id: "id-default",
    deviceTypeId: "dt-default",
    customerDeviceName: null,
    model: null,
    deviceId: null,
    qty: 1,
    akdAkl: null,
    akdAklDeclaration: "NOT_PROVIDED",
    notes: null,
    ...overrides,
  } as CalibrationRequestItem;
}

function previewRow(
  overrides: Partial<CalibrationRequestImportPreviewRow>,
): CalibrationRequestImportPreviewRow {
  return {
    rowNumber: 2,
    customerDeviceName: "Some Device",
    model: null,
    deviceId: null,
    qty: 1,
    akdAkl: null,
    match: { deviceTypeId: null, deviceTypeName: null, deviceTypeCode: null, method: null },
    suggestions: [],
    warnings: [],
    errors: [],
    ...overrides,
  };
}

describe("buildImportedDesiredRows — MOM #1 Import Excel for Requisition Revision", () => {
  const bp = item({ id: "item-bp", deviceTypeId: "dt-bp", qty: 1 });
  const vent = item({ id: "item-vent", deviceTypeId: "dt-vent", qty: 1 });
  const audio = item({ id: "item-audio", deviceTypeId: "dt-audio", qty: 1 });
  const currentItems = [bp, vent, audio];

  it("matches the MOM worked example: unchanged / changed / removed / added", () => {
    const rows: CalibrationRequestImportPreviewRow[] = [
      previewRow({
        rowNumber: 2,
        customerDeviceName: "Blood Pressure Monitor",
        qty: 1,
        match: { deviceTypeId: "dt-bp", deviceTypeName: "Blood Pressure Monitor", deviceTypeCode: "BPM", method: "EXACT_NAME" },
      }),
      previewRow({
        rowNumber: 3,
        customerDeviceName: "Ventilator",
        qty: 3,
        match: { deviceTypeId: "dt-vent", deviceTypeName: "Ventilator", deviceTypeCode: "VEN", method: "EXACT_NAME" },
      }),
      previewRow({
        rowNumber: 4,
        customerDeviceName: "Patient Monitor",
        qty: 1,
        match: { deviceTypeId: "dt-patient", deviceTypeName: "Patient Monitor", deviceTypeCode: "PM", method: "EXACT_NAME" },
      }),
    ];

    const result = buildImportedDesiredRows(currentItems, rows, () => "new-key");
    if ("errors" in result) throw new Error("expected rows, got errors");

    const byDeviceType = new Map(result.rows.map((row) => [row.deviceTypeId, row]));

    // Unchanged: Blood Pressure Monitor x1 — id retained, qty unchanged.
    const bpRow = byDeviceType.get("dt-bp")!;
    expect(bpRow.id).toBe("item-bp");
    expect(bpRow.qty).toBe(1);
    expect(bpRow.removed).toBe(false);

    // Changed: Ventilator x1 -> x3 — id retained, qty updated.
    const ventRow = byDeviceType.get("dt-vent")!;
    expect(ventRow.id).toBe("item-vent");
    expect(ventRow.qty).toBe(3);
    expect(ventRow.removed).toBe(false);

    // Added: Patient Monitor — new row, no id.
    const patientRow = byDeviceType.get("dt-patient")!;
    expect(patientRow.id).toBeUndefined();
    expect(patientRow.qty).toBe(1);
    expect(patientRow.removed).toBe(false);

    // Removed: Audiometer absent from the file — retained but marked removed.
    const audioRow = byDeviceType.get("dt-audio")!;
    expect(audioRow.id).toBe("item-audio");
    expect(audioRow.removed).toBe(true);

    expect(result.rows).toHaveLength(4);
  });

  it("rejects rows the existing matcher could not resolve, without silently guessing", () => {
    const rows: CalibrationRequestImportPreviewRow[] = [
      previewRow({
        rowNumber: 2,
        customerDeviceName: "Unknown Gadget",
        qty: 1,
        match: { deviceTypeId: null, deviceTypeName: null, deviceTypeCode: null, method: null },
      }),
    ];
    const result = buildImportedDesiredRows(currentItems, rows, () => "new-key");
    if (!("errors" in result)) throw new Error("expected errors, got rows");
    expect(result.errors[0]).toContain("Baris 2");
    expect(result.errors[0]).toContain("Unknown Gadget");
  });

  it("propagates existing parser/matcher row errors as blocking, without dropping them silently", () => {
    const rows: CalibrationRequestImportPreviewRow[] = [
      previewRow({
        rowNumber: 2,
        customerDeviceName: "",
        qty: null,
        errors: ["Qty wajib diisi dengan bilangan bulat positif."],
      }),
    ];
    const result = buildImportedDesiredRows(currentItems, rows, () => "new-key");
    if (!("errors" in result)) throw new Error("expected errors, got rows");
    expect(result.errors[0]).toContain("Baris 2");
    expect(result.errors[0]).toContain("Qty wajib diisi");
  });

  it("does not consume the same current item twice for duplicate device types in the file", () => {
    const rows: CalibrationRequestImportPreviewRow[] = [
      previewRow({
        rowNumber: 2,
        customerDeviceName: "Ventilator",
        qty: 2,
        match: { deviceTypeId: "dt-vent", deviceTypeName: "Ventilator", deviceTypeCode: "VEN", method: "EXACT_NAME" },
      }),
      previewRow({
        rowNumber: 3,
        customerDeviceName: "Ventilator",
        qty: 1,
        match: { deviceTypeId: "dt-vent", deviceTypeName: "Ventilator", deviceTypeCode: "VEN", method: "EXACT_NAME" },
      }),
    ];
    const result = buildImportedDesiredRows([vent], rows, () => "new-key");
    if ("errors" in result) throw new Error("expected rows, got errors");
    const matched = result.rows.filter((row) => row.id === "item-vent");
    const added = result.rows.filter((row) => row.id === undefined);
    expect(matched).toHaveLength(1);
    expect(matched[0]!.qty).toBe(2);
    expect(added).toHaveLength(1);
    expect(added[0]!.qty).toBe(1);
  });

  it("carries the resolved device identity into an ADDED row (exact name) — reported bug", () => {
    const bedside = item({ id: "item-bedside", deviceTypeId: "dt-bedside", qty: 1 });
    const rows: CalibrationRequestImportPreviewRow[] = [
      previewRow({
        rowNumber: 2,
        customerDeviceName: "Ventilator",
        qty: 1,
        match: { deviceTypeId: "dt-vent", deviceTypeName: "Ventilator", deviceTypeCode: "VEN", method: "EXACT_NAME" },
      }),
    ];
    const result = buildImportedDesiredRows([bedside], rows, () => "new-key");
    if ("errors" in result) throw new Error("expected rows, got errors");

    const added = result.rows.find((row) => row.deviceTypeId === "dt-vent")!;
    expect(added.id).toBeUndefined();
    expect(added.qty).toBe(1);

    const removed = result.rows.find((row) => row.deviceTypeId === "dt-bedside")!;
    expect(removed.removed).toBe(true);
    expect(removed.id).toBe("item-bedside");

    // The selector renders selected by finding `type.id === row.deviceTypeId`
    // inside `resolvedDeviceTypes` (merged into the dialog's options list) —
    // this is the exact fix for the reported blank-selector bug.
    expect(result.resolvedDeviceTypes).toContainEqual({
      id: "dt-vent",
      name: "Ventilator",
      code: "VEN",
    });
  });

  it("carries the resolved device identity into an ADDED row (alias match)", () => {
    const bedside = item({ id: "item-bedside", deviceTypeId: "dt-bedside", qty: 1 });
    const rows: CalibrationRequestImportPreviewRow[] = [
      previewRow({
        rowNumber: 2,
        customerDeviceName: "Vent Machine (alias)",
        qty: 1,
        match: { deviceTypeId: "dt-vent", deviceTypeName: "Ventilator", deviceTypeCode: "VEN", method: "ALIAS" },
      }),
    ];
    const result = buildImportedDesiredRows([bedside], rows, () => "new-key");
    if ("errors" in result) throw new Error("expected rows, got errors");

    const added = result.rows.find((row) => row.deviceTypeId === "dt-vent")!;
    expect(added.id).toBeUndefined();
    expect(result.resolvedDeviceTypes).toContainEqual({
      id: "dt-vent",
      name: "Ventilator",
      code: "VEN",
    });
  });

  it("never mutates the DB — it only returns local desired-scope rows", () => {
    const rows: CalibrationRequestImportPreviewRow[] = [
      previewRow({
        rowNumber: 2,
        customerDeviceName: "Blood Pressure Monitor",
        qty: 1,
        match: { deviceTypeId: "dt-bp", deviceTypeName: "Blood Pressure Monitor", deviceTypeCode: "BPM", method: "EXACT_NAME" },
      }),
    ];
    const before = JSON.stringify(currentItems);
    buildImportedDesiredRows(currentItems, rows, () => "new-key");
    expect(JSON.stringify(currentItems)).toBe(before);
  });
});
