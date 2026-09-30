import { randomUUID } from "node:crypto";

import { Prisma, type DocumentType } from "@prisma/client";

import { formatDocumentNumber, getZonedYearMonth } from "./format-document-number";
import { resolveDocumentPrefix } from "./document-type-prefix";
import { resolveDocumentNumberTable } from "./document-type-table";

export type DocumentNumberTransactionClient = Omit<
  Prisma.TransactionClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

export interface AllocateDocumentNumberInput {
  companyId: string;
  documentType: DocumentType;
  issuedAt: Date;
  tx: DocumentNumberTransactionClient;
  /**
   * IANA time zone that decides the year (counter key) and month of the
   * number. Omitted = UTC, the behaviour of every pre-existing document type.
   */
  timeZone?: string;
  /**
   * Opt-in collision backstop, for namespaces whose table may also receive
   * rows the allocator did not produce. When set:
   *  - the first-use seed only reads strictly well-formed numbers of this
   *    prefix/year, so a malformed or over-long foreign value cannot poison it;
   *  - if the produced number already exists in the table, the counter is
   *    SELF-HEALED inside the caller's transaction: it jumps past the highest
   *    well-formed existing number of this prefix/year (so any number of
   *    contiguous collisions costs one jump, and the healed counter commits
   *    with the transaction). Attempts are bounded by MAX_COLLISION_ATTEMPTS;
   *    past that DocumentNumberCollisionError is thrown.
   */
  skipExisting?: boolean;
}

/** Upper bound on allocation attempts per call — keeps the operation bounded. */
export const MAX_COLLISION_ATTEMPTS = 5;

/** Highest sequence a PFX/YYYY/MM/NNNNN number can carry (5 digits). */
export const MAX_DOCUMENT_SEQUENCE = 99999;

export class DocumentNumberCollisionError extends Error {
  constructor(documentType: string, attempts: number) {
    super(`Could not allocate a free ${documentType} number after ${attempts} attempt(s)`);
    this.name = "DocumentNumberCollisionError";
  }
}

/** The per-company/year counter has no numbers left (would exceed 99999). */
export class DocumentNumberSequenceExhaustedError extends Error {
  constructor(
    readonly documentType: string,
    readonly year: number,
  ) {
    super(`The ${documentType} number sequence for ${year} is exhausted (max ${MAX_DOCUMENT_SEQUENCE})`);
    this.name = "DocumentNumberSequenceExhaustedError";
  }
}

interface SequenceRow {
  lastSequence: number;
  prefix: string;
}

async function readMaxExistingSequence(
  tx: DocumentNumberTransactionClient,
  tableName: string,
  companyId: string,
  prefix: string,
  year: number,
  strict: boolean,
): Promise<number> {
  if (strict) {
    // Only exact PFX/YYYY/MM/NNNNN values count; anything else (foreign or
    // malformed numbers) is ignored so the cast below can never throw on it.
    const rows = await tx.$queryRaw<{ max_seq: number }[]>`
      SELECT COALESCE(MAX(CAST(SPLIT_PART("number", '/', 4) AS INTEGER)), 0)::int AS max_seq
      FROM ${Prisma.raw(`"${tableName}"`)}
      WHERE "companyId" = ${companyId}
        AND "number" ~ ${`^${prefix}/${year}/[0-9]{2}/[0-9]{5}$`}
    `;
    return rows[0]?.max_seq ?? 0;
  }

  const rows = await tx.$queryRaw<{ max_seq: number }[]>`
    SELECT COALESCE(MAX(CAST(SPLIT_PART("number", '/', 4) AS INTEGER)), 0)::int AS max_seq
    FROM ${Prisma.raw(`"${tableName}"`)}
    WHERE "companyId" = ${companyId}
      AND "number" LIKE ${`${prefix}/${year}/%`}
  `;

  return rows[0]?.max_seq ?? 0;
}

async function numberExists(
  tx: DocumentNumberTransactionClient,
  tableName: string,
  companyId: string,
  number: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<{ found: number }[]>`
    SELECT 1 AS found
    FROM ${Prisma.raw(`"${tableName}"`)}
    WHERE "companyId" = ${companyId}
      AND "number" = ${number}
    LIMIT 1
  `;
  return rows.length > 0;
}

async function advanceCounterTo(
  tx: DocumentNumberTransactionClient,
  companyId: string,
  documentType: DocumentType,
  year: number,
  minLastSequence: number,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE "DocumentNumberSequence"
    SET "lastSequence" = GREATEST("lastSequence", ${minLastSequence}),
        "updatedAt" = NOW()
    WHERE "companyId" = ${companyId}
      AND "documentType" = ${documentType}::"DocumentType"
      AND "year" = ${year}
  `;
}

export class DocumentNumberService {
  static async allocate(input: AllocateDocumentNumberInput): Promise<string> {
    const { companyId, documentType, issuedAt, tx, timeZone, skipExisting = false } = input;
    const prefix = resolveDocumentPrefix(documentType);
    const { year } = getZonedYearMonth(issuedAt, timeZone);

    const tableName = resolveDocumentNumberTable(documentType);
    const maxExisting = tableName
      ? await readMaxExistingSequence(tx, tableName, companyId, prefix, year, skipExisting)
      : 0;
    const initialSequence = maxExisting + 1;

    const guarded = skipExisting && Boolean(tableName);
    const maxAttempts = guarded ? MAX_COLLISION_ATTEMPTS : 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const rows = await tx.$queryRaw<SequenceRow[]>`
        INSERT INTO "DocumentNumberSequence" (
          "id",
          "companyId",
          "documentType",
          "prefix",
          "year",
          "lastSequence",
          "createdAt",
          "updatedAt"
        )
        VALUES (
          ${randomUUID()},
          ${companyId},
          ${documentType}::"DocumentType",
          ${prefix},
          ${year},
          ${initialSequence},
          NOW(),
          NOW()
        )
        ON CONFLICT ("companyId", "documentType", "year")
        DO UPDATE SET
          "lastSequence" = "DocumentNumberSequence"."lastSequence" + 1,
          "updatedAt" = NOW()
        RETURNING "lastSequence", "prefix"
      `;

      const row = rows[0];
      if (!row) {
        throw new Error("Failed to allocate document number sequence");
      }
      if (row.lastSequence > MAX_DOCUMENT_SEQUENCE) {
        throw new DocumentNumberSequenceExhaustedError(documentType, year);
      }

      const number = formatDocumentNumber(row.prefix, issuedAt, row.lastSequence, timeZone);
      if (!guarded || !tableName) {
        return number;
      }
      if (!(await numberExists(tx, tableName, companyId, number))) {
        return number;
      }

      // Collision with a row the allocator did not produce: jump the counter
      // past every well-formed existing number so the next attempt is free.
      const highest = await readMaxExistingSequence(tx, tableName, companyId, prefix, year, true);
      await advanceCounterTo(tx, companyId, documentType, year, highest);
    }

    throw new DocumentNumberCollisionError(documentType, maxAttempts);
  }
}
