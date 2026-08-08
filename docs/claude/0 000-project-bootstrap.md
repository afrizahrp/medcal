# ADR-000: Project Bootstrap — Domain & Lead Assignment Decisions

**Status:** Accepted
**Date:** 2026-08-01
**Context:** medcal (CBMS — Calibration Business Management System)
**Related doc:** `business-domain.md` (status: *Aligned with ADR-000*)

---

## Context

Sebelum scaffolding monorepo `medcal` dimulai (Fase 0), beberapa keputusan
domain-level perlu dikunci karena berdampak langsung ke schema database dan
mahal untuk diubah setelah data mulai mengalir. Keputusan ini muncul dari
proses validasi `business-domain.md` (18 domain model) sebelum eksekusi.

---

## Decisions

### 1. Organizational model — Company only, no Branch

**Keputusan:** Model organisasi bersifat **single-level (Company saja)**.
Konsep `Branch` **dihapus total** dari domain model, bukan dijadikan opsional.

**Alasan:**
- Perusahaan saat ini tidak memiliki kebutuhan multi-cabang yang butuh
  routing lead/operasional terpisah.
- Menambahkan `branchId` di semua tabel (Organization, IAM, WO, Dashboard,
  dst) menambah kompleksitas skema tanpa benefit nyata di kondisi saat ini.
- Konsisten dengan prinsip **KISS** yang sudah dikunci di project (hindari
  overengineering sebelum kebutuhan terukur).

**Dampak ke `business-domain.md`:**
- **D01 Organization** — purpose direvisi: hanya mendefinisikan `Company`,
  tidak lagi "Company & Branch".
- **D02 IAM** — `UserMembership` menjadi `user ↔ company` (tanpa branch).
- **D09 Work Order** — lokasi kerja (on-site/lab) dicatat sebagai
  alamat/koordinat bebas teks, bukan foreign key ke Branch.
- **D15 Dashboard** — filter cukup di level Company.
- Action Plan (`companyId String, branchId String?`) → kolom `branchId`
  dihapus dari seluruh tabel bisnis.

**Jika kebutuhan multi-lokasi muncul di masa depan:** ini akan menjadi ADR
baru dan migrasi skema terpisah yang eksplisit — bukan mengaktifkan kolom
yang sudah menganggur dari awal.

---

### 2. companyId assignment — server-side config per website, bukan dari client

**Keputusan:** Setiap deployment website (`apps/web` + `apps/web-api`)
dikunci ke satu `companyId` tetap lewat environment variable server-side
(mis. `COMPANY_ID=PRS`). Nilai ini **tidak pernah** dikirim dari
client/browser sebagai bagian dari payload form.

**Alur:**
```
Client submit form → web-api (companyId dibaca dari env, bukan dari body)
                   → forward ke Nest LeadsModule dengan companyId terkunci
                   → Nest validasi companyId terdaftar di domain Organization
```

**Alasan:**
- Mencegah manipulasi companyId lewat DevTools/request tampering — lead
  tidak bisa "disuntik" ke company lain oleh pihak luar.
- Nest tetap melakukan validasi companyId terdaftar sebagai safety net,
  untuk menghindari lead hilang/nyasar akibat kesalahan konfigurasi env.

**Skalabilitas:** kalau di masa depan ada sister company lain yang pakai
ekosistem yang sama, cukup deploy instance `web` + `web-api` baru dengan
`COMPANY_ID` env berbeda — tanpa perubahan struktur domain.

---

### 3. Lead deduplication — match ke CRM berdasarkan email domain

**Keputusan:** Sebelum Lead Management membuat record `Lead` baru, sistem
mencocokkan alamat email pengirim form terhadap **email domain** customer
yang sudah terdaftar di CRM (D05). Customer existing (sudah punya akun
portal) **tidak** diperlakukan sebagai lead baru.

**Alur yang disarankan:**
1. Form tetap masuk sebagai submission.
2. Sistem cek email domain terhadap `Customer`/`CustomerContact` yang ada.
3. Jika match ditemukan → tandai sebagai kemungkinan customer existing,
   **tunjukkan ke admin untuk konfirmasi manual** (bukan auto-merge tanpa
   review), lalu arahkan ke alur `CalibrationRequest` langsung.
4. Jika tidak ada match → proses normal sebagai `Lead` baru di pipeline
   Lead Management (D04).

**Alasan:** mencegah duplikasi record CRM sekaligus menghindari risiko
false-positive (kontak berbeda dari company yang sama salah digabung tanpa
verifikasi).

---

### 4. Invoice granularity — many-to-many terhadap WO/Certificate

**Keputusan:** Satu `Invoice` dapat mencakup **banyak** `WorkOrder`/
`Certificate` milik satu customer (konsolidasi tagihan), bukan strict 1:1.

**Dampak ke D13 Billing:**
- Relasi `Invoice` ↔ `WorkOrder`/`Certificate` = **many-to-many**.
- Invoice **tidak** lagi otomatis ter-trigger begitu satu Certificate
  terbit. Diperlukan proses eksplisit "buat invoice": admin/finance memilih
  beberapa WO/Certificate berstatus **billable/unbilled** milik satu
  customer, lalu digabung jadi satu Invoice.
