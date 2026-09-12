# Implement DeviceModel

Implementasikan master data **DeviceModel** sebagai kelanjutan dari:

```text
DeviceCategory
    ↓
DeviceType
    ↓
DeviceModel
```

`UOM`, `DeviceCategory`, dan `DeviceType` sudah selesai. Gunakan implementasi yang sudah berjalan tersebut sebagai reference.

---

# 1. TUJUAN

Buat fitur lengkap:

```text
DeviceModel
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

Audit terlebih dahulu implementasi `DeviceType`, `DeviceCategory`, dan `UOM` yang saat ini sudah berjalan.

Gunakan pattern tersebut secara konsisten.

---

# 2. DOMAIN MODEL

Relationship:

```text
DeviceCategory
    ↓
DeviceType
    ↓
DeviceModel
```

Satu `DeviceType` dapat memiliki banyak `DeviceModel`.

```text
DeviceType 1 ──── N DeviceModel
```

Contoh konkret:

```text
DeviceType
└── Blood Pressure Monitor
      │
      ├── Manufacturer: Omron
      │   Model: HEM-7120
      │
      ├── Manufacturer: Omron
      │   Model: HEM-7130
      │
      └── Manufacturer: Microlife
          Model: BP A2 Basic
```

Contoh lain:

```text
DeviceType
└── Patient Monitor
      │
      ├── Manufacturer: Mindray
      │   Model: BeneVision N12
      │
      └── Manufacturer: Nihon Kohden
          Model: BSM-3562
```

**Catatan:** contoh di atas hanya untuk menjelaskan struktur data. Jangan melakukan seed model-model tersebut kecuali memang datanya sudah tersedia di repository/source.

---

# 3. DEVICE MODEL FIELDS

Untuk phase ini, gunakan struktur sederhana:

```text
DeviceModel
├── id
├── deviceTypeId
├── manufacturer
├── model
├── description
├── createdAt
└── updatedAt
```

Ikuti convention field existing project.

### PENTING

`manufacturer` **adalah String field biasa untuk saat ini**.

Jangan membuat:

```text
DeviceManufacturer
```

Jangan membuat foreign key:

```text
manufacturerId
```

Jangan membuat master manufacturer.

Jangan membuat normalization tambahan.

Alasannya: kebutuhan untuk menjadikan Manufacturer sebagai master entity belum dikonfirmasi dan belum diperlukan untuk phase ini.

Jika di masa depan data nyata menunjukkan bahwa Manufacturer perlu menjadi master tersendiri, itu dapat dilakukan sebagai evolution/migration terpisah.

---

# 4. MODEL UNIQUENESS

Perhatikan bahwa kombinasi:

```text
DeviceType
Manufacturer
Model
```

secara domain sangat mungkin merupakan identitas model produk.

Evaluasi apakah existing project convention memungkinkan unique composite:

```text
(deviceTypeId, manufacturer, model)
```

Jika ya dan tidak bertentangan dengan architecture existing, gunakan constraint tersebut.

Jika existing master-data pattern menggunakan mekanisme uniqueness yang berbeda, ikuti pattern tersebut.

**Jangan membuat asumsi bahwa `model` saja harus globally unique.**

Contoh:

```text
Blood Pressure Monitor
    Omron / Model-X

Patient Monitor
    Manufacturer-X / Model-X
```

`Model-X` bisa saja muncul pada DeviceType berbeda.

---

# 5. PRISMA

Buat model Prisma `DeviceModel` mengikuti style dan convention model existing.

Relationship:

```text
DeviceType 1 ──── N DeviceModel
```

Tambahkan:

- foreign key
- index
- unique constraint jika sesuai hasil audit existing pattern
- timestamps
- soft-delete/audit field jika pattern existing menggunakannya

Jangan menambahkan field speculative.

---

# 6. BACKEND

Audit implementasi `DeviceType` dan `UOM`.

Ikuti pattern yang sama untuk:

```text
DeviceModelModule
DeviceModelController
DeviceModelService
DeviceModelRepository/query
DTO
Validation
```

Gunakan naming convention repository.

Endpoint mengikuti convention existing.

Secara konseptual:

```text
GET    /device-models
GET    /device-models/:id
POST   /device-models
PATCH  /device-models/:id
DELETE /device-models/:id
```

Tetapi **jangan memaksakan path tersebut** jika existing project mempunyai naming convention berbeda.

---

# 7. LIST / QUERY

DeviceModel list harus dapat menampilkan relationship:

```text
Device Type
Manufacturer
Model
Description
```

Jika existing master-data list mendukung search, pagination, sorting, gunakan mekanisme yang sama.

Minimal search harus dapat membantu mencari:

```text
manufacturer
model
```

dan jika pattern existing mendukung relational search:

```text
deviceType.name
```

Gunakan query mechanism existing.

Jangan membuat search implementation baru jika sudah ada abstraction yang digunakan UOM/DeviceType.

---

# 8. FILTER BY DEVICE TYPE

Karena:

```text
DeviceType
    ↓
