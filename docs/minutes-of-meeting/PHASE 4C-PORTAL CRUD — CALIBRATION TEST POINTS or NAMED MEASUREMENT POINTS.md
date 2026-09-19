PORTAL CRUD — CALIBRATION TEST POINTS / NAMED MEASUREMENT POINTS

STATUS:
Phase 4A and Phase 4B are already implemented and accepted.
Do not reopen or redesign them.

This task is ONLY to add Portal CRUD/configuration for the existing
CalibrationTestPoint / Named Measurement Point architecture.

SOURCE OF TRUTH:
- Existing Medcal Prisma schema and implementation
- Existing CalibrationTestPoint + JobCalibrationTestPoint architecture
- Phase 4A implementation report
- Existing Portal Device Calibration Parameter management UI

The existing architecture must remain unchanged.

==================================================
1. SCOPE
==================================================

Allow authorized Portal users to configure named measurement points
for a Device Calibration Parameter.

Examples of valid named points include:

- Awal
- Akhir
- L-N
- L-G
- N-G
- Posisi A / B / C
- Titik Ukur 1 / 2 / 3 / 4 / M
- T1 / T2 / T3 / T4 / T5
- Kanan / Kiri when represented as a test point
- other named measurement points defined by the catalog

This must be a GENERIC mechanism.

DO NOT hardcode BSM-specific labels.

DO NOT create device-specific UI.

DO NOT create special cases for particular device types.

==================================================
2. EXISTING DOMAIN MODEL
==================================================

Inspect the existing implementation BEFORE editing.

Use the existing:

- CalibrationTestPoint
- JobCalibrationTestPoint
- DeviceCalibrationParameter
- MeasurementResult

architecture.

CalibrationTestPoint is the MASTER/catalog definition.

JobCalibrationTestPoint is the JOB-LEVEL SNAPSHOT created when a
CalibrationJob starts.

MeasurementResult continues to reference the MASTER
CalibrationTestPoint.id as already implemented.

DO NOT change this architecture.

DO NOT introduce another snapshot model.

DO NOT create a second named-point entity.

==================================================
3. PORTAL LOCATION
==================================================

The configuration belongs to:

Portal
→ Management
→ Device Calibration Parameters
→ Parameter Detail/Edit

Add a section for:

"Titik Ukur"

The section should allow the user to manage the named points belonging
to the selected DeviceCalibrationParameter.

The existing Device Calibration Parameter form must remain intact.

Do not redesign the entire page.

==================================================
4. CRUD OPERATIONS
==================================================

Implement:

- Create named measurement point
- Edit named measurement point
- Reorder named measurement points
- Activate / deactivate named measurement point

The minimum editable fields are:

- settingLabel
- settingValue
- sequence
- tolerance override, using the EXISTING tolerance fields/semantics
- isActive

Use the exact existing schema field names and tolerance conventions.

Do not create a second tolerance mechanism.

==================================================
5. DELETE POLICY
==================================================

DO NOT implement physical DELETE initially.

Historical jobs may already reference master CalibrationTestPoint rows,
and started jobs use JobCalibrationTestPoint snapshots.

Therefore the Portal must use:

Activate / Deactivate

instead of destructive deletion.

If the existing backend already has delete functionality, inspect it
and do not expose destructive deletion in this Portal UI unless it is
already explicitly required by the existing architecture.

Do not modify historical references.

==================================================
6. BACKEND API
==================================================

Inspect existing CalibrationTestPoint-related backend code first.

If no CRUD API currently exists, add the minimum REST/API operations
required by the Portal.

Follow existing Medcal service/controller/DTO/validation conventions.

Required capabilities:

1. List test points for a DeviceCalibrationParameter
2. Create test point
3. Update test point
4. Reorder test points
5. Activate/deactivate test point

Enforce the appropriate ownership relationship:

CalibrationTestPoint
→ DeviceCalibrationParameter

Do not allow a test point to be assigned to an unrelated parameter.

Use existing authorization/permission patterns.

Do not invent a new permission system.

