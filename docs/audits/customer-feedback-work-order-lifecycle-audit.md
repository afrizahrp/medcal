# Customer Feedback — Work Order Lifecycle Audit

Status: read-only audit. Nothing in the repository was changed except this file.
Source of truth: the repository at `main` (HEAD `87c0255`). The handoff
`docs/hands-off/Handoff_Customer Portal_QR Certificicate_For_claude.md` was read as context only; where it
conflicts with code (it still calls the portal a "future plan"), the code wins.

Line numbers refer to the files as inspected on 2026-10-02.

---

## 1. Executive Summary

1. **Completion is a manual, Work Order–level action.** `WorkOrder.status = DONE` is set only by
   `WorkOrdersService.done()` (`POST /work-orders/:id/done`, permission `workOrder:update`). It is gated on
   every `CalibrationJob` being `ACCEPTED_BY_QA`. It is **not** automatic when the last job is accepted and it
   has **no coupling to certificates**.
2. **`DONE` and `CANCELLED` are terminal with no outgoing edge.** There is no reopen and no un-complete path in
   the transition table. Legacy `TECHNICALLY_DONE` / `CLOSED` still exist in the enum and the customer view maps
   them to COMPLETED.
3. **A DONE Work Order can have zero certificates.** Nothing in `done()` checks certificates. Generated
   certificates are issued by a separate staff action (`POST /calibration-jobs/:id/certificate/issue`) after
   the job is `ACCEPTED_BY_QA`. Uploaded certificates do **not** require the job to be accepted at all.
4. **No completion timestamp exists** on `WorkOrder` or `CalibrationJob` (no `doneAt` / `acceptedAt`). Only
   `updatedAt`, `submittedAt`, `startedAt`. Nothing in `done()` writes an audit row.
5. **The strongest trigger is a state, not a UX event:** Work Order is completed **and** at least one
   certificate is customer-openable (`ISSUED` + stored PDF) **and** no feedback exists yet. "Customer opened the
   WO" and "customer opened a certificate" are useful as *display moments*, not as eligibility.
6. **Feedback belongs to `WorkOrder`** (one row, `workOrderId @unique`), with `customerId` stored redundantly
   and the submitting `userId` recorded. It should be immutable after submit and written together with an
   `AuditLog` row in one transaction.
7. **Dismissal needs no server persistence for v1.** Eligibility is derivable from state, so the response-rate
   denominator does not need prompt/dismiss records. Use an inline card on the Work Order detail page.
8. **Two real hazards:** (a) on go-live, *every historic* DONE Work Order becomes eligible (no completion date to
   cut off on); (b) the new POST is the **first write endpoint** in the customer-portal controllers, so
   origin/CSRF and abuse protection need explicit verification (none found in the repo, see §8).

---

## 2. Existing Work Order Lifecycle

### 2.1 Statuses

`packages/db/prisma/schema.prisma:164-175`

```
PLANNED, ASSIGNED, IN_PROGRESS,
TECHNICALLY_DONE (legacy, "WorkOrder API must not use it"),
CLOSED           (legacy, same),
CANCELLED,
DONE             (MVP terminal-complete)
```

`CalibrationJobStatus` (`schema.prisma:189-195`): `PENDING, IN_PROGRESS, SUBMITTED, REWORK, ACCEPTED_BY_QA`.
There is **no CANCELLED job status**.

### 2.2 Transition table and where it is enforced

`apps/api/src/modules/work-orders/work-orders.service.ts:40-52`

```
PLANNED     → ASSIGNED | CANCELLED
ASSIGNED    → IN_PROGRESS | CANCELLED
IN_PROGRESS → DONE | CANCELLED
DONE        → (none)
CANCELLED   → (none)
```

`assertTransition` (`:188-198`) rejects anything else with `INVALID_STATUS_TRANSITION`; legacy statuses fail
`assertMvpStatus` (`:178-186`). Writers of `WorkOrder.status`:

| Transition | Method | Lines |
|---|---|---|
| PLANNED → ASSIGNED | `assign()` | `:496-533` |
| ASSIGNED → IN_PROGRESS (fans out `CalibrationJob` rows) | `start()` | `:545-610` |
| IN_PROGRESS → DONE | `done()` | `:1130-1153` |
| PLANNED/ASSIGNED/IN_PROGRESS → CANCELLED (+ cancels active allocations) | `cancel()` | `:1155-1185` |

Other `workOrder.update` sites (`:474, 761, 1017, 1056, 1286`) are field edits / revision; the grep shows each
guarded by a status assertion (`:469, 756, 985, 1040`) and the tests reject update on DONE/CANCELLED
(`work-orders.service.test.ts:842, 864`). I did not read each of those bodies line by line.

### 2.3 What "completed" means

- **Work Order level:** `status = DONE`. Set by `done()`, which loads all jobs of the WO and throws
  `WORK_ORDER_CALIBRATION_JOBS_NOT_ACCEPTED` (with the pending job ids) unless every job is `ACCEPTED_BY_QA`
  (`:1134-1146`). It is read-only toward jobs.
- **Job level:** `ACCEPTED_BY_QA`, set only by `CalibrationJobsService.complete()`
  (`calibration-jobs.service.ts:1409-1484`), which requires job `SUBMITTED` and latest `QualityReview`
  `APPROVED`. The same transaction writes observed identity back to the Device master.
- Path of a job: `PENDING → IN_PROGRESS → SUBMITTED → (REJECT: REWORK → IN_PROGRESS → SUBMITTED …) →
  APPROVE (QualityReview) → complete() → ACCEPTED_BY_QA`
  (`decideQualityReview :1293-1374`, `resumeAfterRework :1381-1403`).
