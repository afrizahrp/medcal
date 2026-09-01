AUDIT ONLY — SURAT JALAN ALAT / DELIVERY NOTE
================================================

DO NOT IMPLEMENT ANYTHING YET.

We are ready to implement the PKM "Surat Jalan Alat" (Delivery Note), but before any schema/API/UI/PDF changes, perform a complete architecture + business-rule audit.

The audit must determine exactly what already exists, what can be reused, what is missing, and what must be added.

The physical hard-copy documents provided by the business are the source of truth for the operational purpose and document content.

================================================
LOCKED BUSINESS DECISIONS
================================================

1. WORK ORDER MODES

ON_SITE

- Customer's equipment is calibrated at the customer's location.
- Uses existing SPK document.
- SPK remains the ON_SITE Work Order document.
- ON_SITE does NOT use WOS.

IN_LAB

- Customer's equipment is sent/brought to PKM laboratory.
- Uses WOL document.
- No Surat Jalan Alat is required for transporting PKM calibration equipment to customer because the calibration work happens inside PKM lab.

Therefore:

ON_SITE
SPK
└── Surat Jalan Alat / Delivery Note

IN_LAB
WOL
└── no Surat Jalan Alat

================================================ 2. SURAT JALAN TERMINOLOGY
================================================

Business/UI document name:

SURAT JALAN ALAT

English conceptual name:

Equipment Delivery Note

Internal candidate DocumentType:

EQUIPMENT_DELIVERY_NOTE

Candidate prefix:

DLN

Candidate number format:

DLN/YYYY/MM/NNNNN

Example:

DLN/2026/09/00001

IMPORTANT:

Treat EQUIPMENT_DELIVERY_NOTE / DLN as the CURRENT RECOMMENDATION, not an already-implemented locked schema decision.

The audit must verify whether this fits the existing DocumentType / DocumentNumberService architecture.

Do NOT create or modify it yet.

================================================ 3. HARD-COPY SOURCE OF TRUTH
================================================

The attached hard-copy PKM documents show the actual operational documents currently used.

There are three relevant documents:

A. SURAT PERINTAH KERJA

Example:

Nomor: 34-SPK-PKM-2026

Purpose:

- authorizes technician to perform calibration work at customer location.

B. SURAT JALAN ALAT

Purpose:

- accompanies standard calibration equipment carried by the technician to the customer location.

Example equipment:

No | Nama Alat | Merk | S/N
1 | ESA | Fluke Biomedical | 6579027
2 | Thermohygro | Taffware | TH-03
3 | Thermometer 12 Channel | Lutron | 1.638524

The document states that these standard equipment are used for the calibration activity at the customer location.

C. WORK ORDER FORM

This is a separate customer/equipment-related form containing:

- customer/PIC
- customer address
- PO
- equipment identity
- equipment name
- brand
- type
- serial number
- equipment accessories
- condition/damage information

IMPORTANT:

Do NOT assume these three documents represent the same data entity.

Audit their relationships.

================================================ 4. ASSETS
================================================

Existing public assets:

PKM logo:
D:\medcal\apps\portal\public\logo.png

KAN logo:
D:\medcal\apps\portal\public\KAN-logo.png

Inspect existing PDF/document generation infrastructure and determine how these assets should be consumed.

Do NOT generate the PDF yet.

================================================ 5. PRIMARY AUDIT QUESTION
================================================

Determine:

WHAT DATA SHOULD POPULATE THE SURAT JALAN ALAT?

This is the most important part of the audit.

The existing Equipment Requirements module defines which equipment types are required for a DeviceType.

For example:

DeviceType:
Bed Side Monitor

Equipment Requirements:

- Electrical Safety Analyzer
- Thermohygrometer
- Vital Signs Simulator

But the physical Surat Jalan requires actual equipment identity:

- Nama Alat
- Merk
- Type/model if applicable
- Serial Number

Example:

ESA
Fluke Biomedical
6579027

Therefore distinguish carefully between:

A. Equipment Requirement / template

versus

B. Actual PKM equipment/instrument inventory

The Surat Jalan must ultimately represent actual equipment carried by the technician, not merely generic EquipmentType requirements.

Determine whether the current data model already has an appropriate entity for actual calibration/reference equipment.

================================================ 6. AUDIT CURRENT WORK ORDER ARCHITECTURE
================================================

Trace the existing implementation end-to-end:

Calibration Request
→ Quotation
→ Work Order
→ SPK / WOL
→ Calibration Job
→ Device / Equipment
→ Equipment Requirements
→ actual calibration equipment/reference equipment

Determine:

- existing Prisma models
- relationships
- IDs
- service mode
- WorkOrder status
- technician assignment
- scheduled date
- customer
- location
- quotation
- PO
- calibration jobs
- device identity
- equipment requirements
- actual reference equipment/instruments

Do not assume relationships that are not present in the code.

================================================ 7. DOCUMENT NUMBERING AUDIT
================================================

Inspect:

DocumentType
DocumentNumberService
DocumentNumberSequence
existing SPK numbering
existing WOL numbering

Verify:

- how document prefixes are defined;
- how sequences are partitioned;
- whether year/month are display-only or sequence-reset boundaries;
- whether a new DLN series can be added cleanly;
- whether DLN should have an independent sequence;
- whether numbering must be tied to company/documentType/year;
- whether monthly reset is supported or not.

Expected candidate:

SPK/2026/09/00002
WOL/2026/09/00002
DLN/2026/09/00001

But this is a proposal to validate, NOT an implementation instruction.

Do not change numbering yet.

================================================ 8. DOCUMENT RELATIONSHIP AUDIT
================================================

Determine the correct cardinality.

Candidate:

SPK
└── 1 Surat Jalan Alat

