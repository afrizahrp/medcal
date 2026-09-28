# Tech-PWA Comprehensive UI/UX Audit

Audit date: 2026-09-27
Scope: `apps/tech-pwa/src` (App Router), plus `packages/ui` (GlobalSymbolPicker), `packages/auth` (AuthProvider/client), `packages/shared` (apiFetch, calibration-job-action-signals) as consumed by tech-pwa.
Type: Read-only UI/UX audit. **No code was modified.**

---

## 1. Executive Summary

Tech-PWA is a client-rendered Next.js App Router PWA used by field technicians to execute calibration jobs end-to-end: job list → job detail → Kontrol Alat (WOL intake) → physical check → measurement entry → identity correction (BA) → submit → complete. The app is built on a small, consistently-applied shell (`Screen` + `AppHeader` + `StickyActionBar`) and a consistent state-view vocabulary (`LoadingState` / `ErrorState` / `EmptyState` / `CardListSkeleton`), which gives the app a coherent skeleton. Data fetching is uniformly TanStack Query with colocated `use-*-query.ts` hooks and a well-reasoned, documented polling policy (6s poll + focus refetch on list/detail views, no polling on single-technician entry screens).

Underneath that coherent shell, the workflow screens (Kontrol Alat, Physical Check, Measurement Entry, Identity Correction) diverge in three important ways that matter operationally: (1) they use three different "did my input get saved" models (autosave-on-blur, explicit-Simpan-with-local-drafts, and wizard-step-gating), (2) the highest-stakes screens (measurement entry, physical check, Kontrol Alat) have **no unsaved-changes protection** on back navigation, while the lowest-stakes screen (identity-correction wizard) is the only one that has it, and (3) irreversible job-lifecycle transitions (Start, Submit for Review, Complete) fire immediately on a single tap of a full-width sticky button with no confirmation step — the same button a technician's thumb rests near while scrolling. A shared floating "Insert Symbol" control (`GlobalSymbolPicker`, reused from `packages/ui`) is fixed to the same bottom-right corner as every screen's primary sticky action button, compounding the accidental-tap risk on exactly the screens where a wrong tap is costliest (submitting incomplete calibration results, completing a job early).

None of this is presented as a defect in business/domain logic — the gating rules (who can record what, when a job is locked, when review is required) are implemented thoroughly and are out of scope to change. The findings below are about the **interaction layer wrapped around that logic**: confirmation, save feedback, navigation safety, and shared-component fit for a mobile field context.

## 2. Tech-PWA UX Architecture Overview

- **Framework**: Next.js App Router (`apps/tech-pwa/src/app`), not Pages Router. Almost every file is `"use client"` — the app is effectively an SPA over TanStack Query; there is no server-rendered data fetching in the workflow screens.
- **Auth**: `@medcal/auth` (`AuthProvider`, `useAuth`, `useAuthz`, `useRequireSession`) wraps the whole app in `providers.tsx`. `useAuthz().capabilities` gates which action buttons render — this is documented in `packages/auth/src/auth-provider.tsx` as "UX/navigation only; apps/api CompanyRoleGuard remains the enforcement boundary," i.e. server-side authorization is the real gate, client capability flags are for hiding unavailable actions.
- **Layout shell**: `src/components/layout/screen.tsx` (`Screen`) composes `AppHeader` (sticky top, back + title + Beranda/home + custom slots) and an optional `StickyActionBar` (sticky bottom, footer actions). This shell is used on essentially every screen — a genuine, consistently-applied pattern.
- **Design system**: tech-pwa has its own small local UI kit in `src/components/ui/` (`Button`, `Badge`, `Section`/`SectionRow`, `Spinner`, `state-views.tsx`, `SignatureImage`) — it does **not** consume `packages/ui` for these primitives. The only shared cross-app component actually used is `GlobalSymbolPicker` from `packages/ui`. Several tech-pwa components carry comments like "Rebuilt locally (mirrors Portal's SignatureImage)" (`components/ui/signature-image.tsx`) and "mirrors apps/portal's list/detail hooks" (`use-job-query.ts`) — confirming Portal and Tech-PWA independently reimplement equivalent UI/data patterns rather than sharing a package.
- **Data fetching**: TanStack Query, one `QueryClient` per app (`providers.tsx`, `staleTime: 15_000`, `refetchOnWindowFocus: false` as the default — overridden per-query where live refresh is wanted). Query keys are namespaced under `["job", id, ...]` so job-detail's broad invalidation (`["job", id]`) sweeps child screens' caches — a deliberate, documented convention followed consistently across `use-job-query.ts`, `use-reference-equipment-query.ts`, `use-measurements-query.ts`, `use-physical-check-query.ts`, `use-kontrol-alat-query.ts`.
- **Forms**: no form library (no react-hook-form, no zod-resolver wiring on the client). Every screen hand-rolls its own local state, dirty-tracking, and validation. This is consistent in spirit (plain controlled inputs, `min-h-11` touch targets) but inconsistent in mechanism from screen to screen (see Finding UX-07).
- **PWA**: `public/manifest.webmanifest` (standalone, teal theme), a dynamically-generated `firebase-messaging-sw.js` (`src/app/firebase-messaging-sw.js/route.ts`) that serves double duty as the FCM background handler *and* the app-shell service worker, and `public/offline.html` as a navigation-only offline fallback. There is no cached API data and no offline write queue (see Finding UX-05).
- **State/feedback conventions**: `LoadingState`, `ErrorState` (with retry), `EmptyState`, `CardListSkeleton` (`components/ui/state-views.tsx`) are reused everywhere for query pending/error/empty states — this is a strong, consistent pattern (see §19).

## 3. Application / Route Map

```
/                                              → redirect to /jobs
/sign-in                                       → email/password sign-in
/sign-in/register                              → registration
/jobs                                          → Job Saya (Customer → SPK → Unit drill-down via ?customerId&workOrderId)
/jobs/[id]                                     → Job Detail (mega-screen, see §6)
/jobs/[id]/kontrol-alat                        → Kontrol Alat (F.MU.08), WOL-only
/jobs/[id]/reference-equipment                 → Alat Referensi record/replace screen
/jobs/[id]/physical-check                      → Pemeriksaan Fisik entry (BAIK/TIDAK_BAIK)
/jobs/[id]/measurements                        → Hasil Pengukuran parameter list
/jobs/[id]/measurements/[parameterId]          → Direct-reading or grid entry for one parameter
/jobs/[id]/measurements/nibp                   → NIBP grouped (Systole/Mean/Diastole) grid entry
/jobs/[id]/identity-correction/*               → 5-step BA wizard (layout.tsx owns wizard state/guards)
  ├── (step 1, index page)                     → reason + attribute selection
  ├── /signature-technician                    → technician signature status
  ├── /signature-customer                      → customer signature status
  ├── /photo                                   → BA sheet photo capture
  └── /review                                  → review + submit
/jobs/[id]/corrections/[correctionId]          → Identity Correction BA detail (read + late photo upload)
```

`jobs/layout.tsx` is the session gate for the whole `/jobs/*` subtree (`useRequireSession`), rendering distinct "loading" / "pending account" / "forbidden" states before any job content mounts.

## 4. Major User Workflow Map

**Job → Job Detail → Work Execution**
Entry: tap a unit row in `/jobs` (Customer → SPK → Unit) → `/jobs/[id]`. The detail screen renders up to 9 stacked sections (header, identity warning, Kontrol Alat if WOL, declared identity, observed identity, assigned device, reference equipment, physical check, measurement summary, corrections list) and fires up to 7 parallel queries on mount (job, corrections, reference-equipment-used, physical-check-items, physical-check-results, measurement-parameters, measurement-results — `jobs/[id]/page.tsx`). Primary actions surface only in the sticky footer, gated by capability + job-state helper functions (`shouldShowLengkapiKontrolAlatCta`, `canSubmitForReview`, `canShowResumeAfterRework`, `canCompleteJob`, `canSubmitIdentityCorrection`).

**Job → Equipment/Device**
`AssignedDeviceSection` in `job-detail-ui.tsx`: read-only Kode/Serial once `job.device` is set; otherwise (device not yet resolved) a debounced (500ms) search-and-select list (`use-device-lookup-query.ts`) that deliberately never shows internal device id/business code in the candidate list, only brand/model/type + serial (per an explicit MoM decision documented in the source).

**Device → Calibration Parameters → Input Result**
`/jobs/[id]/measurements` lists parameters (direct-reading and grid/test-point), grouped into `capabilityGroups` sections when present. Tapping a parameter opens `/measurements/[parameterId]` (direct or grid layout resolved by `resolveMeasurementEntryTarget`), or the NIBP-specific `/measurements/nibp` grouped screen for the NIBP capability. Each of these three screens independently implements draft state, dirty-cell diffing, per-cell precision validation (`validateMeasuredDraft`), and an explicit "Simpan pembacaan" / "Simpan Semua" action (see Finding UX-08).

