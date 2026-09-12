# Migration Window Decision — React Context vs Zustand

**Tanggal:** 2026-08-23  
**Mode:** Decision / audit only — tidak ada perubahan kode  
**Source of truth:** Repository code aktual  
**Tujuan:** Menentukan **kapan** migration window Global Auth/Authz paling murah dan aman

**Referensi:** [Consumer Footprint Audit](./Consumer%20Footprint%20Audit%20—%20Global%20Auth%20&%20Authz%20State.md) · [Forensic Verification Report](./Forensic%20Verification%20Report%20—%20Global%20Auth%20&%20Authz%20Implementation.md) · [Implementation Report](./Implementation%20Report%20—%20Global%20Auth%20&%20Authz%20State.md)

---

## 1. Executive Decision

**Primary recommendation:**

```text
KEEP CONTEXT UNTIL OBJECTIVE TRIGGER
```

**Recommended work NOW (bukan Zustand):**

```text
EXPAND TanStack Query untuk GET /me + promote useAuthz() sebelum planned domains
```

**Migration window untuk Zustand:** **DEFER** — bukan karena Context “cukup”, melainkan karena **biaya migrasi Zustand NOW vs LATER hampir sama** jika hook API dipertahankan, sementara **manfaat terbesar saat ini datang dari Query + boundary Auth/Authz API**, bukan dari library swap.

---

## 2. Verified Current Baseline

**Re-verified against repository (2026-08-23):** **MATCH** dengan Consumer Footprint Audit — tidak ada perubahan sejak audit footprint.

| Metrik | Verified |
|---|---:|
| Direct Auth consumers | **9** |
| Indirect Auth consumers | **3** |
| Total Auth consumers (unique components) | **10** |
| Direct Authz consumers | **7** |
| Indirect Authz consumers | **3** |
| Total Authz consumers | **9** |
| Unique runtime consumer components | **12** |
| Unique consumer files | **9** |
| Current domains with consumption | **5** |
| High-leverage consumers | **6** |
| Management routes amplified by layout | **~20** |
| `useAuthz()` consumers | **0** |
| `useMe()` consumers | **0** |
| `useRequireSession()` consumers | **7** |
| Auth integration tests | **0** |

**Authz consumption pattern (verified):** 6 dari 7 direct Authz consumers memakai `useRequireSession()` → `me.capabilities`, bukan `useAuthz()`.

**Implementation unchanged:** `packages/auth/src/auth-provider.tsx` — React Context + `useEffect` → `apiFetch('/me')`.

---

## 3. Current Migration Surface (Context → Zustand NOW)

| Area | Files | Consumers affected | Complexity | Risk |
|---|---:|---:|---|---|
| **Provider / store** | 3–4 (`auth-provider.tsx`, new store, `client.ts`, `package.json`) | 0 external | MEDIUM | MEDIUM |
| **Hooks (facade)** | 1 (`auth-provider.tsx` or `auth-store.ts`) | 0 if API identical | LOW | LOW |
| **Portal providers** | 1 (`providers.tsx`) | 0 | LOW | LOW |
| **Tech PWA providers** | 1 (`providers.tsx`) | 0 | LOW | LOW |
| **Direct consumers** | **0** *(if hooks unchanged)* | 9 subscribers | LOW | LOW |
| **Indirect consumers** | 0 | 3 | NONE | NONE |
| **FCM** | 0 *(uses `useAuth()`)* | 2 | LOW | LOW |
| **Types** | 1 (`me-types.ts` — unchanged) | 0 | LOW | LOW |
| **Tests** | 0 existing + **add new** | — | MEDIUM | MEDIUM |
| **Total touch (internal)** | **~5–6 files** | **9 verification points** | **MEDIUM** | **MEDIUM** |

**Key insight:** Jika `useAuth`, `useAuthz`, `useMe`, `useRequireSession` tetap sebagai public API, **zero consumer file edits** — migrasi terisolasi di `@medcal/auth`.

