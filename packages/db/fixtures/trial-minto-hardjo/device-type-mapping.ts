/**
 * Minto Hardjo High-Volume Calibration Trial — per-row DeviceType resolution.
 *
 * Pins every one of the 56 `TRIAL_SOURCE_ROWS` to a `DeviceType.code`, per the
 * locked mapping priority in the approved plan (§A.6, §C.2):
 *   exact match > existing alias/known mapping > representative existing
 *   DeviceType > synthetic DeviceType.
 *
 * "tier" is metadata only (traceability / reporting); the actual link to the
 * database is always `deviceTypeCode`, resolved to a live `DeviceType.id` at
 * seed time — exact ("EXACT"/"ALIAS"/"REPRESENTATIVE" tiers) codes must already
 * exist in the live DeviceType table (seed-device-types.ts); "SYNTHETIC" tier
 * codes are created by `seed-trial-minto-hardjo-device-types.ts` before this
 * mapping is used.
 *
 * No `DeviceTypeAlias` row is created for the REPRESENTATIVE tier (plan §C.2):
 * `import/confirm`'s wire format already requires an explicit `deviceTypeId`
 * per row, so pinning the code here is exactly how a human reviewer would
 * resolve these rows through the real UI — zero footprint on shared alias
 * master data.
 */
import { TRIAL_SOURCE_ROWS } from "./source-rows";

export type TrialMappingTier = "EXACT" | "ALIAS" | "REPRESENTATIVE" | "SYNTHETIC";

export interface TrialDeviceTypeMappingRow {
  rowNumber: number;
  tier: TrialMappingTier;
  /** DeviceType.code to resolve at seed time (live catalog or synthetic seed). */
  deviceTypeCode: string;
}

