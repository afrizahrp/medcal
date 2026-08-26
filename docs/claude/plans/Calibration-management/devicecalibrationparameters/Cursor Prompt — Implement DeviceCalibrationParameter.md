# Implement DeviceCalibrationParameter

Implementasikan master data **DeviceCalibrationParameter** sebagai kelanjutan dari domain:

```text id="domain-flow"
DeviceCapability
    ↓
DeviceCapabilityItem
    ↓
DeviceCalibrationParameter
    ↓
UOM
```

`UOM`, `DeviceCategory`, `DeviceType`, dan `DeviceModel` sudah diimplementasikan.

`DeviceCapability` dan `DeviceCapabilityItem` sedang dalam proses backfill data dan dapat dilengkapi kemudian.

Untuk phase ini, fokus pada **model, backend, AuthZ, query/mutation hooks, dan UI DeviceCalibrationParameter** menggunakan pattern existing.

---

# 1. TUJUAN

Implementasikan:

```text id="scope"
DeviceCalibrationParameter
├── Prisma model
├── Backend module
├── Controller
├── Service
├── Repository/query layer jika existing pattern menggunakannya
├── DTO
├── Validation
├── AuthZ
├── API endpoint
├── Query hooks
├── Mutation hooks
└── UI CRUD
```

**Jangan membuat architecture/pattern baru.**

Audit terlebih dahulu implementasi:

```text id="references"
UOM
DeviceCategory
DeviceType
DeviceModel
DeviceCapability
DeviceCapabilityItem
Customer
```

Gunakan pattern yang sudah berjalan.

Jika `DeviceCapability` / `DeviceCapabilityItem` belum mempunyai data lengkap, gunakan struktur/model yang sudah ada sebagai reference, tetapi jangan membuat fake data.

---

# 2. DOMAIN MEANING

`DeviceCalibrationParameter` menjawab:

> **Apa yang diukur/dinilai dalam proses kalibrasi?**

Ini berbeda dari:

```text id="boundary"
DeviceCapability
= kemampuan/fungsi device

DeviceCapabilityItem
= aspek/item spesifik dari capability

DeviceCalibrationParameter
= parameter yang digunakan untuk melakukan/menilai kalibrasi
```

Contoh konseptual:

```text id="example"
DeviceCapability
└── NIBP
      └── DeviceCapabilityItem
            └── Systolic Pressure
                  └── DeviceCalibrationParameter
                        ├── Reference Value
                        ├── Indicated Value
                        └── Error
```

**Namun contoh di atas hanya menjelaskan hierarchy. Jangan membuat parameter tersebut sebagai seed kecuali didukung oleh source/domain data yang sudah tersedia.**

---

# 3. IMPORTANT — DO NOT INVENT PARAMETERS

Saat ini kita sedang mengumpulkan/backfill data DeviceModel, DeviceCapability, dan DeviceCapabilityItem dari sumber yang relevan.

Karena itu:

**Jangan membuat parameter berdasarkan asumsi umum.**

Jangan otomatis membuat:

```text id="no-fake"
Accuracy
Error
Tolerance
Uncertainty
Reference Value
Indicated Value
Test Point
Measurement Result
```

sebagai master parameter hanya karena istilah tersebut umum dalam kalibrasi.

Jika belum ada source yang mendukung parameter tersebut:

> buat CRUD/schema/UI tetapi jangan membuat fake seed.

---

# 4. RELATIONSHIP TO CAPABILITY ITEM

Secara domain:

```text id="relationship"
DeviceCapabilityItem 1 ──── N DeviceCalibrationParameter
```

Artinya satu Capability Item dapat mempunyai beberapa calibration parameter.

Contoh:

```text id="relationship-example"
Capability Item
└── Systolic Pressure
      ├── Parameter A
      ├── Parameter B
      └── Parameter C
```

**Gunakan relationship ini hanya jika struktur `DeviceCapabilityItem` yang sudah ada memang memungkinkan foreign key tersebut.**

Jika implementasi `DeviceCapabilityItem` saat ini belum final atau belum tersedia relationship-nya, jangan melakukan refactor besar.

Implementasikan `DeviceCalibrationParameter` dengan dependency yang minimal dan dokumentasikan relationship yang masih perlu dihubungkan pada phase backfill.

---

# 5. UOM RELATIONSHIP

`UOM` sudah selesai dan merupakan centralized master untuk satuan.

`DeviceCalibrationParameter` boleh memiliki:

```text id="uom-relation"
uomId
```

dengan relationship:

```text id="uom-relation-diagram"
DeviceCalibrationParameter
          ↓
         UOM
```

Contoh konseptual:

```text id="uom-example"
Systolic Pressure
    UOM → mmHg
```

atau:

```text id="uom-example-2"
Temperature
    UOM → °C
```

### IMPORTANT

Gunakan existing `UOM` model.

Jangan:

- membuat unit string baru;
- membuat model unit baru;
- menduplikasi UOM;
- menambahkan conversion engine;
- mengubah UOM.

---

# 6. DATA MODEL

Minimal secara konseptual:

```text id="model"
DeviceCalibrationParameter
├── id
├── capabilityItemId
├── code
├── name
├── description
├── uomId
├── createdAt
└── updatedAt
```

Tetapi **field final harus mengikuti existing project conventions**.

Jangan menambahkan field speculative seperti:

```text id="no-speculative"
tolerance
accuracy
uncertainty
minimum
maximum
nominalValue
referenceValue
measurementValue
```

Field-field tersebut jangan dimasukkan ke master parameter hanya karena terlihat berguna.

Jika nanti diperlukan, kita akan menentukan model khusus berdasarkan data IK/LK.

---

# 7. IMPORTANT DOMAIN BOUNDARY

Jangan mencampurkan:

```text id="boundary-2"
Calibration Parameter
```

dengan:

```text id="calibration-execution"
Calibration Result
Measurement Result
Tolerance
Uncertainty
Test Point
Reference Standard
Actual Measurement
Pass/Fail
```

`DeviceCalibrationParameter` pada phase ini adalah **master definition**.

Bukan hasil pekerjaan kalibrasi.

Jadi:

```text id="master-vs-transaction"
DeviceCalibrationParameter
        = MASTER

CalibrationRequest / CalibrationResult
        = TRANSACTION
```

Jangan implementasikan transaction/result model pada phase ini.

---

# 8. CODE & NAME

Gunakan:

```text id="code-name"
code
name
description
```

Contoh format:

```text id="example-code"
code = "SYSTOLIC_PRESSURE"
name = "Systolic Pressure"
```

Tetapi **jangan membuat seed tersebut jika belum ada source yang memvalidasinya**.

Code harus mengikuti convention master data existing.

---

# 9. UNIQUENESS

Evaluasi unique constraint berdasarkan hierarchy.

Jika parameter hanya unik dalam satu CapabilityItem, pertimbangkan:

```text id="composite"
(capabilityItemId, code)
```

bukan:

```text id="global"
code UNIQUE
```

Contoh:

```text id="same-code-example"
Capability Item A
└── ACCURACY

Capability Item B
└── ACCURACY
```

bisa saja valid.

Ikuti existing master-data convention dan hasil domain audit.

Jangan membuat `code` globally unique tanpa alasan.

---

# 10. BACKEND

Audit pattern existing:

```text id="backend-reference"
UOM
DeviceCategory
DeviceType
DeviceModel
DeviceCapability
DeviceCapabilityItem
Customer
```

Implementasikan:

```text id="backend"
DeviceCalibrationParameterModule
DeviceCalibrationParameterController
DeviceCalibrationParameterService
DeviceCalibrationParameterRepository/query jika existing pattern menggunakannya
DTO
Validation
AuthZ
```

Nama file/class harus mengikuti convention repository.

---

# 11. API

Implementasikan CRUD mengikuti convention existing.

Secara konseptual:

```text id="api"
GET    /device-calibration-parameters
GET    /device-calibration-parameters/:id
POST   /device-calibration-parameters
PATCH  /device-calibration-parameters/:id
DELETE /device-calibration-parameters/:id
```

Tetapi gunakan endpoint naming convention aktual project.

Jika existing child-resource pattern mendukung:

```text id="nested-api"
GET /device-capability-items/:id/calibration-parameters
POST /device-capability-items/:id/calibration-parameters
```

gunakan pattern tersebut.

Jangan membuat API architecture baru.

---

# 12. LIST / QUERY

List minimal menampilkan:

```text id="list"
Capability Item
Parameter Code
Parameter Name
UOM
Description
Actions
```

Jika existing pattern memungkinkan filtering:

```text id="filters"
DeviceCapability
DeviceCapabilityItem
UOM
```

gunakan pattern filter existing.

Search minimal terhadap:

```text id="search"
code
name
```

dan relational search jika memang didukung oleh existing query architecture.

---

# 13. FRONTEND

Tambahkan submenu:

```text id="navigation"
Device Management
├── Categories
├── Types
├── Models
├── Capabilities
├── Calibration Parameters    ← implement
└── Devices
```

Gunakan icon/navigation pattern yang sudah ada.

Jangan mengubah menu lain.

---

# 14. UI

Buat halaman:

```text id="page"
Calibration Parameters
```

Gunakan pattern UI master-data:

```text id="ui-reference"
UOM
DeviceCategory
DeviceType
DeviceModel
```

### List

```text id="table"
Capability Item
Code
Name
UOM
Description
Actions
```

### Form

Minimal:

```text id="form"
Capability Item    [ Select ▼ ]

Code               [________________]

Name               [________________]

UOM                [ Select ▼ ]

Description        [________________]
```

`UOM` harus mengambil data dari existing UOM query/API.

Jangan hardcode unit.

`Capability Item` harus mengambil data dari existing DeviceCapabilityItem query/API jika sudah tersedia.

Jangan hardcode capability item.

---

# 15. UOM SELECT

UOM adalah centralized master.

Gunakan:

```text id="uom-select"
useUoms()
```

atau hook equivalent yang sudah digunakan project.

User harus memilih UOM dari master.

Jangan menyediakan free-text UOM pada form.

