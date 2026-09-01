# Generic File Infrastructure — Phase 1 — Implementation Report

**Date:** 2026-08-29
**Author:** afriza.hrp@gmail.com (via Claude Code)
**Precedes:** Phase 2B (EquipmentCalibrationRecord) — **NOT implemented here**
**Based on:** `implementation_report_file_infrastructure_audit.md` (approved)

---

## 1. Implementation summary

A small, generic, safe file layer was added to `apps/api`:

```
business modules ──▶ FilesModule ──▶ StorageDriver ──▶ LocalDiskDriver ──▶ bind-mounted host dir
                          │
                          └▶ FileObject (Prisma)   metadata + sha256 + owner ref
```

- One additive Prisma migration on `FileObject` (`checksum`, `uploadedByUserId`,
  `updatedAt`, `@@unique(storageKey)`) + `FileOwnerType.EQUIPMENT_CALIBRATION`.
- `StorageDriver` interface + `LocalDiskDriver` (root from `FILES_ROOT`, fail-closed).
- Application-generated, company-scoped, traversal-proof storage keys.
- `FilesModule`: `POST /files`, `GET /files/:id`, `DELETE /files/:id`.
- Per-route multipart parsing only (global `bodyParser:false` untouched), 20 MiB cap.
- Per-owner file-type allow-list + byte-level content sniff.
- Authorization **through the owning record**, via a `FileOwnerPolicy` registry
  that ships **empty** — no new RBAC resource.
- temp-write → commit (no-overwrite) → DB insert, with compensation.
- Production bind mount in `docker-compose.prod.yml`; combined DB+files backup
  script + runbook; Nginx `client_max_body_size`.

The registry being empty means the endpoints are wired and tested but cannot be
exercised end-to-end in production until Phase 2B registers the
`EQUIPMENT_CALIBRATION` policy. That is the correct scope boundary.

## 2. FileObject schema changes

`packages/db/prisma/schema.prisma`:

| Change | Detail |
|---|---|
| `+ checksum String?` | sha256 hex of the stored binary. Nullable only to stay additive; always set on upload. |
| `+ uploadedByUserId String?` + `uploadedByUser User? @relation("FileUploadedBy")` | attribution; `ON DELETE SET NULL`; nullable for system files. |
| `+ updatedAt DateTime @updatedAt` | was absent. |
| `@@index([storageKey])` → `@@unique([storageKey])` | a key maps to exactly one row. |
| `+ @@index([uploadedByUserId])` | FK index. |
| `User { + uploadedFiles FileObject[] @relation("FileUploadedBy") }` | back-relation. |
| `enum FileOwnerType { + EQUIPMENT_CALIBRATION }` | inserted before `OTHER`. |

Nothing removed, nothing retyped. Migration:
`packages/db/prisma/migrations/20260829050000_add_fileobject_metadata_and_equipment_calibration_owner/migration.sql`
— `ALTER TYPE ... ADD VALUE`, `ADD COLUMN` (updatedAt via transient default then
`DROP DEFAULT`), index swap, FK. Applied cleanly to the dev DB via
`prisma migrate deploy`.

## 3. StorageDriver

`apps/api/src/modules/files/storage/storage-driver.ts` — `STORAGE_DRIVER` DI
token + interface: `allocateTemp()`, `put(key, sourcePath)`, `get(key)`,
`delete(key)`, `exists(key)`. Typed errors: `StoragePathTraversalError`,
`StorageKeyConflictError`, `StorageObjectNotFoundError`. This is the only
storage contract business modules see — a future MinIO/S3 driver drops in here
with `storageKey` unchanged.

## 4. LocalDiskDriver

`apps/api/src/modules/files/storage/local-disk.driver.ts`:

- root = `path.resolve(FILES_ROOT)`; constructor throws on empty root.
- `resolveKey()` rejects absolute paths, NUL, `..` segments, and anything that
  resolves outside the root.
- `put()` opens the destination with the `wx` flag → **never overwrites**
  (`StorageKeyConflictError` on EEXIST); streams from the temp file; consumes
  the temp file on success; cleans a partial write on failure.
- `allocateTemp()` → `<root>/.tmp/<ts>-<uuid>.part` (same filesystem ⇒ atomic).
- `delete()` idempotent; `get()` throws `StorageObjectNotFoundError` if missing.

