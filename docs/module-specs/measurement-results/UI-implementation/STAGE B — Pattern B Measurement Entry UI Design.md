# STAGE B — Pattern B Measurement Entry UI Design (tech-pwa)

**Date:** 2026-09-09
**Mode:** Stage 1 — PROPOSE ONLY. Tidak ada kode, schema, migrasi, atau seed yang diubah.
**Predecessor:** [STAGE B — Pattern B Measurement Entry UI.md](./STAGE%20B%20—%20Pattern%20B%20Measurement%20Entry%20UI.md)
(brief), [MeasurementResult-stageA-tech-pwa-skeleton-implementation-report.md](./MeasurementResult-stageA-tech-pwa-skeleton-implementation-report.md)
(Stage A live), [calibration-results-cross-check.md](../calibration-results-cross-check.md)
+ [calibration-results-five-steps-implementation-report.md](../calibration-results-five-steps-implementation-report.md)
(evidence 2026-09-08).
**HARD STOP** setelah dokumen ini — review + persetujuan wajib sebelum Stage 2 (implementasi kode).

---

## 0. TL;DR

| # | Keputusan | Isi |
|---|---|---|
| 1 | Pintu masuk | Satu link yang sudah ada: **Catat Hasil Pengukuran** → `/jobs/:id/measurements`. Tidak ada route baru. |
| 2 | List | Dua grup di layar yang sama: **Pembacaan langsung** (Pattern A, tidak berubah) dan **Grid titik uji** (Pattern B). |
| 3 | Entry | Route yang sama `/jobs/:id/measurements/:parameterId`. UI bercabang: `testPoints.length === 0` → entry vertikal Stage A; `> 0` → grid. |
| 4 | Grid | Baris = `CalibrationTestPoint` (`sequence` / `settingLabel`). Kolom = ulangan I–N. Kolom setpoint sticky + scroll horizontal. |
| 5 | Replicate count | Tidak ada kolom schema. Soft default **5**, prefix `VENT_*` / `AUD_*` → **3**. Tetap **+ Tambah ulangan**. |
| 6 | Direction | Default `NONE`, tidak ada kontrol UI. Hanya allowlist `SPHYG_PRESSURE_ACC`: dua sub-baris Naik / Turun per setpoint. `SUCT_VACUUM_GAUGE` di luar Stage B. |
| 7 | Pass/fail | Chip per sel **setelah sel tersimpan**, dari `isWithinTolerance` di response write. Tidak hitung toleransi di client. |
| 8 | Filter picker | Predicate Pattern A **tidak dihapus**. Predicate B baru: `entryStyle=DIRECT_REPLICATES` + `testPoints: some { isActive }`. Satu GET, dua grup di payload. |
| 9 | LOGGER_SUMMARY | Tetap di luar lewat `DeviceCalibrationParameter.entryStyle` (field penanda yang sudah ada). Stage C. |
| 10 | Attempt / REWORK | Hanya `attemptNumber === currentAttempt` yang editable. Attempt baru = grid kosong. Gap: increment `currentAttempt` pada transisi REWORK belum terlihat di API. |
| 11 | Pilot | **BSM** dulu (desain utama), **Ventilator** kedua (I–III + titik tunggal), **Sphyg** hanya jika keduanya lolos. |

---

## 1. Latar & batas

Stage A live untuk Pattern A: `valueType=NUMBER`, `entryStyle=DIRECT_REPLICATES`, tanpa anak `CalibrationTestPoint`. Job BSM IN_PROGRESS yang sudah ada menampilkan 7 parameter env/listrik dan **menyembunyikan** HR / RESP / SpO₂ / NIBP.

Pattern B sudah punya baris katalog + seed titik uji (BSM_SPO2 8 titik, Ventilator I–III, dll.) dan API create/batch sudah menerima `calibrationTestPointId`, `replicateIndex`, `direction`. Yang belum ada: layar tech-pwa untuk struktur multi-titik × multi-replikat.

