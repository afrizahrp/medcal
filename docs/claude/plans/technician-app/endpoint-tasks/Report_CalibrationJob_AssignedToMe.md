# IMPLEMENTATION REPORT — "My Jobs" Filter on `GET /calibration-jobs`

**Task:** `Implement_CalibrationJob_AssignedToMe_Staged.md`
**Status:** ✅ Complete (Stage 1 design approved → Stage 2 implemented, typechecked, tested)
**Date:** 2026-09-04
**Author:** afriza.hrp@gmail.com

---

## Summary

Extended the existing `GET /calibration-jobs` list endpoint with a technician-scoped
filter `assignedToMe`. When `assignedToMe=true`, the service restricts results to
calibration jobs on WorkOrders the **requesting** user is assigned to — resolved
server-side from the session user (`@UserId()`), never from a client-supplied id.

Pure addition: omitting the param leaves existing Portal behavior byte-identical.
No schema change, no new RBAC permission.

---

## Stage 1 — Design Proposal (approved)

### Live re-read findings (confirmed)

**`findAll()` — [calibration-jobs.service.ts:149-192](../../../../apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts):**
- Signature `findAll(companyId, query)` — company-scoping is a direct `companyId` key
  on the `where` object, sourced from `@CompanyId()` in the controller, never the client.
- Existing filters, all spread-merged into one `where` (AND semantics): `workOrderId`,
  `akdAklApprovalStatus`, `status`, and `search` (an `OR` block over 4 fields incl.
  `workOrder.number`).
- Sort via `resolveSortOrder(CALIBRATION_JOB_SORTABLE_FIELDS, …)` then
  `withIdTieBreaker(…)` — unaffected.
- `count` + `findMany` share the same `where` — one addition covers both.

**Relation path (confirmed in `packages/db/prisma/schema.prisma`):**
- `CalibrationJob.workOrder` → `WorkOrder` (line 1858)
- `WorkOrder.assignments` → `WorkOrderAssignment[]` (line 1640)
- `WorkOrderAssignment.technicianUserId: String` (line 1678), with
  `@@index([technicianUserId])` (line 1686) — the filter is index-backed.

Prisma path: `workOrder.assignments.some.technicianUserId`. **No schema change needed** —
the relation already exists exactly as the investigation stated.

### Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Param is `assignedToMe: boolean`, **not** a client-supplied `technicianUserId`. | A technician can only ever request their own jobs, by construction — there is no parameter to request another user's. |
| 2 | When `assignedToMe=true`, filter resolves against `@UserId()` (session user from `CompanyRoleGuard`), never a query param. | Deliberate security choice. Same id source already used by `@UserId()` in `decideIdentity`. |
| 3 | Zod: use `z.string().transform((v) => v === "true").optional()` — **deviation from the task text**, which named `z.coerce.boolean()`. | `z.coerce.boolean()` is `Boolean(value)`, so `?assignedToMe=false` coerces to `true`. The codebase already has ~20 boolean query params using the `=== "true"` transform pattern (`isStarred`, `isActive`, …). **Deviation approved by user.** |
| 4 | RBAC unaffected — reuses `@RequirePermission("calibrationJob", "read")`, already granted to TECHNICIAN. | No new action added. |
| 5 | Role-agnostic — it is just `WHERE technicianUserId = <sessionUser>`. An ADMIN calling `assignedToMe=true` scopes to their own id (empty list if they are not an assignment anywhere), which is the correct meaning of "assigned to me". | No special-casing. |
| 6 | Non-breaking — omitting the param produces a `where` identical to today's. | Portal passes no such param. |

---

## Stage 2 — Implementation

### Files changed (4)

#### 1. `packages/shared/src/schemas/index.ts`
`calibrationJobListQuerySchema` extended:

```ts
export const calibrationJobListQuerySchema = baseListQuerySchema.extend({
  workOrderId: z.string().optional(),
  akdAklApprovalStatus: z.enum(AKD_AKL_APPROVAL_STATUS_VALUES).optional(),
  status: z.enum(CALIBRATION_JOB_STATUS_VALUES).optional(),
  /**
   * Technician-scoped filter for the tech-PWA job list. When "true", the service
   * restricts results to jobs on WorkOrders the *requesting* user is assigned to
   * (resolved server-side from the session user, never a client-supplied id).
   * Omitted / "false" → current behavior, unchanged.
   */
  assignedToMe: z
    .string()
    .transform((v) => v === "true")
    .optional(),
});
```

