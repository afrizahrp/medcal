MEDCAL — Equipment Type & Device Type Equipment Requirement
============================================================

The Equipment Architecture Audit has been completed.

Reference:
docs/claude/plans/device-management/equipment/implementation_report_equipment_audit.md

The audit was READ-ONLY and no schema/API/UI/data changes were made.

We have now approved the recommendation:

OPTION B — PHASED IMPLEMENTATION

For this task, implement PHASE 1 ONLY.

==================================================
BUSINESS OBJECTIVE
==================================================

MEDCAL needs to define which calibration equipment/tools are normally required
for each Device Type.

Example:

Bed Side Monitor
├── Vital Signs Simulator
├── Electrical Safety Analyzer
└── Thermohygrometer

The purpose is to allow an admin/user to configure this relationship once.

When a calibration job for a Device Type is later created, MEDCAL will be able
to derive the equipment normally required for that job.

This is a MASTER-DATA requirement.

It is NOT yet an equipment assignment, inventory, scheduling, or physical
equipment tracking system.

==================================================
IMPORTANT ARCHITECTURAL DISTINCTION
==================================================

There are three different concepts:

1. REQUIRED
   "What type of equipment is normally required for this Device Type?"

2. ASSIGNED
   "Which physical equipment unit will be brought to this Work Order?"

3. ACTUALLY USED
   "Which physical equipment was actually used for this CalibrationJob?"

They MUST NOT be collapsed into one concept.

Phase 1 implements ONLY:

DeviceType
↓
Required Equipment Type

Phase 2 will later introduce physical Equipment instances and assignment.

==================================================
APPROVED PHASE 1 MODEL
==================================================

Implement:

1. EquipmentType
2. DeviceTypeEquipmentRequirement

Conceptually:

EquipmentType
-------------

id
code
name
description?
category?
isActive
createdAt
updatedAt

DeviceTypeEquipmentRequirement
------------------------------

id
deviceTypeId
equipmentTypeId
notes?
createdAt
updatedAt

Relationships:

DeviceType
└── DeviceTypeEquipmentRequirement[]
└── EquipmentType

EquipmentType
└── DeviceTypeEquipmentRequirement[]

Constraint:

@@unique([deviceTypeId, equipmentTypeId])

Indexes should follow the architecture audit recommendation and existing
MEDCAL conventions.

==================================================
EQUIPMENT TYPE IS NOT PHYSICAL EQUIPMENT
==================================================

This distinction is critical.

Example:

EquipmentType:
Electrical Safety Analyzer

This does NOT represent:

    Electrical Safety Analyzer #01
    Serial: ESA-12345

It represents the CATEGORY/TYPE of calibration equipment required.

Do NOT add physical-instance fields such as:

- serialNumber
- assetTag
- calibrationDueDate
- status of a physical instrument
- location
- ownership of a physical unit

to EquipmentType.

Those belong to the future Equipment INSTANCE layer.

==================================================
FUTURE AUDIT / KAN TRACEABILITY
==================================================

Although physical Equipment is NOT implemented in this task, the architecture
must not prevent future traceability.

The future model is expected to evolve approximately as:

DeviceType
↓
Required EquipmentType
↓
Physical Equipment instance
↓
Equipment calibration / validity
↓
WorkOrder assignment
↓
CalibrationJob
↓
Actually Used Equipment
↓
LK / Certificate

The existing schema already contains:

JobReferenceEquipmentUsed

at CalibrationJob level.

It currently stores:

- equipmentName
- brand
- model
- serialNumber

as free-text and is schema-only.

DO NOT modify JobReferenceEquipmentUsed in this task.

DO NOT add equipmentId yet.

DO NOT implement equipment calibration records yet.

However, do not design EquipmentType in a way that prevents this future
relationship.

==================================================
EQUIPMENT CALIBRATION / KAN REQUIREMENT
==================================================

Future physical reference equipment may need its own calibration validity
tracking.

For example:

Physical Equipment
Fluke 5522A
Serial: XXXXX

    Calibration validity:
    Valid until: 2027-03-01

Eventually MEDCAL may need to answer an audit question such as:

"What reference equipment was used for this CalibrationJob, and was that
equipment's calibration still valid on the date of the job?"

This is a FUTURE requirement.

