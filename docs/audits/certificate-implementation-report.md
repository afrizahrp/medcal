# Implementation Report: Certificate Lifecycle, Numbering and QR Verification

- **Date:** 2026-09-30
- **Branch:** `claude/certificate-lifecycle-audit-943f2e` (uncommitted working tree)
- **Inputs:** `certificate-lifecycle-audit.md`, `certificate-numbering-legacy-coexistence-audit.md`, and the locked business rules in the task.

## 1. Files changed

| Area | File | Change |
|---|---|---|
| Schema | `packages/db/prisma/schema.prisma` | `enum CertificateSource`, `Certificate.source`, `DocumentType.CERTIFICATE_GENERATED` |
| Migration | `packages/db/prisma/migrations/20260930100000_add_certificate_source_and_generated_number_type/migration.sql` | new |
| Numbering | `packages/db/src/document-number/document-number.service.ts` | `timeZone`, `skipExisting` (self-healing), `DocumentNumberCollisionError`, `DocumentNumberSequenceExhaustedError`, `MAX_COLLISION_ATTEMPTS`, `MAX_DOCUMENT_SEQUENCE` |
| Numbering | `.../format-document-number.ts` | `BUSINESS_TIME_ZONE`, `getZonedYearMonth`, optional `timeZone` |
| Numbering | `.../document-type-prefix.ts`, `document-type-table.ts`, `index.ts` | `CERTIFICATE_GENERATED` → `CRT` / `Certificate`; exports |
| Certificate | `apps/api/src/modules/calibration-jobs/certificate.service.ts` | rewritten upload flow, new `issueGenerated`, `getQrPng`, PDF render |
| Certificate | `certificate-number.ts` (new) | external number validation and CRT reservation |
| Certificate | `certificate-verification-token.ts` (new) | token generation and verification URL |
| Certificate | `certificate-pdf.ts` (new) | pdfkit + QR generated-certificate PDF |
| Certificate | `certificate-file-owner-policy.ts` | GENERATED lock once the PDF exists |
| Certificate | `calibration-jobs.controller.ts` | upload takes `certificateNumber`; `POST :id/certificate/issue`; `GET :id/certificate/qr` |
| Certificate | `audit-log.ts` | `recordAuditLog` accepts a transaction client |
| Files | `apps/api/src/modules/files/files.service.ts` | `getForAuthorizedRead` (owner-pinned read without a role) |
| Verification | `apps/api/src/modules/certificate-verification/*` (new) | service, controller, module; registered in `app.module.ts` |
| Capabilities | `apps/api/src/modules/me/me.controller.ts`, `packages/auth/src/me-types.ts` | `certificateIssue` |
| Management portal | `certificate-panel.tsx`, `use-certificate-query.ts`, `[id]/page.tsx` | number input, QR, issue button; placeholder `GenerateQrButton` removed |
| Customer portal | `app/(app)/verify/certificate/[token]/page.tsx` (new), `lib/certificate-verification.ts` (new), `app/(app)/certificate/[token]/page.tsx` | verification page; old path redirects |
| Dependency | `apps/api/package.json`, `pnpm-lock.yaml` | `qrcode@1.5.4`, `@types/qrcode` |
| Tests | see section 10 | |

## 2. Schema changes

- `Certificate.source CertificateSource NOT NULL DEFAULT 'UPLOADED'`. Existing rows take the default; no data is rewritten.
- `DocumentType` gains `CERTIFICATE_GENERATED`.
- `calibrationJobId @unique`, `@@unique([companyId, number])` and `verificationToken @unique` are unchanged. `number` stays `NOT NULL`.
- Drift check against the migrated test database: the only remaining diff is a pre-existing index rename on `DeviceCalibrationParameter`, unrelated to this work.

## 3. Numbering changes

