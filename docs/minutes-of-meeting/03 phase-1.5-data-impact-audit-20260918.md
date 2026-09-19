# Phase 1.5 — Read-Only Data Impact Audit

Tanggal audit: 2026-09-18  
Lingkup: named measurement points (`Awal`/`Akhir`, `L-N`/`L-G`/`N-G`, dll.) + dampak data historis.  
**Tidak ada implementasi.**

Legend klasifikasi fakta:

| Label | Arti |
|---|---|
| **Fakta DB** | Hasil SELECT di instance yang terhubung |
| **Perilaku kode** | Dibaca dari source, tidak dijalankan sebagai E2E |
| **Inferensi** | Kesimpulan dari fakta, bukan bukti langsung |
| **Belum terjawab** | Query gagal / tidak ada bukti |

---

## 1. Executive Summary

Katalog sudah punya model `CalibrationTestPoint` (`settingLabel` + `sequence`) yang **dapat merepresentasikan** titik ukur bernama tanpa ubah schema. **Fakta DB:** tidak ada baris test point berlabel `Awal`, `Akhir`, `L-N`, `L-G`, atau `N-G`. Parameter lingkungan BSM (`BSM_ROOM_TEMP`, `BSM_ROOM_HUMIDITY`, `BSM_INPUT_VOLTAGE`) **tidak punya test point** (Pattern A). Seed test point secara eksplisit mengeksklusi baris environment / electrical-safety.

**Fakta DB** instance terhubung (`pkmdb` di `::1:5432`): 213 test point (semua aktif), 54 `MeasurementResult` (52 `calibrationTestPointId` NULL, 2 terikat `BSM_HEART_RATE` / `30 BPM`), 5 `CalibrationJob`. Hasil lingkungan historis tersimpan sebagai ulangan tanpa nama (`replicateIndex` 1–5), bukan sebagai titik ukur. Job BSM `IN_PROGRESS` punya 2 hasil `BSM_ROOM_TEMP` NULL test-point.

Menanam test point aktif pada parameter katalog akan **langsung** memindahkan parameter itu dari Pattern A ke Pattern B untuk **semua** job (baru dan lama), karena `listMeasurementParameters` membaca katalog live, bukan snapshot job. Baris historis NULL **tidak** tampil di grid Pattern B. Backfill otomatis dari `replicateIndex` **tidak aman** (contoh: `MREF_ROOM_TEMP` hanya index 1 dan 5; BPM mengisi lima ulangan untuk satu parameter yang produknya hanya butuh dua titik).

Klasifikasi: **OPTION 4** untuk backfill hasil lama; **OPTION 2** untuk pengenalan test point (hanya job baru / tanpa memaksa mapping hasil lama). Backend `submitForReview` **tidak** menegakkan kelengkapan test point atau jumlah ulangan.

---

## 2. Schema Findings

Nama resmi di Prisma adalah `DeviceCalibrationParameter`, bukan `CalibrationParameter`. `DeviceModel` tidak di-FK ke `Device` atau job.

