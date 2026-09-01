TASK: IMPLEMENT SURAT JALAN ALAT / DELIVERY NOTE (DLN)
======================================================

This task is now ready for implementation.

IMPORTANT:
WorkOrderEquipment is ALREADY implemented and is the authoritative source
of the actual equipment that will be carried by the technician.

The Delivery Note must consume WorkOrderEquipment.
DO NOT recreate equipment selection inside Delivery Note.

======================================================
§0 LOCKED BUSINESS DECISIONS
======================================================

1. SERVICE MODE

ON_SITE

- Work Order document = SPK
- Customer-site calibration
- Technician carries PKM reference equipment
- Surat Jalan Alat IS REQUIRED
- Delivery Note prefix = DLN

SEND_TO_LAB

- Work Order document = WOL
- Calibration is performed inside PKM laboratory
- Surat Jalan Alat is NOT required

Therefore:

ON_SITE:
SPK
↓
WorkOrderEquipment
↓
Surat Jalan Alat (DLN)

SEND_TO_LAB:
WOL
↓
no Delivery Note

DO NOT create WOS.

======================================================
§1 DOCUMENT TERMINOLOGY
======================================================

Business/UI name:

SURAT JALAN ALAT

English/internal concept:

Equipment Delivery Note

Candidate internal DocumentType:

EQUIPMENT_DELIVERY_NOTE

Prefix:

DLN

Number format:

DLN/YYYY/MM/NNNNN

Example:

DLN/2026/09/00001

Numbering rules:

- independent from SPK
- independent from WOL
- yearly sequence
- MM is display-only and does NOT reset the counter
- sequence partition must follow the existing DocumentNumberSequence /
  DocumentNumberService architecture
- do not invent a second numbering mechanism

Example:

DLN/2026/09/00001
DLN/2026/10/00002

Do NOT modify existing SPK/WOL numbering.

======================================================
§2 SOURCE OF EQUIPMENT — CRITICAL
======================================================

The Delivery Note equipment list MUST come from:

WorkOrderEquipment

NOT from:

- DeviceTypeEquipmentRequirement
- EquipmentType
- Device
- CalibrationJob
- arbitrary Equipment master query

The authoritative chain is:

DeviceTypeEquipmentRequirement
↓
default proposal during ON_SITE WorkOrder creation
↓
user selects actual Equipment
↓
WorkOrderEquipment
↓
equipmentConfirmedAt
↓
Delivery Note

The Delivery Note MUST NOT allow the user to independently select
or replace equipment.

The Delivery Note is a document representing the equipment already
selected for the WorkOrder.

======================================================
§3 EQUIPMENT ORDER
======================================================

The authoritative order is:

WorkOrderEquipment.sortOrder ASC

The Delivery Note must preserve this exact order.

Example:

WorkOrderEquipment:

10 Electrical Safety Analyzer
20 Thermohygrometer
30 Vital Signs Simulator

PDF must show:

1. Electrical Safety Analyzer
2. Thermohygrometer
3. Vital Signs Simulator

DO NOT sort alphabetically.

DO NOT use EquipmentType.name ordering.

DO NOT use DeviceTypeEquipmentRequirement ordering directly.

DO NOT create a separate PDF-specific ordering field.

======================================================
§4 ACTUAL EQUIPMENT DATA
======================================================

The Delivery Note represents actual PKM equipment.

The document should be able to display, where available:

- No.
- Nama Alat
- Merk
- Type / Model
- Serial Number

The source must ultimately be the actual Equipment referenced by
WorkOrderEquipment.

Do not use EquipmentType as a substitute for actual equipment identity.

======================================================
§5 SNAPSHOT / HISTORICAL INTEGRITY
======================================================

Audit the current architecture and determine the safest way to preserve
historical Delivery Note content.

Once a Delivery Note is issued, changing the Equipment master later
must NOT silently alter the historical document.

Prefer a Delivery Note header + item snapshot model if consistent with
the existing document architecture.

The item snapshot should preserve the relevant equipment identity:

- equipmentId
- equipment name
- brand
- model/type
- serial number
- sortOrder

Do not store only equipmentId if that would make historical PDF output
dependent on mutable master data.

If the repository already has an established snapshot/document pattern,
reuse it.

======================================================
§6 DOCUMENT RELATIONSHIP
======================================================

The Delivery Note belongs to the ON_SITE WorkOrder / SPK.

Recommended relationship:

WorkOrder
└── DeliveryNote
└── DeliveryNoteItem
└── snapshot of WorkOrderEquipment

Audit cardinality first.

Default business rule:

ONE ACTIVE DELIVERY NOTE PER ON_SITE WORK ORDER.

A reprint must NOT create another document number.

If reissue/versioning is required by the existing document architecture,
do not invent a complicated versioning system.

If the repository cannot safely support reissue semantics, document the
smallest OPEN BUSINESS DECISION.

======================================================
§7 CREATION / LIFECYCLE
======================================================

Recommended operational flow:

1. ON_SITE WorkOrder exists.
2. WorkOrderEquipment has been selected.
3. Equipment list has been confirmed.
4. User creates/issues Surat Jalan.
5. System allocates DLN number.
6. System snapshots WorkOrderEquipment.
7. Delivery Note becomes issued.
8. PDF can be viewed/printed/downloaded.

IMPORTANT:

Do not allow Delivery Note issuance when:

- WorkOrder is SEND_TO_LAB
- WorkOrder does not have confirmed equipment
- there is no valid WorkOrderEquipment list

Use existing WorkOrder status/lifecycle rules where possible.

Do NOT invent a new WorkOrder status just for Delivery Note.

======================================================
§8 DOCUMENT NUMBERING IMPLEMENTATION
======================================================

Inspect the existing:

- DocumentType enum
- DocumentNumberService
- DocumentNumberSequence
- prefix maps
- allocation logic
- formatting logic
- existing SPK/WOL implementations

Implement DLN using the SAME architecture.

Expected changes:

- add ONE DocumentType enum value:
  EQUIPMENT_DELIVERY_NOTE
- add ONE prefix mapping:
  EQUIPMENT_DELIVERY_NOTE → DLN
- add the required table/document mapping if the existing architecture
  requires it

Do not modify:

- SPK
- WOL
- existing sequence logic
- existing number format
- existing allocation algorithm

Add focused tests proving:

DLN/2026/09/00001
DLN/2026/09/00002

and that SPK/WOL sequences remain independent.

======================================================
§9 HARD-COPY DOCUMENT — SOURCE OF TRUTH
======================================================

The provided hard-copy Surat Jalan Alat is the operational/layout
reference.

Use the existing PKM/KAN assets:

PKM logo:
D:\medcal\apps\portal\public\logo.png

KAN logo:
D:\medcal\apps\portal\public\KAN-logo.png

Do NOT replace these with newly generated assets.

The PDF must reproduce the business meaning and structure of the
hard-copy document as closely as the existing PDF infrastructure allows.

Inspect existing PDF infrastructure first.

Reuse:

- PDF library
- letterhead helpers
- footer helpers
- logo helpers
- fonts
- page numbering
- signature/layout conventions

Do NOT create a completely separate PDF architecture.

======================================================
§10 PDF CONTENT
======================================================

Audit the hard-copy Surat Jalan and map each visible field to actual
system data.

At minimum:

HEADER:

- PKM identity
- PKM logo
- KAN logo where appropriate
- document title
- DLN number
- date
- customer
- location
- SPK/reference information where appropriate

BODY:

- sequence number
- actual equipment name
- brand
- model/type
- serial number

FOOTER:

- statement/text from the operational document
- authorization/signature area
- relevant PKM identity

DO NOT invent text that is not supported by the provided hard-copy
reference or existing document conventions.

If a field cannot be sourced:

- identify it clearly
- use the smallest safe existing source if derivable
- otherwise report OPEN BUSINESS DECISION

======================================================
§11 PDF DATE
======================================================

Do not blindly use current server date.

Audit the correct business meaning of the Delivery Note date.

