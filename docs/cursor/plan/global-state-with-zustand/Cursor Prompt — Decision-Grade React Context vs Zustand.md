# DECISION-GRADE ARCHITECTURE REVIEW
## React Context vs Zustand for Global Auth & Authz

## Objective

Lakukan **decision-grade comparison** antara:

1. React Context yang saat ini sudah diimplementasikan
2. Zustand sebagai global client-state foundation

Gunakan:

- **CODE AKTUAL repository sebagai source of truth**
- Audit Report — Global Auth & Authz State
- Implementation Report — Global Auth & Authz State
- hasil forensic verification terbaru
- architecture dan roadmap aplikasi yang sudah terlihat dari codebase

Tujuan akhirnya adalah menentukan:

> **Apakah kita mempertahankan React Context sebagai fondasi Global Auth/Authz, atau migrasi ke Zustand SEKARANG sebelum jumlah consumer dan complexity bertambah?**

Jika Zustand terbukti lebih murah secara total lifecycle cost sekarang, **rekomendasikan migrasi sekarang dan jelaskan migration plan-nya.**

Jika React Context tetap lebih tepat, buktikan dengan analysis yang sama ketatnya.

---

# IMPORTANT POSITION

Jangan menggunakan reasoning:

> "Context masih cukup untuk sekarang."

Itu tidak cukup untuk decision ini.

Kita tidak sedang mengoptimalkan hanya untuk current complexity.

Kita sedang menentukan **foundation untuk system yang akan berkembang dalam waktu dekat**.

Evaluasi:

```text
Current implementation
        +
Near-term roadmap
        +
Expected state growth
        +
Expected consumer growth
        ↓
Total lifecycle cost
```

---

# Architectural Context

System saat ini sudah memiliki:

- Better Auth
- Global AuthProvider
- Auth state
- Authz state
- UserMembership
- RBAC / role
- capabilities
- menu permission
- server-filtered navigation
- TanStack Query
- FCM
- PWA
- portal
- technician PWA
- notification recipient authorization
- lead-related workflow

Dan roadmap berikutnya diperkirakan akan memperluas:

```text
Current
   ↓
Global Auth/Authz
   ↓
RBAC
   ↓
Menu Permission
   ↓
FCM Recipient Authorization
   ↓
Lead Assignment
   ↓
Notification UX
   ↓
Additional cross-app state
```

**Jangan menganggap seluruh roadmap di atas pasti membutuhkan global state.**

Untuk setiap item, tentukan:

- global client state?
- server state?
- derived state?
- local UI state?
- no state required?

Tetapi gunakan roadmap tersebut untuk menghitung **probable architectural pressure** terhadap global state.

---

# PHASE 1 — Establish Actual Baseline

Audit repository aktual.

Verifikasi:

- `AuthProvider`
- auth context
- `useAuth`
- `useAuthz`
- `useMe`
- `useRequireSession`
- `Me`
- `membership`
- `capabilities`
- current provider tree
- all consumers
- TanStack Query usage
- all existing global contexts
- all FCM consumers
- navigation consumers

Repository-wide search untuk:

```text
useAuth
useAuthz
useMe
useRequireSession
AuthProvider
AuthContext
bootstrapStatus
capabilities
membership
user
```

Buat actual consumer inventory.

---

# PHASE 2 — Current React Context Architecture

Audit implementation aktual.

Jelaskan:

## 2.1 State ownership

Siapa yang memiliki:

```text
bootstrapStatus
user
membership
capabilities
session
```

## 2.2 Update mechanism

Bagaimana state berubah ketika:

```text
login
logout
session expiration
user switching
membership changes
permission changes
```

## 2.3 Subscription model

Apakah setiap consumer:

```text
useAuth()
```

menerima seluruh context value?

Apakah perubahan:

```text
user
```

menyebabkan consumer yang hanya membutuhkan:

```text
capabilities
```

ikut rerender?

Apakah perubahan:

```text
capabilities
```

menyebabkan consumer yang hanya membutuhkan:

```text
user.id
```

ikut rerender?

**Verifikasi dari implementation aktual.**

