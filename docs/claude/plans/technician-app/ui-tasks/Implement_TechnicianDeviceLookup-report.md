# IMPLEMENTATION REPORT — Technician Device Lookup

Task spec: [Device-lookup-audit.md](../../../minutes-of-meeting/Device-lookup-audit.md)

Related decision docs (2026-09-21): `MOM 6 FINAL-TASK- UNDERSTAND and DOCUMENT UPDATED DEVICE
IDENTIFICATION DECISION.md`, `MOM # 6 LAST TASK FIX CALIBRATIONJOB DEVICEID PROPAGATION.md`,
`calibration-job-deviceid-propagation-20260921.md` — all under `docs/minutes-of-meeting/`.

## Status: Complete

## Context

`CalibrationJob.deviceId` was already auto-propagated for unambiguous qty=1 Work Order lines
(commit `bcab526`), but every job fanned out from a `qty > 1` line was left `null` by design —
explicitly deferred to "the separate technician Device-lookup task." This task closes that gap:
a technician can now search that job's customer's Devices and select one to resolve a still-null
`deviceId`, without ever seeing or entering the internal `Device.id`.

**Key architectural finding, resolved with the user before implementation:** `packages/auth/src/
access-control.ts` and `seed-role-permissions.ts` carried a 2026-09-04 comment calling
`submitIdentityCorrection` (the Identity Correction BA) "the sole path for setting/changing a
job's Device identity." Three MoM docs dated 2026-09-21 intentionally reopen that lock and
describe a direct, BAI-independent selection flow instead. Confirmed direction: implement the new
`selectDevice` path as standalone, and update the stale comments to record the exception rather
than silently contradict them. BAI/IdentityCorrection code itself was not touched.

## What was built

### Permissions
- `packages/auth/src/access-control.ts` — added `"selectDevice"` to the `calibrationJob` action
  catalog; updated the `submitIdentityCorrection` comment to note the new, first-time-only
  exception.
- `packages/db/prisma/seed-role-permissions.ts` — granted `calibrationJob:selectDevice` to
  `TECHNICIAN` and `TECHNICIAN_MANAGER` (both operate the same tech-pwa job-detail screen,
  mirroring `submitIdentityCorrection`); mirrored the action into `SUPERADMIN_PERMISSION_CATALOG`
  so `GENERAL_MANAGER` (auto-derived from that catalog) doesn't silently diverge.
- `packages/auth/src/me-types.ts` / `apps/api/src/modules/me/me.controller.ts` — added the
  `calibrationJobSelectDevice` capability flag, computed via `hasPermission(...)`.

### Backend schema/DTO
- `packages/shared/src/schemas/index.ts`:
  - `calibrationJobSelectDeviceSchema = z.object({ deviceId: z.string().min(1) })` — POST body.
  - `calibrationJobDeviceCandidatesQuerySchema = deviceListQuerySchema.pick({ search, page,
    pageSize })` — deliberately excludes `customerId`/`deviceTypeId`/`status` so the service (not
    the client) controls scoping.

### Backend module/service/controller
- `apps/api/src/modules/calibration-jobs/calibration-jobs.module.ts` — imports `DevicesModule` to
  reuse `DevicesService` (already exported, no circular dependency).
- `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts`:
  - `getDeviceCandidates(companyId, jobId, query)` — loads the job, then delegates to
    `DevicesService.findAll` with `customerId` forced from `job.workOrder.customerId`. Reuses the
    existing brand/model/serialNumber/code/deviceType.name/customer.name search verbatim.
  - `selectDevice(companyId, jobId, deviceId)` — reuses the existing `assertIdentityGateOpen`
    boundary (`SUBMITTED`/`ACCEPTED_BY_QA` locked); refuses with `409
    CALIBRATION_JOB_DEVICE_ALREADY_SET` if `deviceId` is already bound (first-time resolution
    only — changing a bound device still requires an Identity Correction BA); re-validates the
    target Device exists in-company (`404 DEVICE_NOT_FOUND`) and belongs to the job's customer
    (`400 CALIBRATION_JOB_DEVICE_CUSTOMER_MISMATCH`) server-side, never trusting the candidate list
    alone; catches the `@@unique([workOrderId, deviceId])` Prisma P2002 as `409
    CALIBRATION_JOB_DEVICE_ALREADY_BOUND_TO_WORK_ORDER`.
- `apps/api/src/modules/calibration-jobs/calibration-jobs.controller.ts`:
  - `GET /calibration-jobs/:id/device-candidates` — guarded by the existing
    `@RequirePermission("calibrationJob", "read")` (no new permission needed for reads).
  - `POST /calibration-jobs/:id/select-device` — guarded by the new
    `@RequirePermission("calibrationJob", "selectDevice")`. Deliberately a different route from the
    retired `:id/assign-device` (kept as an inert 410 stub for un-migrated Portal builds) — not a
    resurrection of that removed action.

### Tech PWA
- `apps/tech-pwa/src/lib/calibration/identity-gate.ts` — added `canSelectDevice(job)`, same
  boundary as `canSubmitIdentityCorrection`.
- `apps/tech-pwa/src/lib/calibration/device-lookup.ts` (new) — `TechDeviceCandidate` /
  `TechDeviceCandidateListResponse` local types. Deliberately omit internal `id`/`code` from what
  gets *displayed* in the lookup list — brand/model/type + Serial No only, per the MoM decision
  that a technician never sees Device ID during lookup.
- `apps/tech-pwa/src/app/jobs/[id]/use-device-lookup-query.ts` (new) — `useDeviceCandidates(id,
  search)` and `useSelectDevice(id)`, modeled on `use-reference-equipment-query.ts`'s
  query-key/invalidation convention (`["job", id, "device-candidates", search]`, invalidates
  `["job", id]` and `["jobs"]` on success).
