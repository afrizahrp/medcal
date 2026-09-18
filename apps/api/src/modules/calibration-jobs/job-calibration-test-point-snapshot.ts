import { prisma, type Prisma } from "@medcal/db";

type SnapshotClient = Prisma.TransactionClient | typeof prisma;

const activeTestPointSelect = {
  id: true,
  deviceCalibrationParameterId: true,
  sequence: true,
  settingLabel: true,
  settingValue: true,
  toleranceMin: true,
  toleranceMax: true,
  toleranceNote: true,
} as const;

/**
 * Copy active catalog CalibrationTestPoint rows for the job's resolved DeviceType.
 * Empty copy is valid (Pattern A freeze). Does not write MeasurementResult.
 * Caller must set CalibrationJob.measurementTestPointsSnapshottedAt.
 */
export async function copyActiveTestPointsIntoJobSnapshot(
  client: SnapshotClient,
  input: { calibrationJobId: string; deviceTypeId: string | null },
): Promise<number> {
  if (input.deviceTypeId === null) return 0;

  const catalog = await client.calibrationTestPoint.findMany({
    where: {
      isActive: true,
      parameter: { deviceTypeId: input.deviceTypeId },
    },
    select: activeTestPointSelect,
  });
  if (catalog.length === 0) return 0;

  await client.jobCalibrationTestPoint.createMany({
    data: catalog.map((tp) => ({
      calibrationJobId: input.calibrationJobId,
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
  return catalog.length;
}
