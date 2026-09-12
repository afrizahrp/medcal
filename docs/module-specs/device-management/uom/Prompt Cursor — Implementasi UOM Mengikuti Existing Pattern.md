# Implementasi UOM — Follow Existing Master-Data Pattern

Implementasikan fitur **UOM (Unit of Measurement)** sebagai master data.

## Tujuan

Buat implementasi lengkap:

```text
UOM
├── Prisma model
├── Backend module
├── Controller
├── Service
├── Repository / query layer jika pattern existing menggunakannya
├── AuthZ / permission
├── API endpoint
├── Frontend query hook
├── Mutation hook jika pattern existing menggunakannya
└── UI CRUD
```

**PRINSIP UTAMA:**

Jangan membuat architecture/pattern baru.

Sebelum melakukan perubahan kode, **audit terlebih dahulu implementasi `Customer` yang saat ini sudah berjalan** dan gunakan itu sebagai PRIMARY REFERENCE untuk:

- struktur module
- service
- controller
- repository/query
- DTO
- validation
- pagination
- search
- sorting
- error handling
- authN
- authZ
- permission
- query hook
- mutation hook
- cache invalidation
- loading/error state
- UI layout
- form
- table
- confirmation dialog
- toast/feedback
- naming convention
- file/folder placement

Gunakan `ContactMessage` hanya jika ada pattern tertentu yang memang lebih relevan dan sudah menjadi convention existing. Jangan menyalin behavior messaging yang tidak relevan dengan master data.

---

# PHASE 1 — AUDIT EXISTING PATTERN

**Jangan langsung coding.**

Cari dan review implementasi `Customer` yang sekarang digunakan di repository.

Identifikasi secara eksplisit:

### Backend

1. Prisma model Customer
2. Module
3. Controller
4. Service
5. Repository/query layer jika ada
6. DTO
7. Validation
8. Pagination
9. Search
10. Sorting
11. Error handling
12. AuthN
13. AuthZ
14. Permission definition/check
15. Endpoint naming
16. Response shape
17. API client pattern

### Frontend

1. Page/list UI
2. Table/list component
3. Form component
4. Query hook
5. Mutation hook
6. Query key convention
7. Cache invalidation
8. Loading state
9. Error state
10. Empty state
11. Dialog/modal
12. Toast
13. Delete confirmation
14. Permission-based UI
15. Routing
16. Naming/file placement

### Output audit

Sebelum implementasi, tuliskan ringkasan internal/implementation report:

```text
Existing Customer Pattern
-------------------------
Backend:
- ...
- ...

AuthZ:
- ...
- ...

Frontend:
- ...
- ...

Files used as references:
- ...
```

**Jangan mengubah Customer.**

---

# PHASE 2 — DEFINE UOM MODEL

Setelah pattern Customer dipahami, implementasikan UOM.

Gunakan naming convention yang konsisten dengan project.

Secara domain, UOM minimal membutuhkan:

```text
UOM
├── code
├── name
├── symbol
└── category
```

Contoh:

```text
MMHG
Millimeter of Mercury
mmHg
PRESSURE
```

```text
DEG_C
Degree Celsius
°C
TEMPERATURE
```

```text
BPM
Beats per Minute
bpm
RATE
```

### Penting

Jangan menambahkan field yang tidak dibutuhkan oleh existing architecture hanya karena terlihat "lebih lengkap".

Ikuti pola field:

- id
- createdAt
- updatedAt
- soft delete / deletedAt jika existing master-data pattern menggunakannya
- audit fields jika existing pattern menggunakannya

**Ikuti convention existing project.**

---

# PHASE 3 — BACKEND

Implementasikan UOM menggunakan pattern Customer.

Target konseptual:

```text
UomModule
UomController
UomService
UomRepository / query layer
Uom DTOs
Uom validation
```

Nama aktual file/class harus mengikuti convention repository yang sudah ada.

## Endpoint

Sediakan operasi yang memang diperlukan untuk master data UOM:

```text
GET    /uoms
GET    /uoms/:id
POST   /uoms
PATCH  /uoms/:id
DELETE /uoms/:id
```

**Namun jangan memaksakan endpoint di atas jika Customer menggunakan convention endpoint yang berbeda.**

Ikuti convention existing.

### List

Minimal mendukung capability yang memang sudah dimiliki Customer:

```text
search
pagination
sorting
```

Jika Customer tidak menggunakan salah satunya, jangan menciptakan pattern baru khusus UOM.

### Validation

Minimal:

- code wajib
- name wajib
- symbol wajib
- category wajib jika category memang required menurut final model
- code unique
- valid enum/value untuk category jika project menggunakan enum

Gunakan validation mechanism yang sama dengan Customer.

---

# PHASE 4 — AUTHZ

Ini WAJIB mengikuti sistem authorization existing.

Audit terlebih dahulu bagaimana Customer melakukan:

```text
permission definition
permission check
controller guard/decorator
service-level authorization jika ada
frontend permission check
```

Kemudian buat permission UOM mengikuti convention tersebut.

Contoh konseptual:

```text
uom:read
uom:create
uom:update
uom:delete
```

**Jangan menggunakan nama permission tersebut secara membabi buta.**

Gunakan naming convention permission yang benar-benar dipakai project.

Jangan membuat sistem RBAC/AuthZ baru.

Jangan bypass AuthZ hanya karena UOM adalah master data.

