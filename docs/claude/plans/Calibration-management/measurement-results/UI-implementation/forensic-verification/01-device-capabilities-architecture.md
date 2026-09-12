# 1. Arsitektur `DeviceCapability` Saat Ini

**Lokasi schema:** satu file `D:\medcal\packages\db\prisma\schema.prisma` (tidak ada schema Prisma lain di `apps/api/prisma` atau `packages/shared/prisma`).

**Catatan penamaan:** Prisma memakai singular `DeviceCapability` / `DeviceCapabilityItem`, bukan "DeviceCapabilities" seperti disebut di task. Istilah "DeviceCapabilities" di UI/task merujuk pada modul/koleksi yang sama.

## 1.1 Struktur Berlapis

```
DeviceCapability (global, mis. "Keselamatan Listrik")
  └── DeviceCapabilityItem (global leaf, mis. "Resistansi Pembumian Protektif")
        └── DeviceCalibrationParameter (per DeviceType, mis. BPM_EARTH_RESISTANCE + toleransi + UOM)
              └── CalibrationTestPoint (opsional, grid Pattern B)
                    └── MeasurementResult (per CalibrationJob, saat eksekusi)
```

Domain **terpisah** (BUKAN child dari `DeviceCapability`):
- **Pemeriksaan fisik** → `DevicePhysicalCheckItem` + `PhysicalCheckResult`
- **Alat referensi wajib** → `DeviceTypeEquipmentRequirement` + `JobReferenceEquipmentUsed`
- **Instance alat pelanggan** → `Device` (hanya FK ke `DeviceType`, TANPA FK ke capability)

## 1.2 Definisi Model

```1301:1314:D:\medcal\packages\db\prisma\schema.prisma
model DeviceCapability {
  id          String   @id @default(cuid())
  code        String   @unique
  name        String
  description String?
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  items            DeviceCapabilityItem[]
  deviceTypeOrders DeviceTypeCapabilityOrder[]

  @@index([isActive])
}
```

```1316:1334:D:\medcal\packages\db\prisma\schema.prisma
model DeviceCapabilityItem {
  id           String   @id @default(cuid())
  capabilityId String
  name         String
  description  String?
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  capability            DeviceCapability             @relation(fields: [capabilityId], references: [id])
  calibrationParameters DeviceCalibrationParameter[]

  @@unique([capabilityId, name])
  @@index([capabilityId])
  @@index([isActive])
}
```

Catatan: kolom `code` pada `DeviceCapabilityItem` sudah **di-drop** oleh migration `20260831140000_drop_device_capability_item_code` — item diidentifikasi oleh `(capabilityId, name)`. **Drift ditemukan:** `seed-device-capabilities.ts` masih memakai `code` untuk item dan unique `capabilityId_code` saat lookup — berpotensi out-of-sync dengan schema saat ini (perlu diverifikasi sebelum re-seed; tidak diperbaiki di audit ini, sesuai batasan "no code changes").

```1343:1388:D:\medcal\packages\db\prisma\schema.prisma
model DeviceCalibrationParameter {
  id               String                         @id @default(cuid())
  deviceTypeId     String
  capabilityItemId String
  code             String
  name             String
  description      String?
  valueType        CalibrationValueType           @default(NUMBER)
  uomId            String?
  toleranceMin     Decimal?                       @db.Decimal(18, 4)
  toleranceMax     Decimal?                       @db.Decimal(18, 4)
  toleranceNote    String?
  decimalPlaces    Int?
  sortOrder        Int                            @default(0)
  isActive         Boolean                        @default(true)
  entryStyle       CalibrationParameterEntryStyle @default(DIRECT_REPLICATES)
  createdAt        DateTime                       @default(now())
  updatedAt        DateTime                       @updatedAt

  deviceType     DeviceType           @relation(fields: [deviceTypeId], references: [id])
  capabilityItem DeviceCapabilityItem @relation(fields: [capabilityItemId], references: [id])
  uom            Uom?                 @relation(fields: [uomId], references: [id])

  testPoints         CalibrationTestPoint[]
  measurementResults MeasurementResult[]

  @@unique([deviceTypeId, capabilityItemId, code])
}
```

Enum terkait:

```378:394:D:\medcal\packages\db\prisma\schema.prisma
enum CalibrationValueType {
  NUMBER
  RATIO
  TEXT
  BOOLEAN
}

enum CalibrationParameterEntryStyle {
  DIRECT_REPLICATES
  LOGGER_SUMMARY
}
```

