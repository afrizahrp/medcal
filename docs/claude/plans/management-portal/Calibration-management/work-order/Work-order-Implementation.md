# WORK ORDER PDF — AUDIT + IMPLEMENTATION

# STRICT / END-TO-END / DO NOT STOP AT AUDIT

You are working on the Medcal repository at:

D:\medcal

This task is an END-TO-END implementation task.

Do NOT only audit and report findings.
Do NOT stop after identifying gaps.
After the audit, IMPLEMENT all required changes, run verification, and provide a final report.

============================================================

# 0. BUSINESS RULE — FINAL AND LOCKED

============================================================

There are exactly TWO Work Order modes.

---

A. ON SITE
------------------------------------------------------------

Internal ServiceMode:

    ON_SITE

Business document:

    SURAT PERINTAH KERJA

Document identity:

    SPK

DocumentType:

    WORK_ORDER

Number format:

    SPK/YYYY/MM/NNNNN

Example:

    SPK/2026/09/00001

Meaning:

    Calibration work performed at the CUSTOMER LOCATION.

A separate Surat Jalan Alat will later accompany this work because
standard calibration equipment is transported to the customer.

IMPORTANT:

    Surat Jalan is NOT implemented in this task.

---

B. IN LAB
------------------------------------------------------------

Internal ServiceMode:

    SEND_TO_LAB

User-facing label:

    In Lab

Business document:

    Work Order / Formulir Work Order

Document identity:

    WOL

DocumentType:

    WORK_ORDER_SEND_TO_LAB

Number format:

    WOL/YYYY/MM/NNNNN

Example:

    WOL/2026/09/00001

Meaning:

    Calibration work is performed inside the PKM calibration laboratory.

NO Surat Jalan is required.

---

DO NOT INTRODUCE:

    WOS
    WOI
    WRL
    WORK_ORDER_ON_SITE
    any third Work Order type

SPK is the On Site Work Order.

WOL is the In Lab Work Order.

============================================================

# 1. AUTHORITATIVE PHYSICAL DOCUMENT REFERENCES

============================================================

The business has supplied physical documents that must be treated
as the authoritative reference for the PDF structure and terminology.

There are THREE physical references.

---

REFERENCE 1 — SPK
------------------------------------------------------------

Physical document title:

    SURAT PERINTAH KERJA

The supplied example contains:

- PKM logo
- KAN logo
- header:
  LABORATORIUM KALIBRASI
  PT. PRESISI KALIBRASI MEDIKA
- title:
  SURAT PERINTAH KERJA
- date
- document number
- customer/addressee
- customer address
- PO reference
- technician assignment
- technician name
- technician position
- technician institution
- work location
- work date
- instruction text
- note
- manager/authorized signature
- PKM footer/company address

The actual physical document must be inspected if available.
Do NOT invent missing fields.

---

REFERENCE 2 — SURAT JALAN ALAT
------------------------------------------------------------

Physical document title:

    SURAT JALAN ALAT

This document contains standard calibration equipment such as:

    No
    Nama Alat
    Merk
    S/N

IMPORTANT:

This document is REFERENCE ONLY in this task.

DO NOT implement it now.

Do NOT create:

- Surat Jalan schema
- Surat Jalan number
- Surat Jalan API
- Surat Jalan UI
- Surat Jalan PDF
- equipment transport workflow

The future relationship is:

    ON_SITE
        SPK
        +
        Surat Jalan Alat (future)

    SEND_TO_LAB
        WOL
        no Surat Jalan

---

REFERENCE 3 — IN LAB WORK ORDER FORM
------------------------------------------------------------

Physical document title:

    Work Order

It is a FORMULIR and contains:

- PKM logo
- document code / revision / issue date
- page number
- I. Identitas Pengirim (PIC)
- II. Identitas Kepemilikan Alat dan Sertifikat
- III. Identitas Alat
- No. PO
- Tanggal Terima PO
- Tanggal Terima Alat
- equipment table:
  No
  Nama Alat
  Merk
  Tipe
  No. Seri
- Perlengkapan alat
- Kerusakan Alat
- acknowledgement/signature area
- footer/company address

This is the reference for the IN LAB / WOL document.

Do not assume that SPK and WOL should have identical layouts.

They are two different operational documents.

============================================================

# 2. LOGOS

============================================================

The production portal already contains the official logos:

PKM:

    D:\medcal\apps\portal\public\logo.png

KAN:

    D:\medcal\apps\portal\public\KAN-logo.png

Use these actual files.

Do NOT:

- recreate the logos
- use placeholder logos
- fetch logos from the internet
- create SVG approximations
- embed unrelated logos

Inspect the actual dimensions/aspect ratios before placing them.

============================================================

# 3. FIRST: AUDIT THE EXISTING IMPLEMENTATION

============================================================

Before changing anything, inspect the repository.

Find:

- WorkOrder schema
- CalibrationRequest schema
- ServiceMode
- DocumentType
- DocumentNumberService
- WorkOrdersService
- Work Order controller
- Work Order portal pages
- existing PDF generation implementation
- PDF templates/components
- download/preview endpoints
- authorization/RBAC
- tests

Search specifically for:

    WorkOrder
    WORK_ORDER
    WORK_ORDER_SEND_TO_LAB
    ServiceMode
    SEND_TO_LAB
    DocumentNumberService
    SPK
    WOL
    PDF
    pdf
    report
    document

Do NOT assume the existing architecture.

Follow the repository's existing PDF generation conventions.

============================================================

# 4. NUMBERING MUST REMAIN CORRECT

============================================================

Verify and preserve the already-established numbering behavior.

ON_SITE:

    SPK/2026/08/00001
    SPK/2026/08/00002
    SPK/2026/09/00003

SEND_TO_LAB:

    WOL/2026/08/00001
    WOL/2026/08/00002

Rules:

1. SPK and WOL sequences are independent.
2. Sequence is partitioned by company.
3. Sequence is partitioned by document type.
4. Sequence resets yearly.
5. Month appears in the formatted number.
6. Month DOES NOT reset the sequence.
7. Numeric sequence is 5 digits.
8. No WOS number may ever be generated.
9. No new numbering mechanism should be introduced.

If the existing implementation already satisfies this,
DO NOT redesign it.

============================================================

# 5. WORK ORDER DOCUMENT MAPPING

============================================================

Verify:

    serviceMode === ON_SITE
        -> DocumentType.WORK_ORDER
        -> SPK

    serviceMode === SEND_TO_LAB
        -> DocumentType.WORK_ORDER_SEND_TO_LAB
        -> WOL

The PDF generator must use this same source of truth.

Do NOT infer document type from the prefix.

Do NOT duplicate business logic in the PDF layer.

The WorkOrder/document type already determined by the service layer
must be authoritative.

============================================================

# 6. SPK PDF IMPLEMENTATION

============================================================

Implement the SPK PDF so that it represents the physical:

    SURAT PERINTAH KERJA

Use the physical reference as the visual/layout authority.

Required conceptual sections:

1. Official header
2. PKM logo
3. KAN logo
4. "SURAT PERINTAH KERJA"
5. document date
6. SPK number
7. customer/addressee
8. customer address
9. PO/reference information
10. assigned technician
11. technician position
12. technician institution
13. calibration location
14. calibration date/schedule
15. instruction/body text
16. notes
17. authorized signature
18. footer

Map fields from the existing WorkOrder / related domain entities.

IMPORTANT:

Do not create fake fields merely to make the PDF look complete.

If a field shown in the physical document has no reliable source
in the current domain model:

- identify it explicitly
- do not invent its value
- use the existing system's appropriate fallback only if one exists
- report the mapping gap

Do NOT expand the database schema merely to copy every field from
the physical document unless the field is clearly required by the
existing Work Order business model.

============================================================

# 7. WOL PDF IMPLEMENTATION

============================================================

Implement the WOL PDF separately.

WOL must NOT simply reuse the SPK PDF with the title changed.

Use the physical IN LAB Work Order form as the structural reference.

The document should conceptually contain:

HEADER

    PKM logo
    FORMULIR
    Work Order
    document code
    edition/revision
    issue date
    page information

SECTION I

    Identitas Pengirim (PIC)

SECTION II

    Identitas Kepemilikan Alat dan Sertifikat

SECTION III

    Identitas Alat

Then the equipment table:

    No
    Nama Alat
    Merk
    Tipe
    No. Seri

Then:

    Perlengkapan alat
    Kerusakan Alat

Then acknowledgement/signature section.

Then official footer.

Again:

DO NOT invent database fields.

