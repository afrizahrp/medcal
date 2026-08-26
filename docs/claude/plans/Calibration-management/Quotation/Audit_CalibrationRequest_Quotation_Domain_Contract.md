# Audit: CalibrationRequest → Quotation Domain Contract

**Mode:** audit only. Tidak ada perubahan schema, migrasi, atau implementasi.

**Scope:** `CalibrationRequest`, `Quotation`, relasi, lifecycle/status, dan perilaku create / revision / acceptance quotation.

**Di luar scope:** SPK, SPKItem, Calibration Job, CalibrationResult, Calibration Work Template, technician workflow, invoice, payment, struktur LK.

**Sumber kontrak:** `docs/claude/plans/Calibration-management/Quotation/Cursor Prompt — Audit & Align CalibrationRequest → Quotation Domain Contract.md`

**Tanggal audit:** 26 Agustus 2026

---

## Kesimpulan

Implementasi **belum merepresentasikan** keputusan bisnis yang terkunci.

Yang sudah sesuai: kardinalitas schema `CalibrationRequest` 1 — N `Quotation`; tidak ada status `REVISED`; tidak ada state antara `SUBMITTED` dan quotation seperti `REVIEWED` / `READY_FOR_QUOTATION`.

Yang belum sesuai: enum status CalibrationRequest (`IN_QUOTATION` / `FULFILLED` bukan `QUOTED` / `ACCEPTED`); enum status Quotation (`APPROVED` bukan `ACCEPTED`); aturan full-scope tidak ditegakkan; seluruh modul Quotation (API, DTO, transisi status, freeze SENT, expiry, UI) belum ada.

---

## A. Current implementation

### A.1 Prisma models

Sumber: [`packages/db/prisma/schema.prisma`](../../../packages/db/prisma/schema.prisma)

#### CalibrationRequest (baris 1030–1062)

| Field | Tipe | Catatan |
|---|---|---|
| `id` | `String` | PK, cuid |
| `companyId` | `String` | required |
| `customerId` | `String` | required |
| `number` | `String` | unique per company |
| `leadId` | `String?` | optional |
| `serviceMode` | `ServiceMode` | `ON_SITE` / `SEND_TO_LAB` |
| `expectedDate` | `DateTime?` | canonical scheduling field |
| `desiredScheduleNote` | `String?` | deprecated |
| `status` | `CalibrationRequestStatus` | default `DRAFT` |
| `notes` | `String?` | optional |
| `items` | `CalibrationRequestItem[]` | 1:N |
| `quotations` | `Quotation[]` | 1:N |

Constraint: `@@unique([companyId, number])`, `@@index([companyId, status])`, `@@index([customerId])`.

#### CalibrationRequestItem (baris 1064–1080)

| Field | Tipe | Catatan |
|---|---|---|
| `requestId` | `String` | FK ke CalibrationRequest, cascade delete |
| `deviceTypeId` | `String` | FK ke DeviceType |
| `deviceId` | `String` | free-text identifier, bukan FK ke Device |
| `quotationItems` | `QuotationItem[]` | 1:N ke line quotation |

Tidak ada unique pada item. Satu request item boleh direferensikan banyak `QuotationItem`.

#### Quotation (baris 1104–1136)

| Field | Tipe | Catatan |
|---|---|---|
| `number` | `String` | unique per company |
| `requestId` | `String?` | **nullable** FK ke CalibrationRequest |
| `source` | `QuotationSource` | default `PORTAL`; nilai: `PORTAL`, `PHONE`, `WHATSAPP`, `OTHER` |
| `status` | `QuotationStatus` | default `DRAFT` |
| `validUntil` | `DateTime?` | ada di schema, tidak dibaca kode aplikasi |
| `subtotal` / `taxAmount` / `totalAmount` | `Decimal` | field komersial |
| `approvedAt` | `DateTime?` | timestamp approval |
| `approvedByUserId` | `String?` | user internal |
| `customerApprovedAt` | `DateTime?` | timestamp penerimaan customer |

Tidak ada unique pada `requestId`. Relasi schema = **satu CalibrationRequest ke banyak Quotation**.

FK migrasi init (`packages/db/prisma/migrations/20260813063336_init_better_auth_fcmtoken/migration.sql` baris 876):

```sql
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "CalibrationRequest"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
```

Akibat: quotation boleh exist tanpa request; jika CalibrationRequest dihapus, `requestId` menjadi `NULL`. Tidak ada `@@index([requestId])` pada model Quotation.

