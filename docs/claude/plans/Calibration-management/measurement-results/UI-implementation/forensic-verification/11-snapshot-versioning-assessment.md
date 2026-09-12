# 11. Snapshot / Versioning Assessment

## 11.1 Pertanyaan Kritis

> Apakah `CalibrationJob` historis (yang sudah SUBMITTED/ACCEPTED_BY_QA) terlindungi dari perubahan konfigurasi katalog (`DeviceCalibrationParameter`, `DevicePhysicalCheckItem`, `DeviceCapability`) di masa depan? Jika admin mengedit master data BESOK, apakah LK yang di-generate ulang untuk job kalibrasi BULAN LALU akan berubah?

## 11.2 Mekanisme yang SUDAH ADA (Snapshot)

| Mekanisme | Lokasi | Terlindungi? |
|---|---|---|
| Revisi attempt | `CalibrationJob.currentAttempt`, `MeasurementResult.attemptNumber`, `PhysicalCheckResult.attemptNumber` | Ya — riwayat attempt lama tidak pernah diedit/dihapus |
| Snapshot identitas alat | `CalibrationJob.customerDeclaredDeviceName`, `customerDeclaredAkdAkl`, `technicianObservedSerial`, `technicianObservedAkdAkl` | Ya |
| **Snapshot toleransi** | `MeasurementResult.effectiveToleranceMin/Max`, `appliedNominalValue` | **Ya** — jika toleransi master diedit nanti, verdict `isWithinTolerance` hasil lama tidak berubah |
| **Snapshot batas pemeriksaan fisik** | `PhysicalCheckResult.inspectionLimitSnapshot` | **Ya** — prosa "Batas Pemeriksaan" historis terlindungi |
| Snapshot aksesori lab | `KontrolAlatAccessory` (disalin dari `WorkOrderItemAccessory` saat dibuat) | Ya |
| Unit fan-out | `unitOrdinal`, `unitTotal` (frozen saat fan-out) | Ya |

## 11.3 Yang TIDAK Disnapshot (Live FK)

| Data | Field | Risiko konkret |
|---|---|---|
| **Label/nama parameter** | `MeasurementResult.deviceCalibrationParameterId` → `DeviceCalibrationParameter.name` | Jika nama parameter diedit (mis. "Heart Rate" → "Denyut Jantung"), LK lama yang di-generate ulang akan menampilkan label BARU, bukan label yang berlaku saat kalibrasi dilakukan |
| **Unit (UOM)** | `DeviceCalibrationParameter.uomId` (kecuali override per-row `MeasurementResult.uomId`) | Jika UOM default parameter diubah, LK lama bisa salah label unit — MESKI ada override per-row sebagai jalur keluar parsial |
| **`decimalPlaces`** | `DeviceCalibrationParameter.decimalPlaces` | Jika decimalPlaces diedit (mis. 0 → 2 setelah audit ulang seperti yang terjadi di 2026-09-08), LK lama yang di-generate ulang akan menampilkan JUMLAH DESIMAL BERBEDA dari yang ditampilkan aslinya ke teknisi/pelanggan saat itu — **ironisnya, backfill decimalPlaces dari Excel yang sedang dianalisis di audit ini SENDIRI adalah contoh nyata event yang akan menyebabkan drift ini** |
| **Nama item pemeriksaan fisik** | `PhysicalCheckResult.devicePhysicalCheckItemId` → `DevicePhysicalCheckItem.name` | Nama item TIDAK disnapshot (hanya `inspectionLimit` yang disnapshot) |
| **Capability grouping / urutan section** | `DeviceTypeCapabilityOrder`, `DeviceCapability.name` | Jika urutan/nama section diubah, LK historis regenerasi akan mengikuti struktur BARU |
| **Konfigurasi test point** (`CalibrationTestPoint.settingLabel`, `toleranceNote`) | Live FK `calibrationTestPointId` | Toleransi NUMERIK disnapshot (`effectiveToleranceMin/Max`), tapi LABEL setpoint ("30", "I", dst.) dan `toleranceNote` PROSA tidak disnapshot |
| **Template LK itself** (LK docx sebagai file statis di disk) | Tidak ada model DB sama sekali | Tidak ada versioning apapun untuk file `.docx` template — perubahan template tidak terlacak di database |

## 11.4 Tidak Ditemukan Mekanisme Snapshot/Versioning Tingkat-Tinggi

Pencarian eksplisit untuk `capabilitiesSnapshot`, `templateVersion`, `configSnapshot`, atau kolom JSON snapshot definisi parameter di `schema.prisma` — **tidak ditemukan satu pun**. Versioning yang ada murni di level `attemptNumber` (revisi pengukuran), bukan di level "definisi katalog yang berlaku saat itu."

## 11.5 Implikasi untuk Generasi LK Dinamis

Jika MedCal membangun generator LK dinamis yang membaca `DeviceCalibrationParameter` LIVE (bukan snapshot) untuk menampilkan label/unit/decimalPlaces, maka:

- **LK yang di-generate SEGERA setelah job selesai** → akurat (katalog belum berubah).
- **LK yang di-generate ULANG bertahun-tahun kemudian, setelah katalog di-maintain/diperbaiki** → BERPOTENSI menampilkan label/decimalPlaces/urutan section yang BERBEDA dari LK asli yang ditandatangani teknisi & pelanggan saat itu. Ini adalah **risiko compliance/audit** yang nyata untuk dokumen kalibrasi resmi (LK adalah dokumen legal/audit trail untuk sertifikasi).

## 11.6 Kesimpulan

**Assessment: SEBAGIAN dilindungi (hybrid), BELUM cukup untuk regenerasi LK yang 100% setia-historis.**

Toleransi numerik dan prosa "Batas Pemeriksaan" fisik SUDAH snapshot dengan baik. Namun label, unit, decimalPlaces, dan struktur urutan section/parameter TIDAK disnapshot — mengandalkan live FK ke katalog master. Ini adalah **gap arsitektural (kategori C — Implementation Gap)** untuk kebutuhan spesifik "regenerasi LK yang identik dengan LK asli bertahun-tahun kemudian." Untuk kebutuhan "generate LK SEGERA setelah job selesai/disetujui MT" (yang menjadi fokus pertanyaan akhir task ini), risiko drift ini MINIMAL karena jarak waktu antara approval dan generation biasanya singkat — namun tetap dicatat sebagai risiko arsitektural jangka panjang yang belum diselesaikan.
