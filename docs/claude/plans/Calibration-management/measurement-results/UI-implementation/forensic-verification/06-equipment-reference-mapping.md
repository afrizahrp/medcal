# 6. Equipment Reference Mapping

## 6.1 Distinction "Required" vs "Actually Used" — SUDAH ADA di Level Model

MedCal memisahkan dua konsep secara jelas:

### Required (master config, per DeviceType)

```1249:1272:D:\medcal\packages\db\prisma\schema.prisma
model DeviceTypeEquipmentRequirement {
  id              String   @id @default(cuid())
  deviceTypeId    String
  equipmentTypeId String
  notes           String?
  sortOrder       Int      @default(0)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  deviceType    DeviceType    @relation(fields: [deviceTypeId], references: [id])
  equipmentType EquipmentType @relation(fields: [equipmentTypeId], references: [id])

  @@unique([deviceTypeId, equipmentTypeId])
}
```

```1243:1248:D:\medcal\packages\db\prisma\schema.prisma
// "Required Equipment" — declares that calibrating a given DeviceType normally
// requires a given EquipmentType. Master configuration only: it is NOT an
// assignment, NOT a per-job snapshot, and carries no quantity / mandatory-flag /
// priority / lifecycle (all deferred — see the audit's open questions). The
// required set for a CalibrationJob is derived at read time from
// job.device.deviceTypeId, never copied onto WorkOrder / CalibrationJob.
```

### Actually Used (per job, runtime)

```2339:2365:D:\medcal\packages\db\prisma\schema.prisma
model JobReferenceEquipmentUsed {
  id                           String  @id @default(cuid())
  companyId                    String
  calibrationJobId             String
  equipmentId                  String
  equipmentCalibrationRecordId String?
  notes                        String?

  validityOverridden Boolean   @default(false)
  overrideReason     String?
  overriddenByUserId String?
  overriddenAt       DateTime?

  calibrationJob             CalibrationJob              @relation(fields: [calibrationJobId], references: [id], onDelete: Cascade)
  equipment                  Equipment                   @relation(fields: [equipmentId], references: [id], onDelete: Restrict)
  equipmentCalibrationRecord EquipmentCalibrationRecord? @relation(fields: [equipmentCalibrationRecordId], references: [id], onDelete: Restrict)
  overriddenBy               User?                       @relation(fields: [overriddenByUserId], references: [id])

  @@unique([calibrationJobId, equipmentId])
}
```

`Equipment` (unit fisik milik PKM, mis. "ESA-001") → `EquipmentType` (kategori, mis. "Electrical Safety Analyzer") → dipilih sebagai kandidat berdasarkan `requiredEquipmentTypeIds(job)`:

```138:172:D:\medcal\apps\api\src\modules\calibration-jobs\job-reference-equipment.ts
async function requiredEquipmentTypeIds(job: JobDeviceTypeSource): Promise<Set<string> | null> {
  // ... resolve DeviceType dari job, lalu query DeviceTypeEquipmentRequirement
}
```

## 6.2 Pemetaan ke LK "B. Daftar Alat yang Digunakan"

LK/Excel golden example menampilkan tabel flat: `No | Nama Alat | Merk | Type/Model | No. Seri` — semuanya sudah tersedia di `Equipment` (`code`→No urut manual, `equipmentType.name`→Nama Alat, `brand`→Merk, `model`→Type/Model, `serialNumber`→No. Seri), diakses via `JobReferenceEquipmentUsed.equipment`.

Contoh dari kedua golden example (lihat [02](02-bed-side-monitor-mapping.md) §2.2, [03](03-baby-incubator-mapping.md) §3.2):

| Golden Example | Equipment digunakan |
|---|---|
| Bed Side Monitor | Vital Signs Simulator, Electrical Safety Analyzer, Thermohygrometer |
| Baby Incubator | Incubator Analyzer, Electrical Safety Analyzer, Thermohygrometer |

Semua tersedia sebagai baris `Equipment` biasa dengan FK ke `EquipmentType` yang sesuai — **tidak perlu logic khusus per device**.

## 6.3 Validitas Kalibrasi Alat Referensi

`EquipmentCalibrationRecord` (riwayat kalibrasi UNIT ALAT REFERENSI, bukan UUT pelanggan) menyimpan `validFrom`/`validUntil`/`status` (`DRAFT`/`CONFIRMED`). Validitas alat referensi pada tanggal job dijalankan **di-derive**, bukan disimpan sebagai field boolean statis:

```1211:1241:D:\medcal\packages\db\prisma\schema.prisma
model EquipmentCalibrationRecord {
  id                String                           @id @default(cuid())
  companyId         String
  equipmentId       String
  calibrationDate   DateTime                         @db.Date
  validFrom         DateTime?                        @db.Date
  validUntil        DateTime                         @db.Date
  certificateNumber String?
  result            String?
  acceptedForUse    Boolean                          @default(false)
  status            EquipmentCalibrationRecordStatus @default(DRAFT)
  jobReferenceUsages JobReferenceEquipmentUsed[]
}
```

`JobReferenceEquipmentUsed.equipmentCalibrationRecordId` (opsional) mengikat penggunaan ke record kalibrasi spesifik alat referensi tersebut — plus mekanisme override manual (`validityOverridden`, `overrideReason`, `overriddenByUserId`) untuk kasus TECHNICIAN_MANAGER force-accept.

## 6.4 Gap yang Ditemukan

| Gap | Kategori | Detail |
|---|---|---|
| `DeviceTypeEquipmentRequirement` tidak punya field quantity/mandatory-flag/priority (per komentar schema sendiri) | E (Accepted Technical Debt, sudah didokumentasikan tim) | Tidak menghalangi generasi LK dasar — hanya membatasi nuansa "opsional vs wajib" pada tampilan |
| Nomor urut (`No`) di tabel LK ("1, 2, 3") vs `Equipment.code`/urutan pemilihan pada job — tidak ada field `sortOrder` eksplisit di `JobReferenceEquipmentUsed` | B | Urutan tampilan LK saat regenerasi bisa berbeda dari urutan asli pencatatan teknisi jika tidak ada tie-break eksplisit (mis. `createdAt`) |
| Baby Incubator golden example melompat nomor 1→3→4 (baris "2" kosong) di Excel — perilaku manusia, bukan gap sistem | — (observasi, bukan gap MedCal) | Lihat [03 §3.2](03-baby-incubator-mapping.md) |

## 6.5 Kesimpulan

**Feasibility: YES** — distinction required-vs-used sudah ada secara arsitektural dan cukup untuk merender section "Daftar Alat yang Digunakan" secara dinamis untuk kedua golden example, tanpa kode khusus per device.
