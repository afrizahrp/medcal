# Phase 1.5 — Calibration test-point snapshot design

Tanggal: 2026-09-18  
Status: **IMPLEMENTED (v1)** — schema, migrasi+backfill snapshot, `start()`, GET/write/PDF generik, seed BSM env, tes.  
Decision lock: lihat bagian **DECISION LOCK — 2026-09-18** (tetap otoritatif; implementasi tidak menafsir ulang lock).

Sumber:

- `phase-1.5-data-impact-audit-20260918.md`
- `phase-1.5-option2-architecture-plan-20260918.md`
- schema Prisma + `listMeasurementParameters`, `MeasurementResultsService`, fan-out WO, `start()`, LK BSM, `buildCapabilitySections`

Legend: **FACT** (kode/schema/audit) · **LOCKED** (keputusan bisnis) · **PROPOSED** (detail teknis yang mengikuti lock) · **IMPLEMENTATION CONFLICT — DECISION REQUIRED** (lock vs kode/schema, jangan diubah diam-diam)

---

# DECISION LOCK — 2026-09-18

Keputusan berikut menggantikan item “DECISION REQUIRED” pada draf sebelumnya yang sudah dijawab. Tidak diimplementasikan pada tugas ini.

## L1. Momen freeze

**LOCKED.** Snapshot `JobCalibrationTestPoint` dibuat ketika `CalibrationJob` masuk eksekusi aktif lewat `start()` (`PENDING` → `IN_PROGRESS`, stamp `startedAt`).

**LOCKED.** Jangan freeze di fan-out (`WorkOrdersService.fanOutCalibrationJobs`).

Alasan (bisnis): job `PENDING` boleh menunggu lama; katalog boleh berubah sampai eksekusi mulai; `start()` adalah batas domain definisi pengukuran menjadi immutabel untuk job itu.

**FACT (kode):** `start()` hari ini hanya `update` status + `startedAt`. Tidak ada transaksi yang membaca `CalibrationTestPoint`. `assertJobStarted` menolak tulis result jika `startedAt` null.

## L2. PENDING vs sudah dimulai

**LOCKED.** Job `PENDING` yang di-`start()` **setelah** seed/konfigurasi titik bernama ada, menerima katalog **saat `start()`**.

**LOCKED.** Job yang **sudah** di-start tidak berubah karena modifikasi katalog kemudian.

| Status | Sumber pola pengukuran |
|---|---|
| `PENDING` (`startedAt` null) | Katalog **live** (masih boleh memengaruhi snapshot masa depan) |
| `IN_PROGRESS` / `SUBMITTED` / `REWORK` / `ACCEPTED_BY_QA` (`startedAt` set) | Snapshot job — **bukan** count live |

**LOCKED.** `resumeAfterRework` tidak membuat ulang snapshot.

## L3. Job IN_PROGRESS historis

**LOCKED.** Job yang sudah berjalan sebelum fitur ini tidak boleh tiba-tiba mendapat titik env bernama.

**LOCKED.** Job `cmu0qm039001prv0ng7lp0fmv`: hasil lingkungan tetap Pattern A / unnamed. `calibrationTestPointId` NULL tetap NULL. Tidak ada mapping `replicateIndex` → Awal/Akhir.

**LOCKED.** Backfill snapshot (jika ada) hanya menyalin definisi TP katalog **pada saat backfill**, tanpa menempel result ke titik bernama.

## L4. Referensi MeasurementResult

**LOCKED.** Tetap `MeasurementResult.calibrationTestPointId` → `CalibrationTestPoint` (master). Jangan ganti FK ke `JobCalibrationTestPoint` kecuali schema membuktikan A mustahil.

**FACT:** schema mendukung A: FK nullable + Restrict sudah ada; natural key memakai id master. Tidak ada bukti teknis bahwa A mustahil.

**LOCKED.** Snapshot = allowlist + definisi pengukuran beku. Bukan identitas pengganti master.

**LOCKED.** Katalog live **tidak** boleh memperluas pola pengukuran job yang sudah di-start. Snapshot job = sumber kebenaran himpunan TP milik job.

## L5. Toleransi

**LOCKED.** Jangan memperkenalkan sistem toleransi kedua.

**LOCKED.** Result tersimpan: tampilkan/evaluasi ulang memakai `MeasurementResult.effectiveToleranceMin/Max` + `appliedNominalValue` (mekanisme yang sudah ada).

**LOCKED.** Saat **create/update** result: hitung dengan rantai domain yang sudah ada (`measurement-tolerance.ts`: override titik → bounds parameter → parse note → NULL), lalu **tulis** hasil ke kolom snapshot result.

**PROPOSED (mengikuti lock, bukan sistem baru):** untuk job sudah di-start, override tingkat **titik** diambil dari salinan `JobCalibrationTestPoint`, bukan dari `CalibrationTestPoint` live. Inherit tingkat **parameter** tetap dari `DeviceCalibrationParameter` karena seluruh master parameter **tidak** di-snapshot (L6).

**IMPLEMENTATION CONFLICT — DECISION REQUIRED (residual, tidak mengubah L5/L6):** Lock “jangan baca konfigurasi toleransi live” vs L6 “jangan snapshot seluruh parameter”. Baca live `DeviceCalibrationParameter.tolerance*` pada *write* result masih terjadi jika override titik NULL. Itu rantai domain hari ini. Meng-freeze bounds parameter akan melanggar L6. Tidak diselesaikan diam-diam.

## L6. Lingkup snapshot

**LOCKED.** Jangan snapshot seluruh `DeviceCalibrationParameter`.

**LOCKED.** Hanya informasi definisi pengukuran yang dibutuhkan untuk membekukan **pola test point**.

Arah entity (nama kerja):

```
CalibrationJob
  └── JobCalibrationTestPoint
        ├── parameter reference
        ├── master CalibrationTestPoint reference
        ├── sequence
        ├── settingLabel
        ├── settingValue
        └── applicable tolerance override / definition
```

