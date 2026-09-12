# 14. Gap Classification

Legenda: **A** = Already Correct · **B** = Business Rule Ambiguity · **C** = Implementation Gap · **D** = Future Integration · **E** = Accepted Technical Debt

| # | Gap | Kategori | Rujukan |
|---|---|---|---|
| 1 | Resistansi Isolasi dicatat sebagai teks `"OR"` di lapangan, tapi `valueType` parameter = `NUMBER` | **C** | [07 §7.5](07-decimal-places-mapping.md), [09 §9.3](09-environmental-electrical-safety-mapping.md) |
| 2 | Metadata konfigurasi alat (Tipe bagian diaplikasikan B/BF/CF, Kelas Proteksi I/II/Baterai, Hubungan Utama DPS/NPS/PIE) tidak punya field/model penyimpanan | **C** | [09 §9.2](09-environmental-electrical-safety-mapping.md) |
| 3 | Field `Resolusi` administratif tidak ada di skema manapun | **C** | [08 §8.1](08-administrative-mapping.md) |
| 4 | Representasi 3-sub-reading Tegangan Input (L-N/L-G/N-G) di bawah 1 `DeviceCalibrationParameter` tidak jelas mekanismenya | **B** | [09 §9.4](09-environmental-electrical-safety-mapping.md) |
| 5 | Jumlah titik SpO2 untuk BSM tidak konsisten antar sumber evidence (7 di golden example ini vs 8 di catatan audit internal sebelumnya) | ~~B~~ → **A** (RESOLVED — lihat [19 §19.2](19-historical-results-cross-check.md#192-dampak-pada-gap-yang-sudah-dilaporkan)) | [02 §2.6.c](02-bed-side-monitor-mapping.md), [19](19-historical-results-cross-check.md) |
| 6 | `INCU_AIR_TEMP` struktur 10-test-point (5 sensor × 2 setpoint) sudah ditandai "FLAGGED" oleh tim sendiri sebagai keputusan desain terbuka | **B** (sudah diketahui tim, belum diputuskan) | [03 §3.6.1](03-baby-incubator-mapping.md) |
| 7 | `INCU_SKIN_TEMP_SENSOR` tidak punya `CalibrationTestPoint` untuk 2 kelas toleransi berbeda (0,7°C vs 0,3°C) yang terlihat jelas di golden example | **C** | [03 §3.6.3](03-baby-incubator-mapping.md) |
| 8 | Kelembaban DALAM kompartemen inkubator (LK F.2) tidak ditemukan sebagai capability item terpisah dari `ROOM_HUMIDITY` (kelembaban ruangan) | **C** (perlu verifikasi lanjutan sebelum dipastikan) | [03 §3.6.2](03-baby-incubator-mapping.md) |
| 9 | Telaah Teknis: tidak ada breakdown skor 3-kategori (Kondisi Alat=10, Keselamatan Listrik=40, Kinerja Peralatan=50) maupun formula agregasi ke `QualityReview.decision` | **B** | [10](10-technical-review-mapping.md) |
| 10 | Snapshot katalog tidak lengkap — label parameter, unit, decimalPlaces, urutan section TIDAK disnapshot ke hasil historis (hanya toleransi & batas fisik yang disnapshot) | **C** | [11](11-snapshot-versioning-assessment.md) |
| 11 | Generator PDF untuk LK pengukuran (measurement worksheet) belum ada sama sekali — hanya ada F.MU.08 Kontrol Alat & BA Identitas | **D** (Future Integration — fitur belum dibangun) | [12 §12.3](12-dynamic-device-addition-assessment.md) |
| 12 | `Petugas Kalibrasi` ada di schema (`WorkOrderAssignment`) tapi tidak dipakai konsisten; `KontrolAlat` memakai "Petugas Teknis" sebagai proxy | **B** | [08 §8.1](08-administrative-mapping.md) |
| 13 | `Kapasitas` (KontrolAlat.capacity) hanya tersedia untuk job `SEND_TO_LAB`; job on-site (SPK) tidak punya field ini | **E** (Accepted Technical Debt — keputusan desain KontrolAlat 1:1 hanya utk WOL, terdokumentasi di schema) | [08 §8.1](08-administrative-mapping.md) |
| 14 | `DeviceTypeEquipmentRequirement` tidak punya quantity/mandatory-flag/priority | **E** (sudah didokumentasikan tim sebagai "deferred") | [06 §6.4](06-equipment-reference-mapping.md) |
| 15 | Field "Berlaku Sampai" muncul di Excel golden example Baby Incubator tapi tidak ada di LK docx maupun skema MedCal | **D** (butuh investigasi/integrasi terpisah, tidak cukup evidence untuk diklasifikasi lebih spesifik) | [03 §3.1](03-baby-incubator-mapping.md) |
| 16 | Drift `seed-device-capabilities.ts` masih memakai `DeviceCapabilityItem.code` yang sudah di-drop dari skema | **C** (potential bug, di luar scope perbaikan audit ini) | [01 §1.2](01-device-capabilities-architecture.md) |
| 17 | Path referensi dokumentasi salah di komentar `backfill-decimal-places-from-results.ts` (menyebut `docs/claude/plans/...` padahal file sebenarnya di `docs/module-specs/...`) | **E** (kosmetik, tidak fungsional) | [07 §7.2](07-decimal-places-mapping.md) |
| 18 | `results.xlsx` (nama file spesifik yang diminta task) tidak ditemukan; password diklaim tidak ada padahal file ditemukan terenkripsi | **—** (klarifikasi evidence, bukan gap MedCal) | [00 README](00-README.md) |
| 19 | Sheet `cold-chain-vaccine-refrigerator` di `result-historical.xlsx` ambigu: strukturnya identik dengan `blood-bank-refrigerator`, tapi ada 2 `DeviceType` kandidat berbeda (`COLD_CHAIN` vs `KULKAS_VAKSIN`) tanpa evidence kode yang menentukan mapping mana yang benar | **B** | [19 §19.3.3](19-historical-results-cross-check.md#1933-cold-chain-vaccine-refrigerator--gap-baru-ambiguitas-nama-sheet-vs-2-devicetype-berbeda) |
