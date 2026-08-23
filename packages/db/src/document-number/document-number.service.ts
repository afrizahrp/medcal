import { randomUUID } from "node:crypto";

import type { DocumentType, Prisma } from "@prisma/client";

import { formatDocumentNumber } from "./format-document-number";
import { resolveDocumentPrefix } from "./document-type-prefix";

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

export class DocumentNumberService {
  static async allocate(input: AllocateDocumentNumberInput): Promise<string> {
    const { companyId, documentType, issuedAt, tx } = input;
    const prefix = resolveDocumentPrefix(documentType);
    const year = issuedAt.getUTCFullYear();

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
        1,
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