- The generated namespace has its own document type, so the stored-prefix problem found in the audit cannot occur. The legacy `CERTIFICATE` type (`CER`) is untouched.
- `allocate` accepts `timeZone`. Certificates pass `Asia/Jakarta`, so both the counter year and the `MM` follow the Jakarta calendar. All other document types stay on UTC (asserted by a test).
- `skipExisting` (used only for generated certificates):
  - The first-use seed reads only exact `CRT/YYYY/MM/NNNNN` values, so malformed or over-long foreign values cannot break it.
  - If a produced number already exists, the counter **self-heals** inside the caller's transaction: it jumps past the highest well-formed existing `CRT/<year>/…` number (any month), then allocates again. However many contiguous legacy rows sit ahead of it, that costs one jump, and the healed counter commits with the transaction, so it is not poisoned for later calls. Attempts are bounded (`MAX_COLLISION_ATTEMPTS = 5`); past that, `DocumentNumberCollisionError` is thrown and everything rolls back.
  - Sequence exhaustion: when the counter would exceed `99999` the allocator throws `DocumentNumberSequenceExhaustedError` (with `documentType` and `year`). The certificate service maps it to 409 `CERTIFICATE_NUMBER_SEQUENCE_EXHAUSTED` and nothing is issued.
- The allocator is still the atomic `INSERT … ON CONFLICT … lastSequence + 1`. There is no `MAX + 1` allocation; the strict maximum is only read for first-use seeding and for the heal jump.
- Scope: per company, per year. The sequence continues across months and restarts each January.

## 4. Certificate lifecycle changes

- **UPLOADED:** created `ISSUED` at upload, with `issuedAt` and `verificationToken`. No Medcal number is allocated. `PO progress` counts `ISSUED`, so uploaded certificates now satisfy it.
- **GENERATED:** created only at issue (no draft row, no reserved number).
- **Immutable after issue:** `number`, `source`, `verificationToken` and `issuedAt` are written only in the issuing transaction. A later upload with a different number gets 409 `CERTIFICATE_NUMBER_IMMUTABLE`, and a GENERATED certificate refuses uploads (409 `CERTIFICATE_GENERATED_IMMUTABLE`). This is enforced in the service, not by a database trigger.

## 5. Upload flow

- `POST /calibration-jobs/:id/certificate/versions` takes multipart `file` plus `certificateNumber`.
- The filename is never parsed. The UI may pre-fill the field from the filename, and the user must confirm it.
- Validation:
  - trim, and collapse space runs
  - control and line-break characters rejected
  - at most 64 characters
  - charset `A-Za-z0-9 . _ / -`, starting with a letter or digit
  - any number starting with `CRT/` (any case or spacing) rejected
  - case and inner characters otherwise preserved verbatim
- Uniqueness within the company is case-insensitive, and 409 `CERTIFICATE_NUMBER_DUPLICATE` is returned. The unique index also backstops races.
- If the file upload fails after the row was created by the same request, the row is deleted, so no ISSUED certificate is left without a PDF.
- **Legacy `DRAFT` rows** (Medcal-allocated `CER/…` number, no token) are never renumbered, promoted or given a token by an upload. Any upload for such a job is rejected with 409 `CERTIFICATE_LEGACY_DRAFT_EXISTS`, and nothing is written (no file, no audit row). Correcting legacy records is a separate future task; no correction workflow was added. The management portal shows a notice and hides the upload control for these rows.
- **Attach failure:** if the FileObject is stored but attaching `pdfFileObjectId` fails, the row this request created is deleted, the stored file is discarded (`FilesService.discardUnreferenced`, an internal RBAC-free compensation that refuses referenced files), and a `FAILURE` audit row is written. The same discard applies when replacing a PDF fails, and when attaching a generated PDF fails.
- **Case sensitivity of numbers:** uniqueness is checked case-insensitively in the service (`abc-001` and `ABC-001` are treated as duplicates), while the database index stays case-sensitive. This follows the existing convention in the codebase (customers, device categories and others match case-insensitively in services with case-sensitive DB indexes). No `lower(number)` index was added. Two concurrent uploads that differ only by case could therefore both succeed; that residual race is accepted and documented.
- Replacing the PDF of an ISSUED uploaded certificate keeps the existing version-history behaviour.

## 6. Generated certificate flow

`POST /calibration-jobs/:id/certificate/issue` (permission `certificate:issue`):

1. Preconditions: job `ACCEPTED_BY_QA`, `deviceId` set, and the customer portal URL configured. Otherwise it fails before allocating anything.
2. One transaction: allocate `CRT/YYYY/MM/NNNNN`, link the latest APPROVED QualityReview if one exists, generate the token, create the row as `GENERATED` and `ISSUED`, and write `CERTIFICATE_ISSUED`.
3. After commit, and outside the numbering lock: render the PDF from the persisted row, store it as a `FileObject`, and link `pdfFileObjectId` (guarded so it is set once).
4. If rendering fails, the certificate stays `ISSUED` with its official number and no PDF. `CERTIFICATE_PDF_GENERATION_FAILED` is audited and returned. The same endpoint called again re-renders the PDF under the same number instead of issuing a second certificate.

