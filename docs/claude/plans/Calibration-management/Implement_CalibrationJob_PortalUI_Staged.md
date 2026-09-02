# IMPLEMENT (STAGED) — CalibrationJob Portal Management UI: List + Detail + Actions

## Mode
This task has TWO stages with a HARD STOP between them. Do NOT proceed past Stage 1 without
explicit user confirmation in this conversation.

**Scope lock:** this task builds the Portal (`apps/portal`) management UI for viewing
`CalibrationJob` records and triggering the three action endpoints already implemented
(escalate-identity, identity-decision, assign-device/register-device). Do NOT build tech-pwa
UI. Do NOT add new API endpoints — the backend for this is already complete (escalation task +
device assignment task). Do NOT modify RBAC/schema/service files unless Stage 1 finds the
Portal genuinely cannot function without a small addition (e.g. a list endpoint) — if so,
flag it explicitly as its own mini-checkpoint, don't silently add it.

## Background — what already exists to reuse (confirmed by full prior audit + later tasks)

- **List/detail + client-UI pattern:** `apps/portal/src/app/management/work-orders/`,
  `calibration-requests/calibration-requests-ui.tsx` — the direct templates to mirror.
- **Menu-driven RBAC:** `viewResource`/`viewAction` on menu rows + `MenuService.getNavTree`
  filtering by `hasPermission`. Menu seed at `seed-menu.ts` — "Calibration Management" group
  currently ends at Work Order (per the original audit); this task extends that group.
- **Approval-action UI pattern:** the original audit named `quotation:approve` /
  `purchaseOrder:approve` as the backend template; check whether the Portal already has UI
  buttons/dialogs for those (e.g. in `purchase-orders` or `quotations` portal folders) as the
  frontend template to mirror for the identity-decision (approve/reject) action here.
- **Backend already built (this task consumes, does not modify):**
  - `GET /calibration-jobs/:id` — job + workOrder/calibrationRequestItem/akdAklApprovedBy
  - `POST /calibration-jobs/:id/escalate-identity`
  - `POST /calibration-jobs/:id/identity-decision` — `{ decision: APPROVE|REJECT, akdAklDecisionNote? }`
  - `GET /calibration-jobs/:id/device-candidates?search=`
  - `POST /calibration-jobs/:id/assign-device` — `{ deviceId }`
  - `POST /calibration-jobs/:id/register-device` — device fields, prefilled serial from job
  - RBAC actions: `calibrationJob:read`, `escalateIdentity`, `approveIdentity`, `assignDevice`

## Stage 1 — Investigate conventions, then propose the design (no code yet)

### Part A — Verify current Portal conventions

1. Read `apps/portal/src/app/management/work-orders/` in full (list + detail components,
   data-fetching pattern — React Query? server actions? confirm which) to establish the exact
   pattern this task should mirror.
2. Read `seed-menu.ts`'s current "Calibration Management" group definition and confirm exactly
   where/how a new menu row would be added, and what `viewResource`/`viewAction` values it
   needs to gate on `calibrationJob:read`.
3. Check whether there is already a **list** endpoint for `CalibrationJob` (e.g.
   `GET /calibration-jobs?workOrderId=` or similar) — the backend tasks so far only built
   `GET /calibration-jobs/:id` (single). If no list endpoint exists, this is the one
   legitimate small backend gap from Stage 1's scope note above — flag it explicitly with a
   proposed minimal shape (filters: `workOrderId`, `companyId` implicit, maybe
   `akdAklApprovalStatus`) rather than silently building the UI against a nonexistent
   endpoint.
4. Confirm how the Portal currently handles action buttons that call a POST endpoint requiring
   a request body with confirmation (e.g. reject requiring a note) — is there an existing
   dialog/modal pattern (check `quotations`/`purchase-orders` approve UI) to reuse for the
   identity-decision action?

### Part B — Propose the design

1. **Route structure:** propose `apps/portal/src/app/management/calibration-jobs/` (or
   confirm a better-fitting location) with a list page and a detail page (or drawer/dialog —
   propose based on what Part A.1 reveals as this project's convention for job-like detail
   views).
2. **List view columns:** the original full audit specified the intended shape as
   `Device | Serial | AKD/AKL/NIE | Approval | Correction | Status`. Propose the actual columns
   given what data is now available (note: "Correction" — Identity Correction workflow —
   still does not exist per that audit; state explicitly that this column is out of scope /
   omitted, not silently dropped without mention). Include filtering by WorkOrder and by
   `akdAklApprovalStatus` at minimum.
3. **Detail view sections:** propose the layout — job identity snapshot
   (customerDeclaredDeviceName/AkdAkl, technicianObserved*), current device (if assigned),
   AKD/AKL approval status + history (approvedBy/At/note), and the three action areas:
   - Escalate identity (if status allows — NOT_REQUIRED/REJECTED → PENDING_REVIEW)
   - Approve/Reject (if status is PENDING_REVIEW, and caller has `approveIdentity`)
   - Assign/Register device (if `deviceId` is null) — propose whether this is a search-select
     (device-candidates) with a "device not found → register new" fallback in the same
     dialog, mirroring how the backend was designed as one cohesive flow.
4. **Permission gating in the UI:** propose how each action button checks the caller's
   permission (menu-tree-level gating vs. per-button — check how `work-orders` UI currently
   does per-action gating, e.g. for its own approve/start actions, and mirror that).
5. **Error handling:** propose how the specific error codes from the backend
   (`DEVICE_TYPE_MISMATCH`, `CALIBRATION_JOB_DEVICE_TYPE_UNRESOLVED`,
   `CALIBRATION_JOB_IDENTITY_GATE_LOCKED`, etc.) surface to the user — toast/inline message
   convention already used elsewhere in the Portal, cite an example.
6. Present the full Part A findings + Part B proposal (including the flagged list-endpoint gap
   if found) and STOP. Do not write any code. Ask for explicit approval before Stage 2.

## Stage 2 — Implement (ONLY after explicit user approval)

1. If a list endpoint gap was found and approved, implement that first (small, in
   `calibration-jobs.service.ts`/`.controller.ts`, mirroring existing list-endpoint patterns
   elsewhere in the codebase, e.g. `work-orders`).
2. Implement the approved route/list/detail/action UI.
3. Add menu row per Part A.2, gated correctly.
4. Run `apps/portal` typecheck and any existing UI test pattern this project uses (check for
   one — e.g. component tests, Playwright — before assuming none exist).
5. Do NOT touch tech-pwa, AKD/AKL escalation service logic itself, or device-assignment
   service logic itself (only add a list endpoint if that was the approved gap).
6. Confirm final `git status` — list exactly which files changed.

## Output / final message format

**After Stage 1:** present Part A findings (with citations) and the full Part B proposal,
including the explicitly-flagged list-endpoint gap if one exists. End with an explicit request
for approval to proceed to Stage 2.

**After Stage 2 (only if reached):** confirm exactly which files changed, typecheck result, any
test results, and a short note on how to navigate to the new page in the Portal for manual
verification.
