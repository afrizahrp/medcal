# FCM WEB PUSH — PHASE 1 IMPLEMENTATION
## Backend FCM Infrastructure + Authenticated Token Registration
### MedCal Monorepo — Claude Opus 4.5 / Cursor

You are working on the MedCal monorepo.

You are now moving from the previously completed **FCM Architecture Audit** into **PHASE 1 IMPLEMENTATION ONLY**.

The audit established that:

- an existing `FCMToken` Prisma model already exists;
- `packages/notifications` already contains a push abstraction/stub;
- Better Auth is the existing authentication mechanism;
- `/me` exposes authenticated user + membership + capabilities;
- backend authorization is the authoritative security boundary;
- Portal and future Tech-PWA are the intended FCM applications;
- no Firebase packages are currently installed;
- no Service Worker exists yet;
- no queue/event infrastructure exists;
- `lead:notify` is a future approved architectural direction but is NOT part of this phase.

The audit must be treated as architectural context, not as permission to modify unrelated systems.

---

# 1. PRIMARY OBJECTIVE

Implement ONLY the backend infrastructure required to:

1. initialize Firebase Admin safely on the server;
2. provide a backend push-sending abstraction without implementing lead notifications;
3. expose authenticated FCM token registration;
4. expose authenticated FCM token deletion/revocation;
5. maintain FCM token ownership securely;
6. support multiple users, browsers, devices, and applications;
7. support `WEB`, `PORTAL`, and `TECH_PWA` application identity using the existing `PushApp` enum;
8. deactivate invalid tokens when appropriate;
9. preserve the existing authentication, RBAC, RolePermission, Menu Registry, and user lifecycle architecture.

This phase is infrastructure only.

---

# 2. ABSOLUTE SCOPE BOUNDARY

DO NOT implement:

- lead notifications;
- new lead notification events;
- `lead:notify`;
- recipient selection for leads;
- LeadService changes;
- ContactMessages notification changes;
- notification preferences;
- customer push notifications;
- frontend Firebase SDK;
- frontend FCM hooks;
- React Context for FCM;
- Zustand;
- Service Worker;
- `firebase-messaging-sw.js`;
- browser notification permission handling;
- browser FCM token acquisition;
- notification click handling;
- deep linking;
- in-app toast/banner notification;
- background notification handling;
- queue;
- Bull/BullMQ;
- Redis;
- CQRS;
- EventEmitter architecture;
- scheduled notification cleanup jobs;
- new notification event architecture;
- authentication redesign;
- RBAC redesign;
- Permission Management changes;
- Menu Registry changes;
- user lifecycle redesign;
- company/membership redesign.

DO NOT "prepare" these features by implementing them partially.

If a future feature requires a placeholder abstraction, create only the minimum backend abstraction required by this phase and document the future extension.

---

# 3. NON-NEGOTIABLE RULE

The existing production architecture is considered stable.

Do not redesign existing architecture merely because you prefer another pattern.

Before modifying a file:

1. inspect the existing implementation;
2. understand its conventions;
3. follow the repository's existing patterns;
4. make the smallest change necessary.

Do not introduce architectural patterns that are not already justified by the repository.

---

# 4. REQUIRED FIRST STEP — RECONNAISSANCE

Before modifying anything, inspect the repository.

You MUST inspect at minimum:

## Database

- `packages/db/prisma/schema.prisma`
- existing `FCMToken` model
- `PushApp` enum
- relations involving User / Membership / Company
- existing indexes and constraints
- existing Prisma repository/service patterns

## Notifications package

- `packages/notifications`
- current package structure
- current push abstraction
- current email abstraction
- package exports
- package dependencies
- existing error-handling conventions

## API

Inspect:

- `apps/api/src/app.module.ts`
- module structure
- controller conventions
- service conventions
- authentication guards
- Better Auth integration
- `/me`
- existing authenticated CRUD endpoints
- existing ownership checks
- error response conventions
- dependency injection conventions

## Authentication

Inspect:

- Better Auth configuration
- session access pattern
- authenticated request context
- how current user identity is obtained server-side
- how membership/company identity is derived
- how ACTIVE user status is enforced

## Configuration

Inspect:

- environment configuration
- `.env.example` / equivalent
- production environment conventions
- Docker configuration
- `docker-compose.prod.yml`
- existing server-only secret handling

## Testing

Inspect:

- API unit test conventions
- integration test conventions
- Prisma/database test conventions
- existing authorization tests
- existing controller/service tests

DO NOT modify anything during reconnaissance.

---

# 5. EXISTING FCM DATA MODEL — MUST BE REUSED

The repository already contains:

```prisma
model FCMToken {
  id         String    @id @default(cuid())
  companyId  String
  userId     String
  token      String    @unique
  deviceType String
  app        PushApp
  isActive   Boolean   @default(true)
  lastUsedAt DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
}

enum PushApp {
  WEB
  PORTAL
  TECH_PWA
}
```

Treat this as the existing domain model.

DO NOT create:

- UserDevice
- PushSubscription
- DeviceToken
- NotificationDevice
- FCMRegistration
- another FCM token table

unless the actual repository proves the existing model cannot satisfy Phase 1 requirements.

If you believe the model must change, STOP before changing it.

Report:

- exact limitation;
- why the existing model is insufficient;
- exact proposed change;
- migration impact.

Do not silently modify the schema.

---

# 6. IMPORTANT TOKEN OWNERSHIP RULE

This is a critical security requirement.

The client submits a token.

The client MUST NOT determine:

- `userId`;
- `companyId`;
- token owner;
- membership;
- authorization scope.

The authenticated server-side identity determines ownership.

For registration:

```text
Authenticated session
        ↓
current user
        ↓
current active membership/company
        ↓
FCMToken.userId
FCMToken.companyId
```

Never trust `userId` or `companyId` supplied by the client.

---

# 7. TOKEN OWNERSHIP CONFLICT

The existing token has:

```prisma
token String @unique
```

Therefore, a token may already exist.

DO NOT blindly implement:

```text
upsert(token)
```

that automatically transfers an existing token from User A to User B.

Example:

```text
User A
  ↓
token X
```

Later:

```text
User B
  ↓
token X
```

This MUST NOT silently become:

```text
token X → User B
```

The implementation must define and enforce safe ownership behavior.

If the same authenticated user submits the same token:

- update/refresh its registration safely.

If the token belongs to another user:

- do NOT silently reassign ownership;
- return an appropriate conflict/error according to existing API conventions;
- log appropriately if the repository has a suitable security/audit logging mechanism.

Do not invent a new audit-log subsystem solely for this task.

---

# 8. ACTIVE USER REQUIREMENT

Only an authenticated ACTIVE user may register an FCM token.

Evaluate the existing authorization/session architecture and enforce the existing ACTIVE-user rule.

Expected behavior:

| State | Register token | Delete own token |
|---|---:|---:|
| Unauthenticated | NO | NO |
| INVITED | NO | NO |
| ACTIVE | YES | YES |
| DISABLED | NO | NO |

Do not bypass existing guards.

Do not create a second user-status authorization mechanism if an existing guard/service already establishes this boundary.

---

# 9. COMPANY / TENANT OWNERSHIP

The existing `FCMToken` contains:

```text
companyId
userId
```

Preserve this.

`companyId` MUST be derived server-side from the authenticated user's active membership/context.

The client MUST NOT supply authoritative `companyId`.

Do not introduce additional tenant fields unless the existing architecture requires them.

Do not assume `companyId` should be removed simply because `userId` exists.

---

# 10. APPLICATION IDENTIFICATION

The existing enum is:

```text
WEB
PORTAL
TECH_PWA
```

Use the existing enum.

The API must validate the submitted application value.

Do not accept arbitrary strings for `app`.

Do not create another application enum.

Do not implement customer FCM in this phase.

The backend should remain extensible for future applications without implementing them now.

---

# 11. DEVICE TYPE

The existing model contains:

```text
deviceType String
```

Inspect how the repository currently handles client/device metadata.

Do not add browser fingerprinting unless there is a demonstrated architectural requirement.

Do not collect unnecessary fingerprinting data.

Do not introduce invasive device tracking.

Use the minimum metadata necessary for FCM registration.

---

# 12. REGISTRATION API

Implement the backend API according to existing MedCal API conventions.

The target conceptual contract is:

```http
POST /notifications/push-tokens
```

