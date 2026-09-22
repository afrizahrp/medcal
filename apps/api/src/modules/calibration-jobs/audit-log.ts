import { prisma, type Prisma } from "@medcal/db";

/**
 * Minimal, reusable AuditLog writer. Introduced for the LK Result PDF
 * Download flow (see lk-download.service.ts) but intentionally not
 * LK-specific — any future sensitive action can call `recordAuditLog`
 * instead of growing its own bespoke audit table.
 *
 * NEVER pass a password/credential in `metadata` — this is a convention
 * enforced at every call site, not by the schema.
 */
export interface RecordAuditLogInput {
  companyId: string;
  userId: string | null;
  action: string;
  outcome: "SUCCESS" | "FAILURE";
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function recordAuditLog(input: RecordAuditLogInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      companyId: input.companyId,
      userId: input.userId,
      action: input.action,
      outcome: input.outcome,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}

export const LK_DOWNLOAD_ACTIONS = {
  REAUTH: "LK_DOWNLOAD_REAUTH",
  DOWNLOAD: "LK_DOWNLOAD",
} as const;

export const CALIBRATION_JOB_WORKSHEET_REVISE = "CALIBRATION_JOB_WORKSHEET_REVISE";
