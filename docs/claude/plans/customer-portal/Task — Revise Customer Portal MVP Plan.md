# Task — Revise Customer Portal MVP Plan: Authenticated Customer + Manual Approval

Revise the existing Customer Portal implementation plan:

docs/claude/plans/customer-portal/Customer_Portal_MVP_Isolated_Implementation_Plan.md

Also use the latest authentication audit:

docs/claude/plans/customer-portal/Audit_Customer_Portal_Auth_Shared_AuthPackage.md

## IMPORTANT

This is PLAN-ONLY.

Do NOT implement anything.

Do NOT create or modify application code, schema, migrations, Docker, Nginx, DNS, VPS configuration, or infrastructure.

The only permitted repository modification is the existing Customer Portal planning document.

---

## FINAL PRODUCT DECISION — LOCKED

The previous plan incorrectly treated QR certificate access as anonymous/public token-based access.

That is NO LONGER the intended architecture.

Final direction:

Customer Portal is an authenticated customer-facing application using the shared @medcal/auth foundation.

Customer registration is:

Self-service registration + manual approval by an internal user before the customer receives access to customer data.

The customer does NOT receive certificate access merely by possessing a QR code or certificate URL.

---

## 1. CUSTOMER REGISTRATION

Customer enters the portal from the public website through the new top-right navigation action:

Masuk

This replaces the current top-right:

Konsultasikan Kebutuhan Anda

The existing hero CTA "Konsultasikan Kebutuhan Anda" remains unchanged for lead/contact purposes.

Authentication flow:

Public Website
→ Masuk
→ Customer Portal
→ Sign In / Sign Up

If the customer does not have an account:

Sign Up
→ Account created
→ Pending approval
→ Internal user manually approves
→ Customer account becomes authorized

Customer registration is self-service.

There is NO invite-only requirement for the initial customer registration model.

---

## 2. MANUAL APPROVAL

Manual approval is REQUIRED before the customer can access customer-specific data.

Do not invent a new approval concept if an existing approval/user-management mechanism can be reused.

Clearly distinguish:

Authentication = Who is this User?

Authorization = Which Customer does this User belong to, and is this User approved to access that Customer?

The latest audit identified CustomerUserLink as the intended User ↔ Customer relationship, but it currently has no active consumers in the codebase.

The revised plan must account for this gap.

Required architecture:

Self-service registration
→ Customer User
→ Manual internal approval
→ CustomerUserLink
→ Authenticated Customer identity
→ Customer-scoped authorization

Do NOT implement this.

Do NOT create a new schema unless the audit proves the existing model is insufficient.

---

## 3. SHARED @medcal/auth

The revised plan MUST use @medcal/auth as the shared authentication foundation.

Do NOT design a separate authentication system for Customer Portal.

The latest audit established that:

- CUSTOMER is already a live role.
- @medcal/auth is already used by the existing customer-facing portal surface.
- AuthProvider is generic enough to be reused by an isolated Customer Portal.
- Cross-subdomain session behavior can be handled through existing auth configuration such as COOKIE_DOMAIN and TRUSTED_ORIGINS, subject to implementation verification.

Preserve application isolation:

apps/portal
→ @medcal/auth
→ Management users

apps/customer-portal
→ @medcal/auth
→ Customer users

Shared authentication foundation does NOT mean sharing Management Portal application code or authorization assumptions.

---

## 4. CUSTOMER PORTAL ENTRY FROM PUBLIC WEBSITE

The public website navigation should be updated as part of the Customer Portal rollout.

Current top-right CTA:

Konsultasikan Kebutuhan Anda

becomes:

Masuk

The existing hero CTA:

Konsultasikan Kebutuhan Anda

remains unchanged.

The plan should identify the relevant public website file/component that will eventually need this UI change.

Planning only. Do NOT modify it.

---

## 5. QR IS A DEEP LINK, NOT AUTHENTICATION

QR must NOT be treated as the credential that grants certificate access.

Intended flow:

Certificate QR
→ customer.kalibrasimedika.co.id/certificate/<reference>
→ Customer Portal

If already authenticated:

Customer Portal
→ Authenticated Customer
→ Authorization check
→ Does certificate belong to this Customer?
→ YES: Certificate
→ NO: Access denied

If not authenticated:

QR
→ Customer Portal
→ Sign In / Sign Up
→ Manual approval if required
→ Return to original certificate URL
→ Customer authorization
→ Certificate

