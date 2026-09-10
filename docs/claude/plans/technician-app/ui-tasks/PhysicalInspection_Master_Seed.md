# Physical Inspection — Master Seed Audit

**Tanggal:** 2026-09-10  
**Mode:** READ-ONLY / PREPARE ONLY — **seed TIDAK dijalankan**; DeviceType / DeviceCalibrationParameter / DB **tidak dimodifikasi**.  
**Verdict:** `READY_FOR_REVIEW`

---

## 1. Architectural Boundary

Physical Inspection adalah **konfigurasi paralel** di bawah `DeviceType`, **bukan** bagian dari Device Calibration Parameters.

```
DeviceType
│
├── Device Calibration configuration
│     └── DeviceCalibrationParameter[]
│           └── CalibrationTestPoint[]
│                 └── MeasurementResult[]
│
└── Physical Inspection configuration
      └── DevicePhysicalCheckItem[]
            └── PhysicalCheckResult[]
```

Konsekuensi yang dikunci:

| YA | TIDAK |
|---|---|
| `DevicePhysicalCheckItem` → `DeviceType` | `DevicePhysicalCheckItem` → `DeviceCalibrationParameter` |
| Parallel children of DeviceType | Relasi ke `DeviceCapability` / `DeviceCapabilityItem` |
| Section job: **Pemeriksaan Fisik** | Item di dalam `capabilityGroups` / Hasil Pengukuran |
| Verdict `BAIK` / `TIDAK_BAIK` | Tolerance / UOM / valueType / entryStyle / testPoint |

UI (tidak diimplementasikan di task ini) harus memisahkan:

```
Calibration Job
├── Alat Acuan
├── Pemeriksaan Fisik      ← PhysicalCheckResult
└── Hasil Pengukuran       ← MeasurementResult
```

Seed ini **hanya** menyiapkan baris `DevicePhysicalCheckItem`. Tidak ada wiring ke parameter ukur.

---

## 2. Source

| Prioritas | Sumber | Peran |
|---:|---|---|
| 1 | `packages/db/prisma/seed-device-types.ts` (59 DeviceType) | Anchor — **hanya direferensikan**, tidak diubah |
| 2 | `docs/technician-docs/Lembar-Kerja/*.docx` (50 template) | Teks Parameter + Batas Pemeriksaan (ekstrak `word/document.xml`) |
| 3 | `PhysicalInspection_LK_Master_Candidate_Audit.md` | Inventaris + mapping LK → kode DeviceType |
| 4 | 11 locked business decisions (task §5) | Aturan seed / non-seed |

Metode: ekstraksi lokal read-only dari `.docx` (Zip + strip XML). Checkbox Word (`37465…Baik`) dibuang. Tidak ada insert DB.

---

## 3. Coverage Summary

| DeviceType | LK Source | Item Count | Status |
|---|---|---:|---|
| `AUDIOMETER` | `LK Audiometer.docx` | 6 | READY |
| `AUTOCLAVE` | `LK Autoclave.docx` | 5 | READY |
| `BABY_INCUBATOR` | `LK Baby Incubator.docx` | 9 | READY |
| `BED_SIDE_MONITOR` | `LK Bed Side Monitor.docx` | 5 | READY |
| `BIO_SAFETY_CABINET` | `LK Bio Safety Cabinet.docx` | 6 | READY |
| `BLANKET_WARMER` | `LK Blanket Warmer.docx` | 6 | READY |
| `BLOOD_BANK_REFRIGERATORS` | `LK Blood Bank Refrigerator.docx` | 5 | READY |
| `BLOOD_PRESSURE_MONITOR` | `LK Blood Pressure Monitor.docx` | 5 | READY |
| `CENTRIFUGE` | `LK Centrifuge.docx` | 5 | READY |
| `CENTRIFUGE_REFRIGERATOR` | `LK Centrifuge Refrigerator.docx` | 5 | READY |
| `COLD_CHAIN` | `LK Cold Chain, Vaccine Refrigerator.docx` | 5 | READY |
| `CPAP` | `LK CPAP.docx` | 6 | READY |
| `DENTAL_UNIT` | `LK Dental Unit.docx` | 7 | READY |
| `DENTAL_XRAY` | `LK Dental X-Ray.docx` | 5 | READY |
| `ELECTROCARDIOGRAPHS` | `LK Electrocardiograph.docx` | 7 | READY |
| `ELECTRO_ACCUPUNTURE` | `LK Electro Accupunture (EST).docx` | 5 | READY |
| `EXAMINATION_LAMP` | `LK Examination Lamp.docx` | 6 | READY |
| `FETAL_DOPPLER` | `LK Fetal Doppler.docx` | 6 | READY |
| `FLOW_METER` | `LK Flow Meter.docx` | 3 | READY |
| `HEAD_LAMP_MEDIK` | `LK Head Lamp Medik.docx` | 5 | READY |
| `HUMIDIFIER` | `LK Humidifier.docx` | 5 | READY |
| `INFANT_WARMER` | `LK Infant Warmer.docx` | 5 | READY |
| `INFUSION_PUMP` | `LK Infusion Pump.docx` | 8 | READY |
| `KULKAS_VAKSIN` | `LK Cold Chain, Vaccine Refrigerator.docx` | 5 | READY |
| `LAMINAR_AIR_FLOW` | `LK Laminar Air Flow.docx` | 6 | READY |
| `LAMPU_OPERASI` | `LK Lampu Operasi.docx` | 6 | READY |
| `LARYNGOSKOP` | `LK Laryngoskop.docx` | 4 | READY |
| `MEDICAL_FREEZER` | `LK Medical Freezer.docx` | 5 | READY |
| `MEDICAL_REFRIGERATOR` | `LK Medical Refrigerator.docx` | 5 | READY |
| `MIKROSKOP_LABORATORIUM` | `LK Mikroskop Laboratorium.docx` | 6 | READY |
| `NEBULIZER_COMPRESSOR` | `LK Nebulizer Compressor.docx` | 5 | READY |
| `OVEN` | `LK Oven.docx` | 5 | READY |
| `OXYGEN_CONCENTRATORS` | `LK Oksigen Concentrator.docx` | 3 | READY |
| `PHOTOTHERAPY` | `LK Phototherapy.docx` | 5 | READY |
| `PLATELET_AGITATOR_INCUBATOR` | `LK Platelet Agitator Incubator.docx` | 5 | READY |
| `PULSE_OXIMETERS` | `LK Pulse Oxymeter.docx` | 6 | READY |
| `RESUSCITATORS_PULMONARY` | `LK Resusitator Paru dan Neopuff.docx` | 6 | READY |
| `ROTATOR` | `LK Rotator.docx` | 5 | READY |
| `SPHYGMOMANOMETERS` | `LK Sphygmomanometer.docx` | 8 | READY |
| `SPIROMETER` | `LK Spirometer.docx` | 5 | READY |
| `STERILLIZER` | `LK Sterilisator.docx` | 5 | READY |
| `SUCTION_PUMP` | `LK Suction Pump.docx` | 8 | READY |
| `SYRINGE_PUMP` | `LK Syringe Pump.docx` | 8 | READY |
| `ULTRASONIC_NEBULIZERS` | `LK Nebulizer Ultrasonic.docx` | 5 | READY |
| `ELECTRIC_BEDS` | `LK Kelistrikan.docx` | 0 | READY (intentional zero) |
| `PATIENT_MONITOR` | *(no LK in corpus)* | 0 | REVIEW — unresolved |
| `AMBULATORY_ECG` | *(no LK in 50-template corpus)* | 0 | ZERO — no LK source |
| `ASPIRATORS_SUCTION` | *(no LK in 50-template corpus)* | 0 | ZERO — no LK source |
| `BREAST_PUMPS` | *(no LK in 50-template corpus)* | 0 | ZERO — no LK source |
| `CARDIAC_OUTPUT_UNITS` | *(no LK in 50-template corpus)* | 0 | ZERO — no LK source |
| `OXYGEN_AIR_PROPORTIONERS` | *(no LK in 50-template corpus)* | 0 | ZERO — no LK source |
| `OXYMETER_MONITOR` | *(no LK in 50-template corpus)* | 0 | ZERO — no LK source |
| `PARAFFIN_BATHS` | *(no LK in 50-template corpus)* | 0 | ZERO — no LK source |
| `RADIANT_WARMER` | *(no LK in 50-template corpus)* | 0 | ZERO — no LK source |
| `RADIANT_WARMERS_ADULT` | *(no LK in 50-template corpus)* | 0 | ZERO — no LK source |
| `REGULATORS_AIR_O2_SUCTION` | *(no LK in 50-template corpus)* | 0 | ZERO — no LK source |
| `REGULATORS_LOW_VOLUME_SUCTION` | *(no LK in 50-template corpus)* | 0 | ZERO — no LK source |
| `RESUSCITATORS_CARDIAC` | *(no LK in 50-template corpus)* | 0 | ZERO — no LK source |
| `VENTILATOR` | *(no LK in 50-template corpus)* | 0 | ZERO — no LK source |
| *(missing)* `AUTO_CHEMISTRY_ANALYZER (not in seed-device-types.ts)` | `LK Auto Chemistry Analyzer.docx` | 5 | MAPPING_REVIEW_REQUIRED |
| *(missing)* `HEMATOLOGI_ANALYZER (not in seed-device-types.ts)` | `LK Hematologi Analyzer.docx` | 5 | MAPPING_REVIEW_REQUIRED |
| *(missing)* `OTOSCOPE (not in seed-device-types.ts)` | `LK Otoscope.docx` | 4 | MAPPING_REVIEW_REQUIRED |
| *(missing)* `PH_METER (not in seed-device-types.ts)` | `LK pH Meter.docx` | 2 | MAPPING_REVIEW_REQUIRED |
| *(missing)* `PHACO_EMULSIFIKASI (not in seed-device-types.ts)` | `LK Phaco Emulsifikasi.docx` | 7 | MAPPING_REVIEW_REQUIRED |
| *(missing)* `THERMOHYGROMETER (not in seed-device-types.ts)` | `LK Thermohygrometer.docx` | 3 | MAPPING_REVIEW_REQUIRED |

**Ringkas seedable:**

| Metrik | Nilai |
|---|---:|
| DeviceType existing di master | 59 |
| DeviceType dengan item diusulkan | **44** |
| Total proposed `DevicePhysicalCheckItem` | **246** |
| DeviceType intentional zero (`ELECTRIC_BEDS`) | 1 |
| DeviceType unresolved (`PATIENT_MONITOR`) | 1 |
| DeviceType existing tanpa LK di korpus | 13 |
| LK dengan seksi tetapi DeviceType **tidak ada** di master | 6 |

Catatan Cold Chain: **satu** LK `LK Cold Chain, Vaccine Refrigerator.docx` → item digandakan ke `COLD_CHAIN` **dan** `KULKAS_VAKSIN` (masing-masing 5), tanpa entity checklist global.

---

## 4. Final Proposed Seed Dataset

Ini artefak review utama. **Setiap** baris yang diusulkan untuk seed ditampilkan.

- `deviceTypeId` = resolve runtime: `DeviceType` existing by `code` (cuid; **jangan** hardcode ID di dokumen ini).
- `code` = `<DEVICE_TYPE_CODE>_PHYSICAL_NNN` mengikuti No. LK.
- `sortOrder` = `No. LK × 10` (10, 20, 30…) — urutan LK, bukan alfabet.
- `isActive` = `true`.
- `name` / `inspectionLimit` = wording LK apa adanya (termasuk typo).

