# Compliance Level — Architecture Audit

> READ-ONLY. No code, schema, migration, API, UI, or test was modified. Evidence:
> `packages/db/prisma/schema.prisma` (2920 lines), `apps/api`, `apps/portal`,
> `apps/tech-pwa`, `packages/auth`, `packages/notifications`.
>
> Date: 2026-09-18. Source brief: `docs/minutes-of-meeting/AUDIT- COMPLIANCE LEVEL ARCHITECTURE.md`.

---

## 1. Executive Summary

Five findings drive everything below.

**1. There is no persisted settings mechanism at all.** No `SystemSettings` model, no
`CompanySettings` model, no settings module, no settings API, no admin settings page.
`Company.settingsJson Json?` exists in the schema (`schema.prisma:469`) but **is never
read or written anywhere in the codebase** — its only occurrences are
`settingsJson: null` in two PDF test fixtures. It is a dormant, unused column.

**2. The only *runtime-configurable*, DB-driven policy mechanism that exists is
`RolePermission`** (`schema.prisma:708`) — edited through the Permission Management UI,
cached in memory, refreshed on write, no deploy needed. This is the single existing
precedent for "an administrator changes system behavior without a deploy."

**3. The feared deadlock does not exist today.** A `PENDING_REVIEW` IdentityCorrection
blocks **nothing**. It does not block measurement recording, does not block
`submitForReview`, does not block `complete`, does not block PDF generation, does not
block LK issuance. The only thing it blocks is *a second correction on the same job*
(`IDENTITY_CORRECTION_ALREADY_PENDING`). The Identity Correction workflow is **already
fully asynchronous**.

**4. What a pending correction *does* cost is not a block but a silent no-op:** the
job's `deviceId` / `technicianObservedSerial` / `technicianObservedAkdAkl` are **only
written on APPROVE** (`calibration-jobs.service.ts:1489-1520`). If MT never decides,
the job completes and the LK is issued carrying the **uncorrected** identity. That is
the real operational risk — a wrong-identity certificate, not a blocked technician.

**5. There is a hard stop, and it is elsewhere:** `IDENTITY_LOCKED_JOB_STATUSES =
["SUBMITTED", "ACCEPTED_BY_QA"]` (`calibration-jobs.service.ts:210`). Once the
technician submits, `decideIdentityCorrection` throws
`CALIBRATION_JOB_IDENTITY_GATE_LOCKED`. A correction left pending past submit becomes
**permanently undecidable** — it can never be approved or rejected. This is Scenario F,
and today it is a dead end.

Consequence for the proposal: the requested Compliance Level would not *loosen*
Identity Correction — it is already at its loosest. What the repo actually needs first
is the opposite: a decision about what a pending correction *should* do at
submit/finalize time. Compliance Level is the right vehicle for that decision, not for
removing a block that isn't there.

---

## 2. Existing Settings Architecture

**Does a persisted settings mechanism exist? No.**

| Searched for | Result |
|---|---|
| `SystemSettings` / `CompanySettings` model | Does not exist |
| Settings module in `apps/api/src/modules/` | Does not exist (30 modules; none is settings) |
| Admin settings page in `apps/portal/src/app/management/` | Does not exist |
| Feature flags (`featureFlag`, `FEATURE_*`) | Zero hits repo-wide |
| `complianceLevel` / `COMPLIANCE` | Zero hits repo-wide |
| `Company.settingsJson` consumers | Zero (two test fixtures only) |

**What configuration mechanisms actually exist:**

**A. Environment (`packages/config/src/index.ts`)** — a Zod `envSchema`:
`DATABASE_URL`, ports, auth secrets, IMAP/SMTP, Firebase. Deployment/infrastructure
only. Contains **zero business-policy knobs**. Changing anything requires a redeploy.
Not a fit.

**B. `RolePermission` + `packages/auth/src/access-control.ts`** — the real precedent,
and the only one:
- `ac` catalog (`access-control.ts:54`) declares `resource: [actions]`, compile-time,
  in code.
