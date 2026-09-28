# Tech-PWA Phase 1 — Technician Safety Implementation Report

Source of truth: `docs/audits/tech-pwa-comprehensive-ui-ux-audit.md`, findings **UX-01**
("No confirmation for irreversible job-lifecycle actions"), **UX-02** ("No unsaved-changes
protection on data-entry screens"), **UX-03** ("Global 'Insert Symbol' FAB overlaps the sticky
primary action button"). No other finding from that audit (UX-04..UX-15) was implemented.

Date: 2026-09-27

---

## 1. Executive Summary

Implemented the three scoped findings as additive interaction-layer changes only:

- **UX-02**: extracted a reusable `useUnsavedChangesGuard` hook (Tech-PWA-local, not a new
  package) and wired it into the three named data-entry screens
  (`/measurements/[parameterId]`, `/measurements/nibp`, `/physical-check`). It reuses each
  screen's own existing dirty-state computation and shows a confirm dialog before any
  back-navigation (header back button or hardware/edge-swipe gesture) while unsaved input
  exists.
- **UX-01**: added a confirm step in front of "Kirim hasil ke Manajer Teknis" (both its call
  sites: Job Detail and the Hasil Pengukuran list) and "Selesai", using a newly-extracted
  `ConfirmDialog` primitive. Start Calibration and Resume After Rework are untouched, per
  scope.
- **UX-03**: `GlobalSymbolPicker`'s FAB is now raised via its existing `fabClassName` prop on
  every `/jobs/...` screen (all of which can render a `StickyActionBar`); the bare `/jobs`
  list and `/sign-in*` are unaffected.

No business logic, gating, mutation call sites' semantics, job-state machine, RBAC, API
contracts, schema, or calibration/tolerance logic were changed. All changes are additive UI
wrapping around existing behavior.

**Verification**: the full Tech-PWA Vitest suite — 9 test files / 134 tests (6 pre-existing
files + 3 new files added in this phase, 17 new tests among the 134) — passes, `tsc --noEmit`
is clean, and `next build` succeeds. (A post-approval corrective fix closing a Beranda-navigation
gap in UX-02 brought this to 141 tests — see §14.) Component/DOM-level behavior
(popstate wiring, dialog focus trap, actual FAB pixel position) could not be exercised with
the repository's existing Vitest config (`environment: "node"`, `include: ["src/**/*.test.ts"]`,
no jsdom/React Testing Library installed) — this is a pre-existing infra gap the audit itself
notes ("this app doesn't appear to have visual/E2E test infra"), and per the project's testing
and scope rules a new test harness was not introduced. Where DOM behavior could not be
exercised directly, the underlying decision logic was extracted into pure, framework-free
modules and fully unit tested instead (see §7).

---

## 2. Files Changed

**New:**
- `apps/tech-pwa/src/hooks/unsaved-changes-guard-logic.ts` — pure popstate/back decision state machine
- `apps/tech-pwa/src/hooks/unsaved-changes-guard-logic.test.ts`
- `apps/tech-pwa/src/hooks/use-unsaved-changes-guard.ts` — React hook (DOM wiring around the pure logic)
- `apps/tech-pwa/src/components/ui/confirm-dialog.tsx` — shared confirm/cancel dialog primitive
- `apps/tech-pwa/src/lib/calibration/job-action-confirmations.ts` — Submit/Complete confirmation copy
- `apps/tech-pwa/src/lib/calibration/job-action-confirmations.test.ts`
- `apps/tech-pwa/src/lib/symbol-picker-placement.ts` — pure route rule + offset for UX-03
- `apps/tech-pwa/src/lib/symbol-picker-placement.test.ts`

**Modified:**
- `apps/tech-pwa/src/app/jobs/[id]/page.tsx` — Submit/Complete now open a confirm dialog before mutating
- `apps/tech-pwa/src/app/jobs/[id]/measurements/page.tsx` — same, for its own duplicate Submit button
- `apps/tech-pwa/src/app/jobs/[id]/measurements/[parameterId]/page.tsx` — unsaved-changes guard (direct-reading path)
- `apps/tech-pwa/src/app/jobs/[id]/measurements/measurement-grid.tsx` — unsaved-changes guard (grid path)
- `apps/tech-pwa/src/app/jobs/[id]/measurements/nibp-grouped-grid.tsx` — unsaved-changes guard (NIBP path)
- `apps/tech-pwa/src/app/jobs/[id]/physical-check/page.tsx` — unsaved-changes guard
- `apps/tech-pwa/src/app/jobs/[id]/identity-correction/layout.tsx` — its bespoke `ExitConfirmDialog` markup replaced by the shared `ConfirmDialog`; all trap/arm/re-arm/exit logic left untouched
- `apps/tech-pwa/src/components/global-symbol-picker-host.tsx` — passes an elevated `fabClassName` on `/jobs/...` routes