with a body conceptually equivalent to:

```json
{
  "token": "...",
  "deviceType": "...",
  "app": "PORTAL"
}
```

IMPORTANT:

The exact route, DTO naming, controller naming, and module placement MUST follow existing repository conventions.

Do not blindly create the exact file names from the audit if the repository has a better established structure.

The request MUST NOT accept authoritative:

```text
userId
companyId
```

from the client.

Server derives them.

---

# 13. REGISTRATION SEMANTICS

Registration must support:

### New token

Create:

```text
userId = authenticated user
companyId = authenticated user's membership company
token = submitted token
deviceType = validated input
app = validated PushApp
isActive = true
lastUsedAt = now
```

### Existing token owned by same user

Do NOT create duplicate data.

Reactivate/update as appropriate:

```text
isActive = true
lastUsedAt = now
updatedAt = now
```

Preserve the existing record identity where appropriate.

### Existing token owned by another user

DO NOT reassign silently.

Return a safe conflict according to existing API error conventions.

### Existing token previously inactive

If owned by the same authenticated user:

- allow reactivation;
- update lastUsedAt.

---

# 14. TOKEN DELETION / REVOCATION

Implement an authenticated endpoint conceptually equivalent to:

```http
DELETE /notifications/push-tokens/:tokenId
```

The exact route must follow repository conventions.

Security requirement:

A user may only deactivate/delete/revoke a token that belongs to them.

Do not allow:

```text
DELETE token belonging to User B
```

from User A.

Do not accept userId/companyId from the client to establish ownership.

Use server-side ownership checks.

Prefer the repository's existing soft-delete/deactivation conventions if applicable.

Because `FCMToken` already has:

```text
isActive
```

do not introduce a second deletion mechanism without justification.

---

# 15. LOGOUT BEHAVIOR

DO NOT automatically delete every FCM token when a user signs out.

The existing architecture is intended to support:

- multiple browsers;
- multiple devices;
- multiple installations.

A logout on one client does not automatically mean all registrations belonging to that user should disappear.

Do not modify Better Auth logout behavior in this phase.

Document this behavior.

---

# 16. SESSION EXPIRATION

Do not automatically delete tokens when a session expires.

The token belongs to the authenticated user/device registration, not to a particular short-lived session.

Future notification sending will independently filter eligible active users/tokens.

Do not implement that recipient filtering now.

---

# 17. DISABLED USER HANDLING

A disabled user must not remain eligible to register new tokens.

Where the repository already has lifecycle handling that can safely deactivate existing FCM tokens when a user becomes DISABLED, evaluate it.

BUT:

Do not redesign the user lifecycle subsystem.

Do not modify unrelated user-management flows merely to force FCM integration.

If automatic deactivation of existing tokens requires touching user lifecycle code, STOP and report it as a bounded follow-up decision unless the existing architecture provides a clearly appropriate extension point.

The immediate security requirement is:

> disabled users cannot register or use the authenticated token-management API.

---

# 18. INVALID FCM TOKENS

Implement the backend push abstraction so that future sending can recognize invalid/unregistered FCM tokens.

However:

DO NOT implement lead notification sending.

DO NOT build a cleanup worker.

DO NOT build a scheduled cleanup job.

If Firebase Admin returns an invalid-registration-token/unregistered condition in the future sending abstraction, the design should support deactivating the corresponding `FCMToken`.

If this cannot be cleanly implemented without actual sending, leave the cleanup behavior as a documented integration point.

Do not invent a background infrastructure.

---

# 19. FIREBASE ADMIN SDK

Implement server-side Firebase Admin initialization using the repository's existing configuration conventions.

Requirements:

- Firebase Admin credentials MUST remain server-side.
- Never expose service-account credentials to browser code.
- Never place Admin credentials in `NEXT_PUBLIC_*`.
- Never import Firebase Admin into frontend applications.
- Never bundle Admin credentials into Next.js client code.

Inspect the existing configuration system before deciding whether to use:

```text
FIREBASE_SERVICE_ACCOUNT_JSON
```

or:

```text
FIREBASE_SERVICE_ACCOUNT_PATH
```

or another repository-consistent mechanism.

Do not blindly adopt the audit's example.

Choose the approach that best fits the existing production deployment architecture.

