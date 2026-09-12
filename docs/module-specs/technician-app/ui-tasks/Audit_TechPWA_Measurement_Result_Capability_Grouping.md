# Audit Tech-PWA Measurement Result — Capability Grouping

Audit ini bersifat read-only terhadap implementasi saat ini. Tujuannya adalah menilai apakah UI **Hasil Pengukuran** dapat mengikuti struktur LK dengan mengelompokkan parameter berdasarkan capability dari Device Calibration Parameter, tanpa mendesain ulang domain pengukuran.

## 1. Current Implementation

### Komponen terkait

1. Halaman utama input Hasil Pengukuran:
   - `apps/tech-pwa/src/app/jobs/[id]/measurements/page.tsx`
   - Judul layar `Hasil Pengukuran` dibuat pada baris 16–21.
   - Grouping `Pembacaan langsung` dan `Grid titik uji` dirender pada baris 139–176.

2. Ringkasan Hasil Pengukuran pada detail job:
   - `apps/tech-pwa/src/app/jobs/[id]/job-detail-ui.tsx`
   - `MeasurementsSection` berada pada baris 139–225.
   - Grouping input method dirender ulang pada baris 173–208.

3. Pemanggil ringkasan pada halaman detail job:
   - `apps/tech-pwa/src/app/jobs/[id]/page.tsx`
   - Query parameter dan result dijalankan pada baris 50–54.
   - Result dipetakan per parameter pada baris 93–109.
   - `MeasurementsSection` dipanggil pada baris 202–225.

4. Baris parameter:
   - `apps/tech-pwa/src/app/jobs/[id]/measurements/measurements-ui.tsx`
   - `MeasurementParameterListRow` berada pada baris 42–83.
   - Nama parameter ditampilkan pada baris 68.
   - `capabilityName › capabilityItemName` sudah ditampilkan pada baris 69–71.
   - Baris tersebut menavigasi ke `/jobs/:jobId/measurements/:parameterId`.

5. Halaman input per parameter:
   - `apps/tech-pwa/src/app/jobs/[id]/measurements/[parameterId]/page.tsx`
   - Parameter direct dicari di `parameters`, sedangkan grid dicari di `gridParameters` pada baris 82–84.
   - Parameter grid diteruskan ke `MeasurementGridEntry` pada baris 151–164.
   - Parameter direct dirender sebagai daftar ulangan pada baris 263–302.

6. UI grid:
   - `apps/tech-pwa/src/app/jobs/[id]/measurements/measurement-grid.tsx`
   - Test point diurutkan dengan `sequence` pada baris 59.
   - Sel grid menggunakan key `testPointId:direction:replicateIndex` pada baris 32–34.

7. Query frontend:
   - `apps/tech-pwa/src/app/jobs/[id]/measurements/use-measurements-query.ts`

8. Tipe dan helper frontend:
   - `apps/tech-pwa/src/lib/calibration/measurement.ts`

### Current rendering flow

API mengembalikan dua array parameter:

- `parameters` untuk pembacaan langsung;
- `gridParameters` untuk parameter dengan test point aktif.

Frontend tidak membentuk grouping input method sendiri dari satu daftar terpadu. Frontend langsung merender kedua array API sebagai dua visual section yang terpisah.

### Current grouping logic

Grouping saat ini diterapkan pada dua level:

1. Backend memisahkan parameter menjadi `parameters` dan `gridParameters`.
2. Dua renderer Tech-PWA membuat section `Pembacaan langsung` dan `Grid titik uji` dari kedua array tersebut.

Lokasi grouping visual yang harus diperhatikan apabila implementasi dilanjutkan:

- `apps/tech-pwa/src/app/jobs/[id]/measurements/page.tsx:139-176`
- `apps/tech-pwa/src/app/jobs/[id]/job-detail-ui.tsx:173-208`

Tidak ditemukan capability-level expand/collapse. Tidak ditemukan pula parameter-level accordion pada layar ini. Parameter adalah link menuju halaman input tersendiri.

## 2. Data Flow

### Alur parameter

1. Tech-PWA memanggil:
   - `GET /calibration-jobs/:id/measurement-parameters`
   - `apps/tech-pwa/src/app/jobs/[id]/measurements/use-measurements-query.ts:25-33`

2. Controller API:
   - `apps/api/src/modules/calibration-jobs/calibration-jobs.controller.ts:301-307`
   - Memerlukan permission `calibrationJob:read`.

3. Service:
   - `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts:1122-1192`
   - Menyelesaikan DeviceType job.
   - Mengambil parameter yang didukung.
   - Memisahkan direct dan grid.
   - Memetakan relasi capability dan test point ke response.

