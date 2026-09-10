# MeasurementResult Domain Decision Review

**Date:** 2026-09-10  
**Mode:** ANALYSIS / DECISION ONLY — no code, schema, migration, enum, API, UI, or tests  
**Inputs:** `MeasurementResult_LK_Semantics_Audit.md` + backbone yang sudah hidup  
(`DeviceCapability` → `DeviceCalibrationParameter` → `CalibrationTestPoint` → `MeasurementResult`)  
**Constraints:** lifecycle `IN_PROGRESS` → `SUBMITTED` → MT APPROVE → `ACCEPTED_BY_QA` tidak diubah; REWORK tidak diubah; `QualityReview` tidak didesain ulang.

Ini bukan ringkasan audit. Ini **kesimpulan domain**: apa yang MeasurementResult *adalah*, apa yang *bukan*, dan keputusan mana yang boleh dikunci tanpa mengarang aturan bisnis yang LK tidak tulis.

---

## 1. Executive Conclusion

**MeasurementResult saat ini kira-kira benar sebagai konsep, dan terlalu sempit sebagai cakupan lembar kerja — tetapi solusi yang salah adalah memperlebarnya.**

Konsep yang sudah ada — *satu baris rekaman untuk satu parameter katalog, pada satu titik uji, satu ulangan, satu attempt, satu arah* — **cocok** dengan inti LK: sel **Hasil Pengukuran** / **Terukur** (kinerja, keselamatan listrik, kondisi lingkungan).

Yang salah secara domain bukan “model terlalu sempit lalu harus menelan seluruh LK”. Yang salah adalah **mencampur lapisan**:

- evaluasi toleransi per sel (`isWithinTolerance`) diperlakukan seolah hasil kalibrasi alat;
- wording UI **Sesuai / Tidak sesuai** dipasang seolah itu bahasa LK;
- godaan berikutnya: memasukkan **Baik / Tidak Baik**, **Telaah**, dan **laik** ke baris yang sama.

LK memisahkan lapisan itu secara fisik (bagian berbeda, wording berbeda, tanpa rumus penghubung). Domain MedCal harus memisahkannya juga.

**Verdict ringkas:**

| Pertanyaan | Jawaban |
|---|---|
| Terlalu luas / sempit / kira-kira benar? | **Kira-kira benar** untuk *recorded measurement*. **Terlalu sempit** untuk seluruh LK. **Jangan dilebarkan** agar menutupi fisik, Telaah, atau keputusan MT. |
| Apakah kita butuh “Result Type” generik lintas lapisan? | **Tidak.** Itu akan menyatukan konsep yang LK pisahkan. `CalibrationValueType` sudah cukup sebagai *bentuk penyimpanan* baris ukur. |
| Apa yang dikunci sekarang? | Batas MeasurementResult; arti `isWithinTolerance`; ketidaksetaraan wording; Telaah ≠ QualityReview; fisik ≠ MeasurementResult. |
| Apa yang tidak dikunci? | Agregasi FAIL, completeness, rumus Telaah, Awal/Akhir, display+standar, smoke, rumus hitungan. |

---

## 2. Domain Layers Identified

Lapisan berikut **ada di LK sebagai hal berbeda**. Mereka tidak boleh dilipat menjadi satu “hasil”.

