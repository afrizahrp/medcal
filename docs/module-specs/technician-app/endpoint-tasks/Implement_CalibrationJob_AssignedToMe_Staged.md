# IMPLEMENT (STAGED) — "My Jobs" Filter on GET /calibration-jobs

## Mode
This task has TWO stages with a HARD STOP between them. Do NOT proceed past Stage 1 without
explicit user confirmation in this conversation.

**Scope lock:** this task extends the existing `GET /calibration-jobs` list endpoint with a
technician-scoped filter ONLY. Do NOT build any tech-pwa UI in this task — that's the next task,
only after this one is confirmed working. Do NOT modify `WorkOrderAssignment` or any other
model. Do NOT modify the schema unless Stage 1 finds a genuine gap (unlikely — the relation
already exists per the investigation).

## Background — confirmed finding (do not re-investigate)

From `investigation-tech-pwa-design.md`: `GET /calibration-jobs` currently filters only by
`workOrderId` / `akdAklApprovalStatus` / `status` (+ search). `WorkOrderAssignment
.technicianUserId` exists at the WorkOrder level, but no job-list query is scoped to "jobs on
WorkOrders assigned to the requesting technician." This blocks the tech-pwa job list and must
be added before any PWA UI work begins.

## Stage 1 — Propose the design (no code yet)

1. Re-read `calibration-jobs.service.ts`'s `findAll()` live (confirm current filter shape,
   `resolveSortOrder`, company-scoping pattern) and `WorkOrderAssignment`'s schema shape
   (confirm exact relation path from `CalibrationJob` → `WorkOrder` → `assignments` →
   `technicianUserId`).
2. Propose the new filter param — recommend `assignedToMe: boolean` (not a raw
   `technicianUserId` the client supplies) so a technician can only ever request their own
   jobs, never another user's, by construction. State explicitly: when `assignedToMe=true`,
   the service resolves the filter against `@UserId()` (the session user from the guard),
   never a client-supplied id — this is a deliberate security choice, confirm you're
   implementing it this way and not accepting an arbitrary `technicianUserId` query param.
3. Propose the exact Prisma `where` addition: filtering `CalibrationJob` where
   `workOrder.assignments.some.technicianUserId = <sessionUserId>`, combined with (not
   replacing) existing filters (`companyId`, `workOrderId`, `akdAklApprovalStatus`, `status`,
   `search`).
4. Propose the Zod query-schema addition (`calibrationJobListQuerySchema` extension —
   `assignedToMe: z.coerce.boolean().optional()`).
5. Confirm RBAC is unaffected — this reuses the existing `calibrationJob:read` permission,
   already granted to TECHNICIAN; no new action needed. State this explicitly, don't add one.
6. Consider and state: should `assignedToMe=true` combined with a role that has broader
   read access (e.g. ADMIN) still work (scoping to whatever `@UserId()` resolves to, even for
   an admin), or should it only be meaningful for TECHNICIAN? Recommend: keep it
   role-agnostic — it's just a filter on the requesting user's id, works the same for anyone,
   no special-casing needed. Confirm or flag if you see a reason otherwise.
7. Present the proposed diff (service + controller param + Zod schema) and STOP. Ask for
   explicit approval before Stage 2.

## Stage 2 — Implement (ONLY after explicit user approval)

1. Apply the approved change.
2. Write tests: `assignedToMe=true` returns only jobs on WorkOrders where the caller is an
   assignment; combined with `status`/`akdAklApprovalStatus` filters works correctly; a
   technician with no assignments gets an empty list, not an error; company-scoping still
   holds; omitting `assignedToMe` preserves current (unscoped-by-technician) behavior
   unchanged — this must be a pure addition, not a breaking change to existing callers
   (Portal's job list must continue to work exactly as before when it doesn't pass this param).
3. Run `apps/api` typecheck and the `calibration-jobs` test suite (`TEST_DATABASE_URL` set);
   report real results.
4. Confirm final `git status` — list exactly which files changed.

## Output / final message format

**After Stage 1:** present the proposed diff and reasoning per point above. End with an
explicit request for approval to proceed to Stage 2.

**After Stage 2 (only if reached):** confirm exactly which files changed, typecheck result, test
results, and the final endpoint shape (e.g. `GET /calibration-jobs?assignedToMe=true`) for the
tech-pwa implementation task to consume next.
