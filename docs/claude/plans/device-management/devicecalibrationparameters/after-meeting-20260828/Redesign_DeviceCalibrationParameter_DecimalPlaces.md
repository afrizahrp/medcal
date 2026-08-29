MEDCAL — Redesign Device Calibration Parameter & Decimal Precision

Context:
After the recent business discovery meeting, we identified an important MEDCAL business rule:

Every Device Type has calibration parameters, and EACH calibration parameter has a rigid decimal precision requirement for its calibration values/results.

Examples:
- Bed Side Monitor → parameters may require 5 digits after decimal
- Tensimeter → parameters may require 1 digit after decimal

Important:
The decimal precision belongs to DeviceCalibrationParameter, NOT DeviceType.

This is a core calibration business rule, not merely a UI formatting preference.

==================================================
OBJECTIVE
==================================================

Redesign the existing Device Calibration Parameter structure and UI/UX so that:

1. Each DeviceCalibrationParameter has its own decimalPlaces rule.
2. Existing DeviceCalibrationParameter data remains intact.
3. The UI is simpler and more natural for users managing many parameters — this is a UI/UX
   simplification only. The underlying DATA MODEL and its relationships (DeviceType →
   DeviceCapability → DeviceCapabilityItem → DeviceCalibrationParameter) are NOT being
   simplified, flattened, or removed. See the "UI/UX REDESIGN" section below for the precise
   boundary between what changes (navigation/browsing) and what must not change (the create/
   edit data relationships).
4. The design supports future enforcement of decimal precision during measurement/calibration.
5. Do NOT implement Technician App, Equipment, Inventory, Tariff, Price List, Quotation, Invoice, or other unrelated features.

==================================================
PHASE 1 — AUDIT FIRST
==================================================

Before changing anything, inspect the existing codebase and identify:

- DeviceType model/schema
- DeviceCalibrationParameter model/schema (including its existing `valueType` enum —
  `NUMBER`/`RATIO`/`TEXT`/`BOOLEAN` — and `toleranceMin`/`toleranceMax`/`toleranceNote` fields)
- CalibrationParameter model/schema, if separate
- Existing relationships (specifically confirm: DeviceCalibrationParameter →
  DeviceCapabilityItem → DeviceCapability, and → DeviceType, → Uom)
- Existing migrations
- Existing API/service/repository logic
- Existing Device Calibration Parameter page
- Existing filters/search
- Existing create/edit forms
- Existing validation
- Any existing numeric precision/formatting logic
- Any existing measurement/result logic that already consumes DeviceCalibrationParameter

Do NOT modify code during the audit phase.

First report your findings and proposed minimal changes.

Pay particular attention to whether decimal precision already exists somewhere under another name. Do not create duplicate fields if an equivalent field already exists.

**Additional audit checks required — report on each explicitly:**

A. **`valueType` interaction.** `DeviceCalibrationParameter.valueType` can be `NUMBER`,
   `RATIO`, `TEXT`, or `BOOLEAN`. `decimalPlaces` only has meaning for `NUMBER`-type rows.
   Confirm how many current rows are each `valueType` (expect the vast majority `NUMBER`, one
   known `RATIO` row — `VENT_IE_RATIO`). Report your proposed handling for non-`NUMBER` rows
   (e.g. `decimalPlaces` stays `NULL`/not applicable for `RATIO`/`TEXT`/`BOOLEAN` — do not
   force a numeric default onto them).

B. **Column precision conflict check.** `toleranceMin`/`toleranceMax` are currently
   `@db.Decimal(18, 4)` — 4 digits after the decimal point. The business rule states some
   parameters need up to 5 digits (or more). Check: does `decimalPlaces` need to describe
   precision for the MEASURED RESULT only (a future field, not yet built), or does it also
   imply the existing `toleranceMin`/`toleranceMax` columns need more decimal capacity to
   avoid silent truncation? If any existing `toleranceMin`/`toleranceMax` value's needed
   precision could exceed 4 decimal places for a parameter that turns out to need 5,
   explicitly flag this as a conflict requiring a decision — do NOT silently widen or leave
   the tolerance columns as-is without reporting the discrepancy.

