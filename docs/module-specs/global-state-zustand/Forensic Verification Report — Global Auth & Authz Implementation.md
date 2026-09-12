# Forensic Verification Report — Global Auth & Authz Implementation

**Tanggal:** 2026-08-23  
**Mode:** Read-only — tidak ada perubahan kode  
**Source of truth:** Repository code aktual  
**Referensi:** [Audit Report](./Audit%20Report%20—%20Global%20Auth%20&%20Authz%20State.md) · [Implementation Report](./Implementation%20Report%20—%20Global%20Auth%20&%20Authz%20State.md)

---

## 1. Executive Verdict

```text
PASS WITH P1 FIXES
```

Implementasi **secara teknis benar** untuk tujuan immediate: satu orchestration point `GET /me`, tidak ada duplicate fetch dari consumer, boundary auth/authz/FCM/nav sebagian besar terjaga, backend tetap enforcement boundary.

Namun ada **gap foundation** untuk near-term roadmap: tidak ada test AuthProvider, nav tidak di-invalidate setelah permission change, dan pola server-state (`/me`) belum selaras dengan TanStack Query yang sudah dipakai untuk nav/email/leads.

---

## 2. Implementation Report ↔ Actual Repository

```text
IMPLEMENTATION REPORT ↔ ACTUAL REPOSITORY: PARTIAL MATCH
```

| Claim (Implementation Report) | Actual Code | Result |
|---|---|---|
| `AuthProvider` di `packages/auth/src/auth-provider.tsx` | File ada, diekspor via `@medcal/auth/client` | **PASS** |
| `auth-client.ts` pisah dari provider | Ada | **PASS** |
| `me-types.ts` unified types | Ada, satu definisi `Me` | **PASS** |
| Portal + tech-pwa hapus `use-require-session.ts` | Deleted; grep repo utama = 0 match | **PASS** |
| 7 portal consumer dimigrasi | 6 layout/pages + header types; semua import `@medcal/auth/client` | **PASS** |
| Tech-pwa `providers.tsx` + layout update | Ada | **PASS** |
| Nav → React Query `['nav', application]` | [`use-nav.ts`](../../../../apps/portal/src/lib/use-nav.ts) L39–42 | **PASS** |
| FCM via `useAuth()` bukan props | [`header-controls.tsx`](../../../../apps/portal/src/components/management/header-controls.tsx), [`tech-pwa/page.tsx`](../../../../apps/tech-pwa/src/app/page.tsx) | **PASS** |
| React Context, bukan Zustand | Benar — tidak ada dependency Zustand | **PASS** |
| `api-fetch.ts` typing fix | Modified | **PASS** |
| Semua perubahan tercakup report | `apps/portal/src/components/management/sidebar.tsx` juga modified (unrelated auth — hover/pin sidebar) | **PARTIAL** |
| Changes committed | Git status: **uncommitted** (working tree) | **NEEDS VERIFICATION** (belum di-commit) |

**File berubah tapi tidak disebut report:** `sidebar.tsx`, `pnpm-lock.yaml`, `tsconfig.tsbuildinfo` (build artifacts)

---

## 3. AuthProvider Forensic Findings

### 3.1 Provider lifecycle

```text
App Root (Providers)
  ↓
QueryClientProvider (portal only)
  ↓
AuthProvider
  ↓
useSession() [Better Auth]
  ↓
GET /me [single effect in auth-provider.tsx:70]
  ↓
AuthContext
  ↓
Consumers (useRequireSession / useAuth / useMe)
```

**PASS** — Tidak ada consumer yang memanggil `apiFetch('/me')` secara independen.

### 3.2 GET /me uniqueness

