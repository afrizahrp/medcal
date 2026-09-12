# STAGE 2 — Audiometer Split + CalibrationTestPoint Seed Applied

**Date:** 2026-09-08
**Mode:** Applied to local `pkmdb`. Two sub-steps, each verified before the next.
**Predecessor:** `CalibrationTestPoint_Seed_Extraction.md` (Stage 1 proposal).
**HARD STOP** after this — await review before resuming UI planning.

---

## Resolved ambiguities (from Stage 1 §3)

| # | Decision |
|---|---|
| A1 | **Split** `AUD_PURE_TONE_LINEARITY` / `AUD_FREQUENCY_RESPONSE` into `_KANAN` / `_KIRI` `DeviceCalibrationParameter` rows — the worksheet prints two distinct tables, structurally two series. |
| A2 | `INCU_AIR_TEMP` — **keep 10 points** (5 sensors × 2 settings). Folding the setting into `attemptNumber`/`replicateIndex` would overload their locked meaning. |
| A3 | `PULSEOX_SPO2` — **keep the duplicated 90** as two disambiguated points, faithful to the worksheet. |

---

## Task A — Split Audiometer parameters

**Script:** `packages/db/prisma/fix-collapsed-audiometer-parameters.ts` (new), mirroring
`fix-collapsed-pattern-c-parameters.ts`. Difference: the two originals are **deactivated**
(`isActive = false`), not hard-deleted — `CalibrationTestPoint` / `MeasurementResult` now carry FKs
to `DeviceCalibrationParameter.id`, so the rows are kept for referential safety + audit.

### Before → after

| Metric | Before | After | Δ |
|---|---:|---:|---:|
| `DeviceCalibrationParameter` total | 489 | **493** | +4 |
| `DeviceCalibrationParameter` active | 489 | **491** | +2 |

- Deactivated (kept): `AUD_PURE_TONE_LINEARITY` (sortOrder 10), `AUD_FREQUENCY_RESPONSE` (sortOrder 20)
- Created active, inheriting deviceType / capabilityItem / uom / valueType / tolerance* / decimalPlaces:

| new code | name | toleranceNote | sortOrder |
|---|---|---|---:|
| `AUD_PURE_TONE_LINEARITY_KANAN` | Linieritas dB Pure Tone (Earphone Kanan) | `± 1 dB` | 10 |
| `AUD_PURE_TONE_LINEARITY_KIRI` | Linieritas dB Pure Tone (Earphone Kiri) | `± 1 dB` | 11 |
| `AUD_FREQUENCY_RESPONSE_KANAN` | Frekuensi Respon / Tanggap (Earphone Kanan) | `± 2%` | 20 |
| `AUD_FREQUENCY_RESPONSE_KIRI` | Frekuensi Respon / Tanggap (Earphone Kiri) | `± 2%` | 21 |

**Idempotency:** confirmed — re-run prints `Already applied … No-op.` (0 changes).

---

## Task B — CalibrationTestPoint seed

**Script:** `packages/db/prisma/seed-calibration-test-points.ts` (updated). The two folded AUD
entries (14 + 8 points, ear in the label) were replaced with **four** entries targeting the split
codes, each with its own **undoubled** setpoint list:

| code | points |
|---|---:|
| `AUD_PURE_TONE_LINEARITY_KANAN` | 80/70/60/50/40/30/20 dB → **7** |
| `AUD_PURE_TONE_LINEARITY_KIRI` | 80/70/60/50/40/30/20 dB → **7** |
| `AUD_FREQUENCY_RESPONSE_KANAN` | 250/500/6000/8000 Hz → **4** |
| `AUD_FREQUENCY_RESPONSE_KIRI` | 250/500/6000/8000 Hz → **4** |

`INCU_AIR_TEMP` (10) and `PULSEOX_SPO2` (8) unchanged.

### Applied counts

