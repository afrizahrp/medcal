# PHASE 4 — MEASUREMENT DOMAIN ARCHITECTURE DESIGN

**Tanggal:** 2026-09-18
**Baseline domain:** Report 07 (`07 forensic-audit-lk-measurement-structures-20260918.md`)
**Status:** READ-ONLY DESIGN — tidak ada schema, migrasi, API, service, hooks, Portal, Tech-PWA, PDF, seed, atau data yang diubah.
**Keluaran:** proposal arsitektur + urutan implementasi. **Berhenti menunggu persetujuan.**

Gap yang dibahas, sesuai Report 07:

- **Gap A** — beberapa besaran terukur dalam satu logical test (§6.1)
- **Gap B** — nilai turunan / agregat (§6.2)
- **Gap C** — parameter yang ditentukan teknisi (§6.3)

---

## 1. Validasi terhadap kode nyata

Tujuh temuan berikut mengubah atau mempertajam asumsi Report 07, dan semuanya diverifikasi langsung di kode — bukan dari dokumen desain lama.

**1.1 `MeasurementResult` jauh lebih kaya daripada yang tersirat di Report 01–04.**
`packages/db/prisma/schema.prisma` sudah memiliki `referenceValue`, `measuredBool`, `measuredText`, `uomId` per baris, `entryKind`, `appliedNominalValue`, `attachmentFileObjectId`, dan snapshot `effectiveToleranceMin/Max`. Yang **tidak** ada hanyalah: besaran kedua dalam satu baris, dan provenance turunan.

**1.2 Natural key adalah batas desain yang nyata.**

```
@@unique([calibrationJobId, deviceCalibrationParameterId, calibrationTestPointId,
          replicateIndex, attemptNumber, direction])  // NULLS NOT DISTINCT
```

Setiap usulan yang menambah dimensi identitas baris **wajib** mengubah unique ini, dan `translateUnique` di `measurement-results.service.ts:516` menerjemahkan P2002 menjadi `MEASUREMENT_DUPLICATE_ENTRY`. Ini menjadikan opsi "tambah dimensi" secara objektif lebih mahal daripada opsi "pecah parameter".

**1.3 `deviceCalibrationParameterId` wajib dan tidak nullable.**
Konsekuensinya untuk Gap C: setiap hasil pengukuran **harus** menunjuk baris katalog. Desain apa pun yang membiarkan teknisi mengukur tanpa baris katalog memerlukan perubahan FK wajib — perubahan paling invasif di seluruh dokumen ini.

**1.4 Rantai toleransi tidak menerima nilai dari luar.**
`resolveEffectiveTolerance` (`measurement-tolerance.ts`) hanya membaca override titik → bounds parameter → parse note → NULL. Satu-satunya nilai yang boleh dipasok klien adalah `suppliedNominalValue`. **Tidak ada jalur** untuk toleransi yang berasal dari sertifikat kontrol UUT — persis yang dituntut LK Auto Chemistry Analyzer / Hematologi.

**1.5 `attachmentFileObjectId` sudah ada.**
LK ACA/Hematologi meminta "cantumkan bukti toleransi dari sertifikat control … baik berupa foto". Mekanisme lampiran per hasil sudah termodelkan; tidak perlu konsep baru untuk bukti.

**1.6 Completeness SUDAH menjadi gate submit — dan ini mengubah risiko penambahan parameter.**
`calibration-jobs.service.ts:2082` `assertMeasurementsCompleteForSubmit` menghitung `eligibleParameterIds` dari **katalog live** (`isActive` + `NUMBER` + `DIRECT_REPLICATES`, minus `SUCT_VACUUM_GAUGE`), sedangkan titik ukur diambil dari **snapshot job**. Artinya:

> Menambah satu `DeviceCalibrationParameter` aktif bertipe NUMBER pada sebuah DeviceType **langsung membuat setiap job yang sedang berjalan pada tipe itu gagal submit** dengan `CALIBRATION_MEASUREMENTS_INCOMPLETE`, sampai teknisi mengisi parameter yang belum pernah ada saat mereka mulai bekerja.

Ini **bukan** temuan Report 07 — ini konsekuensi kode yang baru terlihat di Phase 4, dan ia mengenai ketiga gap sekaligus, karena solusi yang direkomendasikan untuk Gap A dan Gap B sama-sama menambah parameter. Ditangani di §5 dan §9.B.

**1.7 Portal CRUD untuk `CalibrationTestPoint` memang belum ada.**
Pencarian `calibrationTestPoint` di `apps/portal/src` hanya menemukan halaman baca `calibration-jobs/[id]/page.tsx` dan `use-measurement-results-query.ts`. `device-calibration-parameters.service.ts` `copy()` bahkan **melewati** parameter Pattern B (`skippedUnsupportedEntryStyle`) justru karena test point-nya tidak bisa ikut disalin. Jadi Phase 4 mendahului pekerjaan CRUD itu, dan tidak boleh mengasumsikan CRUD tersebut sudah ada.

**Kesimpulan validasi:** arsitektur yang ada **tidak** perlu dirombak. Ketiga gap dapat diselesaikan dengan perluasan yang sangat kecil, ditambah satu keputusan lingkup yang memang milik bisnis (Gap C).

---

## 2. GAP A — Beberapa besaran terukur dalam satu logical test

### 2.1 Kebutuhan domain (Report 07 §6.1)

LK Dental X-Ray Tabel 12 "Reproduksibilitas Keluaran Sinar-X": satu baris = satu eksposur, menghasilkan `kV`, `s`, dan `mGy` sekaligus — tiga satuan berbeda, tiga besaran berbeda, satu peristiwa fisik. LK Mikroskop Tabel 7/8: `Stage mikrometer` + `Okuler mikrometer` berdampingan.