| DeviceType | DeviceType ID | Code | Name | Inspection Limit | Sort Order | Active |
|---|---|---|---|---|---:|---|
| `AUDIOMETER` | resolve `DeviceType.id` where `code="AUDIOMETER"` | `AUDIOMETER_PHYSICAL_001` | Badan dan permukaan alat | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya | 10 | true |
| `AUDIOMETER` | resolve `DeviceType.id` where `code="AUDIOMETER"` | `AUDIOMETER_PHYSICAL_002` | Tusuk kontak alat | Periksa apakah ada gangguan pada tusuk kontak (AC-Power). Gerak-gerakan tusuk kontak untuk memastikan keamanannya. Goyang-goyangkan tusuk kintak untuk memastikan tidak ada bauta tau mur yang longgar. Jika ada, buka mur dan ganti dan perbaiki bila perlu. | 20 | true |
| `AUDIOMETER` | resolve `DeviceType.id` where `code="AUDIOMETER"` | `AUDIOMETER_PHYSICAL_003` | Kabel catu utama (Line cord) | Periksa kabel, apakah terlihat ada kerusakan. Jika ada pindahkan atau tukar kabel yang rusak. Jika kerusakan disekitar ujung kabel singkirkan bagian yang rusak dan ganti dengan yang baru. Pastikan kabel power yang baru ataupun kotak kontak yang baru mempunyai polaritas yang sama dengan yang lama. | 30 | true |
| `AUDIOMETER` | resolve `DeviceType.id` where `code="AUDIOMETER"` | `AUDIOMETER_PHYSICAL_004` | Tombol, saklar dan kontrol | sebelum mempergunakan/mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi control. Ingat peraturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan. | 40 | true |
| `AUDIOMETER` | resolve `DeviceType.id` where `code="AUDIOMETER"` | `AUDIOMETER_PHYSICAL_005` | Tampilan dan indikator | Selama pengecekan fungsi, pastikan lampu indicator dan tampilan layar berfungsi seluruhnya, yakinkan bahwa bagian tampilan digital berfungsi. | 50 | true |
| `AUDIOMETER` | resolve `DeviceType.id` where `code="AUDIOMETER"` | `AUDIOMETER_PHYSICAL_006` | Earphone | Pastikan type earphone sesuai dengan penggunaan audiometer dan kabel terhubung baik | 60 | true |
| `AUTOCLAVE` | resolve `DeviceType.id` where `code="AUTOCLAVE"` | `AUTOCLAVE_PHYSICAL_001` | Badan dan permukaan alat | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya | 10 | true |
| `AUTOCLAVE` | resolve `DeviceType.id` where `code="AUTOCLAVE"` | `AUTOCLAVE_PHYSICAL_002` | Tusuk kontak alat | Periksa apakah ada gangguan pada tusuk kontak (AC-Power). Gerak-gerakan tusuk kontak untuk memastikan keamanannya. Goyang-goyangkan tusuk kintak untuk memastikan tidak ada bauta tau mur yang longgar. Jika ada, buka mur dan ganti dan perbaiki bila perlu. | 20 | true |
| `AUTOCLAVE` | resolve `DeviceType.id` where `code="AUTOCLAVE"` | `AUTOCLAVE_PHYSICAL_003` | Kabel catu utama (Line cord) | Periksa kabel, apakah terlihat ada kerusakan. Jika ada pindahkan atau tukar kabel yang rusak. Jika kerusakan disekitar ujung kabel singkirkan bagian yang rusak dan ganti dengan yang baru. Pastikan kabel power yang baru ataupun kotak kontak yang baru mempunyai polaritas yang sama dengan yang lama. | 30 | true |
| `AUTOCLAVE` | resolve `DeviceType.id` where `code="AUTOCLAVE"` | `AUTOCLAVE_PHYSICAL_004` | Tombol, saklar dan kontrol | sebelum mempergunakan/mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi control. Ingat peraturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan. | 40 | true |
| `AUTOCLAVE` | resolve `DeviceType.id` where `code="AUTOCLAVE"` | `AUTOCLAVE_PHYSICAL_005` | Tampilan dan indikator | Selama pengecekan fungsi, pastikan lampu indicator dan tampilan layar berfungsi seluruhnya, yakinkan bahwa bagian tampilan digital berfungsi. | 50 | true |
| `BABY_INCUBATOR` | resolve `DeviceType.id` where `code="BABY_INCUBATOR"` | `BABY_INCUBATOR_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `BABY_INCUBATOR` | resolve `DeviceType.id` where `code="BABY_INCUBATOR"` | `BABY_INCUBATOR_PHYSICAL_002` | Kotak kontak alat | periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar. | 20 | true |
| `BABY_INCUBATOR` | resolve `DeviceType.id` where `code="BABY_INCUBATOR"` | `BABY_INCUBATOR_PHYSICAL_003` | Kabel catu utama (Line cord) | Periksa kabel, apakah terlihat ada kerusakan. Jika ada pindahkan atau tukar kabel yang rusak. Jika kerusakan disekitar ujung kabel singkirkan bagian yang rusak dan ganti dengan yang baru. Pastikan kabel power yang baru ataupun kotak kontak yang baru mempunyai polaritas yang sama dengan yang lama. | 30 | true |
| `BABY_INCUBATOR` | resolve `DeviceType.id` where `code="BABY_INCUBATOR"` | `BABY_INCUBATOR_PHYSICAL_004` | Tombol, Saklar dan kontrol | sebelum mempergunakan/mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi control. Ingat peraturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan. | 40 | true |
| `BABY_INCUBATOR` | resolve `DeviceType.id` where `code="BABY_INCUBATOR"` | `BABY_INCUBATOR_PHYSICAL_005` | Sensor suhu kulit | pastikan semua sensor dalam kondisi bersih dan tidak retak / rapuh, dan tidak dibolehkan menukar probe pada alat lain dengan merk yang berbeda. | 50 | true |
| `BABY_INCUBATOR` | resolve `DeviceType.id` where `code="BABY_INCUBATOR"` | `BABY_INCUBATOR_PHYSICAL_006` | Saringan udara | pastikan saringan udara dalam keadaan bersih dan tidak tersumbat agar aliran udara dapat masuk/melewati filter dengan leluasa. | 60 | true |
| `BABY_INCUBATOR` | resolve `DeviceType.id` where `code="BABY_INCUBATOR"` | `BABY_INCUBATOR_PHYSICAL_007` | Tampilan dan indicator | selama pengecekan fungsi pastikan lampu indicator dan tampilan layar berfungsi seluruhnya, yakinkan bahwa bagian tampilan digital berfungsi. | 70 | true |
| `BABY_INCUBATOR` | resolve `DeviceType.id` where `code="BABY_INCUBATOR"` | `BABY_INCUBATOR_PHYSICAL_008` | Batas cairan | periksa bak cairan pada wadah air dan pastikan terisi sesuai batas. | 80 | true |
| `BABY_INCUBATOR` | resolve `DeviceType.id` where `code="BABY_INCUBATOR"` | `BABY_INCUBATOR_PHYSICAL_009` | Matras | pastikan dalam kondisi, jika tersedia pengaturan posisi kemiringan, patikan untuk dapat digerakan dan aman bila posisi terkunci. | 90 | true |
| `BED_SIDE_MONITOR` | resolve `DeviceType.id` where `code="BED_SIDE_MONITOR"` | `BED_SIDE_MONITOR_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `BED_SIDE_MONITOR` | resolve `DeviceType.id` where `code="BED_SIDE_MONITOR"` | `BED_SIDE_MONITOR_PHYSICAL_002` | Kotak kontak alat | periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar. | 20 | true |
| `BED_SIDE_MONITOR` | resolve `DeviceType.id` where `code="BED_SIDE_MONITOR"` | `BED_SIDE_MONITOR_PHYSICAL_003` | Kabel catu utama | periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas. | 30 | true |
| `BED_SIDE_MONITOR` | resolve `DeviceType.id` where `code="BED_SIDE_MONITOR"` | `BED_SIDE_MONITOR_PHYSICAL_004` | Tombol, Saklar dan pengaman | sebelum mempergunakan/mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi control. Ingat peraturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan. | 40 | true |
| `BED_SIDE_MONITOR` | resolve `DeviceType.id` where `code="BED_SIDE_MONITOR"` | `BED_SIDE_MONITOR_PHYSICAL_005` | Tampilan dan indikator | selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi | 50 | true |
| `BIO_SAFETY_CABINET` | resolve `DeviceType.id` where `code="BIO_SAFETY_CABINET"` | `BIO_SAFETY_CABINET_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `BIO_SAFETY_CABINET` | resolve `DeviceType.id` where `code="BIO_SAFETY_CABINET"` | `BIO_SAFETY_CABINET_PHYSICAL_002` | Kotak kontak alat | periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar. | 20 | true |
| `BIO_SAFETY_CABINET` | resolve `DeviceType.id` where `code="BIO_SAFETY_CABINET"` | `BIO_SAFETY_CABINET_PHYSICAL_003` | Kabel catu utama | periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas. | 30 | true |
| `BIO_SAFETY_CABINET` | resolve `DeviceType.id` where `code="BIO_SAFETY_CABINET"` | `BIO_SAFETY_CABINET_PHYSICAL_004` | Sekering Pengaman | Periksa sekering yang terdapat pada bagian luar rangkaian, apakah nilai tahanan dan tipenya sesuai dengan spesifikasi yang tertulis pada alat. Sekering pengaman harus berfungsi dengan baik. | 40 | true |
| `BIO_SAFETY_CABINET` | resolve `DeviceType.id` where `code="BIO_SAFETY_CABINET"` | `BIO_SAFETY_CABINET_PHYSICAL_005` | Tombol, Saklar dan pengaman | sebelum mempergunakan/mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi control. Ingat peraturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan. | 50 | true |
| `BIO_SAFETY_CABINET` | resolve `DeviceType.id` where `code="BIO_SAFETY_CABINET"` | `BIO_SAFETY_CABINET_PHYSICAL_006` | Tampilan dan indikator | selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi | 60 | true |
| `BLANKET_WARMER` | resolve `DeviceType.id` where `code="BLANKET_WARMER"` | `BLANKET_WARMER_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `BLANKET_WARMER` | resolve `DeviceType.id` where `code="BLANKET_WARMER"` | `BLANKET_WARMER_PHYSICAL_002` | Kotak kontak alat | periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar. | 20 | true |
| `BLANKET_WARMER` | resolve `DeviceType.id` where `code="BLANKET_WARMER"` | `BLANKET_WARMER_PHYSICAL_003` | Kabel catu utama | periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas. | 30 | true |
| `BLANKET_WARMER` | resolve `DeviceType.id` where `code="BLANKET_WARMER"` | `BLANKET_WARMER_PHYSICAL_004` | Tampilan dan indikator | selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi | 40 | true |
| `BLANKET_WARMER` | resolve `DeviceType.id` where `code="BLANKET_WARMER"` | `BLANKET_WARMER_PHYSICAL_005` | Kompresor / pompa | pastikan berfungsi baik. Periksa tekanancyang dihasilkan secara berkala | 50 | true |
| `BLANKET_WARMER` | resolve `DeviceType.id` where `code="BLANKET_WARMER"` | `BLANKET_WARMER_PHYSICAL_006` | Selang – selang | Periksa selang-selang sumber air, dan udara tekan. Pastikan tidak ada kebocoran | 60 | true |
| `BLOOD_BANK_REFRIGERATORS` | resolve `DeviceType.id` where `code="BLOOD_BANK_REFRIGERATORS"` | `BLOOD_BANK_REFRIGERATORS_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `BLOOD_BANK_REFRIGERATORS` | resolve `DeviceType.id` where `code="BLOOD_BANK_REFRIGERATORS"` | `BLOOD_BANK_REFRIGERATORS_PHYSICAL_002` | Tusuk kontak alat | Periksa apakah ada gangguan pada tusuk kontak (AC power). Gerak-gerakan tusuk kontak untuk memastikan kemaanannya. Goyang-goyangkan tusuk kontak untuk untuk memastikan tidak ada bauta tau mur yang longgar. Jika ada, buka mur dan ganti dan perbaiki bila perlu. | 20 | true |
| `BLOOD_BANK_REFRIGERATORS` | resolve `DeviceType.id` where `code="BLOOD_BANK_REFRIGERATORS"` | `BLOOD_BANK_REFRIGERATORS_PHYSICAL_003` | Kabel catu utama (Line cord) | Periksa kabel, apakah terlihat ada kerusakan. Jika ada pindahkan atau tukar kabel yang rusak. Jika kerusakan disekitar ujung kabel singkirkan bagian yang rusak dan ganti dengan yang baru. Pastikan kabel power yang baru ataupun kotak kontak yang baru mempunyai polaritas yang sama dengan yang lama. Periksa juga fungsi kabel chargernya waktu dipergunakan untuk mengisi ulang. | 30 | true |
| `BLOOD_BANK_REFRIGERATORS` | resolve `DeviceType.id` where `code="BLOOD_BANK_REFRIGERATORS"` | `BLOOD_BANK_REFRIGERATORS_PHYSICAL_004` | Tombol, saklar dan kontrol | Sebelum mempergunakan/ mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi kontrol. Ingat pengaturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan. | 40 | true |
| `BLOOD_BANK_REFRIGERATORS` | resolve `DeviceType.id` where `code="BLOOD_BANK_REFRIGERATORS"` | `BLOOD_BANK_REFRIGERATORS_PHYSICAL_005` | Tampilan dan indikator | selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi | 50 | true |
| `BLOOD_PRESSURE_MONITOR` | resolve `DeviceType.id` where `code="BLOOD_PRESSURE_MONITOR"` | `BLOOD_PRESSURE_MONITOR_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `BLOOD_PRESSURE_MONITOR` | resolve `DeviceType.id` where `code="BLOOD_PRESSURE_MONITOR"` | `BLOOD_PRESSURE_MONITOR_PHYSICAL_002` | Kotak kontak alat | periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar. | 20 | true |
| `BLOOD_PRESSURE_MONITOR` | resolve `DeviceType.id` where `code="BLOOD_PRESSURE_MONITOR"` | `BLOOD_PRESSURE_MONITOR_PHYSICAL_003` | Kabel catu utama | periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas. | 30 | true |
| `BLOOD_PRESSURE_MONITOR` | resolve `DeviceType.id` where `code="BLOOD_PRESSURE_MONITOR"` | `BLOOD_PRESSURE_MONITOR_PHYSICAL_004` | Tombol, saklar dan control | Periksa semua tombol/saklar dan control, pastikan berfungsi baik | 40 | true |
| `BLOOD_PRESSURE_MONITOR` | resolve `DeviceType.id` where `code="BLOOD_PRESSURE_MONITOR"` | `BLOOD_PRESSURE_MONITOR_PHYSICAL_005` | Tampilan dan indikator | selama pengecekan fungsi, pastikan lampu indicator dan tampilan layer berfungsi baik | 50 | true |
| `CENTRIFUGE` | resolve `DeviceType.id` where `code="CENTRIFUGE"` | `CENTRIFUGE_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `CENTRIFUGE` | resolve `DeviceType.id` where `code="CENTRIFUGE"` | `CENTRIFUGE_PHYSICAL_002` | Kotak kontak alat | periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar. | 20 | true |
| `CENTRIFUGE` | resolve `DeviceType.id` where `code="CENTRIFUGE"` | `CENTRIFUGE_PHYSICAL_003` | Kabel catu utama | periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas. | 30 | true |
| `CENTRIFUGE` | resolve `DeviceType.id` where `code="CENTRIFUGE"` | `CENTRIFUGE_PHYSICAL_004` | Tombol, Saklar dan pengaman | sebelum mempergunakan/mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi control. Ingat peraturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan. | 40 | true |
| `CENTRIFUGE` | resolve `DeviceType.id` where `code="CENTRIFUGE"` | `CENTRIFUGE_PHYSICAL_005` | Tampilan dan indikator | selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi | 50 | true |
| `CENTRIFUGE_REFRIGERATOR` | resolve `DeviceType.id` where `code="CENTRIFUGE_REFRIGERATOR"` | `CENTRIFUGE_REFRIGERATOR_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `CENTRIFUGE_REFRIGERATOR` | resolve `DeviceType.id` where `code="CENTRIFUGE_REFRIGERATOR"` | `CENTRIFUGE_REFRIGERATOR_PHYSICAL_002` | Kotak kontak alat | periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar. | 20 | true |
| `CENTRIFUGE_REFRIGERATOR` | resolve `DeviceType.id` where `code="CENTRIFUGE_REFRIGERATOR"` | `CENTRIFUGE_REFRIGERATOR_PHYSICAL_003` | Kabel catu utama | periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas. | 30 | true |
| `CENTRIFUGE_REFRIGERATOR` | resolve `DeviceType.id` where `code="CENTRIFUGE_REFRIGERATOR"` | `CENTRIFUGE_REFRIGERATOR_PHYSICAL_004` | Tombol, Saklar dan pengaman | sebelum mempergunakan/mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi control. Ingat peraturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan. | 40 | true |
| `CENTRIFUGE_REFRIGERATOR` | resolve `DeviceType.id` where `code="CENTRIFUGE_REFRIGERATOR"` | `CENTRIFUGE_REFRIGERATOR_PHYSICAL_005` | Tampilan dan indikator | selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi | 50 | true |
| `COLD_CHAIN` | resolve `DeviceType.id` where `code="COLD_CHAIN"` | `COLD_CHAIN_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `COLD_CHAIN` | resolve `DeviceType.id` where `code="COLD_CHAIN"` | `COLD_CHAIN_PHYSICAL_002` | Tusuk kontak alat | Periksa apakah ada gangguan pada tusuk kontak (AC power). Gerak-gerakan tusuk kontak untuk memastikan kemaanannya. Goyang-goyangkan tusuk kontak untuk untuk memastikan tidak ada bauta tau mur yang longgar. Jika ada, buka mur dan ganti dan perbaiki bila perlu. | 20 | true |
| `COLD_CHAIN` | resolve `DeviceType.id` where `code="COLD_CHAIN"` | `COLD_CHAIN_PHYSICAL_003` | Kabel catu utama (Line cord) | Periksa kabel, apakah terlihat ada kerusakan. Jika ada pindahkan atau tukar kabel yang rusak. Jika kerusakan disekitar ujung kabel singkirkan bagian yang rusak dan ganti dengan yang baru. Pastikan kabel power yang baru ataupun kotak kontak yang baru mempunyai polaritas yang sama dengan yang lama. Periksa juga fungsi kabel chargernya waktu dipergunakan untuk mengisi ulang. | 30 | true |
| `COLD_CHAIN` | resolve `DeviceType.id` where `code="COLD_CHAIN"` | `COLD_CHAIN_PHYSICAL_004` | Tombol, saklar dan kontrol | Sebelum mempergunakan/ mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi kontrol. Ingat pengaturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan. | 40 | true |
| `COLD_CHAIN` | resolve `DeviceType.id` where `code="COLD_CHAIN"` | `COLD_CHAIN_PHYSICAL_005` | Tampilan dan indikator | selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi | 50 | true |
| `CPAP` | resolve `DeviceType.id` where `code="CPAP"` | `CPAP_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `CPAP` | resolve `DeviceType.id` where `code="CPAP"` | `CPAP_PHYSICAL_002` | Kotak Kontak Alat | periksa apakah ada gangguan pada kotak kontak (AC-power). Gerak -gerakan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada bauta tau mur yang longgar. | 20 | true |
| `CPAP` | resolve `DeviceType.id` where `code="CPAP"` | `CPAP_PHYSICAL_003` | Kabel catu utama | periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas | 30 | true |
| `CPAP` | resolve `DeviceType.id` where `code="CPAP"` | `CPAP_PHYSICAL_004` | Tombol, saklar dan control | Periksa semua fungsi tombol/saklar atau kontrol, pastikan befungsi dengan baik | 40 | true |
| `CPAP` | resolve `DeviceType.id` where `code="CPAP"` | `CPAP_PHYSICAL_005` | Tampilan dan indicator | Selama pengecekan fungsi, pastikan indicator dan tampilan layer berfungsi baik. | 50 | true |
| `CPAP` | resolve `DeviceType.id` where `code="CPAP"` | `CPAP_PHYSICAL_006` | Selang dan konektor | pastikan sambungan sudah terpasang dan sesuai dengan spesifikasi CPAP | 60 | true |
| `DENTAL_UNIT` | resolve `DeviceType.id` where `code="DENTAL_UNIT"` | `DENTAL_UNIT_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `DENTAL_UNIT` | resolve `DeviceType.id` where `code="DENTAL_UNIT"` | `DENTAL_UNIT_PHYSICAL_002` | Kotak kontak alat | periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar. | 20 | true |
| `DENTAL_UNIT` | resolve `DeviceType.id` where `code="DENTAL_UNIT"` | `DENTAL_UNIT_PHYSICAL_003` | Kabel catu utama | periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas. | 30 | true |
| `DENTAL_UNIT` | resolve `DeviceType.id` where `code="DENTAL_UNIT"` | `DENTAL_UNIT_PHYSICAL_004` | Tombol, Saklar dan pengaman | sebelum mempergunakan/mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi control. Ingat peraturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan. | 40 | true |
| `DENTAL_UNIT` | resolve `DeviceType.id` where `code="DENTAL_UNIT"` | `DENTAL_UNIT_PHYSICAL_005` | Tampilan dan indikator | selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi | 50 | true |
| `DENTAL_UNIT` | resolve `DeviceType.id` where `code="DENTAL_UNIT"` | `DENTAL_UNIT_PHYSICAL_006` | Kompresor | Periksa tekanan yang dihasilkan secara berkala | 60 | true |
| `DENTAL_UNIT` | resolve `DeviceType.id` where `code="DENTAL_UNIT"` | `DENTAL_UNIT_PHYSICAL_007` | Selang-selang | Pastikan selang-selang sumber air, dan udara. Pastikan tidak ada kebocoran | 70 | true |
| `DENTAL_XRAY` | resolve `DeviceType.id` where `code="DENTAL_XRAY"` | `DENTAL_XRAY_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `DENTAL_XRAY` | resolve `DeviceType.id` where `code="DENTAL_XRAY"` | `DENTAL_XRAY_PHYSICAL_002` | Mekanisme pergerakan | Pastikan sistem pergerakan beroperasi dengan lancar, tidak menarik kesatu sisi atau sisi yang lain dan tidak membuat suara yang aneh saat digerakan. Pastikan pengendali Gerakan maju dan mundur berfungsi. | 20 | true |
| `DENTAL_XRAY` | resolve `DeviceType.id` where `code="DENTAL_XRAY"` | `DENTAL_XRAY_PHYSICAL_003` | Kabel catu utama (Line cord) | Periksa kabel, apakah terlihat ada kerusakan. Jika ada pindahkan atau tukar kabel yang rusak. Jika kerusakan disekitar ujung kabel singkirkan bagian yang rusak dan ganti dengan yang baru. Pastikan kabel power yang baru ataupun kotak kontak yang baru mempunyai polaritas yang sama dengan yang lama. | 30 | true |
| `DENTAL_XRAY` | resolve `DeviceType.id` where `code="DENTAL_XRAY"` | `DENTAL_XRAY_PHYSICAL_004` | Tombol, Saklar dan kontrol | sebelum mempergunakan/mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi control. Ingat peraturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan. | 40 | true |
| `DENTAL_XRAY` | resolve `DeviceType.id` where `code="DENTAL_XRAY"` | `DENTAL_XRAY_PHYSICAL_005` | Tampilan dan indicator | selama pengecekan fungsi pastikan lampu indicator dan tampilan layar berfungsi seluruhnya, yakinkan bahwa bagian tampilan digital berfungsi. | 50 | true |
| `ELECTROCARDIOGRAPHS` | resolve `DeviceType.id` where `code="ELECTROCARDIOGRAPHS"` | `ELECTROCARDIOGRAPHS_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `ELECTROCARDIOGRAPHS` | resolve `DeviceType.id` where `code="ELECTROCARDIOGRAPHS"` | `ELECTROCARDIOGRAPHS_PHYSICAL_002` | Kotak kontak alat | periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar. | 20 | true |
| `ELECTROCARDIOGRAPHS` | resolve `DeviceType.id` where `code="ELECTROCARDIOGRAPHS"` | `ELECTROCARDIOGRAPHS_PHYSICAL_003` | Kabel catu utama | periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas. | 30 | true |
| `ELECTROCARDIOGRAPHS` | resolve `DeviceType.id` where `code="ELECTROCARDIOGRAPHS"` | `ELECTROCARDIOGRAPHS_PHYSICAL_004` | Tombol, saklar dan kontrol | Sebelum mempergunakan/ mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi control. Ingat pengaturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan. | 40 | true |
| `ELECTROCARDIOGRAPHS` | resolve `DeviceType.id` where `code="ELECTROCARDIOGRAPHS"` | `ELECTROCARDIOGRAPHS_PHYSICAL_005` | Baterai/Charger | Periksa kondisi fisik dan konektor baterai apakah siap untuk dipergunakan. Periksa apakah alarm baterai menunjukkan baterai lemah. Jika demikian recharge baterai. | 50 | true |
| `ELECTROCARDIOGRAPHS` | resolve `DeviceType.id` where `code="ELECTROCARDIOGRAPHS"` | `ELECTROCARDIOGRAPHS_PHYSICAL_006` | Tampilan dan indikator | selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi | 60 | true |
| `ELECTROCARDIOGRAPHS` | resolve `DeviceType.id` where `code="ELECTROCARDIOGRAPHS"` | `ELECTROCARDIOGRAPHS_PHYSICAL_007` | Periksa kondisi charger | apakah masih baik dan dapat bekerja dengan baik, lalu charge baterai. Untuk beberapa jenis baterai mempunyai batas waktu (periode) penggunaan dan pengisian ulang, hal ini perlu diperhatikan untuk menjaga ketahanan baterai tersebut. Jika ada rekomendasi dari pabrikan, pastikan hal tersebut dilakukan sesuai dengan rekomendasi tersebut. | 70 | true |
| `ELECTRO_ACCUPUNTURE` | resolve `DeviceType.id` where `code="ELECTRO_ACCUPUNTURE"` | `ELECTRO_ACCUPUNTURE_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `ELECTRO_ACCUPUNTURE` | resolve `DeviceType.id` where `code="ELECTRO_ACCUPUNTURE"` | `ELECTRO_ACCUPUNTURE_PHYSICAL_002` | Kotak kontak alat | periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar. | 20 | true |
| `ELECTRO_ACCUPUNTURE` | resolve `DeviceType.id` where `code="ELECTRO_ACCUPUNTURE"` | `ELECTRO_ACCUPUNTURE_PHYSICAL_003` | Kabel catu utama (line cord) | Periksa kabel, apakah terlihat ada kerusakan. Jika ada pindahkan atau tukar kabel yang rusak. Jika kerusakan disekitar ujung kabel singkirkan bagian yang rusak dan ganti dengan yang baru. Pastikan kabel power yang baru ataupun kotak kontak yang baru mempunyai polaritas yang sama dengan yang lama. Periksa juga fungsi kabel chargernya waktu dipergunakan untuk mengisi ulang. | 30 | true |
| `ELECTRO_ACCUPUNTURE` | resolve `DeviceType.id` where `code="ELECTRO_ACCUPUNTURE"` | `ELECTRO_ACCUPUNTURE_PHYSICAL_004` | Pengaman | Periksa aplikasi, keamanan dan system saat terdapat peringatan terjadinya error pada aplikasi | 40 | true |
| `ELECTRO_ACCUPUNTURE` | resolve `DeviceType.id` where `code="ELECTRO_ACCUPUNTURE"` | `ELECTRO_ACCUPUNTURE_PHYSICAL_005` | Control panel | Periksa control panel pada setiap panel potensiometer agar alat dapat bekerja dengan baik saat digunakan | 50 | true |
| `EXAMINATION_LAMP` | resolve `DeviceType.id` where `code="EXAMINATION_LAMP"` | `EXAMINATION_LAMP_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `EXAMINATION_LAMP` | resolve `DeviceType.id` where `code="EXAMINATION_LAMP"` | `EXAMINATION_LAMP_PHYSICAL_002` | Kotak kontak alat | periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar. | 20 | true |
| `EXAMINATION_LAMP` | resolve `DeviceType.id` where `code="EXAMINATION_LAMP"` | `EXAMINATION_LAMP_PHYSICAL_003` | Kabel catu utama | periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas. | 30 | true |
| `EXAMINATION_LAMP` | resolve `DeviceType.id` where `code="EXAMINATION_LAMP"` | `EXAMINATION_LAMP_PHYSICAL_004` | Tombol, Saklar dan control | Periksa seluruhnya, pastikan berfungsi baik dan Kembali pada posisi pengaturan awal. | 40 | true |
| `EXAMINATION_LAMP` | resolve `DeviceType.id` where `code="EXAMINATION_LAMP"` | `EXAMINATION_LAMP_PHYSICAL_005` | Tampilan dan indikator | selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi | 50 | true |
| `EXAMINATION_LAMP` | resolve `DeviceType.id` where `code="EXAMINATION_LAMP"` | `EXAMINATION_LAMP_PHYSICAL_006` | System pengunci dan penyeimbang | Lakukan pemeriksaan system pengunci dan penyeimbang lampu. | 60 | true |
| `FETAL_DOPPLER` | resolve `DeviceType.id` where `code="FETAL_DOPPLER"` | `FETAL_DOPPLER_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `FETAL_DOPPLER` | resolve `DeviceType.id` where `code="FETAL_DOPPLER"` | `FETAL_DOPPLER_PHYSICAL_002` | Kotak kontak alat | periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar. | 20 | true |
| `FETAL_DOPPLER` | resolve `DeviceType.id` where `code="FETAL_DOPPLER"` | `FETAL_DOPPLER_PHYSICAL_003` | Kabel catu utama | periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas. | 30 | true |
| `FETAL_DOPPLER` | resolve `DeviceType.id` where `code="FETAL_DOPPLER"` | `FETAL_DOPPLER_PHYSICAL_004` | Kabel tranduser | periksa kabel dan fungsi masing-masing. Kemudian periksa dengan hati-hati apakah terdapat sobekan atau terkelupas pada lapisan isolasinya, hal ini untuk menghindari adanya gangguan tegangan | 40 | true |
| `FETAL_DOPPLER` | resolve `DeviceType.id` where `code="FETAL_DOPPLER"` | `FETAL_DOPPLER_PHYSICAL_005` | Tampilan dan indikator | selama pengecekan fungsi, pastikan lampu indicator dan tampilan layer berfungsi baik | 50 | true |
| `FETAL_DOPPLER` | resolve `DeviceType.id` where `code="FETAL_DOPPLER"` | `FETAL_DOPPLER_PHYSICAL_006` | Tombol, saklar dan control | Periksa semua tombol/saklar dan control, pastikan berfungsi baik | 60 | true |
| `FLOW_METER` | resolve `DeviceType.id` where `code="FLOW_METER"` | `FLOW_METER_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `FLOW_METER` | resolve `DeviceType.id` where `code="FLOW_METER"` | `FLOW_METER_PHYSICAL_002` | Katup dan control | Sebelum mempergunakan/ mengubah ubah tombol control, periksa posisinya, jika terlihat tidak berada pada poisisnya (periksa dengan menggunakan mode pemeriksaan standra). Bandingkan dengan posisi control. Ingat pengaturan tersebut dan kembalikan pada pengaturan awal jika sudah selesai pekerjaan. | 20 | true |
| `FLOW_METER` | resolve `DeviceType.id` where `code="FLOW_METER"` | `FLOW_METER_PHYSICAL_003` | Tampilan dan indicator | Selama pengecekan fungsi, pastikan indicator dan tampilan layer berfungsi baik | 30 | true |
| `HEAD_LAMP_MEDIK` | resolve `DeviceType.id` where `code="HEAD_LAMP_MEDIK"` | `HEAD_LAMP_MEDIK_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `HEAD_LAMP_MEDIK` | resolve `DeviceType.id` where `code="HEAD_LAMP_MEDIK"` | `HEAD_LAMP_MEDIK_PHYSICAL_002` | Tombol, Saklar dan control | Periksa seluruhnya, pastikan berfungsi baik dan Kembali pada posisi pengaturan awal. | 20 | true |
| `HEAD_LAMP_MEDIK` | resolve `DeviceType.id` where `code="HEAD_LAMP_MEDIK"` | `HEAD_LAMP_MEDIK_PHYSICAL_003` | Charging socket | pastikan system pengisian ulang battery berfungsi | 30 | true |
| `HEAD_LAMP_MEDIK` | resolve `DeviceType.id` where `code="HEAD_LAMP_MEDIK"` | `HEAD_LAMP_MEDIK_PHYSICAL_004` | Battery box | periksa kondisi battery, pastikan tidak ada tanda – tanda bocor yang bersumber dari battery | 40 | true |
| `HEAD_LAMP_MEDIK` | resolve `DeviceType.id` where `code="HEAD_LAMP_MEDIK"` | `HEAD_LAMP_MEDIK_PHYSICAL_005` | Lampu | periksa kondisi lampu | 50 | true |
| `HUMIDIFIER` | resolve `DeviceType.id` where `code="HUMIDIFIER"` | `HUMIDIFIER_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `HUMIDIFIER` | resolve `DeviceType.id` where `code="HUMIDIFIER"` | `HUMIDIFIER_PHYSICAL_002` | Roda dan pengunci | Jika unit bergerak dengan roda, periksa kondisinya. Pastikan dapat bergerak dan berputar, periksa rem dan pengunci roda, pastikan berfungsi dengan baik. | 20 | true |
| `HUMIDIFIER` | resolve `DeviceType.id` where `code="HUMIDIFIER"` | `HUMIDIFIER_PHYSICAL_003` | Tusuk kontak alat | periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar. | 30 | true |
| `HUMIDIFIER` | resolve `DeviceType.id` where `code="HUMIDIFIER"` | `HUMIDIFIER_PHYSICAL_004` | Kabel catu utama | periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas. | 40 | true |
| `HUMIDIFIER` | resolve `DeviceType.id` where `code="HUMIDIFIER"` | `HUMIDIFIER_PHYSICAL_005` | Tombol, Saklar dan control | Periksa seluruhnya, pastikan berfungsi baik dan Kembali pada posisi pengaturan awal. | 50 | true |
| `INFANT_WARMER` | resolve `DeviceType.id` where `code="INFANT_WARMER"` | `INFANT_WARMER_PHYSICAL_001` | Badan dan permukaan alat | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya | 10 | true |
| `INFANT_WARMER` | resolve `DeviceType.id` where `code="INFANT_WARMER"` | `INFANT_WARMER_PHYSICAL_002` | Roda dan pengunci | Jika unit bergerak dengan roda, periksa kondisinya. Pastikan dapa bergerak dan berputar, periksa rem dan kunci roda, pastikan berfungsi dengan baik. | 20 | true |
| `INFANT_WARMER` | resolve `DeviceType.id` where `code="INFANT_WARMER"` | `INFANT_WARMER_PHYSICAL_003` | Tusuk kontak alat | Periksa apakah ada gangguan pada tusuk kontak (AC-Power). Gerak-gerakan tusuk kontak untuk memastikan keamanannya. Goyang-goyangkan tusuk kintak untuk memastikan tidak ada bauta tau mur yang longgar. Jika ada, buka mur dan ganti dan perbaiki bila perlu. | 30 | true |
| `INFANT_WARMER` | resolve `DeviceType.id` where `code="INFANT_WARMER"` | `INFANT_WARMER_PHYSICAL_004` | Kabel catu utama (Line cord) | Periksa kabel, apakah terlihat ada kerusakan. Jika ada pindahkan atau tukar kabel yang rusak. Jika kerusakan disekitar ujung kabel singkirkan bagian yang rusak dan ganti dengan yang baru. Pastikan kabel power yang baru ataupun kotak kontak yang baru mempunyai polaritas yang sama dengan yang lama. | 40 | true |
| `INFANT_WARMER` | resolve `DeviceType.id` where `code="INFANT_WARMER"` | `INFANT_WARMER_PHYSICAL_005` | Tombol, saklar dan kontrol | sebelum mempergunakan/mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi control. Ingat peraturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan. | 50 | true |
| `INFUSION_PUMP` | resolve `DeviceType.id` where `code="INFUSION_PUMP"` | `INFUSION_PUMP_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `INFUSION_PUMP` | resolve `DeviceType.id` where `code="INFUSION_PUMP"` | `INFUSION_PUMP_PHYSICAL_002` | Tusuk kontak alat | Periksa apakah ada gangguan pada tusuk kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar | 20 | true |
| `INFUSION_PUMP` | resolve `DeviceType.id` where `code="INFUSION_PUMP"` | `INFUSION_PUMP_PHYSICAL_003` | Kabel catu utama | Periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas. | 30 | true |
| `INFUSION_PUMP` | resolve `DeviceType.id` where `code="INFUSION_PUMP"` | `INFUSION_PUMP_PHYSICAL_004` | Tombol, saklar dan control | Periksa seluruhnya pastikan berfungsi baik | 40 | true |
| `INFUSION_PUMP` | resolve `DeviceType.id` where `code="INFUSION_PUMP"` | `INFUSION_PUMP_PHYSICAL_005` | Tampilan dan indicator | Selama pengecekan fungsi, pastikan lampu indicator dan tampilan layar berfungsi baik | 50 | true |
| `INFUSION_PUMP` | resolve `DeviceType.id` where `code="INFUSION_PUMP"` | `INFUSION_PUMP_PHYSICAL_006` | System pengunci pergerakan | Lakukan pemeriksaan system pengunci pergerakan 374653683000 Tidak | 60 | true |
| `INFUSION_PUMP` | resolve `DeviceType.id` where `code="INFUSION_PUMP"` | `INFUSION_PUMP_PHYSICAL_007` | Alarm dan system interlock. | Periksa alarm dan system interlock pastikan berfungsi dengan baik. | 70 | true |
| `INFUSION_PUMP` | resolve `DeviceType.id` where `code="INFUSION_PUMP"` | `INFUSION_PUMP_PHYSICAL_008` | Motor/pompa penghisap | Periksa kondisi fisik motor dan pastikan berfungsi baik/normal. | 80 | true |
| `KULKAS_VAKSIN` | resolve `DeviceType.id` where `code="KULKAS_VAKSIN"` | `KULKAS_VAKSIN_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `KULKAS_VAKSIN` | resolve `DeviceType.id` where `code="KULKAS_VAKSIN"` | `KULKAS_VAKSIN_PHYSICAL_002` | Tusuk kontak alat | Periksa apakah ada gangguan pada tusuk kontak (AC power). Gerak-gerakan tusuk kontak untuk memastikan kemaanannya. Goyang-goyangkan tusuk kontak untuk untuk memastikan tidak ada bauta tau mur yang longgar. Jika ada, buka mur dan ganti dan perbaiki bila perlu. | 20 | true |
| `KULKAS_VAKSIN` | resolve `DeviceType.id` where `code="KULKAS_VAKSIN"` | `KULKAS_VAKSIN_PHYSICAL_003` | Kabel catu utama (Line cord) | Periksa kabel, apakah terlihat ada kerusakan. Jika ada pindahkan atau tukar kabel yang rusak. Jika kerusakan disekitar ujung kabel singkirkan bagian yang rusak dan ganti dengan yang baru. Pastikan kabel power yang baru ataupun kotak kontak yang baru mempunyai polaritas yang sama dengan yang lama. Periksa juga fungsi kabel chargernya waktu dipergunakan untuk mengisi ulang. | 30 | true |
| `KULKAS_VAKSIN` | resolve `DeviceType.id` where `code="KULKAS_VAKSIN"` | `KULKAS_VAKSIN_PHYSICAL_004` | Tombol, saklar dan kontrol | Sebelum mempergunakan/ mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi kontrol. Ingat pengaturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan. | 40 | true |
| `KULKAS_VAKSIN` | resolve `DeviceType.id` where `code="KULKAS_VAKSIN"` | `KULKAS_VAKSIN_PHYSICAL_005` | Tampilan dan indikator | selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi | 50 | true |
| `LAMINAR_AIR_FLOW` | resolve `DeviceType.id` where `code="LAMINAR_AIR_FLOW"` | `LAMINAR_AIR_FLOW_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `LAMINAR_AIR_FLOW` | resolve `DeviceType.id` where `code="LAMINAR_AIR_FLOW"` | `LAMINAR_AIR_FLOW_PHYSICAL_002` | Kotak kontak alat | periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar. | 20 | true |
| `LAMINAR_AIR_FLOW` | resolve `DeviceType.id` where `code="LAMINAR_AIR_FLOW"` | `LAMINAR_AIR_FLOW_PHYSICAL_003` | Kabel catu utama | periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas. | 30 | true |
| `LAMINAR_AIR_FLOW` | resolve `DeviceType.id` where `code="LAMINAR_AIR_FLOW"` | `LAMINAR_AIR_FLOW_PHYSICAL_004` | Sekering Pengaman | Periksa sekering yang terdapat pada bagian luar rangkaian, apakah nilai tahanan dan tipenya sesuai dengan spesifikasi yang tertulis pada alat. Sekering pengaman harus berfungsi dengan baik. | 40 | true |
| `LAMINAR_AIR_FLOW` | resolve `DeviceType.id` where `code="LAMINAR_AIR_FLOW"` | `LAMINAR_AIR_FLOW_PHYSICAL_005` | Tombol, Saklar dan pengaman | sebelum mempergunakan/mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi control. Ingat peraturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan. | 50 | true |
| `LAMINAR_AIR_FLOW` | resolve `DeviceType.id` where `code="LAMINAR_AIR_FLOW"` | `LAMINAR_AIR_FLOW_PHYSICAL_006` | Tampilan dan indikator | selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi | 60 | true |
| `LAMPU_OPERASI` | resolve `DeviceType.id` where `code="LAMPU_OPERASI"` | `LAMPU_OPERASI_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `LAMPU_OPERASI` | resolve `DeviceType.id` where `code="LAMPU_OPERASI"` | `LAMPU_OPERASI_PHYSICAL_002` | Kotak kontak alat | periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar. | 20 | true |
| `LAMPU_OPERASI` | resolve `DeviceType.id` where `code="LAMPU_OPERASI"` | `LAMPU_OPERASI_PHYSICAL_003` | Kabel catu utama | periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas. | 30 | true |
| `LAMPU_OPERASI` | resolve `DeviceType.id` where `code="LAMPU_OPERASI"` | `LAMPU_OPERASI_PHYSICAL_004` | Tombol, Saklar dan control | Periksa seluruhnya, pastikan berfungsi baik dan Kembali pada posisi pengaturan awal. | 40 | true |
| `LAMPU_OPERASI` | resolve `DeviceType.id` where `code="LAMPU_OPERASI"` | `LAMPU_OPERASI_PHYSICAL_005` | Tampilan dan indikator | selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi | 50 | true |
| `LAMPU_OPERASI` | resolve `DeviceType.id` where `code="LAMPU_OPERASI"` | `LAMPU_OPERASI_PHYSICAL_006` | System pengunci dan penyeimbang | Lakukan pemeriksaan system pengunci dan penyeimbang lampu. | 60 | true |
| `LARYNGOSKOP` | resolve `DeviceType.id` where `code="LARYNGOSKOP"` | `LARYNGOSKOP_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `LARYNGOSKOP` | resolve `DeviceType.id` where `code="LARYNGOSKOP"` | `LARYNGOSKOP_PHYSICAL_002` | Kotak kontak alat | periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar. | 20 | true |
| `LARYNGOSKOP` | resolve `DeviceType.id` where `code="LARYNGOSKOP"` | `LARYNGOSKOP_PHYSICAL_003` | Kabel catu utama | periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas. | 30 | true |
| `LARYNGOSKOP` | resolve `DeviceType.id` where `code="LARYNGOSKOP"` | `LARYNGOSKOP_PHYSICAL_004` | Tampilan dan indikator | selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi | 40 | true |
| `MEDICAL_FREEZER` | resolve `DeviceType.id` where `code="MEDICAL_FREEZER"` | `MEDICAL_FREEZER_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `MEDICAL_FREEZER` | resolve `DeviceType.id` where `code="MEDICAL_FREEZER"` | `MEDICAL_FREEZER_PHYSICAL_002` | Tusuk kontak alat | Periksa apakah ada gangguan pada tusuk kontak (AC power). Gerak-gerakan tusuk kontak untuk memastikan kemaanannya. Goyang-goyangkan tusuk kontak untuk untuk memastikan tidak ada bauta tau mur yang longgar. Jika ada, buka mur dan ganti dan perbaiki bila perlu. | 20 | true |
| `MEDICAL_FREEZER` | resolve `DeviceType.id` where `code="MEDICAL_FREEZER"` | `MEDICAL_FREEZER_PHYSICAL_003` | Kabel catu utama (Line cord) | Periksa kabel, apakah terlihat ada kerusakan. Jika ada pindahkan atau tukar kabel yang rusak. Jika kerusakan disekitar ujung kabel singkirkan bagian yang rusak dan ganti dengan yang baru. Pastikan kabel power yang baru ataupun kotak kontak yang baru mempunyai polaritas yang sama dengan yang lama. Periksa juga fungsi kabel chargernya waktu dipergunakan untuk mengisi ulang. | 30 | true |
| `MEDICAL_FREEZER` | resolve `DeviceType.id` where `code="MEDICAL_FREEZER"` | `MEDICAL_FREEZER_PHYSICAL_004` | Tombol, saklar dan kontrol | Sebelum mempergunakan/ mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi kontrol. Ingat pengaturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan. | 40 | true |
| `MEDICAL_FREEZER` | resolve `DeviceType.id` where `code="MEDICAL_FREEZER"` | `MEDICAL_FREEZER_PHYSICAL_005` | Tampilan dan indikator | selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi | 50 | true |
| `MEDICAL_REFRIGERATOR` | resolve `DeviceType.id` where `code="MEDICAL_REFRIGERATOR"` | `MEDICAL_REFRIGERATOR_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `MEDICAL_REFRIGERATOR` | resolve `DeviceType.id` where `code="MEDICAL_REFRIGERATOR"` | `MEDICAL_REFRIGERATOR_PHYSICAL_002` | Tusuk kontak alat | Periksa apakah ada gangguan pada tusuk kontak (AC power). Gerak-gerakan tusuk kontak untuk memastikan kemaanannya. Goyang-goyangkan tusuk kontak untuk untuk memastikan tidak ada bauta tau mur yang longgar. Jika ada, buka mur dan ganti dan perbaiki bila perlu. | 20 | true |
| `MEDICAL_REFRIGERATOR` | resolve `DeviceType.id` where `code="MEDICAL_REFRIGERATOR"` | `MEDICAL_REFRIGERATOR_PHYSICAL_003` | Kabel catu utama (Line cord) | Periksa kabel, apakah terlihat ada kerusakan. Jika ada pindahkan atau tukar kabel yang rusak. Jika kerusakan disekitar ujung kabel singkirkan bagian yang rusak dan ganti dengan yang baru. Pastikan kabel power yang baru ataupun kotak kontak yang baru mempunyai polaritas yang sama dengan yang lama. Periksa juga fungsi kabel chargernya waktu dipergunakan untuk mengisi ulang. | 30 | true |
| `MEDICAL_REFRIGERATOR` | resolve `DeviceType.id` where `code="MEDICAL_REFRIGERATOR"` | `MEDICAL_REFRIGERATOR_PHYSICAL_004` | Tombol, saklar dan kontrol | Sebelum mempergunakan/ mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi kontrol. Ingat pengaturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan. | 40 | true |
| `MEDICAL_REFRIGERATOR` | resolve `DeviceType.id` where `code="MEDICAL_REFRIGERATOR"` | `MEDICAL_REFRIGERATOR_PHYSICAL_005` | Tampilan dan indikator | selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi | 50 | true |
| `MIKROSKOP_LABORATORIUM` | resolve `DeviceType.id` where `code="MIKROSKOP_LABORATORIUM"` | `MIKROSKOP_LABORATORIUM_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `MIKROSKOP_LABORATORIUM` | resolve `DeviceType.id` where `code="MIKROSKOP_LABORATORIUM"` | `MIKROSKOP_LABORATORIUM_PHYSICAL_002` | Tusuk kontak alat | Periksa apakah ada gangguan pada tusuk kontak (AC power). Gerak-gerakan tusuk kontak untuk memastikan kemaanannya. Goyang-goyangkan tusuk kontak untuk untuk memastikan tidak ada bauta tau mur yang longgar. Jika ada, buka mur dan ganti dan perbaiki bila perlu. | 20 | true |
| `MIKROSKOP_LABORATORIUM` | resolve `DeviceType.id` where `code="MIKROSKOP_LABORATORIUM"` | `MIKROSKOP_LABORATORIUM_PHYSICAL_003` | Kabel catu utama (Line cord) | Periksa kabel, apakah terlihat ada kerusakan. Jika ada pindahkan atau tukar kabel yang rusak. Jika kerusakan disekitar ujung kabel singkirkan bagian yang rusak dan ganti dengan yang baru. Pastikan kabel power yang baru ataupun kotak kontak yang baru mempunyai polaritas yang sama dengan yang lama. Periksa juga fungsi kabel chargernya waktu dipergunakan untuk mengisi ulang. | 30 | true |
| `MIKROSKOP_LABORATORIUM` | resolve `DeviceType.id` where `code="MIKROSKOP_LABORATORIUM"` | `MIKROSKOP_LABORATORIUM_PHYSICAL_004` | Tombol, saklar dan kontrol | Sebelum mempergunakan/ mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi kontrol. Ingat pengaturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan. | 40 | true |
| `MIKROSKOP_LABORATORIUM` | resolve `DeviceType.id` where `code="MIKROSKOP_LABORATORIUM"` | `MIKROSKOP_LABORATORIUM_PHYSICAL_005` | Lensa okuler | Cek lensa okuler terpasang dengan baik, pastikan penguncinya bersih. | 50 | true |
| `MIKROSKOP_LABORATORIUM` | resolve `DeviceType.id` where `code="MIKROSKOP_LABORATORIUM"` | `MIKROSKOP_LABORATORIUM_PHYSICAL_006` | Lensa Objective | Cek kebersihan lensa, pastikan lensa bersih. Putar pemilihan lensa objective baik. | 60 | true |
| `NEBULIZER_COMPRESSOR` | resolve `DeviceType.id` where `code="NEBULIZER_COMPRESSOR"` | `NEBULIZER_COMPRESSOR_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `NEBULIZER_COMPRESSOR` | resolve `DeviceType.id` where `code="NEBULIZER_COMPRESSOR"` | `NEBULIZER_COMPRESSOR_PHYSICAL_002` | Kotak kontak alat | periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar. | 20 | true |
| `NEBULIZER_COMPRESSOR` | resolve `DeviceType.id` where `code="NEBULIZER_COMPRESSOR"` | `NEBULIZER_COMPRESSOR_PHYSICAL_003` | Kabel catu utama | periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas. | 30 | true |
| `NEBULIZER_COMPRESSOR` | resolve `DeviceType.id` where `code="NEBULIZER_COMPRESSOR"` | `NEBULIZER_COMPRESSOR_PHYSICAL_004` | Tombol, Saklar dan control | Periksa seluruhnya, pastikan berfungsi baik dan Kembali pada posisi pengaturan awal. | 40 | true |
| `NEBULIZER_COMPRESSOR` | resolve `DeviceType.id` where `code="NEBULIZER_COMPRESSOR"` | `NEBULIZER_COMPRESSOR_PHYSICAL_005` | Tampilan dan indikator | selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi | 50 | true |
| `OVEN` | resolve `DeviceType.id` where `code="OVEN"` | `OVEN_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `OVEN` | resolve `DeviceType.id` where `code="OVEN"` | `OVEN_PHYSICAL_002` | Tusuk kontak alat | Periksa apakah ada gangguan pada tusuk kontak (AC power). Gerak-gerakan tusuk kontak untuk memastikan kemaanannya. Goyang-goyangkan tusuk kontak untuk untuk memastikan tidak ada bauta tau mur yang longgar. Jika ada, buka mur dan ganti dan perbaiki bila perlu. | 20 | true |
| `OVEN` | resolve `DeviceType.id` where `code="OVEN"` | `OVEN_PHYSICAL_003` | Kabel catu utama (Line cord) | Periksa kabel, apakah terlihat ada kerusakan. Jika ada pindahkan atau tukar kabel yang rusak. Jika kerusakan disekitar ujung kabel singkirkan bagian yang rusak dan ganti dengan yang baru. Pastikan kabel power yang baru ataupun kotak kontak yang baru mempunyai polaritas yang sama dengan yang lama. Periksa juga fungsi kabel chargernya waktu dipergunakan untuk mengisi ulang. | 30 | true |
| `OVEN` | resolve `DeviceType.id` where `code="OVEN"` | `OVEN_PHYSICAL_004` | Tombol, saklar dan kontrol | Sebelum mempergunakan/ mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi kontrol. Ingat pengaturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan. | 40 | true |
| `OVEN` | resolve `DeviceType.id` where `code="OVEN"` | `OVEN_PHYSICAL_005` | Tampilan dan indikator | selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi | 50 | true |
| `OXYGEN_CONCENTRATORS` | resolve `DeviceType.id` where `code="OXYGEN_CONCENTRATORS"` | `OXYGEN_CONCENTRATORS_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `OXYGEN_CONCENTRATORS` | resolve `DeviceType.id` where `code="OXYGEN_CONCENTRATORS"` | `OXYGEN_CONCENTRATORS_PHYSICAL_002` | Katup dan control | Sebelum mempergunakan/ mengubah ubah tombol control, periksa posisinya, jika terlihat tidak berada pada poisisnya (periksa dengan menggunakan mode pemeriksaan standra). Bandingkan dengan posisi control. Ingat pengaturan tersebut dan kembalikan pada pengaturan awal jika sudah selesai pekerjaan. | 20 | true |
| `OXYGEN_CONCENTRATORS` | resolve `DeviceType.id` where `code="OXYGEN_CONCENTRATORS"` | `OXYGEN_CONCENTRATORS_PHYSICAL_003` | Tampilan dan indicator | Selama pengecekan fungsi, pastikan indicator dan tampilan layer berfungsi baik | 30 | true |
| `PHOTOTHERAPY` | resolve `DeviceType.id` where `code="PHOTOTHERAPY"` | `PHOTOTHERAPY_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `PHOTOTHERAPY` | resolve `DeviceType.id` where `code="PHOTOTHERAPY"` | `PHOTOTHERAPY_PHYSICAL_002` | Rodan dan pengunci | Jika unit bergerak dengan roda, periksa kondisinya. Pastikan dapat bergerak dan berputar, periksa rem dan kunci roda, pastikan berfungsi dengan baik | 20 | true |
| `PHOTOTHERAPY` | resolve `DeviceType.id` where `code="PHOTOTHERAPY"` | `PHOTOTHERAPY_PHYSICAL_003` | Kotak kontak alat | periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar | 30 | true |
| `PHOTOTHERAPY` | resolve `DeviceType.id` where `code="PHOTOTHERAPY"` | `PHOTOTHERAPY_PHYSICAL_004` | Kabel catu utama (line cord) | periksa kabel, apakah terlihat ada kerusakan. Jika ada pindahkan atau tuker kabel yang rusak. Jika kerusakan disekitar ujung kabel singkirkan bagian yang rusak dan ganti dengan yang baru. Pastikan kabel power yang baru ataupun kotak kontak yang baru mempunyai polaritas yang sama dengan yang lama. | 40 | true |
| `PHOTOTHERAPY` | resolve `DeviceType.id` where `code="PHOTOTHERAPY"` | `PHOTOTHERAPY_PHYSICAL_005` | Tombol, Saklar dan pengaman | sebelum mempergunakan/mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi control. Ingat peraturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan. | 50 | true |
| `PLATELET_AGITATOR_INCUBATOR` | resolve `DeviceType.id` where `code="PLATELET_AGITATOR_INCUBATOR"` | `PLATELET_AGITATOR_INCUBATOR_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `PLATELET_AGITATOR_INCUBATOR` | resolve `DeviceType.id` where `code="PLATELET_AGITATOR_INCUBATOR"` | `PLATELET_AGITATOR_INCUBATOR_PHYSICAL_002` | Tusuk kontak alat | Periksa apakah ada gangguan pada tusuk kontak (AC power). Gerak-gerakan tusuk kontak untuk memastikan kemaanannya. Goyang-goyangkan tusuk kontak untuk untuk memastikan tidak ada bauta tau mur yang longgar. Jika ada, buka mur dan ganti dan perbaiki bila perlu. | 20 | true |
| `PLATELET_AGITATOR_INCUBATOR` | resolve `DeviceType.id` where `code="PLATELET_AGITATOR_INCUBATOR"` | `PLATELET_AGITATOR_INCUBATOR_PHYSICAL_003` | Kabel catu utama (Line cord) | Periksa kabel, apakah terlihat ada kerusakan. Jika ada pindahkan atau tukar kabel yang rusak. Jika kerusakan disekitar ujung kabel singkirkan bagian yang rusak dan ganti dengan yang baru. Pastikan kabel power yang baru ataupun kotak kontak yang baru mempunyai polaritas yang sama dengan yang lama. Periksa juga fungsi kabel chargernya waktu dipergunakan untuk mengisi ulang. | 30 | true |
| `PLATELET_AGITATOR_INCUBATOR` | resolve `DeviceType.id` where `code="PLATELET_AGITATOR_INCUBATOR"` | `PLATELET_AGITATOR_INCUBATOR_PHYSICAL_004` | Tombol, saklar dan kontrol | Sebelum mempergunakan/ mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi kontrol. Ingat pengaturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan. | 40 | true |
| `PLATELET_AGITATOR_INCUBATOR` | resolve `DeviceType.id` where `code="PLATELET_AGITATOR_INCUBATOR"` | `PLATELET_AGITATOR_INCUBATOR_PHYSICAL_005` | Tampilan dan indikator | selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi | 50 | true |
| `PULSE_OXIMETERS` | resolve `DeviceType.id` where `code="PULSE_OXIMETERS"` | `PULSE_OXIMETERS_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `PULSE_OXIMETERS` | resolve `DeviceType.id` where `code="PULSE_OXIMETERS"` | `PULSE_OXIMETERS_PHYSICAL_002` | Kotak kontak alat | periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar. | 20 | true |
| `PULSE_OXIMETERS` | resolve `DeviceType.id` where `code="PULSE_OXIMETERS"` | `PULSE_OXIMETERS_PHYSICAL_003` | Kabel catu utama | periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas. | 30 | true |
| `PULSE_OXIMETERS` | resolve `DeviceType.id` where `code="PULSE_OXIMETERS"` | `PULSE_OXIMETERS_PHYSICAL_004` | Tombol, Saklar dan kontrol | Periksa semua fungsi tombol/saklar atau control, pastikn berfungsi baik. | 40 | true |
| `PULSE_OXIMETERS` | resolve `DeviceType.id` where `code="PULSE_OXIMETERS"` | `PULSE_OXIMETERS_PHYSICAL_005` | Tampilan dan indikator | selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi | 50 | true |
| `PULSE_OXIMETERS` | resolve `DeviceType.id` where `code="PULSE_OXIMETERS"` | `PULSE_OXIMETERS_PHYSICAL_006` | Kelengkapan alat | Cek kelengkapan alat, pastikan lengkap dan berfungsi baik. | 60 | true |
| `RESUSCITATORS_PULMONARY` | resolve `DeviceType.id` where `code="RESUSCITATORS_PULMONARY"` | `RESUSCITATORS_PULMONARY_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `RESUSCITATORS_PULMONARY` | resolve `DeviceType.id` where `code="RESUSCITATORS_PULMONARY"` | `RESUSCITATORS_PULMONARY_PHYSICAL_002` | Selang utama sumber gas | Periksa selang-selang sumber gas, apakah terlihat ada kerusakan, pastikan seluruh koneksinya terikat dengan kuat | 20 | true |
| `RESUSCITATORS_PULMONARY` | resolve `DeviceType.id` where `code="RESUSCITATORS_PULMONARY"` | `RESUSCITATORS_PULMONARY_PHYSICAL_003` | Tombol, saklar dan control | Periksa semua fungsi tombol/saklar atau kontrol, pastikan befungsi dengan baik | 30 | true |
| `RESUSCITATORS_PULMONARY` | resolve `DeviceType.id` where `code="RESUSCITATORS_PULMONARY"` | `RESUSCITATORS_PULMONARY_PHYSICAL_004` | Tampilan dan indicator | Selama pengecekan fungsi, pastikan indicator dan tampilan layer berfungsi baik. | 40 | true |
| `RESUSCITATORS_PULMONARY` | resolve `DeviceType.id` where `code="RESUSCITATORS_PULMONARY"` | `RESUSCITATORS_PULMONARY_PHYSICAL_005` | System interlock gas | Periksa system pengaman (interlock) gas befungsi baik | 50 | true |
| `RESUSCITATORS_PULMONARY` | resolve `DeviceType.id` where `code="RESUSCITATORS_PULMONARY"` | `RESUSCITATORS_PULMONARY_PHYSICAL_006` | Kelengkapan alat | Cek kelengkapan alat, pastikan lengkap dan berfungsi baik. | 60 | true |
| `ROTATOR` | resolve `DeviceType.id` where `code="ROTATOR"` | `ROTATOR_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `ROTATOR` | resolve `DeviceType.id` where `code="ROTATOR"` | `ROTATOR_PHYSICAL_002` | Kotak kontak alat | periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar. | 20 | true |
| `ROTATOR` | resolve `DeviceType.id` where `code="ROTATOR"` | `ROTATOR_PHYSICAL_003` | Kabel catu utama | periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas. | 30 | true |
| `ROTATOR` | resolve `DeviceType.id` where `code="ROTATOR"` | `ROTATOR_PHYSICAL_004` | Tombol, Saklar dan pengaman | sebelum mempergunakan/mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi control. Ingat peraturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan. | 40 | true |
| `ROTATOR` | resolve `DeviceType.id` where `code="ROTATOR"` | `ROTATOR_PHYSICAL_005` | Tampilan dan indikator | selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi | 50 | true |
| `SPHYGMOMANOMETERS` | resolve `DeviceType.id` where `code="SPHYGMOMANOMETERS"` | `SPHYGMOMANOMETERS_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `SPHYGMOMANOMETERS` | resolve `DeviceType.id` where `code="SPHYGMOMANOMETERS"` | `SPHYGMOMANOMETERS_PHYSICAL_002` | Balon tensi | tabung, selang, periksa kondisi tabung, selang dan balon tensi. Pastikan tidak ada yang retak, bocor, tertekuk, maupun kotor. | 20 | true |
| `SPHYGMOMANOMETERS` | resolve `DeviceType.id` where `code="SPHYGMOMANOMETERS"` | `SPHYGMOMANOMETERS_PHYSICAL_003` | Gauge/tabung | pastikan penunjuk pada aneroid gauge bergerak turun secara lembut dan perlahan dan tidak lengket. Pada manometer air raksa, tabung raksa harus dalam keadaan bersih. Periksa juga kolom air raksa naik dan bererak secara lembut. | 30 | true |
| `SPHYGMOMANOMETERS` | resolve `DeviceType.id` where `code="SPHYGMOMANOMETERS"` | `SPHYGMOMANOMETERS_PHYSICAL_004` | Indicator | pastikan tanda meter maupun skala dalam kedaan bersih dan mudah diliat dan kaca penutup pada sphygmomanometer aneroid masih dalam kedaan utuh | 40 | true |
| `SPHYGMOMANOMETERS` | resolve `DeviceType.id` where `code="SPHYGMOMANOMETERS"` | `SPHYGMOMANOMETERS_PHYSICAL_005` | Konektor | periksa dan pastikan semua kondisi konektor dalam kedaan baik | 50 | true |
| `SPHYGMOMANOMETERS` | resolve `DeviceType.id` where `code="SPHYGMOMANOMETERS"` | `SPHYGMOMANOMETERS_PHYSICAL_006` | Label | periksa apakah ada label, plakat, stiker, atau kartu instruksi manual tersedia dan terbaca 374653683000 Tidak | 60 | true |
| `SPHYGMOMANOMETERS` | resolve `DeviceType.id` where `code="SPHYGMOMANOMETERS"` | `SPHYGMOMANOMETERS_PHYSICAL_007` | Manset | pastikan semua manset dalam kondisi bagus, bersih, dan tidak sobek. | 70 | true |
| `SPHYGMOMANOMETERS` | resolve `DeviceType.id` where `code="SPHYGMOMANOMETERS"` | `SPHYGMOMANOMETERS_PHYSICAL_008` | Pengaturan titik 0 | pastikan manset tidak ada tekanan, maka aneroid gauge atau level air raksa harus berada di titik 0 (±1 mmHg). Apabila level air raksa tidak berada pada posisi 0, buang atau tambahkan air raksanya dengan hati-hati sampai air raksa berada di level 0 mmHg. Ganti aneroid gauge apabila tidak berada pada posisi 0 mmHg | 80 | true |
| `SPIROMETER` | resolve `DeviceType.id` where `code="SPIROMETER"` | `SPIROMETER_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `SPIROMETER` | resolve `DeviceType.id` where `code="SPIROMETER"` | `SPIROMETER_PHYSICAL_002` | Tusuk kontak alat | Periksa apakah ada gangguan pada tusuk kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar | 20 | true |
| `SPIROMETER` | resolve `DeviceType.id` where `code="SPIROMETER"` | `SPIROMETER_PHYSICAL_003` | Kabel catu utama | Periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas. | 30 | true |
| `SPIROMETER` | resolve `DeviceType.id` where `code="SPIROMETER"` | `SPIROMETER_PHYSICAL_004` | Tombol, saklar dan control | Periksa seluruhnya pastikan berfungsi baik | 40 | true |
| `SPIROMETER` | resolve `DeviceType.id` where `code="SPIROMETER"` | `SPIROMETER_PHYSICAL_005` | Tampilan dan indicator | Selama pengecekan fungsi, pastikan lampu indicator dan tampilan layar berfungsi baik | 50 | true |
| `STERILLIZER` | resolve `DeviceType.id` where `code="STERILLIZER"` | `STERILLIZER_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `STERILLIZER` | resolve `DeviceType.id` where `code="STERILLIZER"` | `STERILLIZER_PHYSICAL_002` | Tusuk kontak alat | Periksa apakah ada gangguan pada tusuk kontak (AC power). Gerak-gerakan tusuk kontak untuk memastikan kemaanannya. Goyang-goyangkan tusuk kontak untuk untuk memastikan tidak ada bauta tau mur yang longgar. Jika ada, buka mur dan ganti dan perbaiki bila perlu. | 20 | true |
| `STERILLIZER` | resolve `DeviceType.id` where `code="STERILLIZER"` | `STERILLIZER_PHYSICAL_003` | Kabel catu utama (Line cord) | Periksa kabel, apakah terlihat ada kerusakan. Jika ada pindahkan atau tukar kabel yang rusak. Jika kerusakan disekitar ujung kabel singkirkan bagian yang rusak dan ganti dengan yang baru. Pastikan kabel power yang baru ataupun kotak kontak yang baru mempunyai polaritas yang sama dengan yang lama. Periksa juga fungsi kabel chargernya waktu dipergunakan untuk mengisi ulang. | 30 | true |
| `STERILLIZER` | resolve `DeviceType.id` where `code="STERILLIZER"` | `STERILLIZER_PHYSICAL_004` | Tombol, saklar dan kontrol | Sebelum mempergunakan/ mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi kontrol. Ingat pengaturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan. | 40 | true |
| `STERILLIZER` | resolve `DeviceType.id` where `code="STERILLIZER"` | `STERILLIZER_PHYSICAL_005` | Tampilan dan indikator | selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi | 50 | true |
| `SUCTION_PUMP` | resolve `DeviceType.id` where `code="SUCTION_PUMP"` | `SUCTION_PUMP_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `SUCTION_PUMP` | resolve `DeviceType.id` where `code="SUCTION_PUMP"` | `SUCTION_PUMP_PHYSICAL_002` | Kotak kontak alat | periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar. | 20 | true |
| `SUCTION_PUMP` | resolve `DeviceType.id` where `code="SUCTION_PUMP"` | `SUCTION_PUMP_PHYSICAL_003` | Kabel catu utama | periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas. | 30 | true |
| `SUCTION_PUMP` | resolve `DeviceType.id` where `code="SUCTION_PUMP"` | `SUCTION_PUMP_PHYSICAL_004` | Tombol, Saklar dan pengaman | sebelum mempergunakan/mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi control. Ingat peraturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan. | 40 | true |
| `SUCTION_PUMP` | resolve `DeviceType.id` where `code="SUCTION_PUMP"` | `SUCTION_PUMP_PHYSICAL_005` | Tampilan dan indicator | Selama pengecekan fungsi, pastikan lampu indicator dan tampilan layar berfungsi baik. | 50 | true |
| `SUCTION_PUMP` | resolve `DeviceType.id` where `code="SUCTION_PUMP"` | `SUCTION_PUMP_PHYSICAL_006` | Sistem pengunci pergerakan | Lakukan pemeriksaan system pengunci pergerakan | 60 | true |
| `SUCTION_PUMP` | resolve `DeviceType.id` where `code="SUCTION_PUMP"` | `SUCTION_PUMP_PHYSICAL_007` | Filter | Periksa kondisi filter pastikan tidak kotor 374663683100Tidak Baik | 70 | true |
| `SUCTION_PUMP` | resolve `DeviceType.id` where `code="SUCTION_PUMP"` | `SUCTION_PUMP_PHYSICAL_008` | Motor/pompa penghisap | Periksa kondisi fisik motor dan pastikan berfungsi 374654635500 Baik 374663683100 Tidak Baik | 80 | true |
| `SYRINGE_PUMP` | resolve `DeviceType.id` where `code="SYRINGE_PUMP"` | `SYRINGE_PUMP_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `SYRINGE_PUMP` | resolve `DeviceType.id` where `code="SYRINGE_PUMP"` | `SYRINGE_PUMP_PHYSICAL_002` | Tusuk kontak alat | Periksa apakah ada gangguan pada tusuk kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar | 20 | true |
| `SYRINGE_PUMP` | resolve `DeviceType.id` where `code="SYRINGE_PUMP"` | `SYRINGE_PUMP_PHYSICAL_003` | Kabel catu utama | Periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas. | 30 | true |
| `SYRINGE_PUMP` | resolve `DeviceType.id` where `code="SYRINGE_PUMP"` | `SYRINGE_PUMP_PHYSICAL_004` | Tombol, saklar dan control | Periksa seluruhnya pastikan berfungsi baik | 40 | true |
| `SYRINGE_PUMP` | resolve `DeviceType.id` where `code="SYRINGE_PUMP"` | `SYRINGE_PUMP_PHYSICAL_005` | Tampilan dan indicator | Selama pengecekan fungsi, pastikan lampu indicator dan tampilan layar berfungsi baik | 50 | true |
| `SYRINGE_PUMP` | resolve `DeviceType.id` where `code="SYRINGE_PUMP"` | `SYRINGE_PUMP_PHYSICAL_006` | System pengunci pergerakan | Lakukan pemeriksaan system pengunci pergerakan 374653683000 Tidak | 60 | true |
| `SYRINGE_PUMP` | resolve `DeviceType.id` where `code="SYRINGE_PUMP"` | `SYRINGE_PUMP_PHYSICAL_007` | Alarm dsan system interlock. | Periksa alarm dan system interlock pastikan berfungsi dengan baik. | 70 | true |
| `SYRINGE_PUMP` | resolve `DeviceType.id` where `code="SYRINGE_PUMP"` | `SYRINGE_PUMP_PHYSICAL_008` | Motor/pompa penghisap | Periksa kondisi fisik motor dan pastikan berfungsi baik/normal. | 80 | true |
| `ULTRASONIC_NEBULIZERS` | resolve `DeviceType.id` where `code="ULTRASONIC_NEBULIZERS"` | `ULTRASONIC_NEBULIZERS_PHYSICAL_001` | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. | 10 | true |
| `ULTRASONIC_NEBULIZERS` | resolve `DeviceType.id` where `code="ULTRASONIC_NEBULIZERS"` | `ULTRASONIC_NEBULIZERS_PHYSICAL_002` | Kotak kontak alat | periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar. | 20 | true |
| `ULTRASONIC_NEBULIZERS` | resolve `DeviceType.id` where `code="ULTRASONIC_NEBULIZERS"` | `ULTRASONIC_NEBULIZERS_PHYSICAL_003` | Kabel catu utama | periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas. | 30 | true |
| `ULTRASONIC_NEBULIZERS` | resolve `DeviceType.id` where `code="ULTRASONIC_NEBULIZERS"` | `ULTRASONIC_NEBULIZERS_PHYSICAL_004` | Tombol, Saklar dan control | Periksa seluruhnya, pastikan berfungsi baik dan Kembali pada posisi pengaturan awal. | 40 | true |
| `ULTRASONIC_NEBULIZERS` | resolve `DeviceType.id` where `code="ULTRASONIC_NEBULIZERS"` | `ULTRASONIC_NEBULIZERS_PHYSICAL_005` | Tampilan dan indikator | selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi | 50 | true |

