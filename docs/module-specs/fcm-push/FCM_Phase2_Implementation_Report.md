# FCM Phase 2 --- PWA Web SDK + Token Registration Implementation Report

**Status:** COMPLETE\
**Production verification:** PASSED\
**Scope:** Portal + Technician PWA

------------------------------------------------------------------------

## 1. Objective

Implement the client-side FCM Web Push foundation:

``` text
Firebase Web SDK
      ↓
Browser notification permission
      ↓
Service Worker
      ↓
getToken()
      ↓
POST /notifications/push-tokens
      ↓
Authenticated user token registration
```

This phase does **not** implement business-event notification sending.

------------------------------------------------------------------------

## 2. Implemented

### Portal

FCM implementation exists under:

``` text
apps/portal/src/lib/fcm/
```

including:

-   Firebase configuration
-   messaging initialization
-   permission handling
-   token registration
-   push-notification hook
-   flow handling
-   tests

Service Worker route:

``` text
apps/portal/src/app/firebase-messaging-sw.js/route.ts
```

### Technician PWA

FCM implementation exists under:

``` text
apps/tech-pwa/src/lib/fcm/
```

including:

-   Firebase configuration
-   messaging initialization
-   permission handling
-   token registration
-   push-notification hook

Service Worker route:

``` text
apps/tech-pwa/src/app/firebase-messaging-sw.js/route.ts
```

------------------------------------------------------------------------

## 3. Environment Variables

Public client variables:

``` text
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_FIREBASE_VAPID_KEY
```

Server-only Firebase Admin credentials remain separate:

``` text
FIREBASE_SERVICE_ACCOUNT_JSON
```

The Admin credential must never be passed into a Next.js client build.

------------------------------------------------------------------------

## 4. Production Issue Found and Fixed

Initial Service Worker registration returned:

``` text
404 Not Found
```

The response showed:

``` text
x-middleware-rewrite: /management/firebase-messaging-sw.js
```

Root cause:

The Portal host-group proxy rewrote the root Service Worker route to the
management route.

Fix:

`apps/portal/src/proxy.ts` excludes:

``` text
firebase-messaging-sw.js
```

from the host-group rewrite matcher.

A dedicated matcher test was added to verify:

-   `/firebase-messaging-sw.js` is excluded
-   normal management routes remain matched
-   existing bypass paths remain excluded

------------------------------------------------------------------------

## 5. Production Service Worker Verification

Production endpoint:

``` text
https://apps.kalibrasimedika.co.id/firebase-messaging-sw.js
```

verified:

``` text
HTTP/1.1 200 OK
Content-Type: application/javascript
service-worker-allowed: /
```

The response contains a valid Firebase Messaging Service Worker
initialization.

Therefore:

``` text
Service Worker route → PASS
```

------------------------------------------------------------------------

## 6. Production Token Registration Verification

Browser successfully:

1.  initialized Firebase Web SDK
2.  registered the Service Worker
3.  obtained browser notification permission
4.  obtained an FCM token through `getToken()`
5.  called:

``` text
POST /notifications/push-tokens
```

The first production attempt returned HTTP 500.

------------------------------------------------------------------------

## 7. Production API Issue Found

The initial 500 was caused by the API running an older
`CompanyRoleGuard`.

The old guard had:

``` ts
if (!required) {
  return true;
}
```

This caused guarded controllers without `@RequirePermission` to skip:

-   session validation
-   membership validation
-   `request.userId` injection
-   `request.companyId` injection

The push-token controller does not require a specific permission, so the
old guard returned early.

As a result:

``` text
userId = undefined
companyId = undefined
```

and Prisma failed when creating the FCM token record.

------------------------------------------------------------------------

## 8. Security-Safe Fix

The corrected `CompanyRoleGuard`:

-   always authenticates the session
-   validates active membership
-   derives `companyId` from membership
-   derives `userId` from the authenticated session
-   checks permission only when a permission requirement exists
-   injects the authenticated context into the request

Critically:

> `userId` and `companyId` are never accepted from the FCM registration
> request body.

This preserves the server-derived identity model.

------------------------------------------------------------------------

## 9. Final Production Verification

After the API fix was deployed, the Portal UI showed:

``` text
Notifications enabled
```

Therefore the following chain is production-verified:

``` text
Browser
   ↓
Firebase Web SDK                    ✅
   ↓
Service Worker                      ✅
   ↓
Notification permission             ✅
   ↓
getToken()                           ✅
   ↓
POST /notifications/push-tokens      ✅
   ↓
Authenticated user context           ✅
   ↓
FCM token registration                ✅
```

------------------------------------------------------------------------

## 10. Phase 2 Boundary

Phase 2 is complete.

It does **not** yet prove:

``` text
Backend
   ↓
Firebase Admin
   ↓
FCM
   ↓
Browser notification
```

Actual notification sending belongs to Phase 3.

It also does not yet implement:

-   Notification Types
-   Notification Recipient Assignment
-   recipient targeting
-   New Lead push events
-   Technician-specific business events
-   production notification hardening

------------------------------------------------------------------------

## 11. Next Phase

### Phase 3 --- Backend FCM Sending

Goal:

> Send one test notification from the NestJS API to one registered FCM
> token.

After that is proven:

### Phase 4 --- Notification Types + Recipient Assignment

This phase introduces the management capability for determining:

> Which users should receive which notification types?

This is intentionally separate from RBAC.

RBAC answers:

``` text
What may this user do?
```

Notification assignment answers:

``` text
What should this user be notified about?
```

FCM tokens answer:

``` text
Which browser/device can receive the notification?
```

The three layers must remain separate.