### 2.2 Batasan aktual

`MeasurementResult` menyimpan satu `measuredValue` + satu `uomId`. `referenceValue` **bukan** jalannya: field itu bermakna "pembacaan standar untuk besaran yang sama" (kasus Thermohygrometer ref-vs-UUT, Report 07 §6.5), bukan besaran lain. Memakainya untuk `mGy` di baris `kV` akan merusak makna yang sudah terdokumentasi di komentar schema.

### 2.3 Opsi

**Opsi A1 — pemecahan parameter (pola yang sudah dipakai sistem).**
`DXRAY_REPRODUCIBILITY` menjadi `..._KV`, `..._S`, `..._MGY`. Preseden kuat dan terdokumentasi: `fix-collapsed-audiometer-parameters.ts` (sisi earphone), `fix-collapsed-pattern-c-parameters.ts` (ON/OFF, 121/134, 70kV/80kV). Setiap besaran memperoleh `uomId`, `decimalPlaces`, toleransi, dan `isWithinTolerance` sendiri — yang memang berbeda per besaran. Nol perubahan schema. Yang hilang: korelasi bahwa ketiganya berasal dari eksposur yang sama, dan kepastian bagaimana LK merender ketiganya sebagai satu baris.

**Opsi A2 — entitas kuantitas anak.**
`MeasurementQuantity` sebagai anak katalog parameter, lalu `MeasurementResult.measurementQuantityId` masuk natural key. Secara model paling "murni". Biayanya konkret: mengubah unique key enam-kolom, menyentuh setiap pembaca (`list`, completeness, LK grouping, Tech-PWA), dan menambah dimensi ketiga di samping test point dan replicate yang harus dijelaskan ke teknisi. Data historis tetap valid (kolom nullable), tetapi seluruh permukaan baca berubah.

**Opsi A3 — A1 ditambah pengelompokan di tingkat katalog.**
Besaran tetap parameter terpisah (A1), lalu ditambahkan metadata **katalog** yang menyatakan "parameter-parameter ini dicetak sebagai satu baris LK, dengan urutan kolom ini". Bentuk paling kecil: dua kolom nullable di `DeviceCalibrationParameter` — pengenal grup dan urutan dalam grup. Tidak menyentuh `MeasurementResult`, natural key, snapshot, maupun data historis. Baris lama bernilai NULL = parameter berdiri sendiri, tetap valid.

### 2.4 Arsitektur yang direkomendasikan

**A3.** Alasannya bertumpu pada pemisahan yang sudah benar di kode: identitas *pengukuran* sudah cukup dijelaskan oleh parameter + test point + replicate, sedangkan yang sebenarnya kurang adalah informasi *penyajian* — bagaimana LK menyatukan tiga parameter menjadi satu baris. Menaruh kebutuhan penyajian di natural key hasil (A2) memindahkan biaya ke tempat yang paling mahal dan paling sering dibaca.

Konsekuensi yang harus dinyatakan terbuka: dengan A3, korelasi "kV ke-n dan mGy ke-n berasal dari eksposur yang sama" bersandar pada **konvensi** bahwa `replicateIndex` bermakna "eksekusi ke-n dari logical test", bukan pada constraint. Apakah korelasi per-eksposur harus dijamin secara evidensial adalah pertanyaan bisnis — lihat §9.B.1. Jika jawabannya "harus dijamin", A3 tidak cukup dan A2 menjadi jalur yang benar.

---

## 3. GAP B — Nilai turunan / agregat

### 3.1 Kebutuhan domain (Report 07 §6.2, §6.4b)

ΔT1–ΔT3 (Autoclave), rasio 4x/10x (Mikroskop), Selisih Standar−UUT (Baby Incubator), hasil uji kebocoran = setting − standar (Sphygmomanometer), Acceptance/Average/Min/Max/K-factor (BSC). Masing-masing punya toleransi sendiri.

### 3.2 Fakta yang menentukan bentuk solusi

Report 07 §6.4b mengonfirmasi dari workbook resmi terisi: sel ΔT di `Autoclave.xlsx` adalah **angka literal yang diketik teknisi**, bukan formula. Jadi praktik bisnis hari ini adalah **entri manual**, bukan perhitungan otomatis.

Dan sebagian Gap B **sudah** tertangani: `ACLV_CHAMBER_TEMP_DT1/2/3` serta `MICRO_MAG_4X/10X` sudah ada sebagai parameter biasa. Sebuah nilai turunan yang diketik teknisi, secara struktural, **adalah** sebuah pengukuran: ia punya nilai, toleransi, dan verdict. `MeasurementResult` sudah menanganinya.

Yang benar-benar belum termodelkan hanya tiga hal: (i) penandaan bahwa baris itu turunan, bukan bacaan standar; (ii) provenance — dari baris mana ia diturunkan; (iii) perhitungan otomatis, bila kelak diinginkan.

### 3.3 Opsi

**Opsi B1 — turunan sebagai parameter biasa, entri manual, ditandai eksplisit.**
Melanjutkan apa yang sudah berjalan, ditambah satu penanda. Rumah yang tepat untuk penanda itu sudah ada: enum `MeasurementEntryKind` (`DIRECT_READING`, `LOGGER_SUMMARY`). Menambah nilai `DERIVED` adalah perluasan satu-nilai; baris lama tetap `DIRECT_READING` (default kolom), tidak ada backfill. Provenance dinyatakan deskriptif di tingkat katalog (parameter mana yang menjadi masukan), bukan per baris.

