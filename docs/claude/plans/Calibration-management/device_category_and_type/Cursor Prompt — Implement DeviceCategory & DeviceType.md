# Implement DeviceCategory & DeviceType — Confirmed Kemenkes Scope

Implementasikan master data:

```text
DeviceCategory
    ↓
DeviceType
```

Fitur ini harus mengikuti **pattern implementation yang sudah berjalan di project**, terutama implementasi `UOM` yang baru selesai dan `Customer` sebagai reference master-data.

**Jangan membuat architecture/pattern baru.**

---

# 1. SOURCE OF TRUTH — CONFIRMED DEVICE TYPES

Untuk phase ini, **scope DeviceType DIKUNCI** pada 35 item yang tercantum dalam:

> Sertifikat Standar PT Presisi Kalibrasi Medika  
> "DAFTAR KEMAMPUAN PELAYANAN PENGUJIAN DAN/ATAU KALIBRASI ALAT KESEHATAN"

Gunakan nama berikut sebagai **confirmed DeviceType**:

1. `Blood Pressure Monitor`
2. `Humidifier`
3. `Baby Incubator`
4. `Infant Warmer`
5. `Pulse Oximeters`
6. `Oxymeter monitor`
7. `Radiant Warmer`
8. `Resuscitators (Cardiac)`
9. `Resuscitators (Pulmonary)`
10. `Sterillizer (Sterillisator)`
11. `Ventilator`
12. `Ambulatory ECG`
13. `Aspirators (Surgical, Thoracic, and Uterine)/ Suction`
14. `Blood Bank Refrigerators`
15. `Cardiac Output Units (heart rate)`
16. `Electrocardiographs`
17. `Oxygen-Air Proportioners`
18. `Radiant Warmers (Adult)`
19. `Regulators (Air, O2, Suction [except tracheal])`
20. `Breast Pumps (suction)`
21. `Electric Beds (kelistrikan)`
22. `Oxygen Concentrators`
23. `Paraffin Baths`
24. `Regulators (Low-Volume Suction)`
25. `Sphygmomanometers`
26. `Ultrasonic Nebulizers`
27. `Nebulizer Compressor`
28. `Oven`
29. `Kulkas Vaksin`
30. `Coald Chain`
31. `Bed Side Monitor`
32. `Patient Monitor`
33. `Flow meter`
34. `Medical Refrigerator`
35. `Medical Freezer`

Referensi source: halaman 4 Sertifikat Standar, bagian "DAFTAR KEMAMPUAN PELAYANAN PENGUJIAN DAN/ATAU KALIBRASI ALAT KESEHATAN".

### IMPORTANT

Nama di atas berasal dari dokumen source.

**Jangan mengubah, menggabungkan, menghapus, atau menambahkan DeviceType tanpa alasan yang terdokumentasi.**

Jika perlu membuat `code`/slug untuk database, buat code yang konsisten dengan naming convention project, tetapi field `name` harus merepresentasikan nama DeviceType di atas.

Contoh:

```text
name = "Blood Pressure Monitor"
code = "BLOOD_PRESSURE_MONITOR"
```

---

# 2. PENDING ITEMS — JANGAN IMPLEMENT

Dari 47 assessment items yang sudah kita identifikasi sebelumnya, terdapat item yang belum dikonfirmasi mapping-nya terhadap scope Kemenkes.

Untuk phase ini, **JANGAN membuat DeviceType production untuk item berikut:**

```text
Suction Pump
Autoclave
Vaccine Ref
USG
Centrifuge
HypoHypertermia
Infuse Pump
Mikroskop
Syringe Pump
Timbangan Bayi
Timbangan Dewasa
Whirlpool Baths (suhu)
```

Status mereka adalah:

```text
PENDING_REVIEW
```

**PENDING_REVIEW bukan berarti EXCLUDED.**

Jangan:
- menghapusnya dari documentation;
- membuatnya menjadi DeviceType;
- memaksakan mapping ke salah satu dari 35 type;
- membuat category baru hanya untuk menampung pending items.

Item tersebut akan direview pada phase berikutnya.

---

# 3. DEVICE CATEGORY

Buat model:

```text
DeviceCategory
```

yang menjadi parent dari:

```text
DeviceType
```

Relasi:

```text
DeviceCategory 1 ──── N DeviceType
```

### Category tidak berasal secara eksplisit dari dokumen Kemenkes