**Total baris di tabel di atas: 246**

---

## 5. Mapping Exceptions

Hanya mapping yang benar-benar unresolved / tidak aman untuk seed sekarang.

### 5.1 DeviceType ada, LK tidak ada / unresolved

| DeviceType | Masalah | Tindakan |
|---|---|---|
| `PATIENT_MONITOR` | Tidak ada `LK Patient Monitor.docx` di korpus 50. Keputusan terkunci: **jangan** warisi BSM / invent. | **REVIEW** — 0 item; jangan seed diam-diam |
| `OXYMETER_MONITOR`, `VENTILATOR`, `BREAST_PUMPS`, `RADIANT_WARMER`, … | Ada di master DeviceType tetapi **tidak** ada LK fisik di korpus | ZERO items — bukan error mapping; bukan invent |

### 5.2 LK ada, DeviceType **tidak** ada di `seed-device-types.ts`

Ini `MAPPING_REVIEW_REQUIRED`. **Jangan** create DeviceType pengganti. Baris LK dicatat di §5.3 untuk review, **bukan** masuk proposed seed §4.

| LK | Kode kandidat (audit / extension exclude) | Item di LK | Status |
|---|---|---:|---|
| `LK Auto Chemistry Analyzer.docx` | `AUTO_CHEMISTRY_ANALYZER` | 5 | MAPPING_REVIEW_REQUIRED |
| `LK Hematologi Analyzer.docx` | `HEMATOLOGI_ANALYZER` | 5 | MAPPING_REVIEW_REQUIRED |
| `LK Otoscope.docx` | `OTOSCOPE` | 4 | MAPPING_REVIEW_REQUIRED (ikuti LK as-is **jika** DeviceType nanti ada) |
| `LK Phaco Emulsifikasi.docx` | `PHACO_EMULSIFIKASI` | 7 | MAPPING_REVIEW_REQUIRED (ikuti LK as-is **jika** DeviceType nanti ada) |
| `LK pH Meter.docx` | `PH_METER` | 2 | MAPPING_REVIEW_REQUIRED |
| `LK Thermohygrometer.docx` | `THERMOHYGROMETER` | 3 | MAPPING_REVIEW_REQUIRED |

