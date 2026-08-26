# Task: Audit & Align `CalibrationRequest → Quotation` Domain Contract

We have completed the business-domain discussion for the relationship between `CalibrationRequest` and `Quotation`.

Your task is to **AUDIT the existing codebase against the locked business rules below** and identify any mismatch.

## IMPORTANT SCOPE RESTRICTION

For this task, ONLY analyze:

- `CalibrationRequest`
- `Quotation`
- their relationship
- their lifecycle/status
- quotation creation/revision behavior

DO NOT redesign or modify:

- SPK
- SPKItem
- Calibration Job
- CalibrationResult
- Calibration Work Template
- technician workflow
- invoice
- payment
- LK/calibration worksheet structure

Do not anticipate or introduce future domain decisions.

The goal is to ensure the current implementation matches the business contract below.

---

# 1. Locked Relationship

```text
CalibrationRequest 1 ──────< N Quotation
```

A single `CalibrationRequest` may have multiple `Quotation` records.

Example:

```text
CR-001
├── Q-001
├── Q-002
└── Q-003
```

---

# 2. CalibrationRequest Scope Rule

A `Quotation` represents the **full scope** of its `CalibrationRequest`.

A quotation MUST NOT represent only a subset of the request items.

If only a subset of items needs to become a separate commercial request, the business process is:

```text
existing CalibrationRequest
        ↓
new CalibrationRequest with the new/subset scope
        ↓
new Quotation
```

Do NOT implement a model where multiple quotations under the same CalibrationRequest each arbitrarily contain different subsets of the CalibrationRequest items.

---

# 3. CalibrationRequest Lifecycle

The currently locked lifecycle is:

```text
SUBMITTED
    ↓
QUOTED
    ↓
ACCEPTED
```

### SUBMITTED

Meaning:

- Customer has submitted the CalibrationRequest.
- The request is ready to enter the quotation process.
- A Quotation may be created immediately.
- There is NO intermediate state such as:
  - REVIEWED
  - READY_FOR_QUOTATION
  - APPROVED_FOR_QUOTATION

Do not introduce such states.

### QUOTED

When the first Quotation is created for a submitted CalibrationRequest:

```text
CalibrationRequest: SUBMITTED
        ↓
Quotation created
        ↓
CalibrationRequest: QUOTED
```

`QUOTED` means that at least one quotation has been created.

It does NOT mean that the customer has accepted the quotation.

A CalibrationRequest may remain `QUOTED` while its quotations are rejected, expired, or replaced by newer quotations.

### ACCEPTED

When one of the quotations belonging to the CalibrationRequest is accepted:

```text
CalibrationRequest: QUOTED
        ↓
one related Quotation becomes ACCEPTED
        ↓
CalibrationRequest: ACCEPTED
```

The CalibrationRequest does not need to track or mirror the status of every quotation.

Once one quotation is accepted, the request becomes `ACCEPTED`.

---

# 4. Quotation Lifecycle

The locked Quotation lifecycle is:

```text
DRAFT
   ↓
SENT
   ├── ACCEPTED
   ├── REJECTED
   └── EXPIRED
```

## DRAFT

Quotation has been created but has not yet been sent to the customer.

It may still be edited.

## SENT

Quotation has been sent/offered to the customer.

Once sent, its commercial content should be treated as historical/commercially frozen.

Do not silently mutate the commercial meaning of an already-sent quotation.

## ACCEPTED

Customer accepts this quotation.

This quotation becomes the accepted quotation associated with the CalibrationRequest.

The acceptance also causes:

```text
CalibrationRequest QUOTED
        ↓
CalibrationRequest ACCEPTED
```

## REJECTED

Customer explicitly rejects the quotation.

This does NOT automatically make the CalibrationRequest rejected.

The request can remain:

```text
QUOTED
```

and another quotation may subsequently be created.

## EXPIRED

The quotation reaches its validity deadline without being accepted.

`EXPIRED` is different from `REJECTED`.

- REJECTED = explicit customer rejection.
- EXPIRED = validity period ended without acceptance.

---

# 5. Revision Rule

There is intentionally NO `REVISED` quotation status.

If a customer requests a commercial revision after a quotation has been sent:

```text
Q-001
SENT
   ↓
customer requests changes
   ↓
Q-002
DRAFT / SENT
```

The new quotation remains under the SAME CalibrationRequest:

```text
CR-001
├── Q-001
└── Q-002
```

Do not edit Q-001 in a way that destroys its historical commercial meaning.

`REVISED` should NOT be introduced as a Quotation status.

---

# 6. Important Boundary Rule

Use this distinction:

### Commercial change

```text
Quotation changes
        ↓
new Quotation
        ↓
same CalibrationRequest
```

### Request scope changes

```text
Request scope changes materially
        ↓
new CalibrationRequest
        ↓
new Quotation
```

Do not blur these two concepts.

---

# 7. What I want you to do

First, inspect the existing implementation.

Audit:

1. Prisma schema/models
2. enums/status definitions
3. relations between CalibrationRequest and Quotation
4. backend services/use-cases
5. quotation creation flow
6. quotation revision flow
7. quotation acceptance flow
8. request status transitions
9. API DTOs/validation
10. frontend assumptions about these statuses
11. database constraints that enforce or fail to enforce the relationship

For each finding, classify it as:

- **MATCH** — implementation already conforms
- **MISMATCH** — implementation violates the locked business rule
- **GAP** — business rule is not currently enforced
- **UNUSED/LEGACY** — existing concept appears unnecessary under the locked domain
- **UNKNOWN** — cannot be determined from the codebase

---

# 8. Do NOT modify code yet

This is an AUDIT ONLY.

Do not automatically refactor.

Do not create migrations.

Do not change Prisma schema.

Do not add new statuses.

Do not implement SPK.

Do not implement CalibrationResult.

Do not redesign unrelated modules.

First produce an audit report.

The report must contain:

## A. Current implementation

Explain what the current code actually does.

## B. Locked business contract

Summarize the rules above.

## C. Mismatch matrix

Use:

```text
Area | Current Implementation | Expected Contract | Status | Evidence
```

## D. Recommended changes

Only list changes that are actually required to bring the current implementation into compliance.

Do not implement them yet.

## E. Open questions

Only list genuine unresolved questions that are necessary for the `CalibrationRequest → Quotation` contract.

Do NOT invent questions about SPK, CalibrationResult, technician workflow, or LK templates.

---

# Final instruction

Be conservative.

Do not redesign the domain based on assumptions.

The business decisions above are LOCKED.

Your job at this stage is to determine:

> "Does the existing implementation actually represent these decisions?"

Nothing more.