`job-detail-ui.tsx` (presentational `SubmitForReviewAction`/`CompleteJobAction`/gating
components) was **not** modified — only the call sites' `onClick` wiring in `page.tsx` changed.

---

## 3. UX-02 Implementation

### Design

The wizard's existing pattern (`identity-correction/layout.tsx`) arms a popstate trap by
pushing one duplicate history entry and permanently blocking any back navigation while
`guardArmed`. That model doesn't fit these three screens directly because their "unsaved"
status is *dynamic* — clean on load, dirty after typing, clean again after a successful save —
whereas the wizard is either always-armed or not-armed-at-all for its whole lifetime, and it
exits to a fixed destination (`router.replace("/jobs")`) rather than "continue the natural
back navigation."

**Mechanics** (`unsaved-changes-guard-logic.ts` + `use-unsaved-changes-guard.ts`):

1. On mount (while enabled), the hook pushes one duplicate history entry for the current URL.
2. Both trigger sources — Tech-PWA's header back arrow (`AppHeader`'s default `onClick={() =>
   router.back()}`) and a hardware/edge-swipe back gesture — fire the exact same native
   `popstate` event, confirmed directly against the installed Next.js 16.2.12 source
   (`app-router-instance.js`: `back: () => window.history.back()`). There is therefore only
   ever **one** decision point per user gesture, which is what prevents the double-dialog risk
   called out in the task.
3. On that first `popstate`: not dirty → one more programmatic `history.back()` completes the
   navigation exactly as if the guard weren't there (no dialog, no behavior change). Dirty →
   re-arm (push another duplicate) and open the dialog.
4. "Batal" closes the dialog; the screen never navigated. "Keluar" replays two programmatic
   `history.back()` calls (undo the re-armed duplicate, then actually leave) and lets the
   existing draft state be discarded naturally by the screen unmounting — no new discard logic
   was added.

### Per-screen wiring

- **`physical-check/page.tsx`**: `buildPhysicalCheckSavePlan`'s `creates`/`updates` (the
  existing save-plan computation) was hoisted above the loading/error guard clauses (all of
  its inputs — `catalog`, `currentResults`, `drafts` — were already available that early) so
  `useUnsavedChangesGuard(!nothingToSave)` could be called unconditionally, as React's rules of
  hooks require. No change to the plan/diff logic itself, only where it's computed.
- **`measurement-grid.tsx`** / **`nibp-grouped-grid.tsx`**: use `dirtyCells.length > 0` (the
  raw draft-vs-stored diff, already computed) rather than `!nothingToSave` (the save-eligible
  subset) — this also protects an invalid-but-typed keystroke (e.g. a value that fails
  `validateMeasuredDraft`) that would otherwise be silently lost, since it's real input the
  technician typed even though it can't be saved yet.
- **`[parameterId]/page.tsx`**: this file either renders its own direct-reading list, or
  delegates entirely to `<MeasurementGridEntry>` for GRID-kind parameters. Since both branches
  belong to the same render pass, calling the guard hook unconditionally in the parent AND
  having the child (`MeasurementGridEntry`) also call its own instance would arm **two**
  independent popstate listeners simultaneously for GRID-kind parameters — each would
  independently react to the one native `popstate` event, corrupting the hop-count bookkeeping
  the guard depends on. Fixed by giving the hook an `enabled` option: the parent computes
  `isDirectEntry = entryTarget?.kind === "DIRECT"` and passes `enabled: isDirectEntry`, so for
  GRID-kind parameters the parent's guard instance never arms at all (no listener, no history
  push) and only the child's instance is live.

### Required behavior — verified