Field pasti vs schema: § konsistensi akhir.

## L7. Identitas / uniqueness `JobCalibrationTestPoint`

Dievaluasi terhadap schema **master**, bukan tebakan.

**FACT.** `CalibrationTestPoint`:

- PK `id` (cuid) — identitas yang dipakai `MeasurementResult.calibrationTestPointId`
- satu `deviceCalibrationParameterId` (tidak bisa “reuse” ke parameter lain)
- `@@unique([deviceCalibrationParameterId, sequence])`
- `@@unique([deviceCalibrationParameterId, settingLabel])`

**FACT.** Satu baris master tidak dapat muncul dua kali pada parameter yang sama. `sequence` dan `settingLabel` adalah atribut unique **pada katalog**, bukan identitas result.

| Opsi | Cocok dengan result? | Jika sequence master berubah setelah freeze | Jika settingLabel master berubah | Jika start() dijalankan dua kali |
|---|---|---|---|---|
| **A. `(calibrationJobId, sourceCalibrationTestPointId)`** | Ya — id yang sama dengan FK result | Snapshot tetap satu baris; `sequence` beku di kolom salinan | Label beku di salinan; id master sama | Unique A menolak duplikat copy |
| B. `(calibrationJobId, deviceCalibrationParameterId, sequence)` | Tidak — result tidak menunjuk sequence | Identitas B “pindah” secara semantik; bukan id master | Tidak terpengaruh langsung | Tidak mencegah dua master beda id jika sequence diubah di katalog lalu di-copy ulang (copy ulang dilarang L2) |
| C. `(job, parameter, settingLabel)` | Sama lemahnya seperti B terhadap identitas result | — | Identitas C bergeser | — |

**LOCKED / dipilih: A** sebagai unique wajib.

Mengapa benar: allowlist harus menyatakan *master mana* yang sah untuk `MeasurementResult.calibrationTestPointId`. Sequence/label boleh didrift-kan di katalog; job memakai salinan.

**PROPOSED unique defensif (opsional, bukan identitas):** `(calibrationJobId, deviceCalibrationParameterId, sequence)` meniru invariant master **pada saat copy**. Tidak menggantikan A.

**Reuse master TP:** tidak ada di schema (satu parent parameter). Satu job: paling banyak satu baris snapshot per id master.

**Titik yang sama lebih dari sekali per parameter:** tidak pada master; snapshot 1:1 dari TP `isActive` saat `start()`; tidak diduplikasi.

## L8. Pattern A / B setelah freeze

**LOCKED.** Untuk job sudah di-start: Pattern A/B dari **count snapshot job per parameter**, bukan count `CalibrationTestPoint` live.

**LOCKED.** `PENDING`: tetap live (L2).

## L9. Result historis NULL

**LOCKED.** Tetap NULL. Tidak inferensi `replicateIndex`. Contoh: 1 ≠ Awal, 5 ≠ Akhir.

## L10. Scope seed

**LOCKED.** Seed titik env bernama pertama: **hanya BSM** (`BSM_ROOM_TEMP`, `BSM_ROOM_HUMIDITY`, `BSM_INPUT_VOLTAGE`). Bukan parameter lingkungan tipe alat lain.

## L11. Out of scope

**LOCKED.** Jangan implement: mapping PDF `settingLabel` → sel; validasi completeness `submitForReview`; mapping semantik `replicateIndex`; ubah layout LK; refactor tidak terkait.

---

## 1. Current architecture

**FACT.** `CalibrationTestPoint` adalah anak **katalog** `DeviceCalibrationParameter` (bukan anak `CalibrationJob`). Unique `(parameterId, sequence)` dan `(parameterId, settingLabel)`.

**FACT.** Pola pengukuran ditentukan **saat GET**, dari katalog live:

- Pattern A: `NUMBER` + `DIRECT_REPLICATES` + aktif + `testPoints: { none: {} }`
- Pattern B: sama + `testPoints: { some: { isActive: true } }` (kecuali `SUCT_VACUUM_GAUGE`)

Pembaca katalog live: `listMeasurementParameters`, Tech-PWA grid, completeness UI (`gridEntryStatus` memakai **id** TP dari API), PDF generik `buildCapabilitySections`, label portal.

**FACT.** `MeasurementResult.calibrationTestPointId` nullable; Pattern A = NULL. Natural key memakai kolom itu + `replicateIndex` + `attemptNumber` + `direction` (`NULLS NOT DISTINCT`). `onDelete: Restrict` ke TP master.

**FACT.** Snapshot yang sudah ada **bukan** daftar titik ukur:

| Mekanisme | Apa yang di-freeze | Kapan |
|---|---|---|
| `CalibrationJob` identity fields | nama/AKD declared | fan-out |
| `MeasurementResult.effectiveTolerance*` | bounds terhitung | **write** result |
| `PhysicalCheckResult.inspectionLimitSnapshot` | teks batas item | **write** hasil cek |
| `EquipmentDeliveryNoteItem` | salinan alat SJ | issuance |

**FACT.** Physical check **list** item tetap dari master live; hanya prosa batas di-copy ke result. Pola yang sama dengan test point hari ini: *set* item/titik tidak di-freeze per job.

**FACT.** Job dibuat di `WorkOrdersService.fanOutCalibrationJobs` saat WO masuk IN_PROGRESS (`createMany`, status `PENDING`, `deviceId` null). Tipe alat biasanya sudah ada lewat `calibrationRequestItemId` / rantai PO (`resolveJobDeviceTypeId`). Pengukuran **tidak** bisa ditulis sebelum `start()` (`startedAt` + `IN_PROGRESS`).

**FACT.** `resumeAfterRework` tidak membuat ulang katalog; `currentAttempt` naik di REJECT; result lama tidak dihapus.

---

## 2. Problem statement

**LOCKED.** OPTION 2: titik ukur bernama dikonfigurasi eksplisit dan harus **dipertahankan per Calibration Job**. OPTION 4: result historis NULL tidak di-map. Job `IN_PROGRESS` tidak boleh diam-diam jadi Pattern B karena INSERT katalog.

