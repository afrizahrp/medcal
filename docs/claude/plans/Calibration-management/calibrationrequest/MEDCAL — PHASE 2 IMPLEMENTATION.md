MEDCAL — PHASE 2 IMPLEMENTATION
Excel Import + DeviceType Alias
================================

STATUS
------

Phase 1 Requisition Device Data Refinement is COMPLETE.

The following business decisions have been audited and LOCKED:

D1. Qty > 1 + only one Device ID:
One supplied Device ID belongs to one resulting item only.
Remaining exploded items get NULL deviceId.
Show warning in preview.
Never replicate the Device ID automatically.

D2. Multiple Device IDs in one Excel cell:
NOT supported.
One cell = one Device ID.
Do not parse comma-separated / newline-separated IDs.

D3. Qty:
Positive integer only.
Do not add qty to CalibrationRequestItem.
Do not introduce an arbitrary business maximum.
Technical safety limits are allowed.

D4. Duplicate / re-upload:
Do not automatically deduplicate business requests.
Preview → Confirm is mandatory.
Prevent accidental double-submit of the same import operation.

D5. Quotation ×N:
DEFERRED to the future Quotation phase.
Do not modify quotation behavior now.

D6. matchedBy:
Do NOT persist matchedBy in the database for this MVP.
Match method may be shown in Preview only.

D7. Raw Excel:
Do NOT store the uploaded Excel as evidence in this phase.
File Infrastructure already exists but is not used for this feature.

D8. Alias management:
DeviceTypeAlias is master data.
Requisition users may USE aliases.
Alias creation/maintenance belongs to authorized administrative/
management users.
Do not weaken or redesign existing RBAC.

D9. Model:
Optional / nullable.

D10. Fuzzy matching:
Suggestion only.
Never automatically commit an uncertain fuzzy match.
User confirmation is mandatory.

==================================================

1. PRIMARY GOAL
   \==================================================

Implement:

    Excel Import
        +
    DeviceTypeAlias

for Calibration Request creation.

The goal is:

CUSTOMER EXCEL
↓
PARSE
↓
VALIDATE
↓
MATCH DEVICE TYPE
↓
EXPLODE QTY
↓
PREVIEW
↓
USER RESOLVES WARNINGS / UNMATCHED
↓
CONFIRM
↓
CREATE CALIBRATION REQUEST + ITEMS

The import must preserve customer-provided information.

================================================== 2. EXISTING DOMAIN — DO NOT CHANGE GRAIN
==================================================

Current CalibrationRequestItem:

    deviceTypeId
    customerDeviceName?
    model?
    deviceId?
    notes

There is NO qty column.

IMPORTANT:

One CalibrationRequestItem represents one device-granular request item.

Therefore:

Excel:

    Tensimeter | AB-123 | Qty 5 | blank

becomes:

    CalibrationRequestItem #1
    CalibrationRequestItem #2
    CalibrationRequestItem #3
    CalibrationRequestItem #4
    CalibrationRequestItem #5

Do NOT add:

    qty

to CalibrationRequestItem.

Do NOT redesign downstream quotation/work-order/calibration-job behavior.

================================================== 3. EXCEL FORMAT
==================================================

Initial supported format:

| Nama Alat | Model | Qty | Device ID |

Required:

    Nama Alat
    Qty

Optional:

    Model
    Device ID

Column matching may tolerate harmless differences in:

- capitalization
- surrounding whitespace
- common header formatting

But do not create an overly permissive column-mapping engine.

Reject missing required columns clearly.

================================================== 4. PRESERVE CUSTOMER DATA
==================================================

For every resulting CalibrationRequestItem:

customerDeviceName
= original customer-provided "Nama Alat"

Do NOT replace it with the MEDCAL DeviceType name.

Example:

Excel:

    Tensimeter Digital

Matched:

    Sphygmomanometer

Result:

    customerDeviceName = "Tensimeter Digital"
    deviceTypeId       = Sphygmomanometer.id

This distinction must remain visible in Preview.

