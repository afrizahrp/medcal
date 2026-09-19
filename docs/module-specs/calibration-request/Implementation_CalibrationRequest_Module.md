# IMPLEMENTATION TASK — Build CalibrationRequest API Module (Backend Only)

## Scope & Mode
This is an IMPLEMENTATION task. You may create/edit files within the scope below and run
build/test/typecheck commands. This task is BACKEND ONLY — do NOT touch `apps/portal` or
`apps/tech-pwa` in this task (UI comes in a separate follow-up task). Do NOT touch any other
Prisma model, the `DocumentType` enum, or the numbering tables — those are already correctly
set up (B1/B2/B3 fixes already applied). Do NOT start any other lifecycle module (Quotation,
PurchaseOrder, WorkOrder, etc.) — CalibrationRequest only.

## Step 0 — Inspect before writing anything

1. Read the full `CalibrationRequest` and `CalibrationRequestItem` models in
   `packages/db/prisma/schema.prisma` (previously noted around line 867-904, re-verify exact
   current line numbers). Note every field, every relation, the exact `CalibrationRequestStatus`
   enum values and their order, and any required vs optional fields. Do not assume field names
   from prior audit summaries — read the actual current schema.
2. Read the entire `apps/api/src/modules/customers/` directory — this is your reference
   pattern to mirror: controller, service, module file, DTOs/validation, and
   `customers.service.test.ts`. Pay particular attention to:
   - How `DocumentNumberService.allocate()` is called inside a `prisma.$transaction` (see
     `customers.service.ts` around line 52 and the transaction wrapper around line 96).
   - How `companyId` is sourced (should come from the request context / guard, ultimately
     tracing back to `process.env.COMPANY_ID` via `CompanyRoleGuard` — confirm this exact
     mechanism by reading the guard, don't assume).
   - How permission checks are wired (decorator + guard) referencing the permission catalog.
3. Read `packages/auth/src/access-control.ts` to confirm the `calibrationRequest` resource
   entry added in the B3 fix (actions: read/create/update/cancel) and how it's referenced by
   a `@RequirePermission`-style decorator in a controller.
4. Read `packages/shared/src/` to see the existing pattern for Zod validation schemas (e.g.
   `customerCreateSchema`, `customerListQuerySchema`) — you'll follow this same pattern.

If anything in Step 0 reveals that CalibrationRequest's actual shape doesn't match what's
described below, follow what you find in the actual schema — the schema is the source of
truth, not this prompt's assumptions.

## Step 1 — Shared validation schema

In `packages/shared/src/`, add Zod schemas for CalibrationRequest following the exact pattern
used for Customer: a create schema, an update schema (if applicable), and a list-query schema
(pagination/filtering, company-scoped). Include nested item validation for
`CalibrationRequestItem` (array of items with device reference etc., per whatever fields
Step 0 revealed).

## Step 2 — Backend module

Create `apps/api/src/modules/calibration-requests/` with the same file structure as
`customers/` (controller, service, module, DTOs referencing the shared schemas from Step 1).

**Service — create():**
- Wrap in `prisma.$transaction`, exactly mirroring the Customer creation pattern.
- Call `DocumentNumberService.allocate({ companyId, documentType: 'CALIBRATION_REQUEST' })`
  (confirm exact call signature from `customers.service.ts`).
- Create the `CalibrationRequest` row plus nested `CalibrationRequestItem` rows in the same
  transaction.
- Set initial status to whatever the schema's enum indicates is the starting state (likely
  `DRAFT` — confirm from Step 0, don't assume).

**Service — other methods:**
- `list()` — paginated, company-scoped (same `companyId` sourcing as Customer module).
- `getById()` — company-scoped (must not return another company's record — there's only one
  company today, but keep the same scoping pattern as Customer for consistency).
- `update()` — only for fields that make sense to edit before the request moves past DRAFT
  (or whatever the schema's earliest status is). If the exact editability rules aren't
  evidenced anywhere in the schema or planning docs, implement the minimal obviously-safe
  version (allow edits only while status is at its initial/DRAFT state) and add a `// TODO:`
  comment flagging that full edit-permission business rules need confirmation — do not invent
  elaborate business logic not backed by evidence.
- `cancel()` — sets status to `CANCELLED` (or equivalent per the actual enum). Do not
  implement any other status transitions (e.g. moving to `IN_QUOTATION`) — that's out of
  scope for this task since it depends on the Quotation module which doesn't exist yet. Add a
  `// TODO:` comment noting where that transition will eventually be triggered from.

**Controller:**
- Standard REST endpoints (POST create, GET list, GET by id, PATCH update, POST cancel — or
  whatever verb/path convention `customers.controller.ts` uses, mirror it exactly).
- Apply the same permission-guard decorator pattern as Customer, using the `calibrationRequest`
  resource/actions from the permission catalog.

**Module file:** wire controller + service, and register the new module in
`apps/api/src/app.module.ts` (this is the only existing file outside the new module directory
you should need to touch).

## Step 3 — Tests

Write `calibration-requests.service.test.ts` mirroring the coverage in
`customers.service.test.ts`:
- Document number allocation is called correctly for `CALIBRATION_REQUEST` type.
- Company-scoping works (uses the env-sourced `companyId`, not client input).
- Transaction rolls back fully if any step fails (e.g. if item creation fails, the parent
  CalibrationRequest row and the allocated number are not left dangling — confirm this
  matches how Customer's transaction handles the equivalent failure case).
- Basic CRUD behaves as expected (create, list, get, update-while-draft, cancel).

## Step 4 — Verification

1. Run the project's typecheck command (check `package.json` for the actual script, don't
   guess) and fix any errors.
2. Run the new test file plus the existing `customers.service.test.ts` and
   `document-number.service.test.ts` to confirm nothing regressed.
3. Confirm no files outside `packages/shared/src/` (new schemas only),
   `apps/api/src/modules/calibration-requests/` (new), and the single import line added to
   `apps/api/src/app.module.ts` were touched.

## Output

Summarize in your final message:
- Files created/changed, grouped by Step.
- Confirmed CalibrationRequest schema fields/enum values you actually built against (in case
  they differ from this prompt's assumptions).
- Any `// TODO:` business-rule gaps you flagged (list them explicitly here too, not just in
  code comments) — these need a human decision before being finalized.
- Test and typecheck results.
- Explicit confirmation that `apps/portal`, `apps/tech-pwa`, and no other lifecycle module
  were touched.
