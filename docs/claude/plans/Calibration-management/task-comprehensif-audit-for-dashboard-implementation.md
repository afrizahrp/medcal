# MEDCAL — COMPREHENSIVE / STRICT ARCHITECTURE AUDIT
## Pre-Implementation Audit for Management Dashboard

You are acting as a **Senior Software Architect + Principal Engineer + Product Systems Auditor** for the MedCal project.

Your task is NOT to implement anything.

Your task is to perform a **COMPREHENSIVE / STRICT ARCHITECTURE AUDIT** of the existing MedCal system BEFORE any implementation of the Management Dashboard begins.

---

# 1. PRIMARY OBJECTIVE

The objective of this audit is to understand MedCal as a complete system first.

Do NOT jump directly into designing or coding the Management Dashboard.

The Management Dashboard must eventually be built on top of the **actual existing MedCal architecture, domain model, transaction flows, data relationships, status lifecycle, aggregation patterns, and source-of-truth rules**.

The audit must therefore answer:

> "If we had to build a Management Dashboard today without changing the existing business architecture, what does the existing MedCal system actually allow us to know, from which sources, through which relationships, and with what degree of reliability?"

The audit must identify:

- what already exists
- how the existing system is structured
- where the authoritative data lives
- how business entities relate to each other
- how operational transactions flow
- how status/lifecycle works
- how historical data is represented
- what can safely be aggregated
- what cannot safely be aggregated
- where architectural inconsistencies exist
- where dashboard-specific assumptions would be dangerous
- what data is missing or ambiguous
- what should be reused
- what should NOT be duplicated
- what should be corrected before dashboard implementation
- what can remain unchanged

---

# 2. CRITICAL RULES

## RULE 1 — AUDIT ONLY

DO NOT implement the Management Dashboard.

DO NOT modify application code.

DO NOT modify database schema.

DO NOT create migrations.

DO NOT refactor existing modules.

DO NOT create new API endpoints.

DO NOT create new services.

DO NOT create dashboard components.

DO NOT alter existing UI.

DO NOT "fix" issues during the audit.

If something needs to change, document it as a finding/recommendation only.

---

## RULE 2 — UNDERSTAND THE SYSTEM GLOBALLY FIRST

Do not audit only files that appear related to "dashboard".

Trace the system across the actual architecture.

At minimum inspect:

- apps
- packages
- database/schema
- API layer
- domain/business logic
- services
- repositories/data-access
- jobs/workflows
- transaction lifecycle
- status/state definitions
- existing reporting/aggregation logic
- existing management/admin pages
- existing customer/technician flows
- document generation
- notification/event mechanisms where relevant
- audit/history mechanisms
- configuration that affects business behavior
- tests
- existing implementation patterns

Follow relationships instead of assuming them from filenames.

---

# 3. DO NOT TRUST NAMES ALONE

A field named:

- status
- total
- amount
- completed
- active
- pending
- cancelled
- customer
- order
- quotation
- PO
- invoice
- calibration
- certificate

does NOT automatically mean what its name suggests.

Verify its actual semantics from:

1. schema
2. code
3. business logic
4. API
5. UI usage
6. tests
7. lifecycle transitions

If semantics differ between layers, report the discrepancy.

---

# 4. BUSINESS DOMAIN RECONSTRUCTION

Reconstruct MedCal's actual domain model.

Identify the major entities and relationships.

At minimum investigate the actual implementation of concepts such as:

- Customer
- Customer site/location
- Contact
- Device
- Device calibration
- Calibration parameters
- Calibration result
- Calibration certificate
- Work/job/order
- Quotation
- Purchase Order
- Invoice
- Payment
- Technician
- Service/transaction
- Tax
- Pricing
- Documents
- Notifications
- Audit/history
- Any other relevant business entity discovered in the repository

Do not assume that every item above exists exactly as described.

If the actual implementation differs, document the real structure.

Produce a domain relationship map.

---

# 5. TRANSACTION LIFECYCLE AUDIT

Trace the complete lifecycle of the major business transactions.

For example, where applicable:

Customer
→ Quotation
→ PO
→ Job/Work Order
→ Device
→ Calibration
→ Result
→ Certificate
→ Invoice
→ Payment
→ Completion

But DO NOT assume this is the actual MedCal lifecycle.

Reconstruct the actual lifecycle from code.

For every major lifecycle, identify:

- entry point
- entity created
- entity updated
- status transitions
- source of truth
- relationships
- immutable vs mutable data
- historical records
- cancellation/revision/reapproval behavior
- dependencies
- downstream effects

Pay particular attention to:

- recalibration
- reapproval
- revision
- correction
- cancellation
- rescheduling
- replacement
- historical snapshots
- status changes
- document regeneration

---

# 6. SOURCE-OF-TRUTH AUDIT

For every important Management Dashboard metric, determine:

> Which entity/table/field is the authoritative source?

Do NOT derive a metric merely because a field happens to exist.