**FACT.** INSERT `CalibrationTestPoint` pada parameter yang sebelumnya kosong memindahkan parameter itu ke Pattern B untuk **semua** job, termasuk `cmu0qm039001prv0ng7lp0fmv` (2× `BSM_ROOM_TEMP` NULL). Grid membuang baris NULL.

**LOCKED.** Scope seed pertama: **hanya BSM** env. Parameter lingkungan tipe lain tidak di-seed. `submitForReview` completeness dan mapping PDF BSM `settingLabel` → sel **out of scope**.

---

## 3. Proposed snapshot architecture

**PROPOSED.** Tambah anak **immutabel** dari `CalibrationJob` yang menyalin definisi test point **pada satu momen freeze**. Setelah itu, penentu Pattern A/B, isi grid, completeness UI, dan grouping PDF generik memakai **snapshot job**, bukan `CalibrationTestPoint` live.

**PROPOSED — siapa yang memiliki snapshot?**  
`CalibrationJob`. Bukan `Device`, `DeviceType`, atau `WorkOrder` (unit kalibrasi adalah job; `unitOrdinal` sudah per job). Bukan `MeasurementResult` (itu bacaan, bukan definisi titik; physical-check hanya men-snapshot prosa saat tulis, tidak melindungi *daftar* item).

Nama kerja (bukan schema live): `JobCalibrationTestPoint`.

**PROPOSED — apa yang tidak di-snapshot pada v1:**  
Seluruh katalog `DeviceCalibrationParameter` (nama, `decimalPlaces`, `isActive` parameter). Perilaku live untuk *daftar parameter* sudah ada. OPTION 2 mengunci **titik ukur**, bukan freeze seluruh worksheet. Parameter baru yang muncul di katalog tetap bisa tampil sebagai Pattern A pada job lama — **DECISION REQUIRED** jika itu tidak diinginkan.

**PROPOSED — relasi tulis result:** lihat §5. Rekomendasi desain: **tetap FK ke `CalibrationTestPoint` live** untuk baris Pattern B; snapshot adalah **himpunan + salinan tampilan/override yang diizinkan** untuk job itu. Result historis tetap `calibrationTestPointId = NULL`.

---

## 4. Entity relationship diagram

```
DeviceType
  └── DeviceCalibrationParameter          [katalog live]
        └── CalibrationTestPoint          [katalog live]
              ▲
              │ sourceCalibrationTestPointId (Restrict atau plain id)
              │
CalibrationJob
  ├── measurementTestPointsSnapshottedAt  [PROPOSED, DateTime?]
  └── JobCalibrationTestPoint[]           [PROPOSED, immutabel]
        ├── calibrationJobId
        ├── deviceCalibrationParameterId
        ├── sourceCalibrationTestPointId
        ├── sequence, settingLabel, settingValue
        ├── toleranceMin/Max/Note
        └── copiedIsActive
              │
              │ (eligibility: result.TP id harus ∈ snapshot job+parameter)
              ▼
MeasurementResult
  ├── calibrationJobId
  ├── deviceCalibrationParameterId
  └── calibrationTestPointId ?            [NULL = ulangan tanpa nama]
```

Physical check (pembanding, **bukan** model yang dipakai):

```
DevicePhysicalCheckItem (live list)
PhysicalCheckResult.inspectionLimitSnapshot  (hanya teks, saat write)
```

---

## 5. Snapshot fields

### 5.1 Header job

| Field | Source | Purpose | Required | Dapat berubah setelah job dibuat? |
|---|---|---|---|---|
| `measurementTestPointsSnapshottedAt` | clock saat freeze | Membedakan job pra-fitur vs sudah di-freeze; idempoten | **PROPOSED** ya, setelah freeze | Tidak (isi sekali) |

Tanpa header: “nol baris anak” ambigu (Pattern A murni vs belum di-snapshot). **FACT** bahwa ambiguity ini tidak ada di schema sekarang → header diperlukan.

### 5.2 Baris `JobCalibrationTestPoint`

| Field | Source | Purpose | Required | Master bisa berubah setelah freeze? |
|---|---|---|---|---|
| `id` | baru | PK snapshot; **bukan** identitas grid jika result tetap memakai id live | ya | n/a |
| `calibrationJobId` | job | pemilik | ya | tidak |
| `deviceCalibrationParameterId` | `CalibrationTestPoint.deviceCalibrationParameterId` | group Pattern A/B per parameter | ya | parameter master bisa di-rename/nonaktifkan; **daftar parameter** tetap live (**PROPOSED** v1) |
| `sourceCalibrationTestPointId` | `CalibrationTestPoint.id` | taut ke master untuk write/validate | ya pada capture | baris master bisa diedit/nonaktifkan; snapshot **tidak** mengikuti |
| `sequence` | `sequence` | urutan grid | ya | master boleh berubah; UI job memakai salinan |
| `settingLabel` | `settingLabel` | “Awal”, “30 BPM”, dll. Portal/grid/PDF generik | ya | sama |
| `settingValue` | `settingValue` | nominal setpoint | tidak (nullable, Pattern D slot) | sama |
| `toleranceMin` / `Max` / `Note` | override per titik | salinan override; NULL = inherit parameter (perilaku schema sekarang) | tidak | master boleh berubah; **DECISION REQUIRED** apakah *write* toleransi memakai salinan ini atau tetap live seperti `loadCatalog` hari ini |
| `copiedIsActive` | `isActive` saat copy | jejak; **PROPOSED** hanya copy baris `isActive = true` (sesuai query API sekarang) | ya | nonaktifkan master **tidak** menghapus baris snapshot |

Tidak di-copy (tidak punya makna bisnis per job): `CalibrationTestPoint.createdAt` / `updatedAt`.

Tidak di-snapshot: `replicateIndex`, `attemptNumber`, `direction` — itu identitas **bacaan**, bukan definisi titik (**FACT** schema).