## 1.3 Relasi DeviceType / DeviceModel / Device ↔ DeviceCapability

| Relasi | Kardinalitas | Catatan |
|---|---|---|
| `DeviceCapability` → `DeviceCapabilityItem` | 1:N | FK `capabilityId` |
| `DeviceCapabilityItem` → `DeviceCalibrationParameter` | 1:N | Unik per `(deviceTypeId, capabilityItemId, code)` |
| `DeviceType` → `DeviceCalibrationParameter` | 1:N | FK `deviceTypeId` |
| `DeviceType` ↔ `DeviceCapability` | M:N via junction | Hanya untuk **urutan tampilan** (`DeviceTypeCapabilityOrder`) |
| Keanggotaan capability per DeviceType | **Derived** | Capability "muncul" untuk DeviceType jika ada ≥1 `DeviceCalibrationParameter` di bawahnya |
| `DeviceModel` → capability | **Tidak ada FK** (sengaja, per komentar schema) | |
| `Device` → capability | **Tidak ada FK** — hanya `deviceTypeId`; parameter di-resolve runtime | |

```1295:1300:D:\medcal\packages\db\prisma\schema.prisma
// Device function/capability master — global (no companyId), same convention
// as Uom/DeviceCategory. DeviceCapabilityItem is a child of a capability
// (e.g. NIBP → Systolic/Diastolic/MAP). DeviceCalibrationParameter is a
// master definition of what is measured/assessed during calibration, unique
// per (deviceTypeId, capabilityItemId, code). Do not FK DeviceModel or Device
// to these models this phase.
```

## 1.4 Penggunaan Runtime

### Saat pembuatan `CalibrationJob` (fan-out dari WorkOrder)

`DeviceCapability`/`DeviceCalibrationParameter` **TIDAK** disentuh sama sekali saat job dibuat:

```577:612:D:\medcal\apps\api\src\modules\work-orders\work-orders.service.ts
private async fanOutCalibrationJobs(
  tx: Prisma.TransactionClient,
  workOrder: WorkOrderWithItems,
): Promise<void> {
  // ...
  for (const item of workOrder.items) {
    // ...
    rows.push({
      companyId: workOrder.companyId,
      workOrderId: workOrder.id,
      purchaseOrderItemId: item.purchaseOrderItemId,
      deviceId: null,
      calibrationRequestItemId: requestItem?.id ?? null,
      customerDeclaredDeviceName: requestItem?.customerDeviceName ?? null,
      // ... tidak ada field capability/parameter
    });
  }
  if (rows.length > 0) {
    await tx.calibrationJob.createMany({ data: rows });
  }
}
```

`DeviceType` untuk parameter di-resolve dari rantai komersial, **bukan** dari `Device` yang sudah dicocokkan on-site:

```1028:1033:D:\medcal\apps\api\src\modules\calibration-jobs\calibration-jobs.service.ts
private resolveJobDeviceTypeId(job: CalibrationJobDetail): string | null {
  return (
    job.calibrationRequestItem?.deviceTypeId ??
    job.purchaseOrderItem?.quotationItem?.requestItem?.deviceTypeId ??
    null
  );
}
```

### Saat eksekusi pengukuran (technician / portal)

Parameter di-load live dan dikelompokkan per capability lewat `GET /calibration-jobs/:id/measurement-parameters`:

```1505:1529:D:\medcal\apps\api\src\modules\calibration-jobs\calibration-jobs.service.ts
async listMeasurementParameters(
  companyId: string,
  jobId: string,
): Promise<JobMeasurementParametersResult> {
  const job = await this.findOne(companyId, jobId);
  const deviceTypeId = this.resolveJobDeviceTypeId(job);
  if (deviceTypeId === null) {
    return { deviceType: null, parameters: [], gridParameters: [], capabilityGroups: [] };
  }
  const [deviceType, rows, gridRows, capabilityOrders] = await Promise.all([
    // findMany DeviceCalibrationParameter dengan include capabilityItem.capability
    prisma.deviceTypeCapabilityOrder.findMany({
      where: { deviceTypeId },
      select: { capabilityId: true, sortOrder: true },
    }),
  ]);
  // ...
}
```

Field yang di-select untuk tampilan/validasi (live, tidak disnapshot ke job):