Use the actual WorkOrder and related entities.

If the current domain model cannot populate a physical-document field,
report it as an explicit mapping gap.

============================================================

# 8. PDF LAYOUT QUALITY

============================================================

The PDF is an operational document.

It must be print-ready.

Requirements:

- A4 paper
- proper margins
- no clipped content
- no overlapping content
- readable typography
- consistent table borders
- proper page breaks
- stable header/footer
- proper logo aspect ratio
- signature area must remain intact
- long customer names/addresses must wrap safely
- long equipment names must wrap safely
- multiple equipment rows must flow correctly
- multi-page documents must repeat appropriate table headers
- page numbering must be correct where applicable

Do NOT merely generate a technically valid PDF.

It must be usable as an actual PKM operational document.

============================================================

# 9. PDF GENERATION ARCHITECTURE

============================================================

Before implementing, inspect the existing PDF architecture.

If the project already has:

- PDF components
- PDF renderer
- PDF templates
- shared document utilities

reuse them.

Do NOT introduce a second PDF framework unless absolutely necessary.

Follow existing conventions.

Keep the PDF generation layer separated from business logic.

The PDF layer should consume a prepared WorkOrder view/model.

Do not put database mutations inside PDF generation.

============================================================

# 10. DOCUMENT DATA ORDER

============================================================

Where equipment/calibration data is shown in the PDF, use the
authoritative ordering already established in the system.

For equipment requirements:

    DeviceTypeEquipmentRequirement.sortOrder

For calibration capabilities:

    DeviceTypeCapabilityOrder.sortOrder

For calibration parameters:

    DeviceCalibrationParameter.sortOrder

Do NOT sort alphabetically unless the business rule explicitly
requires it.

The future worksheet/PDF must reproduce the manually controlled
worksheet sequence.

============================================================

# 11. UI

============================================================

Audit the existing Work Order UI.

User-facing terminology:

ON_SITE:

    On Site

SEND_TO_LAB:

    In Lab

Document identity:

ON_SITE:

    SPK

SEND_TO_LAB:

    WOL

Do NOT expose:

    WOS
    Send to Lab
    Work Order On Site

unless it is strictly internal code.

Do NOT change unrelated UI.

============================================================

# 12. SERVICE MODE IMMUTABILITY

============================================================

A created WorkOrder's serviceMode must not be editable.

Reason:

serviceMode determines:

    ON_SITE -> SPK
    SEND_TO_LAB -> WOL

Changing it after creation would change the document identity.

Do not alter unrelated WorkOrder update behavior.

============================================================

# 13. SURAT JALAN — STRICTLY OUT OF SCOPE

============================================================

DO NOT implement Surat Jalan.

Do NOT create:

- schema
- migration
- API
- UI
- PDF
- numbering
- equipment selection
- technician transport workflow
- printing workflow

The only accepted change related to Surat Jalan is documentation/comments
if needed to clarify that:

    ON_SITE / SPK -> Surat Jalan later

    SEND_TO_LAB / WOL -> no Surat Jalan

STOP there.

============================================================

# 14. TESTING

============================================================

Test the actual implementation.

At minimum verify:

### Numbering

- ON_SITE -> SPK
- SEND_TO_LAB -> WOL
- independent sequences
- yearly reset
- month does not reset
- 5-digit sequence
- company isolation
- no WOS

### PDF

Generate at least:

1. representative ON_SITE WorkOrder PDF
2. representative SEND_TO_LAB WorkOrder PDF

Verify:

- file is generated
- PDF opens
- correct document type
- correct document number
- correct customer
- correct mode
- correct title
- correct logo
- correct page size
- no obvious layout overflow
- equipment rows render correctly
- multi-page behavior if applicable

If PDF snapshots/tests already exist, extend them.

If no PDF test exists, add the smallest focused test possible.

============================================================

# 15. DEVELOPMENT DATABASE SAFETY

============================================================

This is a LOCAL DEVELOPMENT environment.

Use:

    D:\medcal\.env

DATABASE_URL is the development database.

DO NOT use:

    TEST_DATABASE_URL
    pkmdb_test
    prepare-test-db

DO NOT truncate the development database.

DO NOT run destructive database resets.

Do not print database credentials.

If a test harness automatically invokes prepare-test-db,
do not use that harness blindly.

Use the smallest focused test execution necessary.

