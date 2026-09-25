# Medcal — Phase 2: Isolated Customer Portal Foundation

## Context

Phase 1 has been completed and verified.

The existing customer authorization foundation is now implemented:

Customer self-registration
→ account exists without membership
→ internal staff selects the Customer
→ staff approves
→ UserMembership + CustomerUserLink are created atomically
→ the user is authorized for that Customer.

`CustomerUserLink` is now the explicit User ↔ Customer authorization relationship.

The implementation was verified with:

- apps/portal: 230/230 tests passed
- API/typecheck clean for the affected implementation
- no database migration required
- only the intended files were changed

The original implementation timeline was approximately 5 days, but the customer meeting has now been extended to 05/10, giving us approximately 10 additional days.

Use this additional time to implement the architecture properly and test it thoroughly. Do not take shortcuts that weaken authentication or authorization merely to satisfy the original 5-day timeline.

The next goal is to build the foundation of an isolated Customer Portal.

---

# Objective

Create a new isolated application:

`apps/customer-portal`

The application will eventually become the customer-facing portal for Medcal.

For this phase, implement ONLY:

1. isolated Customer Portal application foundation
2. existing Medcal authentication integration
3. customer self-registration
4. sign-in / sign-out
5. pending authorization experience
6. authenticated session handling
7. deep-link / return-to handling required for future QR certificate links

Do NOT implement certificate access, QR generation, certificate API, Docker, Nginx, DNS, or VPS infrastructure in this phase.

---

# Important Product Decision

The Customer Portal is NOT an anonymous certificate viewer.

Customers will use an account-based model similar to a marketplace/social-media style experience:

- customer signs up once
- customer logs in
- session persists according to the existing authentication architecture
- internal Medcal staff approves the account and links it to a Customer
- only then can customer-specific data be accessed

Therefore:

Authentication answers:

"Who is this user?"

`CustomerUserLink` answers:

"Which Customer is this user authorized to represent?"

Do not implement token-only or anonymous customer access.

---

# Existing Architecture To Reuse

Before implementation, audit the existing repository and specifically inspect:

- `apps/tech-pwa`
- `apps/portal`
- `apps/portal/src/app/client`
- `@medcal/auth`
- existing sign-in/sign-up pages
- `AuthProvider`
- existing session handling
- existing customer registration flow
- existing `CUSTOMER` role handling
- existing `ACCOUNT_PENDING` / `PendingAuthorization` behavior
- `CustomerUserLink`
- the Phase 1 implementation of customer approval/linking

Do not assume the previous audit is still accurate without checking the actual current code.

Reuse existing packages, components, patterns, and authentication behavior wherever appropriate.

Do not modify `@medcal/auth` unless the actual implementation proves it is required.

---

# Application Isolation

Create:

`apps/customer-portal`

It must be an independently buildable and runnable Next.js application.

Use the existing repository conventions and the closest appropriate application pattern, especially `apps/tech-pwa`, rather than inventing a new project structure.

The application must NOT become another route inside `apps/portal`.

The goal is application-level isolation:

- independent application lifecycle
- independent build
- independent runtime
- independent deployment later
- no accidental inheritance of Management Portal behavior

Shared packages may still be reused.

---

# Authentication

Integrate the existing `@medcal/auth` package.

The Customer Portal should support:

- sign up
- sign in
- sign out
- authenticated session
- existing auth/session behavior
- existing customer registration rules

Do not create a second authentication system.

Do not create a custom password/session mechanism.

Do not fork or duplicate authentication logic from `apps/portal`.

Verify how the application is identified as the customer-portal origin for the existing registration gate.

Customer self-registration must remain allowed according to the existing customer registration policy.

Do not make registration invitation-only.

---

# Pending Authorization

A newly registered customer user may not yet have a `CustomerUserLink`.

The portal must therefore distinguish:

### Authenticated + authorized

User has:

`User → CustomerUserLink → Customer`

Allow the authenticated customer portal experience.

### Authenticated + pending