Candidate:

- date equipment leaves PKM / scheduled ON_SITE date

Determine from existing WorkOrder fields and hard-copy document.

If not determinable from the code/reference, make it an explicit
OPEN BUSINESS DECISION rather than guessing.

======================================================
§12 UI
======================================================

Add Delivery Note access to the ON_SITE WorkOrder experience.

The user should be able to:

- see whether a Delivery Note exists
- create/issue it when eligible
- view it
- print/download PDF
- reprint without generating a new number

For SEND_TO_LAB:

- do not show an actionable Delivery Note workflow

Do not redesign the entire WorkOrder page.

Follow existing portal UI patterns.

Reuse existing:

- buttons
- badges
- dialogs
- permissions
- loading/error states
- document action patterns

======================================================
§13 DELIVERY NOTE CREATION
======================================================

Creation must be server-side and transactional.

When issuing:

1. Validate WorkOrder exists.
2. Validate company/tenant scope.
3. Validate serviceMode = ON_SITE.
4. Validate equipmentConfirmedAt is present.
5. Load WorkOrderEquipment.
6. Require at least one equipment.
7. Order by sortOrder ASC.
8. Allocate DLN number using DocumentNumberService.
9. Create DeliveryNote header.
10. Create DeliveryNoteItems as snapshots.
11. Commit atomically.

Prevent duplicate active Delivery Notes for the same WorkOrder.

If a Delivery Note already exists:

- return/use the existing document according to established repository
  conventions
- do NOT allocate another number merely because the user clicks the
  button again

======================================================
§14 IMMUTABILITY
======================================================

Once issued:

Delivery Note content should be treated as immutable.

Do NOT allow editing:

- equipment
- order
- customer
- SPK relationship
- document number

If the underlying WorkOrderEquipment changes after issuance, the existing
Delivery Note snapshot MUST NOT silently change.

If business rules require a new Delivery Note after a material change,
document the reissue behavior rather than silently mutating the old
document.

======================================================
§15 RBAC
======================================================

Reuse existing WorkOrder/document permissions where appropriate.

Do NOT create unnecessary new permissions.

Server-side authorization is mandatory.

Read:

- authorized users can view/download the document.

Create/issue:

- requires appropriate existing update/create permission according to
  repository conventions.

Do not weaken RBAC.

======================================================
§16 API
======================================================

Use the repository's existing document/API conventions.

Prefer the smallest API surface required.

Potential operations:

- create/issue Delivery Note for WorkOrder
- get Delivery Note
- generate/view/download PDF

Do not create redundant endpoints.

Do not expose an endpoint that allows arbitrary equipment selection.

Equipment comes from WorkOrderEquipment only.

======================================================
§17 TESTS
======================================================

Add focused tests covering:

1. ON_SITE WorkOrder can create a Delivery Note.
2. SEND_TO_LAB cannot create a Delivery Note.
3. Unconfirmed equipment blocks Delivery Note issuance.
4. Empty WorkOrderEquipment blocks issuance.
5. Actual equipment comes from WorkOrderEquipment.
6. DeviceTypeEquipmentRequirement is NOT queried as the document source.
7. Equipment order follows WorkOrderEquipment.sortOrder.
8. Equipment master fields are snapshotted.
9. Existing Delivery Note cannot be duplicated accidentally.
10. Reprint uses the same DLN number.
11. SPK numbering remains unchanged.
12. WOL numbering remains unchanged.
13. DLN numbering increments independently.
14. Two different WorkOrders can receive independent DLN numbers.
15. Cross-company access is rejected.
16. Unauthorized users are rejected.
17. Changing Equipment master after issuance does not alter the
    Delivery Note snapshot.
18. PDF contains the correct ordered equipment.
19. PDF uses the correct DLN number.
20. PDF uses the expected logos/layout.

Use existing repository test conventions.

======================================================
§18 MIGRATION / DATABASE SAFETY
======================================================

Before modifying Prisma:

- inspect existing document models
- inspect existing DocumentType usage
- inspect existing migration conventions
- inspect existing foreign-key/delete behavior

