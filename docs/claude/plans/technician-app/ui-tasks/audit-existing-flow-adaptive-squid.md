# Technician Device Lookup — Implementation Plan

## Context

`CalibrationJob.deviceId` is currently populated automatically only for unambiguous
qty=1 Work Order lines (commit `bcab526`); every job fanned out from a `qty > 1`
line is left with `deviceId = null` by design, because a single upstream
`PurchaseOrderItem.deviceId` cannot say which of N physical units it refers to.
Resolving that per-job gap was explicitly deferred to "the separate technician
Device-lookup task" — this task.

Three MoM documents dated **2026-09-21** (`MOM 6 FINAL-TASK — UNDERSTAND and
DOCUMENT UPDATED DEVICE IDENTIFICATION DECISION.md`, `MOM # 6 LAST TASK FIX
CALIBRATIONJOB DEVICEID PROPAGATION.md`, and
`calibration-job-deviceid-propagation-20260921.md`) intentionally reopen an
older, narrower lock and describe the intended UX: the internal `Device.id` is
never shown to or entered by the technician; the technician instead searches
**that job's customer's** Devices by name/type/model and/or Serial No, sees
matching Serial Numbers, and picks the physical match. The system then writes
the resolved `Device.id` into `CalibrationJob.deviceId`.

**Confirmed with user:** this write path is a new, standalone mechanism —
independent of the Identity Correction BA (`submitIdentityCorrection`) workflow
— even though `packages/auth/src/access-control.ts` and
`seed-role-permissions.ts` currently contain a 2026-09-04 comment calling
`submitIdentityCorrection` "the sole path for setting/changing a job's Device
identity." That comment is stale relative to the newer decision and will be
updated to note the exception, not reversed elsewhere. BAI/IdentityCorrection
behavior itself is untouched.

Scope is strictly: let a technician fill in a **currently-null** `deviceId` on
**one** `CalibrationJob` they have open, scoped to that job's customer.
Per-unit allocation across sibling qty>1 jobs, new Device master-data features,
AKD/AKL logic, and PDF/reporting are explicitly out of scope.

## Migration required: NO

`Device`, `CalibrationJob.deviceId`, the `@@unique([workOrderId, deviceId])`
constraint, and the Device indexes on `(companyId, customerId)` /
`(companyId, serialNumber)` all already exist
(`packages/db/prisma/schema.prisma` ~1520-1552, ~2280-2380). This feature reads
existing columns and writes one existing FK. The permission grant is seed data,
not a schema change.

## 1. Permissions (do first)

- **`packages/auth/src/access-control.ts`** (~131-170): add `"selectDevice"` to
  the `calibrationJob` action array, with a comment explaining it's a new,
  BAI-independent path for first-time resolution only (refused once `deviceId`
  is already set). Update the existing `submitIdentityCorrection` comment
  (~112-116) to note this exception rather than contradict it.
- **`packages/db/prisma/seed-role-permissions.ts`**:
  - Add `{ role: "TECHNICIAN", resource: "calibrationJob", action: "selectDevice" }`
    and the same for `TECHNICIAN_MANAGER` (~158-170) — both roles already act on
    this same tech-pwa job-detail screen (mirrors `submitIdentityCorrection`/
    `recordReferenceEquipmentUsed`). Update the stale comment there too.
  - Also add `"selectDevice"` to `SUPERADMIN_PERMISSION_CATALOG.calibrationJob`
    (~261-313) so `GENERAL_MANAGER_GRANTS` (auto-derived, ~328) doesn't silently
    diverge from the `ac` catalog.
- **`packages/auth/src/me-types.ts`** (~99-101): add
  `calibrationJobSelectDevice: boolean` to `MeCapabilities`.
- **`apps/api/src/modules/me/me.controller.ts`** (~210): compute it via
  `hasPermission(membership.role, "calibrationJob", "selectDevice")`, mirroring
  `calibrationJobRecordReferenceEquipmentUsed`.