---

# PHASE 3 — Consumer Growth Analysis

Buat daftar consumer aktual sekarang.

Contoh:

```text
AuthProvider
├── management layout
├── client layout
├── dashboard
├── email
├── header
├── FCM
└── tech-pwa
```

Jangan menggunakan contoh tersebut sebagai asumsi.

Ambil dari code aktual.

Kemudian modelkan kemungkinan consumer dalam 3–6 fase berikutnya:

### Phase A
RBAC

### Phase B
Menu Permission

### Phase C
FCM recipient authorization

### Phase D
Lead assignment

### Phase E
Notification UX

### Phase F
Cross-app / PWA expansion

Untuk setiap phase tentukan:

```text
Feature
↓
State needed
↓
State classification
↓
Expected consumers
↓
Should enter global auth store?
```

---

# PHASE 4 — State Growth Analysis

Jangan menganggap global state akan tetap:

```ts
user
membership
capabilities
bootstrapStatus
```

Analisis kemungkinan growth.

Categorize candidate state:

### Core Auth

```text
bootstrapStatus
user
session-derived status
```

### Authz

```text
membership
capabilities
role-derived selectors
permission-derived UX signals
```

### Notification-related

```text
notification eligibility
notification preferences
notification status
```

### Lead-related

```text
current assignment context
assignment-related authorization
```

### Application context

```text
active company
active application
tenant context
```

Tetapi **jangan otomatis memasukkan semua candidate ke global state**.

Tentukan mana yang benar-benar belong di global store.

---

# PHASE 5 — React Context Scaling Analysis

Audit bagaimana Context akan behave jika consumer dan state bertambah.

Jawab secara konkret:

### A. Provider value growth

Apakah `AuthContext.Provider value` akan menjadi semakin besar?

### B. Re-render fan-out

Jika satu property berubah, berapa consumer yang berpotensi rerender?

### C. Selector ergonomics

Apakah kita bisa melakukan:

```ts
useAuth(state => state.user.id)
```

atau equivalent selective subscription?

Jika tidak, berapa besar impact-nya?

### D. Provider complexity

Apakah AuthProvider akan menjadi:

```text
session orchestration
+
/me fetch
+
authz derivation
+
notification logic
+
other state
```

dalam waktu dekat?

### E. Testing complexity

Bagaimana test complexity berkembang?

### F. Cross-app sharing

Portal dan tech-pwa sudah menggunakan shared auth package.

Apakah Context tetap ergonomis ketika shared state semakin besar?

### G. Multiple contexts

Apakah kita akhirnya akan membuat:

```text
AuthProvider
AuthzProvider
NotificationProvider
LeadProvider
...
```

dan apakah itu lebih kompleks daripada satu Zustand store dengan slices/selectors?

---

# PHASE 6 — Zustand Architecture Analysis

Jangan hanya membandingkan library.

Design **minimal realistic Zustand architecture** berdasarkan code aktual.

Contoh konseptual:

```ts
type AuthStore = {
  ...
}
```

Tetapi jangan mengimplementasikan.

Evaluasi:

- slices
- selectors
- actions
- subscriptions
- persistence
- SSR implications
- client-only boundary
- cross-app package sharing
- testing
- devtools
- state isolation

**Jangan memasukkan server state ke Zustand hanya karena Zustand tersedia.**

TanStack Query tetap owner untuk server state.

---

# PHASE 7 — Context → Zustand Migration Cost NOW

Hitung migration surface berdasarkan code aktual.

Cari semua:

```text
useAuth()
useAuthz()
useMe()
useRequireSession()
AuthProvider
AuthContext
```

Buat:

| Consumer | Current API | Zustand migration impact |
|---|---|---|
| ... | ... | ... |

Hitung:

- number of files
- number of consumers
- provider changes
- test changes
- package changes
- type changes
- FCM integration changes
- portal changes
- tech-pwa changes

Jangan memberikan estimasi "1–2 hari" tanpa basis.

---

# PHASE 8 — Context → Zustand Migration Later

Sekarang lakukan scenario planning.

Assume:

