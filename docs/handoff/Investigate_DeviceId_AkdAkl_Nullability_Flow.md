# INVESTIGATE — DeviceId & AKD/AKL/NIE Nullability Flow: Excel Import → WorkOrder IN_PROGRESS → (Future) CalibrationJob

## Mode
READ-ONLY ANALYSIS ONLY. Do NOT edit, create, delete, or modify any file (schema, code,
migration, documentation) — with ONE exception: you may write a single new report file at the
path specified in "Output" below. Do NOT run migrations. Do NOT implement any fix or schema
change, even if the gap seems obvious or small — this task is diagnostic/advisory only.

## Background — why this task exists

A prior read-only audit (`CalibrationJob + Portal Management + Identity Correction — Read-Only
Audit Report`, 2026-09-02, branch main @ 7847e74) established the following confirmed facts —
treat these as given, do not re-verify them, but you may cite them:

- `CalibrationJob.deviceId` is `String` (REQUIRED / non-null) — schema.prisma:1740.
- No runtime creates `CalibrationJob` rows today (`work-orders.service.ts` explicitly does
  NOT create jobs; confirmed by negative test assertions at
  `work-orders.service.test.ts:552` and `:726`).
- `CalibrationRequestItem.deviceId` and `.akdAkl` are both nullable, free-text-adjacent fields
  captured at intake (schema.prisma:1341-1365).
- There is no snapshot of customer-declared identity anywhere downstream of
  `CalibrationRequestItem` — not on `WorkOrderItem`, not on `PurchaseOrderItem`, not anywhere.
- `CalibrationRequestItem` is populated in part via Excel import (per user's direct knowledge
  of the requisition intake flow) — and it is known that `deviceId` and `akdAkl` can arrive
  NULL from that import.

**The open question this task must answer:** given that `deviceId`/`akdAkl` can be NULL as
early as requisition intake, and given that `CalibrationJob.deviceId` is required and
(per the prior audit) is expected to be populated at the point WorkOrder transitions to
IN_PROGRESS — what ACTUALLY happens, or would happen, to that null data at each step of the
pipeline between intake and that transition? This task is about mapping the current
(pre-CalibrationJob-runtime) handling of these two fields end-to-end, not about designing the
fix.

## Step 1 — Trace the Excel import path

1. Locate the requisition/CalibrationRequestItem Excel import code (service, controller, or
   script — search for import, upload, bulk-create, or similar in the calibration-requests
   module and any import/parsing utilities).
2. For `deviceId` and `akdAkl` (and `akdAklDeclaration` if relevant) specifically: does the
   import code validate, reject, warn, or silently accept NULL/empty values for these two
   columns? Quote the actual validation logic (Zod schema, manual checks, or absence thereof).
3. Is there any downstream flag, status, or marker set on a `CalibrationRequestItem` row when
   these fields arrive NULL (e.g. "incomplete", "needs review")? Or does it proceed identically
   to a fully-populated row?

## Step 2 — Trace CalibrationRequestItem → PurchaseOrderItem → WorkOrderItem