User has no CustomerUserLink yet.

Show the existing pending authorization experience.

Do not treat the user as logged out.

Do not automatically assign a Customer.

Do not infer a Customer from:

- email domain
- company name
- registration data
- email address
- user-entered values

The relationship must come from the existing internal approval flow implemented in Phase 1.

Reuse the existing `ACCOUNT_PENDING` / `PendingAuthorization` semantics and UI patterns where appropriate.

---

# Deep-Link / Return-To Flow

This is a critical requirement of this phase.

The future QR flow will open a certificate deep link such as:

`/certificate/<verificationToken>`

The user may not be authenticated when opening that URL.

The Customer Portal must preserve the original destination through authentication.

Desired behavior:

Unauthenticated user opens:

`/certificate/<token>`

↓

Portal detects unauthenticated session

↓

Redirects to sign-in while preserving the original destination

Example concept:

`/sign-in?returnTo=/certificate/<token>`

↓

User signs in

↓

Portal returns the user to:

`/certificate/<token>`

Do not implement the certificate page itself yet.

For this phase, the important requirement is that the authentication layer can safely preserve and restore an internal deep-link destination.

---

# Return-To Security

Do not introduce an open redirect vulnerability.

`returnTo` must be restricted to valid internal application paths.

Do not blindly redirect to an arbitrary external URL supplied by the client.

Reject or ignore unsafe values such as:

- `https://evil.example`
- `//evil.example`
- external domains
- malformed absolute URLs

Use the existing project's conventions if one already exists.

Add tests for safe and unsafe return destinations.

---

# Customer Authorization Boundary

Do not implement certificate authorization yet.

However, establish the correct architectural boundary so that future customer-specific pages can authorize using:

`authenticated User`
→ `CustomerUserLink`
→ `Customer`

Do not introduce an alternative authorization mechanism.

Do not use the `CUSTOMER` role alone as proof that the user may access a specific Customer.

The role identifies the type of user.

`CustomerUserLink` establishes the specific Customer relationship.

---

# UI Scope

Implement only the minimum customer portal screens required for this phase.

Required:

1. Sign in
2. Sign up
3. Pending authorization / waiting state
4. Basic authenticated portal landing page
5. Sign out

The authenticated landing page can be intentionally minimal.

It should communicate that the customer is authenticated and that the portal is ready for customer-specific features.

Do NOT build:

- dashboard
- certificate list
- certificate detail
- progress tracking
- feedback
- customer plan
- quotation
- service history
- device management
- other business features

Those belong to later phases.

---

# UX Expectations

The experience should feel like a customer-facing product, not an internal Management Portal.

However, do not spend significant time on visual polish in this phase.

Prioritize:

- correct authentication
- clear pending state
- predictable navigation
- correct deep-link restoration
- clean separation from Management Portal
- mobile-friendly basic layout

Use existing Medcal design components/patterns where practical.

---

# Routing

Determine the appropriate route structure from the actual application architecture.

At minimum the application needs equivalents of:

- sign-in
- sign-up
- authenticated landing
- pending authorization

Do not create the future certificate route yet unless a minimal placeholder is genuinely required to test the deep-link return mechanism.

If a placeholder is created, it must clearly remain a placeholder and must not expose certificate data.

---

# Environment / Configuration

Audit the repository's existing environment conventions before creating new configuration.

Identify the minimum environment values required by the isolated Customer Portal.

Do not introduce unnecessary environment variables.

The future production domain is expected to be:

`customer.kalibrasimedika.co.id`

Treat this as the planned domain, but do NOT perform DNS/Nginx/VPS changes in this task.

If local/development configuration needs a placeholder origin, follow existing project conventions.

---

# Testing

Add appropriate tests for the new application.

At minimum verify:

## A. Customer registration

Customer Portal can initiate the existing customer self-registration flow.

## B. Sign-in

Valid customer credentials create the expected authenticated session.

## C. Sign-out

Authenticated customer can sign out successfully.

## D. Pending customer

