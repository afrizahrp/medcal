# STAGE 2 — Implementasi Copy-Paste Parameter Antar DeviceType — Implementation Report

Status: **Selesai**. Referensi desain:
[copy-paste-capability-parameter-design.md](./copy-paste-capability-parameter-design.md)
(Step 1 inspeksi + Step 2 proposal, keputusan Afriza di §2.2–§2.5).

## Ringkasan

Fitur copy parameter kalibrasi antar Device Type sudah berjalan end-to-end:
endpoint baru `POST /device-calibration-parameters/copy` di backend, dan
halaman Portal baru `/device-calibration-parameters/copy` di frontend,
dijangkau lewat tautan "Copy dari device lain" di halaman list yang sudah
ada.

## 1. Backend

### 1.1 Schema (`packages/shared/src/schemas/index.ts`)
- `deviceCalibrationParameterCopySchema` — body `{ sourceDeviceTypeId,
  targetDeviceTypeId, parameterIds[] }`, menolak `sourceDeviceTypeId ===
  targetDeviceTypeId` di level schema (`.refine`).

### 1.2 Service (`apps/api/.../device-calibration-parameters.service.ts`)
Method baru `copy()`:
1. Validasi `sourceDeviceTypeId` dan `targetDeviceTypeId` exist
   (`assertDeviceTypeExists`, reuse).
2. Ambil semua `parameterIds` yang benar-benar milik `sourceDeviceTypeId`;
   kalau ada id yang tidak cocok (dihapus, salah device, dsb) — seluruh
   request ditolak `BadRequestException` (`DEVICE_CALIBRATION_PARAMETER_COPY_INVALID_SOURCE`),
   sesuai keputusan bahwa validasi identitas request ditolak total, bukan
   skip-per-baris.
3. Di dalam satu `prisma.$transaction`, iterasi tiap parameter source
   (urut `sortOrder`) dan untuk masing-masing:
   - **Exclude check (§2.3)** — `entryStyle !== DIRECT_REPLICATES` atau
     `valueType !== NUMBER` → masuk `skippedUnsupportedEntryStyle`, tidak
     dibuat.
   - **Duplicate check (§2.2)** — nama sudah ada di
     `(targetDeviceTypeId, capabilityItemId)` → masuk
     `skippedDuplicateName`, tidak dibuat.
   - Kalau lolos: buat `DeviceCalibrationParameter` baru dengan
     `capabilityItemId` **sama** dengan source (capability global reusable,
     tidak pernah dibuat baru), `code` baru via `MasterCodeService.allocate`,
     semua field lain (`name, description, uomId, tolerance*,
     decimalPlaces`) di-copy apa adanya, `isActive: true` (§2.4), dan
     `sortOrder`/`DeviceTypeCapabilityOrder` di-append via
     `appendToOrderingScope` yang sudah ada (auto-create order row kalau
     target belum pernah punya capability itu).
4. Return `{ created[], skippedDuplicateName[], skippedUnsupportedEntryStyle[] }`.

Semua helper privat yang sudah ada di-reuse langsung (tidak ada logic
digandakan): `assertDeviceTypeExists`, `resolveCapabilityId`,
`appendToOrderingScope`, `MasterCodeService.allocate`.

### 1.3 Controller
`POST /device-calibration-parameters/copy`, guard
`RequirePermission("deviceCalibrationParameter", "create")` — sama seperti
create manual, tidak ada RBAC action baru (§2.5).

### 1.4 Tes (`device-calibration-parameters.service.test.ts`)
9 test baru ditambahkan (2 untuk schema, 7 untuk service), semua lolos:
- Copy normal tanpa konflik → `created`, `capabilityItemId` sama dengan
  source, `code` baru dan berbeda dari source.
- Skip duplicate name → tidak dibuat, masuk `skippedDuplicateName`.
- Skip `entryStyle=LOGGER_SUMMARY` dan `valueType=TEXT` (dibuat langsung
  lewat `prisma.deviceCalibrationParameter.create` di test, karena create
  API publik memang tidak bisa membuat kombinasi ini) → masuk
  `skippedUnsupportedEntryStyle` dengan `entryStyle`/`valueType` yang benar.
- Request campuran (1 ok + 1 duplicate + 1 unsupported) → ketiga array
  hasil terisi benar, tidak ada baris yang hilang.
- Target belum pernah punya capability tsb → `DeviceTypeCapabilityOrder`
  baru terbuat.
- `parameterIds` yang bukan milik `sourceDeviceTypeId` → `BadRequestException`.
- `sourceDeviceTypeId`/`targetDeviceTypeId` tidak ditemukan →
  `BadRequestException`.

Hasil run: **35/35 test passed** di file ini (26 existing + 9 baru).
`@medcal/shared` dan `@medcal/api` typecheck bersih untuk semua file yang
disentuh task ini (2 error `tsc` yang muncul di `kontrol-alat.service.ts`
adalah pekerjaan lain yang sudah ada di working tree sebelum task ini,
tidak disentuh sama sekali di sini).

## 2. Frontend (Portal)