#### QuotationItem (baris 1138–1158)

| Field | Tipe | Catatan |
|---|---|---|
| `requestItemId` | `String?` | **optional** FK ke CalibrationRequestItem |
| `deviceId` | `String?` | optional FK ke master Device |
| `tariffId` | `String?` | optional FK ke ServiceTariff |
| `qty` / `unitPrice` / `lineTotal` | `Decimal` | line komersial |

Tidak ada unique `(quotationId, requestItemId)`. Tidak ada constraint DB bahwa setiap `CalibrationRequestItem` harus tercakup oleh quotation.

### A.2 Enums

```106:128:packages/db/prisma/schema.prisma
enum CalibrationRequestStatus {
  DRAFT
  SUBMITTED
  IN_QUOTATION
  CANCELLED
  FULFILLED
}

enum QuotationSource {
  PORTAL
  PHONE
  WHATSAPP
  OTHER
}

enum QuotationStatus {
  DRAFT
  SENT
  APPROVED
  REJECTED
  EXPIRED
  CANCELLED
}
```

Nilai enum ini identik sejak migrasi init. Tidak ada `QUOTED`, `ACCEPTED` (pada CR maupun Quotation), dan tidak ada `REVISED`.

Shared Zod mirror enum CR yang sama:

```287:293:packages/shared/src/schemas/index.ts
const calibrationRequestStatusValues = [
  "DRAFT",
  "SUBMITTED",
  "IN_QUOTATION",
  "CANCELLED",
  "FULFILLED",
] as const;
```

Tidak ada Zod schema Quotation di `packages/shared`.

### A.3 Backend CalibrationRequest

File: [`apps/api/src/modules/calibration-requests/calibration-requests.service.ts`](../../../apps/api/src/modules/calibration-requests/calibration-requests.service.ts)

Transisi yang **benar-benar dijalankan**:

```text
create → DRAFT
DRAFT → SUBMITTED          (POST /calibration-requests/:id/submit)
any kecuali CANCELLED/FULFILLED → CANCELLED
```

Aturan yang ditegakkan:

- Update hanya saat `DRAFT` (`INVALID_STATUS_FOR_UPDATE`)
- Submit hanya dari `DRAFT` (`INVALID_STATUS_FOR_SUBMIT`)
- Cancel ditolak jika sudah `CANCELLED` atau `FULFILLED`
- Minimal 1 item saat create/update
- Nomor dokumen via `DocumentNumberService` (prefix `CRQ`)

`IN_QUOTATION` **tidak pernah di-set**. Hanya komentar TODO:

```294:296:apps/api/src/modules/calibration-requests/calibration-requests.service.ts
    // TODO: Status transition to IN_QUOTATION will be triggered from the
    // Quotation module when it's implemented. This module only handles
    // DRAFT -> SUBMITTED and any status -> CANCELLED transitions.
```

`FULFILLED` juga tidak pernah di-set; hanya dipakai untuk memblokir cancel.

Tes: [`apps/api/src/modules/calibration-requests/calibration-requests.service.test.ts`](../../../apps/api/src/modules/calibration-requests/calibration-requests.service.test.ts) — mencakup create DRAFT, update DRAFT, reject update non-DRAFT, cancel DRAFT/SUBMITTED, submit DRAFT. Tidak ada tes transisi quotation.

### A.4 Backend Quotation

**Tidak ada.**

- Tidak ada folder `apps/api/src/modules/quotations/`
- `AppModule` tidak mengimpor modul quotation
- Tidak ada create / send / accept / reject / expire / revise
- Tidak ada kode yang mengubah status CalibrationRequest saat quotation dibuat atau diterima
- `validUntil` tidak dibaca di file `*.ts` aplikasi
- Tidak ada cron / scheduler untuk expiry quotation

Infrastruktur yang sudah ada tetapi belum dipakai alur quotation:

| Artefak | Lokasi | Status |
|---|---|---|
| Prefix `QUO` | `packages/db/src/document-number/document-type-prefix.ts` | siap, unused oleh service quotation |
| Mapping tabel `QUOTATION → "Quotation"` | `packages/db/src/document-number/document-type-table.ts` | siap |
| ACL resource `quotation` | `packages/auth/src/access-control.ts` baris 83: `read, create, update, cancel, approve` | catalog only |
| Seed permission quotation | `packages/db/prisma/seed-role-permissions.ts` | **tidak di-seed**; ADMIN hanya `calibrationRequest` |

