# IMPLEMENT (STAGED) — Tech-PWA: Identity Correction Submit Wizard

## Mode
This task has TWO stages with a HARD STOP between them. Do NOT proceed past Stage 1 without
explicit user confirmation in this conversation.

**Scope lock:** this task builds the Identity Correction SUBMIT flow only
(`/jobs/[id]/identity-correction/*`) in `apps/tech-pwa`. Do NOT build any
approve/reject/decision UI — TECHNICIAN_MANAGER decisions happen in Portal only, never in this
app (confirmed decision, do not re-litigate). Do NOT touch `apps/portal` or any API endpoint —
both are complete. Do NOT touch the already-built job list/detail/escalate screens except to
wire the existing disabled "Ajukan Koreksi Identitas" button (built in a prior task) to
actually navigate into this new flow instead of staying disabled.

## Background — critical model correction, apply from the start (do not repeat a past mistake)

A prior version of this feature (built first in Portal, now fixed) incorrectly modeled the
signature photo as one-per-signer (two separate uploads, one for TECHNICIAN, one for CUSTOMER).
**This was wrong and has been corrected end-to-end in the backend and Portal.** The confirmed
reality: both signatures are physically on ONE sheet of paper (the BA document), photographed
ONCE. Build this wizard correctly from the start:

- `IdentityCorrectionSignature` rows remain two per correction (TECHNICIAN, CUSTOMER) — each
  independently records `status` (SIGNED/UNAVAILABLE/REFUSED), `signerName`,
  `unavailableReason`. This part is normal and unchanged.
- The **photo** belongs to the `IdentityCorrection` (the BA record) as a whole — ONE photo,
  uploaded via `POST /files` with `ownerType: "IDENTITY_CORRECTION", ownerId: correction.id`
  (NOT a signature id). There is no per-signer photo field anywhere in this flow.
- If you find yourself designing two photo-capture steps or two file inputs, stop — that
  contradicts the confirmed model and must not be built.

## Background — confirmed decisions from prior investigation/discussion (do not re-litigate)

1. Signature capture on mobile = camera photo (`<input type="file" accept="image/*"
   capture="environment">`), not a drawing canvas — no signature-pad library exists in the
   monorepo and none should be added for this.
2. Backend contract (complete, unmodified):
   - `POST /calibration-jobs/:id/identity-corrections` — body `{ reason, newDeviceId?,
     newSerial?, newAkdAkl?, signatures: { TECHNICIAN: {status, signerName?,
     unavailableReason?}, CUSTOMER: {status, signerName?, unavailableReason?} } }` → creates
     correction (`PENDING_REVIEW`) + 2 signature rows. Minimum one of `newDeviceId`/`newSerial`/
     `newAkdAkl` required (validated server-side against current job values — `IDENTITY_CORRECTION_NO_CHANGE`
     if nothing actually differs).
   - `POST /files` — ONE call after submit succeeds: `{ ownerType: "IDENTITY_CORRECTION",
     ownerId: correction.id, file }`.
   - `GET /calibration-jobs/:id/device-candidates?search=` for the device-search step.
3. Mobile-first rules from the foundation task apply throughout: single-column, ≥44px tap
   targets, no hover-dependent interaction, `env(safe-area-inset-*)`, 16px input font, no form
   data loss on error (retry without re-entering everything).
