# Consumer Footprint Audit — Global Auth & Authz State

**Tanggal:** 2026-08-23  
**Mode:** Audit only — tidak ada perubahan kode  
**Source of truth:** Repository code aktual  
**Tujuan:** Baseline faktual consumption footprint untuk input decision-grade Context vs Zustand

**Referensi:** [Audit Report](./Audit%20Report%20—%20Global%20Auth%20&%20Authz%20State.md) · [Implementation Report](./Implementation%20Report%20—%20Global%20Auth%20&%20Authz%20State.md) · [Forensic Verification Report](./Forensic%20Verification%20Report%20—%20Global%20Auth%20&%20Authz%20Implementation.md)

---

## 1. Executive Summary

Global Auth/Authz saat ini **terbatas dan terpusat**:

- **9 komponen direct subscriber** (memanggil hook dari `@medcal/auth/client`)
- **3 komponen indirect** (membaca data auth/authz via props)
- **9 file unik** dengan runtime consumption
- **`useAuthz()` dan `useMe()` = 0 consumer**
- **`apps/web` tidak memakai** staff global auth
- Sebagian besar route management **hanya protected via layout**, tanpa hook di page level
- **Amplifikasi tinggi:** `ManagementLayout` → `ManagementShell` → `ManagementHeader` menutupi **~16+ route** management

Footprint **current** kecil, tetapi shared components (layout, header) sudah menjadi dependency hub.

---

## 2. Current Auth Consumer Count

### Portal

| Metrik | Jumlah |
|---|---:|
| AUTH direct | 7 |
| AUTH indirect | 3 |
| AUTH total (unique components) | 8 |

### Tech PWA

| Metrik | Jumlah |
|---|---:|
| AUTH direct | 2 |
| AUTH indirect | 0 |
| AUTH total | 2 |

### Gabungan (current)

| Metrik | Jumlah |
|---|---:|
| Current direct Auth consumers | **9** |
| Current indirect Auth consumers | **3** |
| Current total Auth consumers | **10** |

---

## 3. Current Authz Consumer Count

### Portal

| Metrik | Jumlah |
|---|---:|
| AUTHZ direct (via `useAuthz()`) | **0** |
| AUTHZ direct (via `useRequireSession` → `me.capabilities`) | **6** |
| AUTHZ indirect | **3** |
| AUTHZ total (unique components) | **8** |

### Tech PWA

| Metrik | Jumlah |
|---|---:|
| AUTHZ direct | **1** |
| AUTHZ indirect | **0** |
| AUTHZ total | **1** |

### Gabungan (current)

| Metrik | Jumlah |
|---|---:|
| Current direct Authz consumers | **7** |
| Current indirect Authz consumers | **3** |
| Current total Authz consumers | **9** |

---

## 4. Direct Consumer Inventory

| # | App | File | Component | Auth | Authz | Hook | Properties | Purpose |
|---|---|---|---|:---:|:---:|---|---|---|
| 1 | portal | `app/management/layout.tsx` | `ManagementLayout` | ✓ | ✓ | `useRequireSession` | `status`, `me` (gate) | Auth gate, pass `me` ke shell |
| 2 | portal | `app/client/layout.tsx` | `ClientLayout` | ✓ | ✓ | `useRequireSession` | `status`, `user.email`, `membership.role` | Customer portal gate + header |
| 3 | portal | `app/management/page.tsx` | `ManagementHome` | ✓ | ✓ | `useRequireSession` | `user.name`, `capabilities.*` | Dashboard shortcuts |
| 4 | portal | `app/management/email/email-page-client.tsx` | `EmailFolderPageClient` | ✓ | ✓ | `useRequireSession` | `status`, `capabilities.email*` | Email folder UX gate |
| 5 | portal | `app/management/email/[id]/page.tsx` | Email detail client | ✓ | ✓ | `useRequireSession` | `status`, `capabilities.email*` | Email detail actions |
| 6 | portal | `app/management/email/compose/compose-page-client.tsx` | `EmailComposePageClient` | ✓ | ✓ | `useRequireSession` | `status`, `capabilities.emailSend` | Compose gate |
| 7 | portal | `components/management/header-controls.tsx` | `PushNotificationsMenuItem` | ✓ | — | `useAuth` | `user.id`, `isAuthenticated` | FCM registration |
| 8 | tech-pwa | `app/page.tsx` | `PushNotificationsControl` | ✓ | — | `useAuth` | `user.id`, `isAuthenticated` | FCM registration |
| 9 | tech-pwa | `app/page.tsx` | `TechHome` | ✓ | ✓ | `useRequireSession` | `status`, `user.email`, `membership.role` | Home gate + header |

