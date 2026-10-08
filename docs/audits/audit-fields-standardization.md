# Update-Audit Fields Standardization (updatedAt / updatedByUserId)

Date: 2026-10-04. Scope: all 90 Prisma models, API write paths, migration `20261007000000_add_updated_by_audit_fields`.

## 1. Executive Summary

- Before: 6 models had `updatedAt` + `updatedByUserId` (set by hand in services), 48 more had `updatedAt` only, 4 mutable item tables had neither, and 32 models were never meant to be actor-audited.
- The task assumed an existing Prisma hook / actor context. **None existed**: no `$extends`, no `$use`, no AsyncLocalStorage. The only mechanism was manual `updatedByUserId: userId` in a handful of services. A new single mechanism was approved explicitly, because the manual convention would have meant editing ~158 write sites and every service signature.
- After: **58 models** carry `updatedAt` + nullable `updatedByUserId` (FK to User). **32 models** are intentionally excluded (section 6). A test fails if any model is neither audited nor on the exclusion list.
- One mechanism: `CompanyRoleGuard` sets `request.userId` -> `ActorContextInterceptor` binds it in AsyncLocalStorage -> a Prisma extension stamps `updatedByUserId` on every update. `updatedAt` stays on Prisma `@updatedAt`.

## 2. Audit Rules / Applicability Criteria

A model gets `updatedAt` + `updatedByUserId` when it is **mutable business or master data that an authenticated staff actor can change in place** (update / updateMany / upsert / nested update).

A model is excluded when:
1. It is immutable or append-only (histories, logs, evidence, signatures, snapshots).
2. It is a create/delete-only child or junction row.
3. It is a system-owned counter or library-managed infrastructure (Better Auth, sequences, push tokens).
4. It holds public/anonymous inbound data with no authenticated actor (chat).
5. It already carries its own lifecycle actor fields (EmailWhitelist: createdBy / revokedBy).

Conventions reused from the six already-compliant models: `updatedByUserId String?`, relation `updatedBy User?` (relation name `<Model>UpdatedBy`), default onDelete (SetNull), `updatedAt DateTime @updatedAt`. No index on `updatedByUserId`: the project is split (Menu / RolePermission have none; CalibrationRequest, Certificate, Invoice, Payment do) and nothing queries by updater.

## 3. Complete Model Inventory

Class 1 = already compliant, 2 = had `updatedAt` only, 3 = had neither, 4 = excluded.

