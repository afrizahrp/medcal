# Investigation: MoM #6a — Symbol Readings in MeasurementResult

**Mode:** read-only analysis. No schema, migration, or code change was made. This report is
the only file written.

## Summary

`MeasurementResult` **already has the storage it needs**: the numeric reading lives in
`measuredValue Decimal(18,6)?` (nullable) and a free-text reading already has a home in
`measuredText String?` — both are already accepted by the Zod request schemas, persisted by
the write service, and rendered by the Portal review screen. So this is **not a schema
problem**. The gap is entirely in the **tech-pwa entry path and the LK PDF renderer**: the
technician's field is `<input type="number">`, the tech-pwa wire types only carry
`measuredValue`, and `formatMeasuredValue` in the LK service ignores `measuredText` whenever
the parameter's `valueType` is `NUMBER` (which is 241 of the 242 catalog rows). On
per-parameter vs per-reading: **the evidence supports per-reading (Option B)** — the catalog
has no "symbol-capable" classification and no parameter that would plausibly carry one, and
a scan of all 66 filled Excel job files found **no recorded symbol reading at all**, so
there is nothing to classify in advance. One naming correction: the MoM's
`calibrationValueType` **does not exist**; the field is `DeviceCalibrationParameter.valueType`
(the *type* is `CalibrationValueType`) — grep finds `calibrationValueType` only inside the
MoM task file itself.

## Current State (Step 0)

### 1. `MeasurementResult` raw value storage

