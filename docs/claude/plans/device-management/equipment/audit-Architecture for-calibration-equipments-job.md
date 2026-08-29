MEDCAL — Equipment Architecture Audit
======================================

We are about to design the Equipment / Calibration Tools concept for MEDCAL.

DO NOT implement anything yet.

This task is AUDIT / ARCHITECTURE DISCOVERY ONLY.

Do not:

- create or modify Prisma models
- create migrations
- modify database
- modify API
- modify UI
- create Equipment module
- refactor existing code

First understand the existing architecture and report findings + recommendations.

==================================================
BUSINESS CONTEXT
==================================================

From the recent business discovery meeting:

PKM technicians perform calibration jobs.

For a calibration job, especially On Site Work Orders, technicians must bring
the reference/calibration equipment/tools required to perform the job.

Example:

Device Type:
Bed Side Monitor

Possible required equipment:

- Electrical Safety Analyzer
- Thermohygrometer
- Vital Signs Simulator
- etc.

The important workflow idea is:

Device Type
↓
Required Equipment
↓
Work Order / Calibration Job
↓
Surat Jalan
↓
Technician brings the required equipment

The goal is NOT to build a full Inventory Management system yet.

The initial requirement is much simpler:

An administrator/user should be able to define which equipment/tools are normally
required for calibrating a particular Device Type.

Example:

Bed Side Monitor
├── Vital Signs Simulator
├── Electrical Safety Analyzer
└── Thermohygrometer

Then when a Bed Side Monitor calibration job is created, MEDCAL should be able
to derive the required equipment automatically instead of asking the user to
search/select every tool manually.

==================================================
IMPORTANT BUSINESS SCENARIO
==================================================

Currently PKM has approximately 3 technicians.

Equipment may be limited.

Example:

There is only ONE Electrical Safety Analyzer.

But there are TWO Bed Side Monitor calibration jobs.

Both jobs require the same equipment.

We DO NOT want to build an automatic scheduler/resource allocation system yet.

Instead, the future system should be able to recognize that:

Equipment:
Electrical Safety Analyzer #01

is required by:

WO-001
WO-002

and indicate that scheduling/coordination is required.

The human/admin can resolve the scheduling.

The system should not necessarily hard-block the second job at this stage.

==================================================
AUDIT OBJECTIVE
==================================================

Before designing an Equipment model, determine how the concept should fit
into the CURRENT MEDCAL architecture.

Do not assume that a new Equipment model is automatically the correct solution.

Investigate whether existing models can already represent some or all of
this concept.

==================================================

1. DATABASE / PRISMA ARCHITECTURE AUDIT
   \==================================================

Inspect the complete Prisma schema and identify existing models related to:

- Device
- DeviceType
- DeviceCalibrationParameter
- DeviceCapability
- DeviceCapabilityItem
- Asset
- Inventory
- Stock
- Item
- Product
- Master data
- Reference equipment
- Calibration equipment
- Tools
- Serial-numbered objects
- Customer-owned equipment
- Company-owned equipment
- Work Order
- Service Order
- Surat Jalan
- Technician
- Employee/User
- any existing resource/allocation concepts

For each potentially relevant model, explain:

- What it represents
- Its ownership semantics
- Whether it has serial number
- Whether it represents a physical instance or a generic item/type
- Whether it is currently used operationally
- Whether it could overlap with the proposed Equipment concept
- Whether it should be reused, extended, or kept separate

Pay special attention to the distinction between:

Equipment TYPE
vs
Equipment INSTANCE.

Example:

Equipment Type:
Electrical Safety Analyzer

Equipment Instance:
Electrical Safety Analyzer
Brand: Fluke
Model: ESA620
Serial Number: ABC123

Do not assume these should necessarily be separate models.
Analyze the existing architecture first.

================================================== 2. CURRENT DEVICE ARCHITECTURE
==================================================

Analyze the relationship:

DeviceType
↓
DeviceCalibrationParameter
↓
DeviceCapabilityItem
↓
DeviceCapability

Determine whether the proposed:

DeviceType
↓
Required Equipment

fits naturally into the existing domain.

Identify whether the relationship should conceptually be:

DeviceType → Equipment

or:

DeviceType → EquipmentType

or:

DeviceType → EquipmentRequirement → Equipment

or another structure.

Do NOT implement any of these yet.

Explain the trade-offs.

================================================== 3. TRACEABILITY REQUIREMENT
==================================================

Review the actual MEDCAL calibration workflow and existing models to determine
where "equipment used" should eventually be recorded.

The business requirement is that the calibration document/LK can identify
the equipment used for the calibration.

Example from actual PKM LK:

Nama Alat
Merk
Type/Model
No. Seri

Therefore determine whether future traceability requires:

- required equipment
- assigned equipment
- equipment actually used

These are potentially different concepts.

Analyze them separately.

Example:

Required:
Thermohygrometer

