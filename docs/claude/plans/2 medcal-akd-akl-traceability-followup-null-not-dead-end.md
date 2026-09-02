# MedCal — AKD/AKL Traceability: Follow-up Assessment
## "NULL at Requisition ≠ Not Required"

> **Status: ANALYSIS / DESIGN ASSESSMENT ONLY.** Follow-up to
> `medcal-akd-akl-traceability-curious-journal.md`. No schema, migration, seed, API, UI, or
> config changes are proposed for execution.

---

## 1. Executive conclusion

The locked principle is sound and refines (does not contradict) the previous assessment:

> **"Regulatory identity may be unknown during commercial intake, but must become resolved
> or explicitly exception-approved before calibration execution."**

The previous assessment already put the enforcement gate at `CalibrationJob`. What was
under-specified is the **Requisition side**: a bare nullable `akdAkl` column cannot
distinguish *"not asked yet"* from *"customer says none exists"* from *"customer gave a
value we haven't checked."* Left as one column, NULL silently absorbs all of these and the
system loses the ability to (a) chase down unresolved items before the technician is on
site, and (b) reconstruct history for a retrospective regulatory audit years later.

The fix is **not** a new database enum forced onto `CalibrationRequestItem` on day one. It
is a **status concept** that should exist in the business/domain model regardless of
whether it is implemented as a real column now, a derived value now (computed from
which optional fields are filled), or a column added later. The key deliverable of this
follow-up is: *define the states, decide where each is captured, and decide which ones
require a real column vs. can stay derived.*

Everything downstream of the previous assessment stands: no propagation into
Quotation/PO/WorkOrder/DLN, `CalibrationJob` remains the mandatory-via-gate control point,
Device and CalibrationJob values remain separate (master vs. evidence).

---

## 2. Requisition: what NULL means, and whether a status is needed

### The five distinctions in the brief, mapped

| # | Distinction | Belongs at Requisition? | Representation |
|---|---|---|---|
| A | Customer has not provided AKD/AKL yet | **Yes** | `akdAkl IS NULL` **and** no explicit "none" flag set — the true default state |
| B | Customer says the device has no AKD/AKL | **Yes** | Needs its own signal — cannot be represented by NULL, because NULL already means "not asked/not given" (see below) |
| C | Customer provided an AKD/AKL number | **Yes** | `akdAkl IS NOT NULL` |
| D | PKM has verified it | **No — belongs at CalibrationJob**, not Requisition. Verification requires physically confirming the device, which by design happens on-site / at execution. Requisition-stage "verification" would be a paperwork check at best (e.g. cross-referencing a Kemenkes database from the number alone) — worth naming as a *possible* future enhancement, but not a Requisition-stage state today. | — |
| E | PKM has discovered a discrepancy | **No — belongs at CalibrationJob** (comparing customer-supplied vs. technician-confirmed). Requisition cannot detect a discrepancy against itself. | — |

### Does Requisition need a status beyond NULL/value?

**Yes, conceptually — but only a 2-way split, not a rich state machine.** The distinction
that a bare nullable string cannot carry is **A vs. B**: "not yet known" vs. "customer
affirmatively says there is none." Both currently collapse to `akdAkl = NULL`. That
collapse is exactly the failure mode the business principle warns against — an
auditor/report cannot tell "we haven't followed up" from "customer told us it doesn't
apply," and worse, a NULL-forever item looks identical to a NULL-because-genuinely-exempt
item.

**Conceptual states at Requisition (domain concept, not necessarily a DB enum):**