### 5.3 Baris LK tertahan (bukan seed) — wording penuh untuk review

| LK Source | Missing DeviceType note | No | Name | Inspection Limit |
|---|---|---:|---|---|
| `LK Auto Chemistry Analyzer.docx` | AUTO_CHEMISTRY_ANALYZER (not in seed-device-types.ts) | 1 | Badan dan permukaan alat | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya |
| `LK Auto Chemistry Analyzer.docx` | AUTO_CHEMISTRY_ANALYZER (not in seed-device-types.ts) | 2 | Tusuk kontak alat | Periksa apakah ada gangguan pada tusuk kontak (AC-Power). Gerak-gerakan tusuk kontak untuk memastikan keamanannya. Goyang-goyangkan tusuk kintak untuk memastikan tidak ada bauta tau mur yang longgar. Jika ada, buka mur dan ganti dan perbaiki bila perlu. |
| `LK Auto Chemistry Analyzer.docx` | AUTO_CHEMISTRY_ANALYZER (not in seed-device-types.ts) | 3 | Kabel catu utama (Line cord) | Periksa kabel, apakah terlihat ada kerusakan. Jika ada pindahkan atau tukar kabel yang rusak. Jika kerusakan disekitar ujung kabel singkirkan bagian yang rusak dan ganti dengan yang baru. Pastikan kabel power yang baru ataupun kotak kontak yang baru mempunyai polaritas yang sama dengan yang lama. |
| `LK Auto Chemistry Analyzer.docx` | AUTO_CHEMISTRY_ANALYZER (not in seed-device-types.ts) | 4 | Tombol, saklar dan kontrol | sebelum mempergunakan/mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi control. Ingat peraturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan. |
| `LK Auto Chemistry Analyzer.docx` | AUTO_CHEMISTRY_ANALYZER (not in seed-device-types.ts) | 5 | Tampilan dan indicator | selama pengecekan fungsi, pastikan lampu indikator dan tampilan berfungsi seluruhnya, yakinkan bahwa bagian tampilan digital berfungsi. |
| `LK Hematologi Analyzer.docx` | HEMATOLOGI_ANALYZER (not in seed-device-types.ts) | 1 | Badan dan permukaan alat | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya |
| `LK Hematologi Analyzer.docx` | HEMATOLOGI_ANALYZER (not in seed-device-types.ts) | 2 | Tusuk kontak alat | Periksa apakah ada gangguan pada tusuk kontak (AC-Power). Gerak-gerakan tusuk kontak untuk memastikan keamanannya. Goyang-goyangkan tusuk kintak untuk memastikan tidak ada bauta tau mur yang longgar. Jika ada, buka mur dan ganti dan perbaiki bila perlu. |
| `LK Hematologi Analyzer.docx` | HEMATOLOGI_ANALYZER (not in seed-device-types.ts) | 3 | Kabel catu utama (Line cord) | Periksa kabel, apakah terlihat ada kerusakan. Jika ada pindahkan atau tukar kabel yang rusak. Jika kerusakan disekitar ujung kabel singkirkan bagian yang rusak dan ganti dengan yang baru. Pastikan kabel power yang baru ataupun kotak kontak yang baru mempunyai polaritas yang sama dengan yang lama. |
| `LK Hematologi Analyzer.docx` | HEMATOLOGI_ANALYZER (not in seed-device-types.ts) | 4 | Tombol, saklar dan kontrol | sebelum mempergunakan/mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi control. Ingat peraturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan. |
| `LK Hematologi Analyzer.docx` | HEMATOLOGI_ANALYZER (not in seed-device-types.ts) | 5 | Tampilan dan indicator | selama pengecekan fungsi, pastikan lampu indikator dan tampilan berfungsi seluruhnya, yakinkan bahwa bagian tampilan digital berfungsi. |
| `LK Otoscope.docx` | OTOSCOPE (not in seed-device-types.ts) | 1 | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. |
| `LK Otoscope.docx` | OTOSCOPE (not in seed-device-types.ts) | 2 | Kotak kontak alat | periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar. |
| `LK Otoscope.docx` | OTOSCOPE (not in seed-device-types.ts) | 3 | Kabel catu utama | periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas. |
| `LK Otoscope.docx` | OTOSCOPE (not in seed-device-types.ts) | 4 | Tampilan dan indikator | selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi |
| `LK pH Meter.docx` | PH_METER (not in seed-device-types.ts) | 1 | Badan dan permukaan alat | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya |
| `LK pH Meter.docx` | PH_METER (not in seed-device-types.ts) | 2 | Kondisi Fungsi | Periksa apakah ada gangguan pada tusuk tombol dan display |
| `LK Phaco Emulsifikasi.docx` | PHACO_EMULSIFIKASI (not in seed-device-types.ts) | 1 | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. |
| `LK Phaco Emulsifikasi.docx` | PHACO_EMULSIFIKASI (not in seed-device-types.ts) | 2 | Kotak kontak alat | periksa apakah ada gangguan pada kotak kontak (AC-Power). Gerak-gerakkan kotak kontak untuk memastikan keamanannya. Goyang-goyangkan kotak kontak untuk memastikan tidak ada baut atau mur yang longgar. |
| `LK Phaco Emulsifikasi.docx` | PHACO_EMULSIFIKASI (not in seed-device-types.ts) | 3 | Kabel catu utama | periksa kabel, apakah terlihat ada kerusakan atau bagian isolasi yang terkelupas. |
| `LK Phaco Emulsifikasi.docx` | PHACO_EMULSIFIKASI (not in seed-device-types.ts) | 4 | Tombol, Saklar dan pengaman | sebelum mempergunakan/mengubah-ubah tombol kontrol, periksa posisinya, jika terlihat tidak berada pada posisinya (periksa dengan menggunakan mode pemeriksaan standar). Bandingkan dengan posisi control. Ingat peraturan tersebut dan jangan lupa untuk mengembalikan pada setting awal jika sudah selesai menggunakan. |
| `LK Phaco Emulsifikasi.docx` | PHACO_EMULSIFIKASI (not in seed-device-types.ts) | 5 | Tampilan dan indicator | Selama pengecekan fungsi, pastikan lampu indicator dan tampilan layar berfungsi baik. |
| `LK Phaco Emulsifikasi.docx` | PHACO_EMULSIFIKASI (not in seed-device-types.ts) | 6 | Sistem pengunci pergerakan | Lakukan pemeriksaan system pengunci pergerakan |
| `LK Phaco Emulsifikasi.docx` | PHACO_EMULSIFIKASI (not in seed-device-types.ts) | 7 | Filter | Periksa kondisi filter pastikan tidak kotor 374654635500 Baik 374663683100 Tidak Baik |
| `LK Thermohygrometer.docx` | THERMOHYGROMETER (not in seed-device-types.ts) | 1 | Badan / Permukaan | periksa bagian luar unit, pastikan bersih, terpasang ketat satu dan lainnya dan tidak ada bekas tertimpa cairan ataupun gangguan lainnya. |
| `LK Thermohygrometer.docx` | THERMOHYGROMETER (not in seed-device-types.ts) | 2 | Baterai | Pastikan baterai berfungsi dengan baik |
| `LK Thermohygrometer.docx` | THERMOHYGROMETER (not in seed-device-types.ts) | 3 | Tampilan dan indikator | selama pengecekan fungsi, pastikan tampilan indicator dan tampilan berfungsi seluruhnya, yakinkan bahwa tampilan digital berfungsi |

