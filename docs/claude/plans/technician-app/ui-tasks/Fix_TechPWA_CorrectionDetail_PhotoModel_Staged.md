# IMPLEMENT (STAGED, SMALL) — Tech-PWA: Fix Correction Detail to Read Correction-Level Photo

## Mode
This task has TWO stages with a HARD STOP between them. Do NOT proceed past Stage 1 without
explicit user confirmation in this conversation.

**Scope lock:** this task ONLY fixes
`apps/tech-pwa/src/app/jobs/[id]/corrections/[correctionId]/page.tsx` (and its immediate
supporting types/hooks in that same folder, e.g. `use-job-query.ts` if it types the shape) so it
reads the signature photo from the `IdentityCorrection` level instead of per-signature — mirroring
the fix already applied in Portal. Do NOT build the Identity Correction submit wizard in this
task (still the next task). Do NOT touch `apps/api` or `apps/portal` — both are already
correct.

## Background

The prior task corrected the signature-photo ownership model end-to-end in the backend and
Portal: one photo belongs to the `IdentityCorrection` (the BA record), not one per
`IdentityCorrectionSignature`. The tech-pwa correction detail page (built in an earlier task,
before this model correction existed) still reads/displays a photo per signature row, which will
now always be empty since the backend no longer returns per-signature files. This task brings
tech-pwa in line — no new feature, purely fixing a now-stale read pattern.

## Stage 1 — Propose the fix (no code yet)

1. Re-read `corrections/[correctionId]/page.tsx` and its data-fetching hook live: confirm
   exactly how it currently expects per-signature `files[]` and where the `SignatureImage`
   component is invoked per signer.
2. Re-read the corrected Portal implementation
   (`apps/portal/.../[id]/page.tsx`'s `CorrectionPhotoBlock` from the prior task) as the
   reference for the correct shape: one photo at the correction level, signer blocks show only
   status/name/reason (no per-signer image).
3. Propose the tech-pwa fix: move the single photo display to the correction-detail screen's
   top level (reusing the existing local `SignatureImage`/`apiFetchBlob` component already built
   in tech-pwa — don't duplicate it, just change what feeds it), and reduce each signer section
   to status/name/unavailableReason only, matching Portal's corrected layout logically (adapted
   to tech-pwa's single-column mobile style, not copy-pasted desktop markup).
4. Confirm the local type (`lib/calibration/types.ts`) that mirrors the correction shape —
   propose the exact field rename/move needed there.
5. Present the proposed diff and STOP. Ask for explicit approval before Stage 2.

## Stage 2 — Implement (ONLY after explicit user approval)

1. Apply the approved fix.
2. Run `apps/tech-pwa` typecheck; report results.
3. Confirm final `git status` — list exactly which files changed (should be small: the
   correction detail page, its local types, possibly the query hook).

## Output / final message format

**After Stage 1:** present the proposed diff. End with an explicit request for approval to
proceed to Stage 2.

**After Stage 2 (only if reached):** confirm exactly which files changed and the typecheck
result. Confirm tech-pwa's correction detail view is now consistent with the corrected
per-BA photo model, ready for the submit wizard task to build on.