================================================== 5. DEVICE TYPE ALIAS
==================================================

Implement a new global master:

    DeviceTypeAlias

Concept:

    DeviceType
        └── DeviceTypeAlias[]

Example:

    Sphygmomanometer
        ├── Tensimeter
        ├── Tensimeter Digital
        └── Blood Pressure Monitor

Rules:

- DeviceType is global.
- Alias is global.
- One normalized alias may map to AT MOST one DeviceType.
- Alias must reference exactly one DeviceType.
- Alias supports active/inactive state.
- Do not add companyId unless current schema audit proves DeviceType
  itself is company-scoped.
- Follow existing MEDCAL naming conventions.

Recommended conceptual fields:

    id
    deviceTypeId
    alias
    normalizedAlias
    isActive
    createdAt
    updatedAt

Use an appropriate unique constraint on normalizedAlias.

Do not blindly copy this field list if existing conventions indicate a
better minimal structure. Inspect the current schema first.

================================================== 6. NORMALIZATION
==================================================

Implement deterministic normalization for matching.

At minimum:

- trim leading/trailing whitespace
- case normalization
- collapse repeated whitespace

Do NOT aggressively remove meaningful characters.

Example:

    " Tensimeter "
    "tensimeter"
    "TENSIMETER"

should normalize to the same matching key.

Preserve the original alias text for display.

================================================== 7. MATCHING ORDER
==================================================

Use this deterministic sequence:

STEP 1
Exact normalized match against DeviceType.name

STEP 2
Exact normalized match against DeviceTypeAlias.normalizedAlias

STEP 3
If still unmatched:
fuzzy suggestion MAY be generated

But:

FUZZY MATCH ≠ AUTOMATIC MATCH

Example:

    "Tensimeter"
        ↓
    exact alias
        ↓
    Sphygmomanometer
        ↓
    MATCHED

Example:

    "Patient Monitoring Equipment"
        ↓
    no exact match
        ↓
    possible suggestions
        ↓
    USER MUST SELECT / CONFIRM

Never silently assign an uncertain fuzzy result.

================================================== 8. AMBIGUOUS ALIAS
==================================================

The database must prevent:

    "Tensimeter"
        → Sphygmomanometer

AND

    "Tensimeter"
        → another DeviceType

through normalizedAlias uniqueness.

If an ambiguity somehow exists in legacy data or runtime resolution,
fail safely and show an explicit error.

Never choose arbitrarily.

================================================== 9. IMPORT PREVIEW — MANDATORY
==================================================

Do NOT create the CalibrationRequest immediately after upload.

Required flow:

    Upload
       ↓
    Parse
       ↓
    Validate
       ↓
    Match
       ↓
    Explode Qty
       ↓
    PREVIEW
       ↓
    User confirmation
       ↓
    Commit

Preview must NOT write CalibrationRequestItems.

================================================== 10. PREVIEW CONTENT
==================================================

Preview should show enough information for a user to detect mistakes.

At minimum:

| #   | Nama Alat Customer | Model | Qty | Device ID |
| --- | ------------------ | ----- | --- | --------- |

and matching information:

| Device Type | Match | Status |
| ----------- | ----- | ------ |

Example:

    Tensimeter
    → Sphygmomanometer
    → Alias
    → MATCHED

Another:

    Patient Monitor
    → Bed Side Monitor
    → Fuzzy suggestion
    → NEEDS CONFIRMATION

Another:

    Unknown Medical Device
    → —
    → UNMATCHED

The user must be able to resolve unmatched/ambiguous rows before
confirmation.

================================================== 11. QTY EXPLOSION
==================================================

Example:

Excel:

    Tensimeter | AB-123 | 5 | blank

Preview/result:

    Item 1  Tensimeter  AB-123  NULL
    Item 2  Tensimeter  AB-123  NULL
    Item 3  Tensimeter  AB-123  NULL
    Item 4  Tensimeter  AB-123  NULL
    Item 5  Tensimeter  AB-123  NULL

