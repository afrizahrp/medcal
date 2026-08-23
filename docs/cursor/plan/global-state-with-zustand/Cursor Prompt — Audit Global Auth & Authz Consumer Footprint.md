# GLOBAL AUTH & AUTHZ — CONSUMER FOOTPRINT AUDIT

## Objective

Lakukan audit terhadap **code aktual repository** untuk mengukur secara lengkap:

> **Seberapa banyak dan seberapa luas Global Auth dan Global Authz dikonsumsi oleh aplikasi saat ini?**

Fokus audit ini **hanya pada consumption footprint**.

Jangan membandingkan React Context vs Zustand pada tahap ini.

Jangan mengubah code.

Jangan melakukan refactor.

Jangan menambahkan dependency.

Jangan membuat architecture recommendation.

Tujuan akhirnya adalah menghasilkan **consumer inventory yang faktual** yang nantinya dapat digunakan sebagai input untuk decision-grade comparison React Context vs Zustand.

---

# IMPORTANT DEFINITION

Kita sedang mengukur:

```text
GLOBAL AUTH
+
GLOBAL AUTHZ
```

Bukan seluruh application state.

Domain seperti:

- quotation
- PO
- receipt
- calibration
- invoice
- CN
- payment
- reporting
- cashbank
- certification progress
- certificate

**bukan global Auth/Authz state.**

Tetapi jika domain tersebut **mengkonsumsi Auth/Authz**, consumer-nya HARUS dihitung.

Contoh:

```ts
const { user } = useAuth();
```

di halaman Invoice:

> Invoice page adalah Auth consumer.

Contoh:

```ts
const { capabilities } = useAuthz();
```

di Certificate page:

> Certificate page adalah Authz consumer.

---

# 1. Define What Counts as Auth Consumption

Hitung sebagai **AUTH consumer** semua code yang secara runtime membaca global authentication state.

Cari seluruh penggunaan:

```text
useAuth()
useMe()
useRequireSession()
AuthContext
AuthProvider
auth context consumer
user
bootstrapStatus
isAuthenticated
isAuthLoading
```

Tetapi jangan menghitung hanya berdasarkan string matching.

Trace apakah penggunaan tersebut benar-benar berasal dari:

```text
@medcal/auth/client
```

atau global AuthProvider yang sekarang.

---

# 2. Define What Counts as Authz Consumption

Hitung sebagai **AUTHZ consumer** semua code yang secara runtime membaca global authorization state.

Cari:

```text
useAuthz()
membership
capabilities
role
permission-derived selectors
```

Termasuk penggunaan seperti:

```ts
capabilities.emailRead
capabilities.emailSend
capabilities.leadRead
capabilities.chatRead
```

dan:

```ts
membership.role
membership.companyId
```

Jangan hanya mencari `useAuthz()`.

Jika component mendapatkan object Auth/Authz dari parent lalu menggunakan property authorization tersebut, trace dependency-nya.

---

# 3. Direct Consumer

Definisikan:

> **Direct consumer = component/module yang secara langsung subscribe/read terhadap Global Auth/Authz API.**

Contoh:

```ts
const { user } = useAuth();
```

atau:

```ts
const { capabilities } = useAuthz();
```

atau:

```ts
const { me } = useMe();
```

atau:

```ts
const { me } = useRequireSession();
```

Hitung **setiap file/component**, bukan setiap occurrence.

Jika satu file melakukan:

```ts
useAuth()
useAuthz()
```

itu:

> 1 Auth consumer + 1 Authz consumer

bukan 2 Auth consumers.

---

# 4. Indirect Consumer

Ini penting.

Cari component yang tidak memanggil Auth hook secara langsung tetapi menerima Auth/Authz data melalui props.

Contoh:

```text
ManagementLayout
    ↓ me
ManagementShell
    ↓ me
Header
```

Jika:

```text
Header
```

menggunakan:

```ts
me.user.name
me.capabilities.emailRead
```