**Masuk Stage B**

- Flow entry grid untuk parameter NUMBER + DIRECT_REPLICATES + punya `CalibrationTestPoint` aktif
- Revisi filter picker (bukan hapus filter A)
- Exclude LOGGER_SUMMARY dari grid lewat `entryStyle`
- Manifestasi `attemptNumber` / REWORK di grid

**Keluar Stage B (HARD STOP terpisah)**

- LOGGER_SUMMARY grid 30×9 — Stage C
- `VENT_IE_RATIO`, peak flow PIF/PEF — belum ada parameter code
- Backfill `decimalPlaces` 81 baris tersisa
- Deploy VPS
- `SUCT_VACUUM_GAUGE` (slot generik + `suppliedNominalValue`) — Pattern D
- Restart-attempt action di tech-pwa (belum ada di mana pun)

---

## 2. Flow

```
Job detail
  └─ MeasurementsSection          (sudah ada; diperluas agar menampilkan A + B)
        └─ "Catat Hasil Pengukuran"
              └─ /jobs/:id/measurements
                    ├─ grup "Pembacaan langsung"  → /jobs/:id/measurements/:parameterId  (UI A)
                    └─ grup "Grid titik uji"      → /jobs/:id/measurements/:parameterId  (UI B)
```

Tidak ada `/measurement-grids`. Satu list, satu route entry, cabang UI berdasarkan `testPoints[]` di payload.

Job BSM adalah alasan utamanya: satu job punya 7 Parameter A (suhu ruang, kebocoran, …) **dan** 6 Parameter B (HR, RESP, SpO₂, SYS/MAP/DIA). Dua pintu masuk akan memaksa teknisi bolak-balik.

```
                    ┌─────────────────────────┐
                    │     Job detail          │
                    │  MeasurementsSection    │
                    └───────────┬─────────────┘
                                │ Catat Hasil Pengukuran
                                ▼
                    ┌─────────────────────────┐
                    │  /jobs/:id/measurements │
                    │  Pembacaan langsung (A) │
                    │  Grid titik uji (B)     │
                    └───────────┬─────────────┘
                         ┌──────┴──────┐
                         ▼             ▼
                   entry A        entry B grid
                   (vertikal      (titik × ulangan)
                    ulangan)
                         └──────┬──────┘
                                ▼
                    POST .../batch  (sel baru)
                    PATCH .../:id   (sel tersimpan)
```

Polling: **tetap tidak ditambah** pada layar entry (keputusan Stage A — entry teknisi tunggal). Job-detail tetap poll 6s sehingga lock dari Portal muncul di section.

---

## 3. Wireframe

### 3.1 Job detail — `MeasurementsSection`

Section yang sudah ada tetap satu blok. Dua sub-list jika kedua pola ada; satu sub-list jika hanya satu pola.

```
┌─────────────────────────────────────────┐
│ Hasil Pengukuran                        │
│                                         │
│ Pembacaan langsung                      │
│  Suhu ruang              3/5            │
│  Kelembaban ruang        Selesai        │
│  …                                      │
│                                         │
│ Grid titik uji                          │
│  Heart Rate              8/20           │
│  Respirasi               0/20           │
│  Saturasi Oksigen        Ada tidak sesuai│
│  NIBP Sistolik           12/35          │
│                                         │
│ Catat Hasil Pengukuran →                │
└─────────────────────────────────────────┘
```

Chip status Pattern B memakai **sel**, bukan ulangan 1D:

`filled / (nTitik × nUlangan × nArah)`

Contoh Heart Rate: 4 titik × 5 ulangan × 1 arah = 20. Contoh Sphyg (nanti): 6 × 5 × 2 = 60.

Empty copy hari ini ("Tidak ada parameter pengukuran langsung") **salah** untuk job yang hanya punya B, dan sebaliknya. Ganti:

- Device type unresolved → (tetap) "Jenis alat belum dapat ditentukan."
- A = 0 dan B = 0 → "Tidak ada parameter pengukuran yang didukung untuk jenis alat ini."
- A = 0 dan B > 0 → section tetap tampil; hanya grup grid (tanpa kalimat "belum didukung").
- A > 0 dan B = 0 → hanya grup pembacaan langsung (perilaku Stage A, minus copy yang menyinggung grid).

Link **Catat Hasil Pengukuran** tampil jika `IN_PROGRESS` + started + device type resolved + **(A > 0 atau B > 0)**.

### 3.2 List — `/jobs/:id/measurements`

```
← Hasil Pengukuran
SPK/2026/09/00001 · Bed Side Monitor

Parameter pengukuran untuk Bed Side Monitor.
Ketuk parameter untuk mencatat pembacaan.

[banner lock jika ada]

Pembacaan langsung
┌─────────────────────────────────────────┐
│ Suhu ruang                    3/5       │
│ Lingkungan › …                          │
│ Toleransi: … · °C                       │
└─────────────────────────────────────────┘

Grid titik uji
┌─────────────────────────────────────────┐
│ Heart Rate                    8/20      │
│ Kinerja › Kalibrasi Heart Rate          │
│ Toleransi: ± 5 bpm · BPM · 4 titik      │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│ Saturasi Oksigen     Ada tidak sesuai   │
│ … · 8 titik                             │
└─────────────────────────────────────────┘
```

Baris Pattern B menambah konteks `N titik` (dari `testPoints.length`) di samping unit / toleransi. Helper `parameterEntryStatus` Stage A **tidak dipakai ulang** untuk grup B — butuh `gridEntryStatus` (lihat §7).

### 3.3 Grid — desain utama: `BSM_HEART_RATE`

Header kartu sama dengan Stage A: `capability › item`, teks toleransi (note-first), unit, `Desimal: <dp>`. Tambahan: jumlah titik.

```
← Heart Rate
Kinerja › Kalibrasi Heart Rate
Toleransi: ± 5 bpm · BPM · Desimal: 0
4 titik uji · 5 ulangan

        │  I     │  II    │  III   │  IV    │  V
────────┼────────┼────────┼────────┼────────┼────────
30 BPM  │  30  ✓ │  31  ✓ │  29  ✓ │        │
60 BPM  │  60  ✓ │  62  ✗ │        │        │
120 BPM │        │        │        │        │
180 BPM │        │        │        │        │

[+ Tambah ulangan]

          [ Simpan pembacaan ]
```

Konvensi sel:

- Input numerik, `inputMode=decimal`, `step` dari `decimalPlaces` (baca field, **jangan hardcode 0**).
- Chip ✓ / ✗ / "Perlu telaah" hanya pada sel **sudah tersimpan** (`isWithinTolerance` true / false / null). Sel kotor atau kosong: tanpa chip, atau teks "belum disimpan" seperti Stage A.
- Kolom pertama (setpoint) **sticky** di kiri; kolom ulangan scroll horizontal. Mental model LK, layak di PWA sempit.
- `VENT_PEEP` (1 titik, 20 cmH2O): **grid 1 baris**, bukan kartu khusus. Pola yang sama, lebih sedikit baris.

Simpan:

- Satu tombol untuk seluruh grid. Simpan parsial diizinkan (tidak semua sel harus terisi).
- Sel baru (belum punya `MeasurementResult.id`) → satu `POST /calibration-jobs/:id/measurement-results/batch`, tiap item membawa `deviceCalibrationParameterId`, `calibrationTestPointId`, `replicateIndex`, `direction` (`NONE` kecuali Sphyg), `measuredValue`.
- Sel tersimpan yang nilainya berubah → `PATCH .../measurement-results/:measurementId` (hanya `measuredValue`; natural key tidak ikut).
- Limit batch 200 item: 8×5 (SpO2) = 40; Sphyg 6×5×2 = 60. Cukup. Jika teknisi menambah ulangan ekstrem, pecah batch di client (catatan implementasi, bukan blocker desain).

