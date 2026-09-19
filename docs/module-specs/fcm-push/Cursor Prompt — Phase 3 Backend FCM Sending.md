# Phase 3 — Backend FCM Sending

## Objective

Implement **Phase 3 of the FCM Web Push integration**:

> **NestJS API → Firebase Admin SDK → FCM → 1 registered browser token**

The goal is to prove that the backend can send a Firebase Cloud Messaging notification to **one already-registered browser FCM token**.

This phase is strictly a backend sending implementation.

---

## Important Scope Boundary

DO NOT implement user assignment / notification recipient selection in this phase.

Specifically, do NOT introduce:

- lead assignment logic
- role-based notification targeting
- permission-based notification targeting
- "which users should receive this notification"
- broadcast to multiple users
- topic-based messaging
- automatic notification triggers from lead creation
- notification preferences UI
- notification history/inbox
- retry/queue infrastructure
- scheduled notifications

Those belong to later phases.

For this phase, the recipient is simply:

> **one valid FCM registration token already stored/available from the existing Phase 1/2 implementation.**

---

# Step 1 — Audit Existing Implementation First

Before modifying anything, inspect the repository and identify:

1. Existing NestJS application structure.
2. Existing authentication/user architecture.
3. Existing database schema related to users.
4. Existing FCM/browser token implementation from Phase 1/2.
5. Where browser FCM tokens are currently stored.
6. Existing environment-variable conventions.
7. Existing configuration module/service patterns.
8. Existing API/controller/service patterns.
9. Existing error-handling conventions.
10. Existing logging conventions.

Do NOT assume filenames, modules, entities, Prisma models, or environment variable names.

Use the existing architecture.

Do not create duplicate infrastructure if an equivalent implementation already exists.

---

# Step 2 — Firebase Admin SDK

Add Firebase Admin SDK to the NestJS backend only if it is not already installed.

Use the official Firebase Admin SDK.

Create a small, isolated Firebase/FCM infrastructure layer following the project's existing NestJS conventions.

The Firebase Admin initialization must:

- happen server-side only
- use environment configuration
- never expose Firebase Admin credentials to the frontend
- never expose private service-account credentials through an API response
- avoid initializing multiple Firebase Admin apps unnecessarily

Prefer the project's existing configuration system instead of directly reading `process.env` throughout business logic.

---

# Step 3 — Firebase Credentials

Determine how this project currently manages production secrets.

Do NOT hard-code:

- private keys
- service-account JSON
- client secrets
- credentials in source code

The implementation should support the project's production deployment model.

If Firebase Admin requires a service account, use environment-backed credentials or the project's existing secure secret mechanism.

Be careful with multiline/private-key handling.

Do not modify production secrets automatically.

If required configuration is missing, make the application fail clearly at the Firebase integration boundary rather than silently behaving as if FCM were available.

---

# Step 4 — FCM Sending Service

Implement a dedicated backend service responsible for sending an FCM message to **one registration token**.

Conceptually:

```text
NestJS Controller
       ↓
FCM Service
       ↓
Firebase Admin SDK
       ↓
FCM
       ↓
Browser registration token
```

The service should accept:

- one FCM registration token
- notification title
- notification body

Optionally include a small data payload only if it is useful for the existing PWA/service-worker implementation.

Do not introduce a complex notification abstraction yet.

Keep the implementation minimal and testable.

---

# Step 5 — Test Endpoint

Create a temporary/dev-oriented authenticated endpoint for testing the integration.

The endpoint should allow the backend to send a notification to **one specified registered FCM token**.

Example conceptual API:

```http
POST /notifications/test
```

Request:

```json
{
  "token": "<FCM_REGISTRATION_TOKEN>",
  "title": "Test Notification",
  "body": "FCM backend test successful."
}
```

IMPORTANT:

Follow the project's existing authentication and authorization conventions.

Do NOT create an unauthenticated public endpoint merely to simplify testing.

If the existing application has an appropriate protected/admin route structure, use it.

Do not invent a new authorization system.

---

# Step 6 — Security

The test endpoint must NOT become a generic public FCM relay.

At minimum:

- endpoint must be protected according to existing backend auth conventions
- validate the request body
- require a non-empty token
- require reasonable title/body values
- do not log the full FCM token
- do not return Firebase credentials
- do not expose internal Firebase errors unnecessarily

When logging an FCM token, redact it.

Example:

```text
abcd...wxyz
```

not:

```text
<full token>
```

---

# Step 7 — Error Handling

Handle Firebase Admin errors cleanly.