| Model | Relevant Fields | Relationship | Finding |
|---|---|---|---|
| `DeviceCalibrationParameter` | PK `id`; FK `deviceTypeId`, `capabilityItemId`, `uomId?`; `code`, `name`, `valueType`, `entryStyle`, `isActive`, `sortOrder` | 1:N `CalibrationTestPoint`; 1:N `MeasurementResult` | Unique `(deviceTypeId, capabilityItemId, code)`. Index: deviceType, capabilityItem, uom, isActive. |
| `CalibrationTestPoint` | PK `id`; FK `deviceCalibrationParameterId` (cascade); `sequence`, `settingLabel`, `settingValue?`, tolerance override?, `isActive` | N:1 parameter; 1:N results | Unique `(parameterId, sequence)` dan `(parameterId, settingLabel)`. Label bernama muat di `settingLabel` tanpa enum RANGE. |
| `MeasurementResult` | PK `id`; FK job (cascade), parameter (restrict), `calibrationTestPointId?` (restrict), `uomId?` | Optional test point | Natural key: `(calibrationJobId, deviceCalibrationParameterId, calibrationTestPointId, replicateIndex, attemptNumber, direction)` — komentar schema: migrasi memakai **NULLS NOT DISTINCT**. `calibrationTestPointId` NULL = Pattern A. |
| `CalibrationJob` | PK `id`; FK `workOrderId`, `deviceId?`, PO item?, request item? | 1:N results | Status enum: PENDING, IN_PROGRESS, SUBMITTED, REWORK, ACCEPTED_BY_QA. Unique `(workOrderId, deviceId)` dan `(workOrderId, purchaseOrderItemId, unitOrdinal)`. Index status. `currentAttempt` ≠ `replicateIndex`. |
| `Device` | PK `id`; FK `companyId`, `customerId`, `deviceTypeId`; `brand?`, `model?` (string) | 1:N jobs | Bukan katalog titik ukur. |
| `DeviceModel` | PK `id`; FK `deviceTypeId`; `manufacturer`, `model` | Hanya ke `DeviceType` | **Tidak** terhubung ke job/result. Tidak relevan untuk mapping historis. |
| `DeviceType` | PK `id`; `code` unique (dipakai query BSM = `BED_SIDE_MONITOR`) | 1:N parameters | Resolver Pattern A/B per `deviceTypeId` job. |

Enum relevan: `CalibrationValueType`, `CalibrationParameterEntryStyle` (`DIRECT_REPLICATES` \| `LOGGER_SUMMARY`), `MeasurementDirection` (`NONE`/`UP`/`DOWN`), `MeasurementEntryKind`, `CalibrationJobStatus`. **Tidak ada** enum RANGE / `expectedReplicateCount`.

Relasi parameter ↔ test point: anak katalog opsional; ada anak aktif → Pattern B di API.

Relasi test point ↔ result: FK nullable; hasil Pattern A sah tanpa test point.

Kunci ulangan vs attempt: `replicateIndex` = ulangan; `attemptNumber` = siklus REWORK; `direction` = naik/turun.

---

## 3. Current CalibrationTestPoint Data

**Fakta DB** (`pkmdb`):

| Metrik | Nilai |
|---:|---:|
| Total test point | 213 |
| Aktif | 213 |
| Tidak aktif | 0 |
| Parameter yang punya ≥1 test point | 48 |

Label yang diminta (`Awal`, `Akhir`, `L-N`, `L-G`, `N-G`, `Low`, `Nominal`, `High`, `Min`, `Med`, `Max`):

| Parameter | Test Point | Label | Sequence | Active | Result Count |
|---|---|---|---:|---|---:|
| `CENT_SPEED` | (1 baris per label) | Min / Med / Max | 1–3 | ya | 0 |
| `CRFR_SPEED` | sama | Min / Med / Max | 1–3 | ya | 0 |
| `ROT_SPEED` | sama | Min / Med / Max | 1–3 | ya | 0 |
| `SUCT_MAX_VACUUM` | sama | Low Vacuum / Medium Vacuum / High Vacuum | 1–3 | ya | 0 |

Tidak ditemukan label persis `Awal`, `Akhir`, `L-N`, `L-G`, `N-G`, `Low`, `Nominal`, `High`.

Parameter BSM dengan test point (setpoint kinerja, **bukan** lingkungan):

| Parameter | Test Point | Label | Sequence | Active | Result Count |
|---|---|---|---:|---|---:|
| `BSM_HEART_RATE` | `cmttsgnpz000mnvm711uhocal` … | 30/60/120/180 BPM | 1–4 | ya | 2 (hanya 30 BPM) |
| `BSM_RESP_RATE` | … | 15/30/60/120 BrPM | 1–4 | ya | 0 |
| `BSM_SPO2` | … | 98…88 %SpO2 (8 titik) | 1–8 | ya | 0 |
| `BSM_SYSTOLIC` | … | 120…100 mmHg (7 titik) | 1–7 | ya | 0 |
| `BSM_DIASTOLIC` | … | 80…65 mmHg (7 titik) | 1–7 | ya | 0 |
| `BSM_MAP` | … | 93…76 mmHg (7 titik) | 1–7 | ya | 0 |