Authenticated CUSTOMER without CustomerUserLink receives the pending authorization experience.

## E. Authorized customer

Authenticated CUSTOMER with a valid CustomerUserLink can reach the authenticated customer portal landing page.

## F. Authentication boundary

Unauthenticated user cannot access authenticated customer portal pages.

## G. Return-to

Unauthenticated access to an internal deep link preserves the destination through sign-in.

Example:

`/certificate/ABC123`

→ sign-in

→ successful login

→ `/certificate/ABC123`

## H. Return-to security

External or unsafe return destinations are rejected.

## I. Existing authentication behavior

Do not regress existing `apps/portal` authentication behavior.

Run the relevant existing tests as well as the new Customer Portal tests.

---

# Important Scope Boundary

DO NOT implement:

- certificate API
- certificate authorization API
- certificate lookup by verificationToken
- QR generation
- QR embedding into PDFs
- certificate PDF access
- verificationToken generation
- Dockerfile
- docker-compose
- Nginx
- DNS
- SSL/ACME
- VPS deployment
- customer dashboard
- certificate history
- progress tracking
- feedback
- customer plan
- new CustomerUserLink schema/migration

The CustomerUserLink foundation already exists from Phase 1.

---

# Implementation Discipline

Before coding:

1. Audit the current repository.
2. Inspect `apps/tech-pwa`.
3. Inspect `apps/portal`.
4. Inspect `@medcal/auth`.
5. Inspect the actual Phase 1 CustomerUserLink implementation.
6. Identify the minimum files required.
7. Explain the implementation approach briefly.

Then implement.

While implementing:

- keep the new application isolated
- reuse existing packages
- reuse existing authentication
- reuse existing UI patterns where appropriate
- avoid modifying shared authentication code unless genuinely necessary
- avoid unrelated refactoring
- avoid modifying Management Portal behavior
- keep the diff focused

Because we now have approximately 10 additional days before the 05/10 meeting, prioritize correctness and test coverage over shortcuts.

Do not use the additional time as a reason to expand scope.

---

# Validation

After implementation:

1. Run all Customer Portal tests.
2. Run relevant `apps/portal` authentication tests.
3. Run relevant API/auth tests if affected.
4. Run typecheck for the new application.
5. Run typecheck for affected existing applications.
6. Run lint if available.
7. Verify that the new app can build independently.
8. Verify the authentication flow.
9. Verify pending authorization behavior.
10. Verify return-to behavior.
11. Verify unsafe return-to values are rejected.

Clearly separate:

- failures introduced by this implementation
- pre-existing failures
- unrelated environment/infrastructure failures

Do not claim tests passed unless they were actually executed.

---

# Final Report

When finished, provide:

## 1. Audit Findings

Summarize the actual existing patterns discovered in:

- apps/tech-pwa
- apps/portal
- @medcal/auth
- customer registration
- pending authorization
- CustomerUserLink

## 2. Application Structure

Show the new `apps/customer-portal` structure and explain the important files.

## 3. Authentication

Explain how the new application reuses `@medcal/auth`.

Explicitly state whether any shared auth code was modified.

## 4. Pending Authorization

Explain how the portal distinguishes:

Authenticated + CustomerUserLink

from:

Authenticated + no CustomerUserLink

## 5. Deep-Link Return

Explain how:

`/certificate/<token>`

will survive the authentication redirect.

Explicitly explain the protection against open redirects.

## 6. Files Changed

List all changed/created files and their purpose.

## 7. Tests

Report:

- tests added
- tests executed
- results
- typecheck results
- build results
- any pre-existing failures

## 8. Scope Verification

Explicitly confirm that these were NOT implemented:

Certificate API
QR
certificate PDF access
Docker
Nginx
DNS
VPS/infrastructure
dashboard
progress
feedback
customer plan

## 9. Readiness

State whether the Customer Portal foundation is ready for the next phase:

Certificate authorization + certificate deep-link/API implementation.

Do not proceed beyond this phase without explicit instruction.
