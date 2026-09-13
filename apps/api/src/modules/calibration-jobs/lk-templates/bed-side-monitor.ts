import type { LkPageCompositionDefinition, LkSectionId } from "../lk-page-composition";
import {
  addContentPage,
  contentBottom,
  ensureSpace,
  fontBold,
  fontRegular,
  forceTemplatePage,
  noteLine,
  sectionTitle,
  type LkPdfLayout,
} from "../lk-pdf-layout";
import { checkboxPair, drawGridTable, markOption, type LkTableCell } from "../lk-pdf-tables";
import {
  normalizeLkKey,
  replicatesFor,
  type LkEquipmentFill,
  type LkPhysicalFill,
  type LkTemplateData,
} from "../lk-template-data";

/**
 * Reference implementation — extracted from
 * docs/technician-docs/Lembar-Kerja/LK Bed Side Monitor.docx
 * (word/document.xml tables 1–12). Wording is copied, not rewritten.
 *
 * Also used when the header catalog matches Patient Monitor to this file.
 */
export const BED_SIDE_MONITOR_SOURCE_FILE = "LK Bed Side Monitor";

export const BSM_SECTION = {
  IDENTITY: "IDENTITY",
  A_EQUIPMENT_USED: "A_EQUIPMENT_USED",
  B_ENVIRONMENT: "B_ENVIRONMENT",
  C_PHYSICAL_FUNCTION: "C_PHYSICAL_FUNCTION",
  D_ELECTRICAL_SAFETY: "D_ELECTRICAL_SAFETY",
  E_PERFORMANCE: "E_PERFORMANCE",
  E_HEART_RATE: "E_HEART_RATE",
  E_RESPIRATION: "E_RESPIRATION",
  E_SPO2: "E_SPO2",
  E_NIBP: "E_NIBP",
  NIBP_NOTE: "NIBP_NOTE",
  F_TECHNICAL_REVIEW: "F_TECHNICAL_REVIEW",
  G_CONCLUSION: "G_CONCLUSION",
  SIGNATURE: "SIGNATURE",
} as const;

/** Verified against LK Bed Side Monitor.docx page flow (3 pages). Template-specific. */
export const BED_SIDE_MONITOR_PAGE_COMPOSITION: LkPageCompositionDefinition = {
  templateKey: "BED_SIDE_MONITOR",
  pages: [
    {
      page: 1,
      sections: [
        BSM_SECTION.IDENTITY,
        BSM_SECTION.A_EQUIPMENT_USED,
        BSM_SECTION.B_ENVIRONMENT,
        BSM_SECTION.C_PHYSICAL_FUNCTION,
      ],
    },
    {
      page: 2,
      sections: [
        BSM_SECTION.D_ELECTRICAL_SAFETY,
        BSM_SECTION.E_PERFORMANCE,
        BSM_SECTION.E_HEART_RATE,
        BSM_SECTION.E_RESPIRATION,
        BSM_SECTION.E_SPO2,
      ],
    },
    {
      page: 3,
      sections: [
        BSM_SECTION.E_NIBP,
        BSM_SECTION.NIBP_NOTE,
        BSM_SECTION.F_TECHNICAL_REVIEW,
        BSM_SECTION.G_CONCLUSION,
        BSM_SECTION.SIGNATURE,
      ],
    },
  ],
};

const HR_CODES = ["BSM_HEART_RATE", "PM_HEART_RATE"] as const;
const RESP_CODES = ["BSM_RESP_RATE", "PM_RESP_RATE"] as const;
const SPO2_CODES = ["BSM_SPO2", "PM_SPO2"] as const;
const SYS_CODES = ["BSM_SYSTOLIC", "PM_SYSTOLIC"] as const;
const MAP_CODES = ["BSM_MAP", "PM_MAP"] as const;
const DIA_CODES = ["BSM_DIASTOLIC", "PM_DIASTOLIC"] as const;
const TEMP_CODES = ["BSM_ROOM_TEMP", "PM_ROOM_TEMP"] as const;
const RH_CODES = ["BSM_ROOM_HUMIDITY", "PM_ROOM_HUMIDITY"] as const;
const VOLT_CODES = ["BSM_INPUT_VOLTAGE", "PM_INPUT_VOLTAGE"] as const;
const EARTH_CODES = ["BSM_EARTH_RESISTANCE", "PM_EARTH_RESISTANCE"] as const;
const INS_CODES = ["BSM_INSULATION_RESISTANCE", "PM_INSULATION_RESISTANCE"] as const;
const EQUIP_LEAK_CODES = ["BSM_EQUIP_LEAKAGE", "PM_EQUIP_LEAKAGE"] as const;
const APPLIED_LEAK_CODES = ["BSM_APPLIED_LEAKAGE", "PM_APPLIED_LEAKAGE"] as const;