Distinguish at least:

1. Firebase configuration failure
2. Invalid registration token
3. Unregistered/expired token
4. Firebase/FCM sending failure
5. Invalid API request

Do not swallow errors.

Return an appropriate API-level error according to the project's existing NestJS error-handling conventions.

Do not expose raw stack traces or sensitive Firebase information to API clients.

---

# Step 8 — Token Storage

Use the EXISTING FCM token registration implementation from Phase 1/2.

Do not redesign token registration in this phase.

Do not create another token table/model if one already exists.

The Phase 3 test must work with the token produced by the existing frontend registration flow.

If the existing implementation stores tokens associated with users, preserve that relationship, but do not yet implement recipient selection logic.

---

# Step 9 — Frontend/PWA Compatibility

Verify the payload is compatible with the existing PWA Firebase Messaging implementation.

The expected flow is:

```text
Browser
  ↓
Firebase Web SDK
  ↓
FCM registration token
  ↓
NestJS API
  ↓
stored registered token
  ↓
Firebase Admin SDK
  ↓
FCM
  ↓
Service Worker
  ↓
Web Push notification
```

Do not redesign the frontend implementation unless an actual Phase 3 compatibility issue is discovered.

If a change is necessary, explain exactly why before making it.

---

# Step 10 — No Automatic Lead Notification Yet

Do NOT connect this service to lead creation.

Do NOT modify lead creation logic to automatically send notifications.

The Phase 3 success criterion is only:

> Backend can explicitly send a test notification to one valid registered browser token.

Automatic lead notification will be implemented after recipient assignment/targeting has been designed.

---

# Step 11 — Testing

Add appropriate tests following the project's existing testing conventions.

At minimum verify:

### Unit-level

- FCM service initialization behavior
- successful send
- Firebase error handling
- invalid token handling
- token redaction in logs if logging is tested

### API-level

- authentication/authorization requirement
- request validation
- successful request
- invalid request
- FCM failure response

Do not add a large testing framework or infrastructure if the project already has an established approach.

---

# Step 12 — Build Verification

After implementation:

```bash
npm run build
```

Run the project's relevant tests.

Do not modify unrelated code merely to make tests pass.

If build/test failures existed before the implementation, distinguish:

```text
Pre-existing failure
```

from:

```text
Phase 3 introduced failure
```

---

# Step 13 — Production Safety

Before considering Phase 3 complete, verify:

- Firebase Admin credentials are not committed
- service-account JSON is not committed
- `.env` secrets are not committed
- frontend cannot access Firebase Admin credentials
- no full FCM tokens appear in logs
- test endpoint is authenticated
- no lead workflow has been modified
- no broadcast/topic functionality has been introduced

---

# Deliverable

At the end, produce a concise implementation report containing:

## 1. Files Changed

List every file created or modified.

For each file, explain why it changed.

## 2. Firebase Admin Architecture

Explain:

```text
NestJS
  ↓
Firebase Admin initialization
  ↓
FCM service
  ↓
Firebase Cloud Messaging
```

## 3. API Endpoint

Document:

- HTTP method
- route
- authentication requirement
- request body
- success response
- error responses

## 4. Token Flow

Explain exactly where the FCM token comes from and how Phase 3 uses it.

## 5. Security Review

Confirm:

- credentials are protected
- token logging is redacted
- endpoint is protected
- no public FCM relay exists

## 6. Verification

Report:

- build result
- test result
- whether the backend successfully sent a real FCM message

If a real FCM test could not be performed because Firebase credentials or a registered browser token are unavailable, state that clearly.

Do NOT claim success without evidence.

## 7. Scope Check

Explicitly confirm that this phase did NOT implement:

- user assignment
- recipient selection
- lead-triggered notifications
- multi-user notification
- topic messaging

---

# Critical Cursor Rules

1. **Audit first.**
2. **Reuse existing architecture.**
3. **Do not invent missing infrastructure unnecessarily.**
4. **Do not refactor unrelated code.**
5. **Do not modify lead management.**
6. **Do not implement recipient assignment yet.**
7. **Do not implement multi-user sending yet.**
8. **Do not claim real FCM delivery without actually verifying it.**
9. **Do not expose secrets or full FCM tokens.**
10. **If something is ambiguous, inspect the repository and existing implementation before making assumptions.**
11. **Keep the implementation production-safe but minimal.**
12. **Do not "improve" unrelated parts of the application.**

The definition of done is:

> **One valid browser FCM token → NestJS API → Firebase Admin SDK → FCM → actual browser notification.**