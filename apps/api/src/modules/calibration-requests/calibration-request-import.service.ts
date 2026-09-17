import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import * as ExcelJS from "exceljs";
import { prisma } from "@medcal/db";
import {
  normalizeDeviceTerm,
  type CalibrationRequestImportConfirmInput,
  type CalibrationRequestImportMatchMethod,
  type CalibrationRequestImportPreviewResponse,
  type CalibrationRequestImportPreviewRow,
  type CalibrationRequestImportSuggestion,
} from "@medcal/shared";
import type { UploadedFile } from "../files/files.constants";
import {
  CalibrationRequestsService,
  type CalibrationRequestWithItems,
} from "./calibration-requests.service";

// ── Technical safeguards (NOT business rules) ────────────────────────────────
/** Max accepted upload size. An import sheet is tiny; this only guards memory. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024; // 5 MiB
/** Max data rows read from the sheet = max CalibrationRequestItems (1 row = 1 item). */
export const MAX_DATA_ROWS = 1000;

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// ── AKD/AKL/NIE (Nomor Izin Edar) — optional customer declaration ────────────
// Optional free-text the customer declares at Requisition. Independent of Qty —
// a customer may declare a number even for an aggregate (Qty > 1) row:
//   • empty     → akdAkl NULL / akdAklDeclaration NOT_PROVIDED
//   • non-empty → akdAkl = value / akdAklDeclaration CUSTOMER_PROVIDED
// This is NOT the final per-physical-device verified value; the Technician
// resolves that later at CalibrationJob. Rows are never split into multiple
// items.

// ── Column header matching (deliberately narrow — spec §3) ───────────────────
const HEADER_ALIASES = {
  customerDeviceName: ["nama alat", "nama alat customer", "device name", "customer device name"],
  model: ["model"],
  qty: ["qty", "quantity", "jumlah"],
  deviceId: [
    "serial no",
    "serial no.",
    "serialno",
    "serial number",
    "no serial",
    "nomor seri",
    // Legacy header from templates downloaded before the "Serial No" relabel.
    "device id",
    "deviceid",
    "id device",
  ],
  // AKD/AKL/NIE is no longer part of the published template (MoM #4) and is not
  // advertised anywhere in the UI. The aliases stay so an already-downloaded older
  // template still imports without error — the value is simply stored as before.
  akdAkl: [
    "akd/akl/nie",
    "akd / akl / nie",
    "akd/akl / nie",
    "akd / akl/nie",
    "akd akl nie",
    "akd/akl",
    "akd / akl",
    "nie",
    "no izin edar",
    "nomor izin edar",
  ],
} as const;

type ColumnKey = keyof typeof HEADER_ALIASES;

interface ParsedRow {
  rowNumber: number;
  customerDeviceName: string;
  model: string | null;
  deviceId: string | null;
  qty: number | null;
  /** Customer-declared AKD/AKL/NIE, verbatim. NULL when the cell is empty. */
  akdAkl: string | null;
  errors: string[];
}

// ── exceljs cell readers ────────────────────────────────────────────────────
function cellToRaw(value: ExcelJS.CellValue | undefined): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const v = value as unknown as Record<string, unknown>;
    if ("error" in v) return null;
    if ("result" in v) return cellToRaw(v.result as ExcelJS.CellValue);
    if ("richText" in v && Array.isArray(v.richText)) {
      return (v.richText as Array<{ text?: string }>).map((r) => r.text ?? "").join("");
    }
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("hyperlink" in v && typeof v.hyperlink === "string") return v.hyperlink;
  }
  return null;
}

function cellToText(value: ExcelJS.CellValue | undefined): string {
  const raw = cellToRaw(value);
  if (raw === null) return "";
  return String(raw).trim();
}

