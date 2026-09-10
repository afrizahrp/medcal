# Physical Inspection — LK Master Candidate Audit

**Tanggal:** 2026-09-10  
**Mode:** READ-ONLY / AUDIT ONLY — tidak ada perubahan schema, migrasi, seed, API, UI, permission, atau data  
**Sumber LK:** `docs/technician-docs/Lembar-Kerja/` (50 template blank `.docx`)  
**Desain domain yang sudah LOCKED (bukan seed):**

```
DeviceType
  └── DevicePhysicalCheckItem[]   (per-DeviceType)
        └── PhysicalCheckResult[]  (BAIK | TIDAK_BAIK)
```

**Dokumen terkait:**  
`PhysicalInspection_Design_Compatibility_Audit.md`,  
`PhysicalInspection_Final_Design_Lock_Audit.md`,  
`docs/claude/plans/management-portal/Calibration-management/Quotation/investigation-lk-vs-measurement-schema.md` §4.

`MeasurementResult_LK_Semantics_Audit.md` **tidak ditemukan** di repo. Ringkasan seksi fisik terdahulu ada di investigation LK vs schema §4. Audit ini mengekstrak wording dari dokumen LK, bukan dari ringkasan itu.

**Metode ekstraksi:** `word/document.xml` dari setiap `.docx` (Zip + strip tag). Launcher `py` tidak di PATH; Python 3.13 Store ada di mesin tetapi tidak dipakai untuk seed/tulisan.

**NO CODE WAS MODIFIED.**

---

## 1. Executive Summary

Template LK MedCal **memiliki seksi inspeksi fisik/fungsi yang tetap dan terstruktur**, dengan jawaban **Baik / Tidak Baik**, bukan angka.

Temuan utama:

- **50** template blank. **49/50** berisi seksi berjudul persis **Pemerikasaan Kondisi Fisik dan Fungsi Komponen Alat** (ejaan LK: *Pemerikasaan*).
- **`LK Kelistrikan.docx` tidak punya seksi itu.**
- Kolom: **No. | Parameter | Batas Pemeriksaan | Keterangan** (Baik / Tidak Baik).
- **266** baris Parameter di 49 LK (2–9 item per template).
- **Batas Pemeriksaan** hampir selalu prosa prosedur, bukan toleransi numerik. Pengecualian jelas: Sphygmomanometer **Pengaturan titik 0** memuat **±1 mmHg**.
- Seksi ini **bukan physical-only**. Judul dan banyak batas memasukkan **fungsi** (tampilan, alarm, motor, interlock).
- Wording **tidak kanonik**. Contoh: `Badan / Permukaan` vs `Badan dan permukaan alat`; `Kotak kontak alat` vs `Tusuk kontak alat`. Audit **tidak menggabungkan** wording berbeda.
- Prisma **tidak punya** `DevicePhysicalCheckItem` / `PhysicalCheckResult`. `DeviceCalibrationParameter` **tidak** berisi item fisik.

Ini **bukan daftar seed final**. Kode usulan adalah kandidat, bukan master data.

**Verdict: NEEDS BUSINESS CLARIFICATION**

---

## 2. LK Coverage

| Metrik | Jumlah |
|---|---:|
| Template `.docx` | **50** |
| Ada seksi fisik/fungsi | **49** |
| Tanpa seksi fisik | **1** — `LK Kelistrikan.docx` |
| Total baris Parameter | **266** |
| Item per LK | **2–9** |

Daftar file (50): Audiometer, Auto Chemistry Analyzer, Autoclave, Baby Incubator, Bed Side Monitor, Bio Safety Cabinet, Blanket Warmer, Blood Bank Refrigerator, Blood Pressure Monitor, Centrifuge, Centrifuge Refrigerator, Cold Chain / Vaccine Refrigerator, CPAP, Dental Unit, Dental X-Ray, Electro Accupunture (EST), Electrocardiograph, Examination Lamp, Fetal Doppler, Flow Meter, Head Lamp Medik, Hematologi Analyzer, Humidifier, Infant Warmer, Infusion Pump, Kelistrikan, Laminar Air Flow, Lampu Operasi, Laryngoskop, Medical Freezer, Medical Refrigerator, Mikroskop Laboratorium, Nebulizer Compressor, Nebulizer Ultrasonic, Oksigen Concentrator, Otoscope, Oven, pH Meter, Phaco Emulsifikasi, Phototherapy, Platelet Agitator Incubator, Pulse Oxymeter, Resusitator Paru dan Neopuff, Rotator, Sphygmomanometer, Spirometer, Sterilisator, Suction Pump, Syringe Pump, Thermohygrometer.

Urutan yang berulang pada 49 alat: identitas → daftar alat → lingkungan → **fisik/fungsi** → (kebanyakan) keselamatan listrik → kinerja → Telaah Teknis.

LK yang setelah fisik langsung ke kinerja (tanpa seksi listrik): Flow Meter, Oksigen Concentrator, Sphygmomanometer, Thermohygrometer, pH Meter.

Tidak ada `LK Ventilator.docx` / `LK Patient Monitor.docx` / `LK Breast Pump.docx` di korpus ini.

---

## 3. Physical Inspection Items by DeviceType

Pemetaan **nama file LK → kode DeviceType di seed**. Tanda `*` = kode muncul sebagai out-of-scope di `seed-device-taxonomy-extension-parameters.ts` dan **tidak** ada di `seed-device-types.ts`.

Jawaban semua baris di bawah: **Baik / Tidak Baik**. `Batas` = Batas Pemeriksaan (dipotong jika sangat panjang; teks penuh ada di dokumen LK).

### AUDIOMETER — `LK Audiometer.docx` (6)