- **Edge:** `done()` with zero jobs passes the gate (`notAccepted.length === 0`). `IN_PROGRESS` normally implies
  fan-out already ran, so this should be rare; not verified for ON_SITE with no units.
- **Edge (inferred, not traced end-to-end):** the schema comment on `AkdAklApprovalStatus`
  (`schema.prisma:197-200`) says a REJECTED device must not block sibling jobs, but `done()` requires *all*
  jobs `ACCEPTED_BY_QA`. A WO containing a permanently rejected device therefore cannot reach DONE and can only
  be cancelled. Never eligible for feedback under the proposed predicate, which is correct.

### 2.4 Terminal states, reopen, reversal

- Terminal: `DONE`, `CANCELLED` (+ legacy `TECHNICALLY_DONE`, `CLOSED`) — `TERMINAL_STATUSES`, `:43`.
- **Reopen:** none. `ALLOWED_TRANSITIONS.DONE = []`. Tests: "rejects DONE → CANCELLED and any other DONE
  transition" (`work-orders.service.test.ts:1013`), "rejects CANCELLED → any state" (`:1061`).
- **Completion reversal:** none at WO level. At job level `ACCEPTED_BY_QA` has no outgoing transition either
  (`complete()` throws `CALIBRATION_JOB_ALREADY_COMPLETED`; REWORK only starts from `SUBMITTED`). So a DONE WO
  cannot lose its DONE-ness. **The eligible-by-status half of the predicate is monotonic.**
- Revision (`revise()`) is PLANNED/ASSIGNED only (`REVISABLE_WORK_ORDER_STATUSES`, `:153`).
- There is no "superseded" or "rejected" **Work Order** state. "Supersession" exists only on `Certificate`.

### 2.5 Customer-visible vs internal status

`apps/api/src/modules/customer-portal/customer-progress.ts:33-60`

| Internal WO status | Customer status |
|---|---|
| PLANNED, ASSIGNED | NOT_STARTED |
| IN_PROGRESS | IN_PROGRESS |
| DONE, TECHNICALLY_DONE, CLOSED | COMPLETED |
| CANCELLED | CANCELLED |

Job: PENDING→NOT_STARTED; IN_PROGRESS/SUBMITTED/REWORK→IN_PROGRESS; ACCEPTED_BY_QA→COMPLETED. The file header
states "Completed means `ACCEPTED_BY_QA`. Certificate issuance is not an input." Progress is computed from jobs
(or `WorkOrderItem.qty` before fan-out, `:105-135`), **independent** of the WO's own status. So the portal can
show a WO as `IN_PROGRESS` with 100% of jobs completed (until staff presses Done).

### 2.6 Timing relative to certificates

Certificates are produced **after** job acceptance and **independently of** WO completion (see §3). No code in
`work-orders.service.ts` references certificates.

---

## 3. Certificate / Result Lifecycle

### 3.1 Model

`Certificate` (`schema.prisma:3072-3117`): 1:1 with job (`calibrationJobId @unique`), carries `customerId`,
`status` (`DRAFT|ISSUED|REVOKED|SUPERSEDED`), `source` (`UPLOADED|GENERATED`), `pdfFileObjectId?` (optional FK,
`ON DELETE SET NULL`), `verificationToken`, `issuedAt`, `revokeReason`, `supersedesCertificateId`.

### 3.2 How the portal decides "available"

`customer-portal.service.ts:103-106`: `{ status: "ISSUED", pdfFileObjectId: { not: null } }`.
`toCertificateView` (`customer-progress.ts:141-164`): `UNAVAILABLE` (none / not ISSUED), `ISSUED_WITHOUT_PDF`,
`AVAILABLE`. The UI renders a certificate action **only** for `AVAILABLE`
(`apps/customer-portal/.../work-orders/[id]/page.tsx:81`). `openCertificatePdf` (`service:602-636`) re-checks
ISSUED + PDF and writes `CERTIFICATE_PDF_VIEWED_VIA_CUSTOMER_PORTAL` to `AuditLog`.

### 3.3 Findings

- **Issuance paths** (both staff-initiated, both separate from WO done):
  - `issueGenerated` (`certificate.service.ts:512-640`) requires job `ACCEPTED_BY_QA` (`:541`); creates the row
    `ISSUED` in one transaction, and renders the PDF **after commit**. If rendering fails the certificate stays
    `ISSUED` with `pdfFileObjectId = null` (`:507-510`); retrying the same call re-renders. → **`ISSUED_WITHOUT_PDF`
    is a real, transient state; this is the asynchronous-after-issue case.**
  - `uploadVersion` (`:234-273`) for externally produced certificates creates the row `ISSUED` directly. It
    **does not check job status** — a certificate can exist on a job that is not `ACCEPTED_BY_QA`.
- **REVOKED / SUPERSEDED are never written by any code.** Repo-wide grep for `"REVOKED"`/`"SUPERSEDED"`/
  `revokeReason`/`supersedesCertificateId` outside tests finds only readers (`certificate-verification.service.ts:92-93`,
  portal `certificate-verification.ts`). They are valid enum values and the verification page handles them, but
  no revoke/supersede workflow exists today. `uploadVersion` rejects non-ISSUED rows (`CERTIFICATE_NOT_REPLACEABLE`).
  The portal's availability query already excludes both, so if such a flow is added later, `available` would
  drop automatically.
- **Current PDF can't be deleted** while it is the current version (`deleteVersion :814`, `CERTIFICATE_CURRENT_VERSION_LOCKED`);
  replacement is possible (`REPLACED`). So once `AVAILABLE`, it stays available unless a future revoke is built.