1. Read the actual current Prisma model definitions for `CalibrationRequestItem`,
   `PurchaseOrderItem`, and `WorkOrderItem` directly from `schema.prisma` (don't rely on the
   prior audit's field lists from memory — re-read live).
2. For each step in the chain (CalibrationRequestItem → Quotation/PO line → WorkOrderItem),
   determine: is `deviceId` or `akdAkl` copied/snapshotted forward at all? The prior audit
   states WorkOrderItem is "description + qty only, no device identity" — verify this directly
   against the live schema and confirm or correct it.
3. If neither field is carried forward anywhere in this chain, state that explicitly as a
   finding (not an assumption) — this determines whether the null-handling problem is "solved"
   simply by the data not flowing downstream at all yet.

## Step 3 — Trace the WorkOrder → IN_PROGRESS transition path

1. Read `work-orders.service.ts` in full (or the relevant transition-handling section) and
   identify exactly what code runs when a WorkOrder's status changes to `IN_PROGRESS`.
2. Confirm directly (don't just cite the prior audit) whether any code at this transition
   reads, validates, or references `deviceId`/`akdAkl` from any upstream source
   (`CalibrationRequestItem`, `Device`, or elsewhere).
3. Confirm directly whether any code at this transition attempts to create `CalibrationJob`
   rows, even partially, experimentally, or behind a flag. If genuinely none exists (as the
   prior audit found), state that as confirmed-still-true, with the current line reference.
4. If `CalibrationJob` creation is genuinely absent at this transition point today, then the
   "what happens to null deviceId/akdAkl at WorkOrder IN_PROGRESS" question is currently
   hypothetical/architectural rather than an active bug — state this distinction clearly in
   the verdict. Do not conflate "this will be a problem when job creation is built" with
   "this is failing today."

## Step 4 — Map every current touchpoint where a NULL deviceId/akdAkl could surface as a problem today, independent of CalibrationJob

Even though CalibrationJob creation doesn't run yet, `deviceId`/`akdAkl` being NULL may already
cause friction elsewhere in the currently-implemented parts of the system (requisition→
quotation→PO→WorkOrder flow, which per the prior audit IS implemented and in production use).
Check:

1. Does the Portal UI (calibration-requests, quotations, purchase-orders, work-orders screens)
   display, warn about, or block on a NULL device identity anywhere in this chain today?
2. Does any existing validation (Zod schemas in `packages/shared/src/schemas/index.ts`, or
   service-level checks) reject a NULL `deviceId`/`akdAkl` at any existing transition
   (e.g. CalibrationRequest submission, Quotation creation, PO creation, WorkOrder creation)?
3. Is there any existing reporting, filtering, or list view that would let an ADMIN/SUPERVISOR
   currently see "which requisition items have missing device identity"? If not, state that
   as a gap explicitly (distinct from the CalibrationJob-specific gaps already logged in the
   prior audit).

## Step 5 — Cross-check against prior audit's P0 decision #1 and #2

The prior audit's Section 10 lists as un-made decisions:
- Decision #1: `CalibrationJob.deviceId` nullability + pending-identity model
- Decision #2: which upstream entity CalibrationJobs derive from + link back to
  `CalibrationRequestItem`

State explicitly whether your findings in Steps 1-4 add new information relevant to either
decision (e.g. "X% of a sample/recent import batch had NULL deviceId, suggesting the
pending-identity state is not an edge case but a common path" — only state this if you can
actually observe or reasonably infer it from the code/data; do not fabricate statistics you
cannot support). If you have read access to the actual `pkmdb` database (local Postgres) and
can safely run a read-only query, you may query `CalibrationRequestItem` to count/report actual
NULL rates for `deviceId`/`akdAkl` — but only SELECT queries, no writes, and note explicitly if
you did or did not do this.

## Output

Write a single report to:
`D:\medcal\docs\claude\plans\Calibration-management\investigation-deviceid-akdakl-nullability-flow.md`

Structure:

```markdown
# Investigation: DeviceId/AKD-AKL Nullability — Excel Import to WorkOrder IN_PROGRESS

## Summary Verdict
[One paragraph: is this an active bug today, a latent/architectural gap, or both? State plainly.]

## Step 1 — Excel Import Handling
[Findings, with file/line citations]

## Step 2 — Field Propagation Through the Commercial Chain
[Findings: does deviceId/akdAkl survive CalibrationRequestItem → PO → WorkOrderItem, yes/no, cite schema]

## Step 3 — WorkOrder IN_PROGRESS Transition
[Findings: confirmed current behavior, with line references]

## Step 4 — Existing Touchpoints Where NULL Could Surface Today
[UI, validation, reporting — what exists, what doesn't]

## Step 5 — Relevance to Prior Audit's P0 Decisions #1 and #2
[Direct answer, grounded in what was found — no speculation beyond evidence]

## Open Questions for Design Discussion (not implemented)
[Anything genuinely ambiguous that needs a human/product decision before Decision #1/#2 can be finalized]
```

Do not modify any other file. Confirm in your final chat message that no schema/code changes
were made — this was analysis only.
