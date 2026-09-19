Implement **PWA FCM Web Push foundation** for the existing Medcal application.

## OBJECTIVE

Implement only the client-side FCM Web Push registration flow:

```text
PWA Browser
  → Firebase Web SDK
  → Notification permission
  → getToken()
  → FCM registration token
  → register token to existing backend API
```

The backend will later use the registered tokens to send notifications to authorized users.

Do NOT implement the lead notification business logic in this task.

Do NOT redesign the existing authentication, RBAC, permission, or notification architecture.

---

## SCOPE

Implement:

1. Firebase Web SDK initialization
2. Firebase Messaging initialization
3. Firebase configuration using environment variables
4. FCM service worker
5. Browser notification permission handling
6. `getToken()`
7. FCM token registration to the existing authenticated backend
8. Basic token lifecycle handling
9. Proper error handling
10. Minimal documentation/configuration required to run it

Do NOT implement:

- lead notification business logic
- notification targeting rules
- role/permission redesign
- new RBAC rules
- notification database redesign
- background notification business logic
- arbitrary UI redesign
- unrelated refactoring
- changing existing authentication flow
- changing existing API contracts unless absolutely required for token registration

If an existing backend endpoint for FCM/device-token registration already exists, reuse it.

If no suitable endpoint exists, STOP before inventing a backend contract and report exactly what is missing.

---

# 1. FIRST: INSPECT THE EXISTING CODEBASE

Before changing anything, inspect:

- PWA configuration
- Next.js configuration
- existing service workers
- existing Firebase dependencies/configuration
- authentication implementation
- API client implementation
- environment variable conventions
- existing notification/device-token models or endpoints
- existing user/session information

Look for:

- `firebase`
- `firebase-admin`
- `firebase/messaging`
- service worker files
- `manifest`
- PWA registration
- existing API client
- authenticated user context
- device token / push token / notification token

Do not duplicate existing functionality.

At the beginning of your work, provide a short implementation plan based on what actually exists in the repository.

---

# 2. FIREBASE WEB SDK

Use the Firebase Web SDK on the PWA/frontend.

Use the existing package manager and project conventions.

If Firebase is not currently installed, add the required Firebase Web SDK dependency.

Create a small, isolated Firebase client configuration module.

Use environment variables for Firebase Web configuration.

Expected variables are conceptually:

```text
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
```

If the project already uses a different naming convention, follow the existing convention rather than creating duplicates.

Never hard-code Firebase credentials/configuration into source code.

Important:

Firebase Web configuration values are not treated as server secrets. However, service-account credentials and Firebase Admin credentials must NEVER be placed in the frontend.

---

# 3. FIREBASE MESSAGING

Initialize Firebase Messaging only in a browser environment.

Do not initialize browser messaging during SSR.

Use the Firebase Messaging APIs appropriate for the currently installed Firebase SDK version.

Handle unsupported browsers gracefully.

The application must not crash if:

- Firebase configuration is incomplete
- Messaging is unsupported
- Notification permission is denied
- service worker registration fails
- `getToken()` fails
- backend token registration fails

Errors should be handled explicitly and logged appropriately without exposing secrets.

---

# 4. SERVICE WORKER

Add the Firebase Messaging service worker required for background FCM handling.

Use the standard Firebase Messaging service-worker approach compatible with the installed Firebase SDK.

The service worker must be located where the browser can actually register it for the PWA origin.

Do not create multiple competing service workers.

IMPORTANT:

First inspect whether the PWA already has an existing service worker.

If one exists:

- do NOT blindly create another service worker
- determine whether Firebase Messaging can be integrated into the existing worker
- preserve existing PWA functionality
- do not break caching/offline behavior

If the existing architecture cannot safely support Firebase messaging without a larger change, stop and report the conflict instead of inventing a solution.

---

# 5. NOTIFICATION PERMISSION

Implement an explicit permission flow.

Do not automatically spam the browser with a permission request immediately on page load unless the existing application architecture already intentionally does that.

Prefer an explicit application-level action such as:

```text
Enable notifications
```

The permission flow should handle:

```text
default
granted
denied
unsupported
```

Do not repeatedly call `Notification.requestPermission()` when the user has already denied permission.

The UI should expose the current notification state in a minimal way if there is already an appropriate settings/profile area.

Do NOT redesign the application's UI.

---

# 6. GET FCM TOKEN

After permission is granted:

1. Ensure the Firebase Messaging service worker is registered.
2. Obtain the FCM registration token using `getToken()`.
3. Use the Firebase Web configuration.
4. Use the appropriate VAPID public key.

The VAPID public key must come from an environment variable, for example:

```text
NEXT_PUBLIC_FIREBASE_VAPID_KEY
```

