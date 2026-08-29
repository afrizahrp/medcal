MEDCAL — REQUIREMENT & ARCHITECTURE AUDIT
Requisition Device ID + Device Type Alias + Excel Import

Context:
We are preparing the next phase of MEDCAL, specifically around the Requisition flow before moving to Price List / Quotation.

Do NOT implement anything yet.
Do NOT modify schema, migration, API, UI, seed, RBAC, or data.

This is an AUDIT / DESIGN REVIEW ONLY.

The purpose is to validate whether the business requirements below fit the current architecture and Prisma schema, and to identify gaps or risks before implementation.

==================================================

1. BUSINESS REQUIREMENTS
   \==================================================

A. DEVICE ID

Customer may provide a Device ID / inventory ID for equipment to be calibrated.

However, not every clinic/hospital provides a Device ID.

Therefore:

- Device ID must be optional / nullable.
- Do NOT use a fake default such as "000".
- A missing Device ID must be a valid business state.
- The system should be able to represent:

  Device ID = NULL

  rather than pretending that "000" is an actual identifier.

Audit whether the current Requisition / Requisition Device schema supports this correctly.

Also check downstream implications:

- CalibrationJob
- Device
- certificate / report
- technician workflow
- traceability / audit

Do not assume that Device ID must correspond to the internal MEDCAL Device.id unless the existing architecture proves this.

================================================== 2. CUSTOMER DEVICE NAME vs MEDCAL DEVICE TYPE
==================================================

Important business case:

MEDCAL master:

DeviceType
Name = "Sphygmomanometer"

Customer may write:

"Tensimeter"

or:

"Tensimeter Digital"

or:

"Blood Pressure Monitor"

These may refer to the same MEDCAL DeviceType.

We do NOT want to rename the master DeviceType simply because customers use different terminology.

Proposed concept:

DeviceType
└── DeviceTypeAlias[]

Example:

Sphygmomanometer
├── Tensimeter
├── Tensimeter Digital
└── Blood Pressure Monitor

The purpose of aliases is primarily:

- customer terminology
- search
- Excel import matching
- reducing manual mapping
- preserving the official MEDCAL DeviceType name

IMPORTANT:
Do NOT assume DeviceTypeAlias is automatically the correct design.
Audit whether it is actually the best solution.

Consider alternatives if appropriate, but keep the solution simple.

================================================== 3. PRESERVE CUSTOMER'S ORIGINAL NAME
==================================================

When a customer submits:

"Tensimeter Digital"

the Requisition should ideally preserve the original customer wording.

Example:

Requisition Device

customerDeviceName:
"Tensimeter Digital"

matchedDeviceType:
Sphygmomanometer

This distinction is important for traceability.

We need to determine whether the current schema already has a suitable field for the customer's original device name.

If it does not exist, identify the minimal schema change required.

Do NOT implement it yet.

================================================== 4. EXCEL IMPORT
==================================================

The Requisition should eventually support adding devices through:

A. Manual "Add Device"
B. Excel import

Initial Excel format:

| Nama Alat | Model | Qty | Device ID |
| --------- | ----- | --- | --------- |

Examples:

Tensimeter | AB-123 | 5 | -
Bed Side Monitor | BSM-501 | 3 | BSM001
Dental Unit | DU-100 | 2 | -

Requirements:

- Nama Alat is required.
- Model may need to be optional depending on current business rules.
- Qty is required and must be positive.
- Device ID is optional.
- Empty Device ID must remain NULL.
- Original customer name should not be lost.
- Excel import must NOT silently assign the wrong DeviceType.

Proposed matching sequence:

1. Exact match against DeviceType.name
2. Exact match against DeviceTypeAlias.alias
3. If no confident match:
   → mark as unmatched
   → require user confirmation / mapping

Potential fuzzy matching may be used only as assistance.

It must NOT silently commit an uncertain match.

Audit whether this flow fits the current architecture.

================================================== 5. IMPORTANT QUESTION: WHAT DOES ONE EXCEL ROW MEAN?
==================================================

Example:

Tensimeter | AB-123 | Qty 5 | blank

We need to determine whether this should become:

Option A:

One Requisition Device row:
customerDeviceName = Tensimeter
model = AB-123
qty = 5

OR:

Option B:

Five individual Requisition Device rows.

Do NOT choose arbitrarily.

Inspect the current schema and downstream workflow:

Requisition
→ Quotation
→ Work Order
→ CalibrationJob

Determine which interpretation fits the existing domain model better.

If the current architecture does not provide enough evidence, flag this explicitly as a business decision.

================================================== 6. AUDIT CURRENT PRISMA SCHEMA
==================================================

Inspect the actual current Prisma schema, especially:

- DeviceType
- Device
- Requisition
- RequisitionDevice / equivalent model
- Quotation
- QuotationItem
- WorkOrder
- CalibrationJob
- DeviceCalibrationParameter
- DeviceTypeEquipmentRequirement
- Equipment
- EquipmentType
- any existing alias-like master patterns

Also inspect existing migrations if necessary.

We specifically want to know:

1. Is customerDeviceName already represented?
2. Is Device ID currently nullable?
3. Does Requisition already support qty?
4. Does the current Requisition model represent individual devices or requested quantities?
5. How is DeviceType referenced?
6. Is there already an alias/synonym pattern elsewhere in the schema?
7. Would DeviceTypeAlias be a clean additive model?
8. Are there uniqueness / company-scope considerations?
9. Would aliases create ambiguity?
10. What happens if two DeviceTypes have the same alias?

================================================== 7. AUDIT EXISTING UI / API
==================================================

Inspect the existing Requisition implementation.

Specifically review:

- create requisition UI
- Add Device flow
- API DTOs
- validation
- company scoping
- RBAC
- current DeviceType selector
- existing search/select components
- current pagination/list patterns
- existing Excel import functionality elsewhere in MEDCAL

Determine whether the future Excel import can reuse existing infrastructure/patterns.

Do not implement.

================================================== 8. TRACEABILITY / AUDIT CONSIDERATION
==================================================

MEDCAL must preserve enough information to answer questions such as:

"What exactly did the customer submit?"

"What MEDCAL DeviceType did the system map it to?"

"Why was this customer terminology mapped to that DeviceType?"

Therefore evaluate whether the architecture should preserve:

Customer input:
"Tensimeter Digital"

Mapping:
DeviceType = Sphygmomanometer

Potentially:
matchedBy = EXACT_NAME / ALIAS / USER_MAPPING

Do NOT automatically add these fields.

First determine whether they are actually necessary or whether existing data is sufficient.

Keep the design minimal.

================================================== 9. COMPANY / MASTER DATA SCOPE
==================================================

Audit whether DeviceType is global or company-scoped.

If DeviceType is global, determine how aliases should be scoped.

Potential design:

DeviceType
└── DeviceTypeAlias

with appropriate uniqueness.

Consider:

- duplicate aliases
- case sensitivity
- active/inactive aliases
- whether the same alias can legitimately map to multiple DeviceTypes

Do not implement until the recommendation is approved.

================================================== 10. REQUIRED OUTPUT
==================================================

Write an audit report:

docs/claude/plans/.../implementation_report_requisition_device_alias_audit.md

The report must contain:

1. Current architecture
2. Current Prisma schema findings
3. Current Requisition → Quotation → Work Order flow
4. Device ID findings
5. Customer device name findings
6. DeviceType alias findings
7. Excel import findings
8. Qty interpretation findings
9. Traceability / audit findings
10. Risks / ambiguities
11. Recommended minimal architecture
12. Proposed schema changes (DESIGN ONLY)
13. Proposed API changes (DESIGN ONLY)
14. Proposed UI flow (DESIGN ONLY)
15. Open business decisions

================================================== 11. VERY IMPORTANT — NO IMPLEMENTATION
==================================================

This is strictly an AUDIT.

DO NOT:

- modify schema.prisma
- create migration
- modify API
- modify UI
- modify seed
- modify RBAC
- modify database
- modify existing Requisition behavior
- create DeviceTypeAlias
- create Excel importer

Only inspect and report.

At the end, give a concise recommendation:

A. What should be implemented
B. What should NOT be implemented
C. What business decisions still need confirmation
D. Whether DeviceTypeAlias is recommended
E. Whether customerDeviceName should be stored separately
F. Whether Device ID should remain nullable
G. How Qty should be represented

The goal is NOT to design a sophisticated master-data system.

The goal is a simple, reliable MEDCAL workflow:

Customer terminology
↓
Requisition
↓
safe DeviceType matching
↓
Quotation
↓
Work Order
↓
Calibration Job

with no silent loss of customer information and no unsafe automatic mapping.
