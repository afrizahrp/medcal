# Decision Report — React Context vs Zustand (Global Auth & Authz)

**Tanggal:** 2026-08-23  
**Mode:** Decision / audit only — tidak ada perubahan kode  
**Source of truth:** Repository code aktual  

**Referensi:** [Audit Report](./Audit%20Report%20—%20Global%20Auth%20&%20Authz%20State.md) · [Implementation Report](./Implementation%20Report%20—%20Global%20Auth%20&%20Authz%20State.md) · [Forensic Verification Report](./Forensic%20Verification%20Report%20—%20Global%20Auth%20&%20Authz%20Implementation.md) · [Consumer Footprint Audit](./Consumer%20Footprint%20Audit%20—%20Global%20Auth%20&%20Authz%20State.md) · [Migration Window Decision](./Migration%20Window%20Decision%20—%20React%20Context%20vs%20Zustand.md)

---

## 1. Executive Decision

```text
KEEP REACT CONTEXT (with explicit migration triggers)
```

**Prioritas foundation NOW (lebih urgent dari Zustand):**

```text
EXPAND TanStack Query untuk GET /me + invalidation nav/capabilities
```

Bukan karena Context “lebih sederhana”, melainkan karena **total lifecycle cost** terendah saat ini: Context sudah benar secara teknis, migrasi Zustand internal hampir sama biayanya NOW vs nanti jika hook API dipertahankan, dan **debt nyata** ada di server-state pattern (`/me` di `useEffect`) bukan di subscription library.

---

## 2. Actual Current Architecture

```text
Better Auth (session cookie, internal store)
        ↓
AuthProvider (packages/auth/src/auth-provider.tsx)
  ├── useSession()
  ├── useEffect → apiFetch('/me')     ← satu orchestration point
  └── AuthContext
        ├── bootstrapStatus, user, membership, capabilities, me (derived)
        ├── isAuthenticated, isAuthLoading (derived)
        ↓
Public hooks: useAuth | useAuthz | useMe | useRequireSession
        ↓
Portal: QueryClientProvider → AuthProvider → consumers
Tech PWA: AuthProvider → consumers
```

**State ownership:**

| Property | Owner | Writer |
|---|---|---|
| Session cookie | Better Auth | signIn/signOut |
| `bootstrapStatus`, user, membership, capabilities | AuthProvider `useState` | `/me` effect |
| Nav | TanStack Query `['nav', app]` | `use-nav.ts` |
| FCM token/status | FCM module + localStorage | bukan auth store |

---

## 3. Actual Consumer Inventory (verified)

| Metrik | Jumlah |
|---|---:|
| Direct Auth consumers | 9 |
| Indirect Auth consumers | 3 |
| Direct Authz consumers | 7 |
| Indirect Authz consumers | 3 |
| Unique runtime components | 12 |
| Unique consumer files | 9 |
| `useAuth()` | 2 (FCM) |
| `useAuthz()` | **0** |
| `useMe()` | **0** |
| `useRequireSession()` | 7 |
| High-leverage consumers | 6 |
| Management routes via layout | ~20 |

Detail lengkap: [Consumer Footprint Audit](./Consumer%20Footprint%20Audit%20—%20Global%20Auth%20&%20Authz%20State.md)

---

## 4. Near-Term State Growth

| Kategori | Masuk global client store? | Owner yang direkomendasikan |
|---|---|---|
| `bootstrapStatus` | Ya (tipis) | Context atau derived dari Query+session |
| `user`, `membership`, `capabilities` | **Tidak duplicate** | TanStack Query `['me']` |
| Nav | Tidak | TanStack Query |
| Permission catalog | Tidak | Query / page-local |
| FCM token | Tidak | FCM module |
| Domain data (invoice, PO, dll.) | Tidak | TanStack Query per domain |

**10 planned domains** (quotation → certificate) akan menambah **page-level Authz consumers**, bukan necessarily global store size — pola Email (`useRequireSession` + `capabilities.*`) akan di-copy kecuali `useAuthz()` dipromosikan sekarang.

---

## 5. React Context Scaling Analysis

### Subscription model (verified)

Semua hook → `useAuthContext()` → **full context value**. Tidak ada selective subscription.