| Layer | Apa yang teknisi lakukan | Wording LK | Hubungan ke backbone |
|---|---|---|---|
| **Identity / job context** | Isi identitas UUT, tanggal, Channel | Header kosong | Di luar MeasurementResult (`Device`, `CalibrationJob`) |
| **Reference equipment used** | Catat standar yang dipakai | Daftar Alat yang Digunakan | Di luar (`JobReferenceEquipment` sudah ada) |
| **Reference / nominal / setting** | Dial / pilih titik; kadang isi nominal on-site | Setting Simulator/UUT/Standar; Min/Med/Max; `isi setting sesuai UUT` | Catalog: `CalibrationTestPoint.settingValue/Label`; snapshot: `appliedNominalValue` |
| **Measurement** | Menulis pembacaan | Hasil Pengukuran, Terukur, Display UUT, Pembacaan indikator UUT, Result 1–3 | **MeasurementResult** |
| **Paired reference reading** | Menulis pembacaan alat acuan di samping/tabel terpisah | Hasil Pengukuran Standar, Pembacaan Refrence | Field `referenceValue` pada baris ukur — **bukan** lapisan keputusan |
| **Calculated result** | Mengisi (atau seharusnya mengisi) nilai turunan | ΔT, rasio stage/okuler, leak = setting − standar, Average/Min/Max | Masih *pengukuran turunan*; rumus **tidak** ada di engine hari ini |
| **Tolerance evaluation** | LK hanya mencetak Toleransi/Ambang; tidak mengisi verdict per sel | Toleransi, Ambang Batas | `isWithinTolerance` = evaluasi sistem, **bukan** kolom LK |
| **Qualitative observation (kinerja)** | Pengamatan uji, bukan angka | HEPA **Pass / Fail**; smoke “turbelensi atau tidak” | Boleh sebagai MeasurementResult **jika** itu item kinerja di bagian Hasil Pengukuran |
| **Classification** | Menandai kelas UUT / rated class / slot | B/BF/CF; I/II/Baterai; DPS/NPS/PIE; Low/Medium/High vacuum | Bukan pembacaan. Vacuum class = pilihan test-point; kelas listrik = atribut pekerjaan/UUT, bukan hasil ukur |
| **Physical inspection** | Checklist visual/fungsi | **Baik / Tidak Baik** + Batas Pemeriksaan prosa | **Di luar** MeasurementResult |
| **Technical review / Telaah** | Judgment kategori berbobot | Hasil Pengamatan **Baik / Tidak Baik** untuk Kondisi Alat / Keselamatan Listrik / Kinerja | **Di luar** MeasurementResult dan **bukan** QualityReview |
| **Final assessment (laik)** | Kesimpulan lembar | **Baik dan laik untuk digunakan** / **Tidak baik dan tidak laik untuk digunakan** | **Di luar**; bukan status job |
| **Electrical 5-tier assessment** | Pilih satu dari lima kalimat | Penilaian Secara Menyeluruh (hanya LK Kelistrikan) | **Di luar**; pengganti Telaah pada worksheet itu |
| **Lifecycle decision** | MT Setujui/Tolak | Tidak ada di LK | `QualityReview` — sudah ada, jangan diubah |

---

## 3. MeasurementResult Boundary

**MeasurementResult adalah rekaman observasi/pembacaan pada parameter kalibrasi yang sudah didefinisikan di katalog, untuk satu job/attempt.**

**Masuk:**

- Hasil Pengukuran Kinerja (angka, rasio, HEPA Pass/Fail, pengamatan smoke *jika* diperlakukan sebagai item kinerja).
- Pengukuran Keselamatan Listrik kolom **Terukur** (empat parameter resistansi/arus).
- Pengukuran Kondisi Lingkungan kolom **Terukur** (suhu, RH, tegangan).
- Ulangan, titik uji, arah naik/turun, attempt.
- Snapshot evaluasi vs toleransi katalog (`isWithinTolerance` + bounds), **jika** bounds dapat dihitung — sebagai *atribut evaluasi baris*, bukan sebagai “hasil alat”.

**Tidak masuk:**

- Header identitas, Channel sebagai identitas pompa.
- Daftar Alat yang Digunakan.
- Pemeriksaan fisik Baik/Tidak Baik.
- Klasifikasi B/BF/CF, I/II/Baterai, DPS/NPS/PIE.
- Telaah kategori dan kesimpulan laik.
- Penilaian 5-tier Kelistrikan.
- QualityReview APPROVE/REJECT.
- Tabel konversi satuan (dokumentasi).
- Sertifikat, lampiran logger *sebagai pengganti* Telaah (lampiran boleh menopang baris LOGGER_SUMMARY, bukan meredefinisi Telaah).

**Keputusan batas:** memperluas MeasurementResult agar “satu tabel menelan seluruh LK” akan merusak backbone. Kekurangan cakupan LK diselesaikan dengan **konsep terpisah**, bukan dengan melebarkan baris ukur.

---

