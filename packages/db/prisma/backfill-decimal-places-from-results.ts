/**
 * Backfill DeviceCalibrationParameter.decimalPlaces from filled
 * measurement-results Excel (2026-09-08 cross-check).
 *
 * Only the 42 catalog DeviceTypes that have a usable filled worksheet.
 * Rows for types without Excel stay at the 0 placeholder.
 *
 * IDEMPOTENT: NUMBER rows whose decimalPlaces is still 0 or NULL are updated.
 * A row already carrying a non-zero value is left untouched.
 *
 * Evidence: docs/claude/plans/Calibration-management/measurement-results/
 *   calibration-results-cross-check.md §2
 *
 * Run:
 *   pnpm --filter @medcal/db exec tsx --env-file ../../.env prisma/backfill-decimal-places-from-results.ts
 */
import { prisma } from "../src/index";

/** Catalog types with a usable filled Excel in measurement-results/. */
const EVIDENCE_DEVICE_TYPES = [
  "AUDIOMETER",
  "AUTOCLAVE",
  "BABY_INCUBATOR",
  "BED_SIDE_MONITOR",
  "BIO_SAFETY_CABINET",
  "BLANKET_WARMER",
  "BLOOD_BANK_REFRIGERATORS",
  "BLOOD_PRESSURE_MONITOR",
  "CENTRIFUGE",
  "CENTRIFUGE_REFRIGERATOR",
  "CPAP",
  "DENTAL_UNIT",
  "ELECTROCARDIOGRAPHS",
  "ELECTRO_ACCUPUNTURE",
  "EXAMINATION_LAMP",
  "FETAL_DOPPLER",
  "FLOW_METER",
  "HEAD_LAMP_MEDIK",
  "HUMIDIFIER",
  "INFANT_WARMER",
  "INFUSION_PUMP",
  "KULKAS_VAKSIN",
  "LAMINAR_AIR_FLOW",
  "LARYNGOSKOP",
  "MEDICAL_FREEZER",
  "MEDICAL_REFRIGERATOR",
  "MIKROSKOP_LABORATORIUM",
  "NEBULIZER_COMPRESSOR",
  "OVEN",
  "OXYGEN_CONCENTRATORS",
  "PHOTOTHERAPY",
  "PLATELET_AGITATOR_INCUBATOR",
  "PULSE_OXIMETERS",
  "RESUSCITATORS_PULMONARY",
  "ROTATOR",
  "SPHYGMOMANOMETERS",
  "SPIROMETER",
  "STERILLIZER",
  "SUCTION_PUMP",
  "SYRINGE_PUMP",
  "ULTRASONIC_NEBULIZERS",
  "VENTILATOR",
] as const;

/**
 * Kinerja-specific overrides (max decimal places observed in recorded cells).
 * Env/electrical suffixes are handled by familyDp().
 */
const KINERJA_DP: Record<string, number> = {
  AUD_PURE_TONE_LINEARITY_KANAN: 1,
  AUD_PURE_TONE_LINEARITY_KIRI: 1,
  // AUD_FREQUENCY_RESPONSE_* unverified in the filled file — leave 0.
  INFUS_FLOW_RATE: 3,
  INFUS_OCCLUSION: 2,
  SYR_FLOW_RATE: 3,
  SYR_OCCLUSION: 2,
  CPAP_CONCENTRATION: 2,
  CPAP_FLOW_RATE: 2,
  INCU_AIR_TEMP: 2,
  INCU_OVERSHOOT_TEMP: 2,
  INCU_MATTRESS_TEMP: 2,
  INCU_AIR_VELOCITY: 1,
  INCU_NOISE_LEVEL: 1,
  SPHYG_PRESSURE_ACC: 1,
  HUM_TEMP_ACCURACY: 1,
  HUM_MAX_TEMP: 1,
  DUNIT_HP_PRESSURE: 3,
  IW_TEMP_CALIBRATION: 2,
  IW_MAX_MATTRESS_TEMP: 2,
  VENT_MINUTE_VOLUME: 1,
  VENT_PEEP: 1,
  EST_PULSE_DURATION: 1,
  SPIRO_FVC: 1,
  SUCT_VACUUM_GAUGE: 1,
  SUCT_MAX_VACUUM: 3,
  FDOP_EARTH_RESISTANCE: 4,
  BBR_STORAGE_TEMP: 1,
  KVAK_STORAGE_TEMP: 1,
  CCHAIN_STORAGE_TEMP: 1,
  MREF_STORAGE_TEMP: 1,
  MFRZ_STORAGE_TEMP: 1,
  OVEN_TEMP: 1,
  STER_TEMP: 1,
  CRFR_STORAGE_TEMP: 1,
  PLT_STORAGE_TEMP: 1,
  ACLV_STER_TEMP_121: 1,
  ACLV_STER_TEMP_134: 1,
  ACLV_CHAMBER_TEMP_DT1: 1,
  ACLV_CHAMBER_TEMP_DT2: 1,
  ACLV_CHAMBER_TEMP_DT3: 1,
};

function familyDp(code: string): number | null {
  if (KINERJA_DP[code] != null) return KINERJA_DP[code];
  if (/EARTH_RESISTANCE$/.test(code)) return 3;
  if (/ROOM_TEMP$/.test(code)) return 1;
  if (/ROOM_HUMIDITY$/.test(code)) return 0;
  if (/INPUT_VOLTAGE$/.test(code)) return 1;
  if (/INSULATION_RESISTANCE$/.test(code)) return 0;
  if (/EQUIP_LEAKAGE$/.test(code)) return 1;
  if (/APPLIED_LEAKAGE$/.test(code)) return 1;
  return null;
}

async function main() {
  const params = await prisma.deviceCalibrationParameter.findMany({
    where: {
      isActive: true,
      valueType: "NUMBER",
      deviceType: { code: { in: [...EVIDENCE_DEVICE_TYPES] } },
    },
    select: {
      id: true,
      code: true,
      decimalPlaces: true,
      deviceType: { select: { code: true } },
    },
  });

  let updated = 0;
  let skippedNoEvidence = 0;
  let skippedReviewed = 0;
  let skippedSame = 0;

  for (const row of params) {
    const dp = familyDp(row.code);
    if (dp == null) {
      skippedNoEvidence += 1;
      continue;
    }
    if (row.decimalPlaces != null && row.decimalPlaces !== 0) {
      skippedReviewed += 1;
      continue;
    }
    if (row.decimalPlaces === dp) {
      skippedSame += 1;
      continue;
    }
    await prisma.deviceCalibrationParameter.update({
      where: { id: row.id },
      data: { decimalPlaces: dp },
    });
    updated += 1;
  }

  console.log(
    `[backfill-decimal-places-from-results] types=${EVIDENCE_DEVICE_TYPES.length} ` +
      `scanned=${params.length} updated=${updated} ` +
      `skipped(noEvidence)=${skippedNoEvidence} skipped(reviewed)=${skippedReviewed} ` +
      `skipped(alreadyTarget)=${skippedSame}`,
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
