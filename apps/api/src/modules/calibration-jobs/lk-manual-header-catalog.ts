/**
 * Header metadata extracted from the official blank LK templates in
 * docs/technician-docs/Lembar-Kerja/*.docx (word/header1.xml, or header2.xml
 * for LK Laryngoskop.docx). Values are copied as printed — not invented,
 * not normalized across files.
 *
 * Used only by the LK result PDF header. Not a business-data mapping.
 */

export interface LkManualHeaderMeta {
  /** Template filename without extension. */
  sourceFile: string;
  /** Printed "Kode Dokumen" value, exactly as in the header XML. */
  documentCode: string;
  /** Printed "Edisi / Revisi" value. */
  editionRevision: string;
  editionDate: string;
  revisionDate: string;
  /** First title line in the merged center cell (18 pt bold in the .docx). */
  formTitle: string;
  /** Second title line in the merged center cell, as printed. */
  deviceTitle: string;
}

export interface LkResolvedFormHeader extends LkManualHeaderMeta {
  /** True when a template header was matched; false when fields stay blank. */
  matched: boolean;
}

const CATALOG: LkManualHeaderMeta[] = [
  {
    sourceFile: "LK Audiometer",
    documentCode: "F.MT.LK.01.60",
    editionRevision: "01 / 00",
    editionDate: "05-05-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Kalibrasi Audiometer",
  },
  {
    sourceFile: "LK Auto Chemistry Analyzer",
    documentCode: "F.MT.LK.01.59",
    editionRevision: "01 / 00",
    editionDate: "05-05-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Kalibrasi Auto Chemistry Analyzer",
  },
  {
    sourceFile: "LK Autoclave",
    documentCode: "F.MT.LK.01.44",
    editionRevision: "01 / 00",
    editionDate: "05-05-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja Kalibrasi",
    deviceTitle: "Autoclave",
  },
  {
    sourceFile: "LK Baby Incubator",
    documentCode: "F.MT.LK.01.1",
    editionRevision: "01 / 01",
    editionDate: "13-01-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Kalibrasi Baby Incubator",
  },
  {
    sourceFile: "LK Bed Side Monitor",
    documentCode: "F.MT.LK.01.3",
    editionRevision: "01 / 01",
    editionDate: "13-01-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Kalibrasi Bed Side Monitor / Patient Monitor",
  },
  {
    sourceFile: "LK Bio Safety Cabinet",
    documentCode: "F.MT.LK.01.33",
    editionRevision: "01 / 00",
    editionDate: "05-05-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Pengujian Bio Safety Cabinet",
  },
  {
    sourceFile: "LK Blanket Warmer",
    documentCode: "F.MT.LK.01.22",
    editionRevision: "01 / 00",
    editionDate: "13-01-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Kalibrasi Blanket Warmer",
  },
  {
    sourceFile: "LK Blood Bank Refrigerator",
    documentCode: "F.MT.LK.01.2",
    editionRevision: "01 / 02",
    editionDate: "13-01-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Kalibrasi Blood Bank Refrigerator",
  },
  {
    sourceFile: "LK Blood Pressure Monitor",
    documentCode: "F.MT.LK.01.4",
    editionRevision: "01 / 01",
    editionDate: "13-01-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Kalibrasi Blood Pressure Meter",
  },
  {
    sourceFile: "LK Centrifuge Refrigerator",
    documentCode: "F.MT.LK.01.38",
    editionRevision: "01 / 00",
    editionDate: "05-05-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Kalibrasi Centrifuge Refrigerator",
  },
  {
    sourceFile: "LK Centrifuge",
    documentCode: "F.MT.LK.01.30",
    editionRevision: "01 / 00",
    editionDate: "05-05-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Kalibrasi Centrifuge",
  },
  {
    sourceFile: "LK Cold Chain, Vaccine Refrigerator",
    documentCode: "F.MT.LK.01.23",
    editionRevision: "01 / 02",
    editionDate: "05-05-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Kalibrasi Cold Chain, Vaccine Refrigerator",
  },
  {
    sourceFile: "LK CPAP",
    documentCode: "F.MT.LK.01.46",
    editionRevision: "01 / 00",
    editionDate: "05-05-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "CPAP",
  },
  {
    sourceFile: "LK Dental Unit",
    documentCode: "F.MT.LK.01.61",
    editionRevision: "01 / 00",
    editionDate: "10-04-2026",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Kalibrasi Dental Unit",
  },
  {
    sourceFile: "LK Dental X-Ray",
    documentCode: "F.MT.LK.01.62",
    editionRevision: "01 / 00",
    editionDate: "10-04-2026",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Pengujian Dental X-Ray",
  },
  {
    sourceFile: "LK Electro Accupunture (EST)",
    documentCode: "F.MT.LK.01.64",
    editionRevision: "01 / 00",
    editionDate: "10-04-2026",
    revisionDate: "-",
    formTitle: "Lembar Kerja Kalibrasi",
    deviceTitle: "Electro Accupunture (EST)",
  },
  {
    sourceFile: "LK Electrocardiograph",
    documentCode: "F.MT.LK.01.5",
    editionRevision: "01 / 01",
    editionDate: "13-01-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Kalibrasi Electrocardiograph",
  },
  {
    sourceFile: "LK Examination Lamp",
    documentCode: "F.MT.LK.01.31",
    editionRevision: "01 / 00",
    editionDate: "05-05-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Pengujian Examination Lamp",
  },
  {
    sourceFile: "LK Fetal Doppler",
    documentCode: "F.MT.LK.01.34",
    editionRevision: "01 / 00",
    editionDate: "05-05-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Kalibrasi Fetal Doppler",
  },
  {
    sourceFile: "LK Flow Meter",
    documentCode: "F.MT.LK.01.6",
    editionRevision: "01 / 01",
    editionDate: "13-01-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Kalibrasi Flow Meter",
  },
  {
    sourceFile: "LK Head Lamp Medik",
    documentCode: "F.MT.LK.01.57",
    editionRevision: "01 / 00",
    editionDate: "05-05-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Pengujian Head Lamp Medik",
  },
  {
    sourceFile: "LK Hematologi Analyzer",
    documentCode: "F.MT.LK.01.51",
    editionRevision: "01 / 00",
    editionDate: "05-05-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Kalibrasi Hematologi Analyzer",
  },
  {
    sourceFile: "LK Humidifier",
    documentCode: "F.MT.LK.01.16",
    editionRevision: "01 / 01",
    editionDate: "13-01-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Kalibrasi Humidifier",
  },
  {
    sourceFile: "LK Infant Warmer",
    documentCode: "F.MT.LK.01.13",
    editionRevision: "01 / 01",
    editionDate: "13-01-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja Kalibrasi",
    deviceTitle: "Infant Warmer",
  },
  {
    sourceFile: "LK Infusion Pump",
    documentCode: "F.MT.LK.01.25",
    editionRevision: "01 / 00",
    editionDate: "05-05-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Infusion Pump",
  },
  {
    sourceFile: "LK Kelistrikan",
    documentCode: "F.MT.LK.01.001",
    editionRevision: "01 / 01",
    editionDate: "13-01-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Kalibrasi Kelistrikan",
  },
  {
    sourceFile: "LK Laminar Air Flow",
    documentCode: "F.MT.LK.01.32",
    editionRevision: "01 / 00",
    editionDate: "05-05-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Pengujian Laminar Air Flow",
  },
  {
    sourceFile: "LK Lampu Operasi",
    documentCode: "F.MT.LK.01.45",
    editionRevision: "01 / 00",
    editionDate: "05-05-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Pengujian Lampu Operasi",
  },
  {
    sourceFile: "LK Laryngoskop",
    documentCode: "F.MT.LK.01.43",
    editionRevision: "01 / 00",
    editionDate: "05-05-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Pengujian Layngoscope Light",
  },
  {
    sourceFile: "LK Medical Freezer",
    documentCode: "F.MT.LK.01.7",
    editionRevision: "01 / 02",
    editionDate: "13-01-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Kalibrasi Medical Freezer",
  },
  {
    sourceFile: "LK Medical Refrigerator",
    documentCode: "F.MT.LK.01.08",
    editionRevision: "01 / 02",
    editionDate: "13-01-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Kalibrasi Medical Refrigerator",
  },
  {
    sourceFile: "LK Mikroskop Laboratorium",
    documentCode: "F.MT.LK.01.47",
    editionRevision: "01 / 00",
    editionDate: "05-05-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Mikroskop Laboratorium",
  },
  {
    sourceFile: "LK Nebulizer Compressor",
    documentCode: "F.MT.LK.01.9A",
    editionRevision: "01 / 01",
    editionDate: "13-01-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Kalibrasi Nebulizer Compressor",
  },
  {
    sourceFile: "LK Nebulizer Ultrasonic",
    documentCode: "F.MT.LK.01.9B",
    editionRevision: "01 / 01",
    editionDate: "13-01-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Kalibrasi Nebulizer Ultrasonic",
  },
  {
    sourceFile: "LK Oksigen Concentrator",
    documentCode: "F.MT.LK.01.18",
    editionRevision: "01 / 01",
    editionDate: "13-01-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Kalibrasi Oxygen Concentrator",
  },
  {
    sourceFile: "LK Otoscope",
    documentCode: "F.MT.LK.01.50",
    editionRevision: "01 / 00",
    editionDate: "05-05-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Pengujian Otoscope",
  },
  {
    sourceFile: "LK Oven",
    documentCode: "F.MT.LK.01.10",
    editionRevision: "01 / 02",
    editionDate: "13-01-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Kalibrasi Oven",
  },
  {
    sourceFile: "LK pH Meter",
    documentCode: "F.MT.LK.01.71",
    editionRevision: "01 / 00",
    editionDate: "10-04-2026",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Kalibrasi pH Meter",
  },
  {
    sourceFile: "LK Phaco Emulsifikasi",
    documentCode: "F.MT.LK.01.41",
    editionRevision: "01 / 00",
    editionDate: "05-05-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Kalibrasi Phaco Emulsifikasi",
  },
  {
    sourceFile: "LK Phototherapy",
    documentCode: "F.MT.LK.01.36",
    editionRevision: "01 / 00",
    editionDate: "05-05-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Kalibrasi Phototherapy Unit",
  },
  {
    sourceFile: "LK Platelet Agitator Incubator",
    documentCode: "F.MT.LK.01.37",
    editionRevision: "01 / 00",
    editionDate: "05-05-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja Kalibrasi",
    deviceTitle: "Platelet Agitator Incubator",
  },
  {
    sourceFile: "LK Pulse Oxymeter",
    documentCode: "F.MT.LK.01.17",
    editionRevision: "01 / 01",
    editionDate: "13-01-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Kalibrasi Pulse Oxymeter",
  },
  {
    sourceFile: "LK Resusitator Paru dan Neopuff",
    documentCode: "F.MT.LK.01.21",
    editionRevision: "01 / 01",
    editionDate: "13-01-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Kalibrasi Resusitator Paru / Neopuff",
  },
  {
    sourceFile: "LK Rotator",
    documentCode: "F.MT.LK.01.35",
    editionRevision: "01 / 00",
    editionDate: "05-05-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Kalibrasi Rotator",
  },
  {
    sourceFile: "LK Sphygmomanometer",
    documentCode: "F.MT.LK.01.14",
    editionRevision: "01 / 01",
    editionDate: "13-01-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Sphygmomanometer",
  },
  {
    sourceFile: "LK Spirometer",
    documentCode: "F.MT.LK.01.52",
    editionRevision: "01 / 00",
    editionDate: "05-05-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Kalibrasi Spirometer",
  },
  {
    sourceFile: "LK Sterilisator",
    documentCode: "F.MT.LK.01.19",
    editionRevision: "01 / 02",
    editionDate: "13-01-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja Kalibrasi",
    deviceTitle: "Sterilisator Kering",
  },
  {
    sourceFile: "LK Suction Pump",
    documentCode: "F.MT.LK.01.11ABC",
    editionRevision: "01 / 00",
    editionDate: "05-05-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Kalibrasi Suction Pump",
  },
  {
    sourceFile: "LK Syringe Pump",
    documentCode: "F.MT.LK.01.24",
    editionRevision: "01 / 00",
    editionDate: "05-05-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Syringe Pump",
  },
  {
    sourceFile: "LK Thermohygrometer",
    documentCode: "F.MT.LK.01. 48",
    editionRevision: "01 / 00",
    editionDate: "05-05-2025",
    revisionDate: "-",
    formTitle: "Lembar Kerja",
    deviceTitle: "Kalibrasi Thermohygrometer",
  },
];

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function catalogKeys(entry: LkManualHeaderMeta): string[] {
  const fromFile = entry.sourceFile.replace(/^LK\s+/i, "");
  const keys = new Set<string>([normalizeKey(fromFile), normalizeKey(entry.deviceTitle)]);
  for (const part of entry.deviceTitle.split("/")) {
    const stripped = part.replace(/^\s*(kalibrasi|pengujian)\s+/i, "").trim();
    if (stripped) keys.add(normalizeKey(stripped));
  }
  return [...keys];
}