Tidak ada autosave per-blur. Konsisten dengan Stage A.

### 3.4 Direction — `SPHYG_PRESSURE_ACC` saja

Mayoritas Pattern B (BSM, Ventilator, infus, CPAP, …): `direction = NONE`, tidak ada kontrol.

Hanya kode allowlist `SPHYG_PRESSURE_ACC`: tiap setpoint punya **dua sub-baris** yang selalu terlihat. Bukan toggle yang menimpa sel — naik dan turun adalah dua komponen natural key yang berbeda.

```
        │  I     │  II    │  III   │  IV    │  V
────────┼────────┼────────┼────────┼────────┼────────
 0 mmHg
   Naik │        │        │        │        │
   Turun│        │        │        │        │
50 mmHg
   Naik │        │        │        │        │
   Turun│        │        │        │        │
…
```

Pilot Sphyg **bukan** langkah 1 — hanya setelah review BSM + Ventilator (§9).

`SUCT_VACUUM_GAUGE` (6 slot generik, `settingValue` NULL, teknisi isi nominal on-site, 3 ulangan × Naik/Turun = 36 baris) **di luar Stage B**. Itu Pattern D; butuh `suppliedNominalValue` yang tidak ada di grid B.

---

## 4. Perubahan filter picker (field-level)

Filter Stage A **tidak dihapus**. Ia tetap satu-satunya cara membedakan Pattern A. Yang diubah: predikat B ditambahkan, dan response membawa cukup data untuk cabang UI.

### 4.1 Predicate

| Grup | Predicate |
|---|---|
| Pattern A (tetap) | `deviceTypeId`, `isActive`, `valueType=NUMBER`, `entryStyle=DIRECT_REPLICATES`, `testPoints: { none: {} }` |
| Pattern B (baru) | `deviceTypeId`, `isActive`, `valueType=NUMBER`, `entryStyle=DIRECT_REPLICATES`, `testPoints: { some: { isActive: true } }` |

Keduanya **wajib** menyertakan `entryStyle=DIRECT_REPLICATES`. Itu field penanda permanen yang sudah dimigrasi (`20260908072100`) dan sudah dipakai filter A. Jangan kembali ke `valueType=NUMBER` + zero-children saja.

### 4.2 LOGGER_SUMMARY — tetap di luar

Sembilan kode yang pernah false-positive di Stage A (NUMBER + zero children, padahal logger):

`BBR_STORAGE_TEMP`, `KVAK_STORAGE_TEMP`, `CCHAIN_STORAGE_TEMP`, `MREF_STORAGE_TEMP`, `MFRZ_STORAGE_TEMP`, `OVEN_TEMP`, `STER_TEMP`, `CRFR_STORAGE_TEMP`, `PLT_STORAGE_TEMP`.

Mereka `entryStyle=LOGGER_SUMMARY`, tidak punya `CalibrationTestPoint`. Predicate B (`testPoints: some`) sudah mengecualikan mereka secara struktural; `entryStyle` adalah sabuk pengaman kedua dan **harus tetap ada** agar Stage C tidak bocor ke grid jika suatu saat ada anak test point. Stage C memutuskan min/max + lampiran vs transkripsi 30×9.

### 4.3 Bentuk response (usulan, bukan kode)

Satu `GET /calibration-jobs/:id/measurement-parameters` mengembalikan **kedua** grup. Satu-satunya konsumen adalah tech-pwa yang kita kontrol — dua round-trip atau `?pattern=` dengan default A hanya untuk kompatibilitas hipotetis, tidak perlu.

```
{
  deviceType: { id, name } | null,
  parameters: [                    // Pattern A — shape lama, plus testPoints: []
    {
      id, code, name, decimalPlaces,
      uom, toleranceMin, toleranceMax, toleranceNote,
      capabilityName, capabilityItemName,
      testPoints: []
    }
  ],
  gridParameters: [                // Pattern B
    {
      …MeasurementParameterSummary,
      testPoints: [
        {
          id, sequence, settingLabel,
          settingValue,              // string | null
          toleranceMin, toleranceMax, toleranceNote
        }
      ]
    }
  ]
}
```