- `NOT_PROVIDED` — default; customer gave nothing; open, needs follow-up.
- `CUSTOMER_DECLARED_NONE` — customer explicitly states the device has no AKD/AKL (e.g. a
  non-regulated accessory, or the customer believes it's exempt). This is still *not*
  authoritative — it's a customer claim to be checked at CalibrationJob — but it is a
  **different fact** from silence and must be recorded as such, with the value it is (a
  claim), not upgraded to `NOT_APPLICABLE` (which is a PKM/system determination reserved
  for CalibrationJob per the original assessment).
- `CUSTOMER_PROVIDED` — customer supplied a candidate number.

**Whether to spend a real enum column on this now vs. derive it later** is a business
decision (see §11), not something this assessment should force. Two honest options:

1. **Minimal now:** keep `akdAkl String?` only, and treat "customer declared none" as **out
   of scope for a dedicated field** — captured in the existing free-text `notes` until
   volume/demand justifies a column. Reporting on "not provided" is just `akdAkl IS NULL`.
   This under-serves distinction B but costs nothing today.
2. **Recommended:** add one small companion field —
   `akdAklDeclaration` (`NOT_PROVIDED | DECLARED_NONE | PROVIDED`) — alongside `akdAkl`.
   Cheap (one nullable enum/string column), and it is exactly what makes "NULL is not a
   dead end" queryable rather than aspirational. This is the natural place for the "status
   beyond NULL" the brief is asking about — **at Requisition only**, distinct from — and
   much simpler than — the CalibrationJob's `akdAklStatus` (`CONFIRMED /
   NOT_APPLICABLE / EXCEPTION_APPROVED`), which is a control-gate state, not an intake
   classification.

D and E (verified, discrepancy) are **not** Requisition concepts — they require a
physically-confirmed device and therefore belong entirely to CalibrationJob (§6).

---

## 3. Eventual resolution model

Two triggers resolve a Requisition-stage NULL/declaration, and both terminate at the same
place — the CalibrationJob snapshot — never at an intermediate document:

**Path 1 — resolved on-site (the default ON_SITE path):**

```
CalibrationRequestItem.akdAkl = NULL (NOT_PROVIDED)
        │  (no change through Quotation/PO/WorkOrder)
        ▼
Technician ON_SITE → device identified → serial confirmed → AKD/AKL read from label/docs
        ▼
CalibrationJob.akdAklNumber = <confirmed value>, akdAklStatus = CONFIRMED
        (job also stores a link back to the originating requestItemId's declaration state,
         so the report "was it ever provided by the customer" stays answerable)
```

**Path 2 — resolved earlier, before the technician visits:**

```
CalibrationRequestItem.akdAkl = NULL at submission
        ▼
Customer calls / emails / updates the request before Work Order execution
        ▼
CalibrationRequestItem.akdAkl updated in place (still Requisition-stage, still just a
   customer-supplied candidate — NOT yet "confirmed")
        ▼
Technician ON_SITE still performs physical confirmation (this does not skip the gate —
   see §7: customer-supplied is never auto-promoted to confirmed)
        ▼
CalibrationJob.akdAklNumber = <what the technician actually confirmed>
```

**Where the relationship between original input and final value is recorded:** the
`CalibrationJob` should retain a reference to its source `CalibrationRequestItem` (this
link already exists structurally via `purchaseOrderItemId` → `quotationItemId` →
`requestItemId`, or could be a direct denormalized `requestItemId` for convenience) so that
"customer said X, technician confirmed Y" is a **join**, not a second copy of X living on
the job. The job stores only what it observed; the requisition item stores only what the
customer said; the two are related by the existing document chain, not merged.

**Important:** neither path allows a customer-supplied value to *become* the job's
confirmed value without an explicit technician action. Editing `CalibrationRequestItem.akdAkl`
later is still intake data — it never auto-writes into a job that already exists or will be
created.

---

## 4. Early-warning / follow-up concept (no UI/implementation)

The goal is to surface unresolved regulatory identity **before** the technician is on site,
not merely at execution. Conceptually this is a set of queries/reports over existing +
proposed fields, not a new subsystem:

**Conceptual report set:**

1. **Open-intake report** — `CalibrationRequestItem` rows where declaration is
   `NOT_PROVIDED`, grouped by customer/request/deviceType, filterable by request age or
   proximity to scheduled Work Order date. This is the "chase the customer before the visit"
   worklist.
2. **Customer-declared candidates awaiting confirmation** — items where
   `akdAkl IS NOT NULL` (customer supplied or declared none) but no linked `CalibrationJob`
   yet exists, or exists but is not yet `CONFIRMED`/`EXCEPTION_APPROVED`. This is the
   "we have a lead, make sure the technician checks it" list.
3. **Discrepancy report** — jobs where the confirmed value differs from the linked
   requisition item's customer-supplied value (§7). Useful both operationally (data quality)
   and for a customer-relationship conversation ("you told us X, we found Y").
4. **Exception register** — `CalibrationJob.akdAklStatus = EXCEPTION_APPROVED`, joined to
   the approver and timestamp — a standing list for QA/management review and for exactly
   the KAN-style audit question.
5. **Regulatory-gap report** — devices (`Device.akdAklNumber IS NULL`) that have at least one
   completed `CalibrationJob`, i.e. calibrated equipment with no known regulatory identity on
   the master record at all — a master-data hygiene view distinct from the per-job evidence.

**Data required:** all five reports are joins over `CalibrationRequestItem` (+ new
declaration field), `CalibrationJob` (+ new AKD/AKL snapshot fields), and `Device`. None
require new tables — they require the fields identified in §9's matrix to exist so the
`WHERE`/`GROUP BY` clauses are possible. This is a query/reporting-layer concern once fields
exist, not a new domain concept.

---

## 5. Lifecycle control points (revisited)

| Stage | Can remain NULL? | Must eventually resolve? | Resolution mandatory here? | Exception allowed here? | Evidence becomes immutable here? |
|---|---|---|---|---|---|
| **Requisition** | Yes | No — Requisition itself doesn't need to resolve it | No | N/A (nothing to except yet) | No — item is editable until locked downstream |
| **Quotation** | N/A (no field) | N/A | No | N/A | No |
| **Purchase Order** | N/A (no field) | N/A | No | N/A | No |
| **Work Order** | N/A (no field) | No | No | N/A | No |
| **Device Identification** (on-site, pre-job) | Yes, transiently, during the confirm step | Yes — this is where resolution *happens* | Not itself a hard gate — it's the activity that produces the value the gate checks | N/A — this step is where an exception gets *raised*, not decided | No |
| **CalibrationJob** | No — must be `CONFIRMED`, `NOT_APPLICABLE`, or `EXCEPTION_APPROVED` before proceeding | **Here is where resolution becomes mandatory** | **Yes — the control gate** | **Yes — this is where the exception is recorded** | **Yes — once the job passes the gate / is submitted, the snapshot is frozen** |
| **Calibration (measurement)** | No — gate already passed | — | — | — | Already frozen |
| **Quality Review** | No | — | Reviewer sees the frozen job snapshot; QA does not re-decide AKD/AKL, but should be able to flag one back into exception review if evidence looks wrong | Reviewer can *route back*, not silently override | Stays frozen |
| **Certificate** | No | — | — | — | Certificate cites the frozen job snapshot, never a live `Device` value (per original assessment) |

**Why no propagation into Quotation/PO/WorkOrder:** none of these documents change price,
scope, or logistics based on AKD/AKL, and none of them represent a physically-confirmed
device — carrying the field through would create N copies of a value that is still "unknown
customer claim" at every one of those stages, adding update/sync burden with zero decision
value. This holds under the new principle too: NULL not being a dead end is solved by
**Requisition being queryable and CalibrationJob being the gate** — not by threading the
field through every document in between.

---

## 6. Customer-supplied vs. PKM-confirmed identity — keep separate, always

`CalibrationRequestItem.akdAkl` (customer claim) and `CalibrationJob.akdAklNumber`
(technician-confirmed evidence) must remain **two columns on two rows**, never merged into
one "current value," for the same reason `Device.akdAklNumber` and the job snapshot must
stay separate (original assessment §3):

- **They answer different questions.** "What did the customer say?" vs. "What did PKM
  verify at the point of calibration?" Both are independently useful, and losing either one
  loses information: overwriting the customer's `AKL-123` with the technician's `AKL-456`
  destroys the record that the customer's own paperwork said something different — which is
  itself an auditable fact (data quality on the customer side, or evidence the customer's
  documentation is out of date).
- **A discrepancy is a first-class fact, not an error to be silently corrected.** The
  system should be able to answer "show me every case where the customer's stated AKD/AKL
  did not match what the technician found" (§8, query 4) — impossible once one value has
  overwritten the other.
- **Timing differs.** The customer's claim is intake-time, pre-physical-confirmation. The
  technician's value is execution-time, physically verified. Collapsing them would also
  collapse the timestamp/attribution that makes the job's value trustworthy evidence.

This mirrors the original assessment's Device-vs-Job separation and extends it one hop
further upstream: **Requisition (claim) → Device (master belief) → CalibrationJob
(evidence)** are three distinct values, related by reference, never merged in place.

---

## 7. Device master vs. CalibrationJob snapshot — re-evaluated

The original recommendation — *"prompt, don't auto-write when master is empty; never
silently overwrite a non-empty master"* — **still holds and is reinforced, not weakened, by
the NULL-is-not-a-dead-end principle.** The new principle is about *not losing track of
unresolved items*, not about being more aggressive with automatic writes. If anything, it
argues for being *more* conservative:

- If `Device.akdAklNumber` were auto-populated from every confirmed job, the master would
  become a silent overwrite target that erases the very discrepancy history §6 says must be
  preserved. Keep the master update as a **user-confirmed action**, distinct from the job's
  automatic snapshot.
- When Device and Job differ, **neither is deleted or corrected automatically.** The
  Device master remains "PKM's current best understanding," the Job remains "what was
  true/observed on that date." A future job on the same device may confirm yet a third
  value — all of that is legitimate history, not noise to be resolved away.
- One addition worth locking now (see §11): should the *first-ever* confirmation for a
  Device with an empty master auto-populate it (low risk — nothing to overwrite, and it
  directly closes a "regulatory-gap" item from §4's report), while any *subsequent*
  confirmation on an already-populated Device always requires explicit user action? This is
  a refinement of the original recommendation, not a reversal of it.

---

## 8. Audit / retrospective traceability

### What must be preserved for a 2028-style retrospective review

The scenario in the brief (Requisition NULL in 2026, job confirms `AKL-123`, certificate
issued, then a 2028 policy-driven retrospective) requires that MedCal never *lose* the
timeline, even if it never needed a report like this on day one:

1. **The Requisition's original state must survive**, unedited by later confirmation — i.e.
   confirming a job must not retroactively "fix" or delete what the customer said (or didn't
   say) at intake. This is exactly why §6 insists on separate columns.
2. **The CalibrationJob's snapshot must be immutable once frozen** (already established) —
   the 2028 reviewer needs to see the value *as it was believed true in 2026*, not a value
   silently corrected later.
3. **Timestamps and actors on every state transition** — `akdAklConfirmedAt` /
   `akdAklConfirmedByUserId` on the job (already proposed), plus (new, minor) a
   `createdAt`/`updatedAt` on the Requisition item's declaration are enough to reconstruct
   "what was known, by whom, and when" without needing a full event-sourcing model.
4. **The exception trail** (who approved, when, presumably why — a `notes`/`reason` field
   on the exception) must be retained indefinitely, not archived away, since it is precisely
   the evidence a retrospective audit would ask for.
5. **No requirement to predict future regulation** — the ask here is generic traceability
   (what did we know, when, and who said so), not encoding any specific Kemenkes rule. The
   system does not need an "as-of-policy-date" field; it needs **accurate, immutable,
   timestamped snapshots** that any future policy question can be evaluated against
   after the fact.

This is achieved by the same field set already proposed in the original assessment plus the
Requisition declaration concept from §2 — no additional retrospective-specific schema is
needed if immutability and timestamping are respected at each existing point.

---

## 9. Multi-device / multi-job case — granularity check

For "1 Work Order → 10 devices → 10 CalibrationJobs, 3 items had AKD/AKL at Requisition, 7
were NULL, later 8 confirmed / 1 exception-approved / 1 rejected":

- **The control unit is the CalibrationJob, not the Work Order or the Requisition.** This
  was already locked ("1 CalibrationJob = 1 Device") and nothing here changes it — it is
  reinforced. Each of the 10 jobs carries its **own** `akdAklStatus`,
  `akdAklNumber`, `akdAklConfirmedBy/At`, independent of the other 9.
  `@@unique([workOrderId, deviceId])` already gives the correct per-device granularity.
- **The Work Order as a whole has no rollup status of its own required for this control** —
  its completion is governed by its existing state machine; AKD/AKL resolution is tracked
  per job, not aggregated onto the Work Order. (A *derived* summary — "9 of 10 jobs
  resolved, 1 exception" — is a reporting-layer view over the 10 jobs, not a new stored
  field.)
- **The "1 rejected / cannot proceed" case** is new relative to the original two-outcome
  framing (`CONFIRMED` / `NOT_APPLICABLE` / `EXCEPTION_APPROVED`) and needs its own
  terminal state — e.g. a job that cannot proceed because the customer cannot produce any
  AKD/AKL and management does not grant an exception. This is not "NOT_APPLICABLE" (that
  means "genuinely exempt") and not "EXCEPTION_APPROVED" (that means "proceeded anyway,
  approved"). It is a **calibration-refused / blocked** outcome — worth naming explicitly in
  the eventual `akdAklStatus`/job-status design so "why didn't job #7 complete" is
  queryable rather than inferred from an absent record.
- **History preserved per-item, not per-batch:** each of the 10 requisition items' original
  declaration state (§2) remains linked 1:1 through PO item → WO item → its own job, so
  "which of the 3 customer-declared items turned out correct at execution" is answerable
  per device, not just in aggregate.

---

## 10. Audit query support — data requirements (not implementation)

| Query | Data required |
|---|---|
| "Devices calibrated where AKD/AKL was not confirmed" | `CalibrationJob.akdAklStatus != CONFIRMED` joined to `Device` |
| "Jobs that proceeded under EXCEPTION_APPROVED" | `CalibrationJob.akdAklStatus = EXCEPTION_APPROVED` + approver/timestamp fields |
| "Requisition items where AKD/AKL was never provided" | `CalibrationRequestItem` declaration = `NOT_PROVIDED` (§2) — requires the declaration concept to exist in some form, since NULL-only cannot distinguish this from "customer declared none" |
| "Customer-supplied vs. technician-confirmed AKD/AKL" | Join `CalibrationRequestItem.akdAkl` to `CalibrationJob.akdAklNumber` via the request→PO item→WO item→job chain (or a direct `requestItemId` denormalized onto the job for convenience) |
| "All calibrations for a particular AKD/AKL" | Index/query on `CalibrationJob.akdAklNumber` (non-unique, since one NIE covers many devices — R3 from the original assessment) |
| "Devices with missing regulatory identity" | `Device.akdAklNumber IS NULL`, optionally narrowed to devices with ≥1 `CalibrationJob` |

None of these require new tables; all require the field set in §11's matrix plus the
requisition-declaration concept from §2 and a link from job back to its originating
requisition item. This assessment does not propose building the reports — only confirming
the data model would support them if built.

---

## 11. Updated field matrix

| Entity | AKD/AKL | Mandatory? | Meaning | Authoritative? | Snapshot? |
|---|---|---|---|---|---|
| **Device** | `akdAklNumber` (+ optional type/validity) | **O** | PKM's current best-known regulatory identity for the device | No — a working belief, correctable, superseded by job evidence when they conflict | No — it's the mutable master, the opposite of a snapshot |
| **Requisition** (`CalibrationRequestItem`) | `akdAkl` (value) **+** a declaration concept distinguishing not-provided / customer-declared-none / provided (§2) | **O** | A customer **claim**, made before any physical confirmation is possible | No — never authoritative, always a lead to verify | No — it's the origin, not a copy of anything |
| **Quotation** | — | N/A | — | — | — |
| **Purchase Order** | — | N/A | — | — | — |
| **Work Order** | — | N/A | — | — | — |
| **DLN** | — | N/A | DLN documents PKM's own reference equipment, unrelated to customer-device regulatory identity | — | — |
| **CalibrationJob** | `akdAklNumber` + `akdAklType?` + `akdAklStatus` (`CONFIRMED` / `NOT_APPLICABLE` / `EXCEPTION_APPROVED` / a blocked-outcome value per §9) + `akdAklConfirmedByUserId` + `akdAklConfirmedAt` | **M — via workflow gate**, not a DB `NOT NULL` | What was physically observed/confirmed (or formally excepted) for **this** device at **this** calibration | **Yes — this is the authoritative record for that calibration event** | **Yes — frozen once the job passes the gate / is submitted** |

No entity gains the field "for convenience" — each row states a reason rooted in what that
document actually represents, consistent with the original assessment's "don't propagate
merely to propagate" instruction.

---

## 12. Design-question verdict

**"Regulatory identity may be unknown during commercial intake, but must become resolved or
explicitly exception-approved before calibration execution."**

**Sound. Adopt it as a locked MedCal domain principle**, refined by this follow-up to add:
*"...and every unresolved instance must remain visible and queryable between intake and
execution — NULL is a valid state, not an absence of state."* The consequences:

1. Requisition-stage NULL is legitimate and must not be forced non-null to "solve" the
   problem — forcing it would just push customers to enter placeholder junk, which is worse
   than NULL.
2. The problem NULL creates is not at the database level, it's at the **reporting/workflow
   level** — solved by making the declaration state queryable (§2) and by proactive
   follow-up reporting (§4), not by schema pressure at intake.
3. The CalibrationJob gate remains the single hard enforcement point — consistent, doesn't
   need duplicating upstream.
4. Every value that ever gets attached to a device (customer claim, master belief,
   confirmed evidence) must stay attributable and separate — never overwritten in place —
   so that both today's audit and a future retrospective audit can be answered truthfully.

---

## 13. Risks and edge cases (incremental to the original assessment)

| # | Risk / edge case | Implication |
|---|---|---|
| F1 | Adding a Requisition declaration concept without a real column (Option 1 in §2) leaves "customer declared none" indistinguishable from "not asked" — early-warning reports (§4) would over-count follow-up work. | If Management genuinely wants the early-warning report, the declaration field is not optional — pick Option 2 in §2. |
| F2 | A blocked/rejected job outcome (§9) wasn't named in the original three-value status set. | The `akdAklStatus` design must include this fourth state before CalibrationJob is built, or "why did job #7 never complete" becomes an unanswerable support ticket. |
| F3 | Auto-populating an empty Device master on first confirmation (§7) could still be wrong if the *first* confirming job itself later turns out mistaken. | Even the "first confirmation" auto-write should be visibly attributed (which job populated it) so it can be traced/corrected, not just silently set. |
| F4 | Multi-job Work Orders (§9) risk operational confusion if staff assume "Work Order done" implies "all AKD/AKL resolved." | Any Work Order completion view should surface the per-job AKD/AKL rollup, even though the field itself lives on the job, not the Work Order. |
| F5 | Retrospective audits (§8) are undermined if any process ever does a bulk "clean up bad data" update that rewrites historical `CalibrationRequestItem.akdAkl` or job snapshots in place. | Corrections to historical rows, if ever needed, should be additive (a correction record/note) rather than destructive UPDATE — a data-governance rule to carry into implementation, not a schema feature per se. |

---

## 14. Business decisions still requiring explicit lock

1. **Requisition declaration field** — commit to Option 2 (§2): add
   `akdAklDeclaration` (or equivalent) now, or defer and accept the reporting gap in F1?
2. **Name and number of `CalibrationJob.akdAklStatus` values** — must include the
   blocked/rejected outcome identified in §9, in addition to the original
   `CONFIRMED / NOT_APPLICABLE / EXCEPTION_APPROVED`.
3. **First-confirmation auto-populate rule for `Device.akdAklNumber`** (§7 refinement) — adopt
   "auto-populate only when master is empty, always attributed" as the concrete rule, or
   keep the original assessment's stricter "always prompt, never auto-write" with no
   exception?
4. **Link shape from CalibrationJob back to CalibrationRequestItem** — a direct denormalized
   `requestItemId` on the job (simpler queries, per §10) vs. relying on the existing
   PO-item/WO-item join chain (no schema addition, more complex queries)?
5. **Data-governance rule for historical corrections** (F5) — formally adopt "corrections are
   additive, never destructive UPDATE" for any AKD/AKL-bearing field, to protect
   retrospective audit capability.
6. **Early-warning report ownership** — which team (Ops? QA? Scheduling?) owns acting on the
   §4 "not yet provided" worklist, and at what point in the Work Order scheduling process is
   it consulted? (Operational decision, not a data-model one, but it determines whether §4's
   reports need to be real-time or can be a periodic batch view.)

---

## 15. Exact code/schema areas that WOULD eventually be affected

> Scoping only — **not to be changed under this task.** Builds on the original assessment's
> §7 list; only the deltas introduced by this follow-up are called out here.

| Area | Delta vs. original assessment |
|---|---|
| `CalibrationRequestItem` (`packages/db/prisma/schema.prisma:1317-1350`) | New: optional `akdAklDeclaration` enum/string (§2, §11) alongside the previously-proposed `akdAkl String?`. |
| new enum | `AkdAklDeclaration { NOT_PROVIDED, DECLARED_NONE, PROVIDED }` (Requisition-stage; distinct from `AkdAklStatus` at CalibrationJob). |
| `CalibrationJob` (`packages/db/prisma/schema.prisma:1710-1735`) | `AkdAklStatus` enum gains a fourth value for the blocked/rejected outcome (§9, F2). Optionally a direct `requestItemId String?` for the traceability join (§10, decision 4). |
| `apps/api/src/modules/calibration-requests/calibration-requests.service.ts` | `create()` (L54-125) + DTO would set the declaration alongside `akdAkl`, derived from which input fields the customer/CSR actually filled (not user-chosen from a dropdown, to avoid another place for silent mis-entry). |
| **(new) `apps/api/src/modules/calibration-jobs/*`** | Same unbuilt module as before; the `assertAkdAklResolved(job)` guard must branch on the expanded status set (§9) and the confirmation-vs-Device-master write path (§7's refined rule) belongs here. |
| **(new) reporting/query layer** | The five conceptual reports in §4 and the six queries in §10 — not a new service module necessarily, but wherever MedCal's existing reporting/dashboard mechanism lives; no such mechanism was identified in this or the prior exploration, so this is a placeholder for wherever Management/Ops reporting is eventually built. |
| `apps/api/src/modules/devices/devices.service.ts` | Confirmation write-back path (§7) needs to record *which* job populated an empty `Device.akdAklNumber`, e.g. via an audit-log entry or a `akdAklSourceJobId` pointer — exact shape is an implementation decision, not fixed here. |

No changes to Quotation, Purchase Order, Work Order, or DLN modules/schema are introduced by
this follow-up — confirming the original assessment's non-propagation conclusion stands.