Clean up only temporary records created specifically by this task.

Do not modify existing development data.

============================================================

# 16. MIGRATION SAFETY

============================================================

Before creating migrations, inspect the current schema and migration state.

If the required schema already exists:

    DO NOT create another migration.

If a migration is genuinely required:

- create the smallest additive migration
- do not modify unrelated tables
- do not rewrite existing migrations
- do not delete data
- do not rename existing fields unless explicitly required

============================================================

# 17. STRICT SCOPE

============================================================

DO NOT modify:

- Device
- DeviceType
- DeviceTypeAlias
- EquipmentType
- EquipmentRequirement
- DeviceCalibrationParameter
- DeviceTypeCapabilityOrder
- Price List
- Quotation
- Requisition
- Purchase Order
- CalibrationJob
- unrelated RBAC
- unrelated WorkOrder business rules
- state machine
- technician equipment workflow
- Surat Jalan

unless required solely to make the Work Order PDF compile or consume
already-existing data.

Do not refactor unrelated code.

============================================================

# 18. REQUIRED IMPLEMENTATION PROCESS

============================================================

Follow this exact sequence:

STEP 1
Audit repository and existing Work Order implementation.

STEP 2
Audit existing PDF architecture.

STEP 3
Map physical SPK fields to existing domain fields.

STEP 4
Map physical WOL fields to existing domain fields.

STEP 5
Identify genuine data gaps.

STEP 6
Implement SPK PDF.

STEP 7
Implement WOL PDF.

STEP 8
Connect both PDFs to the existing WorkOrder document flow.

STEP 9
Verify numbering/document type mapping.

STEP 10
Verify UI terminology.

STEP 11
Run typecheck.

STEP 12
Run focused tests.

STEP 13
Generate representative PDFs.

STEP 14
Inspect generated PDFs for layout correctness.

STEP 15
Fix issues found during verification.

STEP 16
Run final typecheck/build/tests.

Do NOT stop after STEP 1.

============================================================

# 19. ACCEPTANCE CRITERIA

============================================================

The task is DONE only when ALL are true:

[ ] ON_SITE produces SPK.

[ ] SEND_TO_LAB produces WOL.

[ ] No WOS exists.

[ ] SPK/WOL numbering rules pass.

[ ] SPK PDF is actually generated.

[ ] WOL PDF is actually generated.

[ ] SPK follows the supplied physical SPK structure.

[ ] WOL follows the supplied physical Work Order structure.

[ ] Official PKM logo is used.

[ ] Official KAN logo is used.

[ ] A4 print layout works.

[ ] Long text does not break layout.

[ ] Equipment tables render correctly.

[ ] Existing ordering fields are respected.

[ ] User-facing labels are "On Site" and "In Lab".

[ ] serviceMode cannot be changed after WorkOrder creation.

[ ] No Surat Jalan implementation was made.

[ ] No unrelated business logic was changed.

[ ] Typecheck passes.

[ ] Build passes.

[ ] Focused tests pass.

[ ] Representative PDFs were generated and inspected.

============================================================

# 20. FINAL REPORT — MANDATORY

============================================================

At the end, provide a concise but complete report:

## FINAL VERDICT

PASS / PASS WITH KNOWN GAPS / FAIL

## Work Order Mapping

ON_SITE
-> SPK
-> WORK_ORDER

SEND_TO_LAB
-> WOL
-> WORK_ORDER_SEND_TO_LAB

## PDF

SPK:
implemented / not implemented

WOL:
implemented / not implemented

## Physical Template Mapping

List which physical-document fields were successfully mapped.

List any fields that could not be mapped because the domain model
does not currently contain the required information.

Do not hide mapping gaps.

## Files Changed

List every changed/new file.

## Database

State explicitly:

- schema changed? yes/no
- migration created? yes/no
- data changed? yes/no

## Tests

Report exact commands and results.

## PDF Verification

Report:

- SPK generated?
- WOL generated?
- A4?
- logos?
- page count?
- layout issues?
- table overflow?
- long text behavior?

## OUT OF SCOPE

Explicitly confirm:

    Surat Jalan was NOT implemented.

Future relationship:

    ON_SITE -> SPK -> Surat Jalan later
    SEND_TO_LAB -> WOL -> no Surat Jalan

Do not claim DONE if any acceptance criterion above is false.
