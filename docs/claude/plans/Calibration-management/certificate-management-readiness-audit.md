# CERTIFICATE MANAGEMENT — READINESS AUDIT & DESIGN PROPOSAL

**Type:** Audit + design only. No code was modified to produce this document.
**Scope trigger:** `certificate-upload-pre-implementation.md` (same folder).

---

## 0. Framing correction from the audit

The pre-implementation brief assumes Certificate Management is entirely absent. That is true at the **service/API/UI/RBAC** layer, but **not** true at the **database schema** layer:

> `Certificate` is an existing Prisma model (`packages/db/prisma/schema.prisma:2969-3012`), already wired into `CalibrationJob` (1:1, unique FK), `QualityReview`, `FileObject`, `Company`, `Customer`, `Device`, `InvoiceCertificate`, `CreditNote`, and `ReminderEvent`. `FileOwnerType.CERTIFICATE` and the `CER` document-number prefix also already exist. None of it is read or written by any service, controller, or UI anywhere in the repo.

Per `architecture.md`'s Phase Continuity rule, this schema is a **previously-completed, accepted** piece of the domain — it is not something this design should redesign or second-guess. The job of this document is to design the API/service/UI/RBAC layer **on top of** the schema that already exists, and to flag the few places where that schema is genuinely ambiguous or incomplete (marked as gaps below), not to propose an alternative data model from scratch.

---

## 1. EXISTING ARCHITECTURE (audit findings)

### 1.1 Domain chain (schema-verified)

```
CalibrationRequest ─┐
                     ├─▶ Quotation ─▶ PurchaseOrder ─┐
                     │                                ├─▶ WorkOrder ─▶ CalibrationJob
                     └────────────────────────────────┘                     │
                                                                              ├─▶ MeasurementResult[]
                                                                              ├─▶ QualityReview[] (MT decision)
                                                                              ├─▶ KontrolAlat? (WOL intake, F.MU.08)
                                                                              └─▶ Certificate? (1:1, unique)
```

- `CalibrationJob` (`schema.prisma:2306-2422`) is the unit of work: one row per physical device unit under a `WorkOrderItem`.
- `CalibrationJobStatus` (`schema.prisma:182-188`): **PENDING → IN_PROGRESS → SUBMITTED → (REWORK loop) → ACCEPTED_BY_QA**. There is no terminal REJECTED/CANCELLED state — a QA reject sends the job back to REWORK, not to a dead end.
- `QualityReview` (`schema.prisma:2945-2963`) is the MT/QA decision record: `reviewerUserId`, `decision: APPROVE|REJECT`, `status: PENDING|APPROVED|REJECTED`, `notes` (mandatory on reject), `reviewedAt`. One `CalibrationJob` can have multiple `QualityReview` rows over its REWORK history (1:N).
- `Certificate` (`schema.prisma:2969-3012`): `calibrationJobId String @unique` — **hard 1:1 with CalibrationJob at the DB level, already decided**. Also carries `qualityReviewId?` (optional link to the QualityReview that justified issuance), `supersedesCertificateId?`/`supersededBy` (self-relation for cross-job revision chains, e.g. re-calibration), `pdfFileObjectId?` (single current PDF), `status: DRAFT|ISSUED|REVOKED|SUPERSEDED`, `billingStatus: UNBILLED|BILLABLE|INVOICED`, `number` (unique per `[companyId, number]`), `verificationToken?` (unique — presumably for the customer-portal QR/token flow).

### 1.2 Calibration Job lifecycle (service-verified)

All transitions live in `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts`, routed by `calibration-jobs.controller.ts`:

| Transition | Method | Actor | Effect |
|---|---|---|---|
| PENDING → IN_PROGRESS | `start()` | TECHNICIAN/TECHNICIAN_MANAGER | stamps `startedAt` |
| IN_PROGRESS → SUBMITTED | `submitForReview()` | technician | validates measurements complete, ref-equipment resolved, no pending identity correction |
| SUBMITTED → SUBMITTED (APPROVE) or → REWORK (REJECT) | `decideQualityReview()` | **TECHNICIAN_MANAGER only** | REJECT nulls `submittedAt`, increments `currentAttempt`, requires `notes` |
| REWORK → IN_PROGRESS | `resumeAfterRework()` | technician | does not re-increment attempt |
| SUBMITTED → ACCEPTED_BY_QA | `complete()` | technician | requires latest `QualityReview.status === APPROVED` |

No Certificate-related transition or field exists anywhere in this service (confirmed by grep — the only "certificate" hit is `KontrolAlat.certificateNumber`, an unrelated free-text field, see §1.6).

### 1.3 MT vs QA — actor clarification

MT ("Technical Review") and QA ("Quality Review") are **the same actor and the same entity** in this codebase: `TECHNICIAN_MANAGER` is the sole decider on `QualityReview`, both for the AKD/AKL gate and for the main job-completion gate. There is no separate "QA" role or "QA" entity distinct from `QualityReview`/`TECHNICIAN_MANAGER`. The brief's "MT / Technical Review → QA Approval" is, in this codebase, one step: `decideQualityReview`.