Daftar 48 kode dengan test point (ringkas): `AUD_FREQUENCY_RESPONSE_*`, `AUD_PURE_TONE_LINEARITY_*`, `BPM_DIASTOLIC/MAP/SYSTOLIC`, `BSM_*` kinerja di atas, `CENT_SPEED`, `CPAP_CONCENTRATION`, `CPAP_FLOW_RATE`, `CRFR_SPEED`, `DXRAY_EXPOSURE_TIME`, `ECG_*`, `EST_*`, `FDOP_HR_ACCURACY`, `FM_FLOW_RATE`, `HUM_TEMP_ACCURACY`, `INCU_AIR_TEMP`, `INFUS_FLOW_RATE`, `O2CON_FLOW_RATE`, `PULSEOX_*`, `RESUS_P_PRESSURE_ACC`, `ROT_SPEED`, `SPHYG_PRESSURE_ACC`, `SPIRO_FVC`, `SUCT_*`, `SYR_FLOW_RATE`, `VENT_EXP_TIME`, `VENT_FIO2`, `VENT_INSP_TIME`, `VENT_MINUTE_VOLUME`, `VENT_PEEP`, `VENT_PPEAK`, `VENT_RESP_RATE`, `VENT_TIDAL_VOLUME`.

**Perilaku kode (seed):** `seed-calibration-test-points.ts` menyatakan Pattern A, logger-summary, BOOLEAN/RATIO, dan **setiap baris environment / electrical-safety tidak mendapat test point**.

---

## 4. BSM Parameter Audit

**Fakta DB** — parameter `DeviceType.code = BED_SIDE_MONITOR`:

| Parameter | Current Test Points | Intended Named Points | Existing Results | Risk |
|---|---|---|---:|---|
| `BSM_ROOM_TEMP` / Suhu Ruangan | **tidak ada** | Awal, Akhir | 2, semua `testPointId` NULL | Tinggi jika seed katalog global |
| `BSM_ROOM_HUMIDITY` / Kelembaban / RH | **tidak ada** | Awal, Akhir | 0 | Sedang (belum ada hasil; Pattern A→B tetap mengubah UI) |
| `BSM_INPUT_VOLTAGE` / Tegangan Input | **tidak ada** | L-N, L-G, N-G | 0 | Sedang (sama) |
| `BSM_HEART_RATE` | 4 setpoint BPM | (bukan target Phase 2 env) | 2, **dengan** TP | Rendah untuk env; sudah Pattern B |
| `BSM_RESP_RATE` | 4 | — | 0 | — |
| `BSM_SPO2` | 8 | — | 0 | — |
| `BSM_SYSTOLIC` / `DIASTOLIC` / `MAP` | 7 masing-masing | — | 0 | — |
| `BSM_EARTH_RESISTANCE`, `INSULATION_RESISTANCE`, `EQUIP_LEAKAGE`, `APPLIED_LEAKAGE` | **tidak ada** | di luar scope named env | 0 | — |

Parameter lingkungan vs kinerja: `capabilityItem` seed memetakan `*_ROOM_TEMP` / `*_ROOM_HUMIDITY` / `*_INPUT_VOLTAGE` ke `ENVIRONMENTAL_CONDITIONS`. Kinerja NIBP/HR/SpO2/Resp sudah punya setpoint.

**Tanpa ubah schema:** `Awal`/`Akhir`/`L-N`/`L-G`/`N-G` **dapat** disimpan sebagai `CalibrationTestPoint.settingLabel` (unique per parameter). **Tidak dibuat** pada audit ini.

Query SELECT semua `*_ROOM_TEMP` / `*_ROOM_HUMIDITY` / `*_INPUT_VOLTAGE` lintas device type: **semua `tp_count = 0`**.

