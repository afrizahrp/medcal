# 5. Calibration Parameter Mapping

## 5.1 Alur Data

```
DeviceCapability (section LK)
  → DeviceCapabilityItem (sub-komponen)
    → DeviceCalibrationParameter (baris pengukuran, per DeviceType)
      → CalibrationTestPoint (opsional, grid setpoint Pattern B/override)
        → MeasurementResult (hasil aktual, per CalibrationJob + attempt + replicate)
```

## 5.2 Pattern Klasifikasi (`entryStyle` + keberadaan test point)

| Pattern | Ciri | Contoh | `entryStyle` |
|---|---|---|---|
| A | Satu parameter, replikasi I–V, tanpa sweep setpoint | Kondisi lingkungan, keselamatan listrik, illuminance | `DIRECT_REPLICATES`, tanpa `CalibrationTestPoint` |
| B | Sweep setpoint tetap (mis. Heart Rate 30/60/120/180) | `BSM_HEART_RATE`, `BSM_SPO2`, NIBP | `DIRECT_REPLICATES` + `CalibrationTestPoint` |
| C (override) | Sweep dengan toleransi berbeda per titik | `INCU_AIR_TEMP` (2 kelas toleransi), `SUCT_MAX_VACUUM` | `DIRECT_REPLICATES` + `CalibrationTestPoint` dengan `toleranceMin/Max` per titik |
| D (logger) | Grid logger 30 timepoint × 9 sensor (kulkas, oven, sterilisator) | `entryStyle = LOGGER_SUMMARY` |

Sumber klasifikasi ini dikonfirmasi lewat audit internal sebelumnya (`docs/module-specs/measurement-results/calibration-results-cross-check.md` §4) dan diverifikasi ulang di audit ini untuk BSM/Baby Incubator secara spesifik ([02](02-bed-side-monitor-mapping.md), [03](03-baby-incubator-mapping.md)).

## 5.3 Validasi & Evaluasi Toleransi (Runtime)

```149:161:D:\medcal\apps\api\src\modules\calibration-jobs\measurement-results.service.ts
const { parameter, testPoint } = await this.loadCatalog(
  input.deviceCalibrationParameterId,
  input.calibrationTestPointId ?? null,
);

assertMeasuredValueDecimalPlaces(input.measuredValue, parameter.decimalPlaces);

const resolved = resolveEffectiveTolerance({
  valueType: parameter.valueType,
  parameter,
  testPoint,
  suppliedNominalValue: input.suppliedNominalValue,
});
```

Toleransi efektif (setelah resolve nominal untuk Pattern B "±delta") disnapshot ke `MeasurementResult.effectiveToleranceMin/Max` — lihat schema comment:

```2248:2255:D:\medcal\packages\db\prisma\schema.prisma
/// Snapshot of the bounds actually applied, frozen so a later edit to the
/// master catalog never silently rewrites a submitted reading's verdict.
effectiveToleranceMin Decimal? @db.Decimal(18, 4)
effectiveToleranceMax Decimal? @db.Decimal(18, 4)
appliedNominalValue   Decimal? @db.Decimal(18, 4)
```

`isWithinTolerance` dihitung dari `measuredValue` mentah, TIDAK PERNAH ditebak/paksa — `NULL` jika tidak bisa dihitung otomatis (dinilai manual saat `QualityReview`):

```2242:2247:D:\medcal\packages\db\prisma\schema.prisma
/// TRUE / FALSE from raw measuredValue vs the effective tolerance.
/// NULL = "cannot be evaluated automatically" — no computable tolerance
/// (null bounds AND no parseable "+/- delta" note). Deliberate; judged
/// holistically by a human at QualityReview (G4). Never a forced guess,
/// never false-by-default. No manual-override field is added here (decision #6).
isWithinTolerance     Boolean?
```

## 5.4 Cross-Check Evidence (BSM & Baby Incubator, dikonfirmasi di audit ini)

Semua parameter kinerja BSM (`BSM_HEART_RATE`, `BSM_RESP_RATE`, `BSM_SPO2`, `BSM_SYSTOLIC/DIASTOLIC/MAP`) dan Baby Incubator (`INCU_AIR_TEMP`, `INCU_OVERSHOOT_TEMP`, `INCU_MATTRESS_TEMP`, `INCU_AIR_VELOCITY`, `INCU_NOISE_LEVEL`, `INCU_SKIN_TEMP_SENSOR`) sudah ada sebagai `DeviceCalibrationParameter` biasa — **tidak ada satu baris kode aplikasi pun** yang hardcode logic khusus per device type untuk kinerja alat (semua diproses generik lewat `measurement-results.service.ts`).

## 5.5 Gap yang Ditemukan (Diringkas — detail di file masing-masing)

| Gap | Device | Kategori | Detail |
|---|---|---|---|
| Jumlah titik SpO2 tidak konsisten antar sumber evidence (7 vs 8) | BSM | B | [02 §2.6.c](02-bed-side-monitor-mapping.md) |
| 3 sub-reading Tegangan (L-N/L-G/N-G) di bawah 1 parameter `INPUT_VOLTAGE` | BSM, Baby Incubator | B | [02 §2.3](02-bed-side-monitor-mapping.md) |
| `INCU_AIR_TEMP` test point 5×2=10 titik sudah "FLAGGED" oleh tim sendiri sebagai desain terbuka | Baby Incubator | B (sudah diketahui) | [03 §3.6.1](03-baby-incubator-mapping.md) |
| `INCU_SKIN_TEMP_SENSOR` tidak punya `CalibrationTestPoint` untuk 2 kelas toleransi berbeda | Baby Incubator | C | [03 §3.6.3](03-baby-incubator-mapping.md) |
| Kelembaban dalam kompartemen inkubator (F.2) tidak ditemukan sebagai capability item terpisah dari `ROOM_HUMIDITY` | Baby Incubator | C (perlu verifikasi lanjutan) | [03 §3.6.2](03-baby-incubator-mapping.md) |

## 5.6 Kesimpulan

**Feasibility: YES (dengan catatan)** — mekanisme parameter kalibrasi sudah generik dan berfungsi untuk kedua golden example. Gap yang ada bersifat **data/seed-level** (parameter/test-point spesifik yang belum lengkap untuk kasus edge tertentu), BUKAN gap arsitektural. Tidak dibutuhkan model/tabel baru.