- No unsaved changes → unchanged nav, no dialog: covered by
  `unsaved-changes-guard-logic.test.ts` ("no unsaved changes: a single back gesture settles
  with the dialog never opened").
- Dirty → dialog on back/navigation: covered ("unsaved changes: the first back gesture blocks
  and opens the dialog exactly once").
- Batal → stays: covered ("cancel (Batal) closes the dialog without any navigation effect").
- Keluar → navigation proceeds, draft discarded naturally (no new discard logic was added —
  unmounting the screen is what already drops the `drafts` state): covered ("confirm (Keluar)
  closes the dialog and fully unwinds to the previous screen").
- Saved state ≠ dirty state (no dialog once everything is saved): each screen's existing
  `setDrafts({})` on successful save already makes the dirty computation false again; covered
  by "becoming clean after a save means the very next attempt is not blocked".
- No double-dialog for one gesture: covered by "a single user gesture never produces more than
  one confirmOpen transition", and structurally guaranteed by both triggers sharing one
  `popstate` event (§8 has the caveat on what this test can and cannot prove).

---

## 4. UX-01 Implementation

`SubmitForReviewAction` / `CompleteJobAction` (`job-detail-ui.tsx`) were **not modified** — they
remain pure presentational components whose `disabled`/`pending`/error rendering is driven
entirely by the existing `canSubmitForReview` / `canCompleteJob` / `submitBlockedReason` logic
in `page.tsx`. Only what their `onClick` prop is bound to changed:

- Before: `onSubmit={() => submitMutation.mutate()}` / `onComplete={() => completeMutation.mutate()}`
- After: `onSubmit={() => setPendingAction("submit")}` / `onComplete={() => setPendingAction("complete")}`

A `ConfirmDialog` (open when `pendingAction === "submit" | "complete"`) sits strictly between
the tap and the mutation: `onCancel` only calls `setPendingAction(null)` (never touches the
mutation); `onConfirm` calls `setPendingAction(null)` then the exact same
`submitMutation.mutate()` / `completeMutation.mutate()` call that used to fire directly —
called exactly once, unchanged. The same pattern was applied to `measurements/page.tsx`'s own
duplicate "Kirim hasil ke Manajer Teknis" button (flagged as a second call site in the audit's
own evidence), wrapping its existing `handleSubmit` (`mutateAsync` + `router.replace` + error
handling) unchanged.

Because the buttons stay disabled exactly as before (`disabled={pending || disabled}` /
`disabled={pending}`), a blocked action never even reaches the confirm dialog — the dialog is
purely an added step after the existing gate already allowed the tap, per the requirement
"confirmation appears only when action is otherwise allowed."

Confirmation copy (`lib/calibration/job-action-confirmations.ts`):

- **Submit**: "Hasil kalibrasi pada attempt saat ini akan dikirim untuk ditinjau oleh Manajer
  Teknis. Setelah dikirim, attempt ini akan terkunci dan tidak dapat diubah lagi. Pastikan
  semua data sudah benar sebelum melanjutkan." — conveys review-by-Manajer-Teknis,
  attempt-locking (an existing, not invented, workflow fact per the audit's own description of
  `SubmitForReviewAction`), and a verify-before-continuing ask.
- **Complete**: "Job ini akan diselesaikan (finalisasi). Pastikan seluruh pekerjaan yang
  diperlukan sudah lengkap sebelum melanjutkan." — conveys finalization and a
  verify-work-is-finished ask.

Start Calibration and Resume After Rework were deliberately left single-tap, per the audit's
own recommendation and the task's explicit scope.

---

## 5. UX-03 Implementation

`packages/ui/src/symbol-picker/GlobalSymbolPicker.tsx` was **not modified** — the fix uses its
existing `fabClassName` prop entirely from the Tech-PWA side
(`components/global-symbol-picker-host.tsx`):

```tsx
const fabClassName = needsElevatedSymbolPickerOffset(pathname)
  ? ELEVATED_SYMBOL_PICKER_FAB_CLASS   // "bottom-36 right-6 sm:bottom-40 sm:right-8"
  : undefined;                         // default "bottom-6 right-6 sm:bottom-8 sm:right-8"
return <GlobalSymbolPicker fabClassName={fabClassName} />;
```

`needsElevatedSymbolPickerOffset(pathname)` is `pathname.startsWith("/jobs/")` — every screen
under a specific job (`/jobs/[id]`, Kontrol Alat, Physical Check, both Measurement entry
variants, Reference Equipment, every identity-correction wizard step) can render a
`StickyActionBar`; the bare `/jobs` list and `/sign-in*` cannot and are left at the default
position.

**CSS/height reasoning** (no visual/E2E test infra exists, per the audit's own note, so this
is verified by inspection of the actual `StickyActionBar` JSX rather than a rendered
screenshot): the tallest observed footer (NIBP's grouped grid) stacks a status line ("`n`/`n`
titik terisi", ~16px), an optional validation-error line (~16px), and a full-width button
(`min-h-11` = 44px), inside `gap-2` (2×8px) with `pt-3` (12px) and `pb-safe-b` (0 on
non-notched phones, up to ~34px on notched ones) — a worst-case height around 139px. Moving the
FAB's `bottom` offset from `1.5rem/24px` (`bottom-6`) to `9rem/144px` (`bottom-36`, `10rem/160px`
/ `bottom-40` at `sm:`) keeps the 36px-diameter FAB fully clear of that worst case with margin,
on both mobile and `sm:`+ widths, without moving it horizontally (right offset unchanged).

---

## 6. Shared Components Extracted

- **`ConfirmDialog`** (`components/ui/confirm-dialog.tsx`): generalizes identity-correction's
  `ExitConfirmDialog` markup into `{ open, title, message, cancelLabel="Batal", confirmLabel,
  onCancel, onConfirm, destructive?, confirmPending?, confirmPendingLabel? }`. Adds focus
  management the original didn't have (required by the task's "keyboard/focus-safe behavior"):
  focus moves onto Cancel when the dialog opens, Tab/Shift+Tab is trapped between the two
  buttons, Escape triggers Cancel, and focus returns to whatever triggered the dialog on close.
  Reused by: the unsaved-changes guard (3 screens), Submit/Complete (2 call sites), and
  identity-correction's exit-confirmation (1 call site, behavior preserved exactly — see §10).
- **`useUnsavedChangesGuard`** (`hooks/use-unsaved-changes-guard.ts` +
  `hooks/unsaved-changes-guard-logic.ts`): the UX-02 primitive, described in §3. The wizard's
  own `layout.tsx` popstate trap was intentionally **not** migrated onto this hook — its
  semantics differ (always-armed for the whole flow, fixed-destination `router.replace` exit
  rather than "continue natural back") and migrating it was outside this phase's named scope
  (only the three UX-02 screens are in scope); only its dialog *rendering* was consolidated
  onto the shared `ConfirmDialog`.
- **`job-action-confirmations.ts`**: plain data (not JSX) for the Submit/Complete copy, shared
  by both Submit call sites and Complete, so wording lives in one place.

---

## 7. Tests Added/Updated

All new tests are plain `.test.ts` (Vitest `environment: "node"`, matching the existing repo
convention — no `.tsx`/DOM tests exist anywhere in this app, and none were introduced):

- `hooks/unsaved-changes-guard-logic.test.ts` (7 tests as of this phase's initial submission; 14
  tests after the §14 corrective fix added 7 more) — the pure back/popstate decision table:
  clean-nav passthrough, dirty-blocks-once, cancel-stays, confirm-fully-unwinds, re-block after
  a cancelled attempt, clean-after-save passthrough, and single-gesture-single-dialog-open.
- `lib/calibration/job-action-confirmations.test.ts` (4 tests) — Submit/Complete copy conveys
  the required facts (Manajer Teknis review, attempt-locking, finalization, verify-before-
  continuing) and each has a real, distinct confirm label.
- `lib/symbol-picker-placement.test.ts` (6 tests) — the route rule: `/jobs` list and
  `/sign-in*` unelevated; Job Detail, Kontrol Alat, Physical Check, both Measurement variants,
  Reference Equipment, and identity-correction wizard steps elevated; `null` pathname handled.

No existing test was modified, weakened, or deleted. `identity-correction/wizard-state.test.ts`
(pure wizard-state functions, untouched by this phase) continues to pass unchanged.

---

## 8. Tests Executed + Results

Ran via `pnpm exec vitest run` from `apps/tech-pwa` (repo's own Vitest config, no
grep/head/tail/sort filtering of output):

```
 Test Files  9 passed (9)
      Tests  134 passed (134)
   Start at  16:04:16
   Duration  4.90s
```

This is the full relevant suite (all of `apps/tech-pwa/src/**/*.test.ts`), run after all
implementation changes, including the 3 new test files added in this phase (17 new tests) and
all 6 pre-existing test files (`job-display.test.ts`, `kontrol-alat.test.ts`,
`measurement.test.ts`, `physical-check.test.ts`, `quality-review.test.ts`,
`wizard-state.test.ts`) — 9 files / 134 tests total, 0 failed, 0 skipped.

**Known limitation on test coverage**: the repo's Vitest config is `environment: "node"` with
`include: ["src/**/*.test.ts"]` and no jsdom/React Testing Library dependency — there are no
component-rendering tests anywhere in Tech-PWA today. This phase followed that convention
rather than introducing a new test harness (per the architecture/scope rules against
speculative infrastructure). Consequently the following are verified by code
inspection/reasoning, not by an executed automated test:
- The actual `window.history`/`popstate` wiring in `use-unsaved-changes-guard.ts` (the pure
  decision table it wraps is fully tested; the DOM glue is a thin, direct translation of that
  table verified by direct reading of the installed Next.js source, see §3).
- `ConfirmDialog`'s rendering, focus trap, and Escape handling.
- That tapping Submit/Complete in the running app actually shows the dialog before any network
  call (verified by code inspection of the diff in §2/§4: `onClick` no longer references the
  mutation at all, only `setPendingAction`).
- The FAB's actual rendered pixel position relative to a `StickyActionBar` on a real device
  (verified by CSS/height arithmetic in §5, per the audit's own acknowledgment that no
  visual/E2E infra exists).

---

## 9. Typecheck/Lint/Build Results

- **Typecheck**: `pnpm exec tsc --noEmit` (from `apps/tech-pwa`) — clean, no output, exit 0.
- **Lint**: `apps/tech-pwa`'s `lint` script is `echo "lint tech-pwa skipped"` (pre-existing,
  unrelated to this change) — nothing to run.
- **Build**: `pnpm run build` (Next.js 16.2.12, Turbopack) — succeeded:
  ```
  ✓ Compiled successfully in 42s
  Running TypeScript ...
  Finished TypeScript in 65s ...
  ✓ Generating static pages using 3 workers (6/6) in 3.4s
  ```
  All 18 routes (including every route touched by this phase) built successfully, no new
  warnings.

---

## 10. Business Logic Verification

Not touched, and why that's safe:

- **Job-state machine / gating**: `canSubmitForReview`, `canCompleteJob`,
  `canRecordMeasurement`, `canRecordPhysicalCheck`, `measurementLockedReason`,
  `physicalCheckLockedReason`, `submitBlockedReason` — none were read differently or
  recomputed; the confirm dialogs sit strictly after these gates already decided the button is
  enabled.
- **Mutations**: `useSubmitForReview`, `useCompleteJob` (`use-job-query.ts`) — endpoint,
  method, payload, `onSuccess` invalidation — byte-for-byte unchanged; only the `onClick` that
  used to call `.mutate()` directly now calls it from inside `onConfirm`, still exactly once,
  still synchronous/fire-and-forget as before (Job Detail) or still inside the same
  `mutateAsync`/`try`/`catch`/`router.replace` sequence as before (`measurements/page.tsx`).
- **Save/diff logic**: `buildPhysicalCheckSavePlan`, `validateMeasuredDraft`,
  `measuredReadingPayload`, the `dirtyCells`/`dirtyValues` diffing in all three measurement
  variants — read from, never modified. Where a computation was relocated (physical-check's
  `plan`/`nothingToSave`, hoisted above the loading guard clauses to satisfy React's
  unconditional-hook-call rule), the function call and its inputs are identical; only its
  position in the file changed.
- **Draft discard on "Keluar"**: no new discard code was added. Confirming "Keluar" only
  performs the browser-history navigation that was already going to happen; the screen
  unmounting is what already drops its local `useState` draft, exactly as it does today when a
  technician navigates away.
- **Prisma schema / migrations / API contracts**: none referenced or touched by this phase.
- **RBAC / capabilities**: `useAuthz().capabilities` reads are unchanged; no new capability was
  introduced or checked.

---

## 11. Regression Risk

- **Low** — UX-01 and UX-02 are purely additive interaction steps in front of existing,
  unchanged mutation/save calls; UX-03 is a CSS-class-only change via an already-supported
  prop.
- The one structurally non-trivial piece is the GRID-vs-DIRECT double-guard avoidance in
  `[parameterId]/page.tsx` (§3) — mitigated by the `enabled` option and covered conceptually by
  the pure logic tests, but the actual dual-mount scenario (GRID-kind parameter, both
  components mounted) was not exercised by an automated DOM test (see §8's known limitation).
- Relocating `physical-check/page.tsx`'s `plan`/`nothingToSave` computation earlier in the
  component changes nothing about *when in the render* it's used (still only read from the
  final JSX/`handleSave`), only *where in the file* it's declared — low risk, and the full
  Vitest run plus build both pass.

---

## 12. Known Limitations

- ~~Tapping "Beranda" (home) on the three UX-02 screens bypassed the unsaved-changes guard.~~
  **Fixed post-approval — see §14.** Beranda now shares the same guard as Back/hardware-back on
  the three named screens; `AppHeader`'s default hard-navigation behavior is unchanged for every
  other screen.
- No automated verification exists (or was added) for the actual rendered DOM/CSS/focus
  behavior — see §8.

---

## 13. Explicitly Deferred Findings

- UX-04 (Kontrol Alat single shared mutation freezes the section) — not implemented, deferred.
- UX-05 (No offline write queue) — not implemented, deferred.
- UX-06 (Job Detail fires 7 parallel requests) — not implemented, deferred.
- UX-07 (Three different "did my input save" models) — not implemented, deferred.
- UX-08 (Measurement entry logic duplicated 3×) — not implemented, deferred.
- UX-09 (Status-badge color maps duplicated) — not implemented, deferred.
- UX-10 (Beranda always hard-reloads) — not implemented, deferred (see §12 note on its
  interaction with UX-02).
- UX-11 (Inconsistent touch-target sizing, TriStateChip vs VerdictOption) — not implemented,
  deferred.
- UX-12 (Confirm dialog focus management) — addressed only as a side effect of extracting
  `ConfirmDialog` for UX-01/UX-02 (focus trap + Escape were added because the task required
  "keyboard/focus-safe behavior" for the new shared primitive); no separate UX-12-scoped work
  (e.g. auditing other dialogs) was performed.
- UX-13 (Push-notification opt-in discoverability) — not implemented, deferred.
- UX-14 (Reference-equipment one-shot hydration) — not implemented, deferred.
- UX-15 (Symbol-picker `Ctrl+Shift+M` keyboard shortcut is dead weight on touch) — not
  implemented, deferred; the audit itself recommends no action on its own (P3, "no action
  needed on its own"), and this phase's UX-03 fix used only the `fabClassName` prop without
  touching `GlobalSymbolPicker`'s keyboard-shortcut code.

---

## 14. Corrective Fix — UX-02 / Beranda Navigation (Post-Approval)

Post-review of this report identified one remaining UX-02 gap: on the three named screens,
tapping **Beranda** in `AppHeader` bypassed the guard entirely. `AppHeader`'s default Beranda
handler performs a full-page `window.location.assign("/jobs")` — an unload, not a
`popstate`-observable navigation — so the popstate-based guard described in §3 never saw it.
This was disclosed as a known limitation in the original §12; it is now fixed.

### Fix

Extended the existing UX-02 primitive; `AppHeader`, `Screen`'s default behavior, and UX-10
(Beranda's global hard-reload behavior) were **not** touched:

- **`unsaved-changes-guard-logic.ts`**: added a second, independent decision point,
  `onRequestHome(state, isDirty)`, and a `trigger: "back" | "home" | null` field on `GuardState`
  so `onConfirmLeave` can tell which of the two triggers opened the dialog currently open.
  Beranda's dialog never touches history (nothing has navigated yet when it opens), so
  `onConfirmLeave` resolves it via a new `"navigateHome"` effect — call the caller-supplied
  navigation function exactly once — instead of the two-hop `history.back()` sequence used for
  the existing popstate path. The original `onPopState` / `onCancel` / `onConfirmLeave`
  back-triggered behavior is byte-for-byte the same when `trigger === "back"`; all 7 pre-existing
  tests in this file continue to pass unmodified.
- **`use-unsaved-changes-guard.ts`**: exposes a new `requestHome(navigateHome: () => void)`
  method. Clean state → `navigateHome` runs immediately (identical to today's behavior, no
  dialog). Dirty state → opens the same confirm dialog; `navigateHome` runs only if the
  technician confirms via the existing `confirmLeave` ("Keluar").
- **The 4 screens that render their own `<Screen>`** (`[parameterId]/page.tsx`'s direct-entry
  path, `measurement-grid.tsx`, `nibp-grouped-grid.tsx`, `physical-check/page.tsx`) now pass
  `onHome={() => guard.requestHome(() => window.location.assign("/jobs"))}` — reusing
  `Screen`/`AppHeader`'s existing `onHome` extension point, the same one the identity-correction
  wizard already uses (`onHome={requestExit}`), not a new mechanism. `AppHeader.goHome()`'s
  default hard-navigation code path is untouched; every screen without a guard (the `GuardScreen`
  loading/error wrappers on these same routes, and every other route in the app) still gets the
  unmodified default Beranda behavior.

### Verification

Added 7 new pure-logic tests to `unsaved-changes-guard-logic.test.ts` (7 pre-existing + 7 new =
14 tests in that file now, confirmed via `vitest run` on the file in isolation): clean state +
Beranda navigates immediately with no dialog; dirty state + Beranda opens the dialog without any
history side effect; Batal after Beranda stays on screen; Keluar after Beranda navigates home
exactly once with no history side effect; a Back-triggered dialog still resolves via the two-hop
history path — confirming no cross-contamination between the two trigger sources; re-requesting
Beranda after Batal still blocks while dirty; and passing through once the screen becomes clean
again.

- Full Tech-PWA Vitest suite: `pnpm exec vitest run` from `apps/tech-pwa` — **9 test files / 141
  tests passed, 0 failed, 0 skipped** (134 → 141: the 7 new tests; no existing test was changed).
- `tsc --noEmit`: clean, no output.
- `next build` (Next.js 16.2.12, Turbopack): succeeded, all 18 routes compiled, no new warnings.
- **Scope check** (`git diff --stat`): only `hooks/unsaved-changes-guard-logic.ts`,
  `hooks/unsaved-changes-guard-logic.test.ts`, `hooks/use-unsaved-changes-guard.ts`, and the
  `onHome` prop addition on the 4 screen files were touched. No UX-01 file
  (`job-action-confirmations.ts`, `page.tsx`'s Submit/Complete wiring), no UX-03 file
  (`global-symbol-picker-host.tsx`, `symbol-picker-placement.ts`), no `AppHeader`/`Screen`, no
  UX-04..UX-15, and no business/domain/RBAC/API/schema/calibration file was touched by this
  corrective pass.

### Required-behavior checklist

1. Clean state + Beranda → existing navigation immediately: `onRequestHome` test "no unsaved
   changes: navigates home immediately, no dialog."
2. Dirty state + Beranda → confirmation opens: `onRequestHome` test "unsaved changes: opens the
   confirm dialog without touching history."
3. Dirty state + Batal → remains on screen: `onRequestHome` test "Batal after Beranda: closes
   the dialog, no navigation effect."
4. Dirty state + Keluar → existing Beranda navigation occurs exactly once: `onRequestHome` test
   "Keluar after Beranda: closes the dialog and navigates home exactly once, with no history
   side effect."
5. Existing Back/hardware-back behavior unchanged: all 8 original tests pass unmodified, plus
   the new "does not cross-contaminate with a Back-triggered dialog" test.
6. No double navigation / no duplicate dialog: each of `onRequestHome`/`onConfirmLeave`/
   `onCancel` is a pure function called from exactly one call site per user action
   (`requestHome`, `confirmLeave`, `cancel` respectively) — there is no path that invokes both
   the back-effect and the home-effect for a single trigger.
7. Existing Submit/Complete confirmation behavior (UX-01) unchanged: not touched by this pass;
   `job-action-confirmations.ts` and `page.tsx`'s Submit/Complete wiring are absent from the
   diff.