| Pertanyaan | Jawaban |
|---|---|
| `useAuth()` subscribe full context? | **Ya** |
| Perubahan `capabilities` rerender FCM (`user.id` only)? | **Ya** |
| Selector `useAuth(s => s.user.id)`? | **Tidak ada** |

### A–G summary

| Aspek | Assessment |
|---|---|
| Provider value growth | Sedang (7 fields); akan bertambah sedikit |
| Re-render fan-out | 9 direct today → **LOW impact** |
| Selector ergonomics | **Weak** |
| Provider complexity risk | **MEDIUM** jika `/me` + redirect + future logic menumpuk |
| Testing | **HIGH gap** — 0 auth integration tests |
| Cross-app (portal + tech-pwa) | **Works** via `@medcal/auth/client` |
| Multiple Contexts risk | **MEDIUM** jika AuthzProvider terpisah diusulkan |

---

## 6. Zustand Architecture Analysis (konseptual)

```text
Better Auth
    ↓
TanStack Query ['me']          ← authoritative server cache
    ↓
Zustand (coordination ONLY)    ← bootstrapStatus, sync actions
    ↓
Public hooks (unchanged API)
    useAuth() / useAuthz() / useRequireSession()
    ↓
Consumers (0 file changes if facade preserved)
```

**Tidak masuk Zustand:** `/me` payload duplicate, nav, FCM, domain data, permission rows.

**Keuntungan Zustand:** selective subscription, unit test tanpa Provider tree, devtools.

**Dependency overhead:** LOW (~3KB, bukan kelas Redis/K8s).

---

## 7. TanStack Query Boundary

| Layer | Owns |
|---|---|
| Better Auth | Session lifecycle |
| TanStack Query | `/me`, nav, domain APIs, invalidation |
| Context **or** Zustand | Bootstrap coordination, derived flags |
| Backend | Security enforcement |
| FCM module | Token, registration status |

**Forensic P1:** `/me` masih `useEffect`; nav/email/leads sudah Query — **inkonsistensi** yang harus diperbaiki **sebelum atau bersamaan** pertimbangan Zustand.

**Jangan:** Query + Zustand both hold authoritative `/me` without clear split.

---

## 8. Migration Cost — NOW vs LATER

| Scenario | Internal files | Consumer file edits | Verification points | Effort |
|---|---:|---:|---:|---|
| Zustand NOW (facade) | ~5–6 | **0** | 9 | **MEDIUM** |
| Zustand after 3 planned domains | ~5–6 | 0–3 refactors | ~15–18 | **MEDIUM–HIGH** |
| Zustand after 10 planned domains | ~5–6 | possible refactors | ~24–34 | **HIGH** |

**Insight:** Biaya rewrite provider **flat**; biaya total naik dari **regression** dan **pattern ossification** (`useRequireSession` copies).

---

## 9. Total Lifecycle Cost Matrix

| Dimension | Context Now | Zustand Now | Context → Zustand Later |
|---|---|---|---|
| Initial implementation | **LOW** (done) | MEDIUM | — |
| Migration cost | — | MEDIUM | MEDIUM–HIGH |
| Consumer churn | LOW | **LOW** (facade) | LOW–MEDIUM |
| Testing cost | **HIGH** (gap) | MEDIUM | MEDIUM–HIGH |
| Re-render risk | LOW now | **LOW** | MEDIUM–HIGH later |
| Selector ergonomics | HIGH debt | **LOW** | MEDIUM debt |
| Near-term roadmap fit | MEDIUM | MEDIUM–HIGH | MEDIUM |
| Query integration ROI | **EXPAND needed** | Same | Same |
| **Total lifecycle cost** | **MEDIUM** | **MEDIUM** | **MEDIUM–HIGH** |

---

## 10. Performance Analysis

| Impact | Classification |
|---|---|
| **Current** (9 subscribers, rare auth updates) | **NOT MATERIAL** |
| **Near-term** (3 planned domains, ~18 subscribers) | **LIKELY SOON → MEDIUM** |
| **After 10 domains** (~34 subscribers) | **MEDIUM–HIGH** |

Zustand benefit **real but not urgent** today.

---

## 11. Risk Analysis

