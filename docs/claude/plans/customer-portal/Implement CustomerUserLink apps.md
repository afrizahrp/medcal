# Medcal — Implement CustomerUserLink Approval Flow

## Project Context

We are currently implementing the next stage of the Medcal Customer Portal.

The original timeline assumption was approximately 5 days until the customer meeting. We now have approximately 10 additional days because the target meeting has been extended to 05/10.

This means we have more room to implement the architecture correctly and test the end-to-end customer authorization flow instead of taking shortcuts purely to meet the original 5-day window.

However, the scope must still remain disciplined.

The agreed product direction is:

Customer self-registers
→ account is created
→ account is pending authorization
→ internal staff manually approves the account
→ staff selects the existing Customer record that the user belongs to
→ CustomerUserLink is created
→ customer can sign in
→ customer can access only data belonging to that linked Customer.

The future Customer Portal will then use this relationship to authorize access to certificates reached through QR/deep links.

For this task, implement ONLY the foundation required for the User ↔ Customer authorization relationship.

Do NOT implement the Customer Portal, QR flow, certificate API, Docker, Nginx, DNS, or other infrastructure yet.

---

## Existing Architecture / Findings

Previous audit established the following:

1. Customer registration is intentionally self-service.

2. Customer users are allowed to register themselves. Do not introduce invitation-only registration.

3. A newly registered customer user may exist before being linked to a Customer.

4. The existing application already has a manual authorization / approval mechanism:
   - GET /users/without-membership
   - POST /users/:id/memberships
   - 403 ACCOUNT_PENDING
   - PendingAuthorization waiting-room behavior

5. CustomerUserLink already exists in the database/schema and migration history.

6. CustomerUserLink currently has no meaningful application consumers and therefore needs to become part of the explicit authorization flow.

7. The intended authorization relationship is:

User
|
| CustomerUserLink
v
Customer

8. CustomerUserLink is an authorization relationship, not merely informational metadata.

9. Later, certificate access will use this relationship to determine whether an authenticated customer user may access a certificate belonging to a specific Customer.

10. QR will later act as a deep-link locator, not as an authorization credential.

11. Customer Portal authentication will reuse the existing @medcal/auth package.

12. The Customer Portal itself will be implemented as an isolated application later. That work is NOT part of this task.

---

## Important Timeline Context

The original implementation plan was constrained by approximately 5 days before the customer meeting.

We now have approximately 10 additional days because the meeting target has been extended to 05/10.

Therefore:

- Do not take architectural shortcuts simply because of the original 5-day deadline.
- Prefer a clean implementation using the existing Medcal architecture.
- Add appropriate tests rather than minimizing tests to save time.
- Resolve the actual authorization relationship now because it is foundational to the later Customer Portal.
- Do not use the additional time as a reason to expand the scope into dashboard, progress tracking, feedback, customer plans, or other future features.

The additional time is for doing the agreed scope properly, not for broadening the MVP.

---

# Task

Implement the CustomerUserLink approval flow end-to-end using the existing architecture and patterns.

The desired final behavior is:

Customer self-registers
→ User account is created
→ User is pending
→ Internal staff sees the pending user
→ Staff selects the correct existing Customer
→ Staff approves the user
→ CustomerUserLink is created
→ User is authorized for that Customer.

---

# Phase 1 — Audit Before Modification

Before changing code, inspect the repository and identify the exact current implementation of:

- customer/user registration
- pending authorization
- GET /users/without-membership
- POST /users/:id/memberships
- staff UI used to approve/link pending users
- User model
- Customer model
- CustomerUserLink model
- membership models/relationships
- existing role/access guards
- existing API/service/controller patterns for membership management
- relevant tests

Do NOT modify anything during this audit phase.

Determine:

1. Where the pending users are retrieved.
2. Where staff approval currently occurs.
3. Where membership creation currently occurs.
4. Whether the existing approval endpoint can be extended safely.
5. How Customer records are currently queried from the staff UI.
6. How CustomerUserLink should be created using the existing schema.
7. Whether there are existing uniqueness constraints or relationship rules that must be respected.
8. Which existing authorization patterns should be reused later.

Do not invent a parallel approval architecture if the existing mechanism can be extended.

After the audit, briefly explain the implementation approach based on the actual code found, then proceed with implementation.

---

# Phase 2 — Backend Implementation

Extend the existing manual approval mechanism so that an internal staff member can:

1. See pending customer users.
2. Select an existing Customer record.
3. Approve the user.
4. Create the corresponding CustomerUserLink.
5. Preserve the existing pending-account semantics.

The resulting relationship must explicitly represent:

User A
→ CustomerUserLink
→ Customer X

The backend must validate that the selected Customer exists and that the operation is authorized.

Do not trust a Customer ID supplied by the frontend without server-side validation.

Use the existing authentication and authorization architecture.

Do not create a generic or unrelated customer-linking service unless the existing architecture genuinely requires it.

---

# Phase 3 — Staff UI

Update the existing staff approval UI rather than creating a separate standalone approval workflow.

The UI should allow staff to:

- identify the pending customer user
- select the appropriate existing Customer
- approve/link the user

Use the existing UI components, API hooks, query patterns, dialogs, forms, and interaction conventions wherever applicable.

The Customer selector should use real Customer records from the system.

Do not redesign unrelated parts of the staff portal.

The UI must make the approval action explicit. Do not silently guess a Customer from email domain, company name, or other user-provided information.

---

# Authorization Semantics

After approval:

User A
→ CustomerUserLink
→ Customer X

means User A is authorized as a customer user for Customer X.

Do NOT use any of the following as a substitute for CustomerUserLink:

- email domain
- company name entered during registration
- customer name entered by the user
- certificate number
- QR token
- other user-provided identifiers