4. React Query menyimpan response dengan key:
   - `["job", id, "measurement-parameters"]`

5. Halaman daftar mengambil:
   - `parametersQuery.data.parameters`
   - `parametersQuery.data.gridParameters`

6. Kedua array dirender sebagai section input method.

### Alur measurement result

1. Tech-PWA memanggil:
   - `GET /calibration-jobs/:id/measurement-results`
   - `apps/tech-pwa/src/app/jobs/[id]/measurements/use-measurements-query.ts:36-42`

2. API membaca seluruh result untuk job:
   - `apps/api/src/modules/calibration-jobs/measurement-results.service.ts:340-357`

3. Frontend hanya memakai result dengan `attemptNumber === currentAttempt`.

4. Result dipetakan berdasarkan `deviceCalibrationParameterId`.

5. Result dengan `calibrationTestPointId === null` masuk map direct.

6. Result dengan `calibrationTestPointId !== null` masuk map grid.

7. Map tersebut digunakan hanya untuk menghitung status dan mengisi kembali editor parameter. Capability tidak digunakan sebagai key state.

### Alur penyimpanan

Tidak ditemukan autosave measurement.

Penyimpanan dilakukan secara eksplisit:

- create:
  - `POST /calibration-jobs/:id/measurement-results/batch`
- update:
  - `PATCH /calibration-jobs/:id/measurement-results/:measurementId`

Hook berada di:

- `apps/tech-pwa/src/app/jobs/[id]/measurements/use-measurements-query.ts:50-79`

Payload direct:

```text
deviceCalibrationParameterId
replicateIndex
measuredValue
```

Payload grid menambahkan:

```text
calibrationTestPointId
direction
```

Capability tidak termasuk dalam payload penyimpanan.

## 3. Device Calibration Parameter

### Struktur data aktual

Relasi master data adalah:

```text
DeviceType
  -> DeviceCalibrationParameter
       -> DeviceCapabilityItem
            -> DeviceCapability
       -> CalibrationTestPoint[]
       -> MeasurementResult[]
```

Definisi utama:

- `DeviceCapability`: `packages/db/prisma/schema.prisma:1270-1283`
- `DeviceCapabilityItem`: `packages/db/prisma/schema.prisma:1285-1303`
- `DeviceCalibrationParameter`: `packages/db/prisma/schema.prisma:1305-1357`
- `DeviceTypeCapabilityOrder`: `packages/db/prisma/schema.prisma:1359-1378`
- `CalibrationTestPoint`: `packages/db/prisma/schema.prisma:1951-1993`
- `MeasurementResult`: `packages/db/prisma/schema.prisma:1995-2084`

### capabilityName dan capabilityItemName

Kedua field sudah tersedia end-to-end.

API memilih relasi berikut:

```text
DeviceCalibrationParameter
  -> capabilityItem.name
  -> capabilityItem.capability.name
```

Select dan mapping:

- `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts:252-282`

Mapping aktual:

```text
capabilityName = row.capabilityItem.capability.name
capabilityItemName = row.capabilityItem.name
```

Type frontend:

- `apps/tech-pwa/src/lib/calibration/measurement.ts:28-46`

Pemakaian di UI:

- list parameter: `measurements-ui.tsx:67-75`
- direct entry: `[parameterId]/page.tsx:243-252`
- grid entry: `measurement-grid.tsx:171-180`

Relasi capability dan capability item wajib pada schema, sehingga kedua nama tersebut bukan nullable dalam jalur data normal.

### Hubungan capability, item, parameter, test point, dan input method

- Capability adalah kategori fungsional induk.
- Capability item adalah leaf taxonomy di bawah capability.
- Calibration parameter adalah objek yang benar-benar diukur.
- Test point adalah child opsional parameter.
- Measurement result selalu mengacu ke parameter dan opsional mengacu ke test point.
- Input method bukan field bernama `inputMethod`.
- `entryStyle` yang tersedia adalah `DIRECT_REPLICATES` atau `LOGGER_SUMMARY`.
- Untuk parameter yang diekspos endpoint saat ini, direct versus grid ditentukan berdasarkan keberadaan test point.

Filter endpoint Tech-PWA:

#### Direct

- DeviceType sesuai job
- `isActive = true`
- `valueType = NUMBER`
- `entryStyle = DIRECT_REPLICATES`
- tidak mempunyai child test point

#### Grid

- filter dasar yang sama;
- mempunyai minimal satu test point aktif;
- bukan code yang dikecualikan oleh `GRID_EXCLUDED_PARAMETER_CODES`.

Referensi:

- `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts:1114-1174`