---

## 6. Lifecycle

```
WO → IN_PROGRESS
  → fanOut CalibrationJob (PENDING)     [FACT: createMany]
  → … identity / kontrol alat …
  → start() PENDING → IN_PROGRESS       [FACT: baru boleh record measurement]
  → create/update MeasurementResult
  → submitForReview                     [LOCKED: completeness out of scope]
  → QA approve/reject
  → reject: REWORK, currentAttempt+1    [FACT: katalog tidak di-replay]
  → resumeAfterRework → IN_PROGRESS
```

### 6.1 Kapan snapshot dibuat?

**DECISION REQUIRED** antara dua momen yang keduanya ada di kode:

| Momen | Kelebihan | Risiko |
|---|---|---|
| **A. Fan-out** | Selaras “job creation”; `unitTotal` sudah di-snapshot di sini | Job `PENDING` membeku berminggu-minggu; katalog BSM env yang di-seed **setelah** fan-out **sebelum** `start()` tidak masuk job itu |
| **B. `start()`** | Selaras gerbang tulis pengukuran (`assertJobStarted`) | Job yang sudah `PENDING` sebelum seed, lalu `start()` setelah seed, **akan** mendapat Pattern B env. Prompt mengunci job **IN_PROGRESS**, bukan PENDING |

**PROPOSED (bukan lock):** freeze di **`start()`**, plus **backfill freeze** untuk job yang sudah `IN_PROGRESS`/`SUBMITTED`/`REWORK`/`ACCEPTED_BY_QA` **sebelum** seed BSM env. Jangan freeze ulang di `resumeAfterRework`.

Idempoten: jika `measurementTestPointsSnapshottedAt` sudah terisi, `start()` tidak menulis ulang.

### 6.2 Isi yang di-copy

**PROPOSED.** Untuk `deviceTypeId` hasil `resolveJobDeviceTypeId`: semua `CalibrationTestPoint` dengan `isActive = true` pada parameter tipe itu (termasuk HR/SpO2 BSM yang **sudah** ada — **FACT** 37 TP BSM kinerja). Bukan hanya env. Jika hanya env yang di-copy, HR tetap live dan tidak konsisten.

Jika `resolveJobDeviceTypeId` null: **DECISION REQUIRED** (tunda freeze sampai tipe terurai vs freeze kosong).

---

## 7. Historical-data handling

**LOCKED / FACT.** 52/54 result `calibrationTestPointId` NULL = ulangan tanpa nama. Termasuk 2× `BSM_ROOM_TEMP` pada job IN_PROGRESS.

**PROPOSED.**

- Tidak mengisi `calibrationTestPointId`.
- Tidak membuat baris snapshot “palsu” Awal/Akhir untuk menempel result itu.
- Tidak membaca `replicateIndex` sebagai semantik titik.

Setelah freeze job lama (katalog **belum** punya Awal/Akhir): snapshot env BSM **kosong** untuk parameter itu → Pattern A → UI ulangan tetap menampilkan NULL. Setelah seed, job baru mendapat baris snapshot Awal/Akhir; job lama tidak.

---

## 8. Existing-job handling

**LOCKED.** `cmu0qm039001prv0ng7lp0fmv` tidak boleh jadi Pattern B env hanya karena seed.

**PROPOSED rollout:** lihat §12 — backfill snapshot **dari katalog saat itu** (env masih 0 TP) **sebelum** seed BSM.

Job `ACCEPTED_BY_QA` dengan 5 ulangan BPM/MREF: freeze menyalin TP kinerja yang sudah ada; env tetap 0 di snapshot; result NULL tetap Pattern A.

Job `PENDING` tanpa snapshot: bergantung D1 (fan-out vs start). Jika freeze hanya di `start()` dan seed sudah jalan, `start()` bisa memasukkan env — **DECISION REQUIRED** apakah PENDING pra-seed dikecualikan (mis. freeze memakai `min(now, seedCutoff)` tidak ada di kode → jangan ditebak).

---

## 9. New-job handling

**LOCKED.** Job baru setelah konfigurasi katalog BSM env.

**PROPOSED.** Pada momen freeze (D1): copy termasuk `BSM_ROOM_TEMP` Awal/Akhir, `BSM_ROOM_HUMIDITY` Awal/Akhir, `BSM_INPUT_VOLTAGE` L-N/L-G/N-G **jika dan hanya jika** baris itu sudah ada di katalog. `listMeasurementParameters` untuk job dengan header snapshot: Pattern B iff count(snapshot rows untuk parameter) > 0.

Write: klien mengirim `calibrationTestPointId` = **id master** yang ada di snapshot job itu. Tolak id yang hanya ada di katalog live.

Ulangan: `replicateIndex` tetap dinamis (Phase 1). Snapshot tidak menyimpan jumlah ulangan.

---

## 10. Catalog-change handling

Asumsi job sudah `snapshottedAt`.

| Perubahan master | Perilaku **PROPOSED** |
|---|---|
| Edit `settingLabel` / `sequence` / `settingValue` / override toleransi | Job lama: salinan snapshot. Job baru (belum freeze): nilai baru. |
| **Tambah** TP (mis. titik HR ke-5, atau Awal pada parameter yang sudah di-freeze sebagai A) | Tidak muncul di job yang sudah freeze. Muncul di job yang freeze kemudian. |
| **Nonaktifkan** TP master | Job lama tetap menampilkan salinan (di-copy saat aktif). Write: `loadCatalog` hari ini tetap `findUnique` tanpa cek `isActive` pada TP (**FACT**) — **DECISION REQUIRED** apakah write job lama tetap izinkan id master nonaktif. |
| **Hapus** baris master | `MeasurementResult` `onDelete: Restrict` (**FACT**) memblokir jika ada result. Snapshot yang FK ke master juga memblokir. Tanpa FK (pola `EquipmentDeliveryNoteItem.equipmentId` string): master bisa hilang; write `loadCatalog` gagal `CALIBRATION_TEST_POINT_NOT_FOUND`. **DECISION REQUIRED** FK Restrict vs id polos. |
| Parameter dihapus/nonaktifkan | Daftar parameter tetap live (**PROPOSED** v1): job lama bisa kehilangan parameter dari GET. Ini **sudah** perilaku sekarang. Bukan bagian OPTION 2. |