Referensi kode lain ke Quotation: `devices.service.ts` menghitung `quotationItem` saat cek delete device — bukan lifecycle quotation.

### A.5 Frontend

Hanya `apps/portal` yang punya UI CalibrationRequest. Tidak ada UI Quotation di portal, web, atau tech-pwa.

File portal:

- `apps/portal/src/app/management/calibration-requests/calibration-requests-ui.tsx` — types, label, badge, filter
- `apps/portal/src/app/management/calibration-requests/calibration-requests-page-client.tsx` — list + filter
- `apps/portal/src/app/management/calibration-requests/use-calibration-requests-query.ts` — hooks API CR saja
- `apps/portal/src/app/management/calibration-requests/new/page.tsx` — create, selalu kirim seluruh items
- `apps/portal/src/app/management/calibration-requests/[id]/page.tsx` — detail, submit, cancel
- `apps/portal/src/app/management/calibration-requests/[id]/edit/page.tsx` — edit hanya DRAFT

Asumsi UI:

- Status yang ditampilkan: `DRAFT`, `SUBMITTED`, `IN_QUOTATION`, `CANCELLED`, `FULFILLED`
- Label `IN_QUOTATION` = "In Quotation", `FULFILLED` = "Fulfilled"
- Edit/submit hanya saat `DRAFT`; selain itu read-only
- Cancel diizinkan kecuali `CANCELLED` / `FULFILLED`
- `isSubmitted` dideklarasikan di detail page tetapi **tidak dipakai** — tidak ada aksi “buat quotation”
- Type `CalibrationRequestRow` tidak punya field `quotations`
- Menu seed hanya Calibration Request (`seed-menu.ts`); tidak ada menu Quotation

### A.6 Lifecycle aktual vs kontrak

```text
Implementasi CalibrationRequest:
  DRAFT --submit--> SUBMITTED
  DRAFT --cancel--> CANCELLED
  SUBMITTED --cancel--> CANCELLED
  SUBMITTED -.-> TODO -.-> IN_QUOTATION   (tidak dijalankan)
  FULFILLED                                (tidak pernah di-set)

Kontrak terkunci CalibrationRequest:
  SUBMITTED --quotation pertama dibuat--> QUOTED
  QUOTED --satu quotation ACCEPTED--> ACCEPTED

Quotation:
  Schema: DRAFT, SENT, APPROVED, REJECTED, EXPIRED, CANCELLED
  Service/UI: tidak ada
```

---

## B. Locked business contract

Ringkasan keputusan yang **terkunci** (bukan usulan desain baru).

### Relasi

```text
CalibrationRequest 1 ──────< N Quotation
```

Satu request boleh punya banyak quotation (contoh: Q-001, Q-002, Q-003 di bawah CR-001).

### Full scope

Satu quotation merepresentasikan **seluruh scope** CalibrationRequest-nya. Bukan subset item.

Jika hanya sebagian item yang perlu jadi permintaan komersial terpisah:

```text
CalibrationRequest lama
        ↓
CalibrationRequest baru dengan scope baru/subset
        ↓
Quotation baru
```

Jangan modelkan beberapa quotation di bawah request yang sama yang masing-masing berisi subset item berbeda secara arbitrer.

### Lifecycle CalibrationRequest

```text
SUBMITTED
    ↓
QUOTED
    ↓
ACCEPTED
```

- **SUBMITTED** — customer sudah submit; siap masuk proses quotation; quotation boleh dibuat langsung. Tidak ada state antara seperti `REVIEWED`, `READY_FOR_QUOTATION`, `APPROVED_FOR_QUOTATION`.
- **QUOTED** — minimal satu quotation sudah dibuat. Bukan berarti customer sudah menerima. Request boleh tetap `QUOTED` sementara quotation-nya ditolak, expired, atau diganti quotation baru.
- **ACCEPTED** — salah satu quotation terkait diterima. Request tidak perlu mirror status setiap quotation. Cukup satu quotation accepted.

### Lifecycle Quotation

```text
DRAFT
   ↓
SENT
   ├── ACCEPTED
   ├── REJECTED
   └── EXPIRED
```

- **DRAFT** — belum dikirim; masih boleh diedit.
- **SENT** — sudah ditawarkan; konten komersial diperlakukan historis/beku. Jangan mutate diam-diam.
- **ACCEPTED** — customer menerima quotation ini; CalibrationRequest menjadi `ACCEPTED`.
- **REJECTED** — penolakan eksplisit customer. Request **tidak** otomatis rejected; tetap `QUOTED`; quotation lain boleh dibuat.
- **EXPIRED** — masa berlaku habis tanpa diterima. Berbeda dari `REJECTED`.

