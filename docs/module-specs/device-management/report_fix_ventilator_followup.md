# Report: Ventilator Names (Backup Source) + Retroactive Code-Branching Check

**Date:** 2026-08-27
**Type:** Two independent parts — (1) finish the VENTILATOR `name` alignment deferred in
Batch 1; (2) retroactive check that no code branches on the old English `name` values (covers
**all** changes so far: Phase 1 + Batch 1 + this task).
Scope: `name` only. No `code` / tolerance / `uomId` / `valueType` / FK changes.

---

## Step 0 — Target DB

`postgresql://postgres:***@localhost:5432/pkmdb?schema=public` (`d:/medcal/.env` line 2 —
local native `pkmdb`, `localhost:5432`). Not Docker/staging/prod.

---

## Part 1 — VENTILATOR names

### Source

`docs/technician-docs/` has **no** `LK Ventilator` document. Per the G1 backfill precedent, the
verified backup source was used:

> `docs/legal_n_competency/Penilaian Kemampuan/Ventilator/LK Ventilator Transport.pdf`
> (Formulir F.MT.LK.01.12, Edisi 01/00, 05-05-2025) — the same PDF the existing Ventilator
> tolerances (`VENT_TIDAL_VOLUME`, `VENT_IE_RATIO` `valueType=RATIO`, …) were originally taken
> from. **Backup source, not `technician-docs/`** — noted here for trace consistency with the
> G1 report.

Section **E. Hasil Pengukuran Kinerja Alat** literal sub-section titles were used verbatim
(the LK writes these mostly in English/mixed form — kept as-is, not translated).

### DeviceCapabilityItem — 9 rows (`VENTILATION_PERFORMANCE`; VENTILATOR-only)

| code | before | after | PDF §E source |
|---|---|---|---|
| TIDAL_VOLUME | Tidal Volume | Pengukuran Tidal Volume | "1. Pengukuran tidal volume" |
| MINUTE_VOLUME | Minute Volume | Pengukuran Minute Volume | "2. Pengukuran minute volume" |
| VENT_RESPIRATION_RATE | Respiration Rate | Pengukuran Respiration Rate | "3. Pengukuran respiration rate" |
| IE_RATIO | I:E Ratio | Pengukuran I : E Ratio | "4. Pengukuran I : E Ratio" |
| INSPIRATORY_TIME | Inspiratory Time | Inspiratory Time (Ti) | "5. Inspiratory time (Ti)" |
| EXPIRATORY_TIME | Expiratory Time | Expiratory Time (Te) | "6. Expiratori time (Te)" — source misspells "Expiratori"; kept correct "Expiratory" + the "(Te)" it adds |
| PEEP | Positive End-Expiratory Pressure | Pengukuran Positive End-Expiratory Pressure (PEEP) | "7. Pengukuran Positive End-exipiratory pressure (PEEP)" — source misspells "exipiratory"; kept correct spelling |
| PEAK_INSPIRATORY_PRESSURE | Peak Inspiratory Pressure | Peak Inspiratory Pressure (Ppeak) | "8. Peak inspiratory pressure (ppeak)" |
| FIO2_ACCURACY | FiO2 Accuracy | Pengukuran FIO2 | "9. Pengukuran FIO2" |

### DeviceCalibrationParameter — 9 rows (`VENTILATOR`)

`VENT_TIDAL_VOLUME`, `VENT_MINUTE_VOLUME`, `VENT_RESP_RATE`, `VENT_IE_RATIO`, `VENT_INSP_TIME`,
`VENT_EXP_TIME`, `VENT_PEEP`, `VENT_PPEAK`, `VENT_FIO2` — each set to the same value as its
capability item above (before → after identical to the item table).

> VENTILATOR env/electrical rows were already aligned in Batch 1 (from the universal LK
> Kelistrikan block); this PDF's §B/§D confirm those terms verbatim ("Resistansi Pembumian
> Protektif", "Arus Bocor Peralatan", "Suhu (°C)", "Kelembaban / RH (%)", "Tegangan Input").

