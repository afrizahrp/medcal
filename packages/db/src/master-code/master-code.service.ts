import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { formatMasterCode } from "./format-master-code";
import { resolveMasterCodeConfig, type MasterCodeEntity } from "./master-code-config";

export type MasterCodeTransactionClient = Omit<
  Prisma.TransactionClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

export interface AllocateMasterCodeInput {
  entity: MasterCodeEntity;
  /** Required when the entity's scope is `company`; ignored when `global`. */
  companyId?: string;
  /** Must be the caller's transaction client so allocation + insert commit together. */
  tx: MasterCodeTransactionClient;
}

interface SequenceRow {
  lastSequence: number;
}

/** Composed unique key for the counter row — sidesteps the "NULL is distinct" trap. */
function resolveScope(entity: MasterCodeEntity, companyId: string | undefined): string {
  const config = resolveMasterCodeConfig(entity);
  if (config.scope === "company") {
    if (!companyId) {
      throw new Error(`companyId is required to allocate a ${entity} master code`);
    }
    return `${entity}#${companyId}`;
  }
  return entity;
}

/**
 * Highest sequence number already present in the entity's table for
 * system-generated codes (`PREFIX-<digits>`). Used to bootstrap the counter the
 * first time it is touched so numbering continues above backfilled / pre-existing
 * rows. Legacy hand-entered codes do not match the pattern and are ignored.
 */
async function readMaxExistingSequence(
  tx: MasterCodeTransactionClient,
  entity: MasterCodeEntity,
  companyId: string | undefined,
): Promise<number> {
  const config = resolveMasterCodeConfig(entity);
  const pattern = `^${config.prefix}-(\\d+)$`;
  const companyFilter =
    config.scope === "company" && companyId
      ? Prisma.sql`WHERE "companyId" = ${companyId}`
      : Prisma.empty;

  const rows = await tx.$queryRaw<{ max_seq: number }[]>`
    SELECT COALESCE(MAX(CAST(substring("code" FROM ${pattern}) AS INTEGER)), 0)::int AS max_seq
    FROM ${Prisma.raw(`"${config.table}"`)}
    ${companyFilter}
  `;

  return rows[0]?.max_seq ?? 0;
}

export class MasterCodeService {
  /**
   * Atomically allocates the next business code for a master entity and returns
   * it formatted (e.g. `DVC-000001`). Concurrency-safe via a single
   * `INSERT … ON CONFLICT DO UPDATE … RETURNING` on the counter row. Gaps are
   * possible on transaction rollback and are acceptable; numbers are never
   * reused.
   */
  static async allocate(input: AllocateMasterCodeInput): Promise<string> {
    const { entity, companyId, tx } = input;
    const config = resolveMasterCodeConfig(entity);
    const scope = resolveScope(entity, companyId);

    const seed = await readMaxExistingSequence(tx, entity, companyId);
    const initialSequence = seed + 1;

    const rows = await tx.$queryRaw<SequenceRow[]>`
      INSERT INTO "MasterCodeSequence" (
        "id", "scope", "lastSequence", "createdAt", "updatedAt"
      )
      VALUES (${randomUUID()}, ${scope}, ${initialSequence}, NOW(), NOW())
      ON CONFLICT ("scope")
      DO UPDATE SET
        "lastSequence" = "MasterCodeSequence"."lastSequence" + 1,
        "updatedAt" = NOW()
      RETURNING "lastSequence"
    `;

    const row = rows[0];
    if (!row) {
      throw new Error(`Failed to allocate master code sequence for ${entity}`);
    }

    return formatMasterCode(config.prefix, row.lastSequence, config.width);
  }
}
