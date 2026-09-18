/**
 * Idempotent companion to migration 20260918120000.
 * Copies live CalibrationTestPoint rows for CalibrationJobs that already have
 * startedAt and have not yet been snapshotted. Does not rewrite MeasurementResult.
 *
 * Safe to re-run: jobs with measurementTestPointsSnapshottedAt set are skipped.
 * Run BEFORE seed-calibration-test-points.ts (BSM Awal/Akhir/L-N).
 *
 *   pnpm --filter @medcal/db exec tsx --env-file ../../.env prisma/backfill-job-calibration-test-points.ts
 */
import { prisma } from "../src/index";

async function resolveDeviceTypeId(jobId: string): Promise<string | null> {
  const job = await prisma.calibrationJob.findUnique({
    where: { id: jobId },
    select: {
      calibrationRequestItem: { select: { deviceTypeId: true } },
      purchaseOrderItem: {
        select: { quotationItem: { select: { requestItem: { select: { deviceTypeId: true } } } } },
      },
    },
  });
  return (
    job?.calibrationRequestItem?.deviceTypeId ??
    job?.purchaseOrderItem?.quotationItem?.requestItem?.deviceTypeId ??
    null
  );
}

async function main() {
  const jobs = await prisma.calibrationJob.findMany({
    where: { startedAt: { not: null }, measurementTestPointsSnapshottedAt: null },
    select: { id: true, startedAt: true },
  });
  console.log(`[backfill-job-tp] started jobs without snapshot: ${jobs.length}`);

  let copied = 0;
  for (const job of jobs) {
    const deviceTypeId = await resolveDeviceTypeId(job.id);
    if (deviceTypeId) {
      const catalog = await prisma.calibrationTestPoint.findMany({
        where: { isActive: true, parameter: { deviceTypeId } },
      });
      if (catalog.length > 0) {
        await prisma.jobCalibrationTestPoint.createMany({
          data: catalog.map((tp) => ({
            calibrationJobId: job.id,
            deviceCalibrationParameterId: tp.deviceCalibrationParameterId,
            sourceCalibrationTestPointId: tp.id,
            sequence: tp.sequence,
            settingLabel: tp.settingLabel,
            settingValue: tp.settingValue,
            toleranceMin: tp.toleranceMin,
            toleranceMax: tp.toleranceMax,
            toleranceNote: tp.toleranceNote,
          })),
          skipDuplicates: true,
        });
        copied += catalog.length;
      }
    }
    await prisma.calibrationJob.update({
      where: { id: job.id },
      data: { measurementTestPointsSnapshottedAt: job.startedAt },
    });
  }

  console.log(`[backfill-job-tp] done: ${jobs.length} jobs marked, ${copied} snapshot rows inserted`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