**Identity Correction (BA)**
5-step linear wizard owned by `identity-correction/layout.tsx`: reason+attributes → technician signature status → customer signature status → photo → review/submit. Each step redirects backward if its prerequisite step is invalid (`step1Valid`, `signatureValid`, `photoStepValid`), a one-shot "entry intent" flag (`wizard-nav.ts`) bounces any non-deliberate entry (stale back-navigation, refresh) back to `/jobs`, and a `popstate` trap converts a hardware/edge-swipe back gesture into an in-app "Keluar dari koreksi identitas?" confirm dialog. This is the single most carefully engineered flow in the app (see §19).

**Signature workflow**
Important architectural note for accuracy: there is **no drawn/ink signature capture** anywhere in tech-pwa. "Signature" in the Identity Correction wizard is a status attestation (`SIGNED` / `UNAVAILABLE` / `REFUSED` + typed signer name or reason). "Signing" Kontrol Alat (`SignatureBlock` in `kontrol-alat/page.tsx`) is a single-tap "Tandatangani sebagai saya" self-attestation button, not a canvas. `SignatureImage` only *displays* an already-uploaded photo of a physically-signed paper BA. This appears to be the intended business design (a photographed paper BA is the evidence, not an on-glass signature) — documented here for accuracy, not flagged as a defect, per the audit's business-logic-is-out-of-scope constraint.

**Job completion/finalization**
`StartCalibrationAction` → `SubmitForReviewAction` (blocked if identity correction or reference-equipment approval is unresolved) → (Portal-side Manajer Teknis approval, polled every 6s) → `CompleteJobAction`. `ResumeAfterReworkAction` handles the REWORK branch. All four actions are single-tap, no confirmation (Finding UX-01).

## 5. UI Pattern Inventory

| Pattern | Implementation | Consistency |
|---|---|---|
| Screen shell | `Screen` + `AppHeader` + optional `StickyActionBar` | Used everywhere — strong |
| Loading/Error/Empty | `LoadingState` / `ErrorState` / `EmptyState` / `CardListSkeleton` | Reused everywhere — strong |
| Status badges | `Badge` primitive, but each screen defines its own color-class `Record` | Duplicated 4× (Finding UX-09) |
| Section grouping | `Section` / `SectionRow` | Reused everywhere — strong |
| Primary CTA | `Button` (`primary`/`secondary`/`ghost`) in `StickyActionBar` | Consistent visual variant, inconsistent confirmation behavior |
| Tri-state toggle | Kontrol Alat `TriStateChip` (small, no `min-h-11`) vs Physical Check `VerdictOption` (`min-h-11`) | Diverges — same intent, two sizes (Finding UX-11) |
| Confirmation dialog | One bespoke `ExitConfirmDialog` in identity-correction `layout.tsx` | Not a shared component; no other screen has one (Finding UX-01) |
| Draft/dirty/save | Autosave-on-change (Kontrol Alat) vs explicit-Simpan-with-local-diff (Physical Check, Measurement×3) vs step-gated wizard (Identity Correction) | Three different models (Finding UX-07) |
| Debounced search | `useDebouncedValue` (500ms), used for device lookup | Single, reusable hook — good |
| File/photo capture | Native `<input type="file" capture="environment">`, hidden + triggered by a styled button, with preview + retake | Consistent between identity-correction photo step and correction-detail late upload |
| Floating global control | `GlobalSymbolPicker` FAB, fixed `bottom-6 right-6` on every non-sign-in screen | Not adapted for coexistence with `StickyActionBar` (Finding UX-03) |

## 6. Comprehensive Findings

```markdown
## [UX-01] No confirmation for irreversible job-lifecycle actions

Severity:
P0

Area:
Job Detail sticky footer — Start Calibration, Submit for Review, Resume After Rework, Complete Job

Current behavior:
`StartCalibrationAction`, `SubmitForReviewAction`, `ResumeAfterReworkAction`, and `CompleteJobAction` in `apps/tech-pwa/src/app/jobs/[id]/job-detail-ui.tsx` all call their mutation directly from the button's `onClick` (`onClick={onStart}` / `onClick={onSubmit}` / `onClick={onComplete}`). There is no confirm step, no "are you sure," no summary of what will happen next.

UX problem:
These are full-width buttons in a `StickyActionBar` that sits at the bottom of a long, multi-section scrolling screen — exactly where a thumb rests while scrolling one-handed. A single mistap commits a state transition: "Kirim hasil ke Manajer Teknis" locks measurement/physical-check entry for that attempt; "Selesai" finalizes the job. Meanwhile the *lowest*-stakes flow in the app (leaving the identity-correction wizard) is the *only* one that got a confirm dialog (`ExitConfirmDialog` in `identity-correction/layout.tsx`).

User impact:
A technician who submits before finishing all measurements, or completes a job prematurely, must either be caught by Portal-side reviewers or trigger a rework cycle — both cost the company a repeat visit or an internal escalation. This is a direct file-system-verified path to "unintended operational action," which the audit brief calls out explicitly as P0 material.

Evidence:
`apps/tech-pwa/src/app/jobs/[id]/job-detail-ui.tsx` lines ~522–612 (`StartCalibrationAction`, `SubmitForReviewAction`, `ResumeAfterReworkAction`, `CompleteJobAction`); call sites in `apps/tech-pwa/src/app/jobs/[id]/page.tsx` lines ~215–262 (`onClick={() => startMutation.mutate()}`, etc.) and `apps/tech-pwa/src/app/jobs/[id]/measurements/page.tsx` (`handleSubmit` fires immediately on tap).

Root cause:
No shared confirmation-dialog component exists for this app; the one dialog that does exist (`ExitConfirmDialog`) was built inline and once, for the wizard, and never generalized.

Recommendation:
Add a lightweight shared confirm-dialog primitive (reusing the `ExitConfirmDialog` markup/pattern already proven in this codebase) and require it before `Submit for Review` and `Complete Job` at minimum (the two truly irreversible-in-effect transitions). `Start` and `Resume` are lower risk (they don't discard data) and could reasonably stay single-tap.

Risk of changing:
None to business logic — this only inserts a UI step before an existing mutation call; the mutation, its gating, and its server-side validation are untouched.

Dependencies:
`job-detail-ui.tsx` action components; `measurements/page.tsx`'s own "Kirim hasil ke Manajer Teknis" button (duplicates the submit action outside job-detail).
```

```markdown
## [UX-02] No unsaved-changes protection on data-entry screens (measurement entry, physical check, Kontrol Alat)

Severity:
P0

Area:
Measurement entry (`/measurements/[parameterId]`, `/measurements/nibp`), Physical Check (`/physical-check`), Kontrol Alat text fields (`/kontrol-alat`)

Current behavior:
Measurement entry and Physical Check hold all input in local React state (`drafts`) and only persist to the server when the technician explicitly taps "Simpan pembacaan" / "Simpan Semua" / "Simpan". The `Screen` on these routes is rendered with `showBack` and no `onBack` override, so the header back button calls the default `router.back()`. There is no `beforeunload` handler, no route-change interception, and no confirm prompt anywhere in `measurements/[parameterId]/page.tsx`, `measurement-grid.tsx`, `nibp-grouped-grid.tsx`, or `physical-check/page.tsx`.

UX problem:
A technician who fills in several readings, gets interrupted (a call, a colleague, a customer question), and taps "Kembali" — or is bumped back by the OS — loses every unsaved value silently, with no warning. This is the exact opposite of the identity-correction wizard, which traps hardware back navigation and asks "Keluar dari koreksi identitas? Data yang sudah diisi... akan hilang."

User impact:
Silent loss of calibration readings is a direct path to re-measuring a device, or — worse — a technician re-entering values from memory rather than re-measuring, which is a data-integrity risk for a calibration record.

Evidence:
`apps/tech-pwa/src/app/jobs/[id]/measurements/[parameterId]/page.tsx` (drafts in `useState`, no navigation guard); `apps/tech-pwa/src/app/jobs/[id]/measurements/measurement-grid.tsx`; `apps/tech-pwa/src/app/jobs/[id]/measurements/nibp-grouped-grid.tsx`; `apps/tech-pwa/src/app/jobs/[id]/physical-check/page.tsx` (`drafts` state, explicit `handleSave`); contrast with `apps/tech-pwa/src/app/jobs/[id]/identity-correction/layout.tsx` (`popstate` trap + `ExitConfirmDialog`), which proves the team already has the pattern for exactly this problem elsewhere in the same app.

Root cause:
The unsaved-changes guard was built once, specifically for the identity-correction wizard's `WizardContext`, and never extracted into something the per-parameter measurement/physical-check screens (which are simple page components, not wizard steps) could reuse.

Recommendation:
Extract the wizard's `popstate`-trap + confirm-dialog pattern into a small reusable `useUnsavedChangesGuard(hasUnsavedChanges, onConfirmLeave)` hook, and wire it into the three measurement-entry variants and Physical Check using their existing `dirtyCells`/`nothingToSave` computations (already present in all three files) as the "has unsaved changes" signal.

Risk of changing:
Low — this is additive (a guard before navigation), not a change to what gets saved or how. Care is needed to not double-fire the dialog when the guard interacts with the header's `showBack`/`onBack` prop path (a second, distinct navigation trigger from the wizard's history-only trap).

Dependencies:
`components/layout/app-header.tsx` (back button), `components/layout/screen.tsx` (`onBack` prop plumbing already exists and can be reused instead of a `popstate` trap for header-triggered back).
```

