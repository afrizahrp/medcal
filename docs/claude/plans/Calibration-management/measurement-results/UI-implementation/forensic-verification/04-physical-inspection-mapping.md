# 4. Physical Inspection Mapping

## 4.1 Model

```1417:1434:D:\medcal\packages\db\prisma\schema.prisma
model DevicePhysicalCheckItem {
  id              String   @id @default(cuid())
  deviceTypeId    String
  code            String
  name            String
  inspectionLimit String
  sortOrder       Int      @default(0)
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  deviceType DeviceType            @relation(fields: [deviceTypeId], references: [id])
  results    PhysicalCheckResult[]

  @@unique([deviceTypeId, code])
}
```

```2296:2323:D:\medcal\packages\db\prisma\schema.prisma
model PhysicalCheckResult {
  id                        String               @id @default(cuid())
  companyId                 String
  calibrationJobId          String
  devicePhysicalCheckItemId String
  attemptNumber             Int
  verdict                   PhysicalCheckVerdict
  note                      String?
  inspectionLimitSnapshot   String
  recordedByUserId          String?
  recordedAt                DateTime             @default(now())

  calibrationJob          CalibrationJob          @relation(fields: [calibrationJobId], references: [id], onDelete: Cascade)
  devicePhysicalCheckItem DevicePhysicalCheckItem @relation(fields: [devicePhysicalCheckItemId], references: [id], onDelete: Restrict)
  recordedBy              User?                   @relation(fields: [recordedByUserId], references: [id])

  @@unique([calibrationJobId, devicePhysicalCheckItemId, attemptNumber], name: "physical_check_natural_key")
}
```

Enum:

```416:422:D:\medcal\packages\db\prisma\schema.prisma
enum PhysicalCheckVerdict {
  BAIK
  TIDAK_BAIK
}
```

## 4.2 Terminologi Persis Dipertahankan

`seed-physical-check-items.ts` menyalin kata demi kata dari LK docx (bukan Results Excel — lihat perbedaan wording di [03-baby-incubator-mapping.md §3.4](03-baby-incubator-mapping.md)):

```107:112:D:\medcal\packages\db\prisma\seed-physical-check-items.ts
{
  deviceTypeCode: "BABY_INCUBATOR",
  code: "BABY_INCUBATOR_PHYSICAL_001",
  name: "Badan / Permukaan",
  inspectionLimit: "periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya.",
  sortOrder: 10,
},
```

Comment header:

```1:16:D:\medcal\packages\db\prisma\seed-physical-check-items.ts
// plus PATIENT_MONITOR checklist copied from BED_SIDE_MONITOR (business lock).
// Master configuration only — does NOT create PhysicalCheckResult or touch
// DeviceCalibrationParameter / MeasurementResult / DeviceType.
// DeviceType is resolved by stable `code` (never hardcoded cuid). Missing
// DeviceType fails loud — this seed does not create DeviceType rows.
// Idempotent: upsert on @@unique([deviceTypeId, code]).
// Source: docs/module-specs/technician-app/ui-tasks/PhysicalInspection_Master_Seed.md
```

`PATIENT_MONITOR` mendapat checklist yang **identik** (copy) dari `BED_SIDE_MONITOR` — keputusan bisnis eksplisit ("business lock"), bukan kebetulan.

## 4.3 Ordering

`sortOrder` di seed (10, 20, 30, ...) menjamin urutan tampilan konsisten dengan urutan LK docx asli (Badan/Permukaan → Kotak kontak → Kabel catu → Tombol/Saklar → ... ). Ini terpisah dari ordering `DeviceCalibrationParameter` (yang punya `sortOrder` sendiri) dan dari ordering `DeviceCapability` (via `DeviceTypeCapabilityOrder`) — tiga mekanisme ordering independen untuk tiga domain berbeda.

## 4.4 Representasi Baik / Tidak Baik

- **Excel golden example** (BSM & Baby Incubator): nilai numerik `1` di kolom "Baik" (Excel radio-button convention); tidak ada nilai eksplisit untuk "Tidak Baik" karena semua item lulus pada kedua contoh.
- **LK docx template**: kolom checkbox kosong "☐ Baik / ☐ Tidak Baik" — teknisi mencontreng manual.
- **MedCal**: enum eksplisit `PhysicalCheckVerdict.BAIK` / `TIDAK_BAIK` — representasi BOOLEAN-style yang setara secara semantik, hanya beda encoding teknis (enum vs radio-button Excel vs checkbox docx). **Tidak ada kehilangan informasi** dalam mapping ini — feasibility YES untuk section ini.

## 4.5 Snapshot

`inspectionLimitSnapshot` disalin dari `DevicePhysicalCheckItem.inspectionLimit` SAAT `PhysicalCheckResult` ditulis:

```182:183:D:\medcal\apps\api\src\modules\calibration-jobs\physical-check-results.service.ts
inspectionLimitSnapshot: item.inspectionLimit,
```

Artinya "Batas Pemeriksaan" LK historis **terlindungi** dari perubahan katalog di masa depan — jika admin mengedit `inspectionLimit` pada `DevicePhysicalCheckItem` setelah job lama sudah diselesaikan, LK yang dihasilkan ulang untuk job lama tetap menunjukkan prosa ORIGINAL, bukan versi baru. Ini adalah snapshot yang solid untuk kolom prosa — namun **`name` item (label "Badan / Permukaan" dsb.) TIDAK disnapshot** — jika `DevicePhysicalCheckItem.name` diedit di masa depan, LK lama akan menampilkan nama BARU (via live FK `devicePhysicalCheckItemId`), bukan nama yang berlaku saat pemeriksaan dilakukan. Lihat [11-snapshot-versioning-assessment.md](11-snapshot-versioning-assessment.md) untuk analisis lengkap risiko ini.

## 4.6 Kesimpulan

**Feasibility: YES** untuk mereproduksi section "Pemeriksaan Fisik dan Fungsi Alat" secara dinamis — struktur katalog (item + inspectionLimit + sortOrder) dan hasil (verdict + snapshot prosa) sudah cukup lengkap dan generik per DeviceType, tanpa perlu kode khusus per device. Satu-satunya kekurangan minor: nama item tidak disnapshot (gap kecil, kategori E — Accepted Technical Debt, karena wording item jarang berubah setelah live).
