# MOM #1 — Final Business Clarification: Consumed Item Removal Semantics

**Status:** Analysis only. No code, schema, migration, API, or UI was changed.
Every claim below was verified against the actual repository state — Prisma
schema, generated migration SQL (the ground truth for FK delete rules, not
just the `schema.prisma` relation attributes), and service-layer code — not
inferred or assumed. This report answers the one open question the prior gap
analysis (`mom-1-revision-scope-semantics-gap-analysis-20260920.md`, §8)
deliberately left unresolved: *what is the business-safe behavior when an
item that has already been snapshotted downstream is removed from the
desired revision scope?*

---

## 1. Executive Answer

**There is no single removal rule — there is a hard ceiling that moves down
the chain as real work accumulates, and the codebase already tells you
exactly where each ceiling is, because it is enforced by database foreign
keys, not by convention.** Concretely:

- An item can be **safely, literally deleted** for as long as **no live row
  one level downstream references it**. This is not a judgment call — it is
  a `RESTRICT` foreign key that will throw at the database level if violated.
- The moment a `CalibrationRequestItem` has produced a `QuotationItem`, a
  `QuotationItem` has produced a `PurchaseOrderItem`, or a
  `PurchaseOrderItem` has produced a `WorkOrderItem`, deleting the upstream
  row stops being an option. **"Removal" past that point cannot mean `DELETE`
  — it can only mean marking the line inactive/retired while the row (and
  everything historical that already points at it) stays intact.**
- **`WorkOrder.start()` is a real and important boundary, but it is not the
  first one, and it is not the last one either.** By the time a
  `WorkOrderItem` exists at all (which happens at `WorkOrder.create()` or
  `WorkOrder.revise()`, independent of `start()`), the item is already
  downstream-referenced and un-deletable. What `start()` specifically adds is
  `CalibrationJob` rows — and for those, there is **no existing mechanism to
  retire a job at all**, deleted or otherwise, at any status. Past `start()`,
  "removing" an item's scope cannot touch the jobs that already exist for it
  by any means the current codebase provides.
- There is a **further, harder ceiling beyond `start()`** that the task's
  framing (before/after `start()`) doesn't mention but the schema enforces
  anyway: once a `Certificate` has been issued for a `CalibrationJob`
  (`Certificate.calibrationJobId` is `ON DELETE RESTRICT`), that job — and
  therefore everything upstream of it — is permanently undeletable at the
  database level. This is not yet a live/reachable state (no service in the
  repository currently creates a `Certificate` — see §4.4) but it is a real,
  already-declared constraint that any future removal design must not
  contradict.

---

## 2. Scope & Method

This report traces exactly one thing: **what happens, mechanically and by
existing precedent, when a line that has already produced a downstream
snapshot is taken out of the "desired scope" the customer now wants** — not
a redesign proposal. Every delete-rule claim below was checked against the
actual generated SQL in `packages/db/prisma/migrations/*/migration.sql`
(the authoritative source — a `schema.prisma` relation with no explicit
`onDelete` does not always mean what it looks like it means; see §3.1) rather
than assumed from the Prisma schema attributes alone, per the standing
instruction not to infer capability from schema legality without tracing
actual behavior.

---

## 3. The Governing Constraint: Foreign-Key Delete Rules (Verified)

This is the actual, complete chain of `ON DELETE` rules from
`CalibrationRequestItem` down to `Certificate`, each one confirmed directly
in the generated migration SQL:

| Parent row | Child table / column | Actual `ON DELETE` rule | Migration file |
|---|---|---|---|
| `CalibrationRequestItem` | `QuotationItem.requestItemId` | **`SET NULL`** | `20260813063336_init_better_auth_fcmtoken/migration.sql:885` |
| `QuotationItem` | `PurchaseOrderItem.quotationItemId` | **`RESTRICT`** | `20260823143000_add_purchase_order/migration.sql:103` |
| `PurchaseOrderItem` | `WorkOrderItem.purchaseOrderItemId` | **`RESTRICT`** | `20260827210000_work_order_mvp/migration.sql:38` |
| `PurchaseOrderItem` | `CalibrationJob.purchaseOrderItemId` | **`SET NULL`** | `20260823143000_add_purchase_order/migration.sql:118` |
| `CalibrationRequestItem` | `CalibrationJob.calibrationRequestItemId` | **`SET NULL`** | `20260902050955_add_calibrationjob_identity_fields/migration.sql:25` |
| `CalibrationJob` | `MeasurementResult`, `JobEvidence`, `CustomerSignature`, `QualityReview`, `JobReferenceEquipmentUsed`, `IdentityCorrection`, `PhysicalCheckResult`, `KontrolAlat`, `LkDownloadAuthorization` | **`CASCADE`** (all of them) | multiple migrations, e.g. `20260813063336_.../migration.sql:912-927` |
| `CalibrationJob` | `Certificate.calibrationJobId` | **`RESTRICT`** | `20260813063336_init_better_auth_fcmtoken/migration.sql:942` |

