# 9. Environmental Conditions + Electrical Safety Mapping

## 9.1 Temuan Kunci: Dimodelkan Generik, BUKAN Model Khusus

Kondisi lingkungan dan keselamatan listrik **TIDAK** punya model Prisma dedicated (`EnvironmentalCondition`, `ElectricalSafetyResult`, dll TIDAK ADA). Keduanya dimodelkan sebagai `DeviceCapability` biasa + `DeviceCalibrationParameter` biasa + `MeasurementResult` biasa — mekanisme **identik** dengan parameter kinerja alat (Heart Rate, SpO2, dst).

```29:40:D:\medcal\packages\db\prisma\seed-device-capabilities.ts
{
  code: "ENVIRONMENTAL_CONDITIONS",
  name: "Kondisi Lingkungan",
  description:
    "Room temperature, humidity, and input voltage readings recorded before/after calibration. Present in nearly all LK worksheets (Section B).",
},
{
  code: "ELECTRICAL_SAFETY",
  name: "Keselamatan Listrik",
  description:
    "Standard electrical safety test block (earth resistance, insulation resistance, leakage currents) per IEC 62353-style testing. Present in nearly all LK worksheets (Section D).",
},
```

```240:276:D:\medcal\packages\db\prisma\seed-device-capabilities.ts
// ENVIRONMENTAL_CONDITIONS — Section B, all LK docs
{ capabilityCode: "ENVIRONMENTAL_CONDITIONS", code: "ROOM_TEMPERATURE", name: "Suhu Ruangan" },
{ capabilityCode: "ENVIRONMENTAL_CONDITIONS", code: "ROOM_HUMIDITY", name: "Kelembaban / RH" },
{ capabilityCode: "ENVIRONMENTAL_CONDITIONS", code: "INPUT_VOLTAGE", name: "Tegangan Input (L-N/L-G/N-G)" },
// ELECTRICAL_SAFETY — Section D, all LK docs
{ capabilityCode: "ELECTRICAL_SAFETY", code: "PROTECTIVE_EARTH_RESISTANCE", name: "Resistansi Pembumian Protektif" },
{ capabilityCode: "ELECTRICAL_SAFETY", code: "INSULATION_RESISTANCE", name: "Resistansi Isolasi" },
{ capabilityCode: "ELECTRICAL_SAFETY", code: "EQUIPMENT_LEAKAGE_CURRENT", name: "Arus Bocor Peralatan" },
{ capabilityCode: "ELECTRICAL_SAFETY", code: "APPLIED_PART_LEAKAGE_CURRENT", name: "Arus Bocor Bagian yang Diaplikasikan" },
```

Setiap `DeviceType` (termasuk `BED_SIDE_MONITOR` dan `BABY_INCUBATOR`) mendapat baris `DeviceCalibrationParameter` sendiri per item ini (mis. `BSM_ROOM_TEMP`, `INCU_EARTH_RESISTANCE`, dst.) — jumlahnya berulang untuk **hampir setiap DeviceType** di seed (BLOOD_PRESSURE_MONITOR, HUMIDIFIER, BABY_INCUBATOR, INFANT_WARMER, RADIANT_WARMER, PULSE_OXIMETERS, OXYMETER_MONITOR, RESUSCITATORS_*, BED_SIDE_MONITOR, PATIENT_MONITOR, dst.) — pola replikasi 1:1 per DeviceType, generik, tanpa cabang kode khusus.

## 9.2 Field Konfigurasi (Bukan Measurement) yang Belum Terpetakan

LK section E "Pengukuran Keselamatan Listrik" juga punya metadata KONFIGURASI alat (bukan hasil ukur), yang muncul di kedua golden example:

| Metadata | Nilai contoh (BSM & Baby Incubator) | Field MedCal | Status |
|---|---|---|---|
| Tipe bagian yang diaplikasikan (B/BF/CF) | `B` | — | **Tidak ditemukan** field/kolom dedicated |
| Kelas Proteksi (I/II/Baterai) | `I` | — | **Tidak ditemukan** |
| Hubungan Utama (DPS/NPS/PIE) | `DPS` | — | **Tidak ditemukan** |

Ketiga metadata ini bukan "hasil pengukuran" (bukan angka dengan toleransi), melainkan **klasifikasi/kategori alat** yang menentukan ambang batas mana yang relevan (mis. arus bocor bagian teraplikasi hanya relevan untuk Tipe B/BF/CF, tidak untuk alat bercatu baterai). Tidak ditemukan representasinya di `Device`, `DeviceType`, `CalibrationJob`, atau `DeviceCalibrationParameter` manapun. **Gap C (Implementation Gap)** — ini adalah data klasifikasi yang perlu ada di suatu tempat (kemungkinan idealnya di `Device` atau `DeviceType` sebagai atribut tetap alat) untuk LK bisa direproduksi otomatis dengan akurat, tapi saat ini tidak ada tempat menyimpannya.

## 9.3 Gap "OR" Text vs NUMBER valueType

Lihat detail lengkap di [07-decimal-places-mapping.md §7.5](07-decimal-places-mapping.md) — Resistansi Isolasi dicatat sebagai teks `"OR"` di kedua golden example, tapi `valueType` parameter di seed adalah `NUMBER` (default, tidak ada override). Gap C.

## 9.4 Perbedaan Struktural: Tegangan Input 1 Parameter vs 3 Sub-Reading

Baik LK docx maupun Excel golden example mencatat **3 nilai** untuk Tegangan (L-N, L-G, N-G), tapi katalog hanya punya **1** `DeviceCalibrationParameter` (`*_INPUT_VOLTAGE`) per DeviceType. Cara MedCal merepresentasikan 3 nilai ini di bawah 1 parameter (3 `MeasurementResult` row via `replicateIndex` 1/2/3? 3 `CalibrationTestPoint`? kolom terpisah yang belum ditemukan?) **tidak bisa dipastikan dari skema + seed saja** — memerlukan pengecekan data live/test lain yang di luar cakupan file yang diperiksa. **Gap B**, dilaporkan bukan ditebak.

## 9.5 Kesimpulan

**Feasibility: PARTIAL.**

- ✅ Struktur dasar (parameter + toleransi + hasil) untuk Kondisi Lingkungan & Keselamatan Listrik SUDAH generik dan berfungsi untuk BSM & Baby Incubator.
- ❌ Metadata konfigurasi alat (Tipe bagian diaplikasikan, Kelas Proteksi, Hubungan Utama) TIDAK punya tempat penyimpanan.
- ❌ Representasi 3-sub-reading Tegangan Input tidak jelas dari skema saja.
- ❌ Nilai teks "OR" untuk Resistansi Isolasi tidak sesuai `valueType = NUMBER`.
