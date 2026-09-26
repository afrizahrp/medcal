# CERTIFICATE MANAGEMENT — IMPLEMENTATION REPORT

**Type:** Implementation report. Scope trigger: the Certificate Management implementation task,
informed by `certificate-management-readiness-audit.md` and `certificate-upload-pre-implementation.md`
(same folder), plus two audit documents supplied with the task (`Phase3A_Certificate_Issuance_Audit.md`,
`Certificate_Document_Upload_Audit.md`).

---

## Headline finding

**Certificate Management was already fully implemented** in the codebase (dated 2026-09-25, one
day before this task), at `apps/api/src/modules/calibration-jobs/`:

- `certificate.service.ts` — `getForJob`, `uploadVersion`, `downloadVersion`, `deleteVersion`
- `certificate-file-owner-policy.ts` — registered `FileOwnerPolicy` for `FileOwnerType.CERTIFICATE`
- Routes wired into `calibration-jobs.controller.ts` (`GET/POST/DELETE :id/certificate...`)
- `certificate.service.test.ts` — 10 pre-existing tests
- Portal UI: `certificate-panel.tsx` (`CertificatePanel`), already embedded in the Calibration
  Job Detail accordion under a "Sertifikat" section

This already satisfied nearly every explicit requirement in the task brief:

- QA-independent upload (proven by a test that uploads while the job is `PENDING` with zero
  `QualityReview` rows in existence at all)
- RBAC exactly matching the locked role list: `TECHNICIAN_MANAGER`/`SUPERVISOR`/`ADMIN` seeded
  grants for `certificate:read/create/update`, `SUPERADMIN` via its unconditional bypass,
  `GENERAL_MANAGER` via the mirror catalog — matching "upload/replace: TECHNICIAN_MANAGER,
  SUPERVISOR, ADMIN, SUPER_ADMIN, GENERAL_MANAGER; delete: SUPER_ADMIN only" verbatim
- Audit log actions: `CERTIFICATE_UPLOADED`, `CERTIFICATE_REPLACED`, `CERTIFICATE_DOWNLOADED`,
  `CERTIFICATE_DELETED`
- Versioning: every upload creates a new `FileObject`; previous versions are never deleted on
  replace; the current version is protected from deletion (`CERTIFICATE_CURRENT_VERSION_LOCKED`)
- Empty state: `GET .../certificate` returns `null` (not an error) when no certificate exists yet;
  the frontend already distinguishes "no certificate" from "failed to load"
- File type: PDF-only, 10 MiB cap, content-sniffed via the existing generic `file-validation.ts`
- Cross-job isolation: `resolveOwner`/`requireOwnedVersion` re-derive ownership from the
  `FileObject`'s own `ownerId`, company-scoped — a `fileId` from a different job's certificate
  404s, never leaks

Given this, the implementation task reduced to: (1) identify and close the one genuine gap
against the brief, (2) resolve a UI-navigation misunderstanding that came up mid-session, and
(3) verify and report — not build the feature from scratch.

---

## What was implemented

### 1. Duplicate-file detection (the one real gap — task §26)

The brief explicitly required: *"If checksum infrastructure is already available, detect
whether the uploaded file is identical to an existing version. Do not silently create
unnecessary duplicate versions... Do not use filename alone as file identity."*
Checksum infrastructure (`FileObject.checksum`, sha256, already computed by `FilesService.upload`)
existed, but `CertificateService.uploadVersion` did not use it — every upload created a new
version unconditionally, even a byte-identical re-upload.

**Change** (`apps/api/src/modules/calibration-jobs/certificate.service.ts`):
Before calling `FilesService.upload`, `uploadVersion` now computes the incoming file's sha256
and compares it to the **current** version's stored checksum (only when a current version
exists). If identical, it throws `409 ConflictException` with `code: "CERTIFICATE_DUPLICATE_FILE"`
instead of creating a redundant version.

Deliberate scope decision: comparison is only against the **current** version, not the full
version history. Re-uploading an older, already-superseded version is a legitimate action (e.g.
reverting a mistaken replace), not a duplicate-upload mistake, and is still allowed.

**Frontend** (`apps/portal/src/app/management/calibration-jobs/certificate-panel.tsx`): mapped
the new error code to an Indonesian message: *"File ini identik dengan versi sertifikat yang
sedang aktif — tidak ada versi baru yang dibuat."*

