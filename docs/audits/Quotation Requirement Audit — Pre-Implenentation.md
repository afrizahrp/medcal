# Quotation Requirement Audit — Pre-Implementation Review

## Brief
**Audit the current Quotation architecture and the new business requirements below before making any code changes.**  
The goal is to determine the correct domain model, data ownership, workflow, UX implications, and architectural approach first. **Do not implement any changes yet.**

### New Requirements

1. **Quotation backdating**
   - The quotation date must be allowed to be backdated.
   - Audit the current quotation date handling, validation, business rules, auditability, and any downstream dependencies that may assume the quotation date cannot be earlier than the current date.
   - Identify whether backdating should have any constraints or consequences for quotation numbering, status transitions, validity periods, reporting, or related documents.

2. **Customer-specific pricing treatment**
   - Some customers have special pricing treatment and do not use the standard tariff / price list.
   - Audit the current Customer, pricing, tariff/price-list, and Quotation models and workflows.
   - Determine whether this pricing treatment belongs as a field/configuration on the Customer model or should be represented through a separate pricing concept/model.
   - Consider whether the requirement is simply a customer-level pricing mode, a customer-specific price list, negotiated pricing, contract pricing, or another domain concept.
   - Pay particular attention to data ownership, reuse across quotations and SPKs/orders, maintainability, auditability, and future extensibility.
   - Do not introduce a customer field merely because it is the simplest implementation; first determine the correct domain abstraction.

3. **Dynamic additional items for ON_SITE accommodation**
   - During ON_SITE job execution (SPK), accommodation-related costs may need to be added to a quotation.
   - These additional items are dynamic and may apply only to certain customers.
   - Consider whether these should be represented by a new model/domain concept rather than hard-coded quotation fields.
   - The desired quotation UX is potentially:
     - User enables an **Additional** option (checkbox, switch, or another appropriate control).
     - The relevant additional item(s) then become available in the quotation.
     - The user can configure/populate the additional item during quotation creation.
   - Audit whether the additional item should be selected/configured from a dedicated model or whether the interaction should follow the same conceptual approach currently used when adding accessories to an SPK.
   - Compare both approaches and determine which one is more consistent with the existing domain architecture.
   - Consider whether accommodation is the first instance of a broader category of customer-specific/dynamic quotation add-ons, and whether the design should accommodate future additional items without over-engineering the current requirement.
   - Pay particular attention to whether the quotation should store a snapshot of the selected additional item's name, pricing, quantity, or other attributes so that historical quotations remain stable if the underlying configuration changes later.

## Audit Scope

Perform a **strict, comprehensive audit before implementation**. Inspect the existing codebase and understand the current architecture and relationships among, at minimum:

- Customer
- Quotation
- Quotation items / line items
- Tariff / price list / pricing logic
- SPK / Work Order
- SPK accessories and their current add-item workflow
- Any existing customer-specific configuration or pricing mechanism
- Relevant database schema, services, repositories, APIs, validation, and UI
- Existing quotation numbering, date, status, validity, and lifecycle rules
- Any downstream documents, reports, calculations, or workflows that consume quotation data

Do not assume that the requested solution should map directly to the wording of the requirements. Translate the business requirements into the appropriate domain concepts based on the existing architecture.

### Specifically determine

For each requirement:

1. What already exists that can support it?
2. What architectural limitation currently prevents it?
3. Whether the requirement should be handled by:
   - an existing field/model,
   - an extension of an existing model,
   - a new field,
   - a new model/domain concept,
   - or a combination.
4. Where the source of truth should live.
5. What data should be copied/snapshotted into a quotation versus referenced dynamically.
6. What validation and business rules are required.
7. What impact the change has on existing quotations and existing production data.
8. What impact it has on the SPK/Work Order workflow.
9. What UX pattern is most appropriate and why.
10. Whether the proposed design creates unnecessary complexity or technical debt.
11. Whether the design is extensible enough for likely future pricing/additional-item requirements without prematurely generalizing the system.

### Important Architectural Principle

Do **not** optimize for the smallest code change.

Optimize for a solution that is consistent with Medcal's existing architecture and domain model, preserves historical quotation integrity, minimizes duplicated business logic, and remains understandable and maintainable.

At the same time, avoid speculative over-engineering. If a simple customer-level field is genuinely the correct domain model, say so. If a dedicated pricing/configuration model is more appropriate, explain why.

For the additional-item requirement, explicitly compare the proposed approaches and explain the trade-offs before recommending one.

## Deliverables

**Do not modify or implement the code yet.**

Produce two Markdown documents:

### 1. Audit Report
Create a detailed audit report containing:

- Executive Summary
- Current Architecture Findings
- Existing Quotation Flow
- Customer & Pricing Architecture Findings
- SPK / Accessory Architecture Findings
- Requirement-by-Requirement Analysis
- Identified Architectural Gaps
- Recommended Domain Model
- Recommended Data Model / Schema Changes
- Recommended UX / Workflow
- Risks & Edge Cases
- Backward Compatibility / Existing Data Considerations
- Alternatives Considered
- Final Recommendation
- Open Questions / Decisions Required Before Implementation

The report must clearly distinguish:
- what was found in the existing codebase,
- what is inferred,
- and what is recommended.

### 2. Implementation Plan
Create a separate implementation plan in Markdown based on the audit findings.

The implementation plan should include:

- Implementation objectives
- Proposed schema/model changes
- Backend/domain changes
- API changes
- Validation/business rules
- Frontend/UI changes
- Data migration requirements, if any
- Existing quotation compatibility considerations
- Test strategy
- Regression risks
- Implementation sequence / phases
- Files/modules likely to be affected
- Acceptance criteria

The implementation plan must be **implementation-ready but must not contain actual code changes**.

## Final Constraint

**Audit first. Do not implement anything.**

If the audit reveals that any part of the requirement is ambiguous or that an architectural decision requires product/business confirmation, explicitly flag it in the report instead of silently making the decision.