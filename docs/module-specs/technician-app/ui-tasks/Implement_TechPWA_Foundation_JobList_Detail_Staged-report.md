# IMPLEMENTATION REPORT — Tech-PWA: Foundation + Job List + Job Detail + Escalate

Task spec: [Implement_TechPWA_Foundation_JobList_Detail_Staged.md](./Implement_TechPWA_Foundation_JobList_Detail_Staged.md)
Stage 1 proposal + approval log: [running-tasks.md](../../../meeting-notes-session-logs/running-tasks.md)

## Status: Stage 2 complete

Stage 1 (design proposal, Part A–E) was approved verbatim — SW Option A, `sharp` as
devDependency, "Ajukan Koreksi Identitas" rendered disabled with explanation, no pagination UI
(`pageSize=100`), correction detail as a sub-route, manual refresh button. Implementation had
started but stalled after only `tailwind.config.js` and `globals.css` were written; this report
covers the completed Stage 2 build that followed, plus later refinements applied directly in the
editor after the initial pass.

## What was built

### Part A — Foundation
- `layout.tsx` viewport export (`device-width`, `maximumScale: 5`, `viewportFit: "cover"`) and
  `metadata.icons.apple` — done in the earlier partial pass, left as approved.
- **Icons**: [scripts/generate-icons.mjs](../../../../apps/tech-pwa/scripts/generate-icons.mjs)
  (one-shot, `sharp`) composites `public/short-logo.png` (239×300, transparent) onto white-background
  square canvases → `public/icons/{icon-192,icon-512,icon-192-maskable,icon-512-maskable,apple-touch-icon}.png`.
  White background chosen for contrast against the logo's blue/green. Script is committed for
  reproducibility when the final logo asset lands; output PNGs are committed too so the app never
  depends on the script at build/runtime. `sharp` added as a devDependency of `@medcal/tech-pwa`
  (already present in the pnpm store from another workspace package, so no cold network fetch was
  needed beyond the initial `pnpm install --filter`).
- `manifest.webmanifest`: `icons[]` populated (any + maskable variants), `background_color`,
  `orientation: "portrait"` — done in the earlier partial pass.
- **Offline app-shell**: [public/offline.html](../../../../apps/tech-pwa/public/offline.html), a
  self-contained static page (inline CSS, no network dependency) — logo, "Anda sedang offline",
  "Coba lagi" button (`location.reload()`), mobile-first single column, 44px tap target.
- **Service worker (Option A — merged, not a second SW)**:
  [firebase-messaging-sw.js/route.ts](../../../../apps/tech-pwa/src/app/firebase-messaging-sw.js/route.ts)
  extended with `install` (precache `/offline.html`, `/icons/icon-192.png`, `/short-logo.png`,
  `skipWaiting()`), `activate` (clear stale cache versions, `clients.claim()`), and `fetch`
  (navigate-mode requests only → network-first, `catch` → `caches.match("/offline.html")`). No
  data/JS/RSC caching — zero risk of serving a stale bundle. FCM `onBackgroundMessage` handler
  unchanged.
- [components/layout/sw-register.tsx](../../../../apps/tech-pwa/src/components/layout/sw-register.tsx):
  always-on SW registration, mounted in `providers.tsx` (previously the SW only registered when a
  user opted into push notifications). `lib/fcm/messaging.ts#obtainFcmToken` simplified to reuse
  the existing registration (`getRegistration` → `ready`) instead of registering a second time.
- Tailwind tokens (`brand` teal scale, `safe-t`/`safe-b` spacing) and `globals.css` `@layer base`
  (16px inputs to block iOS auto-zoom, `color-scheme: light`, tap-highlight reset) — done in the
  earlier partial pass; `globals.css` later gained a `.auth-canvas` radial-gradient utility for the
  sign-in chrome (editor pass, see "Changes beyond the original scope" below).
- Navigation shell primitives under `src/components/`:
  - `layout/app-header.tsx`, `layout/screen.tsx`, `layout/sticky-action-bar.tsx` — sticky header
    (back button / title / right slot, `pt-safe-t`), scaffold, sticky footer (`pb-safe-b`).
  - `ui/button.tsx`, `ui/badge.tsx`, `ui/spinner.tsx`, `ui/section.tsx`, `ui/state-views.tsx`
    (`LoadingState`, `ErrorState`, `EmptyState`, `CardListSkeleton`) — all `min-h-11`/`min-w-11`,
    `active:`/`focus-visible:` states, no `hover:`-dependent interaction anywhere in new code.
  - `feedback/error-banner.tsx` for inline mutation-failure banners.
- `src/app/jobs/layout.tsx`: client-side auth gate (`useRequireSession` → loading / pending /
  forbidden / ready), mirroring the state machine the old root page used.
- `src/app/page.tsx`: reduced to `redirect("/jobs")`.