**Tests** (`certificate.service.test.ts`): two new tests —
1. Re-uploading the exact current file is refused with `CERTIFICATE_DUPLICATE_FILE`; version
   count stays unchanged.
2. Re-uploading an older, already-superseded version is allowed (not treated as a duplicate).

### 2. UI navigation — explored, then reverted per your direction

The task brief also asked for "Sertifikat" and "Generate QR" to become top-level tabs (not an
accordion). I built a custom `Tabs` primitive (`apps/portal/src/components/ui/tabs.tsx`, since no
tab component existed in the portal app) and converted the Calibration Job Detail page's outer
Accordion into Tabs. Mid-review you redirected me to keep the existing accordion-based layout
instead. That conversion was fully reverted (`git checkout` on `page.tsx`, `tabs.tsx` deleted) —
the Calibration Job Detail page is unchanged from its pre-task state: Identitas / Alat Referensi
/ Hasil Pengukuran / Koreksi Identitas / Sertifikat remain accordion sections, and "Sertifikat"
still contains `CertificatePanel` plus the existing "Generate QR" placeholder button.

---

## Numbering — current behavior (task §7/§27, report only, not changed)

`Certificate.number` is currently **auto-allocated**, not manual input from the physical
document:

```ts
// certificate.service.ts — ensureCertificate()
const number = await DocumentNumberService.allocate({
  companyId,
  documentType: "CERTIFICATE", // CER prefix, packages/db/src/document-number/document-type-prefix.ts
  issuedAt: new Date(),
  tx,
});
```

This runs once, at first upload (`ensureCertificate`, create-if-absent), producing e.g.
`CER/2026/09/00001`. This contradicts the business-context framing in
`Certificate_Document_Upload_Audit.md` (which describes `Certificate.number` as manual input
from the physical certificate) but matches the task's explicit instruction to **not** make a new
numbering decision and to preserve existing behavior. `DocumentNumberService` and
`DocumentType.CERTIFICATE` are untouched, not redesigned, not deleted.

---

## Architecture

- **Certificate ↔ CalibrationJob:** 1:1, `Certificate.calibrationJobId String @unique` —
  unchanged, preserved as an existing invariant.
- **Certificate ↔ FileObject:** `Certificate.pdfFileObjectId` points at the *current*
  `FileObject`; all versions (current + historical) are queryable via
  `FileObject { ownerType: "CERTIFICATE", ownerId: certificate.id }`. No schema change.
- **File storage:** existing generic `FilesService` / `LocalDiskDriver` / `FileOwnerPolicyRegistry`
  — reused unchanged. `certificateFileOwnerPolicy` (pre-existing) is PDF-only, 10 MiB,
  `resolveOwner` scoped by `companyId`.
- **Versioning:** every upload/replace creates a new `FileObject`; previous versions are kept
  (never deleted automatically); the *new* duplicate-file check prevents a redundant version when
  the bytes are unchanged from the current one.

## API

Existing routes, unchanged except for the new duplicate-file behavior inside `uploadVersion`:

| Route | Permission | Behavior |
|---|---|---|
| `GET :id/certificate` | `certificate:read` | Returns `null` (not an error) when no certificate exists yet |
| `POST :id/certificate/versions` | `certificate:update` | Upload/replace; now refuses byte-identical re-uploads of the current version (`409 CERTIFICATE_DUPLICATE_FILE`) |
| `GET :id/certificate/versions/:fileId/download` | `certificate:read` | Streams the file; scoped to the certificate's own job |
| `DELETE :id/certificate/versions/:fileId` | `certificate:delete` | Refuses to delete the current version (`409 CERTIFICATE_CURRENT_VERSION_LOCKED`) |

## UI

- Tab placement: unchanged — "Sertifikat" remains an accordion section (not nested under
  measurement), containing `CertificatePanel` + the "Generate QR" placeholder, exactly as before
  this task.
- Empty state: `CertificatePanel` already shows "Belum ada sertifikat yang di-upload." + an
  upload button gated only by `certificateUpdate` capability, never by QA status.
- New error surfaced: `CERTIFICATE_DUPLICATE_FILE` → Indonesian message in the upload flow.
- Generate QR: unchanged placeholder, no QR library added, no generation implemented.

## RBAC