---

## 6. Zero-Item DeviceTypes

### Intentional zero (ada LK, tanpa seksi fisik)

| DeviceType | LK | Item Count | Alasan |
|---|---|---:|---|
| `ELECTRIC_BEDS` | `LK Kelistrikan.docx` | **0** | Keputusan terkunci #9 — tidak ada seksi *Pemerikasaan Kondisi Fisik dan Fungsi Komponen Alat*. Jangan buat item artifisial. |

### Unresolved zero

| DeviceType | Item Count | Alasan |
|---|---:|---|
| `PATIENT_MONITOR` | **0** | Keputusan terkunci #11 — unresolved; jangan inherit/invent |

### Existing DeviceType tanpa LK fisik di korpus 50 (zero by absence of source)

`AMBULATORY_ECG`, `ASPIRATORS_SUCTION`, `BREAST_PUMPS`, `CARDIAC_OUTPUT_UNITS`, `OXYGEN_AIR_PROPORTIONERS`, `OXYMETER_MONITOR`, `PARAFFIN_BATHS`, `RADIANT_WARMER`, `RADIANT_WARMERS_ADULT`, `REGULATORS_AIR_O2_SUCTION`, `REGULATORS_LOW_VOLUME_SUCTION`, `RESUSCITATORS_CARDIAC`, `VENTILATOR`

