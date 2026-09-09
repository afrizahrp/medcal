# STAGE B — Pattern B Measurement Entry UI (tech-pwa)

## Mode
Stage 1: PROPOSE ONLY. Tidak ada kode yang ditulis. Output adalah desain UI/flow
tertulis untuk direview. Hard stop menunggu persetujuan sebelum Stage 2 (implementasi).

## Background
Stage A (tech-pwa) sudah live untuk Pattern A (parameter tanpa titik uji: listrik,
lingkungan, dental illuminance, dll) — filter server: valueType=NUMBER,
entryStyle=DIRECT_REPLICATES, tanpa anak CalibrationTestPoint.

Pattern B (BSM Heart Rate, Respiration Rate, SpO2, NIBP, infus, CPAP, ventilator,
audiometer, dll) sudah punya:
- DeviceCalibrationParameter rows (aktif)
- CalibrationTestPoint rows (setpoint per titik uji, dari seed 2026-09-08:
  BSM_SPO2 8 titik, Ventilator I–III, dll — lihat calibration-results-cross-check.md
  dan five-steps-implementation-report.md untuk detail evidence)
- Backend API sudah menerima calibrationTestPointId, replicateIndex, direction pada
  create MeasurementResult

Yang BELUM ada: layar tech-pwa untuk merekam nilai pada struktur multi-titik ×
multi-replikat ini. Parameter Pattern B saat ini disembunyikan dari layar ukur.

## Scope of Stage B (this task)
1. Rancang flow entry untuk device dengan Pattern B parameters:
   - Grid: baris = titik uji (setpoint), kolom = replikat (I–III atau I–V, per
     parameter — replicateCount TIDAK seragam, evidence: Audiometer & Ventilator
     pakai I–III, mayoritas lain I–V)
   - Bagaimana `direction` (naik/turun) direpresentasikan untuk parameter yang
     memakainya (mis. Sphyg pressure naik/turun) vs parameter yang tidak
   - Bagaimana isWithinTolerance per-sel ditampilkan real-time ke teknisi
     (dari tolerance snapshot yang sudah dihitung backend)
2. Rancang bagaimana picker/filter di tech-pwa memasukkan Pattern B parameters
   (saat ini query filter secara eksplisit MENGECUALIKAN parameter yang punya
   CalibrationTestPoint children — filter ini perlu direvisi, bukan dihapus
   begitu saja, karena masih dipakai untuk membedakan Pattern A)
3. Tangani known bug 2026-09-08 (Stage A logger-summary false-positive: 9 parameter
   LOGGER_SUMMARY — BBR_STORAGE_TEMP dkk — salah kena filter valueType=NUMBER + zero
   children). Fix yang sudah diputuskan: field penanda permanen di
   DeviceCalibrationParameter. Pastikan field ini juga dipakai untuk exclude
   LOGGER_SUMMARY dari Stage B grid (LOGGER_SUMMARY tetap di luar scope Stage B —
   itu Stage C).
4. Rancang bagaimana attemptNumber/REWORK termanifestasi di grid ini (baris lama
   submitted tidak boleh editable, attempt baru dimulai dari kosong).

## Explicitly out of scope for Stage B
- LOGGER_SUMMARY grid (30×9 timepoint) — Stage C
- Ventilator I:E ratio, peak flow (PIF/PEF) — belum ada parameter code, HARD STOP
  terpisah
- Backfill decimalPlaces 81 baris tersisa — HARD STOP terpisah
- Deploy ke VPS

## Output
Dokumen desain (path mengikuti konvensi
docs/claude/plans/Calibration-management/measurement-results/), berisi:
- Wireframe/flow tertulis (boleh ASCII/deskripsi, tidak perlu kode)
- Perubahan filter picker yang diusulkan (field-level, bukan implementasi)
- Daftar edge case yang belum terjawab evidence (mis. parameter dengan replicate
  count campuran, direction, titik uji dengan hanya 1 titik seperti VENT_PEEP)
- Rekomendasi urutan device type mana yang dibangun dulu untuk pilot review Anda
  (saran: BSM — paling lengkap datanya dari 66 Excel, atau Ventilator — baru
  di-seed, uji cepat)

Hard stop setelah dokumen ini — tunggu review Anda sebelum Stage 2 (implementasi kode).