Assigned:
Thermohygrometer #01

Actually Used:
Thermohygrometer #01

Do not assume they are the same thing.

================================================== 4. WORK ORDER ARCHITECTURE
==================================================

Inspect the current Work Order architecture.

Determine:

- how On Site vs In Lab is represented
- where technicians are assigned
- where Work Order items/calibration devices are represented
- whether one Work Order can contain multiple devices
- whether one Work Order can contain multiple calibration jobs
- where Surat Jalan is represented
- whether Surat Jalan already has line/detail models
- whether equipment could eventually be attached to the Surat Jalan

Important business context:

For On Site work, the equipment should eventually be known BEFORE the technician leaves.

Therefore analyze where the future Equipment Requirement should logically
enter the workflow.

Do NOT modify the workflow.

================================================== 5. TECHNICIAN ARCHITECTURE
==================================================

Inspect current Technician/User/Employee models and relationships.

We currently have approximately 3 technicians.

Determine whether the existing architecture already has a suitable concept
for assigning resources to technicians.

Do NOT build technician scheduling.

We only need to understand whether future Equipment Assignment can coexist
with technician assignment.

================================================== 6. INVENTORY VS EQUIPMENT
==================================================

This distinction is extremely important.

We are NOT currently asking for:

- stock quantity
- warehouse
- stock movement
- purchasing
- valuation
- inventory transactions
- issue/return workflow

The immediate business requirement is:

"Which calibration equipment/tool is required to perform this Device Type?"

And eventually:

"Which physical equipment instance will be brought/used for this job?"

Analyze whether the proposed Equipment concept should be:

A. completely independent from Inventory

B. an Asset-like concept

C. eventually connected to Inventory

D. something already represented by an existing model

Provide a recommendation based on the existing architecture.

================================================== 7. OWNERSHIP
==================================================

Investigate whether calibration equipment is:

- PKM-owned
- potentially customer-owned
- reference equipment
- reusable across jobs

Do not invent business rules that are not found in the existing code/data.

If ownership information is not represented anywhere, explicitly state that
as an open business question.

================================================== 8. CONCURRENCY / AVAILABILITY
==================================================

Analyze how the future model could represent:

Equipment #01
↓
WO-001
WO-002

without implementing scheduling.

Determine what minimum information would eventually be needed to detect:

"this physical equipment is required by multiple jobs whose schedules overlap."

Do not implement conflict detection yet.

We only want the architecture recommendation.

================================================== 9. MODELING OPTIONS
==================================================

After the audit, propose 2–3 reasonable architecture options.

For example:

Option A:
Equipment directly linked to DeviceType

Option B:
EquipmentType + EquipmentInstance

Option C:
EquipmentRequirement + EquipmentInstance

But ONLY propose options that make sense based on the actual existing MEDCAL
architecture.

For each option explain:

- model complexity
- relationship complexity
- advantages
- disadvantages
- impact on current architecture
- ability to support future Technician App
- ability to support LK traceability
- ability to support equipment conflicts
- whether it accidentally creates an Inventory system

================================================== 10. RECOMMENDATION
==================================================

Recommend ONE option for MEDCAL at the current stage.

The recommendation must follow this principle:

KEEP IT SIMPLE NOW,
BUT DO NOT PAINT THE ARCHITECTURE INTO A CORNER.

We want enough structure to support:

Device Type
↓
Required Equipment
↓
Work Order
↓
Actual Equipment Used
↓
LK / Calibration Traceability

But we do NOT want to implement the complete future system now.

================================================== 11. WHAT WE DO NOT WANT
==================================================

Do NOT prematurely introduce:

- Equipment scheduling engine
- resource planning engine
- inventory management
- warehouse management
- stock ledger
- procurement
- depreciation
- maintenance management
- calibration management for the reference equipment itself
- complex availability engine

If any of these become future possibilities, simply mention them as
future extension points.

================================================== 12. OUTPUT
==================================================

Create an audit report:

implementation_report_equipment_audit.md

Prefer:

docs/claude/plans/device-management/equipment/

If that directory does not exist, do not create unrelated structure without
checking the existing project documentation convention.

The report must contain:

1. Existing relevant models
2. Existing relevant relationships
3. Existing Work Order architecture
4. Existing Technician architecture
5. Existing Surat Jalan architecture
6. Existing Inventory/Asset-related architecture
7. Equipment-related concepts already present, if any
8. Required Equipment vs Equipment Instance vs Equipment Used analysis
9. 2–3 architecture options
10. Recommended architecture
11. Proposed minimal model(s), conceptually only
12. Future extension points
13. Open business questions
14. Explicit things that should NOT be implemented yet

IMPORTANT:

This is an AUDIT ONLY.

Do not modify:

- schema
- migrations
- API
- UI
- database
- application code

Do not create an Equipment model yet.

Stop after producing the audit report and a concise summary of your recommendation.