- No new migration/backfill script needed (purely additive grant); dev/staging
  just needs `pnpm --filter @medcal/db run seed:role-permissions` re-run. Test
  DBs already re-seed via the existing `pretest` hook.

## 2. Backend schema/DTO (`packages/shared/src/schemas/index.ts`)

- `calibrationJobSelectDeviceSchema = z.object({ deviceId: z.string().min(1) })`
  — new section placed near the existing (removed-route) `calibrationJobAssignDeviceSchema`.
- `calibrationJobDeviceCandidatesQuerySchema = deviceListQuerySchema.pick({ search: true, page: true, pageSize: true })`
  — reuses the existing Device list/search schema instead of duplicating it.
  `customerId`/`deviceTypeId`/`status` are deliberately excluded: the service
  derives `customerId` from the job, so a technician can never widen the search
  to another customer.

## 3. Backend module wiring

- `apps/api/src/modules/calibration-jobs/calibration-jobs.module.ts`: add
  `DevicesModule` to `imports` (it already exports `DevicesService`, no
  circular-dependency risk).

## 4. Backend service (`calibration-jobs.service.ts`)

- Inject `DevicesService` as a second constructor param.
- `getDeviceCandidates(companyId, jobId, query)`: loads the job via existing
  `findOne` (404 if not found/wrong company), then calls
  `devicesService.findAll(companyId, { ...query, customerId: job.workOrder.customerId })`
  — reuses `DevicesService.findAll`'s existing search-across
  `code/brand/model/serialNumber/deviceType.name/customer.name` logic verbatim.
- `selectDevice(companyId, jobId, deviceId)`:
  1. Load job via `findOne`.
  2. Reuse the existing `assertIdentityGateOpen(job.status)` gate (same
     `SUBMITTED`/`ACCEPTED_BY_QA` boundary already used for identity
     resolution) — no new business rule invented.
  3. If `job.deviceId !== null`, throw `ConflictException`
     (`CALIBRATION_JOB_DEVICE_ALREADY_SET`) — this is first-time resolution
     only; changing an already-bound device still requires a BA.
  4. Load the target `Device` scoped to `companyId`; 404
     (`DEVICE_NOT_FOUND`) if missing.
  5. Verify `device.customerId === job.workOrder.customerId`; 400
     (`CALIBRATION_JOB_DEVICE_CUSTOMER_MISMATCH`) otherwise — never trust the
     candidate list alone, re-check server-side.
  6. `prisma.calibrationJob.update({ deviceId })`; catch a Prisma `P2002` on
     `@@unique([workOrderId, deviceId])` and surface 409
     `CALIBRATION_JOB_DEVICE_ALREADY_BOUND_TO_WORK_ORDER`.
  7. Return the refreshed `CalibrationJobDetail` (existing shape/include).

## 5. Backend controller (`calibration-jobs.controller.ts`)

- `GET /calibration-jobs/:id/device-candidates?search=...` — guarded by the
  existing `@RequirePermission("calibrationJob", "read")` (no new permission
  needed for reads), placed near `:id/reference-equipment-candidates`.
- `POST /calibration-jobs/:id/select-device` — body `{ deviceId }`, guarded by
  the new `@RequirePermission("calibrationJob", "selectDevice")`. Named
  `select-device`, deliberately **not** `assign-device` — that path is
  intentionally kept as an inert 410 stub (`assignDeviceRemoved()`) for
  un-migrated Portal builds and must not be reused/collided with.

## 6. Tech PWA frontend

- **`lib/calibration/identity-gate.ts`**: add `canSelectDevice(job)` mirroring
  `canSubmitIdentityCorrection` (`!isIdentityGateLocked(job)`).
