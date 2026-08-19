## DECISION LOCK — G1

The following architecture decision has now been explicitly made and must be treated as a **fixed requirement** for the User Management implementation:

### G1 = B — Account registration is NOT application provisioning

**Decision:**

> Account registration ≠ application provisioning.

A successful Better Auth registration creates an **account**, but does **NOT** automatically create a `UserMembership`.

Therefore:

```text
Registration
    ↓
User account created
    ↓
User.status = INVITED
    ↓
NO UserMembership
    ↓
NO application access
```

Application access is granted separately through an **administrative provisioning process**.

---

## REQUIRED BEHAVIOR

### 1. Self-registration

A user who passes the existing registration gate may create a Better Auth account.

Do NOT automatically:

- create `UserMembership`
- assign a role
- assign a company membership
- grant application permissions
- grant menu access

The existing registration gate remains unchanged unless a separate implementation decision explicitly requires otherwise.

---

### 2. Application access

A registered user without a valid `UserMembership` must not have application access.

The existing architecture already follows the principle that:

```text
User
    ≠
UserMembership
```

and `UserMembership.role` remains the authoritative role source.

Do not introduce:

- `User.role`
- automatic default roles
- Better Auth `admin` plugin
- Better Auth `organization` plugin
- a parallel RBAC mechanism

---

### 3. Administrative provisioning

User Management will provide a separate administrative workflow:

```text
Existing account
      ↓
Admin selects user
      ↓
Assign company
      ↓
Assign role
      ↓
Create UserMembership
      ↓
User becomes authorized for the application
```

The exact UI/API implementation will be handled in the User Management implementation phase.

Do NOT implement it during this decision-lock task.

---

### 4. IMPORTANT — Do not confuse INVITED with ACTIVE

The existing `User.status` contains:

```text
INVITED
ACTIVE
DISABLED
```

The decision above does NOT by itself define the complete semantics of these statuses.

Do not invent additional status behavior.

In particular, do not assume that:

```text
INVITED → ACTIVE
```

must happen automatically during registration.

The lifecycle and enforcement of `User.status` will be handled as a separate authorization decision.

---

### 5. Authorization remains unchanged conceptually

The existing authorization architecture remains authoritative:

```text
Better Auth session
        ↓
User
        ↓
UserMembership
        ↓
UserMembership.role
        ↓
createAccessControl / permission
        ↓
NestJS authorization guard
        ↓
application access
```

Do not replace this architecture.

---

## MENU ACCESS

Menu visibility must NOT be granted simply because a user successfully registered.

A user without a valid application membership/authorization must not receive application menu access.

However:

**Menu visibility is UX only.**

Do not move authorization into:

- `localStorage`
- frontend-only role checks
- `proxy.ts`
- client-controlled state

Backend authorization remains authoritative.

The eventual menu system should consume the same permission model used by backend authorization.

---

## WHAT YOU SHOULD DO NOW

This is a **decision update only**.

Do NOT modify code.

Do NOT create database migrations.

Do NOT create new RBAC tables.

Do NOT implement User Management yet.

Instead:

1. Acknowledge G1 = B as a fixed architectural decision.
2. Update the audit/implementation plan mentally and identify any consequences of this decision.
3. Re-state the resulting registration → provisioning flow.
4. Identify which parts of the existing implementation must remain unchanged.
5. Identify any implementation gates that remain unresolved (G2, G3, G4).
6. Wait for the next implementation instruction.

### Critical constraint

Do not make assumptions for unresolved decisions.

If a behavior depends on G2, G3, or G4, explicitly mark it:

`BLOCKED — awaiting decision Gx`

The purpose of this task is to **lock G1**, not to start implementing User Management.