## 5. FilesModule

`apps/api/src/modules/files/`:

```
files.module.ts        DI wiring; STORAGE_DRIVER factory reads FILES_ROOT (fail-closed)
files.controller.ts    POST /files, GET /files/:id, DELETE /files/:id
files.service.ts       upload / getForDownload / delete / verifyIntegrity
files.constants.ts     MAX_UPLOAD_BYTES (20 MiB), UploadedFile shape
file-validation.ts     per-owner allow-list + magic-byte sniff
owner-policy.ts        FileOwnerPolicy + FileOwnerPolicyRegistry (ships EMPTY)
storage/storage-driver.ts, storage/local-disk.driver.ts, storage/storage-key.ts
```

Registered in `apps/api/src/app.module.ts`. Exports `FilesService`,
`FileOwnerPolicyRegistry`, `STORAGE_DRIVER` so a consumer module can register
its owner policy.

## 6. Upload flow (`POST /files`)

1. `CompanyRoleGuard` → session + ACTIVE membership; injects companyId/userId/role.
2. `FileInterceptor("file")` — per-route multipart, memory storage, `fileSize`
   limit = 20 MiB, `files: 1`.
3. Zod-validate form fields `ownerType`, `ownerId`.
4. `registry.get(ownerType)` → `FILE_OWNER_TYPE_UNSUPPORTED` (400) if none.
5. `validateUpload()` — non-empty, ≤ policy maxBytes, extension in allow-list,
   declared MIME in allow-list, content sniff (PDF ⇒ `%PDF-`).
6. `policy.resolveOwner(companyId, ownerId)` → `FILE_OWNER_NOT_FOUND` (404) if absent.
7. `hasPermission(role, policy.permissionResource, writeAction ?? "update")` → 403.
8. `owner.locked` → `FILE_OWNER_LOCKED` (409).
9. sha256 over the buffer; generate `fileId` (UUID); build storage key.
10. temp-write → `storage.put(key, temp)` (fails if key exists).
11. `prisma.fileObject.create({ id: fileId, ...metadata })`.
12. On step-10 failure: dispose temp, map to 409/500. On step-11 failure: delete
    the just-written binary, 500. Return the `FileObject` row.

## 7. Download flow (`GET /files/:id`)

`resolve(id, companyId)` (company scope in the query — cross-company = 404) →
`registry.get(ownerType)` → `resolveOwner` (missing owner = 404) →
`hasPermission(role, resource, readAction ?? "read")` → 403 → `storage.exists()`
false ⇒ `FILE_BYTES_MISSING` (500) → `StreamableFile(stream, { type: mimeType,
disposition: attachment; filename="<sanitised>" })`. Filename strips `\r \n "`.

## 8. Authorization

No `file:*` permission. Every file operation is gated by the **owner record's**
existing RBAC resource + action, supplied by the registered `FileOwnerPolicy`
(`permissionResource`, `readAction` default `read`, `writeAction` default
`update`). `CompanyRoleGuard` still runs on the controller (session + ACTIVE
membership); `@RequirePermission` is intentionally absent because the resource
is dynamic per `ownerType`. **No RBAC change was made** (Phase 20 honoured).

## 9. Company isolation

- `FileObject.companyId` set from `process.env.COMPANY_ID` (via guard), never a
  param/header.
- Every lookup is `where: { id, companyId }` — a cross-company id is a plain 404,
  never a leak; the id is never assumed secret.
