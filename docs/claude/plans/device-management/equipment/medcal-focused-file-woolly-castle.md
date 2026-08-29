# MEDCAL — File Infrastructure Architecture Audit (AUDIT ONLY)

> **This is an architecture audit. The "plan" is: produce this report, change no code.**
> Nothing in the repo is modified — no schema, migration, API, service, UI, storage, RBAC,
> or seed. No file upload/download was built.
>
> **Deliverable:** on approval, copy this content to
> `docs/claude/plans/device-management/equipment/implementation_report_file_infrastructure_audit.md`
> (plan mode only permits editing this plan file; the content is final).

Source of findings: 3 parallel read-only codebase explorations + direct reads of
`docker-compose.prod.yml`, `apps/api/src/main.ts`, `work-orders.controller.ts`,
`packages/db/prisma/schema.prisma`, the auth guards, and `docs/Deployment/*`.

---

## 1. Executive summary

**MEDCAL has no file storage infrastructure of any kind.** `FileObject`, `JobEvidence`,
`CustomerSignature`, and `Certificate.pdfFileObjectId` exist in `schema.prisma` (from the
initial migration) but have **zero application code** — no service, controller, module,
test, or UI references them anywhere. There is no upload endpoint, no download-of-stored-
bytes endpoint, no storage driver, no `storageKey` semantics, no object storage, no
filesystem write path, no upload library (`@nestjs/platform-express`, `bodyParser: false`,
no multer/multipart), and **no persistent volume in the production stack**
(`docker-compose.prod.yml` has zero volumes; Postgres is native on the VPS).

The only document capability that exists is **ephemeral**: `pdfkit` renders Work Order /
Quotation / Purchase Order PDFs in memory per request and streams them via NestJS
`StreamableFile` — nothing is persisted.

**Can `FileObject` be reused? Yes, with minimal changes.** Its polymorphic
`ownerType` + `ownerId` + `companyId` + `storageKey` design is exactly right for
"one file, attached to one record, scoped to one company." Before certificate upload it
needs **4 small additions** (approved): `checksum` (sha256), `uploadedByUserId`,
`updatedAt`, and one `FileOwnerType` value (`EQUIPMENT_CALIBRATION`).

**Recommended storage (approved): local disk on a bind-mounted host directory**, added to
`docker-compose.prod.yml`, files under a `companyId/ownerType/…` key, `FileObject.storageKey`
= the relative key. All access goes through a tiny `StorageDriver` interface
(`put` / `get` / `delete` / `exists`) so a later move to self-hosted MinIO / S3 is a
drop-in with `storageKey` unchanged. Backup = `tar` the directory in the same step as the
existing manual `pg_dump`.

**Minimum path to Phase 2B certificate upload:**
1. `StorageDriver` (local-disk impl) + a bind-mounted dir in the prod compose.
2. 4 `FileObject` schema additions + the enum value (one additive migration).
3. A `FilesModule` — one authenticated upload endpoint, one authenticated download endpoint,
   both `@UseGuards(CompanyRoleGuard)` + `@RequirePermission`, both company-scoped through
   the **owner record** (not a raw file id).
4. Multipart body handling on the upload route only (Express `multer` memory storage, small
   size cap) — `bodyParser: false` is global, so this is opt-in per route.
5. Transaction-safe write order (DB row in a transaction, then disk write, compensating
   cleanup on failure) + an orphan-sweep.
6. Nginx `client_max_body_size` on the `api.` vhost (default is 1 MB — too small for a
   scanned certificate).

**Not a Document Management System.** No versioning platform, workflow engine, OCR,
e-signature, virus-scan platform, PDF parsing, or field extraction.

---

## 2. `FileObject` current schema (exact)

`packages/db/prisma/schema.prisma` L1693-1713:

```prisma
model FileObject {
  id           String        @id @default(cuid())
  companyId    String
  customerId   String?
  ownerType    FileOwnerType
  ownerId      String
  storageKey   String
  mimeType     String?
  sizeBytes    Int?
  originalName String?
  createdAt    DateTime      @default(now())

  company         Company             @relation(fields: [companyId], references: [id], onDelete: Cascade)
  customer        Customer?           @relation(fields: [customerId], references: [id])
  jobEvidences    JobEvidence[]
  signatures      CustomerSignature[]
  certificatePdfs Certificate[]       @relation("CertificatePdf")

  @@index([companyId, ownerType, ownerId])
  @@index([storageKey])
}
```

`FileOwnerType` (L259-267): `CERTIFICATE | JOB_EVIDENCE | SIGNATURE | REQUEST_ATTACHMENT | INVOICE | CREDIT_NOTE | OTHER`.

| Attribute | Present? |
|---|---|
| Primary key | `id` cuid |
| `companyId` (FK → Company, `onDelete: Cascade`) | ✅ |
| `customerId` (FK → Customer, nullable) | ✅ |
| Polymorphic owner (`ownerType` enum + `ownerId` string) | ✅ — **`ownerId` is NOT a real FK** (no referential integrity, no cascade) |
| `storageKey` (String, required) | ✅ — **no defined meaning; nothing reads/writes it** |
| `mimeType`, `sizeBytes`, `originalName` (all nullable) | ✅ |
| `createdAt` | ✅ |
| **`updatedAt`** | ❌ |
| **`createdBy` / `uploadedBy` / any User relation** | ❌ |
| **`checksum` / `hash` / `sha256`** | ❌ |
| **`status` / lifecycle / `deletedAt` / retention** | ❌ |
| **`documentCategory` / `docType` / `label`** | ❌ (`caption` lives on `JobEvidence`, not here) |
| Unique constraint | ❌ (only two non-unique `@@index`) |
| Indexes | `@@index([companyId, ownerType, ownerId])`, `@@index([storageKey])` |

---

## 3. Application usage

**`FileObject` and all its relations are SCHEMA-ONLY.** Repo-wide grep for
`FileObject | fileObject | FileOwnerType | storageKey | pdfFileObjectId | JobEvidence |
CustomerSignature` across every `.ts` / `.tsx` / `.js`: **zero matches** outside
`schema.prisma`, the init migration SQL, and `docs/`. No `prisma.fileObject.*`, no
`prisma.jobEvidence.*`, no includes.