==================================================
7. VALIDATION
==================================================

Use existing project conventions.

Minimum validation:

- settingLabel required
- sequence must be a valid positive integer
- settingValue remains nullable if the existing model allows it
- tolerance override follows existing nullable semantics
- isActive is boolean
- test point must belong to the selected DeviceCalibrationParameter

Sequence must be deterministic.

If the existing schema/API already has uniqueness constraints or ordering
rules, reuse them.

Do not invent additional business constraints without necessity.

==================================================
8. REORDERING
==================================================

Provide a simple Portal mechanism for changing sequence/order.

Use the existing sequence field.

Do not introduce drag-and-drop unless the existing Portal architecture
already uses it naturally.

A simple reorder control is sufficient.

After reorder, the displayed order must match the persisted sequence.

Do not modify job snapshots when master test points are reordered.

Existing started jobs remain based on their JobCalibrationTestPoint snapshot.

==================================================
9. ACTIVE / INACTIVE SEMANTICS
==================================================

Follow existing CalibrationTestPoint behavior.

For the MASTER catalog:

- active points are available for future jobs;
- inactive points are not offered as active configuration for future use;
- historical JobCalibrationTestPoint snapshots are NOT modified.

Do not retroactively alter started jobs.

Do not recreate job snapshots.

Do not modify MeasurementResult records.

==================================================
10. TOLERANCE
==================================================

Reuse the existing CalibrationTestPoint tolerance fields and the existing
measurement tolerance resolution architecture.

Do not create:

- another tolerance source
- another tolerance model
- another override hierarchy

If the existing CalibrationTestPoint model already contains:

- toleranceMin
- toleranceMax
- toleranceNote

(or equivalent fields), expose those existing fields only.

Preserve existing inheritance semantics.

==================================================
11. TECH-PWA
==================================================

Do not redesign Tech-PWA.

The Tech-PWA already consumes named points through the existing
measurement parameter API / job snapshot architecture.

Only make Tech-PWA changes if a concrete API contract/type change from
this CRUD implementation requires it.

If no change is required, leave Tech-PWA source untouched.

==================================================
12. PDF / LK
==================================================

Do not redesign PDF/LK.

Named point rendering was already implemented in Phase 3.

This task only manages the MASTER catalog configuration.

Started jobs continue using JobCalibrationTestPoint snapshots.

Do not modify historical PDF behavior.

==================================================
13. HISTORICAL DATA
==================================================

NON-NEGOTIABLE:

Do not backfill existing CalibrationTestPoint rows.

Do not modify existing JobCalibrationTestPoint rows.

Do not modify existing MeasurementResult rows.

Do not retroactively convert Pattern A jobs into Pattern B.

Do not seed named points as part of this task.

The Portal CRUD mechanism is sufficient.

Actual catalog data can be configured later through the Portal.

==================================================
14. DATABASE / MIGRATION
==================================================

Inspect the existing Prisma schema before deciding whether a migration
is necessary.

If CalibrationTestPoint already contains all required fields:

DO NOT create a migration.

Only create a migration if an actual missing field/constraint is required
for the defined CRUD scope.

Never modify previous migrations.

==================================================
15. UI / UX
==================================================

Keep the UI consistent with the existing Portal.

Recommended structure:

Titik Ukur
------------------------------------------------
[ + Tambah Titik Ukur ]

No. | Nama Titik | Setting | Toleransi | Status | Actions
------------------------------------------------
1   | Awal       | ...     | ...       | Aktif  | Edit / Nonaktifkan
2   | Akhir      | ...     | ...       | Aktif  | Edit / Nonaktifkan

Requirements:

- clear section heading
- clear empty state
- obvious "Tambah Titik Ukur"
- edit action
- activate/deactivate action
- sequence/order visible
- no destructive delete button
- existing Portal visual language/components should be reused

Do not redesign unrelated Device Calibration Parameter UI.

==================================================
16. PERMISSIONS
==================================================

Use the existing Device Calibration Parameter management permission/
authorization mechanism.