**Estimated effort (NOW):** **MEDIUM** — ~1–1.5 engineer-days termasuk store tests + regression 9 verification points + forensic re-run.

---

## 4. Future Consumer Forecast

**Planned domains** (product roadmap — **PLANNED, NOT YET IMPLEMENTED**):

1. Send quotation  
2. Process PO  
3. Receipt & calibration result  
4. Create/post invoice  
5. Create/post credit note  
6. Create/post payment  
7. Reporting  
8. CashBank  
9. Certification progress  
10. Certificate issuance  

**Pattern basis:** modul Email existing — page-level `useRequireSession()` + `me.capabilities.*` gates + layout protection + server nav.

| Planned domain | Auth consumer? | Authz consumer? | Shared component | Query handles data? | Increases Context subscribers? |
|---|---|---|---|---|---|
| Quotation | YES | YES | Layout/header reuse | YES (lists/detail) | +1–2 page hooks |
| PO | YES | YES | Same | YES | +1–2 |
| Receipt/calibration | YES | YES | Same + tech-pwa likely | YES | +2–3 |
| Invoice | YES | YES | Same | YES | +2–3 |
| Credit note | YES | YES | Same | YES | +1–2 |
| Payment | YES | YES | Same | YES | +1–2 |
| Reporting | YES | YES | Same | YES | +1–2 |
| CashBank | YES | YES | Same | YES | +1–2 |
| Certification progress | YES | YES | tech-pwa emphasis | YES | +2–3 |
| Certificate | YES | YES | Same | YES | +1–2 |

**FORECAST (analytical estimate, not implemented):**

| Metric | After 3 planned domains | After 10 planned domains |
|---|---:|---:|
| Additional direct hook consumers | +6–9 | +15–25 |
| Additional consumer files | +6–9 | +15–20 |
| Additional capabilities in `/me` | +6–12 | +20–40 |
| Shared high-leverage (layout/header) | unchanged | unchanged |
| Context provider complexity | LOW→MEDIUM | MEDIUM→HIGH |

---

## 5. Scenario A — Migrate to Zustand NOW

| Dimension | Value |
|---|---|
| Consumer count | 9 direct / 12 components |
| Files to change (internal) | ~5–6 |
| Consumer files to change | **0** (facade) |
| Provider changes | Replace Context with store + bootstrap component |
| Hook changes | Internal implementation only |
| Test impact | Add store tests; 0 existing auth tests to fix |
| Risk | MEDIUM |
| **Estimated effort** | **MEDIUM** (~1–1.5 days) |

**Benefit NOW:** selective subscription ready; `useAuthz()` can be promoted before domains copy `useRequireSession` pattern.

**Cost NOW:** new dependency; team learns Zustand; must coordinate with Query `/me` decision to avoid duplicate cache.

---

## 6. Scenario B — Migrate After 3 Planned Domains

**Assume first 3:** Quotation, PO, Invoice (representative operational/finance pattern).

| Dimension | FORECAST |
|---|---|
| Additional consumers | +6–9 direct |
| Additional files | +6–9 |
| Consumer files to change on Zustand migration | **0** (if facade) |
| Verification points | 9 → **15–18** |
| Entrenched `useRequireSession` + capabilities pattern | **+3 modules** |
| **Estimated effort** | **MEDIUM–HIGH** (~1.5–2.5 days) |

**Delta vs NOW:** +0.5–1 day regression; harder to promote `useAuthz()` if 3 modules already copy Email pattern.

---

## 7. Scenario C — Migrate After 10 Planned Domains

| Dimension | FORECAST |
|---|---|
| Additional consumers | +15–25 direct |
| Additional files | +15–20 |
| Verification points | 9 → **24–34** |
| `useRequireSession` pattern copies | **~10 modules** |
| Risk of multiple Context providers | MEDIUM–HIGH |
| **Estimated effort** | **HIGH** (~2–4 days) |