| Metric | Stage 1 proposal | Stage 2 applied |
|---|---:|---:|
| Parameters seeded | 38 (2 AUD entries) | **40** (4 AUD entries) |
| `CalibrationTestPoint` rows | 191 | **191** *(unchanged — 14+8 folded = 7+7+4+4 undoubled)* |

> Stage 1 report §1 stated "39 params" — that was an off-by-one (the script had 38 entries). The
> real shift is **38 → 40** parameters; the row total is genuinely unchanged at 191.

Breakdown of the 191 rows: Pattern B 160 (33 params) · D-fixed 12 (4) · D-generic 6 (1) ·
override 13 (2).

**Idempotency:** confirmed — re-run reports `0 parameters touched, 0 rows inserted`.

### Spot-check (per the task)

```
AUD_PURE_TONE_LINEARITY_KANAN    active=true   testPoints=7
AUD_PURE_TONE_LINEARITY_KIRI     active=true   testPoints=7
AUD_FREQUENCY_RESPONSE_KANAN     active=true   testPoints=4
AUD_FREQUENCY_RESPONSE_KIRI      active=true   testPoints=4
AUD_PURE_TONE_LINEARITY          active=false  testPoints=0
AUD_FREQUENCY_RESPONSE           active=false  testPoints=0
TOTAL CalibrationTestPoint: 191  | params with test points: 40
```

Audiometer counts are **7 and 4**, not 14 / 8. ✅

---

## Deferred (already decided — not acted on)

- `PATIENT_MONITOR`, `OXYMETER_MONITOR`, `BREAST_PUMPS`, `RESUSCITATORS_CARDIAC` — left unseeded
  (speculative / inactive catalog entries).
- `VENTILATOR` — worksheet is a PDF (`docs/legal_n_competency/Penilaian Kemampuan.zip → LK Ventilator
  Transport.pdf`); left unseeded, small separate follow-up.

---

## Testing / no-regression

| Check | Result |
|---|---|
| `pnpm --filter @medcal/api exec tsc --noEmit` | ✅ exit 0 |
| Type-check both new/updated seed scripts (`tsc --noEmit`) | ✅ exit 0 |
| `pnpm --filter @medcal/api exec vitest run measurement calibration-jobs` | ✅ **136/136 passed** (4 files) |
| `pnpm --filter @medcal/api test` (full) | 891 passed / **10 failed** / 13 skipped — failures pre-existing & unrelated (see below) |

### Test suite — full run

`891 passed, 10 failed (6 files), 13 skipped`. **None of the failures are attributable to this
change:**

- The failing files are in unrelated modules — `whitelist/registration-origin-callers.test.ts`
  (asserts a tech-pwa sign-in file carries an `Origin` header), `push-tokens/
  notification-dispatch.service.test.ts` (push-icon URL resolution), and 4 others. No calibration,
  `DeviceCalibrationParameter`, or `CalibrationTestPoint` test is among them.
- This change adds only **untracked new files** (`fix-collapsed-audiometer-parameters.ts`,
  `seed-calibration-test-points.ts`, docs) — **zero modifications to any tracked source** that
  `apps/api` compiles or imports (`git status` confirms).
- The data change lands in `pkmdb` only; the API test suite runs against a separate
  `TEST_DATABASE_URL` that `prepare-test-db` reseeds, so it never sees these rows.
- The calibration/measurement targeted run (136 tests) passes clean.

---

## Files

| File | Status |
|---|---|
| `packages/db/prisma/fix-collapsed-audiometer-parameters.ts` | **new** — run against `pkmdb`, idempotent |
| `packages/db/prisma/seed-calibration-test-points.ts` | **modified** — AUD entries re-pointed to split codes; run against `pkmdb`, idempotent |
| `docs/claude/plans/.../CalibrationTestPoint_Seed_Extraction.md` | annotated with a Stage-2 update note |

## HARD STOP

Applied to local `pkmdb` only. No migration, no schema change, no application-code change. Await
review before resuming UI planning.