### 3.1 The asymmetry that matters most

**The first link in the chain (`CalibrationRequestItem → QuotationItem`) is
`SET NULL`, not `RESTRICT` — unlike every other link below it.** This means
the database itself would technically *allow* deleting a
`CalibrationRequestItem` after a `Quotation` has already been generated from
it; it would just silently null out the `QuotationItem.requestItemId`
back-reference, permanently severing that Quotation line's traceability to
the requisition it came from. **This is exactly the kind of silent desync
the "frozen once consumed" service-layer rule (see
`mom-1-item-revision-rule-20260919.md`) exists to prevent** — the database
would not stop it, but the business rule already implemented in
`CalibrationRequestsService.revise()` (checking a live `QuotationItem.count()`
before allowing any mutation, `calibration-requests.service.ts:508-511`)
independently prevents *editing* it, and by the same logic must also prevent
*deleting* it, even though a raw DB delete alone wouldn't be physically
blocked here the way it would be one level further down.

### 3.2 Why `CalibrationJob`'s own `SET NULL` never actually gets exercised

`CalibrationJob.purchaseOrderItemId` is `SET NULL`, which in isolation would
suggest a `PurchaseOrderItem` *could* be deleted even after jobs exist for
it. In practice this never happens, because a `CalibrationJob` is only ever
created from a `WorkOrderItem` (`fanOutCalibrationJobs`,
`work-orders.service.ts:597-620`, copies `purchaseOrderItemId` from the
`WorkOrderItem` it's fanning out), and a `WorkOrderItem` referencing that same
`PurchaseOrderItem` therefore always exists whenever a job for it exists. The
`WorkOrderItem → PurchaseOrderItem` `RESTRICT` (§3, row 3) is hit first and
blocks the delete before `CalibrationJob`'s own permissive rule is ever
reached. **Net effect: a `PurchaseOrderItem` that has reached a `WorkOrder`
is undeletable, full stop — the `CalibrationJob` FK's permissiveness is
irrelevant in practice.**

---

## 4. Existing Precedent for "Retiring" a Line (What Already Exists, What Doesn't)

### 4.1 A dormant, unused per-line status already exists on `PurchaseOrderItem`

`PurchaseOrderItemStatus` (`schema.prisma:157-162`) is `OPEN | ALLOCATED |
FULFILLED | CANCELLED` — **`CANCELLED` is already a declared value.**
However, a repository-wide search
(`grep -r "purchaseOrderItem.*status\|PurchaseOrderItemStatus" apps/api/src`)
found **zero references** to this field anywhere in the service layer. It is
set once, implicitly, to its schema `@default(OPEN)` at row creation
(`purchase-orders.service.ts` item-creation code) and **never read or
written again by any existing code path.** This is a real, already-shaped
column with the exact right semantics for "this specific PO line is no
longer active without deleting it" — but it is currently pure schema
potential, not a live mechanism. Using it would require new service logic
(a write path, and any read path that currently assumes all
`PurchaseOrderItem` rows on a PO are active would need to start filtering by
status); it would **not** require a migration, since the column and enum
value already exist.

### 4.2 No equivalent exists on `QuotationItem` or `WorkOrderItem`

Neither model has any status/active flag at the item level.
`QuotationItem` has only a `pricePending` boolean (unrelated — it flags
missing pricing, not line activity). `WorkOrderItem` has no status field at
all — only `id`, `companyId`, `workOrderId`, `purchaseOrderItemId`,
`description`, `qty`, `createdAt` (`schema.prisma:1886-1892`), and its own
doc comment states plainly: *"Quantity and source identity are immutable
after create."* Retiring a `WorkOrderItem` line today has **no existing
representational concept whatsoever** — not even a dormant one.

### 4.3 The only existing precedent for "the document changed underneath in-flight work" is whole-header cancellation — and it explicitly does not touch items or jobs

`WorkOrdersService.cancel()` (`work-orders.service.ts:1115-1135`) is
reachable from `PLANNED`, `ASSIGNED`, **and `IN_PROGRESS`** (confirmed via
`ALLOWED_TRANSITIONS`: `IN_PROGRESS: ["DONE", "CANCELLED"]`). It does exactly
one thing: `prisma.workOrder.update({ data: { status: "CANCELLED" } })`. It
**does not touch any `WorkOrderItem` row, does not touch any `CalibrationJob`
row, and does not change any job's `CalibrationJobStatus`.** Whatever jobs
existed at whatever status (`PENDING`, `IN_PROGRESS`, `SUBMITTED`, `REWORK`,
`ACCEPTED_BY_QA`) simply remain exactly as they were, now sitting under a
`CANCELLED` header. **This is the closest existing precedent in the entire
codebase for "downstream execution state outlives a document-level change,"
and the precedent it sets is: leave the child rows alone; only the header
moves.** There is no precedent anywhere for retiring an individual item or
job while its parent document stays active.

### 4.4 `CalibrationJobStatus` has no `CANCELLED`/retired value, and no code deletes a `CalibrationJob`

`CalibrationJobStatus` is `PENDING | IN_PROGRESS | SUBMITTED | REWORK |
ACCEPTED_BY_QA` (`schema.prisma:182-188`) — **no cancelled/void value
exists.** A repository-wide search for `calibrationJob.delete` /
`calibrationJob.deleteMany` found **zero matches** in `apps/api/src`. The
`unitTotal` field's doc comment (`schema.prisma:2287-2291`) mentions *"if a
sibling job is later cancelled/deleted"* as the rationale for freezing that
number — but this is defensive/forward-looking language about a scenario the
comment anticipates, **not a description of an implemented feature.** No
service creates `Certificate` rows yet either (repository-wide search for
`certificate.create(` in `apps/api/src` found no matches) — so the
`Certificate` `RESTRICT` boundary from §3 is a real, already-declared
constraint, but not yet a *reachable* one in the running system today.

---

## 5. Business-Safe Removal Semantics, by Point in the Chain

Stated as what is **actually safe today**, derived directly from §3–§4, not
as a proposal:

| Consumption state of the item | Safe to hard-delete the row? | Why |
|---|---|---|
| `CalibrationRequestItem`, no `Quotation` generated yet | **Yes** | Nothing references it. |
| `CalibrationRequestItem`, `Quotation` already generated | **No — even though the FK alone wouldn't stop it** | `SET NULL` would let the DB accept the delete, but it would silently orphan the `QuotationItem`'s traceability back to the requisition (§3.1). Business-unsafe despite being schema-legal. |
| `QuotationItem`, no `PurchaseOrder` created yet | **Yes** | Nothing references it. |
| `QuotationItem`, `PurchaseOrder` already created | **No — blocked at the database level** | `RESTRICT`. A delete attempt raises a real FK violation. |
| `PurchaseOrderItem`, no `WorkOrder` has picked it up yet | **Yes** | Nothing references it. (This state is reachable: a `PurchaseOrderItem` added via `PurchaseOrder.revise()` after a `WorkOrder` already exists is not yet mirrored into a `WorkOrderItem` until `WorkOrder.revise()` is separately called.) |
| `PurchaseOrderItem`, a `WorkOrderItem` already exists for it | **No — blocked at the database level** | `RESTRICT`. |
| `WorkOrderItem`, `WorkOrder` not yet started (`PLANNED`/`ASSIGNED`) | **Yes, the row itself has no children yet** | No `CalibrationJob` exists for it (fan-out only happens at `start()`). This is the *only* point at which a `WorkOrderItem` could safely be deleted — and even here, doing so is a new capability (nothing today ever deletes a `WorkOrderItem`; the "immutable after create" doc comment currently describes the *complete absence* of any mutation, deletion included). |
| `WorkOrderItem`, `WorkOrder` started — jobs fanned out | **No, not by deletion, and not by any other existing mechanism either** | `CalibrationJob` rows now exist with no cancel/delete/retire path at all (§4.4). Deleting the `WorkOrderItem` is not DB-blocked directly (`CalibrationJob.purchaseOrderItemId`/`calibrationRequestItemId` are `SET NULL`, and `CalibrationJob` has no direct FK to `WorkOrderItem` at all in this schema — jobs reference `purchaseOrderItemId`, not `workOrderItemId`) — but doing so would leave live, in-progress or already-recorded calibration work (`MeasurementResult`, `PhysicalCheckResult`, `QualityReview`, etc., all `CASCADE` from `CalibrationJob`) referencing a deleted `WorkOrderItem` it no longer has any record of originating from. This is schema-permitted destruction of real recorded work, not a safe operation. |
| `CalibrationJob` has an issued `Certificate` | **No, absolutely not, at any level upstream** | `RESTRICT`. Not yet reachable in the running system (§4.4), but already a hard schema-level ceiling for the day it is. |

---

## 6. The `WorkOrder.start()` Boundary, Specifically

Answering the task's explicit framing directly:

**Before `start()`:** the `WorkOrderItem` row exists (if the `PurchaseOrder`
line has already been picked up via `WorkOrder.create()`/`WorkOrder.revise()`)
but no `CalibrationJob` has been fanned out for it yet. At this point, in
principle, removing the item is the *least* destructive point downstream of
a `PurchaseOrder` — there is no execution-state data to lose. It is still not
something any existing code does, but it would not conflict with any FK or
destroy any recorded technician work.

**After `start()`:** `fanOutCalibrationJobs()` has created `unitTotal` (=
`WorkOrderItem.qty`, coerced to an integer, `work-orders.service.ts:611`)
`CalibrationJob` rows for that item, each with its own `unitOrdinal`
(1-based) and its own independent status. Because the fan-out idempotency
guard is **WorkOrder-wide, not per-item**
(`alreadyFannedOut = count(where: { workOrderId })`,
`work-orders.service.ts:601-604`), and because `WorkOrder.revise()` is
already gated to `PLANNED`/`ASSIGNED` only (`REVISABLE_WORK_ORDER_STATUSES`,
`work-orders.service.ts:146`), **the existing implementation already
guarantees that `revise()` itself can never run after `start()`.** The
practical question this report was asked to resolve is therefore not "can
`revise()` remove a job post-`start()`" (it structurally cannot reach that
state at all today), but "if a *future* mechanism allowed touching scope
after `start()`, what would be safe" — and the answer, per §4.4 and §5, is:
**nothing about an already-fanned-out job can be safely removed by deletion,
because no code anywhere cancels, voids, or deletes a `CalibrationJob`, and
several real records (`MeasurementResult`, `QualityReview`,
`PhysicalCheckResult`, etc.) may already be cascaded from it by the time
anyone asks to remove it.**