Parameter dengan `LOGGER_SUMMARY`, non-number, nonaktif, atau pattern yang belum didukung tetap dikeluarkan. Perubahan grouping capability tidak boleh memperluas eligibility parameter tersebut secara tidak sengaja.

### Ordering

Device Calibration Parameter sudah mempunyai dua tingkat ordering:

1. Capability per DeviceType:
   - `DeviceTypeCapabilityOrder.sortOrder`

2. Parameter dalam scope DeviceType + capability:
   - `DeviceCalibrationParameter.sortOrder`

Test point mempunyai:

- `CalibrationTestPoint.sequence`

Backfill ordering:

- `packages/db/prisma/backfill-calibration-ordering.ts`
- Mengambil creation order parameter yang menurut dokumentasi seed mengikuti urutan LK.
- Capability order ditentukan dari urutan pertama capability muncul.
- Nilai ordering ditulis dalam kelipatan 10.

Create service juga menjaga ordering:

- `apps/api/src/modules/device-calibration-parameters/device-calibration-parameters.service.ts:280-319`
- Parameter baru ditambahkan ke akhir capability.
- Capability order dibuat dan ditambahkan ke akhir bila belum tersedia.

Master-data grouped service sudah menerapkan tree terurut:

- `apps/api/src/modules/device-calibration-parameters/device-calibration-parameters.service.ts:125-155`
- Capability memakai `DeviceTypeCapabilityOrder`.
- Parameter memakai `sortOrder`, lalu nama dan ID sebagai deterministic tiebreak.

### Kekurangan response yang dikonsumsi Tech-PWA

Endpoint measurement saat ini:

- tidak mengirim `capabilityId`;
- tidak mengirim capability `sortOrder`;
- tidak mengirim parameter `sortOrder`;
- tidak membaca `DeviceTypeCapabilityOrder`;
- memisahkan direct dan grid ke dua array.

Kedua query parameter hanya memakai:

```text
sortOrder ASC
name ASC
```

Karena `DeviceCalibrationParameter.sortOrder` scoped per capability, bukan urutan global antar-capability, hasil antar-capability dapat bercampur. Pemisahan direct dan grid juga menghilangkan relative order lintas kedua metode input.

Akibatnya, frontend tidak dapat merekonstruksi configured ordering secara tepat hanya dari response sekarang.

### Source of truth

Device Calibration Parameter dapat tetap menjadi satu-satunya source of truth untuk:

- nama section capability;
- membership parameter dalam capability;
- capability order;
- parameter order;
- test-point order;
- metadata parameter dan toleransi.

Tidak diperlukan taxonomy atau mekanisme ordering baru. Read model API perlu memproyeksikan data existing tersebut secara utuh.

## 4. Gap Analysis

### Yang sudah bekerja

- Capability dan capability item sudah menjadi bagian wajib dari parameter.
- Nama capability dan capability item sudah sampai ke Tech-PWA.
- Parameter mempunyai stable ID.
- Capability ordering sudah disimpan per DeviceType.
- Parameter ordering sudah disimpan dalam scope capability.
- Test-point ordering sudah disimpan sebagai `sequence`.
- Direct dan grid mempunyai editor yang sudah berfungsi.
- Measurement state dan persistence berbasis ID, bukan posisi visual.

### Yang berbeda dari target LK

Presentasi utama mengikuti input method:

```text
Pembacaan Langsung
Grid Titik Uji
```

Target memerlukan:

```text
Capability sesuai urutan Device Calibration Parameter
  -> parameter sesuai configured order
       -> existing direct atau grid interaction
```

### Sifat gap

Secara domain dan database, gap adalah presentation/grouping.

Namun, perubahan tidak dapat dilakukan secara akurat hanya dengan mengganti JSX frontend. Response API saat ini kehilangan capability identity dan ordering lintas input method.

Jadi diperlukan:

- perubahan kecil pada backend read/query;
- perubahan additive pada response API;
- perubahan renderer Tech-PWA.

Tidak diperlukan:

- model measurement baru;
- taxonomy baru;
- database field baru;
- migration schema;
- endpoint baru;
- ordering mechanism baru;
- drag-and-drop baru.

## 5. Impact Analysis

### Measurement state

Grouping capability tidak perlu mengubah state karena result dipetakan dengan `deviceCalibrationParameterId` dan, untuk grid, `calibrationTestPointId`.

Baris daftar parameter bersifat stateless. Draft input berada pada halaman parameter tersendiri.

### Input state

Direct entry menyimpan draft lokal berdasarkan `replicateIndex`.

Grid entry menyimpan draft lokal berdasarkan:

```text
testPointId:direction:replicateIndex
```

Perubahan section pada halaman daftar tidak menyentuh kedua state tersebut.

### Validation

Validasi angka berada pada:

- `apps/tech-pwa/src/lib/calibration/measurement.ts:186-189`

Server memvalidasi payload dan menghitung toleransi. Capability tidak ikut dalam proses validasi.

### Persistence dan API payload

Create/update menggunakan parameter ID dan test-point ID. Capability tidak dikirim.

Selama implementation tidak mengubah halaman editor dan mutation hooks, persistence serta payload tidak terpengaruh.

### Test points

Test point aktif diurutkan server-side berdasarkan `sequence`.

Frontend grid kembali mengurutkan berdasarkan `sequence`.

API write memastikan test point yang diberikan benar-benar child dari parameter:

- `apps/api/src/modules/calibration-jobs/measurement-results.service.ts:402-432`

Grouping capability tidak perlu mengubah mekanisme tersebut.

### Existing input behavior

Risiko tetap rendah bila implementation:

- mempertahankan discriminant direct/grid;
- tetap mengirim `pointCount` hanya untuk grid;
- mempertahankan route parameter;
- tidak memindahkan editor menjadi inline capability accordion;
- tidak mengubah `MeasurementGridEntry`;
- tidak mengubah helper status;
- tidak mengubah hooks write.

### Expand/collapse

Tidak ada expand/collapse parameter atau capability pada implementasi saat ini. Capability harus ditambahkan sebagai visual section statis tanpa state baru.

## 6. Minimal Implementation Plan

1. Perluas `GET /calibration-jobs/:id/measurement-parameters` dengan struktur additive, misalnya:

```text
capabilityGroups[]
  capability:
    id
    code
    name
  sortOrder
  parameters[]
    existing parameter metadata
    explicit direct/grid discriminant
    testPoints[] untuk grid
```

2. Backend mengambil `DeviceTypeCapabilityOrder` untuk DeviceType job.

3. Backend membentuk capability groups berdasarkan capability ID, bukan nama.

4. Backend mengurutkan:
   - capability dengan configured `DeviceTypeCapabilityOrder.sortOrder`;
   - parameter dengan configured `DeviceCalibrationParameter.sortOrder`;
   - test point dengan `CalibrationTestPoint.sequence`.

5. Pertahankan `parameters` dan `gridParameters` sementara bila backward compatibility masih diperlukan.

6. Update `TechMeasurementParametersResponse` agar mengenali grouped response.

7. Update renderer:
   - `apps/tech-pwa/src/app/jobs/[id]/measurements/page.tsx`
   - `MeasurementsSection` di `apps/tech-pwa/src/app/jobs/[id]/job-detail-ui.tsx`

8. Render capability sebagai section statis, kemudian render parameter dengan komponen/status existing.

9. Pertahankan dispatch direct/grid untuk setiap parameter. Jangan menjadikan capability sebagai penentu input method.

10. Jangan mengubah:
    - `[parameterId]/page.tsx`, kecuali adaptasi lookup response benar-benar diperlukan;
    - `MeasurementGridEntry`;
    - payload measurement;
    - mutation hooks;
    - tolerance service;
    - schema database;
    - taxonomy;
    - management ordering UI.

11. Tambahkan pengujian untuk:
    - capability order;
    - parameter order dalam capability;
    - direct dan grid dalam capability yang sama;
    - relative order direct versus grid;
    - test-point sequence;
    - status direct dan grid tetap menggunakan helper masing-masing;
    - navigation ke editor parameter tetap sama.

## 7. Risks / Edge Cases

### 1. Grouping berdasarkan nama tidak aman

Response sekarang hanya menyediakan `capabilityName`. `DeviceCapability.name` tidak mempunyai unique constraint; yang unique adalah `code`.

Grouping harus memakai capability ID dan menampilkan capability name sebagai label.

### 2. Capability ordering belum tersedia pada endpoint measurement

`DeviceTypeCapabilityOrder` ada di schema dan digunakan management service, tetapi belum dibaca endpoint Tech-PWA.

### 3. Relative order direct dan grid hilang

Kedua metode input dikembalikan sebagai array terpisah dan diurutkan secara independen. Menggabungkan array di frontend tidak dapat menjamin urutan parameter sesuai konfigurasi.

### 4. Parameter `sortOrder` bukan global

Nilai parameter dimulai kembali dalam setiap capability. Mengurutkan seluruh parameter hanya berdasarkan `sortOrder` dapat mencampur capability.

### 5. Capability/item kosong

Relasi dan nama bersifat non-null. API create/update menggunakan `min(1)`, sehingga null dan string kosong normalnya ditolak.

