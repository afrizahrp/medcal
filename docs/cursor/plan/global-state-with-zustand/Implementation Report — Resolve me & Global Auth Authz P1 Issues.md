# Implementation Report — Resolve /me & Global Auth/Authz P1 Issues

**Date:** 2026-08-23  
**Scope:** P1 fixes from Forensic Verification, Consumer Footprint Audit, and Decision Report  
**Decision:** KEEP REACT CONTEXT — Zustand NOT implemented

---

## 1. Executive Summary

Implementasi menyelesaikan 4 isu P1 yang teridentifikasi di audit forensik:

1. **`onNeedsSignIn` refetch** — effect AuthProvider tidak lagi memicu GET `/me` ulang saat navigasi/pathname berubah
2. **`/me` server state** — dipindahkan dari `useEffect` + `useState` ke TanStack Query dengan ownership tunggal di `@medcal/auth`
3. **`useAuthz()` promotion** — semua consumer authorization (capabilities) dimigrasi dari `useRequireSession().me.capabilities`
4. **Query invalidation** — ditambahkan setelah mutasi permission, role (self), dan menu

AuthProvider integration tests (9 skenario) ditambahkan. Semua typecheck, test, dan build portal + tech-pwa lulus.

---

## 2. Issues Resolved

### Issue 1: `onNeedsSignIn` menyebabkan refetch `/me` saat navigasi

| | |
|---|---|
| **Root cause** | `onNeedsSignIn` ada di dependency array effect AuthProvider; callback di portal providers dibuat ulang setiap `pathname` berubah |
| **Files changed** | `packages/auth/src/auth-provider.tsx`, `apps/portal/src/app/providers.tsx`, `apps/tech-pwa/src/app/providers.tsx` |
| **Solution** | Ref pattern: `onNeedsSignInRef.current = onNeedsSignIn`; effect hanya depend on `[sessionPending, session, meQuery.isError, meQuery.error]`. Portal/tech-pwa: pathname dibaca via ref sehingga callback stabil |
| **Verification** | Test `does not refetch /me when onNeedsSignIn callback identity changes` — PASS |

### Issue 2: `/me` belum di TanStack Query

| | |
|---|---|
| **Root cause** | Server state `/me` di-fetch manual via `useEffect` + local `useState` di AuthProvider |
| **Files changed** | `packages/auth/src/me-query.ts` (new), `packages/auth/src/auth-provider.tsx`, `packages/auth/package.json`, `apps/tech-pwa/src/app/providers.tsx`, `apps/tech-pwa/package.json` |
| **Solution** | `useQuery({ queryKey: meQueryKey(sessionUserId), queryFn: fetchMe, enabled: session exists })`. Context hanya derive `user`, `membership`, `capabilities`, `bootstrapStatus` dari query result |
| **Verification** | Repo-wide search: satu owner `fetchMe()` di `me-query.ts`; test bootstrap + race condition — PASS |

### Issue 3: `useAuthz()` = 0 consumers

| | |
|---|---|
| **Root cause** | Consumer langsung akses `me.capabilities` via `useRequireSession()` |
| **Files changed** | `header.tsx`, `management/page.tsx`, 3 email pages, `client/layout.tsx` |
| **Solution** | Authorization → `useAuthz()`; session gating tetap `useRequireSession()`; identity → `useAuth()` |
| **Verification** | Grep `me.capabilities` = 0 matches; `useAuthz()` = 6 runtime consumers |

### Issue 4: Tidak ada invalidation setelah permission/membership change

| | |
|---|---|
| **Root cause** | Mutasi permission/role/menu tidak invalidate cache `/me` atau `nav` |
| **Files changed** | `packages/auth/src/auth-invalidation.ts` (new), `permission-management/page.tsx`, `users/[id]/page.tsx`, `menu-form.tsx` |
| **Solution** | `invalidateAuthQueries(queryClient, { allNav: true })` setelah save permissions / self role change; `invalidateNavQuery(queryClient, application)` setelah menu save |
| **Verification** | Code review mutasi flows; helpers exported dari `@medcal/auth/client` |