---

## 7. What Must NOT Be Done (Ruled Out by Direct Evidence, Not Opinion)

- **Do not represent "removed" as a `DELETE` for any row that has a live
  downstream child.** Two of the three chain links enforce this at the
  database level (`RESTRICT`); the third (`SET NULL`) does not enforce it
  mechanically but the existing consumed-check business rule already treats
  it as frozen for the same reason (§3.1).
- **Do not treat `CalibrationJob.purchaseOrderItemId`'s `SET NULL` rule as
  license to delete a consumed `PurchaseOrderItem`.** The `WorkOrderItem`
  `RESTRICT` blocks it first in every real scenario (§3.2).
- **Do not invent a negative-quantity or delta history row to represent
  removal.** This report's predecessor already ruled this out explicitly
  (`mom-1-review-transaction-revision-immutable-history-20260919.md`), and
  nothing found here changes that — `*History` tables remain complete
  snapshots; a "removed" line is represented by its **absence** from the
  *next* revision's item snapshot, not by a special history row.
- **Do not repurpose the header-level `CANCELLED` status to mean "this one
  line was removed."** `CANCELLED` at every header level (`CalibrationRequest`,
  `Quotation`, `PurchaseOrder`, `WorkOrder`) means "the whole document was
  explicitly cancelled" — confirmed unchanged and untouched by this
  investigation, consistent with the already-locked invariant from the prior
  reports.
