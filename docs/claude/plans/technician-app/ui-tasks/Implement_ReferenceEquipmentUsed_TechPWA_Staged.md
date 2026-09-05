# IMPLEMENT (STAGED) — Tech-PWA: Reference Equipment Used

## Mode
This task has TWO stages with a HARD STOP between them. Do NOT proceed past Stage 1 without
explicit user confirmation in this conversation.

**Scope lock:** this task builds the tech-pwa screens for viewing candidate reference equipment
(from the job's WorkOrder) and recording which units were used on a `CalibrationJob`. Do NOT
touch Portal (already complete, read-only). Do NOT modify the API — all three endpoints
already exist and are unmodified by this task:
- `GET /calibration-jobs/:id/reference-equipment-candidates`
- `GET /calibration-jobs/:id/reference-equipment-used`
- `PUT /calibration-jobs/:id/reference-equipment-used`

## Background — confirmed decisions (do not re-litigate)

1. Candidates come solely from the job's `WorkOrder`'s confirmed `WorkOrderEquipment` list — no
   free search. `apps/tech-pwa` currently has ZERO equipment awareness (confirmed by an earlier
   investigation) — this task introduces that concept to the app for the first time.
2. Recording is a full-set replace (`PUT`, not add/remove) — submitting the complete list of
   units used, every time.
3. Recording actors: **both** TECHNICIAN and TECHNICIAN_MANAGER can call the record endpoint
   (unlike Identity Correction decisions, which are Portal-only for TECHNICIAN_MANAGER). But
   the override capability (force-accepting an invalid/expired unit) is gated to
   TECHNICIAN_MANAGER only, checked inline by the API on a per-item basis within the same
   request.
4. Recording requires `job.startedAt` to be set (job must be IN_PROGRESS or later), and is
   locked once the job reaches `SUBMITTED`/`ACCEPTED_BY_QA`
   (`CALIBRATION_JOB_REFERENCE_EQUIPMENT_LOCKED`).
5. Mobile-first rules apply throughout (established foundation): single-column, ≥44px targets,
   no hover-dependent interaction, safe-area padding, no data loss on error.

## Step 0 (part of Stage 1) — Resolve the plain-TECHNICIAN-hits-an-invalid-unit question

This is a genuine open UX question, not something to silently decide:

A lone TECHNICIAN in the field may need to record a unit whose calibration has expired (or
isn't accepted-for-use) — but only TECHNICIAN_MANAGER can authorize an override, and a manager
is very unlikely to be physically on-site. The API has no separate "flag for later
manager review" state for this specific action (unlike Identity Correction's
`PENDING_REVIEW` — this endpoint is a synchronous accept-or-reject, no pending state exists in
the schema for reference-equipment overrides).

Investigate and propose how the UI should handle this for a plain TECHNICIAN:
- Option A: the technician simply cannot record that specific unit — they proceed with only
  the valid units in their replace-set, and the invalid one is left out (meaning: it's not
  recorded as used at all, even though it may have actually been used physically). Propose
  what happens operationally then — is an unrecorded-but-physically-used unit an acceptable
  gap for v1 (something to flag to the office out-of-band), or does this need a different
  handling?
- Option B: the UI clearly explains the unit is invalid and that only a TECHNICIAN_MANAGER can
  authorize its use, with guidance to contact one (e.g. "Hubungi manajer teknis untuk
  menyetujui penggunaan alat ini") rather than silently omitting it — the technician still
  can't submit it themselves, but at least understands why and what to do.
- Do NOT invent a client-side pending/draft state that doesn't exist in the API — whatever is
  proposed must work within the API's actual synchronous accept-or-reject shape.
- Present your recommendation clearly and flag it for explicit user confirmation — this affects
  a real operational gap, not just a UI copy choice.

## Stage 1 — Propose the design (no code yet)

1. Re-read the three endpoints' live request/response shapes (controller/service) — don't
   assume the shapes described in earlier task reports are still exactly current.
2. Re-read tech-pwa's existing job-detail screen and escalate screen as the structural
   reference (single-form vs multi-screen precedent already established there).
3. Propose the route: `/jobs/[id]/reference-equipment` (single screen, or split if the
   selection + review naturally needs two steps — propose based on how much fits comfortably
   on one mobile screen given the candidate list could have several items).
4. Propose the screen content:
   - List of candidate units (from `.../reference-equipment-candidates`), each as a
     selectable row: code, brand/model, equipment type, a validity indicator (per the
     candidate endpoint's `JobEquipmentValidityStatus` — reuse the existing values, don't
     invent new labels), and a checkbox/toggle to mark "used."
   - For an already-recorded set (job revisited), the screen should reflect current
     recorded state as the initial checkbox state (fetch `.../reference-equipment-used`
     first to pre-populate).
   - Handling for invalid units per Step 0's resolution — TECHNICIAN_MANAGER sees the option
     to check the box AND gets prompted for an override reason when doing so for an invalid
     unit; TECHNICIAN sees whatever Step 0 decided.
   - Submit button triggers the full-set `PUT` with the current checkbox state.
5. Propose error handling: extend the local `formatApiError` with
   `CALIBRATION_JOB_NOT_STARTED`, `CALIBRATION_JOB_REFERENCE_EQUIPMENT_LOCKED`,
   `EQUIPMENT_NOT_CONFIRMED_ON_WORK_ORDER`, `EQUIPMENT_INACTIVE`,
   `EQUIPMENT_TYPE_NOT_REQUIRED_FOR_DEVICE`, `EQUIPMENT_CALIBRATION_INVALID` (with its
   sub-status surfaced in the message, mirroring how the API reports it) — Bahasa Indonesia,
   matching the app's tone.
6. Propose where the entry point lives on the job-detail screen (a new action button, gated by
   `capabilities?.calibrationJobRecordReferenceEquipmentUsed` and the job-started/not-locked
   conditions from decision 4).
7. Propose new hooks/types needed and their file locations.
8. Present the full proposal (including Step 0's resolution) and STOP. Ask for explicit
   approval before Stage 2.

## Stage 2 — Implement (ONLY after explicit user approval)

1. Implement exactly what was approved.
2. Run `apps/tech-pwa` typecheck; report results.
3. Manually verify (describe steps): a technician can select valid units and submit
   successfully; a TECHNICIAN_MANAGER can override an invalid unit with a reason; the
   plain-TECHNICIAN invalid-unit case behaves per Step 0's approved resolution; revisiting the
   screen after a successful submit shows the previously-recorded state.
4. Confirm final `git status` — list exactly which files changed.

## Output / final message format

**After Stage 1:** present Step 0's resolution recommendation clearly flagged, plus the full
screen/route/error-handling proposal. End with an explicit request for approval to proceed to
Stage 2.

**After Stage 2 (only if reached):** confirm exactly which files changed, typecheck result, and
manual-verification notes.
