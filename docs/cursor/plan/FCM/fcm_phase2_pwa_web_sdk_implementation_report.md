# PWA FCM Web Push — Implementation Report
## Firebase Web SDK + Token Registration
### MedCal — Completed: August 20, 2026

---

## 1. Files Changed

### Backend (necessary fix for existing token API)

| File | Why |
|------|-----|
| `apps/api/src/common/guards/company-role.guard.ts` | Phase 1 push-tokens routes used `CompanyRoleGuard` without `@RequirePermission`, so the guard previously returned `true` without setting `userId`/`companyId` or enforcing ACTIVE. Guard now always enforces session + ACTIVE membership; permission check only when `@RequirePermission` is present. |

### Portal

| File | Why |
|------|-----|
| `apps/portal/package.json` | Added `firebase`, `vitest`, `test` script |
| `apps/portal/src/lib/fcm/*` | Firebase config, permission, messaging, register, hook, flow helpers + tests |
| `apps/portal/src/app/firebase-messaging-sw.js/route.ts` | Dynamic FCM service worker (injects `NEXT_PUBLIC_FIREBASE_*`) |
| `apps/portal/src/components/management/header-controls.tsx` | Minimal “Enable notifications” in user menu |

### Tech-PWA

| File | Why |
|------|-----|
| `apps/tech-pwa/package.json` | Added `firebase` |
| `apps/tech-pwa/src/lib/fcm/*` | Same client registration flow with `app: "TECH_PWA"` |
| `apps/tech-pwa/src/app/firebase-messaging-sw.js/route.ts` | Dynamic FCM service worker |
| `apps/tech-pwa/src/app/page.tsx` | Minimal enable-notifications control |

### Env docs

| File | Why |
|------|-----|
| `.env.example` | Document frontend Firebase Web + VAPID vars; note server-only Admin JSON |
| `.env.production.example` | Same distinction for production |

---

## 2. Firebase Setup

### Frontend (public — `NEXT_PUBLIC_*`)

```text
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_FIREBASE_VAPID_KEY
```

### Server-only (never in frontend)

```text
FIREBASE_SERVICE_ACCOUNT_JSON
```

---

## 3. Service Worker

- **URL:** `/firebase-messaging-sw.js`
- **Implementation:** Next.js App Router route handlers in each app (not static `public/` files)
- **Why:** Injects public Firebase web config from env at runtime; no hardcoded credentials
- **Behavior:** Firebase compat `importScripts` + `firebase.messaging()` for background delivery
- **Existing SW:** None present — no Workbox/next-pwa conflict
- **Manifest / installability:** Untouched

---

## 4. Permission Flow

- No auto-prompt on page load
- Explicit **Enable notifications** action (Portal user menu; Tech-PWA header)
- States handled: `unsupported`, `unconfigured`, `default`, `denied`, `granted` / `enabled`, `error`
- Does **not** re-prompt after browser denial

---

## 5. Token Flow

```text
Authenticated ACTIVE user
  → Enable notifications (or already granted + authenticated)
    → Notification.requestPermission() if default
      → register /firebase-messaging-sw.js
        → getToken({ vapidKey, serviceWorkerRegistration })
          → POST /notifications/push-tokens
             { token, deviceType, app: "PORTAL" | "TECH_PWA" }
```

- Session cookie authenticates; client never sends `userId` / `companyId`
- Same token is not re-POSTed every render (`sessionStorage` last-token hint only)

---

## 6. Backend Dependency

**Existing endpoint found and reused:**

```http
POST /notifications/push-tokens
```

Contract: `{ token, deviceType, app }` with `app` ∈ `WEB | PORTAL | TECH_PWA`.

No new backend registration contract was invented.

---

## 7. Validation

| Check | Result |
|-------|--------|
| `pnpm typecheck --filter @medcal/portal --filter @medcal/tech-pwa` | ✅ PASSED |
| `pnpm test` (portal `src/lib/fcm/flow.test.ts`) | ✅ 9 passed |
| Lint | Skipped by package scripts (`lint portal/tech-pwa skipped`) |
| `pnpm --filter @medcal/portal build` | ✅ PASSED (`/firebase-messaging-sw.js` present) |
| `pnpm --filter @medcal/tech-pwa build` | ✅ PASSED (`/firebase-messaging-sw.js` present) |
| `@medcal/api` typecheck | Pre-existing error in `packages/shared/src/http/api-fetch.ts` (unrelated) |

---

## 8. Scope Compliance

NOT implemented:

- Lead notification business logic
- `lead:notify` / recipient selection
- RBAC redesign
- Notification DB redesign
- Arbitrary UI redesign
- Auth redesign
- Queue / Zustand

---

## 9. Final Verdict

```text
YELLOW
```

Frontend FCM registration foundation is in place and wired to the existing backend. Requires Firebase web + VAPID env values before runtime verification in a real browser.