- Role→grant assignment is **data** in `RolePermission`, editable at runtime.
- Read model: a module-level `Map` (`cache`), primed at API boot in `main.ts`,
  refreshed by the Permission Management API after each write (read-your-writes), plus
  a periodic defensive refresh.
- `hasPermission(role, resource, action)` is **synchronous** — deliberately, so guards,
  `MenuService.getNavTree`, `MeController` and the Socket.IO auth helper never risk a
  missed `await` silently becoming an always-true check.
- Fails **closed**: null cache → `false`. SUPERADMIN bypasses unconditionally.
- Modified by: SUPERADMIN (hardcoded bypass) or any role holding `permission:manage`.
- Exposed to frontend via `MeController` → `packages/auth/src/me-types.ts`; the portal
  has a full `permission-management` UI.

**C. Master-data CRUD** (`tax`, `uom`, `priceListItem`, device taxonomy). The `tax`
resource is commented `// System Settings` in the catalog (`access-control.ts:173`) —
this is a **label on a business master table**, not a settings framework.

**Is there anything conceptually similar to a compliance level? No.** Every
enforcement threshold in the system is a hardcoded constant or a literal comparison in
a service method. There is no indirection layer of any kind between "policy" and
"code."

**Existing enum/config pattern to reuse:** Prisma enums defined in `schema.prisma`,
mirrored into `packages/shared/src/schemas` (Zod) and
`apps/tech-pwa/src/lib/calibration/types.ts`. Status-machine transitions are expressed
as a `Record<Status, readonly Status[]>` constant plus an `assert…Transition` function
— see `AKD_AKL_TRANSITIONS` (`calibration-jobs.service.ts:202-207`). That is the house
style for a declarative policy table.

---

## 3. Existing Approval Architecture

Four independent approval mechanisms exist on `CalibrationJob`. They are deliberately
orthogonal — none is a sub-state of another.

| Workflow | Submitter | Approver | Current blocking point | Can work continue? | Can finalization continue? | Evidence/audit |
|---|---|---|---|---|---|---|
| **AKD/AKL gate** (`CalibrationJob.akdAklApprovalStatus`) | TECHNICIAN or MT (`escalateIdentity`) | TECHNICIAN_MANAGER only (`approveIdentity`) | **None enforced in backend.** No service method checks `akdAklApprovalStatus` before measurements, submit, complete, or PDF. Locked only by job status `SUBMITTED`/`ACCEPTED_BY_QA`. | Yes | Yes | On-job columns: `akdAklApprovedByUserId`, `akdAklApprovedAt`, `akdAklDecisionNote`, `akdAklGateOpenedBy`. **Weak:** escalation reason is written to `akdAklDecisionNote` then overwritten by the manager's rationale — flagged in-code as a known gap (`:1023-1025`). |
| **Identity Correction / BAI** (`IdentityCorrection`) | TECHNICIAN or MT (`submitIdentityCorrection`) | TECHNICIAN_MANAGER only (`decideIdentityCorrection`) | **None.** Only a second concurrent pending BA is refused. | Yes | Yes | Strong — full BA row + signatures + numbered document. |
| **Reference Equipment Approval** (`JobReferenceEquipmentApproval`) | TECHNICIAN / MT | TECHNICIAN_MANAGER only | **Hard block at `submitForReview`** — `assertReferenceEquipmentResolvedForSubmit` throws `REFERENCE_EQUIPMENT_APPROVAL_UNRESOLVED` on any `PENDING_REVIEW` row, or any selected invalid line without `validityOverridden` (`:2034-2059`). Mirrored in the PWA as a disabled Submit button with an Indonesian reason string (`page.tsx:229`). | Yes (bench work continues) | **No** | Header row + line-level `validityOverridden` + validity snapshot enum. |
| **Quality Review** (`QualityReview`) | TECHNICIAN (`submitForReview`) | TECHNICIAN_MANAGER (`decideQualityReview`) | **Hard block at `complete`** — requires latest review `APPROVED` + `APPROVE`, else `QUALITY_REVIEW_NOT_APPROVED` (`:975-985`). This is the core workflow spine. | n/a | **No** | `QualityReview` rows per attempt; REJECT increments `currentAttempt`, forces `REWORK`, mandatory notes. |

