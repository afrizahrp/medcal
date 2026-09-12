# STAGE 2 — Real-Time Polling for tech-pwa (Job List & Job Detail) — Report

Date: 2026-09-06
Status: **Implemented. HARD STOP — not deployed.**

## Goal

Parity with Portal: Identity Correction / AKD-AKL status changes made in Portal surface on
tech-pwa within ~6 s, without the technician navigating away and back or pulling to refresh.

## Queries that got polling (`refetchInterval: 6000` + `refetchOnWindowFocus: true`)

| Screen | Hook | File |
|---|---|---|
| "Job Saya" list (customer → SPK → device cards, status badges) | `useJobsQuery` | `apps/tech-pwa/src/app/jobs/use-jobs-query.ts` |
| Job detail `/jobs/[id]` — job status, AKD/AKL badge | `useJobQuery(id, { poll: true })` | `apps/tech-pwa/src/app/jobs/[id]/page.tsx` |
| Job detail `/jobs/[id]` — "Koreksi Identitas (BA)" list | `useCorrectionsQuery(id, { poll: true })` | same |
| Identity Correction detail `/jobs/[id]/corrections/[correctionId]` — MENUNGGU REVIEW → DISETUJUI/DITOLAK | `useCorrectionQuery(jobId, correctionId, { poll: true })` | `apps/tech-pwa/src/app/jobs/[id]/corrections/[correctionId]/page.tsx` |
| Identity Correction detail — job header | `useJobQuery(jobId, { poll: true })` | same |

Values and pattern mirror `apps/portal`'s `use-calibration-jobs-query.ts` and
`use-identity-corrections-query.ts` (hard-coded `refetchInterval: 6000`, `refetchOnWindowFocus: true`).

## Wizard safety — opt-in, not global

`useJobQuery` / `useCorrectionsQuery` / `useCorrectionQuery` are **reused inside the 5-step
Identity Correction wizard** (`identity-correction/layout.tsx` holds `useJobQuery(id)`), so polling
is a per-call **opt-in** (`LiveQueryOptions { poll?: boolean }`) rather than baked into the hook:

- Wizard layout calls `useJobQuery(id)` with **no options → no polling** during steps 1–5.
- `escalate/page.tsx` and `reference-equipment/page.tsx` (other forms) likewise unchanged — no poll.
- React Query derives the refetch interval from the currently-mounted observers, so entering the
  wizard from the (polling) job-detail screen **stops** the `["job", id]` poll for the duration of
  the wizard; leaving it back to job detail resumes it.

## Battery / data (mobile PWA)

- `refetchIntervalInBackground` is **not set anywhere** in tech-pwa → stays at React Query's
  default `false`, so every poll pauses while the installed PWA is backgrounded. Confirmed via
  `grep -rn refetchIntervalInBackground apps/tech-pwa` → no matches.
- QueryClient defaults (`apps/tech-pwa/src/app/providers.tsx`): `staleTime: 15_000`,
  `refetchOnWindowFocus: false`. `refetchInterval` fires independently of `staleTime`; the
  per-query `refetchOnWindowFocus: true` override restores focus-refetch for these screens only.

## Flicker / dim-on-fetch

- Job detail and Identity Correction detail render only off `isPending` / `isError` — **no
  `isFetching` overlay**, so background polls are invisible there.
- The "Job Saya" list header had a refresh icon bound to `isFetching` (would spin every 6 s).
  Changed to spin only on a **user-initiated** reload (local `manualRefreshing` state around
  `refetch()`); the background poll is silent.
- React Query structural sharing means an unchanged poll response keeps the same data reference →
  **no re-render at all** unless a status actually changed.
- No `isPlaceholderData`-style guard needed (tech-pwa has no equivalent whole-view dimming pattern;
  the one hook using `placeholderData` search returned nothing).

## Files changed

```
apps/tech-pwa/src/app/jobs/use-jobs-query.ts                       (add refetchInterval: 6000)
apps/tech-pwa/src/app/jobs/[id]/use-job-query.ts                   (LiveQueryOptions opt-in on useJobQuery / useCorrectionsQuery / useCorrectionQuery)
apps/tech-pwa/src/app/jobs/[id]/page.tsx                           (pass { poll: true })
apps/tech-pwa/src/app/jobs/[id]/corrections/[correctionId]/page.tsx (pass { poll: true })
apps/tech-pwa/src/app/jobs/page.tsx                                (spin refresh icon only on manual reload)
```

## Verification

### Typecheck / tests

| | Result |
|---|---|
| `apps/tech-pwa` typecheck (`tsc --noEmit`) | **PASS** |
| `apps/tech-pwa` tests (`vitest run`) | **PASS** — 1 file, 3 tests |

No automated test added — tech-pwa's vitest is `environment: "node"`, `include: ["src/**/*.test.ts"]`
with no jsdom / React Query test harness; polling behaviour is manual-only.

### Manual verification — STILL TO DO (two devices / tabs, not runnable here)

| Scenario | Expected |
|---|---|
| tech-pwa "Job Saya" list open; approve/reject an Identity Correction from Portal | list card status badge updates within ~6 s, no navigation, no manual refresh |
| tech-pwa Identity Correction detail (`/jobs/[id]/corrections/[id]`) open; manager decides in Portal | "MENUNGGU REVIEW" → "DISETUJUI" / "DITOLAK" live within ~6 s |
| tech-pwa job detail open; AKD/AKL decision or correction made in Portal | job status / AKD-AKL badge / corrections list updates within ~6 s |
| Mid-wizard (steps 1–5), fill signatures/photo, wait > 6 s | no refetch/re-render disruption; form state intact (wizard's `useJobQuery` is not polling) |
| Background the PWA for a minute, foreground it | one refetch on focus; no polling while backgrounded |

## HARD STOP — not deployed.
