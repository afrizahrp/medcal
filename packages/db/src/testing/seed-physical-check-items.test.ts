import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dbRoot = resolve(__dirname, "../..");
const seedPath = resolve(dbRoot, "prisma/seed-physical-check-items.ts");
const deviceTypesPath = resolve(dbRoot, "prisma/seed-device-types.ts");

/**
 * Non-mutating validation of the Physical Inspection master seed.
 * Does not import the seed module (keeps tsc rootDir clean) and does not
 * run upserts — only `--dry-run` + static source checks.
 */
describe("seed-physical-check-items dataset (no DB mutation)", () => {
  const seedSource = readFileSync(seedPath, "utf8");

  it("dry-run validates 246/44 without database mutation", () => {
    const out = execFileSync(
      process.platform === "win32" ? "pnpm.cmd" : "pnpm",
      ["exec", "tsx", "prisma/seed-physical-check-items.ts", "--dry-run"],
      { cwd: dbRoot, encoding: "utf8", shell: true },
    );
    expect(out).toContain("246 items / 44 DeviceTypes");
    expect(out).toContain("no database mutation");
    expect(out).toContain("COLD_CHAIN=5, KULKAS_VAKSIN=5");
    expect(out).toContain("ELECTRIC_BEDS=0, PATIENT_MONITOR=0");
    expect(out).not.toContain("rows upserted");
  });

  it("declares unique (deviceTypeCode, code) rows with required fields", () => {
    const rowBlocks = [...seedSource.matchAll(/deviceTypeCode:\s*"([^"]+)",\s*code:\s*"([^"]+)",\s*name:\s*"((?:\\.|[^"\\])*)",\s*inspectionLimit:\s*"((?:\\.|[^"\\])*)",\s*sortOrder:\s*(\d+)/gs)];
    expect(rowBlocks.length).toBe(246);
    const seen = new Set<string>();
    const types = new Set<string>();
    for (const match of rowBlocks) {
      const deviceTypeCode = match[1]!;
      const code = match[2]!;
      const name = match[3]!;
      const inspectionLimit = match[4]!;
      const sortOrder = Number(match[5]);
      expect(name.length).toBeGreaterThan(0);
      expect(inspectionLimit.length).toBeGreaterThan(0);
      expect(sortOrder).toBeGreaterThan(0);
      const key = `${deviceTypeCode}::${code}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      types.add(deviceTypeCode);
    }
    expect(types.size).toBe(44);
    expect(types.has("ELECTRIC_BEDS")).toBe(false);
    expect(types.has("PATIENT_MONITOR")).toBe(false);
    expect(types.has("COLD_CHAIN")).toBe(true);
    expect(types.has("KULKAS_VAKSIN")).toBe(true);
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
    const used = [
      ...seedSource.matchAll(/deviceTypeCode:\s*"([A-Z0-9_]+)"/g),
    ].map((match) => match[1]!);
    expect(used.length).toBe(246);
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
