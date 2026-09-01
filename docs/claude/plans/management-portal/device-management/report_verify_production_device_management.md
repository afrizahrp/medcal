# Report: Verifikasi Production — Device Management

**Date:** 2026-08-27
**Target:** PostgreSQL native di VPS production (bukan `pkmdb` lokal)
**Prompt:** [`docs/claude/Verify_Production_Cursor_Prompt.md`](../../Verify_Production_Cursor_Prompt.md)
**Metode:** Opsi B — project owner menjalankan SQL di VPS; Cursor membandingkan hasil dengan seed/repo. Cursor tidak SSH ke production.
**Hasil akhir:** Device Management di production sesuai seed (59 tipe, 489 parameter). Dua temuan data diperbaiki dengan SQL ter-scope. `fix-collapsed-pattern-c-parameters.ts` **tidak** dijalankan di production.

---

## Step 0 — Batasan

- Verifikasi awal read-only (lima query di prompt).
- Perintah tulis hanya dijalankan setelah temuan dikonfirmasi, oleh project owner, dengan `DELETE`/`UPDATE` ter-scope — bukan `prisma migrate`, bukan seed penuh, bukan script Pattern-C.
- Image `medcal-api` tidak punya `psql`; query dijalankan di host VPS terhadap Postgres native.
- Evidence query: workbook `check_result.xlsx` (6 sheet = 5 query; query 4 terpecah 2 sheet).

---

## Step 1 — Hasil lima query (sebelum koreksi)

### 1. Migration (20 terakhir)

Device Management yang diminta prompt **sudah applied:**

| Yang dicek | Migration | `finished_at` (UTC) |
|---|---|---|
| `Device.deviceTypeId` | `20260826090000_add_device_type_to_device` | 2026-08-26 07:16:59 |
| `valueType` + UOM opsional | `20260826100000_add_valuetype_and_optional_uom_to_device_calibration_parameter` | 2026-08-26 07:16:59 |
| `toleranceMin` / `toleranceMax` / `toleranceNote` | `20260826190000_replace_limit_fields_with_tolerance_fields_on_device_calibration_parameter` | 2026-08-26 13:24:51 |
| Tabel `JobReferenceEquipmentUsed` | `20260826200000_add_job_reference_equipment_used` | 2026-08-26 13:24:51 |

Migration Device Management lain di window yang sama juga applied (`add_device_category_and_type`, `add_device_capability`, `add_device_calibration_parameter`, `add_uom`, dll.).

Paling atas di daftar: `20260827110000_quotation_discount_amounts` (2026-08-27 04:57:42 UTC). Di luar scope Device Management. Di repo lokal masih ada dua migration lebih baru yang tidak muncul di LIMIT 20 ini (`purchase_order_approved_and_nullable_tax`, `quotation_po_tax_required`) — tidak ditindaklanjuti di task ini.

**Verdict query 1:** LULUS untuk Device Management.

### 2. Jumlah baris vs prompt

| Tabel | Prompt (dev terakhir) | Production (awal) | Catatan |
|---|---|---|---|
| DeviceCategory | 13 | **13** | OK |
| DeviceType | 59 | **60** | +1 — lihat Temuan B |
| Uom | 46 | **47** | Seed repo saat ini juga 47; prompt stale |
| DeviceCapability | 30 | **30** | OK |
| DeviceCapabilityItem | 98 | **98** | OK |
| DeviceCalibrationParameter | 489 | **504** | +15 — lihat Temuan A |

**Verdict query 2:** Gagal count tipe dan parameter.

### 3. Toleransi terisi

| Metric | Production (awal) |
|---|---|
| total | 504 |
| `toleranceMin` atau `toleranceMax` terisi | 418 |
| `toleranceNote` terisi | 503 |

Hampir semua baris punya note. 86 tanpa angka min/max termasuk 7 baris Pattern-C collapsed (min/max NULL, note gabungan).

### 4. Nama Bahasa Indonesia

| code | name production |
|---|---|
| `ELECTRICAL_SAFETY` | Keselamatan Listrik |
| `PROTECTIVE_EARTH_RESISTANCE` | Resistansi Pembumian Protektif |