**Opsi B2 — mesin formula penuh.**
Ekspresi tersimpan di katalog, dievaluasi server-side, hasilnya ditulis ke `MeasurementResult`, formula di-snapshot per job agar edit katalog tidak menulis ulang verdict yang sudah disubmit. Memberi konsistensi dan menghilangkan aritmetika manual. Biayanya bukan hanya evaluator: ia memerlukan versioning formula, urutan evaluasi, penanganan masukan yang belum lengkap, dan interaksi dengan attempt lock.

**Opsi B3 — turunan deklaratif dengan himpunan operasi tertutup.**
Bukan ekspresi bebas, melainkan daftar operasi terbatas (selisih, rasio, rata-rata, minimum, maksimum) dengan masukan berupa referensi parameter/test point. Dihitung otomatis saat tulis, dengan override manual yang ditandai. Menghindari bahasa formula, tetap memberi otomasi untuk kasus yang benar-benar seragam.

### 3.4 Arsitektur yang direkomendasikan

**B1 sekarang; B3 sebagai lapisan berikutnya, dengan prasyarat keras.**

Alasannya berasal langsung dari bukti, bukan dari preferensi kehati-hatian: Report 07 §6.4b menemukan **rumus LK yang cacat dan persisten** — `ΔT2 = S1 – S3` dan `ΔT3 = S1 – S3` tercetak identik padahal toleransinya berbeda (±5 °C vs ±2 °C). Mengotomasi perhitungan berarti mengkodekan rumus. Mengkodekan rumus yang belum dikonfirmasi berarti memproduksi verdict yang salah secara sistematis dan dalam skala — sesuatu yang tidak terjadi selama teknisi mengetik nilainya sendiri. Sesuai instruksi Phase 4, rumus itu **tidak** dikoreksi dan **tidak** ditebak di sini; ia tetap menjadi butir konfirmasi bisnis (§9.B.3).

Jika B3 kelak disetujui, dua properti wajib melekat sejak awal, mengikuti pola yang sudah terbukti di `effectiveToleranceMin/Max`:

- **Snapshot definisi turunan per job**, bukan pembacaan katalog live saat render. Alasan sama persis dengan alasan `JobCalibrationTestPoint` ada.
- **Hasil turunan tetap tunduk pada attempt lock** `assertMeasurementRowEditable`. Sebuah nilai turunan pada attempt yang sudah disubmit tidak boleh dihitung ulang, meskipun masukannya kemudian diperbaiki pada attempt berikutnya.

Catatan khusus BSC: `Acceptance`, `Average`, `Min`, `Max`, `K factor` (Report 07 §3.F) belum menjadi parameter sama sekali. Di bawah B1 mereka menjadi parameter biasa bertanda `DERIVED`. `K factor` perlu diperhatikan — LK menyebut nilainya dibaca dari template/stiker pabrikan, sehingga ia kemungkinan **bukan** turunan melainkan nilai referensi; klasifikasinya belum dapat ditentukan dari bukti dan masuk §9.B.4.

---

## 4. GAP C — Parameter yang ditentukan teknisi

### 4.1 Kebutuhan domain (Report 07 §6.3)

LK Auto Chemistry Analyzer dan Hematologi Analyzer: daftar analyte hanya saran. Catatan LK menyuruh teknisi mengambil parameter sesuai yang ada pada UUT, menulis namanya sendiri bila berbeda, dan boleh memakai toleransi dari sertifikat kontrol dengan melampirkan buktinya.

### 4.2 Batasan aktual

Dua hal, keduanya terverifikasi di kode:

- `MeasurementResult.deviceCalibrationParameterId` **wajib** (§1.3). Tidak ada pengukuran tanpa baris katalog.
- Rantai toleransi tidak menerima nilai dari luar (§1.4). Toleransi dari sertifikat kontrol tidak punya jalur masuk.

Instruksi Phase 4 memberi batas tegas: **hindari mekanisme parameter arbitrer yang tidak terkendali.** Itu menyingkirkan opsi "biarkan teknisi mengetik nama parameter bebas dan simpan apa adanya".

### 4.3 Pertanyaan lingkup

Pilihan lingkup menentukan seluruh desain:

- **Katalog global** — bertentangan dengan bukti; daftar analyte berbeda per unit.
- **DeviceType** — tempat parameter hidup sekarang; benar secara struktural, tetapi daftarnya harus menjadi superset dari semua analyser tipe itu.
- **DeviceModel** — tidak terhubung ke job maupun result (Report 03 §2 memverifikasi `DeviceModel` hanya terkait `DeviceType`). Bukan kandidat.
- **Device (UUT)** — paling sesuai secara domain: menu analyte adalah milik mesin fisik. Terhalang fakta bahwa job di-fan-out dengan `deviceId: null` dan sering belum terikat device master saat pengukuran (Report 03 §6). Tidak dapat diandalkan sebagai lingkup wajib.
- **CalibrationJob** — selalu tersedia, dan sejalan dengan mekanisme snapshot yang sudah ada.

### 4.4 Opsi

**Opsi C1 — perluas katalog DeviceType, tanpa konsep baru.**
Analyte yang benar-benar dipakai ditambahkan sebagai `DeviceCalibrationParameter` biasa lewat Portal. Nol perubahan model. Konsekuensi: setiap analyte yang belum ada di katalog menghalangi pekerjaan lapangan sampai seseorang menambahkannya dari Portal — padahal LK secara eksplisit mengantisipasi teknisi menemukan analyte yang tidak terdaftar, di lokasi, mungkin luring.