| Risk | Keep Context | Migrate Zustand Now |
|---|---|---|
| Pattern ossification | **HIGH** (useRequireSession copies) | MEDIUM |
| Re-render fan-out | MEDIUM (future) | LOW |
| Duplicate `/me` cache | MEDIUM (no Query) | MEDIUM if Query skipped |
| Migration bugs | None | MEDIUM |
| No auth tests | **HIGH** | MEDIUM after adding tests |

**P0:** 0 · **P1:** 4 · **P2:** 5 (from forensic audit)

---

## 12. Questions A–G (Context vs Zustand)

| Q | Answer |
|---|---|
| A. Context sehat saat selectors bertambah? | **Partial** — full context subscribe |
| B. Re-render masalah? | **Not now**; **likely soon** |
| C. Selective subscription diperlukan? | **Soon**, not now |
| D. Provider value semakin besar? | **Possible** |
| E. State transitions complex? | **Yes** with permission refresh |
| F. Cross-app shared state? | **Already works** via package |
| G. Migrate Zustand now cheaper than later? | **Marginally** (~0.5–1 day); **pattern API cheaper NOW** |

---

## 13. Final Recommendation

### Primary

```text
KEEP REACT CONTEXT
```

### Execute NOW (before planned domains)

1. **`GET /me` → TanStack Query** dengan `enabled: !!session`
2. **`invalidateQueries(['me', 'nav'])`** on permission/membership mutation
3. **Promote `useAuthz()`** — stop copying `useRequireSession` + `me.capabilities` di modul baru
4. **Stabilize `onNeedsSignIn` effect deps** (ref pattern)
5. **Add AuthProvider integration tests**

### Objective Zustand migration triggers

Migrate when **any one**:

| # | Trigger | Rationale |
|---|---|---|
| 1 | Direct context subscribers **≥ 18** | 2× verified baseline (9) |
| 2 | Page-level `useRequireSession` copies **≥ 12** | Email pattern ossification |
| 3 | Second auth-adjacent Context provider proposed | Multi-context complexity |
| 4 | `auth-provider.tsx` **> 200 LOC** | Orchestration sprawl |
| 5 | Auth re-render **> 16ms** on header/layout path | Measured perf debt |
| 6 | **Third staff app** uses `@medcal/auth/client` | Cross-app scale |

### Why not Zustand NOW?

- Internal swap cost **≈ flat** vs deferring
- **9 subscribers** — perf not material
- **Query `/me` + useAuthz** = higher ROI, fixes real P1
- Zustand without Query risks duplicate cache

### Why not defer Zustand forever?

- `useAuthz = 0` + 10 planned domains → **pattern debt** real
- Trigger likely hit after **~3–4 domains** if Email pattern copied

---

## 14. If Zustand Later: Migration Blueprint

1. Add `zustand` to `packages/auth`
2. Query owns `/me`; store owns bootstrap coordination only
3. Replace Context internals; **keep hook exports**
4. Verify 9 consumer files (0 edits expected)
5. Store unit tests + integration tests
6. Forensic re-audit

**Rollback:** revert single PR on `packages/auth`; consumer files untouched.

**Stay OUTSIDE Zustand:** FCM, nav Query, permissions catalog, user admin, unread counts, domain data.

---

## 15. Verification Criteria

- [ ] Single `/me` orchestration (Query)
- [ ] No duplicate authoritative cache
- [ ] 9 consumer points PASS
- [ ] FCM via `useAuth()` only
- [ ] Auth tests PASS
- [ ] typecheck auth + portal + tech-pwa PASS

---

```text
FINAL ARCHITECTURE DECISION
===========================

Decision:
KEEP REACT CONTEXT

Confidence:
MEDIUM

Why:
1. Context implementation technically correct; forensic PASS WITH P1
2. Zustand internal cost flat NOW vs later if hook API preserved
3. Real debt is Query /me + useAuthz boundary, not library choice
4. 9 subscribers — re-render NOT MATERIAL today
5. Planned domains risk pattern ossification — fix API NOW, Zustand at trigger
6. Objective triggers defined (18 subscribers, 12 useRequireSession copies, etc.)

Migration timing:
DEFER Zustand / NOW for TanStack Query + useAuthz promotion

TanStack Query:
EXPAND

P0: 0
P1: 4
P2: 5

Safe to proceed:
YES
```
