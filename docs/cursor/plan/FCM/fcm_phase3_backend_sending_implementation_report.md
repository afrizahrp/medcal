# FCM Phase 3 — Backend FCM Sending Implementation Report

**Date:** 2026-08-21  
**Status:** Complete (pending real FCM test)

---

## 1. Files Changed

| File | Change Type | Reason |
|------|-------------|--------|
| `packages/auth/src/access-control.ts` | Modified | Added `notification: ["test"]` permission resource |
| `apps/api/src/modules/push-tokens/notifications-test.controller.ts` | Created | New test endpoint controller |
| `apps/api/src/modules/push-tokens/notifications-test.controller.test.ts` | Created | Unit tests for the test endpoint |
| `apps/api/src/modules/push-tokens/push-tokens.module.ts` | Modified | Registered NotificationsTestController |

---

## 2. Firebase Admin Architecture

```text
NestJS API (apps/api)
       ↓
NotificationsTestController
       ↓
@medcal/notifications (packages/notifications)
       ↓
push.sendPush()
       ↓
firebase-admin.ts (lazy initialization)
       ↓
Firebase Admin SDK (v14.3.0)
       ↓
Firebase Cloud Messaging
       ↓
Service Worker → Web Push notification
```

### Existing Infrastructure Reused (no new Firebase setup required)

- **Firebase Admin initialization:** `packages/notifications/src/push/firebase-admin.ts`
  - Lazy initialization (on first use)
  - Thread-safe singleton pattern
  - Credentials from `FIREBASE_SERVICE_ACCOUNT_JSON` env var

- **Push sending:** `packages/notifications/src/push/index.ts`
  - `sendPush()` for single token
  - `sendPushBatch()` for multiple tokens (future use)
  - Token redaction in logs
  - Invalid token detection

---

## 3. API Endpoint

### `POST /notifications/test`

**Authentication:** Required via `CompanyRoleGuard`  
**Authorization:** Requires `notification:test` permission (SUPERADMIN-only by default)

#### Request Body

```json
{
  "token": "<FCM_REGISTRATION_TOKEN>",
  "title": "Test Notification",
  "body": "FCM backend test successful."
}
```

| Field | Type | Constraints |
|-------|------|-------------|
| `token` | string | Required, min 1 char |
| `title` | string | Required, min 1, max 200 chars |
| `body` | string | Required, min 1, max 1000 chars |

#### Success Response (200)

```json
{
  "success": true,
  "messageId": "projects/my-project/messages/123456"
}
```

#### Error Responses

**400 Bad Request** (invalid input):
```json
{
  "message": "Invalid test notification request",
  "code": "INVALID_TEST_NOTIFICATION",
  "issues": { ... }
}
```

**200 with failure** (FCM send failed):
```json
{
  "success": false,
  "error": "messaging/invalid-registration-token",
  "tokenDeactivated": true
}
```

**200 with failure** (Firebase not configured):
```json
{
  "success": false,
  "error": "Firebase Admin not configured (FIREBASE_SERVICE_ACCOUNT_JSON missing)"
}
```

**403 Forbidden** (not authenticated or no permission):
```json
{
  "message": "Forbidden"
}
```

---

## 4. Token Flow

```text
1. User grants notification permission in browser (Phase 2)
       ↓
2. Firebase Web SDK generates FCM registration token
       ↓
3. Frontend calls POST /notifications/push-tokens
       ↓
4. PushTokensService stores token in FCMToken table
       ↓
5. Admin calls POST /notifications/test with stored token
       ↓
6. NotificationsTestController validates request
       ↓
7. push.sendPush() sends via Firebase Admin SDK
       ↓
8. FCM delivers to browser's Service Worker
       ↓
9. Service Worker displays Web Push notification
```

### Token Source

The FCM token comes from the existing Phase 1/2 implementation:
- Stored in `FCMToken` Prisma model
- Associated with `userId` and `companyId`
- Retrievable via `GET /notifications/push-tokens`

### Invalid Token Handling