Each item:

    deviceTypeId
    customerDeviceName
    model
    deviceId?

must be independently represented.

Do not add qty to CalibrationRequestItem.

================================================== 12. QTY + ONE DEVICE ID
==================================================

Example:

    Tensimeter | AB-123 | 5 | TEN-001

Result:

    Item 1 → TEN-001
    Item 2 → NULL
    Item 3 → NULL
    Item 4 → NULL
    Item 5 → NULL

Show a WARNING.

Example warning:

    "Qty 5 tetapi hanya 1 Device ID diberikan.
     Device ID hanya diterapkan ke satu item.
     Item lainnya tidak memiliki Device ID."

User must explicitly acknowledge the warning before Confirm.

Never replicate:

    TEN-001
    TEN-001
    TEN-001
    TEN-001
    TEN-001

================================================== 13. MULTIPLE DEVICE IDS IN ONE CELL
==================================================

Do NOT support:

    TEN-001,TEN-002,TEN-003

or:

    TEN-001
    TEN-002
    TEN-003

inside one cell.

Treat this as invalid / requires correction.

Show clear validation:

    "Satu baris hanya boleh memiliki satu Device ID."

Do not attempt to split the cell automatically.

================================================== 14. EMPTY DEVICE ID
==================================================

Empty Device ID becomes:

    NULL

Never:

    "000"
    "-"
    "N/A"
    "UNKNOWN"

Do not automatically transform existing database values in this phase.

================================================== 15. MODEL
==================================================

Model is optional.

Blank:

    model = NULL

Do not require model.

Do not create a Model master.

================================================== 16. QTY VALIDATION
==================================================

Accept:

    1
    2
    5
    100

Reject:

    0
    -1
    1.5
    abc
    blank
    malformed numeric values

Do not introduce a business-specific maximum.

A technical import safety limit may be introduced if necessary to prevent
resource exhaustion, but document it clearly as a technical safeguard,
not a business rule.

================================================== 17. EXCEL PREVIEW SIMULATION — REQUIRED BEFORE COMMIT
==================================================

Before considering the implementation complete, create and run a REAL sample
Excel file against the actual importer.

Do not rely only on unit tests.

Create a temporary test Excel file with at least these rows:

| Nama Alat          | Model   | Qty | Device ID |
| ------------------ | ------- | --- | --------- |
| Tensimeter         | AB-123  | 5   |           |
| Bed Side Monitor   | BSM-501 | 3   | BSM001    |
| Dental Unit        | DU-100  | 2   | DU001     |
| Tensimeter Digital | AB-123  | 2   |           |
| Patient Monitor    | PM-5    | 1   | PM-001    |

Use these conceptual DeviceTypes:

    Sphygmomanometer
    Bed Side Monitor
    Dental Unit

Use these aliases:

    Tensimeter
        → Sphygmomanometer

    Tensimeter Digital
        → Sphygmomanometer

    Patient Monitor
        → Bed Side Monitor

DO NOT blindly insert sample aliases into production.

Use LOCAL DEVELOPMENT DATABASE only.

================================================== 18. REAL SIMULATION FLOW
==================================================

Actually execute:

    sample.xlsx
        ↓
    importer
        ↓
    validation
        ↓
    DeviceType matching
        ↓
    Qty explosion
        ↓
    Preview output
        ↓
    inspect result
        ↓
    resolve required mappings
        ↓
    Confirm
        ↓
    create CalibrationRequest

Verify the resulting database records.

Expected total:

    5 + 3 + 2 + 2 + 1 = 13 CalibrationRequestItems

Verify:

- 13 items created
- customerDeviceName preserved
- model preserved
- Device IDs preserved where supplied
- NULL where not supplied
- DeviceType mapping correct
- no duplicate IDs generated
- no customer terminology overwritten

================================================== 19. DO NOT POLLUTE DEVELOPMENT DATA
==================================================

The simulation must be isolated.

Preferred approach:

- use a dedicated temporary test company/customer/request context
  if existing test infrastructure supports it
