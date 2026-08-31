import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../index";
import { MasterCodeService } from "./master-code.service";

const createdCompanyIds: string[] = [];
const createdEquipmentTypeIds: string[] = [];

function newCompanyId() {
  return `M${randomUUID().replace(/[^A-Z0-9]/gi, "").slice(0, 2).toUpperCase()}`;
}

async function ensureCompany(id: string) {
  await prisma.company.upsert({
    where: { id },
    create: { id, name: `MasterCode Test ${id}`, status: "ACTIVE" },
    update: {},
  });
  createdCompanyIds.push(id);
}

async function cleanupScopes(companyId: string) {
  await prisma.masterCodeSequence.deleteMany({
    where: { scope: { in: [`DEVICE#${companyId}`, `EQUIPMENT#${companyId}`] } },
  });
}

afterAll(async () => {
  for (const companyId of createdCompanyIds) {
    await prisma.equipment.deleteMany({ where: { companyId } });
    await cleanupScopes(companyId);
  }
  if (createdEquipmentTypeIds.length > 0) {
    await prisma.equipmentType.deleteMany({ where: { id: { in: createdEquipmentTypeIds } } });
  }
  for (const companyId of createdCompanyIds) {
    await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
  }
});

describe("MasterCodeService.allocate", () => {
  it("allocates a zero-padded, prefixed code from 1", async () => {
    const companyId = newCompanyId();
    await ensureCompany(companyId);
    await cleanupScopes(companyId);

    const code = await prisma.$transaction((tx) =>
      MasterCodeService.allocate({ entity: "DEVICE", companyId, tx }),
    );

    expect(code).toBe("DVC-000001");
  });

  it("increments on each allocation", async () => {
    const companyId = newCompanyId();
    await ensureCompany(companyId);
    await cleanupScopes(companyId);

    const codes: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      codes.push(
        await prisma.$transaction((tx) =>
          MasterCodeService.allocate({ entity: "EQUIPMENT", companyId, tx }),
        ),
      );
    }

    expect(codes).toEqual(["EQU-000001", "EQU-000002", "EQU-000003"]);
  });

  it("isolates the counter per company", async () => {
    const companyA = newCompanyId();
    const companyB = newCompanyId();
    await ensureCompany(companyA);
    await ensureCompany(companyB);
    await cleanupScopes(companyA);
    await cleanupScopes(companyB);

    const [a, b] = await Promise.all([
      prisma.$transaction((tx) => MasterCodeService.allocate({ entity: "DEVICE", companyId: companyA, tx })),
      prisma.$transaction((tx) => MasterCodeService.allocate({ entity: "DEVICE", companyId: companyB, tx })),
    ]);

    expect(a).toBe("DVC-000001");
    expect(b).toBe("DVC-000001");
  });

  it("allocates unique, contiguous codes under concurrent requests", async () => {
    const companyId = newCompanyId();
    await ensureCompany(companyId);
    await cleanupScopes(companyId);

    const parallelCount = 25;
    const codes = await Promise.all(
      Array.from({ length: parallelCount }, () =>
        prisma.$transaction((tx) =>
          MasterCodeService.allocate({ entity: "DEVICE", companyId, tx }),
        ),
      ),
    );

    expect(new Set(codes).size).toBe(parallelCount);
    const sequences = codes.map((c) => Number(c.slice(4))).sort((a, b) => a - b);
    expect(sequences).toEqual(Array.from({ length: parallelCount }, (_, i) => i + 1));
  });

  it("bootstraps above existing generated codes when the counter row is missing", async () => {
    const companyId = newCompanyId();
    await ensureCompany(companyId);
    await cleanupScopes(companyId);

    const equipmentType = await prisma.equipmentType.create({
      data: { code: `MC${randomUUID().slice(0, 8)}`, name: "MasterCode Bootstrap Type" },
    });
    createdEquipmentTypeIds.push(equipmentType.id);

    // Simulate a backfilled / pre-existing row and a legacy hand-entered one.
    await prisma.equipment.createMany({
      data: [
        { companyId, equipmentTypeId: equipmentType.id, code: "EQU-000009" },
        { companyId, equipmentTypeId: equipmentType.id, code: "ESA-001" },
      ],
    });

    const next = await prisma.$transaction((tx) =>
      MasterCodeService.allocate({ entity: "EQUIPMENT", companyId, tx }),
    );

    expect(next).toBe("EQU-000010");
  });

  it("does not advance the counter when the transaction rolls back", async () => {
    const companyId = newCompanyId();
    await ensureCompany(companyId);
    await cleanupScopes(companyId);

    await prisma.$transaction((tx) => MasterCodeService.allocate({ entity: "DEVICE", companyId, tx }));

    await expect(
      prisma.$transaction(async (tx) => {
        await MasterCodeService.allocate({ entity: "DEVICE", companyId, tx });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");

    const after = await prisma.$transaction((tx) =>
      MasterCodeService.allocate({ entity: "DEVICE", companyId, tx }),
    );
    // First commit → 1, rolled-back allocation → discarded, next commit → 2.
    expect(after).toBe("DVC-000002");
  });

  it("allocates a global (non-company) entity code with no company segment", async () => {
    const a = await prisma.$transaction((tx) =>
      MasterCodeService.allocate({ entity: "DEVICE_CATEGORY", tx }),
    );
    const b = await prisma.$transaction((tx) =>
      MasterCodeService.allocate({ entity: "DEVICE_CATEGORY", tx }),
    );

    expect(a).toMatch(/^DVCAT-\d{3,}$/);
    expect(b).toMatch(/^DVCAT-\d{3,}$/);
    // strictly monotonic — exact +1 is not guaranteed because the global counter
    // may be shared with other test files running in parallel.
    expect(Number(b.slice(6))).toBeGreaterThan(Number(a.slice(6)));

    const row = await prisma.masterCodeSequence.findUnique({ where: { scope: "DEVICE_CATEGORY" } });
    expect(row).not.toBeNull();

    // Clean up the rows this test created so it stays idempotent across runs.
    await prisma.deviceCategory
      .deleteMany({ where: { code: { in: [a, b] } } })
      .catch(() => undefined);
  });

  it("throws when a company-scoped entity is allocated without a companyId", async () => {
    await expect(
      prisma.$transaction((tx) =>
        MasterCodeService.allocate({ entity: "DEVICE", tx } as never),
      ),
    ).rejects.toThrow(/companyId is required/);
  });
});