```markdown
## [UX-03] Global "Insert Symbol" FAB overlaps the sticky primary action button

Severity:
P1

Area:
Every screen with both a `StickyActionBar` and the global symbol picker (i.e. all data-entry screens: measurement entry, physical check, Kontrol Alat, reference equipment, identity-correction wizard steps)

Current behavior:
`components/global-symbol-picker-host.tsx` mounts `<GlobalSymbolPicker />` (from `packages/ui/src/symbol-picker/GlobalSymbolPicker.tsx`) at the app root for every route except `/sign-in*`. That component renders a fixed-position root: `className="fixed z-40" ... "bottom-6 right-6 sm:bottom-8 sm:right-8"`. Independently, `components/layout/sticky-action-bar.tsx` renders a `sticky bottom-0 z-20` footer containing full-width (`fullWidth`) primary buttons such as "Simpan pembacaan," "Kirim hasil ke Manajer Teknis," and "Selesai."

UX problem:
The FAB is fixed to the viewport's bottom-right corner, independent of the footer's own layout, and sits at a higher stacking order (`z-40` vs `z-20`) than the sticky action bar. On phone-width screens the FAB (a 36×36px circular "Ω" button) lands directly over or immediately adjacent to the right edge of the full-width primary CTA button beneath it — precisely the touch target a technician taps to save a reading or submit a job.

User impact:
Increases the odds of an accidental tap landing on the symbol picker instead of "Simpan"/"Kirim"/"Selesai" (opening an unrelated overlay instead of submitting), or of the FAB visually occluding part of the primary button's label, especially in one-handed/thumb-reach use which the audit brief specifically calls out as a field-usability risk factor.

Evidence:
`apps/tech-pwa/src/components/global-symbol-picker-host.tsx` (mounts unconditionally except sign-in); `packages/ui/src/symbol-picker/GlobalSymbolPicker.tsx` line ~115 (`"fixed z-40"`, `"bottom-6 right-6 sm:bottom-8 sm:right-8"`); `apps/tech-pwa/src/components/layout/sticky-action-bar.tsx` (`"sticky bottom-0 z-20"`, buttons rendered `fullWidth`).

Root cause:
`GlobalSymbolPicker` is a shared `packages/ui` component authored for a different, likely desktop/admin, layout context (it also wires a `Ctrl+Shift+M` desktop keyboard shortcut — dead on a touch PWA) and was dropped into tech-pwa without adapting its default position to coexist with tech-pwa's own `StickyActionBar` convention.

Recommendation:
Pass tech-pwa's own `fabClassName` override (the prop already exists: `GlobalSymbolPicker({ fabClassName })`) so the FAB sits above the sticky footer's height on screens that render one, or docks to a corner that never overlaps `StickyActionBar` content (e.g. raise its `bottom` offset dynamically, or move it to top-right next to the header's account menu instead of bottom-right).

Risk of changing:
Very low — this is a positioning-only change via an already-supported prop; no behavior of the symbol picker itself changes.

Dependencies:
Any screen with a `StickyActionBar` footer: Kontrol Alat, Physical Check, both Measurement entry variants, Reference Equipment, and every identity-correction wizard step.
```

```markdown
## [UX-04] Kontrol Alat: one shared mutation freezes the entire inspection section on any single edit

Severity:
P1

Area:
Kontrol Alat (F.MU.08) — `InspectionSection`, `WorkExecutedSection`

Current behavior:
`InspectionSection` in `apps/tech-pwa/src/app/jobs/[id]/kontrol-alat/page.tsx` creates **one** `usePatchKontrolAlat(jobId)` mutation and shares it across all five tri-state fields (`visualPowerCable`, `visualDisplay`, `visualButtons`, `functionInitialOk`, `functionFinalOk`). Every `TriStateChip` in the section is disabled via the same `patch.isPending` flag: `disabled={!canEdit || patch.isPending}`.

UX problem:
Tapping one field (e.g. "Kabel daya") disables all four other fields in the same section — and the "Uji Fungsi" fields, which share the same mutation instance — until that one PATCH round-trips. On a slow or degraded field connection (the exact environment this PWA targets), this reads as "the whole form froze" rather than "one field is saving," inviting repeated taps or the impression of a bug.

User impact:
Confusion and wasted time during Kontrol Alat intake, particularly on poor connectivity at a customer site; not data-loss risk, but real friction in a gating workflow (Kontrol Alat must be completed before "Mulai Kalibrasi" unlocks for WOL jobs).

Evidence:
`apps/tech-pwa/src/app/jobs/[id]/kontrol-alat/page.tsx`, `InspectionSection` (single `const patch = usePatchKontrolAlat(jobId);` reused across all `TriStateChip` instances) and `WorkExecutedSection` (its own separate `patch` instance, so it's unaffected by Inspection's pending state — confirming the coupling is per-section, not a deliberate global lock).

Root cause:
One `useMutation` instance is reused as if it were global section state, when each toggle is logically an independent write.

Recommendation:
Track pending state per-field (e.g. key the pending set by field name, or give each `TriStateChip` its own mutation instance/local optimistic flag) so only the tapped control shows a saving affordance.

Risk of changing:
Low — purely a local-state refactor; the PATCH payload shape and endpoint are unchanged.

Dependencies:
None outside `kontrol-alat/page.tsx`.
```

```markdown
## [UX-05] No offline write queue — mid-entry connectivity loss surfaces as a hard failure

Severity:
P1

Area:
PWA / offline behavior — all mutation-bearing screens (measurement entry, physical check, Kontrol Alat, identity correction, reference equipment)

Current behavior:
The service worker (`apps/tech-pwa/src/app/firebase-messaging-sw.js/route.ts`) caches only three static shell assets (`/offline.html`, `/icons/icon-192.png`, `/short-logo.png`) and serves the offline fallback **only for navigation requests** (`event.request.mode !== "navigate"` is a no-op — API `fetch()` calls are never intercepted). `apiFetch`/`apiFetchBlob` (`packages/shared/src/http/api-fetch.ts`) are plain `fetch()` wrappers with no retry, no queue, and no offline persistence. `formatApiError` (`lib/api-errors.ts`) checks `navigator.onLine` to show a friendlier "Anda sedang offline" message, but `navigator.onLine` only reflects a full OS-level disconnect, not a degraded/flaky connection — the far more common field scenario (basements, elevators, rural sites).

UX problem:
A technician who fills a measurement grid or a Kontrol Alat form while connectivity is marginal will see a generic save failure (`ErrorBanner`) the moment a PATCH/POST times out, with no automatic retry and no indication that their input is still safe locally — they must manually retry, and if they navigate away first (see UX-02) the input is gone.

User impact:
Repeated data entry, lost trust in the "Simpan" action ("did it actually save?"), and a real risk of an incomplete calibration record if a failed save goes unnoticed (the failure only reports itself once refetched — see the `await resultsQuery.refetch()` calls in every save handler).

Evidence:
`apps/tech-pwa/src/app/firebase-messaging-sw.js/route.ts` lines 42–66 (fetch handler scoped to `navigate` only); `packages/shared/src/http/api-fetch.ts` (no retry/backoff); `apps/tech-pwa/src/lib/api-errors.ts` `isOffline()` (relies on `navigator.onLine`).

Root cause:
The PWA was built with an app-shell-only offline strategy (explicitly documented in the service worker's own comment: "offline fallback only — no data/JS/RSC caching") — a deliberate, reasonable baseline — but no complementary write-queue layer exists on top of it for the mutation-heavy workflows this app exists to serve.

Recommendation:
This is the one item in this audit that is closer to an architectural gap than a pure UI fix — flagging it as a finding, not prescribing a specific offline-queue implementation (e.g., IndexedDB-backed mutation queue), since that is a meaningfully larger scope decision than the rest of this audit's UI-layer recommendations.

Risk of changing:
An offline queue touches data integrity (ordering, idempotency of batch creates, conflict with server-side attempt/lock state) — any implementation must be scoped and reviewed as its own project, not bundled into UI polish.

Dependencies:
Every mutation hook in the app (`use-measurements-query.ts`, `use-physical-check-query.ts`, `use-kontrol-alat-query.ts`, `use-job-query.ts`, `use-reference-equipment-query.ts`).
```