| Caller | File | Fetch /me? | Through AuthProvider? | Status |
|---|---|---:|---:|---|
| AuthProvider effect | `packages/auth/src/auth-provider.tsx` | YES | N/A (orchestrator) | **PASS** |
| management layout | `apps/portal/src/app/management/layout.tsx` | NO | YES | **PASS** |
| client layout | `apps/portal/src/app/client/layout.tsx` | NO | YES | **PASS** |
| management home | `apps/portal/src/app/management/page.tsx` | NO | YES | **PASS** |
| email pages (×3) | `email-page-client`, `[id]/page`, `compose-page-client` | NO | YES | **PASS** |
| tech-pwa home | `apps/tech-pwa/src/app/page.tsx` | NO | YES | **PASS** |
| sign-in page | `apps/portal/src/app/sign-in/page.tsx` | NO | N/A (uses `useSession` only) | **PASS** |
| Backend test | `apps/api/src/modules/me/me.controller.test.ts` | YES (API) | N/A | **PASS** (server) |

Repository-wide search `apiFetch.*'/me'`: **hanya** `auth-provider.tsx`.

---

## 4. AuthProvider Effect / Race Condition Audit

Protection mechanism: **`cancelled` boolean** on effect cleanup (L67–102). Tidak ada AbortController atau session-user-id guard on response.

| Case | Expected | Actual | Status |
|---|---|---|---|
| 1. pending → session → GET /me | Fetch once when session ready | Effect waits `isPending`, then fetches | **PASS** |
| 2. Strict Mode mount/unmount/mount | No stale write; possible 2 fetches dev | Cleanup sets `cancelled=true`; dev may double-fetch | **PASS** (dev-only extra fetch) |
| 3. null → session | Fetch new | Effect re-runs | **PASS** |
| 4. User A logout → User B login | State = B only | Session change → cleanup cancels A → fetch B | **PASS** |
| 5. /me in flight → session invalid | Ignore stale | Cleanup `cancelled=true` | **PASS** |
| 6. 401 | Redirect + clear state | Clears user/membership/capabilities; `onNeedsSignIn()` | **PASS** |
| 7. 403 ACCOUNT_PENDING | `status=pending` | Sets `bootstrapStatus('pending')`, clears me fields | **PASS** |
| 8. other 403 | `status=forbidden` | Sets `bootstrapStatus('forbidden')` | **PASS** |
| Stale A after B | Must not apply A | Cancelled flag prevents write | **PASS** |

**Additional finding (P1):** `onNeedsSignIn` ada di dependency array effect (L103). `PortalAuthProvider` recreate callback setiap `pathname` berubah → **GET /me refetch on client-side navigation** meskipun session unchanged. Bukan data corruption, tapi unnecessary network churn.

**NEEDS VERIFICATION:** Apakah Better Auth `session` object identity stabil across renders — jika tidak, bisa trigger refetch tambahan.

---

## 5. Auth State Boundary

Expected vs actual in `AuthContextValue`:

| Field | Expected | Stored | Writer | Status |
|---|---|---|---|---|
| `bootstrapStatus` | Auth | YES | AuthProvider only | **PASS** |
| `user` | Auth | YES | AuthProvider only | **PASS** |
| `membership` | Authz | YES | AuthProvider only | **PASS** |
| `capabilities` | Authz | YES | AuthProvider only | **PASS** |
| `me` (computed) | Derived | YES (memo) | AuthProvider | **PASS** (denormalized view, single writer) |
| Session cookie / tokens | Do not store | NO in Context | Better Auth internal | **PASS** |
| Better Auth `useSession` | External | Parallel read in provider only | Better Auth | **PASS** (orchestrated, not duplicated in consumers) |
| FCM token | FCM local | localStorage via `messaging.ts` | FCM module | **PASS** |
| localStorage auth | None | None for auth user | — | **PASS** |
| Page-level duplicate Me state | None | None found | — | **PASS** |

**No multiple source of truth** untuk staff auth di portal/tech-pwa.

---

## 6. Authz Forensic Findings

### Capability consumers (actual)

| Surface | Mechanism | Status |
|---|---|---|
| Header shortcuts | `me.capabilities.leadRead/chatRead/emailRead` | **PASS** |
| Dashboard shortcuts | same | **PASS** |
| Email module (×3) | `emailRead/Send/Delete/Manage` gates | **PASS** |
| Sidebar nav | Server `/menu/nav` (not capabilities) | **PASS** |
| User admin detail | `GET /users/:id` + `role === 'SUPERADMIN'` for UI | **PASS** (page-local server state) |