**Opsi C2 — pemilihan keberlakuan per job atas katalog yang diatur.**
Katalog DeviceType memuat analyte yang dikenal; job memilih subset yang berlaku untuk unit itu. FK wajib tetap utuh. Menyelesaikan masalah "daftar berbeda per unit" dan sekaligus masalah completeness (hanya yang dipilih yang wajib). Tidak menyelesaikan kasus analyte yang belum pernah ada di katalog.

**Opsi C3 — parameter usulan bercakupan job, dengan persetujuan.**
Teknisi dapat mengajukan parameter baru dari lapangan; parameter itu hidup sebagai entitas bercakupan job dengan status persetujuan, dan harus disetujui sebelum sertifikat terbit. Menyelesaikan kasus lapangan sepenuhnya. Biayanya paling besar dan paling politis: ia menciptakan jalur di mana pengukuran tercatat terhadap definisi yang belum disetujui, dan memerlukan keputusan tentang FK wajib, alur persetujuan, RBAC, serta perilaku PDF untuk parameter yang belum disetujui.

### 4.5 Arsitektur yang direkomendasikan

**C2 sebagai fondasi**, karena ia menjawab bagian kebutuhan yang tidak diperdebatkan (daftar berlaku berbeda per unit) tanpa melanggar FK wajib dan tanpa membuka mekanisme arbitrer.

**C3 tidak direkomendasikan maupun ditolak di sini** — ia bergantung pada satu keputusan yang bukan milik saya: **apakah Medcal mengizinkan pengukuran tercatat terhadap parameter yang belum pernah disetujui.** Jawaban "tidak" menutup desain pada C2 + alur permintaan katalog di luar lapangan. Jawaban "ya" mengharuskan C3 beserta seluruh konsekuensi persetujuannya. Lihat §9.B.5.

Terlepas dari pilihan itu, satu perluasan kecil tetap diperlukan dan berdiri sendiri: **toleransi yang dipasok per-run**. Untuk parameter yang ditandai "toleransi berasal dari sertifikat standar unit", jalur tulis harus menerima bounds dari klien, lalu **men-snapshot-nya persis seperti hari ini** ke `effectiveToleranceMin/Max`, dengan `attachmentFileObjectId` sebagai buktinya. Ini menambah satu sumber di puncak rantai `resolveEffectiveTolerance`, tidak mengubah empat tingkat yang sudah ada, dan tidak menyentuh satu pun baris historis.

---

## 5. Arsitektur lintas-domain