---

# 16. CAPABILITY ITEM SELECT

Jika DeviceCapabilityItem API/hook sudah tersedia:

```text id="capability-select"
useDeviceCapabilityItems()
```

gunakan itu.

Jika belum tersedia karena feature Capability masih dalam proses:

- jangan membuat duplicate API;
- jangan hardcode item;
- jangan membuat temporary UOM-like workaround.

Dokumentasikan dependency tersebut dan implementasikan UI berdasarkan existing architecture yang tersedia.

Jika nested creation dari Capability Item merupakan existing pattern, ikuti pattern tersebut.

---

# 17. QUERY & MUTATION HOOKS

Ikuti pattern UOM/DeviceModel.

Secara konseptual:

```text id="hooks"
useDeviceCalibrationParameters()
useDeviceCalibrationParameter(id)

useCreateDeviceCalibrationParameter()
useUpdateDeviceCalibrationParameter()
useDeleteDeviceCalibrationParameter()
```

Nama aktual mengikuti convention project.

Pastikan:

- query keys konsisten;
- cache invalidation benar;
- API client existing digunakan;
- loading/error state konsisten;
- permission handling konsisten.

Jangan membuat data-fetching abstraction baru.

---

# 18. AUTHORIZATION

Ikuti AuthZ existing.

Buat permission sesuai naming convention project untuk:

```text id="permissions"
DeviceCalibrationParameter
```

Minimal:

```text id="permission-actions"
read
create
update
delete
```

Jika project memperlakukan child/master resource dengan permission inheritance, ikuti pattern existing.

Jangan membuat RBAC/AuthZ baru.

---

# 19. SEED DATA

**Do not invent seed data.**

Untuk phase ini:

```text id="seed-policy"
Schema        → YES
CRUD          → YES
UI            → YES
AuthZ         → YES
Fake seed     → NO
```

Kecuali terdapat source/domain data yang sudah tersedia dan dapat diverifikasi.

Jangan membuat parameter hanya supaya halaman terlihat populated.

---

# 20. NO CALIBRATION EXECUTION LOGIC

Jangan implementasikan:

```text id="no-execution"
CalibrationResult
Measurement
TestPoint
ReferenceStandard
Tolerance
Uncertainty
PassFail
Certificate
Worksheet
```

Semua itu berada di luar scope phase ini.

---

# 21. NO DEVICE IMPLEMENTATION

Jangan menyentuh:

```text id="no-device"
Device
CalibrationRequestItem
```

Device akan dibuat setelah master taxonomy dan model sudah cukup matang.

---

# 22. NO REFACTOR

Jangan refactor:

```text id="no-refactor"
UOM
DeviceCategory
DeviceType
DeviceModel
Customer
```

kecuali ada perubahan yang benar-benar diperlukan oleh foreign-key relationship dan sudah sesuai existing architecture.

Jangan melakukan unrelated cleanup.

Jangan membuat generic abstraction baru hanya untuk feature ini.

---

# 23. VERIFICATION

Setelah implementasi:

```text id="verification"
Typecheck
Lint
Backend build
Frontend build
Tests
Prisma validation/generate/migration
```

Test minimal:

### CRUD

```text id="crud-tests"
Create
Read
Update
Delete
```

### Validation

```text id="validation-tests"
Code required
Name required
UOM relation valid
CapabilityItem relation valid
Duplicate constraint enforced
```

### Authorization

```text id="auth-tests"
Unauthorized read rejected
Unauthorized create rejected
Unauthorized update rejected
Unauthorized delete rejected
```

### Relations

Pastikan:

```text id="relation-tests"
DeviceCapabilityItem
        ↓
DeviceCalibrationParameter
        ↓
UOM
```

berfungsi sesuai schema yang diimplementasikan.

---

# 24. FINAL REPORT

Laporkan:

## Pattern Audit

File yang dijadikan reference:

```text id="report-reference"
UOM
DeviceCategory
DeviceType
DeviceModel
DeviceCapability
DeviceCapabilityItem
Customer
```

## Domain

Jelaskan boundary:

```text id="report-domain"
Capability
    ↓
CapabilityItem
    ↓
CalibrationParameter
    ↓
UOM
```

## Prisma

- model
- relations
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
- table
- form
- query hooks
- mutation hooks
- query keys
- cache invalidation
- UOM selector
- CapabilityItem selector
- permission handling

## Seed

Jelaskan apakah seed dibuat.

Default expectation:

```text
No fabricated seed.
```

## Verification

```text id="verification-report"
Typecheck:
Lint:
Backend build:
Frontend build:
Tests:
Migration:
```

## Scope Compliance

Pastikan:

- `DeviceCalibrationParameter` diimplementasikan;
- UOM digunakan sebagai centralized master;
- CapabilityItem digunakan sebagai parent jika sudah tersedia;
- tidak ada parameter fiktif;
- tidak ada calibration execution/result model;
- tidak ada Device;
- tidak ada CalibrationRequestItem;
- UOM tidak dimodifikasi;
- DeviceCategory/Type/Model tidak direfactor;
- tidak ada unrelated changes.