---

## 11. Answers to the investigation questions

### 1. Who owns the snapshot?

**PROPOSED:** `CalibrationJob` via child `JobCalibrationTestPoint` + timestamp header.

### 2. Lifecycle moment?

**DECISION REQUIRED:** fan-out vs `start()` (§6.1). Jangan freeze ulang di REWORK.

### 3. Fields?

§5. Source = `CalibrationTestPoint` (+ `deviceCalibrationParameterId`). Required vs optional di tabel itu.

### 4. Relations?

- Parameter: FK katalog (daftar parameter masih live).
- `CalibrationTestPoint`: sumber + `sourceCalibrationTestPointId`.
- `CalibrationJob`: parent cascade (seperti result).
- `MeasurementResult`: **PROPOSED** tetap ke master TP, bukan ke id snapshot (§5 opsi A).

### 5. Should MeasurementResult point to live / snapshot / both / neither?

| Opsi | Implikasi |
|---|---|
| **A. Live `CalibrationTestPoint`** (**PROPOSED**) | Natural key, Restrict, `loadCatalog`, tes existing **tetap**. Snapshot = allowlist + label beku. Risk: UI yang masih baca label live bisa drift — GET harus mengembalikan label **snapshot**. |
| **B. Hanya snapshot** | Schema result wajib kolom baru; migrasi 2 baris yang sudah punya TP (`BSM_HEART_RATE` / 30 BPM); historical NULL tetap NULL. Lebih “murni”, lebih invasif. |
| **C. Keduanya** | Dual id; unique key membingungkan; tidak ada preseden. |
| **D. Neither** | Hanya Pattern A; tidak mendukung named points. |

**PROPOSED:** A kecuali ada lock kemudian untuk B.

Apakah schema `MeasurementResult` bisa tidak berubah? **PROPOSED: ya** jika opsi A. Jika opsi B: minimum = FK baru nullable ke snapshot, dan keputusan apakah `calibrationTestPointId` tetap.

### 6. Pattern A / B after snapshotting?

**PROPOSED.** Jika job punya `snapshottedAt`: Pattern B ⇔ ada ≥1 baris snapshot untuk parameter itu (dan parameter lolos filter NUMBER/DIRECT_REPLICATES/aktif/`notIn` SUCT). Jika **belum** `snapshottedAt`: **DECISION REQUIRED** — jangan fallback live setelah seed (itu celah yang sama). Rollout harus meniadakan job tanpa header sebelum seed.

### 7–9. Catalog add/edit/remove?

§10.

### 10. IN_PROGRESS created before snapshot feature?

**LOCKED** tidak boleh jadi Pattern B env. **PROPOSED:** backfill snapshot dari katalog **pra-seed** (env 0 TP; HR/SpO2 tetap ter-copy).

### 11. Historical NULL?

Tetap NULL, tetap ulangan. Tampil selama parameter itu Pattern A **pada snapshot job**. Jangan infer Awal/Akhir.

### 12. MeasurementResult schema unchanged?

**PROPOSED** ya (opsi A). Minimum jika ditolak: kolom FK snapshot nullable.

### 13. Preserve LK/PDF behavior?

**LOCKED** mapping sel env out of scope. **FACT** `drawEnvironment` sudah mengosongkan Awal/Akhir/L-N. **PROPOSED:** jangan ubah template BSM. PDF **generik** harus memakai snapshot untuk grouping `parameterId:tpId` agar seed env tidak menelurkan baris kosong bernama pada job lama (perubahan **data source**, bukan layout). Result NULL tetap bucket `:none`.

### 14. Migration/backfill?

- DDL: tabel anak + kolom timestamp (belum dikerjakan).
- Data result: **tidak** di-backfill (**LOCKED** OPTION 4).
- Snapshot: **ya**, copy TP live **sekarang** untuk semua job existing, **sebelum** seed BSM env.
- Seed env: **setelah** semua job punya `snapshottedAt`. Hanya `BSM_ROOM_TEMP` / `BSM_ROOM_HUMIDITY` / `BSM_INPUT_VOLTAGE`.

### 15. Safest rollout?

§12.

---

## 12. Rollout strategy

Urutan **PROPOSED** (tidak dijalankan sekarang):

1. Migrasi **hanya** tabel snapshot + timestamp (tanpa seed env).
2. Deploy API: tulis snapshot (idempoten) + baca snapshot jika header ada; job tanpa header masih live (jendela pendek).
3. Backfill snapshot **semua** `CalibrationJob` yang ada (copy TP aktif katalog saat itu).
4. Verifikasi job BSM IN_PROGRESS: 0 snapshot row untuk tiga parameter env; HR masih ada.
5. **Baru** seed TP bernama BSM env.
6. Job yang di-`start()` setelah seed mendapat env di snapshot. Fan-out **tidak** menulis snapshot.
7. Jangan ubah PDF layout, submitForReview, atau result historis.
8. Mapping PDF env = tugas terpisah, hanya untuk result yang **memang** punya TP id.

---

## 13. Risks

| Risk | Mengapa |
|---|---|
| Freeze terlalu awal (fan-out) | PENDING lama tidak mendapat katalog env yang disengaja untuk “job baru” |
| Freeze di `start()` (LOCKED) | `PENDING` pra-seed yang di-start pasca-seed **sengaja** mendapat katalog baru (L2) |
| Fallback live jika header null | Satu job terlewat backfill + seed = konversi diam-diam |
| GET masih kirim label live | Drift nama titik vs snapshot |
| Write masih `loadCatalog` live untuk override toleransi | Titik sama, bounds berbeda dari yang dilihat teknisi di grid |
| Snapshot hanya env BSM, bukan seluruh TP tipe itu | Dua sumber kebenaran (HR live, env snapshot) |
| Hapus master + Restrict | Operasi katalog terblokir oleh job lama — **sudah** true jika ada result |
| Parameter list tetap live | Parameter baru/hilang pada job lama di luar OPTION 2 |
| Generic PDF tidak diubah | Job lama bisa tampil baris Awal kosong setelah seed |