## 4. DeviceCalibrationParameter Boundary

**DeviceCalibrationParameter = “apa yang diukur / diuji pada jenis alat ini” dalam arti kinerja, listrik terukur, atau lingkungan terukur — termasuk item kinerja kualitatif yang ada di bagian Hasil Pengukuran.**

**Masuk (sudah selaras):**

- Parameter NUMBER/RATIO dengan toleransi/note.
- HEPA leak sebagai parameter BOOLEAN kinerja (sudah di seed).
- Entry style DIRECT vs LOGGER_SUMMARY.

**Masuk secara konsep, belum lengkap di catalog:**

- Smoke-pattern sebagai item kinerja (bukan item fisik).
- Pasangan Display vs Standar sebagai *satu parameter dengan dua pembacaan*, bukan dua capability baru — **cara rekam masih belum dikunci** (§15).
- Analyte dinamis: LK mengizinkan daftar tidak tetap; itu **bukan** bukti bahwa parameter harus diganti konsep MeasurementResult. Itu gap catalog/instance, ditunda.

**Tidak masuk:**

- Item pemeriksaan fisik (Batas Pemeriksaan prosa, tanpa UoM, tanpa ambang angka).
- Baris Telaah “Kondisi Alat (10)” — itu kategori penilaian, bukan parameter ukur.
- Kesimpulan laik.
- 5-tier Kelistrikan.
- Klasifikasi proteksi/applied part (bukan “nilai yang diukur”).

Capability grouping (`ENVIRONMENTAL_CONDITIONS`, `ELECTRICAL_SAFETY`, kinerja) adalah **organisasi catalog**, bukan mesin lulus/gagal. LK juga memisahkannya sebagai bagian, tanpa rumus gabungan.

---

## 5. CalibrationTestPoint Boundary

**CalibrationTestPoint = slot tetap di dalam satu parameter: setting numerik, posisi, sensor, kelas rated, atau slot ordinal yang teknisi pilih on-site.**

**Masuk:**

- Sweep Pattern B (30/60/120 BPM, dll.).
- Posisi A/B/C, titik 1–4, sensor T1–T9 (jika dimodel sebagai titik, bukan logger summary).
- Slot Min/Med/Max, Rendah/Sedang/Tinggi.
- Override ambang per varian (121 vs 134, Lampu ON vs OFF, Low/Medium/High vacuum).
- `settingValue` NULL untuk “isi sesuai UUT”.

**Tidak masuk:**

- Ulangan I–V → `replicateIndex`, bukan test point.
- Naik/Turun → `direction`, bukan test point.
- Awal/Akhir lingkungan — **bisa** dipaksa jadi dua test point, dua replicate, atau dua parameter; LK tidak menunjuk mana. **Jangan dikunci sekarang.**
- Pilihan B/BF/CF — klasifikasi UUT, bukan titik ukur kinerja.
- Item fisik — bukan test point parameter ukur.

Test point **bukan** tempat menyimpan Baik/Tidak Baik atau laik.

---

## 6. Measurement vs Evaluation vs Assessment

Tiga kata ini **wajib** dipisah.

**Measurement (rekaman)**  
Nilai yang teknisi tulis: `measuredValue` / `measuredBool` / `measuredText`, plus `referenceValue` jika ada pembacaan acuan. Ini fakta observasi.

**Evaluation (evaluasi batas)**  
Perbandingan rekaman terhadap Toleransi/Ambang yang *bisa* dihitung. Di sistem: `isWithinTolerance` + snapshot bounds. Di LK: kolom Toleransi **ada**, kolom verdict per sel **tidak ada**. Jadi evaluasi adalah **lapisan sistem yang sah** di atas measurement, **bukan** “hasil kalibrasi” LK.

**Assessment (penilaian)**  
Judgment manusia di akhir lembar: Telaah kategori, kesimpulan laik, atau 5-tier Kelistrikan. LK **tidak** menurunkan assessment dari evaluasi sel. QualityReview adalah assessment **lain lagi**: keputusan MT atas siklus pekerjaan, bukan Telaah.

Rantai yang **tidak** boleh diimplementasikan tanpa aturan tertulis:

```
measurement → isWithinTolerance → Telaah Kinerja → laik → QualityReview → job PASS
```

LK tidak menuliskan rantai itu. Lifecycle yang sudah hidup juga tidak menuliskannya. Biarkan terputus sampai produk mengunci aturan baru — dan itu **bukan** keputusan domain dari corpus LK.

---

## 7. Baik / Tidak Baik vs Pass / Fail vs Laik

**Keputusan: ini bukan satu konsep semantik.** Jangan dinormalisasi ke PASS/FAIL atau ke `isWithinTolerance`.

| Wording | Di mana LK memakainya | Apa artinya di domain | Bukan |
|---|---|---|---|
| **Baik / Tidak Baik** | (1) Pemeriksaan fisik per item; (2) Telaah per kategori | Dua pemakaian **homonim**. (1) inspeksi kondisi/fungsi. (2) hasil pengamatan kategori berbobot. | Bukan Pass/Fail HEPA. Bukan laik. Bukan Sesuai. |
| **Pass / Fail** | Hanya HEPA/ULPA `Seluruh hepa` | Hasil uji kebocoran filter (item kinerja) | Bukan fisik. Bukan Telaah. |
| **Sesuai / Tidak sesuai** | **Tidak** sebagai hasil. Hanya prosa instruksi | Label **UI sistem** untuk evaluasi toleransi | Bukan wording LK untuk sel ukur |
| **Baik dan laik / Tidak baik dan tidak laik** | Kesimpulan Telaah | Assessment kelayakan pakai di lembar teknisi | Bukan QualityReview. Bukan status job. Bukan OR dari sel OOT. |

Smoke BSC memakai wording **ketiga** (“turbelensi atau tidak”, dll.) — lagi-lagi bukan Baik dan bukan Pass/Fail.

**Homonim Baik:** menyimpan fisik dan Telaah sebagai `measuredBool` yang sama akan menghapus perbedaan lapisan yang LK jaga. Bahkan jika keduanya “boolean” secara teknis, **domainnya berbeda**.

---

## 8. isWithinTolerance Semantic Decision

**Arti domain yang dikunci:**

`isWithinTolerance` adalah **evaluasi kepatuhan terhadap batas efektif yang di-snapshot pada saat baris ditulis**, untuk **satu MeasurementResult**.

- NUMBER/RATIO: raw `measuredValue` vs `effectiveToleranceMin`/`Max` (inklusif di implementasi hari ini — apakah itu sesuai niat `>` LK **belum dikunci**).
- BOOLEAN: cermin `measuredBool` (`true` = within). Itu **bukan** bukti bahwa Pass = Baik = laik; itu hanya cara engine hari ini.
- TEXT: selalu `null` = tidak dievaluasi otomatis.
- `null` juga jika tidak ada bounds yang dapat dihitung.

**Bukan:**

- hasil kalibrasi alat;
- PASS/FAIL pekerjaan;
- Telaah Kinerja;
- kesimpulan laik;
- keputusan MT;
- pemicu REWORK;
- syarat submit / complete.

**Nama field** berbicara tentang *tolerance*. Itu akurat untuk angka vs Ambang/Toleransi. Itu **menyesatkan** jika dipaksa menampung Baik, laik, atau 5-tier.

Chip **Sesuai / Tidak sesuai** adalah **presentasi**, bukan konsep domain. Domain-nya tetap: in-bounds / out-of-bounds / unevaluable.

---

## 9. Existing Field Coverage