const EQUIPMENT_ROWS = [
  "Vital Signs Simulator",
  "Electrical Safety Analyzer",
  "Thermohygrometer",
] as const;

const PHYSICAL_ROWS: Array<{ name: string; inspectionLimit: string }> = [
  {
    name: "Badan / Permukaan",
    inspectionLimit:
      "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
  },
  {
    name: "Kotak kontak alat",
    inspectionLimit:
      "periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar.",
  },
  {
    name: "Kabel catu utama",
    inspectionLimit: "periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas.",
  },
  {
    name: "Tombol, Saklar dan pengaman",
    inspectionLimit:
      "sebelum mempergunakan/mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi control. Ingat peraturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan.",
  },
  {
    name: "Tampilan dan indikator",
    inspectionLimit:
      "selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi",
  },
];

function c(text: string, extra: Partial<LkTableCell> = {}): LkTableCell {
  return { text, ...extra };
}

function firstValue(data: LkTemplateData, codes: readonly string[]): string {
  const found = data.measurements
    .filter((m) => codes.includes(m.parameterCode))
    .sort((a, b) => a.replicateIndex - b.replicateIndex);
  return found[0]?.formattedValue ?? "";
}

function matchEquipment(used: LkEquipmentFill[], templateName: string): LkEquipmentFill {
  const key = normalizeLkKey(templateName);
  const hit = used.find((row) => normalizeLkKey(row.name) === key);
  return hit ?? { name: templateName, brand: "", model: "", serialNumber: "" };
}

function matchPhysical(items: LkPhysicalFill[], templateName: string): LkPhysicalFill {
  const key = normalizeLkKey(templateName);
  const hit = items.find((row) => normalizeLkKey(row.name) === key);
  const base = PHYSICAL_ROWS.find((row) => row.name === templateName)!;
  return {
    name: base.name,
    inspectionLimit: hit?.inspectionLimit?.trim() ? hit.inspectionLimit : base.inspectionLimit,
    verdict: hit?.verdict ?? null,
  };
}

function measurementBody(
  settings: number[],
  values: string[][],
  firstTolerance: string,
): LkTableCell[][] {
  return settings.map((setting, i) => {
    const row: LkTableCell[] = [
      c(String(setting), { align: "center" }),
      c(values[i]?.[0] ?? "", { align: "center" }),
      c(values[i]?.[1] ?? "", { align: "center" }),
      c(values[i]?.[2] ?? "", { align: "center" }),
      c(values[i]?.[3] ?? "", { align: "center" }),
      c(values[i]?.[4] ?? "", { align: "center" }),
    ];
    if (i === 0) {
      row.push(c(firstTolerance, { align: "center", rowSpan: settings.length }));
    }
    return row;
  });
}

/**
 * tblGrid twips from LK Bed Side Monitor.docx word/document.xml.
 * Identity table is two grid columns (5382 / 5245); each is split into
 * label + value so the four-cell row matches the printed form.
 */
const TW_IDENTITY = [5382, 5245];
const TW_SIGNATURE = [5583, 5059];
const TW_EQUIPMENT = [540, 3240, 2430, 2340, 2132];
const TW_ENVIRONMENT = [3780, 2070, 1710, 3122];
const TW_PHYSICAL = [538, 2067, 6390, 1710];
const TW_ELEC_META = [3780, 2005, 1842, 1843];
const TW_ELEC_MEAS = [642, 6866, 1418, 1701];
const TW_HEART_RATE = [1795, 1288, 1023, 1050, 1080, 989, 1891];
const TW_RESPIRATION = [1795, 990, 1080, 990, 1080, 1148, 1843];
const TW_SPO2 = [2775, 1188, 1058, 1059, 1059, 941, 1701];
const TW_NIBP = [1808, 950, 1288, 932, 937, 938, 933, 1896];
const TW_TELAAH = [1170, 4373, 1837, 1890];
/** Normal style w:spacing w:after="160" twips. */
const AFTER_SECTION_PT = 160 / 20;
/**
 * Floor for HR / Resp / SPO2 auto rows. Those tables have no w:trHeight.
 * 12.3 pt is the compact end of Word's observed auto-row band; raising it
 * toward 14.4 pt overflows SPO2 88 onto page 3.
 */
