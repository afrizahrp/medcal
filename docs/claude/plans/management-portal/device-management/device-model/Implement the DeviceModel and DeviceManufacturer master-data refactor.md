Implement the DeviceModel / DeviceManufacturer master-data refactor based on the completed audit:

docs/claude/plans/management-portal/device-management/device-model/audit-report-device-model-device-manufacturer-independent-masters.md

The audit phase is complete. Proceed directly with implementation.

==================================================
LOCKED BUSINESS RULES
==================================================

1. DeviceType is an independent master.
2. DeviceManufacturer is an independent master.
3. DeviceModel is independent from DeviceType.
4. DeviceModel MUST NOT have a relation to DeviceType.
5. DeviceModel belongs to DeviceManufacturer.
6. The same model name MAY exist across different manufacturers.
7. The same model name MUST NOT be duplicated under the same manufacturer.

Example:

Manufacturer | Model
Philips      | MX-100   -> valid
GE           | MX-100   -> valid
Philips      | MX-100   -> invalid duplicate

Therefore:

@@unique([manufacturerId, model])

DeviceType MUST NOT be part of DeviceModel uniqueness.

Do NOT introduce a Device -> DeviceModel relation in this task.

==================================================
IDENTIFIERS / HUMAN-READABLE CODES
==================================================

Both DeviceManufacturer and DeviceModel must have two separate identifiers:

1. id
   - Technical database identity.
   - Keep using CUID.
   - Must not be used as a human-readable identifier.
   - Must not be displayed as the primary identifier in the UI.

2. code
   - Human-readable business/display identifier.
   - String field.
   - UNIQUE at database level.
   - Must be generated automatically for newly created records.
   - Must be stable and independent from name/model changes.
   - Do NOT derive the code from the manufacturer name or model name.

Target schema concept:

DeviceManufacturer:
- id        String @id @default(cuid())
- code      String @unique
- name      String
- description
- isActive
- createdAt
- updatedAt

DeviceModel:
- id             String @id @default(cuid())
- code           String @unique
- manufacturerId String
- model          String
- description
- isActive
- createdAt
- updatedAt

DeviceModel:
@@unique([manufacturerId, model])

The exact code format may follow the existing project conventions if such a convention exists.

If there is no existing convention, use a simple stable format such as:

MFR-000001
MFR-000002
...

MOD-000001
MOD-000002
...

IMPORTANT:
- Do not use name/model as the code.
- Do not use code as a foreign key.
- All relationships must continue to use the CUID id.
- Code generation must be safe under concurrent creation and must not produce duplicate codes.
- Seed/import operations must also respect the same uniqueness and code rules.

==================================================
A. DATABASE / PRISMA
==================================================

1. Add DeviceManufacturer master.

2. Refactor DeviceModel:
   - remove deviceTypeId
   - remove the DeviceType relation
   - add manufacturerId
   - add DeviceManufacturer relation
   - add code
   - replace the old unique constraint with:
     @@unique([manufacturerId, model])
   - add appropriate indexes following existing master patterns

3. DeviceManufacturer:
   - add code with UNIQUE constraint
   - define appropriate indexes following existing master patterns

4. Remove the DeviceType <-> DeviceModel relation completely.

5. Create a safe migration for existing DeviceModel data:
   - create DeviceManufacturer records from existing manufacturer values
   - deduplicate manufacturer values according to the existing case-insensitive business behavior
   - generate codes for imported manufacturers
   - backfill manufacturerId
   - generate stable codes for existing DeviceModel rows
   - preserve existing DeviceModel IDs
   - verify all existing DeviceModel rows have a valid manufacturerId and code
   - only then make manufacturerId/code required
   - remove obsolete deviceTypeId/manufacturer fields and old constraints/indexes

The existing DeviceModel -> DeviceType association is intentionally being removed.
Do not preserve it through another indirect relation.

6. Do NOT introduce Device -> DeviceModel relation.

==================================================
B. CODE GENERATION
==================================================

Implement code generation in the appropriate backend/service layer following existing project conventions.

Requirements:

- Automatically generate the next human-readable code for new records.
- Must be safe for concurrent inserts.
- Must rely on database-level uniqueness as the final protection.
- Must not use a naive "count rows + 1" implementation.
- Deleted records must not cause accidental code reuse unless existing project conventions explicitly require reuse.
- Code generation must work for both normal user-created records and seed/import operations.
- Existing codes from migration/seed must remain stable.

If the project already contains a reusable numbering/sequence/code-generation mechanism, reuse it rather than introducing a second pattern.

If no suitable mechanism exists, implement the smallest reusable mechanism appropriate for these masters.

==================================================
C. BACKEND
==================================================

Implement DeviceManufacturer as a proper master module following existing UOM/DeviceType conventions:

- module/service/controller
- CRUD behavior
- validation
- pagination
- pageSize
- search
- sorting
- active/inactive filtering
- RBAC / permissions
- tests

Refactor DeviceModel backend:

- manufacturerId instead of free-text manufacturer
- no deviceTypeId
- code support
- manufacturer relation
- uniqueness based on manufacturerId + model
- same model across different manufacturers allowed
- same model under same manufacturer rejected
- search manufacturer name + model + code where appropriate
- update validation
- update response DTOs
- update tests

Search/uniqueness behavior must remain consistent with the existing case-insensitive conventions.

Also inspect and update any DeviceType deletion guard/tests that currently reference DeviceModel through deviceTypeId.
That dependency must no longer exist.

==================================================
D. FRONTEND / MANAGEMENT PORTAL
==================================================

Add DeviceManufacturer management UI following existing master-data UX:

- list
- create
- detail/edit
- pagination
- page size options consistent with existing masters
- URL-synchronized pagination/search/filter state
- 500ms search debounce
- Active / Inactive / All filter
- status badge
- loading / empty / error states
- RBAC-aware UI
- query hooks and mutation invalidation consistent with existing patterns

Display the human-readable code where appropriate.

Do NOT expose the raw CUID as the primary user-facing identifier.

Refactor DeviceModel UI:

- remove DeviceType selector/filter completely
- replace free-text Manufacturer input with DeviceManufacturer selection
- manufacturer comes from DeviceManufacturer master
- display human-readable code where appropriate
- update list/detail/form/query hooks/types
- update search placeholder/text so it no longer refers to Device Name
- preserve existing master-data UX patterns

==================================================
E. RBAC / ACCESS CONTROL
==================================================

Add DeviceManufacturer wherever required by the existing RBAC architecture:

- access-control resource definitions
- permission catalog
- role-permission seed/configuration
- /me capability exposure if applicable
- management menu/resource visibility
- permission-management labels
- frontend authorization checks

Refactor DeviceModel permissions only where required.

Do not invent a new authorization pattern.

==================================================
F. SEED / HISTORICAL DATA IMPORT
==================================================

The historical Excel data will be imported separately after the master implementation.

The source contains manufacturer and model/type values.

Prepare the implementation so that the later seed/import can:

1. Create/deduplicate DeviceManufacturer from manufacturer values.
2. Create DeviceModel under the correct manufacturer.
3. Allow the same model under different manufacturers.
4. Reject/merge duplicate manufacturer + model combinations according to the locked uniqueness rule.
5. Generate codes automatically for imported records.
6. Keep generated codes stable after import.

Do NOT hardcode the Excel data into the application unless explicitly requested as a separate task.

==================================================
G. TESTS
==================================================

Add/update tests for DeviceManufacturer:

- create
- update
- list
- search
- pagination
- active/inactive
- authorization
- validation
- automatic code generation
- concurrent/safe code uniqueness where practical

DeviceModel:

- create with manufacturer
- update manufacturer/model
- automatic code generation
- same model across different manufacturers = allowed
- same model under same manufacturer = rejected
- case-insensitive uniqueness behavior consistent with existing conventions
- DeviceType is not involved
- search by manufacturer/model/code
- active/inactive
- pagination
- authorization

Also update DeviceType tests affected by removal of the DeviceModel dependency.

==================================================
H. REPOSITORY-WIDE VERIFICATION
==================================================

Before finishing:

1. Run relevant backend tests.
2. Run relevant frontend tests.
3. Run typecheck.
4. Run lint for affected packages.
5. Run Prisma validation/generate/migration checks.
6. Search the entire repository for stale DeviceModel references to:
   - deviceTypeId
   - DeviceType relation
   - old manufacturer string assumptions
7. Search for DeviceManufacturer references that should exist but are missing:
   - RBAC
   - menu
   - permission management
   - API
   - frontend
8. Verify no UI exposes raw CUIDs as the human-readable identifier.
9. Verify all code fields have database-level uniqueness.

==================================================
CONSTRAINTS
==================================================

- Do not perform unrelated refactors.
- Do not change Device business flow.
- Do not introduce Device -> DeviceModel relation.
- Do not reintroduce DeviceType dependency into DeviceModel.
- Do not make Model globally unique.
- Do not use name/model as primary key.
- Do not use code as a foreign key.
- Do not implement code generation using "COUNT(*) + 1".
- Do not invent a new UX pattern when an existing master-data pattern can be reused.
- Do not import the historical Excel data as part of this task unless explicitly instructed.

At the end, provide:

1. implementation summary
2. files/modules changed
3. final Prisma schema relevant to DeviceManufacturer and DeviceModel
4. migration/data handling summary
5. code-generation mechanism and concurrency safety explanation
6. tests/checks executed and results
7. any remaining issue or intentional limitation

Proceed with implementation.
No additional audit/planning phase is necessary unless an actual blocking ambiguity is discovered.