Namun, renderer measurement tidak mempunyai fallback untuk data legacy/manual yang berisi whitespace atau nama tidak layak tampil.

### 6. Capability atau capability item nonaktif

Endpoint hanya memfilter parameter dan test point aktif. Status aktif capability dan capability item tidak diperiksa. Ini adalah perilaku existing dan tidak sebaiknya diubah diam-diam dalam task presentasi.

### 7. Parameter dengan hanya test point nonaktif

Parameter tersebut tidak masuk direct karena masih mempunyai child test point, dan tidak masuk grid karena tidak mempunyai test point aktif. Akibatnya parameter hilang dari kedua array.

### 8. Status direct dan grid berbeda

- Direct menggunakan `parameterEntryStatus`.
- Grid menggunakan `gridEntryStatus`.

Keduanya tidak boleh disatukan menjadi perhitungan status generik ketika visual grouping diubah.

### 9. Heuristik frontend existing

Jumlah ulangan dan direction belum sepenuhnya berasal dari konfigurasi:

- default lima ulangan;
- prefix `VENT_` dan `AUD_` menggunakan tiga;
- `SPHYG_PRESSURE_ACC` menggunakan arah UP/DOWN.

Referensi:

- `apps/tech-pwa/src/lib/calibration/measurement.ts:98-121`

Task grouping tidak boleh mengubah heuristik ini.

### 10. Validasi write existing

`MeasurementResultsService.loadCatalog()` memastikan parameter dan test point ada serta saling berelasi, tetapi belum memverifikasi bahwa:

- parameter sesuai DeviceType job;
- parameter aktif;
- parameter termasuk entry style yang didukung;
- test point aktif;
- parameter tersebut benar-benar diekspos endpoint measurement.

Referensi:

- `apps/api/src/modules/calibration-jobs/measurement-results.service.ts:99-114`
- `apps/api/src/modules/calibration-jobs/measurement-results.service.ts:402-432`

Ini adalah celah integritas existing. Perubahan grouping tidak menyebabkannya dan perbaikannya sebaiknya menjadi task terpisah.

### 11. Seed capability/parameter tidak kompatibel dengan schema terkini

Schema telah menghapus `DeviceCapabilityItem.code`, tetapi beberapa seed masih menggunakan field tersebut:

- `packages/db/prisma/seed-device-capabilities.ts`
- `packages/db/prisma/seed-device-calibration-parameters.ts`
- `packages/db/prisma/seed-device-taxonomy-extension-parameters.ts`

Selain itu:

- beberapa logger-summary row pada fresh bootstrap berpotensi memperoleh default `DIRECT_REPLICATES`;
- `seed-calibration-test-points.ts` menyatakan belum dijalankan dan tidak terdaftar dalam package scripts.

Masalah ini berkaitan dengan bootstrap dan integritas konfigurasi existing, bukan kebutuhan schema baru untuk capability grouping. Perbaikannya sebaiknya dipisahkan dari task UI.

### 12. Fallback ordering capability

Grouped management service memakai fallback nama untuk capability yang tidak mempunyai `DeviceTypeCapabilityOrder`.

Standard create path dan backfill seharusnya memastikan order row tersedia. Karena requirement melarang alphabetical capability ordering, implementation Tech-PWA tidak boleh menjadikan fallback alfabetis sebagai ordering bisnis baru. Missing order row harus diperlakukan sebagai masalah kelengkapan konfigurasi atau ditangani sesuai urutan stabil yang disepakati dari data existing, tanpa menambah mekanisme ordering baru.

## 8. Recommendation

**READY FOR IMPLEMENTATION**

Device Calibration Parameter sudah mempunyai seluruh struktur domain yang diperlukan:

- capability;
- capability item;
- membership parameter;
- capability ordering;
- parameter ordering;
- test-point ordering;
- metadata input dan toleransi.

Tidak diperlukan perubahan database atau schema. Tidak diperlukan capability management, taxonomy, field ordering, endpoint, atau mekanisme drag-and-drop baru.

Implementation yang akurat tetap memerlukan perubahan kecil pada backend/API read response agar capability identity dan configured ordering tidak hilang sebelum data sampai ke Tech-PWA. Setelah itu, perubahan frontend dapat dibatasi pada dua renderer section dan type/read mapping terkait.

State input, validation, persistence, measurement payload, test-point handling, serta perilaku direct/grid dapat dan harus tetap tidak berubah.

Masalah seed dan validasi write yang ditemukan adalah masalah existing dan sebaiknya ditangani sebagai pekerjaan terpisah agar scope capability grouping tetap sempit.