// ── Qty parsing (spec §16) ──────────────────────────────────────────────────
function parseQty(value: ExcelJS.CellValue | undefined): { qty: number | null; error?: string } {
  const raw = cellToRaw(value);
  if (raw === null || raw === "") return { qty: null, error: "Qty wajib diisi" };
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || !Number.isInteger(raw) || raw <= 0) {
      return { qty: null, error: "Qty harus bilangan bulat positif" };
    }
    return { qty: raw };
  }
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) {
    return { qty: null, error: "Qty harus bilangan bulat positif" };
  }
  const n = Number.parseInt(text, 10);
  if (!Number.isSafeInteger(n) || n <= 0) {
    return { qty: null, error: "Qty harus bilangan bulat positif" };
  }
  return { qty: n };
}

// ── Serial No parsing (spec §13 / §14 / D2) ─────────────────────────────────
function parseDeviceId(value: ExcelJS.CellValue | undefined): {
  deviceId: string | null;
  error?: string;
} {
  const text = cellToText(value);
  if (!text) return { deviceId: null };
  if (/[,;\n\r]/.test(text)) {
    return { deviceId: null, error: "Satu baris hanya boleh memiliki satu Serial No" };
  }
  return { deviceId: text };
}

// ── AKD/AKL/NIE parsing ─────────────────────────────────────────────────────
const AKD_AKL_MAX_LEN = 120;
function parseAkdAkl(value: ExcelJS.CellValue | undefined): {
  akdAkl: string | null;
  error?: string;
} {
  const text = cellToText(value);
  if (!text) return { akdAkl: null };
  if (text.length > AKD_AKL_MAX_LEN) {
    return { akdAkl: null, error: `AKD/AKL/NIE maksimal ${AKD_AKL_MAX_LEN} karakter` };
  }
  return { akdAkl: text };
}

// ── Workbook parsing ────────────────────────────────────────────────────────
async function parseWorkbook(buffer: Buffer): Promise<ParsedRow[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    // exceljs's bundled .d.ts declares its own `Buffer` interface; a Node
    // Buffer is accepted at runtime. Cast via the parameter type.
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    throw new BadRequestException({
      message: "File Excel tidak dapat dibaca (workbook rusak atau bukan .xlsx)",
      code: "MALFORMED_WORKBOOK",
    });
  }

  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount === 0) {
    throw new BadRequestException({
      message: "File Excel tidak memiliki sheet berisi data",
      code: "EMPTY_WORKBOOK",
    });
  }

  // Header row = first row. Map each column index to a known key.
  const headerRow = sheet.getRow(1);
  const columnMap = new Map<number, ColumnKey>();
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const normalized = normalizeDeviceTerm(cellToText(cell.value));
    for (const [key, aliases] of Object.entries(HEADER_ALIASES) as [
      ColumnKey,
      readonly string[],
    ][]) {
      if (aliases.includes(normalized) && !columnMap.has(colNumber)) {
        // Only bind the first column that matches a given key.
        if (![...columnMap.values()].includes(key)) columnMap.set(colNumber, key);
      }
    }
  });

  const boundKeys = new Set(columnMap.values());
  const missing: string[] = [];
  if (!boundKeys.has("customerDeviceName")) missing.push("Nama Alat");
  if (!boundKeys.has("qty")) missing.push("Qty");
  if (missing.length > 0) {
    throw new BadRequestException({
      message: `Kolom wajib tidak ditemukan: ${missing.join(", ")}`,
      code: "MISSING_REQUIRED_COLUMN",
      missing,
    });
  }

  const colByKey = new Map<ColumnKey, number>();
  for (const [colNumber, key] of columnMap) colByKey.set(key, colNumber);

  const rows: ParsedRow[] = [];
  const lastRow = Math.min(sheet.rowCount, MAX_DATA_ROWS + 1);
  for (let rowNumber = 2; rowNumber <= lastRow; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const nameCell = row.getCell(colByKey.get("customerDeviceName")!).value;
    const qtyCol = colByKey.get("qty")!;
    const modelCol = colByKey.get("model");
    const deviceIdCol = colByKey.get("deviceId");
    const akdAklCol = colByKey.get("akdAkl");

    const customerDeviceName = cellToText(nameCell);
    const qtyCellValue = row.getCell(qtyCol).value;
    const modelText = modelCol ? cellToText(row.getCell(modelCol).value) : "";
    const deviceIdCellValue = deviceIdCol ? row.getCell(deviceIdCol).value : undefined;
    const akdAklCellValue = akdAklCol ? row.getCell(akdAklCol).value : undefined;

    // Fully-empty row → skip silently.
    if (
      !customerDeviceName &&
      cellToText(qtyCellValue) === "" &&
      !modelText &&
      cellToText(deviceIdCellValue) === "" &&
      cellToText(akdAklCellValue) === ""
    ) {
      continue;
    }

    const errors: string[] = [];
    if (!customerDeviceName) errors.push("Nama Alat kosong");

    const { qty, error: qtyError } = parseQty(qtyCellValue);
    if (qtyError) errors.push(qtyError);

    const { deviceId, error: deviceIdError } = parseDeviceId(deviceIdCellValue);
    if (deviceIdError) errors.push(deviceIdError);

    const { akdAkl, error: akdAklError } = parseAkdAkl(akdAklCellValue);
    if (akdAklError) errors.push(akdAklError);

    rows.push({
      rowNumber,
      customerDeviceName,
      model: modelText || null,
      deviceId,
      qty,
      akdAkl,
      errors,
    });
  }

  if (sheet.rowCount > MAX_DATA_ROWS + 1) {
    throw new BadRequestException({
      message: `File melebihi batas teknis ${MAX_DATA_ROWS} baris data`,
      code: "TOO_MANY_ROWS",
    });
  }

  return rows;
}