maka klasifikasikan:

```text
Header
= indirect Auth consumer
= indirect Authz consumer
```

Trace minimal 2 level prop chain.

Jika prop chain lebih dalam, teruskan tracing sampai jelas.

---

# 5. Type-Only Usage

**Jangan menghitung type-only import sebagai runtime consumer.**

Contoh:

```ts
import type { Me } from "@medcal/auth/client";
```

tidak dihitung.

Tetapi jika:

```ts
import type { Me } from "@medcal/auth/client";

function Header({ me }: { me: Me }) {
  return <div>{me.user.name}</div>;
}
```

maka component tetap dihitung sebagai:

```text
INDIRECT AUTH CONSUMER
```

karena runtime component mengonsumsi data Auth.

Jadi:

> type import ≠ subscription

tetapi:

> runtime use of Auth-derived data = consumer.

---

# 6. Consumer Classification

Untuk setiap consumer, klasifikasikan:

### AUTH

Jika menggunakan:

- user
- bootstrapStatus
- isAuthenticated
- isAuthLoading
- session-derived state

### AUTHZ

Jika menggunakan:

- membership
- capabilities
- role-derived authorization
- permission-derived UX decision

### BOTH

Jika menggunakan keduanya.

Contoh:

```text
Header
→ user.name
→ capabilities.emailRead

Classification:
BOTH
```

---

# 7. Build Complete Consumer Inventory

Buat tabel:

| # | App | File | Component/Module | Auth | Authz | Direct/Indirect | Properties Consumed | Purpose |
|---|---|---|---|---|---|---|---|---|
| 1 | portal | ... | ... | YES | NO | Direct | user.id | FCM |
| 2 | portal | ... | ... | YES | YES | Direct | user + capabilities | Header |
| 3 | portal | ... | ... | NO | YES | Indirect | capabilities.emailRead | Email UI |
| ... | ... | ... | ... | ... | ... | ... | ... | ... |

Gunakan **actual code**, bukan asumsi.

---

# 8. Count by App

Hitung secara terpisah:

```text
PORTAL
AUTH direct:
AUTH indirect:
AUTH total:

AUTHZ direct:
AUTHZ indirect:
AUTHZ total:

BOTH:
```

dan:

```text
TECH-PWA
AUTH direct:
AUTH indirect:
AUTH total:

AUTHZ direct:
AUTHZ indirect:
AUTHZ total:

BOTH:
```

Jika ada app lain yang menggunakan global Auth/Authz, masukkan.

Jangan menghitung `apps/web` jika memang tidak menggunakan staff authentication.

---

# 9. Count by Hook

Hitung berapa consumer untuk masing-masing:

```text
useAuth()
useAuthz()
useMe()
useRequireSession()
```

Contoh output:

```text
useAuth:
  direct consumers: X

useAuthz:
  direct consumers: Y

useMe:
  direct consumers: Z

useRequireSession:
  direct consumers: N
```

Tetapi jangan berhenti di angka.

Identifikasi file masing-masing.

---

# 10. Count by Property

Ini lebih penting daripada sekadar jumlah hook.

Hitung consumer untuk:

### Auth

```text
user.id
user.email
user.name
bootstrapStatus
isAuthenticated
isAuthLoading
```

### Authz

```text
membership.role
membership.companyId

capabilities.leadRead
capabilities.chatRead
capabilities.emailRead
capabilities.emailSend
capabilities.emailDelete
capabilities.emailManage
```

Buat tabel:

| Property | Direct consumers | Indirect consumers | Total |
|---|---:|---:|---:|
| user.id | | | |
| user.name | | | |
| capabilities.emailRead | | | |
| ... | | | |

---

# 11. Count by Functional Domain

Ini WAJIB karena kita ingin mengetahui seberapa luas Auth/Authz menyebar ke system.

Kelompokkan consumer berdasarkan domain/module.

Gunakan domain yang **actual ada di repository**, dan jangan mengarang domain.

