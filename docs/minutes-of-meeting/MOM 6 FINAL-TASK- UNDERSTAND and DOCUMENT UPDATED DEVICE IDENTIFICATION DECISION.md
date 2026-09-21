TASK: UNDERSTAND & DOCUMENT UPDATED DEVICE IDENTIFICATION DECISION
===============================================================

IMPORTANT:
This task is ONLY for understanding and documenting a newly opened/revised
business decision regarding Device identification and Device lookup.

DO NOT IMPLEMENT ANYTHING.
DO NOT MODIFY CODE.
DO NOT MODIFY DATABASE / SCHEMA.
DO NOT CREATE MIGRATIONS.
DO NOT MODIFY API.
DO NOT MODIFY UI.
DO NOT MODIFY SEED.
DO NOT MODIFY EXISTING MoM files.
DO NOT RUN AN AUDIT.
DO NOT SEARCH FOR UNRELATED ISSUES.
DO NOT REDESIGN OTHER PARTS OF THE SYSTEM.
DO NOT REOPEN OTHER LOCKED BUSINESS DECISIONS.

You MAY inspect the minimum amount of existing code/schema needed to understand
how the current Device / CalibrationJob relationship works.

You MAY provide feedback, concerns, inconsistencies, or implementation implications
IF AND ONLY IF they are directly related to the decision described below.

Do not turn this task into a general architecture review.


===============================================================
1. CONTEXT
===============================================================

We are intentionally OPENING / REVISING ONE PREVIOUSLY LOCKED DECISION.

The previous discussion created confusion around `deviceId`.

The corrected business understanding is:

- `deviceId` is an INTERNAL MedCal system/database ID.
- `deviceId` is generated/managed by the system.
- Customer does NOT know `deviceId`.
- Technician does NOT need to know `deviceId`.
- Technician must NOT be asked to manually type `deviceId`.
- `deviceId` must NOT be displayed as a user-facing device identifier.

The physical identity that humans actually see and work with is:

- Serial No

The technician therefore works with the physical Serial No, not the internal
MedCal Device ID.


===============================================================
2. NEW BUSINESS DIRECTION
===============================================================

The intended workflow is:

Customer
    ↓
Customer-specific Device lookup
    ↓
Search Device by name and/or Serial No
    ↓
System displays matching Devices together with their Serial No
    ↓
Technician physically checks the equipment
    ↓
Technician matches the physical Serial No with the displayed Serial No
    ↓
Technician selects the correct Device
    ↓
System obtains the internal Device.id automatically
    ↓
CalibrationJob.deviceId stores that internal Device.id


IMPORTANT:

The FIRST FILTER is CUSTOMER.

The technician should NOT perform a global Device search across all customers.

Conceptually:

Customer
    ↓
Customer's Devices
    ↓
Search by Device Name / Device Type / Model and/or Serial No
    ↓
Result list contains enough information to identify the physical Device,
especially Serial No
    ↓
Technician selects the matching Device


Example:

Customer:
[ RS ABC ]

Device search:
[ Omron HEM-7121 ]

Results:

1. Omron HEM-7121
   Serial No: 12345678

2. Omron HEM-7121
   Serial No: 87654321

3. Omron HEM-7121
   Serial No: 11223344


The technician physically checks the equipment and selects the matching
Serial No.

The technician does NOT see:

Device ID: 847

Internally, the selected record may be:

Device.id = 847

and the system then stores:

CalibrationJob.deviceId = 847


===============================================================
3. IMPORTANT DISTINCTION
===============================================================

There are three different concepts and they MUST NOT be conflated:

A. Device.id / deviceId
   - Internal MedCal relational identifier.
   - Generated/managed by the system.
   - Used for FK/reference.
   - Not a technician-facing identifier.
   - Not a customer-facing identifier.

B. Device.serialNumber
   - Physical/business identity visible on the equipment.
   - Used by humans to identify and verify the equipment.
   - Displayed to technician.
   - Used as an important lookup/matching attribute.

C. technicianObservedSerial
   - Serial No actually observed by technician during the job.
   - This remains part of the existing technician observation / BAI concept.
   - This task DOES NOT change the existing BAI rules.

DO NOT merge these concepts.


===============================================================
4. EXISTING LOCKED BAI RULES REMAIN INTACT
===============================================================