### Revisi

Tidak ada status `REVISED`. Revisi komersial setelah SENT:

```text
Q-001 SENT
   ↓
customer minta perubahan
   ↓
Q-002 DRAFT / SENT   (request yang sama)
```

Jangan edit Q-001 sehingga makna komersial historisnya hilang.

### Batas komersial vs scope

- Perubahan **komersial** → quotation baru, CalibrationRequest yang sama.
- Perubahan **scope request** secara material → CalibrationRequest baru, lalu quotation baru.

---

## C. Mismatch matrix

Klasifikasi:

- **MATCH** — implementasi sudah sesuai
- **MISMATCH** — implementasi melanggar aturan terkunci
- **GAP** — aturan belum ditegakkan / belum ada
- **UNUSED/LEGACY** — konsep existing tidak diperlukan oleh kontrak terkunci
- **UNKNOWN** — tidak bisa ditentukan dari kode

| Area | Current Implementation | Expected Contract | Status | Evidence |
|---|---|---|---|---|
| Relasi CR–Quotation | 1:N; `requestId` nullable; tidak ada unique pada `requestId` | CR 1 — N Quotation | **MATCH** (kardinalitas) + **GAP** (`requestId` opsional) | `schema.prisma` 1057, 1109, 1126; migration FK `ON DELETE SET NULL` |
| Banyak quotation per request | Schema mengizinkan; tidak ada service | Banyak Q di bawah satu CR; revisi = Q baru | **MATCH** (schema) / **GAP** (logic) | `quotations Quotation[]` |
| Full-scope items | `requestItemId` opsional; tidak ada coverage constraint | Quotation = seluruh item request; bukan subset | **GAP** | `schema.prisma` 1143, 1153 |
| CR status enum | `DRAFT`, `SUBMITTED`, `IN_QUOTATION`, `CANCELLED`, `FULFILLED` | `SUBMITTED`, `QUOTED`, `ACCEPTED` | **MISMATCH** (nama + makna) + **UNUSED/LEGACY** (`IN_QUOTATION` tidak pernah di-set) | `schema.prisma` 106–112; `packages/shared` 287–293; portal UI 22–27 |
| CR `DRAFT` | Default create; edit hanya DRAFT | Tidak ada di lifecycle komersial terkunci | **UNUSED/LEGACY** relatif ke kontrak komersial; aktif sebagai working state | `schema` default DRAFT; `service.ts` create/update/submit |
| CR `SUBMITTED` | Ada; `DRAFT → SUBMITTED` dijalankan | Customer sudah submit; quotation boleh langsung dibuat | **MATCH** | `service.ts` 305–327 |
| CR `QUOTED` | Tidak ada; TODO ke `IN_QUOTATION` | Set saat quotation pertama dibuat | **GAP** + **MISMATCH** (`IN_QUOTATION` ≠ `QUOTED`) | `service.ts` 294–296 |
| CR `ACCEPTED` | Tidak ada; `FULFILLED` ada tapi tidak pernah di-set | Set saat satu quotation `ACCEPTED` | **GAP** + **MISMATCH** (`FULFILLED` ≠ `ACCEPTED`) | `schema` 111; `service.ts` 287–292 |
| CR `CANCELLED` | Ada; cancel dari DRAFT/SUBMITTED | Tidak ada di lifecycle terkunci | **UNUSED/LEGACY** relatif ke kontrak (tetap dipakai operasional) | `service.ts` 280–302; tes cancel |
| CR `FULFILLED` | Ada di enum/UI; tidak pernah di-set | Bukan `ACCEPTED`; tidak ada di kontrak ini | **UNUSED/LEGACY** / **MISMATCH** jika dianggap pengganti ACCEPTED | `schema` 111; portal badge FULFILLED |
| Tidak ada `REVIEWED` / `READY_FOR_QUOTATION` / `APPROVED_FOR_QUOTATION` | Tidak ada | Jangan diperkenalkan | **MATCH** | grep codebase = 0 |
| Quotation status enum | `DRAFT`, `SENT`, `APPROVED`, `REJECTED`, `EXPIRED`, `CANCELLED` | `DRAFT`, `SENT`, `ACCEPTED`, `REJECTED`, `EXPIRED` | **MISMATCH** (`APPROVED` vs `ACCEPTED`) + **UNUSED/LEGACY** (`CANCELLED`) | `schema.prisma` 121–128 |
| Quotation `DRAFT` / `SENT` / `REJECTED` / `EXPIRED` | Ada di schema | Ada | **MATCH** (schema) / **GAP** (tidak ada service) | `schema` 122–126 |
| Quotation `ACCEPTED` | `APPROVED` + `approvedAt` / `approvedByUserId` / `customerApprovedAt` | `ACCEPTED` = customer menerima | **MISMATCH** (nama) + **UNUSED/LEGACY** (dual approval internal vs customer) | `schema` 124, 1118–1120; ACL action `approve` |
| Tidak ada `REVISED` | Tidak ada status/field chain revisi | Jangan diperkenalkan; revisi = record baru | **MATCH** | `QuotationStatus` tanpa `REVISED`; tidak ada `parentQuotationId` |
| Create / send / accept / reject / revise | Tidak ada modul API/UI | Alur penuh sesuai lifecycle | **GAP** | tidak ada `apps/api/src/modules/quotations/`; `AppModule` tanpa Quotation |
| SENT commercially frozen | Tidak ada guard | Jangan mutate makna komersial quotation SENT | **GAP** | tidak ada service quotation |
| CR tidak mirror setiap status quotation | CR tidak ikut REJECTED/EXPIRED | Request tetap `QUOTED` jika Q ditolak/expired | **MATCH** (belum ada mirroring) — belum teruji karena modul belum ada | CR service hanya DRAFT/SUBMITTED/CANCELLED |
| Expiry | Field `validUntil`; tidak ada job/pembaca | `EXPIRED` ≠ `REJECTED`; validity habis tanpa accept | **GAP** | `schema` 1112; grep `validUntil` di `*.ts` aplikasi = 0 |
| DTO / API / frontend | CR saja; label `IN_QUOTATION` / `FULFILLED` | Kontrak `QUOTED` / `ACCEPTED` + quotation lifecycle | **GAP** (quotation) + **MISMATCH** (label status CR) | `packages/shared` 286–341; `calibration-requests-ui.tsx` 22–90 |
| Constraint DB full-scope | Tidak ada | Full-scope wajib | **GAP** | tidak ada unique/coverage |
| Unik satu quotation ACCEPTED per CR | Tidak ada | Kontrak tidak menyatakan unique constraint | **UNKNOWN** | tidak ada `@@unique` accepted-per-request |
| Permission quotation | Catalog ada (`approve`); tidak di-seed; tidak ada menu | Dibutuhkan saat modul dibangun | **GAP** | `access-control.ts` 83; `seed-role-permissions.ts` 47–50 |
| Document numbering `QUO` | Prefix siap | Dipakai saat create quotation | **GAP** (unused) | `document-type-prefix.ts` 7 |
| `QuotationSource` | Ada di schema | Tidak ada di kontrak lifecycle | **UNUSED/LEGACY** relatif ke kontrak; metadata source | `schema` 114–119, 1110 |
| Index `Quotation.requestId` | Tidak ada | Bukan syarat kontrak; relevan untuk list Q per CR | **GAP** (infrastruktur, bukan pelanggaran domain) | `schema` Quotation indexes 1132–1135 |