const MEAS_BODY_ROW_PT = 246 / 20;
/** BSM-only: 8→9 pt for readability. Not Word 11 pt (that overflows page 2). */
const BSM_TABLE_FONT_PT = 9;

export function isBedSideMonitorTemplate(sourceFile: string | null | undefined): boolean {
  return sourceFile === BED_SIDE_MONITOR_SOURCE_FILE;
}

const bsmSectionStartPages = new Map<LkSectionId, number>();
const bsmSectionEndPages = new Map<LkSectionId, number>();

/** 1-based template page index where each section began (last render). */
export function getBsmSectionStartPages(): Record<string, number> {
  return Object.fromEntries(bsmSectionStartPages);
}

/** 1-based page index where each section finished (last render). */
export function getBsmSectionEndPages(): Record<string, number> {
  return Object.fromEntries(bsmSectionEndPages);
}

export function renderBedSideMonitorFromY(
  doc: PDFKit.PDFDocument,
  layout: LkPdfLayout,
  startY: number,
  data: LkTemplateData,
): number {
  bsmSectionStartPages.clear();
  bsmSectionEndPages.clear();
  let y = startY;
  const pages = BED_SIDE_MONITOR_PAGE_COMPOSITION.pages;
  for (const page of pages) {
    while (layout.halamanCells.length < page.page) {
      y = forceTemplatePage(doc, layout);
    }
    for (const sectionId of page.sections) {
      y = renderBsmSection(doc, layout, y, sectionId, data);
    }
  }
  return y;
}

function renderBsmSection(
  doc: PDFKit.PDFDocument,
  layout: LkPdfLayout,
  y: number,
  sectionId: LkSectionId,
  data: LkTemplateData,
): number {
  bsmSectionStartPages.set(sectionId, layout.halamanCells.length);
  const nextY = renderBsmSectionBody(doc, layout, y, sectionId, data);
  bsmSectionEndPages.set(sectionId, layout.halamanCells.length);
  return nextY;
}

function renderBsmSectionBody(
  doc: PDFKit.PDFDocument,
  layout: LkPdfLayout,
  y: number,
  sectionId: LkSectionId,
  data: LkTemplateData,
): number {
  switch (sectionId) {
    case BSM_SECTION.IDENTITY:
      return renderIdentity(doc, layout, y, data);
    case BSM_SECTION.A_EQUIPMENT_USED:
      return renderEquipment(doc, layout, y, data);
    case BSM_SECTION.B_ENVIRONMENT:
      return renderEnvironmentSection(doc, layout, y, data);
    case BSM_SECTION.C_PHYSICAL_FUNCTION:
      return renderPhysical(doc, layout, y, data);
    case BSM_SECTION.D_ELECTRICAL_SAFETY:
      return renderElectrical(doc, layout, y, data);
    case BSM_SECTION.E_PERFORMANCE:
      return sectionTitle(doc, layout, y, "E. Hasil Pengukuran Kinerja Alat");
    case BSM_SECTION.E_HEART_RATE:
      return renderHeartRate(doc, layout, y, data);
    case BSM_SECTION.E_RESPIRATION:
      return renderRespiration(doc, layout, y, data);
    case BSM_SECTION.E_SPO2:
      return renderSpo2(doc, layout, y, data);
    case BSM_SECTION.E_NIBP:
      return renderNibpSection(doc, layout, y, data);
    case BSM_SECTION.NIBP_NOTE:
      return noteLine(
        doc,
        layout,
        y + 4,
        "Note: Untuk mengukur NIBP gunakan settingan pada heart rate 65 BPM, kecuali untuk titik 250/195 gunakan heart rate 90 BPM",
      );
    case BSM_SECTION.F_TECHNICAL_REVIEW:
      return renderTelaah(doc, layout, y);
    case BSM_SECTION.G_CONCLUSION:
      return renderConclusion(doc, layout, y);
    case BSM_SECTION.SIGNATURE:
      return signatureBlock(doc, layout, y + 12, data.technicianName, data.dataEntryName);
    default:
      return y;
  }
}