- **A completed WO can legitimately have no certificate:** `done()` doesn't require one, and nothing forces
  issuance for every job. Whether *every* job is supposed to get one is a business rule not encoded anywhere.
- **Customer can view a DONE WO before output exists:** yes. The detail page shows the WO as COMPLETED with
  "Sertifikat" rendered as nothing for jobs lacking an `AVAILABLE` certificate (`page.tsx:81`, "nothing is
  rendered otherwise").
- Certificates also reach customers via the QR route (`/certificate/[token]`, `CertificateVerificationService`),
  which audits as `CERTIFICATE_PDF_VIEWED_VIA_VERIFICATION` (`:135`).

Conclusion: "certificate available" is **a reliable proxy for "the customer has received a result"**, but
**not** a reliable proxy for "the service is complete" (it can precede DONE for uploaded certificates and
lag DONE for generated ones). It must therefore be combined with, not substituted for, the WO status.

---

## 4. Feedback Trigger Analysis

| # | Candidate | Verdict |
|---|---|---|
| 1 | WO reaches completed status | **Necessary, not sufficient.** Reliable (monotonic, no reopen) but fires before the customer has any output; staff presses Done independent of certificates. |
| 2 | Completed **and** customer-visible result available | **Strongest available.** Both halves are persisted state, both derivable server-side, neither reverts under current code. |
| 3 | Customer opens the completed WO | **Display moment**, not eligibility. Client event; not persisted anywhere; unreliable as a fact. |
| 4 | Customer opens/views a certificate | Persisted (as `AuditLog` rows, both portal and QR routes) but is a *log*, not domain state; excludes customers who got the certificate through other channels or never open the PDF. Optional gating, **product decision**. |
| 5 | All of the above | Over-constrained; any missing conjunct silently suppresses feedback and skews response-rate analysis. |
| 6 | Another existing state | None. `QualityReview`, `ACCEPTED_BY_QA`, `CertificateBillingStatus` are per-job/billing concerns; none express "delivered to the customer". |

**Recommended trigger:** *eligibility* = #2 (state). *Where the prompt is shown* = #3 (the detail page of an
eligible WO). #4 is not required.

**No new lifecycle status is needed.** The existing statuses plus certificate availability fully express the
required state (the audit does not prove otherwise).

**False eligibility risks**
- Legacy WOs with status `TECHNICALLY_DONE`/`CLOSED` count as COMPLETED in the portal (`customer-progress.ts:54-56`);
  decide whether they are eligible (recommended: yes, reuse `WORK_ORDER_STATUSES_BY_CUSTOMER_STATUS.COMPLETED`).
- **Backfill flood:** no completion date → at launch all historic DONE+certificate WOs become eligible at once.
  Not solvable from existing data (`updatedAt` is only a proxy; `done()` is not audited). Needs a product
  decision (§13).
- Partial certificates: one available certificate among many units makes the WO eligible while other units have
  none. Acceptable with "≥1", wrong with "all"; see §5.
- Certificate later revoked/superseded (not possible today) would flip `available`; see §5 on immutability.

**Missed prompt risks**
- DONE with no certificate ever issued (never eligible; arguably correct, no output delivered).
- Customer never returns to the portal after receiving the certificate by QR/email.
- Certificate issued but PDF render failed and never retried (`ISSUED_WITHOUT_PDF`).
- Portal user disabled/unlinked before seeing the prompt.

---

## 5. Eligibility Analysis

### 5.1 Proposed predicate (derived from code)

```
feedbackEligible(userId, workOrderId) =
      customerId = requireCustomerId(userId)                       // active user + membership + CustomerUserLink
  AND workOrder.id = workOrderId
  AND workOrder.companyId = companyId AND workOrder.customerId = customerId
  AND workOrder.status IN WORK_ORDER_STATUSES_BY_CUSTOMER_STATUS.COMPLETED   // DONE (+ legacy TECHNICALLY_DONE, CLOSED)
  AND EXISTS job IN workOrder.jobs WHERE certificate.status = 'ISSUED' AND certificate.pdfFileObjectId IS NOT NULL
  AND NOT EXISTS customerFeedback WHERE workOrderId = workOrder.id
```

- `status` clause reuses the existing customer-facing mapping, so the portal and the predicate cannot drift.
- Certificate clause reuses `availableCertificateWhere` (`customer-portal.service.ts:104`) verbatim — the same
  definition that already drives the "Sertifikat tersedia" filter and the `availableCount`.
- "≥1 certificate" rather than "all jobs have one": there is no rule that every job gets a certificate, and
  requiring all would permanently exclude WOs with any unit lacking one. Stricter variants → product decision.
- The "all jobs ACCEPTED_BY_QA" clause is **not** repeated: `done()` already guarantees it for `DONE`; legacy
  statuses cannot be verified. Adding it costs one `groupBy` already used by `aggregate()`.
- "No feedback submitted" is implied by the `@unique(workOrderId)` row existing.

### 5.2 Server vs client

- **Server-side only.** The data (job statuses, certificate PDF presence, feedback existence) are all behind the
  customer-scoped service; the client only receives customer-facing summaries (`CustomerWorkOrderSummary`). The
  client could approximate it from `status === 'COMPLETED' && certificates.availableCount > 0`, but a client
  check can never be the authority for a write — the POST must re-evaluate it.