| No | Parameter (asli) | Batas Pemeriksaan |
|---:|---|---|
| 1 | Badan dan permukaan alat | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya |
| 2 | Tusuk kontak alat | Periksa apakah ada gangguan pada tusuk kontak (AC-Power). Gerak-gerakan tusuk kontak… *tusuk kintak*… *bauta tau mur*… |
| 3 | Kabel catu utama (Line cord) | Periksa kabel… pindahkan/tukar… polaritas sama dengan yang lama |
| 4 | Tombol, saklar dan kontrol | sebelum mempergunakan/mengubah-ubah tombol kontrol… mode pemeriksaan standar… kembalikan setting awal |
| 5 | Tampilan dan indikator | Selama pengecekan fungsi, pastikan lampu indicator dan tampilan layar berfungsi seluruhnya… tampilan digital |
| 6 | Earphone | Pastikan type earphone sesuai dengan penggunaan audiometer dan kabel terhubung baik |

### AUTO_CHEMISTRY_ANALYZER* — `LK Auto Chemistry Analyzer.docx` (5)

Sama item 1–4 Audiometer; item 5 **Tampilan dan indicator** (ejaan *indicator*; *lampu indikator dan tampilan*).

### AUTOCLAVE — `LK Autoclave.docx` (5)

Sama 1–4 Audiometer; item 5 **Tampilan dan indikator** (seperti Audiometer).

### BABY_INCUBATOR — `LK Baby Incubator.docx` (9)

| No | Parameter | Batas (ringkas) |
|---:|---|---|
| 1 | Badan / Permukaan | bagian luar unit… tertimpa cairan… |
| 2 | Kotak kontak alat | gangguan pada kotak kontak (AC-Power)… baut atau mur |
| 3 | Kabel catu utama (Line cord) | versi panjang Line cord |
| 4 | Tombol, Saklar dan kontrol | familia batas panjang (posisi/mode standar) |
| 5 | Sensor suhu kulit | sensor bersih, tidak retak/rapuh; tidak menukar probe beda merk |
| 6 | Saringan udara | bersih, tidak tersumbat |
| 7 | Tampilan dan indicator | pengecekan fungsi… lampu indicator dan tampilan layar |
| 8 | Batas cairan | bak cairan terisi sesuai batas |
| 9 | Matras | kondisi; jika ada kemiringan, dapat digerakan dan aman terkunci |

### BED_SIDE_MONITOR — `LK Bed Side Monitor.docx` (5)

| No | Parameter | Batas (ringkas) |
|---:|---|---|
| 1 | Badan / Permukaan | bagian luar unit… |
| 2 | Kotak kontak alat | kotak kontak (AC-Power)… |
| 3 | Kabel catu utama | kerusakan atau isolasi terkelupas |
| 4 | Tombol, Saklar dan pengaman | familia batas panjang |
| 5 | Tampilan dan indikator | pengecekan fungsi… tampilan digital |

### BIO_SAFETY_CABINET — `LK Bio Safety Cabinet.docx` (6)

1 Badan / Permukaan; 2 Kotak kontak alat; 3 Kabel catu utama (pendek); **4 Sekering Pengaman** — *Periksa sekering… nilai tahanan dan tipenya sesuai spesifikasi… harus berfungsi dengan baik*; 5 Tombol, Saklar dan pengaman; 6 Tampilan dan indikator.

### BLANKET_WARMER — `LK Blanket Warmer.docx` (6)

1–3 badan/kotak/kabel (pendek); 4 Tampilan dan indikator; **5 Kompresor / pompa** — *pastikan berfungsi baik. Periksa tekanancyang dihasilkan secara berkala*; **6 Selang - selang** — *selang-selang sumber air, dan udara tekan. Pastikan tidak ada kebocoran*.

### BLOOD_BANK_REFRIGERATORS — `LK Blood Bank Refrigerator.docx` (5)

1 Badan / Permukaan; 2 Tusuk kontak alat; 3 Kabel catu utama (Line cord) **termasuk** *fungsi kabel chargernya*; 4 Tombol, saklar dan kontrol; 5 Tampilan dan indikator.

Pola **sama** (5 item, termasuk frase charger pada Line cord): Cold Chain/Vaccine Refrigerator, Medical Freezer, Medical Refrigerator, Oven, Sterilisator, Platelet Agitator Incubator. Mikroskop menambah lensa (bukan 5 item murni).

### BLOOD_PRESSURE_MONITOR — `LK Blood Pressure Monitor.docx` (5)

1 Badan / Permukaan; 2 Kotak kontak alat; 3 Kabel catu utama; 4 Tombol, saklar dan control; 5 Tampilan dan indikator.

### CENTRIFUGE / CENTRIFUGE_REFRIGERATOR / ROTATOR — masing-masing 5

1 Badan / Permukaan; 2 Kotak kontak alat; 3 Kabel catu utama; 4 Tombol, Saklar dan pengaman; 5 Tampilan dan indikator.

### COLD_CHAIN / KULKAS_VAKSIN — `LK Cold Chain, Vaccine Refrigerator.docx` (5)

Satu LK untuk dua kode DeviceType seed. Item sama Blood Bank (termasuk Line cord + charger).

### CPAP — `LK CPAP.docx` (6)

1 Badan / Permukaan; **2 Kotak Kontak Alat** (kapitalisasi berbeda); 3 Kabel catu utama; 4 Tombol, saklar dan control; 5 Tampilan dan indicator; **6 Selang dan konektor** — *sambungan sudah terpasang dan sesuai dengan spesifikasi CPAP*.

### DENTAL_UNIT — `LK Dental Unit.docx` (7)

1–5 seperti BSM (pengaman + tampilan); **6 Kompresor** — *Periksa tekanan yang dihasilkan secara berkala*; **7 Selang-selang** — *sumber air, dan udara. Pastikan tidak ada kebocoran*.

### DENTAL_XRAY — `LK Dental X-Ray.docx` (5)

1 Badan / Permukaan; **2 Mekanisme pergerakan** — *sistem pergerakan beroperasi dengan lancar… tidak suara aneh… pengendali Gerakan maju dan mundur*; 3 Kabel catu utama (Line cord); 4 Tombol, Saklar dan kontrol; 5 Tampilan dan indicator. **Tidak ada** item steker.