Ini **bukan** gagal seed. Mereka tetap valid DeviceType dengan 0 PhysicalCheckItem sampai ada LK / keputusan bisnis.

---

## 7. Locked Special Cases

| # | Keputusan | Verifikasi seed proposal |
|---:|---|---|
| 1 | Physical + Function = ONE domain | Semua baris seksi LK masuk satu `DevicePhysicalCheckItem` domain; tidak dipisah |
| 2 | Preserve LK wording variants | Tidak merge `Badan / Permukaan` vs `Badan dan permukaan alat`; `Kotak` vs `Tusuk`; `indikator` vs `indicator`; dll. |
| 3 | Sphyg “Pengaturan titik 0” tetap Physical | `SPHYGMOMANOMETERS_PHYSICAL_008` ada; ±1 mmHg tetap di prosa `inspectionLimit` |
| 4 | ECG baterai vs charger = DUA item | `…_005 Baterai/Charger` dan `…_007 Periksa kondisi charger` terpisah |
| 5 | pH “Kondisi Fungsi” satu item | Ada di §5.3 (tertahan karena DeviceType belum ada); **satu** baris, tidak dipecah |
| 6 | Suspected copy-paste assumed correct | Infusion/Syringe *Motor/pompa penghisap*; Line cord + *charger* pada cold-chain family — tetap di-seed apa adanya |
| 7 | Phaco / Otoscope follow LK as-is | Tertahan di §5 (DeviceType missing); wording **tidak** dikoreksi |
| 8 | Cold Chain + Kulkas Vaksin satu LK | Satu sumber → item di **kedua** DeviceType existing; bukan shared entity |
| 9 | ELECTRIC_BEDS = 0 item | §6 |
| 10 | Telaah “Kondisi Alat (10)” excluded | Tidak ada baris Telaah di dataset; cut ekstraksi sebelum Telaah Teknis |
| 11 | PATIENT_MONITOR unresolved | 0 item; tidak diwarisi dari BSM |