```319:335:D:\medcal\apps\api\src\modules\calibration-jobs\calibration-jobs.service.ts
const measurementParameterSelect = {
  id: true,
  code: true,
  name: true,
  sortOrder: true,
  decimalPlaces: true,
  toleranceMin: true,
  toleranceMax: true,
  toleranceNote: true,
  uom: { select: { code: true, symbol: true } },
  capabilityItem: {
    select: {
      name: true,
      capability: { select: { id: true, code: true, name: true } },
    },
  },
} as const;
```

Controller:

```368:375:D:\medcal\apps\api\src\modules\calibration-jobs\calibration-jobs.controller.ts
@Get(":id/measurement-parameters")
@RequirePermission("calibrationJob", "read")
async listMeasurementParameters(
  @CompanyId() companyId: string,
  @Param("id") id: string,
): Promise<JobMeasurementParametersResult> {
  return this.service.listMeasurementParameters(companyId, id);
}
```

### Konsumsi Frontend

**`apps/portal`** — CRUD master (`management/device-capabilities/*`, `management/device-calibration-parameters/*`) dan tampilan grouping saat review job (`management/calibration-jobs/[id]/page.tsx`, `use-measurement-results-query.ts`).

**`apps/tech-pwa`** — tidak ada halaman master capability; capability dikonsumsi murni sebagai metadata pengelompokan pengukuran:

```25:33:D:\medcal\apps\tech-pwa\src\app\jobs\[id]\measurements\use-measurements-query.ts
export function useMeasurementParameters(id: string) {
  return useQuery({
    queryKey: parametersKey(id),
    queryFn: () =>
      apiFetch<TechMeasurementParametersResponse>(
        `/calibration-jobs/${id}/measurement-parameters`,
      ),
    enabled: Boolean(id),
  });
}
```

Pemeriksaan fisik dan alat referensi di tech-pwa ada di modul terpisah (`physical-check/`, `reference-equipment/`), bukan lewat DeviceCapability.

## 1.5 Penilaian: Apakah `DeviceCapability` Sudah Memodelkan…?

| Domain bisnis | Dimodelkan di `DeviceCapability`? | Di mana sebenarnya? |
|---|---|---|
| Parameter kalibrasi (nama pengukuran) | Sebagian — hanya taksonomi grouping via Item | `DeviceCalibrationParameter` per `DeviceType` |
| Toleransi / unit / decimal places | Tidak | `DeviceCalibrationParameter` (`toleranceMin/Max/Note`, `uomId`, `decimalPlaces`); override grid di `CalibrationTestPoint` |
| Pemeriksaan fisik | Tidak | `DevicePhysicalCheckItem` + `PhysicalCheckResult` (domain terpisah sepenuhnya) |
| Kebutuhan alat referensi | Tidak | `DeviceTypeEquipmentRequirement` → runtime `JobReferenceEquipmentUsed` |
| Threshold kondisi lingkungan | Sebagian — capability `ENVIRONMENTAL_CONDITIONS` + item (suhu, RH, tegangan) | Threshold numerik/prosa ada di `DeviceCalibrationParameter` + backfill toleransi |
| Threshold keselamatan listrik | Sebagian — capability `ELECTRICAL_SAFETY` + 4 item standar | Threshold di `DeviceCalibrationParameter` per DeviceType |
| Capability flags | Minimal — hanya `isActive` boolean | Tidak ada enum flag/feature toggle di capability |

### Kesimpulan Arsitektural

`DeviceCapability` + `DeviceCapabilityItem` adalah **katalog taksonomi global reusable** (mencerminkan section-header LK: Kondisi Lingkungan, Keselamatan Listrik, NIBP, dll.) — bukan tempat definisi pengukuran lengkap. Tiga lapis yang sudah ada:

1. **Capability** = bagian worksheet LK (section header, mis. "E. Pengukuran Keselamatan Listrik")
2. **Capability Item** = sub-komponen dalam section (mis. "Resistansi Pembumian Protektif")
3. **Calibration Parameter** = baris pengukuran spesifik per `DeviceType` dengan toleransi/UOM/entry style (mis. `BSM_EARTH_RESISTANCE`)

Domain fisik, alat referensi, dan intake lab (`KontrolAlat`) sengaja dipisah dari model capability — sesuai komentar schema dan seed scripts, bukan kelalaian desain.