### ELECTRO_ACCUPUNTURE — `LK Electro Accupunture (EST).docx` (5)

1 Badan / Permukaan; 2 Kotak kontak alat; 3 Kabel catu utama (line cord) + charger; **4 Pengaman** — *Periksa aplikasi, keamanan dan system saat terdapat peringatan terjadinya error pada aplikasi*; **5 Control panel** — *Periksa control panel pada setiap panel potensiometer agar alat dapat bekerja dengan baik saat digunakan*. **Tidak ada** baris tampilan.

### ELECTROCARDIOGRAPHS — `LK Electrocardiograph.docx` (7)

1–4 badan/kotak/kabel/tombol; **5 Baterai/Charger** — fisik/konektor baterai; alarm baterai lemah → recharge; 6 Tampilan dan indikator; **7 Periksa kondisi charger** — masih baik… periode penggunaan/pengisian; rekomendasi pabrikan.

### EXAMINATION_LAMP / LAMPU_OPERASI — masing-masing 6

1–3 badan/kotak/kabel; 4 Tombol, Saklar dan control — *Periksa seluruhnya, pastikan berfungsi baik dan Kembali pada posisi pengaturan awal*; 5 Tampilan dan indikator; **6 System pengunci dan penyeimbang** — *Lakukan pemeriksaan system pengunci dan penyeimbang lampu*.

### FETAL_DOPPLER — `LK Fetal Doppler.docx` (6)

1–3 badan/kotak/kabel; **4 Kabel tranduser** — *periksa kabel dan fungsi masing-masing… sobekan atau terkelupas pada lapisan isolasinya*; 5 Tampilan dan indikator — *tampilan layer berfungsi baik*; 6 Tombol, saklar dan control — *Periksa semua tombol/saklar dan control, pastikan berfungsi baik*.

### FLOW_METER / OXYGEN_CONCENTRATORS — masing-masing 3

1 Badan / Permukaan; **2 Katup dan control** — posisi tombol control… *mode pemeriksaan standra*; **3 Tampilan dan indicator** — *indicator dan tampilan layer berfungsi baik*. Tidak ada steker/kabel.

### HEAD_LAMP_MEDIK — `LK Head Lamp Medik.docx` (5)

1 Badan / Permukaan; 2 Tombol, Saklar dan control — *berfungsi baik dan Kembali pada posisi pengaturan awal*; **3 Charging socket** — *system pengisian ulang battery berfungsi*; **4 Battery box** — *tidak ada tanda - tanda bocor yang bersumber dari battery*; **5 Lampu** — *periksa kondisi lampu*. Tidak ada kabel catu / kotak kontak.

### HEMATOLOGI_ANALYZER* — `LK Hematologi Analyzer.docx` (5)

Sama Auto Chemistry Analyzer.

### HUMIDIFIER — `LK Humidifier.docx` (5)

1 Badan / Permukaan; **2 Roda dan pengunci** — *Jika unit bergerak dengan roda… rem dan pengunci roda*; 3 Tusuk kontak alat (**judul tusuk, batas kotak kontak**); 4 Kabel catu utama (pendek); 5 Tombol, Saklar dan control. **Tidak ada tampilan.**

### INFANT_WARMER — `LK Infant Warmer.docx` (5)

1 Badan dan permukaan alat; 2 Roda dan pengunci; 3 Tusuk kontak alat; 4 Kabel catu utama (Line cord); 5 Tombol, saklar dan kontrol. **Tidak ada tampilan.**

### INFUSION_PUMP — `LK Infusion Pump.docx` (8)

1 Badan / Permukaan; 2 Tusuk kontak alat; 3 Kabel catu utama; 4 Tombol, saklar dan control; 5 Tampilan dan indicator; **6 System pengunci pergerakan**; **7 Alarm dan system interlock.** — *Periksa alarm dan system interlock pastikan berfungsi dengan baik*; **8 Motor/pompa penghisap** — *Periksa kondisi fisik motor dan pastikan berfungsi baik/normal*.

### ELECTRIC_BEDS — `LK Kelistrikan.docx` (0)

Tidak ada seksi fisik. Setelah lingkungan: **Pengukuran Keselamatan Listrik** lalu **Pengujian Kinerja** (empat parameter listrik numerik) lalu **Penilaian Secara Menyeluruh** (lima kategori risiko, bukan Baik/Tidak Baik per komponen).

### LAMINAR_AIR_FLOW — `LK Laminar Air Flow.docx` (6)

Sama BSC termasuk **Sekering Pengaman**.

### LARYNGOSKOP — `LK Laryngoskop.docx` (4)

1 Badan / Permukaan; 2 Kotak kontak alat; 3 Kabel catu utama; 4 Tampilan dan indikator. **Tidak ada tombol.**

### MEDICAL_FREEZER / MEDICAL_REFRIGERATOR — masing-masing 5

Sama Blood Bank (Line cord + charger).

### MIKROSKOP_LABORATORIUM — `LK Mikroskop Laboratorium.docx` (6)

1–4 badan/tusuk/Line cord+charger/tombol; **5 Lensa okuler** — *terpasang dengan baik, pastikan penguncinya bersih*; **6 Lensa Objective** — *Cek kebersihan lensa… Putar pemilihan lensa objective baik*. Tidak ada baris tampilan digital.

### NEBULIZER_COMPRESSOR / ULTRASONIC_NEBULIZERS — masing-masing 5

1 Badan / Permukaan; 2 Kotak kontak alat; 3 Kabel catu utama; 4 Tombol, Saklar dan control; 5 Tampilan dan indikator.

### OTOSCOPE* — `LK Otoscope.docx` (4)

Sama Laryngoskop (badan, kotak, kabel, tampilan). Audit lama: isi kinerja LK adalah uji sumber cahaya, bukan otoskop klinis.