---

# PHASE 5 — FRONTEND QUERY/MUTATION HOOK

Buat hook UOM mengikuti pola Customer.

Contoh konseptual:

```text
useUoms()
useUom(id)
useCreateUom()
useUpdateUom()
useDeleteUom()
```

Nama aktual harus mengikuti convention existing.

Pastikan:

- query key mengikuti convention existing
- mutation menggunakan API client existing
- cache invalidation mengikuti pattern Customer
- error handling mengikuti existing pattern
- auth/permission handling mengikuti existing pattern

**Jangan membuat fetch wrapper baru.**

---

# PHASE 6 — UI

Buat UI UOM sebagai master-data CRUD.

Gunakan **layout dan visual pattern Customer yang sudah existing**.

Minimal:

### List

Kolom:

```text
Code
Name
Symbol
Category
Actions
```

Jika Customer menggunakan card/table/filter pattern tertentu, ikuti pattern tersebut.

### Create/Edit

Form:

```text
Code
Name
Symbol
Category
```

Gunakan komponen form/input/select/dialog existing.

### Actions

Jika Customer memiliki:

```text
Edit
Delete
```

gunakan pattern yang sama.

### Permission

Button/action harus mengikuti AuthZ existing.

User tanpa permission tidak boleh melihat atau menjalankan action yang tidak diizinkan, sesuai pattern project.

---

# PHASE 7 — SEED DATA

Tambahkan seed UOM dasar hanya jika repository memang mempunyai pattern seed/master-data yang sudah digunakan.

Jangan membuat mekanisme seed baru.

Untuk awal, data dapat mencakup:

```text
MMHG     Millimeter of Mercury     mmHg    PRESSURE
KPA      Kilopascal                kPa     PRESSURE
DEG_C    Degree Celsius            °C      TEMPERATURE
BPM      Beats per Minute          bpm     RATE
L_MIN    Liter per Minute          L/min   FLOW
PERCENT  Percent                   %       PERCENTAGE
```

**Tetapi sebelum menambahkan daftar final, periksa existing seed convention dan pastikan UOM category yang dipilih tidak bertentangan dengan domain model yang sedang kita bangun.**

Jika daftar UOM belum final, jangan mengklaim daftar tersebut sebagai final domain taxonomy.

---

# PHASE 8 — TEST / VALIDATION

Setelah implementasi:

1. typecheck
2. lint jika tersedia
3. build backend
4. build frontend
5. test terkait jika tersedia
6. Prisma validation/generate/migration sesuai workflow project

Test minimal:

```text
Create UOM
Read UOM list
Read UOM detail
Update UOM
Delete UOM
Duplicate code rejected
Unauthorized read rejected
Unauthorized create rejected
Unauthorized update rejected
Unauthorized delete rejected
```

Gunakan test pattern existing repository.

---

# HARD CONSTRAINTS

## 1. Jangan membuat pattern baru

Jika existing Customer menggunakan:

```text
Module → Controller → Service → Repository
```

gunakan itu.

Jika menggunakan:

```text
Controller → Service → Prisma
```

gunakan itu.

Jika menggunakan DTO tertentu, gunakan DTO pattern tersebut.

**Existing codebase adalah source of truth.**

---

## 2. Jangan refactor Customer

Customer hanya digunakan sebagai reference.

Jangan:

- refactor Customer
- rename Customer
- mengubah architecture Customer
- memperbaiki unrelated issue
- melakukan "cleanup" yang tidak diperlukan

---

## 3. Jangan memperluas scope

Jangan implementasikan dulu:

```text
DeviceCategory
DeviceType
DeviceModel
DeviceCapability
DeviceCapabilityItem
DeviceCalibrationParameter
```

UOM adalah fitur standalone pertama untuk memvalidasi pattern master-data.

---

## 4. Jangan membuat abstraksi berlebihan

Jangan membuat:

```text
BaseCrudService
BaseMasterController
GenericUomRepository
GenericMasterHook
```

hanya untuk UOM jika abstraction tersebut belum digunakan oleh existing codebase.

**Reuse existing abstraction jika memang sudah ada.**

---

# FINAL REPORT

Setelah selesai, berikan laporan:

## 1. Existing Pattern Reviewed

Sebutkan file Customer yang dijadikan reference dan pattern yang ditemukan.

## 2. Files Created

Daftar semua file baru.

## 3. Files Modified

Daftar semua file yang dimodifikasi.

## 4. Prisma Model

Jelaskan model UOM dan migration yang dibuat.

## 5. Backend

Jelaskan:

- module
- controller
- service
- repository/query
- DTO
- validation
- endpoint

## 6. AuthZ

Jelaskan permission yang digunakan dan bagaimana enforcement dilakukan.

## 7. Frontend

Jelaskan:

- query hooks
- mutation hooks
- query keys
- cache invalidation
- UI
- form
- permission handling

## 8. Verification

Laporkan hasil:

```text
Typecheck:
Lint:
Backend build:
Frontend build:
Tests:
```

## 9. Scope Compliance

Pastikan tidak ada perubahan unrelated.

Jika ada deviation dari Customer pattern, **jelaskan secara eksplisit apa deviation-nya dan kenapa diperlukan.**

Jangan mengatakan "mengikuti existing pattern" tanpa menunjukkan file/reference yang benar-benar diperiksa.