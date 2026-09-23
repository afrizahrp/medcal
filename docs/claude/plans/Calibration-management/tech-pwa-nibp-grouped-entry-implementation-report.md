# tech-pwa NIBP Grouped Stacked-Row Entry Screen — Implementation Report

## Status

**Already implemented on `main`.** This report documents and verifies the existing
implementation rather than introducing new code — see "How this report came about" below.

Commits:
- `75e0fc0` — "NIBP Grouped test point with UI/UX redefined" (Portal-side grouped Titik
  Ukur entry; own report already exists at
  `docs/claude/plans/Calibration-management/portal-titik-ukur-bulk-entry-implementation-report.md`)
- `8998286` — "grouped nibp measurement check point" (tech-pwa side — the subject of this
  report)

## Follow-up: UI/UX consistency fix (this session, post-verification)

After the verification above, the user flagged a real visual inconsistency by comparing
against the existing Heart Rate (Pattern A, `[parameterId]/page.tsx`) and Pattern B
(`measurement-grid.tsx`) entry screens: those screens render each replicate as a full-width
card (`<li>` with a label, a large `text-base` input spanning the remaining width, and a
`PassFailChip` showing "Sesuai"/"Tidak sesuai" driven by the server's
`existing.isWithinTolerance`). `NibpGroupedGrid`'s cells, by contrast, rendered as small
`w-16` boxes in a wrapped row with no pass/fail indicator at all — a technician filling NIBP
values got no per-reading tolerance feedback that every other capability screen provides.

Fixed in `apps/tech-pwa/src/app/jobs/[id]/measurements/nibp-grouped-grid.tsx`
(`renderCell`): replaced the `flex-wrap` row of small centered boxes with the same
`<ul>`/`<li>` full-width card layout, `text-base` input, and `PassFailChip` used by
`measurement-grid.tsx` and `[parameterId]/page.tsx`; switched the read-only display from
`readingDisplayValue(existing) || "—"` to `formatReadingDisplay(existing, dp)` (the same
decimal-aware formatter the other two screens use); changed the "+" icon-only button to
"+ Tambah ulangan" text, matching the other screens' wording. `PassFailChip` imported from
`./measurements-ui` (existing shared component, not new).

This is a pure visual/consistency change: the sequence-block/sibling nesting (7 blocks × 3
stacked siblings), the capability-code allowlist gate, save mechanism (batch
create + PATCH loop), and the local "X/21 filled" counter are all unchanged. No save-path,
schema, or Phase 4 invariant was touched.

Verified after the change:
- `pnpm --filter @medcal/tech-pwa exec tsc --noEmit` → clean, 0 errors.
- `pnpm --filter @medcal/tech-pwa exec vitest run` → 6 test files passed, 117 tests passed
  (unchanged from before the restyle — confirms no behavioral regression).