The relationship must come from the explicit internal approval/linking action.

This relationship will later become the basis for certificate authorization in the Customer Portal.

---

# Registration Behavior

Preserve the agreed self-service registration model.

Customer registration must remain:

Customer
→ Sign Up
→ Account created
→ Pending authorization
→ Wait for internal approval

Do NOT:

- make customer registration invitation-only
- require staff to create the account
- automatically assign a Customer based on email domain
- automatically create CustomerUserLink during self-registration
- bypass the existing pending authorization behavior

The CustomerUserLink should only be established through the authorized internal approval flow.

---

# Security and Correctness Requirements

Verify that:

1. A pending customer user cannot access customer-specific data merely because the account exists.

2. Approval without selecting a valid Customer is not possible.

3. The backend validates the selected Customer.

4. CustomerUserLink is only created through the authorized internal approval flow.

5. Existing staff authorization rules remain intact.

6. Existing non-customer membership/approval flows continue to work.

7. Existing customer self-registration behavior remains unchanged.

8. The existing @medcal/auth behavior is not unnecessarily modified.

9. No certificate access is introduced in this task.

10. No anonymous customer-specific access is introduced in this task.

11. If duplicate CustomerUserLink relationships are prevented by existing constraints, preserve and handle those constraints correctly.

12. Error handling should follow existing Medcal patterns rather than introducing unrelated error semantics.

---

# Database / Schema

First determine whether the existing CustomerUserLink model is already sufficient.

If it is sufficient:

- do NOT create a migration
- use the existing schema as-is

Only create a migration if the actual implementation proves that the existing schema cannot support the agreed flow.

If a migration is genuinely required, stop and clearly report why it is required before proceeding with unrelated implementation.

Do not modify schema speculatively.

---

# Tests

Add or update tests following the project's existing testing conventions.

At minimum cover:

## A. Customer self-registration remains pending

Customer self-registers
→ User exists
→ User is pending
→ CustomerUserLink does not yet exist

## B. Staff approval creates the relationship

Pending User

- valid selected Customer
  → approval succeeds
  → CustomerUserLink exists

## C. Invalid Customer cannot be linked

Pending User

- nonexistent/invalid Customer
  → approval rejected
  → CustomerUserLink is not created

## D. Unauthorized staff cannot perform the action

Verify the existing staff authorization rules still protect the approval operation.

## E. Existing approval flows do not regress

Verify existing membership/approval behavior for other user types remains intact.

## F. Relationship can be resolved

Verify the resulting relationship can be resolved according to the existing model/API conventions:

User
→ CustomerUserLink
→ Customer

and/or:

Customer
→ CustomerUserLink
→ User

depending on the existing model design.

Do not invent a new query pattern if an existing one can be reused.

---

# Implementation Discipline

Keep the implementation focused.

Reuse existing:

- services
- controllers
- DTOs
- guards
- access-control mechanisms
- API hooks
- UI components
- query patterns
- error handling
- testing patterns

Avoid:

- speculative abstractions
- unrelated refactoring
- renaming established concepts
- changing existing API contracts unnecessarily
- modifying unrelated modules
- changing authentication architecture
- introducing infrastructure changes

The additional ~10 days before the 05/10 meeting are NOT a reason to expand this task.

Use the additional time to make this authorization foundation correct, tested, and maintainable.

---

# Explicitly Out of Scope

Do NOT implement any of the following:

- apps/customer-portal
- Customer Portal pages
- Customer Portal authentication UI
- QR code generation
- QR code printing
- certificate QR URLs
- certificate deep-link pages
- certificate public API
- certificate authorization endpoint
- certificate PDF serving changes
- dashboard
- customer progress tracking
- feedback
- customer plan
- customer account/profile features unrelated to this approval flow
- Dockerfile
- docker-compose changes
- Nginx changes
- DNS
- SSL/ACME
- VPS changes
- infrastructure changes
- anonymous certificate access

These will be separate implementation steps after this authorization foundation is verified.

---

# Validation

After implementation:

1. Run the relevant backend tests.
2. Run the relevant frontend/staff UI tests.
3. Run typecheck/lint for affected packages if available.
4. Verify the complete approval flow.
5. Verify an approved user has the expected CustomerUserLink.
6. Verify a pending user still behaves as pending.
7. Verify invalid Customer selection is rejected.
8. Verify existing approval/membership flows do not regress.

Clearly distinguish:

- failures introduced by this implementation
- pre-existing failures
- unrelated environment/infrastructure failures

Do not claim success for tests that were not actually run.

---

# Final Report

When finished, provide a concise but complete report containing:

## 1. Audit Findings

Describe the existing registration, pending authorization, approval, membership, Customer, and CustomerUserLink architecture that was found.

## 2. Implementation

Explain exactly how the existing approval flow was extended.

## 3. Files Changed

List every changed file and its purpose.

## 4. Final Flow

Show the final implemented flow:

Self-registration
→ Pending
→ Staff selects Customer
→ Staff approves
→ CustomerUserLink created
→ User authorized for that Customer

## 5. API Changes

Document any endpoint, DTO, service, controller, or hook changes.

## 6. UI Changes

Document the staff approval UI changes.

## 7. Database

Explicitly state:

- whether a migration was required
- whether CustomerUserLink existing schema was sufficient

## 8. Tests

Report:

- tests added/changed
- tests executed
- results
- pre-existing failures, if any

## 9. Scope Verification

Explicitly confirm that the following were NOT implemented:

Customer Portal
QR
certificate API
Docker
Nginx
DNS
infrastructure

## 10. Readiness for Next Step

State whether this CustomerUserLink foundation is ready for the next implementation phase: the isolated Customer Portal and authenticated certificate deep-link flow.

Do not proceed beyond this scope without explicit instruction.