```text
Current consumer count
+
RBAC consumers
+
menu permission consumers
+
notification consumers
+
lead consumers
+
PWA consumers
```

Kemudian hitung estimated migration surface **jika kita menunggu**.

Bandingkan:

```text
Migrate NOW
vs
Migrate AFTER 3–6 phases
```

Perhatikan:

- consumer count
- API surface
- state shape
- selectors
- provider dependencies
- tests
- FCM dependencies
- navigation dependencies
- cross-app dependencies

---

# PHASE 9 — Total Lifecycle Cost

Buat explicit matrix:

| Dimension | Context Now | Zustand Now | Context → Zustand Later |
|---|---:|---:|---:|
| Initial implementation | | | |
| Migration cost | | | |
| Consumer churn | | | |
| Testing cost | | | |
| Re-render risk | | | |
| Selector ergonomics | | | |
| Cross-app sharing | | | |
| Maintainability | | | |
| Near-term roadmap fit | | | |
| Long-term migration risk | | | |
| Operational overhead | | | |
| Dependency overhead | | | |
| Total lifecycle cost | | | |

Gunakan:

```text
LOW
MEDIUM
HIGH
```

dan berikan reasoning.

---

# PHASE 10 — Performance Analysis

Jangan membuat benchmark yang tidak relevan.

Analisis berdasarkan actual architecture:

### Context

```text
Provider value changes
↓
Consumer notification
↓
Potential rerender
```

### Zustand

```text
Store update
↓
Selector comparison
↓
Only affected subscribers
```

Tentukan apakah perbedaan tersebut **material** untuk current + near-term consumer count.

Jangan mengklaim performance problem jika belum ada evidence.

Gunakan:

```text
CURRENTLY MATERIAL
LIKELY SOON
NOT MATERIAL
```

---

# PHASE 11 — TanStack Query Boundary

Karena TanStack Query sudah digunakan, pastikan architecture menjadi:

```text
                    ┌──────────────────────┐
                    │      Better Auth     │
                    │   Session Authority  │
                    └──────────┬───────────┘
                               │
                               ↓
                    ┌──────────────────────┐
                    │   TanStack Query     │
                    │    Server State      │
                    └──────────┬───────────┘
                               │
                               ↓
                    ┌──────────────────────┐
                    │ Zustand / Context    │
                    │ Client Global State  │
                    └──────────────────────┘
```

Evaluasi apakah `/me` sebaiknya menjadi TanStack Query server state dengan global store hanya menyimpan state yang memang perlu client-global.

Jangan membuat duplicate cache:

```text
TanStack Query /me
+
Zustand /me
```

tanpa alasan.

---

# PHASE 12 — Architecture Boundaries

Tetapkan secara eksplisit:

## Better Auth owns

- session lifecycle
- cookie
- authentication mechanism

## TanStack Query owns

- server state
- API cache
- stale state
- invalidation
- refetch

## Zustand / Context owns

- client-global state
- cross-component reactive state
- derived client state
- UI/application coordination

## Backend owns

- authorization enforcement
- permission enforcement
- notification recipient eligibility
- actual security

## FCM module owns

- FCM token
- browser permission
- registration status

---

# PHASE 13 — Decision Criteria

Berikan final recommendation berdasarkan criteria berikut:

### Choose React Context if:

- current and near-term state remains small
- consumer count remains low
- rerender behavior is acceptable
- selectors are not materially needed
- migration later remains demonstrably cheap
- provider complexity remains low

### Choose Zustand NOW if:

- consumer count is expected to grow materially
- state dimensions will grow
- selective subscriptions become useful
- provider complexity will grow
- cross-app sharing benefits from store abstraction
- migration cost is significantly lower now than later
- Zustand provides better lifecycle economics without meaningful operational cost

Jangan choose berdasarkan "fashion" atau popularity.

---

# PHASE 14 — Final Decision

Berikan SATU keputusan:

```text
KEEP REACT CONTEXT
```

atau:

```text
MIGRATE TO ZUSTAND NOW
```

Tidak boleh memberikan jawaban ambigu seperti:

> "Both are fine."

