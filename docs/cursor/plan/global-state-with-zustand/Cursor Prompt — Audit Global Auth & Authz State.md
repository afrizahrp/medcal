# Audit: Global State untuk Auth & Authz

## Objective

Lakukan audit lengkap terhadap codebase frontend untuk menentukan:

1. Property/data apa saja yang saat ini digunakan untuk **Authentication (Auth)**.
2. Property/data apa saja yang saat ini digunakan untuk **Authorization (Authz)**.
3. Property mana yang **layak dan perlu** dimasukkan ke global state.
4. Property mana yang **tidak boleh** dimasukkan ke global state dan tetap harus diambil dari server/API.
5. Struktur global state yang paling tepat berdasarkan arsitektur codebase yang **sudah ada**.

**PENTING:**
- Jangan melakukan implementasi/perubahan code pada tahap ini.
- Jangan membuat store/context baru.
- Jangan melakukan refactor.
- Jangan mengubah API/backend.
- Jangan mengubah schema database.
- Fokus hanya pada audit, tracing dependency, dan rekomendasi arsitektur.
- Jangan mengasumsikan library/state-management tertentu. Ikuti pola yang sudah digunakan project.

---

# 1. Audit Authentication

Telusuri seluruh frontend dan identifikasi bagaimana aplikasi saat ini mengetahui bahwa user:

- sudah login
- belum login
- session masih valid
- session expired
- sedang melakukan bootstrap/loading auth
- logout
- mendapatkan current user

Cari seluruh sumber berikut:

- auth context/provider
- hooks
- Zustand/Redux/Context atau state management lain
- API client
- auth service
- middleware
- route guards
- layout
- server components/client components
- localStorage/sessionStorage/cookies
- JWT/session handling
- `/me`, `/profile`, `/session`, atau endpoint sejenis
- redirect logic
- login/logout flow

Buat inventory property yang ditemukan.

Contoh kategori:

```text
Authentication
├── isAuthenticated
├── authLoading
├── user
│   ├── id
│   ├── name
│   ├── email
│   └── ...
├── session
├── accessToken
├── refreshToken
└── ...
```

Jangan menganggap contoh di atas semuanya harus masuk global state.

Untuk setiap property, tentukan:

- current source
- siapa yang membaca
- siapa yang menulis
- apakah mutable
- apakah server-authoritative
- apakah sensitive
- apakah dibutuhkan lintas halaman/component
- apakah perlu reactive update
- apakah cocok menjadi global state

---

# 2. Audit Authorization

Telusuri seluruh codebase untuk menemukan bagaimana aplikasi menentukan apakah user:

- boleh mengakses halaman
- boleh melihat menu
- boleh melihat component tertentu
- boleh melakukan action tertentu
- memiliki role tertentu
- memiliki permission tertentu
- merupakan member dari entity/organization tertentu
- memiliki notification eligibility

Cari seluruh pola seperti:

```text
role
roles
permission
permissions
membership
memberships
isAdmin
isOwner
isManager
can(...)
hasPermission(...)
hasRole(...)
isGetNotif
```

Juga cari conditional authorization seperti:

```ts
if (user.role === ...)
if (permissions.includes(...))
if (membership...)
if (...)
```

Audit juga:

- sidebar/menu visibility
- route protection
- page-level authorization
- button/action authorization
- API authorization assumptions
- component-level guards
- feature flags yang sebenarnya merupakan authorization
- organization/company/tenant membership
- UserMembership
- notification authorization

---

# 3. Audit UserMembership

Karena sistem menggunakan `UserMembership`, audit secara khusus:

- bagaimana membership saat ini diperoleh
- kapan membership di-fetch
- property apa saja yang tersedia
- apakah satu user dapat memiliki lebih dari satu membership
- bagaimana active/current membership ditentukan
- bagaimana role/permission diturunkan dari membership
- bagaimana `isGetNotif` digunakan
- apakah `isGetNotif` saat ini sudah digunakan frontend
- apakah `isGetNotif` seharusnya menjadi bagian dari authz state

