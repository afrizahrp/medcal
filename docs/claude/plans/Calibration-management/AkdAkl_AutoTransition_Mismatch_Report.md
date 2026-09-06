# AKD/AKL Approval Status — Auto-Transition on Observed ≠ Declared Mismatch

Diagnosis + implementation report. Two stages, both complete. Nothing committed or
deployed (hard stop).

---

## Stage 1 — Diagnosis (read-only)

### Verdict

| Locked decision | Status before this work |
|---|---|
| **Q2** — auto `NOT_REQUIRED → PENDING_REVIEW` when `technicianObservedAkdAkl ≠ customerDeclaredAkdAkl` | **NOT IMPLEMENTED AT ALL** — no declared-vs-observed comparison existed anywhere |
| **Q5** — approved AKD/AKL auto-reverts to `PENDING_REVIEW` on a new Identity Correction | **PARTIALLY IMPLEMENTED** — only the `APPROVED → PENDING_REVIEW` edge, keyed on "correction carried an AKD/AKL value", not on an actual mismatch |

The pilot job `BAI/2026/09/00004` behaved exactly as the code was written and tested.
This was a missing feature, not a bug in existing logic.

### Where `akdAklApprovalStatus` was written (3 places, none comparing declared vs observed)

1. `escalateIdentity` — `calibration-jobs.service.ts` (~L340) — manual, technician-initiated,
   opt-in. Endpoint `POST /calibration-jobs/:id/escalate-identity`, RBAC
   `calibrationJob:escalateIdentity`. tech-pwa UI:
   `apps/tech-pwa/src/app/jobs/[id]/escalate/page.tsx` ("Eskalasi AKD/AKL"), both fields
   optional, **no mismatch precondition**.
2. `decideIdentity` (~L384) — manager APPROVE/REJECT of an already-`PENDING_REVIEW` gate.
3. `decideIdentityCorrection` (~L859) — the narrow `correction.newAkdAkl !== null && job.akdAklApprovalStatus === "APPROVED"` reopen.

The only AKD/AKL value comparison was `akdAklChanges` in `submitIdentityCorrection` —
`(input.newAkdAkl ?? null) !== job.technicianObservedAkdAkl` — used solely to decide
whether to record a `prevAkdAkl/newAkdAkl` delta on the correction row. Never read
`customerDeclaredAkdAkl`, never touched approval status.

### Why the auto-transition was never built

- `Implement_CalibrationJob_AkdAkl_Escalation_Staged.md` Step 0 chose **option (b)** — an
  explicit technician escalate endpoint — and explicitly deferred data-derived automatic
  transition to "once the tech-pwa execution surface is built".
- `work-orders.service.ts` fan-out (~L597) has a code comment: whether a null
  `customerDeclaredAkdAkl` should force `PENDING_REVIEW` was "a decision deferred to the
  AKD/AKL escalation task" — which deferred it again.
- Commit `63f7541` (Identity Correction workflow) added only the `APPROVED → PENDING_REVIEW`
  reopen edge.

### Why it didn't fire for `BAI/2026/09/00004`

1. Fan-out created the job `NOT_REQUIRED`, snapshotting `customerDeclaredAkdAkl = "AKL-2022-02-BM"`.
2. Identity Correction set `newAkdAkl = "AKL91849201"`.
3. On approval, `decideIdentityCorrection` wrote `technicianObservedAkdAkl = "AKL91849201"`
   but `reopenAkdAklGate` was `false` — the guard required `akdAklApprovalStatus === "APPROVED"`
   and the job was `NOT_REQUIRED`.
4. Nobody pressed "Eskalasi AKD/AKL", so nothing else moved it.

Test `calibration-jobs.service.test.ts` "approve does NOT reopen the gate when it was never
APPROVED" locked this (incorrect, per Q2) behavior in.

---

## Stage 2 — Implementation

### Files changed

| File | Change |
|---|---|
| `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts` | Replaced the narrow `reopenAkdAklGate` guard in `decideIdentityCorrection` with a real declared-vs-observed mismatch check; added `AKD_AKL_GATE_STAMP_RESET` shared constant; updated the `AKD_AKL_TRANSITIONS` doc comment |
| `apps/api/src/modules/calibration-jobs/calibration-jobs.service.test.ts` | Rewrote the old "never APPROVED" test; added 3 new tests |

### New logic (`decideIdentityCorrection`, APPROVE path)