DeviceModel
```

maka list DeviceModel sebaiknya dapat difilter berdasarkan `DeviceType`.

Contoh konseptual:

```text
Device Type: [ Patient Monitor ▼ ]
```

atau:

```text
GET /device-models?deviceTypeId=...
```

Ikuti pattern filter existing.

---

# 9. AUTHORIZATION

Ikuti AuthZ yang sudah digunakan oleh:

```text
UOM
DeviceCategory
DeviceType
Customer
```

Jangan membuat sistem permission baru.

Buat permission DeviceModel dengan naming convention existing.

Minimal capability:

```text
read
create
update
delete
```

Frontend juga harus menghormati permission yang sama.

---

# 10. FRONTEND

Tambahkan halaman:

```text
Device Management
└── Models
```

Gunakan UI pattern yang sama dengan:

```text
UOM
DeviceCategory
DeviceType
```

Jangan membuat desain baru hanya untuk DeviceModel.

---

# 11. DEVICE MODEL LIST

Tampilkan:

```text
Device Type
Manufacturer
Model
Description
Actions
```

Contoh:

| Device Type | Manufacturer | Model |
|---|---|---|
| Blood Pressure Monitor | Omron | HEM-7120 |
| Blood Pressure Monitor | Omron | HEM-7130 |
| Patient Monitor | Mindray | BeneVision N12 |

Gunakan table/card density yang sama dengan master-data UI existing.

---

# 12. CREATE / EDIT FORM

Form minimal:

```text
Device Type       [ Select ▼ ]

Manufacturer      [________________]

Model             [________________]

Description       [________________]
```

### Device Type

Gunakan existing query hook untuk mengambil DeviceType.

Jangan membuat hardcoded DeviceType list.

### Manufacturer

Gunakan:

```text
Text Input
```

Bukan select.

Bukan relation.

### Model

Gunakan:

```text
Text Input
```

### Description

Gunakan component textarea/input sesuai pattern existing.

---

# 13. QUERY & MUTATION HOOKS

Buat hooks mengikuti pattern DeviceType/UOM.

Secara konseptual:

```text
useDeviceModels()
useDeviceModel(id)
useCreateDeviceModel()
useUpdateDeviceModel()
useDeleteDeviceModel()
```

Nama aktual harus mengikuti convention project.

Pastikan:

- query keys konsisten;
- cache invalidation benar;
- mutation mengikuti API client existing;
- loading/error state mengikuti existing pattern;
- permission handling mengikuti existing pattern.

Jangan membuat data-fetching abstraction baru.

---

# 14. SEED DATA

**Jangan membuat seed manufacturer/model berdasarkan tebakan.**

Dokumen Kemenkes yang kita gunakan sebagai scope hanya memberikan daftar **nama alat/device type**, bukan daftar manufacturer dan model.

Karena itu:

- DeviceType sudah mempunyai confirmed scope;
- DeviceModel **tidak perlu di-seed dengan data fiktif**;
- user dapat membuat DeviceModel melalui UI;
- jika repository sudah mempunyai data model nyata, gunakan hanya data tersebut.

Jangan membuat:

```text
Omron
Mindray
Nihon Kohden
GE
```

sebagai seed hanya berdasarkan contoh prompt ini.

---

# 15. RELATION TO FUTURE DEVICE

Jangan implementasikan `Device` sekarang.

Namun pastikan desain `DeviceModel` memungkinkan future relationship:

```text
DeviceModel
    ↓
Device
```

Contoh future:

```text
DeviceModel
└── Omron HEM-7120
      │
      ├── Device
      │    Serial: ABC001
      │    Customer: RS A
      │
      └── Device
           Serial: ABC002
           Customer: RS B
```

`DeviceModel` adalah **master produk/model**.

`Device` nanti adalah **physical unit**.

Jangan mencampurkan keduanya.

---

# 16. DO NOT IMPLEMENT YET

Jangan implementasikan pada phase ini:

```text
DeviceCapability
DeviceCapabilityItem
DeviceCalibrationParameter
Device
CalibrationRequestItem
DeviceManufacturer
```

Kita akan mengerjakan model-model tersebut pada phase terpisah setelah domain requirement-nya cukup jelas.

---

# 17. VERIFICATION

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

### Create

Buat:

```text
Device Type:
Blood Pressure Monitor

Manufacturer:
Omron

Model:
<test model>
```

Pastikan berhasil.

### Read

Pastikan list menampilkan:

```text
Blood Pressure Monitor | Omron | <test model>
```

### Update

Pastikan manufacturer/model/description dapat diubah.

### Delete

Pastikan delete mengikuti behavior existing master-data.

### Validation

Pastikan:

- DeviceType wajib;
- Manufacturer wajib jika memang pattern/business rule menetapkannya required;
- Model wajib;
- duplicate combination ditolak jika unique constraint digunakan.

### Relation

Pastikan DeviceModel tidak dapat dibuat dengan DeviceType yang tidak valid.

---

# 18. FINAL REPORT

Laporkan:

## Pattern Audit

File yang digunakan sebagai reference:

```text
DeviceType
DeviceCategory
UOM
Customer
```

## Prisma

- model
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
- table
- form
- query hooks
- mutation hooks
- query keys
- cache invalidation
- permission handling

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

- `manufacturer` masih String;
- tidak ada `DeviceManufacturer`;
- tidak ada seed manufacturer/model fiktif;
- DeviceModel hanya memiliki relationship ke DeviceType;
- UOM, DeviceCategory, dan DeviceType tidak direfactor;
- tidak ada perubahan unrelated;
- tidak ada implementation `DeviceCapability`, `DeviceCapabilityItem`, `DeviceCalibrationParameter`, atau `Device`.