If the repository does not have a secure secret-loading convention suitable for this:

STOP and report the gap rather than inventing infrastructure.

---

# 20. FIREBASE CLIENT CONFIG IS OUT OF SCOPE

Do NOT add:

```text
NEXT_PUBLIC_FIREBASE_*
```

in this phase unless required for backend compilation or existing architecture.

Do NOT install the browser `firebase` SDK.

Do NOT create Service Workers.

This phase is backend-only.

---

# 21. PUSH SENDING ABSTRACTION

The existing package contains a push abstraction/stub.

Inspect it first.

Implement the backend Firebase Admin adapter in the existing notification package architecture.

The abstraction should support a future conceptual operation like:

```text
sendPush(...)
```

without knowing anything about:

- Lead;
- lead recipients;
- RBAC;
- RolePermission;
- UI;
- Service Worker;
- browser state.

The notification infrastructure must remain domain-neutral.

Do not hard-code:

```text
lead:new
```

into the generic push sender.

---

# 22. MESSAGE DESIGN

The Phase 1 sender may define the minimum transport-level message contract required by Firebase Admin.

Do not design the final business notification payload yet.

Do not include lead-specific fields.

Do not include unnecessary PII.

Do not expose business-domain assumptions in the generic notification package.

---

# 23. ERROR HANDLING

Inspect existing error-handling conventions.

Firebase failures must not leak:

- service account credentials;
- internal stack traces;
- raw Firebase configuration;
- sensitive internal details.

Map external Firebase errors into the repository's existing error/logging conventions.

Do not invent a global error framework.

---

# 24. LOGGING

Inspect existing logging conventions.

Log enough information to diagnose FCM infrastructure problems.

Do NOT log:

- Firebase service-account JSON;
- private credentials;
- full tokens;
- unnecessary PII.

If token logging is required for debugging, use a safe redacted representation.

Example:

```text
abc123...xyz789
```

not the full token.

Follow existing logging conventions.

---

# 25. TEST REQUIREMENTS

Tests are REQUIRED.

At minimum test:

## Registration

- unauthenticated request rejected;
- INVITED user rejected;
- DISABLED user rejected;
- ACTIVE user can register;
- userId comes from authenticated identity;
- companyId comes from authenticated membership;
- client cannot override userId;
- client cannot override companyId;
- valid `PushApp` accepted;
- invalid app rejected;
- same user + same token does not create duplicate;
- same user + existing inactive token reactivates;
- token owned by another user cannot be silently reassigned.

## Deletion

- unauthenticated request rejected;
- user can revoke own token;
- user cannot revoke another user's token;
- nonexistent token follows existing 404/error conventions.

## Security

Explicitly test cross-user ownership boundaries.

This is NOT optional.

---

# 26. DATABASE / MIGRATION RULE

Before creating any migration:

inspect the current Prisma schema and database state.

The audit indicates that `FCMToken` already exists.

Therefore:

**DO NOT create a migration merely because you are implementing FCM.**

Only create a migration if the implementation proves that an actual schema change is necessary.

If no schema change is necessary:

- do not create migration;
- explicitly report that no migration was required.

If a schema change appears necessary:

STOP before migration creation and report:

```text
SCHEMA CHANGE REQUIRED
Reason:
Current schema limitation:
Proposed change:
Migration impact:
Why Phase 1 cannot proceed without it:
```

Do not silently invent schema changes.

---

# 27. PACKAGE INSTALLATION

Installing the Firebase Admin package is within Phase 1 scope.

Before installing:

1. inspect package manager;
2. inspect workspace conventions;
3. identify the correct package location;
4. use the repository's existing package-management workflow.

Do not install:

- browser Firebase SDK;
- unrelated packages;
- queue packages;
- Redis;
- state management packages.

Only install the Firebase Admin dependency required for backend infrastructure.

---

# 28. PACKAGE BOUNDARY

Determine where Firebase Admin should live based on the existing repository.

The audit suggested:

```text
packages/notifications
```

but you MUST verify this against the repository architecture before implementation.

The desired boundary is:

```text
Firebase Admin
      ↓
notifications infrastructure
      ↓
API notification service
```

The Lead domain must NOT own Firebase infrastructure.

---

# 29. API MODULE BOUNDARY