This task DOES NOT reopen or redesign the BAI decision.

The following remains unchanged:

- BAI is for correcting observed identity information.
- Technician does not use BAI to select another Device.
- BAI must not replace/change CalibrationJob.deviceId.
- Technician does not change the Device relationship through BAI.
- Existing locked MoM #6 rules remain authoritative unless this specific
  Device lookup decision explicitly requires a documented change.

Do not reinterpret this task as permission to redesign BAI.


===============================================================
5. WHAT YOU ARE ASKED TO DO NOW
===============================================================

STEP 1 — UNDERSTAND

Read only the minimum relevant existing implementation/schema/documentation
needed to understand:

- Device
- Device.id
- Device.serialNumber
- Customer relationship
- CalibrationJob.deviceId
- Existing Device selection/lookup flow, if one exists

Do NOT perform a broad audit.

STEP 2 — COMPARE THE NEW DECISION WITH CURRENT IMPLEMENTATION

Determine only:

1. What the current implementation does regarding Device selection/lookup.
2. What the new decision intends.
3. Whether the new decision conflicts with any existing implementation.
4. Which exact areas would eventually need modification.

Do NOT modify those areas yet.

STEP 3 — PROVIDE FEEDBACK

You MAY provide feedback.

Feedback must be limited to this specific decision.

For example:

- Is Customer → Device lookup logically consistent?
- Is Device Name + Serial No sufficient for the technician to identify the
  correct physical Device?
- Is Customer-first filtering appropriate for avoiding cross-customer
  ambiguity?
- Are there any direct contradictions with the existing data model?
- Is there any important ambiguity that MUST be resolved before implementation?

If you identify a concern, explain it factually.

Do NOT invent additional requirements.

Do NOT expand this into a general Device Management review.

Do NOT propose unrelated improvements.

STEP 4 — STOP

After understanding the decision and providing the feedback:

STOP.

DO NOT IMPLEMENT ANYTHING.

The purpose of this task is to establish and document the decision before
implementation.


===============================================================
6. REPORT REQUIREMENT
===============================================================

Create a Markdown report in:

D:\medcal\docs\minutes-of-meeting\

Use a filename appropriate for the current date, for example:

device-identification-lookup-decision-20260921.md

The report should contain:

# Device Identification & Lookup — Decision Understanding

## 1. Purpose

Explain why this decision is being revisited.

## 2. Revised Business Decision

Document clearly:

- deviceId is internal MedCal ID
- system-generated
- not shown to customer
- not shown to technician
- technician does not manually enter deviceId

## 3. Device Identification Model

Clearly distinguish:

- Device.id / deviceId
- Device.serialNumber
- technicianObservedSerial

## 4. Intended Lookup Flow

Document:

Customer
→ Customer's Devices
→ Search by Device Name / Serial No
→ Display Device + Serial No
→ Technician verifies physical Serial No
→ Technician selects Device
→ System obtains Device.id
→ CalibrationJob.deviceId

## 5. Technician Experience

Explicitly document what technician DOES and DOES NOT see/input.

## 6. Relationship With Existing BAI Decision

State that this decision does NOT change the locked BAI behavior.

## 7. Current Implementation vs New Decision

Only document directly relevant differences.

## 8. Feedback / Concerns

List only feedback directly related to this decision.

If there are no material concerns, explicitly say:

"No material concern identified at this stage."

## 9. Scope Boundary

Explicitly state:

- NO implementation in this task.
- NO schema changes.
- NO API changes.
- NO UI changes.
- NO migration.
- NO seed changes.
- NO redesign of other locked decisions.

## 10. Decision Status

Use:

STATUS: PENDING IMPLEMENTATION

This document is a decision-understanding / pre-implementation document.


===============================================================
7. FINAL RULE
===============================================================

The most important instruction:

UNDERSTAND FIRST.
DOCUMENT SECOND.
FEEDBACK THIRD.
IMPLEMENTATION = NONE.

Do not "helpfully" implement anything.

Do not reopen unrelated locked decisions.

Do not perform a broad audit.

Do not go looking for problems elsewhere.

If you believe something needs clarification, document it under
"Feedback / Concerns" rather than silently making a new business decision.

After the Markdown report is written, return a concise summary of:

1. What you understood.
2. Any direct feedback/concerns.
3. The exact Markdown file created.

Then STOP.