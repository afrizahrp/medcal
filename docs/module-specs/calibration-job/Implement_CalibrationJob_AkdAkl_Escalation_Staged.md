# IMPLEMENT (STAGED) — CalibrationJob AKD/AKL Escalation & TECHNICIAN_MANAGER Approval

## Mode
This task has TWO stages with a HARD STOP between them. Do NOT proceed past Stage 1 without
explicit user confirmation in this conversation.

**Scope lock:** this task builds the escalation + approval workflow for
`CalibrationJob.akdAklApprovalStatus` ONLY — the API surface (module/service/controller),
the RBAC actions + grant, and the status-transition logic. Do NOT build any Portal or
tech-pwa UI in this task (no CalibrationJob UI exists yet at all — that's a separate future
task). Do NOT build device-matching/register-on-site logic. Do NOT modify the schema — the
fields already exist (`akdAklApprovalStatus`, `akdAklApprovedByUserId`, `akdAklApprovedAt`,
`akdAklDecisionNote`, `customerDeclaredAkdAkl`, `technicianObservedAkdAkl`).

## Background — confirmed business decisions (do not re-litigate)

1. When AKD/AKL/NIE is not declared/available for a specific device, a technician escalates to
   TECHNICIAN_MANAGER, who decides whether that specific device may proceed with calibration.
2. This decision is per-`CalibrationJob` (per physical device/item) — one blocked item must
   never block sibling jobs in the same WorkOrder.
3. TECHNICIAN_MANAGER is the sole approver.
4. `akdAklApprovalStatus` currently defaults to `NOT_REQUIRED` for every fanned-out job
   (set by the fan-out task, deliberately deferring this exact question).

## Background — reusable patterns already in this codebase (confirmed by prior audits)

- **Approval action pattern:** `quotation:approve`, `purchaseOrder:approve` — actions defined
  in `access-control.ts`, granted to `ADMIN` in `seed-role-permissions.ts`, with
  service+controller approve endpoints. This is the direct template to mirror.
- **RBAC infra:** DB-driven `RolePermission` + `hasPermission` + `CompanyRoleGuard`,
  fail-closed (unseeded resource = nobody can access it).
- **`calibrationJob` resource already exists** in `access-control.ts` with actions
  `read/create/update/complete` — no `approve` or escalation-related action defined yet, and
  zero `RolePermission` rows seeded for it for any role.

## Step 0 (part of Stage 1) — Resolve the escalation-trigger question

This is the one genuine open design question, and it must be resolved before writing code:

Does `akdAklApprovalStatus` move from `NOT_REQUIRED` to `PENDING_REVIEW`:

- **(a) Automatically**, at some point derived from data alone (e.g. the moment
  `customerDeclaredAkdAkl` is null AND a technician has submitted `technicianObservedAkdAkl`
  as also null/empty — i.e., the technician looked and genuinely found nothing), or
- **(b) Via an explicit technician action** — a dedicated "escalate to manager" endpoint the
  technician calls, independent of merely recording an empty observed value?

Investigate what's actually feasible given the current state of the system before proposing an
answer: `apps/tech-pwa` has no execution surface at all yet (confirmed by the full prior
audit — sign-in + FCM shell only), so there is no existing "technician submits observation"
endpoint to hook (a). Check directly whether any such endpoint has been added since that audit
(search `apps/api/src/modules/` for anything calibration-job/measurement-related that might
have appeared) — do not assume the prior audit is still 100% current, verify.

Given the likely absence of a technician-observation endpoint, propose the most sensible
option and justify it — you may propose a minimal explicit "escalate" endpoint (option b) as
the pragmatic path forward that doesn't require the full technician-execution surface to exist
first, while noting that a fuller (a)-style automatic derivation could replace/complement it
once the tech-pwa execution surface is built. State your recommendation clearly; this is your
call to make with reasoning, but flag it as a recommendation for explicit user confirmation
before Stage 2.

## Stage 1 — Propose the design (no code yet)

1. Propose the new RBAC action(s) to add to the `calibrationJob` resource in
   `access-control.ts` (e.g. `escalateIdentity` and/or `approveIdentity` — propose exact
   names). State which role(s) get which grant in `seed-role-permissions.ts`:
   TECHNICIAN_MANAGER must get the approve/reject action (per confirmed decision 3). Consider
   and state explicitly whether TECHNICIAN should get an escalate action, and whether
   ADMIN/SUPERVISOR should also get approve (mirroring how ADMIN has both `quotation:approve`
   and `purchaseOrder:approve` today) — propose, don't assume, and give reasoning either way.
2. Propose the API surface: new NestJS module `calibration-jobs` (service + controller) since
   none exists yet, OR extend an existing module if you find a better-justified home — state
   which and why. Propose the concrete endpoint(s):
   - An escalate endpoint (if Step 0 concludes (b) is the path): what it accepts, what it does
     to `akdAklApprovalStatus` (→ `PENDING_REVIEW`), any note/reason field.
   - An approve/reject endpoint for TECHNICIAN_MANAGER: what it accepts (job id, decision,
     `akdAklDecisionNote`), what it writes (`akdAklApprovalStatus` →
     `APPROVED`/`REJECTED`, `akdAklApprovedByUserId`, `akdAklApprovedAt`).
   - State the allowed status-transition table explicitly (e.g. can you re-escalate a
     `REJECTED` job? Can you approve a job that's already `APPROVED`? Propose guard logic
     mirroring `assertTransition`-style patterns already used for `WorkOrder`/`CalibrationJob`
     status elsewhere in this codebase).
3. Propose validation: must the caller of the approve/reject endpoint actually hold the
   TECHNICIAN_MANAGER role for that job's company (not just any TECHNICIAN_MANAGER anywhere)?
   Confirm how company-scoping is enforced elsewhere (`CompanyRoleGuard`) and state you'll
   reuse that pattern.
4. Propose Zod/DTO schemas for the new endpoint request bodies, following this project's
   existing convention (`packages/shared/src/schemas/index.ts`).
5. Present the full proposal (RBAC actions + grants, module/endpoint shapes, DTOs, transition
   rules, your Step 0 recommendation) and STOP. Do not write any code yet. Ask for explicit
   approval before Stage 2.

## Stage 2 — Implement (ONLY after explicit user approval)

1. Implement exactly what was approved in Stage 1 (service, controller, DTOs, RBAC
   action/grants, module registration).
2. Write tests covering: successful escalate → `PENDING_REVIEW`; successful approve →
   `APPROVED` with actor/timestamp recorded; successful reject → `REJECTED` with
   `akdAklDecisionNote`; a non-TECHNICIAN_MANAGER caller is rejected (403); an invalid status
   transition is rejected; company-scoping is enforced (a TECHNICIAN_MANAGER from a different
   company cannot approve).
3. Run `apps/api` typecheck and the full relevant test suite; report results.
4. Do NOT touch Portal/tech-pwa UI files, WorkOrder fan-out logic, or the schema.
5. Confirm final `git status` — list exactly which files changed.

## Output / final message format

**After Stage 1:** present the full design proposal as described above, with your Step 0
recommendation clearly flagged. End with an explicit request for approval to proceed to
Stage 2.

**After Stage 2 (only if reached):** confirm exactly which files changed, typecheck result,
test results (pass/fail counts), and a short summary of the new endpoints' request/response
shapes for future reference (e.g. for when Portal/tech-pwa UI is eventually built against
them).
