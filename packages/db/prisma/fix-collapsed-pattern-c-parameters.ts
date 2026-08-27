/**
 * One-time data correction (2026-08-27).
 *
 * 7 DeviceCalibrationParameter rows from the 24-device-type taxonomy extension each
 * represented TWO OR MORE distinct named variants with DIFFERENT tolerance ranges, but
 * were stored as a single row with toleranceMin/Max = NULL and both variants' tolerance
 * text concatenated into toleranceNote. The schema cannot validate against either
 * variant's real limit in that shape.
 *
 * This script deletes the 7 collapsed rows and inserts their correctly-split
 * replacements (15 rows total, net +8). Each replacement keeps the original row's
 * deviceTypeId, capabilityItemId, uomId and valueType — only code / name / tolerance
 * change. No DeviceCapabilityItem is created: every variant is the same conceptual
 * measurement at a different mode/state, so the existing capabilityItem still applies.
 *
 * SUCT_MAX_VACUUM (Suction Pump) was reviewed and deliberately LEFT UNCHANGED — see the
 * report. Its Low/Medium/High bands are a per-unit rated-class selection ("isi salah
 * satu sesuai dengan UUT"), not a universal multi-variant sweep.
 *
 * No table has a foreign key pointing at DeviceCalibrationParameter.id (schema.prisma:
 * only outgoing relations to DeviceType / DeviceCapabilityItem / Uom), so deleting the
 * old rows is safe.
 *
 * Idempotent: re-running after success is a no-op (old codes already gone, new codes
 * already present). seed-device-taxonomy-extension-parameters.ts was updated in the
 * same change so a full reseed produces the same split rows.
 *
 * Run: pnpm --filter @medcal/db generate
 *      pnpm --filter @medcal/db exec tsx --env-file ../../.env prisma/fix-collapsed-pattern-c-parameters.ts
 */
import { prisma } from "../src/index";

type Bounds = { min: number | null; max: number | null; note: string };

interface Split {
  oldCode: string;
  newRows: { code: string; name: string; bounds: Bounds }[];
}

const pm = (delta: number, note: string): Bounds => ({ min: -delta, max: delta, note });
const range = (min: number, max: number, note: string): Bounds => ({ min, max, note });
const minOnly = (min: number, note: string): Bounds => ({ min, max: null, note });
const maxOnly = (max: number, note: string): Bounds => ({ min: null, max, note });

const SPLITS: Split[] = [
  {
    oldCode: "ACLV_CHAMBER_TEMP",
    newRows: [
      {
        code: "ACLV_CHAMBER_TEMP_DT1",
        name: "Chamber Temperature Difference ΔT1 (S1 – S2)",
        bounds: pm(2, "ΔT1 = S1 – S2 ± 2 °C"),
      },
      {
        code: "ACLV_CHAMBER_TEMP_DT2",
        name: "Chamber Temperature Difference ΔT2 (S1 – S3)",
        bounds: pm(5, "ΔT2 = S1 – S3 ± 5 °C"),
      },
      {
        code: "ACLV_CHAMBER_TEMP_DT3",
        name: "Chamber Temperature Difference ΔT3 (S1 – S3)",
        bounds: pm(2, "ΔT3 = S1 – S3 ± 2 °C"),
      },
    ],
  },
  {
    oldCode: "ACLV_STER_TEMP",
    newRows: [
      {
        code: "ACLV_STER_TEMP_121",
        name: "Sterilization Temperature (121 °C cycle)",
        bounds: range(121, 124, "121 °C ~ 124 °C"),
      },
      {
        code: "ACLV_STER_TEMP_134",
        name: "Sterilization Temperature (134 °C cycle)",
        bounds: range(134, 137, "134 °C ~137 °C"),
      },
    ],
  },
  {
    oldCode: "ACLV_STER_TIME",
    newRows: [
      {
        code: "ACLV_STER_TIME_121",
        name: "Sterilization Time (121 °C cycle)",
        bounds: minOnly(15, "≥ 15 menit"),
      },
      {
        code: "ACLV_STER_TIME_134",
        name: "Sterilization Time (134 °C cycle)",
        bounds: minOnly(3, "≥ 3 menit"),
      },
    ],
  },
  {
    oldCode: "BSC_LIGHT_INTENSITY",
    newRows: [
      {
        code: "BSC_LIGHT_INTENSITY_ON",
        name: "Light Intensity (Lamp ON)",
        bounds: minOnly(450, "≥ 450 lux"),
      },
      {
        code: "BSC_LIGHT_INTENSITY_OFF",
        name: "Light Intensity (Lamp OFF)",
        bounds: maxOnly(160, "≤ 160 lux"),
      },
    ],
  },
  {
    oldCode: "BSC_SOUND_LEVEL",
    newRows: [
      {
        code: "BSC_SOUND_LEVEL_ON",
        name: "Sound Level (Blower ON)",
        bounds: maxOnly(70, "≤ 70 dBA"),
      },
      {
        code: "BSC_SOUND_LEVEL_OFF",
        name: "Sound Level (Blower OFF)",
        bounds: maxOnly(60, "≤ 60 dBA"),
      },
    ],
  },
  {
    oldCode: "LAF_SOUND_LEVEL",
    newRows: [
      {
        code: "LAF_SOUND_LEVEL_BACKGROUND",
        name: "Sound Level (Background)",
        bounds: maxOnly(55, "Background ≤ 55 dBA"),
      },
      {
        code: "LAF_SOUND_LEVEL_COMPARTMENT",
        name: "Sound Level (Inside Compartment)",
        bounds: maxOnly(65, "Didalam kompartemen ≤ 65 dBA"),
      },
    ],
  },
  {
    oldCode: "DXRAY_HVL",
    newRows: [
      {
        code: "DXRAY_HVL_70KV",
        name: "Half Value Layer (70 kV)",
        bounds: minOnly(1.5, "70 kV ≥ 1,5 mmAl"),
      },
      {
        code: "DXRAY_HVL_80KV",
        name: "Half Value Layer (80 kV)",
        bounds: minOnly(2.3, "80 kV ≥ 2,3 mmAl"),
      },
    ],
  },
];