| Model | updatedAt before | updatedBy before | updatedAt after | updatedBy after | Class |
|---|---|---|---|---|---|
| Company | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| DocumentNumberSequence | Y | N | Y | N | 4 Excluded: system counter |
| MasterCodeSequence | Y | N | Y | N | 4 Excluded: system counter |
| User | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| Session | Y | N | Y | N | 4 Excluded: auth infrastructure |
| Account | Y | N | Y | N | 4 Excluded: auth infrastructure |
| Verification | Y | N | Y | N | 4 Excluded: auth infrastructure |
| UserMembership | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| Menu | Y | Y | Y | Y | 1 Compliant (pre-existing) |
| RolePermission | Y | Y | Y | Y | 1 Compliant (pre-existing) |
| EmailWhitelist | N | N | N | N | 4 Excluded: carries its own createdBy/revokedBy lifecycle fields |
| CustomerUserLink | N | N | N | N | 4 Excluded: junction row (upsert only) |
| FCMToken | Y | N | Y | N | 4 Excluded: device push token, self-managed |
| ContactMessage | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| ContactTopic | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| Uom | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| Lead | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| ChatSession | Y | N | Y | N | 4 Excluded: public chat, no authenticated actor |
| ChatMessage | N | N | N | N | 4 Excluded: append-only chat log |
| Email | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| Customer | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| CustomerContact | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| DeviceCategory | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| DeviceType | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| DeviceTypeAlias | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| EquipmentType | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| Equipment | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| EquipmentCalibrationRecord | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| DeviceTypeEquipmentRequirement | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| DeviceManufacturer | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| DeviceModel | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| DeviceCapability | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| DeviceCapabilityItem | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| DeviceCalibrationParameter | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| DeviceTypeCapabilityOrder | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| DevicePhysicalCheckItem | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| Device | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| CalibrationRequest | Y | Y | Y | Y | 1 Compliant (pre-existing) |
| CalibrationRequestItem | N | N | Y | Y | 3 Neither -> added both |
| ServiceTariff | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| PriceListItem | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| Quotation | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| QuotationItem | N | N | Y | Y | 3 Neither -> added both |
| PurchaseOrder | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| PurchaseOrderItem | N | N | Y | Y | 3 Neither -> added both |
| WorkOrder | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| SpkParent | N | N | N | N | 4 Excluded: create-only grouping row |
| WorkOrderItem | N | N | N | N | 4 Excluded: immutable allocation snapshot |
| PurchaseOrderItemAllocation | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| WorkOrderItemAccessory | N | N | N | N | 4 Excluded: create/delete only |
| CalibrationRequestHistory | N | N | N | N | 4 Excluded: immutable history |
| CalibrationRequestItemHistory | N | N | N | N | 4 Excluded: immutable history |
| QuotationHistory | N | N | N | N | 4 Excluded: immutable history |
| QuotationItemHistory | N | N | N | N | 4 Excluded: immutable history |
| PurchaseOrderHistory | N | N | N | N | 4 Excluded: immutable history |
| PurchaseOrderItemHistory | N | N | N | N | 4 Excluded: immutable history |
| WorkOrderHistory | N | N | N | N | 4 Excluded: immutable history |
| WorkOrderItemHistory | N | N | N | N | 4 Excluded: immutable history |
| WorkOrderAssignment | N | N | N | N | 4 Excluded: create/delete only |
| WorkOrderEquipment | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| EquipmentDeliveryNote | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| EquipmentDeliveryNoteItem | N | N | N | N | 4 Excluded: create/delete only |
| CalibrationJob | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| KontrolAlat | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| KontrolAlatAccessory | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| KontrolAlatSignature | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| CalibrationTestPoint | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| JobCalibrationTestPoint | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| MeasurementResult | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| PhysicalCheckResult | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| JobEvidence | N | N | N | N | 4 Excluded: append-only evidence |
| JobReferenceEquipmentUsed | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| JobReferenceEquipmentApproval | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| JobReferenceEquipmentApprovalItem | N | N | Y | Y | 3 Neither -> added both |
| CustomerSignature | N | N | N | N | 4 Excluded: append-only signature |
| IdentityCorrection | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| IdentityCorrectionSignature | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| QualityReview | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| Certificate | Y | Y | Y | Y | 1 Compliant (pre-existing) |
| Tax | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| Invoice | Y | Y | Y | Y | 1 Compliant (pre-existing) |
| InvoiceCertificate | N | N | N | N | 4 Excluded: junction row |
| InvoiceItem | N | N | N | N | 4 Excluded: create/delete only |
| Payment | Y | Y | Y | Y | 1 Compliant (pre-existing) |
| CreditNote | Y | N | Y | Y | 2 updatedAt only -> added updatedByUserId |
| ReminderEvent | Y | N | Y | N | 4 Excluded: system-generated |
| FileObject | Y | N | Y | N | 4 Excluded: immutable blob metadata |
| AuditLog | N | N | N | N | 4 Excluded: append-only log |
| CustomerFeedback | N | N | N | N | 4 Excluded: append-only submission |
| LkDownloadAuthorization | N | N | N | N | 4 Excluded: single-use token state |


Counts: class 1 = 6, class 2 = 48, class 3 = 4, class 4 = 32 (total 90).

## 4. Models Already Compliant