---

## 5. MeasurementResult Audit

**Fakta DB:**

| Metrik | Nilai |
|---:|---:|
| Total result | 54 |
| `calibrationTestPointId` IS NULL | 52 |
| IS NOT NULL | 2 |
| Job dengan result | 3 dari 5 |

Result **dengan** test point: `BSM_HEART_RATE` label `30 BPM`, n=2.

Result NULL test point per parameter:

| Parameter | Results | Jobs | Device type |
|---:|---:|---|---|
| `BPM_EQUIP_LEAKAGE` | 6 | 1 | BLOOD_PRESSURE_MONITOR |
| `BPM_INSULATION_RESISTANCE` | 6 | 1 | BLOOD_PRESSURE_MONITOR |
| `MREF_INPUT_VOLTAGE` | 5 | 1 | MEDICAL_REFRIGERATOR |
| `BPM_ROOM_HUMIDITY` | 5 | 1 | BLOOD_PRESSURE_MONITOR |
| `BPM_ROOM_TEMP` | 5 | 1 | BLOOD_PRESSURE_MONITOR |
| `MREF_EARTH_RESISTANCE` | 5 | 1 | MEDICAL_REFRIGERATOR |
| `BPM_INPUT_VOLTAGE` | 5 | 1 | BLOOD_PRESSURE_MONITOR |
| `BPM_EARTH_RESISTANCE` | 5 | 1 | BLOOD_PRESSURE_MONITOR |
| `MREF_ROOM_TEMP` | 2 | 1 | MEDICAL_REFRIGERATOR |
| `BSM_ROOM_TEMP` | 2 | 1 | BED_SIDE_MONITOR |
| `MREF_APPLIED_LEAKAGE` | 2 | 1 | MEDICAL_REFRIGERATOR |
| `MREF_ROOM_HUMIDITY` | 2 | 1 | MEDICAL_REFRIGERATOR |
| `MREF_EQUIP_LEAKAGE` | 1 | 1 | MEDICAL_REFRIGERATOR |
| `MREF_INSULATION_RESISTANCE` | 1 | 1 | MEDICAL_REFRIGERATOR |

NULL test point × status job (hanya parameter lingkungan):

| Parameter | Job status | Results | Jobs |
|---|---|---:|---:|
| `BPM_*` env (temp, RH, voltage) | ACCEPTED_BY_QA | 5 masing-masing | 1 |
| `MREF_INPUT_VOLTAGE` | ACCEPTED_BY_QA | 5 | 1 |
| `MREF_ROOM_TEMP` / `MREF_ROOM_HUMIDITY` | ACCEPTED_BY_QA | 2 masing-masing | 1 |
| `BSM_ROOM_TEMP` | IN_PROGRESS | 2 | 1 |

Tidak ada result lingkungan berstatus PENDING / SUBMITTED / REWORK.

`replicateIndex` lingkungan: BPM temp/RH/voltage = 1,2,3,4,5 (satu baris per index). BSM temp = 1 dan 2. MREF voltage = 1–5. MREF temp/RH = **hanya 1 dan 5** (bukan 1 dan 2).

Result per status job (semua parameter): IN_PROGRESS 4 result / 1 job; ACCEPTED_BY_QA 50 result / 2 job.

---

## 6. Active Job Impact

`deviceId` LEFT JOIN `Device` menghasilkan `device_type` NULL pada daftar job (job mungkin belum terikat device master). Tipe BSM untuk job aktif **disimpulkan dari kode parameter hasil**, bukan dari Device.

| Job ID | Status | Device/model | Parameter terdampak env | Result count | `calibrationTestPointId` |
|---|---|---|---|---:|---|
| `cmu0qm039001prv0ng7lp0fmv` | IN_PROGRESS | BED_SIDE_MONITOR (dari hasil) | `BSM_ROOM_TEMP` | 2 | semua NULL |
| (job yang sama) | IN_PROGRESS | BED_SIDE_MONITOR | `BSM_HEART_RATE` | 2 | terisi (`30 BPM`) — **bukan** target seed env |