### Hooks adoption

| Hook | Used in codebase | Status |
|---|---|---|
| `useRequireSession` | 6 portal + 1 tech-pwa | **PASS** |
| `useAuth` | FCM (portal + tech-pwa) | **PASS** |
| `useAuthz` | **0 consumers** | **P2** (exported but unused) |
| `useMe` | **0 consumers** | **P2** (duplicate of useRequireSession) |

### Role checks

- Frontend: `users/[id]/page.tsx` — `role === 'SUPERADMIN'` for admin UI only
- No client `permissions.includes(...)` — **PASS**
- All capability gates use server-computed booleans — **PASS**

---

## 7. Zustand vs React Context Assessment

### Near-term complexity trajectory

System akan berkembang ke: lebih banyak cross-app consumers (portal, tech-pwa, apps baru), lebih banyak derived selectors authz, invalidation setelah permission/membership change, kemungkinan active-company switch (NEEDS VERIFICATION).

### Questions A–G

| Question | Assessment |
|---|---|
| A. Context sehat saat selectors bertambah? | **Partial** — semua hooks baca full context; tidak ada split context / memo selectors |
| B. Consumer re-render masalah? | **Low risk now** (~10 consumers); **medium risk** saat tree besar + frequent bootstrap updates |
| C. Selective subscription diperlukan? | **Belum wajib**; akan diperlukan jika auth-adjacent state (notifications prefs, active org) masuk global store |
| D. Provider value semakin besar? | **Possible** — saat ini kecil (7 fields + derived) |
| E. State transitions semakin complex? | **Yes** — permission refresh, membership change, multi-app sync akan menambah transition logic |
| F. Cross-app shared state lebih besar? | **Yes** — `packages/auth` sudah shared; pattern akan replicate |
| G. Migrate Zustand now vs later? | **Later still cheap** (~1–2 hari); store surface masih minimal |

### Cost comparison

| Dimension | React Context (now) | Zustand (now) | Context → Zustand later |
|---|---|---|---|
| Implementation cost | **Done** | ~1–2 days rewrite | ~1–2 days + consumer churn |
| Migration cost later | Baseline | N/A | Moderate (hooks API bisa dipertahankan) |
| Selector ergonomics | Weak | Strong | — |
| Cross-app sharing | Works via package | Works via package | Same |
| Testing | Needs RTL tests either way | Slightly easier unit test store | — |
| Performance now | Adequate | Adequate | — |
| Near-term roadmap fit | **Adequate short-term** | **Better medium-term** | Acceptable |

### Explicit recommendation

```text
KEEP CONTEXT TEMPORARILY
```

**Bukan** karena "lebih sederhana", melainkan karena:

1. Implementasi Context **sudah technically correct** dan memecahkan masalah utama (duplicate `/me`)
2. Consumer count masih rendah; re-render risk belum material
3. Migration ke Zustand sekarang **materially cheaper** (~1–2 hari) tapi **tidak blocking** — hooks public API (`useAuth`, `useAuthz`) bisa dipertahankan sebagai facade over store
4. **Trigger migrasi Zustand:** selective subscriptions needed, >3 slices global client state, atau auth transition logic >1 effect file

**Tidak rekomendasikan MIGRATE TO ZUSTAND NOW** sebagai P0/P1 — unless team prioritizes selector/test ergonomics before next major feature.

---

## 8. TanStack Query Assessment

### Actual adoption

| Domain | Pattern | Status |
|---|---|---|
| Nav | `useQuery(['nav', application])` | **PASS** |
| Emails | `use-emails-query.ts` | Established |
| Leads/contact | `use-contact-messages-query.ts` | Established |
| **GET /me bootstrap** | **useState + useEffect in Context** | **Inconsistent** |
| Unread counts | Module pub/sub + fetch | Intentional (non-Query) |