The plan MUST include return-to/deep-link behavior.

Do not require the customer to manually find the certificate again after login.

---

## 6. CERTIFICATE AUTHORIZATION

Certificate lookup must NOT be:

valid token = anyone can view

Instead:

verification/reference +
authenticated customer identity +
customer authorization
→ certificate access

The backend must establish:

Authenticated User
→ CustomerUserLink
→ Customer
→ Certificate.customerId

before returning customer-specific certificate data.

The exact authorization implementation should follow existing repository conventions.

Do not invent a new authorization framework.

Do not rely on UI checks.

---

## 7. verificationToken

Keep the existing Certificate.verificationToken in the architecture where useful for certificate identification/deep-linking.

Explicitly document:

verificationToken is NOT the authentication credential and must NOT bypass customer authentication/authorization.

The plan should still address:

- token entropy
- enumeration resistance
- token generation
- token exposure in QR URL
- invalid/revoked certificate behavior
- rate limiting

Do not design anonymous certificate access around the token.

---

## 8. REVISE THE API FLOW

Replace the previous anonymous model with an authenticated/customer-authorized model.

Conceptual flow:

Customer Portal
→ @medcal/auth session
→ web-api
→ apps/api
→ authenticate user
→ resolve Customer identity
→ authorize CustomerUserLink
→ certificate lookup
→ certificate

The plan must explain where authentication/session information crosses:

customer-portal
→ web-api
→ api

and how authorization is enforced server-side.

Do not rely on client/UI checks.

Do not implement the endpoint.

---

## 9. REGISTRATION → APPROVAL → CUSTOMER ACCESS

The revised plan MUST include the complete lifecycle:

Public Website
→ Masuk
→ Customer Portal
→ Sign Up / Login
→ Authenticated User
→ Pending approval
→ Internal User Manual Approval
→ CustomerUserLink
→ Customer Account Authorized

Then:

Customer Account
→ Scan QR
→ Certificate deep link
→ Customer authorization
→ Certificate

---

## 10. PENDING APPROVAL UX

Define the expected state when a newly registered customer has not yet been approved.

At minimum:

Registration successful
→ Pending approval
→ Customer cannot access customer-specific data yet

Identify the existing UI/auth pattern that should be reused.

Do not invent detailed UI copy unless necessary.

---

## 11. WHAT MUST CHANGE IN THE EXISTING PLAN

Update sections dealing with:

- Authentication Boundary
- Certificate API Architecture
- QR Architecture
- Security Considerations
- MVP Scope
- Implementation Phases
- 5-Day Critical Path
- Acceptance Criteria
- Risks / Open Questions
- Files Expected to Change

Remove or rewrite every statement implying:

- MVP has no authentication
- possession of verificationToken is sufficient for certificate access
- anonymous QR certificate access

Those are no longer valid architectural decisions.

---

## 12. MVP SCOPE

### Must Have

- apps/customer-portal
- @medcal/auth integration
- Customer sign-up
- Customer sign-in
- Customer pending-approval state
- Internal manual approval flow
- Customer ↔ User authorization relationship
- Authenticated certificate access
- QR certificate deep link
- Return-to after authentication
- Certificate viewing/access
- Production customer domain
- HTTPS
- Basic abuse protection

### Reuse

- @medcal/auth
- @medcal/shared
- @medcal/ui
- existing customer registration conventions
- existing approval/user-management conventions where applicable
- existing API infrastructure
- existing certificate/document infrastructure
- existing deployment patterns

### NOT MVP

Keep these out:

- Customer dashboard
- Calibration progress
- Customer history
- Feedback
- Notifications
- Customer Plan
- Advanced customer engagement
- Google Drive integration

---

## 13. REVISED IMPLEMENTATION PHASES

Rework the phases so authentication and authorization are mandatory MVP components.

Suggested direction:

Phase 1 — Customer Portal application foundation

Plan isolated apps/customer-portal.

Phase 2 — Customer authentication

Reuse @medcal/auth for customer sign-in/sign-up.

Phase 3 — Customer registration approval

Reuse the existing manual approval convention/mechanism and establish:

User
→ CustomerUserLink
→ Customer

Phase 4 — Customer authorization

Ensure authenticated customer access is scoped to the correct Customer.

Phase 5 — Certificate API

Certificate lookup requires authenticated customer authorization.