There is **no `files` module, no `certificates` module** in `apps/api`. Modules that exist:
calibration-requests, chat, contact-messages, customers, devices, device-\*, emails,
equipment, leads, me, menu, permissions, purchase-orders, push-tokens, quotations, taxes,
uoms, users, whitelist, work-orders.

**What is implemented (ephemeral PDF only):**
- `apps/api/src/modules/{work-orders,quotations,purchase-orders}/*.controller.ts` —
  `GET /:id/pdf` → `service.buildPdf(companyId, id)` renders `pdfkit` in memory
  (`Buffer.concat`) → `new StreamableFile(buffer, { type: "application/pdf", disposition:
  'attachment; filename="…"' })`. **Nothing stored.** Route is declared *before* `@Get(":id")`.
- `apps/api/src/modules/emails/emails.service.ts` — same in-memory buffer emailed as an
  attachment.
- `apps/api/src/modules/work-orders/work-order-pdf.ts` — reads a **bundled** letterhead
  logo via `existsSync` + `join` (read-only asset, not user data).
- Portal client: `apiFetchBlob('/…/pdf')` → `URL.createObjectURL` + `<a download>`
  (`use-quotations-query.ts` `fetchQuotationPdf`, plus work-orders / purchase-orders).

`pdfkit ^0.20.1` is the only document library anywhere. No `pdf-lib`, `puppeteer`,
`@react-pdf/renderer`.

---

## 4. Certificate model analysis

`Certificate` (L1505-1542) — **schema-only, no application code**, no `certificate` service
/ controller / module.

| Question | Finding |
|---|---|
| Relationship to `FileObject`? | Yes — `pdfFileObjectId String?` + `pdfFile FileObject? @relation("CertificatePdf")`. Note the field name is **`pdfFileObjectId`**, not `fileObjectId`. |
| Already has a file/document reference? | Yes (the nullable `pdfFile` above), unused. |
| Used by application code? | No. |
| Lifecycle / status semantics? | Yes — `status CertificateStatus` = `DRAFT | ISSUED | REVOKED | SUPERSEDED`; `issuedAt?`, `validUntil?`. |
| Supersession / revocation? | Yes — self-relation `"CertificateSupersede"` (`supersedes` / `supersededBy[]` via `supersedesCertificateId`); `revokeReason?`. |
| Could it be reused for `EquipmentCalibrationRecord` evidence? | **No — do not reuse.** `Certificate` is the *customer device* calibration certificate: it has **required** `customerId`, `deviceId`, `calibrationJobId @unique`, `billingStatus`, and links to Invoice / CreditNote / ReminderEvent. A reference-equipment calibration record shares **none** of those. Reusing it would force nullable- everything and couple the equipment-fitness domain to billing. |
| Useful *patterns* to copy | `validUntil` + lifecycle `status` + supersession self-relation + `revokeReason` + a nullable typed `FileObject` relation — the Phase 2B audit already recommends `EquipmentCalibrationRecord` adopt these. Copy the shape, not the table. |

Permission catalog defines `certificate: read/create/update/issue` — no `revoke`/`supersede`
action, and **no `file`/`fileObject`/`document` resource at all**.

---

## 5. `JobEvidence` analysis

`JobEvidence` (L1439-1451):

```prisma
model JobEvidence {
  id               String   @id @default(cuid())
  companyId        String
  calibrationJobId String
  fileObjectId     String            // required
  caption          String?
  createdAt        DateTime @default(now())
  calibrationJob CalibrationJob @relation(fields: [calibrationJobId], references: [id], onDelete: Cascade)
  fileObject     FileObject     @relation(fields: [fileObjectId], references: [id])
  @@index([calibrationJobId])
}
```

- **Schema-only**, no application code.
- **Owner semantics:** unlike the polymorphic `FileObject.ownerType`/`ownerId`, `JobEvidence`
  is a **dedicated join table** — a typed FK to its parent (`calibrationJobId`, cascade) +
  a required typed FK to `FileObject` + a `caption`.
- **This is the generic "attach a file to a record" pattern MEDCAL already blessed.** Two
  styles coexist in the schema: (a) `FileObject.ownerType/ownerId` polymorphic self-
  reference, and (b) a thin dedicated join model (`JobEvidence`, and effectively
  `CustomerSignature` / `Certificate.pdfFile`). Phase 2B can use either; §16 recommends
  **polymorphic `FileObject` alone** for the certificate (one file, one metadata row, no
  extra caption/ordering needs) with a dedicated join only if per-attachment metadata
  (annex label, sort order) turns out to be needed.

`CustomerSignature` (L1468-1479): `calibrationJobId @unique`, `fileObjectId?` (nullable),
`signerName?`, `signedAt` — same "typed parent + optional FileObject" shape. Schema-only.

---

## 6. Storage analysis

**NO APPLICATION FILE STORAGE INFRASTRUCTURE FOUND.**

| Store | Finding |
|---|---|
| Local filesystem (uploads) | None. No `fs.writeFile` / `createWriteStream` / `writeFileSync` anywhere in source. No `uploads/` / `storage/` / `files/` dir. No `STORAGE_` / `UPLOAD_` / `FILES_` env var in `.env` / `.env.example` / `.env.production.example`. |
| Docker volume / bind mount | Dev `docker-compose.yml`: one named volume `medcal_pg_data` for **dev Postgres only**. **Prod `docker-compose.prod.yml`: zero volumes, zero bind mounts.** All 4 app containers are stateless (`restart: unless-stopped`, healthchecks only); Postgres is **native on the VPS**, reached via `host.docker.internal:host-gateway`. |
| Object storage (S3 / MinIO / GCS / Azure) | None. No `@aws-sdk/client-s3`, `aws-sdk`, `minio`, `@google-cloud/storage`, `@azure/storage-blob` in any `package.json` (matches only transitive in `pnpm-lock.yaml`). |
| Firebase Storage | Not used. `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` exists but is only the FCM web-config string; `firebase-admin` is used **only** via `firebase-admin/messaging`. No `getStorage`. |
| Config / env vars | None for file storage. |