// ── DeviceType matching (spec §7 / §8) ──────────────────────────────────────
interface MatchIndex {
  nameMap: Map<string, { deviceTypeId: string; name: string; code: string } | "AMBIGUOUS">;
  aliasMap: Map<
    string,
    { deviceTypeId: string; name: string; code: string; alias: string } | "AMBIGUOUS"
  >;
  allTargets: Array<{
    deviceTypeId: string;
    name: string;
    code: string;
    normalized: string;
    via: string;
  }>;
}

async function buildMatchIndex(): Promise<MatchIndex> {
  const [deviceTypes, aliases] = await Promise.all([
    prisma.deviceType.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true },
    }),
    prisma.deviceTypeAlias.findMany({
      where: { isActive: true },
      include: { deviceType: { select: { id: true, code: true, name: true } } },
    }),
  ]);

  const nameMap: MatchIndex["nameMap"] = new Map();
  const allTargets: MatchIndex["allTargets"] = [];
  for (const dt of deviceTypes) {
    const key = normalizeDeviceTerm(dt.name);
    if (!key) continue;
    nameMap.set(
      key,
      nameMap.has(key) ? "AMBIGUOUS" : { deviceTypeId: dt.id, name: dt.name, code: dt.code },
    );
    allTargets.push({
      deviceTypeId: dt.id,
      name: dt.name,
      code: dt.code,
      normalized: key,
      via: "nama device type",
    });
  }

  const aliasMap: MatchIndex["aliasMap"] = new Map();
  for (const a of aliases) {
    const key = a.normalizedAlias || normalizeDeviceTerm(a.alias);
    if (!key) continue;
    aliasMap.set(
      key,
      aliasMap.has(key)
        ? "AMBIGUOUS"
        : {
            deviceTypeId: a.deviceType.id,
            name: a.deviceType.name,
            code: a.deviceType.code,
            alias: a.alias,
          },
    );
    allTargets.push({
      deviceTypeId: a.deviceType.id,
      name: a.deviceType.name,
      code: a.deviceType.code,
      normalized: key,
      via: `alias: ${a.alias}`,
    });
  }

  return { nameMap, aliasMap, allTargets };
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j += 1) prev[j] = j;
  for (let i = 1; i <= m; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j += 1) prev[j] = curr[j];
  }
  return prev[n];
}