But do NOT assume this is correct.

Audit whether:

- one SPK can have multiple Surat Jalan;
- a Surat Jalan can be regenerated;
- a Surat Jalan can be reissued;
- a Surat Jalan can be cancelled;
- a Surat Jalan is immutable after issuance;
- a Surat Jalan should be generated before technician departure;
- a Surat Jalan should exist before or after technician assignment.

Clearly identify the business decisions that remain open.

================================================ 9. SURAT JALAN CONTENT AUDIT
================================================

Map every field visible in the hard copy to existing system data.

At minimum investigate:

HEADER:

- company identity
- PKM logo
- KAN logo
- document title
- document number
- date
- customer
- location
- reference to calibration activity / SPK

BODY:

- sequence number
- equipment name
- brand
- type/model
- serial number

FOOTER:

- usage date / period
- statement
- authorized person
- signature
- company identity

For every field classify:

EXISTS

- existing source can provide it.

DERIVABLE

- can be safely derived from existing data.

MISSING

- no current source.

AMBIGUOUS

- multiple possible sources or business meaning unclear.

DO NOT invent values.

================================================ 10. PDF ARCHITECTURE AUDIT
================================================

Inspect the repository for:

- existing PDF generators;
- document rendering utilities;
- templates;
- fonts;
- page layouts;
- headers/footers;
- logo handling;
- signature handling;
- print/download behavior.

Determine whether the current PDF architecture can support Surat Jalan without introducing a new document-generation architecture.

The eventual PDF must reproduce the operational meaning of the hard-copy document.

DO NOT implement the PDF during this audit.

================================================ 11. UI / LIFECYCLE AUDIT
================================================

Determine where the user should eventually:

- create Surat Jalan;
- view Surat Jalan;
- print/download Surat Jalan;
- regenerate/reprint it;
- see its number;
- see its relationship to SPK.

Determine whether it belongs:

- inside Work Order detail;
- as a separate document;
- as an action on SPK;
- somewhere else.

Do not implement UI yet.

================================================ 12. TECHNICIAN WORKFLOW AUDIT
================================================

Model the expected operational flow:

1. ON_SITE Work Order is created.
2. SPK exists.
3. Technician is assigned.
4. System determines required calibration/reference equipment.
5. Actual equipment to be carried is selected/confirmed.
6. Surat Jalan Alat is generated.
7. Technician carries the document + equipment to customer.
8. Equipment is used during calibration.
9. Work is completed.
10. Equipment returns to PKM.

Determine which steps are already supported and which are missing.

IMPORTANT:

Do not add inventory/asset-management functionality merely because it would be useful.

Only identify gaps.

================================================ 13. DO NOT CONFUSE CUSTOMER EQUIPMENT WITH PKM EQUIPMENT
================================================

This distinction is critical.

CUSTOMER EQUIPMENT:

Example:

- Centrifuge
- Patient Monitor
- Autoclave

This is the equipment being calibrated.

PKM REFERENCE / STANDARD EQUIPMENT:

Example:

- ESA
- Thermohygrometer
- Thermometer
- Multimeter
- etc.

This is equipment carried by PKM technician.

The Surat Jalan Alat concerns the SECOND category.

Do not design it around the customer's equipment list.

================================================ 14. STRICT SCOPE
================================================

This is an AUDIT ONLY.

DO NOT:

- modify Prisma schema;
- create migrations;
- add DocumentType;
- add DLN prefix;
- change DocumentNumberService;
- modify Work Order;
- modify SPK;
- modify WOL;
- modify Equipment Requirements;
- modify Calibration Parameters;
- modify quotation;
- modify requisition;
- create PDF;
- modify UI;
- create new API;
- modify database records.

No implementation changes are allowed.

================================================ 15. REQUIRED OUTPUT
================================================

Return a structured audit report:

# SURAT JALAN ALAT — IMPLEMENTATION READINESS AUDIT

## 1. Executive Summary

Is the system ready to implement Surat Jalan?

## 2. Current Architecture

Show the existing relevant entities and relationships.

## 3. Current Work Order Flow

Show:

CR → Quotation → WO → SPK/WOL → Calibration

## 4. Equipment Data Flow

Clearly distinguish:

Customer Equipment
vs
PKM Reference Equipment
vs
Equipment Requirements

## 5. Hard-Copy Field Mapping

Table:

| Hard-copy field | Existing source | Status | Notes |
| --------------- | --------------- | ------ | ----- |

## 6. Document Numbering

Explain current architecture and whether:

EQUIPMENT_DELIVERY_NOTE
DLN
DLN/YYYY/MM/NNNNN

fits cleanly.

## 7. Document Relationship

Recommend:

SPK → Surat Jalan

and explain cardinality.

## 8. Lifecycle

Propose the minimum lifecycle required, clearly separating existing behavior from recommendations.

## 9. PDF Architecture

Existing PDF infrastructure and reuse opportunities.

## 10. UI Placement

Recommended location and workflow.

## 11. Missing Data / Blockers

List every actual blocker.

## 12. Open Business Decisions

Only decisions that genuinely cannot be derived from the code or hard-copy reference.

## 13. Minimal Implementation Plan

Break into logical phases:

- data/schema
- numbering
- API
- UI
- PDF
- tests

## 14. Scope Protection

Explicitly state what must NOT be changed.

================================================
FINAL RULE
================================================

AUDIT FIRST.

NO CODE CHANGES.

NO DATABASE CHANGES.

NO MIGRATIONS.

NO PDF IMPLEMENTATION.

NO UI IMPLEMENTATION.

Do not fill business gaps with assumptions.

If the repository does not contain enough information, explicitly say:

"OPEN BUSINESS DECISION"

and explain exactly what decision is needed.
