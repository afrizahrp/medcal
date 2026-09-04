# IMPLEMENT (STAGED) — Tech-PWA: Foundation + Job List + Job Detail + Escalate

## Mode
This task has TWO stages with a HARD STOP between them. Do NOT proceed past Stage 1 without
explicit user confirmation in this conversation.

**Scope lock:** this task builds the tech-pwa foundation (viewport/manifest fix, mobile-first
tokens, navigation shell) plus three screens: job list (`/jobs`), job detail (`/jobs/[id]`,
read-only sections + correction list), and the AKD/AKL escalate screen. Do NOT build the
Identity Correction submit wizard (device search + multi-attribute form + two signature
captures) in this task — that is the next task, deliberately separated because it's the most
complex piece (camera capture, multi-step state) and deserves its own checkpoint. Do NOT touch
`apps/portal` or any API endpoint — both are complete and unmodified by this task.

## Background — confirmed decisions (do not re-litigate)

From `investigation-tech-pwa-design.md` + user confirmation, all 6 open questions:

1. `GET /calibration-jobs?assignedToMe=true` is live (prior task) — the job list's data source.
2. TECHNICIAN_MANAGER does NOT use this PWA in v1 — no decision/approval screens here, ever
   (Portal-only for those). Every screen in this task is TECHNICIAN-facing only.
3. Signature capture = camera/photo file input (`capture="environment"`), no drawing canvas —
   relevant for the NEXT task, not this one, but keep it in mind for consistency if any shared
   upload component is built here.
4. Offline v1: (a) no form-data loss on failed submit + retry, (b) explicit loading/error/retry
   states everywhere, (c) image compression (relevant to next task), (d) INCLUDE a minimal
   app-shell service worker so the installed app opens offline with a friendly message — full
   data caching/offline mutations remain deferred.
5. Manifest icons: generate placeholders from `short-logo.png` now (don't block on final
   design assets).
6. Navigation: pure push-stack, no tab bar (only one section exists).

**Mobile-first is a hard constraint, not a preference — enforce every rule below strictly:**
- Design and build for ~360–430px width first. Larger viewports are a bonus via `sm:`/`md:`
  enhancement only — never use a breakpoint prefix to undo/override a mobile default.
- Minimum tap target: 44×44px on every interactive element (buttons, list rows, inputs).
- No hover-dependent interaction anywhere (no hover-to-reveal, no hover-only tooltips).
- Single-column layouts throughout; no sidebar, no multi-column grids that assume desktop
  width.
- `viewport` meta: `width: "device-width", initialScale: 1, maximumScale: 5, viewportFit:
  "cover"` (allow pinch-zoom for accessibility — do not disable it).
- `env(safe-area-inset-*)` padding on any sticky header/footer.

## Stage 1 — Propose the design (no code yet)

### Part A — Foundation

1. Propose the exact `viewport` export replacement in `layout.tsx` per the rule above.
2. Propose the manifest fix: generate 192px + 512px (+ maskable) icons and an
   `apple-touch-icon` from `short-logo.png` (check where that asset currently lives in the
   repo; if it doesn't exist or isn't suitable, say so and propose an alternative rather than
   inventing a path).
3. Propose the minimal app-shell service worker (decision 4d): what it precaches (the shell
   route, not data), and the offline fallback UX (a simple "Anda sedang offline" screen) —
   keep this minimal, don't build a full Workbox/next-pwa setup unless you find it's already a
   trivial add given the Next version in use; state your reasoning either way.
4. Propose the mobile-first Tailwind token additions (a small brand scale around the existing
   `#0f766e` teal, a `min-h-11`/`min-w-11` convention for tap targets, `text-base` default on
   inputs to prevent iOS auto-zoom-on-focus).
5. Propose the navigation shell: a persistent sticky header (back button when not on root,
   screen title, safe-area padding) — no bottom tab bar per decision 6. Propose where shared
   layout primitives live (a `components/` folder structure).

### Part B — Job List (`/jobs`)

1. Propose the query hook (`use-jobs-query.ts` or similar) calling
   `GET /calibration-jobs?assignedToMe=true`, with the same pagination the API returns —
   propose whether v1 needs pagination UI at all (a technician's assigned-job count is likely
   small; consider a simple "load more" or just a larger page size with no pagination UI, and
   justify your choice) or must support it properly.
2. Propose the job card content: unit label ("Unit X of N"), declared device name, WO number,
   job status badge, AKD/AKL approval status badge — reuse/mirror Portal's badge color
   conventions where sensible but rebuild the component locally (no cross-app import).
3. Propose empty state ("no jobs assigned"), loading state, and error+retry state explicitly —
   per decision 4b, these are mandatory, not optional polish.
4. Propose pull-to-refresh or a simple manual refresh button — state which, and why, given
   what's feasible without adding a new dependency.

### Part C — Job Detail (`/jobs/[id]`)

1. Propose the read-only sections: identity snapshot (declared name/AKD-AKL, technician
   observed serial/AKD-AKL), current assigned device (or "not yet identified" per Portal's
   existing copy), AKD/AKL approval status + decider/note, and a list of existing identity
   corrections (number, status badge, date — tappable to a simple inline expand or a
   sub-route `/jobs/[id]/corrections/[correctionId]`, propose which fits the single-column
   mobile layout better).
2. Propose the action bar: "Escalate AKD/AKL" button (gated on
   `capabilities.calibrationJobEscalateIdentity` and the identity gate being open — reuse the
   same `isIdentityGateLocked` logic conceptually, rebuilt locally) and a **disabled-with-explanation**
   "Ajukan Koreksi Identitas" button that's visibly present but not wired yet (since the
   wizard is the next task) — propose the exact copy explaining it's coming, so the screen
   isn't misleadingly incomplete-looking; alternatively, propose omitting the button entirely
   until the next task lands — state your recommendation.

### Part D — Escalate screen (`/jobs/[id]/escalate`)

1. Propose this as a single simple form (not a wizard, per the investigation's "single form"
   recommendation): optional `technicianObservedAkdAkl` input, optional `reason` textarea,
   submit button. Propose the success/error flow (navigate back to job detail on success,
   inline error banner on failure, using the mandatory error-state rule from decision 4b).

### Part E — Shared concerns

1. Propose the error-message mapping approach for this app (mirror Portal's
   `formatCalibrationJobApiError` pattern, rebuilt locally with the same error codes relevant
   to read/escalate flows — don't include Identity-Correction-specific codes yet, that's next
   task).
2. Propose the file/folder layout for the whole `apps/tech-pwa/src/app/jobs/` tree.
3. Present the full Part A–E proposal and STOP. Do not write any code. Ask for explicit
   approval before Stage 2.

## Stage 2 — Implement (ONLY after explicit user approval)

1. Implement exactly what was approved.
2. Manually verify (describe how, since this is a visual/mobile app — screenshot at a mobile
   viewport width if your tooling supports it, or describe exact manual steps) that: touch
   targets are visibly ≥44px, no layout requires horizontal scrolling at 360px width, and the
   offline fallback screen appears when the network is simulated offline (if feasible to test).
3. Run `apps/tech-pwa` typecheck; report results.
4. Do NOT touch `apps/portal` or any API file.
5. Confirm final `git status` — list exactly which files changed.

## Output / final message format

**After Stage 1:** present the full Part A–E proposal. End with an explicit request for
approval to proceed to Stage 2.

**After Stage 2 (only if reached):** confirm exactly which files changed, typecheck result, and
a manual-verification note including how mobile-first compliance was checked.