function renderIdentity(
  doc: PDFKit.PDFDocument,
  layout: LkPdfLayout,
  y: number,
  data: LkTemplateData,
): number {
  const { identity } = data;
  y = labeledLine(doc, layout, y, "No. sertifikat", identity.certificateNumber);
  y += 4;
  return (
    drawGridTable(
      doc,
      layout,
      y,
      TW_IDENTITY,
      [],
      [
        [idPair("Nama Alat", identity.deviceName), idPair("No.alat", identity.assetNumber)],
        [idPair("Merk", identity.brand), idPair("Pemilik", identity.owner)],
        [idPair("Model/tipe", identity.model), idPair("Ruangan", identity.room)],
        [idPair("No.seri", identity.serial), idPair("Tgl. Terima", identity.receivedDate)],
        [idPair("Kapasitas", identity.capacity), idPair("Tgl. Kalibrasi", identity.calibrationDate)],
        [idPair("Resolusi", identity.resolution), c("")],
      ],
      3,
      "twip",
      { fontSize: BSM_TABLE_FONT_PT },
    ) + AFTER_SECTION_PT
  );
}

function renderEquipment(
  doc: PDFKit.PDFDocument,
  layout: LkPdfLayout,
  y: number,
  data: LkTemplateData,
): number {
  y = sectionTitle(doc, layout, y, "A. Daftar Alat yang Digunakan");
  return (
    drawGridTable(
      doc,
      layout,
      y,
      TW_EQUIPMENT,
      [
        [
          c("No", { bold: true }),
          c("Nama Alat", { bold: true }),
          c("Merk", { bold: true }),
          c("Type/Model", { bold: true }),
          c("No. Seri", { bold: true }),
        ],
      ],
      EQUIPMENT_ROWS.map((name, i) => {
        const row = matchEquipment(data.equipmentUsed, name);
        return [
          c(String(i + 1), { align: "center" }),
          c(name),
          c(row.brand),
          c(row.model),
          c(row.serialNumber),
        ];
      }),
      3,
      "twip",
      { fontSize: BSM_TABLE_FONT_PT },
    ) + AFTER_SECTION_PT
  );
}

function renderEnvironmentSection(
  doc: PDFKit.PDFDocument,
  layout: LkPdfLayout,
  y: number,
  data: LkTemplateData,
): number {
  y = sectionTitle(doc, layout, y, "B. Pengukuran Kondisi Lingkungan");
  return drawEnvironment(doc, layout, y, data) + AFTER_SECTION_PT;
}

function renderPhysical(
  doc: PDFKit.PDFDocument,
  layout: LkPdfLayout,
  y: number,
  data: LkTemplateData,
): number {
  y = sectionTitle(doc, layout, y, "C. Pemerikasaan Kondisi Fisik dan Fungsi Komponen Alat");
  return (
    drawGridTable(
      doc,
      layout,
      y,
      TW_PHYSICAL,
      [
        [
          c("No.", { bold: true }),
          c("Parameter", { bold: true }),
          c("Batas Pemeriksaan", { bold: true }),
          c("Keterangan", { bold: true }),
        ],
      ],
      PHYSICAL_ROWS.map((row, i) => {
        const filled = matchPhysical(data.physicalItems, row.name);
        return [
          c(String(i + 1), { align: "center" }),
          c(filled.name),
          c(filled.inspectionLimit),
          checkboxPair(filled.verdict === "BAIK", filled.verdict === "TIDAK_BAIK"),
        ];
      }),
      3,
      "twip",
      { fontSize: BSM_TABLE_FONT_PT },
    ) + AFTER_SECTION_PT
  );
}