Do NOT implement it now.

Do NOT add `calibrationDueDate` to EquipmentType.

Do NOT build a calibration-management subsystem for reference equipment.

Just preserve a clean architecture for this future capability.

==================================================
NO INVENTORY
==================================================

Do NOT implement:

- stock
- quantity
- warehouse
- stock movement
- issue/return
- procurement
- valuation
- depreciation
- inventory ledger
- maintenance management

EquipmentType is a master/catalog concept, not inventory.

================================================== 2. EQUIPMENT TYPE MASTER
==================================================

Follow the existing MEDCAL master-data convention.

The audit specifically identified Uom / DeviceCapability / DeviceType as the
appropriate precedent.

Before implementing, inspect the existing CRUD implementation pattern for
similar global masters.

Reuse existing:

- API conventions
- validation
- authorization
- table patterns
- form patterns
- active/inactive behavior
- pagination
- search
- toast/error handling
- confirmation dialogs
- audit fields

Do not invent a new CRUD architecture.

================================================== 3. DEVICE TYPE → REQUIRED EQUIPMENT UI
==================================================

Create an admin UI for configuring required equipment per Device Type.

Reuse the same visual and interaction pattern that was just implemented for:

Device Calibration Parameters

Specifically the:

"Expandable / Collapsible Table Grouped by Device Type"

pattern.

Do NOT use a card-style accordion.

The page should conceptually look like:

Equipment Requirements

[ 🔍 Search device type or equipment... ]

DEVICE TYPE REQUIRED EQUIPMENT JUMLAH
──────────────────────────────────────────────────────────────────
▾ Bed Side Monitor 3
Equipment Type
Vital Signs Simulator
Electrical Safety Analyzer
Thermohygrometer

▸ Dental Unit 4

▸ Tensimeter 2

Only Device Type is expandable.

Do NOT create nested:

Device Type
→ Capability
→ Equipment
→ ...

There should be only one expandable level.

================================================== 4. DEVICE TYPE PARENT ROW
==================================================

Parent row:

Device Type
Required Equipment Count

Example:

▾ Bed Side Monitor 3 equipment

If the existing UI convention makes the count label different, follow the
existing MEDCAL pattern.

The parent row represents the Device Type.

================================================== 5. CHILD ROW
==================================================

Expanded child rows should show:

Equipment Type
Notes
Action

Example:

Equipment Type Notes Action
───────────────────────────────────────────────────────────────
Vital Signs Simulator Required for vital sign
Electrical Safety Analyzer Electrical safety tests
Thermohygrometer Environment measurement

Keep it compact.

Do not add physical equipment information because physical Equipment does not
exist in Phase 1.

================================================== 6. SEARCH
==================================================

Provide search for:

- Device Type
- Equipment Type

If the search matches an Equipment Type requirement belonging to a Device Type:

- automatically expand the relevant Device Type
- show the matching child row

Example:

Search:
"Thermohygrometer"

Result:

▾ Bed Side Monitor
Thermohygrometer
...

Follow the existing MEDCAL search/query conventions.

================================================== 7. PAGINATION
==================================================

Reuse the existing MEDCAL pagination pattern.

Do NOT invent a new pagination system.

Reuse:

- existing PaginationBar
- existing page/pageSize URL conventions
- existing page-size selector
- existing previous/next controls
- existing total count display
- existing API pagination response convention

Pagination should occur at the Device Type parent level.

A Device Type and all of its required-equipment child rows must stay together
on the same page.

Do NOT split one Device Type's children across multiple pages.

================================================== 8. CREATE / REMOVE REQUIREMENT
==================================================

The admin should be able to:

- create EquipmentType
- edit EquipmentType
- activate/deactivate EquipmentType according to existing master-data patterns
- add an EquipmentType as a requirement for a DeviceType
- remove an EquipmentType requirement from a DeviceType

Do not allow duplicate requirements.

The database unique constraint must enforce:

(deviceTypeId, equipmentTypeId)

================================================== 9. EQUIPMENT TYPE MASTER UI
==================================================

EquipmentType should have its own master-data management UI following existing
MEDCAL patterns.

At minimum:

- Code
- Name
- Description
- Category (only if justified by existing architecture/audit)
- Active/Inactive