==================================================
PHASE 2 — DATA MODEL
==================================================

After the audit, implement the minimal schema change required.

Expected conceptual model:

DeviceType
    |
    +---- DeviceCalibrationParameter
              |
              +---- decimalPlaces

Example:

Bed Side Monitor
  ├── Mean       → decimalPlaces = 5
  ├── Diastole   → decimalPlaces = 5
  ├── Systole    → decimalPlaces = 5
  └── SpO2       → decimalPlaces = 5

Tensimeter
  ├── Systolic   → decimalPlaces = 1
  ├── Diastolic  → decimalPlaces = 1
  └── Pulse      → decimalPlaces = 1

Do NOT put decimalPlaces on DeviceType.

Migration requirements:
- Preserve all existing records.
- **Default value strategy — read carefully, this is a deliberate scope boundary:** for this
  task, apply ONE SAFE UNIFORM DEFAULT (e.g. `decimalPlaces = 2`) to all existing rows during
  migration. Do NOT attempt to determine the "真" accurate per-parameter decimal count (e.g.
  looking up that Bed Side Monitor really needs 5, Tensimeter really needs 1) by re-verifying
  against the 50 LK source documents — that is a separate, much larger follow-up task
  (comparable in scope to the earlier tolerance-backfill effort), out of scope here. This
  task's job is to build the STRUCTURE (the field, the migration, the UI to view/edit it) —
  populating it with business-verified real values per parameter is explicitly deferred.
  State this clearly in your final report so it isn't mistaken for "done."
- Do not silently destroy or alter existing calibration parameter definitions.
- Update Prisma/schema/types/etc. consistently according to the existing project architecture.
- Follow the project's existing migration conventions (check target database is the local
  native dev DB before running any migration, same as every prior migration in this project —
  stop and ask if unsure).

==================================================
PHASE 3 — UI/UX REDESIGN
==================================================

The current page exposes too many filters such as:

- Device Type
- Capability
- Item
- UOM
- etc.

This creates unnecessary cognitive load.

There are currently approximately 35–50 legally/officially supported Device Types for PKM.

Use Device Type as the primary grouping/context.

**CRITICAL BOUNDARY — simplify the UI, NOT the data:** The Device Type → Capability →
Capability Item hierarchy is a real structural relationship in the data model (a
DeviceCalibrationParameter is always linked to exactly one DeviceCapabilityItem, which belongs
to exactly one DeviceCapability). This redesign changes how that structure is BROWSED and
PRESENTED — it does NOT remove, flatten, or bypass the relationship itself. Specifically:

- **List/browse view**: simplified as described below (grouped by Device Type, expandable,
  search) — Capability/Capability Item do NOT need to be separate top-level filters here, since
  Device Type is now the primary navigation axis. This part matches the original request as-is.
- **Create form**: MUST still let the user establish which DeviceCapabilityItem (and by
  extension, DeviceCapability) a new parameter belongs to — this is a required foreign key,
  not optional metadata. You may simplify HOW this is presented (e.g. auto-scope the
  Capability/Item pickers to the Device Type already chosen from context, rather than 3
  independent top-level dropdowns as today), but the underlying selection must still happen.
  Do not design a create flow that makes it impossible to set `capabilityItemId`.
- **Edit form**: Capability/Capability Item are typically not something a user changes after
  a parameter is created (they define what the parameter fundamentally measures) — it's
  reasonable for the edit form to show them as read-only context (e.g. a breadcrumb like
  "Bed Side Monitor › Vital Signs Monitoring › Heart Rate") rather than editable dropdowns,
  but confirm this against how the existing edit form currently behaves before assuming —
  don't remove editability if it's currently relied upon for a real correction workflow.

Preferred UX concept:

Calibration Parameters

[ Search device or parameter... ]

