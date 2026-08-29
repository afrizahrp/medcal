import { randomUUID } from "node:crypto";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import { EquipmentCalibrationRecordsService } from "./equipment-calibration-records.service";
import { equipmentCalibrationFileOwnerPolicy } from "./equipment-calibration-file-owner-policy";

const service = new EquipmentCalibrationRecordsService();
const realCompanyId = "PKM";
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const uniqueCode = () => `EQC${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;

let userId: string;
let equipmentTypeId: string;
let equipmentId: string;
let otherCompanyId: string;
let otherEquipmentId: string;
const createdRecordIds: string[] = [];

beforeAll(async () => {
  const user =
    (await prisma.user.findFirst({ where: { status: "ACTIVE" }, select: { id: true } })) ??
    (await prisma.user.create({
      data: { email: `calib-test-${Date.now()}@example.com`, status: "ACTIVE" },
      select: { id: true },
    }));
  userId = user.id;

  const et = await prisma.equipmentType.create({
    data: { code: uniqueCode(), name: "Calib Test Analyzer" },
  });
  equipmentTypeId = et.id;
  const eq = await prisma.equipment.create({
    data: { companyId: realCompanyId, equipmentTypeId, code: uniqueCode() },
  });
  equipmentId = eq.id;

  // Fixed id + upsert: a random 2-char suffix collides with other suites'
  // company ids under parallel test execution.
  otherCompanyId = "ZQC";
  await prisma.company.upsert({
    where: { id: otherCompanyId },
    create: { id: otherCompanyId, name: "Calib Other Co", status: "ACTIVE" },
    update: {},
  });
  const otherEq = await prisma.equipment.create({
    data: { companyId: otherCompanyId, equipmentTypeId, code: uniqueCode() },
  });
  otherEquipmentId = otherEq.id;
});

afterAll(async () => {
  await prisma.equipmentCalibrationRecord.deleteMany({
    where: { equipmentId: { in: [equipmentId, otherEquipmentId] } },
  });
  await prisma.equipment.deleteMany({ where: { equipmentTypeId } });
  await prisma.equipmentType.deleteMany({ where: { id: equipmentTypeId } });
  // The shared "ZQC" company row is left in place — other parallel runs may hold it.
});

function createInput(over: Record<string, unknown> = {}) {
  return {
    calibrationDate: d("2026-03-15"),
    validUntil: d("2027-03-15"),
    certificateNumber: "CAL-001",
    provider: "Lab X",
    result: "PASS",
    ...over,
  } as Parameters<EquipmentCalibrationRecordsService["create"]>[3];
}

describe("EquipmentCalibrationRecordsService — CRUD + lifecycle", () => {
  it("creates a DRAFT record, updates it, then confirms it", async () => {
    const created = await service.create(realCompanyId, userId, equipmentId, createInput());
    createdRecordIds.push(created.id);
    expect(created.status).toBe("DRAFT");
    expect(created.result).toBe("PASS");
    expect(created.acceptedForUse).toBe(false);
    expect(created.createdByUserId).toBe(userId);

    const updated = await service.update(realCompanyId, userId, created.id, {
      remarks: "within tolerance",
    });
    expect(updated.remarks).toBe("within tolerance");

    const confirmed = await service.update(realCompanyId, userId, created.id, { status: "CONFIRMED" });
    expect(confirmed.status).toBe("CONFIRMED");
  });

  it("locks a CONFIRMED record against update and delete", async () => {
    const rec = await service.create(realCompanyId, userId, equipmentId, createInput());
    createdRecordIds.push(rec.id);
    await service.update(realCompanyId, userId, rec.id, { status: "CONFIRMED" });

    await expect(
      service.update(realCompanyId, userId, rec.id, { remarks: "nope" }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(service.remove(realCompanyId, rec.id)).rejects.toBeInstanceOf(ConflictException);
  });

  it("deletes a DRAFT record", async () => {
    const rec = await service.create(realCompanyId, userId, equipmentId, createInput());
    const res = await service.remove(realCompanyId, rec.id);
    expect(res.deleted).toBe(true);
    await expect(service.findOne(realCompanyId, rec.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects a validity window where start is after validUntil", async () => {
    await expect(
      service.create(
        realCompanyId,
        userId,
        equipmentId,
        createInput({ calibrationDate: d("2027-06-01"), validUntil: d("2027-03-15") }),
      ),
    ).rejects.toBeTruthy();
  });
});

describe("EquipmentCalibrationRecordsService — acceptance decision", () => {
  it("records who/when on acceptedForUse and keeps result independent", async () => {
    const rec = await service.create(
      realCompanyId,
      userId,
      equipmentId,
      createInput({ result: "PASS", acceptedForUse: false }),
    );
    createdRecordIds.push(rec.id);
    expect(rec.acceptedForUse).toBe(false);
    expect(rec.acceptedByUserId).toBeNull();

    const accepted = await service.update(realCompanyId, userId, rec.id, {
      acceptedForUse: true,
      acceptanceNotes: "reviewed certificate",
    });
    expect(accepted.acceptedForUse).toBe(true);
    expect(accepted.acceptedByUserId).toBe(userId);
    expect(accepted.acceptedAt).toBeInstanceOf(Date);
    expect(accepted.acceptanceNotes).toBe("reviewed certificate");
    // result unchanged — acceptance is a separate decision
    expect(accepted.result).toBe("PASS");

    const revoked = await service.update(realCompanyId, userId, rec.id, { acceptedForUse: false });
    expect(revoked.acceptedForUse).toBe(false);
    expect(revoked.acceptedByUserId).toBeNull();
    expect(revoked.acceptedAt).toBeNull();
  });
});

describe("EquipmentCalibrationRecordsService — derived validity", () => {
  it("VALID / EXPIRED / NO_RECORD from CONFIRMED records", async () => {
    const freshEq = await prisma.equipment.create({
      data: { companyId: realCompanyId, equipmentTypeId, code: uniqueCode() },
    });

    expect((await service.getValidity(realCompanyId, freshEq.id, d("2026-06-01"))).status).toBe(
      "NO_RECORD",
    );

    const rec = await service.create(realCompanyId, userId, freshEq.id, createInput());
    // DRAFT does not count yet
    expect((await service.getValidity(realCompanyId, freshEq.id, d("2026-06-01"))).status).toBe(
      "NO_RECORD",
    );
    await service.update(realCompanyId, userId, rec.id, { status: "CONFIRMED" });

    expect((await service.getValidity(realCompanyId, freshEq.id, d("2026-06-01"))).status).toBe(
      "VALID",
    );
    expect((await service.getValidity(realCompanyId, freshEq.id, d("2028-01-01"))).status).toBe(
      "EXPIRED",
    );

    await prisma.equipmentCalibrationRecord.deleteMany({ where: { equipmentId: freshEq.id } });
    await prisma.equipment.delete({ where: { id: freshEq.id } });
  });
});

describe("EquipmentCalibrationRecordsService — company isolation", () => {
  it("does not expose or mutate another company's record", async () => {
    const foreign = await service.create(otherCompanyId, userId, otherEquipmentId, createInput());

    await expect(service.findOne(realCompanyId, foreign.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.update(realCompanyId, userId, foreign.id, { remarks: "hijack" }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove(realCompanyId, foreign.id)).rejects.toBeInstanceOf(NotFoundException);

    // creating a record for another company's equipment via this company is a 404
    await expect(
      service.create(realCompanyId, userId, otherEquipmentId, createInput()),
    ).rejects.toBeInstanceOf(NotFoundException);

    await prisma.equipmentCalibrationRecord.delete({ where: { id: foreign.id } });
  });
});

describe("equipmentCalibrationFileOwnerPolicy", () => {
  it("resolves owner existence + locked from the record status, company-scoped", async () => {
    const draft = await service.create(realCompanyId, userId, equipmentId, createInput());
    createdRecordIds.push(draft.id);

    expect(await equipmentCalibrationFileOwnerPolicy.resolveOwner(realCompanyId, draft.id)).toEqual({
      exists: true,
      locked: false,
    });
    expect(await equipmentCalibrationFileOwnerPolicy.resolveOwner(otherCompanyId, draft.id)).toEqual({
      exists: false,
      locked: false,
    });

    await service.update(realCompanyId, userId, draft.id, { status: "CONFIRMED" });
    expect(await equipmentCalibrationFileOwnerPolicy.resolveOwner(realCompanyId, draft.id)).toEqual({
      exists: true,
      locked: true,
    });

    expect(equipmentCalibrationFileOwnerPolicy.permissionResource).toBe("equipmentCalibrationRecord");
    expect(equipmentCalibrationFileOwnerPolicy.fileTypePolicy.mimeTypes).toEqual(["application/pdf"]);
  });
});