Phase 6 — Certificate UI + return-to flow

Phase 7 — QR integration

QR is a deep link to the certificate route.

Phase 8 — Docker / production deployment

Phase 9 — Nginx / DNS / HTTPS

Phase 10 — End-to-end verification

Adjust exact ordering based on repository findings, but do NOT reintroduce anonymous certificate access.

---

## 14. REVISED 5-DAY CRITICAL PATH

Reconsider the previous 5-day critical path because authentication + approval is now part of MVP.

The critical path must include:

Customer authentication
→ Customer registration
→ Manual approval
→ Customer authorization
→ Certificate API
→ Customer Portal certificate page
→ QR
→ Production deployment

Identify what can run in parallel.

Do not hide the CustomerUserLink/approval gap as a future enhancement.

It is part of the MVP access model.

---

## 15. ACCEPTANCE CRITERIA

### Authentication

- Customer can self-register.
- Customer can sign in.
- Existing @medcal/auth foundation is reused.
- Customer does not need to sign in repeatedly while a valid session exists.

### Approval

- Newly registered customer is not automatically granted customer data access.
- Internal user can manually approve the customer using the existing approval convention/mechanism.
- Approved customer is linked to the correct Customer.
- Pending customer cannot access certificate/customer data.

### Authorization

- Authenticated Customer A cannot access Customer B's certificate.
- Certificate access is determined server-side.
- QR possession alone does not grant access.

### QR

- QR opens the correct certificate deep link.
- Unauthenticated customer is redirected to sign-in/sign-up.
- After authentication, customer returns to the original certificate route.
- Authorization is checked before certificate data is returned.

### Isolation

- Customer Portal remains an independent application.
- Management Portal routes and authorization assumptions are not inherited accidentally.

---

## 16. OPEN QUESTIONS

Do NOT reopen already-decided product questions.

LOCKED:

- isolated apps/customer-portal
- shared @medcal/auth
- self-service customer registration
- manual internal approval
- authenticated Customer Portal
- QR as deep link, not authentication
- customer authorization before certificate access
- top-right public website CTA becomes Masuk
- hero "Konsultasikan Kebutuhan Anda" remains

Only retain genuinely unresolved technical questions, for example:

- exact existing approval UI/service that should be reused
- exact implementation point for CustomerUserLink
- exact certificate creation/issuance flow for verificationToken generation
- final production customer domain
- DNS/SSL timing
- whether existing certificates require backfill/token generation

Do not reopen self-service vs invite. The decision is self-service + manual approval.

---

## 17. FINAL ARCHITECTURE DECISION

End the revised plan with this architectural statement:

Customer Portal is a fully isolated application that reuses the shared @medcal/auth authentication foundation. Customers self-register and authenticate once, but customer data access remains gated by manual internal approval and an explicit User ↔ Customer relationship. QR codes act as deep links to certificates, not as authentication credentials. Certificate access requires both an authenticated customer session and server-side authorization that the certificate belongs to the customer's authorized Customer context.

Then provide:

### Critical Path

The minimum sequence required for MVP.

### Infrastructure Dependencies

Explicitly list:

- DNS
- Nginx
- Docker
- VPS
- SSL
- SSH/add-ssh
- environment variables

### Security Decision

Explicitly state:

Possession of a QR/code/token alone is insufficient to access a certificate.

### Open Questions

Only genuine technical unknowns.

### Ready for Implementation?

Answer:

YES / YES WITH PREREQUISITES / NO

with concrete reasons.

---

## HARD CONSTRAINTS

PLAN ONLY.

Do NOT:

- create apps/customer-portal
- modify apps/portal
- modify apps/api
- modify apps/web-api
- modify Prisma/schema
- create migrations
- add dependencies
- modify Docker
- modify docker-compose
- modify Nginx
- modify DNS
- modify VPS
- add SSH keys
- implement QR
- implement certificate API
- implement authentication
- implement approval
- implement CustomerUserLink
- commit changes

Only revise:

docs/claude/plans/customer-portal/Customer_Portal_MVP_Isolated_Implementation_Plan.md

Do not create implementation scaffolding.

---

## FINAL RESPONSE

After completing the revision, provide a concise summary of:

1. What changed from the previous plan.
2. How authentication now works.
3. How manual approval now works.
4. How QR access now works.
5. The revised critical path.
6. Any genuine blockers.

Again: PLAN ONLY. No implementation.
