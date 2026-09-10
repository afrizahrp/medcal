/**
 * One-shot seed verification for DevicePhysicalCheckItem against live DB.
 * Read-only: no inserts/updates/deletes.
 *
 * Run: pnpm exec tsx --env-file ../../.env prisma/verify-physical-check-items-seed.ts
 */
import { prisma } from "../src/index";
import {
  EXPECTED_PHYSICAL_CHECK_DEVICE_TYPE_COUNT,
  EXPECTED_PHYSICAL_CHECK_ITEM_COUNT,
  PHYSICAL_CHECK_ITEMS,
} from "./seed-physical-check-items";

type Issue = string;

async function main(): Promise<void> {
  const issues: Issue[] = [];

  const rows = await prisma.devicePhysicalCheckItem.findMany({
    include: { deviceType: { select: { code: true } } },
    orderBy: [{ deviceType: { code: "asc" } }, { sortOrder: "asc" }, { code: "asc" }],
  });

  const byType = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byType.get(row.deviceType.code) ?? [];
    list.push(row);
    byType.set(row.deviceType.code, list);
  }

  // Totals
  if (rows.length !== EXPECTED_PHYSICAL_CHECK_ITEM_COUNT) {
    issues.push(`total rows: expected ${EXPECTED_PHYSICAL_CHECK_ITEM_COUNT}, got ${rows.length}`);
  }
  if (byType.size !== EXPECTED_PHYSICAL_CHECK_DEVICE_TYPE_COUNT) {
    issues.push(
      `DeviceTypes with items: expected ${EXPECTED_PHYSICAL_CHECK_DEVICE_TYPE_COUNT}, got ${byType.size}`,
    );
  }

  // Intentional zeros
  for (const code of ["ELECTRIC_BEDS", "PATIENT_MONITOR"] as const) {
    const count = byType.get(code)?.length ?? 0;
    if (count !== 0) {
      issues.push(`${code}: expected 0, got ${count}`);
    }
  }

  // Cold chain pair
  for (const code of ["COLD_CHAIN", "KULKAS_VAKSIN"] as const) {
    const count = byType.get(code)?.length ?? 0;
    if (count !== 5) {
      issues.push(`${code}: expected 5, got ${count}`);
    }
  }

  // Duplicate (deviceTypeId, code)
  const seen = new Set<string>();
  for (const row of rows) {
    const key = `${row.deviceTypeId}::${row.code}`;
    if (seen.has(key)) {
      issues.push(`duplicate (deviceTypeId, code): ${row.deviceType.code} / ${row.code}`);
    }
    seen.add(key);
  }

  // Compare wording + sortOrder to seed dataset
  const dbByTypeCode = new Map(
    rows.map((row) => [`${row.deviceType.code}::${row.code}`, row] as const),
  );
  const seedKeys = new Set(PHYSICAL_CHECK_ITEMS.map((i) => `${i.deviceTypeCode}::${i.code}`));

  for (const item of PHYSICAL_CHECK_ITEMS) {
    const key = `${item.deviceTypeCode}::${item.code}`;
    const db = dbByTypeCode.get(key);
    if (!db) {
      issues.push(`missing in DB: ${key}`);
      continue;
    }
    if (db.name !== item.name) {
      issues.push(`name mismatch ${key}: db=${JSON.stringify(db.name)} seed=${JSON.stringify(item.name)}`);
    }
    if (db.inspectionLimit !== item.inspectionLimit) {
      issues.push(
        `inspectionLimit mismatch ${key}: db=${JSON.stringify(db.inspectionLimit)} seed=${JSON.stringify(item.inspectionLimit)}`,
      );
    }
    if (db.sortOrder !== item.sortOrder) {
      issues.push(`sortOrder mismatch ${key}: db=${db.sortOrder} seed=${item.sortOrder}`);
    }
    if (db.isActive !== true) {
      issues.push(`isActive mismatch ${key}: db=${db.isActive}`);
    }
  }

  for (const key of dbByTypeCode.keys()) {
    if (!seedKeys.has(key)) {
      issues.push(`extra in DB (not in seed): ${key}`);
    }
  }

  // Summary
  console.log("[verify] DevicePhysicalCheckItem seed verification");
  console.log(`[verify] total rows: ${rows.length} (expected ${EXPECTED_PHYSICAL_CHECK_ITEM_COUNT})`);
  console.log(
    `[verify] DeviceTypes with items: ${byType.size} (expected ${EXPECTED_PHYSICAL_CHECK_DEVICE_TYPE_COUNT})`,
  );
  console.log(`[verify] ELECTRIC_BEDS: ${byType.get("ELECTRIC_BEDS")?.length ?? 0} (expected 0)`);
  console.log(`[verify] PATIENT_MONITOR: ${byType.get("PATIENT_MONITOR")?.length ?? 0} (expected 0)`);
  console.log(`[verify] COLD_CHAIN: ${byType.get("COLD_CHAIN")?.length ?? 0} (expected 5)`);
  console.log(`[verify] KULKAS_VAKSIN: ${byType.get("KULKAS_VAKSIN")?.length ?? 0} (expected 5)`);
  console.log(`[verify] unique (deviceTypeId, code): ${seen.size === rows.length ? "OK" : "FAIL"}`);
  console.log(
    `[verify] wording/sortOrder vs seed file: ${
      issues.some((i) => i.includes("mismatch") || i.includes("missing") || i.includes("extra"))
        ? "FAIL"
        : "OK"
    }`,
  );

  if (issues.length > 0) {
    console.error(`[verify] FAILED — ${issues.length} issue(s):`);
    for (const issue of issues.slice(0, 50)) {
      console.error(`  - ${issue}`);
    }
    if (issues.length > 50) {
      console.error(`  … and ${issues.length - 50} more`);
    }
    process.exitCode = 1;
  } else {
    console.log("[verify] PASS — all seed-verification targets met.");
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("[verify] Failed:", error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