---

## Part 2 — Retroactive code-branching check (Phase 1 + Batch 1 + Ventilator)

**Method:** searched `apps/api`, `apps/portal`, `apps/tech-pwa`, `apps/web`, `packages/*` for
`.name === "…"` / `name ==` / `switch (…name)` and for every old English string value of the
four tables (`DeviceCategory`, `DeviceCapability`, `DeviceCapabilityItem`,
`DeviceCalibrationParameter`).

**Result: CLEAN — no application code branches on any of these `name` values.**

| finding | location | assessment |
|---|---|---|
| old name strings ("Electrical Safety", "Protective Earth Resistance", "Room Temperature", "Systolic Pressure", "Equipment Leakage Current", "Non-Invasive Blood Pressure", "Blood Pressure Monitor", …) | only in `packages/db/prisma/seed-*.ts` and `fix-collapsed-pattern-c-parameters.ts` | these are the **source** of the names (now updated) — not consumers |
| `expect(parameter.capabilityItem.name).toBe("Systolic Pressure")`, `expect(...deviceType.name).toBe("Blood Pressure Monitor")`, `name: "Room Temperature"`, `name: "Equipment Leakage Current"`, `capability.name).toBe("Non-Invasive Blood Pressure")` etc. | `apps/api/src/modules/*/*.service.test.ts` (device-calibration-parameters, devices, device-types, device-models, device-categories, device-capabilities, calibration-requests) | each test **creates its own fixture rows** with literal names + `uniqueCode()` and asserts on the value it just wrote — self-contained, does **not** read seeded data. Unaffected. `turbo typecheck`+`build` green. |
| `switch (name)` in `apps/portal/src/components/management/icons.tsx:248` | nav-icon key enum (`"dashboard"`, `"leads"`, …) | unrelated to device data |
| `deviceType.name` / `category.name` / `capabilityItem.name` across `apps/portal` and `apps/web` (device tables, forms, quotation PDF, service-category cards, breadcrumbs) | ~30 sites | **display / label / search-value only** — no logic. All logic keys off `code` / `id`. |

No fixes required. No hidden dependency slipped past the earlier batches.

---

## Seed sync

| file | change |
|---|---|
| `seed-device-capabilities.ts` | 9 `ITEMS[].name` (VENTILATION_PERFORMANCE) |
| `seed-device-calibration-parameters.ts` | 9 `PARAMETERS[].name` (VENT_*) |

Re-ran `seed-device-capabilities.ts` + `seed-device-calibration-parameters.ts` → post-seed DB
dump vs. pre-seed: **exactly the 9 + 9 VENT name changes, 0 other differences, 0 non-`name`
changes**. Seed and DB fully in sync.

---

## Verification

| check | result |
|---|---|
| `DeviceCapabilityItem` count | 98 → 98 |
| `DeviceCalibrationParameter` count | 489 → 489 |
| non-`name` fields on the 18 touched rows | 0 changes (dump diff) |
| rows outside VENTILATOR / VENTILATION_PERFORMANCE | 0 touched |
| seed re-run drift vs DB | 0 |
| code-branching check (Part 2) | CLEAN — reported in full above |
| `pnpm turbo run typecheck` | ✅ 10/10 |
| `pnpm turbo run build` | ✅ 5/5 |
| `prettier --check` (2 param files) | clean; `seed-device-capabilities.ts` keeps the same pre-existing CRLF warning noted in Phase 1 |

## Files changed

- `packages/db/prisma/seed-device-capabilities.ts`
- `packages/db/prisma/seed-device-calibration-parameters.ts`

## Status of the overall effort

- Phase 1 (Category + Capability): done.
- Batch 1 (Patient Monitoring, Respiratory & Oxygen, Resuscitation items/params): done,
  **including VENTILATOR now** — no batch-1 items remain.
- Batches 2–4 (remaining categories): not started.