Do not introduce a new permission type unless the existing authorization
architecture genuinely requires one.

A user who can manage the calibration parameter catalog should be able
to manage its named measurement points according to the existing
authorization model.

==================================================
17. TESTING
==================================================

Follow:

.claude/rules/testing.md

Use Vitest.

Do NOT use:

grep
sort
awk
head
tail

to filter Vitest output.

Run:

1. focused backend tests
2. focused Portal tests
3. full relevant package suites
4. typecheck
5. build where relevant

At minimum test:

- list points
- create point
- update point
- reorder point
- activate/deactivate
- validation failures
- ownership validation
- authorization
- existing tolerance fields preserved
- inactive point behavior
- historical JobCalibrationTestPoint is not modified
- existing Phase 4A logicalTestKey/logicalTestSequence behavior remains intact
- existing Phase 4B DERIVED behavior remains intact

Do not delete, weaken, skip, or rewrite tests merely to make them pass.

==================================================
18. ARCHITECTURAL INVARIANTS
==================================================

DO NOT CHANGE:

- MeasurementResult natural key
- MeasurementResult.calibrationTestPointId relationship
- CalibrationTestPoint concept
- JobCalibrationTestPoint concept
- job snapshot creation timing
- replicateIndex
- direction
- referenceValue
- tolerance architecture
- Phase 4A logicalTestKey/logicalTestSequence
- Phase 4B DERIVED architecture
- measurement completeness architecture
- historical data

DO NOT introduce:

- JobApplicableParameter
- parameter snapshot
- MeasurementQuantity
- formula engine
- derived calculation engine
- another named-point model

==================================================
19. IMPLEMENTATION DISCIPLINE
==================================================

REFINEMENT — PORTAL CRUD CALIBRATION TEST POINTS
UI MUST BE INLINE / EMBEDDED

This is a refinement of the previously defined
"PORTAL CRUD — CALIBRATION TEST POINTS / NAMED MEASUREMENT POINTS" task.

ALL existing scope, architectural invariants, and `.claude/rules/*`
remain applicable.

DO NOT AUDIT AGAIN.
DO NOT REDESIGN.
DO NOT ADD FEATURES.
IMPLEMENT ONLY THE DEFINED SCOPE.

==================================================
1. MANDATORY UI REQUIREMENT
==================================================

This task is NOT complete if only the backend/API/DTO is implemented.

The Portal must have a COMPLETE, USABLE, INLINE/EMBEDDED UI for
managing CalibrationTestPoint directly inside the existing
Device Calibration Parameter detail/edit page.

The named measurement point management must be visible as a dedicated
section within the parameter page itself.

DO NOT implement the primary CRUD workflow as a separate standalone page.

DO NOT make the user navigate to another management screen to manage
test points.

DO NOT rely on a generic modal-only CRUD workflow.

A modal/dialog MAY be used for a small create/edit form if that matches
existing Portal conventions, but the TEST POINT MANAGEMENT UI itself
must remain embedded in the parameter page.

==================================================
2. REQUIRED PAGE STRUCTURE
==================================================

Existing page:

Management
→ Device Calibration Parameters
→ Parameter Detail / Edit

Add a dedicated section:

----------------------------------------
Titik Ukur
Named Measurement Points
----------------------------------------

[ + Tambah Titik Ukur ]

Then display the current points directly on the page.

Example:

┌─────┬────────────┬─────────┬────────────┬────────┬──────────────┐
│ No. │ Nama Titik │ Setting │ Toleransi  │ Status │ Aksi         │
├─────┼────────────┼─────────┼────────────┼────────┼──────────────┤
│  1  │ Awal       │   —     │    —       │ Aktif  │ Edit · ...   │
│  2  │ Akhir      │   —     │    —       │ Aktif  │ Edit · ...   │
└─────┴────────────┴─────────┴────────────┴────────┴──────────────┘

The exact visual implementation must follow existing Medcal Portal
components and design language.

Do not copy this ASCII layout literally.

