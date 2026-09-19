# STAGE 2 — Confirm Dialog on Physical Back Press During Identity Correction Wizard — Report

Date: 2026-09-06
Status: **Implemented. HARD STOP — not deployed.**

## Problem

The earlier `router.replace`-per-step fix removed the multi-press-to-exit bug, but the phone's
physical / OS Back button (and the iOS edge-swipe) now fires the browser's native `popstate` and
drops the whole wizard — reason, signatures, photo — on one accidental press. The in-app header
back arrow (`onBack` → `router.replace`) already steps back one step correctly and must keep doing so.

## Solution

All logic lives in the shared wizard layout
`apps/tech-pwa/src/app/jobs/[id]/identity-correction/layout.tsx` (mounted once, kept alive across
all 5 step routes by the App Router).

### 1. `popstate` guard (steps 1–5, before submission)
- On mount (once `guardArmed`), push a same-URL history entry so the first Back press is caught
  here instead of navigating.
- `popstate` handler: immediately `history.pushState(null, "", <current step URL>)` to neutralise
  the navigation (page does not move), then open a confirm dialog.
  - **"Batal"** → close dialog, user stays on the exact step, data intact.
  - **"Ya, keluar"** → `router.replace(/jobs/<id>)` — the job detail, i.e. the same destination the
    layout's existing "Aksi tidak tersedia" fallback uses.
- The re-push targets the *current step's* URL (tracked via a ref), so there is no visible flash to
  a previous step.
- Listener is removed on unmount — which is exactly what a successful submission causes
  (`review` → `router.replace(/jobs/<id>/corrections/<cid>)` leaves this layout). No guard on the
  correction-detail screen.

### 2. Stale / non-deliberate entry bounce
Because the wizard step routes stay in the browser history after submission, a physical Back press
from the correction-detail screen would otherwise re-enter a half-initialised wizard. New one-shot
intent signal (`identity-correction/wizard-nav.ts`):
- `jobs/[id]/page.tsx` — the "Ajukan Koreksi Identitas" button calls `markWizardEntryIntent(id)`
  right before `router.replace` into the wizard.
- The layout consumes it once on mount (ref-guarded against StrictMode double-invoke). Any entry
  **without** the intent — physical Back into a stale wizard URL after submit, a mid-wizard
  refresh, a deep link — is bounced with `router.replace("/jobs")` (Job Saya home) and the
  `popstate` guard is never armed.
- Net effect: after a successful submission, physical Back from correction-detail lands on
  **Job Saya in one press**, no dialog — matching the previously-fixed behaviour.

### Header back arrow — unaffected
`onBack` uses `router.replace`, which does not emit `popstate`, so it never reaches the guard and
continues to step back one wizard step.

## Files changed

```
apps/tech-pwa/src/app/jobs/[id]/identity-correction/layout.tsx     (popstate guard + stale-entry bounce + ExitConfirmDialog)
apps/tech-pwa/src/app/jobs/[id]/identity-correction/wizard-nav.ts  (new — one-shot entry-intent signal)
apps/tech-pwa/src/app/jobs/[id]/page.tsx                           (mark intent before entering the wizard)
```

## Verification

### Typecheck / tests

| | Result |
|---|---|
| `apps/tech-pwa` typecheck (`tsc --noEmit`) | **PASS** |
| `apps/tech-pwa` tests (`vitest run`) | **PASS** — 1 file, 3 tests |
| `apps/portal`, `apps/api` | unchanged by this task; still **PASS** (cached green) |

No automated test added: tech-pwa's vitest config is `environment: "node"`, `include: ["src/**/*.test.ts"]`
with no jsdom / testing-library, so a `popstate` + router DOM test would need new test
infrastructure (out of scope). All scenarios below are manual.

### Manual verification — STILL TO DO (device / browser, not runnable here)

| Scenario | Expected |
|---|---|
| Mid-wizard (step 1–4, ideally after signatures filled), press physical / OS Back | Confirm dialog appears; page does not move; **"Batal"** → same step, all data still present |
| Same, then **"Ya, keluar"** | Lands on job detail (→ one more Back reaches Job Saya); wizard data discarded |
| After successful submission, on correction-detail screen, press physical Back | Exits to **Job Saya in one press**, no dialog |
| In-app header back arrow, any step | Steps back one wizard step, data intact, **no dialog** |
| Refresh (F5) mid-wizard | Bounced to Job Saya (wizard state is lost on refresh regardless) |

## HARD STOP — not deployed.
