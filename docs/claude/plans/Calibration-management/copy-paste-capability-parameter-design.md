# Copy-Paste Capability/Parameter Antar DeviceType — Inspeksi & Proposal

Status: **INSPECT + PROPOSE only**. Tidak ada kode yang diubah. Hard stop
setelah dokumen ini — tunggu keputusan Afriza atas opsi di Step 2 sebelum
Stage implementasi.

---

## Step 1 — Temuan Inspeksi

### 1.1 Struktur data: capability itu GLOBAL MASTER, bukan string, bukan per-DeviceType

Dibaca langsung dari `packages/db/prisma/schema.prisma`:

- `DeviceCapability` (schema.prisma:1290) — master global, `code` unique,
  tidak punya `deviceTypeId`. Ini taxonomy root (mis. "Pengukuran Kondisi
  Lingkungan").
- `DeviceCapabilityItem` (schema.prisma:1308) — leaf taxonomy, FK ke
  `DeviceCapability` via `capabilityId`, juga **tidak punya `deviceTypeId`**.
  Unique per `(capabilityId, name)`. Ini node "Suhu Ruangan".
- `DeviceCalibrationParameter` (schema.prisma:1332) — baris parameter aktual,
  FK ke `deviceTypeId` **dan** `capabilityItemId`. Unique
  `(deviceTypeId, capabilityItemId, code)`.
- `DeviceTypeCapabilityOrder` (schema.prisma:1385) — tabel terpisah untuk
  urutan tampil per `(deviceTypeId, capabilityId)`, karena capability adalah
  master global yang dipakai lintas banyak DeviceType dan urutannya
  device-type-specific.

**Implikasi penting**: capability/capability-item **sudah reusable lintas
DeviceType by design** — ini bukan string yang perlu dinormalisasi, dan
bukan sesuatu yang perlu "di-copy" secara struktural. Bed Side Monitor dan
Patient Monitor, jika sama-sama punya capability item "Suhu Ruangan", akan
menunjuk ke **`capabilityItemId` yang sama persis**. Yang berbeda cuma baris
`DeviceCalibrationParameter` (nilai deviceTypeId, tolerance, uom, dst) dan
urutan tampilnya (`DeviceTypeCapabilityOrder`, `sortOrder` pada parameter).

Konsekuensi desain: copy-paste **tidak perlu membuat capability/capability-item
baru** untuk kasus umum (source dan target device type memakai taxonomy leaf
yang sama). Copy hanya perlu membuat baris `DeviceCalibrationParameter` baru
yang menunjuk `capabilityItemId` yang sudah ada, di scope `deviceTypeId`
target. Kasus di mana target belum pernah punya kapabilitas itu sama sekali
tetap tertangani otomatis oleh `appendToOrderingScope` (lihat 1.2) yang
membuat baris `DeviceTypeCapabilityOrder` baru bila belum ada.

### 1.2 Keunikan `code`: BUKAN masalah — `code` system-issued, bukan input user

Dibaca dari `device-calibration-parameters.service.ts:322-358` dan
`packages/shared/src/schemas/index.ts:1424-1436`:

- `deviceCalibrationParameterCreateSchema` **tidak menerima field `code`
  sama sekali** — dikomentari eksplisit: "`code` is not accepted —
  system-issued, immutable business identifier (DCP-0001)".
- Di `create()`, `code` dialokasikan via `MasterCodeService.allocate({ entity:
  "DEVICE_CALIBRATION_PARAMETER", tx })` — sekuens global (DCP-0001,
  DCP-0002, ...), independen dari `deviceTypeId`.
- Constraint `@@unique([deviceTypeId, capabilityItemId, code])` karena itu
  **tidak akan pernah collide** untuk baris baru — setiap create dapat code
  baru yang unik secara global.

**Kesimpulan**: pertanyaan "apakah code reusable across device types atau
harus bikin baru" di brief task ini **sudah terjawab oleh desain existing**:
copy selalu menghasilkan `code` baru (alokasi otomatis), tidak pernah reuse
code sumber. Tidak ada opsi/trade-off yang perlu diputuskan di sini — ini
konsisten dengan constraint yang sudah berlaku untuk create manual.

Konflik nyata yang **bisa** terjadi ada di `assertUniqueName()`
(device-calibration-parameters.service.ts:238-260): satu nama parameter
(case-insensitive) tidak boleh dobel dalam `(deviceTypeId, capabilityItemId)`
yang sama. Ini yang relevan untuk Step 2 §2 (handling konflik), bukan `code`.

### 1.3 Halaman Portal & endpoint yang bisa direuse

- List/grouped view: `device-calibration-parameters-ui.tsx` — tabel
  expand/collapse per DeviceType (`DeviceTypeParameterTable`), tiap baris
  device-type expand menampilkan `ChildRows` → per-`CapabilitySection` →
  daftar parameter (`SortableParameterRow`), dengan drag-drop reorder
  (dnd-kit) yang sudah manggil endpoint reorder existing.
- Endpoint API (`device-calibration-parameters.controller.ts`):
  - `GET /device-calibration-parameters/grouped` — sudah mengembalikan data
    persis dalam bentuk group-by-capability per DeviceType (`capabilities[].
    parameters[]`). Bisa direuse langsung sebagai sumber data "pilih
    capability/parameter dari source device" tanpa endpoint baru.
  - `POST /device-calibration-parameters` — create satu parameter, RBAC
    `RequirePermission("deviceCalibrationParameter", "create")`. Body
    tervalidasi `deviceCalibrationParameterCreateSchema` (lihat 1.2) — hanya
    menerima: `deviceTypeId, capabilityItemId, name, description, uomId,
    toleranceMin, toleranceMax, toleranceNote, decimalPlaces`. **Tidak
    menerima** `entryStyle`, `valueType`, atau `isActive` — semuanya default
    DB (`entryStyle=DIRECT_REPLICATES`, `valueType=NUMBER`, `isActive=true`).
  - Tidak ada endpoint bulk-create/bulk-copy apa pun hari ini. Reorder
    endpoints (`PATCH .../capability-order`, `PATCH .../parameter-order`)
    adalah bulk-write yang paling mendekati pola "banyak baris sekaligus",
    tapi keduanya operasi reorder, bukan create.
  - Halaman create manual: `device-calibration-parameters/new/page.tsx` (satu
    per satu, via form).

**Implikasi**: create endpoint yang ada TIDAK cukup untuk copy langsung jika
source parameter punya `entryStyle=LOGGER_SUMMARY` atau `valueType != NUMBER`
— field-field itu tidak bisa di-set lewat create API sekarang. Memanggil
create existing berulang kali dari client akan **secara diam-diam
menurunkan** parameter LOGGER_SUMMARY hasil-copy menjadi DIRECT_REPLICATES.
Ini gap konkret yang harus diputuskan di Step 2, bukan diasumsikan hilang.

### 1.4 `CalibrationTestPoint` — tidak ada endpoint Portal sama sekali

- Dicek `apps/api/src/modules/**`: `CalibrationTestPoint` hanya direferensi
  di modul `calibration-jobs` (dibaca untuk runtime measurement), **tidak
  ada controller/service create untuk `CalibrationTestPoint` di modul
  `device-calibration-parameters`**. Baris `CalibrationTestPoint` sekarang
  hanya masuk lewat seed script (`CalibrationTestPoint_Seed_Extraction.md`
  disebut di komentar schema), bukan lewat Portal UI.
- Struktur: `CalibrationTestPoint` (schema.prisma:2141) child dari satu
  `deviceCalibrationParameterId` spesifik, dengan `sequence`, `settingLabel`,
  `settingValue` (nominal per titik ukur), unique per
  `(deviceCalibrationParameterId, sequence)` dan `(..., settingLabel)`.
- Observasi (bukan keputusan): `settingValue` untuk pola Pattern B tampak
  device-type-agnostic di beberapa kasus (mis. titik uji tegangan/frekuensi
  standar), tapi berpotensi device-specific di kasus lain (mis. batas ukur
  yang bergantung pada rentang alat). Tidak ada indikasi di kode/schema yang
  memutuskan ini secara umum — perlu keputusan bisnis dari Afriza per
  capability, bukan aturan generik.
- Karena tidak ada endpoint create yang bisa direuse, copy test point
  (kalau diputuskan ikut) **butuh endpoint baru sepenuhnya** — tidak ada
  jalan pintas "panggil existing endpoint berulang" seperti pada parameter.

### 1.5 RBAC / validasi existing

- Guard: `@UseGuards(CompanyRoleGuard)` di level controller.
- Permission per aksi memakai `RequirePermission("deviceCalibrationParameter",
  "<action>")` dengan action: `create`, `read`, `update`, `delete`. Tidak ada
  action granular lain (mis. tidak ada `"copy"` action) yang sudah dipakai.
- Validasi create yang harus tetap dihormati bila copy dibuat lewat endpoint
  baru: `assertDeviceTypeExists`, `assertCapabilityItemExists`,
  `assertUomExists`, `assertToleranceBounds`, `assertDecimalPlacesValidForValueType`,
  `assertUniqueName` (device-calibration-parameters.service.ts:189-260).
  Semua ini per-baris; endpoint bulk-copy baru perlu menjalankan hal yang
  sama untuk tiap baris yang dicopy (atau reuse `create()` secara internal).

---

## Step 2 — Proposal Desain (belum implementasi)

### 2.1 UI flow

Diusulkan dimulai dari halaman list yang sudah ada
(`device-calibration-parameters-ui.tsx`), bukan halaman baru terpisah:

1. Di baris source DeviceType yang sudah di-expand, tambah tombol "Copy ke
   Device Type lain" di level header tabel per DeviceType (sejajar tombol
   "Tambah parameter untuk {name}" yang sudah ada di `ChildRows`).