4. Offline: no special handling beyond the app-wide rules already established (explicit
   loading/error/retry states; don't lose filled form state on a failed submit).
5. One BA can correct multiple attributes together (device/serial/AKD-AKL) — the toggle UI
   from Portal's dialog is the reference for *what* fields exist, not for *how* to lay them out
   (this wizard uses one-concern-per-screen, not Portal's dense multi-section dialog).
6. Device name is NOT a correctable attribute (handled by the separate Device Name Alias
   system) — do not add a "correct device name" step.

## Stage 1 — Propose the design (no code yet)

1. Re-read the already-built job detail screen
   (`apps/tech-pwa/src/app/jobs/[id]/job-detail-ui.tsx`) to confirm the exact current shape of
   the disabled "Ajukan Koreksi Identitas" button and its guard conditions
   (`capabilities?.calibrationJobSubmitIdentityCorrection`, gate-open check) — propose how it
   becomes an enabled link into the new wizard route.
2. Re-read Portal's corrected submit dialog
   (`apps/portal/.../[id]/page.tsx`'s `SubmitCorrectionDialog` + `CorrectionPhotoBlock`, post-fix)
   as the reference for exact field shapes and validation — not for layout, which must be
   rebuilt as a mobile wizard per decision 5 above.
3. Propose the exact screen/route breakdown under `/jobs/[id]/identity-correction/`:
   - Propose whether this is multiple actual routes (each a `page.tsx`, back-button
     navigable, matching the app's established push-stack pattern) or a single route with
     internal step state — recommend routes (consistent with how `escalate` was already built
     as its own route) unless you find a strong reason for internal state, and justify.
   - **Screen 1 — Reason + attributes**: `reason` textarea (required), three toggles
     (Device/Serial/AKD-AKL) each revealing its input when enabled. Device toggle uses the
     existing device-candidates search pattern (reuse/adapt, don't duplicate, the search UI
     logic already built for escalate/job-detail if any exists, or build fresh matching that
     visual style). At least one toggle must be enabled to proceed.
   - **Screen 2 — Technician signature status**: status selector (Signed/Unavailable/Refused),
     conditional name or reason field.
   - **Screen 3 — Customer signature status**: same shape as Screen 2, for CUSTOMER.
   - **Screen 4 — Photo capture**: ONE camera/file input (`capture="environment"`), with a
     preview thumbnail after selection, and a retake option. Propose whether this screen
     requires a photo before proceeding (recommend: yes if at least one signer is SIGNED,
     matching the backend's eventual approve-time requirement, so the technician isn't let
     through a flow that will fail decision later without evidence — but the photo can still be
     deferred if you find a good reason technicians might need to submit and add the photo
     later; state your recommendation clearly either way).
   - **Screen 5 — Review + submit**: summarize reason, changed attributes (before→after,
     reusing the job's current values already in hand from the job-detail query), both
     signature statuses, photo thumbnail. Submit button triggers the two-call sequence
     (submit JSON → upload photo).
4. Propose state management across screens: a single wizard-level state object (not per-screen
   isolated state) so Review (Screen 5) can display everything and Back navigation doesn't lose
   data — propose exactly how this is held (React state lifted to a layout/parent, URL params,
   or a lightweight context) given the multi-route decision from point 3.
5. Propose the submit mutation flow: call the submit endpoint; on success, immediately attempt
   the single photo upload (if one was captured) with `ownerId = correction.id`; on photo
   upload failure, still treat the BA as successfully created (mirror Portal's non-blocking
   recovery pattern) and navigate to job detail with a clear message that the photo needs to be
   added — propose exactly how the technician can retry the photo upload afterward (a minimal
   affordance on the job detail's correction list/detail, reusing what's already read-only
   there from the prior correction-detail-photo-fix task, or propose adding upload capability
   there now — state your recommendation).
6. Propose error handling: extend the app's local `formatApiError` with the identity-correction
   submit codes (`IDENTITY_CORRECTION_NO_CHANGE`, `IDENTITY_CORRECTION_ALREADY_PENDING`,
   `DEVICE_NOT_FOUND`, `DEVICE_CUSTOMER_MISMATCH`, `DEVICE_TYPE_MISMATCH`,
   `INVALID_CALIBRATION_JOB_IDENTITY_SUBMIT` or equivalent, plus file-upload codes
   `FILE_MIME_NOT_ALLOWED`/`FILE_TOO_LARGE`/etc.) — Bahasa Indonesia messages matching the
   app's established tone.
7. Propose the file/folder layout for the new route tree + any new hooks/types needed.
8. Present the full proposal and STOP. Ask for explicit approval before Stage 2.

## Stage 2 — Implement (ONLY after explicit user approval)

1. Implement exactly what was approved.
2. Wire the job-detail screen's "Ajukan Koreksi Identitas" button to navigate into the wizard
   (removing its disabled state and placeholder copy).
3. Run `apps/tech-pwa` typecheck; report results.
4. Manually verify (describe steps, since no browser-automation tool exists in this
   environment): the 5-screen flow preserves state across back/forward navigation, the photo
   step correctly sends ONE upload with `ownerId = correction.id` (not a signature id — call
   this out explicitly as verified, given it's the exact mistake being avoided), and mobile-first
   rules are followed by construction (≥44px targets, single column, no hover-dependent
   interaction).
5. Confirm final `git status` — list exactly which files changed.

## Output / final message format

**After Stage 1:** present the full proposal (screens, state management, submit sequencing,
error handling, file layout). End with an explicit request for approval to proceed to Stage 2.

**After Stage 2 (only if reached):** confirm exactly which files changed, typecheck result, and
manual-verification notes — explicitly confirming the single-photo-per-BA model was followed
correctly throughout.
