# FCM Token Registration + User Assignment / Recipient Authorization
## Forensic Audit — Phase 3

You are working on the existing production codebase.

Your task is **AUDIT ONLY**.

**DO NOT modify any source code, schema, migration, configuration, database, API contract, or frontend behavior.**

Do not implement anything yet.

The purpose of this audit is to understand the current implementation and determine the safest design for the next phase.

---

## 1. Business Decisions Already Confirmed

The following requirements are already decided and MUST be treated as fixed requirements:

### Recipient assignment

FCM notification recipients are assigned **per USER**.

Not by role.

Not by permission.

Not by "all users with a certain role".

The system must eventually support:

```text
Lead
  ↓
Assigned User(s)
  ↓
User's active FCM device tokens
  ↓
FCM
  ↓
User's devices
```

### Multiple devices

One user may have multiple devices/browser instances simultaneously.

Example:

```text
User A
 ├── Laptop / Chrome
 │     └── FCM Token A
 │
 ├── Android / Chrome
 │     └── FCM Token B
 │
 └── Other browser/device
       └── FCM Token C
```

Therefore:

> FCM tokens MUST NOT be stored directly as a single field on the User record.

FCM tokens should be represented by a **separate table/entity associated with User**.

### Token lifecycle

Do NOT design token refresh around an arbitrary fixed interval such as:

```text
refresh every 30 days
refresh every 60 days
```

The expected lifecycle is based on Firebase/browser token behavior.

The application should obtain the current token through `getToken()` during the appropriate application lifecycle.

If the returned token is unchanged:

```text
existing token
    ↓
update last-seen / metadata if appropriate
```

If the token changes:

```text
old token
    ↓
no longer current for that device
    ↓
new token registered
```

Invalid/unusable tokens must eventually be deactivated/removed based on FCM delivery responses.

---

# 2. Audit Scope

Perform a forensic audit of the CURRENT repository.

Inspect at minimum:

## Backend

- User entity/model
- User database schema
- Prisma schema(s)
- User service
- Authentication service
- JWT/session handling
- RBAC implementation
- Roles
- Permissions
- Existing notification-related services
- Existing FCM service
- Firebase Admin SDK integration
- Existing FCM token registration endpoint
- Existing FCM token persistence
- Existing notification dispatch/send logic
- Lead entity/model
- Lead assignment logic, if already present
- Controllers
- DTOs
- Guards
- Authorization checks
- Relevant migrations
- Relevant tests

## Frontend / PWA

Inspect:

- Firebase Web SDK initialization
- `getToken()`
- notification permission handling
- service worker
- FCM service worker
- token registration API call
- token persistence on frontend
- login/logout behavior
- app startup behavior
- PWA/mobile behavior
- existing notification UI

Do not assume the implementation matches previous documentation or conversation history.

The repository is the source of truth.

---

# 3. Audit Questions

Answer each question explicitly.

## A. Existing FCM implementation

Determine:

1. Is Firebase Web SDK already implemented?
2. Is `getToken()` already implemented?
3. Where is `getToken()` called?
4. When is it called?
5. Is the token sent to the backend?
6. Which API endpoint receives it?
7. Where is the token stored?
8. Is the token currently associated with a User?
9. Is the token currently associated with a device/browser instance?
10. Can one user currently have multiple tokens?
11. What happens when the same user logs in from another device?
12. What happens when `getToken()` returns a different token?
13. What happens when a token becomes invalid?
14. Is there currently any token cleanup/deactivation mechanism?

For every answer, provide:

- file path
- relevant class/function
- current behavior
- evidence from code

---

# 4. User ↔ FCM Token Relationship

Audit the current database model.

Determine whether the current implementation supports:

```text
User 1 ──────── N FCM Tokens
```

or incorrectly assumes:

```text
User 1 ──────── 1 FCM Token
```

Specifically inspect:

- Prisma schema
- User model
- existing notification/token model
- primary keys
- foreign keys
- unique constraints
- indexes
- cascade behavior
- active/inactive state
- timestamps

Answer:

### Can the current database safely represent this?

```text
User A
 ├── Token A — Laptop
 ├── Token B — Android
 └── Token C — Other device
```

If not, explain exactly what is missing.

---

# 5. Proposed Token Entity Audit

Without implementing it, evaluate whether the current codebase should introduce something conceptually equivalent to:

```text
UserFcmToken
----------------
id
user_id
token
device_id
platform
browser
is_active
last_seen_at
created_at
updated_at
```

Do NOT blindly assume these exact fields are correct.

Instead determine:

1. Which fields are actually required?
2. Which are optional?
3. Which should be unique?
4. Should `token` be globally unique?
5. Should `(user_id, device_id)` be unique?
6. Do we really need `device_id` for the current PWA architecture?
7. Can the browser installation be reliably identified?
8. What should happen if the same FCM token is registered by another user?
9. How should stale tokens be handled?
10. What indexes are required?

Give a recommended schema design, but **do not implement it**.

---

# 6. Token Refresh / Lifecycle Audit

This is important.

Determine the current behavior around:

```text
getToken()
```

Explain precisely:

### Initial registration

What happens when a user first grants notification permission?

### App reopening

What happens when the user opens the PWA again?

### Token unchanged

What happens if:

```text
getToken() → SAME TOKEN
```

### Token changed

What happens if:

```text
getToken() → NEW TOKEN
```

### Logout

What happens when the user logs out?

### Login on another device

What happens when:

```text
User A → Laptop
User A → Android
```

### Browser/site data reset

What happens if browser storage/site data is cleared?