---

## 8. Data Integrity Checks

| Check | Result |
|---|---|
| A. Setiap `deviceTypeCode` di §4 ada di `seed-device-types.ts` | **PASS** (44 kode ⊆ 59) |
| B. Tidak ada DeviceType baru yang diusulkan untuk create | **PASS** |
| C. Duplicate `(deviceTypeCode, code)` | **PASS** — 0 |
| D. LK row order preserved (`sortOrder` = No×10) | **PASS** |
| E. LK wording preserved (name) | **PASS** — tidak dinormalisasi |
| F. `inspectionLimit` dari Batas Pemeriksaan | **PASS** — 0 empty |
| G. ELECTRIC_BEDS count | **0** |
| H. Telaah Kondisi Alat (10) | **excluded** |
| I. PATIENT_MONITOR silently seeded? | **NO** |
| J. DeviceCalibrationParameter modified? | **NO** (prepare-only) |
| K. Relation DevicePhysicalCheckItem ↔ DeviceCalibrationParameter? | **NONE** |
| L. MeasurementResult data? | **NONE** |
| M. Tolerance semantics? | **NONE** (prosa only; Sphyg ±1 mmHg tetap teks) |
| N. capabilityGroups changes? | **NONE** |
| DeviceTypes referenced (seedable) | **44** |
| DeviceTypes missing for LK-with-section | **6** LK (§5.2) |
| Total proposed items | **246** |
| Total LK Parameter rows in 49 sections (audit) | 266 (= 240 mapped unique + 26 unmapped; +5 Cold Chain duplicate → 246 seed rows) |

