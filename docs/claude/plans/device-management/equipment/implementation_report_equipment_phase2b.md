# Phase 2B Implementation — Equipment Calibration Record + Evidence

**Date:** 2026-08-29
**Author:** afriza.hrp@gmail.com (via Claude Code)
**Source brief:** "MEDCAL — Phase 2B Implementation / Equipment Calibration Record + Evidence"
**Builds on:** Phase 2A (`Equipment` master), Generic File Infrastructure Phase 1
(`FilesModule` + `FileObject` metadata + `FileOwnerType.EQUIPMENT_CALIBRATION`), Phase 2B audit.
**Status:** ✅ IMPLEMENTED & VERIFIED against the local dev DB (`localhost:5432/pkmdb`).

> ### Explicit scope confirmation
> **WorkOrder / CalibrationJob integration was NOT implemented.** No `WorkOrderEquipment`,
> no `JobReferenceEquipmentUsed.equipmentId`, no `CalibrationJob` application layer, no
> job-level validity check, no fit-for-use blocking, no scheduling / conflict detection.
> `Equipment` / `EquipmentType` / `JobReferenceEquipmentUsed` / `WorkOrder` were **not
> modified** (only new back-relation fields added to `Equipment`, `Company`, `User`). No new
> file-storage system, no second certificate/document system — the existing `FilesModule`
> is reused. No RBAC architecture change; one new resource added by the existing convention.

---

## 1. Implementation summary

```
Equipment
  └─ EquipmentCalibrationRecord[]            ← NEW (append-only calibration events)
       ├─ calibration data   calibrationDate, validFrom?, validUntil, certificateNumber?, provider?, result?, remarks?
       ├─ acceptance         acceptedForUse, acceptedByUserId?, acceptedAt?, acceptanceNotes?   (WHO / WHEN / DECISION / NOTES)
       ├─ lifecycle          status DRAFT → CONFIRMED   (CONFIRMED = locked: no edit, no delete, evidence immutable)
       └─ FileObject[]       certificate PDF(s) via the generic FilesModule
                             (ownerType = EQUIPMENT_CALIBRATION, ownerId = record id)

Calibration validity = DERIVED from CONFIRMED records for an explicit date
   (resolveCalibrationValidity → VALID | EXPIRED | NOT_YET_VALID | NO_RECORD)
   — there is NO Equipment.calibrationDueDate / calibrationStatus source-of-truth field.
```

- 1 additive Prisma migration: `EquipmentCalibrationRecord` table + `EquipmentCalibrationRecordStatus` enum + 4 FKs. Nothing existing touched.
- New API module `equipment-calibration-records` — CRUD, company-scoped through `Equipment`, reusing `CompanyRoleGuard` + `@RequirePermission` + `@CompanyId()`.
- New RBAC resource `equipmentCalibrationRecord` (`read/create/update/delete`), ADMIN-seeded, 4 `GET /me` capability flags.
- `EQUIPMENT_CALIBRATION` `FileOwnerPolicy` registered with the existing `FilesModule` (`resolveOwner` → record exists + `locked = status === CONFIRMED`; PDF-only, 10 MB; file auth = `equipmentCalibrationRecord` permission).
- Portal: a **Calibration Records** panel on the Equipment Unit detail page — validity banner, records table, add/edit-DRAFT form (Calibration Data / Acceptance / Evidence sections), confirm (lock), certificate upload/download/delete through `FilesModule`.

---

## 2. Data model

`packages/db/prisma/schema.prisma`:

```prisma
enum EquipmentCalibrationRecordStatus { DRAFT  CONFIRMED }

model EquipmentCalibrationRecord {
  id                String  @id @default(cuid())
  companyId         String                       // denormalised (matches Certificate/JobEvidence); FK cascade
  equipmentId       String                       // FK → Equipment, ON DELETE CASCADE
  calibrationDate   DateTime @db.Date            // the event date — ordering key for validity
  validFrom         DateTime? @db.Date           // interval start; = calibrationDate when null
  validUntil        DateTime  @db.Date           // the validity gate
  certificateNumber String?
  provider          String?                      // free-text lab name (no CalibrationProvider entity)
  result            String?                      // lab outcome — FREE TEXT (vocabulary is an open decision, §16)
  remarks           String?
  acceptedForUse    Boolean  @default(false)     // MEDCAL's decision — NOT derived from `result`
  acceptedByUserId  String?                      // FK → User, ON DELETE SET NULL
  acceptedAt        DateTime?
  acceptanceNotes   String?
  status            EquipmentCalibrationRecordStatus @default(DRAFT)
  createdByUserId   String?                      // FK → User, ON DELETE SET NULL
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  // relations: company, equipment, acceptedBy, createdBy
  @@index([equipmentId, calibrationDate])
  @@index([equipmentId, validUntil])
  @@index([companyId, status])
}
```

