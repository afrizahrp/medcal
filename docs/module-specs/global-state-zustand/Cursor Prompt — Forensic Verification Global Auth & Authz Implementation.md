# FORENSIC VERIFICATION — Global Auth & Authz Implementation

## Objective

Lakukan **forensic verification terhadap CODE AKTUAL** setelah implementasi Global Auth & Authz.

Gunakan:

1. Audit Report — Global Auth & Authz State
2. Implementation Report — Global Auth & Authz State
3. **Source code aktual repository sebagai source of truth utama**

Tujuan audit ini bukan untuk mengulang audit arsitektur sebelumnya.

Tujuan utamanya adalah memastikan:

> Apakah implementasi yang sekarang benar-benar sesuai dengan architecture yang dimaksud, tidak meninggalkan duplicate implementation, tidak memiliki lifecycle/race-condition issue, dan cukup kuat menjadi fondasi global state untuk kompleksitas system yang akan segera berkembang?

---

# IMPORTANT ARCHITECTURAL POSITION

Jangan menggunakan asumsi:

> "Zustand belum diperlukan sekarang."

atau:

> "TanStack Query belum diperlukan sekarang."

atau:

> "React Context lebih sederhana sehingga selalu lebih baik."

Itu BUKAN objective audit ini.

Pertimbangkan **near-term architectural trajectory** dari system.

Jika sebuah technology/foundation sekarang memiliki implementation cost dan operational overhead yang rendah tetapi dapat secara signifikan mengurangi migration/refactor cost ketika system berkembang, pertimbangkan penggunaannya sebagai **early foundation**.

Contoh prinsip:

```text
Early foundation
≠
Over-engineering
```

Bandingkan dengan:

```text
Redis
RabbitMQ
Kubernetes
```

yang memiliki operational complexity jauh lebih besar.

Jangan menyamakan keputusan menggunakan:

```text
Zustand
TanStack Query
```

dengan keputusan memperkenalkan:

```text
Redis
RabbitMQ
Kubernetes
```

Keduanya berada pada kelas architectural cost yang berbeda.

---

# PRIMARY RULE

**SOURCE CODE IS THE SOURCE OF TRUTH.**

Jangan menerima statement dalam implementation report sebagai fakta sebelum diverifikasi terhadap code aktual.

Untuk setiap claim penting dalam implementation report:

```text
Report claim
    ↓
Locate actual implementation
    ↓
Trace callers
    ↓
Trace state lifecycle
    ↓
Verify runtime behavior
    ↓
PASS / FAIL / NEEDS FIX
```

---

# PHASE 1 — Repository State

Periksa terlebih dahulu:

- git status
- changed files
- untracked files
- recent commits terkait implementasi
- package.json
- pnpm workspace
- packages/auth
- packages/shared
- apps/portal
- apps/tech-pwa

Identifikasi apakah implementation report benar-benar mencerminkan perubahan repository.

Laporkan:

```text
IMPLEMENTATION REPORT ↔ ACTUAL REPOSITORY
MATCH / PARTIAL MATCH / MISMATCH
```

Jika ada file yang berubah tetapi tidak disebutkan di implementation report, tandai.

Jika implementation report menyebut file berubah tetapi file tersebut tidak berubah, tandai.

---

# PHASE 2 — AuthProvider Forensic Audit

Audit file aktual:

```text
packages/auth/src/auth-provider.tsx
packages/auth/src/auth-client.ts
packages/auth/src/me-types.ts
```

dan seluruh import/consumer-nya.

Periksa:

## 2.1 Provider lifecycle

Pastikan:

```text
App
 ↓
AuthProvider
 ↓
useSession()
 ↓
GET /me
 ↓
AuthContext
 ↓
Consumers
```

Tidak terjadi:

```text
Consumer
 ↓
GET /me
```

secara independen.

---

## 2.2 GET /me uniqueness

Lakukan repository-wide search untuk:

```text
/me
GET /me
fetch(...)
apiFetch(...)
useRequireSession
useMe
```

Trace semua caller.

Buat tabel:

| Caller | File | Fetch /me? | Through AuthProvider? | Status |
|---|---|---:|---:|---|
| ... | ... | YES/NO | YES/NO | PASS/FAIL |

Target:

> `GET /me` harus memiliki satu orchestration point untuk authenticated staff applications.

Jika ada pengecualian, jelaskan.

---

# PHASE 3 — AuthProvider Effect / Race Condition Audit

Audit seluruh:

