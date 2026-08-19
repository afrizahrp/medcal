# ARCHITECTURE DECISION REVISION — G4

We need to revise a previously locked architectural decision.

The previous G4 decision was:

> **G4 = B — Customer onboarding via per-email whitelist.**

That decision is now **REVOKED**.

## NEW G4 DECISION

### G4 = CUSTOMER SELF-REGISTRATION WITHOUT EMAIL WHITELIST

Customers must be allowed to register using their own email address.

Examples:

- Gmail
- Outlook
- Yahoo
- corporate/institutional email
- hospital domain
- laboratory domain
- other legitimate customer email domains

Customer registration must **NOT require `EmailWhitelist`**.

The customer's email address/domain must also **NOT determine whether they receive the CUSTOMER role**.

---

# CORE PRINCIPLE

The architecture is:

> **Account registration ≠ application provisioning.**

This applies to CUSTOMER as well as internal users.

A successful customer registration only creates an account.

It does NOT grant application access.

Expected flow:

```text
Customer
    ↓
Register using own email
    ↓
Better Auth creates User
    ↓
User.status = INVITED
    ↓
NO UserMembership
    ↓
NO application access
```

Only after an administrator verifies/provisions the account:

```text
Existing User
    ↓
Admin verifies customer
    ↓
Admin assigns CUSTOMER membership
    ↓
UserMembership.role = CUSTOMER
    ↓
Application access according to CUSTOMER permissions
```

---

# IMPORTANT SECURITY PRINCIPLE

Do NOT solve customer onboarding by automatically assigning:

```text
role = CUSTOMER
```

during registration.

Do NOT allow the registration form to choose the user's role.

Do NOT infer role from:

- email domain
- email provider
- registration form
- query parameter
- request body
- client-side state

The authoritative role remains:

```text
UserMembership.role
```

This is consistent with the existing architecture.

---

# STAFF VS CUSTOMER REGISTRATION

The revised architecture may distinguish registration eligibility between internal staff and customers, but the distinction must NOT grant application authorization.

Conceptually:

```text
INTERNAL STAFF

@kalibrasimedika.co.id
        ↓
registration
        ↓
User
status = INVITED
        ↓
Admin provisioning
```

and:

```text
CUSTOMER

@gmail.com
@hospital.co.id
@laboratory.com
@outlook.com
etc.
        ↓
registration
        ↓
User
status = INVITED
        ↓
Admin provisioning
```

The important difference is registration eligibility.

**Both flows end at the same authorization boundary:**

```text
User
    ↓
UserMembership
    ↓
role
    ↓
permissions
```

---

# EMAIL WHITELIST

The existing `EmailWhitelist` functionality must NOT be deleted.

It remains available for its existing purpose unless another explicit decision changes it.

However:

> `EmailWhitelist` must no longer be required for CUSTOMER registration.

Do not assume that removing the customer whitelist requirement means the whitelist feature itself should be removed.

The existing whitelist may continue to be used for internal/staff registration gating if that is how the current implementation is designed.

---

# REGISTRATION GATE — AUDIT REQUIRED

The existing registration gate currently uses:

```text
company domain
AND
EmailWhitelist ACTIVE
```

according to the forensic audit.

The implementation report also states that the current customer flow still requires the domain check and whitelist, with "domain lock relaxation" potentially required. 

This behavior must now be re-evaluated against the new G4.

Determine exactly how the current registration gate behaves.

Specifically answer:

1. Can `customer@gmail.com` register today?
2. Can `customer@hospital.co.id` register today?
3. Does the current gate require both domain AND whitelist?
4. Is there already any distinction between staff and customer registration?
5. Can the current gate be changed to permit external customer registration without weakening internal staff controls?
6. Does Better Auth registration itself create only the `User` and leave `UserMembership` empty?
7. Is any role or membership accidentally assigned during registration?

Do not assume the answers.

Inspect the actual implementation.

---

# SECURITY REQUIREMENT

Removing the whitelist requirement for CUSTOMER registration must NOT accidentally create application access.

The following must remain true:

```text
Registered customer
    +
no UserMembership
    =
NO application authorization
```

Also verify:

```text
User.status = INVITED
    +
membership exists
    =
determine access according to the agreed status policy
```

Do not invent new status semantics during this task.

---

# EXISTING IMPLEMENTATION MUST BE RE-AUDITED

Because User Management has already been implemented, inspect the actual new code.

Focus on:

- registration gate
- Better Auth sign-up
- User creation
- User.status
- UserMembership creation
- customer role assignment
- Users API
- membership provisioning
- frontend registration flow
- whitelist API/UI
- permission enforcement

Look for assumptions based on the OLD G4:

```text
CUSTOMER → EmailWhitelist
```

and identify every place where that assumption exists.

---

# DO NOT IMPLEMENT YET

This is an **AUDIT + DECISION REVISION ONLY** task.

Do NOT:

- modify code
- modify Prisma schema
- create migrations
- change registration behavior
- remove whitelist logic
- create new endpoints
- refactor
- redesign authentication
- implement email verification
- implement invitation email
- implement password reset

We only want to understand the impact of the new G4 decision first.

---

# ALSO AUDIT THIS IMPORTANT POINT

The previous implementation report says:

> G4 = whitelist per-email — admin whitelist before customer register.

That statement is now obsolete.

Identify all documentation/code comments/tests that encode the old G4 assumption.

Report them.

Do not modify them yet.

---

# REQUIRED OUTPUT

Produce a short **G4 Revision Impact Audit** containing:

## 1. Decision Status

State explicitly:

```text
G1 = LOCKED
G2 = LOCKED
G3 = LOCKED
G4 = REVISED
```

And:

```text
G4:
CUSTOMER may self-register with their own email.
EmailWhitelist is NOT required for CUSTOMER registration.
Registration does NOT create application access.
Admin provisioning remains mandatory.
```

## 2. Current Registration Gate

Describe the actual current code path.

Include exact:

- file
- function/hook
- condition
- relevant behavior

## 3. Old G4 Assumptions

List every implementation/documentation/test location that assumes:

```text
CUSTOMER → EmailWhitelist
```

## 4. Impact Assessment

Classify each affected area:

- NO CHANGE
- NEEDS CHANGE
- NEEDS PRODUCT DECISION
- UNVERIFIED

Cover:

- registration gate
- Better Auth
- User.status
- UserMembership
- Users API
- CUSTOMER role
- whitelist
- frontend registration
- menu access
- backend authorization
- tests

## 5. Security Verification

Confirm whether:

```text
external email registration
    ↓
User only
    ↓
no membership
    ↓
no application access
```

is actually enforced by the current implementation.

If not, identify the exact gap.

## 6. Recommended Change Set

List the **minimum code changes** required to implement the revised G4.

Do NOT implement them.

## 7. Open Decisions

Only list decisions that genuinely remain unresolved.

Do not invent new decisions.

---

# STRICT RULE

The revised G4 must NOT become:

> "Anyone who registers automatically becomes CUSTOMER."

That is explicitly forbidden.

The correct model is:

```text
REGISTRATION
    ≠
PROVISIONING
    ≠
ROLE ASSIGNMENT
```

The administrator remains the authority for application access.

Do not make any code changes until a separate implementation instruction is provided.