```markdown
## [UX-06] Job Detail fires up to 7 parallel requests with independently-failing sections

Severity:
P1

Area:
Job Detail (`/jobs/[id]`)

Current behavior:
`apps/tech-pwa/src/app/jobs/[id]/page.tsx` mounts `useJobQuery`, `useCorrectionsQuery`, `useReferenceEquipmentUsed`, `usePhysicalCheckItems`, `usePhysicalCheckResults`, `useMeasurementParameters`, `useMeasurementResults` — 7 independent TanStack Query calls — all unconditionally on page mount (several are gated only by `Boolean(id)`, not by whether their section will even render). Each has its own `LoadingState`/`ErrorState` pair rendered inline.

UX problem:
On a slow mobile connection, the screen renders as a cascade of independent loading spinners and, on partial failure, independent retry buttons scattered down a long page — the technician sees a "half-broken" screen rather than one coherent job view. There's no single aggregate retry, and no indication of which of the 7 requests is still in flight versus failed.

User impact:
Slower perceived load, higher data usage per job open (relevant on metered field data plans), and a confusing partial-failure presentation (e.g., physical check loads fine but measurement parameters time out — the page looks selectively broken).

Evidence:
`apps/tech-pwa/src/app/jobs/[id]/page.tsx` lines 80–86 (all 7 query hooks called unconditionally) and lines 322–409 (7 separate inline `LoadingState`/`ErrorState` blocks).

Root cause:
Each workflow area (reference equipment, physical check, measurement) was added as its own vertical slice with its own query hooks, and Job Detail composes all of them eagerly rather than deferring non-visible sections' fetches.

Recommendation:
Consider deferring physical-check/measurement queries until their section is determined to be visible (`shouldShowPhysicalCheckSection`/`shouldShowMeasurementSection` already compute this — but currently only *after* the queries have already fired), and/or presenting one consolidated retry affordance for a fully-failed load rather than N independent ones.

Risk of changing:
Low-to-moderate — reordering when queries fire changes perceived latency of individual sections; must confirm no section currently depends on another's query firing as a side effect (a quick trace of the current code shows no such dependency, but this should be re-verified before implementation).

Dependencies:
All Job Detail child sections (`AssignedDeviceSection`, `ReferenceEquipmentSection`, `PhysicalCheckSection`, `MeasurementsSection`, `CorrectionsListSection`).
```

```markdown
## [UX-07] Three different "did my input save" models across data-entry screens

Severity:
P1

Area:
Kontrol Alat vs Physical Check vs Measurement Entry vs Identity Correction wizard

Current behavior:
- **Kontrol Alat** (`kontrol-alat/page.tsx`): every tri-state toggle and accessory row autosaves immediately on tap; the "Alasan tidak dilaksanakan" textarea autosaves `onBlur`. There is no visible "Simpan" button anywhere on this screen.
- **Physical Check** (`physical-check/page.tsx`) and **Measurement Entry** (both `[parameterId]/page.tsx` and `nibp-grouped-grid.tsx`): input is held in local `drafts` state; nothing is sent to the server until the technician taps an explicit "Simpan"/"Simpan pembacaan"/"Simpan Semua" button in the `StickyActionBar`.
- **Identity Correction wizard**: input is held in wizard-context state across 4 steps and is only sent to the server in one shot on the final "Kirim" tap on the review screen.

UX problem:
The same app teaches the technician three incompatible mental models for the same basic question ("is my input safe now?"): "yes, instantly" (Kontrol Alat), "no, until I tap Simpan" (Physical Check / Measurement), and "no, until the very last step of a 5-step flow" (Identity Correction). A technician who has just learned Kontrol Alat autosaves may reasonably assume Measurement Entry does too — and navigate away without saving (compounding Finding UX-02).

User impact:
Increases the odds of the data-loss scenario in UX-02, and adds cognitive load switching between adjacent screens in the same job.

Evidence:
`apps/tech-pwa/src/app/jobs/[id]/kontrol-alat/page.tsx` (`onChange`/`onBlur` → `patch.mutate(...)` directly, no Simpan button in the JSX); `apps/tech-pwa/src/app/jobs/[id]/physical-check/page.tsx` (`drafts` state + `handleSave` gated by an explicit button); `apps/tech-pwa/src/app/jobs/[id]/measurements/[parameterId]/page.tsx` (same pattern); `apps/tech-pwa/src/app/jobs/[id]/identity-correction/review/page.tsx` (single final `handleSubmit`).

Root cause:
Each workflow screen was implemented independently against its own endpoint shape (Kontrol Alat's PATCH is a single-field-friendly partial update; Physical Check/Measurement's batch-create + per-row PATCH naturally suits a "commit a batch" UX) without a shared save-affordance convention being established first.

Recommendation:
Not necessarily "make them all the same" — Kontrol Alat's autosave is arguably *better* UX for single toggles, and batch numeric entry benefits from an explicit commit step. The concrete fix is to make the *save state visually explicit* on every screen regardless of model: Kontrol Alat should show a small transient "Tersimpan" / "Menyimpan…" indicator per field (it currently shows nothing on success — only errors), so the technician gets the same category of feedback everywhere even though the mechanism differs.

Risk of changing:
Low if scoped to adding feedback (not changing the underlying save trigger); higher if scoped to unifying the mechanism itself, which would touch every workflow screen.

Dependencies:
Kontrol Alat's `InspectionSection`, `WorkExecutedSection`, `AccessoryRow`.
```

```markdown
## [UX-08] Measurement entry logic is independently duplicated three times

Severity:
P2

Area:
`/measurements/[parameterId]/page.tsx` (direct + grid), `measurements/measurement-grid.tsx`, `measurements/nibp-grouped-grid.tsx`

Current behavior:
All three files independently implement: a `drafts` record keyed by a locally-constructed cell key, a `dirtyCells`/`dirtyValidated` diff against server rows, `validateMeasuredDraft` invocation and footer error-message selection (`measuredValueDecimalPlacesExceededMessage` vs generic invalid-format text), a `BATCH_LIMIT = 200` chunked batch-create loop, and an identical `handleSave`/error/refetch/reset sequence.

UX problem:
Not a directly user-visible problem today (the three screens behave consistently because the duplicated logic was copied faithfully), but it is a maintainability risk specifically in the app's most safety-critical code path: a fix to tolerance-precision validation, batch-size limits, or error messaging applied to one copy and missed in the other two would silently produce inconsistent validation behavior between, e.g., a normal grid parameter and NIBP.

User impact:
Indirect — the risk is future inconsistency in calibration-value validation, not a current defect.

Evidence:
Compare `cellKey`/`dirtyCells`/`BATCH_LIMIT`/`handleSave` in `apps/tech-pwa/src/app/jobs/[id]/measurements/measurement-grid.tsx` (lines 34–196) against the near-identical structures in `apps/tech-pwa/src/app/jobs/[id]/measurements/nibp-grouped-grid.tsx` (lines 35–253) and the direct-reading path in `apps/tech-pwa/src/app/jobs/[id]/measurements/[parameterId]/page.tsx` (lines 60–259).

Root cause:
NIBP's grouped (multi-sibling) presentation is genuinely different from the single-parameter grid, and the single-parameter grid is genuinely different from the flat direct-reading list — so each was written as its own component rather than factored around a shared core, presumably because the differences seemed large enough to not obviously share code at the time each was added.

Recommendation:
Extract the save-plan/diff/validate sequence (not the rendering) into a shared hook (e.g. `useMeasurementSavePlan(existingRows, drafts, decimalPlacesOf)`) that all three screens call, keeping each screen's rendering bespoke. This is a refactor with a measurable benefit (single source of truth for validation/save-error behavior in the calibration data path) rather than a speculative abstraction.

Risk of changing:
Moderate — this is the core of the money workflow; any refactor needs the existing measurement test suite (`measurement.test.ts`) re-run in full before and after, and ideally new tests covering the extracted hook directly.

Dependencies:
All three measurement-entry screens; `lib/calibration/measurement.ts` (already the shared pure-function layer these three build on — the duplication is in the *stateful* wiring around those pure functions, not the functions themselves).
```