**Tidak dihitung sebagai consumer:**

- `AuthProvider` / `PortalAuthProvider` / tech-pwa `Providers` — source/mount, bukan reader
- `sign-in`, `sign-out`, `useSession` saja — Better Auth API, bukan global auth/authz context
- `import type { Me }` saja tanpa runtime read — type-only

---

## 5. Indirect Consumer Inventory

| # | App | File | Component | Auth | Authz | Prop chain | Properties | Purpose |
|---|---|---|---|:---:|:---:|---|---|---|
| 1 | portal | `components/management/management-shell.tsx` | `ManagementShell` | — | — | Passthrough `me` only | *(none read)* | **Bukan consumer** (forward prop saja) |
| 2 | portal | `components/management/header.tsx` | `ManagementHeader` | ✓ | ✓ | Layout → Shell → Header | `user.name/email`, `membership.role`, `capabilities.*` | Header shortcuts + user display |
| 3 | portal | `components/management/header-controls.tsx` | `NotificationControls` | — | ✓ | Header → booleans | `leadRead/chatRead/emailRead` (derived) | Show/hide notification icons |
| 4 | portal | `components/management/header-controls.tsx` | `UserMenu` | ✓ | ✓ | Header → strings | `name`, `email`, `role` | User menu display |

---

## 6. Property-level Consumption

| Property | Direct | Indirect | Total |
|---|---:|---:|---:|
| `user.id` | 2 | 0 | 2 |
| `user.email` | 2 | 1 | 3 |
| `user.name` | 1 | 1 | 2 |
| `bootstrapStatus` / `status` | 6 | 0 | 6 |
| `isAuthenticated` | 2 | 0 | 2 |
| `isAuthLoading` | 0 | 0 | 0 |
| `membership.role` | 2 | 2 | 4 |
| `membership.companyId` | 0 | 0 | 0 |
| `capabilities.leadRead` | 1 | 1 | 2 |
| `capabilities.chatRead` | 1 | 1 | 2 |
| `capabilities.emailRead` | 3 | 1 | 4 |
| `capabilities.emailSend` | 3 | 0 | 3 |
| `capabilities.emailDelete` | 2 | 0 | 2 |
| `capabilities.emailManage` | 1 | 0 | 1 |

---

## 7. Domain-level Consumption (current)

| Domain | Auth | Authz | Both | Consumer count |
|---|---:|---:|---:|---:|
| Management layout | 1 | 1 | 1 | 1 |
| Client portal layout | 1 | 1 | 1 | 1 |
| Dashboard | 1 | 1 | 1 | 1 |
| Email | 3 | 3 | 3 | 3 |
| Header / shell UI | 2 | 3 | 2 | 4 |
| FCM | 2 | 0 | 0 | 2 |
| Tech PWA home | 2 | 1 | 1 | 2 |
| Leads, Chat, Users, Permission, Menu, Whitelist | 0 | 0 | 0 | 0 |

Leads/Chat/Users admin memakai API `/users/:id` atau server nav — **bukan** global authz store.

---

## 8. Route-level Consumption (current)

### Portal Management (~20 routes)

| Kategori | Count | Catatan |
|---|---:|---|
| Authenticated via layout | ~20 | `ManagementLayout` |
| Direct hook on page | 4 | dashboard + 3 email client modules |
| Authz UX-gated (capabilities) | 4 | same |
| Protected-only (no page hook) | ~16 | leads, chat, users, dll. |

### Portal Client

| Route | Consumption |
|---|---|
| `/client` | Both — via `ClientLayout` |

### Tech PWA

| Route | Consumption |
|---|---|
| `/` | Both — `TechHome` + FCM |
| `/sign-in` | Bukan global auth consumer |

---

## 9. Shared Component / High-Leverage Consumers

| Consumer | Leverage | Why |
|---|---|---|
| `ManagementLayout` | HIGH | Root gate ~20 management routes |
| `ClientLayout` | HIGH | Root gate customer portal |
| `ManagementHeader` | HIGH | Shared semua management routes |
| `NotificationControls` | HIGH | Shortcut visibility di header |
| `UserMenu` | HIGH | User identity display |
| `PushNotificationsMenuItem` | HIGH | FCM di setiap management session |

**High-leverage count: 6**

```text
ManagementLayout (useRequireSession)
    └── ManagementShell (passthrough)
            └── ManagementHeader (indirect BOTH)
                    ├── NotificationControls (indirect AUTHZ)
                    └── UserMenu (indirect BOTH)
                            └── PushNotificationsMenuItem (direct AUTH)
```

