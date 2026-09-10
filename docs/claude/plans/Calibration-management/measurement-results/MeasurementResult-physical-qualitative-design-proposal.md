# MeasurementResult — Physical / Qualitative Semantics: Design Proposal

**Date:** 2026-09-10
**Stage:** 1 — **PROPOSE ONLY**. Tidak ada perubahan schema, enum, migration, API, UI, seed, atau test.
**Input:** `MeasurementResult_LK_Semantics_Audit.md` (2026-09-10, 50/50 LK dibaca) — diterima apa adanya, tidak di-reinvestigasi.
**Keputusan:** milik Afriza, per item. Dokumen ini hanya menyusun opsi + trade-off + rekomendasi.

---

## 0. Baseline sistem (diverifikasi dari kode, bukan asumsi)

Semua fakta di bawah dibaca langsung dari repo hari ini:

| Fakta                                                                                                                                                                                                                                               | Lokasi                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CalibrationValueType = NUMBER \| RATIO \| TEXT \| BOOLEAN`                                                                                                                                                                                         | [schema.prisma:368](packages/db/prisma/schema.prisma#L368)                                                                                                                          |
| `MeasurementDirection = NONE \| UP \| DOWN` (komentar: `UP // naik`)                                                                                                                                                                                | [schema.prisma:391](packages/db/prisma/schema.prisma#L391)                                                                                                                          |
| `MeasurementEntryKind = DIRECT_READING \| LOGGER_SUMMARY`                                                                                                                                                                                           | [schema.prisma:401](packages/db/prisma/schema.prisma#L401)                                                                                                                          |
| `DeviceCalibrationParameter` — `code/name/description/valueType/uomId/toleranceMin/Max/toleranceNote/decimalPlaces/sortOrder/isActive/entryStyle`, unique `(deviceTypeId, capabilityItemId, code)`                                                  | [schema.prisma:1312](packages/db/prisma/schema.prisma#L1312)                                                                                                                        |
| `MeasurementResult` — `measuredValue / referenceValue / measuredBool / measuredText / appliedNominalValue / effectiveToleranceMin/Max / isWithinTolerance / direction / replicateIndex / attemptNumber / entryKind / attachmentFileObjectId / note` | [schema.prisma:1999](packages/db/prisma/schema.prisma#L1999)                                                                                                                        |
| Engine: `BOOLEAN → isWithinTolerance = measuredBool`; `TEXT → null`; NUMBER/RATIO dibandingkan **inklusif** (`lessThan(min)` / `greaterThan(max)`)                                                                                                  | [measurement-tolerance.ts:235](apps/api/src/modules/calibration-jobs/measurement-tolerance.ts#L235)                                                                                 |
| UI chip: `true → "Sesuai"`, `false → "Tidak sesuai"`, `null → "Perlu telaah"`                                                                                                                                                                       | [measurement.ts:306-312](apps/tech-pwa/src/lib/calibration/measurement.ts#L306-L312)                                                                                                |
| Entry UI **hanya** mengetik angka; grid dipakai bila `testPoints.length > 0`, selain itu vertical                                                                                                                                                   | [page.tsx:151](apps/tech-pwa/src/app/jobs/[id]/measurements/[parameterId]/page.tsx#L151), [measurement-grid.tsx](apps/tech-pwa/src/app/jobs/[id]/measurements/measurement-grid.tsx) |
| `usesDirection()` hard-coded ke satu kode: `SPHYG_PRESSURE_ACC`                                                                                                                                                                                     | [measurement.ts:171](apps/tech-pwa/src/lib/calibration/measurement.ts#L171)                                                                                                         |
| Katalog: **27 DeviceType** ter-seed, **24** punya `*_EQUIP_LEAKAGE`                                                                                                                                                                                 | [seed-device-calibration-parameters.ts](packages/db/prisma/seed-device-calibration-parameters.ts)                                                                                   |
| Lingkungan ter-seed sebagai **satu** parameter per besaran: `*_ROOM_TEMP`, `*_ROOM_HUMIDITY`, `*_INPUT_VOLTAGE` — tidak ada Awal/Akhir                                                                                                              | idem, baris 117–136                                                                                                                                                                 |
| Dual-class leakage (`LEAK_CLASS`, note `Kelas I ≤ 500 µA / Kelas II ≤ 100 µA`, tersimpan `toleranceMax = 500`) dipakai **4 DeviceType**                                                                                                             | [backfill-…-tolerances.ts:80](packages/db/prisma/backfill-device-calibration-parameter-tolerances.ts#L80)                                                                           |
| **Tidak ada** entitas apa pun untuk pemeriksaan fisik Baik/Tidak Baik                                                                                                                                                                               | grep katalog: nihil                                                                                                                                                                 |

Konsekuensi yang perlu dipegang selama membaca proposal ini: **`isWithinTolerance` hari ini berarti "angka ini di dalam batas terhitung"** — bukan verdict LK. Setiap opsi yang menaruh Baik/Tidak Baik atau Pass/Fail ke kolom yang sama akan mengubah arti kolom itu secara retroaktif untuk baris yang sudah ada di production.

---

## 1. Physical condition checklist (audit §6, §3 baris "Pemerikasaan Kondisi Fisik…", §12.1–§12.2)

### Kutipan audit

> "Struktur tetap: No. | Parameter | Batas Pemeriksaan | Keterangan (Baik / Tidak Baik)." (§6)
> "**Batas Pemeriksaan** adalah instruksi visual/fungsi (bersih, tidak longgar, isolasi tidak terkelupas, tampilan berfungsi), **bukan** toleransi angka." (§6)
> "Ada di **49/50** (tidak di Kelistrikan). 3–9 item per alat" (§3)
> "Pemeriksaan fisik Baik / Tidak Baik … **Current system does not support it** sebagai MeasurementResult/catalog item." (§9)
> "**Pemeriksaan fisik** adalah katalog item per jenis alat + ENUM Baik/Tidak Baik; itu **bukan** DeviceCalibrationParameter kinerja yang ada sekarang." (§13)

Skala: 49 LK × 3–9 item ⇒ perkiraan **150–450 baris katalog** baru, dan **3–9 baris hasil per job**.

### Opsi

**Opsi 1A — Katalog terpisah + tabel hasil terpisah**
`DevicePhysicalCheckItem { deviceTypeId, code, name, inspectionLimit (prosa "Batas Pemeriksaan"), sortOrder, isActive }` + `PhysicalCheckResult { calibrationJobId, itemId, attemptNumber, verdict: PhysicalCondition (BAIK|TIDAK_BAIK), note, recordedBy… }`.

- **+** Semantik LK terjaga persis: kolom hasilnya `verdict`, bukan `isWithinTolerance`. Baris fisik tidak ikut terhitung dalam ringkasan `n/total diisi` dan `anyFail` milik pengukuran angka ([`parameterEntryStatus`](apps/tech-pwa/src/lib/calibration/measurement.ts#L320)).
- **+** `MeasurementResult` mempertahankan invariant-nya: setiap baris punya parameter kinerja/listrik/lingkungan. Tidak perlu melonggarkan `deviceCalibrationParameterId`, yang hari ini REQUIRED FK dan dikomentari schema sebagai "closes the long-standing F2 gap".
- **+** "Batas Pemeriksaan" dapat rumah yang jujur (`inspectionLimit`, prosa) alih-alih menumpang `toleranceNote` — kolom yang dibaca `parseToleranceNote()` sebagai kandidat aturan angka.
- **−** Entitas + endpoint + layar entry baru. Biaya terbesar dari tiga opsi.
- **−** QualityReview nanti membaca dua sumber (angka + fisik). Tapi itu memang kenyataan LK.

**Opsi 1B — Extend `DeviceCalibrationParameter` dengan `valueType = ENUM_CHOICE`, hasil tetap di `MeasurementResult`**
Tambah nilai enum `ENUM_CHOICE` + entitas pilihan (`CalibrationParameterChoice`) atau kolom `choiceSetCode`; hasil disimpan di `measuredText` atau kolom `measuredChoice` baru.

- **+** Reuse penuh: job scoping, `attemptNumber`, REWORK, lock status, audit trail, endpoint batch — semuanya sudah jalan.
- **+** Satu layar "Hasil Pengukuran" menampilkan seluruh isi LK berurutan lewat `sortOrder` yang sudah ada.
- **−** `DeviceCalibrationParameter` mensyaratkan `capabilityItemId`; 40+ item fisik (§6: Badan/Permukaan, Kabel catu utama, Sekering Pengaman, Roda dan pengunci, …) harus dipaksa menjadi `DeviceCapabilityItem`, padahal LK tidak memperlakukannya sebagai kapabilitas kalibrasi.
- **−** `isWithinTolerance` untuk baris ini harus **NULL** agar tidak berbohong — tetapi UI merender NULL sebagai **"Perlu telaah"**, yang salah untuk item yang sudah tegas dijawab "Baik". Bila sebaliknya diisi `true/false`, kita baru saja mengunci **Baik = Sesuai**, yang audit §11 daftarkan sebagai belum diputuskan: "Equivalence **Baik** = Pass = Sesuai = laik."
- **−** `uomId`, `decimalPlaces`, `replicateIndex`, `direction`, `entryStyle` semuanya tidak berlaku ⇒ baris dengan mayoritas kolom mati.

**Opsi 1C — Katalog terpisah, hasil menumpang `MeasurementResult`** (hybrid)

- **+** Katalog jujur; lifecycle hasil ter-reuse.
- **−** Memaksa `deviceCalibrationParameterId` menjadi nullable ⇒ melemahkan invariant terkuat tabel itu dan menciptakan XOR-constraint yang dijaga manual. Untung reuse-nya tidak sepadan.

### Rekomendasi: **Opsi 1A**

Alasan dari audit, bukan generik:

1. §13 sudah menyimpulkan bentuknya: "katalog item per jenis alat + ENUM Baik/Tidak Baik; itu **bukan** DeviceCalibrationParameter kinerja".
2. Kolom pembanding keduanya berbeda jenis: kinerja punya **Toleransi angka**, fisik punya **Batas Pemeriksaan prosa** (§6). Satu kolom `toleranceNote` untuk keduanya berarti memberi makan parser tolerance dengan kalimat instruksi.
3. §11 belum mengunci `Baik = Sesuai`. Tabel terpisah adalah satu-satunya bentuk yang **tidak memaksa** keputusan itu sekarang; 1B memaksanya di hari pertama — lewat `isWithinTolerance` true/false, atau lewat chip "Perlu telaah" yang keliru.
4. Bagian Kelistrikan (1 LK) **tidak punya** bagian fisik sama sekali (§6) — kardinalitas "0 item" natural di tabel terpisah.

### Yang harus dikunci Afriza sebelum Stage 2

- Nama entitas, dan apakah item fisik dibagikan lintas DeviceType. §6 menunjukkan nama berulang dengan variasi ejaan (`Kotak kontak alat / Kotak Kontak Alat / Tusuk kontak alat`) ⇒ master global + join per DeviceType, atau duplikat per DeviceType?
- Apakah "Tidak Baik" mewajibkan `note`. LK tidak mewajibkan (§11).

---

## 2. Wording "Sesuai / Tidak sesuai" (audit §2, §9 baris "Label hasil ukur", §13)

### Kutipan audit

> "LK **tidak** memakai **'Sesuai / Tidak Sesuai'** sebagai label hasil ukur. 'Sesuai' hanya muncul di prosa instruksi." (§2)
> "**Current system supports it** sebagai mapping UI dari `isWithinTolerance`. **Mismatch wording.**" (§9)
> "`isWithinTolerance` + chip Sesuai/Tidak sesuai menutupi **satu** kelas LK (angka vs toleransi) dengan **label yang bukan milik LK**." (§13)

### Fakta sistem

Label hidup di satu fungsi saja — [`passFailChip()`](apps/tech-pwa/src/lib/calibration/measurement.ts#L306). Mengganti teksnya adalah perubahan satu tempat; **tidak ada data tersimpan** yang memuat kata itu.

### Opsi

**Opsi 2A — Pertahankan sebagai istilah sistem yang sengaja berbeda dari LK.**

- **+** Sudah live; nol risiko regresi; teknisi sudah terbiasa.
- **+** Jujur secara teknis: yang dievaluasi memang _angka vs batas_, dan LK memang tidak punya kata untuk itu — sel angka LK tidak punya kolom verdict sama sekali (§2, §4.1). Sistem menambahkan informasi yang LK tidak punya; itu fitur, bukan salah terjemahan.
- **−** Bila item fisik (Baik/Tidak Baik) dan HEPA (Pass/Fail) kelak tampil di layar yang sama, satu layar akan memuat tiga kosakata verdict, dan "Sesuai" adalah satu-satunya yang tidak berasal dari LK.

**Opsi 2B — Ganti ke wording yang menyebut batas, bukan verdict.**
`true → "Dalam toleransi"`, `false → "Di luar toleransi"`, `null → "Perlu telaah"` (atau "Tanpa batas terhitung").

- **+** Menyatakan persis apa yang engine hitung, dan **tidak** mengklaim mewakili Baik / Pass / laik — jadi tidak mendahului §11 ("Equivalence Baik = Pass = Sesuai = laik" belum diputuskan).
- **+** Aman berdampingan dengan chip fisik dan HEPA: tiga label, tiga arti, tidak ada yang menyamar sebagai kesimpulan kelaikan alat.
- **−** Perubahan istilah pada UI yang sudah live ⇒ perlu pemberitahuan ke teknisi; materi pelatihan/screenshot lama jadi usang.
- **−** Sedikit lebih panjang untuk chip di layar HP.

**Opsi 2C — Satu kata baru yang mengklaim semua kelas** (mis. semua jadi "Baik/Tidak Baik").

- **−** Persis yang audit larang: §2 mencatat Baik/Tidak Baik adalah wording **fisik dan Telaah**, bukan sel angka. **Tidak direkomendasikan.**

### Rekomendasi: **Opsi 2B**, dengan biaya diakui

Masalahnya bukan "terjemahan kurang tepat", melainkan **istilah yang berbunyi seperti kesimpulan kelaikan**. "Sesuai" bermuatan verdict dalam konteks LK; "Dalam toleransi" tidak. Karena Telaah dan kesimpulan laik akan menyusul di giliran QualityReview, memisahkan kosakatanya sekarang mencegah teknisi/QA membaca chip pengukuran sebagai kesimpulan alat.

Bila Afriza menilai biaya perubahan istilah pada UI live lebih besar dari manfaatnya, **Opsi 2A tetap defensible** — asalkan keputusannya ditulis eksplisit sebagai "istilah sistem, bukan wording LK", supaya audit berikutnya tidak melaporkannya lagi sebagai gap.

Yang **tidak** boleh dalam skenario mana pun: satu label yang sama dipakai untuk angka, fisik, dan HEPA sekaligus.

---

## 3. HEPA Pass/Fail exposure (audit §5.4, §3 baris "BSC Hepa / Ulpa Filter", §9)

### Kutipan audit

> "Hanya: **Pengukuran Kebocoran Hepa / Ulpa Filter** → `Seluruh hepa` → **`Pass /  Fail`**. Note: foto titik bocor." (§5.4)
> "**LK explicitly requires it** (hanya BSC HEPA). **Current system partially supports it**: backend `measuredBool` + `isWithinTolerance = measuredBool`; Tech-PWA **tidak** menampilkan BOOLEAN." (§9)
> "HEPA Pass/Fail | BSC | **Tunggal** (`Seluruh hepa`)" (§8)

### Fakta sistem

Backend sudah lengkap: `measuredBool` ada, engine mengembalikannya apa adanya sebagai `isWithinTolerance` ([measurement-tolerance.ts:237](apps/api/src/modules/calibration-jobs/measurement-tolerance.ts#L237)), service menerimanya di `create` dan `update`. Yang hilang **hanya UI** — layar entry hanya bisa mengetik angka. Skala: 1 baris LK, 1 DeviceType, tanpa test point, tanpa replicate.

### Opsi

**Opsi 3A — Varian sederhana dari layar vertical: satu baris, dua tombol pilihan.**
Bila `param.valueType === "BOOLEAN"`, render segmented button alih-alih input angka; kirim `measuredBool`, `replicateIndex = 1`, `direction = NONE`.

- **+** Perubahan terkecil yang benar; tidak menyentuh grid.
- **+** Cocok dengan kardinalitas LK (§8: tunggal).
- **−** Helper kelengkapan yang hari ini hanya melihat `measuredValue` perlu penyesuaian kecil.

**Opsi 3B — Tunda sampai BSC benar-benar dikalibrasi.**

- **+** Nol biaya sekarang.
- **−** Backend sudah mendukung penuh; membiarkan kolom terisi tanpa jalan masuk membuat gap tersembunyi, bukan hilang.

### Label tampilan

Ikuti LK **persis**: **"Pass" / "Fail"**. Alasannya langsung dari §5.4 — ini satu-satunya tempat di seluruh corpus di mana LK **mencetak sendiri** pilihan verdict-nya. Menerjemahkannya ke "Sesuai/Tidak sesuai" berarti menimpa wording yang LK sudah tentukan. Konsisten dengan §2 opsi 2B: chip berbasis toleransi bicara soal batas; chip HEPA bicara Pass/Fail karena LK bilang begitu.

Catatan untuk Stage 2 (bukan sekarang): karena `isWithinTolerance = measuredBool`, baris HEPA akan ikut terhitung dalam `anyFail` ringkasan job. Perlu diputuskan apakah itu diinginkan.

### Rekomendasi: **Opsi 3A + label Pass/Fail**

Dikerjakan satu gelombang dengan §4 dan §7, karena ketiganya menambah varian entry non-numerik pada layar yang sama.

---

## 4. Smoke test BSC (audit §5.5, §3 baris "Uji pola aliran udara asap")

### Kutipan audit

> "Bukan Baik, bukan Pass/Fail. Prosa + prompt: deteksi adanya turbelensi atau tidak / Masuk kompartemen atau tidak / Keluar kopartemen atau tidak" (§5.5)
> "XML form field rusak; **pilihan eksak (ya/tidak vs checkbox)** tidak bisa dipastikan dari template." (§5.5)
> §11 mendaftarkannya sebagai **NOT defined by LK**: "Isi pasti smoke test (ya/tidak vs narasi)."

### Opsi

**Opsi 4A — `TEXT` bebas, `isWithinTolerance` NULL.**

- **+** Tidak menciptakan struktur yang LK tidak nyatakan. §5.5 secara harfiah menyebut bentuk isiannya **tidak dapat dipastikan** — memilih enum sekarang berarti menebak.
- **+** Nol perubahan backend: `measuredText` ada, engine sudah `TEXT → null`.
- **+** Arah migrasi aman: TEXT → ENUM masih mungkin bila bentuk isian sebenarnya kelak diketahui; ENUM salah tebak → TEXT merusak data yang sudah tercatat.
- **−** Tidak dapat diagregasi atau dilaporkan otomatis.
- **−** Chip NULL "Perlu telaah" muncul di baris ini — netral, dan §11 memang menyerahkannya ke penilaian manusia.

**Opsi 4B — BOOLEAN generik (Ya/Tidak).**

- **−** Menabrak §5.5 dua kali. Polaritasnya tidak seragam: "adanya turbelensi" = true adalah **buruk**, sedangkan "Masuk kompartemen" = true adalah **baik**. Karena engine mengartikan `isWithinTolerance = measuredBool`, minimal satu dari tiga prompt akan tercatat terbalik. Memperbaikinya butuh kolom polaritas — struktur yang LK tidak sebut. **Tidak direkomendasikan.**

**Opsi 4C — ENUM dengan wording LK persis** (`Tidak ada turbelensi` / `Ada turbelensi`, dst. per prompt).

- **+** Terstruktur dan tetap berbahasa LK.
- **−** Butuh choice-set per parameter (struktur katalog baru) untuk **satu** DeviceType dan segelintir baris, di atas dasar yang §5.5 sebut tidak dapat dipastikan. Biaya-per-tebakan tertinggi.

### Rekomendasi: **Opsi 4A (TEXT)** sekarang

§5.5 mencatat sumbernya rusak dan ambigu. Satu-satunya pilihan yang tidak mengarang aturan bisnis adalah menyimpan apa yang teknisi tulis. Bila Afriza kelak mengonfirmasi bentuk isian sebenarnya, naikkan ke ENUM (4C) — jangan pernah ke 4B.

Konsekuensi UI (Stage 2): perlu satu varian textarea untuk `valueType = TEXT`, sepaket dengan varian BOOLEAN di §3 dan kasus pH di §7.

---

## 5. Display UUT + Hasil Pengukuran Standar (audit §3, §4.6, §7, §9)

### Kutipan audit

> "**Dua** angka (display + standar) di baris yang sama … Ya, pada standar atau pada keduanya — **tidak selalu jelas**" (§3)
> "`referenceValue` di skema saat ini selaras dengan **pasangan standar vs UUT**. … LK sering menuntut **keduanya** (display + standar) di baris yang sama — itu **dua pembacaan**, bukan satu `measuredValue`." (§7)
> "**Current system partially supports it**: `measuredValue` + `referenceValue` ada; UI entry belum mengekspresikan dua kolom LK." (§9)

Terdampak: BSC, Baby Incubator, Infant Warmer, LAF (§9).

### Fakta sistem

Komentar schema pada `referenceValue` sudah menyebut kasus ini ("Paired reference-standard reading at the same point, when the standard is an independent instrument read alongside the UUT"). Service `create`/`update` sudah menerima `referenceValue`. Engine **tidak pernah** memakainya — evaluasi selalu dari `measuredValue` ("locked project rule", komentar schema:2021).

### Opsi

**Opsi 5A — Dua field yang ada sudah cukup; nol perubahan schema. Sisanya UI + satu konvensi.**

- **+** Tidak ada perubahan schema sama sekali; UI dua kolom memang pekerjaan yang belum ada.
- **−** Menuntut satu keputusan konvensi yang §3 sebut belum jelas di LK. Bukan blocker teknis, tapi harus ditulis.

**Opsi 5B — Dua `MeasurementResult` terpisah (display dan standar).**

- **−** Menabrak §7 langsung: keduanya satu baris LK dengan satu toleransi bersama. Memisahkannya menghasilkan dua verdict untuk satu baris, tanpa cara mengikatnya kembali.
- **−** Menggandakan natural key `(param, testPoint, replicate, direction)` ⇒ butuh diskriminator baru. **Tidak direkomendasikan.**

**Opsi 5C — Kolom katalog baru untuk sasaran toleransi** (`toleranceAppliesTo: MEASURED | REFERENCE | BOTH`).

- **+** Menangkap nuance §3 ("tidak selalu jelas") secara eksplisit alih-alih lewat konvensi tak tertulis.
- **−** Menambah kolom untuk ambiguitas yang **sumbernya sendiri belum terjawab**. Bila jawabannya kelak "selalu standar", kolom ini lahir mati.

### Rekomendasi: **Opsi 5A** — dua field cukup; nuance-nya diselesaikan sebagai konvensi, bukan schema

Konvensi yang saya usulkan: **`measuredValue` = pembacaan alat standar** (angka yang dibandingkan ke toleransi), **`referenceValue` = angka yang ditampilkan UUT**. Alasannya: engine mengevaluasi `measuredValue`, dan pada baris ini yang dipercaya sebagai kebenaran adalah standar, sementara yang dinilai adalah UUT terhadap standar itu.

**Peringatan yang harus Afriza sadari:** konvensi ini membuat nama field terbaca terbalik dari komentar schema-nya sendiri (`referenceValue` dijelaskan sebagai "reference-standard reading", padahal di kasus ini justru berisi display UUT). Alternatifnya — `measuredValue` = display UUT, `referenceValue` = standar — terbaca lebih natural, tetapi membuat engine mengevaluasi **angka display UUT terhadap toleransi absolut**, yang hanya benar bila toleransi memang berlaku ke display. Karena §3 menyebut ini "tidak selalu jelas", **ini keputusan bisnis, bukan teknis**; bila ternyata tidak seragam antar alat, kunci per parameter.

---

## 6. Lingkungan Awal / Akhir (audit §3, §4.1, §8, §9)

### Kutipan audit

> "**Awal** dan **Akhir** angka °C … Dua pembacaan, bukan I–V" (§3)
> "Teknisi menuliskan **Awal** dan **Akhir** untuk suhu dan RH. Tegangan (jika ada) tiga kaki. Toleransi tercetak di kolom kanan. **Tidak** ada ulangan I–V." (§4.1)
> "Lingkungan Awal/Akhir | Semua | Dua, bukan I–V" (§8)
> "**Current system partially supports it**: parameter lingkungan NUMBER ada, **bukan** pasangan Awal/Akhir." (§9)

Skala: **setiap** LK (50/50) ⇒ seluruh 27 DeviceType ter-seed.

### Opsi

**Opsi 6A — `replicateIndex` 1 = Awal, 2 = Akhir.**

- **+** Nol perubahan schema, nol perubahan katalog; natural key sudah unik.
- **+** Cocok dengan bentuk datanya: dua pembacaan besaran yang sama dengan **satu toleransi bersama** (§4.1 — toleransi tercetak satu kolom untuk keduanya).
- **−** `replicateIndex` didokumentasikan sebagai "1-based trial number (LK columns I, II, III…)" — Awal/Akhir bukan trial. Ini pemakaian ganda, walau jauh lebih ringan daripada 6C: keduanya tetap "pembacaan ke-n dari besaran yang sama dengan batas yang sama".
- **−** UI harus tahu memberi header "Awal/Akhir" alih-alih "I/II" ⇒ daftar kode khusus, persis pola `usesDirection()` yang sudah ada dan sudah jadi soft spot.

**Opsi 6B — Dua parameter katalog terpisah (`*_ROOM_TEMP_AWAL` / `*_ROOM_TEMP_AKHIR`).**

- **+** Paling eksplisit; label datang dari katalog, bukan hard-code UI.
- **+** Membuka kemungkinan toleransi berbeda per slot bila kelak dibutuhkan.
- **−** Menggandakan katalog lingkungan: 27 DeviceType × (suhu + RH) ⇒ ~54 baris baru, plus migrasi kode yang sudah ter-seed dan sudah dipakai backfill toleransi (`*_ROOM_TEMP`, `*_ROOM_HUMIDITY`) serta baris hasil yang mungkin sudah ada.
- **−** Dua parameter menunjuk satu `DeviceCapabilityItem` (`ROOM_TEMPERATURE`) — sah menurut unique key `(deviceTypeId, capabilityItemId, code)`, tapi harus diniatkan, bukan efek samping.

**Opsi 6C — Reuse `direction` (UP/DOWN) untuk Awal/Akhir.**

- **−** **Tidak direkomendasikan; saya sarankan ditolak eksplisit.** `direction` berarti arah ramp Naik/Turun (§3, §8: Sphyg, Suction, Phaco, Thermo RH) — sebuah _facet fisik pengukuran_. Awal/Akhir adalah _waktu_. Menyamakannya membuat `MeasurementDirection.UP` bermakna dua hal tergantung parameter, dan setiap query/laporan yang memfilter `direction` harus tahu konteksnya. Enum-nya bahkan sudah berkomentar `UP // naik`.

### Rekomendasi: **Opsi 6A** untuk sekarang, dengan mata terbuka

Bentuk LK-nya (§4.1) adalah "besaran yang sama, dua kali, satu toleransi" — persis semantik replicate, hanya labelnya berbeda. Biaya migrasinya nol dan katalog lingkungan yang sudah ter-seed beserta backfill toleransinya tetap utuh.

Bila Afriza ingin label yang datang dari data alih-alih dari daftar kode di UI, **6B lebih bersih jangka panjang** — tapi jadwalkan bersama migrasi katalog, jangan disisipkan ke gelombang ini.

**Catatan terkait, perlu keputusan sekalian:** **Tegangan Input L-N / L-G / N-G** (§3) adalah **tiga** pembacaan dengan satu toleransi bersama (`220 ± 10% Volt`, satu sel untuk tiga kaki), dan ter-seed hari ini sebagai satu parameter `*_INPUT_VOLTAGE`. Pola 6A meluas natural ke sini (replicate 1/2/3 = L-N/L-G/N-G) dengan keberatan label yang sama.

---

## 7. pH "Status" & toleransi kosong (audit §5.8, §3 baris pH / Otoscope, §11)

### Kutipan audit

> "Kolom **Status** kosong — **tidak** ada Baik, Pass, atau Sesuai tercetak. Tidak bisa disimpulkan dari LK apa yang diisi." (§5.8)
> "Otoscope Intensitas Cahaya … Toleransi sel **`-`** … LK tidak memberi batas" (§3)
> §11 mendaftar keduanya sebagai belum terdefinisi: "Isi kolom **Status** pH." / "Otoscope intensitas dengan toleransi `-`."

### Fakta sistem

- `TEXT → isWithinTolerance = null` sudah jadi perilaku engine ([measurement-tolerance.ts:240](apps/api/src/modules/calibration-jobs/measurement-tolerance.ts#L240)).
- `toleranceMin/Max` NULL **dan** `toleranceNote` tidak terparse ⇒ `effectiveTolerance*` NULL ⇒ `isWithinTolerance` NULL. Helper `toleranceText()` bahkan sudah punya string untuk kasus ini: **"Tanpa toleransi terukur"** ([measurement.ts:283](apps/tech-pwa/src/lib/calibration/measurement.ts#L283)).

### Rekomendasi: **Ya — cukup, tanpa field tambahan.** Yang tersisa murni UI

- **pH Status** → `valueType = TEXT`, isi ke `measuredText`, `isWithinTolerance` NULL. Ini pilihan yang paling sedikit mengarang: §5.8 menyatakan isinya tidak dapat disimpulkan dari LK. Seperti §4, jangan bangun ENUM di atas dasar yang tidak diketahui.
- **Otoscope intensitas** → `valueType = NUMBER` dengan `toleranceMin/Max` NULL. Tiga status (`true` / `false` / `null`) sudah cukup mengekspresikan "tidak ada batas"; kolom `hasNoTolerance` akan redundan dengan `NULL AND NULL` dan menambah state yang bisa tidak sinkron.
- Chip NULL "Perlu telaah" **tepat** di sini: LK memang menyerahkannya ke penilaian manusia (§11).

Satu-satunya lubang: `valueType = TEXT` belum punya jalan masuk sama sekali di tech-pwa — identik dengan §4. Satu varian entry menutup keduanya.

---

## 8. Dual-class leakage Kelas I / II (audit §3 baris Arus Bocor, §5.6, §9, §11)

### Kutipan audit

> "kadang satu ambang `≤ 500 µA` / `≤ 100 µA`; kadang **Kelas I ≤ 500 µA / Kelas II ≤ 100 µA** … LK tidak menulis cara pilih kelas otomatis … Dual-class = ambiguitas" (§3)
> "**Current system partially supports it**: satu max ter-seed; baris Kelas II di note tidak dipakai." (§9)
> §11: "Kelas I vs II mana yang berlaku untuk UUT ini." — **NOT defined by LK.**

### Skala nyata (dihitung dari seed, untuk menilai besar gap-nya)

- **27** DeviceType ter-seed; **24** punya parameter `*_EQUIP_LEAKAGE`.
- Dari 24 itu, hanya **4** memakai `LEAK_CLASS`: **ECG, BREAST_PUMPS, BED_SIDE_MONITOR, PATIENT_MONITOR** ([backfill-…-tolerances.ts:341, 357, 496, 511](packages/db/prisma/backfill-device-calibration-parameter-tolerances.ts#L341)).
- 20 DeviceType sisanya memakai ambang tunggal (`LEAK_500` atau `LEAK_100`) ⇒ **sudah benar hari ini**.
- Perilaku sekarang pada 4 DeviceType itu: `toleranceMax = 500` tersimpan terstruktur, note dua-baris hanya informatif ⇒ **UUT Kelas II dievaluasi dengan ambang Kelas I**. Bacaan 300 µA pada alat Kelas II tercatat "Sesuai" padahal LK memberi batas 100 µA. Arah kesalahannya **permisif (false pass)**, bukan sekadar kosmetik.
- Catatan teknis: `parseToleranceNote()` memang menolak note dengan lebih dari satu `±` berbeda, tetapi jalur itu tidak terpakai di sini — `toleranceMax` terstruktur menang lebih dulu di rantai prioritas.

### Opsi

**Opsi 8A — Tunda modelnya, sebagai item terpisah dari gelombang kualitatif ini.**

- **+** Masalahnya **bukan** kualitatif. Ini soal _pemilihan toleransi_, serumpun dengan `SUCT_MAX_VACUUM` ("isi salah satu sesuai dengan UUT", §3) dan `INCU_AIR_TEMP` dual-tolerance — keduanya sudah punya jalur sendiri lewat `CalibrationTestPoint` override.
- **+** Butuh input bisnis yang belum ada: **dari mana kelas UUT diketahui?** §5.6 menunjukkan Kelas Proteksi (`I / II / Baterai`) adalah _pilihan yang diisi teknisi di LK_, bukan atribut device di sistem. Menyelesaikannya berarti memodelkan pilihan itu lebih dulu — pekerjaan tersendiri.
- **−** Membiarkan 4 DeviceType dengan verdict permisif-salah lebih lama.

**Opsi 8B — Kerjakan sekarang, dengan field kelas pada job/device.**

- **+** Menutup false pass.
- **−** Menuntut keputusan §11 ("Kelas I vs II mana yang berlaku") **dan** model Kelas Proteksi sekaligus — dua keputusan bisnis masuk ke jalur kritis gelombang yang seharusnya soal Baik/Tidak Baik.

**Opsi 8C — Mitigasi minimal sekarang, model penuh nanti.**
Untuk 4 DeviceType itu, jangan biarkan sistem menebak: kosongkan `toleranceMax` sehingga `isWithinTolerance` menjadi **NULL** ("Perlu telaah"), dan note dua-kelas tampil apa adanya untuk dibaca manusia saat QA.

- **+** Mengubah false pass menjadi "tidak dievaluasi otomatis" — arah yang jujur, dan persis semantik NULL yang schema sudah niatkan: "cannot be evaluated automatically … judged holistically by a human at QualityReview".
- **+** Perubahan data katalog saja; tanpa schema, enum, atau API.
- **−** Menambah 4 baris "Perlu telaah" per job pada DeviceType itu sampai model kelas tersedia.
- **−** Tetap satu perubahan pada data production ⇒ butuh persetujuan eksplisit.

### Rekomendasi: **8A untuk desainnya, tetapi angkat 8C sebagai keputusan tersendiri yang mendesak**

Modelnya ditunda — memang bukan bagian dari gelombang kualitatif ini, dan tergantung pada pemodelan Kelas Proteksi yang belum ada. Tetapi Afriza sebaiknya memutuskan **sekarang** apakah 4 DeviceType tersebut boleh terus dievaluasi dengan ambang Kelas I. Skalanya kecil (4 dari 24) dan arah kesalahannya permisif — keputusan cepat dengan dampak nyata, bukan proyek.

---

## 9. Ringkasan untuk dikunci

| #   | Item                      | Rekomendasi                                                                                                         | Biaya                       | Butuh keputusan bisnis?                                         |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------- |
| 1   | Physical checklist        | **1A** — katalog + tabel hasil terpisah (`DevicePhysicalCheckItem` + hasil ber-`verdict`)                           | Besar (entitas + API + UI)  | Ya: master global vs per-DeviceType; note wajib saat Tidak Baik |
| 2   | Wording chip              | **2B** — "Dalam toleransi / Di luar toleransi / Perlu telaah"; 2A sah bila ditulis eksplisit sebagai istilah sistem | Kecil (1 fungsi)            | Ya — murni keputusan istilah                                    |
| 3   | HEPA BOOLEAN              | **3A** + label **Pass/Fail** persis LK                                                                              | Kecil (1 varian UI)         | Tidak                                                           |
| 4   | Smoke BSC                 | **4A** — TEXT bebas, evaluasi NULL. Jangan BOOLEAN                                                                  | Kecil (sepaket §3, §7)      | Tidak (justru menghindari tebakan)                              |
| 5   | Display UUT + standar     | **5A** — dua field yang ada; kunci konvensi mana yang masuk `measuredValue`                                         | Kecil–sedang (UI dua kolom) | **Ya** — sasaran toleransi "tidak selalu jelas" (§3)            |
| 6   | Lingkungan Awal/Akhir     | **6A** — `replicateIndex` 1/2; **tolak** reuse `direction`. Berlaku juga untuk L-N/L-G/N-G                          | Kecil                       | Ya: terima pemakaian ganda replicate, atau bayar 6B             |
| 7   | pH Status / toleransi `-` | Cukup TEXT + `toleranceMin/Max` NULL. **Tanpa field baru**                                                          | Kecil (sepaket §4)          | Tidak                                                           |
| 8   | Dual-class leakage        | **8A** tunda modelnya; putuskan **8C** terpisah untuk 4 DeviceType                                                  | Data-only bila 8C           | **Ya** — false pass aktif hari ini                              |

**Urutan yang saya sarankan bila semua disetujui:** §3 + §4 + §7 (satu gelombang UI kecil: varian entry BOOLEAN + TEXT) → §2 (satu fungsi) → §6 → §5 → §1 (paling besar) → §8 (setelah model Kelas Proteksi ada).

---

## 10. Eksplisit di luar dokumen ini

Sesuai batas task, **tidak** diusulkan model apa pun — bahkan sebagai opsi — untuk:

- Telaah Teknis (skor kategori, bobot 10/40/50, kesimpulan laik / tidak laik) — giliran QualityReview.
- Penilaian Secara Menyeluruh 5-tier (Kelistrikan).
- Rumus atau keterhubungan `isWithinTolerance` → Telaah → kesimpulan kelaikan.
- Nilai calculated (ΔT autoclave, rasio mikroskop, sphyg leak = setting − standar, Average/K-factor BSC) — **dicatat sebagai gap** (audit §4.6, §9); desainnya tidak diusulkan di sini.

Juga tidak disentuh: Identity Correction, REWORK, JobHandOff, Post-Approval Correction, dan happy path angka yang sudah berjalan.

---

**HARD STOP.** Tidak ada kode, schema, enum, migration, seed, API, UI, atau test yang diubah oleh task ini — dokumen ini satu-satunya artefak. Menunggu keputusan Afriza per item (§9) sebelum Stage 2.
