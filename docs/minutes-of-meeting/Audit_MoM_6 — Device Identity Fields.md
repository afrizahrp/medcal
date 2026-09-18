# MoM #6 — Device Identity Fields

## READ-ONLY FORENSIC AUDIT — DO NOT IMPLEMENT

We are preparing implementation for MoM #6:

> Model / Brand / Serial No / Device ID can be edited by Admin / Technician.

For this task, DO NOT modify code, schema, migration, tests, UI, API, or database.

This is an AUDIT / INSPECTION ONLY.

The goal is to understand the CURRENT architecture and determine exactly what MoM #6 means in the existing Medcal system before implementation.

==================================================
MO M #6 — LOCKED REQUIREMENT
==================================================

Requirement:

    Model
    Brand
    Serial No
    Device ID

must be editable by:

    Admin
    Technician

Important:

- Do not assume where these fields should be edited.
- Do not assume they belong to the Device master.
- Do not assume Technician should edit the master Device record.
- Do not assume existing field names.
- Inspect the actual implementation first.

There is also an existing terminology decision:

USER-FACING:
Device ID → Serial No

BACKEND:
device_id remains the backend field where currently used.
serial_no is nullable where already implemented.

Verify the CURRENT state rather than assuming this has been fully implemented.

==================================================
AUDIT OBJECTIVES
==================================================

Determine the complete current data flow for device identity information.

Trace:

Customer / Device Master
↓
Requisition
↓
Quotation
↓
PO
↓
WO / Calibration Job
↓
Technician
↓
Calibration Result / LK / PDF

For each stage determine where these fields come from:

- Model
- Brand
- Serial No
- Device ID

Identify whether each value is:

1. Master/reference data
2. Transaction snapshot
3. Copied data
4. Live relation
5. Derived/display-only value

==================================================

1. DATABASE / PRISMA AUDIT
   \==================================================

Inspect Prisma schema and identify all models/fields related to:

- Device
- DeviceType
- Brand
- Model
- Serial No
- Device ID
- CalibrationJob
- Requisition
- Quotation
- PurchaseOrder
- WorkOrder
- any relevant item/device snapshot model

For each relevant model report:

- model name
- field name
- type
- nullable/non-nullable
- relation
- whether it is master data or transaction data
- where it is referenced

Pay particular attention to:

    device_id
    serial_no

and determine whether both currently coexist and how they are used.

Do NOT change schema.

================================================== 2. BACKEND API AUDIT
==================================================

Find all endpoints/services/DTOs responsible for:

- creating device records
- updating device records
- creating requisitions
- creating quotation items
- creating PO items
- creating WO/calibration jobs
- updating calibration job device information
- technician calibration job editing

For each relevant endpoint report:

    METHOD
    ROUTE
    SERVICE
    DTO
    AUTHORIZATION
    FIELDS ACCEPTED
    FIELDS ACTUALLY WRITTEN

Determine whether Model / Brand / Serial No / Device ID are currently writable anywhere.

Do not implement anything.

================================================== 3. FRONTEND / PORTAL AUDIT
==================================================

Inspect Portal UI for:

- Device Management
- Requisition
- Quotation
- PO
- Work Order
- Calibration Job

Find where these fields are displayed or edited.

For each occurrence report:

- page/component
- field label shown to user
- backend field
- editable/read-only state
- role restrictions
- API called on save

Verify the current user-facing terminology:

    "Serial No"
    vs
    "Device ID"

Do not redesign UI.

================================================== 4. TECH-PWA AUDIT
==================================================

Inspect Technician PWA calibration workflow.

Determine:

- where technician sees device identity
- whether Model is editable
- whether Brand is editable
- whether Serial No is editable
- whether Device ID is editable
- whether there is an existing edit action
- which API is called
- whether edits affect:
  a. master Device
  b. CalibrationJob
  c. another snapshot/transaction record

Most importantly:

DO NOT assume technician should update the Device master.

Report the current behavior and architectural implication.

================================================== 5. CALIBRATION JOB SNAPSHOT AUDIT
==================================================

Inspect how CalibrationJob currently stores device identity.

Determine whether CalibrationJob stores/copies:

- device type
- model
- brand
- serial number
- device_id
- customer alias
- master device ID

Determine exactly when values are copied.

Example questions:

- At requisition?
- At quotation?
- At WO?
- At calibration job creation?
- At job start?
- Dynamically from Device master?

Also inspect Phase 1.5 snapshot architecture.

IMPORTANT:

Do NOT confuse:

    JobCalibrationTestPoint

with device identity snapshot.

They solve different problems.

Do not propose changing JobCalibrationTestPoint.

