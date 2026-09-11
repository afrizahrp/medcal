# Kontrol Alat (F.MU.08) — Implementation Report

**Status:** Selesai (Fase 1–6) + koreksi numbering KAL (2026-09-12)  
**Date:** 2026-09-12  
**Form authority:** PKM F.MU.08 *Kontrol Alat – Permintaan Pekerjaan In Lab* (kode form kertas, **bukan** nomor dokumen sistem)  
**Plan:** [`kontrol-alat-implementation-planning-report.md`](./kontrol-alat-implementation-planning-report.md)  
**Impact / audit:** [`kontrol-alat-implementation-impact-review.md`](./kontrol-alat-implementation-impact-review.md)

---

## Ringkasan

Fitur **Kontrol Alat** (intake / inspeksi / tanda tangan In Lab) sudah diimplementasikan end-to-end sesuai plan coding:

| Fase | Isi | Commit (utama) |
|------|-----|----------------|
| 1 Schema | WO request review, accessories, `KontrolAlat` + anak, migration + backfill | `2020b8a` |
| 2 API / domain | CRUD, fan-out copy, expose `serviceMode`, reject ON_SITE | `25be906` |
| 3 Lifecycle gate | `start()` WOL vs SPK + tests | `4ab7afd` |
| 4 UI | Portal WO + job accordion; PWA form; No. Sertifikat after MT; gate messaging | `ffaf6aa` |
| 5 PDF | `GET .../kontrol-alat/pdf` + tombol Portal/PWA | `f2779ee` |
| 6 Tests | Fan-out, gate, cert pre-APPROVE, request review, RBAC | tersebar di beberapa file test |
| **Koreksi numbering** | `DocumentType.KONTROL_ALAT` prefix **KAL** via `DocumentNumberService` | (koreksi 2026-09-12) |

**Out of scope (sengaja tidak dikerjakan):** Device Management, perubahan SPK/DLN, physical-check katalog, measurement results, modul Certificate (`CER/...` tetap terpisah dari KAL).

---

## Locked baseline yang diikuti

1. Hanya `SEND_TO_LAB` / WOL / In Lab — **tidak** ada baris Kontrol Alat untuk `ON_SITE` / SPK.  
2. Kardinalitas **1 CalibrationJob : 1 KontrolAlat** (per unit).  
3. **No. Order** di PDF = `PurchaseOrder.customerPoNumber` (bukan nomor WOL).  
4. **No. Sertifikat** = string manual setelah MT APPROVE; **tidak** allocate `DocumentType.CERTIFICATE`.  
5. Tanggal form **derived**: Terima/Kalibrasi = `startedAt`; Selesai = APPROVED `QualityReview.reviewedAt` ?? `submittedAt`.  
6. Kaji ulang permintaan = milik **WorkOrder** (shared semua sibling job).  
7. Gate hard sebelum `start()`: `workExecuted === true` + kedua signature `signedAt`; `functionFinalOk` dan `requestReviewCompletedAt` **bukan** bagian gate.  
8. Tidak digabung dengan measurement / physical-check katalog.

---

## 1. Schema

Migration: `packages/db/prisma/migrations/20260911150000_add_kontrol_alat/`.

### 1.1 `WorkOrder` — kaji ulang permintaan (WOL)

| Field | Tipe | Catatan |
|-------|------|---------|
| `requestReviewMethodOk` | `Boolean?` | II.a Metode |
| `requestReviewEquipmentOk` | `Boolean?` | II.b Peralatan |
| `requestReviewPersonnelOk` | `Boolean?` | II.c Personel |
| `requestReviewConfirmAgree` | `Boolean` default false | Konfirmasi langsung |
| `requestReviewConfirmEmail` | `Boolean` default false | |
| `requestReviewConfirmLetter` | `Boolean` default false | |
| `requestReviewConfirmOther` | `Boolean` default false | |
| `requestReviewConfirmOtherText` | `String?` | |
| `requestReviewCompletedAt` | `DateTime?` | Stempel complete |
| `requestReviewCompletedByUserId` | `String?` | FK User |