### Part B — Job List (`/jobs`)
- [use-jobs-query.ts](../../../../apps/tech-pwa/src/app/jobs/use-jobs-query.ts):
  `GET /calibration-jobs?assignedToMe=true&pageSize=100&sortBy=createdAt&sortDir=desc`,
  `refetchOnWindowFocus: true` (overrides the app default) so the list refreshes when the
  installed PWA is foregrounded. No pagination UI — footer note ("Menampilkan N dari total — hubungi
  koordinator") only if `total > data.length`.
- [jobs-ui.tsx](../../../../apps/tech-pwa/src/app/jobs/jobs-ui.tsx): `JobCard` (unit ordinal, WO
  number, declared device name, `JobStatusBadge` + `AkdAklStatusBadge`), badge color map mirrors
  Portal's convention but is rebuilt locally — no cross-app import.
- [page.tsx](../../../../apps/tech-pwa/src/app/jobs/page.tsx): skeleton list (4 pulsing cards) while
  pending, `ErrorState` with retry, `EmptyState` copy, manual refresh button in the header's right
  slot (spins while `isFetching`).

### Part C — Job Detail (`/jobs/[id]`)
- [use-job-query.ts](../../../../apps/tech-pwa/src/app/jobs/[id]/use-job-query.ts): `useJobQuery`,
  `useCorrectionsQuery`, `useCorrectionQuery` (derives one correction from the list query — no
  extra network round trip since the API has no single-correction GET), `useEscalateIdentity`
  mutation (invalidates `["jobs"]`, `["job", id]`, `["job", id, "corrections"]` on success).
- [job-detail-ui.tsx](../../../../apps/tech-pwa/src/app/jobs/[id]/job-detail-ui.tsx): read-only
  sections — header block, declared identity, technician-observed identity, assigned device (or
  "Alat belum diidentifikasi."), AKD/AKL approval status (decider + note shown only when
  APPROVED/REJECTED), and the corrections list (tappable rows → sub-route, per the approved
  single-screen-single-focus rationale).
- Action bar (`StickyActionBar`, `pb-safe-b`):
  - "Eskalasi AKD/AKL" — shown only when `capabilities?.calibrationJobEscalateIdentity`; enabled
    and links to `/jobs/[id]/escalate` when `canEscalateIdentity(job)`, otherwise disabled with an
    explanatory line (gate-locked vs. under-review/approved).
  - "Ajukan Koreksi Identitas" — shown only when `capabilities?.calibrationJobSubmitIdentityCorrection`,
    always disabled, with the approved copy: "Segera hadir. Untuk sementara, ajukan koreksi
    identitas melalui koordinator / Portal."
- [corrections/[correctionId]/page.tsx](<../../../../apps/tech-pwa/src/app/jobs/[id]/corrections/[correctionId]/page.tsx>):
  read-only correction detail — reason, before→after change rows (`summarizeCorrectionChanges`,
  rebuilt locally), per-signature status/signer/thumbnail (`components/ui/signature-image.tsx`,
  a local rebuild of Portal's blob-fetch pattern via `apiFetchBlob`), decision + note when decided.

### Part D — Escalate (`/jobs/[id]/escalate`)
- Single form, not a wizard: optional `technicianObservedAkdAkl` (maxLength 120) and `reason`
  (textarea, maxLength 2000), sticky submit button ("Mengirim…" while pending). Success →
  `router.back()` (list/detail refetch via invalidation shows the new `PENDING_REVIEW` state).
  Failure → inline `ErrorBanner`, form state preserved (decision 4a — nothing is cleared, the same
  submit button doubles as retry). Guard: if the capability is missing or the gate is closed, the
  form is not rendered — "Aksi tidak tersedia" + back button instead.

### Part E — Shared concerns
- [lib/api-errors.ts](../../../../apps/tech-pwa/src/lib/api-errors.ts): `formatApiError`, trimmed
  to the codes reachable from read + escalate flows (`CALIBRATION_JOB_NOT_FOUND`,
  `CALIBRATION_JOB_IDENTITY_GATE_LOCKED`, `CALIBRATION_JOB_DEVICE_TYPE_UNRESOLVED`,
  `INVALID_CALIBRATION_JOB_IDENTITY_ESCALATION`, `INVALID_AKD_AKL_TRANSITION`), plus an
  `isOffline()` check for a friendly offline message. Identity-Correction-submit/decide and
  file-upload codes intentionally excluded (next task's scope).
- [lib/calibration/types.ts](../../../../apps/tech-pwa/src/lib/calibration/types.ts),
  `job-display.ts`, `identity-gate.ts`: local, trimmed mirrors of the API's job/correction shapes
  and of Portal's `isIdentityGateLocked` / `canEscalateIdentity` / `summarizeCorrectionChanges` —
  no cross-app import, per the scope lock.

## Changes beyond the original Stage 1 proposal

These were applied directly in the editor after the initial implementation pass (observed as
on-disk changes during this session, not authored by this report's implementation pass):

- **Account menu, not an inline bar.** The original pass relocated the old root page's sign-out /
  push-notification controls into an `AccountBar` rendered below the header. This was replaced
  with `components/layout/account-menu.tsx` — a hamburger button in the header's *left* slot that
  opens a dropdown (name/email, push status, sign-out). `AppHeader` and `Screen` gained a
  `leftSlot` prop to carry it. This fits the header's one-slot-per-side convention more cleanly
  than the inline bar did and is the recommended direction.
- **Sign-in / register redesign.** `sign-in/page.tsx` and the new `sign-in/register/page.tsx` were
  rebuilt on a shared `components/auth/auth-card.tsx` (centered card, company logo, radial-gradient
  canvas background matching Portal's auth chrome in the PWA's teal brand, show/hide password
  toggle). A new `sign-in/layout.tsx` provides the centered canvas wrapper. `public/logo.png` was
  added as the card's logo asset. **This is outside the task's original Part A–E scope** (the spec
  covers foundation + job list/detail/escalate only) and wasn't part of the Stage 1 proposal that
  was reviewed and approved — flagging it here so it gets the same review attention as the rest of
  this report, rather than passing silently under an unrelated approval.
- `sign-out-button.tsx` copy/sizing changed (`Keluar`, `min-h-11` tap target) to fit its new home
  inside the account-menu dropdown.

## Verification

- **Typecheck**: `pnpm --filter @medcal/tech-pwa run typecheck` → **pass**, 0 errors (re-run after
  the editor changes above; still clean).
- **Smoke test**: dev server on port 3004. `GET /` → `307` to `/jobs` (redirect works). `GET /jobs`
  → `200`, renders the `useRequireSession` "Memuat…" loading state with no runtime error (expected
  — the curl request carries no session cookie). Viewport meta tag confirmed
  (`maximum-scale=5, viewport-fit=cover`), `globals.css` and manifest/apple-touch-icon links present
  in the head.
- **Not verified (tooling gap)**: this environment has no browser-automation/screenshot tool, so the
  Stage 2 spec's visual checks — tap targets ≥44px measured on-screen, no horizontal scroll at
  360px, offline fallback rendering under simulated offline — were **not** performed automatically.
  Every new interactive element uses the `min-h-11`/`min-w-11` convention and `active:`/`focus-visible:`
  states (no `hover:`-only interaction), which satisfies the rule by construction, but an actual
  device-mode check (Chrome DevTools, 360px + 430px, Network → Offline) is still recommended before
  calling this production-ready.
- `apps/portal` and `apps/api` were not touched by this task (confirmed via `git status`) —
  `pnpm-lock.yaml` changed only because `sharp` was added as a devDependency.

## Files changed

```
M  apps/tech-pwa/package.json
M  apps/tech-pwa/src/app/firebase-messaging-sw.js/route.ts
M  apps/tech-pwa/src/app/globals.css
M  apps/tech-pwa/src/app/page.tsx
M  apps/tech-pwa/src/app/providers.tsx
M  apps/tech-pwa/src/app/sign-in/page.tsx
M  apps/tech-pwa/src/components/sign-out-button.tsx
M  apps/tech-pwa/src/lib/fcm/messaging.ts
M  pnpm-lock.yaml
?? apps/tech-pwa/public/icons/
?? apps/tech-pwa/public/logo.png
?? apps/tech-pwa/public/offline.html
?? apps/tech-pwa/scripts/generate-icons.mjs
?? apps/tech-pwa/src/app/jobs/                    (layout, page, use-jobs-query, jobs-ui,
                                                     [id]/, [id]/escalate/, [id]/corrections/)
?? apps/tech-pwa/src/app/sign-in/layout.tsx
?? apps/tech-pwa/src/app/sign-in/register/
?? apps/tech-pwa/src/components/auth/
?? apps/tech-pwa/src/components/feedback/
?? apps/tech-pwa/src/components/layout/
?? apps/tech-pwa/src/components/ui/
?? apps/tech-pwa/src/lib/api-errors.ts
?? apps/tech-pwa/src/lib/calibration/
```

## Explicitly out of scope (per the task's scope lock — not built)

- Identity Correction submit wizard (device search + multi-attribute form + two signature
  captures) — deliberately deferred to the next task.
- No changes to `apps/portal` or any `apps/api` endpoint.

## Suggested next steps

1. Manual mobile-viewport pass (Chrome DevTools device mode, 360px + 430px) across `/jobs`,
   `/jobs/[id]`, `/jobs/[id]/escalate`, `/jobs/[id]/corrections/[id]`, `/sign-in`, `/sign-in/register`.
2. Manual offline-fallback check (DevTools Network → Offline, reload).
3. Review the sign-in/register redesign against this report — it landed outside the reviewed Stage
   1 proposal and hasn't had the same explicit approval pass as Parts A–E.
4. Proceed to the Identity Correction submit wizard task once the above is confirmed.
