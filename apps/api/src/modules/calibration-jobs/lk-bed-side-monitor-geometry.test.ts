import { describe, expect, it } from "vitest";
import PDFDocument from "pdfkit";
import { resolveLkManualHeader } from "./lk-manual-header-catalog";
import {
  FOOTER_BAND,
  MARGIN_BOTTOM,
  MARGIN_LEFT,
  MARGIN_RIGHT,
  MARGIN_TOP,
  beginPage,
  drawFooterAllPages,
  fillHalamanAllPages,
  registerLkFonts,
  type LkPdfLayout,
} from "./lk-pdf-layout";
import type { LkMeasurementHit, LkTemplateData } from "./lk-template-data";
import {
  getBsmSectionEndPages,
  getBsmSectionStartPages,
  renderBedSideMonitorFromY,
} from "./lk-templates/bed-side-monitor";

function emptyIdentity(): LkTemplateData["identity"] {
  return {
    certificateNumber: "",
    deviceName: "",
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
  };
}

function meas(
  code: string,
  setting: number,
  replicateIndex: number,
  formattedValue: string,
): LkMeasurementHit {
  return {
    parameterCode: code,
    settingLabel: String(setting),
    settingValue: setting,
    replicateIndex,
    formattedValue,
  };
}

function completeData(): LkTemplateData {
  const measurements: LkMeasurementHit[] = [];
  for (const s of [30, 60, 120, 180]) {
    for (let i = 1; i <= 5; i++) measurements.push(meas("BSM_HEART_RATE", s, i, String(s + i)));
  }
  for (const s of [15, 30, 60, 120]) {
    for (let i = 1; i <= 5; i++) measurements.push(meas("BSM_RESP_RATE", s, i, String(s)));
  }
  for (const s of [98, 93, 92, 85, 90, 70, 88]) {
    for (let i = 1; i <= 5; i++) measurements.push(meas("BSM_SPO2", s, i, String(s)));
  }
  const triples: Array<[number, number, number]> = [
    [120, 93, 80],
    [150, 116, 100],
    [200, 166, 150],
    [250, 215, 195],
    [60, 40, 30],
    [80, 60, 50],
    [100, 76, 65],
  ];
  for (const [sys, map, dia] of triples) {
    for (let i = 1; i <= 5; i++) {
      measurements.push(meas("BSM_SYSTOLIC", sys, i, String(sys)));
      measurements.push(meas("BSM_MAP", map, i, String(map)));
      measurements.push(meas("BSM_DIASTOLIC", dia, i, String(dia)));
    }
  }
  measurements.push(meas("BSM_EARTH_RESISTANCE", 0, 1, "0.12"));
  measurements.push(meas("BSM_INSULATION_RESISTANCE", 0, 1, "99"));
  measurements.push(meas("BSM_EQUIP_LEAKAGE", 0, 1, "40"));
  measurements.push(meas("BSM_APPLIED_LEAKAGE", 0, 1, "8"));

  return {
    identity: {
      certificateNumber: "CERT-001",
      deviceName: "Bed Side Monitor",
      assetNumber: "",
      brand: "Philips",
      owner: "RS Contoh",
      model: "MX450",
      room: "ICU 1",
      serial: "SN12345",
      receivedDate: "01-01-2026",
      calibrationDate: "02-01-2026",
      capacity: "",
      resolution: "",
    },
    equipmentUsed: [
      { name: "Vital Signs Simulator", brand: "Fluke", model: "ProSim 8", serialNumber: "VS1" },
      { name: "Electrical Safety Analyzer", brand: "Fluke", model: "ESA615", serialNumber: "ES1" },
      { name: "Thermohygrometer", brand: "Testo", model: "608", serialNumber: "TH1" },
    ],
    physicalItems: [
      { name: "Badan / Permukaan", inspectionLimit: "", verdict: "BAIK" },
      { name: "Kotak kontak alat", inspectionLimit: "", verdict: "BAIK" },
      { name: "Kabel catu utama", inspectionLimit: "", verdict: "BAIK" },
      { name: "Tombol, Saklar dan pengaman", inspectionLimit: "", verdict: "BAIK" },
      { name: "Tampilan dan indikator", inspectionLimit: "", verdict: "BAIK" },
    ],
    measurements,
    technicianName: "Teknisi A",
    dataEntryName: "Entri B",
  };
}

function renderOnce(data: LkTemplateData): {
  pages: number;
  starts: Record<string, number>;
  ends: Record<string, number>;
} {
  const formHeader = resolveLkManualHeader("Bed Side Monitor");
  const doc = new PDFDocument({
    size: "A4",
    margins: {
      top: MARGIN_TOP,
      bottom: MARGIN_BOTTOM + FOOTER_BAND,
      left: MARGIN_LEFT,
      right: MARGIN_RIGHT,
    },
    bufferPages: true,
    autoFirstPage: true,
  });
  registerLkFonts(doc);
  const layout: LkPdfLayout = {
    header: formHeader,
    left: doc.page.margins.left,
    right: doc.page.width - doc.page.margins.right,
    width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
    halamanCells: [],
  };
  const y = beginPage(doc, layout);
  renderBedSideMonitorFromY(doc, layout, y, data);
  drawFooterAllPages(doc);
  fillHalamanAllPages(doc, layout);
  const pages = layout.halamanCells.length;
  const starts = getBsmSectionStartPages();
  const ends = getBsmSectionEndPages();
  doc.end();
  return { pages, starts, ends };
}

function expectBsmComposition(data: LkTemplateData): void {
  const { pages, starts, ends } = renderOnce(data);
  expect(pages).toBe(3);
  expect(starts.C_PHYSICAL_FUNCTION).toBe(1);
  expect(starts.D_ELECTRICAL_SAFETY).toBe(2);
  expect(starts.E_SPO2).toBe(2);
  expect(ends.E_SPO2).toBe(2);
  expect(starts.E_NIBP).toBe(3);
  expect(starts.SIGNATURE).toBe(3);
}

describe("Bed Side Monitor LK geometry (Phase 2.2)", () => {
  it("keeps 3-page composition with complete data", () => {
    expectBsmComposition(completeData());
  }, 20000);

  it("keeps 3-page composition when almost empty", () => {
    expectBsmComposition({
      identity: { ...emptyIdentity(), deviceName: "Bed Side Monitor" },
      equipmentUsed: [],
      physicalItems: [],
      measurements: [],
      technicianName: "",
      dataEntryName: "",
    });
  });

  it("keeps 3-page composition with empty measurements", () => {
    expectBsmComposition({ ...completeData(), measurements: [] });
  });

  it("keeps 3-page composition with empty physical inspection", () => {
    expectBsmComposition({ ...completeData(), physicalItems: [] });
  });
});