```markdown
## [UX-09] Status-badge color maps duplicated across four files

Severity:
P2

Area:
Job status / Identity Correction status / Reference Equipment validity badges

Current behavior:
`JOB_STATUS_BADGE_CLASS`/`IDENTITY_CORRECTION_BADGE_CLASS` are defined in `apps/tech-pwa/src/app/jobs/jobs-ui.tsx`. A separate, differently-named `CORRECTION_BADGE_CLASS` with the same three color values is redefined in `apps/tech-pwa/src/app/jobs/[id]/job-detail-ui.tsx` and again in `apps/tech-pwa/src/app/jobs/[id]/corrections/[correctionId]/page.tsx`. `REFERENCE_EQUIPMENT_VALIDITY_BADGE_CLASS` (a fourth, separately-maintained map) lives in `lib/calibration/reference-equipment.ts` and is consumed correctly from one place, but the identity-correction status color map itself is copy-pasted three times rather than imported once.

UX problem:
No current visible inconsistency (all three copies currently agree: amber/emerald/red), but this is exactly the kind of duplication that drifts silently — a future change to one status's color (e.g., a rebrand or an accessibility-contrast fix) applied to `jobs-ui.tsx` would not propagate to `job-detail-ui.tsx` or the correction-detail page unless the same edit is manually repeated three times.

User impact:
Latent — the risk is a future visual inconsistency where the same status shows a different color depending on which screen the technician is looking at.

Evidence:
`apps/tech-pwa/src/app/jobs/jobs-ui.tsx` (`IDENTITY_CORRECTION_BADGE_CLASS`); `apps/tech-pwa/src/app/jobs/[id]/job-detail-ui.tsx` (`CORRECTION_BADGE_CLASS`, identical values, different name); `apps/tech-pwa/src/app/jobs/[id]/corrections/[correctionId]/page.tsx` (`CORRECTION_BADGE_CLASS`, third copy).

Root cause:
No shared "status badge registry" module exists for tech-pwa; each screen that needed a badge for identity-correction status wrote its own small `Record`.

Recommendation:
Extract one `IDENTITY_CORRECTION_STATUS_BADGE_CLASS` map (and ideally a small `<IdentityCorrectionBadge status={...} />` component, which already exists in `jobs-ui.tsx` and could simply be imported by the other two files instead of reimplemented).

Risk of changing:
Very low — pure consolidation, no visual or behavioral change if done correctly (same color values, just one source).

Dependencies:
`jobs-ui.tsx`, `job-detail-ui.tsx`, `corrections/[correctionId]/page.tsx`.
```

```markdown
## [UX-10] "Beranda" always hard-reloads; back button never does — inconsistent navigation cost

Severity:
P2

Area:
`AppHeader` (global, every screen with `showBack`/`showHome`)

Current behavior:
`AppHeader`'s default Beranda handler (`components/layout/app-header.tsx`, `goHome()`) calls `window.location.assign("/jobs")` — a full page reload — while the back button calls `router.back()` (client-side, no reload) unless a screen supplies a custom `onBack`. The code comment explains this is deliberate: a client-side push from a `/jobs?customerId=…` drill-down URL doesn't reliably reset the list, and "Beranda wanting fresh data is a feature, not a cost."

UX problem:
This is a defensible tradeoff, not a bug, but it produces a visible inconsistency: the two navigation controls sitting next to each other in the same header (back arrow, home icon) behave completely differently — one is instant, the other is a full white-screen reload — with nothing in the UI signaling why. On a slow connection this reload is noticeably slower than every other navigation in the app.

User impact:
Minor but real friction/surprise every time a technician uses Beranda instead of repeated back-taps, particularly noticeable on poor connectivity (the one environment this app is built for).

Evidence:
`apps/tech-pwa/src/components/layout/app-header.tsx` lines 64–77 (`goHome()` — `window.location.assign("/jobs")` vs `router.back()` default).

Root cause:
A real technical constraint (query-param-driven list state not resetting reliably on client navigation) was solved with a full reload rather than an explicit client-side state reset (e.g., clearing `customerId`/`workOrderId` search params and invalidating the jobs query).

Recommendation:
Given this is a deliberate, documented tradeoff (not an oversight), the only recommended change is cosmetic: a brief loading affordance so the reload doesn't read as a stall (e.g. the browser's own navigation loading UI is likely already sufficient in standalone/PWA mode — verify before investing further here).

Risk of changing:
Attempting to replace the hard reload with client-side state reset touches the query-param list-state logic in `jobs/page.tsx` directly (`groupJobsByCustomer`, `customerId`/`workOrderId` derivation) — a business-adjacent area better left alone without a concrete, observed bug driving the change.

Dependencies:
`jobs/page.tsx` (list state derived from search params).
```

```markdown
## [UX-11] Inconsistent touch-target sizing between two near-identical toggle patterns

Severity:
P1

Area:
Kontrol Alat `TriStateChip` vs Physical Check `VerdictOption`

Current behavior:
Physical Check's BAIK/TIDAK BAIK toggle (`VerdictOption` in `physical-check/physical-check-ui.tsx`) is explicitly sized `min-h-11` (44px, matching the app's own `Button`/`AppHeader` touch-target convention). Kontrol Alat's tri-state toggle (`TriStateChip` in `kontrol-alat/page.tsx`) uses `rounded-md px-2.5 py-1 text-xs` with no `min-h` — a materially smaller tap target, repeated across up to 5 inspection rows plus every accessory row.

UX problem:
Both components serve the same interaction (a segmented boolean/tri-state choice) in the same app, on the same class of screen (structured field-inspection forms), but one respects the 44px minimum touch-target guideline the rest of the app follows and the other doesn't. The audit brief specifically calls out touch-target size and accidental taps as field-usability risk factors.

User impact:
Higher mis-tap rate on Kontrol Alat's inspection/accessory rows, especially relevant since Kontrol Alat is filled out at intake (often standing, one-handed, possibly wearing gloves) before calibration work even begins.

Evidence:
`apps/tech-pwa/src/app/jobs/[id]/kontrol-alat/page.tsx` `TriStateChip` (`"rounded-md px-2.5 py-1 text-xs..."`, no `min-h`) vs `apps/tech-pwa/src/app/jobs/[id]/physical-check/physical-check-ui.tsx` `VerdictOption` (`"flex min-h-11 cursor-pointer items-center justify-center..."`).

Root cause:
The two components were built independently for their respective screens without referencing a shared touch-target size token/convention.

Recommendation:
Raise `TriStateChip` to `min-h-11` (or a documented minimum consistent with `VerdictOption`), and consider extracting both into one shared segmented-toggle component given they express the same interaction pattern.

Risk of changing:
Very low — a sizing/spacing change only; no logic change. Dense inspection lists will get taller, which should be checked visually on a small-viewport device after the change.

Dependencies:
None beyond `kontrol-alat/page.tsx`'s own layout.
```

```markdown
## [UX-12] Confirm dialog lacks focus management for keyboard/assistive-tech users

Severity:
P2

Area:
`ExitConfirmDialog` (identity-correction wizard)

Current behavior:
`ExitConfirmDialog` in `apps/tech-pwa/src/app/jobs/[id]/identity-correction/layout.tsx` renders `role="dialog" aria-modal="true" aria-labelledby="exit-wizard-title"` — correct ARIA semantics — but there is no focus-trap and no explicit `.focus()` call moving keyboard focus into the dialog when it opens, and no focus-return to the triggering element on close.

UX problem:
A keyboard or switch-access user (or a screen-reader user navigating by focus) opening this dialog is not automatically placed inside it, and could tab to elements behind the overlay while it's open.

User impact:
Accessibility gap for the one confirm dialog that exists in the app; low-frequency but a real barrier for assistive-technology users.

Evidence:
`apps/tech-pwa/src/app/jobs/[id]/identity-correction/layout.tsx`, `ExitConfirmDialog` function (no `useRef`/`useEffect` focus management present in the component).

Root cause:
The dialog was built as a minimal bespoke overlay for one specific use case rather than from/with a modal-focus-trap utility.

Recommendation:
Add a small focus-trap (move focus to the dialog's first focusable element on open, restore focus to the triggering control on close, and constrain Tab/Shift+Tab within the dialog while open) — a natural companion to Finding UX-01's recommendation to generalize this dialog for reuse elsewhere.

Risk of changing:
Very low, additive-only.

Dependencies:
Any future reuse of this dialog pattern for UX-01.
```

```markdown
## [UX-13] Push-notification opt-in is buried two taps deep with no onboarding prompt

Severity:
P2

Area:
Account menu / push notifications

Current behavior:
`AccountMenu` (`components/layout/account-menu.tsx`) shows a "Aktifkan notifikasi" button only inside the hamburger dropdown, and only calls `usePushNotifications(...).enable()` on explicit tap — there is no proactive prompt anywhere else in the app (e.g. no banner after first sign-in, no prompt tied to a specific job event).

UX problem:
A technician who never opens the account menu will never be offered push notifications at all, and has no in-context reason to go looking for the option.

User impact:
Missed awareness of new job assignments or Portal-side decisions (identity-correction approval/rejection, quality-review outcome) that the app's own 6-second polling is designed to surface *while the app is open* — but polling pauses when backgrounded, so push is the only channel for out-of-app awareness, and it's opt-in and undiscoverable.

Evidence:
`apps/tech-pwa/src/components/layout/account-menu.tsx` (`PushStatusItem`, rendered only inside the `role="menu"` dropdown); no other call site of `usePushNotifications` in the app (`apps/tech-pwa/src/lib/fcm/use-push-notifications.ts` is only imported by `account-menu.tsx`).

Root cause:
This is a plausible deliberate product decision (never auto-prompt for notification permission, which browsers themselves discourage doing without context) rather than an oversight — flagged here as an observation for product judgment, not a clear defect.

Recommendation:
If broader notification adoption is desired, a one-time contextual prompt after first successful sign-in (with a clear "not now" dismissal, never nagging again) would be a targeted, low-risk addition. If the current opt-in-only, no-nag design is intentional, no change is needed — noting this only because the audit brief asks for notification/feedback-channel coverage.

Risk of changing:
Low if implemented as a dismissible, one-time prompt; must not repeatedly nag or auto-request permission (browsers can permanently block the origin if permission is requested and dismissed too aggressively).

Dependencies:
`use-push-notifications.ts`, `providers.tsx` (where a first-sign-in prompt would need to hook in).
```