Do not hard-code it.

Conceptually:

```text
permission granted
        ↓
service worker ready
        ↓
getToken()
        ↓
FCM token
```

Handle the case where `getToken()` returns no token.

Do not treat an empty token as successful registration.

---

# 7. REGISTER TOKEN TO BACKEND

After obtaining a valid FCM token, register it with the existing backend API using the authenticated user's identity/session.

IMPORTANT:

The frontend must NOT send an arbitrary user ID supplied by the user as the source of authorization.

The backend must associate the token with the currently authenticated user.

Use the existing authentication mechanism and API client.

Expected conceptual payload:

```json
{
  "token": "<FCM_TOKEN>",
  "platform": "web"
}
```

Only introduce additional fields if the existing backend contract requires them.

If the backend already has an endpoint for device/push token registration, use that exact endpoint and contract.

If the backend endpoint does not exist, STOP and report:

```text
FCM frontend registration is ready, but backend token-registration endpoint is missing.
```

Do not invent a new backend endpoint without explicit authorization.

---

# 8. TOKEN LIFECYCLE

The implementation should not blindly POST the same token on every render.

Avoid registration loops.

Registration should happen when appropriate, such as:

- notification permission becomes granted
- authenticated user becomes available
- a new FCM token is obtained
- application startup requires token synchronization

Do not persist sensitive authentication data in localStorage merely to implement this.

If local persistence is used for token-registration optimization, keep it minimal and explain why.

The backend must remain the source of truth.

---

# 9. AUTHENTICATION BOUNDARY

FCM token registration belongs to the authenticated application user.

The flow should therefore conceptually be:

```text
User logs in
   ↓
PWA knows authenticated session
   ↓
User enables notifications
   ↓
FCM getToken()
   ↓
POST token to backend
   ↓
Backend identifies authenticated user
   ↓
Backend stores token association
```

Do not allow the client to register a token against another user.

Do not add client-side role checks as a substitute for backend authorization.

---

# 10. SECURITY

Verify that:

- Firebase Admin credentials are never exposed to the frontend
- service-account JSON is never committed
- FCM server credentials are never placed in `NEXT_PUBLIC_*`
- tokens are transmitted over the existing HTTPS API
- backend authentication is required for token registration
- token ownership is determined server-side

Do not add unnecessary secrets to frontend environment variables.

---

# 11. PWA COMPATIBILITY

Verify the implementation against the existing PWA setup.

Do not break:

- manifest
- installability
- existing service worker behavior
- offline behavior
- existing caching
- existing authentication
- existing application startup

If an existing service worker uses Workbox/next-pwa/custom logic, integrate carefully rather than replacing it.

---

# 12. TESTING

Add or update tests where the existing project conventions support them.

At minimum verify:

### Unsupported browser

```text
Messaging unsupported
→ no crash
→ clear diagnostic
```

### Permission denied

```text
permission denied
→ no getToken()
→ no backend registration
```

### Permission granted

```text
permission granted
→ service worker available
→ getToken()
→ valid FCM token
→ backend registration
```

### Backend failure

```text
FCM token obtained
→ backend registration fails
→ application remains usable
→ error handled cleanly
```

### Unauthenticated user

```text
No authenticated user
→ do not register token
```

---

# 13. ENVIRONMENT DOCUMENTATION

Update the appropriate environment example/documentation file with the required frontend variables.

Do not put real production credentials into committed files.

Clearly distinguish:

```text
Frontend Firebase configuration
```

from:

```text
Firebase Admin/server credentials
```

The latter must remain server-side only.

---

# 14. PRODUCTION BUILD

Run the relevant checks used by this repository:

- typecheck
- lint if configured
- tests if relevant
- production build

Do not change unrelated code merely to make unrelated existing failures disappear.

If a failure is pre-existing, report it separately.

---

# 15. FINAL REPORT

At the end, report:

### Files changed

List every changed file and why.

### Firebase setup

List required environment variables.

### Service worker

Explain exactly which service worker is used and how it integrates with the existing PWA.

### Permission flow

Explain how notification permission is requested.

### Token flow

Explain:

```text
permission
→ service worker
→ getToken()
→ backend registration
```

### Backend dependency

State whether an existing backend token-registration endpoint was found.

If it was not found, do NOT invent one. Clearly state that frontend implementation is blocked at the backend-registration step.

### Validation

Report:

- typecheck result
- lint result
- test result
- production build result

### Important

Do not implement anything outside this scope.

Do not redesign existing architecture.

Do not assume missing backend functionality.

Do not silently invent API endpoints, database models, roles, permissions, or notification rules.

If something required is missing, stop and report it clearly.