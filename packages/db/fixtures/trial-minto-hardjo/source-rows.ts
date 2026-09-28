/**
 * Minto Hardjo High-Volume Calibration Trial — source dataset.
 *
 * Verbatim 56-row / 406-unit table from `po-mintohardjo.xlsx`, as independently
 * re-verified in `MINTO-HARDJO-HIGH-VOLUME-TRIAL-AUDIT-REPORT.md` §3. Names and
 * quantities are the real customer-declared values from the source spreadsheet —
 * never invented, never adjusted to hit a round number. `rowNumber` is 1-based
 * and matches the audit report's own table numbering for cross-reference.
 *
 * This file is pure data with zero framework/business-logic dependencies, so it
 * can be imported by anything (packages/db seed scripts, apps/api orchestration
 * scripts, tests) without creating a backwards dependency edge.
 */

export interface TrialSourceRow {
  rowNumber: number;
  /** Verbatim customer-declared device name from the Excel file. */
  customerDeviceName: string;
  qty: number;
}

export const TRIAL_SOURCE_ROWS: readonly TrialSourceRow[] = [
  { rowNumber: 1, customerDeviceName: "Anesthesia With Ventilator", qty: 7 },
  { rowNumber: 2, customerDeviceName: "Audiometri", qty: 2 },
  { rowNumber: 3, customerDeviceName: "Auto Keratometer / Refractometers", qty: 1 },
  { rowNumber: 4, customerDeviceName: "Auto Refractometers", qty: 1 },
  { rowNumber: 5, customerDeviceName: "Automated External Defibrillator (AED)", qty: 3 },
  { rowNumber: 6, customerDeviceName: "Bio Safety Cabinet (BSC)", qty: 2 },
  { rowNumber: 7, customerDeviceName: "Biometri", qty: 1 },
  { rowNumber: 8, customerDeviceName: "Centrifuge", qty: 2 },
  { rowNumber: 9, customerDeviceName: "CPAP", qty: 1 },
  { rowNumber: 10, customerDeviceName: "Cryotherapy Unit", qty: 1 },
  { rowNumber: 11, customerDeviceName: "CUSA (cavitron ultrasonic surgical aspirator)", qty: 1 },
  { rowNumber: 12, customerDeviceName: "Defibrillator", qty: 11 },
  { rowNumber: 13, customerDeviceName: "Digital X-Ray DR Reader", qty: 1 },
  { rowNumber: 14, customerDeviceName: "Electrocardiograph (EKG)", qty: 20 },
  { rowNumber: 15, customerDeviceName: "Electrostimulator / Tens", qty: 6 },
  { rowNumber: 16, customerDeviceName: "Electrosurgical Unit (ESU)", qty: 17 },
  { rowNumber: 17, customerDeviceName: "ENT Unit", qty: 3 },
  { rowNumber: 18, customerDeviceName: "HENC Ambubag", qty: 2 },
  { rowNumber: 19, customerDeviceName: "High Flow Nasal Cannula (HFNC)", qty: 2 },
  { rowNumber: 20, customerDeviceName: "Holter", qty: 10 },
  { rowNumber: 21, customerDeviceName: "Infrared Standing / Mobile", qty: 1 },
  { rowNumber: 22, customerDeviceName: "Infusion Pump", qty: 42 },
  { rowNumber: 23, customerDeviceName: "Injector", qty: 4 },
  { rowNumber: 24, customerDeviceName: "Laparoscopy", qty: 2 },
  { rowNumber: 25, customerDeviceName: "Lensometer Mata", qty: 3 },
  { rowNumber: 26, customerDeviceName: "Medical Frezer", qty: 1 },
  { rowNumber: 27, customerDeviceName: "Microscope", qty: 2 },
  { rowNumber: 28, customerDeviceName: "Nebulizer", qty: 22 },
  { rowNumber: 29, customerDeviceName: "Operating Microscope", qty: 5 },
  { rowNumber: 30, customerDeviceName: "Parafin Bath", qty: 1 },
  { rowNumber: 31, customerDeviceName: "Photo Therapy (Blue Light)", qty: 5 },
  { rowNumber: 32, customerDeviceName: "Pulse Oximeter", qty: 11 },
  { rowNumber: 33, customerDeviceName: "Resuscitator / Neo Puff", qty: 1 },
  { rowNumber: 34, customerDeviceName: "Rotablator", qty: 1 },
  { rowNumber: 35, customerDeviceName: "Shock Wave Therapy", qty: 1 },
  { rowNumber: 36, customerDeviceName: "Sterilisator Basah", qty: 2 },
  { rowNumber: 37, customerDeviceName: "Syringe Pump", qty: 94 },
  { rowNumber: 38, customerDeviceName: "Tensimeter Analog", qty: 28 },
  { rowNumber: 39, customerDeviceName: "Thermohygrometer", qty: 10 },
  { rowNumber: 40, customerDeviceName: "Timbangan badan + tinggi", qty: 19 },
  { rowNumber: 41, customerDeviceName: "Timbangan Dewasa Digital", qty: 3 },
  { rowNumber: 42, customerDeviceName: "Timbangan Massa", qty: 2 },
  { rowNumber: 43, customerDeviceName: "Timbangan Obat", qty: 1 },
  { rowNumber: 44, customerDeviceName: "Tonometer", qty: 1 },
  { rowNumber: 45, customerDeviceName: "Traction", qty: 2 },
  { rowNumber: 46, customerDeviceName: "Treadmill", qty: 3 },
  { rowNumber: 47, customerDeviceName: "Ultrasonography (USG)", qty: 14 },
  { rowNumber: 48, customerDeviceName: "Ultrasound Therapy", qty: 3 },
  { rowNumber: 49, customerDeviceName: "Ventilator", qty: 17 },
  { rowNumber: 50, customerDeviceName: "Water bath", qty: 3 },
  { rowNumber: 51, customerDeviceName: "Water Seal Drainage Pump (WSD)", qty: 2 },
  { rowNumber: 52, customerDeviceName: "X-Ray Bone Mineral Densitometri (BMD)", qty: 1 },
  { rowNumber: 53, customerDeviceName: "X-Ray C-Arm", qty: 1 },
  { rowNumber: 54, customerDeviceName: "X-Ray Dental", qty: 2 },
  { rowNumber: 55, customerDeviceName: "X-Ray Mobile", qty: 1 },
  { rowNumber: 56, customerDeviceName: "X-Ray Mobile FDR X-Air", qty: 1 },
] as const;

export const TRIAL_TOTAL_UNITS = TRIAL_SOURCE_ROWS.reduce((sum, row) => sum + row.qty, 0);
export const TRIAL_TOTAL_ROWS = TRIAL_SOURCE_ROWS.length;

// Compile-time-adjacent guard: fails loudly at import time if the source table
// above is ever hand-edited into an inconsistent state (56 rows / 406 units are
// both hard invariants of this specific trial, per the approved plan §A.1).
if (TRIAL_TOTAL_ROWS !== 56) {
  throw new Error(`TRIAL_SOURCE_ROWS must have exactly 56 rows, found ${TRIAL_TOTAL_ROWS}`);
}
if (TRIAL_TOTAL_UNITS !== 406) {
  throw new Error(`TRIAL_SOURCE_ROWS must sum to exactly 406 units, found ${TRIAL_TOTAL_UNITS}`);
}