Unchanged (already matched the locked spec):
- Read/Upload/Replace: `TECHNICIAN_MANAGER`, `SUPERVISOR`, `ADMIN` (seeded), `SUPERADMIN`
  (bypass), `GENERAL_MANAGER` (mirror catalog)
- Delete: `SUPERADMIN` only — no `certificate:delete` row seeded to any other role

## Audit Log

Unchanged: `CERTIFICATE_UPLOADED`, `CERTIFICATE_REPLACED`, `CERTIFICATE_DOWNLOADED`,
`CERTIFICATE_DELETED`, written via the existing `recordAuditLog` helper. No new event added for
the duplicate-file refusal (it never creates a `FileObject`/version, so there is nothing to log
as an "action taken" — the API error itself is the record).

## Security

Unchanged: RBAC via `CompanyRoleGuard` + `@RequirePermission`, PDF-only MIME/extension/content-
sniff validation, 10 MiB cap, checksum-based storage keys, company-scoped ownership resolution
on every read/write, no direct exposure of storage paths. The new duplicate check strengthens
integrity (identity by content hash, never filename) without touching the security boundary.

## Tests

- `certificate.service.test.ts`: **12/12 passed** (10 pre-existing + 2 new).
- Full `apps/api/src/modules/calibration-jobs` suite: **419/420 passed** (15 files, 1 file with 1
  failing test). The failure (`calibration-jobs.service.test.ts` → "company-scopes the list") is
  a pre-existing, unrelated flaky test — a 2-character random company ID collision — and passed
  when re-run in isolation. Not a regression from this change (unrelated service, no code path
  touched by this task).
- Typecheck: `apps/api` clean, `apps/portal` clean (after clearing a stale, corrupted
  `.next/dev/types/routes.d.ts` generated by a concurrently-running dev server sharing this
  working directory — not a source-code issue).
- Build: not run (no build-affecting change to either app's non-generated output; typecheck +
  full relevant suite were the applicable verification per the changed area).

## Future compatibility (task §2/§21/§22)

- **Future PDF generation:** unaffected. `uploadVersion` is the only writer of
  `Certificate.pdfFileObjectId`; a future system-generated PDF would call the same
  `FilesService.upload` path and set the same field — no second Certificate/File model needed,
  none created.
- **Future QR / verificationToken:** untouched. `Certificate.verificationToken` was not read or
  written anywhere before this task and remains so.
- **Future lifecycle (issue/approve/revoke/supersede):** untouched. `Certificate.status` remains
  `DRAFT` (schema default) for every certificate created by this flow; no code sets `ISSUED`,
  `REVOKED`, or `SUPERSEDED`.

## Final status

```text
CERTIFICATE MANAGEMENT IMPLEMENTATION
PASS

CODE CHANGES:
- apps/api/src/modules/calibration-jobs/certificate.service.ts
  (duplicate-file detection on upload/replace, compared against current version's checksum)
- apps/api/src/modules/calibration-jobs/certificate.service.test.ts
  (2 new tests: duplicate refused / older-version re-upload allowed)
- apps/portal/src/app/management/calibration-jobs/certificate-panel.tsx
  (Indonesian error message for CERTIFICATE_DUPLICATE_FILE)

SCHEMA CHANGES:
NONE

MIGRATIONS:
NONE

BUSINESS DECISIONS STILL OPEN:
1. Certificate.number is currently system-auto-allocated (DocumentNumberService, CER prefix),
   not manual physical-document input as the business-context docs describe. Preserved as-is
   per instruction; a future decision is needed on whether to switch to manual input, keep
   auto-allocation, or support both (external vs. system-generated certificates).
2. Whether the current "Sertifikat" accordion section / "Generate QR" placeholder should later
   move to a different navigation pattern is explicitly deferred — not part of this task's
   final scope.
3. Everything listed as a business decision in certificate-management-readiness-audit.md
   §"Business Decisions Still Required" remains open (QA-reject behavior on an existing
   certificate, cancelled-job reachability, what "issue" means operationally, etc.) — none of
   it was in this task's scope.

OUT OF SCOPE (unchanged, not implemented):
- Certificate issuance / approval / revocation / supersession workflows
- QR code generation, verificationToken usage, public verification endpoint
- Customer Portal certificate page
- Certificate.number policy redesign
- Any Prisma schema or migration change
```