Job lain:

| Job ID | Status | Result | Catatan |
|---|---|---:|---|
| `cmu0x0el0001drz0nlkm8l9ci` | PENDING | 0 | Tipe alat **belum terjawab** (query WO/PO `deviceTypeId` gagal: kolom tidak ada) |
| `cmu0qm12s001qrv0n5fpwnqh9` | ACCEPTED_BY_QA | 0 | — |
| `cmu0qm12s001rrv0nx74n0qur` | ACCEPTED_BY_QA | 18 | 18 NULL TP (selaras BPM-ish) |
| `cmu0x0exf001irz0ni2kahq55` | ACCEPTED_BY_QA | 32 | 32 NULL TP (selaras MREF + kebocoran) |

Tidak ada job SUBMITTED/REWORK dengan result lingkungan.

**Inferensi risiko:** seed `Awal`/`Akhir` pada `BSM_ROOM_TEMP` **sekarang** akan mengubah job `IN_PROGRESS` di atas ke Pattern B saat teknisi membuka Tech-PWA.

Finding — not changed: join job→device type via PurchaseOrderItem gagal (`poi.deviceTypeId` tidak ada).

---

## 7. Historical Mapping Feasibility

Tidak dilakukan mapping. Hanya klasifikasi bukti.

| Parameter | Intended Point | Mapping Evidence | Classification |
|---|---|---|---|
| Temperature (BSM) | Awal | 2 baris NULL TP, `replicateIndex` 1 dan 2; tidak ada label/setting/direction; PDF BSM **sengaja tidak mengisi** sel Awal/Akhir | NOT DETERMINABLE |
| Temperature (BSM) | Akhir | Sama; urutan baris **tidak** dijamin sebagai Awal lalu Akhir oleh kode | NOT DETERMINABLE |
| Temperature (BPM) | Awal | 5 ulangan index 1–5 pada job ACCEPTED; produk hanya 2 titik | NOT DETERMINABLE |
| Temperature (BPM) | Akhir | Sama | NOT DETERMINABLE |
| Temperature (MREF) | Awal | Index **1 dan 5** saja — pola UI 5-slot lama, bukan 2 titik bernama | NOT DETERMINABLE |
| Temperature (MREF) | Akhir | Sama | NOT DETERMINABLE |
| RH (BSM) | Awal / Akhir | 0 result | NOT DETERMINABLE (tidak ada data) |
| RH (BPM) | Awal / Akhir | 5 ulangan unnamed | NOT DETERMINABLE |
| RH (MREF) | Awal / Akhir | Index 1 dan 5 | NOT DETERMINABLE |
| Input Voltage (BSM) | L-N / L-G / N-G | 0 result | NOT DETERMINABLE |
| Input Voltage (BPM, MREF) | L-N / L-G / N-G | 5 ulangan unnamed (bukan 3 titik); tidak ada metadata L/N/G | NOT DETERMINABLE |

Bukti yang **tidak** ada: `settingLabel` pada result, `appliedNominalValue` yang membedakan L-N vs L-G, `direction` selain default untuk env, `calibrationTestPointId`, komentar teknisi yang diaudit, logika PDF yang mengikat replicateIndex→sel LK (kode PDF `void firstValue` lalu tetap mencetak sel kosong).

**Jangan** menyamakan `replicateIndex` 1→Awal, 2→Akhir: MREF membantah; BPM kelebihan 3 ulangan.

---

## 8. Existing Tech-PWA Compatibility

**Perilaku kode** (Phase 1 sudah live di tree):