Jangan langsung menyimpulkan bahwa seluruh object `UserMembership` harus dimasukkan global state.

Tentukan property mana yang benar-benar diperlukan secara global.

---

# 4. Trace Semua Consumer

Untuk setiap candidate property Auth/Authz, lakukan tracing:

```text
Property
   ↓
Source
   ↓
API / storage / context / hook
   ↓
Components
   ↓
Pages
   ↓
Actions
```

Cari terutama property yang saat ini:

- di-fetch berulang kali
- dipassing melalui props terlalu jauh
- diakses oleh banyak component
- memiliki duplicate state
- memiliki multiple source of truth
- memiliki kemungkinan stale state
- menyebabkan auth check tersebar di banyak tempat

Identifikasi juga prop drilling yang sebenarnya muncul karena auth/authz data.

---

# 5. Klasifikasikan Setiap Property

Untuk setiap property yang ditemukan, masukkan ke salah satu kategori:

### A. Global Auth State

Data yang:

- diperlukan lintas banyak halaman/component
- bersifat user/session scoped
- perlu reactive update
- memiliki satu source of truth

### B. Global Authz State

Data yang:

- digunakan lintas halaman/component untuk authorization
- perlu digunakan oleh route/menu/action guards
- berasal dari server-authoritative authorization data

### C. Server State

Data yang:

- harus selalu dianggap server-authoritative
- terlalu besar/volatile
- tidak perlu tersedia global
- lebih tepat dikelola oleh existing data-fetching layer

### D. Local UI State

Data yang hanya diperlukan oleh component/page tertentu.

### E. Sensitive / Do Not Store Globally

Data yang tidak seharusnya disimpan di client global state, misalnya credential/token tertentu jika architecture saat ini tidak membutuhkannya.

Jelaskan alasan untuk setiap klasifikasi.

---

# 6. Candidate Global State

Setelah audit selesai, buat tabel rekomendasi:

| Property | Category | Global? | Source | Consumers | Reason |
|---|---|---:|---|---|---|
| ... | Auth | YES/NO | ... | ... | ... |
| ... | Authz | YES/NO | ... | ... | ... |

Gunakan property **actual yang ditemukan di codebase**, bukan property hasil asumsi.

---

# 7. Tentukan Minimal Global State

Setelah seluruh audit, tentukan **minimal global state** yang benar-benar diperlukan.

Tujuannya bukan memasukkan sebanyak mungkin data.

Gunakan prinsip:

> Global state should contain only cross-cutting, user-scoped, reactive state that has a clear single source of truth.

Pisahkan minimal state menjadi:

```text
AUTH
- ...

AUTHZ
- ...

SESSION
- ...
```

Jika menurut audit `SESSION` tidak perlu dipisahkan, jelaskan alasannya.

---

# 8. Derived State

Identifikasi property yang sebenarnya tidak perlu disimpan karena dapat dihitung dari state lain.

Contoh:

```text
isAuthenticated
isAdmin
canManageUsers
canReceiveNotification
```

Tentukan apakah masing-masing:

- harus stored state
- atau derived state / selector

Contoh:

```text
membership.isGetNotif
        ↓
canReceiveNotification
```

Jangan menyimpan keduanya jika salah satunya dapat selalu diturunkan dengan aman dari yang lain.

---

# 9. Server Authority vs Client State

Untuk setiap authorization property, jelaskan:

1. Apa source of truth di backend?
2. Apa yang hanya menjadi cached/derived representation di frontend?
3. Apakah frontend boleh menggunakannya hanya untuk UI?
4. Apakah backend tetap melakukan authorization enforcement?

Pastikan rekomendasi tidak membuat frontend global state menjadi security boundary.

Prinsip:

```text
Frontend Authz State
        ↓
UI / UX decision

Backend Authorization
        ↓
Actual security enforcement
```

---

# 10. FCM Integration

Audit hubungan Auth/Authz dengan FCM.

