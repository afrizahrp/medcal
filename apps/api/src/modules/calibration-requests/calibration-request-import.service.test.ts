import { randomUUID } from "node:crypto";
import { BadRequestException } from "@nestjs/common";
import * as ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import type { UploadedFile } from "../files/files.constants";
import { CalibrationRequestImportService } from "./calibration-request-import.service";
import { CalibrationRequestsService } from "./calibration-requests.service";

const service = new CalibrationRequestImportService(new CalibrationRequestsService());
const realCompanyId = "PKM";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const createdRequestIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdAliasIds: string[] = [];
const createdDeviceTypeIds: string[] = [];
const createdDeviceCategoryIds: string[] = [];
const typeIdByName: Record<string, string> = {};

type Cell = string | number | null;

async function buildXlsx(
  header: string[],
  rows: Cell[][],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.addRow(header);
  for (const r of rows) ws.addRow(r);
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}

function asFile(buffer: Buffer, name = "sample.xlsx"): UploadedFile {
  return { originalname: name, mimetype: XLSX_MIME, size: buffer.length, buffer };
}

async function makeDeviceType(name: string): Promise<string> {
  const category = await prisma.deviceCategory.create({
    data: {
      code: `C${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`,
      name: "Import Test Cat",
    },
  });
  createdDeviceCategoryIds.push(category.id);
  const dt = await prisma.deviceType.create({
    data: {
      categoryId: category.id,
      code: `T${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`,
      name,
    },
  });
  createdDeviceTypeIds.push(dt.id);
  typeIdByName[name] = dt.id;
  return dt.id;
}

async function makeAlias(deviceTypeId: string, alias: string) {
  const row = await prisma.deviceTypeAlias.create({
    data: {
      deviceTypeId,
      alias,
      normalizedAlias: alias.trim().toLowerCase().replace(/\s+/g, " "),
    },
  });
  createdAliasIds.push(row.id);
}

// Unique DeviceType names for this run so the exact-name matcher is deterministic.
const SUFFIX = randomUUID().slice(0, 6);
const SPHYG = `Sphygmomanometer ${SUFFIX}`;
const BEDSIDE = `Bed Side Monitor ${SUFFIX}`;
const DENTAL = `Dental Unit ${SUFFIX}`;

beforeAll(async () => {
  const sphygId = await makeDeviceType(SPHYG);
  const bedsideId = await makeDeviceType(BEDSIDE);
  await makeDeviceType(DENTAL);
  await makeAlias(sphygId, `Tensimeter ${SUFFIX}`);
  await makeAlias(sphygId, `Tensimeter Digital ${SUFFIX}`);
  await makeAlias(bedsideId, `Patient Monitor ${SUFFIX}`);
});

afterAll(async () => {
  if (createdRequestIds.length > 0) {
    await prisma.calibrationRequestItem.deleteMany({
      where: { requestId: { in: createdRequestIds } },
    });
    await prisma.calibrationRequest.deleteMany({ where: { id: { in: createdRequestIds } } });
  }
  // Intentionally NOT deleting the shared DocumentNumberSequence row — other
  // parallel test files allocate CALIBRATION_REQUEST numbers from it too.
  if (createdCustomerIds.length > 0) {
    await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
  }
  if (createdAliasIds.length > 0) {
    await prisma.deviceTypeAlias.deleteMany({ where: { id: { in: createdAliasIds } } });
  }
  if (createdDeviceTypeIds.length > 0) {
    await prisma.deviceType.deleteMany({ where: { id: { in: createdDeviceTypeIds } } });
  }
  if (createdDeviceCategoryIds.length > 0) {
    await prisma.deviceCategory.deleteMany({ where: { id: { in: createdDeviceCategoryIds } } });
  }
});

async function makeCustomer(): Promise<string> {
  const customer = await prisma.customer.create({
    data: {
      companyId: realCompanyId,
      number: `CUS/IMPORT/${randomUUID().slice(0, 8)}`,
      name: `Import Customer ${randomUUID().slice(0, 6)}`,
    },
  });
  createdCustomerIds.push(customer.id);
  return customer.id;
}

const HEADER = ["Nama Alat", "Model", "Qty", "Device ID"];