### 2.1 Entry point
`device-calibration-parameters-ui.tsx` — tautan baru "Copy dari device
lain" (ikon `Copy` dari lucide-react) berdampingan dengan "Tambah parameter
untuk {name}" yang sudah ada di baris expand tiap Device Type, mengarah ke
`/device-calibration-parameters/copy?targetDeviceTypeId=<id>`. Muncul hanya
kalau user punya `deviceCalibrationParameterCreate` (permission sama dengan
tombol tambah manual).

### 2.2 Halaman baru `device-calibration-parameters/copy/page.tsx`
Mengikuti pola halaman `new/page.tsx` yang sudah ada (halaman penuh, bukan
dialog/modal — codebase ini memang tidak punya primitive Dialog/Toast, jadi
konsisten dengan konvensi yang sudah dipakai untuk create manual):

1. Dropdown Device Type sumber & tujuan (tujuan pre-filled dari query
   param `targetDeviceTypeId`, keduanya saling exclude satu sama lain di
   pilihan dropdown-nya).
2. Begitu sumber dipilih, daftar parameter aktif sumber di-fetch
   (`useDeviceCalibrationParameters({ deviceTypeId, isActive: true, ... })`,
   endpoint list yang sudah ada — bukan endpoint baru) dan dikelompokkan
   per Capability di sisi client.
3. Checkbox per Capability (indeterminate-aware, pakai `ref.current.indeterminate`
   karena HTML tidak punya prop native untuk itu) dan checkbox per
   parameter individual.
4. Parameter dengan `entryStyle !== DIRECT_REPLICATES` atau
   `valueType !== NUMBER` — checkbox **disabled**, label "Tidak bisa
   dicopy — perlu dibuat manual", tidak bisa ikut ter-check sama sekali
   (mitigasi §2.3 diterapkan di UI, bukan cuma di server).
5. Tombol "Copy N Parameter" memanggil `POST /device-calibration-parameters/copy`
   lalu menampilkan ringkasan hasil: jumlah berhasil dibuat + daftar nama
   yang dilewati per kategori (duplicate name / unsupported).

### 2.3 Perubahan pendukung
- `use-device-calibration-parameters-query.ts` — hook baru
  `useCopyDeviceCalibrationParameters()`; parameter `options?.enabled`
  ditambahkan ke `useDeviceCalibrationParameters()` supaya list parameter
  sumber baru di-fetch setelah Device Type sumber dipilih (hook ini
  sebelumnya belum dipakai di halaman manapun, jadi perubahan ini tidak
  memengaruhi caller lain).
- `device-calibration-parameters-ui.tsx` — field `entryStyle` ditambahkan
  ke tipe `DeviceCalibrationParameterRow` (data-nya sudah selalu ikut
  terkirim dari API — `parameterInclude` di service tidak meng-exclude
  scalar field manapun — hanya belum dideklarasikan di tipe frontend).
- `device-calibration-parameter-form-fields.tsx` — 2 kode error baru
  ditambahkan ke `formatDeviceCalibrationParameterApiError` (dipakai juga
  di halaman copy): `INVALID_DEVICE_CALIBRATION_PARAMETER_COPY`,
  `DEVICE_CALIBRATION_PARAMETER_COPY_INVALID_SOURCE`.

### 2.4 Verifikasi
- `@medcal/portal` typecheck bersih.
- Lint portal/api adalah script placeholder di repo ini (`echo "lint ...
  skipped"`) — tidak ada linter nyata untuk dijalankan.
- **Belum di-uji manual di browser** (dev server tidak dijalankan pada sesi
  ini) — hanya diverifikasi lewat typecheck dan test backend. Rekomendasi:
  jalankan `pnpm --filter @medcal/portal dev`, buka
  `/device-calibration-parameters`, expand satu Device Type yang sudah
  punya parameter, klik "Copy dari device lain", dan lakukan satu kali copy
  end-to-end sebelum dianggap final untuk produksi.

## Di luar scope (sesuai keputusan Stage 2)
- Tidak ada endpoint/UI untuk `CalibrationTestPoint`. Parameter Pattern
  B/LOGGER_SUMMARY yang di-exclude tetap harus dibuat manual lewat jalur
  seed yang sudah ada.
- Tidak menormalisasi capability (sudah FK, tidak disentuh).
- Tidak ada RBAC action baru.

## File yang diubah/ditambah
**Backend**
- `packages/shared/src/schemas/index.ts` (skema baru)
- `apps/api/src/modules/device-calibration-parameters/device-calibration-parameters.service.ts` (method `copy` + tipe hasil)
- `apps/api/src/modules/device-calibration-parameters/device-calibration-parameters.controller.ts` (endpoint baru)
- `apps/api/src/modules/device-calibration-parameters/device-calibration-parameters.service.test.ts` (9 test baru)

**Frontend**
- `apps/portal/src/app/management/device-calibration-parameters/copy/page.tsx` (baru)
- `apps/portal/src/app/management/device-calibration-parameters/use-device-calibration-parameters-query.ts` (hook `useCopyDeviceCalibrationParameters`, opsi `enabled`)
- `apps/portal/src/app/management/device-calibration-parameters/device-calibration-parameters-ui.tsx` (tautan entry point, field `entryStyle`)
- `apps/portal/src/app/management/device-calibration-parameters/device-calibration-parameter-form-fields.tsx` (2 kode error baru)
