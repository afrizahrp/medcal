# SENIOR ARCHITECTURE REVIEW
## Separate Internal Staff Auth vs Customer Portal Auth

**ROLE**

Act as a senior software architect and security engineer.

Your task is to perform an **architecture review and redesign proposal** for the authentication/registration architecture of this repository.

You are reviewing an existing implementation that was recently created by another AI coding agent.

### VERY IMPORTANT

**DO NOT MODIFY THE CODE YET.**

Do not:

- edit files
- create files
- delete files
- refactor
- migrate
- change database schema
- change Better Auth configuration
- install dependencies
- run automated fixes
- implement your recommendation

You may inspect the entire repository, trace code paths, run read-only commands/tests if useful, and analyze the existing implementation.

Your output must be:

1. Architecture audit
2. Security analysis
3. Architecture alternatives
4. Clear recommendation
5. Detailed implementation plan

I will explicitly approve the implementation in a later step.

---

# 1. BUSINESS CONTEXT

This application has two fundamentally different user contexts.

## INTERNAL STAFF

Internal company employees use:

```text
apps.kalibrasimedika.co.id
```

Internal staff registration must satisfy:

```text
email domain = @kalibrasimedika.co.id
AND
EmailWhitelist status = ACTIVE
```

Examples:

```text
staff@kalibrasimedika.co.id
    → allowed only if whitelisted

staff@gmail.com
    → must be rejected for INTERNAL STAFF registration

staff@othercompany.com
    → must be rejected for INTERNAL STAFF registration
```

---

## CUSTOMER PORTAL

External customers use:

```text
portal.kalibrasimedika.co.id
```

Customer registration must allow any valid email domain.

Examples:

```text
customer@gmail.com
customer@company.com
customer@othercompany.com
customer@kalibrasimedika.co.id
```

All are potentially valid customer accounts.

Customer registration must **NOT** require `EmailWhitelist`.

---

# 2. THE ARCHITECTURAL QUESTION

The current system has historically treated Staff and Customer authentication too similarly.

The key question I want you to answer is:

> **Should Internal Staff and Customer Portal have separate authentication entry points/pages and registration flows, while still sharing the same underlying authentication infrastructure?**

I am considering an architecture like:

```text
apps.kalibrasimedika.co.id
    ↓
Staff Login / Register
    ↓
Staff Registration Policy
    ↓
EmailWhitelist + Company Domain


portal.kalibrasimedika.co.id
    ↓
Customer Login / Register
    ↓
Customer Registration Policy
    ↓
Any Valid Email


                ↓
        Shared Better Auth
                ↓
       Shared User / Account
                ↓
            Session
                ↓
         Membership
                ↓
       Role / Permission
```

I do **NOT** want two independent authentication systems.

The goal is:

### Separate

- application entry point
- login/register UI
- registration policy
- onboarding policy
- staff/customer-specific authorization

### Shared

- Better Auth
- authentication mechanism
- User
- Account
- Session
- password handling
- email verification
- password reset
- common auth infrastructure

Determine whether this is actually the best architecture for the existing codebase.

---

# 3. IMPORTANT EXISTING IMPLEMENTATION

Another AI agent (Cursor) has already implemented a solution based on:

```text
Origin
   ↓
Registration Context
   ↓
INTERNAL_STAFF / CUSTOMER_PORTAL
   ↓
different registration rules
```

The implementation report is summarized below.

Treat this as **existing implementation context**, NOT as an architectural decision that must be preserved.

You are explicitly allowed to conclude that this architecture should be simplified, replaced, or partially removed.

---

## Cursor Implementation Report

### Current implementation

The system now distinguishes Internal Staff and Customer Portal based on the `Origin` header.

Reported behavior:

```text
apps.*    → INTERNAL_STAFF
portal.*  → CUSTOMER_PORTAL
```

Internal Staff:

```text
@kalibrasimedika.co.id
+
EmailWhitelist ACTIVE
```

Customer Portal:

```text
any valid email domain
```

Unknown/missing Origin:

```text
REGISTRATION_ORIGIN_NOT_ALLOWED
```

The report says this was implemented because the application previously had:

- one Better Auth endpoint
- one registration page
- no server-trusted discriminator

The new implementation added:

```text
packages/shared/src/utils/registration-context.ts

apps/api/src/modules/whitelist/registration-context.store.ts

apps/api/src/modules/whitelist/registration-context.hook.ts
```

and modified:

```text
packages/shared/src/utils/index.ts

packages/auth/src/index.ts

apps/api/src/modules/whitelist/registration-gate.ts

apps/api/src/modules/whitelist/registration-gate.hook.ts

apps/api/src/modules/whitelist/whitelist.module.ts

apps/api/src/modules/whitelist/registration-gate.integration.test.ts

apps/api/src/bootstrap-superadmin.ts

apps/api/src/modules/chat/chat.gateway.security.test.ts

apps/api/src/modules/chat/chat-socket-auth.precedence.test.ts

apps/portal/src/app/sign-in/register/page.tsx
```

The implementation uses a context stash because AsyncLocalStorage was reportedly not propagating through Better Auth's transaction handling.

The report specifically says:

```text
Browser
  ↓
Better Auth
  ↓
resolveRegistrationContext(origin)
  ↓
stashSignUpContext(email, context)
  ↓
registration gate
  ↓
database user creation hook
  ↓
takeSignUpContext(email)
  ↓
re-check registration gate
```

The report also states:

> Origin is not a secret and curl can spoof the Origin header.

The report calls this a residual risk and relies on role guards / whitelist to prevent internal privilege escalation.

The report also says:

```text
Customer Portal + @kalibrasimedika.co.id
    → ALLOW
```

while:

```text
Internal Staff + external email
    → REJECT
```

Automated tests reportedly pass, including:

```text
shared tests: 26 passed
registration gate integration tests: 25 passed
typecheck: OK
```

The report also identifies as future follow-up:

- email change/account linking not covered
- signed invitation/token for staff-only registration not implemented
- separate registration endpoint not implemented

---

# 4. DO NOT BLINDLY ACCEPT THE CURSOR DESIGN

This is extremely important.

Do NOT conclude:

> "The Cursor implementation is correct because the tests pass."

Instead, evaluate whether the current implementation is **architecturally appropriate**.

I specifically want you to challenge this question:

> Are we adding `RegistrationContext`, Origin resolution, context storage, hooks, and context-aware registration gates primarily because we are trying to force two fundamentally different registration experiences through one page and one registration flow?

If yes, say so explicitly.

---

# 5. FIRST: AUDIT THE ACTUAL CODEBASE

Do not rely only on the report above.

Inspect the actual repository.

Map:

### Authentication

- Better Auth configuration
- auth package
- sign-in
- sign-up
- session
- account
- email verification
- password reset
- email change
- account linking

### Registration

Find:

- registration page
- registration route
- Better Auth sign-up endpoint
- registration hooks
- registration gates
- EmailWhitelist
- user creation

### Authorization

Find:

- UserMembership
- membership creation
- role assignment
- permission assignment
- internal staff guards
- customer guards
- authorization middleware

### Application boundaries

Find:

- `apps.*`
- `portal.*`
- proxy/middleware
- hostname detection
- trusted origins
- routing architecture

---

# 6. BUILD THE CURRENT ARCHITECTURE MAP

Create a concrete architecture map based on the actual code.

For example:

```text
Browser
   ↓
apps / portal
   ↓
Proxy / Middleware
   ↓
Frontend auth page
   ↓
API
   ↓
Better Auth
   ↓
User / Account / Session
   ↓
Membership
   ↓
Role / Permission
```

Show exactly where the current Staff/Customer distinction occurs.

Show where:

```text
EmailWhitelist
RegistrationContext
Origin
Membership
Role
Permission
```

are involved.

Do not invent components that do not exist.

---

# 7. CORE ARCHITECTURE REVIEW

Compare these approaches.

---

## OPTION A — CURRENT ORIGIN-BASED MODEL

```text
One auth page
One registration flow
One Better Auth endpoint

Origin
  ↓
RegistrationContext
  ↓
Staff / Customer
```

Evaluate:

- security
- maintainability
- complexity
- cognitive load
- testability
- coupling
- debugging
- extensibility

Especially evaluate whether `Origin` is an appropriate **security boundary**.

---

## OPTION B — SEPARATE ENTRY POINTS, SHARED AUTH

```text
apps.kalibrasimedika.co.id
    ↓
Staff Login/Register


portal.kalibrasimedika.co.id
    ↓
Customer Login/Register


             ↓
      Shared Better Auth
             ↓
      Shared User/Account
             ↓
           Session
```

Evaluate:

- whether this can be cleanly implemented with the current Better Auth setup
- whether it reduces complexity
- whether registration policy becomes clearer
- whether it avoids unnecessary context machinery
- whether it creates any new security problems

---

## OPTION C — SEPARATE REGISTRATION ENDPOINTS, SHARED AUTH

Conceptually:

```text
/api/auth/staff-sign-up
/api/auth/customer-sign-up
```

but both eventually use shared authentication infrastructure.

Evaluate:

- whether Better Auth supports this cleanly
- whether custom endpoints are justified
- whether this creates duplicate authentication logic
- whether it improves security
- whether it increases maintenance burden

---