Back-relations added (no column change): `Equipment.calibrationRecords`,
`Company.equipmentCalibrationRecords`, `User.equipmentCalibrationsCreated` /
`equipmentCalibrationsAccepted`.

Field decisions vs the audit's recommended list:
- `result` kept as **nullable free text** (not an enum). The audit and the brief both flag
  the controlled vocabulary as an OPEN business decision — a `String?` is structured storage
  (a column, queryable) without inventing `PASS`/`CONDITIONAL`/`FAIL` prematurely.
- `createdByUserId` included — consistent with `Menu` / `RolePermission`, and appropriate
  for audit evidence.
- No cache column on `Equipment` (`currentCalibrationValidUntil` etc.) — deferred; the
  detail-page panel calls the list endpoint which returns the derived validity in one call,
  so there is no N+1 to optimise yet.

---

## 3. Calibration record lifecycle

`DRAFT → CONFIRMED` (via `PATCH { status: "CONFIRMED" }`; `CONFIRMED → *` is rejected).

| | DRAFT | CONFIRMED |
|---|---|---|
| Edit any field | ✅ | ❌ `409 EQUIPMENT_CALIBRATION_RECORD_LOCKED` |
| Delete | ✅ (only if it has no attached files) | ❌ `409 EQUIPMENT_CALIBRATION_RECORD_LOCKED` |
| Attach / replace / delete certificate | ✅ | ❌ (`FilesModule` → `409 FILE_OWNER_LOCKED` via the policy's `locked`) |
| Counts toward derived validity | ❌ (provisional) | ✅ |

Corrections after CONFIRMED = a **new record**, never an edit. No admin override was
invented (none exists in the repo's RBAC beyond SUPERADMIN's unconditional `hasPermission`
bypass, which still hits the same `LOCKED` service guard). A DRAFT record with attached
files must have the files removed (through `FilesModule`) before it can be deleted —
`409 EQUIPMENT_CALIBRATION_RECORD_HAS_FILES` — so the polymorphic `FileObject.ownerId`
(no DB cascade) never orphans bytes.

---

## 4. Calibration validity (derived)

`apps/api/src/modules/equipment-calibration-records/calibration-validity.ts` — a **pure
function** `resolveCalibrationValidity(records, asOf)`:

1. Consider **CONFIRMED** records only (`DRAFT` is provisional → does not establish validity).
2. `intervalStart(r) = r.validFrom ?? r.calibrationDate`.
3. `covering = confirmed where intervalStart ≤ asOf ≤ validUntil` → **VALID**, applicable
   record = the one with the latest `calibrationDate` among the covering set.
4. else no calibration had started by `asOf` → **NOT_YET_VALID**.
5. else a past calibration exists but has lapsed → **EXPIRED**.
6. no confirmed records → **NO_RECORD**.

Overlapping validity windows are handled (any covering record satisfies VALID; the most
recent one is reported). The function is **not** wired to `CalibrationJob` / `WorkOrder` —
it takes an explicit `asOf` date, per the brief (the authoritative "equipment use date" is
an open business decision).

`EquipmentCalibrationRecordsService.getValidity(companyId, equipmentId, asOf)` loads the
records and calls the pure function. `listForEquipment(...)` returns the records **plus**
`validity` computed as of `now()` for the UI.

---

## 5. Acceptance decision

`acceptedForUse` / `acceptedByUserId` / `acceptedAt` / `acceptanceNotes` on the record —
a human decision, distinct from `result`, never auto-derived. When `acceptedForUse` flips
to `true` (on create or update) the service stamps `acceptedByUserId = session user` and
`acceptedAt = now()`; flipping to `false` clears both. `acceptanceNotes` is free text.
No separate `EquipmentVerificationRecord`, no approval workflow — reuses the authenticated
session identity + RBAC.

Tested: `result = "PASS"` with `acceptedForUse = false` persists both independently; a later
`acceptedForUse: true` records who/when without changing `result`.

---

## 6. Evidence integration

Certificate PDFs use the **existing generic `FilesModule`** — no new upload/download code.
- Upload: `POST /files` (multipart) with `ownerType=EQUIPMENT_CALIBRATION`, `ownerId=<recordId>`.
- Download: `GET /files/:id` → `StreamableFile`.
- Delete: `DELETE /files/:id` (DRAFT owner only — the policy's `locked` blocks CONFIRMED).
- List: the calibration-record service queries
  `FileObject where { companyId, ownerType: "EQUIPMENT_CALIBRATION", ownerId }` (served by
  the existing `@@index([companyId, ownerType, ownerId])`) and returns a `documents[]` array
  on each record — **no `FilesModule` change**, no typed Prisma relation (ownerId is
  polymorphic).

The structured `EquipmentCalibrationRecord` remains authoritative for calibration date,
validity, certificate number, provider, result, and acceptance. The PDF is supporting
evidence — never parsed. A CONFIRMED record with zero attached files is still valid
evidence ("certificate pending upload" is legitimate — see §16).

Certificate mandatory-before-CONFIRMED? **Not enforced** (smallest safe implementation;
flagged as an open business decision, §16).

---

## 7. FileOwnerPolicy

`apps/api/src/modules/equipment-calibration-records/equipment-calibration-file-owner-policy.ts`
— `equipmentCalibrationFileOwnerPolicy`:

```
ownerType:          "EQUIPMENT_CALIBRATION"
permissionResource: "equipmentCalibrationRecord"   // file auth reuses the owner's permission — no file:* grant
readAction:         "read"
writeAction:        "update"
fileTypePolicy:     { mimeTypes: ["application/pdf"], extensions: [".pdf"], maxBytes: 10 MiB }
resolveOwner(companyId, ownerId):
    record = prisma.equipmentCalibrationRecord.findFirst({ where: { id: ownerId, companyId } })
    → { exists: !!record, locked: record?.status === "CONFIRMED" }
```

Registered with the exported `FileOwnerPolicyRegistry` in
`EquipmentCalibrationRecordsModule.onModuleInit()`. Company scoping (`where: { companyId }`)
is inside `resolveOwner`, so a cross-company file id resolves to `exists: false` → 404.
The `FilesModule` and its registry ship unchanged; this is the first (and currently only)
registered policy.

---

## 8. API

New module, all routes `@UseGuards(CompanyRoleGuard)` + `@RequirePermission("equipmentCalibrationRecord", …)` + `@CompanyId()`:

| Method | Route | Action | Notes |
|---|---|---|---|
| GET | `/equipment/:equipmentId/calibration-records` | `read` | `{ data: record[] (each with `documents[]`, `acceptedBy`, `createdBy`), validity }` — newest `calibrationDate` first |
| POST | `/equipment/:equipmentId/calibration-records` | `create` | creates a `DRAFT`; Zod-validated; `404 EQUIPMENT_NOT_FOUND` if the unit isn't in the company |
| GET | `/equipment-calibration-records/:id` | `read` | one record + documents |
| PATCH | `/equipment-calibration-records/:id` | `update` | edit DRAFT fields, toggle acceptance, or `status: "CONFIRMED"`; `409 LOCKED` if already CONFIRMED; `409 INVALID_CALIBRATION_VALIDITY_WINDOW` if start > validUntil |
| DELETE | `/equipment-calibration-records/:id` | `delete` | DRAFT only; `409 LOCKED` if CONFIRMED; `409 …_HAS_FILES` if evidence still attached |

Zod schemas in `packages/shared` (`equipmentCalibrationRecordCreateSchema` /
`…UpdateSchema`, `EQUIPMENT_CALIBRATION_RECORD_STATUSES`): dates via `z.coerce.date()`,
create-schema `superRefine` rejects `validFrom/calibrationDate > validUntil`; the service
re-validates the same window on create and update (calls bypassing Zod are still safe).
Validity is an internal service method (`getValidity`) surfaced through the list endpoint —
no dedicated validity route.

---

## 9. RBAC

- `packages/auth/src/access-control.ts`: `equipmentCalibrationRecord: ["read","create","update","delete"]` added to the catalog.
- `packages/db/prisma/seed-role-permissions.ts`: ADMIN granted all 4 (SUPERADMIN bypasses). Re-seeded → **105** `RolePermission` rows.
- `packages/auth/src/me-types.ts` + `apps/api/src/modules/me/me.controller.ts`: 4 new
  `equipmentCalibrationRecord*` capability flags on `GET /me`.
- No existing role/permission/guard/middleware changed. File access has **no** dedicated
  permission — it reuses `equipmentCalibrationRecord` via the FileOwnerPolicy.

---

## 10. UI

`apps/portal/src/app/management/equipment-units/`:
- **`equipment-calibration-records-panel.tsx`** (new) — rendered on the Equipment Unit
  detail page (`[id]/page.tsx`, view mode only), below the unit details:
  - **Validity banner**: `VALID` (green, "berlaku s/d …") / `EXPIRED` (red) /
    `BELUM BERLAKU` (amber) / `TIDAK ADA RECORD KALIBRASI` (grey), with the note
    "Dihitung dari record kalibrasi CONFIRMED". Equipment with no confirmed record shows
    the neutral "no record" state, never `VALID`.
  - **Records table**: `Tanggal | Berlaku s/d | Sertifikat | Hasil | Diterima | Status | N file`.
    Row click expands an inline detail/edit panel.
  - **Detail/edit panel** — three visually separate sections (§12): **Data Kalibrasi**
    (dates, cert no., provider, result, remarks), **Penerimaan** (acceptedForUse checkbox +
    who/when shown + notes), **Evidence — Sertifikat** (attached PDFs with Unduh / Hapus,
    upload button). DRAFT → editable + "Simpan draft" / "Konfirmasi (lock)" / "Hapus".
    CONFIRMED → fully read-only with "Record CONFIRMED — evidence historis, terkunci".
  - **"Tambah"** → a create form (same three sections) that saves a `DRAFT`.
- **`use-equipment-calibration-records-query.ts`** (new) — TanStack Query hooks: list,
  create, update, delete, certificate upload (raw `fetch` + `FormData` — `apiFetch` forces
  JSON), certificate delete, and a `downloadCalibrationCertificate` blob helper (reuses
  `apiFetchBlob`).
- Panel gated on `capabilities.equipmentCalibrationRecordRead`; mutating actions gated on
  `create && update && delete`.

Reuses existing primitives (`Surface`, `Button`, `Input`, `Badge`, `selectClassName`,
lucide icons). No new dashboard, no new pagination mechanism.

---

## 11. Migration

`packages/db/prisma/migrations/20260829060000_add_equipment_calibration_record/migration.sql`
— `CREATE TYPE "EquipmentCalibrationRecordStatus"`, `CREATE TABLE "EquipmentCalibrationRecord"`,
3 indexes, 4 FKs (`companyId`→Company cascade, `equipmentId`→Equipment cascade,
`acceptedByUserId`/`createdByUserId`→User set-null). **Additive only** — no existing
table/column/type touched, no data modified, no `ALTER TYPE ... ADD VALUE` needed (the
`EQUIPMENT_CALIBRATION` `FileOwnerType` value already exists from File Infra Phase 1).

Applied to the local dev DB (`localhost:5432/pkmdb`) via `prisma migrate deploy` — clean,
`prisma migrate status` → "up to date", `SELECT count(*) FROM "EquipmentCalibrationRecord"`
succeeds. DB inspection found **no pre-existing `EquipmentCalibrationRecord` rows** (as the
audit predicted). Production not touched.

---

## 12. Tests

`apps/api/src/modules/equipment-calibration-records/`:

- **`calibration-validity.test.ts`** (9, pure — no DB): NO_RECORD (empty + DRAFT-only),
  VALID inside interval, VALID on `calibrationDate` boundary (inclusive), VALID on
  `validUntil` boundary (inclusive), `validFrom` used as interval start (D<validFrom →
  NOT_YET_VALID, D=validFrom → VALID), EXPIRED (D>validUntil), NOT_YET_VALID (D before
  earliest), most-recent covering record wins on overlap, resolves to the last applicable
  record when the latest has lapsed.
- **`equipment-calibration-records.service.test.ts`** (8, real DB): create DRAFT → update →
  confirm; CONFIRMED locks update **and** delete; delete a DRAFT; reject an inverted
  validity window; acceptance records who/when and keeps `result` independent, and revoking
  clears who/when; derived validity VALID / EXPIRED / NO_RECORD (incl. DRAFT-doesn't-count);
  company isolation — cross-company `findOne`/`update`/`remove` → 404, and creating a record
  for another company's equipment via this company → 404; `equipmentCalibrationFileOwnerPolicy.resolveOwner`
  returns `exists`/`locked` correctly and is company-scoped, with the right
  `permissionResource` + PDF allow-list.

Result: **17/17 pass** in isolation and in a 96/96 targeted regression run
(`equipment-calibration-records`, `equipment`, `files`, `me`, `permissions`, `menu`,
`devices`).

RBAC coverage: `@RequirePermission` on every route + the FileOwnerPolicy's `hasPermission`
gate are exercised by the `files.service.test.ts` suite (a caller without the owner's write
permission is rejected) and the policy test; the calibration-record controller uses the
identical decorator pattern as every other module.

---

## 13. Verification

| Check | Result |
|---|---|
| `prisma validate` | ✅ |
| `prisma generate` | ✅ (Windows engine-binary rename hit a benign `EPERM` from a running dev process — same version; TS client regenerated & verified: `EquipmentCalibrationRecordGetPayload`, `EquipmentCalibrationRecordStatus`) |
| `prisma migrate deploy` (local `pkmdb`) | ✅ applied; `migrate status` up to date; table empty; nothing else touched |
| `seed:role-permissions` re-run | ✅ 105 rows upserted |
| `pnpm --filter @medcal/shared typecheck` | ✅ |
| `pnpm --filter @medcal/auth typecheck` | ✅ |
| `pnpm --filter @medcal/api typecheck` | ✅ |
| `pnpm --filter @medcal/portal typecheck` | ✅ |
| `pnpm --filter @medcal/api build` (`tsc -p`) | ✅ |
| `pnpm --filter @medcal/portal build` (Next.js) | ✅ Compiled successfully; `/management/equipment-units/[id]` renders |
| `vitest run src/modules/equipment-calibration-records` | ✅ 17/17 |
| targeted regression (7 modules, 96 tests) | ✅ 96/96 |
| `@medcal/auth` tests | ✅ 47/47 |
| `@medcal/shared` tests | ✅ 21/21 |
| `@medcal/db` tests | ✅ 14/14 |
| full `@medcal/api` vitest | 635 pass / **12 fail** — all pre-existing & unrelated (see below) |

**Pre-existing failures (confirmed unrelated to this work):**
`emails/imap-sync.service.test.ts` (5 — IMAP credential-dependent),
`push-tokens/notification-dispatch.service.test.ts` (2) +
`contact-messages/contact-messages.push.test.ts` (1) — stale local `@medcal/notifications`
build (`push.resolvePushIconUrl is not a function`),
`contact-messages/contact-messages.lead-matching.test.ts` (3 + 1 suite-level) — **verified
failing on `HEAD` with this work `git stash`ed** (flaky phone/organization normalization),
`chat/chat.gateway.security.test.ts` (1 — Socket.IO room-isolation, flaky under parallel
load). My modules do not appear in the failure list; `calibration-requests` & `quotations`
(which a mid-run showed as polluted) each pass **100% in isolation**.

---

## 14. Known limitations

1. **No `Equipment`-list validity indicator** — validity is shown on the *detail* page
   panel only. A per-row column on the Equipment Units list would need a batch endpoint or
   a cached column on `Equipment` (deliberately deferred, §2).
2. **`result` is free text** — no controlled vocabulary yet (open decision §16).
3. **Certificate not required for CONFIRMED** — a record can be confirmed with zero
   attached files (smallest safe behaviour; open decision §16).
4. **DRAFT records with files can't be deleted** until the files are removed via the
   `FilesModule` — there is no "delete record and cascade its files" convenience (the
   polymorphic `FileObject.ownerId` has no DB cascade; a small orphan sweep was deferred by
   the File Infra Phase 1 audit).
5. **No admin override** for editing a CONFIRMED record — by design; corrections use a new
   record.
6. **Validity uses `now()` in the UI** — the panel cannot yet evaluate validity "as of a
   job date" because that date concept does not exist (Phase 2B boundary).
7. The generic `FilesModule` still has **no "list files for owner" endpoint** — the
   calibration-record service queries `FileObject` directly instead (no `FilesModule`
   change, per the brief).

---

## 15. Deferred scope (NOT implemented)

`WorkOrderEquipment`; `JobReferenceEquipmentUsed.equipmentId` + immutable snapshot;
`CalibrationJob` application layer / job-completion flow; the fit-for-use composite gate;
job-level validity warning/block; scheduling / conflict detection; Technician App; Surat
Jalan; `EquipmentVerificationRecord` / intermediate checks; `EquipmentServiceEvent` /
defect / out-of-service / repair history; rich `Equipment` status enum; parameter-level
suitability (`DeviceCalibrationParameter → EquipmentType`); measurement-uncertainty /
correction-factor engines; `CalibrationProvider` entity; calibration recall reminders;
certificate generation; generic audit-log; MinIO/S3 storage; a cached
`Equipment.currentCalibrationValidUntil`; production deployment.

---

## 16. Open business decisions (documented, NOT silently resolved)

| # | Decision | Current implementation |
|---|---|---|
| 1 | Authoritative "equipment use date" for job-level validity | Not chosen. `resolveCalibrationValidity` takes an explicit `asOf`; not wired to any job. |
| 2 | `validFrom` semantics | Optional; defaults to `calibrationDate`; interval is **inclusive** of both ends; `validFrom ≤ validUntil` enforced. No grace period. |
| 3 | `validUntil` semantics | Required; the validity gate; inclusive. MEDCAL enters it (no per-EquipmentType interval rule, no lab-override concept). |
| 4 | Certificate mandatory before CONFIRMED | **Not enforced** — a record may confirm with 0 files. |
| 5 | Calibration `result` vocabulary | **Free text** — no enum. |
| 6 | Handling failed / out-of-tolerance calibration | Only `result` free text + `remarks` + `acceptedForUse = false`. No as-found/as-left, no adjustment record, no reverse-traceability. |
| 7 | Acceptance authority | Any caller with `equipmentCalibrationRecord:update` (ADMIN by seed). No dedicated acceptance role/step. |
| 8 | Evidence retention period / who may delete | DRAFT: `equipmentCalibrationRecord:delete`. CONFIRMED: nobody (locked). No retention timer. |
| 9 | Defect / out-of-service process | Not modelled (deferred). |
| 10 | Intermediate checks | Not modelled (deferred). |
| 11 | Parameter-level suitability | Not modelled (deferred). |

---

## 17. Files changed

**New:**
```
apps/api/src/modules/equipment-calibration-records/calibration-validity.ts
apps/api/src/modules/equipment-calibration-records/calibration-validity.test.ts
apps/api/src/modules/equipment-calibration-records/equipment-calibration-records.service.ts
apps/api/src/modules/equipment-calibration-records/equipment-calibration-records.service.test.ts
apps/api/src/modules/equipment-calibration-records/equipment-calibration-records.controller.ts
apps/api/src/modules/equipment-calibration-records/equipment-calibration-records.module.ts
apps/api/src/modules/equipment-calibration-records/equipment-calibration-file-owner-policy.ts
apps/portal/src/app/management/equipment-units/equipment-calibration-records-panel.tsx
apps/portal/src/app/management/equipment-units/use-equipment-calibration-records-query.ts
packages/db/prisma/migrations/20260829060000_add_equipment_calibration_record/migration.sql
docs/claude/plans/device-management/equipment/implementation_report_equipment_phase2b.md
```

**Modified:**
```
packages/db/prisma/schema.prisma                 EquipmentCalibrationRecord + enum; back-relations on Equipment / Company / User
packages/shared/src/schemas/index.ts             equipmentCalibrationRecord create/update Zod schemas + types + status list
packages/auth/src/access-control.ts              + equipmentCalibrationRecord resource
packages/auth/src/me-types.ts                    + 4 capability flags
packages/db/prisma/seed-role-permissions.ts      + 4 ADMIN grants
apps/api/src/modules/me/me.controller.ts         + 4 hasPermission() lines
apps/api/src/app.module.ts                       register EquipmentCalibrationRecordsModule
apps/portal/src/app/management/equipment-units/[id]/page.tsx   render the Calibration Records panel (view mode)
```

Not modified: `Equipment` / `EquipmentType` / `DeviceTypeEquipmentRequirement` services &
controllers, `JobReferenceEquipmentUsed`, `CalibrationJob`, `WorkOrder`, the `FilesModule`,
any RBAC guard.

---

## 18. Final architectural check

- `Equipment → EquipmentCalibrationRecord[] → { structured evidence, acceptance decision, FileObject → certificate PDF }` ✅
- Calibration validity = **derived** from CONFIRMED records; **no** `Equipment.calibrationDueDate` ✅
- Fit-for-use = **not** implemented as a composite status ✅
- Parameter suitability = **not** implemented ✅
- WorkOrder / CalibrationJob integration = **not** implemented ✅
