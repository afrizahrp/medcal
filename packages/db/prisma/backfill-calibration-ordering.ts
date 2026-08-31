/**
 * One-time backfill of calibration ordering:
 *   - DeviceTypeCapabilityOrder.sortOrder  (per-DeviceType capability order)
 *   - DeviceCalibrationParameter.sortOrder (parameter order within a
 *     (deviceType, capability) scope)
 *
 * Authoritative source: row creation order. Every calibration parameter was
 * seeded by upsert in the exact worksheet sequence of the Kemenkes "Lembar
 * Kerja" documents (seed-device-calibration-parameters.ts and
 * seed-device-taxonomy-extension-parameters.ts). Within a DeviceType,
 * `createdAt` (then `id`) ascending therefore reproduces that sequence, and the
 * order in which each Capability is first seen along that sequence reproduces
 * the LK section order (environmental conditions -> physical/function check ->
 * electrical safety -> performance).
 *
 * Limitation: DeviceTypes / parameters created later through the UI keep their
 * creation-order position, which is a deterministic but not worksheet-validated
 * fallback. Re-running is safe (idempotent; only sortOrder columns / order rows
 * are written).
 *
 * Run:  pnpm --filter @medcal/db generate
 *       pnpm --filter @medcal/db run backfill:calibration-ordering
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const STEP = 10;

async function main(): Promise<void> {
  const deviceTypes = await prisma.deviceType.findMany({
    select: { id: true, code: true },
    orderBy: { code: "asc" },
  });

  let capabilityOrderRows = 0;
  let parameterRows = 0;
  let deviceTypesTouched = 0;

  for (const deviceType of deviceTypes) {
    const params = await prisma.deviceCalibrationParameter.findMany({
      where: { deviceTypeId: deviceType.id },
      select: { id: true, capabilityItem: { select: { capabilityId: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    if (params.length === 0) continue;

    const capabilityOrder: string[] = [];
    const paramsByCapability = new Map<string, string[]>();
    for (const param of params) {
      const capabilityId = param.capabilityItem.capabilityId;
      let bucket = paramsByCapability.get(capabilityId);
      if (!bucket) {
        bucket = [];
        paramsByCapability.set(capabilityId, bucket);
        capabilityOrder.push(capabilityId);
      }
      bucket.push(param.id);
    }

    await prisma.$transaction([
      ...capabilityOrder.map((capabilityId, index) =>
        prisma.deviceTypeCapabilityOrder.upsert({
          where: {
            deviceTypeId_capabilityId: { deviceTypeId: deviceType.id, capabilityId },
          },
          create: { deviceTypeId: deviceType.id, capabilityId, sortOrder: (index + 1) * STEP },
          update: { sortOrder: (index + 1) * STEP },
        }),
      ),
      ...capabilityOrder.flatMap((capabilityId) =>
        (paramsByCapability.get(capabilityId) ?? []).map((id, index) =>
          prisma.deviceCalibrationParameter.update({
            where: { id },
            data: { sortOrder: (index + 1) * STEP },
          }),
        ),
      ),
    ]);

    deviceTypesTouched += 1;
    capabilityOrderRows += capabilityOrder.length;
    parameterRows += params.length;
  }

  console.log(
    `Backfilled ${capabilityOrderRows} capability-order rows and ${parameterRows} ` +
      `parameter sortOrders across ${deviceTypesTouched} device types.`,
  );

  await printValidation("BED_SIDE_MONITOR");
}

async function printValidation(deviceTypeCode: string): Promise<void> {
  const deviceType = await prisma.deviceType.findUnique({
    where: { code: deviceTypeCode },
    select: { id: true, name: true },
  });
  if (!deviceType) {
    console.log(`\n[validation] device type ${deviceTypeCode} not found — skipped.`);
    return;
  }

  const capabilityOrder = await prisma.deviceTypeCapabilityOrder.findMany({
    where: { deviceTypeId: deviceType.id },
    orderBy: { sortOrder: "asc" },
    select: { sortOrder: true, capabilityId: true, capability: { select: { name: true } } },
  });

  console.log(`\n[validation] ${deviceType.name} — capability order:`);
  for (const row of capabilityOrder) {
    console.log(`  ${String(row.sortOrder).padStart(3)}  ${row.capability.name}`);
    const params = await prisma.deviceCalibrationParameter.findMany({
      where: {
        deviceTypeId: deviceType.id,
        capabilityItem: { capabilityId: row.capabilityId },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { sortOrder: true, name: true },
    });
    for (const param of params) {
      console.log(`       ${String(param.sortOrder).padStart(3)}  ${param.name}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