```markdown
## [UX-14] Reference-equipment selection form only hydrates local state once

Severity:
P3

Area:
`/jobs/[id]/reference-equipment`

Current behavior:
`ReferenceEquipmentPage` seeds its local `selection` record from `candidatesQuery.data`/`usedQuery.data` inside a `useEffect` guarded by `if (selection || !candidatesQuery.data || !usedQuery.data) return;` — i.e. it only runs once, the first time both queries resolve. Neither query polls.

UX problem:
If the underlying candidate/used data changed between when the technician opened this screen and when they act on it (e.g., backgrounded the app for a while, or a Manajer Teknis override landed via another surface), the checkbox state shown will not reflect that change — the effect has already fired once and will not re-run.

User impact:
Low likelihood in practice (this screen is opened, used, and closed in one sitting), but if it does occur, the technician could submit a replace-set based on stale assumptions about which units are already recorded.

Evidence:
`apps/tech-pwa/src/app/jobs/[id]/reference-equipment/page.tsx` lines 61–70 (the guarded one-shot `useEffect`).

Root cause:
The one-shot hydration guard is a reasonable way to avoid clobbering in-progress edits on every background refetch, but there is no path for a *deliberate* re-sync (e.g. a manual refresh) if the technician suspects the data is stale.

Recommendation:
Not urgent; if addressed, the fix is narrow — e.g. reset `selection` to `null` on manual pull-to-refresh/refetch rather than changing the one-shot-on-load behavior for normal use.

Risk of changing:
Low, but any change here directly touches the full-set-replace submission logic (a business-sensitive area — "this list replaces the entire prior record every save," per the screen's own copy) and should be scoped carefully.

Dependencies:
None beyond this screen.
```

```markdown
## [UX-15] Symbol-picker keyboard shortcut is dead weight on a touch PWA

Severity:
P3

Area:
`GlobalSymbolPicker` (shared component, `packages/ui`)

Current behavior:
`GlobalSymbolPicker.tsx` registers a `Ctrl+Shift+M` `keydown` listener globally to toggle the picker — a desktop-oriented shortcut with no touch/mobile equivalent, running on every tech-pwa screen.

UX problem:
Harmless in practice (unreachable on a phone virtual keyboard), but it's a small signal that this shared component was authored for a different (desktop/admin) context and reused as-is rather than being reviewed for fit in a mobile field PWA.

User impact:
None directly observable to technicians; included for completeness given the audit's mandate to flag where shared components diverge from the context they're reused in (see UX-03, which is the concrete manifestation of the same root cause).

Evidence:
`packages/ui/src/symbol-picker/GlobalSymbolPicker.tsx` lines 37–46.

Root cause:
Same as UX-03 — shared-component reuse without a mobile-context adaptation pass.

Recommendation:
No action needed on its own; consider it alongside UX-03's `fabClassName` fix as part of the same "adapt this shared component for tech-pwa" pass.

Risk of changing:
None — this is an observation, not a recommendation to remove functionality that may matter in other consumers of `packages/ui`.

Dependencies:
UX-03.
```

## 7. Cross-Screen Consistency Findings

- **Status badges** (Finding UX-09): the same three-state color scheme (amber/emerald/red for PENDING_REVIEW/APPROVED/REJECTED-style statuses) is redefined in `jobs-ui.tsx`, `job-detail-ui.tsx`, and `corrections/[correctionId]/page.tsx` instead of imported from one place.
- **Save models** (Finding UX-07): autosave (Kontrol Alat) vs explicit-Simpan-with-drafts (Physical Check, Measurement×3) vs step-gated wizard (Identity Correction) — three models for the same underlying question.
- **Touch target sizing** (Finding UX-11): `min-h-11` is the app's own convention (used in `Button`, `AppHeader`, `VerdictOption`, checkbox/radio rows) but is not applied to `TriStateChip`.
- **Unsaved-changes protection** (Finding UX-02): present only in the identity-correction wizard; absent everywhere else input is collected.
- **Confirmation dialogs**: exactly one exists in the entire app (`ExitConfirmDialog`), built inline for a single use case rather than as a shared primitive — every other "commit an important action" moment (UX-01) has none.
- **Navigation cost**: back (`router.back()`, instant) vs Beranda (`window.location.assign`, full reload) sit side-by-side in the same header with no visual cue for the difference (Finding UX-10).
- **Duplicated stateful logic**: the three measurement-entry variants (Finding UX-08) share pure helpers (`lib/calibration/measurement.ts`) but duplicate the stateful wiring around them.
- **Positive pattern, worth preserving**: `LoadingState`/`ErrorState`/`EmptyState`/`CardListSkeleton` are used with zero deviation across every screen audited — this is the strongest consistency pattern in the app and should be the template for how the fixes above (badges, save feedback) get consolidated.

## 8. Mobile / Field UX Findings

- Global 44px (`min-h-11`) touch-target convention is applied broadly and correctly in `Button`, `AppHeader`, form rows, and `VerdictOption` — a genuine strength for one-handed/gloved field use, with the one clear exception in Finding UX-11.
- `viewport` config (`apps/tech-pwa/src/app/layout.tsx`) explicitly keeps `maximumScale: 5` ("allow pinch-zoom (accessibility) — never disable user scaling") — a deliberate, correct accessibility choice, worth calling out positively.
- `viewportFit: "cover"` plus `pt-safe-t`/`pb-safe-b` utility classes (custom Tailwind spacing tokens for `env(safe-area-inset-*)`) are consistently applied to `AppHeader` and `StickyActionBar` — correct notch/home-indicator handling for standalone PWA mode.
- The GlobalSymbolPicker FAB overlap (UX-03) and the freeze-on-tap Kontrol Alat pattern (UX-04) are both specifically one-handed/thumb-zone risks, per the audit brief's own framing of field-usability risk factors.
- Long single-scroll Job Detail (up to 9 sections, Finding UX-06) has no section jump-nav or collapsible grouping; on a phone this means a long thumb-scroll to reach mid-page sections like Kontrol Alat or Physical Check status, though the primary actions themselves are always reachable via the sticky footer.
- Every measured-value input uses `inputMode="decimal"` (numeric-friendly software keyboard hint) — a correct, consistently-applied mobile input affordance.

## 9. PWA Findings

- **Install/standalone**: `manifest.webmanifest` is correctly configured (`display: standalone`, both `any` and `maskable` icon purposes at 192/512, theme/background colors matching the app's teal brand). Not verified from available source: actual install-prompt UX (no custom `beforeinstallprompt` handling was found in the codebase, meaning the app relies entirely on the browser's native install affordance rather than an in-app "Install App" prompt/banner).
- **Offline**: navigation-only offline fallback (`offline.html`) is implemented cleanly and matches the app's visual language; there is no offline data caching or write queue (Finding UX-05) — the single most consequential PWA gap for a field app.
- **Service worker scope**: one SW file (`firebase-messaging-sw.js`) deliberately serves both the FCM background-message handler and the app-shell cache, with an explicit comment explaining why ("only one is allowed per scope") — a correct, well-reasoned technical decision, not a finding.
- **Cache invalidation**: `SHELL_CACHE = "tech-pwa-shell-v1"` with an `activate` handler that deletes any cache key that isn't the current version — correct cache-busting hygiene.
- **Push notifications**: functional and reasonably robust (`use-push-notifications.ts` distinguishes `unconfigured`/`unsupported`/`denied`/`enabling`/`enabled`/`error` states with specific Indonesian-language guidance per failure kind in `FCM_TOKEN_ERROR_MESSAGES`) but undiscoverable (Finding UX-13).
- **Data usage**: 6-second polling on the jobs list and (while open) job detail/corrections is a deliberate live-refresh design with a documented rationale (mirrors Portal), and correctly pauses when backgrounded (`refetchIntervalInBackground` left at its default `false`) — reasonable, but worth noting as an ongoing data-usage cost on metered field connections; not scored as a standalone finding since it's a considered tradeoff, not an oversight.

## 10. Accessibility Findings

- Touch targets: broadly compliant (`min-h-11` convention) with the one clear regression noted in Finding UX-11.
- Pinch-zoom is explicitly preserved (`maximumScale: 5`), a correct choice many apps get wrong — positive finding.
- Semantic structure: `<header>`/`<main>`/`<footer>` landmarks are used consistently via the `Screen` shell; headings (`<h1>` for screen title, `<h2>` for `Section` titles) are present and structurally sound.
- ARIA: `aria-label`s are present on icon-only buttons (back, home, refresh, account menu) and the account menu correctly uses `aria-haspopup`/`aria-expanded`. The one modal dialog in the app has correct `role`/`aria-modal`/`aria-labelledby` but lacks focus management (Finding UX-12).
- Status communication is not color-only: every status badge pairs a color with a text label (`JobStatusBadge`, `IdentityCorrectionBadge`, pass/fail chips, physical-check chips) — correct pattern, consistently applied.
- Not verified from available source: actual computed color-contrast ratios (e.g. `amber-700` text on `amber-50` background used repeatedly for locked/warning banners, or `slate-400` disabled-state text) were not measured against WCAG thresholds in this audit — flagging for a dedicated contrast pass rather than asserting a violation without measurement.
- Not verified from available source: screen-reader behavior (VoiceOver/TalkBack) was not tested live; the audit is based on static markup/ARIA review only.