### 1.2 `WorkOrderItemAccessory` (baru)

Daftar awal perlengkapan per baris WO item. Disalin ke `KontrolAlatAccessory` saat fan-out (dengan `sourceWorkOrderItemAccessoryId`).

### 1.3 `KontrolAlat` (baru) — 1:1 job

Field utama: `workExecuted`, `notExecutedReason`, `capacity`, visual/fungsi booleans, `certificateNumber`, `completedAt`, `createdByUserId`.

Invariant ON_SITE = no row: **application-enforced** (fan-out + semua write/GET).

### 1.4 Anak

- `KontrolAlatAccessory` — label, `present`, `sortOrder`, optional source WO accessory.  
- `KontrolAlatSignature` — dua slot tetap: `ADMINISTRATION` (Administrasi) dan `TECHNICAL_OFFICER` (Petugas Teknis). Menyimpan `signerUserId`, `signerName`, `signedAt`. Unique per `(kontrolAlatId, signerKind)`. Mekanisme gambar/e-sign **ditunda**. Tidak ada Membership role “Administrasi”.

### 1.5 Backfill

Migration mengisi baris `KontrolAlat` kosong 1:1 untuk Calibration Job existing yang parent WO-nya `SEND_TO_LAB`. Gate hanya mempengaruhi job yang masih `PENDING`.

### 1.6 Numbering (koreksi 2026-09-12)

Kontrol Alat memakai **mekanisme sentral yang sama** dengan CRQ / QUO / PUR / SPK / WOL / DLN / BAI:

| Lapisan | Nilai |
|---------|--------|
| `DocumentType` | `KONTROL_ALAT` |
| Prefix | `KAL` (3 huruf, tetap, bukan per-company) |
| Tabel `number` | `KontrolAlat` (`DOCUMENT_TYPE_NUMBER_TABLE`) |
| Alokasi | `DocumentNumberService.allocate({ companyId, documentType: "KONTROL_ALAT", issuedAt, tx })` |
| Format | `KAL/YYYY/MM/NNNNN` — sequence per `(companyId, documentType, year)`; `MM` display-only, **tidak** reset bulanan |
| Persistensi | `KontrolAlat.number` + `@@unique([companyId, number])` |
| Saat alokasi | Fan-out / `ensureKontrolAlatRows` (WOL only), di dalam transaksi yang sama |
| Bukan | F.MU.08, nomor WOL, CalibrationJob id, prefix CER, counter lokal |

F.MU.08 tetap **kode formulir kertas** (header PDF “Kode Dokumen”). Nomor sistem yang dicetak/disimpan adalah **KAL**. Prefix `CER` tetap cadangan modul Certificate.

Migrations:

1. `20260911220000_add_kontrol_alat_document_type` — `ALTER TYPE ... ADD VALUE 'KONTROL_ALAT'` (terpisah karena Postgres tidak boleh memakai enum value baru dalam transaksi yang sama).  
2. `20260911221000_add_kontrol_alat_number` — kolom `number`, backfill baris existing, unique index, seed `DocumentNumberSequence`.

**Backfill:** setiap `KontrolAlat` existing mendapat `KAL/{UTC year}/{UTC month}/{seq}` dengan `seq` 1..n per `(companyId, year)` diurut `createdAt, id`. Counter `DocumentNumberSequence` di-set ke `COUNT(*)` supaya allocate berikutnya melanjutkan, bukan mengulang 00001. `readMaxExistingSequence` tetap jadi jaring pengaman jika counter tertinggal.

---

## 2. API / domain

### 2.1 Endpoints Calibration Job