---

## 14. DECISION REQUIRED — sisa setelah lock

Tertutup oleh DECISION LOCK — 2026-09-18: momen freeze; PENDING vs started; FK result ke master; tidak freeze seluruh parameter; seed BSM only; NULL historis; Pattern A/B dari snapshot; tidak re-freeze di REWORK.

Masih terbuka (jangan ditebak di implementasi):

1. **`resolveJobDeviceTypeId` null pada `start()`** — **FACT** GET mengembalikan parameter kosong jika null. Snapshot kosong vs gagalkan `start()`: **IMPLEMENTATION CONFLICT — DECISION REQUIRED** jika bisnis menuntut freeze wajib punya DeviceType.
2. **FK `JobCalibrationTestPoint` → `CalibrationTestPoint`:** Restrict (selaras `MeasurementResult`) vs id polos. Restrict konsisten dengan result; tidak dilarang lock.
3. **Write ke master `isActive=false` jika id masih di snapshot:** izinkan (allowlist job) vs tolak (`loadCatalog` hari ini tidak cek `isActive` pada TP — **FACT**). Default mengikuti allowlist + perilaku findUnique sekarang = izinkan.
4. **Residual L5/L6:** inherit toleransi **parameter** live pada write (lihat lock L5).
5. **Job started tanpa header setelah deploy+seed:** harus mustahil jika backfill wajib sebelum seed. Jika ada, jangan fallback live (**LOCKED** L2/L8). Gagal keras vs emergency copy: **DECISION REQUIRED** hanya untuk jalur cacat data.

Bukan keputusan: enum RANGE; mapping `replicateIndex`; backfill result; seed non-BSM; submit completeness; layout PDF BSM.

---

## 15. Files / schema that would eventually change

**Tidak diubah pada tugas desain ini.** Kandidat implementasi **nanti**:

| Area | Path |
|---|---|
| Schema | `packages/db/prisma/schema.prisma` — model baru + field `CalibrationJob`; relasi |
| Migrasi | `packages/db/prisma/migrations/*` — DDL + **bukan** rewrite `MeasurementResult` jika opsi A |
| Seed | `packages/db/prisma/seed-calibration-test-points.ts` — **hanya setelah** backfill snapshot; hanya 3 kode BSM env |
| `start()` saja (bukan fan-out) | `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts` `start()` |
| Pattern A/B GET | `listMeasurementParameters` + tes `calibration-jobs.service.test.ts` |
| Write validate | `measurement-results.service.ts` `loadCatalog` (anggota snapshot) |
| PDF generik **sumber data** | `lk-download.service.ts` `buildCapabilitySections` |
| Tech-PWA | hanya jika kontrak GET berubah (id tetap live: kemungkinan minim) |
| Portal labels | memakai `settingLabel` dari GET snapshot |

**Jangan sentuh (lock + out of scope):** template `lk-templates/bed-side-monitor.ts` layout; `submitForReview`; rewrite baris `MeasurementResult`; seed `*_ROOM_TEMP` non-BSM; schema enum semantik titik.

---

## 16. Final schema/code consistency check

### 16.1 Can `JobCalibrationTestPoint` support the locked lifecycle?

**Ya, dengan kolom baru.** Schema hari ini **tidak** punya anak job untuk TP. Lock tidak bentrok dengan model master: freeze adalah **insert salinan** pada `start()`, bukan ubah `CalibrationTestPoint`.

**FACT konflik kecil dengan kode `start()`:** update status **tidak** dalam `$transaction` bersama baca katalog. Implementasi harus membungkus: baca TP aktif → insert snapshot → `update` job `IN_PROGRESS`/`startedAt`/`snapshottedAt`. Dua `start()` paralel: unique A + predikat `status: PENDING` pada update (perkuat `updateMany` seperti `submitForReview`).

Tidak freeze di fan-out: **selaras** `createMany` job yang ada — file WO **tidak** perlu diubah untuk tulis snapshot.

### 16.2 Exact fields required

Verifikasi terhadap `CalibrationTestPoint` + lock L4–L6:

| Field | Wajib | Alasan |
|---|---|---|
| `id` | ya | PK snapshot (bukan FK result) |
| `calibrationJobId` | ya | pemilik; `onDelete: Cascade` seperti result |
| `deviceCalibrationParameterId` | ya | group Pattern A/B; Restrict seperti result |
| `sourceCalibrationTestPointId` (`CalibrationTestPoint.id`) | ya | allowlist = identitas result |
| `sequence` | ya | urutan grid beku |
| `settingLabel` | ya | label beku (Awal, 30 BPM, …) |
| `settingValue` | tidak (nullable) | sama master |
| `toleranceMin` / `toleranceMax` / `toleranceNote` | tidak (nullable) | override titik; NULL = inherit parameter (aturan domain) |
| `companyId` | **PROPOSED** mengikuti child job lain (`MeasurementResult` mempunyainya) | bukan di master TP; **DECISION REQUIRED** hanya jika konvensi child wajib companyId |

**Tidak** disalin: `createdAt`/`updatedAt` master; seluruh field `DeviceCalibrationParameter` kecuali id.

Header job: `measurementTestPointsSnapshottedAt DateTime?` — membedakan `PENDING` (null) vs sudah freeze. **FACT** `startedAt` juga null hanya sebelum start; setelah start keduanya terisi bersama. Header terpisah tetap berguna untuk backfill job yang `startedAt` sudah ada sebelum kolom snapshot ada.

### 16.3 Exact unique constraints

**Wajib:** `@@unique([calibrationJobId, sourceCalibrationTestPointId])` (lock L7 opsi A).