For each potential metric document:

| Metric | Candidate Source | Actual Source of Truth | Derivation | Reliability | Notes |
|---|---|---|---|---|---|

Examples:

- total customers
- active customers
- total devices
- active devices
- devices due for calibration
- calibration jobs
- completed calibrations
- pending calibrations
- quotations
- POs
- invoices
- outstanding invoices
- revenue
- monthly revenue
- service volume
- technician workload
- certificate production
- turnaround time
- customer engagement
- recurring customers

Only include metrics that can actually be supported by the existing architecture.

If a metric cannot be reliably derived, explicitly say:

> NOT RELIABLY DERIVABLE FROM CURRENT ARCHITECTURE

Do not invent a workaround.

---

# 7. AGGREGATION & CARDINALITY AUDIT

This is critical.

Determine the cardinality of relationships.

Examples:

- Customer → PO
- PO → Device
- PO → Volume
- PO → Job
- Job → Device
- Device → Calibration
- Calibration → Parameters
- Calibration → Certificate
- Customer → multiple POs
- Customer → multiple sites
- Customer → multiple devices

Identify:

- 1:1
- 1:N
- N:1
- N:N

Look specifically for potential double-counting.

Example scenario:

A hospital has:

- 56 devices
- 409 volumes

and potentially:

- 10+ POs

Determine how the architecture represents this.

The audit must answer:

> If a customer has 10, 20, or 100 POs, can Management Dashboard metrics still be aggregated without counting the same underlying device/volume/customer multiple times?

Identify every possible duplication path.

Explicitly inspect:

- JOIN multiplication
- nested relations
- duplicated device references
- duplicated volume references
- PO-level aggregation vs device-level aggregation
- transaction-level aggregation vs master-data aggregation
- historical records being counted as current records
- cancelled/revised/reapproved records being counted incorrectly

---

# 8. MANAGEMENT DASHBOARD DATA MODEL AUDIT

Determine what kind of dashboard architecture the current system naturally supports.

Evaluate whether metrics should be:

- queried directly from transactional tables
- derived through existing service/domain logic
- calculated through aggregation queries
- materialized
- cached
- precomputed
- event-driven
- snapshot-based

Do NOT choose an implementation yet.

Instead document the architectural implications.

For each dashboard metric identify:

- computation complexity
- expected data volume
- query cost
- freshness requirement
- historical requirements
- consistency requirements
- whether transactional data is sufficient

---

# 9. TIME / PERIOD SEMANTICS AUDIT

Management dashboards are extremely sensitive to date semantics.

Determine exactly which timestamps exist and what they mean.

Audit fields such as:

- createdAt
- updatedAt
- scheduledAt
- completedAt
- approvedAt
- issuedAt
- dueAt
- calibrationDate
- invoiceDate
- paymentDate
- PO date
- quotation date

Determine:

- which timestamp represents business occurrence
- which represents database mutation
- timezone behavior
- historical reporting capability
- date boundaries
- current vs historical state

Identify any ambiguity that could produce misleading monthly/weekly/daily metrics.

---

# 10. STATUS / STATE MACHINE AUDIT

Map all important statuses and transitions.

Do not simply list enum values.

Determine:

- valid transitions
- who/what triggers transitions
- terminal states
- reversible states
- cancelled states
- superseded states
- reapproval states
- revision states
- whether historical state is preserved

Determine whether dashboard aggregation should use:

- current status
- historical status
- transition events
- completed timestamps
- business dates

This distinction is mandatory.

---

# 11. HISTORICAL DATA & SNAPSHOT AUDIT

Determine whether MedCal preserves historical truth.

Examples:

If:

- device information changes
- customer information changes
- PO changes
- quotation changes
- calibration result changes
- certificate is reissued
- calibration is corrected

can the system still answer:

> "What was true at that point in time?"

Identify where snapshots exist and where they do not.

This is especially important for Management Dashboard historical reporting.

---

# 12. EXISTING REPORTING / ANALYTICS PATTERNS

Search the entire repository for existing:

- reports
- summaries
- dashboards
- statistics
- aggregations
- counts
- financial reports
- operational reports
- charts
- KPI calculations
- exports
- PDF reports
- management pages

Determine whether there are already trusted business calculations.

If existing logic exists:

- identify it
- explain what it calculates
- identify its source of truth
- determine whether dashboard should reuse it
- identify inconsistencies between multiple implementations of the same metric

DO NOT duplicate existing business logic blindly.

---

# 13. API / SERVICE ARCHITECTURE AUDIT

Understand how data currently flows:

UI
→ API
→ service/domain
→ repository
→ database

or whatever architecture actually exists.

Identify:

- server-side vs client-side aggregation
- existing service boundaries
- transaction boundaries
- query patterns
- authorization boundaries
- pagination
- filtering
- sorting
- caching
- N+1 risks
- expensive queries
- existing reusable endpoints