### Token invalidation

What happens if FCM reports an invalid/unregistered token?

Identify any missing lifecycle handling.

Do NOT invent a fixed refresh period.

---

# 7. User Assignment / Recipient Authorization

Audit the existing Lead assignment architecture.

Determine:

1. Does Lead already have an assigned user?
2. Is assignment one-to-one or one-to-many?
3. Which table/entity represents assignment?
4. How is assignment changed?
5. Is assignment audited?
6. Are there existing authorization checks?
7. Is assignment currently based on User, Role, Permission, Branch, Department, or another mechanism?
8. Can an assigned user be inactive?
9. Can an assigned user have zero FCM tokens?
10. Can an assigned user have multiple active FCM tokens?

The eventual notification model should be:

```text
Lead
 ↓
Assigned User(s)
 ↓
Active FCM Tokens belonging to those users
 ↓
FCM
```

Verify how much of this architecture already exists.

---

# 8. Critical Security Audit

Determine whether the current FCM registration endpoint allows a user to register a token for:

```text
another user
```

or whether the backend derives the user identity from the authenticated session/JWT.

This is critical.

The desired security model is:

```text
Authenticated User
       ↓
Backend determines current user
       ↓
Register token for THAT user
```

NOT:

```text
Client sends:

{
  userId: 123,
  token: "..."
}

Backend trusts userId
```

If the current implementation has this vulnerability, report it clearly.

Do not fix it yet.

---

# 9. Logout / Token Revocation Audit

Determine how logout currently works.

Evaluate:

- Does logout revoke authentication?
- Does logout unregister the FCM token?
- Should logout unregister the token?
- Could automatic re-registration on next login make more sense?
- What happens when another user subsequently uses the same browser?
- Could notifications for User A reach User B?

Pay particular attention to this scenario:

```text
Browser
 ↓
User A logs in
 ↓
FCM token registered to User A
 ↓
User A logs out
 ↓
User B logs in
 ↓
same browser/device
```

Determine whether the current implementation safely handles this.

---

# 10. Notification Dispatch Audit

Find the current code that sends FCM notifications.

Determine whether it currently sends to:

- one token
- multiple tokens
- topic
- all tokens
- role-based recipients
- hard-coded recipients
- assigned users
- something else

Document the complete current flow:

```text
Event
 ↓
Recipient determination
 ↓
FCM token lookup
 ↓
FCM send
 ↓
delivery result
 ↓
invalid-token handling
```

Identify what already exists and what is missing.

---

# 11. Architecture Recommendation

After the forensic audit, provide a recommended target architecture.

The target should conceptually be:

```text
                    ┌──────────────┐
                    │     Lead     │
                    └──────┬───────┘
                           │
                    Assigned User(s)
                           │
            ┌──────────────┴──────────────┐
            ↓                             ↓
         User A                         User B
            │                             │
       Active tokens                 Active tokens
       ├── Device 1                   ├── Device 1
       └── Device 2                   └── Device 2
            │                             │
            └─────────────┬───────────────┘
                          ↓
                         FCM
```

Explain:

- entities
- relationships
- ownership
- authorization boundary
- token lifecycle
- dispatch flow
- cleanup strategy

---

# 12. Identify What Must NOT Be Changed

Explicitly identify existing functionality that should remain untouched.

Examples:

- existing authentication
- existing RBAC
- existing permission model
- existing menu permissions
- existing Firebase initialization
- existing service worker
- existing lead logic

The goal is to extend the current system, not redesign unrelated parts.

---

# 13. Produce the Audit Report

Create a report containing exactly these sections:

## Executive Summary

## Current FCM Implementation

## Current User / RBAC Architecture

## Current Lead Assignment Architecture

## Current FCM Token Storage

## Token Lifecycle Findings

## Multi-Device Findings

## Security Findings

## Logout / Re-login Findings

## Notification Dispatch Findings

## Gaps / Risks

## Recommended Target Architecture

## Recommended Database Model

## Recommended API Changes

## Recommended Frontend Changes

## Recommended Backend Changes

## Migration Considerations

## Testing Requirements

## Implementation Order

## Files That Would Need Modification

---

# 14. Severity Classification

Classify findings as:

- CRITICAL
- HIGH
- MEDIUM
- LOW
- INFORMATIONAL

Pay particular attention to:

- token belonging to wrong user
- client-controlled userId
- cross-user notification leakage
- stale token delivery
- inability to support multiple devices
- logout/re-login token ownership problems
- duplicate token registration
- missing authorization before FCM dispatch

---

# 15. STRICT OUTPUT RULES

This is an **AUDIT ONLY** task.

DO NOT:

- modify files
- create migrations
- modify Prisma schema
- create endpoints
- modify controllers
- modify services
- modify frontend
- modify service worker
- install packages
- run database migrations
- commit changes
- push changes

You MAY:

- inspect the repository
- inspect git history if useful
- inspect existing migrations
- inspect tests
- run read-only commands
- run existing tests/builds if they do not modify project state
- produce the audit report

For every important finding, provide:

```text
Finding
Severity
Evidence
Current behavior
Risk
Recommendation
```

At the end provide a concise:

# GO / NO-GO

Answer:

1. Is the existing implementation safe to extend?
2. What must be fixed before implementation?
3. What can be reused?
4. What new entities/tables are required?
5. What is the minimum implementation scope for Phase 3?
6. What should be implemented first?

Again:

**DO NOT IMPLEMENT ANYTHING.**

The next step after this audit will be a separate implementation task based on the audit findings.