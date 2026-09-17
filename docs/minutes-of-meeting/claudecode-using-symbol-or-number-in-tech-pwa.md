Written for: the product owner and the Stage B implementer — analysis, not a build.

Report is at investigation-6a-symbol-valuetype.md. No schema, migration, or code changes were made — this was analysis only. The single file written is the report itself.

The four things that matter:

1. The premise is wrong in a helpful way. MeasurementResult can already store a symbol today. schema.prisma:2270 has measuredText String? alongside a nullable measuredValue Decimal(18,6)?, and measuredText is already accepted by Zod (index.ts:955), persisted by the write service, and displayed by Portal review (page.tsx:1847-1848). No schema change is needed. (Also: calibrationValueType doesn't exist — the field is valueType; grep finds that name only in the MoM file.)

2. Per-reading, not per-parameter. I decrypted and scanned all 66 Excel job files (password 1004; 4 turned out unencrypted). No symbol reading exists anywhere in the corpus — the 1,065 marker-shaped cells are all physical-inspection √ ticks, tolerance text (± 10%, ≤ 40), or - placeholders that sit exclusively in the reference-equipment brand/model/serial block. So there's no evidence for either option, and per-parameter classification is the wrong call anyway: setting a parameter to TEXT would both remove it from the technician's entry list (calibration-jobs.service.ts:1549) and permanently null the verdict on its normal readings.

3. isWithinTolerance — confirmed, not refuted. A symbol row leaves measuredValue NULL, and measurement-tolerance.ts:242-243 already returns null in that case. It's the "NULL, needs human review" path with zero code changes.

4. The symbol picker is mounted in tech-pwa — and cannot work on this field. It's global in both apps, but insert-symbol.ts:3 lists "number" first in SKIP_INPUT_TYPES, and both entry fields are type="number". The technician gets a clipboard fallback, not an insert.

That last point is the only thing genuinely blocking Stage B: build the measured-value field as type="text" inputMode="decimal", not type="number". Behaviour for the technician is identical today (JS validation already exists), the picker becomes compatible for free, and symbol support later is additive instead of a rework of both screens.

One real bug surfaced along the way, independent of this decision: lk-download.service.ts:581-597 returns measuredText only for TEXT/RATIO — so a symbol on a NUMBER parameter is silently dropped from the certificate. That's reachable through the existing API right now and worth scheduling separately.
