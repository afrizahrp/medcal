# Forensic Verification — LK + Results Excel → DeviceCapabilities → CalibrationJob → Generated LK

**Tanggal:** 2026-09-12
**Mode:** Audit / mapping read-only. Tidak ada kode, skema, migrasi, data DeviceCapabilities, atau file LK yang diubah.
**Pertanyaan akhir:** Dapatkah MedCal secara dinamis mereproduksi LK resmi untuk sebuah `CalibrationJob` yang sudah selesai dan disetujui MT — mencakup parameter kalibrasi, referensi alat, Physical Inspection, decimal places, hasil pengukuran, dan data administratif — **tanpa** membuat implementasi PDF khusus per device?

## Ringkasan Eksekutif

> **Verdict: 🟡 YELLOW — Mostly ready, gap spesifik dan sudah teridentifikasi.**

Fondasi data untuk Bed Side Monitor dan Baby Incubator (dua golden example) sudah sangat kuat: parameter kalibrasi, kondisi lingkungan, keselamatan listrik, dan physical inspection SUDAH dimodelkan secara generik (bukan hardcode per device) melalui `DeviceCapability → DeviceCapabilityItem → DeviceCalibrationParameter → MeasurementResult`. Namun ada beberapa gap konkret yang menghalangi generasi LK otomatis 100% tanpa intervensi manual — lihat [14-gap-classification.md](14-gap-classification.md).

## Daftar Isi

1. [01-device-capabilities-architecture.md](01-device-capabilities-architecture.md) — Arsitektur `DeviceCapability` saat ini
2. [02-bed-side-monitor-mapping.md](02-bed-side-monitor-mapping.md) — Pemetaan golden example Bed Side Monitor
3. [03-baby-incubator-mapping.md](03-baby-incubator-mapping.md) — Pemetaan golden example Baby Incubator
4. [04-physical-inspection-mapping.md](04-physical-inspection-mapping.md)
5. [05-calibration-parameter-mapping.md](05-calibration-parameter-mapping.md)
6. [06-equipment-reference-mapping.md](06-equipment-reference-mapping.md)
7. [07-decimal-places-mapping.md](07-decimal-places-mapping.md)
8. [08-administrative-mapping.md](08-administrative-mapping.md)
9. [09-environmental-electrical-safety-mapping.md](09-environmental-electrical-safety-mapping.md)
10. [10-technical-review-mapping.md](10-technical-review-mapping.md)
11. [11-snapshot-versioning-assessment.md](11-snapshot-versioning-assessment.md)
12. [12-dynamic-device-addition-assessment.md](12-dynamic-device-addition-assessment.md)
13. [13-dynamic-lk-feasibility-per-section.md](13-dynamic-lk-feasibility-per-section.md)
14. [14-gap-classification.md](14-gap-classification.md)
15. [15-recommended-architecture.md](15-recommended-architecture.md) — konseptual, TIDAK diimplementasikan
16. [16-recommended-next-step.md](16-recommended-next-step.md) — TIDAK dikode
17. [17-files-inspected.md](17-files-inspected.md)
18. [18-scope-confirmation.md](18-scope-confirmation.md)
19. [19-historical-results-cross-check.md](19-historical-results-cross-check.md) — Cross-check tambahan dari `D:\result-historical.xlsx` (5 device type, termasuk 3 device baru: Audiometer, Blood Bank Refrigerator, Cold Chain/Vaccine Refrigerator)

## Catatan Penting Tentang Sumber Data

- **`D:\medcal\results.xlsx` tidak ditemukan** pada path yang diminta di task. Tidak ada file bernama tepat `results.xlsx` di seluruh repo `D:\medcal`.
- Sebagai gantinya, ditemukan folder `docs\technician-docs\measurement-results\` yang berisi **66 file `.xlsx` per-device terenkripsi** (format OLE `D0 CF 11 E0`, bukan ZIP/OOXML biasa), termasuk `Bed Side Monitor.xlsx` dan `Baby Incubator.xlsx` — dua nama yang cocok dengan `bedside-monitor` dan `baby-incubator` yang disebut task.
- File-file ini memiliki password. Klaim task "no password" **tidak akurat** — namun password (`1004`) sudah terdokumentasi secara terbuka di repo pada `docs/module-specs/measurement-results/calibration-results-cross-check.md` (audit internal 2026-09-08 sebelumnya), sehingga dibuka menggunakan password yang sudah didokumentasikan tim, bukan brute-force/cracking.
- Kedua file dibuka **read-only**; salinan hasil dekripsi hanya ditulis ke `%TEMP%` (luar repo) dan dihapus setelah analisis (lihat [18-scope-confirmation.md](18-scope-confirmation.md)).
- Sheet yang relevan adalah **`Input Data`** (bukan `Sheet1`) — temuan ini juga konsisten dengan audit internal sebelumnya.

Ini adalah **hard-stop item** per aturan task ("jika mapping tidak bisa ditegakkan dari evidence yang ada, STOP dan laporkan, jangan menebak") — dilaporkan di sini, bukan diperbaiki atau diasumsikan.