Menu, RolePermission, CalibrationRequest, Certificate, Invoice, Payment. They set `updatedByUserId` explicitly in services. Those assignments are **kept**: an explicit value always wins over the context actor, so they are redundant but harmless, and removing them would only churn mock-based tests. New code should not add them.

## 5. Models Missing updatedAt / updatedByUserId

52 models changed.

- **Added `updatedByUserId` only (48):** Company, User, UserMembership, Uom, Lead, ContactMessage, ContactTopic, Email, Customer, CustomerContact, DeviceCategory, DeviceType, DeviceTypeAlias, EquipmentType, Equipment, EquipmentCalibrationRecord, DeviceTypeEquipmentRequirement, DeviceManufacturer, DeviceModel, DeviceCapability, DeviceCapabilityItem, DeviceCalibrationParameter, DeviceTypeCapabilityOrder, DevicePhysicalCheckItem, Device, ServiceTariff, PriceListItem, Quotation, PurchaseOrder, WorkOrder, PurchaseOrderItemAllocation, WorkOrderEquipment, EquipmentDeliveryNote, CalibrationJob, KontrolAlat, KontrolAlatAccessory, KontrolAlatSignature, CalibrationTestPoint, JobCalibrationTestPoint, MeasurementResult, PhysicalCheckResult, JobReferenceEquipmentUsed, JobReferenceEquipmentApproval, IdentityCorrection, IdentityCorrectionSignature, QualityReview, Tax, CreditNote.
- **Added both `updatedAt` and `updatedByUserId` (4):** CalibrationRequestItem, QuotationItem, PurchaseOrderItem, JobReferenceEquipmentApprovalItem. Each has direct `update` call sites in services and had no `updatedAt`.

## 6. Models Intentionally Excluded and Why

| Model | Reason |
|---|---|
| Session, Account, Verification | Better Auth infrastructure |
| FCMToken | device push token, self-managed |
| DocumentNumberSequence, MasterCodeSequence | system counters (raw-SQL updated) |
| EmailWhitelist | has its own createdBy / revokedBy lifecycle fields |
| CustomerUserLink | junction row (upsert only) |
| ChatSession, ChatMessage | public chat, no authenticated actor / append-only |
| CalibrationRequestHistory, CalibrationRequestItemHistory, QuotationHistory, QuotationItemHistory, PurchaseOrderHistory, PurchaseOrderItemHistory, WorkOrderHistory, WorkOrderItemHistory | immutable revision history |
| WorkOrderAssignment, WorkOrderItemAccessory, EquipmentDeliveryNoteItem, InvoiceItem | create/delete only |
| WorkOrderItem | immutable allocation snapshot, no update path |
| SpkParent | create-only grouping row |
| JobEvidence, CustomerSignature | append-only evidence / signature |
| InvoiceCertificate | junction row |
| ReminderEvent | system-generated |
| FileObject | immutable blob metadata |
| AuditLog | append-only log |
| CustomerFeedback | append-only submission |
| LkDownloadAuthorization | single-use token state (updated once on use) |

Judgment calls worth a second look: LkDownloadAuthorization (excluded as token state although updated in a transaction on use) and UserMembership (audited because admins change roles).

## 7. Existing Audit Mechanism (before this change)

- `updatedAt`: Prisma `@updatedAt` (covers update, updateMany, upsert, nested update).
- `updatedByUserId`: manual, 6 models only, assigned inside service methods (calibration-requests, certificate, menu, permissions). The actor came from `request.userId` via `@UserId()`, set by `CompanyRoleGuard`.
- No Prisma extension / middleware / ALS. No system-actor convention.

## 8. Query Hook / Extension Coverage

New: `packages/db/src/audit/updated-by-extension.ts` (Prisma client extension) and `actor-context.ts` (AsyncLocalStorage).