### Foundation verdict

```text
EXPAND — partially established, not yet unified for auth bootstrap
```

TanStack Query **sudah** established di portal. Overhead rendah. **`/me` seharusnya eventually `useQuery(['me'], { enabled: !!session })`** dengan:

- dedup + staleTime
- `invalidateQueries(['me'])` on membership/permission change
- `invalidateQueries(['nav'])` on permission change

Saat ini **nav stale after permission save** — tidak ada `invalidateQueries(['nav'])` di [`permission-management/page.tsx`](../../../../apps/portal/src/app/management/permission-management/page.tsx) atau mutations permission API.

---

## 9. FCM Lifecycle Findings

```text
AuthProvider → useAuth() → user.id → usePushNotifications → syncPushTokenIfNeeded
```

| Check | Status |
|---|---|
| FCM tidak menulis auth state | **PASS** |
| Logout revokes token | [`sign-out-button.tsx`](../../../../apps/portal/src/components/sign-out-button.tsx) → `revokeRegisteredPushToken()` → `signOut()` | **PASS** |
| User switch re-register | [`flow.ts`](../../../../apps/portal/src/lib/fcm/flow.ts) L26–27: `lastRegisteredUserId !== currentUserId` → re-register | **PASS** |
| `shouldSkipBackendRegistration` tested | [`flow.test.ts`](../../../../apps/portal/src/lib/fcm/flow.test.ts) | **PASS** |
| AuthProvider ↔ FCM integration tested | No | **NEEDS TEST** |

**User A → logout → User B:** FCM clears local state on revoke; B obtains new token. **PASS** (by design + flow tests).

---

## 10. Navigation / Server State Findings

| Check | Result |
|---|---|
| `queryKey = ['nav', application]` | **PASS** |
| `enabled = ready` (bootstrap ready) | **PASS** — layouts pass `status === 'ready'` |
| Duplicate `useState(nav)` | **None** — old pattern removed | **PASS** |
| Permission change → nav refresh | **Missing invalidation** | **P1 FOLLOW-UP** |
| Capabilities change → `/me` refresh | **Missing invalidation** | **P1 FOLLOW-UP** |

Nav dapat stale hingga staleTime (15s) atau full remount — **UX issue, bukan security issue**.

---

## 11. Provider / Package Boundary Findings

### Portal

```text
QueryClientProvider → PortalAuthProvider (AuthProvider) → children
```

**PASS** — satu AuthProvider di root [`layout.tsx`](../../../../apps/portal/src/app/layout.tsx) via [`providers.tsx`](../../../../apps/portal/src/app/providers.tsx).

### Tech PWA

```text
Providers (AuthProvider) → children
```

**PASS** — tidak ada QueryClient (nav tidak dipakai).

### Package boundaries

| Check | Status |
|---|---|
| `@medcal/auth/client` browser-safe | **PASS** — server auth di `@medcal/auth` root |
| Circular import | **PASS** — `auth-client.ts` split |
| `"use client"` on provider | **PASS** |
| SSR hydration auth | Client-only bootstrap (by design) | **PASS** (documented) |

---

## 12. Backward Compatibility

| Hook | Semantics today | Misleading? |
|---|---|---|
| `useRequireSession()` | Read context only; **no fetch** | **YES — name legacy** |
| `useMe()` | Same as useRequireSession | Less misleading but unused |
| `useAuth()` / `useAuthz()` | Clear slices | **PASS** |

Comment di `useRequireSession` (L155–157) sudah clarifies "does not fetch". **P2:** consider alias `useSessionContext()` long-term.

---

## 13. Type Consistency

```text
packages/auth/src/me-types.ts
      ↓
@medcal/auth/client re-exports
      ↓
portal + tech-pwa imports
```

| Check | Status |
|---|---|
| Duplicate local `Me` interface | **None** in main repo | **PASS** |
| `MembershipRole` from `@medcal/shared` | **PASS** |

---

## 14. Test & Build Evidence

### Executed (2026-08-23)