Dokumen Kemenkes memberikan **nama alat**, bukan hierarchy Category → Type.

Karena itu:

- 35 DeviceType di atas adalah source-derived confirmed scope;
- `DeviceCategory` adalah domain taxonomy internal aplikasi.

Buat grouping Category yang masuk akal berdasarkan domain device.

Contoh konseptual saja:

```text
Patient Monitoring
Respiratory & Oxygen
Neonatal & Infant Care
Temperature & Cold Chain
Suction & Fluid Management
Sterilization
Patient Care
```

**Jangan menganggap contoh di atas sebagai taxonomy final yang wajib.**

Sebelum coding, review 35 type tersebut dan tentukan grouping Category yang paling konsisten.

Jika ada type yang ambiguous untuk category tertentu, dokumentasikan alasan pemilihannya.

---

# 4. AUDIT EXISTING PATTERN TERLEBIH DAHULU

Sebelum coding:

Audit implementasi:

1. `UOM` — PRIMARY reference karena baru selesai diimplementasikan.
2. `Customer` — secondary reference untuk master-data CRUD.
3. AuthZ pattern existing.
4. Query hook / mutation hook pattern existing.
5. UI pattern existing.

Identifikasi:

### Backend

- Prisma model convention
- module
- controller
- service
- repository/query layer jika ada
- DTO
- validation
- pagination
- search
- sorting
- error handling
- API response
- AuthN
- AuthZ
- permission naming

### Frontend

- query hook
- mutation hook
- query key
- cache invalidation
- page
- table
- form
- dialog
- toast
- loading
- empty state
- error state
- permission-based action
- routing

**Jangan mengubah UOM atau Customer.**

Gunakan implementasi existing sebagai source of truth untuk architecture.

---

# 5. PRISMA MODEL

Implementasikan:

```text
DeviceCategory
DeviceType
```

Minimal secara konseptual:

```text
DeviceCategory
├── id
├── code
├── name
├── description?
├── createdAt
└── updatedAt

DeviceType
├── id
├── categoryId
├── code
├── name
├── description?
├── createdAt
└── updatedAt
```

Tetapi field final harus mengikuti convention existing project.

Tambahkan:

```text
unique constraint
indexes
foreign key
```

sesuai pattern existing.

Pastikan:

```text
DeviceCategory.code UNIQUE
DeviceType.code UNIQUE
```

jika memang sesuai convention master data existing.

---

# 6. BACKEND CRUD

Implementasikan CRUD lengkap untuk:

```text
DeviceCategory
DeviceType
```

Ikuti pattern UOM/Customer.

Minimal:

```text
GET
GET :id
POST
PATCH
DELETE
```

untuk masing-masing resource, **tetapi gunakan endpoint naming convention yang benar-benar dipakai project**.

### DeviceType filtering

List DeviceType harus dapat difilter berdasarkan Category jika pattern list/filter existing mendukungnya.

Contoh konseptual:

```text
GET /device-types?categoryId=...
```

Jangan membuat query mechanism baru jika existing API sudah mempunyai pattern untuk relational filtering.

---

# 7. AUTHORIZATION

Ikuti AuthZ existing.

Buat permission untuk:

```text
DeviceCategory
DeviceType
```

dengan naming convention yang sama dengan UOM/Customer.

Minimal permission capability:

```text
read
create
update
delete
```

Jangan bypass authorization.

Frontend action juga harus mengikuti permission existing.

---

# 8. FRONTEND

Implementasikan UI CRUD:

```text
Device Categories
Device Types
```

Gunakan visual/layout pattern UOM/Customer.

### Device Category

List minimal:

```text
Code
Name
Description
Actions
```

### Device Type

List minimal:

```text
Code
Name
Category
Description
Actions
```

### Form

DeviceCategory:

```text
Code
Name
Description
```

DeviceType:

```text
Code
Name
Category
Description
```

Gunakan reusable form components existing.

Jangan membuat UI minimalis berlebihan yang menyebabkan user harus melakukan scrolling yang sebenarnya tidak diperlukan.

Ikuti density/layout pattern master-data existing.

---

# 9. SEED DATA

Buat seed untuk:

## DeviceCategory

Gunakan category hasil taxonomy review.

## DeviceType

Seed **tepat 35 confirmed DeviceType** yang disebutkan di Section 1.

Pastikan setiap DeviceType memiliki:

```text
categoryId
code
name
```