### 1.4 Portal UI (Calibration Job Detail)

`apps/portal/src/app/management/calibration-jobs/[id]/page.tsx` — a single Radix `Accordion type="multiple"` (not tabs). Order: `kontrol-alat` → `identity` → `ref-equipment` → `measurement` (contains `QualityReviewPanel`, the MT approve/reject UI) → `corrections`. Header shows `JobStatusBadge` and, only when `status === ACCEPTED_BY_QA`, an `<LkDownloadButton>`. There is currently no Certificate-adjacent section anywhere in this page.

### 1.5 Generic file infrastructure (already built, reusable)

A complete, owner-agnostic file subsystem exists under `apps/api/src/modules/files/`:

- **Storage**: `StorageDriver` interface + `LocalDiskDriver` (local disk today, `FILES_ROOT` env var, path-traversal-hardened, temp-write-then-atomic-rename, deterministic key `{companyId}/{ownerType}/{ownerId}/{fileId}{ext}`). Interface is explicitly designed so an S3/MinIO driver can be swapped in later without touching callers.
- **Metadata**: `FileObject` model — `ownerType: FileOwnerType`, `ownerId`, `storageKey` (unique), `mimeType`, `sizeBytes`, `originalName`, `checksum` (sha256), `uploadedByUserId`.
- **Generic endpoints**: `POST /files` (multipart, body `{ownerType, ownerId}`), `GET /files/:id` (streams with `Content-Disposition: attachment`), `DELETE /files/:id`. All company-scoped in the lookup query itself (`prisma.fileObject.findFirst({ where: { id, companyId } })` — cross-company id is a plain 404, never a leak).
- **Owner-policy plug point**: `FileOwnerPolicyRegistry` — each business module registers exactly **one** `FileOwnerPolicy` per `ownerType`: `{ permissionResource, readAction?, writeAction?, fileTypePolicy, resolveOwner(companyId, ownerId) → { exists, locked } }`. Authorization is **not** a separate `file:*` grant — it is delegated to the owning record's own RBAC resource+action. `locked: true` (owner record finalized) makes upload/replace/delete return `409 FILE_OWNER_LOCKED`.
- **Currently registered policies**: `IDENTITY_CORRECTION` and `EQUIPMENT_CALIBRATION` only. `EQUIPMENT_CALIBRATION`'s policy (`equipment-calibration-file-owner-policy.ts`) is a near-exact template for what a `CERTIFICATE` policy would look like: PDF-only, 10 MiB cap, `resolveOwner` does a `findFirst` scoped by `companyId`, `locked` derived from the owner's own status enum.
- **`FileOwnerType.CERTIFICATE` already exists in the enum** but has no registered policy — today, calling `POST /files` with `ownerType: "CERTIFICATE"` fails with `400 FILE_OWNER_TYPE_UNSUPPORTED`.
- **No precedent for "generate once, persist as FileObject, serve from storage on later reads."** Every existing PDF (LK result, Kontrol Alat, Work Order, Quotation, PO) is generated on the fly with `pdfkit` on every GET and never persisted. A Certificate feature that stores an uploaded/issued PDF via `Certificate.pdfFileObjectId` would be the first "upload once, download many times" document in this codebase.
- **Step-up download precedent**: `LkDownloadAuthorization` + `LkDownloadService` — password re-auth mints a single-use, 5-minute token before the actual LK PDF GET. This is the closest existing analogue for a security-sensitive certificate download, though today it is LK-specific, not generalized.

### 1.6 The pre-existing manual certificate number field

`KontrolAlat.certificateNumber String?` (`schema.prisma:2462`) is a free-text field the WOL intake form lets someone type the certificate number into manually, "after MT APPROVE." It is **not linked to the `Certificate` model** in any way (no FK). This is a duplicate/legacy placeholder, not a mechanism to build on — flagged as a gap in §4.

### 1.7 AuditLog

`AuditLog` (`schema.prisma:3219-3245`): generic, explicitly documented as reusable — `action` is a free-form string (no enum, no migration needed for a new action name), `outcome: SUCCESS|FAILURE`, `targetType`/`targetId` free-form, `metadata: Json?`. Writer helper `apps/api/src/modules/calibration-jobs/audit-log.ts` exports named action-constant maps as the convention (e.g. `LK_DOWNLOAD_ACTIONS`). Currently only `LK_DOWNLOAD_REAUTH`, `LK_DOWNLOAD`, `CALIBRATION_JOB_WORKSHEET_REVISE` are logged. Adding `CERTIFICATE_UPLOADED` etc. requires **zero schema change** — just new string constants and call sites following the same pattern.

### 1.8 RBAC