| Pertanyaan | Jawaban | Dasar |
|---|---|---|
| `CalibrationTestPoint` tetap? | **Ya, tanpa perubahan** untuk ketiga gap | Report 07 §7; tidak satu pun gap adalah persoalan titik ukur |
| `JobCalibrationTestPoint` tetap mekanisme snapshot job? | **Ya** | Gap C **tidak** boleh menumpang di sini; keberlakuan parameter adalah himpunan yang berbeda dari himpunan titik ukur |
| `replicateIndex` dinamis tetap? | **Ya** | Report 07 §7: tidak ada LK yang menuntut jumlah tetap; `expectedReplicateCount` tetap dilarang |
| `direction` | **Tidak tersentuh.** Orthogonal terhadap ketiga gap | Gap UI direction (Report 07 §5 #1) adalah pekerjaan terpisah |
| `referenceValue` | **Tidak tersentuh**, dan secara eksplisit **bukan** mekanisme Gap A | Maknanya "pembacaan standar untuk besaran yang sama" (§2.2) |
| `entryStyle` | **Tidak tersentuh.** Ia atribut katalog tentang bentuk UI | Penanda turunan adalah properti per-baris, jadi rumahnya `entryKind`, bukan `entryStyle` |
| `valueType` | **Tidak tersentuh.** `RATIO` sudah ada untuk rasio Mikroskop | Yang menghalangi adalah filter `valueType: "NUMBER"` di GET — gap UI, bukan gap model |
| Tolerance override | Rantai empat tingkat **tetap**; Gap C menambah satu sumber di puncak, di-snapshot dengan mekanisme yang sama | `measurement-tolerance.ts` tidak perlu dirombak |
| Measurement completeness | **Berubah perilakunya**, lihat di bawah | `calibration-jobs.service.ts:2082` |
| Submit for Review | Gate tetap; yang berubah adalah isi `eligibleParameterIds` | Sama |
| Apa yang harus di-snapshot? | Definisi turunan (bila B3), dan himpunan keberlakuan parameter (bila C2) | Mengikuti preseden `JobCalibrationTestPoint` |
| Job historis | **Tidak ada penulisan ulang.** Semua field baru nullable / punya default | — |
| `MeasurementResult` yang ada | **Tetap valid tanpa migrasi data.** `calibrationTestPointId = NULL` tetap Pattern A yang sah | Kunci arsitektur terkunci, Report 02 L9 |
| Job `IN_PROGRESS` | **Titik risiko utama**, lihat di bawah | §1.6 |
| Job `REWORK` | `resumeAfterRework` tidak membuat ulang snapshot; perilaku itu harus dipertahankan untuk snapshot baru apa pun | Report 02 L2 |

### 5.1 Risiko lintas-gap: parameter baru membekukan job yang sedang berjalan

Ini konsekuensi terpenting dari seluruh dokumen, dan ia mengikat ketiga gap sekaligus.

Gap A (A3) menambah parameter. Gap B (B1) menambah parameter. Gap C (C1/C2) menambah parameter. Sementara itu `assertMeasurementsCompleteForSubmit` membaca **katalog live** untuk menentukan apa yang wajib, tetapi **snapshot job** untuk menentukan titik ukurnya (§1.6). Akibatnya setiap penambahan parameter aktif bertipe NUMBER langsung membuat job yang sedang berjalan pada tipe alat itu gagal submit atas sesuatu yang belum ada ketika teknisi memulai.

Report 02 L6 secara sengaja memutuskan **tidak** men-snapshot daftar parameter, dengan alasan yang sah pada waktunya: OPTION 2 mengunci titik ukur, bukan seluruh worksheet. Tetapi keputusan itu diambil **sebelum** completeness menjadi gate submit. Kode hari ini membuat "daftar parameter live" bukan lagi sekadar soal tampilan, melainkan penentu apakah sebuah job dapat diserahkan. Ini pergeseran nyata, dan menyelesaikannya adalah prasyarat bagi ketiga gap — bukan pekerjaan opsional setelahnya.

Dua jalur tersedia, dan pilihan di antaranya adalah keputusan arsitektur yang perlu dikonfirmasi (§9.B.2):

- **Disiplin rollout** — parameter baru hanya diperkenalkan ketika tidak ada job berjalan pada tipe itu, persis seperti urutan wajib backfill-sebelum-seed di Report 02 §12. Nol perubahan model; beban jatuh ke operasi, dan beban itu tumbuh seiring jumlah job berjalan.
- **Snapshot himpunan parameter yang wajib per job** — melengkapi `JobCalibrationTestPoint` dengan himpunan "parameter apa yang wajib bagi job ini", ditulis pada `start()` dalam transaksi yang sama. Menutup celah secara struktural dan kebetulan juga merupakan mekanisme yang dibutuhkan Gap C opsi C2. Konsekuensinya: ia meninjau ulang L6, sehingga memerlukan persetujuan eksplisit, bukan penerapan diam-diam.

---

## 6. Perubahan model minimum

### 6.1 CURRENT MODEL

```
DeviceType
  └── DeviceCalibrationParameter        [katalog live]
        ├── valueType, entryStyle, uom, decimalPlaces, tolerance*
        └── CalibrationTestPoint[]      [katalog live]
              sequence, settingLabel, settingValue, tolerance override

CalibrationJob
  ├── measurementTestPointsSnapshottedAt
  └── JobCalibrationTestPoint[]         [beku saat start()]

MeasurementResult
  ├── (job, parameter, testPoint?, replicateIndex, attemptNumber, direction)  ← natural key
  ├── entryKind: DIRECT_READING | LOGGER_SUMMARY
  ├── measuredValue | measuredBool | measuredText | referenceValue | uomId
  ├── effectiveToleranceMin/Max, appliedNominalValue   [snapshot saat tulis]
  └── attachmentFileObjectId
```

### 6.2 TARGET MODEL

Perubahan ditandai `[+]`. Segala sesuatu yang tidak ditandai **tidak berubah**.

```
DeviceType
  └── DeviceCalibrationParameter
        ├── valueType, entryStyle, uom, decimalPlaces, tolerance*   [tetap]
        ├── [+] logicalTestKey      String?   ── Gap A: parameter dgn kunci sama dicetak satu baris LK
        ├── [+] logicalTestSequence Int?      ── Gap A: urutan kolom dalam baris itu
        ├── [+] derivation          Json?     ── Gap B: deskriptif; jenis + parameter masukan. TANPA evaluator di v1
        ├── [+] toleranceSource     enum?     ── Gap C: CATALOG (default) | SUPPLIED_PER_RUN
        └── CalibrationTestPoint[]            [tetap, tanpa perubahan]

CalibrationJob
  ├── measurementTestPointsSnapshottedAt      [tetap]
  ├── JobCalibrationTestPoint[]               [tetap, tanpa perubahan]
  └── [+] JobApplicableParameter[]            ── Gap C (C2) + mitigasi §5.1; hanya jika §9.B.2 memilih snapshot

MeasurementResult
  ├── natural key                             [TIDAK BERUBAH]
  ├── entryKind: DIRECT_READING | LOGGER_SUMMARY | [+] DERIVED
  ├── measuredValue | measuredBool | measuredText | referenceValue | uomId   [tetap]
  ├── effectiveToleranceMin/Max, appliedNominalValue   [tetap — kini juga menampung bounds yang dipasok]
  └── attachmentFileObjectId                  [tetap — bukti sertifikat kontrol]
```

### 6.3 Pembenaran per perubahan

| Perubahan | Mengapa diperlukan | Masalah yang diselesaikan | Dampak data historis | Implikasi migrasi | Baris lama tetap valid? |
|---|---|---|---|---|---|
| `logicalTestKey`, `logicalTestSequence` di parameter | LK mencetak beberapa besaran sebagai satu baris; tanpa ini penyatuannya hanya bisa ditebak | Gap A penyajian | Nol | Dua kolom nullable, tanpa backfill | Ya — NULL = parameter berdiri sendiri |
| `entryKind = DERIVED` | Membedakan nilai turunan yang diketik teknisi dari bacaan standar; tanpa ini keduanya tidak terbedakan di LK maupun review | Gap B penandaan | Nol | Perluasan enum satu nilai; default kolom sudah `DIRECT_READING` | Ya |
| `derivation` di parameter | Menyatakan asal-usul nilai turunan secara eksplisit sebagai dokumentasi terstruktur, tanpa mengeksekusinya | Gap B provenance | Nol | Satu kolom nullable | Ya |
| `toleranceSource` di parameter | Rantai toleransi hari ini tidak punya jalur untuk bounds dari sertifikat kontrol UUT | Gap C toleransi | Nol | Satu kolom nullable/berdefault | Ya |
| `JobApplicableParameter` | Daftar analyte berlaku berbeda per unit; dan §5.1 memerlukan himpunan wajib yang beku per job | Gap C lingkup + risiko completeness | Nol pada data pengukuran | Tabel baru; ketiadaan baris = perilaku live sekarang | Ya |

**Yang secara sengaja TIDAK diubah:** natural key `MeasurementResult`, `CalibrationTestPoint`, `JobCalibrationTestPoint`, `replicateIndex`, `direction`, `referenceValue`, `entryStyle`, `valueType`, dan keempat tingkat `resolveEffectiveTolerance`. Tidak ada penulisan ulang `MeasurementResult`. Tidak ada inferensi dari `replicateIndex`. `calibrationTestPointId = NULL` tetap Pattern A yang sah.

---

## 7. Dampak hilir

### 7.1 Yang akhirnya perlu berubah

| Area | Perubahan |
|---|---|
| Prisma/schema | Empat kolom nullable di `DeviceCalibrationParameter`; satu nilai enum `MeasurementEntryKind`; satu tabel baru bila §9.B.2 memilih snapshot |
| Migrasi | DDL saja. **Tanpa** rewrite `MeasurementResult`. Bila `JobApplicableParameter` disetujui, backfill job berjalan mengikuti pola `backfill-job-calibration-test-points.ts` — dan urutannya wajib: backfill sebelum parameter baru apa pun diaktifkan |
| Services | `measurement-results.service.ts`: terima `entryKind = DERIVED`; terima bounds yang dipasok untuk parameter `SUPPLIED_PER_RUN` dan snapshot seperti biasa. `measurement-tolerance.ts`: satu sumber tambahan di puncak rantai. `calibration-jobs.service.ts`: `listMeasurementParameters` mengembalikan metadata grup dan turunan; `assertMeasurementsCompleteForSubmit` bersumber pada himpunan keberlakuan |
| Controllers/endpoints | Tidak ada endpoint baru untuk Gap A dan B. Gap C memerlukan pengelolaan keberlakuan per job |
| DTO | `packages/shared/src/schemas/index.ts`: `measurementResultCreateSchema` menerima `DERIVED` dan bounds yang dipasok; `measurementResultUpdateSchema` tidak berubah |
| Query hooks | `use-measurement-results-query.ts` (Portal), lapisan fetch Tech-PWA — mengikuti bentuk respons, bukan perubahan struktural |
| Portal | Form parameter: pengelompokan logical test, penandaan turunan, pilihan sumber toleransi. Terpisah dari — dan sebaiknya **sesudah** — CRUD `CalibrationTestPoint` yang memicu audit ini |
| Tech-PWA | Menampilkan baris turunan berbeda dari bacaan standar; input bounds + lampiran untuk parameter `SUPPLIED_PER_RUN`. **Tidak** perlu perombakan renderer: baris turunan tetap Pattern A |
| Measurement completeness | Perubahan paling sensitif. Parameter turunan menjadi wajib; parameter yang tidak berlaku tidak boleh wajib. Butuh tes eksplisit untuk kedua arah |
| LK/PDF | `buildCapabilitySections` menyatukan parameter satu grup menjadi satu baris. Layout template BSM **tidak** disentuh (kunci L11 tetap berlaku) |
| Tests | `measurement-completeness.test.ts`, `measurement-results.service.test.ts`, `measurement-tolerance.test.ts`, `calibration-jobs.service.test.ts`, `lk-measurement-mapping.test.ts` |

### 7.2 Yang harus tetap tidak berubah

Natural key `MeasurementResult`; `CalibrationTestPoint`; `JobCalibrationTestPoint` sebagai mekanisme snapshot titik ukur; `replicateIndex` dinamis; semantik `direction`; semantik `referenceValue`; `entryStyle`; `valueType`; empat tingkat rantai toleransi yang sudah ada; layout template LK BSM; hasil historis `calibrationTestPointId = NULL`; `resumeAfterRework` yang tidak membuat ulang snapshot; auth/RBAC/FCM/WO/quotation.

---

## 8. Decision Matrix

### Gap A — beberapa besaran terukur

| | |
|---|---|
| **Kemampuan saat ini** | Satu `measuredValue` + satu `uomId` per baris; `referenceValue` untuk pasangan standar/UUT pada besaran yang sama |
| **Batasan aktual** | Tidak ada tempat untuk besaran kedua yang berbeda satuan dan berbeda toleransi dalam satu baris |
| **Opsi A1** | Pecah menjadi parameter terpisah. Nol perubahan schema; mengikuti preseden `_KANAN/_KIRI` dan `_ON/_OFF`. Penyatuan baris LK bersandar pada tebakan |
| **Opsi A2** | Entitas kuantitas anak + dimensi baru di natural key. Model paling murni; mengubah unique key dan seluruh permukaan baca |
| **Opsi A3** | A1 + metadata pengelompokan di katalog. Penyajian terselesaikan secara deterministik; korelasi per-eksposur bersandar pada konvensi `replicateIndex` |
| **Trade-off** | A1 menukar determinisme penyajian dengan nol biaya; A2 menukar biaya besar dengan jaminan korelasi; A3 mengambil determinisme penyajian dengan biaya dua kolom nullable, tanpa jaminan korelasi |
| **Dampak historis** | A1 dan A3: nol. A2: baris lama tetap valid, tetapi setiap pembaca berubah |
| **Implikasi implementasi** | A1/A3 tidak menyentuh jalur tulis. A2 menyentuh jalur tulis, baca, completeness, dan LK |
| **Rekomendasi** | **A3**, dengan §9.B.1 terbuka: bila korelasi per-eksposur harus dijamin secara evidensial, A2 yang berlaku |

### Gap B — nilai turunan / agregat

| | |
|---|---|
| **Kemampuan saat ini** | Sebagian sudah jadi parameter biasa (`ACLV_CHAMBER_TEMP_DT*`, `MICRO_MAG_*`); nilainya diketik manual, seperti praktik lapangan |
| **Batasan aktual** | Tidak ada penanda turunan, tidak ada provenance, tidak ada perhitungan |
| **Opsi B1** | Parameter biasa + `entryKind = DERIVED` + metadata deskriptif. Menyelaraskan model dengan praktik yang terbukti di workbook resmi. Aritmetika tetap manual |
| **Opsi B2** | Mesin formula penuh + versioning + snapshot. Konsisten dan otomatis. Mengkodekan rumus — termasuk yang cacat — dan menuntut infrastruktur versioning |
| **Opsi B3** | Operasi tertutup, dihitung otomatis, override manual ditandai. Otomasi tanpa bahasa formula. Tetap mengkodekan rumus |
| **Trade-off** | B1 menerima aritmetika manual dan menghindari otomasi rumus yang belum dikonfirmasi; B2/B3 menghilangkan aritmetika manual dengan syarat setiap rumus benar dan terkonfirmasi |
| **Dampak historis** | B1: nol. B2/B3: nol pada baris lama, tetapi menuntut snapshot definisi agar verdict lama tidak ditulis ulang |
| **Implikasi implementasi** | B1 satu nilai enum + satu kolom. B3 menambah evaluator, snapshot per job, dan interaksi dengan attempt lock |
| **Rekomendasi** | **B1 sekarang; B3 berikutnya**, dengan prasyarat setiap rumus dikonfirmasi lebih dulu (§9.B.3) |

### Gap C — parameter yang ditentukan teknisi

| | |
|---|---|
| **Kemampuan saat ini** | Katalog statis per DeviceType; `deviceCalibrationParameterId` wajib; toleransi hanya dari katalog |
| **Batasan aktual** | Daftar analyte berbeda per unit dan bisa memuat analyte yang belum ada di katalog; toleransi dari sertifikat kontrol tidak punya jalur masuk |
| **Opsi C1** | Perluas katalog DeviceType lewat Portal. Nol konsep baru; menghalangi pekerjaan lapangan saat analyte tak dikenal ditemukan |
| **Opsi C2** | Keberlakuan per job atas katalog yang diatur. FK wajib utuh; completeness menjadi benar per unit; belum menjawab analyte yang belum pernah ada |
| **Opsi C3** | Parameter usulan bercakupan job + persetujuan. Menjawab kasus lapangan sepenuhnya; menciptakan pengukuran terhadap definisi yang belum disetujui dan menuntut alur persetujuan, RBAC, serta aturan PDF |
| **Trade-off** | C1 menukar keluwesan lapangan dengan kontrol penuh; C2 memperoleh ketepatan per unit dengan biaya satu tabel; C3 memperoleh keluwesan lapangan dengan biaya tata kelola |
| **Dampak historis** | Ketiganya nol terhadap `MeasurementResult` yang ada |
| **Implikasi implementasi** | C1 hanya Portal. C2 tabel + completeness + Portal. C3 tambahan alur persetujuan, RBAC, dan perilaku PDF untuk parameter belum disetujui |
| **Rekomendasi** | **C2 sebagai fondasi**, ditambah toleransi yang dipasok per-run. C3 menunggu §9.B.5 |

---

## 9. Konfirmasi bisnis

### A. Keputusan yang didukung Report 07 + kode saat ini

Boleh dianggap sebagai keputusan arsitektur, bukan asumsi:

1. `CalibrationTestPoint` tetap, tanpa perubahan, untuk ketiga gap.
2. Natural key `MeasurementResult` tetap; tidak ada dimensi baru.
3. `replicateIndex` tetap dinamis; `expectedReplicateCount` tetap tidak diperkenalkan — tidak ada satu pun LK yang menuntut jumlah tetap (Report 07 §7).
4. Hasil historis `calibrationTestPointId = NULL` tetap valid sebagai Pattern A; tidak ada backfill, tidak ada inferensi dari `replicateIndex`.
5. Nilai turunan diketik teknisi hari ini — terkonfirmasi dari workbook resmi, bukan diasumsikan (Report 07 §6.4b).
6. `referenceValue` bukan mekanisme untuk Gap A.
7. Semua field yang diusulkan nullable atau berdefault; tidak ada `MeasurementResult` yang perlu ditulis ulang.
8. Layout template LK BSM dan `submitForReview` di luar cakupan perubahan struktural ini (kunci L11 Report 02).

### B. Keputusan yang memerlukan konfirmasi pemilik bisnis/domain

1. **Korelasi per-eksposur (Gap A).** Apakah bukti kalibrasi harus dapat membuktikan bahwa `kV`, `s`, dan `mGy` tertentu berasal dari satu eksposur yang sama? Jika ya, A3 tidak cukup dan A2 yang berlaku.
2. **Snapshot himpunan parameter wajib per job (§5.1).** Menutup celah "parameter baru membekukan job berjalan" secara struktural, tetapi meninjau ulang keputusan L6 Report 02. Alternatifnya adalah disiplin rollout permanen. Ini prasyarat ketiga gap, bukan pekerjaan lanjutan.
3. **Rumus ΔT3 Autoclave (Report 07 §6.4b).** `ΔT2` dan `ΔT3` tercetak identik `S1 – S3` dengan toleransi berbeda. **Tidak dikoreksi dan tidak ditebak di dokumen ini.** Otomasi turunan apa pun untuk Autoclave terhalang sampai ini dijawab pemilik LK.
4. **Klasifikasi `K factor` BSC.** Turunan, atau nilai referensi yang dibaca dari template pabrikan? Bukti LK tidak menentukan.
5. **Parameter belum disetujui (Gap C).** Bolehkah teknisi mencatat pengukuran terhadap parameter yang belum pernah disetujui? "Tidak" menutup desain pada C2. "Ya" mengharuskan C3 beserta alur persetujuan, RBAC, dan aturan PDF-nya.
6. **Lingkup daftar analyte.** DeviceType sebagai superset, atau benar-benar per unit? Jawaban per-unit menghadapi kenyataan bahwa `deviceId` sering null saat pengukuran.
7. **Kewajiban parameter turunan.** Setelah menjadi parameter, nilai turunan ikut menjadi syarat submit. Apakah itu yang diinginkan, atau turunan bersifat opsional?

### C. Asumsi yang TIDAK BOLEH diimplementasikan tanpa konfirmasi

1. Bahwa `ΔT3` sebenarnya `S2 – S3`, atau koreksi lain atas rumus LK mana pun.
2. Bahwa `Titik Ukur M` pada Phototherapy adalah rata-rata. Report 07 §6.4a membuktikan sebaliknya dari data lapangan; setiap perhitungan yang memperlakukannya sebagai agregat salah.
3. Bahwa nilai turunan boleh dihitung otomatis dan menimpa angka yang diketik teknisi.
4. Bahwa teknisi boleh membuat parameter bebas tanpa tata kelola.
5. Bahwa `replicateIndex` membawa makna semantik apa pun selain "bacaan ke-n".
6. Bahwa parameter baru aman diaktifkan pada tipe alat yang punya job berjalan — §1.6 membuktikan sebaliknya.
7. Bahwa `K factor` adalah nilai turunan.

---

## 10. Urutan implementasi (setelah persetujuan arsitektur)

Urutannya menyimpang dari contoh generik di brief pada satu titik penting: **langkah 0 mendahului segalanya.** Selama celah §5.1 terbuka, setiap langkah yang menambah parameter berisiko membekukan job yang sedang berjalan — jadi mitigasi itu tidak bisa diletakkan di akhir.

**0. Selesaikan §9.B.2 — perilaku parameter wajib pada job berjalan.**
Memilih snapshot maupun disiplin rollout, keputusan ini harus diambil sebelum satu parameter pun ditambahkan. Bila memilih snapshot: schema + migrasi + backfill job berjalan, dan verifikasi bahwa job berjalan tidak berubah kewajibannya — mengikuti urutan wajib yang sama dengan Report 02 §12.

**1. Schema/domain model.** Empat kolom nullable di `DeviceCalibrationParameter`; `entryKind = DERIVED`; `JobApplicableParameter` bila disetujui.

**2. Migrasi.** DDL saja. Tanpa rewrite `MeasurementResult`. Backfill hanya untuk tabel keberlakuan, idempoten, mengikuti pola `backfill-job-calibration-test-points.ts`.

**3. Domain services.** Sumber toleransi yang dipasok di puncak `resolveEffectiveTolerance`; penerimaan `DERIVED` di jalur tulis; `listMeasurementParameters` mengembalikan metadata grup dan turunan.

**4. Measurement completeness.** Didahulukan dari API/UI karena ia gate submit dan paling mudah menimbulkan regresi senyap. Tes untuk kedua arah: turunan yang wajib, dan parameter tidak berlaku yang tidak boleh wajib.

**5. API/DTO.** Perluasan skema zod di `packages/shared`; endpoint keberlakuan bila C2 disetujui.

**6. Query hooks.** Portal dan Tech-PWA mengikuti bentuk respons.

**7. Portal.** Pengelompokan logical test, penandaan turunan, sumber toleransi, pengelolaan keberlakuan. Sesudah CRUD `CalibrationTestPoint`, bukan sebelumnya — CRUD itulah pemicu audit ini dan ia berdiri sendiri.

**8. Tech-PWA.** Penyajian baris turunan; input bounds + lampiran untuk `SUPPLIED_PER_RUN`.

**9. LK/PDF.** `buildCapabilitySections` menyatukan parameter satu grup. Layout BSM tidak disentuh.

**10. E2E/regresi.** Fokus pada yang tidak boleh berubah: job historis, `calibrationTestPointId = NULL`, job `IN_PROGRESS`, `REWORK` yang tidak membuat ulang snapshot, dan seluruh tes pengukuran yang sudah ada.

B3 (turunan otomatis) **tidak** masuk urutan ini. Ia menunggu §9.B.3 dan §9.B.4 terjawab, dan bila disetujui ia menjadi fase tersendiri dengan snapshot definisi turunan per job sejak awal.

---

## 11. Non-changes

Dokumen ini adalah desain. Tidak ada Prisma schema, migrasi, API, service, hooks, Portal, Tech-PWA, PDF, atau seed yang dimodifikasi; tidak ada data yang diubah; tidak ada commit yang dibuat. Seluruh pernyataan tentang kode berasal dari pembacaan read-only atas berkas yang disebut di §1 dan §7.

**BERHENTI — menunggu persetujuan arsitektur.**