Jika memilih Context:

jelaskan mengapa migration later tetap murah berdasarkan evidence.

Jika memilih Zustand:

jelaskan mengapa **sekarang** adalah migration window yang paling ekonomis.

---

# PHASE 15 — If Zustand NOW

Jika keputusan:

```text
MIGRATE TO ZUSTAND NOW
```

Jangan langsung implementasi.

Berikan:

## Migration Blueprint

```text
1. Define store boundaries
2. Define state shape
3. Define selectors
4. Define actions
5. Move AuthProvider orchestration
6. Integrate Better Auth
7. Integrate TanStack Query
8. Migrate portal consumers
9. Migrate tech-pwa consumers
10. Migrate FCM consumers
11. Remove Context
12. Test
13. Forensic audit
```

Untuk setiap step:

- affected files
- risk
- rollback strategy
- verification criteria

---

# PHASE 16 — If Context NOW

Jika keputusan:

```text
KEEP REACT CONTEXT
```

tetapkan explicit guardrails:

- maximum acceptable provider complexity
- selector strategy
- maximum context domains
- when to split context
- measurable trigger for Zustand migration
- consumer count threshold
- performance trigger
- state-size trigger

Jangan hanya mengatakan:

> "Migrate later."

Harus ada **objective migration trigger**.

---

# FINAL REPORT

Struktur wajib:

## 1. Executive Decision

## 2. Actual Current Architecture

## 3. Actual Consumer Inventory

## 4. Near-Term State Growth

## 5. React Context Scaling Analysis

## 6. Zustand Architecture Analysis

## 7. TanStack Query Boundary

## 8. Migration Cost — NOW

## 9. Migration Cost — LATER

## 10. Total Lifecycle Cost Matrix

## 11. Performance Analysis

## 12. Risk Analysis

## 13. Final Decision

Gunakan satu:

```text
KEEP REACT CONTEXT
```

atau:

```text
MIGRATE TO ZUSTAND NOW
```

## 14. Why This Decision

Berikan reasoning berdasarkan code aktual.

## 15. Implementation Plan

Jika Zustand dipilih, berikan migration blueprint tetapi **JANGAN mengubah code**.

## 16. Rollback Strategy

Jelaskan bagaimana migration dapat dibatalkan dengan aman.

## 17. Verification Criteria

Apa yang harus PASS sebelum migration dianggap selesai.

---

# ABSOLUTE RULES

1. **AUDIT / DECISION ONLY — DO NOT MODIFY CODE.**
2. Do not install dependencies.
3. Do not implement Zustand.
4. Do not refactor Context.
5. Do not change TanStack Query.
6. Do not change API.
7. Do not change database.
8. CODE ACTUAL is the primary source of truth.
9. Do not assume implementation report is complete.
10. Do not treat Zustand as automatically better.
11. Do not treat React Context as automatically simpler/better.
12. Do not use "not needed yet" as the primary argument against a foundation.
13. Evaluate total lifecycle cost.
14. Evaluate current implementation AND near-term roadmap.
15. Distinguish application architecture foundation from infrastructure over-engineering.
16. Do not introduce Redis/RabbitMQ/Kubernetes/etc.
17. Keep TanStack Query as the server-state candidate.
18. Keep Better Auth as authentication authority.
19. Keep backend authorization as security authority.
20. Do not put FCM token into Auth/Authz global state.
21. **If evidence supports Zustand NOW, say so clearly and recommend migration NOW.**
22. **If evidence supports Context, define objective triggers for future migration.**
23. Do not produce a neutral "both are fine" conclusion.

# FINAL OUTPUT

End the report with exactly:

```text
FINAL ARCHITECTURE DECISION
===========================

Decision:
[KEEP REACT CONTEXT / MIGRATE TO ZUSTAND NOW]

Confidence:
[HIGH / MEDIUM / LOW]

Why:
[3–7 concise evidence-based points]

Migration timing:
[NOW / DEFER]

TanStack Query:
[KEEP / EXPAND]

P0:
[count]

P1:
[count]

P2:
[count]

Safe to proceed:
[YES / NO]
```