function renderElectrical(
  doc: PDFKit.PDFDocument,
  layout: LkPdfLayout,
  y: number,
  data: LkTemplateData,
): number {
  y = sectionTitle(doc, layout, y, "D. Pengukuran Keselamatan Listrik");
  y = drawElectricalMeta(doc, layout, y);
  y += 4;
  y = drawGridTable(
    doc,
    layout,
    y,
    TW_ELEC_MEAS,
    [
      [
        c("No.", { bold: true }),
        c("Parameter", { bold: true }),
        c("Terukur", { bold: true }),
        c("Ambang Batas", { bold: true }),
      ],
    ],
    [
      [
        c("1", { align: "center" }),
        c("Resistansi Pembumian Protektif"),
        c(suffix(firstValue(data, EARTH_CODES), "Ω")),
        c("≤ 0,3 Ω"),
      ],
      [
        c("2", { align: "center" }),
        c("Resistansi Isolasi"),
        c(suffix(firstValue(data, INS_CODES), "MΩ")),
        c("> 2 MΩ"),
      ],
      [
        c("3", { align: "center" }),
        c("Arus Bocor Peralatan"),
        c(suffix(firstValue(data, EQUIP_LEAK_CODES), "µA")),
        c("Kelas I ≤ 500 µA\nKelas II ≤ 100 µA"),
      ],
      [
        c("4", { align: "center" }),
        c("Arus bocor bagian yang diaplikasikan *"),
        c(suffix(firstValue(data, APPLIED_LEAK_CODES), "µA")),
        c("≤ 50 µA"),
      ],
    ],
    3,
    "twip",
    { fontSize: BSM_TABLE_FONT_PT },
  );
  y = noteLine(doc, layout, y + 3, "*) Tidak dilakukan jika catu daya menggunakan baterai");
  y = noteLine(doc, layout, y, "*) Diuji Ketika uut berhubungan langsung ke pasien");
  return y + AFTER_SECTION_PT;
}

function renderHeartRate(
  doc: PDFKit.PDFDocument,
  layout: LkPdfLayout,
  y: number,
  data: LkTemplateData,
): number {
  y = sectionTitle(doc, layout, y, "1. Kalibrasi Heart Rate");
  return (
    drawGridTable(
      doc,
      layout,
      y,
      TW_HEART_RATE,
      overlayHeader("Setting Simulator (BPM)", "Hasil Pengukuran (BPM)"),
      measurementBody(
        [30, 60, 120, 180],
        [30, 60, 120, 180].map((s) => replicatesFor(data.measurements, HR_CODES, s, 5)),
        "± 5 bpm",
      ),
      1,
      "twip",
      { minRowH: MEAS_BODY_ROW_PT, allowOverflowPage: false, fontSize: BSM_TABLE_FONT_PT },
    ) + AFTER_SECTION_PT
  );
}

function renderRespiration(
  doc: PDFKit.PDFDocument,
  layout: LkPdfLayout,
  y: number,
  data: LkTemplateData,
): number {
  y = sectionTitle(doc, layout, y, "2. Kalibrasi Respirasi");
  return (
    drawGridTable(
      doc,
      layout,
      y,
      TW_RESPIRATION,
      overlayHeader("Setting Simulator (BrPM)", "Hasil Pengukuran (BrPM)"),
      measurementBody(
        [15, 30, 60, 120],
        [15, 30, 60, 120].map((s) => replicatesFor(data.measurements, RESP_CODES, s, 5)),
        "± 3 BrPM",
      ),
      1,
      "twip",
      { minRowH: MEAS_BODY_ROW_PT, allowOverflowPage: false, fontSize: BSM_TABLE_FONT_PT },
    ) + AFTER_SECTION_PT
  );
}

function renderSpo2(
  doc: PDFKit.PDFDocument,
  layout: LkPdfLayout,
  y: number,
  data: LkTemplateData,
): number {
  y = sectionTitle(doc, layout, y, "3. Kalibrasi Saturasi Oxygen (SPO2)");
  return (
    drawGridTable(
      doc,
      layout,
      y,
      TW_SPO2,
      overlayHeader("Setting simulator (SPO2)", "Hasil Pengukuran (SPO2)"),
      measurementBody(
        [98, 93, 92, 85, 90, 70, 88],
        [98, 93, 92, 85, 90, 70, 88].map((s) => replicatesFor(data.measurements, SPO2_CODES, s, 5)),
        "± 3 % SPO2",
      ),
      1,
      "twip",
      { minRowH: MEAS_BODY_ROW_PT, allowOverflowPage: false, fontSize: BSM_TABLE_FONT_PT },
    ) + AFTER_SECTION_PT
  );
}

function renderNibpSection(
  doc: PDFKit.PDFDocument,
  layout: LkPdfLayout,
  y: number,
  data: LkTemplateData,
): number {
  y = sectionTitle(doc, layout, y, "4. Kalibrasi NIBP");
  return drawNibp(doc, layout, y, data);
}

