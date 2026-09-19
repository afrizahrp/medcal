# IMPLEMENTATION TASK — G4 CUSTOMER SELF-REGISTRATION

Implement **ONLY** the revised G4 decision described below.

This is a narrowly scoped implementation task.

---

# LOCKED ARCHITECTURE

## G1

**Account registration ≠ application provisioning.**

Registration creates a `User` account only.

Registration must NOT create:

- `UserMembership`
- role
- permissions
- application access

Admin provisioning remains the authority for application access.

---

## G2

**SUPERADMIN is bootstrap CLI only.**

Do not modify this behavior.

---

## G3

**Disable = `User.status = DISABLED`.**

Do not modify the existing G3 implementation.

Do not change the semantics of:

- `INVITED`
- `ACTIVE`
- `DISABLED`

Do not add automatic activation.

Do not add session revocation.

Do not modify authorization guards except if compilation requires an import/reference correction directly caused by this G4 change.

---

# G4 — NEW DECISION

## CUSTOMER MAY SELF-REGISTER USING THEIR OWN EMAIL

Customers may register using:

- Gmail
- Outlook
- Yahoo
- institutional email
- hospital email
- laboratory email
- other external domains

Customer registration must NOT require `EmailWhitelist`.

Customer registration must NOT require the `kalibrasimedika.co.id` domain.

Customer registration must NOT automatically assign:

```text
CUSTOMER
```

or any other role.

Customer registration must NOT create a membership.

---

# REQUIRED FINAL BEHAVIOR

## External customer

Example:

```text
customer@gmail.com
```

Expected:

```text
customer@gmail.com
        ↓
Better Auth registration
        ↓
User created
        ↓
User.status = INVITED
        ↓
NO UserMembership
        ↓
NO application authorization
```

Likewise:

```text
customer@hospital.co.id
customer@laboratory.com
```

must be able to register without `EmailWhitelist`.

---

# INTERNAL STAFF REGISTRATION

The existing staff registration control MUST remain.

For:

```text
user@kalibrasimedika.co.id
```

the existing rule remains:

```text
domain == kalibrasimedika.co.id
AND
EmailWhitelist.status == ACTIVE
```

Therefore:

### Staff with active whitelist

```text
user@kalibrasimedika.co.id
        +
EmailWhitelist ACTIVE
        ↓
ALLOW registration
```

### Staff without whitelist

```text
user@kalibrasimedika.co.id
        +
NO ACTIVE EmailWhitelist
        ↓
REJECT
```

### Staff with revoked whitelist

```text
user@kalibrasimedika.co.id
        +
EmailWhitelist REVOKED
        ↓
REJECT
```

This staff gate must NOT be weakened.

---

# REGISTRATION GATE LOGIC

The resulting conceptual logic must be:

```text
IF email domain == kalibrasimedika.co.id
    THEN require EmailWhitelist ACTIVE
    ELSE allow registration
```

Do NOT implement:

```text
domain OR whitelist
```

Do NOT implement:

```text
domain AND whitelist
```

for all users.

The `AND` rule applies specifically to the internal company domain.

External domains bypass the staff whitelist requirement.

---

# VERY IMPORTANT — DO NOT CREATE ROLE INFERENCE

Do NOT implement logic such as:

```text
gmail.com → CUSTOMER
hospital.co.id → CUSTOMER
external domain → CUSTOMER
```

There must be NO:

```text
email → role
domain → role
registration → role
```

Role remains exclusively controlled by:

```text
UserMembership.role
```

Admin provisioning remains the only application access path.

---

# EMAIL WHITELIST MUST REMAIN

Do NOT delete or redesign:

- `EmailWhitelist` model
- whitelist API
- whitelist UI
- `whitelist:manage`
- staff whitelist logic
- revoke functionality

The whitelist still has a valid purpose for internal staff registration.

Do not implement un-revoke as part of this task.

---

# EXPECTED CODE SCOPE

Inspect the current implementation first.

The expected primary implementation area is:

```text
apps/api/src/modules/whitelist/registration-gate.ts
```

and its related hook/tests.

Likely affected:

```text
apps/api/src/modules/whitelist/registration-gate.hook.ts
apps/api/src/modules/whitelist/registration-gate.integration.test.ts
packages/shared/src/utils/registration-domain.test.ts
```

Also inspect:

```text
packages/auth/src/index.ts
```

If comments/documentation explicitly describe registration as:

> whitelist-gated for every user

update ONLY those comments so they accurately describe the new behavior.

Do not change unrelated authentication configuration.

---

# REQUIRED TESTS

Update the registration gate tests to prove the exact G4 behavior.

At minimum, test:

### 1. External Gmail

```text
user@gmail.com
```

Expected:

```text
ALLOW
```

without whitelist.

---

### 2. External institutional domain

Example:

```text
user@hospital.co.id
```

Expected:

```text
ALLOW
```

without whitelist.

---

### 3. Internal staff without whitelist

```text
user@kalibrasimedika.co.id
```

without ACTIVE whitelist.

Expected:

```text
REJECT
```

---

### 4. Internal staff with ACTIVE whitelist

```text
user@kalibrasimedika.co.id
```

with ACTIVE whitelist.

Expected:

```text
ALLOW
```

---

### 5. Internal staff with REVOKED whitelist

Expected:

```text
REJECT
```

---

### 6. Case normalization

If the existing implementation normalizes email/domain, preserve that behavior.

Do not introduce a new normalization strategy unless required by the existing implementation.

---

# CRITICAL INTEGRATION TEST

Add/retain a test proving that external registration does NOT provision access.

For example:

```text
customer@gmail.com
        ↓
registration succeeds
        ↓
User exists
        ↓
UserMembership count = 0
```

Do NOT create a fake CUSTOMER membership in the registration test.

The purpose is to prove:

```text
REGISTRATION
    ≠
PROVISIONING
```

---

# DO NOT CHANGE

This task must NOT modify:

- `UserMembership` schema
- `User.role` (there must be no such parallel role)
- `MembershipRole`
- `createAccessControl`
- `CompanyRoleGuard`
- `MeController` authorization semantics
- `chat-socket-auth`
- `users.service`
- Users API
- membership provisioning
- CUSTOMER permissions
- ADMIN permissions
- SUPERADMIN behavior
- G2
- G3
- `User.status` semantics
- password reset
- email verification
- invitation email
- whitelist un-revoke
- menu authorization
- `proxy.ts`
- frontend authorization
- database schema
- Prisma migration

Unless a directly affected test or comment needs updating, leave those areas untouched.

---

# DO NOT "IMPROVE" ANYTHING ELSE

This is especially important.

If you discover unrelated problems, DO NOT fix them.

Examples:

- `User.email` length
- missing email verification
- stale RBAC documentation
- missing E2E tests
- empty role permissions
- contact-message permission design
- whitelist un-revoke
- session revocation
- menu role/permission design

Report them separately as:

```text
OUT OF SCOPE
```

Do not modify them.

---

# VERIFICATION

After implementation:

1. Run the focused registration-gate tests.
2. Run affected package tests.
3. Run TypeScript/typecheck for affected packages.
4. Run the relevant build if practical.

Report exact commands and results.

Do not claim success without actual test output.

---

# REQUIRED FINAL REPORT

Return:

## 1. Files Changed

List every modified file.

## 2. G4 Behavior

Show:

```text
Internal company email
→ domain + ACTIVE whitelist required

External email
→ no whitelist required

Registration
→ User only

Membership
→ none

Role
→ none
```

## 3. Tests

List:

- tests added
- tests changed
- tests passed
- exact command/output summary

## 4. Out of Scope

Explicitly confirm that you did NOT modify:

- RBAC
- User Management
- G1
- G2
- G3
- CUSTOMER auto-role
- membership provisioning
- whitelist architecture

## 5. Remaining Issues

Only report issues discovered during this task.

Do not fix them unless they are directly required for G4.

---

# FINAL HARD CONSTRAINT

The implementation is correct ONLY if this statement remains true:

> **Anyone may create an account using an external email, but nobody receives application access merely by registering.**

Application access still requires:

```text
User
  ↓
Admin provisioning
  ↓
UserMembership
  ↓
UserMembership.role
  ↓
Permission
```

Do not violate this architecture.