## 11. Form UX Findings

- **Validation timing** is inconsistent by necessity of the different save models (Finding UX-07): Kontrol Alat validates nothing client-side (booleans/free text, autosaved); Physical Check validates only "has a verdict been picked" implicitly via `buildPhysicalCheckSavePlan`; Measurement entry has the most sophisticated validation (`validateMeasuredDraft`, decimal-place precision, numeric-vs-symbol routing) with per-field red-border + a shared footer error message once any field has been touched (`touched` state).
- **Required-field indication**: none of the forms audited use a visual required-field marker (asterisk or equivalent) — required-ness is enforced only by disabling the "Lanjut"/"Simpan"/"Kirim" button, so a technician who can't figure out why the button is disabled has no per-field cue (e.g. identity-correction's `reason` textarea has no "required" affordance beyond the button staying disabled).
- **Autosave-on-blur risk** (Kontrol Alat's "Alasan tidak dilaksanakan" textarea): saves on `onBlur`, meaning tapping directly from that field to, say, the header's back button captures the blur (and thus the save) correctly — but there is no visual "saved" confirmation, only silence on success and an error message on failure (`patch.isError`).
- **Consistent input typing**: `inputMode="decimal"`/`inputMode="search"` are applied correctly where relevant; `maxLength` is set on every free-text field (reason: 2000, brand/model/serial: 120, signer name: 120, unavailable reason: 500) — a genuinely consistent, well-considered pattern across all forms.
- **Override-reason gating** (Reference Equipment `CandidateRow`): correctly requires a non-empty override reason before allowing submission when a manager-level override applies (`missingOverrideReason`) — good example of inline, contextual validation tied directly to a business rule, not flagged as a finding, cited as a positive pattern for form UX.

## 12. State Management UX Findings

- Query-key namespacing (`["job", id, ...]`) is a strong, consistently-applied convention that makes cache invalidation predictable across nine+ hook files.
- No optimistic updates anywhere in the app — every mutation waits for the server round-trip before the UI reflects the change (`onSuccess: () => queryClient.setQueryData(...)` or `invalidateQueries`). This is a safe default for calibration data (where "phantom success" would be worse than a brief wait) and is not flagged as a defect, but it does mean perceived responsiveness is fully dependent on network latency — reinforcing the importance of Finding UX-04 (don't let one field's pending state visually block unrelated fields) and UX-05 (offline resilience).
- Polling (`refetchInterval: 6000`) is opt-in per-hook via a shared `LIVE_REFRESH` constant/`{ poll }` option, deliberately disabled on single-technician entry screens (measurement/physical-check queries) to avoid a request racing an in-flight edit — a well-reasoned, explicitly-commented design choice.
- Local component state (`drafts`, `selection`, wizard `state`) is the sole source of truth for in-progress input everywhere; none of it survives a refresh or an accidental tab/app close (ties directly to Finding UX-02 and, at the architecture level, UX-05).

## 13. Critical Workflow Findings

The workflows the audit brief specifically calls "critical" — where a mistake could cause wrong calibration input, wrong device/job context, or an inability to complete a job — map to findings as follows:

- **Wrong device/job context**: mitigated well. `AssignedDeviceSection`'s device-lookup list deliberately hides internal ids/codes and shows only brand/model/serial (a considered anti-confusion design), and the identity-correction wizard explicitly locks the underlying Device (only Brand/Model/Serial observations are correctable) — no finding here; this area is handled thoughtfully.
- **Wrong/incomplete calibration input**: the two most relevant risks are Finding UX-02 (silent loss of unsaved readings on navigation) and Finding UX-08 (triplicated validation logic that could drift). Numeric validation itself (`validateMeasuredDraft`) is thorough and well-tested (`measurement.test.ts` exists).
- **Inability to complete a job**: gating logic (`canSubmitForReview`, `canCompleteJob`, identity-correction/reference-equipment "unresolved" blockers) is clear and surfaces human-readable reasons (`submitBlockedReason`, `lockedReason`) rather than silent disabled buttons — a strength, not a finding.
- **Incorrect operational action taken accidentally**: Finding UX-01 (no confirmation on Submit/Complete) combined with Finding UX-03 (FAB overlapping the same buttons) is the most concrete, compounding P0 risk identified in this audit.

## 14. Root-Cause Analysis

Three recurring root causes explain most findings above:

1. **Patterns built once, for one screen, never generalized.** The unsaved-changes guard (UX-02), the confirmation dialog (UX-01), and the status-badge maps (UX-09) all exist in exactly one place each, solving one screen's problem, when the same problem recurs elsewhere in the app. This is not "no patterns exist" — it's "good patterns exist but stayed local."
2. **Independent vertical slices for closely related workflows.** Kontrol Alat, Physical Check, and the three Measurement Entry variants were each built as a self-contained slice against their own endpoint shape, which is why they diverge in save model (UX-07) and duplicate logic (UX-08) despite serving structurally similar "record a field observation" needs.
3. **Shared components reused without a mobile-field adaptation pass.** `GlobalSymbolPicker` (UX-03, UX-15) is the clearest example: a component built for a different context was dropped in as-is rather than reviewed for how it interacts with tech-pwa's own sticky-footer convention.

None of the findings trace to the business/domain logic itself (job-state machine, approval flows, RBAC, tolerance rules) — that layer is implemented thoroughly, is well-tested (numerous `*.test.ts` files were found alongside the pure logic modules), and is explicitly out of scope to change per this audit's instructions.

## 15. Proposed UX Direction

These are principles, not a visual redesign, and none require touching business logic:

- **Information hierarchy**: keep the existing `Screen` → `Section` → row pattern; where a screen grows past ~5 sections (Job Detail), consider a lightweight in-page jump-nav or making sections default-collapsed with the item count visible in the header — not a full accordion redesign, just reducing scroll depth to reach mid-page sections.
- **Navigation model**: preserve the current back/Beranda split — it's a reasoned tradeoff (UX-10) — but make it visually distinguishable that one is instant and one reloads (e.g. Beranda already renders a home icon distinct from the back arrow, which is a reasonable existing cue; no further change recommended beyond what's proposed in UX-10).
- **Action hierarchy**: every irreversible action lives in the sticky footer today — keep that, but split "reversible, no confirm needed" (Start, Resume) from "irreversible-in-effect, needs a beat" (Submit, Complete) using the one confirmation-dialog pattern already proven in the wizard (UX-01).
- **Mobile interaction model**: continue the `min-h-11` touch-target convention everywhere without exception (UX-11), and resolve the FAB/footer collision (UX-03) so the bottom-right corner of every data-entry screen is unambiguous.
- **Form model**: don't force one save mechanism across all screens — autosave suits single-toggle forms (Kontrol Alat), explicit-Simpan suits batch numeric entry (Measurement/Physical Check) — but make the *feedback* uniform: every save, of either kind, should produce a brief, consistent "Tersimpan"/"Menyimpan…"/"Gagal menyimpan" signal, and every screen holding unsaved local drafts should protect against silent loss on navigation (UX-02, UX-07).
- **Status model**: one shared status-badge registry (UX-09) feeding every screen that currently redefines its own color map — no visual change, just one source of truth.
- **Progressive disclosure**: the app already does this well for locked/unavailable actions (showing a human-readable "why" instead of just disabling a button) — extend that same "always say why" habit to save states and validation errors uniformly.

## 16. Recommended Component/System Improvements