/** Suggestion-only (spec §7 step 3, D10/D34). Never auto-assigned. */
function fuzzySuggest(key: string, index: MatchIndex): CalibrationRequestImportSuggestion[] {
  const scored: Array<{ s: CalibrationRequestImportSuggestion; score: number }> = [];
  const seen = new Set<string>();
  for (const target of index.allTargets) {
    const c = target.normalized;
    let score = 0;
    if (c === key) score = 100;
    else if (c.includes(key) || key.includes(c)) score = 70;
    else {
      const dist = levenshtein(key, c);
      const limit = Math.max(2, Math.floor(Math.max(key.length, c.length) * 0.3));
      if (dist <= limit) score = 50 - dist;
    }
    if (score <= 0) continue;
    const dedupeKey = `${target.deviceTypeId}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    scored.push({
      s: {
        deviceTypeId: target.deviceTypeId,
        deviceTypeName: target.name,
        deviceTypeCode: target.code,
        via: target.via,
      },
      score,
    });
  }
  return scored
    .sort((x, y) => y.score - x.score)
    .slice(0, 3)
    .map((x) => x.s);
}

interface RowMatch {
  deviceTypeId: string | null;
  deviceTypeName: string | null;
  deviceTypeCode: string | null;
  method: CalibrationRequestImportMatchMethod | null;
  suggestions: CalibrationRequestImportSuggestion[];
  error?: string;
}

function matchRow(customerDeviceName: string, index: MatchIndex): RowMatch {
  const key = normalizeDeviceTerm(customerDeviceName);
  const empty: RowMatch = {
    deviceTypeId: null,
    deviceTypeName: null,
    deviceTypeCode: null,
    method: null,
    suggestions: [],
  };
  if (!key) return empty;

  const nameHit = index.nameMap.get(key);
  if (nameHit === "AMBIGUOUS") {
    return { ...empty, error: `Ada lebih dari satu Device Type bernama "${customerDeviceName}"` };
  }
  if (nameHit) {
    return {
      deviceTypeId: nameHit.deviceTypeId,
      deviceTypeName: nameHit.name,
      deviceTypeCode: nameHit.code,
      method: "EXACT_NAME",
      suggestions: [],
    };
  }

  const aliasHit = index.aliasMap.get(key);
  if (aliasHit === "AMBIGUOUS") {
    return {
      ...empty,
      error: `Alias "${customerDeviceName}" ambigu — memetakan ke lebih dari satu Device Type`,
    };
  }
  if (aliasHit) {
    return {
      deviceTypeId: aliasHit.deviceTypeId,
      deviceTypeName: aliasHit.name,
      deviceTypeCode: aliasHit.code,
      method: "ALIAS",
      suggestions: [],
    };
  }

  return { ...empty, suggestions: fuzzySuggest(key, index) };
}

@Injectable()
export class CalibrationRequestImportService {
  constructor(
    @Inject(CalibrationRequestsService)
    private readonly requestsService: CalibrationRequestsService,
  ) {}

  /**
   * Side-effect free: parse → validate → match. One spreadsheet row stays one
   * row; its Qty is an aggregate quantity, never a row multiplier.
   */
  async preview(file: UploadedFile | undefined): Promise<CalibrationRequestImportPreviewResponse> {
    if (!file || !file.buffer || file.size === 0) {
      throw new BadRequestException({ message: "File Excel wajib diunggah", code: "NO_FILE" });
    }
    if (file.size > MAX_IMPORT_BYTES) {
      throw new BadRequestException({
        message: `Ukuran file melebihi batas ${Math.round(MAX_IMPORT_BYTES / 1024 / 1024)} MB`,
        code: "FILE_TOO_LARGE",
      });
    }
    const lowerName = (file.originalname ?? "").toLowerCase();
    if (!lowerName.endsWith(".xlsx")) {
      throw new BadRequestException({
        message: "Hanya file .xlsx yang didukung",
        code: "UNSUPPORTED_FILE_TYPE",
      });
    }
    if (
      file.mimetype &&
      file.mimetype !== XLSX_MIME &&
      file.mimetype !== "application/octet-stream"
    ) {
      throw new BadRequestException({
        message: "Tipe file tidak valid untuk .xlsx",
        code: "UNSUPPORTED_FILE_TYPE",
      });
    }

    const parsedRows = await parseWorkbook(file.buffer);
    if (parsedRows.length === 0) {
      throw new BadRequestException({
        message: "Tidak ada baris data yang dapat diproses",
        code: "NO_DATA_ROWS",
      });
    }

    const index = await buildMatchIndex();

    const rows: CalibrationRequestImportPreviewRow[] = parsedRows.map((parsed) => {
      const errors = [...parsed.errors];
      let match: RowMatch = {
        deviceTypeId: null,
        deviceTypeName: null,
        deviceTypeCode: null,
        method: null,
        suggestions: [],
      };
      if (parsed.customerDeviceName) {
        match = matchRow(parsed.customerDeviceName, index);
        if (match.error) errors.push(match.error);
      }

      return {
        rowNumber: parsed.rowNumber,
        customerDeviceName: parsed.customerDeviceName,
        model: parsed.model,
        deviceId: parsed.deviceId,
        qty: parsed.qty,
        akdAkl: parsed.akdAkl,
        match: {
          deviceTypeId: match.deviceTypeId,
          deviceTypeName: match.deviceTypeName,
          deviceTypeCode: match.deviceTypeCode,
          method: match.method,
        },
        suggestions: match.suggestions,
        warnings: [],
        errors,
      };
    });

    const totalUnits = rows.reduce(
      (sum, r) => (r.errors.length === 0 && r.qty ? sum + r.qty : sum),
      0,
    );

    return {
      rows,
      summary: {
        sourceRows: rows.length,
        totalUnits,
        matched: rows.filter((r) => r.match.method !== null).length,
        unmatched: rows.filter((r) => r.match.method === null && r.errors.length === 0).length,
        rowsWithWarnings: rows.filter((r) => r.warnings.length > 0).length,
        rowsWithErrors: rows.filter((r) => r.errors.length > 0).length,
      },
    };
  }

  /**
   * Transactional: reuses CalibrationRequestsService.create. Each reviewed
   * spreadsheet row becomes exactly ONE CalibrationRequestItem — the row's
   * aggregate Qty is stored on `qty`, never split into multiple rows.
   */
  async confirm(
    companyId: string,
    userId: string,
    input: CalibrationRequestImportConfirmInput,
  ): Promise<CalibrationRequestWithItems> {
    const items = input.rows.map((row) => ({
      deviceTypeId: row.deviceTypeId,
      customerDeviceName: row.customerDeviceName,
      ...(row.model ? { model: row.model } : {}),
      ...(row.deviceId ? { deviceId: row.deviceId } : {}),
      qty: row.qty,
      // Empty → create() derives NOT_PROVIDED; non-empty → CUSTOMER_PROVIDED.
      // Independent of qty — this is a customer declaration, not the verified
      // per-physical-device value (resolved later at CalibrationJob).
      ...(row.akdAkl ? { akdAkl: row.akdAkl } : {}),
    }));

    return this.requestsService.create(companyId, userId, {
      customerId: input.customerId,
      ...(input.leadId ? { leadId: input.leadId } : {}),
      serviceMode: input.serviceMode,
      ...(input.expectedDate ? { expectedDate: input.expectedDate } : {}),
      ...(input.notes ? { notes: input.notes } : {}),
      items,
    });
  }
}
