# IMPLEMENT (STAGED) — Portal UI: Reference Equipment Used (Read-Only)

## Mode
This task has TWO stages with a HARD STOP between them. Do NOT proceed past Stage 1 without
explicit user confirmation in this conversation.

**Scope lock:** this task adds a READ-ONLY section to the Portal's CalibrationJob detail page
showing which reference `Equipment` units were recorded as used, including validity/override
status. Do NOT add any write/record action in Portal — per the confirmed decision, recording is
a tech-pwa (technician-actor) capability only; Portal never gets a "record equipment" button.
Do NOT modify the API — both endpoints needed
(`GET /calibration-jobs/:id/reference-equipment-used`,
and optionally `.../reference-equipment-candidates` if useful for context) already exist and
are unmodified by this task.

## Background — what already exists to consume

- `GET /calibration-jobs/:id/reference-equipment-used` — returns the recorded units for a job:
  each with `equipment` (code/brand/model/serial/equipmentType), `equipmentCalibrationRecord`
  (or null), `validityOverridden`, `overrideReason`, `overriddenBy`/`overriddenAt` if
  applicable.
- The job detail page (`apps/portal/.../calibration-jobs/[id]/page.tsx`) already has an
  established section pattern (identity snapshot, assigned device, identity corrections, AKD/AKL
  approval) — this becomes one more `Section` in that same page.

## Stage 1 — Propose the design (no code yet)

1. Re-read the current job detail page's section list/layout and its query-hook file
   (`use-calibration-jobs-query.ts` or the identity-corrections one, whichever is the more
   recent convention) to confirm the exact pattern for adding a new read-only section backed by
   its own query hook.
2. Re-read the actual response shape of `GET /calibration-jobs/:id/reference-equipment-used`
   live from the controller/service (don't assume the shape from memory of the design
   proposal — confirm field names exactly).
3. Propose the new section's placement (recommend: after "Assigned Device" and before
   "Identity Corrections," or wherever fits the page's logical flow — propose and justify) and
   content:
   - Empty state: "Belum ada alat referensi yang dicatat untuk job ini." (or similar, matching
     existing tone).
   - Per-unit row: equipment code + brand/model, equipment type name, calibration validity
     status (badge: valid / expired / not accepted / no record — mirror however
     `JobEquipmentValidityStatus`'s values map to display), and — when `validityOverridden` is
     true — a visibly distinct indicator (e.g. an amber note) showing it was overridden, by
     whom, when, and the reason. This is compliance-sensitive data (an override is exactly the
     kind of thing a KAN auditor would want immediately visible, not buried) — propose a
     treatment that makes overridden entries stand out, not blend in with normally-valid ones.
4. Propose the badge/status color mapping for the validity statuses, consistent with existing
   conventions in this file (`AkdAklStatusBadge`, `IdentityCorrectionStatusBadge`).
5. Propose the query hook (new file or added to an existing one — state which, and why) and its
   error handling (loading/error states matching the page's existing pattern for other
   sections).
6. Present the proposal and STOP. Ask for explicit approval before Stage 2.

## Stage 2 — Implement (ONLY after explicit user approval)

1. Implement exactly what was approved.
2. Run `apps/portal` typecheck and any relevant existing test pattern for this page; report
   results.
3. Confirm final `git status` — list exactly which files changed.

## Output / final message format

**After Stage 1:** present the full proposal (placement, content, badge mapping, hook
placement). End with an explicit request for approval to proceed to Stage 2.

**After Stage 2 (only if reached):** confirm exactly which files changed, typecheck result, and
a short manual-verification note.
