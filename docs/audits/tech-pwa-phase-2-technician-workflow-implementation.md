# Tech-PWA Phase 2 — Technician Workflow Implementation Report

Source of truth: `docs/audits/tech-pwa-comprehensive-ui-ux-audit.md`, findings **UX-04**
("Kontrol Alat: one shared mutation freezes the entire inspection section on any single
edit"), **UX-06** ("Job Detail fires up to 7 parallel requests with independently-failing
sections"), **UX-07** ("Three different 'did my input save' models across data-entry
screens"), **UX-11** ("Inconsistent touch-target sizing between two near-identical toggle
patterns"). No other finding from that audit (UX-01..03, UX-05, UX-08..UX-15) was
implemented. Phase 1 (`docs/audits/tech-pwa-phase-1-technician-safety-implementation.md`,
UX-01/02/03) was not revisited, refactored, or re-audited; its files were read only where
this phase needed to reuse an existing primitive (`ConfirmDialog`,
`useUnsavedChangesGuard`), and none of them were modified.

Date: 2026-09-27

---

## 1. Executive Summary

All four findings still matched the current code exactly as described in the audit — none
were already fixed and none had a discrepancy requiring a stop. All four were implemented
as additive, minimal-risk changes:

- **UX-04**: `InspectionSection`'s five tri-state fields (three Uji Visual + two Uji Fungsi)
  each now own their own `usePatchKontrolAlat` mutation instance (the same one-mutation-
  per-independent-row pattern the codebase already used for `AccessoryRow`), so tapping one
  field only disables/shows-pending on that field. `WorkExecutedSection`'s toggle + reason
  textarea deliberately **keep** sharing one mutation instance — the server
  (`kontrol-alat.service.ts#patch`) validates `workExecuted`/`notExecutedReason` together
  (a `false` toggle requires a non-empty reason, read from the row at request time), so
  splitting them would risk a real concurrent-write race. This is documented in the source
  as a genuine domain-serialization case per the task's explicit instruction not to force
  concurrency where the backend requires it.
- **UX-11**: `TriStateChip` raised to the app's own `min-h-11`/`min-w-11` touch-target
  convention (already used by `Button`, `AppHeader`, `VerdictOption`). Sizing only — labels,
  colors, tri-state semantics, and disabled/selected states are unchanged. `TriStateChip` is
  local to `kontrol-alat/page.tsx` and not reused anywhere else (verified by search).
- **UX-07**: added one small, shared, Tech-PWA-local primitive — `computeSaveStatus` (pure
  function, `lib/calibration/save-status.ts`) and `SaveStatusIndicator` (presentational,
  `components/ui/save-status-indicator.tsx`) — giving every screen the same
  saving/saved/error vocabulary and coloring. Each screen's existing save mechanism and
  timing are untouched: Kontrol Alat still autosaves per field/action; Physical Check and
  both measurement-entry variants still require an explicit "Simpan" tap. The concrete,
  previously-missing gap this closes is that none of the four screens ever confirmed a
  successful save — only "Menyimpan…" (saving) and error text existed. A transient "Tersimpan"
  state is now shown (Kontrol Alat: per field, right after its own mutation succeeds;
  Physical Check/Measurement Entry/NIBP: near the Simpan button, right after a batch save
  succeeds) and is cleared the instant the technician edits again, so it can never coexist
  with a state the Phase 1 unsaved-changes guard would consider dirty.
- **UX-06**: extracted one pure, tested helper — `combineQueryGroupState`
  (`lib/query-group-state.ts`) — and used it to group Physical Check's two queries
  (items + results) and Measurement's two queries (parameters + results) into one
  loading/error decision each, instead of two separately-timed inline conditionals per
  section. No query's firing time, order, or `enabled` condition changed — all 7 Job Detail
  queries still fire in parallel exactly as before; only their *presentation* is grouped.
  This also fixed a genuine, previously-hidden gap: `measurementResultsQuery`'s error was
  never rendered at all (only `measurementParametersQuery`'s was) — a failed results fetch
  silently read as "no rows," which is exactly the "never hide an error merely to look
  cleaner" case the task calls out. Query **deferral** (starting the two catalog queries
  later, once each section's visibility is known) was assessed and deliberately **not**
  implemented — see §7.4 for why.

No job-state gating, calibration workflow/state machine, measurement validation, save/diff
semantics, API contracts, mutation payloads, database schema, RBAC/capabilities, polling
behavior, locking rules, approval/review workflow, signature/attestation semantics,
reference-equipment rules, or Phase 1 behavior were changed.

**Verification**: full Tech-PWA Vitest suite — **11 test files / 157 tests passed, 0
failed, 0 skipped** (up from Phase 1's 9 files / 141 tests: 2 new test files, 16 new tests).
`tsc --noEmit` clean. `next build` (Turbopack) succeeded, all 18 routes compiled.

---

## 2. Source Audit Findings (as read from the audit)

- **UX-04** (P1): `InspectionSection` in `kontrol-alat/page.tsx` creates one
  `usePatchKontrolAlat(jobId)` and shares it across all five tri-state fields; every
  `TriStateChip` is disabled via the same `patch.isPending`. `WorkExecutedSection` has its
  own separate instance (confirming the coupling was per-section, not deliberate global
  lock).
- **UX-06** (P1): Job Detail (`jobs/[id]/page.tsx`) fires 7 independent TanStack Query calls
  unconditionally on mount, several gated only by `Boolean(id)`; each renders its own inline
  `LoadingState`/`ErrorState` pair, producing a cascade of independent spinners and scattered
  retries on a slow connection or partial failure.
- **UX-07** (P1): Kontrol Alat autosaves with no "Simpan" button and no success feedback
  (only error text); Physical Check and both Measurement Entry variants hold local drafts
  until an explicit "Simpan" tap; Identity Correction only submits on the wizard's final
  step. Three incompatible "is my input safe?" mental models, and even within each model no
  screen ever confirms a *successful* save.
- **UX-11** (P1): Physical Check's `VerdictOption` is `min-h-11` (44px, the app's own
  touch-target convention); Kontrol Alat's `TriStateChip` is `rounded-md px-2.5 py-1
  text-xs` with no `min-h` — a materially smaller tap target repeated across up to 5
  inspection rows plus every accessory row.

---

## 3. Pre-Implementation Assessment

### 3.1 UX-04 — Kontrol Alat mutation isolation

1. **Current implementation**: `apps/tech-pwa/src/app/jobs/[id]/kontrol-alat/page.tsx` —
   `InspectionSection` called `const patch = usePatchKontrolAlat(jobId)` once and reused it
   for `visualPowerCable`, `visualDisplay`, `visualButtons`, `functionInitialOk`,
   `functionFinalOk` via a shared `handleBool`. `WorkExecutedSection` had its own separate
   instance shared between the `workExecuted` toggle and the `notExecutedReason` textarea.
   `AccessoryRow` already called `useUpdateKontrolAlatAccessory(jobId)` once **per row**
   (already correct, not part of the finding).
2. **User-visible problem**: tapping any one of the 5 Inspection fields disabled the other 4
   (via the shared `patch.isPending`) until that PATCH round-tripped — reads as "the whole
   form froze" on a slow connection.
3. **Reusable primitive**: `AccessoryRow`'s existing pattern (one mutation hook instance per
   independently-savable row/field) was the exact extension point — no new architecture
   needed.
4. **Smallest safe implementation point**: extract `InspectionFieldRow`, mirroring
   `AccessoryRow`, so each of the 5 fields gets its own `usePatchKontrolAlat` call.
5. **Business/domain behavior that must remain untouched**: the PATCH endpoint
   (`apps/api/src/modules/calibration-jobs/kontrol-alat.service.ts`, `patch()`), its payload
   shape, and its one cross-field validation (`workExecuted === false` requires a non-empty
   `notExecutedReason`, read from the row's current state at request time, lines ~234–245)
   were inspected and left completely unchanged.
6. **Regression risks**: splitting the 5 Inspection fields is safe because the server
   applies each field independently via `input.field !== undefined ? {...} : {}` with no
   cross-field read among them. `WorkExecutedSection`'s two fields (`workExecuted` +
   `notExecutedReason`) were deliberately **not** split — the server's read-then-validate
   sequence on those two fields means two truly-concurrent independent PATCH calls could
   race (e.g. one PATCHing `workExecuted: false` while the reason PATCH hasn't landed yet)
   and spuriously 400. This is precisely the "domain dependency requiring serialization"
   case the task instructed not to force apart.
7. **Tests**: `computeSaveStatus` (shared with UX-07, see below) is unit tested for exactly
   the precedence rules a per-field pending/error/saved indicator needs. The per-field
   *mutation independence* itself (each field is its own `usePatchKontrolAlat` instance,
   hence its own `isPending`) is a structural fact verified by code inspection — this repo's
   Vitest config (`environment: "node"`, no jsdom/RTL) cannot render the component tree to
   assert "field B's chip is not disabled while field A's mutation is pending," so this is
   documented as a known limitation (§14), consistent with Phase 1's own precedent for
   DOM-level claims.

### 3.2 UX-11 — Touch-target consistency

1. **Current implementation**: `TriStateChip` (`kontrol-alat/page.tsx`) — 3 buttons per row,
   className `"rounded-md px-2.5 py-1 text-xs font-medium transition-opacity"`, no
   `min-h`/`min-w`.
2. **User-visible problem**: materially smaller tap targets than the rest of the app on a
   screen filled out at intake, often standing/one-handed.
3. **Reusable convention**: `min-h-11`/`min-w-11` is the app's own established convention —
   confirmed present in `components/ui/button.tsx`, `components/layout/app-header.tsx`,
   `physical-check-ui.tsx`'s `VerdictOption`, both sign-in pages, `job-detail-ui.tsx`, the
   identity-correction steps, and the Portal's own `sidebar-nav.tsx`/`calibration-dashboard`.
   No new sizing token was invented.
4. **Smallest safe implementation point**: add `flex min-h-11 min-w-11 items-center
   justify-center` to `TriStateChip`'s button className; nothing else changed.
5. **Business/domain behavior untouched**: tri-state value semantics (`null`/`true`/`false`
   toggle-to-null-on-reselect), colors, and labels are byte-for-byte the same.
6. **Regression risks**: a search (`grep -rn "TriStateChip"`) confirmed `TriStateChip` is
   defined and used only inside `kontrol-alat/page.tsx` (Inspection, WorkExecuted, and
   Accessory rows) — no other screen imports or reuses it, so there is no other usage to
   check for a sizing regression. The three-buttons-in-a-row layout still fits at phone
   width with the larger targets (verified by reading the surrounding flex layout — each row
   is `flex items-center justify-between`, and the chip group is `flex gap-1`, so the row
   simply grows taller, not narrower).
7. **Tests**: touch-target sizing is a CSS class, not logic — there is nothing to unit test
   in a `environment: "node"` Vitest suite (consistent with Phase 1's UX-03 CSS-only change,
   which also had no dedicated test). Verified by direct reading of the emitted className.

### 3.3 UX-07 — Save/feedback mental model

1. **Current implementation, inspected per screen**:
   - Kontrol Alat: `patch.mutate(...)` on change/blur; only `patch.isError` ever rendered
     (a red error line); no success feedback anywhere.
   - Physical Check (`physical-check/page.tsx`): `drafts` state, explicit `handleSave`;
     button label toggles `"Simpan"` / `"Menyimpan…"`; `submitError` shown via
     `ErrorBanner`; no success feedback beyond the drafts clearing (invisible to the
     technician) and the per-row `PassFailChip`/"belum disimpan" chip.
   - Measurement Entry (`[parameterId]/page.tsx`, `measurement-grid.tsx`,
     `nibp-grouped-grid.tsx`): identical pattern — `saving` bool drives the button label,
     `submitError` drives `ErrorBanner`, no success feedback.
2. **User-visible problem**: a technician can watch a field go from "editable" to
   "Menyimpan…" back to "editable" with no signal the save actually landed, unless they
   infer it from the row's chip changing.
3. **Reusable primitives**: none existed for this specific need. The nearest sibling
   convention was `ErrorBanner` (kept, untouched, still used for the detailed error message)
   and the button-label toggle (kept, untouched — still the primary "saving" signal for the
   three explicit-save screens).
4. **Smallest safe implementation point**: one pure function
   (`computeSaveStatus({isPending, isError, justSaved}) -> "idle"|"saving"|"saved"|"error"`)
   plus one presentational wrapper (`SaveStatusIndicator`), and a `justSaved` boolean each
   screen already had every ingredient to compute (it already tracked `drafts`/mutation
   state) — added, cleared on the next edit, set on save success.
5. **Business/domain behavior untouched**: no mutation call, payload, timing, or trigger
   (autosave vs. explicit Simpan) changed anywhere. `ErrorBanner`'s and the button label's
   existing behavior are unchanged; the new indicator is additive.
6. **Regression risks**: the main risk was desyncing the new "saved" flag from the Phase 1
   unsaved-changes guard's own dirty computation. Mitigated by clearing `justSaved` at
   exactly the same point each screen already clears `submitError`/marks a new edit (i.e. in
   `setDraft`), so "saved" can never be shown while the guard's `isDirty`/`dirtyCells`/
   `nothingToSave` signal would say otherwise — verified by reading each screen's diff (§8).
7. **Tests**: `save-status.test.ts` — 10 tests covering all four states and the required
   precedence (`saving` beats a stale `justSaved`; a settled `error` beats a stale
   `justSaved` so a failed save can never be mislabeled "saved").

### 3.4 UX-06 — Job Detail loading/query experience

1. **Current implementation**: `jobs/[id]/page.tsx` calls 7 queries unconditionally at the
   top of the component (`useJobQuery`, `useCorrectionsQuery`, `useReferenceEquipmentUsed`,
   `usePhysicalCheckItems`, `usePhysicalCheckResults`, `useMeasurementParameters`,
   `useMeasurementResults`), each `enabled: Boolean(id)` only. Physical Check's and
   Measurement's two queries each already collapsed their own `isPending` into one inline
   `LoadingState`, but rendered separate, sequential `isError` branches — and Measurement's
   results-query error branch was simply **absent** (only `measurementParametersQuery.isError`
   was ever checked).
2. **Which queries are required for above-the-fold vs. secondary; which control gating**:
   `jobQuery` gates the entire page (existing top-level pending/error return, untouched).
   `physicalCheckResultsQuery` and `measurementResultsQuery` feed
   `shouldShowPhysicalCheckSection`/`shouldShowMeasurementSection` (section visibility) —
   i.e. they are gating-relevant and must never be deferred behind their own section's
   visibility (that would be circular). `physicalCheckItemsQuery`/`measurementParametersQuery`
   (the catalogs) are rendering-only and are not read by any gating function.
3. **Whether deferring a query could hide information needed for a safe decision**: deferring
   the *results* queries would hide gating-relevant data — not attempted. Deferring the
   *catalog* queries behind their own section's visibility flag was technically possible
   (no circular dependency) but was not implemented — see §7.4 for the reasoning.
4. **Preferred direction taken**: group each section's two related queries' loading/error
   presentation via one small pure helper (`combineQueryGroupState`), fixing the one
   concrete hidden-error gap (measurement results), while leaving every query's firing
   time/order/`enabled` condition, all gating functions, and Submit/Complete eligibility
   completely untouched.
5. **Tests**: `query-group-state.test.ts` — 6 tests: clean group, single-query-pending
   propagates, single-query-error propagates with its index, an error is never hidden
   behind a sibling's pending state, first-error-wins when multiple queries in a group have
   failed, and an empty group is clean.

---

## 4. UX-04 Implementation

`apps/tech-pwa/src/app/jobs/[id]/kontrol-alat/page.tsx`:

- New `InspectionFieldRow` component (one per Uji Visual/Uji Fungsi field) — calls
  `usePatchKontrolAlat(jobId)` itself, so its `isPending`/`isError` only ever reflect that
  field's own request. `InspectionSection` now only maps the 5 fields to
  `<InspectionFieldRow>` and no longer holds a mutation itself.
- `WorkExecutedSection` keeps its single shared `patch` instance (documented in-line why:
  the server-side `workExecuted`/`notExecutedReason` coupling) — only the feedback layer
  (§6) was added.
- `AccessoryRow` was already per-row; only the feedback layer was added, concurrency
  unchanged (it was already correct).

**Not changed**: the PATCH endpoint, its payload shape, its validation, `canEditKontrolAlat`
gating, or the disabled condition's meaning (`!canEdit || patch.isPending` — still per-field,
just now genuinely per-field instead of per-section).

---

## 5. UX-11 Implementation

`TriStateChip`'s button className gained `flex min-h-11 min-w-11 items-center
justify-center` (kept `rounded-md`, `px-2.5`, `text-xs font-medium`, all color/selection
classes). No other file touched — `TriStateChip` has no other call sites in the codebase.

---

## 6. UX-07 Implementation

New files:
- `apps/tech-pwa/src/lib/calibration/save-status.ts` — `SaveStatus` type,
  `computeSaveStatus`, `saveStatusPresentation` (pure).
- `apps/tech-pwa/src/components/ui/save-status-indicator.tsx` — `SaveStatusIndicator`,
  a thin `role="status" aria-live="polite"` wrapper around the pure mapping.

Wired into:
- **Kontrol Alat** (`InspectionFieldRow`, `WorkExecutedSection`, `AccessoryRow`): each keeps
  its own `justSaved` boolean, cleared on every new edit, set `true` in the mutation's
  `onSuccess`. The indicator renders next to the field only when there is no active error
  (the error branch still shows the existing red `formatApiError` text, unchanged).
- **Physical Check, Measurement Entry (direct), Measurement Grid, NIBP Grid**: each keeps
  its own `justSaved` boolean — cleared in `setDraft` (the same place `submitError`/
  `setSubmitError(null)` was already cleared) and in `handleSave`'s start, set `true` right
  after the existing `setDrafts({})`/`setTouched(false)` success path. The indicator renders
  in the sticky footer, above the Simpan button, **only** in the "saved" state — the
  existing `saving`→button-label and `error`→`ErrorBanner` paths are untouched, so no
  screen shows a redundant/duplicate status for the same event.

**Not changed**: any mutation call, its endpoint, its timing, or its trigger (autosave vs.
explicit Simpan) on any of the four screens. Identity Correction's step-gated final submit
was not touched at all (out of the four in-scope screens named by the audit for the
save-model comparison, but the audit's own recommendation only asks for feedback wording
parity on Kontrol Alat/Physical Check/Measurement — Identity Correction's distinct
step-review-submit model already gives its own explicit review-before-send feedback and was
left alone).

---

## 7. UX-06 Implementation

New file: `apps/tech-pwa/src/lib/query-group-state.ts` — `combineQueryGroupState`.

`apps/tech-pwa/src/app/jobs/[id]/page.tsx`:
- `physicalCheckGroup = combineQueryGroupState([physicalCheckItemsQuery,
  physicalCheckResultsQuery])`, `measurementGroup = combineQueryGroupState([
  measurementParametersQuery, measurementResultsQuery])` — computed once, after all 7 query
  hooks (unchanged) and after `showRecordPhysicalCheck`/`showRecordMeasurement` (unchanged
  gating), before the return.
- The two render blocks now branch on `physicalCheckGroup.isPending` /
  `physicalCheckGroup.isError` (and `measurementGroup`'s equivalents) instead of repeating
  each query's own `isPending`/`isError`, but still show the same two distinct,
  query-specific error messages and retry buttons as before (selected via
  `firstErrorIndex`) — grouping the *loading* state never hid *which* request failed.
- Added the previously-missing `measurementResultsQuery.isError` branch (§3.4/§1).

### 7.4 Why query deferral was not implemented

The audit's recommendation ("consider deferring...") was evaluated concretely:
`physicalCheckItemsQuery`/`measurementParametersQuery` (the two catalog queries) are not
read by any gating function, so gating `enabled` on `showRecordPhysicalCheck`/
`showRecordMeasurement` would be technically non-circular. But those flags are themselves
computed from `jobQuery.data` (possibly still `undefined` while pending) and the sibling
results query's data — correctly handling the "job/results not loaded yet" window without
either (a) delaying the catalog fetch's *start* past today's parallel-fire baseline in the
common case, or (b) accidentally computing `enabled` from a stale/undefined `job` on an
early render, requires restructuring the hook-call order and adding defensive fallbacks in
exactly the way the task's own §UX-06 caveat warns about ("must confirm no section
currently depends on another's query firing as a side effect... should be re-verified before
implementation"). Given the explicit instruction to prefer the minimal safe implementation
and that grouping + the hidden-error fix already deliver the stated goal (coherent
loading/error presentation, no data hidden) without touching query timing at all, deferral
was deliberately left out of this phase's scope rather than attempted at elevated risk for a
P1 perception-only improvement.

---

## 8. Files Changed

**New:**
- `apps/tech-pwa/src/lib/calibration/save-status.ts`
- `apps/tech-pwa/src/lib/calibration/save-status.test.ts`
- `apps/tech-pwa/src/components/ui/save-status-indicator.tsx`
- `apps/tech-pwa/src/lib/query-group-state.ts`
- `apps/tech-pwa/src/lib/query-group-state.test.ts`

**Modified:**
- `apps/tech-pwa/src/app/jobs/[id]/kontrol-alat/page.tsx` — UX-04 (per-field mutation
  isolation) + UX-11 (touch target) + UX-07 (save-status feedback)
- `apps/tech-pwa/src/app/jobs/[id]/physical-check/page.tsx` — UX-07
- `apps/tech-pwa/src/app/jobs/[id]/measurements/[parameterId]/page.tsx` — UX-07
- `apps/tech-pwa/src/app/jobs/[id]/measurements/measurement-grid.tsx` — UX-07
- `apps/tech-pwa/src/app/jobs/[id]/measurements/nibp-grouped-grid.tsx` — UX-07
- `apps/tech-pwa/src/app/jobs/[id]/page.tsx` — UX-06

No Phase 1 file (`hooks/use-unsaved-changes-guard.ts`,
`hooks/unsaved-changes-guard-logic.ts`, `components/ui/confirm-dialog.tsx`,
`lib/calibration/job-action-confirmations.ts`,
`components/global-symbol-picker-host.tsx`, `lib/symbol-picker-placement.ts`,
`identity-correction/layout.tsx`) was modified by this phase.

---

## 9. Tests Added/Updated

- `lib/calibration/save-status.test.ts` — 10 tests: idle/saving/error/saved base cases, plus
  3 precedence tests (saving beats a stale saved flag; saving beats error; a settled error
  beats a stale saved flag so a failed save is never mislabeled), plus 3 presentation tests
  (idle renders nothing, 3 distinct labels, error label never says "tersimpan").
- `lib/query-group-state.test.ts` — 6 tests: all-clean, single-pending propagates,
  single-error propagates with index, error is never hidden behind a sibling's pending
  state, first-error-index wins with multiple failures, empty group is clean.

No existing test was modified, weakened, or deleted.

---

## 10. Full Test Results

Ran via `pnpm exec vitest run` from `apps/tech-pwa` (no output piped through
grep/head/tail/sort/awk):

```
 Test Files  11 passed (11)
      Tests  157 passed (157)
   Start at  18:00:45
   Duration  4.92s
```

11 files (9 pre-existing Phase 1 files + 2 new this phase) / 157 tests (141 carried over
from Phase 1 + 16 new), 0 failed, 0 skipped.

---

## 11. Typecheck/Lint/Build Results

- **Typecheck**: `pnpm --filter @medcal/tech-pwa exec tsc --noEmit` — clean, no output, exit 0.
- **Lint**: `apps/tech-pwa`'s `lint` script is `echo "lint tech-pwa skipped"` (pre-existing,
  unrelated to this change) — nothing to run.
- **Build**: `pnpm --filter @medcal/tech-pwa run build` (Next.js 16.2.12, Turbopack) —
  succeeded: `✓ Compiled successfully in 35.1s`, TypeScript pass finished clean, all 18
  routes generated, no new warnings.

---

## 12. Business Logic Verification

- **Job-state machine / gating**: `canSubmitForReview`, `canCompleteJob`,
  `canRecordMeasurement`, `canRecordPhysicalCheck`, `measurementLockedReason`,
  `physicalCheckLockedReason`, `shouldShowPhysicalCheckSection`,
  `shouldShowMeasurementSection`, `canEditKontrolAlat` — none were read differently,
  recomputed, or reordered relative to any query.
- **Mutations**: `usePatchKontrolAlat`, `useUpdateKontrolAlatAccessory`,
  `useCreatePhysicalCheckBatch`, `useUpdatePhysicalCheck`, `useCreateMeasurementBatch`,
  `useUpdateMeasurement` — endpoints, HTTP methods, payload shapes, and `onSuccess`
  invalidation are byte-for-byte unchanged. Kontrol Alat's Inspection fields now call the
  same mutation hook multiple times (once per field) instead of once shared — the mutation
  function itself, its request body, and the server it calls are identical per call.
- **Save/diff logic**: `buildPhysicalCheckSavePlan`, `validateMeasuredDraft`,
  `measuredReadingPayload`, `dirtyCells`/`dirtyValidated` diffing — read from, never
  modified, in any of the four measurement/physical-check files.
- **Query firing/timing**: all 7 Job Detail queries still call their hooks unconditionally,
  in the same order, with the same `enabled: Boolean(id)` conditions, at the same point in
  the render — `combineQueryGroupState` only reads their already-computed `isPending`/
  `isError` flags after the fact.
- **Prisma schema / migrations / API contracts**: none referenced or touched.
- **RBAC / capabilities**: `useAuthz().capabilities` reads unchanged; no new capability
  introduced or checked.
- **Phase 1 behavior**: `ConfirmDialog`, `useUnsavedChangesGuard`,
  `job-action-confirmations.ts`, and `global-symbol-picker-host.tsx`/
  `symbol-picker-placement.ts` were not modified. The `justSaved` flags added in this phase
  are cleared at the exact same call sites Phase 1's guard already reads as "dirty" (i.e.
  inside each screen's `setDraft`), so a screen can never simultaneously show "Tersimpan"
  and have the Phase 1 guard consider it unsaved.

---

## 13. Regression Risk

- **Low** for UX-11 (CSS-only, single-file, no other call sites) and UX-07 (purely additive
  transient UI state, cleared at existing edit-tracking call sites).
- **Low-to-moderate** for UX-04: `InspectionFieldRow` is a genuine structural change
  (one component, one hook call, per field, rendered via `.map`) — mitigated by being the
  exact pattern `AccessoryRow` already used successfully in the same file, and by the
  explicit business-logic inspection confirming no cross-field validation exists among the
  5 split fields (only `workExecuted`/`notExecutedReason`, which were deliberately left
  coupled).
- **Low** for UX-06: the grouping helper only reads already-computed `isPending`/`isError`
  booleans after the same 7 queries fire in the same order; no query's `enabled`,
  `queryKey`, or fetch function changed.
- Full Vitest suite, `tsc --noEmit`, and `next build` all pass after all four changes
  together.

---

## 14. Known Limitations

- No automated DOM-level test verifies that InspectionFieldRow's mutation independence
  actually renders as "field B's chip stays enabled while field A's PATCH is in flight" —
  this repo's Vitest config (`environment: "node"`, no jsdom/RTL) cannot render component
  trees; the structural fact (one hook call per field, hence one `isPending` per field) is
  verified by direct code reading instead, consistent with Phase 1's own precedent for
  claims about rendered DOM/CSS behavior.
- Query deferral (per §7.4) was assessed and intentionally not implemented; Job Detail still
  fires all 7 queries in parallel on mount, only their loading/error *presentation* is now
  grouped for Physical Check and Measurement.
- The "saved" indicator on the four Simpan-button screens is scoped to "the whole last save
  attempt succeeded," not per-cell — consistent with the existing save mechanism (a single
  batch/update sequence per Simpan tap), not a new per-cell save model.

---

## 15. Explicitly Deferred Findings

- UX-01 (No confirmation for irreversible job-lifecycle actions) — implemented in Phase 1,
  not revisited.
- UX-02 (No unsaved-changes protection) — implemented in Phase 1, not revisited.
- UX-03 (Global symbol-picker FAB overlap) — implemented in Phase 1, not revisited.
- UX-05 (No offline write queue) — not implemented, deferred (explicitly out of scope).
- UX-08 (Measurement entry logic duplicated 3×) — not implemented, deferred.
- UX-09 (Status-badge color maps duplicated) — not implemented, deferred.
- UX-10 (Beranda always hard-reloads) — not implemented, deferred.
- UX-12 (Confirm dialog focus management) — already addressed as a side effect of Phase 1's
  `ConfirmDialog` extraction; no separate work performed this phase.
- UX-13 (Push-notification opt-in discoverability) — not implemented, deferred.
- UX-14 (Reference-equipment one-shot hydration) — not implemented, deferred.
- UX-15 (Symbol-picker `Ctrl+Shift+M` shortcut dead weight) — not implemented, deferred.

---

## 16. Final Scope Verification

- `git diff --stat` for the 6 modified files shows exactly the changes described in §8 —
  393 insertions / 79 deletions across `kontrol-alat/page.tsx`,
  `measurements/[parameterId]/page.tsx`, `measurement-grid.tsx`, `nibp-grouped-grid.tsx`,
  `jobs/[id]/page.tsx`, `physical-check/page.tsx`. No Phase 1 file, no `AppHeader`/`Screen`
  shell file, no API/schema/migration file, and no file outside `apps/tech-pwa` was touched.
- All four in-scope findings (UX-04/06/07/11) were implemented; none were found
  already-fixed; none required a discrepancy report — the audit's description matched the
  current code exactly in every case.
- UX-05 and UX-08 through UX-15 were not implemented, per scope.
- Phase 3 was not started.