| Method | Route | Permission |
|--------|-------|------------|
| `GET` | `/calibration-jobs/:id/kontrol-alat` | `calibrationJob:read` |
| `PATCH` | `/calibration-jobs/:id/kontrol-alat` | `calibrationJob:recordKontrolAlat` |
| `POST` | `/calibration-jobs/:id/kontrol-alat/accessories` | `recordKontrolAlat` |
| `PATCH` | `/calibration-jobs/:id/kontrol-alat/accessories/:accessoryId` | `recordKontrolAlat` |
| `DELETE` | `/calibration-jobs/:id/kontrol-alat/accessories/:accessoryId` | `recordKontrolAlat` |
| `POST` | `/calibration-jobs/:id/kontrol-alat/signatures` | `recordKontrolAlat` |
| `GET` | `/calibration-jobs/:id/kontrol-alat/pdf` | `calibrationJob:read` |

Service: `apps/api/src/modules/calibration-jobs/kontrol-alat.service.ts`  
Controller: nested di `calibration-jobs.controller.ts` (bukan controller terpisah).

Error codes penting:

| Code | Kapan |
|------|--------|
| `KONTROL_ALAT_NOT_APPLICABLE` | WO `ON_SITE` |
| `KONTROL_ALAT_NOT_FOUND` | Baris belum ada |
| `KONTROL_ALAT_INCOMPLETE` | Start tanpa complete/signed |
| `KONTROL_ALAT_NOT_EXECUTED` | `workExecuted === false` |
| `KONTROL_ALAT_CERTIFICATE_NOT_ALLOWED` | `certificateNumber` sebelum MT APPROVE |
| `KONTROL_ALAT_REASON_REQUIRED` | Tidak dilaksanakan tanpa alasan |

### 2.2 Endpoints Work Order

| Method | Route | Permission |
|--------|-------|------------|
| `PATCH` | `/work-orders/:id/request-review` | `workOrder:update` |
| `PUT` | `/work-orders/:id/items/:itemId/accessories` | `workOrder:update` |

Keduanya menolak `ON_SITE` dengan `KONTROL_ALAT_NOT_APPLICABLE` (atau kode setara di WO service).

### 2.3 Fan-out

`fanOutCalibrationJobs`: jika `serviceMode === SEND_TO_LAB`, buat `KontrolAlat` (allocate `KAL/...` via `DocumentNumberService`) + salin accessories dari `WorkOrderItemAccessory`. Idempotent / re-fan-out mengisi ulang baris yang hilang (nomor baru di-allocate untuk baris yang dibuat ulang).

### 2.4 Payload job

`calibrationJobInclude` mengekspos:

- `workOrder.serviceMode`
- `workOrder.purchaseOrder.{customerPoNumber, number}`
- `workOrder.requestReviewCompletedAt`
- `kontrolAlat` summary (`id`, `number`, `completedAt`, `certificateNumber`, `workExecuted`)

### 2.5 Permissions

Action baru: `calibrationJob:recordKontrolAlat`.  
Seed: **TECHNICIAN**, **TECHNICIAN_MANAGER**, **ADMIN**.  
Tidak ada Membership role “Administrasi” baru.  
Tidak reuse `recordPhysicalCheck` / `recordMeasurement`.

---

## 3. Lifecycle gate

`CalibrationJobsService.start()` memanggil `assertKontrolAlatReadyForStart(serviceMode, jobId)`:

- `ON_SITE` → no-op.  
- `SEND_TO_LAB` → wajib `workExecuted === true` + signature ADMINISTRATION + TECHNICAL_OFFICER keduanya punya `signedAt`.  
- `completedAt` di-set saat signature kedua tersimpan (upsert).  
- `functionFinalOk` dan `requestReviewCompletedAt` **tidak** memblokir start (sesuai keputusan implementasi gate signatures-first; lihat open question plan §14.2).

---

## 4. UI

### 4.1 Portal — Work Order (WOL only)

- `WorkOrderRequestReviewSection` — kaji ulang + mark complete / reopen.  
- `WorkOrderItemAccessoriesSection` — editor aksesori per item.  
File: `work-order-request-review-section.tsx`; wired di `work-orders/[id]/page.tsx`.

### 4.2 Portal — Calibration Job detail (WOL only)

