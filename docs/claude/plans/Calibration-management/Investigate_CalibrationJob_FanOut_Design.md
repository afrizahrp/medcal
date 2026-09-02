# INVESTIGATE — CalibrationJob Fan-Out: Source Entity & Cardinality

## Mode
READ-ONLY ANALYSIS ONLY. Do NOT edit, create, delete, or modify any file (schema, code,
migration, documentation) — with ONE exception: you may write a single new report file at the
path specified in "Output" below. Do NOT run migrations. Do NOT implement any fan-out logic,
even if it seems small/obvious — this task is diagnostic/advisory only. A separate staged
implementation task will follow, informed by your findings here.

## Background — why this task exists

Prior work (schema migration `20260902050955_add_calibrationjob_identity_fields`, applied)
made `CalibrationJob.deviceId` nullable and added `calibrationRequestItemId` as a back-link to
the customer's original requisition line. That work did NOT determine the fan-out logic itself
— i.e., when a WorkOrder transitions to IN_PROGRESS (or at whatever point job creation should
actually run), exactly how many `CalibrationJob` rows get created, and from which upstream
entity's quantity/count.

The prior full audit stated the intended shape as "1 WO → N jobs, 1 job = 1 physical device"
but did not verify this against the live quantity-bearing fields. Since `deviceId` is now
nullable, jobs must be creatable *before* physical devices are matched — so cardinality cannot
come from counting devices (there may be zero known devices at creation time). It must come
from a QUANTITY field on some upstream entity. This task determines which one, precisely.

## Step 1 — Read the live quantity-bearing chain

Read directly from `schema.prisma` (do not rely on memory of prior audits) the full field list
of:
- `CalibrationRequestItem`
- `QuotationItem`
- `PurchaseOrderItem`
- `WorkOrderItem`
- `WorkOrderEquipment`

For each, report: does it carry a quantity field (e.g. `qty`, `quantity`)? Does it carry a
`deviceTypeId` or device-identity-adjacent field? Does it have a 1:1 or 1:N relationship to the
entity above it in the chain (the prior audit claimed `WorkOrderItem` is "1:1 snapshot of
PurchaseOrderItem" — verify this claim directly against the live schema, don't assume it's
still accurate).

## Step 2 — Determine where "N" should come from

1. State explicitly which entity's quantity field is the correct source of truth for "how many
   CalibrationJob rows should exist for this WorkOrder." Justify with the actual relationships
   found in Step 1 — don't assume `WorkOrderItem.qty` is it just because it seems obvious;
   trace whether that quantity is itself derived from `PurchaseOrderItem` which is derived from
   `QuotationItem` which is derived from `CalibrationRequestItem`, and confirm the number is
   consistent all the way up the chain (or report if it can diverge, e.g. via manual PO edits,
   and if so, which one should win).
2. Check whether `WorkOrderEquipment` (already implemented, per the prior full audit —
   "propose/replace/reorder" pattern) has any bearing on this count. The prior audit describes
   it as "reference equipment carried to site... not the customer device... no relation to
   CalibrationJob." Confirm this is still accurate and confirm explicitly that
   `WorkOrderEquipment` should NOT be the fan-out source (or explain if it should).
3. Report whether a single `WorkOrderItem` can represent MULTIPLE distinct device types or
   only one (i.e., does `qty: 3` on one `WorkOrderItem` mean "3 units of the same DeviceType"
   or could it ambiguously mean something else)? This determines whether fan-out is a simple
   "create N jobs per WorkOrderItem" loop or needs to also branch per DeviceType.

## Step 3 — Determine the correct trigger point

1. The working assumption (from prior discussion, not yet verified against code) is that job
   creation happens when WorkOrder transitions to `IN_PROGRESS`. Re-read the transition code in
   `work-orders.service.ts` (the `start()` method and any state-machine/transition-guard code
   around it) and confirm: is `IN_PROGRESS` genuinely the only/correct trigger point, or does
   the code reveal a more natural earlier point (e.g. WorkOrder creation, or an
   assignment/scheduling step) that would make more sense? Report what you find; state your
   recommendation with reasoning, but flag it as a recommendation, not a final decision.
2. Check for idempotency risk: if job creation is triggered inside a transition handler, is
   there any existing guard pattern in this codebase (search for similar "create rows on
   transition, but only once" logic elsewhere, e.g. around WorkOrder document numbering or
   other state transitions) that should be reused, to avoid double-creating jobs if the
   transition handler is ever called twice for the same WorkOrder?

## Step 4 — CalibrationRequestItem linkage at creation time

Confirm exactly what data is available to populate the new
`CalibrationJob.calibrationRequestItemId` and `customerDeclaredDeviceName` fields at the
moment fan-out would run. Specifically: from a given `WorkOrderItem`, is there an actual,
reliable, already-existing path back to the originating `CalibrationRequestItem` row (via
`PurchaseOrderItem` → `QuotationItem` → `CalibrationRequestItem`, or however the real chain
works per Step 1)? If that path is ambiguous, broken, or requires an assumption, state that
explicitly — this is exactly the kind of gap the fields were added to close, so if it turns out
NOT closeable with current data, that's an important finding, not a footnote.

## Output

Write a single report to:
`D:\medcal\docs\claude\plans\Calibration-management\investigation-calibrationjob-fanout-design.md`

Structure:

```markdown
# Investigation: CalibrationJob Fan-Out — Source Entity, Cardinality, Trigger Point

## Summary Recommendation
[One paragraph: which entity's quantity is N, what triggers creation, can calibrationRequestItemId
be reliably populated — state plainly, flag anything uncertain]

## Step 1 — Quantity-Bearing Chain (live schema)
[Field-by-field findings, cite schema.prisma line numbers]

## Step 2 — Cardinality Source
[Findings + recommendation with reasoning]

## Step 3 — Trigger Point
[Findings + recommendation, idempotency guard pattern found or not]

## Step 4 — CalibrationRequestItem Linkage Feasibility
[Can the chain actually be walked today? Any breaks/ambiguity?]

## Open Questions for User Confirmation Before Implementation
[Anything that is a genuine business/product decision, not inferable from code]
```

Do not modify any other file. Confirm in your final chat message that no schema/code changes
were made — this was analysis only.
