/**
 * One-time data correction (2026-09-08).
 *
 * Two Audiometer DeviceCalibrationParameter rows each represent TWO structurally
 * separate measurement series that the LK worksheet prints as two distinct tables
 * ("Earphone Kanan" / "Earphone Kiri"), sharing one tolerance but not one data
 * series:
 *
 *   AUD_PURE_TONE_LINEARITY  ("Linieritas dB Pure Tone",  ± 1 dB, 7 dB setpoints)
 *   AUD_FREQUENCY_RESPONSE   ("Frekuensi Respon / Tanggap", ± 2%, 4 Hz setpoints)
 *
 * MeasurementResult has no "ear" facet, so folding the ear into a CalibrationTestPoint
 * label would double the point count and lose the parameter-level distinction. This
 * script splits each into a _KANAN and a _KIRI row (mirroring the Pattern C split in
 * fix-collapsed-pattern-c-parameters.ts) so the ear lives at the parameter level and
 * each series gets its own 7 / 4 test points in seed-calibration-test-points.ts.
 *
 * Unlike the Pattern C fix, the two originals are DEACTIVATED (isActive = false), not
 * hard-deleted — CalibrationTestPoint and MeasurementResult now carry FKs to
 * DeviceCalibrationParameter.id, so we keep the rows for referential safety and audit.
 *
 * Each replacement keeps the original's deviceTypeId, capabilityItemId, uomId,
 * valueType, tolerance*, decimalPlaces. Only code / name / sortOrder change.
 *
 * Idempotent: re-running after success is a no-op (new codes already present, originals
 * already inactive). seed catalog scripts are unaffected — this is a pkmdb-only fix and
 * is NOT reflected in seed-device-taxonomy-extension-parameters.ts (the originals came
 * from the original 242 seed, whose file is left as historical record).
 *
 * Run:
 *   pnpm --filter @medcal/db generate
 *   pnpm --filter @medcal/db exec tsx --env-file ../../.env prisma/fix-collapsed-audiometer-parameters.ts
 */
import { prisma } from "../src/index";

interface Split {
  oldCode: string;
  newRows: { code: string; name: string; sortOffset: number }[];
}

const SPLITS: Split[] = [
  {
    oldCode: "AUD_PURE_TONE_LINEARITY",
    newRows: [
      { code: "AUD_PURE_TONE_LINEARITY_KANAN", name: "Linieritas dB Pure Tone (Earphone Kanan)", sortOffset: 0 },
      { code: "AUD_PURE_TONE_LINEARITY_KIRI", name: "Linieritas dB Pure Tone (Earphone Kiri)", sortOffset: 1 },
    ],
  },
  {
    oldCode: "AUD_FREQUENCY_RESPONSE",
    newRows: [
      { code: "AUD_FREQUENCY_RESPONSE_KANAN", name: "Frekuensi Respon / Tanggap (Earphone Kanan)", sortOffset: 0 },
      { code: "AUD_FREQUENCY_RESPONSE_KIRI", name: "Frekuensi Respon / Tanggap (Earphone Kiri)", sortOffset: 1 },
    ],
  },
];

async function main() {
  const oldCodes = SPLITS.map((s) => s.oldCode);
  const newCodes = SPLITS.flatMap((s) => s.newRows.map((r) => r.code));

  const countBefore = await prisma.deviceCalibrationParameter.count();
  const activeBefore = await prisma.deviceCalibrationParameter.count({ where: { isActive: true } });
  console.log(`[fix-aud] DCP count before: ${countBefore} (active: ${activeBefore})`);

  const newPresent = await prisma.deviceCalibrationParameter.count({ where: { code: { in: newCodes } } });
  const oldActive = await prisma.deviceCalibrationParameter.count({
    where: { code: { in: oldCodes }, isActive: true },
  });
  if (newPresent === newCodes.length && oldActive === 0) {
    console.log("[fix-aud] Already applied (all split codes present, originals inactive). No-op.");
    await prisma.$disconnect();
    return;
  }

  let deactivated = 0;
  let added = 0;

  for (const split of SPLITS) {
    const old = await prisma.deviceCalibrationParameter.findFirst({
      where: { code: split.oldCode },
      select: {
        id: true,
        code: true,
        deviceTypeId: true,
        capabilityItemId: true,
        uomId: true,
        valueType: true,
        toleranceMin: true,
        toleranceMax: true,
        toleranceNote: true,
        decimalPlaces: true,
        sortOrder: true,
        description: true,
        isActive: true,
      },
    });
    if (!old) {
      throw new Error(`[fix-aud] Expected collapsed row '${split.oldCode}' not found — aborting.`);
    }
    console.log(
      `[fix-aud] ${split.oldCode}: BEFORE isActive=${old.isActive} note=${JSON.stringify(old.toleranceNote)} sortOrder=${old.sortOrder}`,
    );

    await prisma.$transaction(async (tx) => {
      for (const r of split.newRows) {
        const created = await tx.deviceCalibrationParameter.upsert({
          where: {
            deviceTypeId_capabilityItemId_code: {
              deviceTypeId: old.deviceTypeId,
              capabilityItemId: old.capabilityItemId,
              code: r.code,
            },
          },
          create: {
            deviceTypeId: old.deviceTypeId,
            capabilityItemId: old.capabilityItemId,
            code: r.code,
            name: r.name,
            description: old.description,
            valueType: old.valueType,
            uomId: old.uomId,
            toleranceMin: old.toleranceMin,
            toleranceMax: old.toleranceMax,
            toleranceNote: old.toleranceNote,
            decimalPlaces: old.decimalPlaces,
            sortOrder: old.sortOrder + r.sortOffset,
            isActive: true,
          },
          update: {
            name: r.name,
            toleranceMin: old.toleranceMin,
            toleranceMax: old.toleranceMax,
            toleranceNote: old.toleranceNote,
            decimalPlaces: old.decimalPlaces,
            isActive: true,
          },
          select: { code: true, toleranceNote: true, sortOrder: true, isActive: true },
        });
        added += 1;
        console.log(
          `[fix-aud]   AFTER  ${created.code}: isActive=${created.isActive} note=${JSON.stringify(created.toleranceNote)} sortOrder=${created.sortOrder}`,
        );
      }
      await tx.deviceCalibrationParameter.update({
        where: { id: old.id },
        data: { isActive: false },
      });
    });
    deactivated += 1;
    console.log(`[fix-aud]   ${split.oldCode} deactivated (isActive=false, row kept)`);
  }

  const countAfter = await prisma.deviceCalibrationParameter.count();
  const activeAfter = await prisma.deviceCalibrationParameter.count({ where: { isActive: true } });
  console.log(`[fix-aud] rows deactivated=${deactivated} split-rows-upserted=${added}`);
  console.log(
    `[fix-aud] DCP count ${countBefore} → ${countAfter} (delta ${countAfter - countBefore}); active ${activeBefore} → ${activeAfter} (delta ${activeAfter - activeBefore})`,
  );

  const leftoverActiveOld = await prisma.deviceCalibrationParameter.count({
    where: { code: { in: oldCodes }, isActive: true },
  });
  const presentNew = await prisma.deviceCalibrationParameter.count({
    where: { code: { in: newCodes }, isActive: true },
  });
  if (leftoverActiveOld !== 0 || presentNew !== newCodes.length) {
    throw new Error(
      `[fix-aud] Post-check failed: leftoverActiveOld=${leftoverActiveOld} presentNew=${presentNew}/${newCodes.length}`,
    );
  }

  console.log("[fix-aud] OK");
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
