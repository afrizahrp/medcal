WORK ORDER EQUIPMENT — DOMAIN REFINEMENT + AUDIT + IMPLEMENTATION

IMPORTANT:
This supersedes the previous Delivery Note implementation-readiness assumption that the Delivery Note itself should be the first persistent link between WorkOrder and Equipment.

Do NOT implement Delivery Note yet.

We have identified a missing domain layer:

DeviceTypeEquipmentRequirement = DEFAULT/TEMPLATE equipment requirement
WorkOrderEquipment = ACTUAL equipment selected for a specific WorkOrder
EquipmentDeliveryNote = DOCUMENT generated from the WorkOrderEquipment selection

==================================================
§0 LOCKED BUSINESS DECISION
==================================================

For ON_SITE Work Orders (SPK), the equipment that technicians will bring must be determined during Work Order creation.

The existing DeviceTypeEquipmentRequirement data is the DEFAULT equipment requirement/template.

Example:

DeviceType:
Bed Side Monitor

Default requirements:

1. Thermohygrometer
2. Electrical Safety Analyzer
3. Vital Signs Simulator

When creating an ON_SITE WorkOrder, the system must automatically propose these requirements as the default equipment list.

The user/planner must then be able to:

- select the actual Equipment unit for each requirement
- replace an equipment unit
- remove an equipment requirement from the WO when operationally unnecessary
- add another required equipment when necessary
- review/reorder the selected equipment if the domain already supports ordering
- confirm the final equipment list

The final equipment selection belongs to the WorkOrder, NOT to the DeviceTypeEquipmentRequirement.

==================================================
§1 DOMAIN MODEL — IMPORTANT DISTINCTION
==================================================

DO NOT confuse these three concepts:

1. DeviceTypeEquipmentRequirement
   = "What equipment type is normally required to calibrate this DeviceType?"

2. WorkOrderEquipment
   = "Which actual Equipment units will be brought for THIS WorkOrder?"

3. EquipmentDeliveryNote / Delivery Note Item
   = "What equipment was documented on the Surat Jalan generated from THIS WorkOrder?"

The desired relationship is:

DeviceType
↓
DeviceTypeEquipmentRequirement
↓
DEFAULT equipment requirement
↓
WorkOrder creation
↓
WorkOrderEquipment
↓
EquipmentDeliveryNote
↓
EquipmentDeliveryNoteItem snapshot
↓
PDF Surat Jalan

DO NOT make EquipmentDeliveryNoteItem the primary domain relationship between WorkOrder and Equipment.

WorkOrder must know its selected equipment independently of whether a Delivery Note has been generated.

==================================================
§2 SCOPE OF THIS TASK
==================================================

Audit the existing codebase first.

Then design and implement ONLY the missing WorkOrder ↔ actual Equipment layer.

This task is NOT the Delivery Note implementation.

Do NOT implement:

- DLN numbering
- Delivery Note PDF
- Surat Jalan UI
- Delivery Note lifecycle
- new DocumentType for Delivery Note
- Delivery Note snapshot tables

Those belong to the subsequent Delivery Note phase.

==================================================
§3 AUDIT FIRST — DO NOT CODE IMMEDIATELY
==================================================

Audit:

A. WorkOrder schema and relations
B. WorkOrder creation flow
C. WorkOrder items / devices being calibrated
D. DeviceTypeEquipmentRequirement
E. Equipment master
F. EquipmentType
G. existing EquipmentCalibrationRecord / calibration validity
H. existing reference-equipment logic
I. existing API endpoints/services
J. existing WorkOrder UI
K. existing permissions/RBAC
L. existing ordering/sortOrder conventions
M. existing transaction patterns

Specifically determine:

1. Which DeviceTypes are available from the WorkOrder's calibration items?
2. How should their DeviceTypeEquipmentRequirement records be resolved?
3. Whether the same EquipmentType can appear from multiple DeviceTypes.
4. How actual Equipment is currently queried/selected.
5. Whether Equipment has an active/inactive state.
6. How EquipmentType ↔ Equipment is represented.
7. Whether an Equipment can be selected for multiple WorkOrders.
8. Whether there are existing constraints preventing duplicate equipment.
9. Whether WorkOrder creation is already transactional.
10. Where the best place is to generate the default equipment proposal.

DO NOT guess schema relationships.
Use the actual Prisma schema and existing services.

==================================================
§4 REQUIRED DOMAIN BEHAVIOR
==================================================

For ON_SITE only:

When creating a WorkOrder:

1. Determine all DeviceTypes represented by the WorkOrder's calibration items.
2. Resolve DeviceTypeEquipmentRequirement for those DeviceTypes.
3. Deduplicate identical EquipmentTypes if the same requirement occurs multiple times.
4. Generate a DEFAULT proposed equipment list.
5. The proposal must preserve DeviceTypeEquipmentRequirement.sortOrder.
6. The proposal must NOT select an arbitrary actual Equipment automatically unless the existing domain already has a deterministic safe rule.
7. User must select the actual Equipment unit.

