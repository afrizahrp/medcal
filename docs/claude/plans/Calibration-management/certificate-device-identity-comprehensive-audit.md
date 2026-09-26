# COMPREHENSIVE AUDIT — Certificate Upload Precondition on Device Identity Resolution

**Status: READ-ONLY AUDIT.** No source code, schema, migration, test, or seed file was modified
to produce this report. This document independently re-verifies every claim in the prior audit
(`certificate-device-identity-precondition-audit.md`) against current source, and explicitly
flags anywhere the two disagree.

**Important context discovered during this audit:** the working tree already contains an
**uncommitted implementation** of the prior audit's recommended fix (Option A — nullable
`Certificate.deviceId`). This audit evaluates that in-progress change as evidence, not as a
foregone conclusion — see §8 and §10.

---

## 1. Executive Summary

**Should BAI/Identity Correction populate `CalibrationJob.deviceId`? No — and the current,
already-documented business decision explicitly forbids it.**

This is not an open question the codebase leaves ambiguous. The schema, the service code, and a
dated chain of Minutes-of-Meeting documents (MoM #6, and its 2026-09-21 revision) all say the
same thing in agreement:

- Identity Correction / BAI is a **read-and-record** mechanism: the technician observes
  brand/model/serial/AKD-AKL physically present on-site and records them as
  `technicianObserved*` snapshot fields on `CalibrationJob`. It **never** touches `deviceId`
  (`calibration-jobs.service.ts:1716-1717`, verbatim comment: *"CalibrationJob.deviceId is NEVER
  touched here: the Device assigned by the WO/SPK is locked (MoM #6). A BA only corrects observed
  identity."*).
- `CalibrationJob.deviceId` is populated by two **separate, current, active** mechanisms instead:
  (a) automatic propagation from `PurchaseOrderItem.deviceId` at Work-Order fan-out time for
  unambiguous qty=1 lines, and (b) an explicit technician-facing "Device Lookup" search-and-select
  screen in Tech-PWA (`selectDevice`), for first-time resolution only. Both are described in detail
  in §4–§5.
- The `CERTIFICATE_DEVICE_NOT_RESOLVED` guard that used to block Certificate upload conflated
  "device master-record linkage resolved" with "physical identity confirmed" — two facts the rest
  of the domain already keeps deliberately separate (e.g. `isIdentityIncomplete()` uses
  `technicianObservedSerial`, not `deviceId`).

The working tree's in-progress fix (making `Certificate.deviceId` nullable and removing the
guard) is **directionally correct and consistent with every other current invariant in this
codebase** — see §8, §10, §15.

---

## 2. Current Architecture (verified flow)

```
                         ┌─────────────────────────────────────────┐
                         │   Two INDEPENDENT identity mechanisms    │
                         └─────────────────────────────────────────┘

MECHANISM A — Device master-record linkage (CalibrationJob.deviceId)
──────────────────────────────────────────────────────────────────────
 (a) Automatic, qty=1 only:
     PurchaseOrderItem.deviceId (real Device FK, copied from QuotationItem)
         └─▶ fanOutCalibrationJobs() copies it verbatim when unitTotal === 1
             └─▶ CalibrationJob.deviceId = PurchaseOrderItem.deviceId
     (work-orders.service.ts; see docs/minutes-of-meeting/calibration-job-deviceid-propagation-20260921.md)

 (b) Manual, technician-driven, first-time-only:
     Tech-PWA "Alat Terpasang Saat Ini" search box (only shown while job.deviceId === null)
         └─▶ GET /calibration-jobs/:id/device-candidates  (customer-scoped search:
             brand/model/serialNumber/code/deviceType.name/customer.name, `contains`, insensitive)
         └─▶ technician taps one candidate (never sees/enters Device.id)
         └─▶ POST /calibration-jobs/:id/select-device { deviceId }
         └─▶ CalibrationJobsService.selectDevice() — refuses if deviceId already set,
             re-validates same-customer server-side
         └─▶ CalibrationJob.deviceId = <selected Device.id>

     Once deviceId is set by (a) or (b), it is LOCKED — further changes require a new
     Identity Correction BA is NOT even possible for deviceId itself (BA never writes it);
     the only way deviceId changes again at all is never, under current code (no
     "re-select device" action exists once bound).

MECHANISM B — Observed-identity correction (CalibrationJob.technicianObserved*)
──────────────────────────────────────────────────────────────────────
     Tech-PWA "Koreksi Identitas" (BAI) wizard — free-text "Serial No" field
         └─▶ submitIdentityCorrection() creates IdentityCorrection { newSerial, newBrand, ... }
         └─▶ TECHNICIAN_MANAGER decideIdentityCorrection() APPROVE
         └─▶ CalibrationJob.technicianObservedSerial = correction.newSerial (plain string,
             free text, NOT resolved against Device master, NEVER touches deviceId)

                         ┌─────────────────────────────────────────┐
                         │           Certificate (current)          │
                         └─────────────────────────────────────────┘

CalibrationJob (deviceId: string | null, independent of technicianObserved*)
     └─▶ CertificateService.ensureCertificate()
             deviceId = job.deviceId   (passed through as-is, null or set — NOT required)
             customerId = job.workOrder.customerId (always set, never the real blocker)
         └─▶ Certificate { deviceId: String? (nullable, in-progress working-tree change) }
```

**Key finding contradicting an implicit assumption in the prior audit:** `CalibrationJob.deviceId`
is **not** merely "a locked/legacy FK that no active workflow sets" in the sense of "practically
always null." Mechanism A(a) actively sets it today for every qty=1 line with a known upstream
Device (work-orders.service.ts, verified via passing tests). Mechanism A(b) actively sets it for
qty>1 lines via technician action. The MoM #6 comment's phrase "no active workflow sets it" refers
specifically to **BAI/Identity Correction never setting it** — not to "nothing in the system sets
it." The prior audit's Root-Cause narrative (§3 of that document) leaned on this distinction
without flagging it, though its final conclusion (deviceId should not gate Certificate) is
unaffected by the correction — see §6 and §10.

---

## 3. Device Data Model

All verified directly from `packages/db/prisma/schema.prisma` (current working-tree state):

| Field | Type | Nullable | Constraint | Line |
|---|---|---|---|---|
| `Device.id` | `String @id @default(cuid())` | No | PK | 1547 |
| `Device.companyId` | `String` | No | FK → Company | 1548 |
| `Device.customerId` | `String` | No | FK → Customer, `onDelete: Cascade` | 1552, 1564 |
| `Device.deviceTypeId` | `String` | No | FK → DeviceType | 1553, 1565 |
| `Device.serialNumber` | `String?` | **Yes** | **NOT unique** — only `@@index([companyId, serialNumber])` | 1556, 1576 |
| `Device.code` | `String` | No | `@@unique([companyId, code])`, system-generated (MasterCodeService), immutable | 1551, 1574 |
| `CalibrationJob.deviceId` | `String?` | **Yes** | `@@unique([workOrderId, deviceId])` — scoped uniqueness, NULLs distinct (Postgres semantics, explicit schema comment) | 2317, 2415 |
| `Certificate.deviceId` | `String?` (working tree) / `String` (HEAD) | **Yes (working tree)** / No (HEAD/committed) | FK → Device, `onDelete: SetNull` (working tree) / `Restrict`-style required (HEAD) | 2973, 2992 |

**Answers:**
- `Device.serialNumber` is **NOT unique**, globally or per-scope. Only an index exists
  (`@@index([companyId, serialNumber])`), which accelerates lookups but enforces nothing. Multiple
  `Device` rows **can** share an identical `serialNumber` — nothing in the schema prevents it, and
  `devices.service.ts`'s create path (line ~78-93) performs no serial-uniqueness check.
- Device lookup **is** customer-scoped in code: `CalibrationJobsService.getDeviceCandidates()`
  (`calibration-jobs.service.ts:2027-2037`) forces `customerId: job.workOrder.customerId` into the
  query, and the underlying `DevicesService.findAll` additionally scopes by `companyId`. The
  candidates endpoint schema (`calibrationJobDeviceCandidatesQuerySchema`) deliberately excludes
  `customerId` from the client-supplied query so the client cannot override this scoping.
- **No Device is ever auto-created during BAI/Identity Correction.** `submitIdentityCorrection`
  and `decideIdentityCorrection` (`calibration-jobs.service.ts:1494-1608`, `1611+`) contain zero
  calls to `prisma.device.create` or any Device-mutating method. The correction only writes
  `IdentityCorrection.new*` and, on approval, `CalibrationJob.technicianObserved*`.

---

## 4. Current BAI Flow (exact code path)

1. **Tech-PWA UI** — `apps/tech-pwa/src/app/jobs/[id]/identity-correction/page.tsx:119-141` — a
   plain `<input type="text">` labeled **"Serial No"**, bound to wizard state `state.serial`
   (free text, `maxLength={120}`, no format validation, no Device lookup call from this screen).
   The same screen shows, read-only: *"Alat (ditetapkan oleh WO/SPK) ... Alat pada job ini tidak
   dapat diganti"* ("The device is not changeable via this BA") — confirming in the UI copy itself
   that this screen cannot touch Device identity.
2. Wizard submits via `submitIdentityCorrection` API
   (`calibration-jobs.controller.ts` → `calibration-jobs.service.ts:1494`), payload field
   `newSerial` (DTO: `IdentityCorrectionSubmitInput`).
3. Service creates an `IdentityCorrection` row, `status: PENDING_REVIEW`, storing
   `prevSerial`/`newSerial` as plain strings (`calibration-jobs.service.ts:1573-1578`). No Device
   read/write occurs anywhere in this method.
4. `decideIdentityCorrection` (`calibration-jobs.service.ts:1611-1722+`), on `APPROVE`:
   ```ts
   // CalibrationJob.deviceId is NEVER touched here: the Device assigned by
   // the WO/SPK is locked (MoM #6). A BA only corrects observed identity.
   const jobData: Prisma.CalibrationJobUncheckedUpdateInput = {};
   if (correction.newBrand !== null) jobData.technicianObservedBrand = correction.newBrand;
   if (correction.newModel !== null) jobData.technicianObservedModel = correction.newModel;
   if (correction.newSerial !== null) jobData.technicianObservedSerial = correction.newSerial;
   ```
   (`calibration-jobs.service.ts:1716-1721`) — confirmed: only `technicianObserved*` fields are
   ever written; `deviceId` does not appear in `jobData` anywhere in this method.

**Conclusion:** the entered "Serial No" becomes `technicianObservedSerial` only. It never drives
Device resolution or `CalibrationJob.deviceId` assignment. This matches the business context's
"believed workflow" description ONLY in that a technician types a Serial No — it does **not**
match the assumption "System resolves Device → Device.id obtained → CalibrationJob.deviceId = Device.id"
via this screen. That resolution, when it happens at all, happens through the entirely separate
screen described in §5.

---

## 5. Device Resolution Flow (exact code path) — the OTHER mechanism

This is the mechanism the business context prompt did not describe, and the one that actually
resolves Device.id in the live system today:

1. **Tech-PWA UI** — `apps/tech-pwa/src/app/jobs/[id]/job-detail-ui.tsx:135-209`
   (`AssignedDeviceSection`). Rendered only when `job.deviceId === null`
   AND `capabilities.calibrationJobSelectDevice` AND `canSelectDevice(job)` (identity gate open)
   — see `page.tsx:94-97`. A debounced (`500ms`) free-text search box, placeholder *"Cari
   nama/tipe/model/serial alat…"*, calling:
2. `GET /calibration-jobs/:id/device-candidates` →
   `CalibrationJobsService.getDeviceCandidates()` (`calibration-jobs.service.ts:2027-2037`) →
   `DevicesService.findAll()` with `customerId` forced to the job's customer. Search is
   `contains`/`insensitive` across brand, model, serialNumber, deviceType.name, customer.name
   (`devices.service.ts:111-120`) — **not an exact match, not automatic**: the technician sees a
   result list and must explicitly tap one.
3. Candidate rows display **brand/model/deviceType.name + Serial No only** — deliberately never
   the internal `id`/`code` (`device-lookup.ts:1-16`, `job-detail-ui.tsx:126-133` comment: *"per
   the MoM decision that a technician never sees/enters Device ID during lookup"*).
4. Tapping a candidate calls `POST /calibration-jobs/:id/select-device { deviceId }` →
   `CalibrationJobsService.selectDevice()` (`calibration-jobs.service.ts:1357-1402`):
   - Refuses (`409 CALIBRATION_JOB_DEVICE_ALREADY_SET`) if `job.deviceId !== null` — **first-time
     resolution only**.
   - Re-validates the device exists in-company and belongs to the job's customer server-side
     (`404 DEVICE_NOT_FOUND` / `400 CALIBRATION_JOB_DEVICE_CUSTOMER_MISMATCH`) — never trusts the
     candidate list alone.
   - `prisma.calibrationJob.update({ where: { id: jobId }, data: { deviceId } })`, catching the
     `@@unique([workOrderId, deviceId])` collision as `409
     CALIBRATION_JOB_DEVICE_ALREADY_BOUND_TO_WORK_ORDER`.

**Answer to "what happens if the serial doesn't exist in the Device master":** the search simply
returns an empty result list (`EmptyState title="Tidak ada alat yang cocok"`,
`job-detail-ui.tsx:181-182`). **No Device is created. No pending-identity record is created.**
`deviceId` stays `null`, and the only remaining path to record what the technician actually
observed is Mechanism B (BAI), which is completely independent and does not require Mechanism A
to ever resolve.

**This is the true current implementation of the business context's described workflow** — but it
is a **search-and-explicit-select** UI, not an automatic "type Serial No → system resolves Device"
mechanism. There is no code path where typing/submitting a serial number by itself causes
`CalibrationJob.deviceId` to be set without an explicit technician tap on a specific candidate.

---

## 6. Historical vs Current Behavior

| Path | Status | Evidence |
|---|---|---|
| `POST :id/assign-device` (`assignDevice()`) | **Dead / retired.** Returns `never` via `this.service.assignDeviceRemoved()`. Kept only as a typed `410` for un-migrated Portal builds. | `calibration-jobs.controller.ts:253-257`, comment: *"This route stays only to return a typed 410 to an un-migrated Portal build."* |
| `IdentityCorrection.prevDeviceId` / `newDeviceId` columns | **Historical-only, frozen.** Schema comment: *"HISTORICAL ONLY (MoM #6)... Retained... so corrections recorded before MoM #6 keep their evidence... Never set by submitIdentityCorrection / decideIdentityCorrection."* | `schema.prisma:2868-2874` |
| `fanOutCalibrationJobs()` hardcoded `deviceId: null` | **Fixed 2026-09-21** — now reads `PurchaseOrderItem.deviceId` for qty=1 lines. | `docs/minutes-of-meeting/calibration-job-deviceid-propagation-20260921.md` |
| `AssignedDeviceSection` (Tech-PWA) | Was **removed** in an earlier commit (`fdd8531`, per the implementation report), then **reintroduced** 2026-09-21 with the new search-and-select behavior — not a straight revert. | `docs/claude/plans/technician-app/ui-tasks/Implement_TechnicianDeviceLookup-report.md:81-82` |
| `submitIdentityCorrection` as "sole path for setting/changing a job's Device identity" | **Superseded.** A 2026-09-04 comment in `packages/auth/src/access-control.ts` calling it the sole path was explicitly updated to record `selectDevice` as a first-time-only exception, per the 2026-09-21 MoM revision. | Implementation report, "Key architectural finding" section |
| `CERTIFICATE_DEVICE_NOT_RESOLVED` guard | **Removed in the current (uncommitted) working tree.** Present at HEAD (commit `b0cb2b0`), absent in the working copy. | `git diff HEAD -- apps/api/.../certificate.service.ts` (see §8) |

No other dead/legacy device-binding code paths were found via repo-wide grep for `newDeviceId`,
`bindDevice`, `deviceId` outside the above.

---

## 7. Authoritative Business Decisions (MoM / design docs)

A clean, internally-consistent, dated chain — **no unresolved conflict found** between these
documents:

1. **MoM #6 (original, undated precisely in this audit's scope but referenced throughout as the
   base decision)** — locks the WO/SPK-assigned Device; BAI corrects *observed* identity only,
   never the Device FK. Referenced verbatim across schema comments, service comments, and
   `isIdentityIncomplete()`.
2. **`docs/minutes-of-meeting/MOM 6 FINAL-TASK- UNDERSTAND and DOCUMENT UPDATED DEVICE
   IDENTIFICATION DECISION.md`** (task prompt, dated by content to 2026-09-21) — explicitly
   *reopens* one narrow piece of MoM #6: introduces a **new**, BAI-independent "Customer → search
   by Serial No/name → technician selects → system obtains Device.id → CalibrationJob.deviceId"
   flow, while explicitly stating BAI rules remain unchanged (*"BAI must not replace/change
   CalibrationJob.deviceId... Existing locked MoM #6 rules remain authoritative unless this
   specific Device lookup decision explicitly requires a documented change."*).
3. **`docs/minutes-of-meeting/calibration-job-deviceid-propagation-20260921.md`** — fixes the
   qty=1 auto-propagation gap (§6 above), explicitly scoping qty>1 resolution to "the separate,
   out-of-scope technician Device-lookup task" — i.e., document #4 below.
4. **`docs/claude/plans/technician-app/ui-tasks/Implement_TechnicianDeviceLookup-report.md`** —
   the implementation report for the search-and-select `selectDevice` flow described in §5,
   confirming it was built exactly per document #2's decision, with typecheck and a described
   (not independently re-run in this audit) test pass.
5. **This audit's own predecessor**,
   `certificate-device-identity-precondition-audit.md` — concluded `CERTIFICATE_DEVICE_NOT_RESOLVED`
   is an implementation artifact, not a business rule, and recommended nullable
   `Certificate.deviceId` (Option A). **This audit independently reaches the same conclusion** (see
   §10), while correcting one factual overstatement in that document (§2, §6: `deviceId` is not
   "practically always null" — it is actively set by two live mechanisms, just never by BAI).

**No conflicting MoM document was found.** All documents found via repo-wide search for "MoM #6",
"Device Identification", "Identity Correction", "BAI", "Serial No", "deviceId",
"CalibrationJob.deviceId" that bear directly on this question tell one consistent story across
time. Documents outside `docs/minutes-of-meeting` and `docs/claude/plans/technician-app` /
`docs/claude/plans/Calibration-management` that matched the grep (AKD/AKL alignment docs,
requisition/pricelist audits, etc.) concern adjacent-but-distinct decisions (AKD/AKL gate,
CalibrationRequestItem.deviceId free text, etc.) and were confirmed not to bear on this specific
question upon inspection of their titles/content overlap.

---

## 8. Certificate Dependency

**Current committed state (HEAD, commit `b0cb2b0`):** `Certificate.deviceId String` (NOT NULL),
`ensureCertificate()` throws `ConflictException({ code: "CERTIFICATE_DEVICE_NOT_RESOLVED" })` when
`!job.deviceId`.

**Current working-tree state (uncommitted):** `Certificate.deviceId String?` (nullable),
`device Device? @relation(..., onDelete: SetNull)` — migration
`packages/db/prisma/migrations/20260926081808_make_certificate_device_id_nullable/migration.sql`
present:
```sql
ALTER TABLE "Certificate" DROP CONSTRAINT "Certificate_deviceId_fkey";
ALTER TABLE "Certificate" ALTER COLUMN "deviceId" DROP NOT NULL;
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```
`ensureCertificate()`'s guard clause has been deleted; it now does `const deviceId = job.deviceId;`
(possibly `null`) and passes it straight into `prisma.certificate.create()`. The updated method
comment states this explicitly: *"Certificate.deviceId is nullable — CalibrationJob.deviceId is a
locked/legacy FK that no active workflow reliably sets... so device identity resolution is NOT a
precondition for certificate creation/upload — the Calibration Job itself (via calibrationJobId)
is the ownership anchor."* `certificate.service.test.ts`'s corresponding test was flipped from
"refuses... before device identity is resolved" to "uploads successfully when the job's device
identity is unresolved (deviceId null)."

**Classification of why `deviceId` was required (pre-fix):** **(B) — purely a schema `NOT NULL`
constraint**, not a deliberate, documented business rule. No MoM or design document anywhere in
this repo states "Certificate upload requires a resolved Device." The guard's own removed
docstring said so explicitly ("a purely technical precondition, unrelated to QA"). Options (A)
"legitimate business rule" and (C) "inherited from older architecture" are not supported by any
evidence found; (D) "another valid Device relation source exists" is also not applicable —
`Certificate.customerId` is sourced from `job.workOrder.customerId` (always set), but no equivalent
always-set source exists for a Device identity relation.

**`ensureCertificate()` full current logic (working tree,
`certificate.service.ts:162-188`):**
```ts
private async ensureCertificate(companyId: string, calibrationJobId: string, userId: string) {
  const job = await this.requireJob(companyId, calibrationJobId);
  const existing = await prisma.certificate.findUnique({ where: { calibrationJobId } });
  if (existing) return existing;

  const deviceId = job.deviceId;
  const customerId = job.workOrder.customerId;
  // ... allocates Certificate.number via DocumentNumberService, creates the row
  // with { companyId, customerId, deviceId, calibrationJobId, number, createdByUserId }
}
```

---

## 9. Certificate.deviceId Usage — full consumer classification

Repo-wide grep for `certificate.deviceId`, `certificate.device`, `Certificate.deviceId`,
`Certificate.device` across `apps/` found exactly **two** matches, both in
`certificate.service.ts` itself:

| Location | Usage | Classification |
|---|---|---|
| `certificate.service.ts:123` (`toDetail()`) | Copies `certificate.deviceId` into the `CertificateDetail` DTO returned to the API/UI | **Display/DTO-passthrough only** |
| `certificate.service.ts:150` (comment) | Documentation of the nullability decision | N/A (comment) |

**No consumer** exists in `apps/portal` (certificate-panel.tsx or elsewhere), `apps/api`
controllers, PDF generation, invoicing (`InvoiceItem`/`InvoiceCertificate` — checked schema
relations, none reference `deviceId`), reporting, or verification logic that reads or depends on
`Certificate.deviceId`'s value. The blast radius of the nullable-column change is confirmed
effectively zero for existing consumers — matching the prior audit's finding.

---

## 10. State Matrix

| # | `CalibrationJob.deviceId` | `technicianObservedSerial` | Currently possible? | Certificate upload (working tree)? | Certificate upload (HEAD/committed)? | Business meaning |
|---|---|---|---|---|---|---|
| A | NULL | NULL | Yes — every PENDING job before start, or any qty>1/no-upstream-Device job with no BA yet | **Allowed** | **Blocked** (`CERTIFICATE_DEVICE_NOT_RESOLVED`) | Physical identity not yet observed at all; a normal early-lifecycle state |
| B | NULL | "12345" | Yes — BA approved, but neither auto-propagation (qty>1) nor manual `selectDevice` has run | **Allowed** | **Blocked** | Physical identity IS confirmed (technician observed it); Device *master-record* linkage simply hasn't been done — this is the exact real-world case the original bug report (`S.638.pdf` upload) hit |
| C | Device.id | "12345" (matches Device.serialNumber) | Yes — either propagated (qty=1) or manually selected, and BA later confirms the same serial | **Allowed** | **Allowed** (if the propagated/selected Device happened to be set) | Fully resolved and consistent — the ideal state |
| D | Device.id | different value from Device.serialNumber | Yes — Device was bound (propagation/select) using one serial, then a later BA records a *different* observed serial (unit swapped on-site, master data stale, or data-entry drift) | **Allowed** | **Allowed** | A genuine discrepancy between master record and physical observation. **Current code does not reconcile this** — no validation compares `job.device.serialNumber` against `job.technicianObservedSerial` anywhere found. **BUSINESS DECISION REQUIRED**: should this raise a flag, block Certificate issuance, or is it acceptable as-is (observed serial always wins for the printed certificate, exactly as `isIdentityIncomplete()` already treats it as authoritative)? |

---

## 11. Root Cause

The root cause is a **schema/domain-model mismatch that predates the current identity
architecture**, not a genuine business rule:

`Certificate.deviceId` was originally modeled as **required** (`NOT NULL`), presumably under an
earlier assumption that "a certificate can't exist without a resolved Device" — reasonable if
`CalibrationJob.deviceId` were the *sole* representation of physical identity. But MoM #6
deliberately introduced a **second**, independent identity representation
(`technicianObserved*`) specifically because Device master-record linkage is not always available
or timely on-site, and made that second representation authoritative for "is identity known"
purposes (`isIdentityIncomplete()` reads `technicianObservedSerial`, never `deviceId`). The
`Certificate` model's `NOT NULL deviceId` constraint was never revisited after that architectural
split, so it continued to enforce the *pre-MoM-#6* assumption that `deviceId` is required for
identity — even though the rest of the domain no longer treats it that way. Certificate upload is
downstream of a document scan (an external, already-existing fact), and gating it on an internal
master-data linkage that may legitimately lag or never happen (State B in §10) blocks a real,
common, non-error business scenario.

---

## 12. Recommended Fix (description only — already substantially implemented in the working tree)

The working-tree change matches the smallest correct fix:

1. Make `Certificate.deviceId` nullable (`String?`) and its relation optional (`Device?`), FK
   `onDelete: SetNull` (already done, migration present).
2. Remove `ensureCertificate()`'s `CERTIFICATE_DEVICE_NOT_RESOLVED` guard; pass `job.deviceId`
   through as-is, whether null or set (already done).
3. Remove the now-dead `CERTIFICATE_DEVICE_NOT_RESOLVED` UI error-message mapping in
   `certificate-panel.tsx` (already done).
4. Update the one covering test from "refuses" to "succeeds with `deviceId: null`" (already done).

No further schema, RBAC, audit-log, or FileObject/versioning changes are required — see §9 (zero
other consumers) and the prior audit's §7–§9 (independently re-confirmed here: versioning is keyed
off `Certificate.id`, RBAC checks run after `ensureCertificate`, audit logging is unaffected).

---

## 13. Alternatives Rejected

Re-evaluated independently, same conclusion as the prior audit:

- **Defer Certificate row creation, anchor the file to `CalibrationJob` first** (a new
  `FileOwnerPolicy` for `ownerType: CALIBRATION_JOB`, then re-parent the `FileObject` once
  `deviceId` resolves) — rejected: introduces a second, temporary file-ownership regime for the
  same document, with re-parenting failure modes, and (per the corrected §2/§6 finding)
  `deviceId` frequently *does* resolve today via propagation/`selectDevice`, but there is still no
  guarantee of *when*, so "defer until resolved" would still often mean "defer indefinitely" for
  State B jobs.
- **A temporary/orphan certificate record** — not evaluated further; excluded by the existing
  `Certificate + FileObject + CalibrationJob` reuse principle and not needed given the nullable-FK
  option exists.

---

## 14. Impact Analysis

| Area | Impact |
|---|---|
| Prisma schema | One additive column-nullability change on `Certificate.deviceId` + FK `onDelete` change (`Restrict`-style → `SetNull`). No other model touched. |
| Migration | One migration present (`20260926081808_make_certificate_device_id_nullable`), additive, no data backfill needed (no existing `Certificate` rows required a non-null `deviceId` at the time of writing, per the prior audit's confirmation — not independently re-verified against live data in this read-only audit). |
| Certificate service | `ensureCertificate()` simplified; DTO (`CertificateDetail.deviceId`) now typed `string | null`. |
| Identity Correction | **Zero impact** — BAI/`technicianObserved*` code paths are untouched by this change and were already fully independent of `Certificate`. |
| Tech-PWA | No changes needed or made — Tech-PWA does not read/write `Certificate` at all (grep found no `Certificate` references under `apps/tech-pwa`). |
| Portal | `certificate-panel.tsx`'s dead error-message branch removed; no functional UI change otherwise (the panel never displayed `deviceId` to begin with). |
| FileObject | Unaffected — versioning keyed off `Certificate.id`/`ownerType: CERTIFICATE`, never `deviceId`. |
| RBAC | Unaffected — the guard sat before any permission check; permission grants for `certificate:update`/`read`/`delete` are unchanged. |
| AuditLog | Unaffected structurally; `deviceId` was never part of `recordAuditLog` metadata and still isn't. |
| Tests | One test flipped (refuses → succeeds); all other `certificate.service.test.ts` tests use `withDevice: true` and test unrelated behavior (replace/delete/RBAC/isolation), unaffected. **Full Vitest run and typecheck were NOT executed as part of this read-only audit** (out of scope per task instructions — Read/Grep/Glob/read-only Bash only); this must be verified by whoever finalizes/commits the working-tree change, per `.claude/rules/testing.md`. |
| Future PDF generation | See §13 note below — `Certificate.pdfFileObjectId`/`verificationToken` already exist in the schema for a future in-app-generate-and-persist flow (currently unused: `verificationToken` has zero references in `apps/api/src`). A future generator would read `Certificate.deviceId` only if it chooses to print Device master fields on the certificate; given `deviceId` is now optional, the generator would need its own null-handling/fallback-to-`technicianObserved*` logic — not yet designed anywhere in this repo. |
| Future QR | `Certificate.verificationToken String? @unique` exists in the schema but has no producing or consuming code anywhere in `apps/api/src` — a placeholder for a not-yet-built feature, unaffected by this change either way. |

---

## 15. Business Decisions Still Required (genuinely unresolved)

1. **State D (§10)** — when a bound `Device.serialNumber` and a later `technicianObservedSerial`
   disagree, should this be flagged/blocked, or is silent divergence (observed value always wins
   for display/certificate purposes) acceptable? No code or MoM document addresses this
   reconciliation case.
2. **Once `CalibrationJob.deviceId` is bound (propagation or `selectDevice`), there is currently no
   way to change it** (BAI never touches it; `selectDevice` refuses once set;
   `assign-device` is a dead 410 stub). If a wrong Device is ever bound (e.g., a data-entry mistake
   in `PurchaseOrderItem.deviceId` propagated automatically), there is no documented correction
   path. Not evaluated further here as it is outside this audit's certificate-focused scope, but
   flagged because it is adjacent and currently unaddressed anywhere in the docs reviewed.
3. Whether a future Certificate-PDF-generation feature will need `Certificate.deviceId` populated
   reliably (vs. reading `CalibrationJob.technicianObserved*` directly at render time) — no design
   document commits to either approach.

---

## 16. Final Verdict

**CURRENT IMPLEMENTATION HAS A DOMAIN/IMPLEMENTATION MISMATCH** — specifically, the
**HEAD/committed** state (`Certificate.deviceId NOT NULL` + `CERTIFICATE_DEVICE_NOT_RESOLVED`
guard) mismatches the documented and code-enforced MoM #6 architecture, in which Device
master-record linkage and physical-identity confirmation are deliberately independent facts. The
**working-tree (uncommitted) state already corrects this mismatch** via the smallest
schema-compatible fix (nullable `Certificate.deviceId`), consistent with every other current
invariant this audit verified. This audit's independent conclusion agrees with the prior audit's
Option A recommendation, with one factual correction (§2, §6: `deviceId` is not "practically
always null" — it has two live, active setters — but this does not change the conclusion, since
Certificate upload must not depend on the *timing* of either of those setters relative to the
physical certificate's own, external, real-world existence).

---

## Verification note on this audit's own method

Per the read-only constraint, this audit did not execute `pnpm vitest`, `tsc --noEmit`, or any
build/test command, and did not modify any file. All claims above are based on direct reading of:
`packages/db/prisma/schema.prisma`, `apps/api/src/modules/calibration-jobs/{calibration-jobs,
certificate}.service.ts` and their `.test.ts` files, `apps/api/src/modules/calibration-jobs/
calibration-jobs.controller.ts`, `apps/api/src/modules/devices/devices.service.ts`,
`apps/tech-pwa/src/{app/jobs/[id]/**, lib/calibration/**}`, `apps/portal/src/app/management/
calibration-jobs/{[id]/page.tsx, certificate-panel.tsx}`, `packages/shared/src/utils/
calibration-job-action-signals.ts`, `git diff HEAD` for the four modified files, the untracked
migration SQL, and the `docs/minutes-of-meeting/` + `docs/claude/plans/` document chain cited
throughout. Live database state (actual row counts/values) was not queried — this is a static-code
and static-document audit only.