Tentukan state apa yang diperlukan agar flow berikut dapat dilakukan dengan benar:

```text
User authenticated
        ↓
Auth bootstrap complete
        ↓
Authz / UserMembership available
        ↓
User eligible for notification?
        ↓
FCM registration
        ↓
Register token
```

Secara khusus evaluasi:

- `isGetNotif`
- membership
- authenticated user
- FCM registration status
- FCM token

Tentukan mana yang merupakan:

- Auth state
- Authz state
- FCM state
- server state
- derived state

**Jangan memasukkan FCM state ke Auth/Authz global state hanya karena FCM bergantung pada Auth/Authz.**

---

# 11. Identify Existing Architecture

Sebelum merekomendasikan implementation, identifikasi:

- framework frontend
- routing architecture
- state management library
- data fetching library
- existing providers
- existing contexts
- existing hooks
- existing auth abstraction
- existing API abstraction

Jika sudah ada global state mechanism, gunakan itu sebagai basis rekomendasi.

Jangan memperkenalkan library baru tanpa alasan kuat.

---

# 12. Anti-Overengineering Check

Evaluasi apakah global state yang direkomendasikan terlalu besar.

Cari kemungkinan:

- duplicate server state
- duplicate user object
- duplicate membership object
- duplicate permission arrays
- unnecessary cached API responses
- derived state yang disimpan sebagai state
- token yang sebenarnya tidak perlu exposed
- FCM state yang tercampur dengan auth state

Jika sesuatu tidak perlu global, katakan dengan jelas:

> KEEP LOCAL / SERVER STATE — DO NOT PROMOTE TO GLOBAL STATE

---

# 13. Final Deliverable

Berikan hasil audit dalam struktur berikut:

## A. Executive Summary

Ringkas:

- kondisi Auth saat ini
- kondisi Authz saat ini
- masalah utama
- apakah global state memang diperlukan
- rekomendasi arsitektur

## B. Current Auth Architecture

Jelaskan flow aktual berdasarkan codebase.

## C. Current Authz Architecture

Jelaskan flow aktual berdasarkan codebase.

## D. UserMembership Analysis

Jelaskan struktur dan penggunaannya.

## E. Property Inventory

Tabel seluruh property Auth/Authz yang ditemukan.

## F. Global State Recommendation

Tentukan property yang direkomendasikan masuk global state.

## G. Keep Out of Global State

Tentukan property yang harus tetap server/local/derived.

## H. Derived State

Tentukan property yang sebaiknya selector/derived state.

## I. FCM Dependency

Jelaskan dependency Auth → Authz → FCM.

## J. Recommended Global State Shape

Berikan contoh **conceptual shape saja**, misalnya:

```ts
type AuthState = {
  ...
}

type AuthzState = {
  ...
}
```

Jangan implementasikan.

## K. Migration / Implementation Plan

Berikan urutan implementasi yang aman setelah audit.

Contoh:

```text
1. Establish auth bootstrap
2. Establish global auth state
3. Establish authz state
4. Normalize UserMembership
5. Add selectors
6. Migrate consumers
7. Integrate FCM
8. Remove duplicate state
```

Sesuaikan dengan hasil audit aktual.

---

# Important Constraints

- **AUDIT ONLY**
- No code modification.
- No new dependencies.
- No schema changes.
- No API changes.
- No speculative properties.
- Reference actual files, hooks, components, API calls, and existing state mechanisms found in the repository.
- Jika ada ambiguity, tandai sebagai `NEEDS VERIFICATION`, jangan menebak.
- Prioritaskan **single source of truth**.
- Prioritaskan **minimal global state**.
- Jangan menyimpan server state sebagai global state hanya karena mudah diakses.
- Jangan menjadikan frontend authz sebagai security boundary.

Pada akhir audit, berikan satu kesimpulan eksplisit:

> **RECOMMENDED GLOBAL AUTH STATE**

dan

> **RECOMMENDED GLOBAL AUTHZ STATE**

dengan hanya property yang benar-benar justified oleh hasil audit.