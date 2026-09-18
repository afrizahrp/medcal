/**
 * Read-only check: started-job snapshot vs live BSM env catalog.
 * Does not write MeasurementResult.
 *
 *   pnpm --filter @medcal/db exec tsx --env-file ../../.env prisma/verify-job-calibration-test-point-snapshot.ts
 */
import { prisma } from "../src/index";

const JOB = "cmu0qm039001prv0ng7lp0fmv";
const ENV_CODES = ["BSM_ROOM_TEMP", "BSM_ROOM_HUMIDITY", "BSM_INPUT_VOLTAGE"] as const;

async function main() {
  const job = await prisma.calibrationJob.findUnique({
    where: { id: JOB },
    select: {
      id: true,
      status: true,
      startedAt: true,
      measurementTestPointsSnapshottedAt: true,
    },
  });
  console.log("[verify-job-tp] job", job);

  const snaps = await prisma.jobCalibrationTestPoint.findMany({
    where: { calibrationJobId: JOB },
    select: { parameter: { select: { code: true } } },
  });
  const byCode = new Map<string, number>();
  for (const row of snaps) {
    byCode.set(row.parameter.code, (byCode.get(row.parameter.code) ?? 0) + 1);
  }
  console.log("[verify-job-tp] snapshot rows", snaps.length);
  console.log("[verify-job-tp] snapshot by parameter", Object.fromEntries([...byCode.entries()].sort()));
  console.log(
    "[verify-job-tp] env snapshot counts",
    Object.fromEntries(ENV_CODES.map((code) => [code, byCode.get(code) ?? 0])),
  );

  const nullResults = await prisma.measurementResult.count({
    where: { calibrationJobId: JOB, calibrationTestPointId: null },
  });
  const envResultsWithPoint = await prisma.measurementResult.count({
    where: {
      calibrationJobId: JOB,
      parameter: { code: { in: [...ENV_CODES] } },
      calibrationTestPointId: { not: null },
    },
  });
  console.log("[verify-job-tp] MeasurementResult NULL", nullResults);
  console.log("[verify-job-tp] env results with calibrationTestPointId", envResultsWithPoint);

  const unsnapshotted = await prisma.calibrationJob.count({
    where: { startedAt: { not: null }, measurementTestPointsSnapshottedAt: null },
  });
  const started = await prisma.calibrationJob.count({ where: { startedAt: { not: null } } });
  const snapshotRows = await prisma.jobCalibrationTestPoint.count();
  console.log("[verify-job-tp] started jobs", started);
  console.log("[verify-job-tp] started jobs missing snapshottedAt", unsnapshotted);
  console.log("[verify-job-tp] total snapshot rows", snapshotRows);

  const envCatalog = await prisma.calibrationTestPoint.findMany({
    where: { parameter: { code: { in: [...ENV_CODES] } } },
    select: { sequence: true, settingLabel: true, parameter: { select: { code: true } } },
    orderBy: [{ parameter: { code: "asc" } }, { sequence: "asc" }],
  });
  console.log("[verify-job-tp] live BSM env catalog", envCatalog);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