Two additional non-approval gates: `assertKontrolAlatReadyForStart` blocks `start()`
for `SEND_TO_LAB` jobs, and `assertMeasurementsCompleteForSubmit` blocks
`submitForReview` on incomplete measurements.

**So the enforcement picture is: Reference Equipment and Quality Review block. Identity
Correction and AKD/AKL do not.**

---

## 4. Identity Correction / BAI

**They are the same mechanism.** `IdentityCorrection` *is* the BAI — "Berita Acara
Identitas," `DOCUMENT_TYPE_PREFIX.IDENTITY_CORRECTION_BA = "BAI"`
(`document-type-prefix.ts:15`), numbered `BAI/YYYY/MM/NNNNN`, rendered as a
PKM/KAN-letterhead PDF by `identity-correction-pdf.ts`. There is no separate BAI model.

It must **not** be confused with the AKD/AKL gate, which is a different thing: a
regulatory *izin edar* review living in columns on `CalibrationJob`, with its own
approver verb (`approveIdentity`). The two are coupled at exactly one point — an
approved BA that changed `newAkdAkl` may reopen or auto-close the AKD/AKL gate,
governed by `AkdAklGateOrigin` (`AUTO_MISMATCH` may auto-close; `MANUAL_ESCALATION`
never does, because a human raised it for a reason text comparison cannot see).

**Exact code path.**

*Creation* — `submitIdentityCorrection` (`calibration-jobs.service.ts:1283-1382`):
1. `assertIdentityGateOpen(job.status)` → throws if `SUBMITTED`/`ACCEPTED_BY_QA`.
2. Refuses a second `PENDING_REVIEW` BA (`IDENTITY_CORRECTION_ALREADY_PENDING`).
3. Requires at least one real change vs. the job's current values, else
   `IDENTITY_CORRECTION_NO_CHANGE`.
4. If the device changes, validates DeviceType match.
5. In one transaction: allocate BAI number → create row at `PENDING_REVIEW` with
   `prev*`/`new*` pairs, durable `reason`, `submittedByUserId`, and exactly two
   signature rows (TECHNICIAN, CUSTOMER), each `SIGNED` / `UNAVAILABLE` / `REFUSED`.

**Nothing on `CalibrationJob` is touched at submit time.** The job keeps its old
identity.

*Decision* — `decideIdentityCorrection` (`calibration-jobs.service.ts:1387-1524`):
- REJECT: stamps `REJECTED` + decider + timestamp + note. Job untouched.
- APPROVE: if any signer actually signed, the photographed BA sheet must be on file,
  else `IDENTITY_CORRECTION_SIGNATURE_IMAGE_MISSING`. Then, in one transaction:
  `bindDevice` if `newDeviceId`, write `technicianObservedSerial` /
  `technicianObservedAkdAkl`, open or clear the AKD/AKL gate per the
  `AkdAklGateOrigin` rules, stamp the BA `APPROVED` with `akdAklGateReopened`.

**Blocking inventory — verified by grep, not inferred:**

| Question | Answer | Evidence |
|---|---|---|
| Blocks job progress? | **No** | `measurement-results.service.ts` never references `identityCorrection` or `akdAklApprovalStatus` |
| Blocks `submitForReview`? | **No** | `submitForReview` calls only `assertMeasurementsCompleteForSubmit` + `assertReferenceEquipmentResolvedForSubmit` |
| Blocks `complete`? | **No** | `complete` checks only job status + latest QualityReview |
| Blocks PDF generation? | **No** | `buildIdentityCorrectionPdf` renders a pending BA, labelled "Menunggu Review" (`identity-correction-pdf.ts:51,173`) |
| Blocks LK issuance? | **No** | `lk-download.service.ts:196` gates on `job.status !== "ACCEPTED_BY_QA"` only |
| If approval stays pending? | Job proceeds; **the correction never applies**; after submit it becomes undecidable | `IDENTITY_LOCKED_JOB_STATUSES` |
| Already asynchronous? | **Yes, fully** | The pending state is surfaced as UI badges only — `hasPendingIdentityCorrection` (`:575`) feeds a badge in `jobs-ui.tsx:151`; no disabled control anywhere |