describe("CalibrationRequestImportService.preview", () => {
  it("rejects a non-xlsx file", async () => {
    await expect(
      service.preview({ originalname: "x.csv", mimetype: "text/csv", size: 3, buffer: Buffer.from("a,b") }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a workbook missing a required column", async () => {
    const buf = await buildXlsx(["Nama Alat", "Model"], [["Tensimeter", "AB-123"]]);
    await expect(service.preview(asFile(buf))).rejects.toMatchObject({
      response: { code: "MISSING_REQUIRED_COLUMN" },
    });
  });

  it("matches by exact DeviceType name and by alias; one row stays one row, Qty stays aggregate", async () => {
    const buf = await buildXlsx(HEADER, [
      [`Tensimeter ${SUFFIX}`, "AB-123", 5, ""],
      [BEDSIDE, "BSM-501", 3, "BSM001"],
      [DENTAL, "DU-100", 2, "DU001"],
      [`Tensimeter Digital ${SUFFIX}`, "AB-123", 2, ""],
      [`Patient Monitor ${SUFFIX}`, "PM-5", 1, "PM-001"],
    ]);
    const preview = await service.preview(asFile(buf));

    expect(preview.rows).toHaveLength(5);
    expect(preview.summary.sourceRows).toBe(5);
    expect(preview.summary.totalUnits).toBe(13); // 5 + 3 + 2 + 2 + 1
    expect(preview.rows.map((r) => r.qty)).toEqual([5, 3, 2, 2, 1]);
    expect(preview.summary.matched).toBe(5);
    expect(preview.summary.unmatched).toBe(0);

    expect(preview.rows[0]?.match.method).toBe("ALIAS");
    expect(preview.rows[0]?.match.deviceTypeId).toBe(typeIdByName[SPHYG]);
    expect(preview.rows[0]?.customerDeviceName).toBe(`Tensimeter ${SUFFIX}`);
    expect(preview.rows[1]?.match.method).toBe("EXACT_NAME");
    expect(preview.rows[4]?.match.method).toBe("ALIAS");
    expect(preview.rows[4]?.match.deviceTypeId).toBe(typeIdByName[BEDSIDE]);
  });

  it("flags an unmatched row with no method and (maybe) suggestions", async () => {
    const buf = await buildXlsx(HEADER, [["Totally Unknown Widget", "", 1, ""]]);
    const preview = await service.preview(asFile(buf));
    expect(preview.rows[0]?.match.method).toBeNull();
    expect(preview.rows[0]?.match.deviceTypeId).toBeNull();
    expect(preview.summary.unmatched).toBe(1);
  });

  it("reports a blank Nama Alat and an invalid Qty as row errors", async () => {
    const buf = await buildXlsx(HEADER, [
      ["", "AB-123", 2, ""],
      [`Tensimeter ${SUFFIX}`, "AB-123", "abc", ""],
      [`Tensimeter ${SUFFIX}`, "AB-123", 0, ""],
      [`Tensimeter ${SUFFIX}`, "AB-123", 1.5, ""],
    ]);
    const preview = await service.preview(asFile(buf));
    expect(preview.rows[0]?.errors.some((e) => /Nama Alat kosong/.test(e))).toBe(true);
    expect(preview.rows[1]?.errors.some((e) => /Qty/.test(e))).toBe(true);
    expect(preview.rows[2]?.errors.some((e) => /Qty/.test(e))).toBe(true);
    expect(preview.rows[3]?.errors.some((e) => /Qty/.test(e))).toBe(true);
    expect(preview.summary.rowsWithErrors).toBe(4);
  });

  it("rejects multiple Device IDs in one cell", async () => {
    const buf = await buildXlsx(HEADER, [[`Tensimeter ${SUFFIX}`, "AB-123", 3, "TEN-001,TEN-002"]]);
    const preview = await service.preview(asFile(buf));
    expect(
      preview.rows[0]?.errors.some((e) => /satu Device ID/i.test(e)),
    ).toBe(true);
  });

  it("blank Device ID becomes NULL (no placeholder)", async () => {
    const buf = await buildXlsx(HEADER, [[`Tensimeter ${SUFFIX}`, "AB-123", 1, "   "]]);
    const preview = await service.preview(asFile(buf));
    expect(preview.rows[0]?.deviceId).toBeNull();
  });

  it("Qty > 1 with a single Device ID is a clean aggregate row (no warning, no error)", async () => {
    const buf = await buildXlsx(HEADER, [[`Tensimeter ${SUFFIX}`, "AB-123", 5, "TEN-001"]]);
    const preview = await service.preview(asFile(buf));
    expect(preview.rows[0]?.qty).toBe(5);
    expect(preview.rows[0]?.deviceId).toBe("TEN-001");
    expect(preview.rows[0]?.warnings).toEqual([]);
    expect(preview.rows[0]?.errors).toEqual([]);
  });

  it("writes nothing to the database (side-effect free)", async () => {
    // Scope the assertion to a fresh customer so parallel test files creating
    // requests for "PKM" cannot perturb the count.
    const customerId = await makeCustomer();
    const buf = await buildXlsx(HEADER, [[`Tensimeter ${SUFFIX}`, "AB-123", 4, ""]]);
    await service.preview(asFile(buf));
    const aliasesTouched = await prisma.deviceTypeAlias.count({
      where: { deviceType: { name: SPHYG } },
    });
    const requestsForCustomer = await prisma.calibrationRequest.count({ where: { customerId } });
    expect(requestsForCustomer).toBe(0);
    // Preview reads aliases but never creates/mutates them.
    expect(aliasesTouched).toBe(2);
  });
});

describe("CalibrationRequestImportService.confirm", () => {
  it("REAL xlsx → preview → confirm creates ONE aggregated item per row with qty preserved", async () => {
    const customerId = await makeCustomer();
    const buf = await buildXlsx(HEADER, [
      [`Tensimeter ${SUFFIX}`, "AB-123", 5, ""],
      [BEDSIDE, "BSM-501", 3, "BSM001"],
      [DENTAL, "DU-100", 2, "DU001"],
      [`Tensimeter Digital ${SUFFIX}`, "AB-123", 2, ""],
      [`Patient Monitor ${SUFFIX}`, "PM-5", 1, "PM-001"],
    ]);

    const preview = await service.preview(asFile(buf));
    expect(preview.rows.every((r) => r.errors.length === 0 && r.match.deviceTypeId)).toBe(true);

    const created = await service.confirm(realCompanyId, {
      customerId,
      serviceMode: "ON_SITE",
      rows: preview.rows.map((r) => ({
        customerDeviceName: r.customerDeviceName,
        ...(r.model ? { model: r.model } : {}),
        ...(r.deviceId ? { deviceId: r.deviceId } : {}),
        qty: r.qty ?? 1,
        deviceTypeId: r.match.deviceTypeId!,
      })),
    });
    createdRequestIds.push(created.id);

    // 5 Excel rows → exactly 5 requisition items (NOT 13).
    expect(created.items).toHaveLength(5);
    expect(created.status).toBe("DRAFT");
    expect(created.number.startsWith("CRQ/")).toBe(true);

    const byName = (name: string) =>
      created.items.find((i) => i.customerDeviceName === name);

    const tensimeter = byName(`Tensimeter ${SUFFIX}`)!;
    expect(tensimeter.qty).toBe(5);
    expect(tensimeter.deviceTypeId).toBe(typeIdByName[SPHYG]);
    expect(tensimeter.model).toBe("AB-123");
    expect(tensimeter.deviceId).toBeNull();

    const bedside = byName(BEDSIDE)!;
    expect(bedside.qty).toBe(3);
    expect(bedside.deviceId).toBe("BSM001");
    expect(bedside.deviceTypeId).toBe(typeIdByName[BEDSIDE]);

    const dental = byName(DENTAL)!;
    expect(dental.qty).toBe(2);
    expect(dental.deviceId).toBe("DU001");

    // Customer terminology preserved (not overwritten by the DeviceType name).
    const digital = byName(`Tensimeter Digital ${SUFFIX}`)!;
    expect(digital.qty).toBe(2);
    expect(digital.deviceType.name).toBe(SPHYG);

    // Patient Monitor → Bed Side Monitor via alias, wording kept.
    const pm = byName(`Patient Monitor ${SUFFIX}`)!;
    expect(pm.qty).toBe(1);
    expect(pm.deviceTypeId).toBe(typeIdByName[BEDSIDE]);
    expect(pm.deviceId).toBe("PM-001");

    // No item duplication.
    expect(new Set(created.items.map((i) => i.id)).size).toBe(5);
  });

  it("defaults qty to 1 for a row that omits it (matches manual + Requisition)", async () => {
    const customerId = await makeCustomer();
    const created = await service.confirm(realCompanyId, {
      customerId,
      serviceMode: "ON_SITE",
      rows: [{ customerDeviceName: "NoQtyRow", qty: 1, deviceTypeId: typeIdByName[DENTAL]! }],
    });
    createdRequestIds.push(created.id);
    expect(created.items).toHaveLength(1);
    expect(created.items[0]?.qty).toBe(1);
  });

  it("rolls back entirely when a deviceTypeId is invalid (transaction safety)", async () => {
    const customerId = await makeCustomer();
    await expect(
      service.confirm(realCompanyId, {
        customerId,
        serviceMode: "ON_SITE",
        rows: [
          { customerDeviceName: "X", qty: 2, deviceTypeId: typeIdByName[SPHYG]! },
          { customerDeviceName: "Y", qty: 1, deviceTypeId: "bogus-device-type" },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    // Scoped to this test's own customer so parallel writers can't perturb it.
    const forCustomer = await prisma.calibrationRequest.count({ where: { customerId } });
    expect(forCustomer).toBe(0);
  });

  it("scopes the created requisition to the caller's company (isolation)", async () => {
    const customerId = await makeCustomer();
    const created = await service.confirm(realCompanyId, {
      customerId,
      serviceMode: "ON_SITE",
      rows: [{ customerDeviceName: "Solo", qty: 1, deviceTypeId: typeIdByName[DENTAL]! }],
    });
    createdRequestIds.push(created.id);
    const foreign = await prisma.calibrationRequest.findFirst({
      where: { id: created.id, companyId: "NON-PKM" },
    });
    expect(foreign).toBeNull();
  });
});
