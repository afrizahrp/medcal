# 7. Decimal Places / Numeric Formatting Mapping

## 7.1 Lokasi Field

```1355:1360:D:\medcal\packages\db\prisma\schema.prisma
// Digits after the decimal point required for this parameter's measured
// calibration result. Only meaningful for valueType = NUMBER; NULL for
// RATIO/TEXT/BOOLEAN. Existing NUMBER rows were backfilled with a uniform
// safe default of 0 (accurate per-parameter values are a separate follow-up).
// A CHECK constraint bounds it to 0..10 (see migrations).
decimalPlaces    Int?
```

`decimalPlaces` hidup di **katalog** (`DeviceCalibrationParameter`), BUKAN di `MeasurementResult` — nilai per-hasil tetap disimpan full-precision (`Decimal(18,6)`) dan tidak pernah dibulatkan; `decimalPlaces` hanya dipakai untuk **validasi** input dan (asumsi) **tampilan**.

## 7.2 Riwayat Backfill — Evidence-Based, Bukan Konvensi

Tiga tahap backfill ditemukan:

1. `20260829020000_set_decimalplaces_uniform_default_zero` — semua NUMBER row diisi `0` sebagai placeholder aman.
2. `backfill-device-calibration-parameter-tolerances.ts` — mengisi toleransi (bukan decimalPlaces) dari LK docx.
3. **`backfill-decimal-places-from-results.ts`** — mengisi `decimalPlaces` AKTUAL dari **measurement-results Excel yang sudah terisi** (bukan dari LK docx kosong):

```1:16:D:\medcal\packages\db\prisma\backfill-decimal-places-from-results.ts
/**
 * Backfill DeviceCalibrationParameter.decimalPlaces from filled
 * measurement-results Excel (2026-09-08 cross-check).
 *
 * Only the 42 catalog DeviceTypes that have a usable filled worksheet.
 * Rows for types without Excel stay at the 0 placeholder.
 *
 * IDEMPOTENT: NUMBER rows whose decimalPlaces is still 0 or NULL are updated.
 * A row already carrying a non-zero value is left untouched.
 *
 * Evidence: docs/claude/plans/Calibration-management/measurement-results/
 *   calibration-results-cross-check.md §2
 */
```

**Catatan:** komentar file ini mereferensikan path `docs/claude/plans/Calibration-management/measurement-results/calibration-results-cross-check.md` yang **tidak ada** di path tersebut — file yang benar-benar ada adalah `docs/module-specs/measurement-results/calibration-results-cross-check.md`. Ini adalah **inkonsistensi dokumentasi minor** (path referensi salah di komentar kode), dicatat sebagai temuan bukan diperbaiki (di luar scope "no code changes").

`BABY_INCUBATOR` dan `BED_SIDE_MONITOR` **keduanya** ada dalam daftar `EVIDENCE_DEVICE_TYPES` (42 device type dengan Excel usable) — konfirmasi bahwa decimal places untuk kedua golden example sudah di-backfill dari evidence nyata, bukan placeholder:

```20:63:D:\medcal\packages\db\prisma\backfill-decimal-places-from-results.ts
const EVIDENCE_DEVICE_TYPES = [
  "AUDIOMETER", "AUTOCLAVE", "BABY_INCUBATOR", "BED_SIDE_MONITOR",
  "BIO_SAFETY_CABINET", ... // 42 total
] as const;
```

## 7.3 Aturan Decimal Places (Regex Family + Override Eksplisit)

```113:123:D:\medcal\packages\db\prisma\backfill-decimal-places-from-results.ts
function familyDp(code: string): number | null {
  if (KINERJA_DP[code] != null) return KINERJA_DP[code];
  if (/EARTH_RESISTANCE$/.test(code)) return 3;
  if (/ROOM_TEMP$/.test(code)) return 1;
  if (/ROOM_HUMIDITY$/.test(code)) return 0;
  if (/INPUT_VOLTAGE$/.test(code)) return 1;
  if (/INSULATION_RESISTANCE$/.test(code)) return 0;
  if (/EQUIP_LEAKAGE$/.test(code)) return 1;
  if (/APPLIED_LEAKAGE$/.test(code)) return 1;
  return null;
}
```

`KINERJA_DP` (override eksplisit per-kode) untuk parameter kinerja spesifik:

```69:111:D:\medcal\packages\db\prisma\backfill-decimal-places-from-results.ts
const KINERJA_DP: Record<string, number> = {
  // ...
  INCU_AIR_TEMP: 2,
  INCU_OVERSHOOT_TEMP: 2,
  INCU_MATTRESS_TEMP: 2,
  INCU_AIR_VELOCITY: 1,
  INCU_NOISE_LEVEL: 1,
  // ... (BSM_* TIDAK ADA di daftar ini)
};
```

## 7.4 Verifikasi Independen dari Golden Example (Audit Ini)

| Parameter | `decimalPlaces` (dari backfill) | Nilai aktual di Excel golden example | Konsisten? |
|---|---|---|---|
| `BSM_ROOM_TEMP` / `INCU_ROOM_TEMP` (family: `ROOM_TEMP$`) | 1 | 28.1 / 28.5 (1 dp) | Ya |
| `*_ROOM_HUMIDITY` (family) | 0 | 46 / 47 (0 dp) | Ya |
| `*_INPUT_VOLTAGE` (family) | 1 | 225.3 / 230 (1 dp, meski 230 tampak 0dp) | Ya |
| `*_EARTH_RESISTANCE` (family) | 3 | 0.07 (2dp tertulis) / 0.212 (3dp) | Sebagian — 0.07 secara literal 2dp, kemungkinan trailing zero terpotong tampilan Excel (0.070) |
| `*_INSULATION_RESISTANCE` (family) | 0 | `"OR"` (teks, bukan angka!) | **TIDAK konsisten — nilai bukan angka sama sekali** (lihat §7.5) |
| `*_EQUIP_LEAKAGE` (family) | 1 | 0.1 (1dp) | Ya |
| `INCU_AIR_TEMP` (override) | 2 | 32.14, 32.15, dst (2dp) | Ya |
| `BSM_HEART_RATE`, `BSM_SPO2`, NIBP (tidak ada di `KINERJA_DP` maupun regex family) | default **0** | Semua nilai integer di kedua golden example (30, 60, 98, 120, dst.) | Ya — kebetulan tidak butuh override karena datanya memang integer |

## 7.5 Gap: `valueType = NUMBER` vs Nilai Teks "OR"

`INSULATION_RESISTANCE` (baik `BSM_INSULATION_RESISTANCE` maupun `INCU_INSULATION_RESISTANCE`) diseed dengan `valueType` default (`NUMBER`, karena tidak ada override eksplisit di `seed-device-calibration-parameters.ts` — hanya `VENT_IE_RATIO` yang eksplisit `RATIO`, sisanya default `NUMBER`).

```2201:2247:D:\medcal\packages\db\prisma\schema.prisma
model MeasurementResult {
  // ...
  measuredValue  Decimal?             @db.Decimal(18, 6)
  measuredText   String?
  // valueType pada parameter menentukan field mana yang valid untuk diisi
}
```

Namun **kedua** golden example (BSM dan Baby Incubator) mencatat nilai **`"OR"`** (teks, kemungkinan singkatan "Open Range" / "Out of Range" dalam konvensi teknisi kalibrasi listrik untuk insulation resistance yang melebihi rentang alat ukur) untuk Resistansi Isolasi — bukan angka numerik. Ini **cocok** dengan temuan audit internal sebelumnya (`calibration-results-cross-check.md` §2.1: "Insulation MΩ | ~48 | text `OR`, not a number").

**Ini adalah gap C (Implementation Gap) yang jelas dan sudah dikonfirmasi ganda** (audit internal 2026-09-08 + verifikasi independen audit ini pada 2 golden example): parameter Resistansi Isolasi TIDAK BISA merekam nilai lapangan yang sebenarnya (`"OR"`) selama `valueType` tetap `NUMBER`, karena `measuredValue` adalah `Decimal` sedangkan `measuredText` (untuk `TEXT`) tidak akan divalidasi/dipakai untuk parameter bertipe `NUMBER`. **Tidak diperbaiki di audit ini** (di luar scope "no code changes").

## 7.6 Kesimpulan

**Feasibility: PARTIAL** — mekanisme decimalPlaces sendiri solid dan evidence-based untuk hampir semua parameter kinerja & lingkungan/listrik pada kedua golden example. Satu gap konkret (Resistansi Isolasi = teks "OR") menghalangi representasi akurat 100% dari data lapangan riil untuk section Keselamatan Listrik.