- **Expose an explicit field**, don't make the client infer: `{ eligible: boolean, submitted: {rating, submittedAt} | null }`.
- **Dynamic recalculation, with immutability of the submitted record.** Compute eligibility on each read; do
  not persist an `eligibleAt`. The feedback row itself is the durable fact. Persisting eligibility would freeze a
  derived value and invite divergence, and the monotonicity shown in §2.4 means recomputing is stable today.

---

## 6. Dismissal / Deferral Analysis

State machine requested: `Eligible → Prompt shown → {Submit → Completed | Nanti saja → Deferred}`.

Facts from the portal architecture:
- State is: TanStack Query (staleTime 15 s, no refetch on focus, `providers.tsx:96-97`), URL query state
  (`use-url-query-state.ts`), session via `@medcal/auth/client`. No client persistence layer (no
  localStorage/Zustand) and no `useMutation` anywhere yet.
- The cache is purged on user change (`SessionBoundary`, `providers.tsx:35-58`).
- Data is per-user and one portal user per customer (`@@unique([customerId])`, `schema.prisma:791`; migration
  `20261002100000_customer_user_link_unique_customer`), so "dismissed by user X" ≡ "dismissed for the customer".

| Question | Technical implication / recommendation |
|---|---|
| Survive refresh | Only if the prompt is not a one-shot modal. If the prompt is an **inline card that is simply always rendered while eligible**, no persistence is required and "dismiss" can just collapse it. |
| Browser restart / logout-login / device change | Needs server persistence *or* it re-appears. Re-appearing as a passive inline card on the WO page is not intrusive. |
| Frequency | With an inline card there is no "frequency" to control. A modal/toast would need a server-side counter or timestamp. |
| Dismiss indefinitely | Allowed trivially: the card is passive; the customer is never blocked. |
| New completed WO resets the opportunity | Automatically, because eligibility and any dismissal are per Work Order. |
| Per-WO tracking | Required if tracked at all (feedback is per WO). |
| Needed for analytics? | **No.** Response rate = feedback rows ÷ eligible WOs; the denominator is derivable from state (§10). Dismissals add only "viewed but declined" nuance. |

**Minimum persistence model:** *none on the server for v1.* If the card shows on every visit, "Nanti saja" can be
a per-visit collapse (React state; resets on reload). If product wants it to stay collapsed, use
`localStorage` keyed `userId + workOrderId`, wrapped in try/catch — this adds the first client-side storage in the
portal, so it needs a deliberate decision. Server-side `FeedbackPrompt` state (dismissedAt/count) is **not
justified** by anything in the audit and would be speculative.

---

## 7. Data Model Analysis

Verified relations: `Customer 1—1 CustomerUserLink` (`@@unique([customerId])`) `—N→ User`; `WorkOrder.customerId →
Customer`, `WorkOrder.companyId → Company`; `AuditLog.userId → User onDelete: SetNull`;
`Certificate.customerId` and `Invoice.customerId` already denormalise `customerId` onto transaction records.

**Parent: `WorkOrder`.** Not the job (requirement: one per WO), not Customer (must be transactional).

Recommended `CustomerFeedback` (do not implement here):

| Field | Recommendation | Why |
|---|---|---|
| `id` | `String @id @default(cuid())` | repo convention |
| `companyId` | required FK → Company (Cascade) | every transaction table has it; tenancy |
| `workOrderId` | required FK → WorkOrder, **`@unique`**, `onDelete: Restrict` | one per WO enforced in DB; feedback is audit evidence, so a WO delete must not silently cascade it away (WO→Customer is Cascade today; Restrict makes that visible) |
| `customerId` | required FK → Customer, redundantly stored | matches `Certificate`/`Invoice`; enables customer-level analytics without a join and survives if links change |
| `submittedByUserId` | `String?` FK → User, `onDelete: SetNull` | AuditLog precedent; `CustomerUserLink` is deleted on membership removal (`users.service.ts:378, 430`), so the *link* cannot be the record of who submitted |
| `rating` | `Int`, NOT NULL, `CHECK (rating BETWEEN 1 AND 5)` via raw SQL in the migration | Prisma has no CHECK; precedent exists (`20260829175600_add_calibration_request_item_qty_check`) |
| `comment` | `String?`, trimmed, length-capped (e.g. 2000), empty → NULL | optional per requirement |
| `submittedAt` | `DateTime @default(now())` | required for analysis; `createdAt` would be identical, one column suffices |

Decisions:
- **Dismissal persisted separately?** No (§6).
- **Edits after submit:** not allowed. Feedback is compliance evidence (the handoff cites ISO/IEC 17025 customer-feedback expectations)
  and editing would need version history. Immutable; no PATCH/DELETE from the portal.
- **Audit log:** yes, reuse `recordAuditLog` (`calibration-jobs/audit-log.ts:29`), which already accepts a
  transaction client so the row commits with the feedback. Action e.g. `CUSTOMER_FEEDBACK_SUBMITTED`,
  `targetType: "WorkOrder"`/`"CustomerFeedback"`, metadata `{ workOrderId, workOrderNumber, rating, hasComment }`
  (not the comment text — AuditLog metadata is "non-sensitive" by convention, `schema.prisma:3336`).
- **Staff review tracking** (`reviewedAt/By`, notes) is *additive and nullable* if added later, so it does not
  force a destructive change now and is out of scope.
- Do not alter `MeasurementResult`, `CalibrationTestPoint`, `JobCalibrationTestPoint`, tolerance, or any Phase 4
  invariant; none are touched.
- The new migration must be a new folder after `20261002100000_…`; never edit applied migrations.

---

## 8. Security / Customer Scoping Analysis

