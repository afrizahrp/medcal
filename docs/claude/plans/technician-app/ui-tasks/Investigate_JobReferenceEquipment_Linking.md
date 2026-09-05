# INVESTIGATE — JobReferenceEquipmentUsed: Schema, Validation, and Runtime Design

## Mode
READ-ONLY ANALYSIS ONLY. Do NOT edit, create, delete, or modify any file — with ONE exception:
you may write a single new report file at the path specified in "Output" below. Do NOT
implement anything. This task is diagnostic/design-proposal only. A separate staged
implementation task will follow.

## Background — why this task exists

The original full audit found `JobReferenceEquipmentUsed` as a table+relation only
("schema-only, zero runtime") — no service, no endpoint, no UI reads or writes it. Since then,
the reference-equipment MASTER DATA side has matured considerably and independently:

- `EquipmentType` + per-`DeviceType` **Requirements** (Portal:
  `management/reference-equipment/requirements`) define which reference-equipment types are
  needed to calibrate each DeviceType (e.g. Bed Side Monitor requires Vital Signs Simulator +
  Electrical Safety Analyzer + Thermohygrometer).
- `EquipmentUnit` (Portal: `management/reference-equipment/units`) is the physical-unit master
  (code, brand, model, serial, status Aktif/Nonaktif).
- Each `EquipmentUnit` has its own **Calibration Records** (date, valid-from/to, certificate
  number, provider, result, "accepted for use" acknowledgement) — i.e. the reference equipment
  itself gets calibrated periodically, and that history is already tracked.

**What's still missing** (per the original audit, to be re-verified live in this task): linking
a SPECIFIC `EquipmentUnit` to a SPECIFIC `CalibrationJob` — i.e. recording "this job used
reference equipment EQU-000003, whose calibration certificate was valid at the time of use."
This is the traceability the original audit flagged as needed at the `CalibrationJob` level
(not `WorkOrder` level, since — per the confirmed fan-out design — different jobs within one
WorkOrder may use different reference equipment or be executed at different times).

## Step 1 — Re-read the live schema and current master-data runtime

1. Read `JobReferenceEquipmentUsed`, `EquipmentUnit`, `EquipmentCalibrationRecord` (or
   equivalent model name — confirm exact name), and their relations to `CalibrationJob` and
   `EquipmentType`/`DeviceType` directly from `schema.prisma`. Quote the live shape — don't
   rely on the original audit's description, which predates months of schema changes.
2. Confirm what "valid calibration certificate" means in stored data terms: is there a
   `validFrom`/`validTo` (or `validUntil`) pair on the calibration record that can be checked
   against a job's execution date? Confirm the exact field names and types.
3. Confirm whether `EquipmentUnit.status` (Aktif/Nonaktif) and calibration-record validity are
   independent checks (a unit could be Aktif but have an expired certificate, or vice versa) —
   state both conditions explicitly, since a valid linking design needs to check both.
4. Re-read `apps/api/src/modules/` for any existing service touching `equipment-units` or
   `equipment-calibration-records` (the Portal screens shown to the user this session prove a
   runtime exists for the master-data side) — confirm the exact service/module name and its
   current capabilities (CRUD only, or does it expose anything queryable like "give me units
   of type X with a currently-valid certificate," which the new linking feature could reuse
   rather than reimplement).

## Step 2 — Determine where in the job lifecycle this recording happens

1. Confirm: does the Requirements master data (Step 1's first bullet) mean a `CalibrationJob`
   can derive "which EquipmentType(s) are required" from its resolved `DeviceType`? Trace this
   path live (mirroring how `resolveJobDeviceTypeId` already resolves DeviceType for a job) and
   confirm whether an equivalent `resolveRequiredEquipmentTypesForJob` is derivable, or whether
   this already exists somewhere (the original full audit mentioned
   `resolveRequiredEquipmentTypes` in the context of `WorkOrder.equipmentConfirmedAt` — check if
   that's reusable at the per-job level or is WorkOrder-scoped only and why).
2. Propose (as a question to resolve, not decide unilaterally) whether recording which
   reference equipment was used belongs:
   (a) as part of the same on-site flow where a technician records identity
   (fits alongside Identity Correction / device assignment conceptually — "what I used" is
   adjacent to "what I calibrated"), or
   (b) as a separate, later step closer to when actual measurements are recorded (which doesn't
   exist yet — `MeasurementResult` is still an untyped blob with no runtime), or
   (c) something that could be recorded at multiple points (e.g. proposed at WorkOrder
   equipment-confirmation time already, and this task's job-level linking is just formalizing
   an assignment that's already effectively locked in by then).
   Investigate whether `WorkOrderEquipment` (confirmed implemented, "reference equipment
   carried to site") already effectively answers "which units are available for this WO's
   jobs" — if so, per-job linking might be as simple as "pick from what's already on
   `WorkOrderEquipment` for this WO," not a fresh device-candidates-style search. Determine
   which is actually true from the code.

## Step 3 — Design options (grounded, do not implement)

1. Propose the endpoint/data shape for recording which `EquipmentUnit`(s) were used on a
   `CalibrationJob` — likely a many-to-many (a job may use several reference equipment units:
   per the Requirements example, one Bed Side Monitor job could use 3 different reference
   units). Propose whether this is a single "set the list" endpoint (replace) or an
   add/remove pattern, grounded in how similar patterns already work elsewhere in this
   codebase (e.g. `WorkOrderEquipment`'s propose/replace/reorder pattern, if relevant).
2. Propose the validation: at the moment of recording, check the unit's status is Aktif AND its
   most recent (or a specifically dated) calibration record's valid-from/to window covers "now"
   (or the job's actual execution date, if that's more correct — state which and why). Propose
   the exact error condition/message for an expired-certificate unit.
3. Propose whether this belongs in `apps/portal`, `apps/tech-pwa`, or both — given the pattern
   established by Identity Correction (technician-facing action = tech-pwa; TECHNICIAN_MANAGER
   oversight = Portal), determine which role actually selects reference equipment in practice
   (a technician on-site knows which physical unit they grabbed) and propose accordingly.
4. Propose RBAC: new action(s) on an existing resource (`calibrationJob`, since this is
   job-scoped) vs. a new resource — state your reasoning.

## Output

Write a single report to:
`D:\medcal\docs\claude\plans\Calibration-management\investigation-job-reference-equipment-linking.md`

Structure:

```markdown
# Investigation: JobReferenceEquipmentUsed — Schema, Validation, Runtime Design

## Summary
[Current state in one paragraph: what's already solid (master data), what's missing (the
link + validation), and the single most important open question]

## Step 1 — Live Schema & Master-Data Runtime
[Findings with citations]

## Step 2 — Where This Fits in the Job Lifecycle
[Findings on WorkOrderEquipment overlap, resolveRequiredEquipmentTypes reusability, and your
read on options (a)/(b)/(c)]

## Step 3 — Design Options
[Endpoint shape, validation logic, Portal vs tech-pwa placement, RBAC — with trade-offs]

## Open Questions for User Confirmation
[Anything genuinely requiring a business decision before implementation]
```

Do not modify any file. Confirm in your final chat message that no code changes were made —
this was analysis only.