| Question | Answer |
|---|---|
| Models covered | every model that declares `updatedByUserId`, derived from `Prisma.dmmf`, so there is no second list to maintain |
| Operations | update, updateMany, updateManyAndReturn, upsert (update branch only) |
| Not touched | create, createMany, reads, deletes |
| Nested writes | nested `update`, `updateMany`, `upsert.update` on related audited models are stamped. Nested `create` / `connectOrCreate` are not |
| Checked vs unchecked input | if the caller's data already uses relation fields, the extension writes `updatedBy: { connect }` instead of the scalar, since Prisma rejects mixing them |
| Explicit value | an explicit `updatedByUserId` / `updatedBy` in the caller data wins |
| Interactive and batch `$transaction` | actor preserved (tested) |
| updateMany | stamped (tested) |
| Raw SQL | bypasses the extension (section 11) |
| Separate `new PrismaClient()` | bypasses the extension (12 files, all standalone scripts) |

Technical notes:
- Prisma queries are lazy and run on first `.then`. The interceptor subscribes the handler inside the ALS scope, so a service returning an un-awaited Prisma promise is still attributed (tested with rxjs `defer`, as Nest does). A Prisma promise created inside the scope but awaited outside it is not attributed.
- The exported `prisma` is typed as plain `PrismaClient` (cast after `$extends`): the extended-client type is not assignable to `PrismaClient` / `Prisma.TransactionClient`, which service helpers and tests use. The extension adds no models, fields or methods.

## 9. Service / Controller Changes

- `apps/api/src/common/interceptors/actor-context.interceptor.ts` (new): reads `request.userId` (set by `CompanyRoleGuard`, never client input) and runs the handler under `runWithActor`.
- `apps/api/src/app.module.ts`: registers it as a global `APP_INTERCEPTOR`.
- No service or controller signature changed.
- Controllers without `CompanyRoleGuard` (contact-messages, contact-topics, chat-sessions, certificate-verification, customer-portal) have no `request.userId` and run with no actor. The customer portal does no updates; the others are public.

## 10. Migration Changes

`packages/db/prisma/migrations/20261007000000_add_updated_by_audit_fields/migration.sql` (new; no existing migration touched):
- 52 x `ADD COLUMN "updatedByUserId" TEXT` + FK to `"User"("id")` `ON DELETE SET NULL ON UPDATE CASCADE`.
- 4 item tables: `ADD COLUMN "updatedAt"` nullable, `UPDATE ... SET "updatedAt" = "createdAt"`, then `SET NOT NULL`. This is the minimum needed to add a NOT NULL column to existing rows.
- `updatedByUserId` is NULL on all existing rows (actor unknown; deliberately not inferred from createdBy).
- Verified: applies cleanly to the test DB; `prisma migrate diff` against it shows no drift from this change (the only difference reported is a pre-existing, unrelated index rename on DeviceCalibrationParameter).
- `schema.prisma`: `prisma format` realigned columns in touched blocks, so the raw diff is larger than the semantic one (`git diff -w` is the readable view). The pre-existing uncommitted deviceId-lineage edits were left untouched.

## 11. Direct Database Mutation Paths Reviewed

- ~158 `update` / `updateMany` / `upsert` calls in `apps/api/src`: all use the shared `prisma` / `tx` from `@medcal/db`, so all pass through the extension.
- Raw SQL: `allocation.ts` and `shared-spk.service.ts` (`SELECT ... FOR UPDATE` locks, no mutation); `document-number.service.ts` / `master-code.service.ts` (sequence counters on excluded models). No raw mutation of an audited model.
- Standalone scripts that create their own `PrismaClient` (backfill-*, seeds, trial-minto-hardjo): system actor by nature. They bypass the extension and leave `updatedByUserId` untouched; `updatedAt` still moves.
- Better Auth writes use the shared client but run outside the interceptor scope, so no actor is stamped.
- `createMany`: never stamped, by design.

## 12. Test Coverage

