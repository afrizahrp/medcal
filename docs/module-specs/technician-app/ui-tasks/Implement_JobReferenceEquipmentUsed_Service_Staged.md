# IMPLEMENT (STAGED) — JobReferenceEquipmentUsed: Service/API Layer

## Mode
This task has TWO stages with a HARD STOP between them. Do NOT proceed past Stage 1 without
explicit user confirmation in this conversation.

**Scope lock:** this task builds the API surface (service/controller additions on the existing
`calibration-jobs` module) for recording which `Equipment` units were used on a
`CalibrationJob`, including validity checking and the TECHNICIAN_MANAGER override path. Do NOT
build Portal or tech-pwa UI in this task (separate follow-up tasks). Do NOT modify the schema —
it's already complete (`equipmentId`, `equipmentCalibrationRecordId`, override fields all exist
from the prior migration). Do NOT modify `WorkOrderEquipment`'s existing
service/controller/validation logic — reuse/call it, don't change its behavior.

## Background — confirmed decisions (do not re-litigate)

From `investigation-job-reference-equipment-linking.md` + user confirmation, all 6 points:

1. Many-to-many: a job may use several `Equipment` units. Full-set-replace endpoint pattern
   (mirroring `WorkOrderEquipment`'s `PUT :id/equipment`), not add/remove.
2. Candidate source: units already on the job's `WorkOrder`'s `WorkOrderEquipment` list —
   NOT a fresh search across all company `Equipment`. A job cannot use equipment that wasn't
   confirmed onto its WorkOrder.
3. Validity check: `EquipmentCalibrationRecord.status === "CONFIRMED"` AND
   `acceptedForUse === true` AND `asOf` (= `CalibrationJob.startedAt`) within
   `[validFrom, validUntil]`. This closes the gap the investigation found in the existing
   `resolveCalibrationValidity` (which today ignores `acceptedForUse`) — for THIS feature's
   validity check, implement the full three-condition version; do not modify the shared
   `resolveCalibrationValidity` utility itself unless you find it's cleanly extensible to take
   an `requireAcceptedForUse` flag without affecting `WorkOrderEquipment`'s existing (looser)
   behavior — propose this explicitly, don't silently change shared behavior.
4. Recording is disallowed before `CalibrationJob.startedAt` is set (job must be `IN_PROGRESS`
   or later).
5. An invalid/expired/not-accepted unit is a hard block (`BadRequestException`), UNLESS a
   TECHNICIAN_MANAGER override is supplied (force-accept + mandatory reason), which populates
   `validityOverridden`/`overrideReason`/`overriddenByUserId`/`overriddenAt`.
6. Portal: read-only display only, no write/approval action needed here (no regulatory gate
   analogous to AKD/AKL). Tech-pwa: the recording actor (TECHNICIAN + TECHNICIAN_MANAGER,
   mirroring `submitIdentityCorrection`'s grant pattern).

## Stage 1 — Propose the design (no code yet)

1. Re-read `WorkOrderEquipment`'s controller/service (`replaceEquipment`,
   `validateEquipmentSelection`, `resolveRequiredEquipmentTypes`,
   `resolveCalibrationValidity`) live — confirm exact signatures, error codes
   (`EQUIPMENT_NOT_FOUND`, `EQUIPMENT_INACTIVE`, `EQUIPMENT_TYPE_MISMATCH`,
   whatever the validity-failure code is today) to reuse/mirror consistently.
2. Propose the endpoint: `PUT /calibration-jobs/:id/reference-equipment-used`, body
   `{ items: [{ equipmentId: string, override?: { reason: string } }] }` (full-set replace —
   omitting a previously-recorded unit removes it; propose whether removal after job reaches a
   later status, e.g. `SUBMITTED`, should be blocked — likely yes, mirroring the identity gate
   lock pattern already used elsewhere on this job; propose the exact status boundary).
3. Propose validation sequence per submitted `equipmentId`:
   - Exists + company-scoped (`EQUIPMENT_NOT_FOUND`).
   - Is present on `job.workOrder`'s `WorkOrderEquipment` list (new check specific to this
     feature — propose the exact error code, e.g.
     `EQUIPMENT_NOT_CONFIRMED_ON_WORK_ORDER`).
   - `Equipment.isActive` (`EQUIPMENT_INACTIVE`).
   - Optionally, type matches one of the job's required `EquipmentType`s (resolved via the
     job's DeviceType, mirroring `resolveJobDeviceTypeId`) — propose whether this is enforced
     server-side or left to the picker UI to only offer valid choices (recommend server-side
     enforcement regardless of UI, since this is compliance-relevant data).
   - Validity per decision 3 — if invalid and no `override` supplied, reject with the specific
     blocking error code from decision 5; if `override.reason` supplied, record the override
     fields instead of rejecting.
4. Propose the candidate-listing endpoint tech-pwa/Portal will need:
   `GET /calibration-jobs/:id/reference-equipment-candidates` — returns the job's WorkOrder's
   confirmed `WorkOrderEquipment` list (with each unit's current validity precomputed per
   decision 3's rule, so the picker can show which units are currently valid vs. would require
   an override, without the client re-deriving the logic). Propose the exact response shape.
5. Propose a read endpoint: `GET /calibration-jobs/:id/reference-equipment-used` (or fold into
   the existing job detail response — propose which, given the existing
   `calibrationJobInclude` pattern).
6. Propose RBAC: new action on `calibrationJob` (e.g. `recordReferenceEquipmentUsed`), grants
   per decision 6. Confirm `calibrationJob:read` is sufficient for the read/candidates
   endpoints (no new read-side action needed).
7. Propose Zod/DTO schemas for the replace-endpoint body, following existing project
   convention (the `override` sub-object needs its own validation: `reason` required non-empty
   when present).
8. Present the full proposal and STOP. Ask for explicit approval before Stage 2.

## Stage 2 — Implement (ONLY after explicit user approval)

1. Implement exactly what was approved.
2. Write tests covering: successful full-set replace with valid equipment; rejection when
   equipment isn't on the job's WorkOrderEquipment list; rejection when equipment is inactive;
   rejection when calibration invalid (expired, not CONFIRMED, or not acceptedForUse) without
   override; successful recording WITH override (fields populated correctly, actor + reason
   recorded); rejection when `job.startedAt` is null; rejection when attempting to modify after
   the job reaches whatever status boundary was decided in Stage 1 point 2; company-scoping;
   RBAC guard (TECHNICIAN allowed, unauthorized role rejected); candidate-listing endpoint
   returns precomputed validity correctly for both valid and invalid units.
3. Run `apps/api` typecheck and the `calibration-jobs` test suite (`TEST_DATABASE_URL` set);
   report real results, and explicitly check for pre-existing unrelated failures so they're not
   mistaken for regressions.
4. Do NOT touch Portal/tech-pwa UI files.
5. Confirm final `git status` — list exactly which files changed.

## Output / final message format

**After Stage 1:** present the full design proposal per points 1–7. End with an explicit
request for approval to proceed to Stage 2.

**After Stage 2 (only if reached):** confirm exactly which files changed, typecheck result, test
results, and an endpoint reference summary for the follow-up Portal/tech-pwa UI tasks.