1. **Tampil hasil lama NULL?** Ya, selama parameter masih Pattern A: `page.tsx` `existingRows` memfilter `calibrationTestPointId === null`.
2. **Edit?** Ya di Pattern A (baris ulangan). Grid Pattern B **melewati** baris NULL (`measurement-grid.tsx`: `if (r.calibrationTestPointId === null) continue`).
3. **Load Tech-PWA?** Ya; API tetap mengembalikan semua result job.
4. **Pattern B expect baris CalibrationTestPoint?** Ya. `listMeasurementParameters` memasukkan parameter ke `gridParameters` iff ada `testPoints: { some: { isActive: true } }`.
5. **Job historis + tanpa asosiasi TP?** Setelah katalog dapat TP aktif: parameter pindah ke grid; result NULL **tidak** masuk sel; UI kosong untuk titik baru.
6. **Diam-diam incomplete?** `gridEntryStatus`: complete hanya jika **setiap id test point aktif** punya ≥1 bacaan terisi. Result NULL tidak mengisi set id → chip incomplete. `parameterEntryStatus` tidak dipakai untuk Pattern B.
7. **Save/update preserve old?** Natural key berbeda jika `calibrationTestPointId` berubah. Save grid membuat baris **baru** ber-FK test point; baris NULL **tidak** di-update otomatis. **Inferensi:** duplikasi semantik mungkin (NULL lama + TP baru), sampai ada kebijakan hapus/backfill (tidak dilakukan).
8. **submitForReview named points?** Tidak (bagian 9).

Finding — not changed: catalog test point bersifat global, bukan per-job.

---

## 9. submitForReview Audit

**Perilaku kode** `calibration-jobs.service.ts` `submitForReview`:

1. Kriteria: job belum SUBMITTED/ACCEPTED_BY_QA; harus `IN_PROGRESS` dan `startedAt` tidak null; `assertReferenceEquipmentResolvedForSubmit`; lalu `updateMany` status → SUBMITTED + `submittedAt`.
2. **Tidak** memeriksa `CalibrationTestPoint` completeness.
3. **Tidak** memeriksa jumlah `replicateIndex`.
4. Parameter tanpa test point: **tidak** ada minimum replication di backend.
5. Pattern A vs B: **tidak dibedakan** di submit.

Tes terkait: `physical-check-results.service.test.ts` menyatakan submit tetap sukses meski physical check tidak lengkap — selaras dengan tidak adanya gate pengukuran.

---

## 10. Replication Hard-Code Audit

`DEFAULT_REPLICATE_COUNT`, `THREE_REPLICATE_PREFIXES`, `expectedReplicateCount`: **tidak ditemukan** di `apps/` TypeScript.

| Lokasi | Isi | Klasifikasi |
|---|---|---|
| `apps/tech-pwa/src/lib/calibration/measurement.ts` | `visibleReplicateCount`; komentar jangan hard-code 5 atau 3 | Logika fungsional (dinamis, min 1) |
| `apps/tech-pwa/.../measurement.test.ts` | `visibleReplicateCount(5,0)===5`; tes “tidak special-case VENT_ atau AUD_” | Test fixture |
| `apps/tech-pwa/.../page.tsx` + `measurement-grid.tsx` | pakai `visibleReplicateCount` | Logika fungsional Phase 1 |
| `apps/api/.../lk-templates/bed-side-monitor.ts` | `replicatesFor(..., 5)` pada HR/Resp/SpO2/NIBP | Logika fungsional **PDF LK**: layout 5 kolom I–V per setpoint, **bukan** katalog env |
| `apps/api/.../lk-template-data.ts` | `replicatesFor(..., count)` | Helper PDF |
| `apps/api/.../lk-templates/bed-side-monitor.ts` `drawEnvironment` | sel Awal/Akhir/L-N dicetak **kosong**; komentar tidak ada mapping schema | Logika PDF (sengaja blank) |
| `packages/db/prisma/seed-device-calibration-parameters.ts` | kode `VENT_*`, `AUD_*`, env params | Seed katalog, **bukan** aturan ulangan |
| `packages/db/prisma/seed-calibration-test-points.ts` | sweep setpoint; env excluded | Seed/example |
| `docs/**` | `expectedReplicateCount`, prefix VENT_/AUD_ historis | Dokumentasi |
| `apps/tech-pwa/.../identity-correction` | “5/5” langkah wizard | Tidak terkait ulangan ukur |
| Tes API `measuredValue: 5` | angka bacaan | Test fixture |