- `certificate: ["read", "create", "update", "issue"]` already declared in the resource catalog (`packages/auth/src/access-control.ts:188`) — **but no action for `delete`**, and file-specific actions (upload/download as distinct from read/update) don't exist as separate grants anywhere in this codebase's convention (files reuse the owner's read/update, per §1.5).
- **No `RolePermission` rows are seeded for `certificate:*` for any concrete operational role.** Only the hardcoded `SUPERADMIN` bypass and the `GENERAL_MANAGER` "mirror everything" catalog (`seed-role-permissions.ts:335`) currently reach it. `TECHNICIAN_MANAGER`, `ADMIN`, `FINANCE`, `CUSTOMER_SERVICE` have **no** certificate grants seeded today — this is a business decision waiting to be made (§7), not a technical gap.
- Enforcement pattern: `CompanyRoleGuard` + `@RequirePermission(resource, action)` decorator on backend routes; `hasPermission(role, resource, action)` reads an in-memory cache seeded from `RolePermission`. Frontend uses `capabilities?.<resource><Action>` booleans from `/me` for show/hide only — never the actual authorization boundary.

### 1.9 Customer-portal placeholder (confirms deferred-by-design)

`apps/customer-portal/src/app/(app)/certificate/[token]/page.tsx` is an explicit placeholder route with a comment stating it deliberately does not look up or expose certificate data, deferring "certificate API/authorization work" to a future phase. This confirms the schema was intentionally pre-modeled ahead of the feature.

---

## 2. GAP ANALYSIS

| Area | Existing | Required for Certificate | Gap |
|---|---|---|---|
| Data model (Certificate, cardinality, supersession) | Full model already in schema, 1:1 with CalibrationJob | Same | **NO GAP** — reuse as-is |
| File metadata model (FileObject) | Generic, owner-agnostic, already supports `CERTIFICATE` enum value | Same | **NO GAP** — reuse as-is |
| Storage driver | Local disk, path-safe, swappable interface | Same | **NO GAP** — reuse as-is |
| File owner-policy registration | Registry + pattern exist; `CERTIFICATE` unregistered | Register one `FileOwnerPolicy` for `CERTIFICATE` | **MINOR GAP** — new file, follows existing template exactly |
| Persisted (not-regenerated) document pattern | No precedent; all PDFs are generate-on-GET | Certificate PDF must persist across downloads | **MEDIUM GAP** — new pattern, but `FileObject` already supports it structurally |
| Certificate service/API module | Does not exist | Upload/replace/delete/download/list/(optionally issue) endpoints | **MEDIUM GAP** — net-new module, but scaffolds around existing `FilesService`/`CalibrationJob` patterns |
| Certificate lifecycle states beyond DB enum | `CertificateStatus: DRAFT/ISSUED/REVOKED/SUPERSEDED` exists but no service ever sets it | Distinguish "file exists" vs "certificate approved" vs "certificate final/issued" (§3) | **BUSINESS DECISION REQUIRED** — see §3 |
| QA/upload independence | QA (`QualityReview`) and `Certificate` are already separate models/tables with only an optional FK | Confirm no code path makes them dependent — **there is none, because neither exists yet** | **NO GAP** at the technical level; must be preserved as a design constraint going forward |
| RBAC actions for certificate | `read/create/update/issue` declared; no `delete`; no seeded grants for any operational role | Decide which roles get upload/view/download/replace/delete/approve | **BUSINESS DECISION REQUIRED** (roles) + **MINOR GAP** (missing `delete` action if delete is wanted) |
| Audit log actions | Generic, free-form `action` string, proven pattern | `CERTIFICATE_UPLOADED/REPLACED/DELETED/DOWNLOADED/APPROVED/REJECTED` | **NO GAP** — additive, no migration |
| Download authorization (cross-job leak prevention) | `FilesService` already scopes every lookup by `companyId` and re-derives owner via `resolveOwner`; step-up re-auth precedent exists for LK | Certificate policy's `resolveOwner` must key off `Certificate.id`/`companyId`, not a client-supplied job id | **NO GAP** if the `CERTIFICATE` policy follows the existing `resolveOwner` contract |
| UI insertion point | Portal job-detail page is an accordion with a clear "after measurement/QA" slot; no existing document-center pattern to imitate | New "Certificate" accordion section | **MINOR GAP** — new section, but the surrounding convention (accordion + capability-gated buttons, cf. `LkDownloadButton`) is directly reusable |
| Duplicate/legacy certificate number field | `KontrolAlat.certificateNumber` free-text, unlinked to `Certificate` | Should not become a second source of truth for cert numbers | **BUSINESS DECISION REQUIRED** — see §4 |

---

## 3. THE THREE-WAY DISTINCTION (file exists vs approved vs final/issued)

The brief requires this to be unambiguous. Mapping onto what already exists in the schema:

- **"File exists"** = a `FileObject` row exists with `ownerType: CERTIFICATE`, `ownerId: <Certificate.id>`, and `Certificate.pdfFileObjectId` points to it. This is exactly what "Upload Certificate" produces. It says nothing about QA or approval.
- **"QA approved"** = `QualityReview.status === APPROVED` for the job (and, if `Certificate.qualityReviewId` is set, specifically the review that record points to). This is entirely independent of whether a `Certificate`/`FileObject` exists at all.
- **"Certificate is final/issued"** = `Certificate.status === ISSUED` (with `issuedAt` set). The schema already has a `DRAFT` status to represent "uploaded but not yet finalized," distinct from `ISSUED`.

So the schema **already has enough vocabulary** to represent all three states without contradiction, *provided* the service layer is careful to keep them decoupled:

```
Upload happens          →  Certificate row created/updated, status = DRAFT, pdfFileObjectId set
                            (independent of QualityReview.status)

QA approves the job     →  QualityReview.status = APPROVED
                            (does NOT touch Certificate.status)

Someone explicitly       →  Certificate.status = ISSUED, issuedAt = now()
issues the certificate     (a distinct, deliberate action — not implied by upload or by QA approval)
```

This third action ("issue") is **not defined by the brief** — the brief only asks for upload independent of QA. Whether "issuing" is a manual button, an automatic side effect of QA approval, or doesn't exist as a distinct step yet, is a **BUSINESS DECISION REQUIRED** (the `certificate:issue` permission already sits unused in the RBAC catalog, suggesting it was anticipated but never specified).

---

## 4. CERTIFICATE OWNERSHIP (Option A/B/C/D evaluation)

- **Option A — Certificate → CalibrationJob: CORRECT, and already the schema's decision** (`calibrationJobId String @unique`). `CalibrationJob` is the unit that actually gets calibrated, measured, and reviewed — it is the natural owner of "the calibration result document." `WorkOrder` and `CalibrationRequest` are commercial/administrative aggregates over potentially many jobs/devices; a certificate is per physical unit, per calibration event, which is exactly what `CalibrationJob` represents.
- **Option B/C rejected**: `WorkOrder` can fan out into multiple `CalibrationJob`s (one per device unit); a `WorkOrder`-owned certificate could not express "this specific unit's certificate," and `CalibrationRequest` is even further upstream (pre-quotation). Neither has the right cardinality for a single calibration result document.
- **Option D (indirect)**: not needed — the existing 1:1 `Certificate.calibrationJobId` is direct and already enforced by a DB unique constraint.

**Conclusion: ownership is Option A, and it is not actually an open design question — it is an existing, accepted schema decision.** This document treats it as a Phase Continuity invariant to preserve, not a choice to re-litigate.

Traceability/query implication: `Certificate` can always be reached via `calibrationJobId` (1 query), and `resolveOwner(companyId, ownerId=certificateId)` for the file-owner-policy would do `certificate.findFirst({ where: { id, companyId }, select: { calibrationJobId: true, ... } })` — company-scoped, no job-id trust required from the client.

---

## 5. CARDINALITY

**CalibrationJob : Certificate is 1:1**, enforced today by `@unique` on `Certificate.calibrationJobId`. This is **not ambiguous** — it is a hard DB constraint already in the accepted schema. Re-upload/replace within the same job's certificate lifecycle is modeled as **updating the same `Certificate` row's `pdfFileObjectId`** (new `FileObject` uploaded, old one either kept for audit trail or deleted — a business decision, §9 Case 5), not as multiple `Certificate` rows per job.

Cross-job revision (e.g. a device is recalibrated later, producing a new `CalibrationJob` and a new `Certificate` that should invalidate the old one) is modeled separately via `supersedesCertificateId`/`supersededBy` — a **different** mechanism from same-job file replacement. This reconciles the apparent tension between "1:1 unique" and "certificates can be revised": revision-across-jobs uses supersession (new Certificate row, new Job), while revision-within-a-job's-lifecycle uses in-place file replacement on the same Certificate row.

**One thing genuinely ambiguous and requiring a decision:** whether replacing the uploaded file (same job, same `Certificate` row) should retain a history of prior `FileObject`s (audit trail of what was uploaded before) or simply overwrite/delete the old one. The schema's `pdfFileObjectId` is a single scalar FK — it does not itself support a file history list. Flagged as `BUSINESS DECISION REQUIRED` in §9.

---

## 6. PROPOSED DATA MODEL

**No schema changes are being proposed as new models** — the existing `Certificate` and `FileObject` models are sufficient. The only two migrations even worth naming as candidates (not proposed for creation now) are additive and optional:

| Field/change | Purpose | Required? | Source |
|---|---|---|---|
| *(none — reuse `Certificate` as-is)* | Certificate business record | N/A | `schema.prisma:2969` |
| *(none — reuse `FileObject` as-is)* | Physical file storage metadata | N/A | `schema.prisma:3176` |
| Optionally: `certificate: [...,"delete"]` added to the RBAC resource catalog | Only if "Delete Certificate" is decided to be a distinct grantable action rather than reusing `update` | Business decision | `access-control.ts:188` |
| Optionally: a `CertificateFile`/history join if replace-history is required | Only if "keep every previously uploaded file, not just the current one" is decided | Business decision | none today |

Everything else needed (uploader = `FileObject.uploadedByUserId`, upload timestamp = `FileObject.createdAt`, storage metadata = `FileObject.{storageKey,mimeType,sizeBytes,checksum}`, approver linkage = `Certificate.qualityReviewId` → `QualityReview.reviewerUserId`/`reviewedAt`) already exists.

---

## 7. PROPOSED FILE MODEL

Use the **existing generic Attachment/File infrastructure**, not a bespoke one:

```
Certificate (business record: number, status, billingStatus, calibrationJobId, qualityReviewId, pdfFileObjectId)
      ↓ pdfFileObjectId
FileObject (ownerType=CERTIFICATE, ownerId=Certificate.id, storageKey, mimeType, sizeBytes, checksum, uploadedByUserId)
      ↓ storageKey
LocalDiskDriver (physical bytes on disk under FILES_ROOT)
```

This is justified because Certificate's needs (lifecycle, ownership, audit, security) are **already representable** by the existing `Certificate` model (lifecycle/ownership) + `FileObject`/`FileOwnerPolicy` (file security/audit) combination — there is no need for, and the brief explicitly warns against, inventing a parallel generic-attachment shortcut that would bypass `Certificate`'s own status/approval fields.

---

## 8. PROPOSED API (contract only, no endpoints created)

Following the project's existing convention: business-resource-scoped mutations live under the resource's own controller (`calibration-jobs.controller.ts` pattern: `POST /calibration-jobs/:id/...`), while the actual file bytes flow through the generic `/files` endpoints once a `Certificate` row and its `FileOwnerPolicy` exist. Two realistic shapes, evaluated:

### Shape 1 (recommended) — Certificate record via calibration-jobs module, bytes via generic `/files`

| Endpoint | Purpose | Actor | Permission | QA dependency |
|---|---|---|---|---|
| `POST /calibration-jobs/:id/certificate` | Create the `Certificate` row for this job if absent (idempotent "ensure exists"), or return existing | uploader role(s), TBD §11 | `certificate:create` | **None** — must succeed regardless of `QualityReview.status` |
| `POST /files` `{ownerType:"CERTIFICATE", ownerId:<certificateId>}` | Upload/replace the PDF, sets `Certificate.pdfFileObjectId` | same | delegated via `CERTIFICATE` `FileOwnerPolicy.writeAction` → `certificate:update` | **None** |
| `GET /calibration-jobs/:id/certificate` | Fetch certificate metadata + status for the job detail view | any role with job read access | `certificate:read` | n/a |
| `GET /files/:id` | Download the PDF bytes | same | delegated via `CERTIFICATE` policy `readAction` → `certificate:read` | n/a |
| `DELETE /files/:id` | Remove the current file (not the Certificate record) | restricted role, TBD | delegated → `certificate:update` (or new `certificate:delete`, business decision) | n/a |
| `PATCH /calibration-jobs/:id/certificate` or `POST .../certificate/issue` | Set `status: ISSUED`, `issuedAt` — the deliberate "finalize" action from §3 | restricted role, TBD | `certificate:issue` (already declared, unused) | **Business decision**: should this require QA approved? (not specified by brief — do not assume) |

**Error cases to design for (not implement):** `404` if job/certificate not found or wrong company; `409 FILE_OWNER_LOCKED` if a "locked" state is later defined (e.g. after `ISSUED`, should replace be blocked? — business decision, see Case 5); `400 FILE_OWNER_TYPE_UNSUPPORTED` disappears once the policy is registered; `403` if role lacks the resolved permission.

### Shape 2 (rejected) — bespoke certificate-only upload endpoint bypassing `/files`

Would duplicate storage-key generation, checksum, MIME validation, and path-traversal protection that `FilesService` already centralizes. Rejected for violating "prefer existing Medcal patterns" (`implementation-scope.md`).

---

## 9. CRITICAL API RULE — QA independence (compliance check)

The proposed contract in §8 satisfies the hard rule:

```
CalibrationJob, QA = NOT APPROVED
        ↓
POST /calibration-jobs/:id/certificate  (create Certificate row if absent)
        ↓
POST /files {ownerType: CERTIFICATE, ownerId: certificateId}
        ↓
SUCCESS — no read of QualityReview.status anywhere in this path
```

Nothing in the existing `CERTIFICATE`-equivalent `FileOwnerPolicy` template (`resolveOwner`) needs to inspect `QualityReview` at all — `resolveOwner` for `CERTIFICATE` only needs to confirm the `Certificate` row exists and is not `locked` (locked being a certificate-status concept, e.g. `REVOKED`/`SUPERSEDED`, not a QA concept). This keeps upload and QA approval structurally uncoupled, matching the brief's non-negotiable rule. Symmetrically, `decideQualityReview()` (the QA approve/reject transition) must **not** be modified to touch `Certificate.status` — approving a job's QA review should never implicitly flip `Certificate.status` to `ISSUED`.

---

## 10. PROPOSED UI

Insertion point: a new accordion item in `apps/portal/src/app/management/calibration-jobs/[id]/page.tsx`, placed **after** the `measurement` section (which contains `QualityReviewPanel`) — mirroring how `LkDownloadButton` is already surfaced in the header once `ACCEPTED_BY_QA`, but the Certificate section itself must be **visible and interactive regardless of job status**, per the hard rule. Proposed contents, using existing components/conventions (`Section`/accordion, capability-gated buttons like `LkDownloadButton`):

- Upload button — capability-gated by `certificate:create`/`certificate:update`, **never** hidden for QA-not-approved (only hidden if the role genuinely lacks the RBAC grant).
- Current certificate display: file name, upload date (`FileObject.createdAt`), uploader (`FileObject.uploadedByUserId` → user name), certificate status badge (`Certificate.status`).
- A non-blocking warning banner exactly as the brief allows: *"QA review belum approved. Certificate tetap dapat di-upload."* — shown only when `QualityReview.status !== APPROVED`, never a disabled state.
- Download button — capability-gated by `certificate:read`.
- Replace button — re-uses the same upload action against the existing `Certificate` row.
- Delete button — shown only if a delete permission is decided (§ RBAC gap above).
- Approval/issued indicator — reflects `Certificate.status` (DRAFT/ISSUED/etc.), kept visually distinct from the existing `QualityReviewPanel`'s own APPROVE/REJECT indicator so users don't conflate "QA approved the job" with "certificate is issued."

Tech-PWA and customer-portal are out of scope for upload (upload is portal/MT-side per the existing module split where all QA/MT actions are portal-only), but both are plausible **read-only** consumers later (technician reference view; customer-portal's already-placeholdered `/certificate/[token]` route) — not required by this task's scope.

---

## 11. RBAC PROPOSAL (design, not a permission change)

| Action | Plausible role(s) | Rationale |
|---|---|---|
| Upload / Create | TECHNICIAN_MANAGER, ADMIN | MT already owns the job-detail portal page's write actions; ADMIN is the other portal write role seen elsewhere (Kontrol Alat) |
| View | TECHNICIAN_MANAGER, ADMIN, GENERAL_MANAGER, FINANCE (billing relevance via `billingStatus`) | broad read makes sense given `Certificate` already links into `InvoiceCertificate`/`CreditNote` |
| Download | same as View | download reuses `certificate:read` per the file-owner-policy convention — no separate grant |
| Replace | same as Upload | same write action as upload (`certificate:update`) |
| Delete | **undecided** — no `delete` action exists in the RBAC catalog for `certificate` today | needs an explicit decision: reuse `update`, or add `delete` |
| Approve/Issue | TECHNICIAN_MANAGER only, mirroring `decideQualityReview`'s sole-approver pattern — **or** left completely undefined until "issuing" is specified (§3) | `certificate:issue` already exists unused in the catalog, suggesting this was anticipated |

None of the above are proposed as actual `RolePermission` seed rows in this document — they are candidates for the eventual implementation task to confirm with the business owner.

---

## 12. STORAGE / SECURITY DESIGN

**Upload** (reusing `FilesService.upload` + a new `CERTIFICATE` `FileOwnerPolicy`):
- Auth: `CompanyRoleGuard` (session + membership) already wraps `/files`; the policy's `writeAction` resolves to `certificate:update` (or `create`, TBD).
- MIME/extension: PDF-only, following the `EQUIPMENT_CALIBRATION` policy's exact shape (`{mimeTypes:["application/pdf"], extensions:[".pdf"], maxBytes: <TBD, likely 10MiB like the equipment-calibration precedent>}`).
- Filename sanitization: already handled generically (`originalName` truncated to 255 chars; `Content-Disposition` filename stripped of CR/LF/quotes in `files.controller.ts:76`).
- Storage path: deterministic `{companyId}/CERTIFICATE/{certificateId}/{fileId}.pdf` via existing `buildStorageKey` — already path-traversal-hardened.
- Path traversal: already handled by `LocalDiskDriver`'s allow-listed key segments.

**Download**: the existing `FilesService.getForDownload` already implements "user has access to the owning record ⇒ user may access the file," because `resolveOwner(companyId, fileObject.ownerId)` re-derives the `Certificate` row from the file's own `ownerId`, company-scoped — a client cannot swap in a different `ownerId`/certificate to read someone else's file by guessing a job id, because the lookup never trusts a client-supplied job id in the first place; it trusts the `FileObject.ownerId` that was set at upload time and re-validates existence+company scope on every read. This directly satisfies Case 6 in §13 **for free**, without new work, as long as the `CERTIFICATE` policy's `resolveOwner` does a proper `companyId`-scoped `findFirst`.

Whether certificate download additionally deserves the LK-style step-up re-auth (`LkDownloadAuthorization`) is a **business decision** — the brief doesn't ask for it, and the existing mechanism is scoped to LK PDFs specifically; generalizing it is a larger, separate design question not implied by "audit + design the certificate feature."

---

## 13. EDGE CASES

| Case | Verdict | Basis |
|---|---|---|
| 1. QA not approved, certificate not uploaded | Valid — default/initial state | no constraint violated |
| 2. QA not approved, certificate uploaded | **Valid**, per the brief's hard rule | no code path couples them |
| 3. QA approved, certificate uploaded | Valid — the "happy path" toward eventual issuance | — |
| 4. QA rejected, certificate already uploaded | **BUSINESS DECISION REQUIRED** — does a QA reject (job → REWORK) invalidate/flag the existing certificate file, or leave it untouched pending re-upload? Nothing in the schema models this relationship today. | not specified by brief |
| 5. Certificate uploaded, then replaced | **BUSINESS DECISION REQUIRED** — keep the old `FileObject` (history) or delete it? Current `Certificate.pdfFileObjectId` is a single scalar, no history list. | §5 |
| 6. Access Certificate A through Job B | **Blocked by design**, if the `CERTIFICATE` `FileOwnerPolicy.resolveOwner` is implemented per §12 (never trusts a client-supplied job id, only the `FileObject.ownerId` set at upload time, re-checked company-scoped) | §12 |
| 7. Job cancelled, certificate already uploaded | **BUSINESS DECISION REQUIRED** — note `CalibrationJobStatus` has no CANCELLED value today (only PENDING/IN_PROGRESS/SUBMITTED/REWORK/ACCEPTED_BY_QA), so this case may not even be reachable in the current lifecycle; flag rather than assume | schema fact |
| 8. QA approved, certificate does not exist | **BUSINESS DECISION REQUIRED** — is this a valid interim state (upload happens later), a warning, or blocking `complete()`/`ACCEPTED_BY_QA`? The brief's independence rule suggests it should be *allowed* (a job can reach ACCEPTED_BY_QA before a certificate is ever uploaded), but this should be confirmed, not assumed | brief's spirit vs. explicit silence |

---

## 14. EXISTING PATTERNS TO REUSE

| Existing pattern | Reusable for Certificate | Reason |
|---|---|---|
| `EQUIPMENT_CALIBRATION` `FileOwnerPolicy` | **Directly**, as the template for a new `CERTIFICATE` policy | Same shape: PDF-only, permission-resource delegation, `locked` derived from owner status |
| Generic `FilesService`/`FilesController` (`POST/GET/DELETE /files`) | **Directly** | No need for bespoke upload/download/delete plumbing |
| `AuditLog` + `apps/api/.../audit-log.ts` action-constant convention | **Directly** | Additive, zero migration, same helper |
| `DocumentNumberService.allocate(..., documentType: "CERTIFICATE")` | **Directly**, for generating `Certificate.number` at issuance time | `CER` prefix and `Certificate` table mapping already registered in `document-type-prefix.ts`/`document-type-table.ts`, unused |
| `LkDownloadButton` + capability-gated header button pattern | **As a UI template**, not the re-auth mechanism itself (that's a separate business decision, §12) | Establishes the "status-conditional but not RBAC-hidden" button convention used elsewhere |
| Portal job-detail accordion section convention | **Directly**, for placing the new Certificate section | Only existing structural convention for job-detail sub-panels |
| `QualityReviewPanel`'s capability-gate pattern (`capabilities?.calibrationJobDecideQualityReview` + status guard) | **As a pattern**, not literally — Certificate's gating must explicitly *not* depend on job/QA status the way this panel's does | Shows how to combine RBAC capability + business-status guard; Certificate needs the RBAC half only |
| `KontrolAlat.certificateNumber` | **Not reusable — should be reconciled/retired**, not extended | Free-text, unlinked to `Certificate`, a legacy duplicate (§1.6) |

---

## FINAL REPORT

## CERTIFICATE MANAGEMENT READINESS AUDIT

### Existing Certificate Implementation

```
NOT IMPLEMENTED at the API/service/UI/RBAC layer.
Schema-level data model (Certificate, FileObject, FileOwnerType.CERTIFICATE,
CER document-number prefix) already exists and is unused.
```

### Existing Infrastructure Relevant to Certificate

- `Certificate` Prisma model, fully fielded, 1:1 with `CalibrationJob`
- `FileObject` generic file metadata model + `FileOwnerType.CERTIFICATE` enum value
- `FilesService`/`FilesController` generic upload/download/delete endpoints
- `FileOwnerPolicyRegistry` + `FileOwnerPolicy` plug-in pattern (template: `equipment-calibration-file-owner-policy.ts`)
- `LocalDiskDriver` storage (swappable interface, path-traversal-hardened)
- `AuditLog` generic, free-form-action audit trail
- `DocumentNumberService` with `CER` prefix already registered
- `QualityReview` (MT/QA decision record) — separate table, only optionally linked via `Certificate.qualityReviewId`
- Portal job-detail accordion UI pattern; `LkDownloadButton` capability-gated button pattern
- `LkDownloadAuthorization` step-up re-auth pattern (not required, but available as a precedent)

### Recommended Certificate Ownership

`CalibrationJob` (Option A) — already the schema's decision (`calibrationJobId @unique`), not an open question. Preserve as an architectural invariant.

### Recommended Cardinality

`CalibrationJob : Certificate = 1:1`, already enforced by a DB unique constraint. Same-job file replacement = update the existing `Certificate` row's `pdfFileObjectId`; cross-job revision = the existing `supersedesCertificateId` chain on a *new* `Certificate`/`CalibrationJob`. Whether replaced files should retain history is `BUSINESS DECISION REQUIRED`.

### Upload Dependency on QA

```
INDEPENDENT
```
Confirmed achievable with zero coupling: the proposed `CERTIFICATE` `FileOwnerPolicy.resolveOwner` never needs to read `QualityReview`, and `decideQualityReview()` must not be modified to touch `Certificate`.

### QA Relationship

`QualityReview` and `Certificate` are separate tables connected only by an optional `Certificate.qualityReviewId` FK — QA approval is available as *context* for a certificate (e.g., which review justified issuance) but is structurally incapable of blocking or implying upload under the proposed design.

### Required Components

- Register a `CERTIFICATE` `FileOwnerPolicy` (new file, template already exists)
- A `certificates`/`calibration-jobs` service extension exposing `ensure certificate exists for job` + `get certificate for job` + `issue` (name/route TBD at implementation time)
- New RBAC `RolePermission` seed rows for whichever roles are decided (§11)
- New Portal UI accordion section + upload/download/replace/(delete) controls
- New `AuditLog` action constants (`CERTIFICATE_UPLOADED`, etc.)

### Existing Components Reusable

`FilesService`, `FilesController`, `FileOwnerPolicyRegistry`, `LocalDiskDriver`, `AuditLog` + its helper, `DocumentNumberService` (`CER` prefix), portal accordion/button conventions, `EQUIPMENT_CALIBRATION` policy as a direct template.

### Gaps

See §2 gap table. Summary: everything at the schema/storage/audit layer is either NO GAP or MINOR GAP (register a policy, add UI section). The only MEDIUM GAP is the "persist rather than regenerate" document pattern, which is new to this codebase but structurally supported by `FileObject` already.

### Business Decisions Still Required

1. Which roles get upload / view / download / replace / delete / issue (§11).
2. Whether "Delete Certificate" needs a distinct `certificate:delete` RBAC action or reuses `update`.
3. Whether file replacement retains history of prior uploads or overwrites in place (Case 5).
4. What "issue" means operationally and whether it depends on QA approval (§3) — the brief only mandates upload-independence, not issue-independence.
5. Behavior when QA rejects a job that already has an uploaded certificate (Case 4).
6. Behavior/reachability of a cancelled job with an uploaded certificate (Case 7 — may be moot since no CANCELLED status exists on `CalibrationJobStatus` today).
7. Whether `QualityReview.status === APPROVED` with no certificate uploaded is meant to block `complete()`/`ACCEPTED_BY_QA` or remain fully allowed (Case 8).
8. What to do about the legacy, unlinked `KontrolAlat.certificateNumber` free-text field once real Certificates exist (§1.6/§14).
9. Whether certificate download warrants a step-up re-auth like LK downloads, or the standard RBAC-gated download is sufficient (§12).

### Recommended Implementation Sequence

```
Phase 1 — Register CERTIFICATE FileOwnerPolicy (backend, no schema change)
Phase 2 — Certificate ensure/get/(issue) service methods + controller routes on
          the calibration-jobs (or a small new certificates) module
Phase 3 — RBAC: decide + seed RolePermission rows for certificate actions
Phase 4 — AuditLog action constants + call sites (upload/replace/delete/download/
          approve/reject as applicable)
Phase 5 — Portal UI: new Certificate accordion section on the Calibration Job
          detail page (upload/view/download/replace controls, QA-status warning
          banner, never hidden by QA state)
Phase 6 — Resolve the business decisions in the list above before finalizing
          Phase 2/5 behavior for edge cases 4/5/7/8
Phase 7 — Testing (Vitest, per .claude/rules/testing.md) — unit tests for the
          FileOwnerPolicy, service methods, RBAC gating; integration test for
          cross-job access denial (Case 6) and QA-independent upload (Case 2)
```

### Code Changes

```
NONE
```

This document is audit + design only. No Prisma schema, migration, API, service, controller, frontend, seed, permission, or storage code was modified.
