# 15. Recommended Rendering Architecture (KONSEPTUAL — TIDAK DIIMPLEMENTASIKAN)

> Section ini murni proposal desain untuk didiskusikan. **Tidak ada kode yang ditulis** sebagai bagian dari audit ini, sesuai batasan task.

## 15.1 Precedent yang Sudah Ada

MedCal sudah punya pola kerja "load data live → render PDF generik" untuk dua dokumen lain:
- `kontrol-alat-pdf.ts` (F.MU.08) — memakai helper `kvTable`, `sectionTitle`, `twoColTable`, `drawHeader` di atas library PDF (kemungkinan `pdfkit`, dilihat dari API `doc.on`, `doc.page`).
- `identity-correction-pdf.ts` (BA Koreksi Identitas).

Pola ini TERBUKTI bekerja untuk dokumen administratif sederhana. LK jauh lebih kompleks (tabel bertingkat, grid Pattern B, section dinamis per capability) sehingga tidak bisa langsung reuse 1:1, tapi prinsip "generic helpers + data live" sama.

## 15.2 Usulan Lapisan Generator LK (Konseptual)

```
1. Resolver Layer
   - Input: calibrationJobId
   - Resolve: DeviceType, Device, Customer, WorkOrder, semua relasi administratif
   - Resolve: capabilityGroups (reuse listMeasurementParameters yang SUDAH ADA)
   - Resolve: PhysicalCheckResult[] + DevicePhysicalCheckItem (urutan via sortOrder)
   - Resolve: JobReferenceEquipmentUsed[] + Equipment + EquipmentType
   - Resolve: QualityReview (setelah gap Telaah Teknis §10 diputuskan)

2. Section Renderer Layer (generik per TIPE section, bukan per DEVICE)
   - AdministrativeSectionRenderer
   - EquipmentReferenceSectionRenderer
   - EnvironmentalConditionsSectionRenderer   (generic — baca semua parameter di bawah capability ENVIRONMENTAL_CONDITIONS)
   - PhysicalInspectionSectionRenderer         (generic — baca semua DevicePhysicalCheckItem)
   - ElectricalSafetySectionRenderer           (generic — baca semua parameter di bawah capability ELECTRICAL_SAFETY)
   - PerformanceMeasurementSectionRenderer     (generic — loop capabilityGroups SISANYA, render tabel sesuai entryStyle: DIRECT_REPLICATES vs LOGGER_SUMMARY, dengan/tanpa CalibrationTestPoint grid)
   - TechnicalReviewSectionRenderer            (BLOCKED sampai gap §10 diputuskan bisnis)

3. Layout/Template Engine
   - Header/footer konstan (logo, kode dokumen, halaman) — mirror pola LK docx asli
   - Setiap Section Renderer menghasilkan blok tabel generik; TIDAK ADA percabangan "if deviceType === 'BABY_INCUBATOR' then ..." di layer manapun
```

## 15.3 Prinsip Kunci: Data-Driven, Bukan Template-per-Device

Karena `DeviceCapability` → `DeviceCalibrationParameter` → `CalibrationTestPoint` sudah generik (dikonfirmasi di [01](01-device-capabilities-architecture.md) dan [05](05-calibration-parameter-mapping.md)), section F (Kinerja Alat) BISA dirender dengan SATU renderer generik yang loop `capabilityGroups`, tanpa kode khusus per device — TEPAT seperti yang diminta oleh pertanyaan akhir task ini. Gap yang mengancam prinsip ini bukan arsitektur capability-nya, melainkan gap DATA/konfigurasi spesifik (§14 gap classification) yang perlu diselesaikan dulu di level katalog/seed, bukan di level kode renderer.

## 15.4 Ketergantungan yang Harus Diselesaikan Dulu (Bukan Nice-to-Have)

Urutan blocking untuk generator ini bisa 100% generik:

1. Formula skor Telaah Teknis (§10) — **blocking** untuk section Telaah Teknis.
2. Tempat penyimpanan metadata konfigurasi alat listrik (§9.2) — **blocking** untuk section E akurat.
3. Keputusan `valueType` untuk Resistansi Isolasi (angka vs teks, §7.5/9.3) — **blocking** untuk section E akurat.
4. Keputusan representasi 3-sub-reading Tegangan (§9.4) — **blocking** untuk section C akurat.
5. Field `Resolusi` (§8.1) — **blocking** untuk section A akurat.

Tanpa (1)–(5), generator BISA dibangun tapi outputnya akan punya field kosong/salah pada bagian-bagian tersebut untuk SEMUA device, bukan hanya BSM/Baby Incubator.