- Accordion **Kontrol Alat (F.MU.08)** dengan status complete / incomplete.  
- **No. Dokumen** = `KontrolAlat.number` (`KAL/...`).  
- Baca + edit inspeksi / accessories (saat job `PENDING` + permission).  
- Sign sebagai Administrasi / Petugas Teknis (nama + `signedAt`; gambar TTD ditunda).  
- **No. Sertifikat** editable hanya setelah MT Approve (`isQualityReviewApproved`).  
- Tombol **Unduh PDF**.  
Tidak dirender untuk `ON_SITE`.

### 4.3 Tech PWA

- Seksi Kontrol Alat di job detail (`SEND_TO_LAB` only) + link form.  
- Halaman `/jobs/[id]/kontrol-alat` — inspeksi, aksesori, TTD.  
- **Mulai Kalibrasi** disabled + pesan amber jika gate belum terpenuhi.  
- Tombol **Unduh PDF**.  
- Menampilkan No. Dokumen KAL.  
Form terkunci (read-only) jika `job.status !== "PENDING"`.

---

## 5. PDF

- Renderer: `apps/api/src/modules/calibration-jobs/kontrol-alat-pdf.ts` (PDFKit, pola F.MU.07 / WOL).  
- Service: `KontrolAlatService.buildPdf()`.  
- Endpoint: `GET /calibration-jobs/:id/kontrol-alat/pdf` → `StreamableFile`.  
- Filename: pola sentral `quotationPdfFilename` → `PKM-KAL-YYYYMMDD-NNNNN.pdf` (bukan `F.MU.08-...`).

| Field PDF | Sumber |
|-----------|--------|
| Header — judul | “Kontrol Alat (Kalibrasi In Lab)” |
| Header — Kode Dokumen | `F.MU.08` (referensi form kertas saja) |
| **No. Dokumen** | `KontrolAlat.number` (`KAL/YYYY/MM/NNNNN`) |
| No. Order | `PurchaseOrder.customerPoNumber` |
| No. Sertifikat | `KontrolAlat.certificateNumber` |
| No. WO / Unit | `WorkOrder.number`, `unitOrdinal` / `unitTotal` |
| Tgl. Terima / Kalibrasi | `CalibrationJob.startedAt` |
| Tgl. Selesai | APPROVED `reviewedAt` ?? `submittedAt` |
| I. Pelaksanaan | `workExecuted` / `notExecutedReason` |
| II. Kaji ulang | field request review di WO |
| III. Identitas alat | device / request item + `capacity` |
| IV. Visual / fungsi | booleans Kontrol Alat |
| Perlengkapan | `KontrolAlatAccessory` |
| TTD | dua slot Administrasi / Petugas Teknis (`signerName` + `signedAt`) |

Client helpers: `openKontrolAlatPdf` (portal), `openKontrolAlatPdfPwa` (PWA).

---

## 6. Tests

| Area | File | Contoh cakupan |
|------|------|----------------|
| Service Kontrol Alat | `kontrol-alat.service.test.ts` | PATCH WOL, reject ON_SITE, accessories, dual-sign → `completedAt`, cert pre/post APPROVE, reason required, **GET `number` KAL**, **buildPdf filename KAL** |
| Gate start | `calibration-jobs.service.test.ts` | ON_SITE tanpa KA OK; WOL unsigned / one-sig / null / false / missing row reject; allow tanpa `functionFinalOk` / request review |
| Fan-out + WO review | `work-orders.service.test.ts` | WOL 1:1 + copy accessories + **nomor KAL unik**; ON_SITE no KA; request review + accessories ON_SITE reject; review shared di WO |
| DocumentNumberService | `document-number.service.test.ts` | allocate `KONTROL_ALAT` → `KAL/2026/09/00001`; independen dari WOL/CER; reset tahun |
| Prefix map | `format-document-number.test.ts` | `DOCUMENT_TYPE_PREFIX.KONTROL_ALAT === "KAL"` |
| PDF renderer | `kontrol-alat-pdf.test.ts` | buffer `%PDF-`; filename `PKM-KAL-...-00007.pdf`; bukan F.MU.08 |
| Schema shared | `packages/shared/.../kontrol-alat.test.ts` | patch, signature kinds, request review, accessories replace |
| RBAC | `kontrol-alat.service.test.ts` | TECHNICIAN/ADMIN write; CS blocked |