- **New `lib/calibration/device-lookup.ts`**: trimmed local types
  `TechDeviceCandidate` / `TechDeviceCandidateListResponse` (matches this
  codebase's convention of small per-feature client types, not shared DTOs).
- **New `app/jobs/[id]/use-device-lookup-query.ts`**: `useDeviceCandidates(id, search)`
  (query key `["job", id, "device-candidates", search]`, `apiFetch`) and
  `useSelectDevice(id)` (mutation, `onSuccess` invalidates `["job", id]` and
  `["jobs"]`) — modeled directly on `use-reference-equipment-query.ts`.
- **`app/jobs/[id]/job-detail-ui.tsx`**: reintroduce `AssignedDeviceSection`
  (removed in `fdd8531`). When `job.device` is set, render the same read-only
  Kode/Serial rows as before. When `deviceId` is null and the technician is
  allowed to select, render a search input (debounced via the existing,
  currently-unused `hooks/use-debounced-value.ts`) plus a result list showing
  only brand/model/type + Serial No per candidate — deliberately **not** the
  device code or internal id, matching the MoM decision's "technician never
  sees Device ID" rule. Reuses existing `LoadingState`/`ErrorState`/`EmptyState`
  components for the three required states. Otherwise (no permission / gate
  locked / no device yet), keep the existing "Alat belum diidentifikasi." text.
- **`app/jobs/[id]/page.tsx`**: wire `deviceSearch` state +
  `useDebouncedValue`, gate visibility on
  `job.deviceId === null && capabilities?.calibrationJobSelectDevice && canSelectDevice(job)`,
  and render `AssignedDeviceSection` in the same position it occupied before
  removal (after `ObservedIdentitySection`).
- **Portal**: no changes needed — `apps/portal/.../calibration-jobs/[id]/page.tsx`
  (~545-564) already renders `job.device` generically off the same
  `GET /calibration-jobs/:id` payload this feature updates.

## 7. Tests

Backend (`calibration-jobs.service.test.ts`, real Postgres via `@medcal/db`,
existing fixture/cleanup-array conventions):
1. Update the shared `new CalibrationJobsService()` instantiation (line ~39) to
   pass a real `DevicesService`.
2. `getDeviceCandidates` returns only the job's customer's devices matching search.
3. `getDeviceCandidates` empty result when nothing matches.
4. `getDeviceCandidates` 404s for a job outside the company.
5. `selectDevice` happy path persists `deviceId` and returns it populated.
6. `selectDevice` rejects re-selection once `deviceId` is already set (409).
7. `selectDevice` rejects a device belonging to a different customer (400).
8. `selectDevice` 404s on an unknown/foreign-company device.
9. `selectDevice` refuses once the job has passed the identity gate (400).
10. `selectDevice` surfaces 409 on the `@@unique([workOrderId, deviceId])`
    collision (two sibling qty>1 jobs, same Work Order).
11. RBAC: TECHNICIAN and TECHNICIAN_MANAGER allowed on both new routes; an
    unrelated role (e.g. FINANCE) blocked (403).

Frontend: no existing tech-pwa component (`*.tsx`) test convention exists —
only pure-logic `*.test.ts` files. Per the project's testing rules (don't
invent new test infra), no new `.tsx` test is added; if `identity-gate.ts` has
an existing test file, add cases for `canSelectDevice` there to match existing
coverage of its sibling functions — otherwise skip, matching precedent.

Run order: focused
`pnpm --filter @medcal/api exec vitest run calibration-jobs.service.test.ts`,
then the full `@medcal/api` suite, then
`pnpm --filter @medcal/api exec tsc --noEmit`.

## Verification

1. Run the backend focused test file, then the full `@medcal/api` Vitest suite
   and typecheck; report actual pass/fail counts (not just "build succeeded").
2. Manually walk the tech-pwa flow: open a job with `deviceId = null` (e.g. a
   qty>1-fanned job), confirm the search box appears, search by brand/model and
   by Serial No, select a match, confirm the section switches to the read-only
   Kode/Serial display and survives a reload. Confirm a job that already has a
   device shows the read-only view immediately with no search box.
3. Confirm a technician cannot search/select across a different customer's
   devices (try a `customerId` outside the job's own).
4. Confirm the job detail screen for a job past `SUBMITTED`/`ACCEPTED_BY_QA`
   never shows the search box even if `deviceId` is still null.
5. Confirm Portal's existing job detail view reflects the newly-set device with
   no code changes on that side.
