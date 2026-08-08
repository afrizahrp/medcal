# Prisma schema — medcal MVP

**Status:** Draft schema created after ERD approval (2026-08-02)  
**Path:** [`packages/db/prisma/schema.prisma`](../packages/db/prisma/schema.prisma)

## Locked alignments

- Company only (no Branch)
- ContactMessage + GetMessageFrom / ContactStatus (bi-erp)
- Lead.contactMessageId (ContactMessage created first)
- Certificate.billingStatus SoR; Invoice + Payment + CreditNote
- CalibrationJob unique (workOrderId, deviceId)

## Not in this schema yet

- Better Auth internal tables (map to `User` later)
- ChatSession / full Email mailbox
- DebitNote / Refund entities
- Migrations applied (run after Fase 0 install + DATABASE_URL)

## Next

Fase 0 monorepo scaffold (pnpm + Turborepo + apps), then `prisma migrate`.