**Verdict query 4:** LULUS.

### 5. Pattern-C (`ACLV_STER_TEMP%`)

Seharusnya 2 baris. Ada 3:

| code | min / max | note |
|---|---|---|
| `ACLV_STER_TEMP` | NULL | `121 °C ~ 124 °C; 134 °C ~137 °C` (baris lama) |
| `ACLV_STER_TEMP_121` | 121 ~ 124 | `121 °C ~ 124 °C` |
| `ACLV_STER_TEMP_134` | 134 ~ 137 | `134 °C ~137 °C` |

Angka `1210000` / `1240000` di Excel adalah artefak locale dari `121.0000` / `124.0000`, bukan 1,21 juta.

**Verdict query 5:** GAGAL — split sudah ada, baris collapsed belum dihapus.

---

## Temuan A — 7 baris Pattern-C collapsed masih ada

### Diagnosis

Script lokal `packages/db/prisma/fix-collapsed-pattern-c-parameters.ts` mengasumsikan: baris lama ada, baris baru **belum** ada, lalu DELETE 7 + INSERT 15 (net +8 → 489).

Production berbeda: **keduanya sudah ada**. Unique `@@unique([deviceTypeId, capabilityItemId, code])`. Menjalankan script itu akan gagal saat `create` kode yang sudah ada.

Count awal 504 = 489 (baseline setelah split yang benar) + 15 (insert split) tanpa menghapus 7 collapsed. Setelah 7 dihapus: 504 − 7 = **497**, tetapi 497 itu masih termasuk 8 parameter duplikat Cold Chain (Temuan B). Setelah Temuan B: **489**.

Tujuh kode lama + 15 kode baru dikonfirmasi lengkap (22 baris) sebelum delete:

Lama: `ACLV_CHAMBER_TEMP`, `ACLV_STER_TEMP`, `ACLV_STER_TIME`, `BSC_LIGHT_INTENSITY`, `BSC_SOUND_LEVEL`, `LAF_SOUND_LEVEL`, `DXRAY_HVL`.

Baru: `ACLV_CHAMBER_TEMP_DT1/_DT2/_DT3`, `ACLV_STER_TEMP_121/_134`, `ACLV_STER_TIME_121/_134`, `BSC_LIGHT_INTENSITY_ON/_OFF`, `BSC_SOUND_LEVEL_ON/_OFF`, `LAF_SOUND_LEVEL_BACKGROUND/_COMPARTMENT`, `DXRAY_HVL_70KV/_80KV`.

`SUCT_MAX_VACUUM` tidak disentuh (sengaja, sama seperti script lokal).

### Perbaikan production (owner)

`fix-collapsed-pattern-c-parameters.ts` **tidak dijalankan**. Hanya hapus 7 baris lama:

```sql
DELETE FROM "DeviceCalibrationParameter"
WHERE code IN (
  'ACLV_CHAMBER_TEMP','ACLV_STER_TEMP','ACLV_STER_TIME',
  'BSC_LIGHT_INTENSITY','BSC_SOUND_LEVEL','LAF_SOUND_LEVEL','DXRAY_HVL'
);
```

### Verifikasi A

- `COUNT(*)` DeviceCalibrationParameter setelah A: **497** (masih +8 dari duplikat Cold Chain).
- `ACLV_STER_TEMP%` hanya `_121` dan `_134`.
- 15 kode split di atas tetap ada; 7 kode lama hilang.

Tidak ada FK masuk ke `DeviceCalibrationParameter.id`, jadi delete baris master ini aman.

---

## Temuan B — DeviceType 60 vs 59 (`COLD_CHAIN` vs `COALD_CHAIN`)

### Diagnosis

Tipe di luar daftar seed 59:

| code | name | category |
|---|---|---|
| `COLD_CHAIN` | Cold Chain | `COLD_CHAIN_STORAGE` |

Seed lama memakai **`COALD_CHAIN` / Coald Chain** (ejaan sumber Kemenkes dipertahankan). Project owner memutuskan **`COLD_CHAIN` yang benar**; `COALD_CHAIN` adalah typo.