---

## D. Recommended changes

Hanya perubahan yang **benar-benar diperlukan** agar implementasi sesuai kontrak. Belum diimplementasi. Bukan desain ulang SPK / job / invoice / payment.

### D.1 Align enum (wajib sebelum/saat modul Quotation)

1. **CalibrationRequestStatus**
   - Ganti `IN_QUOTATION` → `QUOTED`.
   - Tambah `ACCEPTED`.
   - Jangan tambah `REVIEWED`, `READY_FOR_QUOTATION`, `APPROVED_FOR_QUOTATION`.
   - Jangan hapus `DRAFT` / `CANCELLED` / `FULFILLED` pada langkah ini — lihat open questions.

2. **QuotationStatus**
   - Ganti `APPROVED` → `ACCEPTED`.
   - Jangan tambah `REVISED`.
   - Jangan hapus `CANCELLED` pada langkah ini — lihat open questions.

3. **Ikuti enum** di:
   - `packages/shared/src/schemas/index.ts`
   - `calibration-requests.service.ts` + tes
   - label / filter / type portal (`calibration-requests-ui.tsx` dan halaman terkait)

### D.2 Saat modul Quotation dibangun

4. Create quotation di bawah CR yang sama (1:N). Copy **semua** item request; tolak subset.
5. Quotation pertama yang dibuat → CR `SUBMITTED` → `QUOTED`.
6. Quotation `ACCEPTED` → CR `QUOTED` → `ACCEPTED`.
7. Reject / expire quotation **tidak** mengubah CR menjadi rejected; CR tetap `QUOTED` selama belum ada yang accepted.
8. Revisi setelah SENT = quotation baru (`DRAFT` / `SENT`) pada request yang sama; jangan mutate Q lama.
9. Guard: konten komersial SENT tidak diedit diam-diam.
10. Sediakan jalur ke `EXPIRED` (job atau evaluasi `validUntil`); bedakan dari `REJECTED`.
11. Jangan modelkan beberapa quotation di satu CR yang masing-masing berisi subset item berbeda.

