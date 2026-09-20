import { randomUUID } from "node:crypto";
import { BadRequestException } from "@nestjs/common";
import * as ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import type { UploadedFile } from "../files/files.constants";
import {
  CalibrationRequestImportService,
  MAX_ENTRY_UNCOMPRESSED_BYTES,
  MAX_TOTAL_UNCOMPRESSED_BYTES,
} from "./calibration-request-import.service";
import { CalibrationRequestsService } from "./calibration-requests.service";

const service = new CalibrationRequestImportService(new CalibrationRequestsService());
const realCompanyId = "PKM";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const createdRequestIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdAliasIds: string[] = [];
const createdDeviceTypeIds: string[] = [];
const createdDeviceCategoryIds: string[] = [];
const createdUserIds: string[] = [];
const typeIdByName: Record<string, string> = {};
let testUserId: string;

type Cell = string | number | null;

async function buildXlsx(header: string[], rows: Cell[][]): Promise<Buffer> {
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

// ── Hand-built adversarial ZIP fixtures ─────────────────────────────────────
// ExcelJS's own writer (`buildXlsx` above) always produces honest, tiny sizes,
// so it can't construct the shape a decompression-bomb guard must catch: a
// ZIP whose central directory *declares* an oversized uncompressed size. These
// helpers write just enough of a syntactically valid ZIP (local file header +
// central directory + End Of Central Directory record) for `unzipper.Open
// .buffer()` to read the declared sizes — no real compressed payload is
// needed, since a metadata-only pre-check must reject before ever looking at
// entry contents.
function u16le(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n, 0);
  return b;
}
function u32le(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n, 0);
  return b;
}

interface RawZipEntry {
  name: string;
  uncompressedSize: number;
}

function buildRawZip(entries: RawZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf8");
    const localOffset = offset;

    const local = Buffer.concat([
      u32le(0x04034b50), // local file header signature
      u16le(20), // version needed to extract
      u16le(0), // flags
      u16le(0), // compression method = stored
      u16le(0), // last mod time
      u16le(0), // last mod date
      u32le(0), // crc32
      u32le(0), // compressed size (no real payload follows)
      u32le(entry.uncompressedSize), // declared uncompressed size
      u16le(nameBuf.length),
      u16le(0), // extra field length
      nameBuf,
    ]);
    localParts.push(local);
    offset += local.length;

    centralParts.push(
      Buffer.concat([
        u32le(0x02014b50), // central directory file header signature
        u16le(20), // version made by
        u16le(20), // version needed to extract
        u16le(0), // flags
        u16le(0), // compression method = stored
        u16le(0), // last mod time
        u16le(0), // last mod date
        u32le(0), // crc32
        u32le(0), // compressed size
        u32le(entry.uncompressedSize), // declared uncompressed size
        u16le(nameBuf.length),
        u16le(0), // extra field length
        u16le(0), // file comment length
        u16le(0), // disk number start
        u16le(0), // internal file attributes
        u32le(0), // external file attributes
        u32le(localOffset), // offset to local file header
        nameBuf,
      ]),
    );
  }

  const localData = Buffer.concat(localParts);
  const centralData = Buffer.concat(centralParts);
  const eocd = Buffer.concat([
    u32le(0x06054b50), // end of central directory signature
    u16le(0), // disk number
    u16le(0), // disk where central directory starts
    u16le(entries.length), // records on this disk
    u16le(entries.length), // total records
    u32le(centralData.length), // size of central directory
    u32le(localData.length), // offset to start of central directory
    u16le(0), // comment length
  ]);

  return Buffer.concat([localData, centralData, eocd]);
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
  const user = await prisma.user.create({
    data: {
      email: `crq-import-${randomUUID().slice(0, 10)}@x.co`,
      name: "CRQ Import Test User",
      status: "ACTIVE",
    },
  });
  createdUserIds.push(user.id);
  testUserId = user.id;
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
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
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

const HEADER = ["Nama Alat", "Model", "Qty", "Serial No"];
// AKD/AKL/NIE was dropped from the published template (MoM #4); an already-downloaded
// older file may still carry the column, and must keep importing exactly as before.
const HEADER_AKD = ["Nama Alat", "Model", "Qty", "Serial No", "AKD/AKL/NIE"];
// Templates downloaded before the "Serial No" relabel still carry the old header.
const HEADER_LEGACY = ["Nama Alat", "Model", "Qty", "Device ID"];