const INDEX: Array<{ keys: string[]; entry: LkManualHeaderMeta }> = CATALOG.map((entry) => ({
  keys: catalogKeys(entry),
  entry,
}));

export function blankLkFormHeader(deviceTypeName: string | null): LkResolvedFormHeader {
  return {
    sourceFile: "",
    documentCode: "",
    editionRevision: "",
    editionDate: "",
    revisionDate: "",
    formTitle: "Lembar Kerja",
    deviceTitle: deviceTypeName?.trim() ?? "",
    matched: false,
  };
}

/**
 * Resolve printed header fields from a DeviceType name. Match is exact on
 * normalized filename / header title tokens only — never invents a document code.
 */
export function resolveLkManualHeader(deviceTypeName: string | null): LkResolvedFormHeader {
  const fallback = blankLkFormHeader(deviceTypeName);
  if (!deviceTypeName?.trim()) return fallback;

  const raw = normalizeKey(deviceTypeName);
  const stripped = normalizeKey(deviceTypeName.replace(/^\s*(kalibrasi|pengujian)\s+/i, ""));
  const candidates = new Set([raw, stripped]);

  const hits = INDEX.filter((row) => row.keys.some((key) => candidates.has(key)));
  if (hits.length !== 1) return fallback;
  return { ...hits[0].entry, matched: true };
}