function renderTelaah(doc: PDFKit.PDFDocument, layout: LkPdfLayout, y: number): number {
  y = sectionTitle(doc, layout, y, "F. Telaah Teknis");
  return (
    drawGridTable(
      doc,
      layout,
      y,
      TW_TELAAH,
      [
        [c("No", { bold: true }), c("Parameter", { bold: true }), c("Hasil Pengamatan", { bold: true, align: "center", colSpan: 2 })],
        [c(""), c(""), c("Baik", { align: "center", bold: true }), c("Tidak Baik", { align: "center", bold: true })],
      ],
      [
        [c("1", { align: "center" }), c("Kondisi Alat (10)"), c("", { align: "center" }), c("", { align: "center" })],
        [c("2", { align: "center" }), c("Keselamatan Listrik (40)"), c("", { align: "center" }), c("", { align: "center" })],
        [c("3", { align: "center" }), c("Kinerja Peralatan (50)"), c("", { align: "center" }), c("", { align: "center" })],
      ],
      3,
      "twip",
      { fontSize: BSM_TABLE_FONT_PT },
    ) + AFTER_SECTION_PT
  );
}

function renderConclusion(doc: PDFKit.PDFDocument, layout: LkPdfLayout, y: number): number {
  y = sectionTitle(doc, layout, y, "G. Kesimpulan Telaah Teknis Kalibrasi");
  return conclusionBlock(doc, layout, y);
}

/** Word header row 1: setting | hasil (gridSpan 5) | toleransi */
function overlayHeader(setting: string, result: string): LkTableCell[][] {
  return [
    [
      c(setting, { bold: true, align: "center" }),
      c(result, { bold: true, align: "center", colSpan: 5 }),
      c("Toleransi", { bold: true, align: "center", rowSpan: 2 }),
    ],
    [
      c(""),
      c("I", { align: "center", bold: true }),
      c("II", { align: "center", bold: true }),
      c("III", { align: "center", bold: true }),
      c("IV", { align: "center", bold: true }),
      c("V", { align: "center", bold: true }),
    ],
  ];
}

function idPair(label: string, value: string): LkTableCell {
  const suffix = value ? `  ${value}` : "";
  return c(`${label} :${suffix}`);
}

function suffix(value: string, unit: string): string {
  if (!value) return "";
  return `${value} ${unit}`;
}

function labeledLine(doc: PDFKit.PDFDocument, layout: LkPdfLayout, y: number, label: string, value: string): number {
  const top = ensureSpace(doc, layout, y, 14);
  doc.font(fontRegular()).fontSize(9).fillColor("#000000").text(`${label} :  ${value}`, layout.left, top, {
    width: layout.width,
  });
  return top + 14;
}

function drawEnvironment(doc: PDFKit.PDFDocument, layout: LkPdfLayout, y: number, data: LkTemplateData): number {
  // Awal/Akhir and L-N/L-G/N-G are not authoritatively mapped in the schema
  // (see forensic 09). Template cells stay; only a single unidentified reading
  // is left blank rather than guessed into a specific cell.
  void firstValue(data, TEMP_CODES);
  void firstValue(data, RH_CODES);
  void firstValue(data, VOLT_CODES);
  return drawGridTable(
    doc,
    layout,
    y,
    TW_ENVIRONMENT,
    [[c("Kondisi Ruangan", { bold: true }), c("Terukur", { bold: true }), c(""), c("Toleransi", { bold: true })]],
    [
      [c("Suhu (°C)"), c("Awal :            °C"), c("Akhir :            °C"), c("25 ± 5 °C")],
      [c("Kelembaban / RH (%)"), c("Awal :            %"), c("Akhir :            %"), c("55 % ± 20 % RH")],
      [c("Tegangan Input"), c("L-N    :              Vac"), c(""), c("220 ± 10% Volt")],
      [c(""), c("L-G    :              Vac"), c(""), c("")],
      [c(""), c("N-G    :              Vac"), c(""), c("")],
    ],
    3,
    "twip",
    { fontSize: BSM_TABLE_FONT_PT },
  );
}