Usage setelah diukur:

| id | code | devices | models | parameters | request_items |
|---|---|---|---|---|---|
| `cmt9rpxcf0020k4jn02kjnpv1` | `COLD_CHAIN` | 0 | 0 | 8 | 0 |
| `cmta4x9030024rn7mewysna2d` | `COALD_CHAIN` | 0 | 0 | 8 | 0 |

Delapan `param_code` identik di kedua tipe: `CCHAIN_APPLIED_LEAKAGE`, `CCHAIN_EARTH_RESISTANCE`, `CCHAIN_EQUIP_LEAKAGE`, `CCHAIN_INPUT_VOLTAGE`, `CCHAIN_INSULATION_RESISTANCE`, `CCHAIN_ROOM_HUMIDITY`, `CCHAIN_ROOM_TEMP`, `CCHAIN_STORAGE_TEMP`.

Percobaan pertama `DELETE FROM "DeviceType" WHERE code = 'COLD_CHAIN'` **gagal** (SQLSTATE 23503) — `COLD_CHAIN` sudah direferensikan 8 baris `DeviceCalibrationParameter`. Yang harus dibuang adalah set **typo** `COALD_CHAIN`.

497 − 8 duplikat parameter = **489**, sama dengan baseline seed/dev setelah Pattern-C.

### Perbaikan production (owner)

```sql
DELETE FROM "DeviceCalibrationParameter"
WHERE "deviceTypeId" = 'cmta4x9030024rn7mewysna2d';

DELETE FROM "DeviceType"
WHERE id = 'cmta4x9030024rn7mewysna2d'
  AND code = 'COALD_CHAIN';
```

`COLD_CHAIN` (`cmt9rpxcf0020k4jn02kjnpv1`) tidak diubah. Prefix parameter `CCHAIN_*` dibiarkan — itu kode parameter, bukan DeviceType.

### Perbaikan repo (agar seed berikutnya tidak menghidupkan typo)

- `packages/db/prisma/seed-device-types.ts` — `COALD_CHAIN` / Coald Chain → `COLD_CHAIN` / Cold Chain
- `packages/db/prisma/seed-device-calibration-parameters.ts` — 8 `deviceTypeCode` → `COLD_CHAIN`
- `packages/db/prisma/backfill-device-calibration-parameter-tolerances.ts` — referensi tipe → `COLD_CHAIN`

Laporan historis di `docs/claude/plans/` yang masih menulis `COALD_CHAIN` tidak diubah (arsip). Folder sumber `docs/legal_n_competency/…/Coald Chain/` juga tidak di-rename.

### Verifikasi B

| Cek | Hasil |
|---|---|
| `COUNT(*)` DeviceType | **59** |
| `COUNT(*)` DeviceCalibrationParameter | **489** |
| `COLD_CHAIN` / `COALD_CHAIN` | hanya **`COLD_CHAIN` / Cold Chain** |

---

## Step 2 — Status akhir production

| Cek prompt | Status |
|---|---|
| Migration `deviceTypeId` / `valueType`+tolerance / `JobReferenceEquipmentUsed` | LULUS |
| Category 13, Capability 30, CapabilityItem 98, Uom 47 | LULUS |
| Nama Indonesia (`ELECTRICAL_SAFETY`, `PROTECTIVE_EARTH_RESISTANCE`) | LULUS |
| Pattern-C 15 split, 7 collapsed hilang | LULUS (setelah Temuan A) |
| DeviceType 59, kode resmi `COLD_CHAIN` | LULUS (setelah Temuan B) |
| DeviceCalibrationParameter 489 | LULUS (setelah A + B) |

Tidak ada langkah tulis Device Management lain yang tertunda di production untuk scope prompt ini.

---

## Yang tidak dijalankan

- `prisma migrate deploy` / `migrate:dev`
- Seed penuh (`seed:device-types`, `seed:device-calibration-parameters`, dll.)
- `packages/db/prisma/fix-collapsed-pattern-c-parameters.ts` (tidak aman di state production: baris baru sudah ada)
- Perubahan Nginx, Docker Compose, `pg_hba`, atau container