▾ Bed Side Monitor                     4 parameters
    Mean
    Diastole
    Systole
    SpO2

▸ Dental Unit                          8 parameters

▸ Tensimeter                           6 parameters

The important principle is:

SIMPLIFY THE NAVIGATION, NOT THE DATA.

Do not remove any existing calibration parameter records or information.

The user should be able to:
- Search by Device Type or parameter
- Expand a Device Type
- See all parameters belonging to that Device Type
- Open/edit an individual parameter
- Clearly see and edit decimalPlaces

For example, parameter editing should expose something conceptually like:

Parameter:      Mean
Code:           ...
Capability:     Vital Signs Monitoring › Heart Rate   (read-only context, see boundary above — confirm against current form behavior)
UOM:            mmHg
Tolerance:      ...
Decimal Places: [ 5 ]

Use the project's existing UI component patterns and design system.

Do not introduce a completely new visual language.

**Search requirement:** the parameter/device names in this system were recently aligned to
match the real Indonesian terminology used in the company's actual calibration worksheets (LK)
— e.g. "Heart Rate" stays as-is because that's what the source document says, but many others
are now in Indonesian (e.g. "Resistansi Pembumian Protektif," "Keselamatan Listrik"). Confirm
the search implementation works against the CURRENT `name` field values in the live database
(read them fresh, don't assume from an older report or from memory) — search must work
correctly for both Indonesian and the intentionally-kept-English terms.

==================================================
IMPORTANT UX PRINCIPLE
==================================================

The user thinks:

"I want to manage calibration parameters for a Bed Side Monitor."

The user should NOT have to think:

"I need to filter Device Type, Capability, Item, UOM, etc."

Device Type should be the primary context.

Search is useful.
Multiple cascading filters are not necessary unless the existing data volume proves otherwise.

==================================================
DECIMAL PRECISION BEHAVIOR
==================================================

For this task, establish the data model and master-data configuration.

Do NOT redesign or implement the complete Measurement Entry / Technician App workflow yet.

However, inspect the existing measurement/result code and ensure the new decimalPlaces property can be consumed later without architectural conflict.

Do not use hard-coded rules such as:

if deviceType == "Tensimeter" => 1
if deviceType == "Bed Side Monitor" => 5

The rule must come from DeviceCalibrationParameter.decimalPlaces.

==================================================
GUARDRAILS
==================================================

Do NOT:
- redesign unrelated modules
- change quotation logic
- change tariff/price list
- create Equipment/Inventory modules
- modify Technician App
- implement scheduling
- modify Invoice
- introduce unnecessary abstractions
- replace existing architecture merely for stylistic reasons
- remove existing fields or data because they are not shown in the new UI
- remove or bypass the DeviceType → Capability → CapabilityItem → Parameter relationship from
  the create/edit data flow (see Phase 3 boundary above) — only the browsing/list UI is being
  simplified
- attempt to backfill "真" accurate per-parameter decimalPlaces values from the LK source
  documents in this task (see Phase 2 default-value strategy) — a uniform safe default is
  sufficient here, accurate values are separate future work

Prefer the smallest clean change that fits the existing architecture.

==================================================
DELIVERABLE
==================================================

After implementation, report:

1. What you found during the audit, including the two additional audit checks (A: valueType
   interaction, B: column precision conflict check)
2. Data model changes
3. Migration performed, including confirmation of which database it targeted and the default
   value applied to existing rows
4. API/service changes
5. UI/UX changes — explicitly confirm the create-form's DeviceCapabilityItem linkage was
   preserved (not simplified away), and describe the final shape of the edit form's Capability
   context (editable vs. read-only, and why)
6. Validation changes
7. Files changed
8. Tests/checks executed
9. Any assumptions made
10. Any remaining concern that should be addressed before moving to Tariff/Equipment, and
    explicitly: confirmation that accurate per-parameter decimalPlaces values (beyond the
    uniform default) remain a follow-up task, not done here

Before touching unrelated modules, stop and explain if you discover a dependency that genuinely requires a broader change.