- useEffect
- dependencies
- state setters
- async functions
- AbortController
- request cancellation
- session transitions

Secara khusus test reasoning terhadap:

### Case 1

```text
initial mount
→ Better Auth pending
→ session available
→ GET /me
```

### Case 2

```text
React Strict Mode
→ mount
→ unmount
→ mount
```

### Case 3

```text
session null
→ session available
```

### Case 4

```text
session A
→ logout
→ session null
→ login user B
```

### Case 5

```text
GET /me in flight
→ session becomes invalid
```

### Case 6

```text
GET /me returns 401
```

### Case 7

```text
GET /me returns 403 ACCOUNT_PENDING
```

### Case 8

```text
GET /me returns other 403
```

Pastikan tidak ada stale response dari user A yang akhirnya menulis state ke user B.

Contoh race:

```text
User A
  ↓
GET /me ───────────────┐
                       │
logout                 │
login User B           │
  ↓                    │
GET /me B              │
  ↓                    │
state = B              │
                       ↓
             response A arrives
                       ↓
             state incorrectly = A
```

Jika protection terhadap race ini tidak ada dan memang diperlukan berdasarkan implementation, tandai sebagai issue.

---

# PHASE 4 — Auth State Boundary

Verifikasi actual state yang disimpan.

Expected foundation:

```ts
Auth
├── bootstrapStatus
└── user
```

Authz:

```ts
Authz
├── membership
└── capabilities
```

Tetapi jangan hanya memeriksa type.

Trace apakah ada:

- duplicate user state
- duplicate membership state
- duplicate capabilities state
- session state yang disimpan kembali
- token state
- auth state di localStorage
- auth state di page component
- auth state di layout

Cari **multiple source of truth**.

---

# PHASE 5 — Zustand vs React Context

Ini adalah bagian penting.

Jangan hanya menyimpulkan:

> "React Context is simpler."

Evaluasi apakah React Context yang sekarang benar-benar merupakan **suitable long-term global state foundation** untuk roadmap system.

Analisis actual dan expected near-term complexity:

- Auth
- Authz
- User management
- RBAC
- menu permission
- notification authorization
- FCM
- PWA
- lead assignment
- future cross-app state
- portal
- technician PWA
- kemungkinan additional applications

Kemudian jawab:

### Question A

Apakah current React Context implementation akan tetap sehat ketika jumlah global selectors bertambah?

### Question B

Apakah consumer re-render akan menjadi masalah?

### Question C

Apakah selective subscription diperlukan?

### Question D

Apakah provider value akan menjadi increasingly large?

### Question E

Apakah state transitions akan menjadi increasingly complex?

### Question F

Apakah akan ada kebutuhan cross-app shared state yang lebih besar?

### Question G

Apakah migration ke Zustand sekarang materially cheaper daripada migration nanti?

Jangan otomatis menjawab Zustand.

Tetapi lakukan **explicit architecture cost comparison**:

```text
React Context now
vs
Zustand now
vs
React Context → Zustand later
```

Evaluasi:

- implementation cost
- migration cost
- consumer churn
- testing cost
- performance characteristics
- selector ergonomics
- maintainability
- cross-app sharing
- near-term roadmap fit

Jika Zustand lebih tepat sebagai foundation **sekarang**, katakan secara eksplisit.

---

# PHASE 6 — TanStack Query Foundation

Audit actual usage.

Cari:

```text
QueryClientProvider
useQuery
useMutation
queryKey
invalidateQueries
```

Periksa apakah TanStack Query sudah menjadi established architectural pattern.

Kemudian audit:

- nav
- server state
- cache ownership
- staleTime
- invalidation
- mutation → query synchronization

Tujuan:

> Jangan membuat global state store menjadi tempat menyimpan server state yang seharusnya dikelola TanStack Query.

Tetapi juga jangan menghindari TanStack Query hanya karena feature tersebut "belum besar".

Jika infrastructure sudah ada dan overhead rendah, nilai sebagai **foundation**.

---

# PHASE 7 — Auth vs Server State Boundary

Pastikan distinction:

```text
GLOBAL CLIENT STATE
-------------------
Auth lifecycle
Current user
Current membership
Capabilities


SERVER STATE
------------
Nav
User details
Permission catalog
Unread counts
Notification records
etc.
```

Audit apakah implementasi mulai mencampurkan keduanya.

Jika ada candidate state baru, klasifikasikan:

```text
Client global state
Server state
Derived state
Local UI state
```

---