```bash
pnpm --filter @medcal/auth typecheck     # PASS
pnpm --filter @medcal/portal typecheck   # PASS
pnpm --filter @medcal/tech-pwa typecheck # PASS
pnpm --filter @medcal/portal test        # 14 tests PASS (proxy + FCM flow only)
pnpm --filter @medcal/tech-pwa test      # N/A — no test script
pnpm build                               # NOT RUN
```

### Coverage gaps — **NEEDS TEST**

| Area | Tests exist? |
|---|---|
| AuthProvider lifecycle | **NO** |
| Session transitions (401/403/pending) | **NO** (API: `me.controller.test.ts` only) |
| Context consumers | **NO** |
| Duplicate mount / Strict Mode | **NO** |
| Nav React Query enabled/disabled | **NO** |
| Permission → nav invalidation | **NO** |
| FCM + auth integration | **NO** (flow helpers only) |

**Typecheck ≠ behavioral safety** — marked explicitly.

---

## 15. Backend Security Boundary

**PASS** — Frontend capabilities hanya UX gate. API mutations tetap via `CompanyRoleGuard` + `@RequirePermission`.

Verified pattern unchanged:

```text
Frontend capability check → UX hide/disable
API call → CompanyRoleGuard → hasPermission() → Allow/Deny
```

No tokens in client global state. **PASS**.

---

## 16. P0 Findings

**Count: 0**

Tidak ditemukan: security boundary breach, stale user cross-login corruption, duplicate authoritative `/me` fetch, broken auth redirect loop.

---

## 17. P1 Findings

**Count: 4**

1. **`onNeedsSignIn` in effect deps** → refetch `/me` on pathname change ([`providers.tsx`](../../../../apps/portal/src/app/providers.tsx) L16–20 + [`auth-provider.tsx`](../../../../packages/auth/src/auth-provider.tsx) L103)
2. **No nav invalidation** after permission/membership mutation — stale sidebar up to 15s+
3. **No AuthProvider tests** — behavioral guarantees unverified
4. **`/me` not on TanStack Query** while nav/email/leads are — inconsistent server-state foundation; blocks clean invalidation strategy

---

## 18. P2 Findings

**Count: 5**

1. `useAuthz()` / `useMe()` exported but unused
2. `useRequireSession` naming misleading for new developers
3. Strict Mode dev double-fetch `/me`
4. `sidebar.tsx` changed outside auth scope (undocumented)
5. Consolidate `SignOutButton` portal/tech-pwa (mentioned in audit, not done)

---

## 19. Final Architecture Recommendation

### Recommended near-term architecture

```text
GLOBAL CLIENT STATE (keep Context for now, plan Zustand facade)
├── bootstrapStatus
├── user
├── membership
└── capabilities

SERVER STATE (expand TanStack Query)
├── GET /me          ← migrate here + invalidate on authz change
├── GET /menu/nav    ← add invalidateQueries on permission save
├── emails, leads, users detail
└── permission catalog

FCM (local module)
├── token, permission, registration status
└── reads user.id from useAuth()

SECURITY (unchanged)
└── CompanyRoleGuard + hasPermission on API
```

### Priority fixes before next major feature

1. Stabilize AuthProvider effect deps (`onNeedsSignIn` ref pattern or remove from deps)
2. Add `invalidateQueries(['nav'])` (+ future `['me']`) on permission/membership mutations
3. Add AuthProvider unit/integration tests
4. Consider `useQuery(['me'])` for unified server-state ownership

---

## 20. Final Summary Block

```text
FINAL VERDICT:
PASS WITH P1 FIXES

P0:
0

P1:
4

P2:
5

ZUSTAND DECISION:
KEEP CONTEXT TEMPORARILY
(re-evaluate when selective subscriptions or multi-slice global state needed)

TANSTACK QUERY DECISION:
EXPAND
(/me bootstrap + nav/capability invalidation)

SAFE TO PROCEED TO NEXT PHASE:
YES
(with P1 fixes scheduled before major RBAC/notification features)
```