==================================================
3. INLINE MANAGEMENT EXPERIENCE
==================================================

The user must be able to understand and manage the complete list of
named points without leaving the Device Calibration Parameter page.

Required interactions:

- View all points
- Add point
- Edit point
- Reorder point
- Activate point
- Deactivate point

The section must have a clear empty state when no named points exist.

Example conceptual empty state:

"Tidak ada titik ukur"
"Parameter ini belum memiliki titik ukur bernama."

[ + Tambah Titik Ukur ]

Use existing Portal empty-state patterns if available.

==================================================
4. CREATE / EDIT UX
==================================================

Prefer an inline row editor if it fits the existing component architecture.

If an inline row editor would conflict with existing Portal patterns,
a compact dialog/drawer may be used for the actual form.

However:

The list and management controls MUST remain embedded on the
Device Calibration Parameter page.

The user must never be redirected to a separate CRUD page.

Required fields:

- Nama Titik
- Setting
- Toleransi Minimum
- Toleransi Maksimum
- Catatan Toleransi
- Status

Use the existing underlying field names and tolerance semantics.

Do not create another tolerance architecture.

==================================================
5. REORDER UX
==================================================

Reordering must be directly understandable from the embedded list.

Use a simple mechanism consistent with the existing Portal UI.

Acceptable approaches:

- move up / move down controls
- sequence input
- existing lightweight reorder component

DO NOT introduce drag-and-drop solely for this feature if the project
does not already use that pattern.

After saving/reordering:

- sequence must persist;
- displayed order must match persisted sequence;
- no page-wide navigation should be required.

==================================================
6. ACTIVE / INACTIVE UX
==================================================

Show status clearly in the embedded list.

Use existing Badge/Switch/Action patterns.

The user should be able to:

Aktif → Nonaktif
Nonaktif → Aktif

Do not provide a destructive "Delete" action.

Use activation/deactivation as the lifecycle mechanism.

Historical job snapshots must remain untouched.

==================================================
7. ADD POINT UX
==================================================

The "+ Tambah Titik Ukur" action must be clearly visible inside the
"Titik Ukur" section.

When clicked:

- open the minimum required input experience;
- default sequence should follow the existing ordering convention;
- allow the user to enter the required fields;
- validate before submit;
- show API validation errors in the UI;
- after success, immediately update the embedded list.

Do not require a full page refresh if the existing Portal data-fetching
architecture supports mutation invalidation/refetch.

Reuse existing query/mutation patterns.

==================================================
8. EDIT UX
==================================================

Edit must preserve the user's context on the same parameter page.

After successful edit:

- update/refetch the embedded list;
- preserve the current parameter page;
- show the updated values immediately.

Do not redirect to another management page.

==================================================
9. LOADING / ERROR / EMPTY STATES
==================================================

The embedded section must explicitly handle:

- loading
- empty
- populated
- mutation pending
- mutation success
- mutation error

Follow existing Portal conventions.

Do not leave the section visually blank while loading.

Do not expose raw API errors when an existing error-mapping pattern is
available.

==================================================
10. RESPONSIVE UI
==================================================

The embedded section must remain usable at the existing Portal
responsive breakpoints.

Do not create a table that becomes unusably wide on smaller screens.

If the existing project uses responsive cards/stacked rows for narrow
layouts, follow that existing pattern.

Do not redesign the entire page for responsiveness.

==================================================
11. EXISTING PARAMETER FORM
==================================================

Do NOT replace or redesign the existing Device Calibration Parameter
form.

The new "Titik Ukur" section is an additional management section.

The existing Phase 4A fields:

- logicalTestKey
- logicalTestSequence

must continue to work exactly as before.

The existing Phase 4B fields:

- entryStyle
- derivation

must continue to work exactly as before.

==================================================
12. DOMAIN RULE — PATTERN A / PATTERN B
==================================================

The UI is configuring the MASTER named points.

Do not add a "Pattern A / Pattern B" toggle.

Pattern behavior is derived from whether active/in-scope
CalibrationTestPoint rows exist for the parameter.