**Delta vs NOW:** +1–2.5 days; significant pattern ossification; possible need to refactor page-level hooks during migration.

---

## 8. Migration Cost Matrix

| Scenario | Consumers | Files (internal) | Provider | Hooks | Tests | Risk | Effort |
|---|---:|---:|---|---|---|---|---|
| **Migrate NOW** | 9 | ~5–6 | Replace Context | Facade | Add new | MEDIUM | **MEDIUM** |
| **After 3 domains** | ~15–18 | ~5–6 | Same | Facade | Add + more regression | MEDIUM–HIGH | **MEDIUM–HIGH** |
| **After 10 domains** | ~24–34 | ~5–6 + possible consumer refactors | Same or split | Facade + churn | Extensive | HIGH | **HIGH** |

**Conclusion:** Internal Zustand migration cost **flat** (~5–6 files). **Total cost rises** via regression surface and **pattern ossification**, not via provider rewrite difficulty.

---

## 9. Cost of Keeping Context

| Factor | Current | Near-term (3 domains) | After 10 domains |
|---|---|---|---|
| Provider complexity | LOW (163 LOC) | LOW–MEDIUM | MEDIUM–HIGH |
| Context value dimensions | 7 fields | +derived capability selectors | Many capabilities |
| Re-render fan-out | 9 direct subscribers | ~15–18 | ~24–34 |
| Selective subscription | **None** | **Pain likely** | **HIGH pain** |
| Multiple Contexts risk | LOW | MEDIUM | MEDIUM–HIGH |
| API churn (`useRequireSession` copies) | 7 | ~10–13 | ~17–27 |
| Prop drilling elimination | **Partial** (header chain depth 2) | Same unless refactored | Worse if not |
| Cross-app sharing | Works via package | Works | Works |
| Testing | Provider wrapper needed | More integration tests | More |

**Cost of NOT migrating (qualitative):** **MEDIUM** rising to **HIGH** — primarily from **Authz selector proliferation** and **full-context re-render**, not from Context being broken today.

---

## 10. Cost of Migrating to Zustand NOW

**Minimal target architecture (conceptual):**

```text
Better Auth (session cookie)
        ↓
TanStack Query ['me']  ← authoritative server cache
        ↓
Zustand (client coordination ONLY)
  ├── bootstrapStatus (derived from session + query state)
  └── actions: syncFromMeQuery, resetOnLogout
        ↓
Selectors (public hooks unchanged)
  ├── useAuth()      → bootstrapStatus, user from query
  ├── useAuthz()    → membership, capabilities from query
  ├── useMe()       → combined
  └── useRequireSession() → legacy alias
        ↓
Consumers (unchanged files)
```

**Ownership (avoid duplicate cache):**

| Data | Owner |
|---|---|
| Raw `/me` response | **TanStack Query** |
| `user`, `membership`, `capabilities` | **Query cache** (read via selectors) |
| `bootstrapStatus` | **Zustand** or derived from Query+session |
| FCM token/status | **FCM module** (unchanged) |
| Nav | **TanStack Query** (unchanged) |

**Migration cost NOW:** MEDIUM — but **should bundle with Query `/me`**, not Zustand alone.

---

## 11. TanStack Query Boundary

**Forensic finding (verified):** `/me` masih `useEffect` di Context; nav/email/leads sudah Query.

**Recommendation independent of Zustand:**

| Layer | Owns |
|---|---|
| Better Auth | Session lifecycle, cookie |
| TanStack Query | `/me`, `/menu/nav`, domain API cache, invalidation |
| Context **or** Zustand | Bootstrap coordination, derived client flags |
| Backend | Authorization enforcement |

**Do NOT:** duplicate `/me` in Query + Zustand as two authoritative caches.

**Priority:** **EXPAND Query for `/me` NOW** — higher ROI than Context→Zustand swap alone.

---

## 12. Authz Growth Analysis

**Current immaturity signal:**

```text
useAuthz() consumers: 0
useRequireSession() → me.capabilities: 6 modules
```

