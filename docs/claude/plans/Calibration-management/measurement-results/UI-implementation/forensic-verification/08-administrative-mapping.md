# 8. Administrative Data Mapping

## 8.1 Tabel Pemetaan Lengkap

| Field LK | Field MedCal | Status | Bukti |
|---|---|---|---|
| No. Sertifikat | `KontrolAlat.certificateNumber` (manual, In Lab only) / `Certificate.number` (resmi, 1:1 job, dibuat setelah `QualityReview` approve) | Ada, TAPI dua lifecycle berbeda — nomor "S.638"/"S.631" di golden example TIDAK cocok format `Certificate.number` sistem; kemungkinan nomor legacy/manual | `schema.prisma:2496-2539`, `kontrol-alat-pdf.ts:125` |
| Nama Alat | `DeviceType.name` (resolved) atau fallback `customerDeclaredDeviceName` / `CalibrationRequestItem.customerDeviceName` | Ada (derived, live read) | `kontrol-alat-pdf.ts:180` |
| No. Alat | `Device.code` (auto-generated, format `DVC-000001`) | Ada TAPI beda semantik — golden example menunjukkan field ini **kosong** di kedua contoh; kemungkinan "No. Alat" LK dimaksudkan sebagai nomor inventaris/aset milik CUSTOMER, bukan kode internal MedCal | `schema.prisma:1436-1468` |
| Merk | `Device.brand` | Ada (live read) | `schema.prisma:1444`, `kontrol-alat-pdf.ts:181` |
| Pemilik | `Customer.name` via `WorkOrder.customer` | Ada | `kontrol-alat-pdf.ts:185` |
| Model/Tipe | `Device.model` (Model) + `DeviceType.name` (Tipe, jika dipisah) | Ada (partial — LK menggabungkan Model & Tipe dalam 1 field, MedCal punya 2 sumber berbeda) | `schema.prisma:1445`, `kontrol-alat-pdf.ts:182-183` |
| Ruangan | `Device.locationText` | **Ada di schema, BELUM dipakai di `kontrol-alat-pdf.ts`** — field kosong di PDF meskipun data ada | `schema.prisma:1448` |
| No. Seri | `Device.serialNumber` ATAU `CalibrationJob.technicianObservedSerial` (observasi on-site, bisa beda dari master jika belum dikoreksi via `IdentityCorrection`) | Ada — DUA sumber, harus pilih salah satu untuk LK final (kemungkinan `technicianObservedSerial` yang benar untuk LK karena itu observasi aktual saat kalibrasi) | `schema.prisma:1446`, `schema.prisma:1997` |
| Tgl. Terima | `CalibrationJob.startedAt` (derived, dipakai untuk "Tgl. Terima Alat" di Kontrol Alat) | Ada (derived) — **catatan:** di kedua golden example, Tgl. Terima = Tgl. Kalibrasi (sama tanggal), konsisten dengan 1 field `startedAt` dipakai dua kali | `kontrol-alat-pdf.ts:128` |
| Tgl. Kalibrasi | `CalibrationJob.startedAt` (field SAMA dengan Tgl. Terima) | Ada — **tidak ada field terpisah**; jika suatu saat "Tgl. Terima" ≠ "Tgl. Kalibrasi" secara bisnis (mis. alat diterima H-1, dikalibrasi H), MedCal TIDAK bisa membedakannya | `kontrol-alat-pdf.ts:129` |
| Kapasitas | `KontrolAlat.capacity` (free text, optional) | Ada, **TAPI hanya untuk job dengan `serviceMode = SEND_TO_LAB`** (`KontrolAlat` 1:1 hanya untuk WOL). Job on-site (SPK) **tidak punya field ini sama sekali** | `schema.prisma:2075-2076` |
| Resolusi | — | **TIDAK ADA field dedicated di manapun** (Device, CalibrationJob, DeviceCalibrationParameter, KontrolAlat) — dikonfirmasi via grep "Resolusi"/"resolution" di seluruh `schema.prisma`: 0 match | Gap C |
| **"Berlaku Sampai"** (ditemukan di Baby Incubator Excel, TIDAK ada di LK docx manapun) | — | **Field ekstra tanpa mapping** — kemungkinan terkait validitas eksternal (BPFK/lab kalibrasi acuan?), di luar scope tanpa evidence tambahan | Observasi, tidak diinvestigasi lanjut |
| Petugas Kalibrasi | `WorkOrderAssignment` → `User` (teknisi yang ditugaskan SPK) | **Ada di schema, TAPI TIDAK dipakai** di `kontrol-alat-pdf.ts` — PDF Kontrol Alat memakai "Petugas Teknis" (`KontrolAlatSignature` kind `TECHNICAL_OFFICER`) sebagai proxy, bukan field "Petugas Kalibrasi" eksplisit | `schema.prisma:1834-1847` (WorkOrderAssignment) |
| Entri data oleh | `MeasurementResult.recordedByUserId` / `PhysicalCheckResult.recordedByUserId` (per baris hasil, BUKAN 1 field administratif tunggal) | Ada — TAPI granularitasnya per-baris hasil, bukan 1 nilai administratif untuk seluruh LK. Jika berbeda teknisi mengisi baris berbeda, "Entri data oleh" LK (yang tersirat sebagai 1 nama) tidak punya representasi tunggal yang jelas | Gap B |

## 8.2 Sumber Bukti PDF Existing (Kontrol Alat, F.MU.08)

MedCal SUDAH punya generator PDF administratif yang bekerja (untuk dokumen berbeda — F.MU.08 Kontrol Alat, bukan LK pengukuran), yang membuktikan pola pemetaan field administratif live-read sudah terbukti berjalan:

```179:187:D:\medcal\apps\api\src\modules\calibration-jobs\kontrol-alat-pdf.ts
y = kvTable(doc, left, y, width, [
  ["Nama Alat / Jenis", text(job.deviceTypeName) ?? "—"],
  ["Merk", text(job.deviceBrand) ?? "—"],
  ["Tipe / Model", text(job.deviceModel) ?? "—"],
  ["No. Seri", text(job.deviceSerial) ?? "—"],
  ["Kapasitas / Range", text(kontrolAlat.capacity) ?? "—"],
  ["Instansi / Pemilik", workOrder.customer.name],
]);
```

Ini adalah **evidence positif** bahwa arsitektur generate-PDF-dari-data-live sudah punya precedent kerja di codebase — relevan untuk [15-recommended-architecture.md](15-recommended-architecture.md).

## 8.3 Kesimpulan

**Feasibility: PARTIAL.** Sebagian besar field administratif SUDAH terpetakan ke sumber data yang jelas. Gap konkret: (1) `Resolusi` tidak ada sama sekali, (2) `Kapasitas` hanya ada untuk job SEND_TO_LAB, (3) `Petugas Kalibrasi` ada di schema tapi tidak "collected" secara konsisten ke satu titik pemakaian, (4) Tgl. Terima = Tgl. Kalibrasi digabung jadi 1 field (tidak masalah untuk 2 golden example ini karena kebetulan sama, tapi tidak general), (5) "No. Alat" kemungkinan salah pemahaman semantik (customer asset number vs `Device.code` internal).
