import { Prisma } from "@prisma/client";

/**
 * MOM #1 — Transaction Revision + Immutable History.
 *
 * Allocates the next `revisionNumber` for a document's *History table, race-safe
 * within the caller's transaction. Mirrors DocumentNumberService's atomic
 * allocation shape (packages/db/src/document-number/document-number.service.ts)
 * but does not need a separate sequence table: the calling service always
 * performs `UPDATE <Operational> SET ... WHERE id = parentId` in the same
 * transaction as this call, which takes Postgres's row-level lock on the
 * current document and serializes concurrent revise() calls for that same
 * document. Reading MAX(revisionNumber)+1 after that lock is held is
 * therefore race-safe without a dedicated counter row.
 *
 * `(parentIdColumn, revisionNumber)` carries a DB unique constraint on every
 * *History table as a belt-and-suspenders backstop (see schema.prisma) — a
 * P2002 on that constraint should never happen given the locking above, but
 * callers may still want to catch it defensively the way other services in
 * this codebase already catch unique-constraint races (see
 * isUniqueConstraintError in purchase-orders.service.ts / work-orders.service.ts).
 */
export type RevisionTransactionClient = Omit<
  Prisma.TransactionClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

export interface AllocateRevisionNumberInput {
  tx: RevisionTransactionClient;
  /** History table name, exactly as it appears in the database (PascalCase). */
  historyTable: string;
  /** Column on the history table holding the parent document's id. */
  parentIdColumn: string;
  parentId: string;
}

export async function allocateRevisionNumber(
  input: AllocateRevisionNumberInput,
): Promise<number> {
  const { tx, historyTable, parentIdColumn, parentId } = input;
  const rows = await tx.$queryRaw<{ next: number }[]>`
    SELECT COALESCE(MAX("revisionNumber"), 0)::int + 1 AS next
    FROM ${Prisma.raw(`"${historyTable}"`)}
    WHERE ${Prisma.raw(`"${parentIdColumn}"`)} = ${parentId}
  `;
  return rows[0]?.next ?? 1;
}