### pH_METER* — `LK pH Meter.docx` (2)

1 Badan dan permukaan alat; **2 Kondisi Fungsi** — *Periksa apakah ada gangguan pada tusuk tombol dan display*.

### PHACO_EMULSIFIKASI* — `LK Phaco Emulsifikasi.docx` (7)

Hampir identik Suction tanpa motor: badan, kotak, kabel, Tombol Saklar dan pengaman, Tampilan dan indicator, Sistem pengunci pergerakan, Filter. Audit lama: kinerja LK = hisap/vakum seperti Suction Pump, bukan uji phaco.

### PHOTOTHERAPY — `LK Phototherapy.docx` (5)

1 Badan / Permukaan; **2 Rodan dan pengunci** (typo LK); 3 Kotak kontak alat; 4 Kabel catu utama (line cord); 5 Tombol, Saklar dan pengaman. **Tidak ada tampilan.**

### PULSE_OXIMETERS — `LK Pulse Oxymeter.docx` (6)

1–5 badan/kotak/kabel/tombol/tampilan; **6 Kelengkapan alat** — *Cek kelengkapan alat, pastikan lengkap dan berfungsi baik*.

### RESUSCITATORS_PULMONARY — `LK Resusitator Paru dan Neopuff.docx` (6)

1 Badan / Permukaan; **2 Selang utama sumber gas**; 3 Tombol, saklar dan control; 4 Tampilan dan indicator; **5 System interlock gas** — *Periksa system pengaman (interlock) gas befungsi baik*; **6 Kelengkapan alat**.

### SPHYGMOMANOMETERS — `LK Sphygmomanometer.docx` (8)

| No | Parameter | Batas |
|---:|---|---|
| 1 | Badan / Permukaan | bagian luar unit… |
| 2 | Balon tensi | tabung, selang, balon tensi… retak, bocor, tertekuk, kotor |
| 3 | Gauge/tabung | aneroid lembut tidak lengket; tabung raksa bersih; kolom naik lembut |
| 4 | Indicator | skala bersih mudah diliat; kaca penutup aneroid utuh |
| 5 | Konektor | semua kondisi konektor dalam kedaan baik |
| 6 | Label | label, plakat, stiker, atau kartu instruksi manual tersedia dan terbaca |
| 7 | Manset | bagus, bersih, tidak sobek |
| 8 | Pengaturan titik 0 | tanpa tekanan, gauge/raksa di 0 (**±1 mmHg**); prosedur isi/buang raksa / ganti aneroid |

Tidak ada steker/kabel listrik.

### SPIROMETER — `LK Spirometer.docx` (5)

1 Badan / Permukaan; 2 Tusuk kontak alat (batas mencampur *tusuk* dan *kotak kontak*); 3 Kabel catu utama; 4 Tombol, saklar dan control; 5 Tampilan dan indicator.

### STERILLIZER — `LK Sterilisator.docx` (5)

Sama Blood Bank.

### SUCTION_PUMP — `LK Suction Pump.docx` (8)

1–4 badan/kotak/kabel/Tombol Saklar dan pengaman; 5 Tampilan dan indicator; **6 Sistem pengunci pergerakan**; **7 Filter** — *tidak kotor*; **8 Motor/pompa penghisap** — *Periksa kondisi fisik motor dan pastikan berfungsi*.

### SYRINGE_PUMP — `LK Syringe Pump.docx` (8)

Seperti Infusion; item 7 **Alarm dsan system interlock.** (typo *dsan*); 8 Motor/pompa penghisap.

### THERMOHYGROMETER* — `LK Thermohygrometer.docx` (3)

1 Badan / Permukaan; **2 Baterai** — *Pastikan baterai berfungsi dengan baik*; 3 Tampilan dan indikator.

---

## 4. Common Items

Konsep yang muncul di banyak DeviceType. **Wording tidak disatukan.**

| Konsep | Perkiraan LK | Catatan |
|---|---:|---|
| Badan / permukaan | 49 | Semua LK yang punya seksi. Dua wording judul. |
| Steker AC | ~40 | `Kotak kontak` vs `Tusuk kontak` terpisah. Tidak pada Flow Meter, O2 Conc, Sphyg, Head Lamp, pH, Thermo, Kelistrikan. |
| Kabel catu | ~42 | Tiga wording judul; dua familia batas. |
| Tombol / saklar | ~40 | Enam+ wording judul. Tidak pada Laryngoskop, Otoscope, pH (digabung), Sphyg, Thermo, Kelistrikan. |
| Tampilan / indikator | ~40 | Infant Warmer, Humidifier, Head Lamp, EST, pH, Sphyg, Mikroskop, Phototherapy **tidak** memakai judul ini. |

Bukan “common” meskipun sering dicari di briefing: fuse hanya BSC+LAF; label hanya Sphyg; kata *casing* / *chassis* **tidak muncul**.

---

## 5. Device-Specific Items

