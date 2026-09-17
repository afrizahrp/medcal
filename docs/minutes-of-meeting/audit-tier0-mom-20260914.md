# AUDIT — Tier 0 Items from MoM (Demo) 14/09/2026

## For Cursor: mode & model

- Run this in **Agent** mode (not Ask/Chat-only) so you can actually read the repo files
  needed for the audit — but treat it as read-only per the rule below, not as permission
  to use Agent's write/edit capability.
- **Model: Auto.**
- Paste this whole file as your first message in a fresh Agent session/thread (new
  session, so no unrelated prior context leaks in).

## Mode

READ-ONLY AUDIT ONLY. Do NOT edit, create, delete, or modify any file (code, schema,
config, UI, migration) in this workspace — with ONE exception: you may write a single new
report file at the path specified in "Output" below. Do NOT accept/apply any inline edit
suggestions, do NOT run codegen, do NOT use any edit/apply tool on existing files. Do NOT
implement any of the proposed changes, even if they look trivial. This is a Stage 1
diagnostic/planning task — a separate task will handle implementation later, in a separate
session, and only after human approval of the plan you produce here.

## Background

On 2026-09-14 a demo/meeting was held with the PKM customer. Several small UI/behavior
requests came out of it (see `docs/minutes-of-meeting/mom-20260914.xlsx`, sheet
`Part-1`, source items #2, #3, #4, #5, #7). These were triaged and grouped as "Tier 0":
low-risk, independent of each other, and believed NOT to touch the actively-in-progress
`CalibrationJob`/`MeasurementResult`/`DeviceCalibrationParameter` schema work (Stage B).
That belief has NOT yet been verified against the actual codebase — this task's job is
to verify it, and to produce a concrete implementation plan for each item so it can be
approved and executed as a single "polish" batch.

One additional MoM item (a proposed link between WorkOrder and LK/MeasurementResult) is
explicitly OUT OF SCOPE for this task — it has been parked separately and must not be
investigated, referenced as a dependency, or touched here.

## The 5 Tier 0 items to audit

For EACH item below: locate the actual current implementation (UI component, backend
route/service, and Prisma schema field where relevant), state what exists today, and
identify exactly what would need to change to satisfy the request.

1. **[MoM #2] Tax amount visibility on quotation** — Quotation totals shown to the
   customer already include tax amount. When the user selects "include" (tax-inclusive
   pricing), the tax amount line itself should NOT be displayed, only the final total.
   Find the quotation UI/template and pricing computation logic. Confirm: is this
   currently a display-only change, or does "include" mode not exist as a toggle at all
   yet (i.e. is there a missing data model/state, not just a missing UI conditional)?

2. **[MoM #3] Device name shown on quotation/PO/WorkOrder** — Currently shows the
   customer-given alias name. Requirement: keep the alias name, but also show the
   master/canonical device name directly underneath it. Find where device name is
   rendered on these three document types, confirm whether the master name field is
   already available on the data being passed to each template/component, or would need
   to be added to the query/DTO.

3. **[MoM #4] AKD/AKL fields — hide and make non-mandatory** — Requirement: AKD/AKL
   should not need to be filled in at all, with no validation notification of any kind,
   on both Portal and tech-pwa. Find every place AKD/AKL appears: form fields, validation
   rules (frontend and backend), and the underlying Prisma field(s). Confirm whether the
   backend column is already nullable/optional, or whether a required-field constraint
   exists that would also need to change. Distinguish this clearly from the separate,
   already-locked "AKD/AKL escalation stickiness" rule (once a human manually flags an
   AKD/AKL escalation, it cannot be auto-cleared) — that rule is NOT in scope and must
   not be affected.

4. **[MoM #5] Who can input device model/brand/serial number** — Requirement: this
   input (recorded when a job is ON_SITE or IN_LAB) should be editable by both admin and
   technician roles. Find the current role/permission check on this input path (both API
   authorization and any UI role-gating) and state exactly which role(s) currently have
   access and which are currently blocked.

5. **[MoM #7] "Device ID" field label vs underlying key** — Requirement: technicians
   only know "serial number", not "device ID". The UI label should read "Serial No"
   instead of "Device ID", but must continue writing to the existing `device_id` column,
   which remains the sole mandatory key. The separate `serial_no` column may stay empty.
   Find every UI location where this field's label currently reads "Device ID" (Portal
   and tech-pwa), and confirm there is no logic anywhere that treats `serial_no` (rather
   than `device_id`) as mandatory or as a lookup key — flag it if there is, since that
   would make this a bigger change than a label swap.

## Step 1 — Cross-check the "independent of MeasurementResult" assumption

For each of the 5 items, explicitly confirm or refute: does touching this item require
changing any file also touched by the active MeasurementResult/CalibrationTestPoint work
(schema migrations, `packages/db` Prisma models for `CalibrationJob`/`MeasurementResult`/
`DeviceCalibrationParameter`, or the tech-pwa measurement-entry routes/components)? If any
item turns out NOT to be independent, say so clearly and explain the overlap — do not
silently keep it in Tier 0.

## Step 2 — Produce a plan per item (propose only)

For each item, once the current implementation is understood, propose:
- The specific file(s) that would need to change
- Whether it's UI-only, UI+API, or UI+API+schema
- A rough relative size (trivial / small / medium) and why
- Any risk, edge case, or ambiguity worth flagging before implementation (e.g. existing
  data that would be affected, other places the same pattern is reused, etc.)

Do not write any code. Do not propose a full diff. A clear description of the change and
its location is sufficient for human review.

## Output

Write a single report to:
`D:\medcal\docs\claude\plans\Calibration-management\audit-tier0-mom-20260914.md`

Structure:

```markdown
# Audit: Tier 0 Items (MoM 2026-09-14)

## Summary
[One paragraph: are all 5 items confirmed independent/low-risk as assumed? Any surprises?]

## Item-by-Item Audit
[One subsection per item (#2, #3, #4, #5, #7), each with: current implementation found
(exact files/fields), gap vs requirement, and the proposed plan per Step 2]

## Independence Check (Step 1)
[Explicit confirm/refute per item, with reasoning]

## Recommended Execution Order
[If all confirmed independent: suggested order within the batch, with reasoning
(e.g. simplest/lowest-risk first). If any are NOT independent, call that out here
prominently rather than including it in a "safe batch" recommendation.]
```

Do not modify any other file. Confirm in your final chat message that no code/schema
changes were made — this was audit and planning only.