**Can files currently be uploaded / stored / retrieved / streamed / downloaded / deleted?**
Only **generated** (not stored) PDFs can be streamed as a download. Everything else: **no**.

---

## 7. Upload / download analysis

- **Upload:** impossible today. `apps/api` is NestJS on the **Express** adapter,
  `NestFactory.create(AppModule, { bodyParser: false })` — global body parsing is off. No
  `multer` / `@fastify/multipart` / `MulterModule` / `FileInterceptor` / `@UploadedFile` /
  `diskStorage` anywhere. `apps/web-api` (Express edge) is `express.json({ limit: "1mb" })`
  — JSON only.
- **Download of stored bytes:** none. `StreamableFile` is used and works, but only for
  in-memory pdfkit output (§3). No `res.download`, no `sendFile`, no `useStaticAssets`, no
  `ServeStaticModule`.
- **Nginx:** `docs/Deployment/infra/nginx/*.conf.example` (3 vhosts) have **no
  `client_max_body_size`** → the nginx default of **1 MB** would cap any future upload.

**Reusable building blocks that DO exist:** `StreamableFile`, `Content-Disposition`
handling, `@Get(":id/pdf")`-before-`@Get(":id")` route ordering, `@CompanyId()`,
`CompanyRoleGuard`, `@RequirePermission`, the portal `apiFetchBlob` + object-URL download
helper.

---

## 8. Authorization analysis

Established pattern (every business module — `customers`, `devices`, `equipment`,
`work-orders`, …):

```
@Controller("x") @UseGuards(CompanyRoleGuard)
  @Get(...) @RequirePermission("<resource>", "<action>")
  method(@CompanyId() companyId: string, ...) { return service.method(companyId, ...) }
```

`CompanyRoleGuard` (`apps/api/src/common/guards/company-role.guard.ts`), per request:
1. `companyId = process.env.COMPANY_ID` (else `Forbidden`).
2. Resolve Better Auth session from cookies (`auth.api.getSession`, hosted in-process).
3. Require an **ACTIVE** `UserMembership` for `(session.user.id, COMPANY_ID)`.
4. If `@RequirePermission` present → `hasPermission(role, resource, action)` (in-memory
   `RolePermission` cache, primed at boot, **fail-closed** on a null cache).
5. Inject `request.companyId`, `request.membershipRole`, `request.userId`.

`@CompanyId()` just returns `request.companyId`. `InternalServiceGuard` (web-api → api)
validates `x-internal-secret` and also sets companyId from `COMPANY_ID`. A former
`x-company-id` header was **deliberately removed** — client-supplied company id is a
documented anti-pattern.

**"If a user requests a certificate PDF, what can the system use to decide access?"**
- The authenticated **session → membership role** for the single `COMPANY_ID`.
- `@RequirePermission(...)` — but there is **no file/document permission** in the catalog
  today.
- `FileObject.companyId` (matches `COMPANY_ID` — necessary but, in a single-company
  deployment, not sufficient on its own to be *meaningful*).
- `FileObject.ownerType` + `ownerId` → the **owner record** (e.g.
  `EquipmentCalibrationRecord` → `Equipment` → `equipmentType`) which is itself company-
  scoped and permission-gated.

**Recommendation (audit, not implementation):** authorize file access **through the owner
record**, reusing that record's existing permission (e.g.
`@RequirePermission("equipmentCalibrationRecord", "read")`), not by exposing a raw
`GET /files/:id`. A dedicated `file:*` permission is **not needed** — the owner's permission
is the correct gate and avoids a parallel authorization surface. (No RBAC change is proposed
by this audit; the Phase 2B implementation would add the owner resource, which the Phase 2B
audit already covers.)

---

## 9. Company / tenant isolation analysis

- MEDCAL is **single-company-per-process**: `companyId` is always `process.env.COMPANY_ID`
  (dev `"PKM"`), never from a header/token/param. Schema comments state Menu / RolePermission
  omit `companyId` for exactly this reason; "No branchId (Company only)".
- `FileObject.companyId` exists and FKs to `Company` (`onDelete: Cascade`) — so file rows
  **are** company-scoped and would cascade-delete with a company.
- `storageKey` has no company scoping today (no meaning at all).
- Cross-company file access: **structurally preventable** once the two rules below hold —
  (a) every `FileObject` query is `where: { companyId, ... }` (the universal service
  pattern), and (b) the download endpoint resolves the file **via its owner record** which
  is already company-scoped. Both are conventions the codebase already enforces everywhere
  else.
- **Recommendation:** make `storageKey` **begin with `companyId/`** (e.g.
  `PKM/EQUIPMENT_CALIBRATION/<recordId>/<fileId>.pdf`) so tenant isolation is visible on
  disk and a future multi-tenant move (unlikely, but cheap) stays clean.

---

## 10. Storage key / file path analysis

- A `storageKey String` field **exists** but has **no implementation, no format, no
  collision handling, no meaning**. `@@index([storageKey])` implies it is meant to be
  looked up, but nothing does.
- **Minimum conceptual requirement (recommendation, not implementation):**
  - Opaque to callers; never user-controlled; never the `originalName`.
  - Deterministic from immutable identifiers: `"{companyId}/{ownerType}/{ownerId}/{fileObjectId}{ext}"`.
  - `fileObjectId` (a cuid) in the key guarantees **no collisions** even for same-named
    re-uploads.
  - Tenant-prefixed (see §9).
  - The `StorageDriver` maps `storageKey` → an absolute path (local) or object key (S3),
    so the DB value never changes across a storage migration.
- Keep the `@@index([storageKey])`; add a `@@unique` on it during Phase 2B (a key must map
  to exactly one row).

---

## 11. Metadata analysis

Guiding principle (from the brief): *the application must identify and retrieve evidence
without opening the PDF.* Classification of candidate `FileObject` fields:

| Field | Now? | Rationale |
|---|---|---|
| `id` | **REQUIRED** | present |
| `companyId` | **REQUIRED** | present; tenant + cascade |
| `ownerType` + `ownerId` | **REQUIRED** | present; the attach point |
| `storageKey` | **REQUIRED** | present; give it a format + `@@unique` (§10) |
| `originalName` | **REQUIRED** | present; what the user sees on download; audit needs the filename as submitted |
| `mimeType` | **REQUIRED** | present; serve with the right `Content-Type`; validate on upload |
| `sizeBytes` | **REQUIRED** | present; list views, quota sanity, detect truncated writes |
| `createdAt` | **REQUIRED** | present; "uploaded at" |
| **`checksum` (sha256 hex)** | **REQUIRED (add)** | integrity — prove the stored bytes are the bytes that were uploaded; detect silent corruption / restore mismatch; de-dupe check. Central to "evidence." **(approved)** |
| **`uploadedByUserId` (FK → User, nullable)** | **REQUIRED (add)** | attribution — audit Q ("who provided this evidence"). Nullable for system-generated files. **(approved)** |
| **`updatedAt`** | **REQUIRED (add)** | `FileObject` has none; needed the moment any field (e.g. a soft-delete marker) can change. **(approved)** |
| `deletedAt` / soft-delete | **USEFUL, not now** | evidence immutability is enforced by the **owner record's** `CONFIRMED` lock (§12, §14); a hard delete of a `DRAFT`-stage file is fine. Add a soft-delete column only if a retention policy later requires "hidden but retained." |
| `documentCategory` / `docType` | **NOT NECESSARY NOW** | `ownerType` already says "equipment calibration certificate." A sub-type (main cert vs annex) is only needed if one owner has many files — defer. |
| `retentionUntil` | **NOT NECESSARY NOW** | no retention policy defined (open question §25). |
| `virusScanStatus` | **NOT NECESSARY NOW** | out of scope per brief §23; internal-staff upload, PDF-only, size-capped. |
| `pageCount` / extracted fields | **NEVER** (this layer) | no PDF parsing — brief §23. |

**Net FileObject schema change for Phase 2B: `+checksum`, `+uploadedByUserId`,
`+updatedAt`, `+FileOwnerType.EQUIPMENT_CALIBRATION`, and `@@unique([storageKey])`.** One
additive migration. No field removed, no type changed.

---

## 12. Validation analysis

- **Generic infrastructure, PDF-restricted by the owner (Option B in the brief).** The
  `FilesModule` accepts a file + declares an allow-list *per owner type*; the
  equipment-calibration attach path passes `{ mime: ["application/pdf"], maxBytes: ~10 MB }`.
- Validate on the server, on the **actual bytes** (magic-number sniff), not just the
  client-sent `mimeType` or extension.
- Reject empty files; enforce a hard byte cap well under the multipart limit.
- Do **not** build a PDF-only pipeline — a future "other supporting document" (photo of a
  calibration label, an annex spreadsheet) must not require re-plumbing. The allow-list is
  data, not architecture.
- No implementation here — the audit only fixes the shape (per-owner allow-list, byte-level
  check).

---

## 13. Lifecycle analysis

| State | Current capability | Future requirement |
|---|---|---|
| uploaded | none | create `FileObject` row + write bytes atomically (§17) |
| active | none | the row exists and its owner references it |
| replaced | none | **new `FileObject` row + new `storageKey`**; never overwrite the binary (§14). Old row kept while its owner is `DRAFT`; superseded/kept once `CONFIRMED`. |
| deleted | none | allowed **only while the owner record is `DRAFT`**; blocked after `CONFIRMED` |
| superseded | none | not a `FileObject` state — the **owner** (`EquipmentCalibrationRecord`) carries the supersession chain (§4 pattern); a superseded record's files remain attached and readable |

MEDCAL does **not** need a `FileObject.status` enum. The lifecycle that matters lives on the
**owner record** (`DRAFT → CONFIRMED`, from the Phase 2B audit). `FileObject` stays a dumb,
immutable-after-confirm metadata+bytes pair.

---

## 14. Immutability / audit traceability analysis

Owner lifecycle: `EquipmentCalibrationRecord: DRAFT → CONFIRMED → locked`.

| Action on attached evidence | While owner = `DRAFT` | After owner = `CONFIRMED` |
|---|---|---|
| Replace the file | allowed (new `FileObject`, old one deleted or left orphaned-then-swept) | **blocked** |
| Delete the file | allowed | **blocked** |
| Edit `FileObject` metadata (`originalName`, etc.) | allowed | **blocked** (only system-set fields like a future `deletedAt` could ever change — none in Phase 2B) |
| Add another file to the record | allowed | **blocked** (or allowed as an explicit "amendment" — open question §25) |

**Enforcement recommendation:** service-layer guard in the `FilesModule` — before any
mutate/delete, load the owner record and reject if `status = CONFIRMED`
(`EQUIPMENT_CALIBRATION_RECORD_LOCKED`). A DB trigger is stronger but heavier; service-layer
matches how MEDCAL enforces every other invariant today and is sufficient for an internal-
staff tool. The binary itself is **always** immutable — replacement = a new object, never an
overwrite (protects any historical `CalibrationJob` that already cited the old file's
checksum).

CURRENT CAPABILITY: none. FUTURE REQUIREMENT: the table above, enforced in the service.

---

## 15. File vs Evidence distinction

The brief is right: **PDF ≠ Evidence.**

```
Structured EquipmentCalibrationRecord   (calibrationDate, validFrom?, validUntil,
   +                                     certificateNumber, provider, result,
Certificate PDF (FileObject)             acceptedForUse, acceptedBy/At)   ← machine-evaluable
   =                                    +
Calibration Evidence                     the PDF                          ← human-auditable backing
```

- The **structured record is authoritative** for every automated decision (is it in
  calibration on date D? filter "expiring soon"; future validity warnings). The system must
  never need to open the PDF to answer these.
- The **PDF is supporting documentation** — what an assessor physically inspects, and the
  proof that the structured values were transcribed faithfully.
