# Centralized Document Numbering — Phase 1 & 2 Implementation

**Status:** Implemented (schema + service + tests)  
**Approved format:** `PREFIX/YYYY/MM/NNNNN`

## Scope (this phase)

- Schema: `DocumentType`, `DocumentNumberSequence`
- Business number fields: `Customer.number`, `CalibrationRequest.number`, `Quotation.number`
- Service: `DocumentNumberService.allocate({ companyId, documentType, issuedAt, tx })`
- Prefixes wired: **CUS**, **CRQ**, **QUO** (PUR/SPK enum present; entity wiring deferred)

## Out of scope

- Domain create flows (Customer/CRQ/Quotation API)
- PurchaseOrder, WorkOrder numbering changes
- Certificate, Invoice, CreditNote numbering migration

## Architecture

Single reusable service in `@medcal/db`:

```typescript
DocumentNumberService.allocate({
  companyId,
  documentType,
  issuedAt,
  tx,
});
```

- Prefix mapping fixed in `DOCUMENT_TYPE_PREFIX` (not configurable per company)
- Sequence partition key: `(companyId, documentType, year)` — **no month in key**
- Month in output comes from `issuedAt` (UTC) only
- Atomic allocation: PostgreSQL `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`
- Callers must pass Prisma transaction client so allocation + document insert share one transaction

## Migration safety

Migration `20260823133000_add_document_numbering`:

1. Adds nullable `number` columns first
2. Creates unique indexes on `(companyId, number)`
3. Sets `NOT NULL` only when target table has **zero rows** (preserves any legacy rows untouched)

## Tests

- `packages/db/src/document-number/format-document-number.test.ts` — format unit tests
- `packages/db/src/document-number/document-number.service.test.ts` — DB integration (year reset, month transition, tenant isolation, concurrency)

Run: `pnpm --filter @medcal/db test`