---

## 9. Proposed Seed Implementation

**JANGAN DIJALANKAN di task ini.**

Preferred file (konvensi repo, analog `seed-device-calibration-parameters.ts`):

`packages/db/prisma/seed-physical-check-items.ts`

### Requirements

1. Resolve `DeviceType` by **code** (existing rows only). Fail loud if code missing — **do not create DeviceType**.
2. Deterministic constant array of `{ deviceTypeCode, code, name, inspectionLimit, sortOrder }` sourced from §4.
3. Idempotent upsert on `@@unique([deviceTypeId, code])`.
4. `isActive: true` on create; on re-run prefer `update` name / inspectionLimit / sortOrder / isActive=true **or** document a no-clobber policy — recommended for first seed: upsert create+update of those fields so wording corrections from LK re-apply safely.
5. Skip `ELECTRIC_BEDS` / `PATIENT_MONITOR` / missing DeviceTypes entirely (no empty inserts needed).
6. Do **not** touch DeviceCalibrationParameter, MeasurementResult, permissions, UI.
7. Wire later via `package.json` script `seed:physical-check-items` — **not** in this prepare task.

### Sketch (illustrative — not executed)

```ts
// packages/db/prisma/seed-physical-check-items.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Generated from PhysicalInspection_Master_Seed.md §4 — do not invent rows. */
const ITEMS: Array<{
  deviceTypeCode: string;
  code: string;
  name: string;
  inspectionLimit: string;
  sortOrder: number;
}> = [
  // …246 rows from §4…
];

async function main() {
  const types = await prisma.deviceType.findMany({
    where: { code: { in: [...new Set(ITEMS.map((i) => i.deviceTypeCode))] } },
    select: { id: true, code: true },
  });
  const idByCode = new Map(types.map((t) => [t.code, t.id]));

  for (const item of ITEMS) {
    const deviceTypeId = idByCode.get(item.deviceTypeCode);
    if (!deviceTypeId) {
      throw new Error(`[seed] DeviceType missing: ${item.deviceTypeCode}`);
    }
    await prisma.devicePhysicalCheckItem.upsert({
      where: {
        deviceTypeId_code: { deviceTypeId, code: item.code },
      },
      create: {
        deviceTypeId,
        code: item.code,
        name: item.name,
        inspectionLimit: item.inspectionLimit,
        sortOrder: item.sortOrder,
        isActive: true,
      },
      update: {
        name: item.name,
        inspectionLimit: item.inspectionLimit,
        sortOrder: item.sortOrder,
        isActive: true,
      },
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
```

Sumber data untuk array `ITEMS`: salin 246 baris §4 (atau generate dari artefak review yang sama). File seed **belum** dibuat di repo pada task prepare ini agar review manusia mendahului eksekusi.

### Cold Chain note in implementation

Emit **two** deviceTypeCode groups from one LK source (`COLD_CHAIN` and `KULKAS_VAKSIN`) with independent codes (`COLD_CHAIN_PHYSICAL_001` … and `KULKAS_VAKSIN_PHYSICAL_001` …).

---

## 10. Files Changed

| File | Action |
|---|---|
| `docs/claude/plans/technician-app/ui-tasks/PhysicalInspection_Master_Seed.md` | **Created** (dokumen ini — satu-satunya artefak persist) |

**Tidak diubah / tidak dijalankan:** DeviceType master, DeviceCalibrationParameter, MeasurementResult, API, UI, lifecycle, database. File `packages/db/prisma/seed-physical-check-items.ts` **belum** dibuat (hanya diusulkan di §9). Seed DB **tidak** dieksekusi.

---

## 11. Final Verdict

**READY_FOR_REVIEW**

Proposed `DevicePhysicalCheckItem` dataset (246 rows / 44 DeviceTypes) lengkap untuk review manusia. Eksekusi seed DB adalah **task berikutnya** setelah approval. Enam LK dengan DeviceType missing + `PATIENT_MONITOR` tetap di jalur review/mapping — tidak di-seed diam-diam.
