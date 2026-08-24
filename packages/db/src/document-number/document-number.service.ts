import { randomUUID } from "node:crypto";

import { Prisma, type DocumentType } from "@prisma/client";

import { formatDocumentNumber } from "./format-document-number";
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
): Promise<number> {
  const rows = await tx.$queryRaw<{ max_seq: number }[]>`
    SELECT COALESCE(MAX(CAST(SPLIT_PART("number", '/', 4) AS INTEGER)), 0)::int AS max_seq
    FROM ${Prisma.raw(`"${tableName}"`)}
    WHERE "companyId" = ${companyId}
      AND "number" LIKE ${`${prefix}/${year}/%`}
  `;

  return rows[0]?.max_seq ?? 0;
}

export class DocumentNumberService {
  static async allocate(input: AllocateDocumentNumberInput): Promise<string> {
    const { companyId, documentType, issuedAt, tx } = input;
    const prefix = resolveDocumentPrefix(documentType);
    const year = issuedAt.getUTCFullYear();

    const tableName = resolveDocumentNumberTable(documentType);
    const maxExisting = tableName
      ? await readMaxExistingSequence(tx, tableName, companyId, prefix, year)
      : 0;
    const initialSequence = maxExisting + 1;

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

    return formatDocumentNumber(row.prefix, issuedAt, row.lastSequence);
  }
}
