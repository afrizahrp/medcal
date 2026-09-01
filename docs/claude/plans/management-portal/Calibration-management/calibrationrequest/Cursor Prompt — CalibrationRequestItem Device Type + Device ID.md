# Narrow Task — CalibrationRequestItem: Device Type + Customer Device ID

## OBJECTIVE

Perbaiki **Calibration Request Create/Edit UI** agar setiap item/device pada Calibration Request memiliki:

```text
Device Type *
Device ID *
Notes
```

dengan contract:

```text
CalibrationRequestItem
├── deviceTypeId → DeviceType.id
├── deviceId     → String
└── notes
```

### DOMAIN MEANING — LOCKED

`deviceTypeId` adalah **jenis/katalog alat** yang dipilih dari master `DeviceType`.

`deviceId` adalah **ID/identifier physical device milik Customer**, yang dimasukkan user secara manual.

Contoh:

```text
Customer:
PT Bumi Indah Putra

Calibration Request Item:

Device Type:
Blood Pressure Monitor

Device ID:
BPM-001

Notes:
Kalibrasi tahunan
```

**`deviceId` BUKAN foreign key ke `Device.id`.**

---

# 1. VERY IMPORTANT — DO NOT TOUCH DEVICE

`Device` master sudah selesai.

**JANGAN mengubah apapun pada:**

```text
Device
Device CRUD
Device UI
DeviceController
DeviceService
Device DTO
Device query hooks
Device API
DeviceType → Device relation
```

Jangan mengubah:

```text
Device.deviceTypeId
```

Jangan membuat:

```text
CalibrationRequestItem.deviceId → Device.id
```

Jangan membuat Device lookup.

Jangan membuat Customer Device lookup.

---

# 2. CURRENT UI

Saat ini bagian Devices kurang lebih:

```text
Devices

[ + Add Device ]

Device ID *                         Notes
[ Enter device ID ]                [ Notes for this device... ]
```

Ubah menjadi:

```text
Devices

[ + Add Device ]

Device Type *                       Device ID *
[ Select Device Type ]              [ Enter device ID ]

Notes
[ Notes for this device... ]
```

Jika layout existing lebih baik menggunakan satu row untuk tiga field, ikuti existing form pattern.

Jangan melakukan redesign besar terhadap Calibration Request page.

---

# 3. DEVICE TYPE SELECTOR

Tambahkan field:

```text
Device Type *
```

Gunakan existing `DeviceType` API/query/hook.

**Jangan hardcode daftar DeviceType di frontend.**

Conceptually:

```text
useDeviceTypes()
```

atau equivalent existing hook.

Selector harus menampilkan nama DeviceType yang sudah ada pada master.

Contoh:

```text
Device Type *
[ Blood Pressure Monitor ▼ ]
```

---

# 4. DEVICE CATEGORY

User **tidak perlu memilih DeviceCategory secara terpisah**.

`DeviceCategory` adalah parent/category dari `DeviceType`.

Jangan tambahkan:

```text
Device Category *
[ ... ]
```

ke form.

Jika berguna untuk membantu user memahami pilihan, category boleh ditampilkan sebagai informasi pada option/selector, misalnya:

```text
Patient Care
  Blood Pressure Monitor

Patient Care
  Patient Monitor

Respiratory
  Ventilator
```

Tetapi **field yang disimpan tetap hanya `deviceTypeId`**.

Jangan membuat `categoryId` pada `CalibrationRequestItem`.

---

# 5. DEVICE ID

Pertahankan:

```text
deviceId
```

sebagai **String/free-text**.

Contoh:

```text
Device ID *
[ BPM-001 ]
```

User memasukkan identifier alat yang diberikan/digunakan oleh Customer.

Jangan mengubahnya menjadi:

```text
deviceId: UUID
```

atau:

```text
deviceId → Device.id
```

---

# 6. DATABASE CONTRACT

Audit existing `CalibrationRequestItem` Prisma model terlebih dahulu.

Tambahkan:

```text
deviceTypeId
```

sebagai required FK:

```text
CalibrationRequestItem.deviceTypeId
    ↓
DeviceType.id
```

Sedangkan:

```text
CalibrationRequestItem.deviceId
```

tetap existing String field.

Target konseptual:

```text
CalibrationRequestItem
├── id
├── calibrationRequestId
├── deviceTypeId       REQUIRED FK → DeviceType
├── deviceId           REQUIRED STRING
├── notes
└── existing fields
```

**Jangan menghapus atau rename existing `deviceId`.**