```ts
const akdAklCorrected = correction.newAkdAkl !== null;
const updatedObservedAkdAkl = akdAklCorrected
  ? correction.newAkdAkl
  : job.technicianObservedAkdAkl;
const akdAklMismatch =
  akdAklCorrected &&
  updatedObservedAkdAkl !== null &&
  updatedObservedAkdAkl !== job.customerDeclaredAkdAkl;

// Forward: an unreviewed discrepancy opens the gate. Subsumes the old
// "reopen a previously-APPROVED gate" edge — NOT_REQUIRED / APPROVED /
// REJECTED → PENDING_REVIEW are all permitted by AKD_AKL_TRANSITIONS.
const openAkdAklGate = akdAklMismatch && job.akdAklApprovalStatus !== "PENDING_REVIEW";

// Reverse (judgment call): a correction that resolves the discrepancy while the
// gate is still PENDING_REVIEW and undecided removes the reason for review.
const clearAkdAklGate =
  akdAklCorrected && !akdAklMismatch && job.akdAklApprovalStatus === "PENDING_REVIEW";

if (openAkdAklGate) assertAkdAklTransition(job.akdAklApprovalStatus, "PENDING_REVIEW");

// ...inside the transaction:
if (openAkdAklGate) {
  jobData.akdAklApprovalStatus = "PENDING_REVIEW";
  Object.assign(jobData, AKD_AKL_GATE_STAMP_RESET);   // nulls approver id + timestamp + decision note
} else if (clearAkdAklGate) {
  jobData.akdAklApprovalStatus = "NOT_REQUIRED";
  Object.assign(jobData, AKD_AKL_GATE_STAMP_RESET);
}
// correction row records: akdAklGateReopened: openAkdAklGate
```

### Decisions baked in

- **Gate is re-evaluated only when this correction changed the AKD/AKL value**
  (`akdAklCorrected`). An unrelated serial/device-only correction never disturbs the gate;
  a pre-existing stale mismatch is left alone (see pilot-data note). Deliberate guard beyond
  the literal task text — prevents an unrelated correction from silently discarding a manual
  escalation.
- The forward check **subsumes** the old APPROVED-reopen edge. No `AKD_AKL_TRANSITIONS`
  table change needed — `NOT_REQUIRED / APPROVED / REJECTED → PENDING_REVIEW` all already
  present.
- `null` customer declaration + non-null observed value counts as a mismatch (customer
  declared nothing, device has a number → warrants review).
- Stamp reset now also clears `akdAklDecisionNote` (old reopen cleared only approver id +
  timestamp). Factored into `AKD_AKL_GATE_STAMP_RESET` so both branches share one definition.

### Edge-case recommendation: "mismatch resolved → revert to NOT_REQUIRED"

**Implemented, scoped narrowly. Flagged for confirmation — outside the original Q2/Q5 wording.**

`clearAkdAklGate` fires only when: (1) this correction changed the AKD/AKL value, (2) the
resulting observed value now equals `customerDeclaredAkdAkl`, and (3) the gate is currently
`PENDING_REVIEW` and **not yet decided** by a manager.

Reasoning for **yes**: the gate's sole purpose is a manager's review of a discrepancy. If a
later approved correction removes the discrepancy before anyone decided, keeping
`PENDING_REVIEW` blocks the job for no reason. A gate a manager **already** decided
(`APPROVED`/`REJECTED`) is left untouched — that's a real regulatory decision on record.

**Residual consideration:** if a technician manually escalated for some other reason (gate
`PENDING_REVIEW`, observed already == declared) and then any AKD/AKL-touching correction is
approved, `clearAkdAklGate` would unwind that manual escalation. Judged acceptable since the
manual path is itself declared-vs-observed oriented — confirm if manual escalations should be
sticky.

### `escalateIdentity` — untouched

Remains an always-available, technician-initiated opt-in to `PENDING_REVIEW`, independent of
mismatch state.

### Pilot-data audit (report only — NO backfill run)

Dev/pilot DB, `akdAklApprovalStatus IN (NOT_REQUIRED, APPROVED)` with non-null
`technicianObservedAkdAkl` differing from `customerDeclaredAkdAkl`:

**4 stale jobs — all in WO `SPK/2026/09/00001`, all currently `NOT_REQUIRED`, each with an
APPROVED Identity Correction BA that set the mismatching value:**

| BA | akdAklApprovalStatus | customerDeclaredAkdAkl | technicianObservedAkdAkl | jobId |
|---|---|---|---|---|
| `BAI/2026/09/00001` | NOT_REQUIRED | `AKL-1985-MF` | `AKL/2026/09/01` | `cmtpek2120019pd0n3ljupws2` |
| `BAI/2026/09/00002` | NOT_REQUIRED | `null` | `AKL/2025/07/1847` | `cmtpek2120018pd0n73zwivk3` |
| `BAI/2026/09/00003` | NOT_REQUIRED | `AKL-1983-MF` | `AKL-7629491047` | `cmtpek2120017pd0nts5tyf0x` |
| `BAI/2026/09/00004` | NOT_REQUIRED | `AKL-2022-02-BM` | `AKL91849201` | `cmtpek2120016pd0njc3qbw5m` |

No `APPROVED`-status stale rows. The fix does not touch already-decided corrections; a
one-time backfill (and whether `declared = null` should count) is a separate decision.

### Test results — PASS

- `apps/api` typecheck: **PASS** (`tsc --noEmit`, clean)
- `calibration-jobs.service.test.ts` full suite: **PASS** — 85/85
- Targeted tests:
  - `approve opens the gate from NOT_REQUIRED when the corrected value mismatches the customer declaration` (rewritten from the old "never APPROVED" test)
  - `approve opens the gate (Q2) — job starts NOT_REQUIRED, correction sets observed ≠ declared`
  - `approve does NOT open the gate when the corrected value equals the customer declaration`
  - `approve unwinds a PENDING_REVIEW gate to NOT_REQUIRED when a later correction resolves the mismatch`