- otherwise create test records and clean them up afterward
- never leave accidental demo requisitions in the normal local business data

Report exactly what was created and cleaned up.

================================================== 20. ADMIN ALIAS MANAGEMENT UI
==================================================

Implement only the minimal management UI required for DeviceTypeAlias.

The UI should allow an authorized user to:

- list aliases
- search aliases
- create alias
- edit alias
- activate/deactivate alias
- delete alias if allowed by existing master-data conventions

Show:

    Alias
    Device Type
    Status
    Actions

Do not create a complicated taxonomy interface.

Follow existing MEDCAL master-data UI patterns.

================================================== 21. REQUISITION IMPORT UI
==================================================

Add Excel Import to the existing Calibration Request flow.

Do not redesign the entire Requisition page.

Expected user experience:

    [ Add Device ] [ Import Excel ]

Import:

    1. Select Excel
    2. Parse
    3. Preview
    4. Resolve issues
    5. Confirm
    6. Create requisition/items
    7. Show result

If there are blocking validation errors:

    Confirm must be disabled.

If there are warnings:

    user must explicitly acknowledge them.

================================================== 22. API DESIGN
==================================================

Use the existing Calibration Requests module patterns.

Prefer:

    POST /calibration-requests/import/preview

for preview.

Then:

    POST /calibration-requests/import/confirm

or another design that fits the existing API conventions.

IMPORTANT:

Do not duplicate CalibrationRequestsService.create() logic unnecessarily.

The final commit should reuse existing requisition creation logic where
practical.

Preview must be side-effect free.

Confirm must be transactional.

Do not create a second, subtly different way of creating requisitions.

================================================== 23. RBAC
==================================================

Preserve existing Calibration Request RBAC.

For Alias administration:

- use an appropriate master-data permission
- follow existing permission architecture
- do not weaken authorization

Do not modify unrelated roles or permissions.

Do not bypass:

- CompanyRoleGuard
- @CompanyId()
- existing permission checks

================================================== 24. COMPANY ISOLATION
==================================================

DeviceType is global.

Alias is global.

Requisition remains company-scoped.

An imported Excel file must create a requisition only within the currently
authorized company context.

Verify cross-company isolation.

================================================== 25. ERROR HANDLING
==================================================

Errors must be row-specific.

Examples:

    Row 7:
    Nama Alat kosong

    Row 9:
    Qty tidak valid

    Row 12:
    Device ID contains multiple identifiers

    Row 15:
    DeviceType tidak ditemukan

The user should not receive only:

    "Import failed."

Provide actionable information.

================================================== 26. TRANSACTION SAFETY
==================================================

Preview:

    NO DATABASE SIDE EFFECTS

Confirm:

    ONE TRANSACTION

If any item fails during commit:

    rollback entire import

Do not create a partially imported CalibrationRequest.

================================================== 27. SECURITY
==================================================

Validate:

- file extension
- MIME type where practical
- file size
- malformed workbook
- missing sheet
- missing columns
- excessive rows
- invalid values

Do not execute macros.

Do not trust spreadsheet formulas as application logic.

Treat Excel content as untrusted input.

Follow existing security conventions.

================================================== 28. TESTING
==================================================

Add focused tests for:

ALIAS

1. create alias
2. normalized alias uniqueness
3. duplicate alias rejected
4. alias resolves correct DeviceType
5. inactive alias does not match
6. company/user authorization for alias management

IMPORT

7. valid Excel preview
8. missing required column
9. invalid Qty
10. blank Device ID → NULL
11. Qty explosion
12. Qty + one Device ID warning
13. multiple Device IDs rejected
14. exact DeviceType name match
15. exact alias match
16. unmatched DeviceType
17. fuzzy suggestion does not auto-commit
18. preview does not create database records
19. confirm creates expected records
20. transaction rollback
21. company isolation
22. RBAC

================================================== 29. REAL EXCEL TEST
==================================================

Unit tests are NOT sufficient.

The implementation is considered verified only after:

1. A real sample .xlsx is generated/used.
2. It is uploaded to the actual local API.
3. Preview result is inspected.
4. Matching is verified.
5. Qty explosion is verified.
6. Warnings are verified.
7. Confirm is executed.
8. Database result is inspected.
9. Resulting CalibrationRequestItems = expected count.
10. Test data is cleaned up.

Document this in the implementation report.

================================================== 30. DO NOT MODIFY THESE
==================================================

Do NOT modify:

- Device
- DeviceType structure
- DeviceCalibrationParameter
- Equipment
- EquipmentType
- EquipmentCalibrationRecord
- File Infrastructure
- Quotation behavior
- Purchase Order behavior
- Work Order behavior
- CalibrationJob
- JobReferenceEquipmentUsed
- Surat Jalan
- Technician App

Except where a minimal import integration is technically required.

Do not change their business semantics.

================================================== 31. NO QTY COLUMN
==================================================

This is a hard guardrail.

DO NOT add:

    qty

to:

    CalibrationRequestItem

Excel Qty is an import instruction that determines row multiplicity.

================================================== 32. NO MATCHEDBY COLUMN
==================================================

Do not add:

    matchedBy

to the database.

Match method may exist in transient Preview DTOs.

It is not persisted.

================================================== 33. NO RAW EXCEL STORAGE
==================================================

Do not store the uploaded Excel as FileObject/evidence in this phase.

================================================== 34. NO FUZZY AUTO-COMMIT
==================================================

Absolutely no:

    fuzzy score → automatic DeviceType assignment

without explicit user confirmation.

================================================== 35. IMPLEMENTATION REPORT
==================================================

Create:

docs/claude/plans/Calibration-management/calibrationrequest/
implementation_report_excel_import_alias_phase2.md

Include:

1. Scope
2. Schema changes
3. Migration
4. DeviceTypeAlias design
5. Normalization rules
6. Matching algorithm
7. Import API
8. Preview behavior
9. Qty explosion behavior
10. Warning behavior
11. UI
12. RBAC
13. Security
14. Test results
15. REAL XLSX simulation
16. Database verification
17. Cleanup verification
18. Known limitations
19. Deferred items

================================================== 36. FINAL VERIFICATION
==================================================

Run:

- Prisma validate
- Prisma generate
- migration status
- relevant API tests
- alias tests
- import tests
- shared typecheck
- API typecheck
- API build
- portal typecheck/build if affected

Report pre-existing failures separately.

================================================== 37. FINAL RESPONSE
==================================================

At the end report:

A. What was implemented
B. Exact schema changes
C. Migration name
D. Alias behavior
E. Excel import behavior
F. Preview behavior
G. Qty explosion result
H. Real XLSX simulation result
I. Database verification
J. Tests
K. Build/typecheck
L. RBAC verification
M. Company isolation verification
N. Cleanup verification
O. Any unexpected architectural issue

Explicitly confirm:

- CalibrationRequestItem still has NO qty
- deviceId remains nullable
- customerDeviceName is preserved
- model remains nullable
- DeviceTypeAlias is global
- fuzzy matching never auto-commits
- Preview has no database side effects
- Confirm is transactional
- Quotation/WorkOrder/CalibrationJob were not redesigned

==================================================
SUCCESS CRITERIA
==================================================

The feature is successful when this works:

CUSTOMER EXCEL

    Tensimeter | AB-123 | 5 | NULL

        ↓

MATCH

    Tensimeter
        → DeviceTypeAlias
        → Sphygmomanometer

        ↓

EXPLODE

    5 CalibrationRequestItems

        ↓

PRESERVE

    customerDeviceName = "Tensimeter"
    model = "AB-123"
    deviceId = NULL

        ↓

PREVIEW

        ↓

USER CONFIRM

        ↓

TRANSACTIONAL CREATE

        ↓

CalibrationRequest
└── 5 CalibrationRequestItems

No qty column is introduced.

No customer terminology is lost.

No Device ID is invented.

No uncertain DeviceType mapping is silently committed.

No downstream commercial / operational workflow is redesigned.