function drawElectricalMeta(doc: PDFKit.PDFDocument, layout: LkPdfLayout, y: number): number {
  // Classification metadata is not stored on CalibrationJob / Device (forensic 09).
  return drawGridTable(
    doc,
    layout,
    y,
    TW_ELEC_META,
    [],
    [
      [
        c("Tipe bagian yang diaplikasikan"),
        markOption(null, "B"),
        markOption(null, "BF"),
        markOption(null, "CF"),
      ],
      [c("Kelas Proteksi"), markOption(null, "I"), markOption(null, "II"), markOption(null, "Baterai")],
      [c("Hubungan Utama"), markOption(null, "DPS"), markOption(null, "NPS"), markOption(null, "PIE")],
      [
        c("Catatan:"),
        c(
          "PIE : Peralatan yang diinstalasi permanen\nNPS: Kabel catu daya yang tidak dapat dilepas\nDPS: Kabel catu daya yang dapat dilepas",
          { colSpan: 3 },
        ),
      ],
    ],
    3,
    "twip",
    { fontSize: BSM_TABLE_FONT_PT },
  );
}

function drawNibp(doc: PDFKit.PDFDocument, layout: LkPdfLayout, y: number, data: LkTemplateData): number {
  const triples: Array<[number, number, number]> = [
    [120, 93, 80],
    [150, 116, 100],
    [200, 166, 150],
    [250, 215, 195],
    [60, 40, 30],
    [80, 60, 50],
    [100, 76, 65],
  ];
  const body: LkTableCell[][] = [];
  triples.forEach(([sys, map, dia], i) => {
    const sysV = replicatesFor(data.measurements, SYS_CODES, sys, 5);
    const mapV = replicatesFor(data.measurements, MAP_CODES, map, 5);
    const diaV = replicatesFor(data.measurements, DIA_CODES, dia, 5);
    const sysRow: LkTableCell[] = [
      c("Systole"),
      c(String(sys), { align: "center" }),
      ...sysV.map((v) => c(v, { align: "center" })),
    ];
    if (i === 0) {
      sysRow.push(c("± 5 mmHg", { align: "center", rowSpan: 21 }));
    }
    body.push(sysRow);
    body.push([
      c("Mean"),
      c(String(map), { align: "center" }),
      ...mapV.map((v) => c(v, { align: "center" })),
    ]);
    body.push([
      c("Diastole"),
      c(String(dia), { align: "center" }),
      ...diaV.map((v) => c(v, { align: "center" })),
    ]);
  });
  return drawGridTable(
    doc,
    layout,
    y,
    TW_NIBP,
    [
      [
        c("Setting Simulator (mmHg)", { bold: true, align: "center", colSpan: 2, rowSpan: 2 }),
        c("Hasil Pengukuran (mmHg)", { bold: true, align: "center", colSpan: 5 }),
        c("Toleransi", { bold: true, align: "center", rowSpan: 2 }),
      ],
      [
        c("I", { align: "center", bold: true }),
        c("II", { align: "center", bold: true }),
        c("III", { align: "center", bold: true }),
        c("IV", { align: "center", bold: true }),
        c("V", { align: "center", bold: true }),
      ],
    ],
    body,
    3,
    "twip",
    { fontSize: BSM_TABLE_FONT_PT },
  );
}

function conclusionBlock(doc: PDFKit.PDFDocument, layout: LkPdfLayout, y: number): number {
  let top = ensureSpace(doc, layout, y, 36);
  const lines = ["Baik dan laik untuk digunakan", "Tidak baik dan tidak laik untuk digunakan"];
  for (const line of lines) {
    if (top + 14 > contentBottom(doc)) top = addContentPage(doc, layout);
    doc.font(fontRegular()).fontSize(9).fillColor("#000000").text(line, layout.left + 12, top, {
      width: 260,
    });
    doc.save();
    doc.circle(layout.left + 290, top + 5, 3.4).strokeColor("#000000").lineWidth(0.7).stroke();
    doc.restore();
    top += 14;
  }
  return top + 8;
}

function signatureBlock(
  doc: PDFKit.PDFDocument,
  layout: LkPdfLayout,
  y: number,
  technician: string,
  dataEntry: string,
): number {
  return drawGridTable(
    doc,
    layout,
    y,
    TW_SIGNATURE,
    [],
    [
      [
        c(`Petugas Kalibrasi :\n${technician}`, { minHeight: 932 / 20 }),
        c(`Entri data oleh :\n${dataEntry}`, { minHeight: 932 / 20 }),
      ],
    ],
    6,
    "twip",
    { fontSize: BSM_TABLE_FONT_PT },
  );
}