`parameters` (A) tetap array pertama yang sudah dikonsumsi Stage A. Menambah `gridParameters` adalah additive: klien lama yang mengabaikan field baru tidak pecah. Klien Stage B membaca keduanya.

Alternatif yang ditolak: menaruh A+B dalam satu array + `hasTestPoints`. Lebih rapi secara model, tetapi memaksa setiap konsumen Stage A memfilter ulang. Additive `gridParameters` lebih aman.

`testPoints` diurutkan `sequence` naik, hanya `isActive: true`. Override toleransi per titik (jarang: `INCU_AIR_TEMP`, `SUCT_MAX_VACUUM`) ikut dikirim; chip tetap dari backend, field ini hanya untuk teks header jika suatu saat diperlukan.

### 4.4 Yang masuk / tidak masuk predicate B

| Kelas | Contoh | Stage B? | Alasan |
|---|---|---|---|
| Pattern B sweep | `BSM_HEART_RATE`, `VENT_TIDAL_VOLUME`, `INFUS_FLOW_RATE` | Ya | Inti scope |
| Pattern B + direction | `SPHYG_PRESSURE_ACC` | Ya (pilot ke-3) | Test point = setpoint; direction di row hasil |
| D-fixed named slot | `CENT_SPEED`, `ROT_SPEED`, `CRFR_SPEED`, `DXRAY_EXPOSURE_TIME` | Ya | Punya anak test point; grid yang sama (baris = Min/Med/Max) |
| D-generic | `SUCT_VACUUM_GAUGE` | **Tidak** | `settingValue` NULL + `suppliedNominalValue` on-site. Exclude **allowlist kode** di service, bukan dengan menghapus predicate `testPoints: some` |
| LOGGER_SUMMARY | 9 kode di §4.2 | Tidak | `entryStyle` |
| RATIO / BOOLEAN / TEXT | `VENT_IE_RATIO` | Tidak | `valueType=NUMBER` |
| Inactive | — | Tidak | `isActive` |

Exclude `SUCT_VACUUM_GAUGE` adalah allowlist negatif di lapisan service, didokumentasikan di sini. Jangan menambah kolom schema `usesDirection` / `isGenericSlot` di Stage B.

---

## 5. Attempt / REWORK

Natural key: `(job, parameter, testPoint, replicateIndex, attemptNumber, direction)`.

| Aturan | Perilaku UI |
|---|---|
| Filter | Hanya row `attemptNumber === job.currentAttempt` yang mengisi sel / chip / status. |
| Attempt lama | Tidak tampil sebagai sel editable. Tidak ada "Lihat attempt N−1" di Stage B. |
| Attempt baru | Grid kosong. `POST` menstempel `attemptNumber = job.currentAttempt` di server. |
| Banner | Jika `currentAttempt > 1` dan job `IN_PROGRESS`: "Attempt N — hasil attempt sebelumnya terkunci." |
| `REWORK` | Tetap terkunci. Pesan Stage A: "Job dikembalikan untuk perbaikan — mulai ulang attempt sebelum mencatat hasil." |
| `SUBMITTED` / `ACCEPTED_BY_QA` | Read-only, chip tetap, tanpa tombol Simpan. |

Client Pattern A hari ini membuang `calibrationTestPointId !== null`. Filter A **tetap begitu**. Filter B adalah kebalikannya: `calibrationTestPointId !== null && attemptNumber === currentAttempt`. Jangan campur keduanya dalam satu `Map` tanpa kunci titik uji.

### 5.1 Gap — increment `currentAttempt`

Desain terkunci (`MeasurementResult_Stage1_Design_Finalization.md` §6): `currentAttempt` naik tepat 1 pada transisi `SUBMITTED → REWORK`.