**Index:** `[calibrationJobId]`, `[deviceCalibrationParameterId]`, `[sourceCalibrationTestPointId]`.

**Opsional defensif:** `@@unique([calibrationJobId, deviceCalibrationParameterId, sequence])`.

Jangan unique pada `settingLabel` di snapshot sebagai identitas (label boleh identik lintas parameter; per parameter master sudah unique — copy 1:1 tidak perlu unique label kecuali ingin meniru master).

### 16.4 Transaction boundary

**Satu transaksi `start()`:**

1. Lock/ambil job `PENDING` + `startedAt` null (perusahaan cocok).
2. `assertKontrolAlatReadyForStart` (sudah ada, di luar atau dalam tx yang sama).
3. `resolveJobDeviceTypeId`; `findMany` `CalibrationTestPoint` `isActive: true` untuk parameter `deviceTypeId` itu (satu query, bukan loop yang bisa melihat commit katalog tengah jalan).
4. `createMany` `JobCalibrationTestPoint`.
5. `update` job: `IN_PROGRESS`, `startedAt`, `measurementTestPointsSnapshottedAt`.
6. Commit.

Konkurensi katalog: READ COMMITTED bisa melihat insert TP yang commit antara step 3–5 jika dipisah. **Dalam satu `findMany` di dalam tx:** set yang di-copy adalah snapshot baca itu; TP yang di-commit setelah `findMany` tidak masuk — sesuai L2 (freeze = katalog pada `start()`).

Jangan freeze di `resumeAfterRework`.

### 16.5 Catalog change during start()

Jika katalog berubah **sebelum** transaksi `start()` commit: yang ter-copy = hasil `findMany` di tx. Tidak ada merge kemudian.

Jika katalog berubah **setelah** commit `start()`: diabaikan untuk job itu (L2/L8).

### 16.6 How API/UI queries an already-started job

**PROPOSED.** `listMeasurementParameters`: jika `job.startedAt != null` (atau header snapshot set):

- Daftar **parameter** tetap dari katalog live (L6).
- Nested `testPoints`: baris `JobCalibrationTestPoint` untuk job itu, `id` wire = **`sourceCalibrationTestPointId`** (bukan PK snapshot), label/sequence/override dari salinan.
- Pattern B iff snapshot count untuk parameter > 0 (plus filter NUMBER/DIRECT_REPLICATES/aktif/`SUCT_VACUUM_GAUGE` yang sudah ada).

Tech-PWA/portal tidak query tabel TP langsung (**FACT**): mereka memakai GET. Jika GET benar, UI grid/completeness memakai id master yang sama.

Write: `loadCatalog` + cek id ∈ snapshot job+parameter. Tolak TP live yang tidak ada di snapshot (`MEASUREMENT_TEST_POINT_NOT_IN_JOB` atau setara). Result tetap menulis `calibrationTestPointId` master.

`PENDING`: GET seperti hari ini (live). Write tetap diblokir `assertJobStarted`.

### 16.7 Queries/services that must stop using live TP for **started-job pattern**

| Lokasi | Hari ini | Setelah lock |
|---|---|---|
| `listMeasurementParameters` `testPoints: none/some` | live count | snapshot jika started |
| nested `testPoints` select di GET itu | live aktif | salinan job |
| `lk-download.service.ts` `buildCapabilitySections` | live `testPoints` | snapshot jika started (sumber data, bukan layout BSM) |
| `measurement-results.service.ts` `loadCatalog` | live findUnique, tidak cek membership job | + allowlist snapshot |
| Portal `[id]/page.tsx` labels | dari GET | tidak ubah jika GET benar |
| Tech-PWA grid / `gridEntryStatus` | id dari GET | tidak ubah jika GET benar |
| `submitForReview` | tidak baca TP | **jangan diubah** (L11) |
| `bed-side-monitor.ts` `drawEnvironment` | sel kosong hard-coded | **jangan diubah** (L11) |

Parameter list, `decimalPlaces`, UoM: tetap live (L6).

### 16.8 Minimum files that will eventually change

- `packages/db/prisma/schema.prisma`
- satu migrasi DDL (+ backfill snapshot job existing, **bukan** rewrite result)
- `calibration-jobs.service.ts` (`start`, `listMeasurementParameters`)
- `calibration-jobs.service.test.ts`
- `measurement-results.service.ts` (+ tes allowlist)
- `lk-download.service.ts` grouping generik saja
- `seed-calibration-test-points.ts` **setelah** backfill — hanya 3 kode BSM env

Tidak: fan-out WO, layout BSM PDF, `submitForReview`, Tech-PWA kecuali kontrak GET rusak (id master + label dari GET).

### 16.9 Migration / backfill

1. DDL tabel + unique A + `measurementTestPointsSnapshottedAt`.
2. Backfill: untuk setiap job dengan `startedAt IS NOT NULL`, copy TP aktif katalog **saat backfill** (env BSM masih 0 TP). Set timestamp. **Tidak** mengisi `MeasurementResult.calibrationTestPointId`.
3. Job `PENDING`: jangan backfill snapshot (L1/L2).
4. Verifikasi `cmu0qm039001prv0ng7lp0fmv`: 0 snapshot env; HR tetap ter-copy; 2 result suhu NULL.
5. Baru seed BSM env.

**IMPLEMENTATION CONFLICT — DECISION REQUIRED** jika production punya job `startedAt` set tetapi katalog env sudah ter-seed sebelum backfill (saat ini **FACT** audit: env belum ter-seed). Urutan 2→5 wajib.

### 16.10 Tests required