`CalibrationJobListQuery` (via `z.infer`) picks up `assignedToMe?: boolean` automatically.

#### 2. `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts`
`findAll()` takes a new required `userId: string`; conditional `where` addition:

```ts
async findAll(
  companyId: string,
  query: CalibrationJobListQuery,
  userId: string,
): Promise<CalibrationJobListResult> {
  // …
  const where: Prisma.CalibrationJobWhereInput = {
    companyId,
    ...(query.workOrderId ? { workOrderId: query.workOrderId } : {}),
    ...(query.akdAklApprovalStatus ? { akdAklApprovalStatus: query.akdAklApprovalStatus } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.assignedToMe
      ? { workOrder: { assignments: { some: { technicianUserId: userId } } } }
      : {}),
    ...(query.search ? { /* unchanged OR block */ } : {}),
  };
  // …
}
```

`search`'s `workOrder` key lives inside its `OR` array, so there is no key collision
with the top-level `workOrder` added by `assignedToMe` — both apply.

#### 3. `apps/api/src/modules/calibration-jobs/calibration-jobs.controller.ts`
`list()` handler injects `@UserId()` (already imported) and forwards it:

```ts
@Get()
@RequirePermission("calibrationJob", "read")
async list(
  @CompanyId() companyId: string,
  @UserId() userId: string,
  @Query() rawQuery: unknown,
): Promise<CalibrationJobListResult> {
  const parsed = calibrationJobListQuerySchema.safeParse(rawQuery);
  if (!parsed.success) { /* unchanged 400 */ }
  return this.service.findAll(companyId, parsed.data, userId);
}
```

#### 4. `apps/api/src/modules/calibration-jobs/calibration-jobs.service.test.ts`
- Updated 3 existing `findAll` call sites for the new `userId` arg (pass `staffUserId`).
- Added describe block **`CalibrationJobsService — list, assignedToMe (technician scope)`**
  with a helper `assignedTechnicianId(workOrderId)` that reads the assignment the
  `startedWorkOrderJobs` fixture creates.

---

## Test coverage (new block — 5 tests)

| Test | Asserts |
|------|---------|
| returns only jobs on work orders the caller is assigned to | `assignedToMe=true` isolates the caller's WO jobs; another tech's WO jobs excluded |
| combines with status / akdAklApprovalStatus filters | `assignedToMe=true` + `akdAklApprovalStatus: PENDING_REVIEW` → exactly the escalated job; `+ status: PENDING` narrows correctly, still WO-scoped |
| returns an empty list (not an error) for a technician with no assignments | `total === 0`, `data === []`, no throw |
| still company-scopes when assignedToMe is set | foreign-company technician id queried against the real company → `total === 0` |
| omitting assignedToMe is unchanged | a stranger (unassigned tech) still sees all jobs for the WO — pure addition, no breaking change |

---

## Verification results (real)

| Check | Command | Result |
|-------|---------|--------|
| API typecheck | `pnpm --filter @medcal/api typecheck` | ✅ pass |
| Shared typecheck | `pnpm --filter @medcal/shared typecheck` | ✅ pass |
| Test suite | `vitest run src/modules/calibration-jobs` (`.env` provides `TEST_DATABASE_URL`) | ✅ **42 passed** (was 37; +5 new) |

### `git status` — files changed by this task

```
 M apps/api/src/modules/calibration-jobs/calibration-jobs.controller.ts
 M apps/api/src/modules/calibration-jobs/calibration-jobs.service.test.ts
 M apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts
 M packages/shared/src/schemas/index.ts
```

(Untracked `docs/claude/plans/technician-app/…` files pre-date this task.)

---

## Final endpoint shape (for the tech-pwa implementation task to consume)

```
GET /calibration-jobs?assignedToMe=true
```

- Combinable with `status`, `akdAklApprovalStatus`, `workOrderId`, `search`,
  `page`, `pageSize`, `sortBy`, `sortDir`.
- Technician-scoped server-side against the session user (`@UserId()`); no client id accepted.
- `assignedToMe` omitted or `=false` → current unscoped-by-technician behavior, unchanged.
- Permission: existing `calibrationJob:read` (already held by TECHNICIAN).
- Response envelope unchanged: `{ data, page, pageSize, total, totalPages }`.