## 7. QR / verification

- The QR encodes only `{NEXT_PUBLIC_CUSTOMER_PORTAL_URL}/verify/certificate/{verificationToken}`. The URL comes from the already-configured customer-portal origin (`.env.production.example` sets it to `https://customer.kalibrasimedika.co.id`). No development URL is invented.
- Token: 32 bytes from the OS CSPRNG, base64url (43 characters), not derived from any id or number, generated once at issue.
- Generated PDFs embed the QR. For uploaded certificates the external PDF is not rewritten; staff get the QR as a PNG (`GET :id/certificate/qr`, shown in the certificate panel) to print or attach.
- API:
  - `GET /certificate-verification/:token` returns `{ number, status, issuedAt, validUntil, customerName, device{name,brand,model}, pdfAvailable }`, with no internal ids or token.
  - `GET /certificate-verification/:token/pdf` streams the stored PDF and writes an audit row.
  - Status is `VALID`, `EXPIRED` (`validUntil` in the past), `REVOKED` or `SUPERSEDED`. A DRAFT row is treated as not found.
  - The PDF is served for `ISSUED` certificates only, including expired ones. It is withheld for `REVOKED` and `SUPERSEDED`.
- The customer portal page `/verify/certificate/[token]` shows the actual number and a status-specific message, and opens the PDF. The old `/certificate/[token]` path redirects to it.
- Not found is one constant response for a malformed token, an unknown token, a DRAFT row and a certificate that is not yours.

## 8. PDF

- `certificate-pdf.ts` (pdfkit, plus `qrcode` for the image) prints company, customer, device name/brand/model/serial/code, number, issue date, valid-until (only when set) and the QR with its URL. Dates use Asia/Jakarta.
- Fields the domain does not carry are not invented.
- **Not visually inspected:** there is no PDF rasteriser in this environment. The tests assert that a real PDF is produced, stored and downloadable, but the layout has not been looked at.

## 9. Security considerations

- The token is a locator, not a credential. Access needs a session, and then either a `CustomerUserLink` to the certificate's customer or a company member with `certificate:read`.
- Disabled users get the same not-found response.
- File reads are pinned to the owning certificate, so a file id cannot reach another owner's file.
- No user-controlled text reaches SQL. The dynamic table names are internal constants, as before.
- **No rate limiting** exists on the verification endpoints (the API has no throttler). The 256-bit token makes guessing infeasible, but limiting is a remaining gap.

## 10. Tests executed

New or updated:

- `packages/db`: `document-number.service.test.ts` (CRT mapping, Jakarta boundary, year restart, per-company independence, rollback safety, 25-way concurrency, single and contiguous collisions beyond the attempt bound with a committed heal, cross-month collisions, bounded failure via a fake transaction, 99999 boundary and typed exhaustion, malformed-seed immunity, UTC unchanged for other types) and `format-document-number.test.ts`.
- `apps/api`:
  - `certificate.service.test.ts` (50 tests): UPLOADED, GENERATED, verification, the legacy-DRAFT regression, unique-number race mapping, attach-failure compensation, contiguous legacy `CRT/` collisions, exhaustion mapping, and an HTTP layer (real `CompanyRoleGuard`, real controllers, real multipart) covering upload with `certificateNumber` (including a late field), rejection cases, 409s, issue, QR PNG, RBAC 403, and the verification routes (401, 200 minimal DTO, inline PDF, identical 404s).
  - `certificate-pdf.test.ts` (new): the PDF contains the actual number, identity fields and Jakarta dates; the QR encoder receives only the verification URL; an image is embedded; the URL is printed.
  - `certificate-number.test.ts` (new): number validation, CRT reservation, token, URL.
- `apps/customer-portal`: `certificate-verification.test.ts` and `open-pdf.test.ts` (new; the window opens before the fetch, popup-blocked fallback, cleanup on failure).

Final results:

| Suite | Test files | Tests |
|---|---|---|
| `@medcal/db` full | 5 passed / 0 failed | 53 passed / 0 failed / 0 skipped |
| `@medcal/api` full | 70 passed / 4 failed (74) | 1495 passed / 9 failed / 0 skipped (1504) |
| `@medcal/customer-portal` full | 3 passed / 0 failed | 15 passed / 0 failed |