## OPTION D — SEPARATE ENTRY POINT + INVITATION / AUTHORIZATION

Staff registration could require an explicit server-verifiable invitation or authorization mechanism.

Customer registration remains unrestricted.

Evaluate:

- whether this is necessary
- whether it is overengineering
- whether it provides meaningful security improvement
- whether it fits the existing business process

---

# 8. SECURITY THREAT MODEL

Analyze these scenarios explicitly.

## Scenario 1

Customer:

```text
portal.kalibrasimedika.co.id
customer@gmail.com
```

Expected:

```text
Customer account → ALLOW
```

---

## Scenario 2

Someone tries to create an internal account:

```text
apps.kalibrasimedika.co.id
attacker@gmail.com
```

Expected:

```text
REJECT
```

---

## Scenario 3

Someone bypasses the UI and calls the API directly.

They manipulate:

```text
Origin
Host
request body
registrationContext
```

Determine whether they can:

- create an account
- obtain customer membership
- obtain internal membership
- obtain internal role
- obtain internal permissions

Distinguish clearly between:

### Account creation

and:

### Internal privilege escalation

Do not treat them as the same thing.

---

## Scenario 4

A customer registers using:

```text
employee@kalibrasimedika.co.id
```

through the Customer Portal.

Expected:

```text
Customer account
```

not:

```text
Internal Staff
```

---

## Scenario 5

An existing Customer attempts to become Internal Staff through:

- membership assignment
- role assignment
- invitation
- email change
- account linking
- admin action

Audit every possible path.

---

# 9. VERY IMPORTANT: EMAIL DOMAIN IS NOT IDENTITY

Challenge the assumption that:

```text
@kalibrasimedika.co.id
=
Internal Staff
```

The business requirement currently says Staff registration requires:

```text
company domain
+
EmailWhitelist
```

while Customer Portal may accept company-domain emails.

Therefore determine whether the real identity model should be:

```text
Email
+
Membership
+
Role
+
Authorization
```

rather than:

```text
Email domain
=
user type
```

This distinction is critical.

---

# 10. REVIEW EMAILWHITELIST

Determine exactly what `EmailWhitelist` represents.

Is it:

- authentication?
- registration authorization?
- staff pre-authorization?
- invitation?
- authorization?
- domain restriction?

Recommend the cleanest responsibility.

The desired invariant is:

```text
INTERNAL STAFF
    ↓
company email
    +
EmailWhitelist ACTIVE
```

while:

```text
CUSTOMER
    ↓
any valid email
```

Do not allow the Staff rule to accidentally leak into Customer registration.

---

# 11. REVIEW REGISTRATION-CONTEXT MACHINERY

Audit whether these components are still justified:

```text
registration-context.ts
registration-context.store.ts
registration-context.hook.ts
registration-gate.ts
registration-gate.hook.ts
```

For each component, classify:

```text
KEEP
SIMPLIFY
REPLACE
REMOVE
```

and explain why.

Pay particular attention to:

```text
context stored by email
```

because this may introduce:

- concurrency concerns
- duplicate signup issues
- retry behavior
- multi-instance problems
- race conditions
- stale state

Determine whether this is appropriate for production.

---

# 12. MAINTAINABILITY TEST

Imagine a developer joins the project six months from now.

They need to understand:

```text
Why does staff registration reject Gmail?
Why can portal accept Gmail?
Why is EmailWhitelist checked here?
Why is Origin converted into RegistrationContext?
Why is context stashed by email?
Why is the context checked twice?
Why is role guard also checking the domain?
```

Compare the cognitive complexity of the current design against a design where:

```text
apps.*
    = Staff authentication entry point

portal.*
    = Customer authentication entry point
```

while Better Auth remains shared.

Tell me which architecture is easier to understand and why.

---

# 13. FUTURE EXTENSIBILITY

Consider possible future application contexts:

```text
Staff
Customer
Technician
Partner
Vendor
```

Compare:

### Single auth page

```text
registrationContext =
  STAFF
  CUSTOMER
  TECHNICIAN
  PARTNER
  VENDOR
```

against:

### Separate application entry points

```text
apps.*
portal.*
technician.*
partner.*
vendor.*
```

Do not automatically assume separate applications are better.

Evaluate objectively.

---

# 14. DATABASE MODEL

Determine whether the recommended architecture requires changes to:

- User
- Account
- Session
- UserMembership
- Role
- Permission
- EmailWhitelist

Prefer **NO DATABASE CHANGE** if the existing model already supports the distinction cleanly.

If a schema change is actually necessary, explain exactly why.

---

# 15. BETTER AUTH ARCHITECTURE

This is a critical part.

Determine whether we can have:

```text
Staff UI
    ↓
Shared Better Auth


Customer UI
    ↓
Shared Better Auth
```

without duplicating:

- password logic
- session logic
- account logic
- verification
- password reset
- auth configuration

Inspect the actual Better Auth integration in this repository.

Do not answer from generic Better Auth assumptions alone.

---

# 16. RECOMMENDATION

After the audit, make ONE clear architectural recommendation.

Do not answer:

> "It depends."

Choose the architecture that is best for this project.

Your recommendation must explicitly answer:

1. Should Staff login/register and Customer login/register be separate pages?
2. Should they use separate routes?
3. Should they use different hostnames/subdomains?
4. Should they use one Better Auth instance/configuration?
5. Should the Better Auth endpoint remain shared?
6. Should registration endpoints be separated?
7. Where should `EmailWhitelist` be enforced?
8. Where should Staff authorization be enforced?
9. Where should Customer authorization be enforced?
10. Is `Origin → RegistrationContext` still necessary?
11. Is `registration-context.store` still necessary?
12. Is database schema change required?

---

# 17. TARGET ARCHITECTURE

Provide a concrete final architecture diagram.

The desired conceptual direction is:

```text
                  SHARED AUTH CORE
                    Better Auth
                         │
              ┌──────────┴──────────┐
              │                     │
        INTERNAL STAFF        CUSTOMER PORTAL
              │                     │
          apps.*                  portal.*
              │                     │
       Login / Register        Login / Register
              │                     │
      Staff Registration       Customer Registration
           Policy                  Policy
              │                     │
       EmailWhitelist                │
              │                     │
              └──────────┬──────────┘
                         │
                        User
                         │
                    Membership
                         │
                   Role / Permission
```

Modify this diagram according to your actual recommendation.

---

# 18. IMPLEMENTATION PLAN

Do NOT implement.

Instead provide a detailed implementation plan.

Structure:

## Phase 1 — Preparation

What must be confirmed before changes?

## Phase 2 — Authentication Entry Points

Which routes/pages need to change?

## Phase 3 — Registration Policy

How should Staff and Customer registration policies be separated?

## Phase 4 — Better Auth

What changes, if any, are required?

## Phase 5 — Remove / Simplify Existing Context Machinery

Which Cursor-created components can be removed or simplified?

## Phase 6 — Authorization

How should Staff vs Customer membership/roles be enforced?

## Phase 7 — Testing

Define unit/integration/e2e tests.

## Phase 8 — Manual Verification

Define exact manual scenarios.

---

# 19. TEST MATRIX

Provide at least this matrix:

| Entry Point | Email | Whitelist | Expected |
|---|---|---|---|
| Staff | staff@kalibrasimedika.co.id | ACTIVE | ALLOW |
| Staff | staff@gmail.com | N/A | REJECT |
| Staff | staff@othercompany.com | N/A | REJECT |
| Staff | staff@kalibrasimedika.co.id | NONE | REJECT |
| Customer | customer@gmail.com | N/A | ALLOW |
| Customer | customer@othercompany.com | N/A | ALLOW |
| Customer | customer@kalibrasimedika.co.id | NONE | ALLOW |

Add tests for:

- direct API access
- spoofed Origin
- manipulated request body
- membership escalation
- role escalation
- email change
- account linking
- concurrent registration
- multiple API instances if relevant

---

# 20. FINAL OUTPUT FORMAT

Your final response must contain exactly these major sections:

## 1. Executive Verdict

Give me the architectural conclusion first.

## 2. Current Architecture

What actually exists today.

## 3. Problems With Current Architecture

Especially identify unnecessary complexity caused by combining Staff and Customer registration.

## 4. Security Analysis

Focus on actual attack paths.

## 5. Architecture Options

Compare A/B/C/D.

Use a table:

| Option | Security | Complexity | Maintainability | Scalability | Recommendation |
|---|---|---|---|---|---|

## 6. Recommended Architecture

ONE clear choice.

## 7. Target Architecture Diagram

Concrete diagram.

## 8. Existing Cursor Changes

For every major Cursor-created component:

```text
KEEP / SIMPLIFY / REPLACE / REMOVE
```

with justification.

## 9. Implementation Plan

Detailed but implementation must NOT be performed.

## 10. Test Plan

Unit + integration + E2E + manual.

## 11. Final Architecture Decision

End with:

```text
ARCHITECTURE DECISION:
<one clear sentence>
```

---

# FINAL RULE

**DO NOT WRITE CODE.**

**DO NOT MODIFY THE REPOSITORY.**

**DO NOT "FIX" THE CURRENT IMPLEMENTATION.**

First prove what the correct architecture should be.

I will explicitly approve the architecture before asking you to implement it.