---

## 5. Notification Architecture

**No approval workflow sends any notification.** `NotificationDispatchService` has
exactly three non-test consumers repo-wide: `leads.service.ts`,
`contact-messages.service.ts`, and its own module. `calibration-jobs.service.ts` does
not import it.

So: when a technician submits a BAI, **the MT is never told.** They discover it by
opening the portal. The stated operational problem ("MT is busy on another job") is,
mechanically, an *awareness* problem before it is an enforcement problem.

Architecture, where it exists (`notification-dispatch.service.ts`):
- Pipeline: caller-supplied `userIds` → `NotificationRecipientService.resolveEligibleUserIds`
  (honours `UserMembership.receiveNotifications`) → active `FCMToken` lookup →
  `push.sendPushBatch` → auto-deactivate invalid tokens.
- FCM/web push via `packages/notifications/src/push` (Firebase Admin,
  `FIREBASE_SERVICE_ACCOUNT_JSON`).
- **Never blocks**: returns a result object, throws nothing on zero tokens or failed
  sends; every call site awaits it *after* the domain write has committed.
- A pending approval with no notification is the normal, and currently the only,
  state.

---

## 6. RBAC

Database-driven. **Permission changes require no deployment** — `RolePermission` rows
are edited in the portal and the in-memory cache is refreshed immediately after the
write.

`TECHNICIAN_MANAGER` is a distinct `MembershipRole` from `TECHNICIAN`
(`schema.prisma:34-44`).

| Capability | Granted to (seed) |
|---|---|
| `calibrationJob:submitIdentityCorrection` | TECHNICIAN, TECHNICIAN_MANAGER |
| `calibrationJob:decideIdentityCorrection` | **TECHNICIAN_MANAGER only** |
| `calibrationJob:escalateIdentity` | TECHNICIAN, TECHNICIAN_MANAGER |
| `calibrationJob:approveIdentity` | **TECHNICIAN_MANAGER only** |
| `calibrationJob:decideQualityReview` | **TECHNICIAN_MANAGER only** |
| `calibrationJob:decideReferenceEquipmentApproval` | **TECHNICIAN_MANAGER only** |
| `calibrationJob:submitForReview` / `complete` / `resumeAfterRework` | **TECHNICIAN only** |
| `calibrationJob:recordMeasurement` / `recordPhysicalCheck` | **TECHNICIAN only** — explicitly *revoked* from TECHNICIAN_MANAGER by the seed script (`seed-role-permissions.ts:264-282`) |
| `permission:manage` | SUPERADMIN only by default |

**Can ADMIN approve? No.** ADMIN holds only `calibrationJob:read` and
`calibrationJob:recordKontrolAlat`. Every approval verb is deliberately withheld — the
catalog comments say so explicitly: *"sole approver — not granted to ADMIN/SUPERVISOR."*
Only the hardcoded SUPERADMIN bypass can approve outside TECHNICIAN_MANAGER.

**Note for the deadlock premise:** because grants are runtime data, "let a second role
approve when MT is unavailable" is *already achievable today* with zero code — grant
`decideIdentityCorrection` to ADMIN or SUPERVISOR in the Permission Management UI. That
is an important alternative to weigh against building a Compliance Level for this
particular problem.

**Who could configure a Compliance Level?** No suitable grant exists.
`permission:manage` is about RBAC specifically; there is no `systemSetting:manage`.

---

## 7. Enforcement vs Traceability

**A. Evidence / traceability (must survive every level).**