- Pre-existing gate tests still green: `reopens ... previously-APPROVED gate`, `does NOT reopen when AKD/AKL is not part of the correction`.

### Follow-ups (not done — separate decisions)

1. Backfill the 4 stale pilot jobs (or re-decide their BAs) so they reflect the new rule.
2. ~~Confirm whether manual escalations should be sticky.~~ **Resolved — see Stage 3.**
3. Consider firing the same mismatch check at Identity Correction **submission** time and/or
   in fan-out, not only at correction approval.

---

## Stage 3 — Make manual escalation sticky (provenance-aware gate)

### Problem

The Stage 2 auto-clear (`clearAkdAklGate`) treated every `PENDING_REVIEW` gate the same. A
technician's manual "Eskalasi AKD/AKL" can be raised for a concern the text comparison
cannot see (e.g. suspected forged izin-edar document) — yet a later correction that merely
lined up the AKD/AKL *text* would silently auto-clear it back to `NOT_REQUIRED`, so the
human-flagged concern vanished with no manager decision. Contradicts the project's
audit-trail principle.

### Schema change — migration required (additive, no backfill)

`packages/db/prisma/migrations/20260906145344_add_calibrationjob_akdakl_gate_origin/migration.sql`:

```sql
CREATE TYPE "AkdAklGateOrigin" AS ENUM ('AUTO_MISMATCH', 'MANUAL_ESCALATION');
ALTER TABLE "CalibrationJob" ADD COLUMN "akdAklGateOpenedBy" "AkdAklGateOrigin";
```

New nullable enum column + enum type. **No backfill script and none needed** — Postgres
fills existing rows with `NULL`, which is the correct value (a job that isn't currently
`PENDING_REVIEW` has no open gate, so no provenance). The 4 stale pilot jobs are `NOT_REQUIRED`
→ `NULL`, unaffected.

`akdAklGateOpenedBy` is set only while `akdAklApprovalStatus = PENDING_REVIEW` and cleared to
`NULL` whenever the gate leaves that state, for any reason.

### Files changed (Stage 3)

| File | Change |
|---|---|
| `packages/db/prisma/schema.prisma` | New `AkdAklGateOrigin` enum; `CalibrationJob.akdAklGateOpenedBy AkdAklGateOrigin?` |
| `packages/db/prisma/migrations/20260906145344_.../migration.sql` | Generated migration (above) |
| `apps/api/.../calibration-jobs.service.ts` | Set/read/clear provenance at the 3 gate write sites |
| `apps/api/.../calibration-jobs.service.test.ts` | 1 test renamed + provenance assertion, 2 new tests |

### Logic

| Write site | Behaviour |
|---|---|
| `escalateIdentity` (manual) | on `→ PENDING_REVIEW`, sets `akdAklGateOpenedBy = "MANUAL_ESCALATION"` |
| `decideIdentityCorrection` — `openAkdAklGate` branch | sets `akdAklGateOpenedBy = "AUTO_MISMATCH"` (after `AKD_AKL_GATE_STAMP_RESET`) |
| `decideIdentityCorrection` — `clearAkdAklGate` branch | now also requires `job.akdAklGateOpenedBy === "AUTO_MISMATCH"`; a `MANUAL_ESCALATION` gate is **not** auto-cleared. Clears provenance to `NULL` via the shared reset constant |
| `decideIdentity` (manager APPROVE/REJECT) | sets `akdAklGateOpenedBy = null` — explicit decision closes the gate, provenance must not carry into a later cycle |

`AKD_AKL_GATE_STAMP_RESET` gained `akdAklGateOpenedBy: null`, so both
decideIdentityCorrection branches clear it; the open branch then re-sets it to `AUTO_MISMATCH`.

`MANUAL_ESCALATION` gates now behave exactly as they did before Stage 2 — open until an
explicit `decideIdentity` APPROVE/REJECT.

### Test results — PASS

- `apps/api` typecheck (`tsc --noEmit`): **PASS**
- `calibration-jobs.service.test.ts` suite: **PASS — 87/87**
- New/updated Stage 3 tests (all ✓):
  - `approve unwinds an AUTO_MISMATCH PENDING_REVIEW gate to NOT_REQUIRED when a later correction resolves the mismatch` (renamed from Stage 2; now seeds `akdAklGateOpenedBy: "AUTO_MISMATCH"`, asserts it clears to `null`)
  - `does NOT unwind a MANUAL_ESCALATION PENDING_REVIEW gate even when a later correction resolves the text mismatch`
  - `clears akdAklGateOpenedBy when a manager explicitly decides a manually-escalated gate` (covers both APPROVE and REJECT)
  - `approve opens the gate from NOT_REQUIRED …` — now also asserts `akdAklGateOpenedBy === "AUTO_MISMATCH"`
- Full `apps/api` suite: see final run in the commit.

### Not done (out of scope)

- `akdAklGateOpenedBy` is not yet surfaced to the Portal / tech-pwa UI (no shared response
  schema or query type change). Follow-up if the distinction should be shown to reviewers.