`packages/db/src/audit/updated-by-extension.test.ts` (14 tests, real test DB):
- every model is audited or on the exclusion list; exclusions stay excluded; audited models have `updatedAt` and an `updatedBy` relation;
- update stamps actor and bumps `updatedAt`; different actors give different values; explicit value wins;
- no actor: `updatedAt` moves, `updatedByUserId` untouched (system convention);
- updateMany; upsert (create not stamped, update stamped);
- create and read do not stamp;
- interactive and batch transactions preserve the actor; concurrent actors are isolated;
- nested update (including the relation-form fallback); excluded-model update unchanged.

`apps/api/src/common/interceptors/actor-context.interceptor.test.ts` (4 tests): actor bound from `request.userId` with Nest-style lazy subscription; concurrent request isolation; unauthenticated route; non-http passthrough.

Gap: there is no dedicated revision-flow test. Revision flows call `tx.<model>.update` inside the same request scope, which the transaction tests exercise; the existing revision tests are covered by the full API suite run.

## 13. Remaining Risks / Exceptions

1. **No system actor.** There is no sentinel User; "no actor" leaves `updatedByUserId` as-is (NULL, or the previous human editor), while `updatedAt` moves. A system user would be a product decision, not made here.
2. **Redundant manual assignments** remain on the 6 pre-existing models (harmless; explicit wins).
3. **Bypasses:** raw SQL and separate `PrismaClient` instances skip the extension. Today these are only locks, counters and scripts.
4. **Creates and nested creates are not stamped** (by design; the creation actor is a createdBy concern).
5. **Public and customer-portal routes** run with no actor. If a customer-initiated mutation of an audited model is ever added, it needs an explicit actor.
6. **ALS scope:** a lazy Prisma promise awaited outside the scope loses attribution. Normal Nest handlers are safe (tested).
7. **Test environment quirk (pre-existing, unchanged):** `packages/db/.env` exists without `TEST_DATABASE_URL`, and the test guard stops at the first .env it loads, so vitest run directly in `packages/db` needs `TEST_DATABASE_URL` exported.
8. Exclusion judgment calls (LkDownloadAuthorization, UserMembership), section 6.

## 14. Final Standardized Architecture

```
Better Auth session
  -> CompanyRoleGuard          sets request.userId (session only, never client input)
  -> ActorContextInterceptor   runWithActor(userId, handler)        [AsyncLocalStorage]
  -> Service / $transaction    unchanged; calls prisma.x.update / updateMany / upsert
  -> Prisma updated-by ext.    stamps updatedByUserId (scalar or relation form, nested too)
  -> Prisma @updatedAt         stamps updatedAt
```

Rule for new models: if staff can mutate it, add `updatedAt @updatedAt`, `updatedByUserId String?`, the `updatedBy User?` relation (named `<Model>UpdatedBy`) and the back-relation on User; the extension picks it up automatically. If not, add it to the exclusion list in `updated-by-extension.test.ts` with a reason, or the test fails.

## 15. Final Verification (2026-10-04)

- `prisma validate` / `generate`: pass. `tsc --noEmit`: pass for `@medcal/db` and `@medcal/api`. `@medcal/api` build (`tsc -p`): pass.
- `@medcal/db` vitest: 6 files / 68 tests passed. `@medcal/auth` vitest: 2 files / 53 tests passed.
- `@medcal/api` full vitest: 73 files passed, 5 failed; 1621 tests passed, 10 failed, 0 skipped.
  - `certificate.service.test.ts` (5s timeout under full-suite load) and `chat-sessions.service.test.ts` (unreadCount) failed in the full run and **pass when run alone** (51/51 and 74/74).
  - 8 failures remain in files this change does not touch: `imap-sync.service.test.ts` (5, "IMAP is not configured"), `notification-dispatch.service.test.ts` (2, `push.resolvePushIconUrl is not a function`), `registration-origin-callers.test.ts` (1, static scan of `apps/tech-pwa/.../register/page.tsx`). They look environmental / pre-existing but were **not re-run on a clean baseline**.