| Mechanism | Location |
|---|---|
| Correction record + `prev*`/`new*` value pairs | `IdentityCorrection.prevDeviceId/newDeviceId/prevSerial/newSerial/prevAkdAkl/newAkdAkl` |
| Durable reason (schema comment: "NEVER overwritten") | `IdentityCorrection.reason` |
| Actor + timestamp | `submittedByUserId`, `createdAt`, `decidedByUserId`, `decidedAt` |
| Decision rationale | `decisionNote` |
| Signatures, incl. refusal/absence as first-class states | `IdentityCorrectionSignature` + `SignatureStatus` |
| Photographed BA sheet | `FileObject` (`ownerType = IDENTITY_CORRECTION`) |
| Sequential document number | `IdentityCorrection.number` (BAI/YYYY/MM/NNNNN), unique per company |
| Gate-reopen provenance | `akdAklGateReopened`, `akdAklGateOpenedBy` |
| Attempt history | `currentAttempt`, `QualityReview` rows per attempt |
| Job identity snapshots | `customerDeclaredDeviceName`, `customerDeclaredAkdAkl`, `technicianObservedSerial` |
| Generic audit log | `AuditLog` + `recordAuditLog()` — **used only by LK download** (`lk-download.service.ts`), explicitly written to be reusable |

**B. Enforcement / blocking (candidates for configurability).**

| Mechanism | Error code | Safe to make configurable? |
|---|---|---|
| `IDENTITY_LOCKED_JOB_STATUSES` — no BA submit/decide after SUBMITTED | `CALIBRATION_JOB_IDENTITY_GATE_LOCKED` | **Needs a decision regardless of Compliance Level** — it is what makes Scenario F a dead end |
| Single pending BA per job | `IDENTITY_CORRECTION_ALREADY_PENDING` | Yes, but low value |
| BA photo required on APPROVE | `IDENTITY_CORRECTION_SIGNATURE_IMAGE_MISSING` | **No** — this is evidence, not enforcement |
| Pending reference-equipment approval blocks submit | `REFERENCE_EQUIPMENT_APPROVAL_UNRESOLVED` | Yes — clearest, highest-value candidate |
| Invalid equipment without override blocks submit | same | **Risky** — this is metrological validity, not process |
| Approved QualityReview required to complete | `QUALITY_REVIEW_NOT_APPROVED` | **No** — this is the workflow spine |
| Measurement completeness blocks submit | `CALIBRATION_MEASUREMENTS_INCOMPLETE` | **No** — data integrity |
| Kontrol Alat required to start (WOL) | — | Unlikely |
| LK download requires `ACCEPTED_BY_QA` + password re-auth | — | **No** — document integrity |

The line the existing code already draws is clean and worth preserving: **evidence is
written unconditionally at the moment of the act; enforcement is checked at transition
boundaries.** Compliance Level belongs entirely on the second side.

---

## 8. Recommended Compliance Level Boundary

**Option D — Company-level setting resolved through a per-workflow policy table.**
Justified by existing architecture, not preference:

1. **Company-level, not global.** Every business entity in the schema is
   `companyId`-scoped, `Company` already exists with a dormant `settingsJson` column,
   and `CompanyRoleGuard` already carries `companyId` on every request. A global
   setting would be the only company-blind business policy in the system.
2. **Not per-workflow-only.** The stated requirement is a single operational posture
   the business chooses. Four independent per-workflow switches reproduce the current
   problem — scattered, undiscoverable policy — with extra UI.
3. **Resolved through a policy table, not read raw.** A service must never branch on
   `if (level === "FLEXIBLE")`. The repo's own idiom for this is
   `AKD_AKL_TRANSITIONS`: a declarative `Record<Level, Policy>` constant, one
   enforcement helper consulting it, service methods unchanged in shape. Follows
   `access-control.ts` exactly: **catalog in code, selection in data.**
4. **Cache model already proven.** `RolePermission`'s boot-primed, write-refreshed,
   synchronous, fail-closed cache is the pattern to copy. Fail-closed here means:
   cache miss → STRICT.

Storage: the honest choice is between a typed `Company` column and the dormant
`settingsJson`. A typed column is more consistent with the rest of the schema (every
other policy value is a typed column or an enum); `settingsJson` avoids a migration per
future knob but gives up type safety and validation, and no code reads it today, so
there is no existing convention to follow. This is a real decision for the
implementation plan, not something the current architecture settles.

**Answers to §12's ten questions:**

1. **Where?** `Company`, company-scoped, surfaced through a new settings module +
   `systemSetting:manage` grant.
2. **Scope?** One level per company, consulted by named enforcement points — never
   read inline.
