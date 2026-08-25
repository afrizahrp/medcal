# Implement DeviceCapability + DeviceCapabilityItem

Implementasikan fitur **Device Capability** sebagai satu master-data feature yang terdiri dari:

```text id="capability-hierarchy"
DeviceCapability
    ↓
DeviceCapabilityItem
```

`DeviceCapabilityItem` adalah child/detail dari `DeviceCapability`.

**Jangan membuat `DeviceCapabilityItem` sebagai menu/sidebar terpisah.**

---

# 1. UI / NAVIGATION

Menu existing:

```text
Device Management
├── Categories
├── Types
├── Models
├── Capabilities        ← implement sekarang
├── Calibration Parameters
└── Devices
```

Implementasikan hanya:

```text
Device Management
└── Capabilities
```

Jangan implementasikan:

```text
Calibration Parameters
Devices
```

pada phase ini.

---

# 2. DOMAIN MEANING

Gunakan definisi berikut sebagai boundary domain.

### DeviceCapability

Menjawab:

> "Kemampuan/fungsi apa yang dimiliki atau dapat dimiliki oleh suatu device?"

Contoh:

```text
NIBP
SpO2
ECG
Temperature
Flow
Pressure
```

### DeviceCapabilityItem

Menjawab:

> "Item/aspek spesifik apa yang berada di dalam capability tersebut?"

Contoh:

```text
NIBP
├── Systolic Pressure
├── Diastolic Pressure
└── MAP

SpO2
├── SpO2
└── Pulse Rate
```

**Jangan memasukkan calibration measurement/error/tolerance/uncertainty sebagai CapabilityItem secara otomatis.**

Hal-hal tersebut akan kita definisikan pada:

```text
DeviceCalibrationParameter
```

yang merupakan phase berikutnya.

---

# 3. IMPORTANT — DO NOT CONFUSE WITH CALIBRATION PARAMETER

Jangan membuat hierarchy seperti:

```text
Capability
└── Error
└── Accuracy
└── Tolerance
└── Uncertainty
```

jika item tersebut sebenarnya merupakan parameter pekerjaan kalibrasi.

Untuk phase ini:

```text
DeviceCapability
    ↓
DeviceCapabilityItem
```

harus tetap merepresentasikan **device capability/function**, bukan hasil pengukuran kalibrasi.

Contoh:

```text
GOOD:

NIBP
├── Systolic Pressure
├── Diastolic Pressure
└── MAP
```

Kemudian phase berikutnya baru:

```text
Systolic Pressure
└── Calibration Parameters
```

---

# 4. IMPORTANT — DO NOT FORCE DEVICE MODEL RELATIONSHIP YET

Untuk phase ini jangan membuat relationship final:

```text
DeviceModel
    ↓
DeviceCapability
```

kecuali existing schema/pattern memang sudah membutuhkan relationship tersebut.

Alasannya:

Capability dan CapabilityItem sedang kita definisikan sebagai master domain terlebih dahulu.

Mapping:

```text
DeviceModel
    ↓
DeviceCapability
```

akan kita finalisasi setelah analysis terhadap assessment/IK/LK selesai.

**Jangan membuat assumption bahwa setiap DeviceModel memiliki semua Capability.**

---

# 5. DATABASE MODEL

Implementasikan:

```text id="models"
DeviceCapability
DeviceCapabilityItem
```

Secara konseptual:

```text id="relation"
DeviceCapability 1 ──── N DeviceCapabilityItem
```

### DeviceCapability

Minimal secara konseptual:

```text id="capability-fields"
id
code
name
description
createdAt
updatedAt
```

### DeviceCapabilityItem

Minimal:

```text id="item-fields"
id
capabilityId
code
name
description
createdAt
updatedAt
```

Ikuti convention existing project untuk:

- id
- timestamps
- soft delete
- audit fields
- field naming
- indexes
- unique constraints

Jangan menambahkan speculative fields.

---

# 6. UNIQUE CONSTRAINT

Capability:

```text
DeviceCapability.code
```

harus unique jika sesuai pattern master data existing.

CapabilityItem:

```text
DeviceCapabilityItem
    (capabilityId, code)
```

dapat menggunakan composite uniqueness jika sesuai convention project.

Alasannya:

```text
NIBP
└── SYSTOLIC

SpO2
└── SYSTOLIC
```

