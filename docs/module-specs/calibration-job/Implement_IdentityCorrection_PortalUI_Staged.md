# IMPLEMENT (STAGED) — Portal UI: Identity Correction (BA) Workflow

## Mode
This task has TWO stages with a HARD STOP between them. Do NOT proceed past Stage 1 without
explicit user confirmation in this conversation.

**Scope lock:** this task builds Portal (`apps/portal`) UI consuming the already-complete
Identity Correction backend (submit, signature image upload, list/detail, decision). Do NOT
build tech-pwa UI (separate, next task after this one, only after user confirms this is done).
Do NOT add or modify any API endpoint — the backend is complete. Do NOT touch AKD/AKL
escalation UI (separate section, already working) except where the AKD/AKL approval status
display needs to reflect a correction-triggered gate reopen (read-only, no new logic).

## Background — what already exists to reuse/replace

- **Dead code to replace:** `apps/portal/src/app/management/calibration-jobs/[id]/page.tsx`
  currently has an `AssignDeviceDialog` wired to `useAssignDevice()` /
  `POST /calibration-jobs/:id/assign-device`, which now returns `410 GONE
  ASSIGN_DEVICE_ENDPOINT_REMOVED`. `capabilities.calibrationJobAssignDevice` is now always
  `false` (deprecated flag), so the button is likely already hidden — confirm this, and then
  remove the dead dialog/hook entirely (don't leave unreachable dead code).
- **Reuse:** the existing detail-page conventions from the `calibration-jobs` folder (identity
  snapshot section, AKD/AKL approval section with its escalate/approve/reject dialogs) as the
  direct structural template for the new correction section — same page, same visual language.
- **Backend contract (complete, do not modify):**
  - `POST /calibration-jobs/:id/identity-corrections` — submit BA (reason, newDeviceId?,
    newSerial?, newAkdAkl?, signatures: `{TECHNICIAN, CUSTOMER}` each
    `{status, signerName?, unavailableReason?}`) → returns correction + job,
    `number = BAI/YYYY/MM/NNNNN`.
  - `POST /files` ×N — upload each signer's signature image
    (`ownerType: "IDENTITY_CORRECTION", ownerId: <signature.id>`), called after submit.
  - `GET /calibration-jobs/:id/identity-corrections` — list (each signature carries `files[]`).
  - `GET /calibration-jobs/:id/identity-corrections/:correctionId` — detail.
  - `POST /calibration-jobs/:id/identity-corrections/:correctionId/decision` — APPROVE/REJECT
    (TECHNICIAN_MANAGER), rejects with `IDENTITY_CORRECTION_SIGNATURE_IMAGE_MISSING` if a
    SIGNED signer has no image.
  - `GET /calibration-jobs/:id/device-candidates` — unchanged, RBAC now under
    `submitIdentityCorrection`.
  - Capability flags: `calibrationJobSubmitIdentityCorrection`,
    `calibrationJobDecideIdentityCorrection` (already added to `MeCapabilities`/`me.controller.ts`
    in the backend task — confirm these are populated correctly by re-checking, don't assume).

## Stage 1 — Investigate conventions, then propose the design (no code yet)

### Part A — Verify current state

1. Re-read the current `[id]/page.tsx` in full: exact shape of the dead
   `AssignDeviceDialog`/`useAssignDevice`, and how the AKD/AKL escalate/approve/reject dialogs
   are structured (props, mutation hooks, error handling) — this is the direct template.
2. Confirm how the Portal currently handles **multi-step submission with file upload following
   a create call** anywhere else in the codebase (search for any existing flow: create record →
   then upload attachment(s) referencing the new record's id). If a precedent exists, cite and
   mirror it. If none exists, propose the sequencing from scratch, grounded in the two-request
   nature of the backend (`submit` then `N × POST /files`).
3. Confirm how the Portal currently renders an uploaded image for review (any existing
   signature/photo/evidence viewer component) — reuse if found, propose a minimal one if not.
4. Confirm `capabilities.calibrationJobSubmitIdentityCorrection` /
   `...DecideIdentityCorrection` are actually wired end-to-end (Portal's `useAuthz()` /
   `AuthProvider` picks up the new flags) — a quick trace, not a deep audit.

### Part B — Propose the design

1. **Remove dead code:** exact list of what gets deleted (`AssignDeviceDialog`,
   `useAssignDevice`, related types/imports).
2. **New section on the job detail page: "Identity Corrections" (BA list).** Propose: a
   sub-list showing each correction's `number`, status badge, prev→new value summary, signer
   statuses (with a small icon/badge distinguishing SIGNED/UNAVAILABLE/REFUSED), submit
   date. This replaces the old single "Assigned Device" section's action area — propose
   whether the existing "Assigned Device" read-only display stays as-is (still shows current
   `job.deviceId` etc.) with the BA list added below it, or is merged — your call, propose one.
3. **Submit BA dialog/flow** (gated on `calibrationJobSubmitIdentityCorrection`, shown whenever
   the identity gate is open — reuse `isIdentityGateLocked` from `calibration-job-utils.ts`):
   - Step 1: reason (textarea) + which attribute(s) to correct (checkboxes/toggles for
     device/serial/AKD-AKL, each revealing its input when enabled — device via the existing
     device-candidates search, matching the old assign-device search UX minus the "register
     new" capability which stays removed per the earlier policy correction).
   - Step 2: two signature blocks (TECHNICIAN, CUSTOMER), each: status selector
     (Signed/Unavailable/Refused), conditionally signer name OR unavailable reason, and —
     propose exactly how the signature IMAGE is captured in this dialog. Options to consider:
     a plain file-picker (simplest, matches desktop/Portal context — signatures likely
     scanned/photographed on a phone and uploaded from a file, not drawn on a desktop
     trackpad), vs. a canvas signature pad (more work, more mobile-appropriate — flag this as
     probably belonging in the tech-pwa task instead, since Portal is desktop/office context
     per this project's established usage pattern — propose file-picker here, defer
     draw-to-sign to the tech-pwa task).
   - Submit flow: call the submit endpoint first; on success, sequentially (or in parallel —
     propose which, considering error handling if one upload fails) upload each provided
     signature image via `POST /files`; show a clear success state with the new BA number even
     if an image upload subsequently fails (propose how a failed image upload is surfaced/
     retried — this shouldn't strand the user with a half-complete BA and no way to add the
     missing image after the fact — check if there's a way to re-open a PENDING_REVIEW
     correction's file upload from the detail view, since the backend allows uploading to an
     existing signature row at any time before decision).
4. **Correction detail view:** number, status, reason, prev→new fields (clear before/after
   presentation), both signatures with their images (or unavailable reason), decided-by/at/note
   if decided.
5. **Decide (approve/reject) UI** (gated on `calibrationJobDecideIdentityCorrection`, shown
   when a correction is `PENDING_REVIEW`): Approve/Reject buttons mirroring the AKD/AKL
   decision dialog pattern exactly (reject requires note). Surface
   `IDENTITY_CORRECTION_SIGNATURE_IMAGE_MISSING` clearly if approve is blocked by a missing
   image (tell the user which signer's image is missing, don't just show a generic error).
6. **Error handling:** extend `formatCalibrationJobApiError` (or the equivalent utility) with
   the new error codes: `IDENTITY_CORRECTION_NO_CHANGE`, `IDENTITY_CORRECTION_ALREADY_PENDING`,
   `IDENTITY_CORRECTION_ALREADY_DECIDED`, `IDENTITY_CORRECTION_SIGNATURE_IMAGE_MISSING`,
   `ASSIGN_DEVICE_ENDPOINT_REMOVED` (shouldn't be reachable post-cleanup, but map it defensively
   in case of a stale client). Propose Bahasa Indonesia messages matching the project's
   established tone.
7. Present the full Part A findings + Part B proposal and STOP. Do not write any code. Ask for
   explicit approval before Stage 2.

## Stage 2 — Implement (ONLY after explicit user approval)

1. Remove the dead `AssignDeviceDialog`/`useAssignDevice` code.
2. Implement the approved BA list, submit flow (with sequenced file upload), detail view, and
   decide UI.
3. Add/extend query hooks (`use-calibration-jobs-query.ts` or a new
   `use-identity-corrections-query.ts` — propose which in Stage 1 if not already decided) for
   the 4 new endpoints + file upload.
4. Run `apps/portal` typecheck and any existing test pattern for this folder; report results.
5. Confirm final `git status` — list exactly which files changed.

## Output / final message format

**After Stage 1:** present Part A findings and the full Part B proposal, including your
recommendation on the signature-capture UX (file-picker vs. defer-to-tech-pwa) and the
failed-upload recovery approach. End with an explicit request for approval to proceed to
Stage 2.

**After Stage 2 (only if reached):** confirm exactly which files changed, typecheck result, and
a short manual-verification note (how to submit a BA and see it through to approval in the
Portal).