3. **Mandatory at every level?** All of §7.A without exception, plus: measurement
   completeness, approved QualityReview before complete, BA photo on APPROVE, LK
   requires `ACCEPTED_BY_QA` + re-auth, equipment metrological validity.
4. **Allowed to become non-blocking?** `REFERENCE_EQUIPMENT_APPROVAL_UNRESOLVED`
   (pending-approval half only), and — this is the substantive one — whether an
   *undecided* BA is allowed to survive `submitForReview`, and what happens to it
   afterwards.
5. **Which workflows consume it?** `submitForReview`, `complete`,
   `submitIdentityCorrection` / `decideIdentityCorrection` (specifically
   `assertIdentityGateOpen`), `decideReferenceEquipmentApproval`. Nothing else.
6. **Affect permissions? No.** Two independent axes. Relaxing *who may approve* is an
   RBAC edit and already possible today; relaxing *whether approval blocks* is
   Compliance Level. Coupling them would let a level silently grant authority.
7. **Affect audit/evidence? No.** This is the stated principle and the existing code
   already honours it.
8. **Affect notifications? No — but notifications are the actual fix here.** Nothing
   to relax (none exist). MT push on BA submit is orthogonal to Compliance Level and
   addresses the root cause directly.
9. **Affect job completion?** Only via the pending-BA policy in (4). Never the
   QualityReview requirement.
10. **Affect document issuance? No.** LK/certificate gating is regulatory. A relaxed
    *process* posture must not produce a document under weaker evidence — though see
    §11 on stamping pending-correction status onto documents.

---

## 9. MoM #6 Impact

Detailed findings are already recorded in
`docs/minutes-of-meeting/audit-mom-6-device-identity-fields-20260918.md`. Confirmed
independently here, applied to Compliance Level:

| Field | Storage today | Correction path | Compliance Level relevance |
|---|---|---|---|
| **Serial No** | Snapshotted on job: `CalibrationJob.technicianObservedSerial` | `IdentityCorrection.prevSerial/newSerial`, applied on APPROVE | Full — the BAI mechanism covers it end to end |
| **Device ID / FK** | `CalibrationJob.deviceId`, writable only via approved BA | `prevDeviceId/newDeviceId` + DeviceType validation | Full |
| **Brand** | **Nowhere on the job.** Live read-through to mutable `Device.brand` at render time | **None** — `IdentityCorrection` has no brand columns | **Out of scope.** No enforcement point exists to configure |
| **Model** | Same as Brand | **None** | **Out of scope** |

So Compliance Level cannot govern Brand/Model at all — there is no correction workflow
and no job-level storage to govern. MoM #6 must first decide where Brand/Model live
before Compliance Level has anything to say about them.

Terminology and `CalibrationRequestItem.deviceId` (free-text customer asset label,
deliberately not an FK) are untouched by this audit.

---

## 10. Operational Scenarios

Current behaviour only. No future behaviour invented.

**Scenario A — Model mismatch.** Nothing happens. There is no field to record it in,
no BA column, no UI: tech-pwa never displays Brand or Model
(`job-detail-ui.tsx:110-134`). The technician's only options are to proceed, or to
phone the office and have an ADMIN edit `Device.model` — which **retroactively
rewrites every already-issued PDF for that device**. No block, no data stored, no
document trace.

**Scenario B — Brand mismatch.** Identical to A.

**Scenario C — Serial mismatch.** The supported path. Technician runs the BAI wizard
(`/jobs/[id]/identity-correction` → photo → signature → review), a `PENDING_REVIEW`
row is created with `prevSerial`/`newSerial`, reason, two signature rows, a BAI number
and the sheet photo. **The job is not blocked** — bench work, submit, complete and LK
all proceed. Job still shows the old serial. MT must act. If they do, the serial
applies to the job and flows into the LK; if they don't, it never does.

**Scenario D — Wrong Device master.** Same BAI flow with `newDeviceId`. Candidates
come from `GET /:id/device-candidates`; DeviceType must match. On APPROVE, `bindDevice`
rebinds the job (`@@unique([workOrderId, deviceId])` applies). **If no matching Device
exists, the flow stops entirely** — the PWA says "Tidak ada alat yang cocok. Alat
harus didaftarkan lebih dulu oleh admin/kantor" (`identity-correction/page.tsx:107`).
This, not approval latency, is the real field dead end today.