const MAPPING_BY_ROW: Record<number, Omit<TrialDeviceTypeMappingRow, "rowNumber">> = {
  1: { tier: "SYNTHETIC", deviceTypeCode: "TRIAL_MH_ANESTHESIA_VENTILATOR" }, // Anesthesia With Ventilator
  2: { tier: "REPRESENTATIVE", deviceTypeCode: "AUDIOMETER" }, // Audiometri
  3: { tier: "SYNTHETIC", deviceTypeCode: "TRIAL_MH_AUTO_KERATOMETER" }, // Auto Keratometer / Refractometers
  4: { tier: "SYNTHETIC", deviceTypeCode: "TRIAL_MH_AUTO_REFRACTOMETER" }, // Auto Refractometers
  5: { tier: "SYNTHETIC", deviceTypeCode: "TRIAL_MH_AED" }, // Automated External Defibrillator (AED)
  6: { tier: "REPRESENTATIVE", deviceTypeCode: "BIO_SAFETY_CABINET" }, // Bio Safety Cabinet (BSC)
  7: { tier: "SYNTHETIC", deviceTypeCode: "TRIAL_MH_BIOMETRY" }, // Biometri
  8: { tier: "EXACT", deviceTypeCode: "CENTRIFUGE" }, // Centrifuge
  9: { tier: "EXACT", deviceTypeCode: "CPAP" }, // CPAP
  10: { tier: "SYNTHETIC", deviceTypeCode: "TRIAL_MH_CRYOTHERAPY" }, // Cryotherapy Unit
  11: { tier: "SYNTHETIC", deviceTypeCode: "TRIAL_MH_CUSA" }, // CUSA
  12: { tier: "SYNTHETIC", deviceTypeCode: "TRIAL_MH_DEFIBRILLATOR" }, // Defibrillator
  13: { tier: "SYNTHETIC", deviceTypeCode: "TRIAL_MH_DIGITAL_XRAY_DR_READER" }, // Digital X-Ray DR Reader
  14: { tier: "REPRESENTATIVE", deviceTypeCode: "ELECTROCARDIOGRAPHS" }, // Electrocardiograph (EKG)
  15: { tier: "SYNTHETIC", deviceTypeCode: "TRIAL_MH_ELECTROSTIMULATOR" }, // Electrostimulator / Tens
  16: { tier: "SYNTHETIC", deviceTypeCode: "TRIAL_MH_ESU" }, // Electrosurgical Unit (ESU)
  17: { tier: "SYNTHETIC", deviceTypeCode: "TRIAL_MH_ENT_UNIT" }, // ENT Unit
  18: { tier: "REPRESENTATIVE", deviceTypeCode: "RESUSCITATORS_PULMONARY" }, // HENC Ambubag
  19: { tier: "SYNTHETIC", deviceTypeCode: "TRIAL_MH_HFNC" }, // High Flow Nasal Cannula (HFNC)
  20: { tier: "ALIAS", deviceTypeCode: "AMBULATORY_ECG" }, // Holter — zero calibration parameters, stays PENDING only
  21: { tier: "SYNTHETIC", deviceTypeCode: "TRIAL_MH_INFRARED_THERAPY" }, // Infrared Standing / Mobile
  22: { tier: "EXACT", deviceTypeCode: "INFUSION_PUMP" }, // Infusion Pump
  23: { tier: "SYNTHETIC", deviceTypeCode: "TRIAL_MH_INJECTOR" }, // Injector
  24: { tier: "SYNTHETIC", deviceTypeCode: "TRIAL_MH_LAPAROSCOPY" }, // Laparoscopy
  25: { tier: "SYNTHETIC", deviceTypeCode: "TRIAL_MH_LENSOMETER" }, // Lensometer Mata
  26: { tier: "REPRESENTATIVE", deviceTypeCode: "MEDICAL_FREEZER" }, // Medical Frezer
  27: { tier: "SYNTHETIC", deviceTypeCode: "TRIAL_MH_MICROSCOPE" }, // Microscope (deliberately not Mikroskop Laboratorium — see plan §C.2)
  28: { tier: "ALIAS", deviceTypeCode: "NEBULIZER_COMPRESSOR" }, // Nebulizer
  29: { tier: "SYNTHETIC", deviceTypeCode: "TRIAL_MH_OPERATING_MICROSCOPE" }, // Operating Microscope
  30: { tier: "REPRESENTATIVE", deviceTypeCode: "PARAFFIN_BATHS" }, // Parafin Bath
  31: { tier: "REPRESENTATIVE", deviceTypeCode: "PHOTOTHERAPY" }, // Photo Therapy (Blue Light)
  32: { tier: "ALIAS", deviceTypeCode: "PULSE_OXIMETERS" }, // Pulse Oximeter
  33: { tier: "REPRESENTATIVE", deviceTypeCode: "RESUSCITATORS_PULMONARY" }, // Resuscitator / Neo Puff
  34: { tier: "SYNTHETIC", deviceTypeCode: "TRIAL_MH_ROTABLATOR" }, // Rotablator
  35: { tier: "SYNTHETIC", deviceTypeCode: "TRIAL_MH_SHOCK_WAVE_THERAPY" }, // Shock Wave Therapy
  36: { tier: "REPRESENTATIVE", deviceTypeCode: "STERILLIZER" }, // Sterilisator Basah
  37: { tier: "EXACT", deviceTypeCode: "SYRINGE_PUMP" }, // Syringe Pump
  38: { tier: "REPRESENTATIVE", deviceTypeCode: "SPHYGMOMANOMETERS" }, // Tensimeter Analog
  39: { tier: "SYNTHETIC", deviceTypeCode: "TRIAL_MH_THERMOHYGROMETER" }, // Thermohygrometer
  40: { tier: "SYNTHETIC", deviceTypeCode: "TRIAL_MH_TIMBANGAN_BADAN_TINGGI" }, // Timbangan badan + tinggi
  41: { tier: "SYNTHETIC", deviceTypeCode: "TRIAL_MH_TIMBANGAN_DEWASA_DIGITAL" }, // Timbangan Dewasa Digital
  42: { tier: "SYNTHETIC", deviceTypeCode: "TRIAL_MH_TIMBANGAN_MASSA" }, // Timbangan Massa
  43: { tier: "SYNTHETIC", deviceTypeCode: "TRIAL_MH_TIMBANGAN_OBAT" }, // Timbangan Obat
  44: { tier: "SYNTHETIC", deviceTypeCode: "TRIAL_MH_TONOMETER" }, // Tonometer
  45: { tier: "SYNTHETIC", deviceTypeCode: "TRIAL_MH_TRACTION" }, // Traction
  46: { tier: "SYNTHETIC", deviceTypeCode: "TRIAL_MH_TREADMILL" }, // Treadmill
  47: { tier: "SYNTHETIC", deviceTypeCode: "TRIAL_MH_USG" }, // Ultrasonography (USG)
  48: { tier: "SYNTHETIC", deviceTypeCode: "TRIAL_MH_ULTRASOUND_THERAPY" }, // Ultrasound Therapy
  49: { tier: "EXACT", deviceTypeCode: "VENTILATOR" }, // Ventilator
  50: { tier: "SYNTHETIC", deviceTypeCode: "TRIAL_MH_WATER_BATH" }, // Water bath
  51: { tier: "SYNTHETIC", deviceTypeCode: "TRIAL_MH_WSD" }, // Water Seal Drainage Pump (WSD)
  52: { tier: "SYNTHETIC", deviceTypeCode: "TRIAL_MH_XRAY_BMD" }, // X-Ray Bone Mineral Densitometri (BMD)
  53: { tier: "SYNTHETIC", deviceTypeCode: "TRIAL_MH_XRAY_C_ARM" }, // X-Ray C-Arm
  54: { tier: "ALIAS", deviceTypeCode: "DENTAL_XRAY" }, // X-Ray Dental
  55: { tier: "SYNTHETIC", deviceTypeCode: "TRIAL_MH_XRAY_MOBILE" }, // X-Ray Mobile
  56: { tier: "SYNTHETIC", deviceTypeCode: "TRIAL_MH_XRAY_MOBILE_FDR" }, // X-Ray Mobile FDR X-Air
};