### D.3 ACL / permission (saat modul dibangun)

12. Action catalog `approve` tidak selaras dengan status `ACCEPTED`. Sesuaikan penamaan/aksi saat modul dibangun.
13. Seed permission quotation ke role yang relevan; tambah menu jika UI portal dibangun.

### D.4 Tidak direkomendasikan sekarang

Jangan pada tahap ini:

- Menghapus `DRAFT` / `CANCELLED` / `FULFILLED` pada CalibrationRequest
- Menghapus `CANCELLED` pada Quotation
- Mewajibkan `requestId` NOT NULL
- Menghapus `approvedAt` / `approvedByUserId` / `customerApprovedAt`
- Mengimplementasikan SPK, CalibrationResult, technician workflow, atau LK
- Menambah unique “satu ACCEPTED per CR” tanpa keputusan bisnis (open question)

---

## E. Open questions

Hanya pertanyaan yang perlu untuk kontrak `CalibrationRequest → Quotation`. Bukan pertanyaan tentang SPK, CalibrationResult, technician workflow, atau LK.

1. **DRAFT pada CalibrationRequest** dipakai sebagai working state sebelum `SUBMITTED`. Kontrak terkunci mulai dari `SUBMITTED`. Apakah `DRAFT` tetap dipertahankan?

2. **CANCELLED pada CalibrationRequest** tidak ada di lifecycle terkunci, tetapi sudah diimplementasi (API + UI + tes). Tetap sebagai status operasional?

3. **FULFILLED pada CalibrationRequest** tidak pernah di-set dan bukan `ACCEPTED`. Apakah ini status pasca-komersial di luar kontrak ini, atau harus dihapus dari enum CR?

4. **Quotation `requestId` nullable** + `QuotationSource` (`PHONE` / `WHATSAPP` / `OTHER`): apakah quotation berdiri sendiri masih diizinkan, atau setiap quotation wajib terikat ke CalibrationRequest?

5. **Dual approval** (`approvedAt` / `approvedByUserId` vs `customerApprovedAt`): kontrak hanya “customer accepts”. Apakah approval internal dihapus, atau tetap sebagai metadata di luar status?

6. **Quotation `CANCELLED`**: tidak ada di lifecycle terkunci. Tetap sebagai status operasional (misalnya ditarik sebelum/sesudah SENT)?

7. **Paling banyak satu quotation `ACCEPTED` per CalibrationRequest** — kontrak tidak menyatakan unique constraint. Perlu ditegakkan di DB/service?

8. **Bolehkah quotation baru dibuat setelah CalibrationRequest sudah `ACCEPTED`?** Kontrak tidak menyatakan.

---

## Lampiran: file yang diaudit

| Layer | Path |
|---|---|
| Schema | `packages/db/prisma/schema.prisma` |
| Migrasi init | `packages/db/prisma/migrations/20260813063336_init_better_auth_fcmtoken/migration.sql` |
| Shared Zod | `packages/shared/src/schemas/index.ts` |
| CR service | `apps/api/src/modules/calibration-requests/calibration-requests.service.ts` |
| CR tests | `apps/api/src/modules/calibration-requests/calibration-requests.service.test.ts` |
| CR controller | `apps/api/src/modules/calibration-requests/calibration-requests.controller.ts` |
| App module | `apps/api/src/app.module.ts` |
| ACL | `packages/auth/src/access-control.ts` |
| Seed permission | `packages/db/prisma/seed-role-permissions.ts` |
| Seed menu | `packages/db/prisma/seed-menu.ts` |
| Document prefix | `packages/db/src/document-number/document-type-prefix.ts` |
| Portal UI | `apps/portal/src/app/management/calibration-requests/*` |

Tidak ditemukan: `apps/api/src/modules/quotations/`, schema Zod Quotation, route/menu/hook frontend Quotation.