| Original LK wording | DeviceType / LK |
|---|---|
| Earphone | AUDIOMETER |
| Sensor suhu kulit; Saringan udara; Batas cairan; Matras | BABY_INCUBATOR |
| Sekering Pengaman | BIO_SAFETY_CABINET, LAMINAR_AIR_FLOW |
| Kompresor / pompa; Selang - selang | BLANKET_WARMER |
| Selang dan konektor | CPAP |
| Kompresor; Selang-selang | DENTAL_UNIT |
| Mekanisme pergerakan | DENTAL_XRAY |
| Pengaman; Control panel | ELECTRO_ACCUPUNTURE |
| Baterai/Charger; Periksa kondisi charger | ELECTROCARDIOGRAPHS |
| System pengunci dan penyeimbang | EXAMINATION_LAMP, LAMPU_OPERASI |
| Kabel tranduser | FETAL_DOPPLER |
| Katup dan control | FLOW_METER, OXYGEN_CONCENTRATORS |
| Charging socket; Battery box; Lampu | HEAD_LAMP_MEDIK |
| Roda dan pengunci | HUMIDIFIER, INFANT_WARMER |
| Rodan dan pengunci | PHOTOTHERAPY |
| System/Sistem pengunci pergerakan | INFUSION_PUMP, SYRINGE_PUMP, SUCTION_PUMP, PHACO* |
| Alarm dan system interlock. | INFUSION_PUMP |
| Alarm dsan system interlock. | SYRINGE_PUMP |
| Filter | SUCTION_PUMP, PHACO* |
| Motor/pompa penghisap | SUCTION_PUMP, INFUSION_PUMP, SYRINGE_PUMP |
| Lensa okuler; Lensa Objective | MIKROSKOP_LABORATORIUM |
| Kondisi Fungsi | PH_METER* |
| Kelengkapan alat | PULSE_OXIMETERS, RESUSCITATORS_PULMONARY |
| Selang utama sumber gas; System interlock gas | RESUSCITATORS_PULMONARY |
| Balon tensi; Gauge/tabung; Indicator; Konektor; Label; Manset; Pengaturan titik 0 | SPHYGMOMANOMETERS |
| Baterai | THERMOHYGROMETER* |

**Copy-paste yang perlu dikonfirmasi:** *Motor/pompa penghisap* pada Infusion/Syringe; *fungsi kabel charger* pada Line cord kulkas/oven/sterilisator/mikroskop.

---

## 6. Wording Variants

Jangan di-merge tanpa keputusan bisnis.

| Konsep | Varian judul LK (dipertahankan terpisah) |
|---|---|
| Badan | `Badan / Permukaan` vs `Badan dan permukaan alat` |
| Steker | `Kotak kontak alat` vs `Kotak Kontak Alat` vs `Tusuk kontak alat` |
| Steker (judul vs batas) | Humidifier: judul **Tusuk**, batas menulis **kotak kontak**. Spirometer: judul tusuk, batas mencampur tusuk dan kotak |
| Kabel | `Kabel catu utama` vs `(Line cord)` vs `(line cord)` |
| Kabel (batas) | Pendek (isolasi terkelupas) vs panjang (ganti kabel + polaritas ± charger) |
| Kontrol | `Tombol, saklar dan kontrol` / `… kontrol` / `… control` / `Tombol, Saklar dan pengaman` |
| Kontrol (batas) | Prosa panjang (posisi/mode standar) vs pendek (*Periksa seluruhnya, pastikan berfungsi baik…*) |
| Katup | `Katup dan control` — kerabat, **bukan** judul tombol |
| Tampilan | `Tampilan dan indikator` vs `Tampilan dan indicator` |
| Skala Sphyg | `Indicator` — kaca/skala, bukan layar |
| Roda | `Roda dan pengunci` vs `Rodan dan pengunci` |
| Pengunci gerak | `Sistem pengunci pergerakan` vs `System pengunci pergerakan` vs `System pengunci dan penyeimbang` (lampu — konsep berbeda) |
| Interlock | `Alarm dan system interlock.` vs `Alarm dsan system interlock.` |
| Selang | `Selang - selang` vs `Selang-selang` vs `Selang dan konektor` vs `Selang utama sumber gas` |
| Baterai | `Baterai` vs `Battery box` vs `Baterai/Charger` vs `Charging socket` vs `Periksa kondisi charger` |

Typo LK yang dipertahankan: *Pemerikasaan*, *kintak*, *bauta tau*, *standra*, *kedaan*, *diliat*, *befungsi*, *dsan*, *Rodan*, *tranduser*, *tekanancyang*, *patikan*.

---

## 7. Ambiguous Items

Tidak dipaksa masuk Physical Inspection murni.

| Item | Mengapa tidak dipaksa |
|---|---|
| Seluruh seksi 49 LK | Judul **Fisik dan Fungsi**; satu verdict BAIK/TIDAK_BAIK |
| Tampilan dan indikator / indicator | Batas: *selama pengecekan fungsi* |
| Tombol (batas pendek) | “berfungsi baik” |
| Pengaturan titik 0 (Sphyg) | Ada **±1 mmHg** — mirip kinerja |
| Gauge/tabung (Sphyg) | Gerak jarum/raksa = uji mekanik/fungsi |
| Motor/pompa penghisap | Fisik **dan** fungsi; *penghisap* di Infusion/Syringe |
| Kompresor / pompa; Kompresor Dental | “tekanan … berkala” bisa kinerja |
| Alarm / interlock / System interlock gas | Fungsi pengaman |
| Charging socket | “sistem pengisian … berfungsi” |
| Baterai / Baterai/Charger / Periksa kondisi charger | ECG 5 vs 7 tumpang tindih; Thermo “baterai berfungsi” |
| Kondisi Fungsi (pH) | Satu baris untuk tombol **dan** display |
| Kelengkapan alat | Aksesori vs fungsi |
| Mekanisme pergerakan (Dental X-Ray) | Inspeksi gerak/suara vs kinerja |
| Phaco = pola Suction | LK mungkin salah label (bukti audit lama) |
| Otoscope | Pola lampu di kinerja, bukan otoskop |

---

## 8. Non-Physical Items

Ditemukan **dekat** seksi fisik, **bukan** kandidat `PhysicalCheckResult`:

- Pengukuran Kondisi Lingkungan (suhu/RH/tegangan + toleransi numerik).
- Pengukuran Keselamatan Listrik (resistansi pembumian, isolasi, arus bocor, kelas I/II, B/BF/CF).
- Hasil Pengukuran Kinerja / tabel Kalibrasi * (setpoint, replikasi, T1–T9, dll.).
- HEPA/smoke BSC — di kinerja, bukan tabel fisik.
- Telaah Teknis: Kondisi Alat (10) / Keselamatan Listrik / Kinerja — skor tertimbang, bukan ceklis komponen.
- Kesimpulan “Baik dan laik untuk digunakan” / “Tidak baik dan tidak laik…”.
- Kelistrikan: lima kategori risiko (*Aman tidak terjadi penyimpangan* … *disarankan modifikasi*).
- Daftar alat referensi; identitas header (merk, seri, kapasitas, resolusi).
- `DeviceCalibrationParameter` BOOLEAN `BSC_HEPA_LEAK` = kinerja, bukan fisik.

