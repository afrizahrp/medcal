# ERD — medcal (MVP)

**Status:** Approved (2026-08-02)  
**Sources:** [`../entity-catalog.md`](../entity-catalog.md), [`../business-domain.md`](../business-domain.md), [`../000-project-bootstrap.md`](../000-project-bootstrap.md)  
**Out of scope in this folder:** Prisma implementation detail (see `packages/db`)

## Contents

| Doc | Focus |
| --- | ----- |
| [overview.md](./overview.md) | Full MVP entity-relationship (split diagrams) |
| [attributes.md](./attributes.md) | Key attributes & enums per entity (conceptual) |

## Legend

- All business entities carry **`companyId`** → `Company` (no `branchId`)
- Solid relationships = required FK / ownership
- M:N shown via explicit join entity (`InvoiceCertificate`, `UserMembership`)
- **Billable SoR** = `Certificate.billingStatus` only
- **MVP billing docs** = Invoice + Payment + CreditNote
- **Inbound messaging** = ContactMessage + GetMessageFrom (bi-erp)

## Next

1. ~~ERD approval~~ **done**
2. ~~`packages/db` Prisma schema~~ **draft created** — see [`prisma-notes.md`](./prisma-notes.md)
3. Fase 0 monorepo scaffold → `pnpm install` → `prisma migrate`