**This IS a migration-window signal** — but for **API boundary** (`useAuthz` promotion), not necessarily for **Zustand**.

| Approach | Cost NOW | Cost after 10 domains |
|---|---|---|
| Promote `useAuthz()` on **existing Context** | LOW | HIGH (refactor ~10 modules) |
| Promote `useAuthz()` on **new Zustand store** | MEDIUM | MEDIUM (same hooks) |
| Keep `useRequireSession` pattern | ZERO | **Pattern debt HIGH** |

**Evidence:** Establishing clean Auth/Authz selector boundary **NOW** (before planned domains) is materially cheaper than after 10 domains — **regardless of Context vs Zustand**.

Zustand adds value when **selective subscription** matters; with 9 subscribers today, that value is **LIKELY SOON**, not **CURRENTLY MATERIAL**.

---

## 13. Performance / Subscription Analysis

| Metric | Current | After 3 domains | After 10 domains |
|---|---|---|---|
| Direct context subscribers | 9 | ~15–18 | ~24–34 |
| Indirect via props | 3 | 3 | 3 |
| High-leverage (layout/header) | 6 | 6 | 6 |
| Update fan-out on auth change | up to 9 | up to ~18 | up to ~34 |

| Impact | Classification |
|---|---|
| **Current** | **LOW** — infrequent auth updates, 9 subscribers |
| **Near-term (3 domains)** | **MEDIUM** |
| **After 10 domains** | **MEDIUM–HIGH** |

Zustand selective subscription benefit: **LIKELY SOON**, not proven problem today.

---

## 14. Risk Matrix

| Risk | Keep Context | Migrate Zustand NOW |
|---|---|---|
| Provider complexity growth | MEDIUM | LOW |
| Pattern ossification (`useRequireSession`) | **HIGH** | MEDIUM (if useAuthz promoted) |
| Re-render fan-out | MEDIUM (future) | LOW |
| Migration bugs | NONE now | MEDIUM |
| Duplicate server state | MEDIUM (Query gap) | MEDIUM (if Query not bundled) |
| Dependency overhead | LOW | LOW |
| Testing gap | **HIGH** (no auth tests) | MEDIUM |
| Developer learning | LOW | LOW–MEDIUM |

---

## 15. Migration Window Decision

| Window | Verdict |
|---|---|
| **NOW (Zustand only)** | **Not cheapest alone** — internal cost flat vs later; main win is pattern + selectors |
| **NOW (Query `/me` + useAuthz promotion)** | **Cheapest foundation work** — fixes real P1 debt |
| **After 3 domains** | Zustand migration still feasible; **+0.5–1 day** regression; pattern harder |
| **After 10 domains** | **Most expensive** — HIGH effort + pattern refactor |

**Cheapest safe window for Zustand specifically:** **NOW or at first objective trigger** — economically similar if facade preserved; **defer acceptable** if Query + useAuthz done first.

**Cheapest safe window for foundation work:** **NOW** — TanStack Query `/me` + invalidate nav/capabilities.

---

## 16. Final Recommendation

```text
KEEP CONTEXT UNTIL OBJECTIVE TRIGGER
```

**Execute NOW (not Zustand):**

1. Move `GET /me` to TanStack Query  
2. Add `invalidateQueries(['me', 'nav'])` on permission/membership mutation  
3. Promote `useAuthz()` in new code; migrate existing 6 capability consumers gradually  
4. Add AuthProvider integration tests  

### Objective Zustand migration triggers (codebase-specific)

Migrate to Zustand when **any one** occurs:

1. **Direct context subscribers ≥ 18** (2× current verified 9)  
2. **`useRequireSession` page-level copies ≥ 12** (Email pattern ossification)  
3. **Second global Context provider** proposed for auth-adjacent state (e.g. `AuthzProvider`)  
4. **`auth-provider.tsx` > 200 LOC** or second async orchestration concern added  
5. **Measurable auth-related re-render** > 16ms on header/layout critical path  
6. **Third staff app** consumes `@medcal/auth/client`  