---

## 9. Candidate Master List

**Bukan seed final.** Satu baris = satu wording Parameter (tidak digabung). `Name` usulan = wording LK. Kode = usulan grouping, unik per `(deviceTypeId, code)` saat di-seed.

Confidence: **H** = jelas di seksi + Baik/Tidak Baik; **M** = fungsi kental di batas; **L** = numerik, collapsed, atau copy-paste/salah label.

| DeviceType | Code | Name | Original LK wording | inspectionLimit | Source LK | Confidence |
|---|---|---|---|---|---|---|
| 43 tipe (bukan 6 di baris berikutnya, bukan ELECTRIC_BEDS) | PHYS_BODY_SLASH | Badan / Permukaan | Badan / Permukaan | periksa bagian luar unit… tertimpa cairan… | 43 LK | H |
| AUDIOMETER, AUTOCLAVE, AUTO_CHEMISTRY*, HEMATOLOGI*, INFANT_WARMER, PH_METER* | PHYS_BODY_DAN | Badan dan permukaan alat | Badan dan permukaan alat | sama, biasanya tanpa titik akhir | 6 LK | H |
| ~23 tipe | PHYS_PLUG_KOTAK | Kotak kontak alat | Kotak kontak alat | gangguan kotak kontak (AC-Power)… baut/mur | banyak | H |
| CPAP | PHYS_PLUG_KOTAK_TITLE | Kotak Kontak Alat | Kotak Kontak Alat | hampir sama; *bauta tau mur* | CPAP | H |
| ~17 tipe | PHYS_PLUG_TUSUK | Tusuk kontak alat | Tusuk kontak alat | tusuk kontak… sering typo *kintak* | banyak | H |
| banyak | PHYS_CABLE_SHORT | Kabel catu utama | Kabel catu utama | kerusakan / isolasi terkelupas | banyak | H |
| banyak | PHYS_CABLE_LINECORD | Kabel catu utama (Line cord) | Kabel catu utama (Line cord) | batas panjang + polaritas (± charger) | banyak | H |
| ELECTRO_ACCUPUNTURE, PHOTOTHERAPY | PHYS_CABLE_LINECORD_LC | Kabel catu utama (line cord) | Kabel catu utama (line cord) | kapitalisasi berbeda | EST, Phototherapy | H |
| banyak | PHYS_CONTROLS_KONTROL | Tombol, saklar dan kontrol | Tombol, saklar dan kontrol | familia panjang atau pendek | banyak | H/M |
| banyak | PHYS_CONTROLS_CONTROL | Tombol, saklar dan control | Tombol, saklar dan control | ejaan *control* | banyak | H/M |
| banyak | PHYS_CONTROLS_PENGAMAN | Tombol, Saklar dan pengaman | Tombol, Saklar dan pengaman | judul *pengaman* | BSM, BSC, LAF, Suction, Phaco, Phototherapy, Centrifuge, Rotator, Dental Unit | H/M |
| FLOW_METER, OXYGEN_CONCENTRATORS | PHYS_VALVE_CONTROL | Katup dan control | Katup dan control | posisi tombol control… *standra* | 2 LK | M |
| banyak | PHYS_DISPLAY_INDIKATOR | Tampilan dan indikator | Tampilan dan indikator | *selama pengecekan fungsi*… digital | banyak | M |
| banyak | PHYS_DISPLAY_INDICATOR | Tampilan dan indicator | Tampilan dan indicator | ejaan *indicator* | banyak | M |
| AUDIOMETER | PHYS_EARPHONE | Earphone | Earphone | type earphone sesuai… kabel terhubung baik | Audiometer | H |
| BABY_INCUBATOR | PHYS_SKIN_SENSOR | Sensor suhu kulit | Sensor suhu kulit | bersih, tidak retak/rapuh; jangan tukar probe beda merk | Baby Incubator | H |
| BABY_INCUBATOR | PHYS_AIR_FILTER | Saringan udara | Saringan udara | bersih, tidak tersumbat | Baby Incubator | H |
| BABY_INCUBATOR | PHYS_WATER_LEVEL | Batas cairan | Batas cairan | bak cairan terisi sesuai batas | Baby Incubator | H |
| BABY_INCUBATOR | PHYS_MATTRESS | Matras | Matras | kemiringan dapat digerakan dan aman terkunci | Baby Incubator | M |
| BIO_SAFETY_CABINET, LAMINAR_AIR_FLOW | PHYS_FUSE | Sekering Pengaman | Sekering Pengaman | nilai tahanan/tipe sesuai spesifikasi; harus berfungsi | BSC, LAF | M |
| BLANKET_WARMER | PHYS_COMPRESSOR_PUMP | Kompresor / pompa | Kompresor / pompa | berfungsi baik; tekanan secara berkala | Blanket Warmer | L |
| BLANKET_WARMER | PHYS_HOSES_WATER_AIR | Selang - selang | Selang - selang | air dan udara tekan; tidak bocor | Blanket Warmer | H |
| CPAP | PHYS_HOSE_CONNECTOR_CPAP | Selang dan konektor | Selang dan konektor | sambungan sesuai spesifikasi CPAP | CPAP | H |
| DENTAL_UNIT | PHYS_COMPRESSOR | Kompresor | Kompresor | tekanan secara berkala | Dental Unit | L |
| DENTAL_UNIT | PHYS_HOSES_DENTAL | Selang-selang | Selang-selang | air dan udara; tidak bocor | Dental Unit | H |
| DENTAL_XRAY | PHYS_MOVEMENT | Mekanisme pergerakan | Mekanisme pergerakan | lancar, tidak menarik ke satu sisi, tidak suara aneh | Dental X-Ray | M |
| ELECTRO_ACCUPUNTURE | PHYS_SAFETY_APP | Pengaman | Pengaman | aplikasi/keamanan saat peringatan error | EST | M |
| ELECTRO_ACCUPUNTURE | PHYS_CONTROL_PANEL | Control panel | Control panel | potensiometer agar alat bekerja baik | EST | M |
| ELECTROCARDIOGRAPHS | PHYS_BATTERY_CHARGER | Baterai/Charger | Baterai/Charger | fisik/konektor; alarm lemah → recharge | ECG | M |
| ELECTROCARDIOGRAPHS | PHYS_CHARGER_CONDITION | Periksa kondisi charger | Periksa kondisi charger | masih baik; periode pengisian sesuai pabrikan | ECG | M |
| EXAMINATION_LAMP, LAMPU_OPERASI | PHYS_LAMP_BALANCE_LOCK | System pengunci dan penyeimbang | System pengunci dan penyeimbang | pengunci dan penyeimbang lampu | 2 LK | H |
| FETAL_DOPPLER | PHYS_TRANSDUCER_CABLE | Kabel tranduser | Kabel tranduser | kabel dan fungsi; sobekan isolasi | Fetal Doppler | H |
| HEAD_LAMP_MEDIK | PHYS_CHARGING_SOCKET | Charging socket | Charging socket | sistem pengisian ulang battery berfungsi | Head Lamp | M |
| HEAD_LAMP_MEDIK | PHYS_BATTERY_BOX | Battery box | Battery box | tidak ada tanda bocor dari battery | Head Lamp | H |
| HEAD_LAMP_MEDIK | PHYS_LAMP | Lampu | Lampu | periksa kondisi lampu | Head Lamp | H |
| HUMIDIFIER, INFANT_WARMER | PHYS_WHEELS_LOCK | Roda dan pengunci | Roda dan pengunci | roda, rem, pengunci | 2 LK | H |
| PHOTOTHERAPY | PHYS_WHEELS_LOCK_RODAN | Rodan dan pengunci | Rodan dan pengunci | sama makna roda | Phototherapy | H |
| INFUSION_PUMP, SYRINGE_PUMP, SUCTION_PUMP, PHACO* | PHYS_MOVEMENT_LOCK | System/Sistem pengunci pergerakan | System pengunci pergerakan / Sistem pengunci pergerakan | Lakukan pemeriksaan system pengunci pergerakan | 4 LK | M |
| INFUSION_PUMP | PHYS_ALARM_INTERLOCK | Alarm dan system interlock. | Alarm dan system interlock. | alarm dan interlock berfungsi baik | Infusion | M |
| SYRINGE_PUMP | PHYS_ALARM_INTERLOCK_DSAN | Alarm dsan system interlock. | Alarm dsan system interlock. | sama, typo *dsan* | Syringe | M |
| SUCTION_PUMP, PHACO* | PHYS_FILTER | Filter | Filter | tidak kotor | 2 LK | H |
| SUCTION_PUMP, INFUSION_PUMP, SYRINGE_PUMP | PHYS_MOTOR_SUCTION | Motor/pompa penghisap | Motor/pompa penghisap | fisik motor dan berfungsi (Infusion/Syringe: konfirmasi) | 3 LK | L |
| MIKROSKOP_LABORATORIUM | PHYS_EYEPIECE | Lensa okuler | Lensa okuler | terpasang baik; pengunci bersih | Mikroskop | H |
| MIKROSKOP_LABORATORIUM | PHYS_OBJECTIVE | Lensa Objective | Lensa Objective | kebersihan; putar pemilihan lensa | Mikroskop | M |
| PH_METER* | PHYS_FUNCTION_COLLAPSED | Kondisi Fungsi | Kondisi Fungsi | gangguan pada tusuk tombol dan display | pH Meter | L |
| PULSE_OXIMETERS, RESUSCITATORS_PULMONARY | PHYS_ACCESSORIES | Kelengkapan alat | Kelengkapan alat | lengkap dan berfungsi baik | 2 LK | M |
| RESUSCITATORS_PULMONARY | PHYS_GAS_HOSE | Selang utama sumber gas | Selang utama sumber gas | kerusakan; koneksi terikat kuat | Resus | H |
| RESUSCITATORS_PULMONARY | PHYS_GAS_INTERLOCK | System interlock gas | System interlock gas | pengaman (interlock) gas befungsi baik | Resus | M |
| SPHYGMOMANOMETERS | PHYS_BULB | Balon tensi | Balon tensi | tabung, selang, balon: retak/bocor/tertekuk/kotor | Sphyg | H |
| SPHYGMOMANOMETERS | PHYS_GAUGE_TUBE | Gauge/tabung | Gauge/tabung | gerak lembut; tabung raksa bersih | Sphyg | M |
| SPHYGMOMANOMETERS | PHYS_SCALE_GLASS | Indicator | Indicator | skala terbaca; kaca utuh | Sphyg | H |
| SPHYGMOMANOMETERS | PHYS_CONNECTOR | Konektor | Konektor | semua konektor dalam kedaan baik | Sphyg | H |
| SPHYGMOMANOMETERS | PHYS_LABEL | Label | Label | label/plakat/stiker/kartu instruksi terbaca | Sphyg | H |
| SPHYGMOMANOMETERS | PHYS_CUFF | Manset | Manset | bagus, bersih, tidak sobek | Sphyg | H |
| SPHYGMOMANOMETERS | PHYS_ZERO | Pengaturan titik 0 | Pengaturan titik 0 | titik 0 (**±1 mmHg**) | Sphyg | L |
| THERMOHYGROMETER* | PHYS_BATTERY | Baterai | Baterai | baterai berfungsi dengan baik | Thermohygrometer | M |
| ELECTRIC_BEDS | — | — | — | tidak ada item di seksi fisik | Kelistrikan | n/a |