| Proposed change | Current consumers | Expected benefit | Migration impact | Regression risk |
|---|---|---|---|---|
| Extract `ConfirmDialog` from `ExitConfirmDialog` | Identity-correction wizard only today | Enables UX-01 (confirm Submit/Complete) and UX-12 fix (focus trap) in one place | New shared component in `components/ui/`; wizard's own usage becomes a thin wrapper | Low — additive, existing wizard behavior preserved if the extraction keeps identical markup/behavior |
| Extract `useUnsavedChangesGuard` hook from the wizard's `popstate` trap | Identity-correction wizard only today | Enables UX-02 fix across Measurement/Physical-Check/Kontrol-Alat | 3–4 call sites to wire up, each supplying their own "has unsaved changes" boolean (already computed as `dirtyCells`/`nothingToSave` in each screen) | Moderate — must verify it doesn't conflict with each screen's existing `onBack`/`showBack` handling |
| Consolidate identity-correction status badge into one shared map/component | `jobs-ui.tsx`, `job-detail-ui.tsx`, `corrections/[correctionId]/page.tsx` | Removes drift risk (UX-09) | Import-only change in 2 files (one already has the canonical version) | Very low |
| `fabClassName` override for `GlobalSymbolPicker` on screens with `StickyActionBar` | Every screen via `global-symbol-picker-host.tsx` | Removes FAB/footer overlap (UX-03) | One prop threaded through the host component, conditioned on whether the current screen renders a footer | Very low |
| `min-h-11` on `TriStateChip` | Kontrol Alat only | Touch-target consistency (UX-11) | CSS-only change | Very low — verify visual density on the inspection list still reads well |
| Shared `useMeasurementSavePlan` hook | 3 measurement-entry screens | Single source of truth for the calibration data path (UX-08) | Moderate refactor of 3 files' stateful wiring; pure helpers in `measurement.ts` untouched | Moderate — requires full re-run of `measurement.test.ts` plus new tests for the extracted hook |

## 17. Prioritized Implementation Roadmap

This roadmap is derived from the findings above, grouped by dependency and risk, not a fixed template:

**Phase 1 — Prevent data loss and accidental commits (P0s)**
1. UX-02: extract and wire the unsaved-changes guard into Measurement Entry (all 3 variants) and Physical Check.
2. UX-01: extract `ConfirmDialog` and require confirmation before "Kirim hasil ke Manajer Teknis" and "Selesai" (Submit/Complete).
3. UX-03: reposition the `GlobalSymbolPicker` FAB via `fabClassName` on every screen with a `StickyActionBar`.

**Phase 2 — Reduce field friction on the highest-traffic entry screens (P1s)**
4. UX-04: per-field pending state in Kontrol Alat's `InspectionSection`.
5. UX-11: `min-h-11` on `TriStateChip`.
6. UX-07: add uniform save-state feedback (Tersimpan/Menyimpan/Gagal) to Kontrol Alat's autosave fields.
7. UX-06: defer non-visible-section queries on Job Detail; consider consolidated retry.

**Phase 3 — Consistency and maintainability cleanup (P2s)**
8. UX-09: consolidate status-badge maps.
9. UX-12: add focus management to `ConfirmDialog` (naturally follows Phase 1's extraction).
10. UX-13: evaluate (product decision) whether a one-time contextual push-notification prompt is desired.
11. UX-08: extract shared measurement save-plan/validation hook, with full regression test coverage.

**Phase 4 — Larger architectural consideration (flagged, not scoped here)**
12. UX-05: offline write-queue design — a dedicated project, not a UI patch; requires its own scoping, review of idempotency/conflict handling against attempt/lock state, and is intentionally not detailed further in this audit.

Items UX-10, UX-14, UX-15 are low-severity/observational and can be picked up opportunistically alongside adjacent work (UX-10 alongside any future list-state rework; UX-14 alongside any Reference Equipment change; UX-15 alongside UX-03).

## 18. Risks and Dependencies

- **UX-02's guard and UX-01's dialog both touch navigation interception** — implementing both together requires care that a single back-tap doesn't trigger two competing prompts (an unsaved-changes warning stacked on a submit-confirmation). Sequence Phase 1 items with this in mind (build the shared primitive once, wire both consumers against it deliberately).
- **UX-08's refactor is the highest-risk item in this report** because it touches the calibration-value entry path directly. It must not proceed without the full `measurement.test.ts` suite passing before and after, per the project's own testing rules, and ideally new unit tests for the extracted hook in isolation.
- **UX-05 (offline queue) is explicitly out of this roadmap's detailed scope** — it is an architectural decision (data model for a queue, conflict resolution against server-side attempt/lock state) that deserves its own design review, not a bundled UI fix.
- **UX-13 is a product decision, not a pure UX fix** — do not implement a proactive notification prompt without confirming the current opt-in-only design isn't deliberate.
- No proposed change in this report requires modifying `apps/api`, Prisma schema, or any business-rule/gating function (`canSubmitForReview`, `canCompleteJob`, `isIdentityGateLocked`, tolerance calculation, etc.) — all recommendations are confined to the UI/interaction layer in `apps/tech-pwa` (and, for UX-03/UX-15, a positioning prop on a `packages/ui` component already designed to accept one).

## 19. Items That Should NOT Be Changed

- The job-state gating logic and its human-readable "why" messaging (`measurementLockedReason`, `physicalCheckLockedReason`, `submitBlockedReason`, `canEditKontrolAlat`, `isIdentityGateLocked`, etc.) — this is business logic, thoroughly implemented, explicitly out of scope, and is in fact a strength worth preserving as-is.
- The `Screen`/`AppHeader`/`StickyActionBar` shell and the `LoadingState`/`ErrorState`/`EmptyState`/`CardListSkeleton` state-view vocabulary — both are consistently applied across the entire app and should be the *template* other fixes converge toward, not something to replace.
- The identity-correction wizard's step-gating, one-shot entry-intent flag, and `popstate`-trap-plus-confirm pattern — this is the best-engineered flow in the app and should be extracted/reused (per UX-01/UX-02), not redesigned.
- The deliberate no-polling policy on single-technician entry screens (measurement/physical-check) — correctly reasoned to avoid a poll racing an in-flight edit; do not add polling here.
- The "Signature" workflow's status-attestation model (no ink-canvas capture) — this reflects a business decision (photographed paper BA as evidence) that is out of scope to redesign into a drawn-signature capture feature.
- The reference-equipment full-set-replace submission model and override-reason gating — business logic, correctly implemented with good inline validation; not a UX defect.
- `maximumScale: 5` (pinch-zoom preserved) and the safe-area-inset handling — both correct, deliberate accessibility/PWA choices.
- The app-shell-only (no data caching) service-worker strategy as a *baseline* — reasonable and explicitly documented; the gap is the missing write-queue layer on top of it (UX-05), not the shell strategy itself.

## 20. Final Audit Summary

1. **Biggest UX problems across Tech-PWA**: (a) irreversible job actions (Submit/Complete) fire on a single unconfirmed tap, compounded by (b) a floating global control overlapping the exact button that triggers them, and (c) silent loss of unsaved calibration/inspection input on back-navigation from the three main data-entry screens.
2. **Isolated vs systemic**: UX-01/UX-02/UX-03 are systemic (they recur across most or all data-entry screens). UX-04 (Kontrol Alat shared-mutation freeze) and UX-14 (reference-equipment one-shot hydration) are isolated to single screens.
3. **Shared components/patterns that should be standardized**: a confirm-dialog primitive, an unsaved-changes-guard hook, and a single status-badge registry — all three already exist as one-off implementations somewhere in the codebase and just need extracting.
4. **Highest cognitive-load workflows**: Job Detail (9 sections, 7 parallel queries, UX-06) and Measurement Entry (three different entry-screen shapes — direct, grid, NIBP-grouped — each with its own validation/save mechanics, UX-08) place the most simultaneous decisions and state on the technician.
5. **Issues that could cause technician mistakes**: UX-01 (accidental submit/complete), UX-02 (lost readings), UX-03 (mis-tap on FAB instead of Simpan/Kirim), UX-04 (perceived freeze inviting repeated taps).
6. **Merely visual polish**: UX-15 (dead keyboard shortcut) is the only finding in this report that is pure observation with no user-facing consequence; everything else has a concrete task-efficiency, error-prevention, or maintainability rationale.
7. **Improvements possible without touching business/domain logic**: all findings except UX-05 (which is explicitly flagged as needing its own architectural scoping) are confined to the UI/interaction layer and require zero changes to gating rules, approval flows, RBAC, or tolerance calculation.
8. **Requiring deeper architectural change**: UX-05 (offline write queue) is the one item that is a genuine architecture decision rather than a UI fix.
9. **What should be fixed first**: the Phase 1 set — unsaved-changes guard, submit/complete confirmation, and the FAB/footer overlap — because together they are the most direct, code-verified path to an unintended operational action or lost calibration data.
10. **What should deliberately be left unchanged**: the job-state gating/messaging logic, the `Screen`/state-view shell, the identity-correction wizard's navigation-safety pattern (to be reused, not redesigned), the no-polling policy on entry screens, and the status-attestation signature model.

---

### Areas Not Verified From Available Source

- Actual computed color-contrast ratios (WCAG AA/AAA) for warning/locked-state banners and disabled text — static code review only, no rendered/measured check.
- Live screen-reader behavior (VoiceOver/TalkBack) — ARIA markup was reviewed statically; no live assistive-technology pass was performed.
- Real-device network-throttling behavior (actual perceived latency of the 7-parallel-query Job Detail load, or of the "Beranda" full-page reload) — reasoned from code structure, not measured on-device.
- Whether a custom `beforeinstallprompt` / "Install App" banner exists anywhere reachable at runtime beyond what static source search found (none was found in `apps/tech-pwa/src`, but this cannot fully rule out configuration elsewhere, e.g. in `apps/api`-served content or environment-specific injection).