**Do NOT use arbitrary “>15 consumers” without context** — threshold **18** = 2× verified baseline with layout amplification considered.

### Why not Zustand NOW?

- Internal migration cost **flat** vs later if hook API stable  
- **9 subscribers** — re-render not material today  
- **Higher ROI** from Query `/me` + useAuthz boundary than library swap  
- Zustand without Query first risks **duplicate `/me` cache**  

### Why not defer forever?

- **useAuthz = 0** + 10 planned domains = pattern ossification risk is **real**  
- Trigger **18 subscribers** likely hit after **~3–4 planned domains** if Email pattern copied  

---

## 17. If Zustand: Migration Blueprint (do not implement yet)

1. **Define store boundary** — coordination only; Query owns `/me`  
2. **Add `zustand` to `packages/auth`**  
3. **Create `auth-store.ts`** — bootstrapStatus, actions  
4. **Create `useMeQuery` hook** in portal or shared — Query `['me']`  
5. **Replace AuthProvider internals** — bootstrap component syncs Query → store  
6. **Keep hook exports** — `useAuth`, `useAuthz`, `useMe`, `useRequireSession`  
7. **Verify 9 consumer files** — no edits expected  
8. **FCM** — unchanged (`useAuth`)  
9. **Remove AuthContext**  
10. **Add store unit tests + integration tests**  
11. **Forensic re-audit**  

| Step | Files | Risk | Rollback |
|---|---|---|---|
| 1–3 | `packages/auth/*` | MEDIUM | Revert package |
| 4 | `packages/auth` or portal hook | LOW | Keep Context fetch |
| 5–9 | `auth-provider.tsx` | MEDIUM | Git revert single PR |
| 10 | new test files | LOW | — |

**Remain OUTSIDE Zustand:** FCM token, nav Query cache, permission catalog, user admin detail, unread counts, domain business data.

---

## 18. Rollback Strategy

```text
Single PR: packages/auth only (+ optional providers)
        ↓
Verification fails
        ↓
Revert PR — consumer files untouched (facade preserved)
        ↓
Context restored; apps/portal + tech-pwa unchanged
```

Stable API boundary (`@medcal/auth/client` hooks) is **rollback enabler**.

---

## 19. Verification Criteria

Before any Zustand migration considered complete:

- [ ] 9 consumer verification points PASS  
- [ ] 0 duplicate `GET /me` fetch  
- [ ] Query owns `/me`; Zustand does not duplicate authoritative cache  
- [ ] FCM still uses `useAuth()` only  
- [ ] Auth integration tests PASS  
- [ ] typecheck auth + portal + tech-pwa PASS  
- [ ] Forensic re-audit PASS  

---

```text
GLOBAL AUTH/AUTHZ — MIGRATION WINDOW DECISION
==============================================

Current verified footprint:
Auth direct: 9
Authz direct: 7
Unique runtime consumers: 12
High-leverage consumers: 6

FORECAST:
Additional consumers: +15–25 (after 10 planned domains)
Planned domains: 10

Recommended migration window:
OBJECTIVE TRIGGER (for Zustand)
NOW (for TanStack Query /me + useAuthz promotion)

Decision:
KEEP CONTEXT UNTIL OBJECTIVE TRIGGER

Confidence:
MEDIUM

Primary reason:
Zustand internal migration cost is flat NOW vs later if hook API is preserved;
the cheapest foundation work NOW is TanStack Query for /me and promoting useAuthz()
before planned domains ossify the useRequireSession+me.capabilities pattern.
Zustand defer until subscriber count doubles (~18) or Authz API boundary work
needs selective subscription at scale.

TanStack Query:
EXPAND

P0:
0

P1:
4

P2:
5

Code changes made:
NONE

Safe to proceed:
YES
(with Query/useAuthz foundation before major planned domains)
```