# PHASE 8 — Authz Forensic Audit

Trace actual consumers:

```text
capabilities
membership.role
membership.companyId
```

Cari semua usage.

Pastikan tidak ada consumer yang masih melakukan:

```ts
fetch('/me')
```

atau duplicate auth hook.

Cari juga:

```text
role === ...
isAdmin
isSuperAdmin
permissions.includes(...)
```

Tentukan apakah setiap penggunaan memang justified.

Jangan mengubah implementation hanya karena ada role check.

Tujuan audit adalah menemukan inconsistency.

---

# PHASE 9 — Backend Security Boundary

Verifikasi bahwa global auth/authz state **tidak menjadi security boundary**.

Pastikan sensitive operations tetap melewati:

```text
CompanyRoleGuard
RequirePermission
hasPermission
```

Cari contoh API mutation:

```text
POST
PATCH
DELETE
```

dan pastikan frontend capability hanya digunakan untuk UX.

Expected:

```text
Frontend
   ↓
UX gate
   ↓
API
   ↓
CompanyRoleGuard
   ↓
hasPermission()
   ↓
Allow / Deny
```

---

# PHASE 10 — FCM Lifecycle Audit

Audit actual:

```text
usePushNotifications
PushNotificationsMenuItem
PushNotificationsControl
syncPushTokenIfNeeded
logout
```

Pastikan dependency:

```text
AuthProvider
   ↓
user.id
   ↓
FCM
```

dan BUKAN:

```text
FCM
   ↓
Auth state
```

Test reasoning:

### User A login

```text
A
→ FCM token A
→ register
```

### User A logout

```text
A
→ revoke token
→ signOut
```

### User B login

```text
B
→ obtain/register B token
```

Pastikan tidak ada stale `userId`.

---

# PHASE 11 — Navigation State

Audit actual `useNav`.

Verify:

```text
queryKey = ['nav', application]
```

dan:

```text
enabled = authenticated/ready
```

Pastikan tidak ada duplicate local `useState(nav)` cache yang berjalan paralel.

Kemudian audit permission mutation.

Question:

> Setelah permission change, kapan nav cache menjadi stale?

Jika belum ada invalidation:

```text
permission mutation
      ↓
invalidateQueries(['nav'])
```

tandai sebagai:

```text
FOLLOW-UP / P1
```

bukan sebagai security issue.

---

# PHASE 12 — Provider Placement

Audit actual provider tree:

Portal:

```text
QueryClientProvider
    ↓
AuthProvider
    ↓
children
```

Tech PWA:

```text
...
    ↓
AuthProvider
    ↓
children
```

Periksa apakah:

- provider mount terlalu dalam
- provider duplicate
- provider nested
- provider tidak mencakup consumer tertentu
- provider recreated unnecessarily

Target:

> Satu AuthProvider per authenticated application root.

---

# PHASE 13 — Backward Compatibility

Audit:

```text
useRequireSession()
useMe()
useAuth()
useAuthz()
```

Pastikan naming dan semantics tidak membingungkan.

Khusus:

```text
useRequireSession()
```

harus sekarang berarti:

> read global auth context + existing gate semantics

bukan hidden data-fetching hook.

Cari apakah developer yang membaca nama hook tersebut masih berpotensi mengira hook melakukan fetch.

Jika naming sekarang misleading, tandai sebagai architecture/maintainability concern — jangan otomatis rename tanpa impact analysis.

---

# PHASE 14 — Type Consistency

Audit:

```text
Me
MeUser
MeMembership
MeCapabilities
MembershipRole
AuthBootstrapStatus
```

Cari duplicate definitions.

Target:

```text
packages/auth
      ↓
shared type
      ↓
portal
tech-pwa
```

Tidak boleh ada duplicate local `Me` interface yang sudah digantikan.

---

# PHASE 15 — Test Coverage

Jangan hanya melihat typecheck.

Audit apakah test coverage mencakup:

### Auth

- session loading
- authenticated
- unauthenticated
- 401
- 403
- ACCOUNT_PENDING
- logout
- session transition

### Authz

- capabilities
- membership
- forbidden state

### Provider

- `/me` request
- duplicate mount
- context consumers

### FCM

- authenticated userId
- logout transition

### Navigation

- query enabled/disabled
- cache
- permission changes

Jika test tidak ada, jangan mengarang bahwa behavior sudah aman.

Mark:

```text
NEEDS TEST
```

---

# PHASE 16 — Production Build Verification