Seed per-DeviceType menyalin baris di §3 (266 baris), bukan satu master global.

### Frequency / coverage (konsep, bukan merge)

| Konsep | # LK | # DeviceType (mapping §3) | Muncul di |
|---|---:|---|---|
| Badan (kedua wording) | 49 | 49 (+ Cold Chain bisa 2 kode) | semua kecuali Kelistrikan |
| Steker (kotak atau tusuk) | ~40 | ~40 | mayoritas mains |
| Kabel catu (semua judul) | ~42 | ~42 | mayoritas mains |
| Tombol/saklar/kontrol (bukan katup) | ~40 | ~40 | mayoritas |
| Tampilan (indikator/indicator, bukan Sphyg Indicator) | ~40 | ~40 | mayoritas berkabel + layar |
| Sekering Pengaman | 2 | 2 | BSC, LAF |
| Label | 1 | 1 | Sphyg |

---

## 10. Proposed Code Convention

Usulan saja, **bukan master final**:

- Pola: `PHYS_<KONSEP>` dalam `SCREAMING_SNAKE`.
- Unik per `(deviceTypeId, code)` — analog `DeviceCalibrationParameter` tanpa `capabilityItemId`.
- Jangan pakai nomor urut LK di `code`; urutan = `sortOrder` = No. LK.
- `name` = wording Parameter LK (jangan dinormalisasi diam-diam).
- `inspectionLimit` = Batas Pemeriksaan apa adanya.
- Varian ejaan → kode terpisah sampai bisnis menggabungkan.
- Item ambigu (confidence L): jangan dianggap kode final.