**Existing pattern (confirmed):**
- `sessionUserId()` (`controller:35-39`) takes the user only from the Better Auth session; the app-wide
  `AuthModule.forRoot({ isGlobal: true })` (`app.module.ts:42`) already rejects anonymous callers. The customer
  controllers use **no** `@RequirePermission`; authorization is entirely `CustomerPortalService`.
- `requireCustomerId` (`service:249-266`): user `ACTIVE` → `UserMembership` in `COMPANY_ID` → `CustomerUserLink`
  in that company; every failure yields the same `CUSTOMER_ACCESS_REQUIRED` 403.
- `findOwnedWorkOrder` (`:350-358`) queries `{ id, companyId, customerId }`; non-owned and non-existent both
  return the same 404 `WORK_ORDER_NOT_FOUND`. Tested: "rejects another customer's … with the same body as a
  missing id" (`customer-portal.service.test.ts:481`), "ignores a client-supplied customerId" (`:726`).
- Group keys are opaque hashes (`unitGroupKey`, `customer-progress.ts:210`), internal line ids never leave.

**IDs:** `WorkOrder.id` is a `cuid()` (non-sequential, not guessable by counting) but `number` is a human-readable
company-sequential string shown to customers. **Do not rely on id opacity**; the ownership query is the control.

**Required pattern for feedback endpoints**
1. Resolve the customer **only** via `requireCustomerId(userId)`; never accept `customerId` from the client.
2. Load the WO through `findOwnedWorkOrder` (same 404 for foreign/unknown).
3. Re-evaluate eligibility server-side inside the same transaction as the insert.
4. Store `customerId` and `companyId` from the server-resolved scope, not from the request.
5. `GET …/feedback` for a foreign WO returns the same 404 as a missing one (no eligibility oracle).
6. Body validated with a Zod schema in `@medcal/shared` (pattern: `customerWorkOrderListQuerySchema`);
   `rating` int 1–5, `comment` optional, max length; reject unknown keys.

**Risks to resolve before implementing**
- **First write endpoint in the customer surface.** All existing customer routes are `GET`. Cookie-session
  POST needs verified origin/CSRF protection. Better Auth has `trustedOrigins` (`packages/auth/src/index.ts:60`),
  but that protects Better Auth's own routes; whether it covers custom Nest routes was **not verified**.
- **No rate limiting** found (`grep -i throttl|rate.?limit` in `apps/api/src` and `packages/auth/src` returned
  nothing). A free-text POST should have at least the one-row-per-WO uniqueness plus a body size cap.
- **Dev proxy:** `customer-portal-api-rewrites.js` forwards `/customer/:path*`, so `/customer/work-orders/:id/feedback`
  needs no rewrite change.
- Comment is user-generated text later shown to staff: store as plain text; React escapes by default.

---

## 9. Customer Portal UX Integration Analysis

**Existing architecture (inspected):**
- Layout: `(app)/layout.tsx` — `AuthGate` → header (`AppNav`, `SignOutButton`) → `<main>`.
- Home (`(app)/page.tsx`) is a welcome text and one button; **no dashboard** to host a prompt.
- List (`work-orders/page.tsx`) is search/filter/pagination; detail (`work-orders/[id]/page.tsx`) = `WorkOrderHeader`
  (number, status badge, progress, certificate count) + `UnitsSection`.
- Data: TanStack Query hooks `use-customer-queries.ts`, keys via `customerQueryKey(userId, …)`; 4xx not
  retried (`customer-query.ts`); 401 → `expireSession()`.
- Patterns: `LoadingState`/`ErrorState` (`status-blocks.tsx`, retry buttons), `role="alert"` inline errors,
  `aria-busy`, `aria-expanded/controls`, `min-h-11` touch targets, Indonesian copy, `max-w-2xl` single column
  (mobile-first). URL state for list filters.
- **No existing dialog/modal, drawer, or toast** in the app (grep for `role="dialog"`, `<dialog`, `aria-modal`,
  `toast` found none). No `useMutation` usage yet.

**Recommendation: an inline card on the Work Order detail page**, directly under `WorkOrderHeader`, shown when
the detail response says `eligible`, replaced by a read-only "Terima kasih — penilaian Anda: N/5" once submitted.
Reasons: (a) it is the page where the customer has the context (the WO and its certificate buttons are right
there); (b) it matches existing single-column card styling and needs no new component class; (c) a modal/toast
would introduce a pattern the portal doesn't have, plus focus-trap/ARIA work, and is the interruptive style the
requirements want to avoid; (d) "Nanti saja" becomes a trivial collapse.

Not recommended: home banner (home has no WO context and only shows when the user lands there), list-page badge
(would require eligibility in the batched list path — extra queries per page).

Accessibility/neutrality notes: rating as a `radiogroup` with visible text labels; keyboard operable; all ratings
equal visual weight (no green/red bias); comment field optional and labelled; errors via `role="alert"`;
no new global state — a local `useMutation` + `invalidateQueries` on the feedback key is sufficient.

---

## 10. Analytics / Auditability Analysis

With the §7 model, these questions are answerable with plain SQL and **no schema change**:

| Question | Source |
|---|---|
| Eligible WOs | `WorkOrder` status ∈ completed set AND EXISTS ISSUED+PDF `Certificate` via jobs (same predicate as §5.1) |
| Responses / response rate | `COUNT(CustomerFeedback)` ÷ eligible |
| Average / distribution / negatives | `rating` (1–2 = negative, definition is a product decision) |
| Which WOs got negative feedback | `workOrderId` → `WorkOrder.number`, `customerId` |
| Traceability to service transaction | `workOrderId` FK (+ `CalibrationJob`/`Certificate` via WO) |
| Recurring themes | `comment` free text (analysis tooling out of scope) |
| Who submitted and when | `submittedByUserId`, `submittedAt`; `AuditLog` row with ip/userAgent |

