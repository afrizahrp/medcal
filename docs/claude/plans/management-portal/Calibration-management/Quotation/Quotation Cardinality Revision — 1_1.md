# Quotation Cardinality Revision: CalibrationRequest 1:1 Quotation

## MODE

**IMPLEMENTATION MODE — surgical revision only**

The Quotation backend module has already been implemented and verified:

- 31/31 Quotation service tests passing
- shared typecheck passing
- API typecheck passing
- API build passing
- no Prisma migration was previously required

This task is **NOT a new Quotation implementation**.

Your task is to make one specific domain correction:

> **For MVP, one `CalibrationRequest` may have exactly one `Quotation`.**

The current implementation follows a `1:N` relation because the existing schema/planning allowed quotation revisions as separate Quotation records.

We are deliberately removing that complexity from the MVP.

---

# 1. TARGET DOMAIN CONTRACT

Change the effective relationship from:

```text
CalibrationRequest 1 ─── N Quotation
```

to:

```text
CalibrationRequest 1 ─── 1 Quotation
```

Therefore:

- `CalibrationRequest` may have at most one Quotation.
- A Quotation created through this API MUST belong to exactly one CalibrationRequest.
- A second Quotation for the same CalibrationRequest MUST NOT be allowed.
- Quotation revision as a separate Quotation record is NOT supported in MVP.
- Do NOT introduce a quotation version/revision mechanism.
- Do NOT introduce `revisionNo`, `supersededBy`, `currentQuotation`, or similar concepts.

This is an intentional MVP simplification.

Do not re-open or redesign the rest of the Quotation lifecycle.

---

# 2. FIRST: RE-VERIFY ACTUAL CODE

Before editing anything, inspect the actual current codebase.

Verify:

1. `Quotation` model in:
   `packages/db/prisma/schema.prisma`

2. `CalibrationRequest` ↔ `Quotation` relation

3. Current `requestId` definition on `Quotation`

4. Current Quotation create service

5. Existing Quotation tests

6. Any existing code/documentation that explicitly implements quotation revision as a separate record

Do NOT blindly trust the previous implementation report.

The actual current codebase is the source of truth.

---

# 3. PRISMA / DATABASE CHANGE

The desired database invariant is:

```text
one CalibrationRequest → maximum one Quotation
```

Therefore, if the actual schema currently has:

```prisma
requestId String
```

without a uniqueness constraint, change it to the appropriate Prisma representation so that the database enforces uniqueness.

Expected outcome is conceptually:

```prisma
requestId String @unique
```

or the equivalent relation representation required by the actual current schema.

Do NOT change unrelated Quotation fields.

Do NOT redesign the Quotation model.

Do NOT alter Quotation status enums.

Do NOT alter CalibrationRequest status enums.

Do NOT alter pricing/tax fields.

Do NOT alter document numbering.

---

# 4. MIGRATION SAFETY

A Prisma migration is expected because this is a database-level invariant.

Before creating/applying the migration:

1. Verify the LOCAL development database is the native PostgreSQL database.
2. Do NOT use docker-compose for local database testing.
3. Check whether existing data contains duplicate Quotation rows for the same `requestId`.

Run an appropriate duplicate check before applying the unique constraint.

Conceptually:

```sql
SELECT "requestId", COUNT(*)
FROM "Quotation"
WHERE "requestId" IS NOT NULL
GROUP BY "requestId"
HAVING COUNT(*) > 1;
```

Use the actual table/column casing from the current schema.

### IMPORTANT

If duplicate existing data is found:

**STOP.**

Do NOT arbitrarily delete, merge, or choose a surviving Quotation.

Report:

- duplicate requestId
- affected Quotation IDs/numbers
- counts
- why migration cannot safely proceed automatically

Do not perform destructive cleanup without explicit approval.

If no duplicates exist, proceed with the minimal unique-constraint migration.

After generating the migration, inspect the generated SQL.

The migration should contain only the expected uniqueness change, with no unrelated schema changes.

---

# 5. SERVICE BEHAVIOR

The database uniqueness constraint is the authoritative invariant.

The API should also provide a clear application-level error when a user attempts to create a second Quotation for a CalibrationRequest that already has one.

Do not rely solely on a generic Prisma unique-constraint error if the existing service pattern allows a clearer domain error.

Before implementing, inspect how CalibrationRequest and other modules handle:

- duplicate resources
- Prisma unique constraint errors
- BadRequestException
- ConflictException
- NotFoundException

Follow the established project convention.

The expected business behavior is:

```text
POST /quotations
requestId = CR-001

if CR-001 has no quotation:
    create quotation

if CR-001 already has quotation:
    reject creation
```

Do not silently update the existing Quotation.

Do not create a second Quotation.

Do not automatically replace the existing Quotation.

Do not create a revision.

---

# 6. DO NOT CHANGE EXISTING WORKFLOW

Keep the existing Quotation workflow exactly as implemented unless a change is strictly required by the cardinality correction.

Current workflow remains:

```text
DRAFT
  ├── SENT
  └── CANCELLED

SENT
  ├── APPROVED
  ├── REJECTED
  └── CANCELLED
```

Keep the existing rules:

- Commercial update only while DRAFT.
- SENT is frozen.
- APPROVED cannot be cancelled.
- EXPIRED is not automatically implemented.
- CalibrationRequest is moved to `IN_QUOTATION` when the first Quotation is created.
- Reject/cancel of Quotation does not change CalibrationRequest status.
- Do not invent an `ACCEPTED` CalibrationRequest status.
- Do not rename existing enums.

The cardinality correction must not become an excuse to redesign the workflow.

---

# 7. DO NOT CHANGE THESE AREAS

Do NOT modify:

- PurchaseOrder
- WorkOrder
- CalibrationJob
- MeasurementEntry
- MeasurementResult
- Certificate
- Invoice
- Payment
- CreditNote
- Portal Quotation UI
- CalibrationRequest controller/service unless absolutely required by the unique relation
- DocumentNumberService architecture
- permission catalog
- company scoping architecture
- unrelated schema/models

Do not refactor unrelated code.

---

# 8. TESTS

Update the existing Quotation test suite.

Keep all currently passing tests.

Add/modify tests to explicitly verify:

### Successful first quotation

```text
CalibrationRequest without quotation
        ↓
POST /quotations
        ↓
Quotation created successfully
```

### Duplicate quotation rejected

```text
CalibrationRequest with existing quotation
        ↓
POST /quotations
        ↓
request rejected
        ↓
no second quotation created
```

Verify both:

1. application-level behavior, and
2. database-level uniqueness invariant where practical.

Also verify that an existing Quotation remains unchanged after a duplicate-create attempt.

Do NOT remove existing tests merely because the domain changed.

---

# 9. IMPORTANT: REASSESS ANY EXISTING "REVISION" LOGIC

Search the actual implementation for language or logic implying:

- revision
- revised quotation
- quotation version
- multiple quotations per request
- current quotation
- superseded quotation

If such logic exists in the newly implemented backend:

- remove only what is necessary to enforce the new 1:1 contract;
- do not perform a broad refactor.

If the implementation never actually contained revision-specific logic beyond allowing multiple rows, leave everything else untouched.

---

# 10. VERIFICATION

After implementation:

1. Run the actual Quotation test suite.
2. Tests must actually execute — do not report skipped tests as success.
3. Run shared typecheck.
4. Run API typecheck.
5. Run API build.
6. Verify Prisma migration status.
7. Verify generated migration SQL.
8. Confirm no unrelated files were changed.

Expected result:

```text
Quotation tests: PASS
Shared typecheck: PASS
API typecheck: PASS
API build: PASS
Database migration: applied successfully
```

---

# 11. FINAL REPORT

Return a concise implementation report containing:

### A. Cardinality

Confirm:

```text
CalibrationRequest 1 ─── 1 Quotation
```

and explain exactly how this is enforced at the database level.

### B. Migration

Report:

- migration name
- exact schema change
- duplicate-data check result
- whether migration was applied
- confirmation that generated SQL was reviewed

### C. Service

Explain how duplicate Quotation creation is rejected.

### D. Tests

Report exact test count and pass/fail result.

### E. Build

Report:

- shared typecheck
- API typecheck
- API build

### F. Scope

Explicitly confirm that these were NOT implemented or modified:

- PurchaseOrder
- WorkOrder
- CalibrationJob
- MeasurementEntry
- downstream modules
- Portal Quotation UI

### G. Remaining ambiguity

Do NOT invent new issues.

Only report genuine unresolved issues discovered during this surgical revision.