dan tidak ada duplicate.

### IMPORTANT

Jangan seed:

```text
Suction Pump
Autoclave
Vaccine Ref
USG
Centrifuge
HypoHypertermia
Infuse Pump
Mikroskop
Syringe Pump
Timbangan Bayi
Timbangan Dewasa
Whirlpool Baths (suhu)
```

karena semuanya masih `PENDING_REVIEW`.

---

# 10. DOCUMENT THE TAXONOMY

Sebelum final report, buat mapping yang jelas:

```text
DeviceCategory
    ↓
DeviceType
```

Contoh:

```text
Patient Monitoring
├── Blood Pressure Monitor
├── Pulse Oximeters
├── Oxymeter monitor
├── Ambulatory ECG
├── Electrocardiographs
├── Bed Side Monitor
└── Patient Monitor
```

**Contoh tersebut bukan instruksi grouping final.**

Gunakan hasil domain review kamu.

Jika ada grouping yang tidak obvious, jelaskan:

```text
DeviceType
→ Category
→ Reason
```

Jangan diam-diam membuat keputusan taxonomy tanpa dokumentasi.

---

# 11. IMPORTANT DOMAIN CONSTRAINTS

Jangan implementasikan model berikut pada phase ini:

```text
DeviceModel
DeviceCapability
DeviceCapabilityItem
DeviceCalibrationParameter
Device
CalibrationRequestItem
```

Phase ini hanya:

```text
DeviceCategory
    ↓
DeviceType
```

`UOM` sudah selesai dan jangan diubah.

---

# 12. NO OVER-ENGINEERING

Jangan membuat:

```text
BaseCrudService
GenericMasterService
GenericCategoryService
GenericDeviceService
```

atau abstraction baru lainnya hanya untuk feature ini.

Reuse abstraction existing jika memang sudah digunakan project.

Jangan refactor unrelated code.

Jangan memperbaiki issue unrelated yang ditemukan saat audit.

---

# 13. VERIFICATION

Setelah implementasi:

```text
typecheck
lint
backend build
frontend build
tests
Prisma validation/generate/migration
```

sesuai command yang memang digunakan repository.

Verifikasi minimal:

### DeviceCategory

```text
Create
Read list
Read detail
Update
Delete
Duplicate code rejected
Unauthorized operations rejected
```

### DeviceType

```text
Create
Read list
Read detail
Update
Delete
Duplicate code rejected
Category relation valid
Unauthorized operations rejected
```

Pastikan semua **35 confirmed DeviceType** berhasil di-seed dan dapat ditampilkan di UI.

Pastikan semua **12 pending items tidak muncul sebagai DeviceType production**.

---

# 14. FINAL REPORT

Setelah selesai, laporkan:

## 1. Pattern Audit

File UOM dan Customer yang digunakan sebagai reference.

## 2. Taxonomy

Tampilkan:

```text
DeviceCategory
└── DeviceType
```

untuk seluruh 35 confirmed types.

## 3. Pending Items

Konfirmasi bahwa 12 item berikut tidak diimplementasikan:

```text
Suction Pump
Autoclave
Vaccine Ref
USG
Centrifuge
HypoHypertermia
Infuse Pump
Mikroskop
Syringe Pump
Timbangan Bayi
Timbangan Dewasa
Whirlpool Baths (suhu)
```

## 4. Files Created

Daftar file.

## 5. Files Modified

Daftar file.

## 6. Database

Jelaskan:

- Prisma models
- migration
- seed

## 7. Backend

Jelaskan:

- module
- controller
- service
- repository/query
- DTO
- validation
- endpoints
- AuthZ

## 8. Frontend

Jelaskan:

- hooks
- query keys
- mutations
- cache invalidation
- UI
- permission handling

## 9. Verification

```text
Typecheck:
Lint:
Backend build:
Frontend build:
Tests:
Migration:
Seed:
```

## 10. Scope Compliance

Pastikan:

- hanya 35 confirmed DeviceType yang diimplementasikan;
- 12 pending items tidak diimplementasikan sebagai DeviceType;
- UOM tidak dimodifikasi;
- Customer tidak dimodifikasi;
- tidak ada unrelated refactor;
- tidak ada architecture/pattern baru yang dibuat tanpa kebutuhan.

Jika ada deviation dari pattern UOM/Customer, **jelaskan secara eksplisit file reference, deviation, dan alasannya.**