- **Is this distinction reflected in the current `FileObject`?** Adequately — `FileObject`
  is *only* a file+metadata holder and carries **no** calibration semantics (no dates, no
  result, no validity). That separation is correct and must be preserved: calibration
  metadata belongs on `EquipmentCalibrationRecord` (Phase 2B), **never** on `FileObject`.
- Consequence: a `CONFIRMED` record with **zero** attached files is still valid evidence for
  a period if its structured metadata is complete (a "certificate pending upload" state is
  legitimate) — the PDF strengthens the evidence, it is not a precondition for the record
  to exist.

---

## 16. Polymorphic ownership analysis

- MEDCAL already has exactly one polymorphic-ownership pattern: `FileObject.ownerType`
  (enum) + `ownerId` (string, **not a FK**). Nothing else in the schema uses `ownerType`/
  `ownerId`; every other cross-model link is a distinct nullable typed FK.
- `ownerType` is a **Prisma enum** (`FileOwnerType`). Adding `EQUIPMENT_CALIBRATION`
  **requires a migration** (`ALTER TYPE "FileOwnerType" ADD VALUE 'EQUIPMENT_CALIBRATION'`)
  — additive, non-breaking, but note: Postgres cannot add an enum value inside a
  transaction that also uses it, so it must be its own migration statement (Prisma handles
  this).
- **`FileOwnerType.EQUIPMENT_CALIBRATION` fits naturally** — `ownerId` =
  `EquipmentCalibrationRecord.id`. Query pattern:
  `prisma.fileObject.findMany({ where: { companyId, ownerType: "EQUIPMENT_CALIBRATION", ownerId: recordId } })`,
  served by the existing `@@index([companyId, ownerType, ownerId])`.