---

## 11. inspectionLimit Findings

- Nama kolom LK: **Batas Pemeriksaan**.
- Isi: instruksi teknisi, analog prosa `toleranceNote`, **bukan** `toleranceMin`/`toleranceMax`.
- Satu batas numerik eksplisit: Sphyg **titik 0 (±1 mmHg)**.
- Checkbox Word menyisakan angka field (`37465…`) — **bukan** hasil ukur.
- Banyak batas mencampur inspeksi visual dan “pastikan berfungsi”.

---

## 12. Repository Cross-Check

- `DeviceType` di `packages/db/prisma/schema.prisma`: global, tanpa `companyId`. **Tidak ada** relasi physical check.
- `seed-device-types.ts`: 59 tipe. Tidak ada item fisik.
- `DeviceCalibrationParameter`: wajib `capabilityItemId`; kinerja/listrik/lingkungan.
- `BSC_HEPA_LEAK` BOOLEAN = kinerja.
- `backfill-calibration-ordering.ts`: komentar urutan LK *environmental → physical/function check → electrical → performance* = urutan kapabilitas ukur, **bukan** catalog fisik.
- `DeviceTypeAlias`: matching nama pelanggan, bukan ceklis.
- LK tanpa DeviceType di seed: Auto Chemistry Analyzer, Hematologi Analyzer, pH Meter, Thermohygrometer, Otoscope, Phaco (`EXCLUDED_TYPE_CODES`).
- `LK Kelistrikan` ↔ `ELECTRIC_BEDS` — 0 item fisik.
- Satu LK Cold Chain untuk `COLD_CHAIN` dan `KULKAS_VAKSIN`.
- `PATIENT_MONITOR` / `OXYMETER_MONITOR` / `RADIANT_WARMER` / `BREAST_PUMPS` / `VENTILATOR`: tidak ada LK sendiri di korpus 50; **jangan** menyalin item tanpa keputusan.
- Tidak ada `PhysicalCheck` / `BAIK` / `TIDAK_BAIK` di schema/API/PWA (hanya dokumen desain).

---

## 13. Recommended Seed Candidates

Setelah klarifikasi bisnis, kandidat teknis yang paling aman:

1. **49 DeviceType yang punya seksi** — satu `DevicePhysicalCheckItem` per baris LK; `name` = Parameter asli; `inspectionLimit` = Batas Pemeriksaan; `sortOrder` = No. LK.
2. **Jangan seed ELECTRIC_BEDS** dari LK Kelistrikan.
3. **Jangan seed** tipe `*` sebelum ada baris DeviceType.
4. **Jangan** menormalkan Body/Plug/Cable menjadi satu baris global.
5. Infusion/Syringe **Motor/pompa penghisap**, Phaco-as-Suction, Otoscope-as-lampu: seed hanya setelah konfirmasi.
6. Cold Chain: putuskan satu set item vs dua DeviceType.

---

## 14. Items Requiring Human Confirmation

1. Satu domain Physical Inspection vs pemisahan fungsi (tampilan, alarm, motor)?
2. Merge wording (Badan / vs dan; kotak vs tusuk; Line cord vs pendek)?
3. Sphyg titik 0: fisik atau kinerja?
4. ECG item 5 vs 7 charger.
5. pH “Kondisi Fungsi”.
6. Copy-paste *penghisap* / *kabel charger* pada alat yang tidak relevan.
7. Phaco & Otoscope: ikuti file atau jenis alat yang benar?
8. Cold Chain: satu atau dua DeviceType?
9. Kelistrikan: memang tanpa fisik?
10. Telaah “Kondisi Alat (10)” vs 266 baris ceklis — jangan digabung.
11. Apakah `PATIENT_MONITOR` mewarisi item Bed Side Monitor?

---

## 15. Final Conclusion

**NEEDS BUSINESS CLARIFICATION**

Inventaris LK **lengkap dan konsisten secara struktur** (49/50, 266 baris, BAIK/TIDAK_BAIK, Batas Pemeriksaan), tetapi LK **tidak memisahkan fisik vs fungsi**, wording **tidak kanonik**, beberapa baris **numerik/kinerja/copy-paste**, dan **sebagian LK tidak punya DeviceType** di master.

Seed `DevicePhysicalCheckItem` sebelum keputusan itu akan mengunci semantik yang LK sendiri tidak tetapkan.

**NO CODE WAS MODIFIED.**