- Storage key is `companyId/...`-prefixed — isolation visible on disk.
- Owner resolution is company-scoped (the owning module's responsibility).
- Test: a second company cannot download a file even given its exact id.

## 10. Validation

Generic infra, PDF restricted **by the owner policy** (audit Option B). The
first consumer (`EQUIPMENT_CALIBRATION`, Phase 2B) will pass
`{ mimeTypes: ["application/pdf"], extensions: [".pdf"], maxBytes: ~10 MB }`.
Server-side, byte-level (`%PDF-`), extension + declared MIME all checked; empty
files rejected; hard cap below the multipart limit. Allow-list is data — a
future image/annex type needs no re-plumbing.

## 11. Checksum

sha256 computed from the **actual uploaded bytes** (`createHash("sha256")
.update(file.buffer)`), stored in `FileObject.checksum`. Never derived from
name/MIME/metadata. `FilesService.verifyIntegrity()` re-streams the stored
binary and re-hashes for a post-restore / health check — **no public route**.

## 12. Lifecycle / immutability

- Binaries are **never overwritten** (`wx` open). Replacement = a new
  `FileObject` + new key (old one deleted while DRAFT, or swept).
- `FileObject` has **no status enum** — lifecycle lives on the owner record.
- The generic layer cannot know arbitrary owners' lifecycles, so it delegates:
  `FileOwnerPolicy.resolveOwner()` returns `locked`. `locked === true`
  (owner CONFIRMED) ⇒ upload 409, delete 409, i.e. attached evidence is
  immutable. No workflow engine; the calibration `DRAFT→CONFIRMED` rule is
  **not** coded here — Phase 2B's policy supplies `locked`.

## 13. Error handling

Uses existing MEDCAL conventions (`Nest*Exception` with `{ code, message }`).
Codes: `INVALID_FILE_UPLOAD`, `FILE_OWNER_TYPE_UNSUPPORTED`, `FILE_EMPTY`,
`FILE_TOO_LARGE`, `FILE_EXTENSION_NOT_ALLOWED`, `FILE_MIME_NOT_ALLOWED`,
`FILE_CONTENT_MISMATCH`, `FILE_OWNER_NOT_FOUND`, `FORBIDDEN`,
`FILE_OWNER_LOCKED`, `FILE_STORAGE_KEY_CONFLICT`, `FILE_STORAGE_WRITE_FAILED`,
`FILE_METADATA_WRITE_FAILED`, `FILE_NOT_FOUND`, `FILE_BYTES_MISSING`.
Path-traversal attempts throw `StoragePathTraversalError` at the driver (keys
are app-generated, so this is defence-in-depth).

## 14. Orphan handling

- Failed upload: temp disposed; if bytes were committed but the DB insert
  failed, the binary is deleted (compensation) — **no row without bytes on a
  200**; at worst a short-lived binary with no row after a DB fault.
- Download refuses (`FILE_BYTES_MISSING` 500) rather than serve a row whose
  binary is gone.
- Delete removes binary then row; a missing binary does not block row deletion.
- `verifyIntegrity()` + the restore runbook detect both orphan directions.
- No cron sweeper was added (audit said "extremely small / optional"); the
  runbook documents a manual sweep. Deferred as a small internal add-on.

## 15. Docker production storage

`docker-compose.prod.yml` `api` service gains:
```yaml
volumes:
  - "${MEDCAL_FILES_DIR:-/srv/medcal/files}:/data/files"
```
`.env.production.example` gains `FILES_ROOT=/data/files` and
`MEDCAL_FILES_DIR=/srv/medcal/files`. No Postgres container, no MinIO, no other
service touched. Binaries now survive `docker compose up --build`.

## 16. Backup / restore

- `scripts/backup-medcal.sh` — `pg_dump` (custom format) **then** `tar` the file
  store (files ≥ DB snapshot), plus a `manifest.txt` with sha256s. It does
  **not** push off-site and does **not** schedule itself — deliberately.
- `docs/Deployment/file-storage-and-backup.md` — what's stored, where files
  live, prerequisites, backup command, **restore runbook**, timestamp-skew
  handling (files-newer = OK/orphans; files-older = evidence loss, reject),
  integrity check, and the **open operational decisions** (off-site target,
  schedule/retention, ownership, quota, "is prod live yet") left explicitly
  undecided because the repo lacks the information to fix them safely.

## 17. Nginx configuration

`infra/nginx/api.kalibrasimedika.co.id.conf.example` gains
`client_max_body_size 25m;` in the 443 server block (≥ the app's 20 MiB cap;
Nginx default 1 MB is too small). No static/file location added — the storage
directory is **not** exposed; every byte still flows through authenticated
`apps/api`. The file remains a manual-apply example, consistent with the rest of
`infra/nginx/`.

## 18. Tests

`apps/api/src/modules/files/storage/local-disk.driver.test.ts` (7):
write/read/exists/delete roundtrip, temp file consumed on put, **never
overwrites** an existing key, **path-traversal / absolute-path rejection**,
idempotent delete, temp path under root.

`apps/api/src/modules/files/files.service.test.ts` (13): stores binary +
**sha256 matches raw bytes** + metadata; rejects disallowed MIME; rejects
non-PDF bytes; rejects oversized; rejects unknown owner; rejects caller without
owner write-permission; rejects upload to locked owner; **no metadata row when
storage write fails**; same-company download + correct MIME + byte-exact;
**cross-company download denied by id**; **500 (not serve) when binary is
missing**; integrity verify + tamper detection; DRAFT-owner delete removes row +
binary; delete refused on locked owner.

**20/20 pass.**

## 19. Verification results

| Check | Result |
|---|---|
| `pnpm --filter @medcal/db generate` | ✅ |
| `prisma migrate deploy` (dev DB) | ✅ applied |
| `prisma validate` | ✅ |
| `pnpm --filter @medcal/api typecheck` | ✅ |
| `pnpm --filter @medcal/api build` (`tsc -p`) | ✅ |
| `vitest run src/modules/files` | ✅ 20/20 |
| `vitest run` (whole api) | 622 pass / **8 pre-existing unrelated failures** |
| `packages/auth` tests | ✅ 47/47 |
| `packages/db` tests | ✅ 14/14 |
| portal | not affected (no changes) |

**Pre-existing unrelated failures** (confirmed failing on `HEAD` before this
work, via `git stash`): `emails/imap-sync.service.test.ts` (5),
`push-tokens/notification-dispatch.service.test.ts` (2),
`contact-messages/contact-messages.push.test.ts` (1) — IMAP / Firebase
credential-dependent, nothing to do with files.

## 20. Files changed

**New:**
- `apps/api/src/modules/files/{files.module,files.controller,files.service,files.constants,file-validation,owner-policy}.ts`
- `apps/api/src/modules/files/storage/{storage-driver,local-disk.driver,storage-key}.ts`
- `apps/api/src/modules/files/{files.service.test.ts,storage/local-disk.driver.test.ts}`
- `packages/db/prisma/migrations/20260829050000_add_fileobject_metadata_and_equipment_calibration_owner/migration.sql`
- `scripts/backup-medcal.sh`
- `docs/Deployment/file-storage-and-backup.md`
- `docs/claude/plans/device-management/equipment/implementation_report_file_infrastructure_phase1.md`

**Modified:**
- `packages/db/prisma/schema.prisma` (FileObject, User, FileOwnerType)
- `apps/api/src/app.module.ts` (register `FilesModule`)
- `docker-compose.prod.yml` (`api` bind mount)
- `infra/nginx/api.kalibrasimedika.co.id.conf.example` (`client_max_body_size`)
- `.env`, `.env.example`, `.env.production.example` (`FILES_ROOT`, `MEDCAL_FILES_DIR`)
- `.gitignore` (`.data/`)

## 21. Explicit scope boundary

**Built:** generic file infrastructure only — schema deltas, storage driver,
storage keys, `FilesModule` (upload/download/delete), per-route multipart,
validation, checksum, owner-policy mechanism, orphan-safe write, prod bind
mount, backup script + runbook, Nginx size.

**NOT built (out of scope, unchanged):** `EquipmentCalibrationRecord`,
calibration validity / status / fit-for-use, any `Equipment` change,
`WorkOrderEquipment`, `JobReferenceEquipmentUsed.equipmentId`, Technician App,
Surat Jalan, inventory, maintenance, DMS/workflow/OCR/e-signature/versioning,
MinIO/S3/cloud storage, virus scanning, thumbnails, preview, signed URLs,
retention engine, distributed transactions, queues/event bus. **No RBAC
redesign, no new permission resource, no PostgreSQL deployment change.**

## 22. Deferred Phase 2B items

1. `EquipmentCalibrationRecord` model + structured metadata + `DRAFT→CONFIRMED`.
2. Register the `EQUIPMENT_CALIBRATION` `FileOwnerPolicy` (resolve the record,
   map `CONFIRMED` → `locked`, resource `equipmentCalibrationRecord`, PDF
   allow-list) — the one hook that turns these endpoints live.
3. `equipmentCalibrationRecord` RBAC resource + CRUD API.
4. Equipment detail-page "Calibration Records" panel consuming `FilesModule`.
5. Optional tiny cron orphan sweep.
6. Resolve the operational decisions in `file-storage-and-backup.md` §7 before
   enabling production upload.