Jalankan bila environment memungkinkan:

```bash
pnpm --filter @medcal/auth typecheck
pnpm --filter @medcal/portal typecheck
pnpm --filter @medcal/tech-pwa typecheck

pnpm --filter @medcal/portal test
pnpm --filter @medcal/tech-pwa test
```

Jika tersedia:

```bash
pnpm build
```

Periksa juga:

- circular dependency
- package boundary violation
- browser/server import violation
- Next.js App Router client boundary
- React Context SSR/hydration issues

---

# PHASE 17 — Architecture Foundation Assessment

Ini WAJIB.

Jangan hanya menjawab:

> "Works today."

Jawab:

> "Is this a good foundation for the next phase of this application?"

Evaluate:

```text
Current complexity
        +
Near-term roadmap
        ↓
Required state architecture
```

Secara khusus nilai apakah sebaiknya sekarang menggunakan:

```text
React Context
```

atau:

```text
Zustand
```

untuk global client state.

Jika hasil audit menyimpulkan Zustand sekarang lebih ekonomis secara total lifecycle cost, **rekomendasikan migrasi sekarang**, meskipun current React Context implementation masih technically correct.

Sebaliknya, jika Context benar-benar cukup untuk near-term architecture, jelaskan **kenapa**, bukan sekadar "lebih sederhana".

---

# PHASE 18 — Final Classification

Untuk setiap finding gunakan:

### P0 — Must Fix Before Continue

Security issue, data corruption, auth lifecycle bug, race condition, duplicate authoritative state, broken redirect, etc.

### P1 — Fix Before Next Major Feature

Architecture issue yang akan menyebabkan rework segera.

### P2 — Follow-up

Tidak blocking.

### PASS

Correct and aligned.

### NEEDS VERIFICATION

Tidak cukup bukti dari code/test.

---

# FINAL REPORT FORMAT

## 1. Executive Verdict

Gunakan salah satu:

```text
PASS — SAFE TO CONTINUE
PASS WITH P1 FIXES
BLOCKED — FIX REQUIRED
```

## 2. Implementation Report vs Actual Code

| Claim | Actual Code | Result |
|---|---|---|
| ... | ... | PASS/FAIL |

## 3. AuthProvider Forensic Findings

## 4. Auth State Findings

## 5. Authz State Findings

## 6. Zustand vs React Context Assessment

Berikan explicit recommendation:

```text
KEEP REACT CONTEXT
```

atau:

```text
MIGRATE TO ZUSTAND NOW
```

atau:

```text
KEEP CONTEXT TEMPORARILY
```

Tetapi decision harus berdasarkan **near-term architecture + total migration cost**, bukan sekadar current simplicity.

## 7. TanStack Query Assessment

Apakah current adoption sudah menjadi foundation yang tepat?

## 8. FCM Lifecycle Findings

## 9. Navigation / Server State Findings

## 10. Provider / Package Boundary Findings

## 11. Test & Build Evidence

## 12. P0 Findings

## 13. P1 Findings

## 14. P2 Findings

## 15. Final Architecture Recommendation

Berikan final recommended architecture berdasarkan **actual code + near-term roadmap**.

---

# ABSOLUTE RULES

1. **Do not modify code.**
2. Do not install dependencies.
3. Do not refactor.
4. Do not "fix" anything during this audit.
5. Do not assume implementation report is correct.
6. Do not assume React Context is preferable merely because it is simpler.
7. Do not assume Zustand is preferable merely because it is more scalable.
8. Evaluate total lifecycle cost.
9. Evaluate near-term system trajectory.
10. Backend remains the security authority.
11. Do not put tokens into client global state.
12. Do not put full permission catalog into global auth state.
13. Do not merge FCM state into Auth state.
14. Do not introduce Redis/RabbitMQ/Kubernetes/etc. as part of this task.
15. Do not classify low-operational-overhead client libraries such as Zustand/TanStack Query as equivalent to infrastructure-level over-engineering.
16. **CODE ACTUAL > IMPLEMENTATION REPORT > ASSUMPTION.**

At the very end provide:

```text
FINAL VERDICT:
[PASS / PASS WITH P1 / BLOCKED]

P0:
[count]

P1:
[count]

P2:
[count]

ZUSTAND DECISION:
[KEEP / MIGRATE NOW / OTHER]

TANSTACK QUERY DECISION:
[KEEP / EXPAND / OTHER]

SAFE TO PROCEED TO NEXT PHASE:
YES / NO
```