[schema.prisma:2254-2273](../../../../packages/db/prisma/schema.prisma#L2254-L2273) — the
reading block is already multi-typed, not numeric-only:

| Column | Type | Doc comment in schema |
| --- | --- | --- |
| `measuredValue` | `Decimal? @db.Decimal(18, 6)` | "Raw measured value exactly as entered — full precision, NEVER rounded. isWithinTolerance is computed from THIS (locked project rule). **NULL for BOOLEAN / TEXT readings** and for a LOGGER_SUMMARY that only carries an attachment." |
| `measuredBool` | `Boolean?` | Qualitative reading for `valueType = BOOLEAN`. |
| `measuredText` | `String?` | "Literal reading for valueType = TEXT, and the human form of a RATIO (`1:2.0`). measuredValue still holds the numeric form for RATIO math." |
| `isWithinTolerance` | `Boolean?` | "NULL = cannot be evaluated automatically … Deliberate; judged holistically by a human at QualityReview (G4). Never a forced guess, never false-by-default." |

The central constraint the MoM assumed — "the raw value column is numeric, so a symbol
cannot be stored" — **does not hold**. `measuredValue` is nullable and `measuredText` is an
unbounded `String?` (Zod caps it at 500 chars).

### 2. `DeviceCalibrationParameter.valueType` (the MoM's `calibrationValueType`)

- Enum: [schema.prisma:398-403](../../../../packages/db/prisma/schema.prisma#L398-L403) —
  `CalibrationValueType { NUMBER, RATIO, TEXT, BOOLEAN }`.
- Field: [schema.prisma:1379](../../../../packages/db/prisma/schema.prisma#L1379) —
  `valueType CalibrationValueType @default(NUMBER)`.

Distribution across the seeded catalog (read from the seed sources, which are the authority
for what is in the 242-row set):

| valueType | Count | Source |
| --- | --- | --- |
| `NUMBER` | 241 of 242 | default; every row without an explicit `valueType` in [seed-device-calibration-parameters.ts](../../../../packages/db/prisma/seed-device-calibration-parameters.ts) |
| `RATIO` | 1 (`VENT_IE_RATIO`, "Pengukuran I : E Ratio") | [seed-device-calibration-parameters.ts:855-859](../../../../packages/db/prisma/seed-device-calibration-parameters.ts#L855-L859) |
| `TEXT` | **0** | no seed row anywhere sets `TEXT` |
| `BOOLEAN` | 1 (extension seed, a `Pass / Fail` row) | [seed-device-taxonomy-extension-parameters.ts:424](../../../../packages/db/prisma/seed-device-taxonomy-extension-parameters.ts#L424) |

Plus one more `RATIO` in the extension seed
([:1111](../../../../packages/db/prisma/seed-device-taxonomy-extension-parameters.ts#L1111)).
Notably **`TEXT` is defined but entirely unused** — it is a free slot.

**Does the master definition need to change?** No. A parameter's `valueType` describes what
the parameter *normally* measures (a pressure in mmHg is a `NUMBER` parameter whether or not
the instrument glitched on one attempt). Marking such a parameter `TEXT` to permit an
occasional symbol would be actively harmful: `computeIsWithinTolerance` returns `null`
unconditionally for `TEXT`
([measurement-tolerance.ts:240](../../../../apps/api/src/modules/calibration-jobs/measurement-tolerance.ts#L240)),
so every *normal* numeric reading on that parameter would silently lose its automatic
pass/fail verdict. This is purely a `MeasurementResult`-level concern.

### 3. Every current branch point

**Tolerance engine (API)** —
[measurement-tolerance.ts](../../../../apps/api/src/modules/calibration-jobs/measurement-tolerance.ts):
- `computeIsWithinTolerance` [:236-252](../../../../apps/api/src/modules/calibration-jobs/measurement-tolerance.ts#L236-L252)
  branches on `valueType`: `BOOLEAN` → mirrors `measuredBool`; `TEXT` → always `null`;
  otherwise numeric, and **`null` measuredValue → `null` verdict** ([:242-243](../../../../apps/api/src/modules/calibration-jobs/measurement-tolerance.ts#L242-L243)).
- `resolveEffectiveTolerance` [:146](../../../../apps/api/src/modules/calibration-jobs/measurement-tolerance.ts#L146)
  takes `valueType` in its input but never reads it — bounds resolution is value-agnostic.

**Write path (API)** —
[measurement-results.service.ts](../../../../apps/api/src/modules/calibration-jobs/measurement-results.service.ts):
- `measuredText` is already a first-class input on create
  ([:93](../../../../apps/api/src/modules/calibration-jobs/measurement-results.service.ts#L93),
  persisted [:185](../../../../apps/api/src/modules/calibration-jobs/measurement-results.service.ts#L185)),
  batch ([:250](../../../../apps/api/src/modules/calibration-jobs/measurement-results.service.ts#L250))
  and update ([:307](../../../../apps/api/src/modules/calibration-jobs/measurement-results.service.ts#L307),
  [:321](../../../../apps/api/src/modules/calibration-jobs/measurement-results.service.ts#L321)),
  and a `measuredText` change already re-triggers the verdict recompute
  ([:323](../../../../apps/api/src/modules/calibration-jobs/measurement-results.service.ts#L323)).
- `assertMeasuredValueDecimalPlaces` [:497-521](../../../../apps/api/src/modules/calibration-jobs/measurement-results.service.ts#L497-L521)
  returns early on `null`/`""`, so omitting `measuredValue` is already legal.

**Validation (shared Zod)** —
[packages/shared/src/schemas/index.ts:955](../../../../packages/shared/src/schemas/index.ts#L955)
and [:984](../../../../packages/shared/src/schemas/index.ts#L984): `measuredText:
z.string().trim().max(500).nullable().optional()` on both the create and update schemas.

**Parameter-list gate (API)** —
[calibration-jobs.service.ts:1549](../../../../apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts#L1549)
and [:1560](../../../../apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts#L1560):
the tech-pwa `measurement-parameters` endpoint hard-filters `valueType: "NUMBER"`. A
parameter reclassified to `TEXT` would **disappear from the technician's entry screen
entirely** — another reason Option A (per-parameter reclassification) is a trap.

**PDF / LK rendering (API)** —
[lk-download.service.ts:581-597](../../../../apps/api/src/modules/calibration-jobs/lk-download.service.ts#L581-L597):
`formatMeasuredValue` returns `measuredText` **only** for `TEXT`/`RATIO`. For a `NUMBER`
parameter it reads `measuredValue`, and `null` → `null` → the cell is dropped by the
`.filter()` at [:515](../../../../apps/api/src/modules/calibration-jobs/lk-download.service.ts#L515).
**This is the one genuine defect**: a symbol stored today in `measuredText` on a `NUMBER`
parameter would be silently invisible on the certificate.

**Entry UI (`tech-pwa` — this is where the technician actually works)**:
- [apps/tech-pwa/src/app/jobs/[id]/measurements/[parameterId]/page.tsx:292-294](../../../../apps/tech-pwa/src/app/jobs/%5Bid%5D/measurements/%5BparameterId%5D/page.tsx#L292-L294)
  — Pattern A replicate field: `inputMode="decimal"`, `type="number"`.
- [apps/tech-pwa/src/app/jobs/[id]/measurements/measurement-grid.tsx:253-255](../../../../apps/tech-pwa/src/app/jobs/%5Bid%5D/measurements/measurement-grid.tsx#L253-L255)
  — Pattern B grid cell: same.
- [apps/tech-pwa/src/lib/calibration/measurement.ts:156-167](../../../../apps/tech-pwa/src/lib/calibration/measurement.ts#L156-L167)
  — `MeasurementBatchItem` and `MeasurementUpdateInput` carry **only** `measuredValue`;
  `measuredText` exists on the read-side `TechMeasurementResult`
  ([:141](../../../../apps/tech-pwa/src/lib/calibration/measurement.ts#L141)) but is never sent.
- `validateMeasuredValue` [:281-286](../../../../apps/tech-pwa/src/lib/calibration/measurement.ts#L281-L286)
  rejects anything non-numeric before submit.
- `parameterEntryStatus` / `gridEntryStatus` [:362-398](../../../../apps/tech-pwa/src/lib/calibration/measurement.ts#L362-L398)
  count "filled" purely by `measuredValue !== null && !== ""` — a symbol-only row would read
  as **not filled**.

**Review UI (`portal` — admin/QA side only, no entry)**:
[apps/portal/src/app/management/calibration-jobs/[id]/page.tsx:1847-1848](../../../../apps/portal/src/app/management/calibration-jobs/%5Bid%5D/page.tsx#L1847-L1848)
already falls back `formatMeasurementHasilDisplay(...) ?? row.measuredText ?? …`. **Portal
review already displays a symbol reading correctly today.** No entry logic lives in Portal.

### 4. The symbol-picker component

- Component: [packages/ui/src/symbol-picker/GlobalSymbolPicker.tsx](../../../../packages/ui/src/symbol-picker/GlobalSymbolPicker.tsx),
  exported from [packages/ui/src/index.ts](../../../../packages/ui/src/index.ts). Supporting
  modules: `symbol-registry.ts`, `filter-symbols.ts`, `insert-symbol.ts`,
  `recent-symbols.ts`, `use-last-compatible-field.ts`.
- Call sites — **it is mounted in BOTH apps, globally**:
  - `tech-pwa`: [apps/tech-pwa/src/components/global-symbol-picker-host.tsx](../../../../apps/tech-pwa/src/components/global-symbol-picker-host.tsx), rendered from `apps/tech-pwa/src/app/providers.tsx` on every route except `/sign-in`.
  - `portal`: [apps/portal/src/components/global/portal-symbol-picker.tsx](../../../../apps/portal/src/components/global/portal-symbol-picker.tsx), rendered from `apps/portal/src/app/providers.tsx`, likewise global.
- It is **not bound to any specific field**. It targets whatever text field was last focused
  (`use-last-compatible-field`), triggered by `Ctrl+Shift+M` or the floating `Ω` button.

**The blocking detail — and it is the real finding of Step 0.4:**
[insert-symbol.ts:3-31](../../../../packages/ui/src/symbol-picker/insert-symbol.ts#L3-L31)
lists `"number"` first in `SKIP_INPUT_TYPES`, and `isCompatibleInputType` returns true
**only** for `type === "text"`. Both measurement entry fields are `type="number"`. So today,
a technician who opens the picker on the measurement screen and taps `Ω` gets the
clipboard-copy fallback and a "No text field selected" status
([GlobalSymbolPicker.tsx:90-100](../../../../packages/ui/src/symbol-picker/GlobalSymbolPicker.tsx#L90-L100)) —
the symbol is never inserted. The component is present in tech-pwa; it is **structurally
incompatible with the field it would need to serve**. "Available in the app" ≠ "usable on
this field".

## Per-Parameter vs Per-Reading (Step 1)

**Evidence gathered.** All 66 `.xlsx` files in `docs/technician-docs/measurement-results/`
were opened and scanned (62 are encrypted OLE, opened with the password `1004` already
documented in
[calibration-results-cross-check.md:5](measurement-results/calibration-results-cross-check.md#L5);
4 — `Hematologi Analyzer`, `Phaco Emulsifikasi`, `Thermometer Ear dan Thermometer IR`,
`Urine Analyzer` — turned out to be unencrypted and were read directly). Every sheet was
walked; every non-numeric string cell sitting in a column that otherwise holds ≥5 numeric
values was collected (8,193 cells), then filtered for symbol/marker shapes (1,065 cells).

**Result: no recorded symbol reading was found anywhere in the corpus.** Every marker-shaped
cell falls into one of three non-reading categories:

| What was found | Count | Example | What it actually is |
| --- | --- | --- | --- |
| `√` / `✓` | 431 | `Audiometer.xlsx` / `skorsing` / J60 | Physical-inspection tick marks (Uji Fungsi Fisik), not measurements — already modelled by `PhysicalCheckVerdict` |
| Tolerance / limit text | ~250 | `± 10%`, `≤ 40`, `≥ 90%`, `25 ℃`, `17-27 ℃` | Spec cells (`toleranceNote` territory), not readings |
| Bare `-` | 132 | `Defibrilator dengan ECG.xlsx` / `Input Data` / E15-G15 | **All** in the reference-equipment block (brand / model / serial of the standard), e.g. row `B15=1 \| C15=Defibrilator Analyzer \| E15=- \| F15=- \| G15=-`, and `E17=ROX \| F17=- \| G17=STP-01`. Not a measurement cell. |

No `OL`, `OF`, `ERR`, `E1`, `HI`, `LO`, `∞`, `N/A` or overflow marker appears in any reading
position in any of the 66 files.

**Conclusion.** Stated plainly, as the task requires: **the corpus contains no evidence for
either option.** This does not refute the product owner — these 66 files are per-device
worksheets recording ordinary successful calibrations; an instrument fault during a reading
is by nature rare and would not be expected to survive into a filed worksheet (a technician
who got `OL` would most likely re-read, or leave the cell blank and write a `CATATAN`).

**Given no evidence for a pre-declarable class, Option B (per-reading) is the sound choice**,
on three independent grounds:

1. **Nothing to classify.** There is no candidate parameter. The failure mode described —
   "the instrument shows an error/overflow instead of a number" — is a property of *the
   moment*, not of the parameter. Any of the 241 `NUMBER` parameters could exhibit it.
2. **Option A is actively destructive.** Reclassifying a parameter to `TEXT` both removes it
   from the tech-pwa entry list ([calibration-jobs.service.ts:1549](../../../../apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts#L1549))
   and permanently nulls the verdict for its normal numeric readings
   ([measurement-tolerance.ts:240](../../../../apps/api/src/modules/calibration-jobs/measurement-tolerance.ts#L240)).
3. **The schema was already designed this way.** `measuredValue`, `measuredBool` and
   `measuredText` are three nullable siblings on the *row*, not a single column whose shape
   is dictated by the parameter. The row-level exception already fits.

## Proposed Options (Step 2)

### Option 1 — Use the existing `measuredText` as the per-reading symbol slot (recommended)

No schema change, no migration. A symbol reading is stored as `measuredValue = NULL` +
`measuredText = "OL"` on an ordinary `NUMBER` parameter's row.

- **Pass/fail + `isWithinTolerance`:** **Confirmed — this is exactly the "NULL, not
  auto-fail" case, and it already works with zero changes.** For `valueType = NUMBER`,
  `computeIsWithinTolerance` reaches `const value = toDecimal(input.measuredValue); if (value
  === null) return null;`
  ([measurement-tolerance.ts:242-243](../../../../apps/api/src/modules/calibration-jobs/measurement-tolerance.ts#L242-L243)).
  A symbol row therefore yields `isWithinTolerance = NULL` → tech-pwa renders the neutral
  "Perlu telaah" chip
  ([measurement.ts:338-346](../../../../apps/tech-pwa/src/lib/calibration/measurement.ts#L338-L346))
  → judged by a human at QualityReview, per the locked rule. The other locked rule (pass/fail
  from raw numeric values only, never display values) is untouched: there is no numeric value
  to round, and the symbol never enters the tolerance computation.
- **Symbol-picker reuse in the technician's real field flow:** **not directly reusable as
  built.** The component is mounted in tech-pwa, but the entry field is `type="number"`,
  which `insert-symbol.ts` explicitly skips. The entry field must become a `type="text"`
  controlled input with `inputMode="decimal"` (keeping the numeric soft-keyboard on a phone)
  before the existing picker can insert into it. That is a **Stage B UI decision**, not a
  change to the picker — `packages/ui` needs no modification.
- **Work required (all in Stage B or a follow-up, none of it schema):**
  1. tech-pwa entry field → `type="text" inputMode="decimal"` (both Pattern A and the grid).
  2. Add `measuredText` to `MeasurementBatchItem` / `MeasurementUpdateInput`
     ([measurement.ts:156-167](../../../../apps/tech-pwa/src/lib/calibration/measurement.ts#L156-L167))
     and route a non-numeric draft there instead of rejecting it.
  3. **Fix [lk-download.service.ts:581-597](../../../../apps/api/src/modules/calibration-jobs/lk-download.service.ts#L581-L597)**
     so `formatMeasuredValue` falls back to `measuredText` for `NUMBER` too — otherwise the
     symbol is invisible on the certificate. This is a real bug regardless of which option wins.
  4. Make `parameterEntryStatus` / `gridEntryStatus` count a symbol row as filled
     ([measurement.ts:366](../../../../apps/tech-pwa/src/lib/calibration/measurement.ts#L366), [:388](../../../../apps/tech-pwa/src/lib/calibration/measurement.ts#L388)).
- **Size / risk:** small. Zero migration risk. Main risk is semantic overloading —
  `measuredText` currently means "the RATIO's human form"; a symbol is a different meaning in
  the same column. Mitigated by the fact that RATIO parameters are 2 rows out of 244 and
  never overlap with a `NUMBER` symbol row.

### Option 2 — Dedicated `measuredSymbol String?` column on `MeasurementResult`

Same per-reading model, but a new nullable column so "symbol exception" is never confused
with "RATIO human form", plus optionally a `CHECK` that `measuredValue` and `measuredSymbol`
are not both non-null.

- **Pass/fail + `isWithinTolerance`:** identical to Option 1 — `measuredValue` stays NULL, so
  the verdict is NULL by the existing code path. Would additionally want `measuredSymbol` in
  the update-path change detection
  ([measurement-results.service.ts:301-323](../../../../apps/api/src/modules/calibration-jobs/measurement-results.service.ts#L301-L323)).
- **Symbol-picker reuse:** exactly as Option 1 — same `type="number"` obstacle, same fix.
- **Size / risk:** medium. One additive nullable column + migration, plus threading it
  through Zod, service create/batch/update, the tech-pwa wire types, the Portal display
  fallback, and the LK renderer. Buys clean semantics; costs a migration and ~6 touch points
  for a case with no corpus evidence yet.

### Option 3 — Widen `measuredValue` to a discriminated raw-value column

Rejected before detailing: it breaks the locked "pass/fail from raw numeric values" rule's
simplest guarantee (the column is a `Decimal` the engine can trust), forces every existing
consumer to re-parse, and requires a destructive migration of live rows. No upside over
Options 1-2.

## Recommendation: Blocking for Stage B or Not

**Partially blocking — one small decision must be made now; the rest can be deferred.**

- **Not blocking (defer):** the storage question. `measuredText` already exists, is already
  validated, persisted and displayed on Portal. Nothing about it needs to be settled before
  Stage B starts, and Option 1 can be adopted later with no migration and no rework of stored
  data.
- **Blocking (decide now):** **the entry field's input type.** If Stage B ships the
  measurement field as `type="number"` — as both current screens do — then adding symbol
  entry later means reworking the field, its validation, its draft state, and its submit path
  in both the Pattern A page and the Pattern B grid, *and* the already-mounted symbol picker
  stays unusable on it. If Stage B instead builds the field as `type="text"
  inputMode="decimal"` with numeric validation in JS (which `validateMeasuredValue` already
  does — [measurement.ts:281-286](../../../../apps/tech-pwa/src/lib/calibration/measurement.ts#L281-L286)),
  the behaviour for the technician is unchanged today, the existing global picker becomes
  compatible for free, and symbol support later is a small additive change.

**Recommendation:** adopt **Option 1**, and give Stage B one constraint up front — *the
measured-value field is a `type="text" inputMode="decimal"` controlled input, not
`type="number"`*. Separately, schedule the
[lk-download.service.ts](../../../../apps/api/src/modules/calibration-jobs/lk-download.service.ts)
`formatMeasuredValue` fallback as a standalone fix: a `NUMBER`-parameter row whose reading is
in `measuredText` is silently dropped from the certificate today, and that is already
reachable through the existing API.

Designing the actual tech-pwa symbol-entry interaction (how the technician signals "this is a
symbol, not a number", how the cell renders afterwards) is **not** part of this task — it
belongs to the Stage B build once Option 1 is approved.