2. Klik tombol → buka dialog/side panel (bukan halaman baru — konsisten
   dengan pola dialog yang sudah dipakai halaman-halaman lain di Portal):
   - Panel kiri: daftar capability source (checkbox per **Capability**, expand
     untuk checkbox per **parameter individual** di dalamnya) — sumber data
     `GET /device-calibration-parameters/grouped?deviceTypeId=<source>` yang
     sudah ada, tidak perlu endpoint baru untuk tahap pilih.
   - Checkbox capability = pilih semua parameter di bawahnya (indeterminate
     state kalau sebagian dipilih), agar kasus utama ("copy semua capability
     BSM ke Patient Monitor") tetap 1-2 klik, tapi granularitas per-parameter
     tetap tersedia untuk kasus partial.
3. Dropdown/select target DeviceType (exclude source device type itu
   sendiri dari daftar pilihan).
4. Preview: tabel ringkas "akan dibuat N parameter baru di {target}", dengan
   baris yang **konflik nama** (lihat 2.2) ditandai dan defaultnya
   di-uncheck otomatis (user bisa re-check untuk override sesuai opsi yang
   dipilih).
5. Confirm → panggil endpoint copy (lihat 2.5) → toast hasil ("N parameter
   disalin, M dilewati karena duplikat nama") → refresh grouped list.

### 2.2 Handling konflik

`code` tidak pernah konflik (lihat Step 1.2 — selalu dapat code baru dari
`MasterCodeService`). Konflik nyata cuma pada `assertUniqueName`
(nama parameter dobel dalam `(targetDeviceTypeId, capabilityItemId)`).

Dua opsi:

- **Opsi A (disarankan): Skip otomatis + laporkan.** Baris yang nama-nya
  sudah ada di target dilewati (tidak dibuat, tidak error, tidak
  overwrite), lalu response menyebutkan daftar yang di-skip beserta
  alasannya, ditampilkan di toast/summary setelah copy. User yang mau
  parameter itu ada di target dengan nilai berbeda tetap edit manual lewat
  form existing.
  - Trade-off: tidak ada cara "timpa nilai existing lewat copy" dalam sekali
    aksi — tapi ini konsisten dengan sifat `create` yang sudah ada
    (create tidak pernah upsert), dan menghindari resiko override diam-diam
    parameter yang sudah dipakai job berjalan di target device type.
- **Opsi B: Blokir seluruh batch bila ada satu konflik.** Preview
  menampilkan semua konflik, confirm dinonaktifkan sampai user
  uncheck semua baris yang konflik secara manual.
  - Trade-off: lebih aman dari salah klik, tapi lebih banyak friksi untuk
    kasus umum (copy besar dengan beberapa nama yang kebetulan sudah ada).

Rekomendasi: **Opsi A**, karena skip-per-baris + laporan sudah cukup aman
(tidak pernah menimpa data), dan tidak menghalangi baris lain yang valid.

### 2.3 `CalibrationTestPoint`

Tidak ada endpoint existing untuk ini (Step 1.4), jadi apa pun yang dipilih
butuh kerja backend baru. Tiga opsi:

- **Opsi A (disarankan untuk v1): Tidak ikut di-copy.** Parameter hasil
  copy dibuat dengan `entryStyle` mengikuti default (`DIRECT_REPLICATES`)
  — konsisten dengan batas create endpoint sekarang — dan test point (kalau
  source-nya Pattern B/LOGGER_SUMMARY) diisi manual lewat proses seed/admin
  yang sudah ada. Scope v1 murni "copy definisi parameter", bukan seluruh
  worksheet.
  - Trade-off: parameter hasil copy dari source Pattern B akan salah
    `entryStyle` (jadi DIRECT_REPLICATES padahal source-nya LOGGER_SUMMARY)
    kalau tidak ditangani — lihat mitigasi di bawah.
  - **Mitigasi wajib**: endpoint copy baru harus mendeteksi kalau source
    parameter `entryStyle != DIRECT_REPLICATES` atau `valueType != NUMBER`,
    lalu **exclude dari batch copy otomatis** (bukan salah-copy diam-diam)
    dan laporkan di summary sebagai "perlu dibuat manual" — sama seperti
    perlakuan pada baris konflik nama di §2.2.
- **Opsi B: Copy sebagai draft, `isActive=false`, wajib review manual.**
  Test point disalin apa adanya (`settingLabel`, `settingValue`, tolerance
  override) tapi parameter induk dan/atau test point diberi flag non-aktif
  sampai direview. Butuh keputusan bisnis dulu: apakah `settingValue`
  benar-benar device-agnostic untuk capability yang dimaksud (lihat
  observasi Step 1.4) — kalau tidak, draft yang "kelihatan lengkap" berisiko
  dipakai keliru sebelum sempat direview.
- **Opsi C: Tidak pernah didukung dari fitur copy** — device baru dengan
  Pattern B/LOGGER_SUMMARY selalu mulai dari seed manual, terlepas dari
  ada tidaknya fitur copy ini. Paling sederhana, tapi tidak membantu kasus
  yang justru paling butuh dibantu (parameter dengan banyak test point
  paling melelahkan untuk diinput manual satu-satu).

Rekomendasi: **Opsi A + mitigasi wajib**, sebagai v1 yang aman; Opsi B bisa
jadi fase 2 setelah ada keputusan bisnis eksplisit soal device-agnostic-nya
`settingValue` per capability.

### 2.4 Status hasil copy

Diusulkan **`isActive=true`** langsung (mengikuti default create existing),
BUKAN `false`/draft — dengan syarat mitigasi di §2.3 diterapkan (baris yang
tidak aman di-copy otomatis di-exclude, bukan di-copy lalu dinonaktifkan).
Alasan: nilai yang benar-benar dibawa masuk (tolerance, uom, decimalPlaces)
sama persis dengan yang sudah divalidasi di source, dan pola create manual
existing juga langsung aktif tanpa tahap review — konsisten dengan itu.
Kalau Afriza lebih memilih semua hasil copy start sebagai draft
(`isActive=false`) supaya ada gerbang review eksplisit sebelum dipakai job,
itu trade-off keamanan vs kecepatan yang perlu dikonfirmasi eksplisit,
bukan default yang saya asumsikan.

### 2.5 Scope endpoint

Diusulkan **endpoint bulk-copy baru**, bukan create existing dipanggil
berulang dari client:

`POST /device-calibration-parameters/copy`
```
{
  sourceDeviceTypeId: string,
  targetDeviceTypeId: string,
  parameterIds: string[]   // id DeviceCalibrationParameter yang dipilih user
}
```

Alasan endpoint baru (bukan reuse `create()` dari client-side loop):
- Butuh logika deteksi-dan-exclude per baris (§2.2 nama dobel, §2.3
  entryStyle/valueType tidak standar) yang harus konsisten dan atomik,
  bukan best-effort dari sisi client yang bisa gagal parsial di tengah loop.
- Response perlu bentuk ringkasan (`created`, `skippedDuplicateName`,
  `skippedUnsupportedEntryStyle`) untuk ditampilkan di toast/summary —
  bentuk ini tidak natural didapat dari memanggil `create()` N kali secara
  terpisah dari client.
- Bisa dibungkus satu `prisma.$transaction` per capability-scope
  (mengikuti pola `appendToOrderingScope` yang sudah transactional di
  `create()`), menjaga `sortOrder`/`DeviceTypeCapabilityOrder` tetap
  konsisten meski banyak baris dibuat sekaligus — sulit dijamin kalau
  create dipanggil satu-satu dari client dengan request terpisah (race
  condition pada `_max: { sortOrder }` antar request).
- RBAC: cukup pakai `RequirePermission("deviceCalibrationParameter",
  "create")` yang sudah ada — copy secara semantik adalah "membuat banyak
  parameter", tidak perlu action permission baru.

Endpoint ini secara internal bisa memanggil ulang bagian-bagian
`DeviceCalibrationParametersService` yang sudah ada (`assertUniqueName`,
`resolveCapabilityId`, `appendToOrderingScope`, `MasterCodeService.allocate`)
per baris di dalam satu transaksi, alih-alih menulis ulang logic tersebut.

---

## Ringkasan keputusan yang perlu dikonfirmasi Afriza sebelum Stage implementasi

1. §2.2 — Skip-otomatis-dan-laporkan (Opsi A) vs blokir seluruh batch
   (Opsi B) untuk konflik nama.
2. §2.3 — Exclude parameter non-DIRECT_REPLICATES/non-NUMBER dari copy v1
   (Opsi A) vs investasi lebih dulu di endpoint test-point copy (Opsi B)
   vs tidak pernah didukung (Opsi C).
3. §2.4 — Hasil copy langsung `isActive=true` vs `isActive=false` (draft,
   wajib review manual sebelum dipakai job).
4. Konfirmasi endpoint baru `POST /device-calibration-parameters/copy`
   (§2.5) sebagai pendekatan, bukan reuse create dari client.