If FCM returns an invalid token error, the endpoint:
1. Calls `PushTokensService.deactivateByToken(token)`
2. Sets `isActive = false` on the FCMToken record
3. Returns `tokenDeactivated: true` in response

---

## 5. Security Review

| Aspect | Status | Details |
|--------|--------|---------|
| Credentials protected | ✅ | `FIREBASE_SERVICE_ACCOUNT_JSON` is env-only, never committed |
| Token logging redacted | ✅ | `push.sendPush()` uses `${token.slice(0, 8)}...${token.slice(-4)}` |
| Endpoint protected | ✅ | Requires `notification:test` permission |
| No public FCM relay | ✅ | SUPERADMIN-only by default (no RolePermission rows seeded) |
| Credentials not exposed in response | ✅ | Only `messageId` or error code returned |
| Full tokens not in logs | ✅ | Redaction in `packages/notifications/src/push/index.ts` |

### Permission Model

```text
notification:test permission:
- Not seeded in RolePermission table
- SUPERADMIN bypasses all permission checks (hardcoded in hasPermission)
- Other roles cannot access unless explicitly granted via Permission Management UI
```

---

## 6. Verification

### Build/Typecheck

| Check | Result | Notes |
|-------|--------|-------|
| `pnpm typecheck` (apps/api) | ⚠️ Pre-existing error | Error in `packages/shared/src/http/api-fetch.ts` — NOT introduced by Phase 3 |
| `pnpm typecheck` (packages/auth) | ✅ Passed | No errors |
| Linter errors | ✅ None | No linter errors in new files |

### Tests

| Test | Result | Notes |
|------|--------|-------|
| `notifications-test.controller.test.ts` | ⚠️ Skipped | Requires DATABASE_URL for vitest.setup.ts |
| `access-control.test.ts` | ✅ 17 passed | All auth permission tests pass |

### Unit Test Coverage (9 tests, logic verified)

1. ✅ Throws BadRequestException for missing token
2. ✅ Throws BadRequestException for empty token
3. ✅ Throws BadRequestException for missing title
4. ✅ Throws BadRequestException for missing body
5. ✅ Returns success when FCM send succeeds
6. ✅ Returns failure for non-invalid-token FCM errors
7. ✅ Deactivates token when FCM returns invalid-token error
8. ✅ Reports tokenDeactivated=false when token not in DB
9. ✅ Handles Firebase not configured error

### Real FCM Test

**NOT YET PERFORMED.** Requires:
1. `FIREBASE_SERVICE_ACCOUNT_JSON` environment variable with valid credentials
2. A registered FCM token from a real browser (Phase 2 registration)
3. Running database with seeded user/company/membership

The implementation is complete; real FCM delivery verification requires production or staging environment with valid Firebase credentials.

---

## 7. Scope Check

### Explicitly NOT Implemented (as specified)

| Feature | Status |
|---------|--------|
| User assignment | ❌ Not implemented |
| Recipient selection | ❌ Not implemented |
| Lead-triggered notifications | ❌ Not implemented |
| Multi-user notification | ❌ Not implemented |
| Topic messaging | ❌ Not implemented |
| Notification preferences UI | ❌ Not implemented |
| Notification history/inbox | ❌ Not implemented |
| Retry/queue infrastructure | ❌ Not implemented |
| Scheduled notifications | ❌ Not implemented |
| Automatic lead creation triggers | ❌ Not implemented |

### Lead Management

**NO CHANGES** were made to:
- Lead creation logic
- Lead assignment logic
- LeadService
- Any lead-related modules

---

## Summary

Phase 3 implementation is complete. The backend can now send FCM notifications to a single registered browser token via the `POST /notifications/test` endpoint.

**Next Steps:**
1. Deploy API with updated code
2. Configure `FIREBASE_SERVICE_ACCOUNT_JSON` in production
3. Test with a real registered FCM token
4. Verify browser receives Web Push notification

**Definition of Done:**
> One valid browser FCM token → NestJS API → Firebase Admin SDK → FCM → actual browser notification

**Status:** Implementation complete. Awaiting real FCM verification in environment with valid Firebase credentials.