- Perlu status `billable` / `invoiced` di level Certificate atau WO supaya
  finance tahu item mana yang siap ditagih dan mana yang sudah masuk
  invoice lain.

---

### 5. Commercial recording — Quotation always recorded (LOCKED)

**Keputusan:** Kesepakatan yang dimulai lewat telepon/WA **boleh** menjadi
kanal awal, tetapi bukan pengganti record. `Quotation` **wajib** tercatat
di sistem — boleh diinput belakangan setelah panggilan telepon, tetapi
harus ada dan **approved** sebelum `WorkOrder` (WO) yang sah diterbitkan.

**Alasan:** Ini menjawab risiko yang sempat diangkat saat review awal —
skenario "WO darurat sebelum quotation formal disetujui". Solusinya bukan
membuka jalur WO tanpa quotation, tapi memisahkan **kanal komunikasi**
(telepon/WA, boleh cepat) dari **record resmi** (quotation, wajib ada
sebelum WO, boleh diinput telat). Tidak ada "kesepakatan bayangan" di luar
sistem.

**Dampak ke D08 Commercial/Quotation:**
- Tambahan `QuotationSource` (concept: portal | phone | whatsapp | other)
  untuk mencatat asal kesepakatan tanpa mengubah kewajiban pencatatan.
- Rule eksplisit: *"WO is not created without an approved Quotation
  recorded in the system"* — termasuk untuk kasus yang mulai dari telepon.
- Emergency WO tanpa quotation **tetap tidak diperbolehkan**, kecuali ada
  ADR baru yang secara eksplisit membuka jalur itu.

---

### 6. Billable source of truth — Certificate only (Opsi A, LOCKED)

**Keputusan:** Status penagihan (`unbilled` / `billable` / `invoiced`)
**hanya** hidup di `Certificate`. `WorkOrder` **tidak** independen sebagai
sumber tagihan — WO hanya boleh muncul di Invoice sebagai referensi
audit/pengelompokan opsional, bukan sebagai billable line tersendiri.

**Alasan:** Melengkapi keputusan #4 (Invoice many-to-many) dengan menutup
ambiguitas "kalau ada biaya kunjungan/surcharge di WO tapi belum ada
Certificate, bagaimana ditagih?" — jawabannya: biaya semacam itu dimodelkan
sebagai baris komersial yang tetap bermuara ke Certificate (atau
Quotation→Certificate), bukan sebagai billable item terpisah di WO. Ini
menjaga **satu sumber kebenaran** untuk billing, menghindari dua jalur
penagihan yang bisa saling tumpang tindih atau double-charge.

**Dampak ke D12 Certificate & D13 Billing:**
- `Certificate` memiliki field konseptual `CertificateBillingStatus`
  (unbilled | billable | invoiced) — satu-satunya SoR billing.
- `Invoice` terhubung ke `Certificate` lewat `InvoiceCertificateLink`
  (M:N, wajib untuk item billable).
- `InvoiceWorkOrderRef` boleh ada, tapi sifatnya audit/grouping saja —
  tidak membawa status billable.
- Menerbitkan Certificate **tidak** otomatis membuat Invoice — pembuatan
  invoice tetap proses eksplisit oleh admin/finance (lihat keputusan #4).

---

## Consequences

- Semua tabel bisnis di `packages/db` (Prisma schema) menggunakan
  `companyId` saja — **tidak ada** `branchId`.
- `web-api` (Express) menyimpan `COMPANY_ID` sebagai env var wajib per
  deployment; tidak menerima companyId dari request body.
- `LeadsModule` (Nest) memiliki dependency read-only ke CRM (D05) untuk
  proses matching email domain sebelum create.
- `BillingModule` (Nest) mendesain `Invoice` sebagai entity dengan join
  table ke `WorkOrder`/`Certificate` (many-to-many), bukan foreign key
  langsung 1:1.
- `business-domain.md` sudah direvisi (status: *Aligned with ADR-000*) dan
  konsisten dengan seluruh keputusan di atas — tidak ada lagi referensi
  Branch, dan alur Quotation/Billing sudah mengikuti keputusan #5 dan #6.
- `QuotationModule` (Nest) mencatat `QuotationSource` dan menegakkan gate
  "no WO without approved Quotation" di level guard/service, bukan hanya
  di UI.
- `CertificateModule` (Nest) memegang satu-satunya status billing
  (`CertificateBillingStatus`); `WorkOrderModule` tidak punya field
  billable sama sekali.
- `LeadsModule` (Nest) menerapkan blocklist domain email publik
  (gmail/yahoo/outlook, dst) sebelum memakai email domain sebagai sinyal
  pencocokan ke CRM — hanya domain korporat yang dipakai sebagai match
  signal.

## Status

Semua item di validation checklist `business-domain.md` §7 sudah closed.
Tidak ada open question yang menghalangi lanjut ke **entity catalog**.