Example:

Requirement:
Electrical Safety Analyzer

Available Equipment:
ESA-001
ESA-002
ESA-003

The system should allow the user to select one actual unit.

Do NOT silently choose ESA-001.

==================================================
§5 ACTUAL EQUIPMENT VALIDATION
==================================================

When assigning Equipment to WorkOrderEquipment:

Validate against the real Equipment master.

At minimum audit whether the system should enforce:

- Equipment exists
- Equipment is active/usable
- EquipmentType matches the required EquipmentType
- Equipment cannot be duplicated within the same WorkOrder
- Equipment belonging to another domain/customer is not accidentally selectable
- Equipment identity is stable and uses the actual Equipment ID

Do not invent additional business restrictions without evidence.

If a validation rule is uncertain, document it as an OPEN BUSINESS DECISION instead of silently implementing it.

==================================================
§6 ON_SITE VS IN_LAB
==================================================

ON_SITE / SPK:

- equipment selection is required
- default proposal comes from DeviceTypeEquipmentRequirement
- actual equipment is selected per WorkOrder
- WorkOrder must retain the selected equipment independently

SEND_TO_LAB / WOL:

- do NOT require WorkOrderEquipment
- do NOT generate a default equipment-to-bring list
- do NOT change existing WOL behavior

Do not alter ServiceMode semantics.

==================================================
§7 MANDATORY RULE
==================================================

The business requirement is:

An ON_SITE WorkOrder must have a confirmed equipment list before it becomes operational/final.

Do not blindly introduce a new WorkOrder status.

Instead:

Audit the existing WorkOrder lifecycle and identify the exact existing transition where this validation belongs.

If the current lifecycle has an appropriate transition, enforce the validation there.

If there is no appropriate transition, STOP and report the smallest required business/schema decision rather than inventing a new lifecycle.

==================================================
§8 ORDERING
==================================================

The existing Equipment Requirement ordering is authoritative for the DEFAULT proposal.

DeviceTypeEquipmentRequirement.sortOrder must be respected.

If multiple DeviceTypes contribute requirements:

- preserve each DeviceType's requirement order
- use a deterministic overall ordering
- do not invent alphabetical ordering unless the current system already uses it
- deduplicate the same EquipmentType deterministically

IMPORTANT:

Do not modify DeviceTypeEquipmentRequirement.sortOrder.

Do not modify EquipmentType ordering.

Do not modify DeviceCalibrationParameter ordering.

This task only consumes the existing requirement ordering.

==================================================
§9 WORKORDER EQUIPMENT ORDER
==================================================

Audit whether WorkOrderEquipment itself needs a sortOrder.

Recommendation to evaluate:

WorkOrderEquipment.sortOrder

because the selected equipment list will eventually be printed on the Surat Jalan.

If implemented:

- ordering belongs to WorkOrderEquipment
- it must NOT belong to Equipment
- default value follows DeviceTypeEquipmentRequirement ordering
- future user reorder must persist independently for that WorkOrder

However, do not implement drag-and-drop unless it is required by the current WorkOrder UX or clearly necessary for the domain.

For this phase, prioritize correct persistence and domain structure.

==================================================
§10 UI
==================================================

Audit the current WorkOrder creation UI.

For ON_SITE creation, the UI should eventually provide a clear section such as:

"Equipment yang akan dibawa"

with:

- default proposed equipment requirements
- actual Equipment selector
- equipment identity (name/type, brand/model, serial number where available)
- add/remove/replace capability
- validation state
- confirmation before WorkOrder becomes operational

Do not implement a completely new visual language.

Follow the existing portal UI patterns.

Do not change unrelated WorkOrder UI.

For WOL, this section must not appear.

==================================================
§11 API
==================================================

Design the smallest API changes required.

Prefer integrating equipment selection into the existing WorkOrder create/update flow if that is architecturally consistent.

Do not create unnecessary endpoints.

The API must never trust the client blindly.

Server-side validation must verify:

- WorkOrder is ON_SITE
- Equipment exists
- EquipmentType compatibility
- no duplicate equipment
- equipment belongs to the allowed master
- submitted WorkOrderEquipment set is valid

Use existing permission/RBAC patterns.

Do not modify RBAC semantics unless strictly required.

==================================================
§12 TRANSACTIONAL INTEGRITY
==================================================

WorkOrder creation and its initial WorkOrderEquipment selection should be atomic where appropriate.

Avoid this invalid state:

WorkOrder created successfully
but
WorkOrderEquipment partially created

Use the existing Prisma transaction pattern.

Do not introduce distributed transactions or unnecessary infrastructure.

==================================================
§13 FUTURE DELIVERY NOTE COMPATIBILITY
==================================================

