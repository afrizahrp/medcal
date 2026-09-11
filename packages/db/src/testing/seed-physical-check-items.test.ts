import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dbRoot = resolve(__dirname, "../..");
const seedPath = resolve(dbRoot, "prisma/seed-physical-check-items.ts");
const deviceTypesPath = resolve(dbRoot, "prisma/seed-device-types.ts");

type SeedRow = {
  deviceTypeCode: string;
  code: string;
  name: string;
  inspectionLimit: string;
  sortOrder: number;
};

function parseSeedRows(seedSource: string): SeedRow[] {
  return [
    ...seedSource.matchAll(
      /deviceTypeCode:\s*"([^"]+)",\s*code:\s*"([^"]+)",\s*name:\s*"((?:\\.|[^"\\])*)",\s*inspectionLimit:\s*"((?:\\.|[^"\\])*)",\s*sortOrder:\s*(\d+)/gs,
    ),
  ].map((match) => ({
    deviceTypeCode: match[1]!,
    code: match[2]!,
    name: match[3]!,
    inspectionLimit: match[4]!,
    sortOrder: Number(match[5]),
  }));
}

/**
 * Non-mutating validation of the Physical Inspection master seed.
 * Does not import the seed module (keeps tsc rootDir clean) and does not
 * run upserts — only `--dry-run` + static source checks.
 */
describe("seed-physical-check-items dataset (no DB mutation)", () => {
  const seedSource = readFileSync(seedPath, "utf8");
  const rows = parseSeedRows(seedSource);

  it("dry-run validates 251/45 without database mutation", () => {
    const out = execFileSync(
      process.platform === "win32" ? "pnpm.cmd" : "pnpm",
      ["exec", "tsx", "prisma/seed-physical-check-items.ts", "--dry-run"],
      { cwd: dbRoot, encoding: "utf8", shell: true },
    );
    expect(out).toContain("251 items / 45 DeviceTypes");
    expect(out).toContain("no database mutation");
    expect(out).toContain("COLD_CHAIN=5, KULKAS_VAKSIN=5");
    expect(out).toContain("ELECTRIC_BEDS=0 (intentional), PATIENT_MONITOR=5");
    expect(out).not.toContain("rows upserted");
  });

  it("declares unique (deviceTypeCode, code) rows with required fields", () => {
    expect(rows.length).toBe(251);
    const seen = new Set<string>();
    const types = new Set<string>();
    for (const row of rows) {
      expect(row.name.length).toBeGreaterThan(0);
      expect(row.inspectionLimit.length).toBeGreaterThan(0);
      expect(row.sortOrder).toBeGreaterThan(0);
      const key = `${row.deviceTypeCode}::${row.code}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      types.add(row.deviceTypeCode);
    }
    expect(types.size).toBe(45);
    expect(types.has("ELECTRIC_BEDS")).toBe(false);
    expect(types.has("PATIENT_MONITOR")).toBe(true);
    expect(types.has("BED_SIDE_MONITOR")).toBe(true);
    expect(types.has("COLD_CHAIN")).toBe(true);
    expect(types.has("KULKAS_VAKSIN")).toBe(true);
  });

  it("copies PATIENT_MONITOR Physical Inspection exactly from BED_SIDE_MONITOR", () => {
    const bsm = rows
      .filter((row) => row.deviceTypeCode === "BED_SIDE_MONITOR")
      .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
    const pm = rows
      .filter((row) => row.deviceTypeCode === "PATIENT_MONITOR")
      .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));

    expect(bsm.length).toBe(5);
    expect(pm.length).toBe(bsm.length);

    for (let i = 0; i < bsm.length; i += 1) {
      expect(pm[i]!.name).toBe(bsm[i]!.name);
      expect(pm[i]!.inspectionLimit).toBe(bsm[i]!.inspectionLimit);
      expect(pm[i]!.sortOrder).toBe(bsm[i]!.sortOrder);
      expect(pm[i]!.deviceTypeCode).toBe("PATIENT_MONITOR");
      expect(pm[i]!.code).not.toBe(bsm[i]!.code);
      expect(pm[i]!.code).toBe(`PATIENT_MONITOR_PHYSICAL_${String(i + 1).padStart(3, "0")}`);
      expect(bsm[i]!.code).toBe(`BED_SIDE_MONITOR_PHYSICAL_${String(i + 1).padStart(3, "0")}`);
    }

    // BED_SIDE_MONITOR checklist must remain unchanged (source of truth)
    expect(bsm.map((row) => row.code)).toEqual([
      "BED_SIDE_MONITOR_PHYSICAL_001",
      "BED_SIDE_MONITOR_PHYSICAL_002",
      "BED_SIDE_MONITOR_PHYSICAL_003",
      "BED_SIDE_MONITOR_PHYSICAL_004",
      "BED_SIDE_MONITOR_PHYSICAL_005",
    ]);
    expect(bsm.map((row) => row.name)).toEqual([
      "Badan / Permukaan",
      "Kotak kontak alat",
      "Kabel catu utama",
      "Tombol, Saklar dan pengaman",
      "Tampilan dan indikator",
    ]);
  });

  it("preserves ECG distinct charger checks and Sphyg zero-point item", () => {
    expect(seedSource).toContain('name: "Baterai/Charger"');
    expect(seedSource).toContain('name: "Periksa kondisi charger"');
    expect(seedSource).toContain('name: "Pengaturan titik 0"');
    expect(seedSource).toMatch(/±1 mmHg/);
  });

  it("references only DeviceType codes present in seed-device-types.ts", () => {
    const deviceTypesSource = readFileSync(deviceTypesPath, "utf8");
    const known = new Set(
      [...deviceTypesSource.matchAll(/code:\s*"([A-Z0-9_]+)"/g)].map((match) => match[1]!),
    );
    const used = rows.map((row) => row.deviceTypeCode);
    expect(used.length).toBe(251);
    for (const code of used) {
      expect(known.has(code)).toBe(true);
    }
  });

  it("only upserts DevicePhysicalCheckItem (no calibration/measurement wiring)", () => {
    expect(seedSource).toContain("prisma.devicePhysicalCheckItem.upsert");
    expect(seedSource).not.toMatch(/prisma\.deviceCalibrationParameter/);
    expect(seedSource).not.toMatch(/capabilityItemId\s*:/);
    expect(seedSource).not.toMatch(/prisma\.measurementResult/);
    expect(seedSource).not.toMatch(/prisma\.physicalCheckResult/);
  });
});