**Gaps / caveats**
- No WO completion timestamp → cannot compute "time from completion to feedback", nor a response-rate cohort
  by completion month, except by proxy. Not solved by feedback alone; do not add `doneAt` as part of this work
  unless product wants those metrics (it would be a separate, historical-data-sensitive change).
- "Demonstrate that feedback is being reviewed" has no storage. Adding nullable `reviewedAt/reviewedByUserId`
  later is non-destructive, so it need not be built now.
- Eligible is recomputed, so its historical count can drift if certificates are ever revoked (no such flow today).
  If a point-in-time denominator is needed, snapshot it in reporting, not on the feedback row.

---

## 11. Edge Cases

### Work Order
| Scenario | Behaviour under proposed design |
|---|---|
| Completed, no certificate | Not eligible (no output delivered). Becomes eligible if/when a certificate with PDF appears. |
| Completed, certificate available | Eligible. |
| Completed then certificate revoked | **Cannot occur today** (REVOKED never written). If added: `available` clause fails → no new prompt; an already-submitted feedback is unaffected. |
| Completed then superseded | Same as above. |
| ISSUED but PDF missing (render failed) | Not eligible until PDF attached (`ISSUED_WITHOUT_PDF`). |
| Cancelled | Not eligible (`CANCELLED` ∉ completed set). Detail page already shows it as history. |
| Rejected | No WO-level rejected state. A job with AKD/AKL REJECTED blocks DONE, so such WO is never eligible. |
| Reopened | Impossible (no edge out of DONE). |
| Partially completed | `status` ≠ DONE → not eligible, even if 100 % of jobs show completed (staff hasn't pressed Done). |
| Multiple jobs / many devices | One WO-level prompt; per-job feedback is out of scope. Eligibility uses EXISTS, not a per-job scan; reuse `aggregate()`. |

### Customer
| Scenario | Behaviour |
|---|---|
| One user / "multiple users for same customer" | DB forbids more than one link per customer. If this constraint is ever relaxed, `@unique(workOrderId)` still gives "first submit wins" at WO level, and `submittedByUserId` records who. |
| Account disabled | `requireCustomerId` → 403 for GET and POST. Existing feedback remains. |
| Membership removed / role changed | Link deleted (`users.service.ts:378, 430`) → access lost; feedback row remains, `submittedByUserId` kept (or SetNull if the user is deleted). |
| Relationship changed after completion | `WorkOrder.customerId` is fixed; a *new* user linked to the customer may see the WO and (if none exists) submit. Acceptable; the record carries the submitting user. |

### Feedback
| Scenario | Behaviour |
|---|---|
| Dismiss | Nothing stored (v1). |
| 1 star, no comment | Valid. |
| 5 stars with comment | Valid. |
| Refresh during submission | Request may or may not have committed; re-GET shows `submitted` or still `eligible`. |
| Duplicate submission / two sessions | `@unique(workOrderId)` → Prisma `P2002` → return `409 FEEDBACK_ALREADY_SUBMITTED` (same `uniqueViolationTarget` pattern as `certificate.service.ts:88-93`). Eligibility check alone is racy; the unique index is the guarantee. |
| WO becomes inaccessible after eligibility | POST fails 404 via `findOwnedWorkOrder`. |
| Customer later loses access | Previously submitted feedback is retained; customer can no longer read it. |
| Cert-only eligibility vanishing between GET and POST | POST re-evaluates and returns a distinct `409 FEEDBACK_NOT_ELIGIBLE`; UI refetches. |

---

## 12. Existing Test Coverage

Runner: Vitest (`.claude/rules/testing.md`). Nothing was executed in this audit (read-only).

| Area | File | Relevant coverage |
|---|---|---|
| WO transitions | `apps/api/src/modules/work-orders/work-orders.service.test.ts` | transitions `:881-1126`; DONE→any / CANCELLED→any rejected `:1013, :1061`; completion gate `:1127`; update rejected on DONE/CANCELLED `:842, :864` |
| Customer scoping, API | `apps/api/src/modules/customer-portal/customer-portal.service.test.ts` | cross-customer 404 same body `:481`; no-link/removed membership `:504`; ignores client `customerId` `:726`; 401 `:719`; cancelled visible `:461` |
| Certificate states in portal | same file `:407` ("exposes each certificate state without letting certificates change job progress"), filters `:529` |
| Progress/status mapping | `customer-progress.test.ts` |
| Certificate issue/upload | `calibration-jobs/certificate.service.test.ts`, `certificate-pdf.test.ts` |
| QR verification | `certificate-verification` tests; portal `lib/certificate-verification.test.ts` |
| Portal front-end libs | `lib/customer-work-orders.test.ts`, `customer-query.test.ts`, `open-pdf.test.ts`, `use-pagination-sync.test.ts`, `return-to.test.ts`, `auth-messages.test.ts`, `customer-portal-api-rewrites.test.ts` |
| Users/link lifecycle | `users/users.service.test.ts`, `whitelist/registration-gate.integration.test.ts` |

There are **no component/e2e tests** for portal pages (only `lib` unit tests), and no tests of the Work Order
detail page.

To extend when feedback is implemented: `customer-portal.service.test.ts` (new `describe`), `customer-progress.test.ts`
(if the eligibility predicate is a pure helper), `customer-work-orders.test.ts` (client types/labels),
`customer-portal-api-rewrites.test.ts` (unchanged; confirm `/customer/*` stays covered), and
`users.service.test.ts` only if link semantics change (they should not).

---

## 13. Risks / Unknowns

1. **Backfill flood** on go-live (no completion date). Needs a rule (see §14-F options).
2. **First state-changing customer endpoint**: CSRF/origin and abuse controls unverified (§8).
3. **No `useMutation` / client storage precedent** in the portal; any dismissal persistence is a new pattern.
4. **Certificate coverage rule** (≥1 vs all units) is not encoded anywhere; "≥1" is an inference.
5. **Legacy statuses** (`TECHNICALLY_DONE`, `CLOSED`): existence of production rows in those states was not checked.
6. `done()` is not audited and unconditionally manual; a WO whose jobs are all accepted but never marked Done is
   invisible to feedback indefinitely.
7. Whether the `Customer`/`WorkOrder` `onDelete: Cascade` could ever delete real data in production is unknown;
   `Restrict` on the feedback FK would make such a delete fail loudly.
8. I did not run the test suite, the app, or any query against a database; ON_SITE zero-job `done()` and
   AKD/AKL REJECTED behaviour are inferences from schema comments and service code.
9. Customer-portal `work-orders/page.tsx`, `work-order-progress.tsx`, `list-controls.tsx` were only skimmed
   (imports/usages), not read in full.

---

## 14. Recommended Implementation Contract

### A. Eligibility
```
eligible = userScope(requireCustomerId)
       AND workOrder IN scope (id, companyId, customerId)
       AND workOrder.status IN {DONE, TECHNICALLY_DONE, CLOSED}   // WORK_ORDER_STATUSES_BY_CUSTOMER_STATUS.COMPLETED
       AND EXISTS job.certificate WHERE status='ISSUED' AND pdfFileObjectId IS NOT NULL   // availableCertificateWhere
       AND NOT EXISTS CustomerFeedback(workOrderId)
```
Evaluated server-side on every GET and re-evaluated inside the POST transaction. Not persisted.

### B. Trigger
State: WO completed **and** ≥1 customer-openable certificate. Prompt surfaces when the customer opens that
WO's detail page. No new status; no dependency on certificate-view events.

### C. Persistence
Store: the feedback row (rating, optional comment, WO, customer, submitting user, submittedAt) + one `AuditLog`
row. Do **not** store: eligibility, prompt-shown, dismissal, view counts, a completion timestamp.

### D. Data model
`CustomerFeedback { id, companyId, workOrderId @unique (Restrict), customerId, submittedByUserId? (SetNull),
rating Int CHECK 1..5, comment String?, submittedAt }`, immutable after insert, new forward-only migration,
indexes on `(companyId, submittedAt)`, `(customerId)`, `(rating)` as needed for reporting.

### E. API
```
GET  /customer/work-orders/:id/feedback  → { eligible: boolean, submitted: { rating, submittedAt } | null }
POST /customer/work-orders/:id/feedback  → body { rating: 1..5, comment?: string } → 201 | 404 | 409
```
`GET` is separate from `GET :id` so the batched list path (`aggregate()`) is untouched. Both go through
`findOwnedWorkOrder`. POST errors: `409 FEEDBACK_ALREADY_SUBMITTED`, `409 FEEDBACK_NOT_ELIGIBLE`,
`400 INVALID_CUSTOMER_PORTAL_BODY`. No PATCH/DELETE. Put in `CustomerWorkOrdersController`/`CustomerPortalService`
(or a sibling service if size warrants); no new RBAC resource needed for the customer side.
Staff read access (reporting) is a separate, later task using `@RequirePermission`.

### F. UX
Inline card under `WorkOrderHeader` on the detail page when `eligible`; read-only confirmation when `submitted`.
Rating required, comment optional, all ratings visually neutral, Indonesian copy consistent with the portal.
Never blocks navigation. Local `useMutation`, invalidate the feedback query key; no Zustand.
*Backfill options (product decision):* (1) prompt for all historic eligible WOs (simplest, may flood), (2) show
only the most recent N, (3) require `WorkOrder.updatedAt >=` a configured go-live date.

### G. Dismissal
"Nanti saja" collapses the card for the current visit; nothing is persisted server-side. Re-appears on the next
visit while still eligible. Optional: per-WO `localStorage` flag if product wants it to stay collapsed (adds the
portal's first client storage; wrap in try/catch).

### H. Security
`requireCustomerId` → `findOwnedWorkOrder` for both endpoints; scope identifiers from the server only; identical
404 for foreign/unknown WO; eligibility re-checked in the write transaction; unique index as the concurrency
guard; verify CSRF/origin handling for cookie-auth POST and add a body size cap (and rate limiting if available)
before shipping.

### I. Auditability
`AuditLog` action `CUSTOMER_FEEDBACK_SUBMITTED` written in the same transaction (via `recordAuditLog(…, tx)`),
with ip/userAgent from `requestContext`, metadata `{ workOrderId, workOrderNumber, rating, hasComment }`. Feedback
row retained (Restrict). No edit/delete path.

### J. Testing (later)
Unit/service (`customer-portal.service.test.ts` pattern, Vitest):
- eligible only for DONE (and legacy completed) + ≥1 ISSUED-with-PDF certificate; each of: IN_PROGRESS, CANCELLED, DONE-no-cert,
  DONE-with-`ISSUED_WITHOUT_PDF`, DONE-with-DRAFT/REVOKED/SUPERSEDED cert → not eligible.
- foreign WO / unknown WO: identical 404 for GET and POST; client-supplied `customerId` ignored.
- disabled user, removed membership, unlinked user → same 403 as other routes.
- POST validation: rating 0/6/non-int/missing → 400; 1 star without comment OK; 5 stars with comment OK; comment
  trimmed/empty→null/over-limit rejected.
- duplicate and concurrent POST → exactly one row, second gets 409 (simulate `P2002`).
- eligibility lost between GET and POST → 409 `FEEDBACK_NOT_ELIGIBLE`.
- AuditLog row written atomically; rolled back if insert fails.
- DB: CHECK(1..5) rejects 0/6; unique(workOrderId).
HTTP (existing `describe("HTTP")` style): 401 without session.
Front-end: pure helper tests in `lib/` (labels, error mapping); if component testing is added, card visibility
for eligible/submitted/ineligible, collapse on "Nanti saja", error and retry states, keyboard operation of the rating group.
E2E (if/when a harness exists): customer completes → opens WO → submits → card shows thank-you → reload persists;
second browser session sees submitted state.

---

## 15. Files Inspected

- `packages/db/prisma/schema.prisma` (enums `:23-330`, `CustomerUserLink :780`, `Customer :1067`, `WorkOrder :1907`, `WorkOrderItem :1989`, `PurchaseOrderItemAllocation :2031`, `CalibrationJob` model fields, `Certificate :3072`, `AuditLog :3324`, `User :559`)
- `packages/db/prisma/migrations/` (listing; names of latest migrations; CHECK-constraint precedents via grep)
- `apps/api/src/app.module.ts`
- `apps/api/src/modules/work-orders/work-orders.service.ts` (`:36-52, 145-210, 496-610, 1126-1185, 1355-1375` and greps), `work-orders.controller.ts` (route/permission listing, `:253-270`), `work-orders.service.test.ts` (test names)
- `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts` (`:1280-1484`, status greps), `certificate.service.ts` (`:1-139, 234-273, 500-729, 795-835`), `audit-log.ts`, `calibration-jobs.controller.ts` (certificate routes)
- `apps/api/src/modules/customer-portal/` — `customer-portal.service.ts` (full), `customer-portal.controller.ts` (full), `customer-portal.module.ts`, `customer-progress.ts` (full), test names in `customer-portal.service.test.ts`
- `apps/api/src/modules/certificate-verification/certificate-verification.service.ts` (full)
- `apps/api/src/modules/users/users.service.ts` (`:300-335, 370-382, 420-435`)
- `apps/customer-portal/src/app/(app)/work-orders/[id]/page.tsx` (full), `(app)/layout.tsx`, `(app)/page.tsx`, `providers.tsx` (`:1-80`), `lib/session.ts`, `lib/customer-query.ts`, `lib/use-customer-queries.ts` (`:1-60`), `components/auth-gate.tsx`, `components/work-order-progress.tsx` (head), `customer-portal-api-rewrites.js`, `package.json`, directory listing, test file listing
- `docs/hands-off/Handoff_Customer Portal_QR Certificicate_For_claude.md` (full)
- Repo-wide greps: `feedback|satisfaction` (no existing implementation), `throttl|rate.?limit`, `trustedOrigins`, `useMutation`, dialog/toast patterns, `REVOKED|SUPERSEDED`

---

## Confirmed by code

- WO transitions and terminal states; no reopen; `done()` gated on all jobs `ACCEPTED_BY_QA`; manual action; not audited; no certificate coupling.
- No completion timestamp on `WorkOrder`/`CalibrationJob`.
- Job `ACCEPTED_BY_QA` has no reversal path.
- Customer-facing status mapping, including legacy statuses → COMPLETED.
- Portal "certificate available" = `ISSUED` + `pdfFileObjectId`; generated certificates can be ISSUED without PDF; uploads don't require job acceptance; generated ones do.
- REVOKED/SUPERSEDED are never written by any code.
- Customer scoping via `requireCustomerId` + `findOwnedWorkOrder` with identical 404/403 bodies; tests cover it.
- One portal user per customer (`@@unique([customerId])`); links deleted on membership removal / role change.
- `recordAuditLog` supports transaction clients; certificate PDF views are audited (portal and QR routes).
- All existing customer routes are GET; no dialog/toast/`useMutation`/client storage in the portal; no feedback code exists.
- No rate limiting found in `apps/api/src` or `packages/auth/src`.

## Reasonable architectural inference

- Eligibility = completed status ∧ ≥1 available certificate ∧ no feedback; computed server-side, not persisted.
- Feedback parent = `WorkOrder` with `@unique`, redundant `customerId`, nullable `submittedByUserId` (SetNull), `Restrict` on WO FK, CHECK 1..5.
- Immutability + same-transaction `AuditLog` row.
- No server-side dismissal storage; inline card on the detail page; separate GET so the list path is unchanged.
- WOs with a permanently AKD/AKL-REJECTED device can never be DONE (inferred from comments + `done()`).
- Custom Nest POST routes may not be covered by Better Auth `trustedOrigins` protection.

## Still requires product decision

- Whether eligibility needs ≥1 certificate or a stricter "all units with output".
- Whether legacy `TECHNICALLY_DONE`/`CLOSED` WOs may be prompted.
- How to treat the historic backlog at launch (all / most recent N / go-live cutoff).
- Whether "Nanti saja" should stay collapsed across visits (and thus introduce client storage), or re-show each visit.
- Whether having viewed a certificate (AuditLog) should gate or merely time the prompt.
- Definition of "negative" (≤2? ≤3?) and who reviews feedback / how review is evidenced (nullable review columns later).
- Comment length limit and whether comments may be shown back to the customer.
- Whether a completion timestamp should be introduced separately for metrics.