Finding — not changed: PDF BSM masih meminta hingga 5 kolom ulangan untuk **kinerja** setpoint. Itu terpisah dari Phase 1 Tech-PWA dan dari titik env bernama.

---

## 11. Migration / Backfill Assessment

Tidak ada preferensi produk — hanya bukti.

| Parameter / kelompok | Klasifikasi | Evidence | Risk | Required future action |
|---|---|---|---|---|
| `BSM_ROOM_TEMP` (dan analog `*_ROOM_TEMP` tanpa TP) | **OPTION 4** backfill; pengenalan katalog = **OPTION 2** | Result NULL; 2 ulangan BSM tidak berlabel; MREF/BPM membantah mapping index; schema **bisa** menampung label baru | Job IN_PROGRESS BSM; UI Pattern B menyembunyikan NULL | Jangan backfill otomatis. Putuskan apakah job berjalan tetap Pattern A |
| `*_ROOM_HUMIDITY`, `*_INPUT_VOLTAGE` | **OPTION 4** + **OPTION 2** | Hampir semua 0 result atau 5 unnamed replicates; 0 TP | Seed global mengubah semua tipe alat yang memakai kode itu | Seed hanya jika disepakati berlaku katalog-lebar |
| Parameter yang **sudah** Min/Med/Max (CENT/CRFR/ROT, SUCT Low/Med/High) | **OPTION 1** untuk *label yang sudah ada* | Label eksplisit di `CalibrationTestPoint` | Rendah | Jangan timpa; bukan target Awal/Akhir |
| `BSM_HEART_RATE` dkk. setpoint | **OPTION 1** | Sudah Pattern B + settingValue | Rendah | Di luar seed env |
| Hasil ACCEPTED_BY_QA (BPM, MREF) | **OPTION 4** | 5 slot / index 1+5 | Sertifikat/LK historis vs grid baru | Biarkan NULL; PDF env tetap blank sampai mapping eksplisit |

**OPTION 3** ditolak: tidak ada bukti deterministik.

**OPTION 1 murni** ditolak untuk env BSM: memperkenalkan TP katalog **bukan** “data lama aman + job baru saja” tanpa perubahan kode snapshot — API membaca katalog live.

---

## 12. Phase 2 Preconditions

Keputusan yang masih diperlukan (didukung kode/data, bukan inventaris baru):

1. Daftar pasti `DeviceCalibrationParameter.code` yang menerima TP bernama (hanya BSM, atau semua `*_ROOM_TEMP` / `*_ROOM_HUMIDITY` / `*_INPUT_VOLTAGE`).
2. Label dan `sequence` persis: Suhu/RH = `Awal` then `Akhir`; tegangan = `L-N`, `L-G`, `N-G` (unique `settingLabel`).
3. `settingValue` NULL vs nominal (mis. 25 °C / 220 V) — schema mengizinkan keduanya; PDF memakai teks toleransi terpisah.
4. Apakah TP katalog berlaku untuk **job yang sudah ada** (termasuk `cmu0qm039001prv0ng7lp0fmv`) atau hanya job yang dibuat setelah `CalibrationTestPoint.createdAt` (butuh perubahan `listMeasurementParameters` — belum ada).
5. Perlakuan result NULL pada job aktif: biarkan orphan, wajib input ulang, atau blokir seed sampai job selesai.
6. Backfill: **tidak** direkomendasikan otomatis; jika manusia memetakan, itu di luar bukti mesin.
7. Apakah `submitForReview` harus menolak Pattern B yang belum lengkap (Phase 1 sengaja tidak menambah ini).
8. PDF/LK `drawEnvironment`: hari ini **tidak** mengisi Awal/Akhir/L-N dari result; Phase 2 PDF perlu mapping `settingLabel` → sel, terpisah dari Tech-PWA.
9. Apakah PDF kinerja tetap 5 kolom `replicatesFor(..., 5)` setelah ulangan dinamis di PWA (bisa memotong/mengabaikan ulangan >5).
10. Konfirmasi environment DB production vs salinan lokal sebelum seed apa pun.