Pencarian di API (2026-09-09): field dibaca dan di-stempel pada create/batch, guard menolak `row.attemptNumber < job.currentAttempt`, **tetapi tidak ada service yang meng-increment counter**. Jika gap ini masih ada saat Stage 2, attempt baru tidak pernah "mulai dari kosong" — teknisi akan melihat (dan, jika status sudah `IN_PROGRESS` lagi, berisiko mengedit) sel attempt 1.

**Flag, bukan scope Stage B.** Stage 2 UI mengasumsikan counter sudah benar. Jika belum, kerjakan increment di transisi REWORK sebagai prasyarat terpisah, bukan di PR grid.

---

## 6. Replicate count & direction — tanpa kolom schema

Tidak ada `expectedReplicateCount` / `usesDirection` di `DeviceCalibrationParameter` maupun `CalibrationTestPoint`. Five-steps 2026-09-08 menolak menambah kolom itu. Stage B mengikuti.

**Ulangan (soft allowlist, client + helper murni):**

| Aturan | N |
|---|---|
| Prefix kode `VENT_*` atau `AUD_*` | 3 |
| Selain itu | 5 |
| Ada row tersimpan dengan `replicateIndex` lebih besar | `max(expected, maxIndex)` |
| Teknisi butuh lebih | **+ Tambah ulangan** (satu kolom di kanan) |

Ini known soft spot yang sama dengan Stage A, sekarang dengan dua nilai awal. Salah prefix → teknisi masih bisa menambah/mengabaikan kolom kosong. Jangan block Stage 2 pada kolom katalog.

**Direction (soft allowlist):**

| Aturan | UI |
|---|---|
| Kode `SPHYG_PRESSURE_ACC` | Sub-baris Naik (`UP`) + Turun (`DOWN`) |
| Selain itu | `NONE`, tidak ada kontrol |

Tidak infer dari isi `MeasurementResult` lama (ayam-telur pada attempt baru). Tidak parse `toleranceNote`.

---

## 7. Status, lock, helper

Reuse tanpa perubahan makna:

- `formatMeasuredValue` / `measuredValueInputStep` / `isValidMeasuredValue`
- `toleranceText` / `passFailChip`
- `isMeasurementLocked` / `canRecordMeasurement` / `measurementLockedReason`

Helper baru (desain, bukan kode):

```
gridEntryStatus(rows, testPointCount, expectedReplicates, directionCount = 1)
  total  = testPointCount × max(expectedReplicates, maxReplicateIndex) × directionCount
  filled = jumlah sel current-attempt yang punya measuredValue
  complete = filled >= total && filled > 0
  anyFail  = ada isWithinTolerance === false
```

`parameterEntryStatus` 1D tetap milik Pattern A. Jangan dipaksa ke grid.

---

## 8. Edge case yang belum terjawab evidence

| # | Kasus | Status keputusan Stage B |
|---|---|---|
| E1 | Replicate 3 vs 5 tanpa field katalog | Soft allowlist prefix `VENT_*` / `AUD_*`. Soft spot. |
| E2 | Direction tanpa `usesDirection` | Soft allowlist `SPHYG_PRESSURE_ACC`. |
| E3 | `VENT_PEEP` / `VENT_PPEAK` satu titik (corpus ini hanya 20 / 40 cmH2O) | Grid 1 baris. Jika seed nanti bertambah titik, baris ikut bertambah. |
| E4 | `BSM_SPO2` setpoint 90 terduplikasi | Seed sudah membedakan label `90 %SpO2 (titik N)`. Grid memakai `settingLabel` + `id`, bukan nilai numerik sebagai key. |
| E5 | `AUD_FREQUENCY_RESPONSE_*` sweep 250/500/6000/8000 Hz belum terverifikasi di Excel terisi | Tetap tampil jika punya test point. Jangan "koreksi" sweep di UI. |
| E6 | D-fixed vs D-generic dalam predicate yang sama | D-fixed masuk (grid label). `SUCT_VACUUM_GAUGE` exclude allowlist. |
| E7 | `VENT_IE_RATIO` / PIF / PEF | HARD STOP terpisah. Tidak muncul (`RATIO` / tidak ada kode). |
| E8 | 81 NUMBER masih `decimalPlaces = 0` | UI baca field. Tidak hardcode. Tidak block. |
| E9 | Restart attempt belum ada di tech-pwa / increment `currentAttempt` belum terlihat | Flag §5.1. Grid tidak mengarang tombol "Mulai attempt baru". |
| E10 | NIBP BSM 7 triple, urutan worksheet bukan monoton (120… lalu 60) | Ikuti `sequence` seed, jangan sort numerik `settingValue`. |
| E11 | `INCU_AIR_TEMP` override toleransi per titik | Chip tetap dari backend snapshot. Header parameter tetap note induk. |
| E12 | Job tanpa Pattern A (hanya B) | List/section tetap hidup; empty-state A tidak boleh menutupi grup B. |