| Field | Pola LK yang sudah diwakili dengan benar | Hanya sebagian | Bukan untuk |
|---|---|---|---|
| `measuredValue` | Sel angka kinerja, listrik Terukur, lingkungan | Display+standar sebagai *satu* angka; nilai calculated jika teknisi mengetik hasil jadi | Baik; Pass; laik; 5-tier |
| `measuredBool` | HEPA Pass/Fail (backend) | Smoke jika dipaksa ya/tidak (LK tidak menegaskan bentuk isian) | Fisik Baik; Telaah Baik |
| `measuredText` | Bentuk rasio “1:2”; catatan; Status/smoke *jika* teks | Smoke/Status tidak dikunci bentuknya | Mengganti Telaah |
| `referenceValue` | Pasangan standar vs UUT (Thermo, “Hasil Pengukuran Standar”) | UI tidak memakai; Display vs Standar vs Setting tiga kolom belum dipetakan | Identitas alat di Daftar Alat |
| `appliedNominalValue` | Setting tercetak / dipilih untuk ± delta | Awal/Akhir; Lot Code; control certificate | Klasifikasi B/BF/CF |
| `direction` | Naik/Turun sphyg, suction, phaco, thermo RH | — | Awal/Akhir (bukan ramp) |
| `replicateIndex` | Kolom I–V / I–III / I–VI / I–IX | Awal/Akhir sebagai replicate 1/2 adalah **konvensi**, bukan LK | Item fisik (bukan ulangan) |
| `attemptNumber` | Siklus REWORK (sistem) | LK tidak punya konsep attempt | — |
| `isWithinTolerance` | Evaluasi vs Toleransi/Ambang jika bounds ada | Dual-class leakage; `>` vs `≥`; SpO2 `%`; dual kriteria BSC velocity | Assessment |
| `calibrationTestPointId` | Sweep, posisi, slot named | Logger 270 sel vs summary | — |
| `attachmentFileObjectId` | Note lampiran 12-channel | UI Stage C belum | Foto fisik / foto HEPA sebagai pengganti hasil |

Kesimpulan coverage: **backbone field sudah dirancang untuk measurement + evaluation + test-point + ramp + attempt.** Yang “kurang” sebagian besar **bukan field baru di MeasurementResult**, melainkan lapisan di luar, atau aturan rekam yang belum dikunci (Awal/Akhir, dua kolom angka, rumus).

---

## 10. Real Domain Gaps

Gap **domain** = konsep LK yang tidak punya rumah yang jujur di model, bukan “belum ada layar”.

1. **Pemeriksaan fisik** sebagai konsep sendiri (item per jenis alat + Baik/Tidak Baik). Tidak ada di backbone ukur.
2. **Telaah Teknis** (kategori + bobot + Hasil Pengamatan). Bukan MeasurementResult, bukan QualityReview.
3. **Kesimpulan laik** teknisi. Bukan `CalibrationJobStatus`, bukan `ReviewDecision`.
4. **Penilaian 5-tier Kelistrikan.** Assessment khusus worksheet, mengganti Telaah.
5. **Klasifikasi kelistrikan UUT** (B/BF/CF, I/II/Baterai, DPS/NPS/PIE) sebagai atribut pekerjaan, pengondisi ambang — bukan Terukur.
6. **Item kinerja kualitatif non-HEPA** (smoke BSC; mungkin Status pH) — rumah *bisa* MeasurementResult, tetapi bentuk nilai belum dikunci oleh LK.
7. **Daftar analit dinamis + toleransi dari sertifikat control** — catalog tetap tidak mencerminkan aturan LK “boleh ganti parameter”.
8. **Calculated quantity sebagai konsep** (ΔT, rasio, leak derived, average EN/NSF) — hari ini hanya “ketik angka”; domain LK membedakan input mentah vs hasil rumus.
9. **Kondisi lingkungan Awal dan Akhir** sebagai *pasangan yang diminta LK* — catalog saat ini tidak menyatakan dua slot itu.
10. **Tiga pembacaan pada satu baris** (setting + display UUT + standar) — dua field angka tidak selalu cukup tanpa keputusan pemetaan.

Gap 1–5 **jangan** dipaksakan ke MeasurementResult. Gap 6–10 **boleh** tetap di keluarga measurement, tetapi butuh keputusan rekam terpisah, bukan enum Result Type lintas lapisan.

---

## 11. UI-Only Gaps

Ini **bukan** alasan mengubah batas domain:

- Chip **Sesuai / Tidak sesuai / Perlu telaah** vs wording LK (presentasi evaluasi).
- Tech-PWA hanya listing NUMBER DIRECT/GRID; BOOLEAN/RATIO/TEXT/LOGGER_SUMMARY disembunyikan.
- Portal MT tidak menampilkan `isWithinTolerance`.
- Entry belum menampilkan `referenceValue` berdampingan.
- Completeness `n/total` di UI (bukan aturan LK, bukan gate backend).
- Badge “Ada yang tidak sesuai” sebagai agregasi tampilan — **bukan** assessment domain.

Mengganti label chip, atau menampilkan BOOLEAN HEPA, **tidak** menyelesaikan Telaah atau fisik.

---

## 12. Undefined Business Rules

**MUST NOT be implemented** sebagai perilaku sistem, karena LK tidak mendefinisikan dan kita tidak boleh mengarang:

- Satu pengukuran OOT = peralatan FAIL / job FAIL / Telaah Kinerja = Tidak Baik.
- Semua pengukuran harus in-tolerance agar laik.
- Lingkungan OOT = kalibrasi FAIL (atau sebaliknya: lingkungan diabaikan).
- Satu item fisik Tidak Baik = tidak laik.
- Baik = Pass = Sesuai = laik = APPROVE.
- Telaah dihitung otomatis dari pengukuran atau dari bobot 10/40/50.
- Completeness wajib (semua I–V, semua sel grid).
- Job-level PASS/FAIL.
- Submit/MT/REWORK/complete bergantung pada `isWithinTolerance`.
- Inclusive/exclusive untuk `>` / `≥`.
- SpO2 sebagai % reading vs percentage points.
- Kelas I vs II mana yang berlaku.
- Isi Status pH; bentuk isian smoke; Otoscope toleransi `-`.
- Mapping Telaah teknisi ↔ QualityReview MT.
- Ventilator (tidak ada LK di folder).
- Koreksi template Otoscope/Phaco.

Implementasi yang sudah ada (evaluasi per baris, lifecycle tanpa baca measurement) **boleh tetap** sebagai fakta sistem; itu bukan “aturan bisnis LK yang baru dikunci”.

---

## 13. Recommended Conceptual Model

Tetap empat tingkat untuk **pengukuran**:

```
DeviceCapability                 (grouping catalog; bukan lulus/gagal)
  DeviceCalibrationParameter     (apa yang diukur/diuji)
    CalibrationTestPoint         (slot setting/posisi/kelas rated)
      MeasurementResult          (rekaman + evaluasi batas opsional)
```

Di **samping**, bukan di dalam, jika/ketika dikerjakan nanti (hanya konsep — bukan schema task):

```
Physical inspection  →  item checklist per device type  →  Baik | Tidak Baik
Technician Telaah    →  kategori berbobot               →  Baik | Tidak Baik
                     →  kesimpulan                      →  laik | tidak laik
Kelistrikan worksheet →  5-tier assessment
UUT electrical class →  B/BF/CF, I/II/Baterai, DPS/NPS/PIE
QualityReview        →  MT APPROVE | REJECT   (sudah ada; jangan diubah)
CalibrationJobStatus →  lifecycle             (sudah ada; jangan diubah)
```

Tidak ada “Result Type” super-enum yang mencakup semua kotak di atas.

`CalibrationValueType` tetap **bentuk nilai baris ukur** (NUMBER / RATIO / TEXT / BOOLEAN), bukan jenis penilaian.

---

## 14. Decisions We Should LOCK

1. **MeasurementResult = rekaman pengukuran/uji parameter katalog** (kinerja, listrik Terukur, lingkungan Terukur), termasuk HEPA sebagai item kinerja. Bukan wadah seluruh LK.

2. **`isWithinTolerance` = evaluasi kepatuhan per baris terhadap bounds snapshot** (atau cermin boolean). Bukan hasil alat, bukan PASS/FAIL job, bukan Telaah, bukan laik.

3. **Baik / Tidak Baik, Pass / Fail, Sesuai / Tidak sesuai, laik adalah konsep berbeda.** Homonim “Baik” pada fisik vs Telaah tetap dua lapisan.

4. **Pemeriksaan fisik bukan MeasurementResult.**

5. **Telaah bukan MeasurementResult dan bukan QualityReview.** QualityReview tetap keputusan MT pada lifecycle.