Create or extend the notification module only according to existing NestJS module conventions.

The module should own:

- token registration;
- token revocation;
- notification infrastructure integration.

It should NOT own:

- Lead business logic;
- RBAC implementation;
- User lifecycle;
- Permission Management;
- Menu Registry.

---

# 30. AUTHORIZATION BOUNDARY

The API must enforce:

```text
Authentication
      ↓
ACTIVE user
      ↓
Authenticated user identity
      ↓
Own-token ownership
```

It must NOT rely on:

```text
FCM token
```

as proof of identity.

It must NOT rely on:

```text
userId supplied by browser
```

as proof of ownership.

It must NOT rely on:

```text
companyId supplied by browser
```

as proof of tenant scope.

Backend remains authoritative.

---

# 31. DO NOT IMPLEMENT `lead:notify`

This is an explicit hard boundary.

Even though the architecture audit recommends:

```text
lead:notify
```

DO NOT:

- add it to the permission catalog;
- modify RolePermission;
- modify permission seeds;
- modify Permission Management;
- modify LeadService;
- query `lead:notify`;
- send lead notifications.

That will be a later phase.

---

# 32. DO NOT IMPLEMENT RECIPIENT SELECTION

There must be ZERO code in Phase 1 that answers:

> "Who should receive a new lead notification?"

Do not implement:

```text
findUsersWithPermission(...)
```

for lead notifications.

Do not query roles to select push recipients.

Do not query `lead:read`.

Do not introduce notification preference logic.

This phase only establishes:

```text
who owns this FCM registration?
```

not:

```text
who receives a business notification?
```

---

# 33. DO NOT IMPLEMENT FRONTEND

No changes to:

- `apps/portal`
- `apps/tech-pwa`

unless a build/dependency boundary absolutely requires a minimal package metadata change, and even then STOP and report before doing it.

Do not add:

- Firebase browser SDK;
- notification permission prompts;
- FCM token acquisition;
- Service Worker;
- React hooks;
- React Context;
- Zustand.

Phase 1 is backend infrastructure + token API.

---

# 34. PRODUCTION CONFIGURATION

Inspect production configuration.

Only add backend Firebase Admin environment configuration if required by the implementation.

Do not modify nginx.

Do not modify Service Worker routing.

Do not modify frontend Docker configuration.

Do not expose Firebase Admin credentials to the client.

Document exactly which production environment variables are required.

---

# 35. IMPLEMENTATION ORDER

Follow this exact sequence:

## Step 1 — Repository reconnaissance

Read all relevant files.

## Step 2 — Architecture confirmation

Before coding, produce a short internal implementation map:

```text
Existing:
- FCMToken:
- Push abstraction:
- API auth:
- API module boundary:
- Config mechanism:
- Test conventions:

Changes required:
- ...
```

Do not ask the user for confirmation if the repository clearly supports the implementation.

If a genuine architectural conflict exists, STOP.

## Step 3 — Package dependency

Add only the required Firebase Admin dependency.

## Step 4 — Firebase Admin infrastructure

Implement safe server-side initialization.

## Step 5 — Push abstraction

Implement the generic backend FCM sender/adapter.

No business events.

## Step 6 — Notification/token module

Implement authenticated token registration.

## Step 7 — Token revocation

Implement authenticated own-token revocation.

## Step 8 — Tests

Implement and run relevant tests.

## Step 9 — Build/typecheck

Run appropriate repository checks.

## Step 10 — Security review

Review ownership, authentication, tenant scope, credential exposure, and error handling.

---

# 36. VALIDATION REQUIREMENTS

Do not report "implemented successfully" merely because files compile.

You MUST run appropriate validation.

At minimum:

- affected package tests;
- affected API tests;
- TypeScript/typecheck;
- relevant build;
- lint if repository convention requires it.

If tests cannot run because of environmental limitations:

state exactly:

```text
NOT RUN
Reason:
Command:
What remains unverified:
```

Do not claim success.

---

# 37. CHANGE MINIMIZATION

Before modifying each file ask:

> Is this file actually required for Phase 1?

If no:

DO NOT TOUCH IT.

Avoid:

- opportunistic refactoring;
- naming cleanup;
- unrelated TypeScript modernization;
- architecture cleanup;
- formatting unrelated files;
- dependency upgrades unrelated to Firebase;
- changing existing auth;
- changing RBAC.

---

# 38. STOP CONDITIONS

STOP implementation and report if you discover:

1. `FCMToken` cannot safely support Phase 1;
2. authentication identity cannot be established server-side;
3. company ownership cannot be derived safely;
4. existing API architecture conflicts with token registration;
5. Firebase credentials cannot be safely configured;
6. an existing migration is required but its impact is unclear;
7. implementing the feature requires modifying unrelated authorization architecture;
8. implementing the feature requires a queue;
9. implementation requires frontend changes beyond Phase 1;
10. a security boundary is ambiguous.

Do NOT solve these by inventing architecture.

---

# 39. FINAL SECURITY CHECKLIST

Before declaring Phase 1 complete, verify:

- [ ] Firebase Admin credentials are server-only
- [ ] no Admin credentials are exposed to frontend
- [ ] no client-supplied userId is trusted
- [ ] no client-supplied companyId is trusted
- [ ] ACTIVE status is enforced
- [ ] INVITED users cannot register
- [ ] DISABLED users cannot register
- [ ] users can only revoke their own tokens
- [ ] token ownership cannot silently transfer between users
- [ ] duplicate token registration is handled safely
- [ ] multi-device registrations remain supported
- [ ] `PushApp` is validated
- [ ] full FCM tokens are not logged
- [ ] Firebase errors do not leak credentials
- [ ] no lead notification code exists
- [ ] no `lead:notify` code exists
- [ ] no recipient-selection code exists
- [ ] no Service Worker exists as a result of this phase
- [ ] no browser Firebase SDK is added
- [ ] no Zustand is added
- [ ] no queue is added
- [ ] no unrelated RBAC changes are made

---

# 40. REQUIRED FINAL REPORT

After implementation, produce exactly these sections:

## 1. Implementation Summary

What was implemented.

## 2. Files Created

Exact paths.

## 3. Files Modified

Exact paths and reason for each.

## 4. Dependencies Added

Exact package and version.

## 5. Database Changes

State explicitly:

```text
Migration required: YES / NO
```

If NO, explain why.

If YES, explain exactly what changed.

## 6. API Contract

Document:

- endpoint;
- method;
- authentication;
- request;
- response;
- error cases;
- ownership rules.

## 7. Token Lifecycle

Explain registration, re-registration, revocation, and invalid-token handling.

## 8. Security Validation

Report the cross-user and cross-company tests performed.

## 9. Tests Executed

Exact commands and results.

## 10. Build / Typecheck

Exact commands and results.

## 11. Scope Compliance

Explicitly confirm that the following were NOT implemented:

- lead notifications;
- `lead:notify`;
- recipient selection;
- notification preferences;
- frontend FCM;
- Service Worker;
- queue;
- Zustand;
- auth redesign;
- RBAC redesign.

## 12. Remaining Work

Only list work required for future phases.

## 13. Risks / Follow-ups

Only genuine remaining issues.

## 14. Final Verdict

Use exactly one:

```text
GREEN
YELLOW
RED
```

Definition:

GREEN
= Phase 1 implemented, validated, secure, and ready for Phase 2.

YELLOW
= implementation works but a bounded known issue remains.

RED
= implementation should not proceed to Phase 2.

---

# 41. FINAL NON-NEGOTIABLE INSTRUCTION

Do not confuse:

```text
FCM infrastructure
```

with:

```text
business notification system
```

Phase 1 establishes the infrastructure and secure registration boundary.

The final architecture at the end of this phase should conceptually be:

```text
Authenticated ACTIVE User
        ↓
Token Registration API
        ↓
Ownership Validation
        ↓
FCMToken
        ↓
Firebase Admin Infrastructure
```

NOT:

```text
Lead Created
        ↓
Recipient Selection
        ↓
FCM
```

The second flow belongs to a later phase.

Do not implement it now.

If you find yourself modifying LeadService, adding `lead:notify`, creating notification preferences, adding a Service Worker, adding Firebase browser SDK, introducing a queue, or changing RBAC, you have exceeded the scope of this task.

STOP, revert the out-of-scope change, and report it.

Proceed with Phase 1 only.