### Issue 5: Tidak ada AuthProvider tests

| | |
|---|---|
| **Root cause** | Tidak ada test file untuk auth provider |
| **Files changed** | `packages/auth/src/auth-provider.test.tsx`, `packages/auth/vitest.config.mts`, `packages/auth/tsconfig.json` |
| **Solution** | 9 integration tests dengan mocked `useSession` + `apiFetch` |
| **Verification** | `pnpm --filter @medcal/auth test` — 25 passed (9 AuthProvider + 16 access-control) |

---

## 3. `/me` Architecture Before

```text
Better Auth (useSession)
    ↓
AuthProvider useEffect [isPending, session, onNeedsSignIn]
    ↓
apiFetch('/me')
    ↓
useState(user, membership, capabilities)
    ↓
AuthContext
```

**Problems:** pathname change → new `onNeedsSignIn` → effect re-run → duplicate GET `/me`; no query cache; no invalidation API.

---

## 4. `/me` Architecture After

```text
Better Auth (useSession)
    ↓ session lifecycle
TanStack Query  queryKey: ['me', sessionUserId]
    ↓ fetchMe() — packages/auth/src/me-query.ts
AuthProvider (derive only, no duplicate authoritative state)
    ↓
AuthContext { bootstrapStatus, user, membership, capabilities, me, ... }
    ↓
useAuth | useAuthz | useMe | useRequireSession
```

**Ownership:**

| Layer | Owns |
|---|---|
| Better Auth | Session cookie lifecycle |
| TanStack Query | `/me` server cache (`ME_QUERY_KEY`) |
| React Context | Derived auth/authz coordination + bootstrap status |
| `useRequireSession` | Session/route protection semantics |
| `useAuthz` | Authorization consumption (capabilities, membership) |

---

## 5. Auth/Authz Boundary

```text
useAuth()           → bootstrapStatus, user, isAuthenticated, isAuthLoading
useAuthz()          → membership, capabilities
useRequireSession() → me + status (session/route protection)
useMe()             → me + status (alias shape)
```

**Rule enforced:** Authorization checks MUST use `useAuthz()`, not `useRequireSession().me.capabilities`.

---

## 6. `useAuthz()` Migration

| File | Before | After |
|---|---|---|
| `management/header.tsx` | `me.capabilities.*` via prop | `useAuthz()` internal |
| `management/page.tsx` | `me?.capabilities.*` | `useAuthz().capabilities` |
| `email/email-page-client.tsx` | `me.capabilities.*` | `useAuthz().capabilities` |
| `email/compose/compose-page-client.tsx` | `me.capabilities.emailSend` | `useAuthz().capabilities` |
| `email/[id]/page.tsx` | `me?.capabilities.*` | `useAuthz().capabilities` |
| `client/layout.tsx` | `me.membership.role` | `useAuthz().membership` |

**Unchanged (session gating only):** `management/layout.tsx`, `client/layout.tsx` (status checks), `tech-pwa/page.tsx`

---

## 7. Query Invalidation

| Mutation | Location | Invalidates |
|---|---|---|
| Save role permissions | `permission-management/page.tsx` | `['me']` + all `['nav']` |
| Update own role | `users/[id]/page.tsx` | `['me']` + all `['nav']` (when `user.id === currentUser.id`) |
| Remove own membership | `users/[id]/page.tsx` | same as above |
| Create/update menu | `menu-form.tsx` | `['nav', application]` |

Helpers: `invalidateMeQuery`, `invalidateNavQuery`, `invalidateAuthQueries` exported from `@medcal/auth/client`.

---

## 8. AuthProvider Tests