---

## 13. Files Inspected

- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/seed-calibration-test-points.ts`
- `packages/db/prisma/seed-device-calibration-parameters.ts` (cuplikan env / VENT_)
- `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts` (`submitForReview`, `listMeasurementParameters`)
- `apps/api/src/modules/calibration-jobs/lk-templates/bed-side-monitor.ts`
- `apps/api/src/modules/calibration-jobs/lk-template-data.ts`
- `apps/tech-pwa/src/lib/calibration/measurement.ts`
- `apps/tech-pwa/src/lib/calibration/measurement.test.ts`
- `apps/tech-pwa/src/app/jobs/[id]/measurements/[parameterId]/page.tsx`
- `apps/tech-pwa/src/app/jobs/[id]/measurements/measurement-grid.tsx`
- `apps/tech-pwa/src/app/jobs/[id]/measurements/page.tsx`
- `apps/tech-pwa/src/app/jobs/[id]/page.tsx`
- `docs/minutes-of-meeting/phase-1-named-measurement-points-dynamic-replication-20260918.md` (konteks Phase 1)
- Skrip SELECT di `%TEMP%\medcal-phase15-readonly-audit.ts` (+ `-2.ts`, `-3.ts`) — **di luar repo**

---

## 14. Database Queries Executed

Semua `SELECT` / `COUNT` / `GROUP BY` via `prisma.$queryRawUnsafe` (read-only). Tidak ada INSERT/UPDATE/DELETE/DDL.

1. `SELECT current_database(), current_user`
2. `SELECT host(inet_server_addr()), inet_server_port()`
3. COUNT `CalibrationTestPoint` (total / isActive) ; COUNT `MeasurementResult` (total / NULL TP / NOT NULL); COUNT `CalibrationJob`
4. GROUP test point `settingLabel` matching Awal/Akhir/L-N/…/Min/Med/Max
5. Parameter BSM + count TP/MR
6. Parameter `*_ROOM_TEMP` / `*_ROOM_HUMIDITY` / `*_INPUT_VOLTAGE` + count TP/MR
7. GROUP MR NULL TP by parameter
8. GROUP MR NULL TP lingkungan by job status
9. Job status IN (PENDING, IN_PROGRESS, REWORK, SUBMITTED) × parameter lingkungan
10. `replicateIndex` distribution untuk parameter lingkungan
11. GROUP parameter yang punya TP
12. Job list: id, status, count result NULL/NOT NULL (LEFT JOIN Device — device_type sering NULL)
13. Test point BSM detail (id, label, sequence, result count)
14. GROUP MR by job status; GROUP MR with TP by parameter+label
15. Job IN_PROGRESS × semua parameter yang punya result
16. **Gagal (read-only):** join job ke `PurchaseOrderItem.deviceTypeId` — kolom tidak ada (`42703`)

Tidak dijalankan: `prisma migrate`, seed, `UPDATE`, `INSERT`.

---

## 15. Changes Made

**NO CHANGES MADE — READ-ONLY AUDIT.**

Laporan markdown ini adalah satu-satunya artefak yang ditulis ke repo. Schema, migrasi, seed, API, UI, dan baris database **tidak** diubah. Skrip audit hanya ada di temp OS, bukan di git.

---

## Validasi penutup

| Cek | Hasil |
|---|---|
| Write DB | Tidak |
| Migrasi / seed | Tidak |
| Ubah source aplikasi | Tidak (hanya file laporan ini) |
| Environment | `current_database()=pkmdb`, user `postgres`, server `::1:5432` → **lokal / development**. Bukan bukti production. Apakah `pkmdb` salinan staging **belum terjawab**. |