- **Do not assume `PurchaseOrderItemStatus.CANCELLED` is already wired up.**
  It is schema-present but service-layer dormant (§4.1) — recommending its
  reuse is a statement about available *shape*, not available *behavior*.

---

## 8. Business Questions That Remain Genuinely Open (Not Answerable from Code)

These cannot be resolved by reading the repository further — they are
business decisions a future implementation prompt must settle before writing
any code:

1. **Does "removing" an unconsumed line mean a hard `DELETE`, or should even
   unconsumed lines be soft-retired** (e.g. for audit purposes, so a
   requisition's own history shows a line was requested and then withdrawn
   before ever reaching a quotation)? Nothing in the existing code answers
   this — DRAFT-stage `update()` today always hard-deletes and recreates
   items (`quotationItem.deleteMany` + `createMany`,
   `quotations.service.ts`), so there is a precedent for "unconsumed = fully
   disposable," but that precedent is about the DRAFT-editing flow, not the
   Revision flow specifically.
2. **If a `WorkOrderItem` is retired pre-`start()`, does its corresponding
   `PurchaseOrderItem` also need to be marked inactive**, or does it remain
   `OPEN` indefinitely, available to be picked up by a *different* future
   `WorkOrder`? The current 1:1 `create()` copy model doesn't anticipate a
   `PurchaseOrderItem` being "returned to the pool."