Do not over-design Category.

If the audit's open question about controlled EquipmentType categories remains
unresolved, prefer a simple nullable string rather than inventing an enum or
taxonomy.

================================================== 10. REQUIRED VS OPTIONAL
==================================================

The audit identified "mandatory vs optional" as an open business question.

Do NOT invent complex requirement states.

Unless existing MEDCAL requirements clearly demand it, do not add:

- mandatory/optional enum
- priority
- quantity
- lifecycle

A simple requirement relationship is sufficient for Phase 1.

If you believe one of these fields is genuinely necessary for implementation,
STOP and report the reason before adding it.

================================================== 11. DATA SEEDING
==================================================

Do NOT fabricate operational EquipmentType data.

Do not create arbitrary equipment records such as:

Fluke 5522A
Thermohygrometer XYZ
etc.

unless those values already exist in an approved source/data fixture.

The admin should be able to create the master data.

================================================== 12. EXISTING DATA SAFETY
==================================================

This is a new domain concept.

Do not alter existing:

- DeviceType
- Device
- DeviceCalibrationParameter
- CalibrationJob
- JobReferenceEquipmentUsed
- WorkOrder
- WorkOrderAssignment

except for adding the necessary relation fields required by the new models.

No destructive migration.

================================================== 13. API / SERVICE
==================================================

Implement API/service/repository layers following existing MEDCAL patterns.

The API should support at minimum:

EquipmentType:

- list
- search
- get
- create
- update
- activate/deactivate if consistent with existing master conventions

DeviceTypeEquipmentRequirement:

- list/group by DeviceType
- add requirement
- remove requirement

The grouped endpoint should provide enough information for the expandable table
without requiring N+1 requests from the frontend.

Follow existing response conventions.

================================================== 14. DERIVING REQUIRED EQUIPMENT
==================================================

The requirement is conceptually derived from:

CalibrationJob.device.deviceTypeId
↓
DeviceTypeEquipmentRequirement
↓
EquipmentType

Do not create a copied list on CalibrationJob or WorkOrder yet.

Do not add a WorkOrderEquipment table yet.

Do not snapshot requirements yet.

The requirement is master configuration.

================================================== 15. DO NOT IMPLEMENT PHASE 2
==================================================

Explicitly DO NOT create:

Equipment
WorkOrderEquipment
EquipmentAssignment
EquipmentCalibrationRecord
EquipmentCalibrationStatus
equipmentId on JobReferenceEquipmentUsed
equipmentTypeId on JobReferenceEquipmentUsed
conflict detection
scheduling
availability
resource allocation
Surat Jalan
inventory
asset management

These belong to the future phase.

================================================== 16. TESTING
==================================================

After implementation:

- run Prisma migration against the confirmed LOCAL development DB
- regenerate Prisma Client
- run relevant module tests
- run typecheck
- run build
- test EquipmentType CRUD
- test requirement add/remove
- test duplicate prevention
- test DeviceType grouping
- test pagination
- test search
- test automatic parent expansion on child search
- verify no unrelated existing tests/regressions are introduced

Production migration is NOT part of this task.

Production will later use:

prisma migrate deploy

through the existing production Docker Compose deployment process.

================================================== 17. IMPLEMENTATION REPORT
==================================================

Update/create:

docs/claude/plans/device-management/equipment/implementation_report_equipment.md

Document:

1. Final schema
2. Migration
3. API
4. UI
5. Pagination
6. Search
7. CRUD
8. Tests
9. Build/typecheck
10. Files changed
11. Any assumptions
12. Any deferred Phase 2 items

Use the terminology:

"Equipment Type"
"Required Equipment"
"Physical Equipment"
"Actually Used Equipment"

Do not use these terms interchangeably.

==================================================
FINAL GUARDRAIL
==================================================

This task should remain SMALL.

The desired result is:

EquipmentType
↓
DeviceTypeEquipmentRequirement
↓
Admin UI

Nothing more.

The architecture should be ready for future:

Equipment instance
↓
Calibration validity
↓
WorkOrder assignment
↓
CalibrationJob actual usage
↓
LK / Certificate traceability

but those future layers must NOT be implemented now.

If implementation appears to require any Phase-2 model or behavior,
STOP and explain the dependency before expanding the scope.