Prefer additive changes.

Do NOT rename existing models or fields.

Do NOT alter existing WorkOrderEquipment semantics.

Do NOT alter Equipment master.

Do NOT alter DeviceTypeEquipmentRequirement.

======================================================
§19 STRICT SCOPE PROTECTION
======================================================

This implementation MUST NOT change unrelated business logic.

DO NOT modify:

- Calibration Request
- Requisition
- Quotation
- Price List
- Purchase Order
- DeviceType
- Device
- DeviceTypeEquipmentRequirement
- DeviceCalibrationParameter
- EquipmentType
- Equipment master semantics
- WorkOrderEquipment selection logic
- WorkOrderEquipment DnD
- SPK business rules
- WOL business rules
- SPK numbering
- WOL numbering
- ServiceMode semantics
- CalibrationJob
- technician assignment semantics
- existing WorkOrder status model

Do not refactor unrelated code.

======================================================
§20 IMPLEMENTATION ORDER
======================================================

Work in this order:

PHASE 1 — AUDIT

- inspect existing architecture
- inspect existing PDF infrastructure
- inspect existing document models
- inspect hard-copy field mapping

PHASE 2 — DATA MODEL

- DeliveryNote header
- DeliveryNoteItem snapshot
- required relations/indexes/constraints

PHASE 3 — NUMBERING

- DocumentType
- DLN prefix
- existing DocumentNumberService integration

PHASE 4 — API

- issue/create
- get
- PDF endpoint

PHASE 5 — UI

- WorkOrder Delivery Note actions
- status/eligibility
- view/print/download

PHASE 6 — PDF

- reproduce hard-copy structure
- PKM logo
- KAN logo
- equipment snapshot/order

PHASE 7 — TESTS

- service
- numbering
- authorization
- PDF
- idempotency

======================================================
§21 FINAL ACCEPTANCE CRITERIA
======================================================

The task is DONE only if:

[ ] ON_SITE/SPK can issue a Surat Jalan Alat.
[ ] SEND_TO_LAB/WOL cannot issue one.
[ ] Equipment source is WorkOrderEquipment.
[ ] Equipment is NOT selected again in Delivery Note.
[ ] WorkOrderEquipment.sortOrder is preserved.
[ ] DLN has independent yearly numbering.
[ ] Format is DLN/YYYY/MM/NNNNN.
[ ] Existing SPK/WOL numbering is untouched.
[ ] Delivery Note is immutable after issue.
[ ] Equipment data is snapshotted.
[ ] Duplicate issuance is prevented.
[ ] Reprint uses the same DLN number.
[ ] PDF follows the supplied hard-copy business document.
[ ] PKM logo is used.
[ ] KAN logo is used where applicable.
[ ] UI follows existing MedCal patterns.
[ ] RBAC is preserved.
[ ] Cross-company access is rejected.
[ ] Tests pass.
[ ] Typecheck passes.
[ ] Build passes.

======================================================
§22 FINAL REPORT
======================================================

At completion report:

## Audit

- Existing document architecture
- Existing PDF architecture
- Hard-copy field mapping
- Any OPEN BUSINESS DECISIONS

## Schema

- Models added
- Relations
- Constraints
- Migration

## Numbering

- DocumentType
- Prefix
- Sequence behavior
- Example numbers

## API

- Endpoints
- Validation
- Authorization
- Idempotency

## UI

- WorkOrder integration
- Eligibility
- View/print/download

## PDF

- Template/layout
- Data sources
- Snapshot behavior
- Logo handling

## Tests

- Tests run
- Results

## Verification

- Typecheck
- Build

## Scope Protection

Explicitly confirm that:

- SPK/WOL logic unchanged
- SPK/WOL numbering unchanged
- WorkOrderEquipment selection unchanged
- WorkOrderEquipment DnD unchanged
- Equipment Requirements unchanged
- Calibration logic unchanged

If any unrelated file or business logic was changed, explain exactly why.

DO NOT claim DONE unless the acceptance criteria are actually verified.
