# MoM #9 Implementation Report

## PDF Document Codes

**Tanggal:** 2026-09-18  
**Scope:** Kode formulir tercetak pada PDF Work Order, Laporan Kalibrasi (LK), dan Kontrol Alat  
**Status:** Implemented

---

# 1. STATUS

Kode dokumen/formulir pada PDF yang terdampak sudah distandarkan sesuai MoM #9.

| Dokumen | Kode akhir |
|---|---|
| Work Order (WOL / Formulir Work Order) | `F.MU.07` |
| Laporan Kalibrasi / LK | `F.MT.LK.01.44` |
| Kontrol Alat | `F.MU.08` |

Penomoran dokumen, isi selain kode formulir LK, mapping pengukuran named-point, snapshot, toleransi, approval/tanda tangan, auth/RBAC, FCM, dan kontrak API **tidak diubah**.

---

# 2. AUDIT FINDINGS

Audit dilakukan sebelum implementasi. Tidak diasumsikan hanya ada satu generator per dokumen.

## 2.1 Work Order

Ada **dua** generator, dipilih oleh `serviceMode` di `renderWorkOrderPdf` (`apps/api/src/modules/work-orders/work-order-pdf.ts`):

| Varian | Generator | Kode formulir |
|---|---|---|
| In Lab (`SEND_TO_LAB`) — Formulir Work Order (WOL) | `work-order-pdf-wol.ts` | Hardcoded `FORM_META`: **F.MU.07** (sudah benar) |
| On Site (`ON_SITE`) — Surat Perintah Kerja (SPK) | `work-order-pdf-spk.ts` | **Tidak ada** kotak “Kode Dokumen” |

Download memakai `WorkOrdersService.buildPdf` → generator yang sama. Tidak ada jalur preview terpisah.

## 2.2 Laporan Kalibrasi (LK)

Satu jalur render:

- Download: `LkDownloadService` → `renderLkResultPdf` (`lk-result-pdf.ts`)
- Header halaman: `lk-pdf-layout.ts` (`Kode Dokumen`)
- Body: generic, atau template Bed Side Monitor / Patient Monitor (`lk-templates/bed-side-monitor.ts`) jika katalog header cocok

Kode sebelumnya **dinamis per jenis alat** di `lk-manual-header-catalog.ts` (ekstrak forensik header `.docx` resmi). Contoh: Bed Side Monitor `F.MT.LK.01.3`, Autoclave sudah `F.MT.LK.01.44`, tipe tak cocok sebelumnya kosong.

Tidak disimpan di database. Tidak ada generator HTML/HBS terpisah.

## 2.3 Kontrol Alat

Satu generator: `kontrol-alat-pdf.ts` via `KontrolAlatService.buildPdf`.  
`FORM_META` sudah **F.MU.08**. Filename memakai nomor `KAL/...`, bukan kode formulir. Tidak ada varian layout kedua.

## 2.4 Tes yang sudah ada

Tes PDF yang ada memeriksa filename / `%PDF-`, bukan kode formulir (kecuali filename Kontrol Alat **bukan** `F.MU.08`). Tidak ada tes yang mengunci byte-for-byte PDF.

---

# 3. FILES CHANGED

| File | Perubahan |
|---|---|
| `apps/api/src/modules/calibration-jobs/lk-manual-header-catalog.ts` | Konstanta `LK_PRINTED_DOCUMENT_CODE = "F.MT.LK.01.44"`; `resolveLkManualHeader` / `blankLkFormHeader` selalu memakai kode itu untuk field tercetak. Nilai forensik per-template di katalog **tidak** dihapus. |
| `apps/api/src/modules/calibration-jobs/lk-pdf-layout.ts` | Baris header `Kode Dokumen` memakai `LK_PRINTED_DOCUMENT_CODE` (berlaku generic + BSM). |
| `apps/api/src/modules/calibration-jobs/lk-document-code.test.ts` | Tes baru: resolver, jalur layout, smoke-render generic + BSM. |
| `apps/api/src/modules/work-orders/work-order-pdf.test.ts` | WOL PDF mengandung `F.MU.07` (teks stream Flate + hex WinAnsi). |
| `apps/api/src/modules/calibration-jobs/kontrol-alat-pdf.test.ts` | Body PDF mengandung `F.MU.08`; nomor `KAL/...` tetap ada. |

Tidak ada perubahan Prisma, migrasi, API contract, UI, atau logika kalibrasi.

---

# 4. DOCUMENT GENERATORS / TEMPLATES AFFECTED

**Diubah (kode tercetak saja):**

- LK generic (`renderLkResultPdf` body generik)
- LK Bed Side Monitor / Patient Monitor (header bersama di `lk-pdf-layout`)

**Tidak diubah (sudah sesuai; tes ditambah):**

- WOL `work-order-pdf-wol.ts`
- Kontrol Alat `kontrol-alat-pdf.ts`

**Tidak disentuh:**

- SPK `work-order-pdf-spk.ts` (lihat residual)
- Quotation, PO, Delivery Note, Identity Correction PDF
- Isi tabel pengukuran, mapping named-point, snapshot

---

# 5. FINAL CODE PER DOCUMENT

- **WO (WOL) = F.MU.07**
- **LK = F.MT.LK.01.44**
- **Kontrol Alat = F.MU.08**

Katalog forensik per alat tetap sebagai catatan header resmi `.docx`; yang **dicetak** di PDF LK selalu `F.MT.LK.01.44`, termasuk tipe yang tidak match katalog.

---

# 6. TESTS PASSED

Focused (35 tes, 6 file):

- `work-order-pdf.test.ts`
- `kontrol-alat-pdf.test.ts`
- `lk-document-code.test.ts`
- `lk-bed-side-monitor-geometry.test.ts`
- `lk-measurement-mapping.test.ts`
- `lk-template-data.test.ts`

Regresi download LK (16 tes):

- `lk-download.service.test.ts`

Mapping named measurement Phase 3 tetap lulus.

Catatan tes: PDFKit mengompres stream (`FlateDecode`). WOL/Kontrol Alat memakai Helvetica (hex WinAnsi, bisa di-decode). LK memakai Arial CID; tes LK mengunci **sumber header** (`resolveLkManualHeader` + konstanta di layout), bukan kesetaraan byte PDF.

---

# 7. TYPECHECK / BUILD

`pnpm typecheck` di `@medcal/api` (`tsc --noEmit`) **lulus**.  
Build penuh tidak dijalankan; konvensi API memakai typecheck.

---

# 8. RESIDUALS

**SPK (Work Order ON_SITE)** tidak menampilkan kode formulir. Itu Surat Perintah Kerja, bukan Formulir Work Order F.MU.07. Kode tidak ditambahkan agar layout/header SPK tidak diubah (aturan: jangan mengada-adakan kode pada varian yang tidak menampilkannya).

Nilai `documentCode` per-file di array katalog forensik tetap beragam; hanya jalur cetak PDF yang distandarkan.

---

# 9. KONFIRMASI

- WO (WOL) = `F.MU.07`
- LK = `F.MT.LK.01.44`
- Kontrol Alat = `F.MU.08`
- Penomoran dokumen tidak diubah
- Isi dokumen tidak diubah secara sengaja selain kode formulir LK
- Mapping named measurement Phase 3 masih lulus
- Tidak ada refactor di luar cakupan kode dokumen/formulir