6. **Kesimpulan laik bukan `CalibrationJobStatus` dan bukan `ReviewDecision`.**

7. **Penilaian 5-tier Kelistrikan adalah assessment, bukan measurement dan bukan inspeksi fisik.**

8. **Tidak membuat Result Type generik lintas lapisan.** Jangan enum baru untuk “menyatukan” kualitatif.

9. **Lifecycle, REWORK, QualityReview, Identity Correction, JobHandOff, Post-Approval Correction, dan happy path angka tidak diubah** untuk menampung temuan LK kualitatif.

10. **Chip Sesuai adalah presentasi**, bukan domain LK. Mengubah/mempertahankan label adalah keputusan UI terpisah, bukan perluasan model.

---

## 15. Decisions We Should NOT Make Yet

- Agregasi apa pun dari baris OOT ke Telaah/laik/job.
- Completeness sebagai syarat bisnis.
- Apakah lingkungan dievaluasi sama dengan kinerja (mesin hari ini sama; **kebijakan** belum ada di LK).
- Pemetaan Awal/Akhir (replicate vs test point vs parameter).
- Pemetaan Display UUT vs `measuredValue` vs `referenceValue`.
- Apakah sistem menghitung ΔT/rasio/average atau teknisi mengetik hasil.
- Bentuk smoke (BOOLEAN vs TEXT) dan Status pH.
- Apakah HEPA `measuredBool` boleh dilabeli Sesuai di UI.
- Dual-class leakage, SpO2 `%`, inklusivitas `>`.
- Catalog fisik, model Telaah, model 5-tier, model klasifikasi listrik.
- Analyzer dinamis.
- Nasib template Otoscope/Phaco.

---

## 16. Recommended Next Step

**Berhenti memperluas MeasurementResult.** Kunci batas di atas secara tertulis (dokumen ini), lalu:

1. Lanjutkan happy path **hanya** di dalam batas: angka DIRECT/GRID + evaluasi per baris, tanpa mengaitkan lifecycle.
2. Jika UI kualitatif dibahas: **HEPA dulu** sebagai BOOLEAN kinerja — tetap MeasurementResult, **tanpa** menyamakan Pass dengan Baik/laik, dan **tanpa** mengubah chip menjadi aturan job.
3. Fisik, Telaah, laik, 5-tier: **backlog konsep terpisah**, bukan stage MeasurementResult berikutnya.
4. Jangan buka schema/enum “Result Type” / “InspectionResult” sampai ada keputusan produk terpisah — dan itu di luar tugas ini.

Tidak ada implementasi dalam langkah ini.

---

### MY RECOMMENDED DECISION

1. **MeasurementResult tetap sempit:** rekaman parameter katalog (kinerja / listrik terukur / lingkungan terukur), bukan seluruh LK.

2. **`isWithinTolerance` dikunci sebagai evaluasi batas per baris**, bukan hasil kalibrasi, bukan PASS/FAIL, bukan Telaah, bukan laik.

3. **Baik ≠ Pass ≠ Sesuai ≠ laik.** Sesuai adalah label UI; Pass hanya HEPA; Baik fisik ≠ Baik Telaah; laik adalah kesimpulan lembar.

4. **Fisik = konsep terpisah.** Jangan `measuredBool` pada DeviceCalibrationParameter kinerja.

5. **Telaah = konsep terpisah dari MeasurementResult dan dari QualityReview.** Jangan redesign QualityReview.

6. **5-tier Kelistrikan = assessment**, bukan measurement/inspection.

7. **Tidak ada Result Type generik / enum baru.** `CalibrationValueType` hanya bentuk nilai ukur.

8. **Klasifikasi listrik UUT (B/BF/CF, I/II, DPS/NPS/PIE) di luar MeasurementResult.**

9. **Jangan implementasi aturan agregasi, completeness, atau auto-Telaah** — tidak ada di LK.

10. **Next step: jangan code.** Kunci dokumen ini; HEPA/UI/fisik/Telaah hanya jika diputus sebagai inisiatif terpisah, tanpa menyentuh lifecycle yang sudah jalan.

**NO CODE WAS MODIFIED.**