3. **What is supposed to happen to a `CalibrationJob` that is `PENDING`
   (not yet started by a technician) when its originating scope is later
   removed**, given no cancel/void mechanism exists for a job today? Is a new
   terminal `CalibrationJobStatus` value (e.g. `CANCELLED`/`VOIDED`) an
   acceptable modeling choice, or does the business require the physical
   calibration to always be either completed or explicitly refused by a
   technician, never silently withdrawn? This is a workflow question, not an
   engineering one.
4. **Is retiring a job that already has recorded `MeasurementResult`/
   `PhysicalCheckResult`/`QualityReview` data ever an acceptable business
   operation**, or should the system instead forbid removal once *any*
   execution data exists, regardless of job status? The schema's `CASCADE`
   rules make deletion of such a job *mechanically* possible; whether it
   should ever be *permitted* is a data-integrity/compliance question outside
   what code inspection can answer.

---

## 9. Risks / Constraints Recap

- `QuotationItem → PurchaseOrderItem` and `PurchaseOrderItem → WorkOrderItem`
  are `RESTRICT` — any future removal design must route around these, not
  through them (i.e., never attempt the `DELETE` once a child exists).
- `CalibrationRequestItem → QuotationItem` is `SET NULL`, the one asymmetric
  exception — a future removal design must add an explicit application-level
  guard here too, since the database will not provide one.
- `CalibrationJob` has no cancel/void status and no delete path anywhere
  today — any post-`start()` removal capability is blocked not by a
  constraint that prevents it, but by the complete *absence* of a mechanism
  to do it safely.
- `Certificate.calibrationJobId` is `RESTRICT` — a real, currently-dormant
  future ceiling; not yet reachable because no service issues certificates
  yet, but any removal design must not assume this boundary doesn't exist
  just because it isn't live today.
- `WorkOrder.revise()`'s existing `PLANNED`/`ASSIGNED`-only gate already
  fully prevents any revision (including a hypothetical future removal
  capability, if added the same way) from ever running after `start()` — this
  gate does not need to change to keep removal safe; it already does the
  safe thing by construction.
- `PurchaseOrderItemStatus.CANCELLED` is available shape with zero behavior
  behind it — a real asset for a future design, but not proof that per-line
  retirement is "already supported."

---

## 10. Bottom Line

The business-safe rule the existing code already implies, without needing
any new invention, is: **an item can be removed by deletion for exactly as
long as it has no live child one level down; the instant it does, "removal"
can only ever mean marking it retired/inactive in place while it and its
history remain intact — and past `WorkOrder.start()`, even that is
incomplete, because the one thing that most needs a retirement concept
(`CalibrationJob`) currently has none at all.** `WorkOrder.start()` is a real
and already-correctly-enforced boundary (revision is already gated to
`PLANNED`/`ASSIGNED`), but it is one checkpoint among several, not the only
one — the `QuotationItem`/`PurchaseOrderItem` `RESTRICT` boundaries bite
earlier, and the dormant `Certificate` `RESTRICT` boundary would bite later,
once that feature goes live.
