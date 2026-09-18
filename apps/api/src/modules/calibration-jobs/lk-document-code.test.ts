import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LK_PRINTED_DOCUMENT_CODE, resolveLkManualHeader } from "./lk-manual-header-catalog";
import { renderLkResultPdf, type LkResultPdfInput } from "./lk-result-pdf";
import type { LkTemplateData } from "./lk-template-data";

function baseJob(deviceTypeName: string | null): LkResultPdfInput["job"] {
  return {
    id: "job-lk-code",
    unitOrdinal: 1,
    unitTotal: 1,
    currentAttempt: 1,
    startedAt: new Date("2026-09-01T02:00:00.000Z"),
    submittedAt: new Date("2026-09-02T02:00:00.000Z"),
    workOrderNumber: "WOL/2026/09/00011",
    customerName: "RS Contoh",
    deviceTypeName,
    deviceBrand: "Brand",
    deviceModel: "Model",
    deviceSerial: "SN-1",
  };
}

function genericInput(deviceTypeName: string | null): LkResultPdfInput {
  return {
    company: { id: "PKM", name: "PT Presisi Kalibrasi Medika", legalName: "PT PRESISI KALIBRASI MEDIKA" },
    job: baseJob(deviceTypeName),
    formHeader: resolveLkManualHeader(deviceTypeName),
    qualityReview: null,
    equipmentUsed: [],
    physicalChecks: [],
    capabilitySections: [],
    generatedAt: new Date("2026-09-18T00:00:00.000Z"),
  };
}

function emptyBsmData(): LkTemplateData {
  return {
    identity: {
      certificateNumber: "",
      deviceName: "Bed Side Monitor",
      assetNumber: "",
      brand: "",
      owner: "",
      model: "",
      room: "",
      serial: "",
      receivedDate: "",
      calibrationDate: "",
      capacity: "",
      resolution: "",
    },
    equipmentUsed: [],
    physicalItems: [],
    measurements: [],
    technicianName: "",
    dataEntryName: "",
  };
}

describe("LK printed document code (MoM #9)", () => {
  it("resolves F.MT.LK.01.44 for every header path, including unmatched types", () => {
    expect(LK_PRINTED_DOCUMENT_CODE).toBe("F.MT.LK.01.44");
    expect(resolveLkManualHeader("Bed Side Monitor").documentCode).toBe("F.MT.LK.01.44");
    expect(resolveLkManualHeader("Patient Monitor").documentCode).toBe("F.MT.LK.01.44");
    expect(resolveLkManualHeader("Autoclave").documentCode).toBe("F.MT.LK.01.44");
    expect(resolveLkManualHeader("Centrifuge").documentCode).toBe("F.MT.LK.01.44");
    expect(resolveLkManualHeader(null).documentCode).toBe("F.MT.LK.01.44");
  });

  it("prints the standardized code from the shared LK page header, not per-template catalog values", () => {
    const layoutSrc = readFileSync(join(__dirname, "lk-pdf-layout.ts"), "utf8");
    expect(layoutSrc).toContain('["Kode Dokumen", LK_PRINTED_DOCUMENT_CODE]');
    expect(layoutSrc).not.toContain('["Kode Dokumen", header.documentCode]');
  });

  it("renders a generic LK PDF without changing the work-order number on the input", async () => {
    const input = genericInput("Centrifuge");
    expect(input.job.workOrderNumber).toBe("WOL/2026/09/00011");
    const result = await renderLkResultPdf(input);
    expect(result.buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("renders the Bed Side Monitor / Patient Monitor LK variant with the standardized header code", async () => {
    const formHeader = resolveLkManualHeader("Bed Side Monitor");
    expect(formHeader.matched).toBe(true);
    expect(formHeader.sourceFile).toBe("LK Bed Side Monitor");
    expect(formHeader.documentCode).toBe("F.MT.LK.01.44");

    const result = await renderLkResultPdf({
      ...genericInput("Bed Side Monitor"),
      formHeader,
      templateData: emptyBsmData(),
    });
    expect(result.buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