================================================== 6. DOCUMENT / PDF AUDIT
==================================================

Inspect where device identity fields appear in:

- WO PDF
- LK PDF
- Kontrol Alat
- other calibration-related PDFs

Determine which source each document uses:

    Device master
    CalibrationJob
    snapshot
    copied transaction data

Pay special attention to:

- Model
- Brand
- Serial No
- Device ID

Determine whether changing a CalibrationJob-level value would automatically affect the generated documents.

Do not modify PDFs.

================================================== 7. AUTHORIZATION / RBAC AUDIT
==================================================

Inspect current authorization model.

Determine:

- what role(s) currently have permission to update Device
- what role(s) currently have permission to update CalibrationJob
- whether "Admin" is one concrete role or a permission composed from memberships
- how Technician authorization is represented

Do NOT add or change permissions.

We need facts about the current system only.

================================================== 8. WORKFLOW / BUSINESS IMPACT AUDIT
==================================================

Identify possible side effects if Model / Brand / Serial No / Device ID are edited.

Specifically determine whether these fields are used as:

- lookup keys
- unique identifiers
- foreign-key references
- quotation matching keys
- PO matching keys
- WO matching keys
- calibration job identity
- PDF document data
- audit/history fields

Especially determine:

    device_id

Is it merely a display/reference identifier, or does changing it affect relations?

Also determine whether:

    serial_no

is currently nullable and whether there are uniqueness constraints.

================================================== 9. HISTORY / AUDITABILITY
==================================================

Inspect whether the project currently has:

- audit logs
- updatedBy
- updatedAt
- revision history
- event logs

for Device or CalibrationJob changes.

Do not create any audit mechanism.

Just report what exists.

================================================== 10. REQUIRED OUTPUT
==================================================

Return ONLY an audit report.

Use this exact structure:

# MoM #6 — Audit Report

## 1. Executive Summary

State:

- whether current architecture already supports the requirement partially
- what is missing
- the most important architectural finding

## 2. Data Model

Table:

| Entity | Field | Type | Nullable | Source/Relation | Role |
| ------ | ----- | ---- | -------- | --------------- | ---- |

## 3. Current Data Flow

Show the actual flow:

Device
→ ...
→ CalibrationJob
→ Technician
→ PDF

Do not invent missing stages.

## 4. Field-by-Field Matrix

| Field     | Current Source | Current Editable By | Current Storage | Technician Edit Target | Notes |
| --------- | -------------- | ------------------- | --------------- | ---------------------- | ----- |
| Model     |                |                     |                 |                        |       |
| Brand     |                |                     |                 |                        |       |
| Serial No |                |                     |                 |                        |       |
| Device ID |                |                     |                 |                        |       |

If something is unknown, say UNKNOWN and explain why.

## 5. Backend API

| Operation | Method | Route | DTO | Current Authorization | Writable Fields |
| --------- | ------ | ----- | --- | --------------------- | --------------- |

## 6. Portal

List all relevant pages/components and current editability.

## 7. Tech-PWA

Describe exactly how technician currently sees/edits device identity.

## 8. CalibrationJob Snapshot

Explain whether identity is:

- live
- copied
- snapshotted
- mixed

and when copying occurs.

## 9. PDF/LK Impact

| Document | Model Source | Brand Source | Serial Source | Device ID Source |
| -------- | ------------ | ------------ | ------------- | ---------------- |

## 10. Authorization

Describe existing Admin/Technician permission model relevant to this feature.

## 11. Side Effects / Constraints

List concrete technical constraints discovered.

Do NOT solve them yet.

## 12. Recommended Implementation Boundary

This is NOT implementation.

Recommend only the correct architectural boundary, for example:

    Edit master Device
    OR
    Edit CalibrationJob transaction snapshot
    OR
    both with separate permissions

Explain why based strictly on the existing code/data flow.

Do not write code.

## 13. Files Inspected

List the important files actually inspected.

## 14. Explicit Non-Changes

Confirm:

- no code modified
- no Prisma schema modified
- no migration created
- no API changed
- no UI changed
- no tests changed

==================================================
STRICT RULES
==================================================

DO NOT:

- edit any file
- create any file
- create migration
- run formatter that changes files
- implement the feature
- redesign UI
- propose unrelated refactoring
- modify JobCalibrationTestPoint
- modify Phase 1 / 1.5 / 2 / 3
- change PDF behavior
- assume what "Admin" means
- assume Technician should edit Device master
- infer behavior from filenames alone

Use actual source code and schema as evidence.

If multiple competing flows exist, report all relevant flows and identify which one is used in production/current routes.

The objective is to give us enough factual information to write a separate implementation prompt afterward.
