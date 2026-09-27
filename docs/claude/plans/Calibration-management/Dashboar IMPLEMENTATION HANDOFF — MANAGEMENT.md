# IMPLEMENTATION HANDOFF — MANAGEMENT DASHBOARD V1

## Role

You are the implementation engineer for the MedCal repository.

Implement **Management Dashboard V1** strictly according to the finalized implementation plan:

`docs/claude/plans/Calibration-management/MANAGEMENT-DASHBOARD-V1-IMPLEMENTATION-PLAN.md`

The plan is the **source of truth for business semantics, metric definitions, architecture boundaries, period semantics, API shape, RBAC scope, and implementation sequence**.

Do not reinterpret the business requirements.

---

# 1. Primary Objective

Implement the finalized **Management Dashboard V1** end-to-end:

* Backend dashboard aggregation/API
* Required database indexes
* Frontend management dashboard
* Existing authorization integration
* Automated tests
* Build/type/test validation

The implementation must preserve the existing MedCal architecture and conventions.

Do **not** redesign unrelated modules.

---

# 2. CRITICAL LOCKED BUSINESS SEMANTICS

These definitions are already approved and MUST NOT be changed.

## 2.1 Volume

> **1 Volume = 1 unique physical device / 1 physical calibration unit.**

The authoritative physical-unit grain is:

> **1 `CalibrationJob` = 1 physical calibration unit.**

Therefore:

```text
Volume = COUNT(CalibrationJob)
```

Do NOT calculate Volume by summing:

* Request quantities
* Quotation quantities
* PO quantities
* WorkOrder quantities
* CalibrationJob quantities

Those upstream quantities are lifecycle snapshots and can represent the same physical units multiple times.

For example:

```text
56 line items
409 physical devices
17 approved POs
```

must remain conceptually:

```text
Customer PO = 17
Volume      = 409
```

not the sum of quantities across lifecycle documents.

### Important lifecycle behavior

`CalibrationJob` rows are created when a WorkOrder is started/fanned out.

Therefore an upstream PO quantity can exist while no corresponding CalibrationJob exists yet.

Do NOT invent another Volume source to compensate for this.

---

# 3. Customer PO — FINAL DEFINITION

This definition was explicitly revised in the final plan.

> **Customer PO = COUNT(PurchaseOrder WHERE status = APPROVED)**

Therefore:

| PurchaseOrder status | Counted? |
| -------------------- | -------: |
| DRAFT                |       No |
| APPROVED             |      Yes |
| CANCELLED            |       No |

Do not use unconditional `COUNT(PurchaseOrder)`.

Do not count DRAFT or CANCELLED POs.

## Period timestamp

For Customer PO period/trend metrics use:

> **`PurchaseOrder.confirmedAt`**

Reason:

* Only APPROVED POs are counted.
* `confirmedAt` is set atomically when the PO becomes APPROVED.
* It represents the business event when the PO became valid.

Do NOT use `createdAt` for the Customer PO period metric.

---

# 4. Calibrated — FINAL DEFINITION

> **Calibrated = CalibrationJob.status = ACCEPTED_BY_QA**

The business event timestamp is:

> **`QualityReview.reviewedAt` of the APPROVED QualityReview for that CalibrationJob.**

Use the exact approved QualityReview record.

Do not substitute:

* CalibrationJob.createdAt
* CalibrationJob.updatedAt
* WorkOrder timestamps
* MeasurementResult timestamps
* another QA-related timestamp

Do not conflate:

* measurement tolerance (`isWithinTolerance`)
* QA decision/status

They are different concepts.

---

# 5. Period / Timezone

All dashboard period calculations must use:

> **`Asia/Jakarta`**

Current period and trend calculations must follow the finalized implementation plan.

Use the existing repository date/time conventions where applicable.

Do not silently introduce UTC-based business-period semantics.

---

# 6. Financial Metrics

Financial/revenue functionality is **NOT implemented as a real financial calculation in V1**.

The financial cards must therefore display:

> **0**

Do not fabricate revenue from:

* PO totals
* Quotation totals
* invoice tables that are not operationally populated
* payment tables
* billing status fields
* quotation/PO amounts

Do not implement fake revenue logic merely to make the dashboard look complete.

---

# 7. Cancellation

Cancellation handling is **OUT OF SCOPE for V1**.

Do not redesign WorkOrder cancellation.

Do not introduce a new CalibrationJob `CANCELLED` state.

Do not add cancellation-specific dashboard logic beyond what the finalized plan explicitly requires.

Cancellation is a future-plan item.

---

# 8. RBAC

Do NOT redesign RBAC.

The only RBAC concern is:

> who can view the Management Dashboard.

Use the existing:

```text
managementDashboard:read
```

permission and existing role assignments.

Important business decision:

> **GM = existing SUPERVISOR role.**

Do NOT create a new `DIRECTOR` role.

Do NOT introduce a new role hierarchy.

Do NOT modify unrelated permissions.

---

# 9. Dashboard Scope

Implement the dashboard according to the finalized plan.

The intended V1 metric groups are:

### Current operational state

* Active Work Orders
* Jobs Awaiting Action
* Quotations Pending Approval

### Period/trend metrics

* Customer PO
* Volume
* Calibrated

### Financial

* Revenue / financial cards → `0`

The exact query definitions and response structure must follow:

`MANAGEMENT-DASHBOARD-V1-IMPLEMENTATION-PLAN.md`

Do not add speculative KPIs.

Do not add additional business metrics merely because they are technically easy to calculate.

---

# 10. API

Implement the Management Dashboard API according to the plan.