- **`companyId` should stay on `FileObject`** (it already is) — it enables the tenant
  filter and the cascade without a join back through the polymorphic owner (which, being a
  string, can't be joined in Prisma anyway).
- **Trade-off to accept:** `ownerId` has no referential integrity — deleting an
  `EquipmentCalibrationRecord` does **not** cascade its `FileObject` rows. This is handled
  by the orphan strategy in §17, and in practice a `CONFIRMED` record is never deleted.

---

## 17. Orphan / transaction risks

Future chain: `EquipmentCalibrationRecord → FileObject (metadata) → disk (bytes)`. Two
stores, no distributed transaction. Risks and the **minimum safe pattern**:

| Scenario | Risk | Minimum mitigation |
|---|---|---|
| Upload succeeds, DB write fails | orphaned bytes on disk | write bytes to a **temp path**, then `INSERT FileObject` in a transaction, then `rename` temp → final `storageKey`. If the insert fails, delete the temp file. |
| DB row created, disk write fails | `FileObject` row pointing at nothing → broken evidence link | do the disk write (rename) **inside** the request, **after** a successful `INSERT` but **before** returning 200; if the rename throws, roll back / delete the row and return 5xx. Net: a row exists **iff** its bytes exist at return time. |
| Owner record deleted (`ownerId` not a FK) | orphaned `FileObject` + bytes | (a) service deletes attached `FileObject`s + bytes in the same transaction as the owner delete; (b) a periodic **orphan sweep**: `FileObject` rows whose `ownerId` no longer resolves, older than N hours, → delete bytes + row. |
| File "replaced" | old bytes linger | replacement always creates a new `FileObject` + key; the old row is deleted (DRAFT) by the same service call, or swept. |
| Restore DB from an older `pg_dump` than the file backup | `FileObject` rows missing, bytes present | orphan sweep cleans stray bytes; the reverse (rows present, bytes missing) is the real hazard — see §18. `checksum` lets a health-check flag it. |
| Concurrent double-submit | two rows, two keys, one intended file | `@@unique([storageKey])` + key derived from `fileObjectId` makes each write distinct; UI/mutation guard prevents the duplicate at the source. |

**Not** a saga / 2PC / outbox system — a temp-write-then-commit-then-rename ordering plus a
cron orphan sweep is the proportionate design for an internal tool.

---

## 18. Backup / restore analysis

**This is the most serious gap the audit surfaces.**

Current state (`docs/Deployment/`):
- Production is **containerized + validated locally but NOT yet deployed to the VPS**
  (`production-containerization-implementation-summary.md`).
- The **only** backup guidance is deploy Step 1: *"snapshot/backup the native PostgreSQL
  database before any deploy"* — **no command, no script, no schedule, no off-site copy.**
- **Zero mention of file backup.** No `pg_dump` automation, no cron, no `.github/workflows`,
  no `*.sh` scripts anywhere in the repo.
- `docker-compose.prod.yml` has **no volumes** — a file store written to a container's
  filesystem would be **destroyed on every redeploy**.

Consequence for evidence: *"DB restored but the certificate PDF is missing"* breaks
traceability — the exact failure the brief calls out.

**Recommendation (audit — no config change made):**
1. The file store **must** be a **bind mount** to a host directory outside the container
   (e.g. `/srv/medcal/files:/data/files`), added to `docker-compose.prod.yml`, so it
   survives `docker compose up --build`.
2. Backup that directory **in the same operation and cadence** as the Postgres dump —
   ideally one script: `pg_dump … && tar czf files-$(date).tgz /srv/medcal/files` → off-VPS
   copy. `checksum` in `FileObject` lets a restore be verified.
3. Document a **restore runbook** that restores DB and files to a **consistent point**
   (files ≥ DB timestamp, then run the orphan sweep).
4. Until (1)–(3) exist, certificate upload should not be enabled in production — a
   metadata-only "certificate pending" state (§15) is acceptable in the interim.

This is a **prerequisite**, not a Phase 2B deliverable — see §22.

---

## 19. `EquipmentCalibrationRecord` integration (future — not built)

Minimum infrastructure to support the Phase 2B use case:

| # | Capability | Provided by |
|---|---|---|
| 1 | Create `EquipmentCalibrationRecord` | Phase 2B (equipment track) |
| 2 | Upload certificate PDF | `FilesModule` upload endpoint + `StorageDriver` (local disk) + per-route multipart |
| 3 | Associate cert with the record | `FileObject { ownerType: EQUIPMENT_CALIBRATION, ownerId: record.id, companyId }` |
| 4 | View / download the cert | `FilesModule` download endpoint → resolve `FileObject` → check owner-record permission → `StorageDriver.get` → `StreamableFile` (pattern already proven, §7) |
| 5 | Verify user / company authorization | `CompanyRoleGuard` + `@RequirePermission("equipmentCalibrationRecord", "read")` + `FileObject.companyId === COMPANY_ID` + owner-record ownership |
| 6 | Preserve historical evidence | binary immutability (replace = new object) + owner `CONFIRMED` lock (§14) + `checksum` |
| 7 | Structured metadata independent of PDF | calibration fields on `EquipmentCalibrationRecord`, never on `FileObject` (§15) |
| 8 | Prevent silent disappearance | bind-mounted store + combined DB+files backup (§18) + orphan sweep + `checksum` health check (§17) |

---

## 20. Future reuse

The proposed generic infrastructure (`StorageDriver`, `FileObject` + polymorphic owner,
`FilesModule`, per-owner validation allow-list) supports, with **no structural change**,
just a new `FileOwnerType` value + an owner-permission check each:

- Customer documents (`FileOwnerType.OTHER` or a new value; `ownerId` = Customer)
- Quotation / Purchase Order attachments (customer PO scan, signed quote) — enum values
  `INVOICE` / `REQUEST_ATTACHMENT` already hint at this intent
- Job evidence photos (`JOB_EVIDENCE` — enum value already exists; would use the
  `JobEvidence` join for its `caption`)
- Customer signatures (`SIGNATURE` — exists)
- Device calibration certificates (`CERTIFICATE` — exists)
- Surat Jalan documents (future)
- Credit note attachments (`CREDIT_NOTE` — exists)

The enum values already in `FileOwnerType` show the schema author **always intended one
generic file layer for all of these**. Phase 2B is the first consumer; building it generic
(as recommended) means the others are near-free later. **This audit does not expand scope
into those modules** — it only confirms the design stays generic enough.

---

## 21. Architecture options

| | **Option A — Local disk + `FileObject` metadata** *(RECOMMENDED, approved)* | **Option B — Self-hosted MinIO + `FileObject` metadata** | **Option C — Reuse existing infrastructure** |
|---|---|---|---|
| Exists today? | No store; `FileObject` table only | No | **Nothing to reuse** — no storage layer exists |
| Implementation complexity | Low — a `StorageDriver` with `fs` calls, ~1 file | Medium — S3 client, bucket bootstrap, credentials, lifecycle rules | n/a |
| Deployment complexity | Low — one bind mount added to prod compose | Higher — new container + volume + network policy in a stack that currently has **zero** volumes/services beyond the 4 apps | n/a |
| Security | Files on the host FS, `127.0.0.1`-only app, access gated by owner permission; path traversal prevented by opaque keys | Bucket policies, signed URLs, an extra service surface to harden | n/a |
| Backup | `tar` the bind-mount dir alongside `pg_dump` — one script (§18) | MinIO has `mc mirror` / versioning, but it's a **second** backup target to set up and monitor | n/a |
| Scalability | Fine for PKM (single site, dozens–hundreds of certificates/year, ~MB each) | Overkill now; wins only at large volume / multi-node | n/a |
| Portability | `StorageDriver` interface → swap impl later; `storageKey` unchanged | Already S3-API; portable to AWS S3 / R2 / etc. | n/a |
| Suitability for MEDCAL now | **High** — matches the "native Postgres on the VPS, minimal moving parts" ethos | Low — adds infra the team has said it doesn't want | n/a |
| Suitability for certificate evidence | High — immutable-by-convention, checksummed, backed up with the DB | High | n/a |
| Migration impact | 1 additive migration (`FileObject` +3 fields, +1 enum value, +`@@unique`) | Same migration + infra provisioning | n/a |
| Over-engineering risk | Minimal | Moderate — a storage service for a workload measured in MB/month | n/a |

**Approved (user, this session): Option A, primary — local disk on a bind-mounted host
directory, behind a `StorageDriver` interface so MinIO/S3 is a documented drop-in growth
path.**

---

## 22. Recommended architecture

**A tiny generic file layer, backed by local disk, gated by owner-record permission.**

```
┌─────────────────────────────────────────────────────────────────┐
│ FilesModule (apps/api/src/modules/files/)                        │
│  POST  /files                (multipart; per-route parser)       │
│  GET   /files/:id            (StreamableFile)                    │
│  DELETE /files/:id           (DRAFT-owner only)                  │
│  — all @UseGuards(CompanyRoleGuard); authz resolved through the  │
│    owner record's existing @RequirePermission                    │
└───────────────┬─────────────────────────────────────────────────┘
                │
     ┌──────────▼───────────┐         ┌──────────────────────────┐
     │ FileObject (Prisma)  │         │ StorageDriver (interface)│
     │  + checksum          │────────▶│  put/get/delete/exists   │
     │  + uploadedByUserId  │         │  ── LocalDiskDriver ──   │
     │  + updatedAt         │         │  root = FILES_ROOT env   │
     │  ownerType/ownerId   │         │  bind-mounted host dir   │
     │  @@unique(storageKey)│         │  key = companyId/owner…  │
     └──────────────────────┘         └──────────────────────────┘
```

Satisfies the brief's 9 recommendation criteria:
1. **Simple** — one module, one driver, one additive migration. 2. **Safe** — checksum,
immutable binaries, temp-write→commit→rename, orphan sweep. 3. **Tenant isolation** —
`companyId` on the row + `companyId/` key prefix + owner-record scoping. 4. **Metadata ≠
binary** — `FileObject` holds metadata; disk holds bytes; calibration semantics stay on the
owner. 5. **Traceable to a record** — `ownerType=EQUIPMENT_CALIBRATION`, `ownerId=recordId`.
6. **Reusable** — any future `FileOwnerType` + owner-permission. 7. **Not a DMS** — no
versioning/workflow/OCR/e-sign. 8. **No vendor lock-in** — self-hosted disk; `StorageDriver`
keeps S3 optional. 9. **Backup understood** — §18: bind mount + combined DB+files backup is
a **hard prerequisite**.

---

## 23. Minimum gap analysis

| Capability | Exists | Partial | Missing | Needed for 2B |
|---|:---:|:---:|:---:|:---:|
| `FileObject` metadata model | ✅ (schema only) | — | needs `+checksum`, `+uploadedByUserId`, `+updatedAt`, `+@@unique(storageKey)` | **Yes** |
| Upload (endpoint + multipart parsing) | — | — | ✅ missing entirely (`bodyParser:false`, no multer) | **Yes** |
| Storage (bytes at rest) | — | — | ✅ missing entirely (no driver, no volume, no env var) | **Yes** |
| Download / view of stored bytes | — | `StreamableFile` mechanism proven for generated PDFs | ✅ no stored-file endpoint | **Yes** |
| Authorization | ✅ `CompanyRoleGuard` + `@RequirePermission` pattern | file access has no resource; must reuse owner permission | file-specific wiring | **Yes** (reuse owner perm) |
| Company isolation | ✅ `FileObject.companyId`; universal `where:{companyId}` convention | `storageKey` not tenant-scoped | key-prefix + query discipline | **Yes** (convention) |
| File validation | — | — | ✅ no per-owner allow-list, no byte-level check | **Yes** (small) |
| File lifecycle | — | — | ✅ none; enforced via owner `DRAFT→CONFIRMED` | **Yes** (service guard) |
| Evidence immutability | — | owner-record `CONFIRMED` concept exists in the Phase 2B audit only | binary-immutability + lock enforcement | **Yes** |
| Backup | — | manual "dump Postgres first" note only | ✅ no file backup, no automation, **no prod volume** | **Yes — prerequisite (§18)** |
| Nginx upload size | — | — | ✅ no `client_max_body_size` (1 MB default) | **Yes** (config) |
| Orphan / transaction safety | — | — | ✅ none | **Yes** (small) |

Nothing is marked "exists" on the strength of a schema field alone.

---

## 24. Phase boundary

### GENERIC FILE INFRASTRUCTURE — required *before* certificate upload
- `FileObject` schema additions (`checksum`, `uploadedByUserId`, `updatedAt`,
  `@@unique(storageKey)`) + `FileOwnerType.EQUIPMENT_CALIBRATION` — one additive migration.
- `StorageDriver` interface + `LocalDiskDriver` + `FILES_ROOT` env var.
- **Prod deployment: a bind-mounted host directory in `docker-compose.prod.yml` + a
  combined DB+files backup script + a restore runbook (§18).** ← hard gate.
- `FilesModule`: authenticated upload + download (+ DRAFT-only delete), authz via owner
  record.
- Per-route multipart parsing (Express `multer` memory storage, byte cap) — opt-in because
  `bodyParser:false` is global.
- Per-owner validation allow-list; byte-level type check.
- Temp-write → DB-commit → rename ordering; cron orphan sweep; `checksum` health check.
- Nginx `client_max_body_size` on the `api.` vhost.

### EQUIPMENT CALIBRATION — Phase 2B (equipment track, separate)
- `EquipmentCalibrationRecord` model + structured metadata (calibrationDate, validFrom?,
  validUntil, certificateNumber, provider, result, remarks).
- Acceptance evidence (`acceptedForUse`, `acceptedByUserId?`, `acceptedAt?`,
  `acceptanceNotes?`).
- Record lifecycle `DRAFT → CONFIRMED` (locks attached evidence, §14).
- Derived calibration validity on the `Equipment` read model.
- CRUD API + `equipmentCalibrationRecord` RBAC resource.
- Calibration Records panel on the Equipment Unit detail page; attach/view certificate
  (consumes the generic `FilesModule`).

### LATER
- `WorkOrderEquipment`, `JobReferenceEquipmentUsed.equipmentId` + immutable snapshot logic,
  the fit-for-use gate + validity warning/block, Technician App, Surat Jalan, defect /
  out-of-service events, `EquipmentServiceEvent`, parameter-level suitability,
  soft-delete/retention engine, self-hosted MinIO/S3 (if volume grows), signed-URL direct
  downloads, thumbnailing/preview.

---

## 25. Open business questions

1. **Backup ownership & cadence** — who runs the combined DB+files backup, how often, where
   is the off-VPS copy, what is the RPO? (Deployment docs define none.)
2. **Is production actually live yet?** Docs say "validated locally, not deployed." If not
   deployed, the file store + backup can be designed into the first real deploy rather than
   retrofitted.
3. **Retention** — how long must a calibration certificate be kept after the equipment is
   retired / the record is superseded? Is deletion ever permitted, and by whom?
4. **Amendment after `CONFIRMED`** — if a lab reissues a corrected certificate, does MEDCAL
   attach it to the existing (locked) record as an amendment, or create a new
   `EquipmentCalibrationRecord` that supersedes it? (Affects whether "add file to CONFIRMED
   record" is ever allowed.)
5. **Max certificate file size** — the byte cap and the Nginx `client_max_body_size` value
   (10 MB assumed; scanned multi-page certs can exceed).
6. **Accepted file types** — PDF only initially; will image scans (JPEG/PNG/TIFF) be
   accepted for calibration certificates?
7. **Multiple documents per calibration** — main certificate + adjustment sheet + as-found
   data: one `FileObject` or several? (Drives whether a `JobEvidence`-style join with a
   label/order is needed, §5.)
8. **`uploadedByUserId` on system-generated files** — when MEDCAL later stores its *own*
   generated Certificate PDF, is `uploadedBy` null, or a "system" sentinel user?
9. **Checksum on download** — should the download endpoint re-hash and 5xx on mismatch
   (integrity guarantee, slower), or trust the store?
10. **Cross-restore consistency** — is a files-newer-than-DB restore acceptable (orphan
    sweep cleans it), or must they be strictly point-consistent?
11. **Virus scanning** — brief §23 excludes a "platform," but do internal-upload PDFs need
    *any* scan (e.g. `clamav` one-liner) before an assessor is shown them?
12. **Storage location on the VPS** — `/srv/medcal/files`? disk quota / monitoring for it?

None resolved here. (1), (2), (5) block the production prerequisite in §24; the rest can be
settled during Phase 2B implementation.

---

## 26. Files inspected

- `packages/db/prisma/schema.prisma` — `FileObject`, `FileOwnerType`, `Certificate`,
  `CertificateStatus`, `CertificateBillingStatus`, `JobEvidence`, `CustomerSignature`,
  `CalibrationJob`, `Company.fileObjects`, `Customer.fileObjects`, `DocumentType`
- `packages/db/prisma/migrations/20260813063336_init_better_auth_fcmtoken/migration.sql`
  (only place `FileObject` table is created; no migration since)
- `apps/api/src/main.ts` (Express adapter, `bodyParser: false`, no static/multipart, RBAC
  cache priming)
- `apps/api/src/common/guards/company-role.guard.ts`,
  `apps/api/src/common/guards/internal-service.guard.ts`,
  `apps/api/src/common/decorators/company-id.decorator.ts`,
  `apps/api/src/common/decorators/require-permission.decorator.ts`
- `packages/auth/src/access-control.ts` (permission catalog — no file/document resource)
- `apps/api/src/modules/work-orders/work-orders.controller.ts` +
  `work-orders/work-order-pdf.ts`; `quotations/*-pdf.ts`, `purchase-orders/*-pdf.ts`
  (patterns); `apps/api/src/modules/emails/emails.service.ts` (PDF-as-attachment)
- `apps/portal/src/app/management/quotations/use-quotations-query.ts` (`fetchQuotationPdf`,
  `apiFetchBlob`, object-URL download); work-orders / purchase-orders equivalents
- `docker-compose.yml`, `docker-compose.prod.yml`, `.dockerignore`,
  `apps/{api,web,web-api,portal}/Dockerfile`
- `.env`, `.env.example`, `.env.production.example`, `turbo.json`, `pnpm-workspace.yaml`,
  root `package.json`
- `docs/Deployment/README.md`,
  `docs/Deployment/production-containerization-implementation-summary.md`,
  `docs/Deployment/audits/04-production-containerization-forensic-audit.md`,
  `docs/Deployment/infra/nginx/*.conf.example`
- Every `package.json` (dependency scan: `pdfkit` only; no storage/upload/multipart lib)
- Repo-wide grep: `FileObject|fileObject|FileOwnerType|storageKey|ownerType|ownerId|multer|
  multipart|@fastify/multipart|FileInterceptor|@UploadedFile|StreamableFile|useStaticAssets|
  ServeStaticModule|s3|minio|@aws-sdk|@google-cloud/storage|getSignedUrl|presigned|
  fs.writeFile|createWriteStream|uploads/|storage/|pg_dump|rclone|restic|*.sh` and
  `.github/workflows`
- Prior audits: `implementation_report_equipment_phase2a_audit.md`,
  `implementation_report_equipment_phase2a.md`,
  `implementation_report_equipment_phase2b_audit.md`

---

## 27. Explicit confirmation

**No code, schema, migration, database row, API, service, controller, DTO/Zod schema, RBAC
catalog, seed script, storage configuration, Docker/compose file, Nginx config, or UI file
was created or modified.** No file upload or download was built. `FileObject`, `Certificate`,
`JobEvidence`, `CustomerSignature`, `Equipment`, `EquipmentType`,
`DeviceTypeEquipmentRequirement`, `CalibrationJob`, `JobReferenceEquipmentUsed`, `WorkOrder`
are untouched. This audit report is the only artifact.

---

## Answers to the brief's §24 final questions

| Q | Answer |
|---|---|
| **Q1. Real file storage today?** | No. None. Only in-memory pdfkit generation. |
| **Q2. Can `FileObject` point to a physical file?** | Only in principle — `storageKey` exists but has no meaning, no store, and no code. |
| **Q3. Can users upload a file?** | No. `bodyParser: false`, no multipart lib, no endpoint. |
| **Q4. Can users retrieve a file?** | Only generated PDFs (streamed, not stored). No stored-file retrieval. |
| **Q5. Company-scoped file access?** | The pieces exist (`FileObject.companyId`, `CompanyRoleGuard`, single-tenant `COMPANY_ID`) but there is no file endpoint to scope. Recommendation: scope via the owner record's permission. |
| **Q6. Can `FileObject` attach to `EquipmentCalibrationRecord`?** | Yes, naturally — add `FileOwnerType.EQUIPMENT_CALIBRATION`, `ownerId = record.id`; served by the existing `@@index([companyId, ownerType, ownerId])`. |
| **Q7. Minimum missing infrastructure?** | `StorageDriver` (local disk) + bind-mounted prod volume + combined DB+files backup; `FilesModule` (upload + download); per-route multipart; `FileObject` +3 fields +1 enum value +`@@unique(storageKey)`; per-owner validation; temp-write→commit→rename + orphan sweep; Nginx `client_max_body_size`. |
| **Q8. Does `FileObject` need schema changes?** | Yes — **minimal**: `+checksum` (sha256), `+uploadedByUserId` (FK User, nullable), `+updatedAt`, `+@@unique([storageKey])`, and enum `+EQUIPMENT_CALIBRATION`. One additive migration. Nothing removed. |
| **Q9. Simplest safe storage strategy?** | Local filesystem on a **bind-mounted host directory** in `docker-compose.prod.yml`, opaque tenant-prefixed keys, behind a `StorageDriver` interface, backed up in one operation with `pg_dump`. MinIO/S3 is a later drop-in, not now. |
| **Q10. What must be ready before Phase 2B certificate upload?** | Everything in §24 "GENERIC FILE INFRASTRUCTURE", and the **backup prerequisite in §18 is a hard gate** — do not enable production upload without a bind-mounted store + a working combined backup + a restore runbook. |
| **Q11. What can be deferred?** | Everything in §24 "LATER": MinIO/S3, signed URLs, soft-delete/retention engine, virus-scan platform, preview/thumbnails, per-attachment metadata/ordering, and all non-file Phase-2B/later equipment work. |