Do not duplicate this logic in Portal.

The Portal simply manages the named-point catalog.

==================================================
13. NO DEVICE-SPECIFIC LOGIC
==================================================

The UI must be generic.

Do NOT create:

if deviceType === "BSM"
if parameterCode === "BSM_ROOM_TEMP"
if label === "Awal"
if label === "Akhir"

or equivalent hardcoded business rules.

The same UI must support:

Awal / Akhir
L-N / L-G / N-G
Posisi A / B / C
T1–T5
Titik Ukur 1–4/M
and future named points.

==================================================
14. ACCEPTANCE CRITERIA — UI
==================================================

This task is NOT complete unless all of the following are true:

[ ] User can open a Device Calibration Parameter in Portal.

[ ] A visible "Titik Ukur" section exists on that same page.

[ ] Existing named points are displayed directly in the section.

[ ] Empty state exists.

[ ] "+ Tambah Titik Ukur" is available in the section.

[ ] User can create a named point.

[ ] User can edit a named point.

[ ] User can reorder named points.

[ ] User can activate/deactivate a named point.

[ ] No destructive delete is exposed.

[ ] Validation errors are visible and understandable.

[ ] Loading state exists.

[ ] Mutation pending state exists.

[ ] Mutation errors are handled.

[ ] Successful mutations update the embedded list.

[ ] User remains on the same Device Calibration Parameter page.

[ ] Existing Device Calibration Parameter UI remains intact.

[ ] Phase 4A behavior remains intact.

[ ] Phase 4B behavior remains intact.

[ ] No device-specific hardcoding exists.

==================================================
15. TESTING — UI
==================================================

Add/update Portal Vitest tests following:

.claude/rules/testing.md

At minimum cover:

- renders empty state
- renders existing points
- create point
- edit point
- reorder point
- activate/deactivate
- validation error
- mutation error
- successful mutation refresh/update
- existing parameter form remains functional

Use existing Portal testing patterns and utilities.

Do not introduce a new testing framework.

Do not filter Vitest output with grep/sort/awk/head/tail.

==================================================
16. COMPLETION GATE
==================================================

Do NOT report this task as complete merely because:

- API endpoints exist;
- Prisma compiles;
- typecheck passes;
- backend tests pass.

The Portal UI must actually implement the embedded management workflow
described above.

In the final report explicitly state:

"Embedded Portal UI implemented: YES/NO"

and list:

- the page/component where the section was added;
- create UX;
- edit UX;
- reorder UX;
- activate/deactivate UX;
- empty/loading/error states;
- Portal test results.

If the UI cannot be implemented within the existing architecture,
STOP and report the concrete blocker.

Do not replace the required embedded UI with an API-only implementation
or a standalone CRUD page.




Read and apply ALL applicable `.claude/rules/*` before implementation.

In particular:

- architecture.md
- implementation-scope.md
- testing.md

Read the existing CalibrationTestPoint implementation BEFORE editing.

DO NOT AUDIT AGAIN.
DO NOT REDESIGN.
DO NOT ADD FEATURES.
IMPLEMENT ONLY THE DEFINED SCOPE.

Do not refactor unrelated code.

Do not improve unrelated UI.

Do not add speculative functionality.

If an actual blocker is found, STOP and report the exact blocker
instead of inventing a new architecture.

==================================================
20. COMPLETION REPORT
==================================================

Report:

1. Files changed
2. Whether a migration was required
3. Backend API changes
4. DTO/validation changes
5. Portal UI changes
6. Permission/authorization handling
7. Tech-PWA changes, or explicitly state none
8. PDF/LK changes, or explicitly state none
9. Tests:
   - test files
   - passed/failed/skipped
   - full relevant suite result
10. Typecheck
11. Build
12. Any remaining limitations

Explicitly confirm:

- No historical data modified
- No JobCalibrationTestPoint modified
- No MeasurementResult modified
- No destructive delete introduced
- No new named-point model introduced
- No Phase 4A redesign
- No Phase 4B redesign
- No scope expansion