export const TRIAL_DEVICE_TYPE_MAPPING: readonly TrialDeviceTypeMappingRow[] = TRIAL_SOURCE_ROWS.map(
  (row) => {
    const mapping = MAPPING_BY_ROW[row.rowNumber];
    if (!mapping) {
      throw new Error(`No DeviceType mapping defined for source row ${row.rowNumber}`);
    }
    return { rowNumber: row.rowNumber, ...mapping };
  },
);

// Cross-check against the plan's locked tier totals (§C.2): EXACT 5/156,
// ALIAS 4/45, REPRESENTATIVE 10/64 units (the plan's own prose says "66",
// which does not reconcile with the per-row quantities the plan itself pins
// for the representative tier — 64 is the arithmetically correct figure and
// is what this mapping and the seed script use; see the implementation
// report's "Deviations" section), SYNTHETIC 37/141 (156+45+64+141=406).
function tierTotals() {
  const byRow = new Map(TRIAL_SOURCE_ROWS.map((r) => [r.rowNumber, r.qty]));
  const totals: Record<TrialMappingTier, { items: number; units: number }> = {
    EXACT: { items: 0, units: 0 },
    ALIAS: { items: 0, units: 0 },
    REPRESENTATIVE: { items: 0, units: 0 },
    SYNTHETIC: { items: 0, units: 0 },
  };
  for (const row of TRIAL_DEVICE_TYPE_MAPPING) {
    const qty = byRow.get(row.rowNumber)!;
    totals[row.tier].items += 1;
    totals[row.tier].units += qty;
  }
  return totals;
}

export const TRIAL_TIER_TOTALS = tierTotals();

const expected: Record<TrialMappingTier, { items: number; units: number }> = {
  EXACT: { items: 5, units: 156 },
  ALIAS: { items: 4, units: 45 },
  REPRESENTATIVE: { items: 10, units: 64 },
  SYNTHETIC: { items: 37, units: 141 },
};
for (const tier of Object.keys(expected) as TrialMappingTier[]) {
  const actual = TRIAL_TIER_TOTALS[tier];
  const want = expected[tier];
  if (actual.items !== want.items || actual.units !== want.units) {
    throw new Error(
      `Trial mapping tier ${tier} totals drifted: expected ${want.items} items / ${want.units} units, ` +
        `got ${actual.items} items / ${actual.units} units`,
    );
  }
}