| # | Scenario | Status |
|---|---|---|
| 1 | Session pending → auth loading | PASS |
| 2 | Session available → /me → ready → user | PASS |
| 3 | Unauthenticated → no /me → onNeedsSignIn | PASS |
| 4 | /me 401 → onNeedsSignIn | PASS |
| 5 | /me 403 → forbidden | PASS |
| 6 | ACCOUNT_PENDING → pending | PASS |
| 7 | Callback identity change → no refetch | PASS |
| 8 | Logout → auth cleared | PASS |
| 9 | User A late response cannot overwrite User B | PASS |

---

## 9. FCM Regression Verification

FCM tetap via `useAuth().user.id` di:

- `apps/portal/src/components/management/header-controls.tsx`
- `apps/tech-pwa/src/app/page.tsx`

Tidak ada merge FCM state ke auth store. AuthProvider changes tidak memodifikasi FCM flow.

---

## 10. Public API Compatibility

**Preserved exports:**

```text
useAuth()
useAuthz()
useMe()
useRequireSession()
AuthProvider
```

**New exports (non-breaking):**

```text
ME_QUERY_KEY, meQueryKey, fetchMe
invalidateMeQuery, invalidateNavQuery, invalidateAuthQueries
```

**Breaking changes:** None

---

## 11. Test / Typecheck / Build Results

| Command | Result |
|---|---|
| `pnpm --filter @medcal/auth test` | 25 passed |
| `pnpm --filter @medcal/auth typecheck` | PASS |
| `pnpm --filter @medcal/portal typecheck` | PASS |
| `pnpm --filter @medcal/tech-pwa typecheck` | PASS |
| `pnpm --filter @medcal/portal test` | 14 passed |
| `pnpm --filter @medcal/portal build` | PASS |
| `pnpm --filter @medcal/tech-pwa build` | PASS |

---

## 12. Git Diff Review

### Files expected to change (this task)

```text
packages/auth/src/me-query.ts                    (new)
packages/auth/src/auth-invalidation.ts             (new)
packages/auth/src/auth-provider.tsx                (new/refactored)
packages/auth/src/auth-provider.test.tsx           (new)
packages/auth/src/client.ts
packages/auth/package.json
packages/auth/tsconfig.json
packages/auth/vitest.config.mts
apps/portal/src/app/providers.tsx
apps/portal/src/app/management/*.tsx               (authz migration)
apps/portal/src/components/management/header.tsx
apps/portal/src/components/management/management-shell.tsx
apps/portal/src/app/client/layout.tsx
apps/tech-pwa/src/app/providers.tsx                (new)
apps/tech-pwa/package.json
pnpm-lock.yaml
```

### Files preserved (unrelated pre-existing changes)

```text
apps/portal/src/components/management/sidebar.tsx  (hover/pin — pre-existing)
docs/cursor/plan/global-state-with-zustand/        (audit docs — pre-existing)
```

### Unexpected changes

**NO** — all modifications align with pre-implementation inventory + prior global auth migration work.

---

## 13. Remaining Issues

### P0

0

### P1

0 (all targeted P1 issues resolved in this task)

### P2

| Issue | Notes |
|---|---|
| `useMe()` still 0 consumers | Available but unused; optional future cleanup |
| Notification settings mutation | Does not affect `/me` capabilities — no invalidation needed |
| Role change for other users | Other user's client must refetch on next navigation/focus — acceptable |
| `@vitejs/plugin-react` peer vite warning | Dev-only; tests pass |

---

## 14. Zustand Status

```text
Zustand migration:
NOT IMPLEMENTED

Current decision:
KEEP REACT CONTEXT UNTIL OBJECTIVE TRIGGER
```

Objective triggers unchanged (≥18 direct subscribers OR Email pattern copied ≥12×).

---

## Pre-Implementation Inventory (Phase 0)

```text
Files expected to change:
- packages/auth/src/* (provider, query, invalidation, tests)
- apps/portal providers + authz consumers + invalidation sites
- apps/tech-pwa providers + package.json

Files expected NOT to change:
- apps/api (backend auth)
- FCM lib internals
- Business domains (quotation, PO, invoice, etc.)
- sidebar.tsx hover/pin (preserved as-is)
```