Do not propose new API design yet unless necessary as an audit recommendation.

---

# 14. PERFORMANCE & SCALE AUDIT

Use the real architecture and realistic MedCal scale.

Explicitly consider the previously discussed scenario:

> A large hospital/customer may have approximately 56 devices and 409 volumes, and potentially 10 or more POs.

Do not assume this is the maximum.

Determine what happens if there are:

- 10 POs
- 50 POs
- 100 POs
- thousands of transactions
- many customers
- many devices
- many calibration records
- long historical periods

Identify queries that may become expensive.

Pay special attention to:

- COUNT(DISTINCT)
- SUM across nested relations
- GROUP BY
- large JOIN chains
- ORM eager loading
- nested includes
- repeated aggregation
- dashboard loading multiple independent queries
- historical queries
- date-range queries

Do not prematurely optimize.

Identify actual architectural risks.

---

# 15. DATA CONSISTENCY AUDIT

Determine whether the same business fact can exist in multiple places.

Examples:

- customer name
- device identity
- price
- tax
- PO amount
- calibration status
- certificate status
- invoice amount
- payment status

For each duplicated fact determine:

- authoritative source
- synchronization mechanism
- possibility of drift
- whether historical snapshots are intentional

Report inconsistencies.

---

# 16. EDGE CASE AUDIT

Explicitly investigate cases such as:

- cancelled PO
- cancelled job
- partially completed PO
- PO with multiple jobs
- PO with multiple devices
- same device appearing in multiple POs
- repeated calibration of the same device
- reapproval
- revision
- identity correction
- certificate regeneration
- deleted vs archived data
- inactive customer
- inactive device
- duplicate records
- zero-value transaction
- partially paid invoice
- tax-inclusive vs tax-exclusive pricing
- historical records
- migrated records
- trial/test data if applicable

Determine how each affects dashboard metrics.

---

# 17. RBAC SCOPE — VERY IMPORTANT

DO NOT perform a broad RBAC audit.

DO NOT redesign permissions.

DO NOT discuss roles unless necessary.

The ONLY RBAC-related question for this audit is:

> WHO is allowed to SEE the Management Dashboard?

Document only the relevant visibility/access boundary.

Do not let RBAC distract from the architecture audit.

---

# 18. FRONTEND ARCHITECTURE AUDIT

Inspect existing frontend patterns relevant to Management Dashboard.

Determine:

- routing structure
- layout conventions
- data fetching
- server/client components
- loading states
- error states
- table/chart patterns
- filter patterns
- date-range patterns
- responsive behavior
- existing dashboard-like components
- reusable components

The goal is to understand existing patterns, NOT to design the dashboard UI.

---

# 19. UX / INFORMATION ARCHITECTURE AUDIT

Do NOT design the dashboard.

Instead determine what the existing domain architecture naturally supports.

Identify:

- which concepts are operational
- which concepts are financial
- which concepts are customer-centric
- which concepts are asset-centric
- which concepts are service-centric

Identify dangerous UX assumptions.

For example:

A metric labelled:

> "Total Devices"

may actually mean:

- total device records
- distinct active devices
- devices currently under service
- devices attached to active PO
- historical devices

These semantics must be resolved before UI implementation.

---

# 20. TEST COVERAGE AUDIT

Inspect existing tests around:

- domain logic
- calculations
- status transitions
- financial calculations
- aggregation
- PO
- device
- calibration
- certificate
- invoice
- payment
- reporting

Determine:

- what is protected by tests
- what is not
- whether dashboard metrics can rely on tested logic
- where business rules are currently untested

Do not write tests during this audit.

---

# 21. ARCHITECTURAL SMELL DETECTION

Look for:

- duplicated business logic
- inconsistent status semantics
- duplicated aggregation
- hidden business rules
- data denormalization
- accidental coupling
- circular dependencies
- N+1 queries
- implicit relationships
- ambiguous fields
- overloaded entities
- weak historical modeling
- inconsistent date semantics
- transaction boundaries that don't match business boundaries
- dashboard-hostile architecture

Every finding must include concrete evidence from the codebase.

No speculative criticism.

---

# 22. DO NOT OVER-ENGINEER

Do not recommend:

- data warehouse
- event sourcing
- CQRS
- materialized views
- Kafka
- Redis
- separate analytics database
- microservices
- new architecture

unless the current architecture actually demonstrates a concrete requirement for it.

The objective is to understand the existing system first.

Recommendations must be proportional to actual evidence.

---

# 23. AUDIT DELIVERABLE

Produce a comprehensive audit report.

Use this structure:

# MEDCAL COMPREHENSIVE ARCHITECTURE AUDIT
## Pre-Implementation Audit — Management Dashboard

### 1. Executive Summary

Summarize:

- overall architecture
- major domain structure
- key findings
- critical risks
- dashboard readiness
- architectural constraints

---

### 2. Repository / Architecture Map

Show:

```text
Application
├── ...
├── ...
└── ...