Contoh jika ditemukan:

```text
Management
Dashboard
Email
Users
Chat
FCM
Tech PWA
```

Buat:

| Domain | Auth | Authz | Both | Consumer Count |
|---|---:|---:|---:|---:|
| Management | | | | |
| Dashboard | | | | |
| Email | | | | |
| Users | | | | |
| FCM | | | | |
| Tech PWA | | | | |

---

# 12. Consumer Dependency Graph

Buat dependency graph aktual.

Contoh format:

```text
AuthProvider
     │
     ├── useAuth
     │     ├── Header
     │     ├── FCM
     │     └── Tech PWA
     │
     ├── useAuthz
     │     ├── Header
     │     ├── Dashboard
     │     └── Email
     │
     └── useRequireSession
           ├── Management Layout
           ├── Client Layout
           └── Email pages
```

Tetapi gunakan **actual consumer names** dari repository.

---

# 13. Shared Component Analysis

Identifikasi Auth/Authz consumers yang merupakan:

- shared component
- layout
- provider
- shell
- header
- navigation
- reusable component

Ini penting karena:

> satu shared component dapat memiliki banyak downstream consumers.

Contoh:

```text
Header
 ↓
Management pages
 ↓
many routes
```

Jangan menghitung hanya jumlah file tanpa menunjukkan dependency amplification.

---

# 14. Prop Drilling Analysis

Cari apakah Auth/Authz data masih dipassing melalui props.

Search pattern:

```text
me=
user=
membership=
capabilities=
```

Trace:

```text
source
 ↓
component A
 ↓
component B
 ↓
component C
```

Buat tabel:

| Data | Source | Prop chain | Final consumer | Depth |
|---|---|---|---|---:|
| me | layout | Layout → Shell → Header | Header | 2 |
| ... | ... | ... | ... | ... |

Tujuan:

> Mengukur apakah Global Auth/Authz memang mengurangi prop drilling atau justru masih ada duplication.

---

# 15. Route-Level Consumer Analysis

Hitung route/page yang membutuhkan Auth/Authz.

Buat:

```text
Portal routes
├── route A → Auth
├── route B → Authz
├── route C → Both
└── ...
```

Hitung:

```text
Authenticated routes:
Authz-protected UX routes:
Both:
```

Jangan menganggap semua route yang berada di authenticated layout sebagai direct Auth consumer.

Bedakan:

```text
route is protected
```

dengan:

```text
route directly consumes global Auth/Authz state
```

---

# 16. Consumer Growth Baseline

Setelah current-state inventory selesai, buat baseline:

```text
CURRENT GLOBAL AUTH/AUTHZ CONSUMER FOOTPRINT
```

Minimal:

```text
Total direct Auth consumers
Total indirect Auth consumers
Total Auth consumers

Total direct Authz consumers
Total indirect Authz consumers
Total Authz consumers

Total unique files
Total unique components
Total unique routes
Total unique domains
```

**Jangan membuat threshold recommendation.**

Belum ada decision Context vs Zustand di task ini.

---

# 17. Critical Consumer Identification

Tidak semua consumer sama pentingnya.

Klasifikasikan:

### High leverage

- root layout
- shell
- header
- navigation
- shared components
- providers
- FCM integration

### Medium leverage

- page-level consumer

### Low leverage

- isolated component

Buat tabel:

| Consumer | Leverage | Why |
|---|---|---|
| Header | HIGH | shared across many routes |
| ... | ... | ... |

---

# 18. Re-render Exposure Baseline

Karena implementation saat ini menggunakan React Context, audit:

> Berapa consumer yang berpotensi menerima context update?

Pisahkan:

```text
Auth-only
Authz-only
Both
```

Jika memungkinkan, identifikasi:

```text
Context value changes
        ↓
Potentially affected consumers
```

Jangan melakukan benchmark.

Ini hanya **dependency analysis berdasarkan code aktual**.

---

# 19. Future Roadmap Mapping