The 9 failing API tests are in four files, none of which touch certificates or anything this change modified:

- `emails/imap-sync.service.test.ts` (5 tests, "IMAP is not configured")
- `push-tokens/notification-dispatch.service.test.ts` (2 tests, `push.resolvePushIconUrl is not a function`)
- `contact-messages/contact-messages.push.test.ts` (1 test)
- `whitelist/registration-origin-callers.test.ts` (1 test, a static check of `apps/tech-pwa/.../register/page.tsx`)

Causes: the 5 IMAP failures come from an empty `IMAP_PASS=` in the local `.env` copied into the worktree (with `IMAP_PASS=x` all 5 pass); the push-dispatch failures come from a test mock that lacks `resolvePushIconUrl`, which the source has called since commit `f264e95`; the contact-message failure is a missing mock reset between tests; the register-page failure is a static file scan. I could not run the baseline commit (its install failed on a Windows postinstall step), so pre-existence is established by inspection and the empirical IMAP check, not by a baseline run.

## 11. Build / typecheck

- `tsc --noEmit`: clean for `@medcal/api`, `@medcal/db` (including its tests), `@medcal/auth`, `@medcal/shared`.
- `@medcal/portal` and `@medcal/customer-portal` `tsc --noEmit` are clean (after `next build` generated the Next typings).
- `next build` succeeded for `@medcal/customer-portal` (including `/verify/certificate/[token]`) and `@medcal/portal`. `tsc -p` build succeeded for `@medcal/api`.

## 12. Migration performed

- Applied to the **test** database (`pkmdb_test`) by the test setup only.
- **Not applied** to the development database (`pkmdb`) or any other. Apply with `pnpm --filter @medcal/db migrate:deploy`.

## 13. Remaining gaps

- **Verification access model.** Verification follows the documented customer-portal decision: authenticated (customer link or staff), not anonymous. The brief's "scan and immediately view" therefore includes a sign-in, with `returnTo` preserving the destination. The customer-portal `AuthGate` also blocks staff who lack a customer link, although the API allows them. Making the page fully anonymous would be a separate decision.
- **QR host.** The QR uses `NEXT_PUBLIC_CUSTOMER_PORTAL_URL` (`https://customer.kalibrasimedika.co.id` in `.env.production.example`). `apps/customer-portal` is the deployed customer-facing app (own nginx block, container, `CustomerUserLink` gate) and the only place the `/verify/certificate/[token]` route exists. `portal.kalibrasimedika.co.id` is `apps/portal`'s undeployed "client" route group (no DNS; the nginx notes say it is not deployed) and has no verification route.
- **Authorization.** Uploading an external certificate keeps `certificate:update`, the locked 2026-09-25 matrix for TECHNICIAN_MANAGER, SUPERVISOR, ADMIN and GENERAL_MANAGER. Requiring `certificate:issue` as well would exclude three of those four roles from the upload flow they are locked to. `certificate:issue` (GENERAL_MANAGER and SUPERADMIN) gates only Medcal-generated issuance. No new permission was added.
- **Rate limiting (C7)** is deliberately not implemented in this pass; there is no throttling infrastructure in the API. The opaque 256-bit token is the anti-enumeration control. Future hardening item.
- **`validUntil` is never set** (no documented rule). `EXPIRED` works when a value exists, and the PDF omits the line when it is null.
- **Revoke / supersede flows are not implemented.** Verification already handles those statuses and withholds the PDF.
- **`billingStatus` does not change on issue.** The design docs say it should become `BILLABLE`. This task did not require it, so it is unchanged.
- **Existing legacy rows** keep their `CER/…` numbers and `DRAFT` status. Uploads for those jobs are rejected until a separate, audited correction task exists. There is no bulk import or automatic backfill.
- **Immutability is service-level**, with no database trigger.
- **Compensation is best-effort.** A process crash between creating the row and attaching the PDF can still leave an `ISSUED` row without a PDF; there is no reconciliation job.
- **Case-only duplicate race** (see section 5) is accepted.
- **PDF layout not visually verified.**
- **One incidental lockfile line** changed in `pnpm-lock.yaml` beyond the `qrcode` entries (a `jiti` peer-suffix re-resolution on a `vitest` entry).
- **Not committed.**