**Scenario E — MT unavailable.** **Nothing blocks.** The technician records
measurements, submits, and (after MT's quality review) completes. The BA sits at
`PENDING_REVIEW` with a UI badge and **no notification was ever sent** to the MT. The
premise of an operational deadlock is not borne out by the code: the Identity
Correction path has no block to remove.

**Scenario F — Correction still pending after job completion.** The failure mode that
actually exists. Job reaches `SUBMITTED`, then `ACCEPTED_BY_QA`.
`decideIdentityCorrection` now throws `CALIBRATION_JOB_IDENTITY_GATE_LOCKED` — the BA
is **permanently undecidable, stuck at `PENDING_REVIEW` forever**. The LK PDF is
generated and downloadable carrying the **uncorrected** identity, with no marker
anywhere on the document that a correction was pending. The evidence trail is intact
and the technician was never blocked; what is wrong is the certificate.

---

## 11. Risks / Constraints

1. **The premise needs restating before it drives design.** Identity Correction blocks
   nothing today. Building a Compliance Level to unblock it would ship a setting whose
   FLEXIBLE and STRICT levels behave identically for the workflow that motivated it.
2. **Scenario F is a live correctness defect, independent of Compliance Level.**
   Permanently undecidable BAs and wrong-identity LKs should be resolved on their own
   merits. Introducing a Compliance Level first risks the setting being read as the
   fix.
3. **RBAC already solves the stated availability problem, today, with no code.**
   Granting `decideIdentityCorrection` to a second role costs one row. This should be
   weighed explicitly before building a settings framework.
4. **The missing notification is the highest-value, lowest-risk change here.** No
   approval workflow notifies anyone. Delivering MT push on BA submit addresses the
   root cause and changes no enforcement semantics.
5. **Brand/Model have no snapshot** — ADMIN edits to `Device.brand`/`Device.model`
   retroactively rewrite issued LK, Kontrol Alat and WO PDFs for every historical job.
   Pre-existing, unmitigated, and orthogonal to Compliance Level.
6. **A settings framework is genuinely new surface** — no module, no
   cache-invalidation path, no `systemSetting:manage` grant, no admin UI exists. This
   is larger than the enforcement change it would carry.
7. **`hasPermission` is synchronous by deliberate design.** Any compliance-level
   resolver must be synchronous too, with the same boot-prime + write-refresh +
   fail-closed lifecycle — an async variant would invite the exact silent-always-true
   bug that comment warns about.
8. **Per-company caching is a new requirement.** The RBAC cache is keyed by role only,
   global across companies. A company-scoped cache needs its own invalidation design.
9. **`Company.settingsJson` is dormant but not free.** Nothing reads it, so there is
   no established shape, validation or migration story — using it means inventing all
   three.
10. **Multiple frontends mirror backend policy constants by hand**
    (`identity-gate.ts` mirrors `IDENTITY_LOCKED_JOB_STATUSES`; the
    reference-equipment reason string is hardcoded in the PWA). A runtime-variable
    policy must be **served to the clients**, not re-hardcoded — otherwise portal and
    PWA silently disagree with the API.
11. **`AuditLog` is written by exactly one flow.** If Compliance Level is meant to
    guarantee traceability where enforcement is relaxed, that guarantee has no general
    writer yet.

---

## 12. Recommended Implementation Sequence

Ordered by value-per-risk, from the facts above. Each step stands alone.

1. **Notify the MT.** Wire `NotificationDispatchService` into
   `submitIdentityCorrection` (and the other approval submits). Non-blocking, no
   enforcement change, directly addresses the operational complaint.
2. **Decide Scenario F.** Resolve permanently-undecidable BAs and wrong-identity LKs:
   either block submit while a BA is pending, or allow post-submit decisions, or stamp
   pending-correction status onto the document. **This decision is the real content**
   the Compliance Level would later parameterize — make it explicitly first.
3. **Consider the RBAC answer to MT availability.** Evaluate granting a second
   approver role. One row, no code, reversible.
4. **Extract enforcement points into named policy functions.** Refactor-only,
   behaviour-identical: `canSubmitWithPendingIdentityCorrection(...)`,
   `canSubmitWithPendingEquipmentApproval(...)`, `canDecideCorrectionAfterSubmit(...)`.
   Hardcode them to today's behaviour. This creates the seam, with zero semantic
   change, and is independently valuable.
5. **Generalize `AuditLog`.** Give every approval submit/decide a `recordAuditLog`
   call, so relaxed enforcement can never mean thinner evidence.
6. **Only then introduce Compliance Level**, if steps 1–4 have not already resolved
   the need: enum + storage + `systemSetting:manage` grant + boot-primed
   company-scoped cache + a `Record<Level, Policy>` table read by the step-4 functions
   + `/me` exposure so portal and PWA read policy rather than mirror it. Default every
   existing company to STRICT so the change is a no-op on rollout.
7. **Separately**, address the Brand/Model snapshot gap (MoM #6) — not a Compliance
   Level concern.

---

## 13. Files Inspected

**Schema** — `packages/db/prisma/schema.prisma`: `Company` (461), `RolePermission`
(708), `Device` (1466), `CalibrationJob` (1980), `IdentityCorrection` (2506),
`IdentityCorrectionSignature` (2567), `QualityReview` (2591),
`JobReferenceEquipmentApproval` (2441), `AuditLog` (2865), `LkDownloadAuthorization`
(2903); enums `MembershipRole` (34), `AkdAklApprovalStatus` (194), `AkdAklGateOrigin`
(212), `IdentityCorrectionStatus` (223), `JobReferenceEquipmentApprovalStatus` (234),
`SignatureStatus` (264), `QualityReviewStatus` (275).

**API** — `calibration-jobs.service.ts` (2069 lines, read in full for lifecycle +
identity + approvals), `calibration-jobs.controller.ts`, `identity-correction-pdf.ts`,
`job-reference-equipment.ts`, `lk-download.service.ts`, `lk-template-data.ts`,
`audit-log.ts`, `measurement-results.service.ts`, `kontrol-alat.service.ts`,
`work-orders.service.ts`, `notification-dispatch.service.ts`, `leads.service.ts`,
module listing of all 30 `apps/api/src/modules/*`.

**Auth / config** — `packages/auth/src/access-control.ts` (236 lines, full),
`packages/config/src/index.ts`, `seed-role-permissions.ts`,
`backfill-identity-correction-permissions.ts`, `document-type-prefix.ts`,
`document-type-table.ts`.

**Frontend** — `apps/tech-pwa/src/lib/calibration/identity-gate.ts`,
`jobs/[id]/page.tsx`, `job-detail-ui.tsx`, `jobs-ui.tsx`,
`identity-correction/page.tsx`, `corrections/[correctionId]/page.tsx`, portal
management page listing (29 routes), `permission-management/page.tsx`.

**Docs** — `audit-mom-6-device-identity-fields-20260918.md`,
`AUDIT- COMPLIANCE LEVEL ARCHITECTURE.md`.

**Negative searches (zero hits, load-bearing):** `SystemSettings`, `CompanySettings`,
`complianceLevel`/`COMPLIANCE`, `featureFlag`/`FEATURE_`, `settingsJson` outside test
fixtures, `NotificationDispatchService` in `calibration-jobs`,
`akdAklApprovalStatus`/`identityCorrection` in `measurement-results.service.ts`.

---

## 14. Explicit Non-Changes

Nothing was modified. Specifically: no code, no `schema.prisma`, no migration, no API,
no UI, no tests, no formatter run. No settings model, no `ComplianceLevel` enum, no
Strict/Moderate/Flexible implementation. `IdentityCorrection`, BAI, notification
behaviour, RBAC grants, `JobCalibrationTestPoint`, PDF behaviour and
`CalibrationRequestItem.deviceId` are all untouched. `git status` was clean at start
and no write tool was invoked during this audit.