JANGAN menghitung domain bisnis sebagai current consumers jika belum ada implementation.

Namun buat mapping terpisah:

```text
CURRENT
vs
EXPECTED FUTURE CONSUMPTION
```

Gunakan roadmap:

- Send quotation
- Process PO
- Receipt & calibration result processing
- Create/post invoice
- Create/post CN
- Create/post payment
- Reporting
- CashBank
- Certification progress
- Certificate issuance

Untuk setiap domain:

```text
Domain
↓
Expected Auth consumption?
Expected Authz consumption?
Expected likely capabilities?
```

Contoh:

```text
Invoice
├── Auth: YES
├── Authz: YES
└── likely capabilities:
    invoice.read
    invoice.create
    invoice.post
```

**Jangan menambahkan property tersebut ke current state.**

Ini hanya **future consumer forecast**.

---

# 20. Important Distinction

Bedakan tiga angka:

```text
CURRENT DIRECT CONSUMERS
CURRENT INDIRECT CONSUMERS
FUTURE EXPECTED CONSUMERS
```

Jangan mencampurnya.

Contoh:

```text
Current:
12 direct Authz consumers

Future:
+ estimated consumers from Invoice
+ Payment
+ Certificate
```

Tetapi future numbers harus diberi label:

> FORECAST / NOT YET IMPLEMENTED

---

# FINAL REPORT

Struktur output:

## 1. Executive Summary

## 2. Current Auth Consumer Count

## 3. Current Authz Consumer Count

## 4. Direct Consumer Inventory

## 5. Indirect Consumer Inventory

## 6. Property-level Consumption

## 7. Domain-level Consumption

## 8. Route-level Consumption

## 9. Shared Component / High-Leverage Consumers

## 10. Prop Drilling

## 11. Context Re-render Exposure

## 12. Current Consumer Dependency Graph

## 13. Future Roadmap Consumer Forecast

## 14. Current vs Future Comparison

Gunakan:

| Metric | Current | Future Forecast |
|---|---:|---:|
| Auth consumers | | |
| Authz consumers | | |
| Shared components | | |
| Domains | | |
| Routes | | |

## 15. Raw Evidence

Untuk setiap angka penting, sertakan:

- file
- component
- hook
- property
- line/reference jika memungkinkan

---

# FINAL OUTPUT

Akhiri dengan:

```text
GLOBAL AUTH/AUTHZ CONSUMER FOOTPRINT
====================================

Current direct Auth consumers:
[X]

Current indirect Auth consumers:
[X]

Current total Auth consumers:
[X]

Current direct Authz consumers:
[X]

Current indirect Authz consumers:
[X]

Current total Authz consumers:
[X]

Unique consumer files:
[X]

Unique components:
[X]

Unique routes:
[X]

Unique domains:
[X]

High-leverage consumers:
[X]

Future forecast domains:
[X]

Future forecast Auth/Authz consumers:
[QUALITATIVE / ESTIMATE — clearly marked as forecast]

Architecture decision:
NOT PART OF THIS AUDIT

Code changes:
NONE
```

# ABSOLUTE RULES

1. **AUDIT ONLY.**
2. Do not modify code.
3. Do not install dependencies.
4. Do not refactor.
5. Do not migrate Context to Zustand.
6. Do not recommend Context or Zustand.
7. Do not create arbitrary consumer thresholds.
8. Do not count type-only imports as runtime consumers.
9. Do not count every occurrence of a hook in one file as multiple consumers.
10. Do not count protected routes as Auth consumers unless they actually consume global Auth state.
11. Distinguish direct vs indirect consumers.
12. Distinguish current implementation vs future forecast.
13. Use actual repository code as source of truth.
14. Do not invent future consumers as current consumers.
15. Do not put quotation/PO/invoice/payment/etc. into Global Auth/Authz state merely because those domains consume authorization.
16. The purpose of this audit is to produce a **factual consumption baseline** for the subsequent Context vs Zustand architecture decision.