- `start()` dalam satu tx menulis snapshot = TP aktif DeviceType; idempoten / konflik jika sudah started.
- `start()` **tidak** dipanggil dari fan-out (regresi: createMany job tanpa baris snapshot).
- `PENDING` GET = live Pattern A/B; setelah `start()` GET tidak melihat TP master yang di-insert kemudian.
- Insert katalog Awal pada `BSM_ROOM_TEMP` tidak mengubah job sudah started (tetap A jika snapshot env kosong).
- Job baru `start()` setelah seed: Pattern B env; label dari snapshot.
- Write result: TP tidak di snapshot ditolak; TP di snapshot OK; NULL tetap sah untuk Pattern A.
- Result historis NULL tidak berubah di tes backfill/fixture.
- `resumeAfterRework` tidak menambah baris snapshot.
- Generic PDF grouping: started job tidak mendapat titik live baru.
- Tes existing `listMeasurementParameters` / measurement-results tetap lulus dengan snapshot di `start()` pada helper tes yang memanggil `start()`.

Out of scope tes: PDF sel Awal terisi; submit completeness.

---

## 17. READY FOR IMPLEMENTATION

**READY FOR IMPLEMENTATION: YES**

Alasan:

- Lock L1–L11 selaras schema: FK result ke master **mungkin** tanpa migrasi kolom result.
- Unique A diturunkan dari identitas `CalibrationTestPoint.id` yang sudah dipakai natural key.
- Lifecycle `start()` adalah gerbang tulis yang sudah ada; fan-out tidak perlu diubah untuk freeze.
- Celah “katalog live mengubah IN_PROGRESS” tertutup jika GET/write/PDF generik memakai snapshot untuk job started, plus backfill sebelum seed BSM.
- Konflik residual (inherit toleransi parameter live; DeviceType null; FK Restrict vs string) **terdokumentasi**, tidak memblokir v1 jika implementasi mengikuti rantai `measurement-tolerance.ts` dengan override titik dari snapshot dan inherit parameter seperti sekarang.

**NO** akan dipilih jika produk menuntut freeze bounds parameter (melanggar L6) atau FK result ke snapshot (melanggar L4 tanpa bukti A mustahil). Keduanya tidak di-lock.

---

## Explicit non-implementation (saat desain)

Bagian di bawah ini adalah catatan desain; status runtime ada di **IMPLEMENTATION STATUS**.

---

# IMPLEMENTATION STATUS — 2026-09-18

## IMPLEMENTED

- Model `JobCalibrationTestPoint` + `CalibrationJob.measurementTestPointsSnapshottedAt`.
- Unique DB `(calibrationJobId, sourceCalibrationTestPointId)`.
- FK: job `onDelete: Cascade`; master TP + parameter `Restrict`.
- Migrasi `20260918120000_add_job_calibration_test_point`: DDL + backfill snapshot untuk job `startedAt IS NOT NULL` (salin katalog **saat migrasi**, **tanpa** menyentuh `MeasurementResult`).
- Skrip idempoten `packages/db/prisma/backfill-job-calibration-test-points.ts` + npm script `backfill:job-calibration-test-points`.
- `CalibrationJobsService.start()`: satu transaksi `updateMany` claim PENDING + copy snapshot + stamp `startedAt` / `measurementTestPointsSnapshottedAt`.
- `listMeasurementParameters`: PENDING = katalog live; job dengan `snapshottedAt` = Pattern A/B dari snapshot; `testPoints[].id` = `sourceCalibrationTestPointId`.
- `MeasurementResultsService.loadCatalog`: allowlist snapshot; overlay override toleransi titik dari snapshot; FK result tetap ke master.
- `lk-download.service` `buildCapabilitySections`: sumber titik untuk job frozen = snapshot (bukan layout BSM).
- Seed `BSM_ROOM_TEMP` / `BSM_ROOM_HUMIDITY` / `BSM_INPUT_VOLTAGE` via `settingLabel` + `sequence` (tanpa enum RANGE/Awal/…).
- Tes unit/integrasi di `calibration-jobs.service.test.ts` dan `measurement-results.service.test.ts`.

### Urutan deploy (wajib)

1. Deploy migrasi (DDL + backfill snapshot job yang sudah `startedAt`) **sebelum** seed BSM env.
2. Konfirmasi job historis (termasuk `cmu0qm039001prv0ng7lp0fmv`) Pattern A untuk parameter env (0 baris snapshot env).
3. Baru jalankan `seed:calibration-test-points` (menambah titik env BSM jika sequence belum ada).
4. Job `PENDING` yang di-`start()` setelah seed dapat Pattern B; job sudah started tidak berubah.

## NOT IMPLEMENTED (sengaja / residual v1)

- Snapshot seluruh `DeviceCalibrationParameter` (L6).
- Inherit toleransi tingkat parameter tetap live pada write jika override titik NULL (L5 residual).
- Aturan baru untuk `deviceTypeId` NULL pada `start()`: copy 0 baris (perilaku existing).
- Unique defensif `(job, parameter, sequence)` — tidak ditambah.
- Completeness `submitForReview`.
- Mapping PDF `settingLabel` → sel Awal/Akhir/L-N/L-G/N-G.
- Backfill/remap `MeasurementResult.calibrationTestPointId`.
- Inferensi semantik dari `replicateIndex`.

## OUT OF SCOPE (L11)

- Ubah layout LK BSM / portal PDF cells.
- Redesign Tech-PWA / layar tidak terkait.
- Refactor API tidak terkait.
- Seed titik lingkungan alat selain BSM.

## Tech-PWA

Tidak diubah. Grid memakai `gridParameters[].testPoints[].id` dari GET; setelah freeze, GET mengembalikan id master dari snapshot.

## KNOWN RESIDUAL

- Parameter `isActive: false` di katalog live tetap menyembunyikan baris GET meskipun snapshot punya titik (daftar parameter tidak di-snapshot).
- Job started lewat helper tes yang hanya `UPDATE startedAt` tanpa `snapshottedAt` masih membaca katalog live (jalur produksi `start()` + backfill selalu mengisi timestamp).
- FK Restrict: menghapus master `CalibrationTestPoint` gagal jika masih ada snapshot/result.
- Isolasi transaksi: `updateMany` claim + unique A cukup untuk start ganda; tidak ada advisory lock tambahan.