async function main() {
  const oldCodes = SPLITS.map((s) => s.oldCode);
  const newCodes = SPLITS.flatMap((s) => s.newRows.map((r) => r.code));
  const expectedRemoved = oldCodes.length; // 7
  const expectedAdded = newCodes.length; // 15

  const countBefore = await prisma.deviceCalibrationParameter.count();
  console.log(`[fix] DeviceCalibrationParameter count before: ${countBefore}`);

  const alreadyDone =
    (await prisma.deviceCalibrationParameter.count({ where: { code: { in: oldCodes } } })) === 0 &&
    (await prisma.deviceCalibrationParameter.count({ where: { code: { in: newCodes } } })) ===
      newCodes.length;
  if (alreadyDone) {
    console.log("[fix] Already applied (all old codes absent, all new codes present). No-op.");
    await prisma.$disconnect();
    return;
  }

  let removed = 0;
  let added = 0;

  for (const split of SPLITS) {
    const old = await prisma.deviceCalibrationParameter.findFirst({
      where: { code: split.oldCode },
      select: {
        id: true,
        code: true,
        name: true,
        deviceTypeId: true,
        capabilityItemId: true,
        uomId: true,
        valueType: true,
        toleranceMin: true,
        toleranceMax: true,
        toleranceNote: true,
      },
    });
    if (!old) {
      throw new Error(`[fix] Expected collapsed row '${split.oldCode}' not found — aborting.`);
    }
    if (old.toleranceMin !== null || old.toleranceMax !== null) {
      throw new Error(
        `[fix] Row '${split.oldCode}' has non-null bounds (min=${old.toleranceMin} max=${old.toleranceMax}) — not the expected collapsed shape. Aborting.`,
      );
    }
    console.log(
      `[fix] ${split.oldCode}: BEFORE min=${old.toleranceMin} max=${old.toleranceMax} note=${JSON.stringify(old.toleranceNote)}`,
    );

    await prisma.$transaction(async (tx) => {
      await tx.deviceCalibrationParameter.delete({ where: { id: old.id } });
      for (const r of split.newRows) {
        const created = await tx.deviceCalibrationParameter.create({
          data: {
            deviceTypeId: old.deviceTypeId,
            capabilityItemId: old.capabilityItemId,
            code: r.code,
            name: r.name,
            description: null,
            valueType: old.valueType,
            uomId: old.uomId,
            toleranceMin: r.bounds.min,
            toleranceMax: r.bounds.max,
            toleranceNote: r.bounds.note,
          },
          select: { code: true, toleranceMin: true, toleranceMax: true, toleranceNote: true },
        });
        console.log(
          `[fix]   AFTER  ${created.code}: min=${created.toleranceMin} max=${created.toleranceMax} note=${JSON.stringify(created.toleranceNote)}`,
        );
      }
    });
    removed += 1;
    added += split.newRows.length;
  }

  const countAfter = await prisma.deviceCalibrationParameter.count();
  console.log(`[fix] rows removed=${removed} added=${added}`);
  console.log(`[fix] count ${countBefore} → ${countAfter} (delta ${countAfter - countBefore})`);

  if (removed !== expectedRemoved || added !== expectedAdded) {
    throw new Error(`[fix] Unexpected counts: removed=${removed} added=${added}`);
  }
  if (countAfter - countBefore !== expectedAdded - expectedRemoved) {
    throw new Error(
      `[fix] Net row-count change ${countAfter - countBefore} != ${expectedAdded - expectedRemoved}`,
    );
  }

  const leftoverOld = await prisma.deviceCalibrationParameter.count({
    where: { code: { in: oldCodes } },
  });
  const presentNew = await prisma.deviceCalibrationParameter.count({
    where: { code: { in: newCodes } },
  });
  if (leftoverOld !== 0 || presentNew !== newCodes.length) {
    throw new Error(
      `[fix] Post-check failed: leftoverOld=${leftoverOld} presentNew=${presentNew}/${newCodes.length}`,
    );
  }

  // SUCT_MAX_VACUUM must be untouched.
  const suct = await prisma.deviceCalibrationParameter.findFirst({
    where: { code: "SUCT_MAX_VACUUM" },
    select: { code: true, toleranceMin: true, toleranceMax: true, toleranceNote: true },
  });
  console.log(`[fix] SUCT_MAX_VACUUM unchanged: ${JSON.stringify(suct)}`);

  console.log("[fix] OK");
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