Ikuti naming/type/convention aktual repository.

---

# 7. EXISTING DATA CHECK

Sebelum membuat migration:

1. Periksa jumlah existing `CalibrationRequestItem`.
2. Jika tabel kosong, required `deviceTypeId` dapat diterapkan langsung.
3. Jika ada existing rows, **STOP sebelum membuat NOT NULL migration**.

Jangan menebak DeviceType untuk existing data.

Jangan menggunakan:

```text
UNKNOWN
OTHER
DEFAULT
```

sebagai placeholder.

Jika existing rows > 0:

```text
STOP
```

dan laporkan jumlah rows serta perlunya confirmed backfill mapping.

---

# 8. BACKEND CONTRACT

Update DTO/schema untuk CalibrationRequestItem agar menerima:

```text
deviceTypeId
deviceId
notes
```

`deviceTypeId` wajib.

`deviceId` tetap string sesuai existing contract.

Backend harus memvalidasi bahwa:

```text
deviceTypeId
```

merupakan DeviceType yang valid/existing.

Gunakan existing validation/service pattern.

---

# 9. DO NOT VALIDATE DEVICE OWNERSHIP

Jangan melakukan:

```text
deviceId → Device.id lookup
```

Jangan melakukan:

```text
Device.customerId === CalibrationRequest.customerId
```

karena `deviceId` pada CalibrationRequestItem adalah **identifier string milik Customer**, bukan reference ke Device master.

Dengan demikian:

```text
Customer
    ↓
CalibrationRequest
    ↓
CalibrationRequestItem
       ├── deviceTypeId → catalog
       └── deviceId     → customer-provided identifier
```

---

# 10. CREATE FORM

Setiap device/item row harus menjadi:

```text
Device Type *
[ Blood Pressure Monitor ▼ ]

Device ID *
[ BPM-001 ]

Notes
[ Notes for this device... ]
```

Contoh dua item:

```text
┌──────────────────────────────────────────────────────┐
│ Device Type *                                        │
│ [ Blood Pressure Monitor ▼ ]                         │
│                                                      │
│ Device ID *                  Notes                   │
│ [ BPM-001 ]                  [ Annual calibration ]  │
│                                               [ 🗑 ] │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│ Device Type *                                        │
│ [ Patient Monitor ▼ ]                                │
│                                                      │
│ Device ID *                  Notes                   │
│ [ PM-002 ]                   [ Routine calibration ] │
│                                               [ 🗑 ] │
└──────────────────────────────────────────────────────┘
```

Tetap gunakan existing visual/form pattern.

---

# 11. EDIT FORM

Saat edit Calibration Request:

```text
Device Type
[ existing DeviceType ]

Device ID
[ existing string ]

Notes
[ existing notes ]
```

Pastikan existing `deviceId` string tidak hilang atau dikonversi.

---

# 12. QUERY / HOOK

Gunakan existing DeviceType query hook.

Jangan membuat query hook khusus CalibrationRequest jika tidak diperlukan.

Conceptually:

```text
useDeviceTypes()
```

atau existing equivalent.

Jika selector membutuhkan pagination/search, gunakan existing DeviceType query capability.

---

# 13. REQUEST PAYLOAD

Pastikan create/update payload berubah dari:

```json
{
  "deviceId": "BPM-001",
  "notes": "..."
}
```

menjadi:

```json
{
  "deviceTypeId": "<DeviceType.id>",
  "deviceId": "BPM-001",
  "notes": "..."
}
```

Jangan mengirim:

```json
{
  "deviceId": "<Device.id>"
}
```

---

# 14. DUPLICATE RULE

Jangan membuat aturan duplicate baru tanpa evidence dari existing business rules.

Namun minimal frontend harus memastikan satu row/item tidak kehilangan required:

```text
deviceTypeId
deviceId
```

Jika existing backend sudah memiliki duplicate handling untuk CalibrationRequestItem, pertahankan.

Jangan mengubah business rule duplicate hanya untuk task ini.

---

# 15. CUSTOMER CHANGE

**Jangan membuat logic Device lookup ketika Customer berubah.**

Tidak ada dependency:

```text
Customer → Device lookup
```

karena `deviceId` adalah free-text identifier milik customer.

Customer tetap berada di level:

```text
CalibrationRequest.customerId
```

dan `deviceTypeId` hanya memilih catalog type.

---

# 16. NO DEVICE MASTER LINK

Jangan membuat:

```text
CalibrationRequestItem.deviceId
    → Device.id
```

Jangan membuat:

```text
CalibrationRequestItem.deviceId
    → Device.uuid
```

Jangan membuat:

```text
deviceId relation
```

pada Prisma.

`deviceId` tetap scalar String.

---

# 17. NO DEVICE MODEL

Jangan menambahkan:

```text
deviceModelId
```

ke CalibrationRequestItem.

Jangan menampilkan DeviceModel selector.

DeviceModel belum menjadi bagian dari CalibrationRequestItem contract.

---

# 18. NO CAPABILITY CHANGES

Jangan menyentuh:

```text
DeviceCapability
DeviceCapabilityItem
DeviceCalibrationParameter
UOM
```

`deviceTypeId` hanya menunjuk ke `DeviceType`.

Jangan menambahkan capability selector pada CalibrationRequest.

---

# 19. NO CALIBRATION PARAMETER SELECTION

Jangan menampilkan:

```text
Calibration Parameters
```

pada Calibration Request Create form pada task ini.

Parameter akan digunakan pada tahap workflow kalibrasi berikutnya.

---

# 20. UI LABEL

Gunakan label yang mudah dipahami user.

Prefer:

```text
Device Type *
Device ID *
Notes
```

Bukan:

```text
Device Type ID
Device UUID
deviceTypeId
```

Internal ID tidak boleh tampil ke user.

---

# 21. EMPTY STATE

Jika tidak ada DeviceType:

```text
Device Type *
[ No device types available ]
```

ikuti existing selector/error pattern.

Jangan membuat DeviceType baru dari halaman Calibration Request.

---

# 22. AUTHZ

Gunakan existing authorization untuk membaca DeviceType.

Jangan membuat permission baru.

CalibrationRequest authorization tetap mengikuti existing implementation.

---

# 23. TESTS

Update/add tests minimal.

### Valid item

```text
deviceTypeId = valid DeviceType
deviceId = "BPM-001"
→ accepted
```

### Missing DeviceType

```text
deviceTypeId = null
→ rejected
```

### Invalid DeviceType

```text
deviceTypeId = non-existent ID
→ rejected
```

### Device ID

```text
deviceId = "BPM-001"
→ treated as String
```

Tidak ada lookup ke `Device`.

### Existing CalibrationRequest behavior

Pastikan:

```text
create
list
get
update
submit
cancel
```

tidak regress akibat penambahan field item.

Gunakan existing test suite.

---

# 24. MIGRATION

Jika `CalibrationRequestItem` kosong:

buat migration:

```text
deviceTypeId NOT NULL
FOREIGN KEY → DeviceType.id
```

ikuti existing FK convention.

Jika tabel tidak kosong:

**STOP migration dan laporkan.**

Jangan melakukan automatic backfill.

---

# 25. VERIFICATION

Wajib:

```text
Prisma validation
Prisma generate
Migration
Typecheck
Backend build
Frontend build
Relevant tests
```

Jika repository mempunyai test database/migration verification, gunakan workflow existing.

---

# 26. FINAL REPORT

Laporkan secara ringkas:

## Schema

```text
CalibrationRequestItem.deviceTypeId
→ REQUIRED FK
→ DeviceType.id

CalibrationRequestItem.deviceId
→ STRING
→ NOT a FK to Device
```

## UI

Konfirmasi:

```text
Device Type selector:
Device ID free-text:
Notes:
```

## Backend

Konfirmasi:

```text
deviceTypeId validation:
deviceId remains String:
```

## Migration

```text
Existing CalibrationRequestItem rows:
Migration:
Applied:
```

## Tests

```text
Valid item:
Missing deviceTypeId:
Invalid deviceTypeId:
Existing CalibrationRequest tests:
```

## Verification

```text
Prisma validation:
Prisma generate:
Typecheck:
Backend build:
Frontend build:
Tests:
```

## STRICT SCOPE CHECK

Pastikan task ini **tidak mengubah**:

```text
Device
Device CRUD
Device UI
DeviceModel
DeviceCapability
DeviceCapabilityItem
DeviceCalibrationParameter
UOM
Quotation
PurchaseOrder
WorkOrder
CalibrationJob
Certificate
```

Dan **tidak membuat**:

```text
CalibrationRequestItem.deviceId → Device.id
Device lookup
Customer Device lookup
DeviceModel selector
DeviceCategory selector
CalibrationParameter selector
```

Satu-satunya domain change adalah:

```text
CalibrationRequestItem
    + deviceTypeId → DeviceType
```

sementara:

```text
CalibrationRequestItem.deviceId
    tetap String identifier milik Customer.
```