- `apps/tech-pwa/src/app/jobs/[id]/job-detail-ui.tsx` — reintroduced `AssignedDeviceSection`
  (removed in commit `fdd8531`): shows the pre-existing read-only Kode/Serial rows when
  `job.device` is set; otherwise, when eligible, renders a debounced search input plus a result
  list (candidate rows show brand/model/type + Serial No only) using the existing
  `LoadingState`/`ErrorState`/`EmptyState` components for the three required states.
- `apps/tech-pwa/src/app/jobs/[id]/page.tsx` — added `deviceSearch` state +
  `useDebouncedValue` (500ms, the previously-added-but-unused hook), gated visibility on
  `deviceId === null && capabilities?.calibrationJobSelectDevice && canSelectDevice(job)`, and
  renders the section in its original position after `ObservedIdentitySection`.
- **Portal**: no changes — `apps/portal/.../calibration-jobs/[id]/page.tsx` already renders
  `job.device` generically off the same `GET /calibration-jobs/:id` payload this feature updates.

## Typecheck

Clean (zero errors) across all touched workspaces:
`@medcal/shared`, `@medcal/auth`, `@medcal/db`, `@medcal/api`, `@medcal/tech-pwa`
(`pnpm --filter <pkg> exec tsc --noEmit`).

## Tests

`apps/api/src/modules/calibration-jobs/calibration-jobs.service.test.ts`:
- Updated the shared `CalibrationJobsService` test instantiation to inject a real `DevicesService`.
- Added `describe("CalibrationJobsService — Technician Device Lookup (selectDevice)")`: candidate
  search scoped to the job's customer, empty search result, 404 for a foreign job, happy-path
  persist + populated response, 409 on re-selection once already set, 400 on cross-customer
  device, 404 on unknown device, 400 once past the identity gate, and a realistic qty>1 fan-out
  scenario asserting the 409 unique-constraint collision.
- Added 4 RBAC guard-chain tests: TECHNICIAN and TECHNICIAN_MANAGER allowed on both new routes,
  FINANCE blocked (403).

Results:
- Focused (`calibration-jobs.service.test.ts`): **186/186 passed**.
- Full `@medcal/api` suite: **1305/1315 passed** (10 failed across 5 files). All failures verified
  pre-existing/unrelated to this change: `push-tokens/notification-dispatch.service.test.ts`
  (`push.resolvePushIconUrl is not a function`), `emails/imap-sync.service.test.ts`,
  `whitelist/registration-origin-callers.test.ts`, `contact-messages/contact-messages.push.test.ts`
  — none touch CalibrationJob/Device/WorkOrder/permissions. A 5th file,
  `chat/chat.gateway.security.test.ts`, failed once on a 5-second WebSocket timeout; re-run in
  isolation reproduced the same timeout on the identical test, confirming it's a pre-existing flake
  unrelated to this change (chat module, no relation to calibration jobs or devices).
- No new tech-pwa `.tsx` component test was added — this codebase has no such convention (only
  pure-logic `*.test.ts` files exist), and `identity-gate.ts` itself has no existing test file to
  extend, so `canSelectDevice` was not given dedicated coverage, matching precedent.

## Migration

**Migration required: NO.** `Device`, `CalibrationJob.deviceId`, the
`@@unique([workOrderId, deviceId])` constraint, and the Device indexes on `(companyId,
customerId)` / `(companyId, serialNumber)` already existed. This feature reads existing columns
and writes one existing FK. The permission grant is seed data (already re-applied by the existing
`pretest` hook for test DBs; dev/staging needs a manual
`pnpm --filter @medcal/db run seed:role-permissions` re-run).

## Scope Check

- `deviceId` preserved as the persisted identity; no `newDeviceId` or parallel identity field
  introduced.
- `qty > 1` per-unit allocation **not** implemented — `selectDevice` operates on exactly one
  already-loaded `CalibrationJob` row; the only qty>1-aware behavior is defensively catching the
  pre-existing `@@unique([workOrderId, deviceId])` constraint if two sibling jobs would collide.
- No redesign of BAI/IdentityCorrection, AKD/AKL logic, PDF/reporting, Portal, or unrelated Device
  master-data features.
- One deliberate, user-confirmed exception is recorded directly in code comments (access-control.ts,
  seed-role-permissions.ts, the new service methods): `selectDevice` is a new, BAI-independent path
  for first-time resolution only, superseding the stale 2026-09-04 "sole path" comment, per the
  2026-09-21 MoM revision docs.

## Manual verification

Not run through a browser in this environment (no UI automation tool available here). Verified by
code inspection instead:
- Search box only renders when `job.deviceId === null`, the technician has the new capability, and
  the job is not past `SUBMITTED`/`ACCEPTED_BY_QA` (`canSelectDevice`) — otherwise the pre-existing
  read-only view or "Alat belum diidentifikasi." text is shown, matching prior behavior exactly.
- Selecting a candidate posts `deviceId` only (never displayed to the technician), invalidates the
  job query, and the section switches to the read-only Kode/Serial view on the next render once
  `job.device` is populated.
- Server-side re-validates customer ownership on every `selectDevice` call, independent of what the
  candidates endpoint returned, so a stale/tampered client request cannot cross a customer boundary.

**Recommended before merge:** exercise the flow live in tech-pwa against a qty>1 job (search by
brand/model and by Serial No, select, reload) and confirm Portal's existing job-detail view reflects
the newly-set device with no code changes needed there.
