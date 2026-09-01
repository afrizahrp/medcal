# IMPLEMENTATION TASK — Build Portal UI for CalibrationRequest

## Scope & Mode
IMPLEMENTATION task. Scope is `apps/portal` ONLY — do not touch `apps/api`, `apps/tech-pwa`,
`packages/db` schema, or any other lifecycle module. The backend API for CalibrationRequest
already exists and is tested (`apps/api/src/modules/calibration-requests/`) — call it, do not
duplicate its logic in the frontend.

## Step 0 — Inspect before writing anything

1. Read `apps/portal/src/app/management/customers/` completely — this is your reference
   pattern: list page, `new/` (create form), `[id]/` (detail view), any shared components
   used, and how it calls the backend API (fetch pattern, auth/session handling, error states,
   loading states).
2. Read the actual CalibrationRequest backend module (`apps/api/src/modules/
   calibration-requests/calibration-requests.controller.ts`) to confirm exact endpoint paths,
   request/response shapes, and permission requirements.
3. Read the Zod schemas already added in `packages/shared/src/schemas/index.ts`
   (`calibrationRequestCreateSchema`, `calibrationRequestListQuerySchema`,
   `calibrationRequestUpdateSchema`, `calibrationRequestItemInputSchema`) — reuse these for
   form validation on the frontend, don't redefine validation rules separately.
4. Confirm the actual `CalibrationRequestStatus` enum values (DRAFT, SUBMITTED, IN_QUOTATION,
   CANCELLED, FULFILLED — verified in the implementation report) so status labels/badges in
   the UI are accurate.
5. Check how customer selection works elsewhere in the portal (CalibrationRequest needs a
   `customerId` — find the existing customer-picker/autocomplete pattern if one exists in the
   customers or leads module, reuse it rather than building a new one).

## Step 1 — List Page (`apps/portal/src/app/management/calibration-requests/`)

- Paginated table/list of calibration requests, company-scoped (handled automatically by the
  backend guard — no company filtering needed client-side).
- Columns: number, customer name, service mode, status (as a badge/label), created date.
- Status filter and search, matching whatever pattern `customers` list page already uses.
- Link to detail view per row, and a "New Calibration Request" button linking to the create
  page.

## Step 2 — Create Page (`.../calibration-requests/new/`)

- Form using `calibrationRequestCreateSchema` for validation.
- Fields: customer picker (reuse existing pattern from Step 0.5), service mode
  (ON_SITE / SEND_TO_LAB — reuse the actual enum), desired schedule note (optional), notes
  (optional), and a repeatable item list (device selection per item — check how device
  selection/lookup works elsewhere in the app, e.g. if there's a device picker used in
  Customer detail pages, reuse that pattern).
- Submit calls `POST /calibration-requests`. On success, redirect to the detail page.
- Handle and display validation errors and API errors clearly (mirror the error-handling
  pattern from the customer create form).

## Step 3 — Detail Page (`.../calibration-requests/[id]/`)

- Show all fields, status, and the item list.
- If status is DRAFT: show an "Edit" option (calls `PATCH /calibration-requests/:id`) and a
  "Submit" button (calls `POST /calibration-requests/:id/submit`).
- Show a "Cancel" button when status allows cancellation (check the backend — likely any
  non-terminal status). Confirm with a confirmation dialog before calling
  `POST /calibration-requests/:id/cancel` (mirror any existing confirm-dialog pattern used
  elsewhere in the portal, e.g. for customer or lead actions).
- If status is SUBMITTED, IN_QUOTATION, FULFILLED, or CANCELLED: do not show Edit — these are
  read-only per the backend's own DRAFT-only edit rule. Just display a note like
  "This request is no longer editable in its current status."
- Since IN_QUOTATION and FULFILLED are not yet reachable through any existing module (Quotation
  module doesn't exist yet), you may see status values in the enum that never actually appear
  in real data yet — still handle them in the UI's status-label mapping for completeness, but
  don't build any UI action that assumes a Quotation-related workflow exists.

## Step 4 — Permission-Aware UI

Check how `customers` pages hide/disable actions based on permission (e.g. hiding "New" button
if the user lacks `customer:create`). Apply the same pattern using the `calibrationRequest`
resource actions (`read`, `create`, `update`, `cancel`) added to the permission catalog in the
earlier B3 fix.

## Step 5 — Verification

1. Run the project's typecheck and lint commands (check `package.json` for exact scripts).
   Fix any errors.
2. If the portal has any existing component/UI tests, check if a similar test exists for
   `customers` pages and mirror it for calibration-requests if that's the established pattern
   in this repo — do not invent a testing approach that doesn't match how the rest of the
   portal is tested. If no frontend tests exist anywhere in `apps/portal` today, don't
   introduce a new testing pattern unprompted; just note that in your summary.
3. Confirm no files outside `apps/portal/src/app/management/calibration-requests/` (new) and
   any genuinely shared component you reused (not modified, just imported) were touched.

## Output

Do not create a new report file — summarize directly in your final chat message:
- Files created, grouped by step.
- Which existing patterns/components you reused (customer picker, confirm dialog, etc.) and
  from which file.
- Any UI/UX decision you made that wasn't explicitly specified here (e.g. exact wording of
  status badges) — flag these briefly for the person's review, they're easy to adjust later.
- Typecheck/lint results.
- Explicit confirmation that `apps/api`, `apps/tech-pwa`, and `packages/db` were not touched.