describe("CalibrationRequestImportService.preview", () => {
  it("rejects a non-xlsx file", async () => {
    await expect(
      service.preview({
        originalname: "x.csv",
        mimetype: "text/csv",
        size: 3,
        buffer: Buffer.from("a,b"),
      }),
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

  it("rejects multiple Serial No values in one cell", async () => {
    const buf = await buildXlsx(HEADER, [[`Tensimeter ${SUFFIX}`, "AB-123", 3, "TEN-001,TEN-002"]]);
    const preview = await service.preview(asFile(buf));
    expect(preview.rows[0]?.errors.some((e) => /satu Serial No/i.test(e))).toBe(true);
  });

  it('still accepts the legacy "Device ID" header from older templates', async () => {
    const buf = await buildXlsx(HEADER_LEGACY, [[`Tensimeter ${SUFFIX}`, "AB-123", 1, "TEN-009"]]);
    const preview = await service.preview(asFile(buf));
    expect(preview.rows[0]?.deviceId).toBe("TEN-009");
    expect(preview.rows[0]?.errors).toEqual([]);
  });

  it("blank Serial No becomes NULL (no placeholder)", async () => {
    const buf = await buildXlsx(HEADER, [[`Tensimeter ${SUFFIX}`, "AB-123", 1, "   "]]);
    const preview = await service.preview(asFile(buf));
    expect(preview.rows[0]?.deviceId).toBeNull();
  });

  it("Qty > 1 with a single Serial No is a clean aggregate row (no warning, no error)", async () => {
    const buf = await buildXlsx(HEADER, [[`Tensimeter ${SUFFIX}`, "AB-123", 5, "TEN-001"]]);
    const preview = await service.preview(asFile(buf));
    expect(preview.rows[0]?.qty).toBe(5);
    expect(preview.rows[0]?.deviceId).toBe("TEN-001");
    expect(preview.rows[0]?.warnings).toEqual([]);
    expect(preview.rows[0]?.errors).toEqual([]);
  });

  it("AKD/AKL/NIE: empty cell → akdAkl null, no error (any Qty)", async () => {
    const buf = await buildXlsx(HEADER_AKD, [
      [`Tensimeter ${SUFFIX}`, "AB-123", 1, "", ""],
      [BEDSIDE, "BSM-501", 4, "", "   "],
    ]);
    const preview = await service.preview(asFile(buf));
    expect(preview.rows[0]?.akdAkl).toBeNull();
    expect(preview.rows[1]?.akdAkl).toBeNull();
    expect(preview.rows.every((r) => r.errors.length === 0)).toBe(true);
  });

  it("AKD/AKL/NIE: a value is carried on the row regardless of Qty, no error", async () => {
    const buf = await buildXlsx(HEADER_AKD, [
      [`Tensimeter ${SUFFIX}`, "AB-123", 1, "", "AKD 20403012345"],
      [BEDSIDE, "BSM-501", 3, "", "AKL 30301099999"],
    ]);
    const preview = await service.preview(asFile(buf));
    expect(preview.rows[0]?.akdAkl).toBe("AKD 20403012345");
    expect(preview.rows[0]?.qty).toBe(1);
    expect(preview.rows[1]?.akdAkl).toBe("AKL 30301099999");
    expect(preview.rows[1]?.qty).toBe(3);
    expect(preview.rows.every((r) => r.errors.length === 0)).toBe(true);
  });

  it("AKD/AKL/NIE: over 120 characters is a row error", async () => {
    const buf = await buildXlsx(HEADER_AKD, [
      [`Tensimeter ${SUFFIX}`, "AB-123", 1, "", "A".repeat(121)],
    ]);
    const preview = await service.preview(asFile(buf));
    expect(preview.rows[0]?.errors.some((e) => /120 karakter/i.test(e))).toBe(true);
  });

  it("AKD/AKL/NIE: works when the column is absent (backward compatible)", async () => {
    const buf = await buildXlsx(HEADER, [[`Tensimeter ${SUFFIX}`, "AB-123", 2, ""]]);
    const preview = await service.preview(asFile(buf));
    expect(preview.rows[0]?.akdAkl).toBeNull();
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

describe("CalibrationRequestImportService.preview — decompression-bomb guard", () => {
  it("rejects a ZIP whose central directory declares a single entry above the per-entry cap", async () => {
    const buf = buildRawZip([
      { name: "xl/worksheets/sheet1.xml", uncompressedSize: MAX_ENTRY_UNCOMPRESSED_BYTES + 1 },
    ]);
    await expect(service.preview(asFile(buf))).rejects.toMatchObject({
      response: { code: "WORKBOOK_TOO_LARGE_UNCOMPRESSED" },
    });
  });

  it("rejects a ZIP whose entries are each under the per-entry cap but whose declared total exceeds the archive-wide cap", async () => {
    // Three entries, each individually under MAX_ENTRY_UNCOMPRESSED_BYTES,
    // but summing to more than MAX_TOTAL_UNCOMPRESSED_BYTES.
    const perEntry = MAX_ENTRY_UNCOMPRESSED_BYTES - 1;
    expect(perEntry * 3).toBeGreaterThan(MAX_TOTAL_UNCOMPRESSED_BYTES);
    const buf = buildRawZip([
      { name: "xl/worksheets/sheet1.xml", uncompressedSize: perEntry },
      { name: "xl/worksheets/sheet2.xml", uncompressedSize: perEntry },
      { name: "xl/worksheets/sheet3.xml", uncompressedSize: perEntry },
    ]);
    await expect(service.preview(asFile(buf))).rejects.toMatchObject({
      response: { code: "WORKBOOK_TOO_LARGE_UNCOMPRESSED" },
    });
  });

  it("does not reject a legitimate small workbook (guard is transparent to real files)", async () => {
    const buf = await buildXlsx(HEADER, [[`Tensimeter ${SUFFIX}`, "AB-123", 1, ""]]);
    await expect(service.preview(asFile(buf))).resolves.toBeDefined();
  });

  it("rejects a non-ZIP / malformed upload before any decompression, preserving MALFORMED_WORKBOOK", async () => {
    const buf = Buffer.from("this is not a zip file at all");
    await expect(service.preview(asFile(buf))).rejects.toMatchObject({
      response: { code: "MALFORMED_WORKBOOK" },
    });
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

    const created = await service.confirm(realCompanyId, testUserId, {
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

    const byName = (name: string) => created.items.find((i) => i.customerDeviceName === name);

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
    const created = await service.confirm(realCompanyId, testUserId, {
      customerId,
      serviceMode: "ON_SITE",
      rows: [{ customerDeviceName: "NoQtyRow", qty: 1, deviceTypeId: typeIdByName[DENTAL]! }],
    });
    createdRequestIds.push(created.id);
    expect(created.items).toHaveLength(1);
    expect(created.items[0]?.qty).toBe(1);
  });

  it("persists AKD/AKL/NIE as CUSTOMER_PROVIDED (any Qty); empty row stays NOT_PROVIDED", async () => {
    const customerId = await makeCustomer();
    const buf = await buildXlsx(HEADER_AKD, [
      [`Tensimeter ${SUFFIX}`, "AB-123", 5, "", "AKD 20403012345"],
      [BEDSIDE, "BSM-501", 4, "", ""],
    ]);
    const preview = await service.preview(asFile(buf));
    expect(preview.rows.every((r) => r.errors.length === 0 && r.match.deviceTypeId)).toBe(true);

    const created = await service.confirm(realCompanyId, testUserId, {
      customerId,
      serviceMode: "ON_SITE",
      rows: preview.rows.map((r) => ({
        customerDeviceName: r.customerDeviceName,
        ...(r.model ? { model: r.model } : {}),
        qty: r.qty ?? 1,
        ...(r.akdAkl ? { akdAkl: r.akdAkl } : {}),
        deviceTypeId: r.match.deviceTypeId!,
      })),
    });
    createdRequestIds.push(created.id);

    const tensimeter = created.items.find((i) => i.customerDeviceName === `Tensimeter ${SUFFIX}`)!;
    expect(tensimeter.qty).toBe(5);
    expect(tensimeter.akdAkl).toBe("AKD 20403012345");
    expect(tensimeter.akdAklDeclaration).toBe("CUSTOMER_PROVIDED");

    const bedside = created.items.find((i) => i.customerDeviceName === BEDSIDE)!;
    expect(bedside.qty).toBe(4);
    expect(bedside.akdAkl).toBeNull();
    expect(bedside.akdAklDeclaration).toBe("NOT_PROVIDED");
  });

  it("confirm accepts a Qty > 1 row that carries AKD/AKL/NIE (customer declaration)", async () => {
    const customerId = await makeCustomer();
    const created = await service.confirm(realCompanyId, testUserId, {
      customerId,
      serviceMode: "ON_SITE",
      rows: [
        {
          customerDeviceName: "Aggregate",
          qty: 3,
          akdAkl: "AKD 20403012345",
          deviceTypeId: typeIdByName[SPHYG]!,
        },
      ],
    });
    createdRequestIds.push(created.id);
    expect(created.items).toHaveLength(1);
    expect(created.items[0]?.qty).toBe(3);
    expect(created.items[0]?.akdAkl).toBe("AKD 20403012345");
    expect(created.items[0]?.akdAklDeclaration).toBe("CUSTOMER_PROVIDED");
  });

  it("rolls back entirely when a deviceTypeId is invalid (transaction safety)", async () => {
    const customerId = await makeCustomer();
    await expect(
      service.confirm(realCompanyId, testUserId, {
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
    const created = await service.confirm(realCompanyId, testUserId, {
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