---

## 10. Prop Drilling

| Data | Source | Prop chain | Final consumer | Depth |
|---|---|---|---|---:|
| `me` (full) | `ManagementLayout` | Layout → Shell → Header | `ManagementHeader` | 2 |
| `capabilities.*` (booleans) | `ManagementHeader` | Header → `NotificationControls` | `NotificationControls` | 1 |
| `user.name/email`, `role` | `ManagementHeader` | Header → `UserMenu` | `UserMenu` | 1 |

Global store **mengurangi duplicate fetch**, belum eliminasi prop drilling di header subtree.

---

## 11. Context Re-render Exposure

Semua direct hook → `useAuthContext()` → subscribe **full context value**.

| Category | Components |
|---|---:|
| Auth-only direct | 2 (FCM) |
| Both direct | 7 (`useRequireSession` + TechHome) |
| Indirect (via props) | 3 |

**Total direct context subscribers: 9**

---

## 12. Current Consumer Dependency Graph

```text
AuthProvider (source — not consumer)
│
├── useRequireSession (7 components)
│     ├── ManagementLayout → Shell → Header → NotificationControls / UserMenu
│     ├── ClientLayout
│     ├── ManagementHome
│     ├── EmailFolderPageClient
│     ├── EmailDetailPage
│     ├── EmailComposePageClient
│     └── TechHome
│
└── useAuth (2 components — FCM)
      ├── PushNotificationsMenuItem
      └── PushNotificationsControl

useAuthz() → 0 consumers
useMe()    → 0 consumers
```

---

## 13. Planned Roadmap Consumer Mapping

**PLANNED / NOT YET IMPLEMENTED** — domain operasional dari roadmap produk ([`docs/cursor/business-domain.md`](../../domain-decisions/business-domain.md)), bukan consumption aktual.

| Planned domain | Auth? | Authz? | Likely pattern |
|---|---|---|---|
| Send quotation | YES | YES | Page UX gate + API `CompanyRoleGuard` |
| Process PO | YES | YES | Same |
| Receipt & calibration result | YES | YES | Same |
| Create/post invoice | YES | YES | `invoice.read/create/post` capabilities |
| Create/post credit note | YES | YES | `cn.read/create/post` |
| Create/post payment | YES | YES | `payment.read/create/post` |
| Reporting | YES | YES | `report.read` |
| CashBank | YES | YES | `cashbank.read/manage` |
| Certification progress | YES | YES | Role/permission filtered views |
| Certificate issuance | YES | YES | `certificate.read/issue` |

**Perkiraan planned footprint:** setiap domain operasional = **1–3 page-level Auth/Authz consumers** + reuse header/nav. Total planned **+15–30 components** across portal + tech-pwa bila diimplementasi serupa modul Email.

---

## 14. Current vs Planned Comparison

| Metric | Current | Planned (not implemented) |
|---|---:|---:|
| Auth consumers (components) | 10 | +10–15 (estimate) |
| Authz consumers (components) | 9 | +15–25 (estimate) |
| Shared high-leverage components | 6 | +2–4 |
| Domains with consumption | 5 | +10 planned domains |
| Routes with direct hook | 5 | +15–25 (estimate) |
| Unique consumer files | 9 | +15–20 (estimate) |

---

## 15. Hook Counts (raw evidence)

```text
useAuth():
  2 components — header-controls (FCM), tech-pwa/page (FCM)

useAuthz():
  0 consumers

useMe():
  0 consumers

useRequireSession():
  7 components — 6 portal + 1 tech-pwa (TechHome)
```

---

## 16. Important Distinction

```text
CURRENT DIRECT CONSUMERS     → implemented, verified in code
CURRENT INDIRECT CONSUMERS   → implemented, verified in code
PLANNED CONSUMERS            → roadmap domains, NOT in codebase yet
```

Jangan mencampur angka **current** dengan **planned**.

---

```text
GLOBAL AUTH/AUTHZ CONSUMER FOOTPRINT
====================================

Current direct Auth consumers:
9

Current indirect Auth consumers:
3

Current total Auth consumers:
10

Current direct Authz consumers:
7

Current indirect Authz consumers:
3

Current total Authz consumers:
9

Unique consumer files:
9

Unique components:
12

Unique routes (direct hook):
5

Unique domains (current):
5

High-leverage consumers:
6

Planned domains:
10

Planned Auth/Authz consumers:
QUALITATIVE ESTIMATE +15–30 components when planned operational domains land (PLANNED — NOT YET IMPLEMENTED)

Architecture decision:
NOT PART OF THIS AUDIT

Code changes:
NONE
```