---

## 7. File utama yang disentuh

### API

- `kontrol-alat.service.ts`, `kontrol-alat.service.test.ts`  
- `kontrol-alat-pdf.ts`  
- `calibration-jobs.controller.ts`, `calibration-jobs.service.ts`, `calibration-jobs.service.test.ts`  
- Work orders: request-review + item accessories + fan-out

### Shared / DB

- Prisma schema + migration `20260911150000_add_kontrol_alat`  
- `DocumentType.KONTROL_ALAT`, prefix `KAL`, table map `KontrolAlat`  
- Migrations `20260911220000_add_kontrol_alat_document_type`, `20260911221000_add_kontrol_alat_number`  
- Zod schemas Kontrol Alat / request review / accessories  
- Auth capability `recordKontrolAlat`

### Portal

- `calibration-jobs/[id]/page.tsx`, `use-kontrol-alat-query.ts`, `calibration-jobs-ui.tsx`  
- `work-order-request-review-section.tsx`, WO detail + query hooks

### Tech PWA

- `jobs/[id]/page.tsx`, `job-detail-ui.tsx`, `types.ts`  
- `jobs/[id]/kontrol-alat/page.tsx`, `use-kontrol-alat-query.ts`

---

## 8. Open questions (produk) — belum mengubah scope coding

Dari plan §14; implementasi saat ini memilih opsi praktis:

| # | Pertanyaan | Keputusan implementasi saat ini |
|---|------------|----------------------------------|
| 1 | Nama model English/DB | Tetap `KontrolAlat`; UI “Kontrol Alat” |
| 2 | `requestReviewCompletedAt` blok `start`? | **Tidak** — gate = dual signature + `workExecuted` |
| 3 | Signature image wajib? | **Ditutup:** dua slot tetap; nama + `signedAt` sekarang; gambar/e-sign ditunda, bukan keputusan produk terbuka |
| 4 | Grant ADMIN `recordKontrolAlat`? | **Ya** (ADMIN ikut seed) |
| 5 | Template aksesori default? | Free-text / dari WO item; tanpa template katalog |

---

## 9. Risiko yang sudah ditangani / residual

| Risiko (plan §13) | Status |
|-------------------|--------|
| Start gate mengubah perilaku WOL yang dulu bebas `start` | Ditangani: backfill + gate + messaging UI |
| Salah mewajibkan `functionFinalOk` sebelum start | Tidak diwajibkan (ada tes eksplisit) |
| Bingung `WorkOrderEquipment` vs UUT accessories | Dipisah: accessories di item WO / Kontrol Alat |
| Duplikasi kaji ulang per job | UI kaji ulang di WO detail saja |
| `Certificate.number` vs string Kontrol Alat | Sengaja terpisah; sync belum didesain |
| ADMIN tanpa permission | ADMIN sudah punya `recordKontrolAlat` |

---

## 10. Follow-up yang masuk akal (bukan fase plan)

1. Update header status di `kontrol-alat-implementation-planning-report.md` (masih bilang Phase 3+ not started / “jangan nomor dokumen baru”).  
2. Modul Certificate (`CER/...`) + keputusan sync ke `certificateNumber` (tetap terpisah dari `KAL`).  
3. Tutup / konfirmasi open questions §14.1, §14.2, §14.5 secara formal.

---

## Kesimpulan

Seluruh fase implementasi coding **1–6** sudah selesai. Koreksi 2026-09-12 menambahkan nomor dokumen sistem **`KAL/YYYY/MM/NNNNN`** lewat `DocumentNumberService` yang sama dengan dokumen lain; F.MU.08 tinggal kode form kertas. Dua slot tanda tangan Administrasi / Petugas Teknis tetap (`signerName` + `signedAt`; mekanisme gambar ditunda). Prefix `CER` dan arsitektur numbering lain tidak diubah.
