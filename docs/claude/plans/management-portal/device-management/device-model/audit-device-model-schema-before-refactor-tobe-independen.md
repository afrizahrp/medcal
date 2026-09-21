Task: Comprehensive audit before refactoring DeviceModel and introducing DeviceManufacturer as independent masters

Context
-------

We have an intentional schema change:

1. DeviceModel must become an independent master.
2. DeviceManufacturer must be introduced as a new independent master.
3. DeviceType already exists as its own master and remains independent.

Do NOT spend time proving that the current DeviceModel is dependent. That is already known and is the reason for this task.

Current DeviceModel schema:

model DeviceModel {
id String @id @default(cuid())
deviceTypeId String
manufacturer String
model String
description String?
isActive Boolean @default(true)
createdAt DateTime @default(now())
updatedAt DateTime @updatedAt

deviceType DeviceType @relation(fields: [deviceTypeId], references: [id])

@@unique([deviceTypeId, manufacturer, model])
@@index([deviceTypeId])
@@index([isActive])
}

DeviceManufacturer does not currently exist as a master.

The desired end state is:

DeviceType = independent master
DeviceManufacturer = independent master
DeviceModel = independent master

Do not implement the refactor yet.

Your job in this task is to perform a COMPREHENSIVE IMPACT AUDIT first and produce an implementation plan that is safe, minimal, and consistent with the existing Medcal architecture.

==================================================
PHASE 1 — DATABASE / SCHEMA AUDIT
==================================================

Inspect the entire Prisma/schema/database layer.

Determine exactly:

1. Every relation involving DeviceModel.
2. Every FK/reference to DeviceModel.id.
3. Every FK/reference to DeviceModel.deviceTypeId.
4. Every use of manufacturer as a string related to DeviceModel.
5. Every unique constraint involving:
   - deviceTypeId
   - manufacturer
   - model
6. Every index related to these fields.
7. Any migration history that is relevant.
8. Any seed/test/fixture data involving DeviceModel.
9. Any raw SQL/query that directly references the underlying tables/columns.

Do NOT change schema yet.

Also determine whether DeviceModel.id is already referenced by other entities.

This is critical because DeviceModel.id should ideally be preserved during the refactor if possible.

==================================================
PHASE 2 — DEVICE MANUFACTURER AUDIT
==================================================

Confirm comprehensively that there is currently no existing DeviceManufacturer master.

Search the entire codebase for:

- manufacturer
- manufacturers
- deviceManufacturer
- manufacturerId
- manufacturer master
- manufacturer CRUD
- manufacturer API
- manufacturer query hooks
- manufacturer selectors
- manufacturer constants/enums
- manufacturer seed data

Distinguish between:

A. actual master/entity
B. free-text manufacturer fields
C. UI-only manufacturer values
D. hardcoded manufacturer lists

Do not create DeviceManufacturer yet.

The goal is to determine exactly where manufacturer currently lives and how it is used.

==================================================
PHASE 3 — DEVICE MODEL CONSUMER AUDIT
==================================================

Trace every consumer of DeviceModel.

Search backend and frontend comprehensively.

Include at minimum:

- Device
- SPK
- WO
- Requisition
- Quotation
- Calibration
- Portal
- Tech PWA
- reports
- PDF/print
- imports/exports
- seed/test fixtures

For every consumer, document:

- what it currently reads from DeviceModel
- whether it requires deviceTypeId
- whether it requires manufacturer
- whether it requires model
- whether it stores DeviceModel.id
- whether it expects DeviceModel to imply DeviceType
- whether it expects DeviceModel to imply Manufacturer
- whether it performs filtering by DeviceType
- whether it performs filtering by Manufacturer
- whether it relies on the current composite uniqueness

Do not assume that every occurrence of "model" refers to DeviceModel.
Trace the actual entity/relation.

==================================================
PHASE 4 — API / BACKEND AUDIT
==================================================

Audit every DeviceModel-related:

- endpoint
- service
- repository
- use-case
- DTO
- validation schema
- serializer/mapper
- query
- mutation
- authorization
- filtering
- sorting
- pagination
- search

Document where the current API assumes:

DeviceType -> DeviceModel

or:

DeviceModel -> Manufacturer

Also identify whether DeviceModel APIs are reused by other parts of the application.

Do not modify anything yet.

==================================================
PHASE 5 — FRONTEND AUDIT
==================================================

Audit every DeviceModel UI.

Include:

- list page
- create form
- edit form
- detail
- dropdown/select
- autocomplete
- query hooks
- mutation hooks
- table
- filters
- search
- pagination
- page size
- active/inactive
- validation
- loading/error/empty states

Identify specifically:

1. Where DeviceType is selected before Model.
2. Where Manufacturer is entered as free text.
3. Where Model is filtered by DeviceType.
4. Where Manufacturer is filtered by DeviceType.
5. Any dependent dropdown behavior.
6. Any UI assumption that Model belongs to DeviceType.

Again: audit only. Do not modify yet.

==================================================
PHASE 6 — EXISTING MASTER PATTERN AUDIT
==================================================

Find the closest existing master-data implementations, especially UOM.

Inspect their actual code.

Document the established patterns for:

RBAC:

- permission names
- backend authorization
- frontend guards

List:

- table
- columns
- status display

Search:

- API behavior
- search parameter
- debounce implementation
- debounce duration if standardized

Pagination:

- server/client side
- page parameter
- page size parameter
- total count
- page reset behavior

Page size:

- available options
- persistence behavior if any

Active/inactive:

- filter parameter
- UI filter
- activate/deactivate mutation
- permission requirements

CRUD:

- create
- edit
- deactivate
- reactivate

Forms:

- validation
- error handling
- field naming
- submit behavior

API/query hook conventions:

- query keys
- mutation patterns
- invalidation/refetch

IMPORTANT:

Do not design a new pattern.

The future DeviceModel and DeviceManufacturer masters must follow the existing established master pattern.

==================================================
PHASE 7 — DATA / MIGRATION IMPACT AUDIT
==================================================

Inspect existing data assumptions.

Determine:

1. How many DeviceModel records currently exist, if this can be determined from available tooling/schema/fixtures.
2. Whether duplicate model names exist across DeviceType.
3. Whether duplicate model names exist across manufacturers.
4. Whether the same manufacturer string appears with different casing/spelling.
5. Whether DeviceModel.id is referenced elsewhere.
6. Whether removing deviceTypeId creates ambiguity.
7. Whether existing DeviceModel records can retain their IDs.
8. How manufacturer strings could be normalized into DeviceManufacturer.
9. Whether multiple DeviceModel rows currently represent the same logical Model because of DeviceType/manufacturer differences.
10. Whether existing data requires a deterministic migration/mapping strategy.

DO NOT modify production data.

If actual database access is unavailable, clearly state that and base the analysis on schema, migrations, fixtures, and available repository evidence.

Do not invent record counts or data conditions.

==================================================
PHASE 8 — TARGET RELATIONSHIP AUDIT
==================================================

We need to determine where DeviceType, DeviceManufacturer, and DeviceModel should be related after the refactor.

The target principle is:

DeviceType
DeviceManufacturer
DeviceModel

are independent masters.

Do NOT automatically introduce:

DeviceModel -> DeviceManufacturer

and do NOT automatically introduce:

DeviceModel -> DeviceType.

Instead, inspect actual consumers such as Device and determine which entity should reference these masters independently.

For example, if the Device entity needs all three, the likely direction may be:

Device
├── deviceTypeId
├── deviceManufacturerId
└── deviceModelId

But this is an example only.

Confirm the actual target relationship from the existing schema and business flow before recommending it.

Do not invent relationships.

==================================================
PHASE 9 — UNIQUENESS AUDIT
==================================================

The current constraint is:

@@unique([deviceTypeId, manufacturer, model])

This constraint will no longer be valid once DeviceModel becomes independent.

Do NOT blindly replace it with:

@@unique([model])

First audit:

- existing master uniqueness conventions
- whether Model names are globally unique in this application
- existing duplicate possibilities
- case sensitivity
- whitespace/normalization behavior
- business usage of model names

Then propose the appropriate uniqueness rule.

If the available evidence is insufficient to determine the correct uniqueness rule, explicitly flag it as a decision point rather than guessing.

==================================================
PHASE 10 — TARGET ARCHITECTURE
==================================================

After completing the audit, provide a proposed target architecture.

It must clearly show:

Current:

DeviceModel
├── deviceTypeId
├── manufacturer
└── model

Target:

DeviceModel
└── model-related attributes only

DeviceManufacturer
└── manufacturer-related attributes only

DeviceType
└── existing independent master

Then show how actual business entities reference these masters after the refactor.

==================================================
PHASE 11 — FILE-LEVEL IMPLEMENTATION PLAN
==================================================

Before making any code changes, provide an exact implementation plan.

Group by:

1. Prisma/schema
2. Migration
3. Backend
4. API
5. Validation
6. RBAC
7. Frontend
8. Query hooks
9. Forms
10. Tables
11. Consumers
12. Tests
13. Seed/fixtures

For every proposed file change, explain briefly:

- why it needs to change
- what changes
- whether it is required or optional

Avoid broad refactoring.

==================================================
PHASE 12 — RISK / REGRESSION CHECK
==================================================

Identify potential regression areas.

At minimum:

- Device creation/edit
- Device lookup
- SPK/WO flow
- calibration flow
- portal
- tech-pwa
- quotation/requisition if affected
- reports/PDF
- existing DeviceModel records
- RBAC
- pagination
- search
- active/inactive behavior

Separate:

HIGH RISK
MEDIUM RISK
LOW RISK

Do not assign subjective quality scores. This is only an implementation/regression risk classification.

==================================================
STOP CONDITION
==================================================

STOP after the audit and proposed implementation plan.

DO NOT modify:

- Prisma schema
- migration
- backend
- frontend
- API
- query hooks
- tests

until the audit report is complete.

The next step will be a separate implementation task based on the approved audit.

==================================================
AUDIT REPORT FORMAT
==================================================

Return the report in this structure:

# 1. Executive Summary

Short summary of what currently exists and what must change.

# 2. DeviceModel Dependency Map

Show every important current dependency and consumer.

# 3. Manufacturer Usage Map

Show where manufacturer currently exists and how it is used.

# 4. Existing Master Pattern

Show which existing master(s) should be used as implementation reference and document:

- RBAC
- pagination
- page size
- search/debounce
- active/inactive
- CRUD

# 5. Data/Migration Impact

Explain existing data implications.

# 6. Target Architecture

Show the proposed independent master structure and actual consumer relationships.

# 7. Uniqueness Strategy

Explain what should happen to the current composite unique constraint and whether evidence is sufficient to determine the new constraint.

# 8. File-Level Change Plan

Exact files/components/modules expected to change.

# 9. Regression/Risk Areas

List affected areas and why.

# 10. Implementation Sequence

Give a safe ordered implementation sequence.

# 11. Open Questions / Decisions

Only list items that genuinely require a decision.
Do not invent questions when the existing codebase already answers them.

# 12. STOP

Do not implement anything in this task.