Expected endpoint:

```text
GET /dashboard/management-summary
```

with the planned parameters:

```text
period
from
to
customerId
```

Follow existing API/module conventions in the repository.

Do not create a parallel dashboard architecture if an existing module/service pattern can be reused appropriately.

Keep the dashboard query layer intentionally narrow.

Avoid loading the large/deep `calibrationJobInclude` structure used by other workflows.

Use:

* narrow Prisma `select`
* grouped/aggregate queries where appropriate
* batched queries
* existing repository patterns

Avoid N+1 queries.

---

# 11. Database Indexes

Implement only the indexes justified by the finalized plan.

In particular, ensure the Customer PO query is supported by:

```text
[companyId, status, confirmedAt]
```

Do not revert this to:

```text
[companyId, createdAt]
```

because Customer PO is now filtered by:

```text
status = APPROVED
```

and periodized by:

```text
confirmedAt
```

Also implement the other mandatory indexes specified by the finalized plan.

After schema/index changes, run the appropriate Prisma/database validation and migration checks according to repository conventions.

---

# 12. Frontend

Implement the dashboard in the existing portal application according to the finalized plan.

Expected location:

```text
apps/portal/src/app/management/page.tsx
```

Follow existing MedCal UI patterns.

Do not redesign the entire portal shell.

The V1 layout should communicate clearly:

1. Current operational state
2. Customer PO
3. Volume
4. Calibrated
5. Financial cards showing `0`

Do not add cancellation UI.

Do not add speculative drilldowns unless explicitly present in the finalized plan.

---

# 13. Stress Case — MUST PASS

Use this business scenario as an implementation sanity check:

```text
Customer: large hospital

56 line items
409 unique physical devices
17 APPROVED Customer POs
```

Expected dashboard semantics:

```text
Customer PO = 17
Volume      = 409
```

If 3 of those 17 POs were DRAFT and 2 were CANCELLED, then:

```text
Customer PO = 12
```

because only APPROVED POs count.

Do not double-count lifecycle documents.

---

# 14. Tests

Add/update automated tests covering at minimum:

### Customer PO

Verify:

```text
APPROVED → included
DRAFT    → excluded
CANCELLED → excluded
```

Verify period calculation uses:

```text
confirmedAt
```

not `createdAt`.

### Volume

Verify:

```text
COUNT(CalibrationJob)
```

represents physical calibration units.

Verify the stress case:

```text
17 approved POs
409 CalibrationJobs

=> Customer PO = 17
=> Volume = 409
```

### Calibrated

Verify only:

```text
CalibrationJob.status = ACCEPTED_BY_QA
```

with the corresponding:

```text
QualityReview.status = APPROVED
```

and:

```text
QualityReview.reviewedAt
```

is used for the period/trend timestamp.

### Financial

Verify financial cards remain:

```text
0
```

and do not depend on fake revenue calculations.

### Authorization

Verify existing:

```text
managementDashboard:read
```

is respected.

Do not modify RBAC architecture.

---

# 15. Implementation Discipline

Before changing code:

1. Read the finalized implementation plan completely.
2. Inspect the existing repository implementation patterns.
3. Locate the relevant Prisma models and existing service/controller patterns.
4. Confirm exact enum names and existing status transitions from source code.
5. Implement using existing MedCal conventions.

While implementing:

* Do not change locked business definitions.
* Do not introduce unrelated refactors.
* Do not modify unrelated modules.
* Do not create speculative abstractions.
* Do not add fake financial logic.
* Do not redesign RBAC.
* Do not add cancellation semantics.

If the repository differs from an assumption in the plan, stop and report the concrete discrepancy instead of silently changing the business semantics.

---

# 16. Validation

After implementation, run the relevant:

* TypeScript/type checks
* Prisma validation
* API tests
* dashboard tests
* frontend checks
* existing regression tests
* production build checks where appropriate

Do not declare success merely because the dashboard renders.

The implementation must be validated against the locked business semantics above.

---

# 17. Deliverable

At completion, provide an implementation report containing:

### A. Files changed

List every modified/created file and its purpose.

### B. Database changes

List all schema/index changes.

### C. Backend

Explain:

* API endpoint
* aggregation/query strategy
* period handling
* Customer PO calculation
* Volume calculation
* Calibrated calculation
* financial handling

### D. Frontend

Explain the dashboard structure and metric presentation.

### E. Authorization

Confirm how `managementDashboard:read` is enforced.

### F. Tests

Report:

* tests added/changed
* test results
* relevant regression results

### G. Validation

Report:

* typecheck
* build
* lint
* relevant test suites
* any failures and whether they are pre-existing or introduced

### H. Deviations

If anything differs from the finalized implementation plan, explicitly document:

```text
PLAN DEVIATION
- Planned:
- Actual:
- Reason:
- Impact:
```

Do not silently deviate.

---

# FINAL RULE

The finalized plan is the implementation contract.

The following semantics are especially locked:

```text
1 Volume
= 1 unique physical device
= 1 CalibrationJob

Customer PO
= COUNT(PurchaseOrder WHERE status = APPROVED)

Customer PO period timestamp
= PurchaseOrder.confirmedAt

Calibrated
= CalibrationJob.status ACCEPTED_BY_QA
  + APPROVED QualityReview
  + QualityReview.reviewedAt

Timezone
= Asia/Jakarta

Financial V1
= 0

Cancellation
= OUT OF SCOPE

GM
= existing SUPERVISOR role

No DIRECTOR role creation
No RBAC redesign
```

Implement exactly this scope.

Do not reopen product decisions that are already locked in the plan.