The future Delivery Note implementation must be able to do:

WorkOrder
→ WorkOrderEquipment
→ EquipmentDeliveryNote
→ EquipmentDeliveryNoteItem snapshot

Therefore:

- WorkOrderEquipment must retain stable Equipment identity
- Delivery Note must later be able to snapshot equipment fields
- WorkOrderEquipment must remain available even if no Delivery Note exists
- do not duplicate the same relationship in multiple places

Do not implement the Delivery Note itself now.

==================================================
§14 DATABASE SAFETY
==================================================

Before changing Prisma:

- inspect existing schema
- identify exact relation names
- identify existing unique constraints
- identify existing indexes
- identify existing migration conventions

Prefer the smallest additive schema change.

Do NOT:

- rename unrelated models
- rename existing fields
- modify DeviceTypeEquipmentRequirement semantics
- modify Equipment master semantics
- modify WorkOrder numbering
- modify SPK/WOL numbering
- modify CalibrationParameter
- modify quotation/requisition logic
- modify Delivery Note yet

If a migration is required, make it additive and safe.

==================================================
§15 TESTS
==================================================

Add focused tests for the new domain behavior.

At minimum cover:

1. ON_SITE WorkOrder can have WorkOrderEquipment.
2. WOL does not require WorkOrderEquipment.
3. Default equipment proposal comes from DeviceTypeEquipmentRequirement.
4. Requirement sortOrder is preserved.
5. Actual Equipment must exist.
6. EquipmentType mismatch is rejected.
7. Duplicate Equipment within one WorkOrder is rejected.
8. Equipment selection persists.
9. WorkOrderEquipment survives independently of Delivery Note.
10. Existing WorkOrder behavior remains unchanged.
11. Multiple DeviceTypes produce deterministic deduplicated requirements.
12. Existing WorkOrder numbering remains unchanged.

Use the repository's existing test conventions.

IMPORTANT:
Do not require TEST_DATABASE_URL merely because tests exist if this is the local development environment and the repository's existing test setup has an explicit safe local-development mechanism.

Never point destructive tests at production.

==================================================
§16 IMPLEMENTATION BOUNDARY
==================================================

Allowed:

- Prisma schema changes required for WorkOrderEquipment
- migration
- shared schemas/types required by the feature
- WorkOrder API changes
- WorkOrder UI changes required for equipment selection
- focused tests
- helper functions directly supporting this feature

Forbidden:

- Delivery Note implementation
- DLN numbering
- Surat Jalan PDF
- PDF templates
- new Delivery Note tables
- Device Calibration Parameter changes
- Equipment Requirement ordering changes
- quotation changes
- requisition changes
- SPK/WOL numbering changes
- unrelated refactoring
- broad UI redesign

==================================================
§17 REQUIRED OUTPUT
==================================================

Before implementation, provide:

1. CURRENT DOMAIN AUDIT
2. EXACT GAP
3. PROPOSED DATA MODEL
4. WORKORDER CREATION FLOW
5. DEFAULT EQUIPMENT RESOLUTION ALGORITHM
6. VALIDATION RULES
7. API IMPACT
8. UI IMPACT
9. MIGRATION IMPACT
10. TEST PLAN
11. OPEN BUSINESS DECISIONS

Then implement only after the design is internally consistent.

After implementation provide:

- files changed
- schema/migration summary
- API summary
- UI summary
- tests run + results
- typecheck result
- build result
- explicit confirmation that Delivery Note was NOT implemented
- explicit confirmation that WOL behavior was not changed
- explicit confirmation that SPK/WOL numbering was not changed
- explicit confirmation that DeviceTypeEquipmentRequirement ordering was not changed

==================================================
FINAL ACCEPTANCE CRITERIA
==================================================

The implementation is accepted only if:

[ ] DeviceTypeEquipmentRequirement remains the default/template layer.
[ ] WorkOrderEquipment is the actual per-WO equipment layer.
[ ] ON_SITE gets a default proposed equipment list.
[ ] User selects actual Equipment units.
[ ] Selected equipment persists with WorkOrder.
[ ] WOL has no equipment-to-bring requirement.
[ ] Requirement sortOrder is preserved.
[ ] EquipmentType compatibility is server-validated.
[ ] Duplicate equipment is rejected.
[ ] WorkOrderEquipment does not depend on Delivery Note existence.
[ ] Future Delivery Note can consume WorkOrderEquipment cleanly.
[ ] No Delivery Note implementation is included in this task.
[ ] No unrelated business logic changes.
[ ] Existing SPK/WOL numbering remains unchanged.
[ ] Existing DeviceTypeEquipmentRequirement ordering remains unchanged.
[ ] Focused tests pass.
[ ] Typecheck passes.
[ ] Build passes.

DO NOT declare the task complete if only the UI is implemented.

The persistent WorkOrder ↔ Equipment relationship is the core requirement.