---

## 9. Urutan pilot

Dipilih: BSM sebagai desain utama, Ventilator sebagai edge-case.

| Urutan | Device | Yang diuji | Mengapa |
|---|---|---|---|
| 1 | **Bed Side Monitor** | HR 4×5, RESP 4×5, SpO₂ 8×5, NIBP SYS/MAP/DIA 7×5; list A+B berdampingan pada job IN_PROGRESS yang sudah ada | Data paling lengkap dari 66 Excel; job nyata sudah di `pkmdb`. |
| 2 | **Ventilator** | I–III (bukan I–V), `VENT_PEEP` / `VENT_PPEAK` 1 baris, `VENT_FIO2` 4 titik, `VENT_MINUTE_VOLUME` 7.8 (non-integer setpoint) | Seed baru 2026-09-08; uji cepat allowlist 3 ulangan + titik tunggal. |
| 3 | **Sphygmomanometer** | 6 setpoint × Naik/Turun × I–V | Hanya jika review 1+2 lolos. Validasi sub-baris direction. |

Manual review per langkah: buka job jenis itu → pastikan grup B muncul → isi sebagian sel → chip ✓/✗ dari write response → kunci setelah submit → (jika `currentAttempt` sudah di-increment) attempt baru = grid kosong.

Jangan mulai implementasi Sphyg atau Centrifuge sebelum BSM + Ventilator ditandatangani.

---

## 10. Implikasi Stage 2 (hanya catatan; bukan izin mengerjakan)

Ditulis supaya review tahu luasnya, **bukan** backlog yang dikerjakan sekarang.

- API: `listMeasurementParameters` menambah query B + `gridParameters` + nested test points; exclude kode `SUCT_VACUUM_GAUGE`; tes regresi A + LOGGER_SUMMARY tetap hijau.
- tech-pwa: types `testPoints`; `MeasurementBatchItem` + `calibrationTestPointId` / `direction`; `gridEntryStatus`; list dua grup; entry page cabang grid; filter hasil B; copy empty-state; tes murni untuk status grid + allowlist 3/5 + partition A/B.
- Pattern A **additive-only**: jangan ubah predicate `testPoints: { none: {} }` dan jangan hapus filter client `calibrationTestPointId === null`.

---

## 11. Asumsi

1. Predicate struktural (NUMBER + DIRECT_REPLICATES + ada/tidaknya test point) tetap definisi A vs B, sama seperti Stage A.
2. `resolveJobDeviceTypeId` (rantai komersial) tetap sumber jenis alat.
3. Satu teknisi per job pada layar entry — polling entry tidak perlu.
4. `decimalPlaces` dibaca apa adanya; presisi membaik sendiri setelah backfill terpisah.
5. Increment `currentAttempt` pada REWORK adalah prasyarat perilaku "grid kosong", bukan bagian PR UI.

---

## 12. HARD STOP

Dokumen ini selesai. Tidak ada kode yang ditulis.

Tunggu review Anda sebelum Stage 2 (implementasi grid di tech-pwa + perluasan GET measurement-parameters).