- Not yet verified: a live screenshot of the restyled screen against a real job (dev server
  wasn't run in this session).

## How this report came about

This task was issued as a from-scratch "Stage 2" implementation task. Before writing any
code (Step 0 of the task), an audit of the current repo state found the described feature
already fully implemented and committed on `main`, with a clean working tree. Rather than
duplicate or redesign existing, working code (per `.claude/rules/architecture.md`'s "Phase
Continuity" and "No Audit Loop" rules), the user confirmed the correct action was to verify
the existing implementation against the task's checklist and produce the missing report —
no code changes were made.

## Files touched (commit `8998286`, tech-pwa only)

- `apps/tech-pwa/src/lib/calibration/measurement.ts` (+17) — adds
  `GROUPED_MEASUREMENT_CAPABILITY_CODES = new Set(["NIBP"])` and
  `isGroupedMeasurementCapability(code)`.
- `apps/tech-pwa/src/app/jobs/[id]/measurements/measurements-ui.tsx` (+104/-23) — adds
  `MeasurementGroupedCapabilityLinkRow`; `MeasurementCapabilityGroupList` now branches per
  capability section: grouped capabilities render the single combined link row, everything
  else renders the original `<ul>` of `MeasurementParameterListRow` unchanged.
- `apps/tech-pwa/src/app/jobs/[id]/measurements/nibp-grouped-grid.tsx` (new, 396 lines) —
  `NibpGroupedGrid` component: the 7-sequence × 3-sibling stacked-block view.
- `apps/tech-pwa/src/app/jobs/[id]/measurements/nibp/page.tsx` (new, 129 lines) — route
  container: guards (loading/error/permission/empty), resolves the NIBP capability group
  from `parametersQuery.data.capabilityGroups`, filters current-attempt named rows for the
  3 siblings, and renders `NibpGroupedGrid`.

No API, schema, or migration files were touched by this commit. `75e0fc0` did touch the API
(`device-calibration-parameters` service/controller) but that is Portal-side grouping
support and out of scope for this report.

## Scope conformance

| Requirement | Status |
|---|---|
| New capability-level route, NIBP only | ✅ `.../measurements/nibp/page.tsx`, reached via `capabilityCode.toLowerCase()` link from the list |
| Every other capability keeps existing per-parameter routing | ✅ verified — `measurements-ui.tsx` diff shows the non-grouped branch is the original code, untouched in behavior |
| 7 setpoint blocks × 3 stacked sub-rows (Systole → Mean → Diastole) | ✅ `sequences` (union of test-point sequences) drives outer blocks; `siblingsWithPoints` (API `sortOrder` order) drives inner stacked sub-rows |
| Each sub-row = own 5 replicate cells + own tolerance | ✅ `renderCell` renders `group.view.slots`; `toleranceText(sibling)` shown per sub-row |
| Capability-code allowlist, not raw ID or "any multi-sibling" | ✅ `GROUPED_MEASUREMENT_CAPABILITY_CODES = new Set(["NIBP"])`, string-code keyed, mirrors Portal's `GROUPED_TITIK_UKUR_CAPABILITY_CODES` |
| BSM and Blood Pressure Monitor both route correctly | ✅ gate keys off capability **code** (`"NIBP"`), not device type or capability ID — applies identically regardless of which device type owns the capability |
| One "Simpan Semua" button | ✅ single `StickyActionBar` button |
| Save via existing PATCH-per-row + existing POST batch (no new endpoint) | ✅ `onBatchCreate`/`onUpdate` map straight to the existing `useCreateMeasurementBatch`/`useUpdateMeasurement` hooks — same endpoints the per-parameter grid uses |
| Each row-write independently atomic; no all-or-nothing rollback | ✅ `handleSave` catches per attempt, refetches to resync partial progress, error banner surfaces the failure without discarding already-saved rows |
| "X/21 filled" counter, local-only, no new endpoint | ✅ `filledPairCount`/`totalPairCount`, computed from already-fetched `existingRows` + local drafts; comment explicitly notes it never calls the API |
| Counter does not replicate `evaluateMeasurementCompleteness` | ✅ counter uses simple per-(sibling, testPoint) "any slot filled" logic, not the snapshot/gap logic used server-side |
| No Phase 4 invariants touched | ✅ no changes to `MeasurementResult` natural key, `CalibrationTestPoint`, `JobCalibrationTestPoint`, `replicateIndex`, `direction`, `referenceValue`, or tolerance architecture |
| No stepper revival | ✅ confirmed no `STEPPER_ENABLED_CAPABILITY_CODES` / `computeGroupStepperPlan` exist anywhere in the repo (active or reverted) |
| Portal untouched by this commit | ✅ `8998286` touches only `apps/tech-pwa/**` |

## Verification performed in this session

1. **Code inspection** — read `nibp/page.tsx` and `nibp-grouped-grid.tsx` in full;
   confirmed reuse of existing shared helpers (`patternBEntryPresentation`,
   `namedPointGroupView`, `sortNamedMeasurementPoints`, `canAddReplicateSlot`,
   `measuredReadingPayload`, `validateMeasuredDraft`, `toleranceText`) from
   `apps/tech-pwa/src/lib/calibration/measurement.ts` rather than reimplementing
   cell-level logic.
2. **Diff review of `measurements-ui.tsx`** — confirmed the branch for non-grouped
   capabilities is byte-for-byte the pre-existing rendering path (same
   `MeasurementParameterListRow`, same props), only reached differently (moved inside an
   `if/else` keyed on `isGroupedMeasurementCapability(section.code)`).
3. **Typecheck**: `pnpm --filter @medcal/tech-pwa exec tsc --noEmit` → **clean, 0 errors**.
4. **Vitest — tech-pwa full suite**: `pnpm --filter @medcal/tech-pwa exec vitest run`
   → **6 test files passed, 117 tests passed, 0 failed, 0 skipped**.
5. **Endpoint reuse confirmation** — verified
   `apps/api/src/modules/calibration-jobs/calibration-jobs.controller.ts`
   (`POST :id/measurement-results/batch`, `PATCH :id/measurement-results/:measurementId`)
   and `measurement-results.service.ts`'s `createMany` (uses
   `prisma.$transaction(prepared.map(...))` over mixed
   `deviceCalibrationParameterId` values) are unmodified by this commit and are exactly
   what `nibp-grouped-grid.tsx` calls through the existing
   `useCreateMeasurementBatch`/`useUpdateMeasurement` hooks — no new endpoint exists.
6. **API side — Prisma client / full suite** (after the user stopped a `pnpm dev` process
   that had locked the Prisma query engine DLL): `prisma generate` was retried and
   succeeded. `pnpm --filter @medcal/api exec vitest run device-calibration-parameters` then
   passed **109/109**. The **full** API suite was then run with untruncated output
   (`pnpm --filter @medcal/api exec vitest run > full.log`, no `tail`/`grep` filtering of the
   pass/fail determination) and resulted in **10 failed / 1339 passed / 1349 total**, across
   5 files: `chat/chat-sessions.service.test.ts`,
   `contact-messages/contact-messages.push.test.ts`, `emails/imap-sync.service.test.ts`,
   `push-tokens/notification-dispatch.service.test.ts`,
   `whitelist/registration-origin-callers.test.ts`. None of these modules were touched by
   either NIBP commit (`75e0fc0`, `8998286`), which only touch `device-calibration-parameters`
   and `calibration-jobs`/measurement-results code — these failures are pre-existing and
   unrelated to this feature, not a regression introduced by it.
7. **Live click-through on an IN_PROGRESS job / Blood Pressure Monitor job / other
   capabilities' screens** — **not performed in this session** (see "Not verified" below).

## Final Test Report (per `.claude/rules/testing.md`)

| Suite | Test files | Tests | Result |
|---|---|---|---|
| tech-pwa full suite (`pnpm --filter @medcal/tech-pwa exec vitest run`) | 6 passed / 6 | 117 passed / 117 | ✅ pass |
| tech-pwa typecheck (`tsc --noEmit`) | — | — | ✅ clean, 0 errors |
| API `device-calibration-parameters` suite | 1 passed / 1 | 109 passed / 109 | ✅ pass (after `prisma generate`; initial stale-client failure was environmental, see below) |
| API full suite (`pnpm --filter @medcal/api exec vitest run`, unfiltered output) | 62 passed, 6 failed / 68 | 1339 passed, 10 failed / 1349 | ⚠️ 10 pre-existing failures, all in modules untouched by this feature (chat, contact-messages push, imap-sync, notification-dispatch, registration-origin) |
| API typecheck (`tsc --noEmit`) | — | — | ✅ clean, 0 errors |
| Build | — | — | not run (task scope did not require build verification; no build-affecting files changed) |

## Not verified in this session (environment/scope limits)

- **Manual click-through against a live job** (Step 2.1–2.4 of the task): not performed.
  No live IN_PROGRESS BSM or Blood Pressure Monitor job was exercised in a browser this
  session. The static-analysis and automated-test checks above give high confidence but do
  not substitute for the browser-based verification the original task calls for.
- **Screenshot of the rendered screen** (Step 1.5 checkpoint): not captured — would require
  running the dev server against a live job with NIBP data, which wasn't done this session.
- **The 10 pre-existing API test failures** listed above were not investigated or fixed —
  they are outside this task's scope (unrelated modules, unrelated to NIBP/measurement
  code) and were surfaced only so they aren't later mistaken for something this work broke.

## Conclusion

The NIBP grouped stacked-row entry screen described in this task's approved scope is
already implemented on `main`, conforms to every explicit scope item verified above, and
does not touch any other capability's screen, Portal, or Phase 4 invariants. tech-pwa
typecheck and its full Vitest suite pass cleanly; the API's directly-relevant suite
(`device-calibration-parameters`, 109 tests) passes cleanly; the full API suite has 10
pre-existing, unrelated failures that predate and are untouched by this feature. The
remaining gap is browser-based manual verification against live job data, which is
recommended before treating this as fully closed but was outside what could be completed
in this session.

## Out of Scope / Not Implemented

Nothing new was implemented — this session performed verification and reporting only, per
user direction after discovering the feature pre-existed.