bisa saja valid jika `code` hanya unik dalam parent capability.

Jangan membuat `code` CapabilityItem globally unique tanpa alasan.

---

# 7. BACKEND PATTERN

Sebelum coding, audit:

```text
UOM
DeviceCategory
DeviceType
DeviceModel
Customer
```

Gunakan pattern existing.

Jangan membuat architecture baru.

Implementasikan:

```text
DeviceCapabilityModule
DeviceCapabilityController
DeviceCapabilityService
DeviceCapabilityRepository/query layer jika existing pattern menggunakannya
DTO
Validation
AuthZ
```

Nama actual file/class harus mengikuti convention repository.

---

# 8. API

Implementasikan CRUD sesuai convention existing.

Secara konseptual:

```text
GET    /device-capabilities
GET    /device-capabilities/:id
POST   /device-capabilities
PATCH  /device-capabilities/:id
DELETE /device-capabilities/:id
```

dan child management mengikuti pattern existing.

Jika project menggunakan nested endpoint:

```text
GET    /device-capabilities/:id/items
POST   /device-capabilities/:id/items
PATCH  /device-capabilities/:id/items/:itemId
DELETE /device-capabilities/:id/items/:itemId
```

gunakan pattern tersebut.

**Jangan membuat dua API architecture yang berbeda hanya untuk feature ini.**

---

# 9. PREFER SINGLE RESOURCE UI

Secara UX, user seharusnya melihat:

```text
Capabilities
```

bukan:

```text
Capabilities
Capability Items
```

Contoh list:

| Code | Capability | Items | Actions |
|---|---|---:|---|
| NIBP | Non-Invasive Blood Pressure | 3 | View/Edit |
| SPO2 | Oxygen Saturation | 2 | View/Edit |
| ECG | Electrocardiography | 2 | View/Edit |

Ketika user membuka:

```text
NIBP
```

tampilkan detail:

```text
NIBP
Non-Invasive Blood Pressure

Items
────────────────────────────
SYSTOLIC     Systolic Pressure
DIASTOLIC    Diastolic Pressure
MAP          Mean Arterial Pressure

              + Add Item
```

Ini membuat relationship Capability → CapabilityItem terlihat jelas.

---

# 10. CREATE CAPABILITY

Form:

```text
Code          [________________]

Name          [________________]

Description   [________________]
```

Setelah capability dibuat, user dapat menambahkan item.

---

# 11. CREATE / EDIT CAPABILITY ITEM

Form:

```text
Capability    [ NIBP ]

Code          [ SYSTOLIC ]

Name          [ Systolic Pressure ]

Description   [________________]
```

Capability parent harus mengikuti context halaman.

Jika user sedang berada di:

```text
Capabilities
└── NIBP
```

jangan memaksa user memilih NIBP lagi jika existing UI pattern memungkinkan context-based child creation.

---

# 12. FRONTEND HOOKS

Ikuti pattern UOM/DeviceType/DeviceModel.

Secara konseptual:

```text
useDeviceCapabilities()
useDeviceCapability(id)

useCreateDeviceCapability()
useUpdateDeviceCapability()
useDeleteDeviceCapability()

useDeviceCapabilityItems(capabilityId)
useCreateDeviceCapabilityItem()
useUpdateDeviceCapabilityItem()
useDeleteDeviceCapabilityItem()
```

Nama actual harus mengikuti naming convention existing.

Pastikan:

- query keys konsisten;
- cache invalidation benar;
- mutation menggunakan API client existing;
- loading/error state konsisten;
- permission handling konsisten.

Jangan membuat fetching abstraction baru.

---

# 13. AUTHORIZATION

Gunakan AuthZ existing.

Buat permission sesuai naming convention project untuk:

```text
DeviceCapability
DeviceCapabilityItem
```

Minimal:

```text
read
create
update
delete
```

Jika existing AuthZ model memperlakukan child resource sebagai bagian dari parent resource, ikuti pattern tersebut.

Jangan membuat RBAC/AuthZ baru.

Frontend action juga harus mengikuti permission.

---

# 14. UI

Tambahkan:

```text
Device Management
└── Capabilities
```

Gunakan visual pattern master data yang sudah ada:

```text
UOM
DeviceCategory
DeviceType
DeviceModel
```

Jangan membuat layout baru yang inconsistent.

---

# 15. CAPABILITY LIST

List:

```text
Code
Name
Items Count
Description
Actions
```

Contoh:

```text
NIBP     Non-Invasive Blood Pressure       3
SpO2     Oxygen Saturation                 2
ECG      Electrocardiography               2
```

`Items Count` harus berasal dari actual relation/query, bukan hardcoded.

---

# 16. CAPABILITY DETAIL

Detail capability harus memperlihatkan:

```text
Capability
Code
Name
Description
```

dan child:

```text
Capability Items
```

dengan:

```text
Code
Name
Description
Actions
```

Provide:

```text
Add Item
Edit Item
Delete Item
```

mengikuti permission dan existing UI pattern.

---

# 17. SEED DATA — IMPORTANT

**Jangan membuat seed Capability/CapabilityItem berdasarkan tebakan.**

Kita sedang menggunakan hasil assessment + IK/LK untuk menentukan capability secara evidence-based.

Jadi jangan mengisi arbitrary data seperti:

```text
NIBP
SpO2
ECG
Temperature
```

hanya karena secara umum terlihat masuk akal.

Jika source data yang sudah tersedia di repository belum cukup untuk menentukan seed final:

- implementasikan schema;
- implementasikan CRUD;
- jangan membuat fake seed;
- laporkan bahwa seed final menunggu domain mapping.

**Jangan mengarang capability hanya untuk membuat UI terlihat terisi.**

---

# 18. DO NOT IMPLEMENT CALIBRATION PARAMETER

Jangan membuat:

```text
DeviceCalibrationParameter
```

sekarang.

Jangan memasukkan:

```text
Accuracy
Error
Tolerance
Uncertainty
Reference Value
Test Point
Measurement Result
```

ke Capability atau CapabilityItem hanya untuk mengakomodasi data tersebut.

Itu akan kita modelkan pada phase:

```text
DeviceCalibrationParameter
```

setelah capability mapping dari IK/LK selesai.

---

# 19. DO NOT IMPLEMENT UOM RELATION YET

`UOM` sudah selesai.

Jangan mengubah UOM.

Jangan membuat:

```text
DeviceCapabilityItem.uomId
```

hanya karena beberapa capability item nantinya mempunyai unit.

Hubungan UOM akan ditentukan pada:

```text
DeviceCalibrationParameter
```

phase berikutnya, setelah parameter kalibrasi sudah jelas.

---

# 20. VERIFICATION

Setelah implementasi:

```text
Typecheck
Lint
Backend build
Frontend build
Tests
Prisma validation/generate/migration
```

Test minimal:

### Capability

```text
Create
Read
Update
Delete
Duplicate code rejected
Unauthorized operation rejected
```

### Capability Item

```text
Create under Capability
Read
Update
Delete
Duplicate code within same Capability rejected
Unauthorized operation rejected
```

### Relationship

Pastikan:

```text
Capability
    ↓
Capability Items
```

berfungsi dengan benar.

Pastikan deleting Capability mengikuti referential-integrity behavior yang digunakan project.

---

# 21. FINAL REPORT

Laporkan:

## Pattern Audit

File yang dijadikan reference:

```text
UOM
DeviceCategory
DeviceType
DeviceModel
Customer
```

## Domain

Jelaskan:

```text
DeviceCapability
    ↓
DeviceCapabilityItem
```

dan bagaimana child relationship diimplementasikan.

## Prisma

- models
- relation
- indexes
- unique constraints
- migration

## Backend

- module
- controller
- service
- repository/query
- DTO
- validation
- endpoints
- AuthZ

## Frontend

- page
- list
- detail
- item management
- query hooks
- mutation hooks
- query keys
- cache invalidation
- permission handling

## Seed

Jelaskan apakah seed dibuat atau sengaja belum dibuat.

**Jangan mengarang seed.**

## Verification

```text
Typecheck:
Lint:
Backend build:
Frontend build:
Tests:
Migration:
```

## Scope Compliance

Pastikan:

- hanya `DeviceCapability` + `DeviceCapabilityItem` yang diimplementasikan;
- `DeviceCalibrationParameter` belum dibuat;
- `Device` belum dibuat;
- `CalibrationRequestItem` belum disentuh;
- `UOM` tidak diubah;
- `DeviceCategory`, `DeviceType`, dan `DeviceModel` tidak direfactor;
- tidak ada `DeviceManufacturer`;
- tidak ada unrelated refactor.