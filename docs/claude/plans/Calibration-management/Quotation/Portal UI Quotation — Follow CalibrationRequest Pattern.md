# IMPLEMENTATION — Portal UI Quotation

## MODE

**IMPLEMENTATION MODE — bounded Portal UI implementation**

The Quotation backend is already implemented and verified.

Current verified state:

- `CalibrationRequest 1 → 1 Quotation`
- `Quotation.requestId` is required and unique
- Database migration applied successfully
- Quotation API implemented
- Quotation tests: **32/32 passing**
- Shared typecheck: PASS
- API typecheck: PASS
- API build: PASS

Your task now is ONLY to build the **Portal Management UI for Quotation**.

Do NOT modify the Quotation backend unless a concrete frontend/API integration defect is discovered that makes the UI impossible to implement.

Do NOT implement PurchaseOrder or any downstream module.

---

# 1. PRIMARY REFERENCE

The existing **CalibrationRequest Portal UI** is the primary reference.

Before editing anything, inspect the actual current implementation of the CalibrationRequest UI in:

```text
apps/portal
```

Identify the real patterns used for:

- route structure
- page layout
- list/table
- detail page
- form layout
- cards
- status badges
- loading states
- empty states
- error states
- confirmation dialogs
- toast/notification behavior
- API client/hooks
- query invalidation/refetch
- form validation
- field components
- date/number/currency formatting
- responsive behavior
- permission handling
- navigation
- action buttons
- destructive actions
- modal/drawer patterns, if used

Do NOT invent a new UI architecture.

Reuse existing shared components and conventions wherever they already exist.

---

# 2. IMPORTANT: RE-VERIFY ACTUAL CODE

Before implementation, inspect the actual current codebase.

Verify:

1. CalibrationRequest Portal pages/components
2. CalibrationRequest API client/hooks
3. Quotation API endpoints
4. Quotation response shapes
5. Quotation request payloads
6. Quotation status enum
7. QuotationItem fields
8. available permissions
9. existing shared UI components
10. existing routing/navigation conventions

Do not rely solely on this prompt for field names or API response structures.

The actual codebase is the source of truth.

---

# 3. DOMAIN CONTRACT

The Portal UI must reflect the current MVP contract:

```text
CalibrationRequest 1 ─── 1 Quotation
```

A CalibrationRequest can have at most one Quotation.

Do NOT expose UI concepts for:

- quotation revisions
- quotation versions
- multiple quotations per request
- quotation replacement
- superseded quotations

Do NOT create UI for a "quotation revision" workflow.

---

# 4. QUOTATION UI SCOPE

Implement the Portal UI necessary for the current Quotation backend.

At minimum, inspect whether the established CalibrationRequest UI pattern requires the following:

### Quotation list

Provide a Quotation list page following the existing Portal list-page pattern.

The list should use the actual API response fields.

Where supported by the backend, show useful information such as:

- quotation number
- customer
- CalibrationRequest reference
- quotation date
- valid until
- total amount
- status

Do not invent fields that do not exist.

Follow the existing table/list component and pagination/filter conventions.

---

### Quotation detail

Implement a Quotation detail page following the CalibrationRequest detail-page pattern.

Show appropriate sections for:

- quotation header
- customer information
- CalibrationRequest reference
- quotation dates
- validity
- status
- quotation items
- quantities
- unit prices
- line totals
- subtotal
- tax
- total

Use the actual API response.

Do not duplicate information unnecessarily if the existing design already provides a suitable summary card pattern.

---

### Create Quotation

Implement the create flow according to the existing Portal form pattern.

Quotation creation MUST be initiated from a CalibrationRequest context if that is how the existing backend/API flow is designed.

Because the domain is:

```text
1 CalibrationRequest → 1 Quotation
```

the UI should not present a generic "create quotation without request" workflow.

Before showing a create action for a CalibrationRequest, use the actual request/quotation state to determine whether a quotation already exists.

If a quotation already exists:

- do NOT show a misleading "Create Quotation" action;
- provide navigation to the existing Quotation instead, following existing UI conventions.

If the backend returns the duplicate quotation conflict anyway, display the existing quotation/context appropriately rather than presenting a generic failure.

---

# 5. QUOTATION ITEMS

Quotation creation must respect the backend contract:

> Quotation items must cover the CalibrationRequest items.

Do NOT create an arbitrary free-form quotation item editor if the backend expects items to originate from CalibrationRequest items.

Use the actual CalibrationRequest item data to populate/select the quotation lines.

Verify:

- device
- description/name
- quantity
- request item reference
- unit price
- line total

against the actual API/schema.

Do not invent additional commercial concepts.

---

# 6. PRICING

Use the existing backend-calculated totals as the source of truth.

The UI may display:

```text
Line Total
Subtotal
Tax
Total
```

but MUST NOT duplicate business calculation logic in a way that can disagree with the backend.

If the existing frontend pattern calculates preview values for UX, keep the backend as authoritative and follow the established implementation style.

Do not introduce:

- discount
- additional fees
- multi-currency
- multi-tax
- rounding rules

unless they already exist in the actual Quotation API/schema/UI conventions.

The system is currently single-currency IDR.

---

# 7. STATUS ACTIONS

Implement the UI actions supported by the actual Quotation API.

Current backend workflow:

```text
DRAFT
 ├── SENT
 └── CANCELLED

SENT
 ├── APPROVED
 ├── REJECTED
 └── CANCELLED
```

Expected actions include:

- Send
- Approve
- Reject
- Cancel

But derive exact button availability and permission behavior from the actual backend/API and existing Portal UI conventions.

Do not expose actions that the backend does not support.

Important:

- DRAFT can be edited.
- SENT is commercially frozen.
- APPROVED cannot be cancelled.
- Quotation rejection/cancellation does not automatically change CalibrationRequest status.
- There is no EXPIRED automation to implement.

Do not invent additional workflow states.

---

# 8. APPROVAL UI

Inspect the actual Quotation API response and schema for:

- `approvedAt`
- `approvedByUserId`
- `customerApprovedAt`

Render these according to their actual semantics and existing application conventions.

Do not invent a customer-facing approval workflow.

There is no customer self-service portal in this scope.

---

# 9. PERMISSIONS

Use the existing permission system.

Relevant Quotation permissions already exist:

```text
quotation:read
quotation:create
quotation:update
quotation:approve
quotation:cancel
```

Verify exact permission identifiers in:

```text
packages/auth/src/access-control.ts
```

Do not create duplicate permissions.

Follow the same frontend permission-gating pattern used by CalibrationRequest.

The UI should not show actions the current user is not authorized to perform, where the existing application convention supports action-level hiding/disablement.

Backend authorization remains authoritative.

---

# 10. NAVIGATION

Integrate Quotation into Portal navigation only according to the existing Portal navigation pattern.

Do not redesign the application's navigation.

If CalibrationRequest currently exposes a link to its Quotation, implement that relationship using the established UI pattern.

Because Quotation is now 1:1 with CalibrationRequest, the UI should treat the relationship as singular:

```text
CalibrationRequest
    └── Quotation
```

not as a quotation list/revision history under the request.

---

# 11. UX CONSISTENCY

The goal is not merely "functional pages".

The Quotation UI should visually and behaviorally belong to the same application as CalibrationRequest.

Reuse the established:

- card sizing
- spacing
- typography
- buttons
- status badge styles
- form controls
- table styles
- action menus
- modal/dialog patterns
- toast patterns
- loading skeletons
- empty states
- error states

Do not introduce a new visual language.

Do not make the Quotation pages look like a separate application.

---

# 12. RESPONSIVE BEHAVIOR

Follow the existing Portal responsive patterns.

Do not redesign desktop/mobile layouts independently unless the existing CalibrationRequest UI already does so.

Pay particular attention to:

- quotation item tables
- action buttons
- totals
- customer/request summary
- long device names/descriptions

---

# 13. API INTEGRATION

Use the existing Portal API client/query architecture.

Do NOT:

- hardcode API URLs
- bypass existing API clients
- duplicate authentication logic
- duplicate permission logic
- create a second HTTP abstraction

Use the same data-fetching and mutation patterns already used by CalibrationRequest.

After mutations:

- invalidate/refetch the appropriate queries
- update detail/list views according to existing conventions

---

# 14. VALIDATION AND ERRORS

Use the existing frontend validation pattern.

Handle backend errors explicitly, especially:

```text
DUPLICATE_QUOTATION_FOR_REQUEST
```

If this occurs despite UI prevention:

- show a meaningful message;
- if the API provides the existing quotation ID, provide navigation to it where the existing UI pattern allows;
- do not silently retry creation.

Also handle:

- validation errors
- unauthorized/forbidden
- not found
- network/server errors

according to existing Portal conventions.

---

# 15. FILE SCOPE

Before editing, identify the exact files/directories that need changes.

Expected scope is primarily:

```text
apps/portal
```

and only shared files if the existing architecture requires them.

Do not modify:

- `apps/api` business logic
- Prisma schema
- Prisma migrations
- PurchaseOrder
- WorkOrder
- CalibrationJob
- MeasurementEntry
- Certificate
- Invoice
- Payment
- CreditNote

Do not perform unrelated frontend refactors.

---

# 16. TESTING / VERIFICATION

After implementation:

1. Run the relevant Portal typecheck.
2. Run the relevant Portal lint/build/test commands used by the repository.
3. Verify the actual Quotation routes/pages compile.
4. Verify API calls use the real Quotation endpoints.
5. Verify permission checks.
6. Verify create/edit/status actions against the actual API contract.
7. Verify there is no UI path for creating a second quotation for the same CalibrationRequest.
8. Verify existing CalibrationRequest UI remains unaffected.

If the repository has an established frontend test suite, run the relevant tests.

Do not report skipped tests as passing.

---

# 17. IMPORTANT SCOPE BOUNDARY

This task ends when Portal Quotation UI is complete.

Do NOT proceed to:

```text
PurchaseOrder
WorkOrder
CalibrationJob
MeasurementEntry
Certificate
Invoice
Payment
CreditNote
```

Do not start any PO implementation automatically after finishing Quotation UI.

---

# 18. FINAL REPORT

Return:

### 1. Pages/routes created or modified

List exact routes.

### 2. Components created or modified

List exact files.

### 3. API integration

List the Quotation endpoints used.

### 4. Workflow

Explain which Quotation actions are available in each status.

### 5. CalibrationRequest integration

Explain how the 1:1 relationship is represented in the UI.

### 6. Permissions

List the permission checks used.

### 7. Validation/error handling

Explain handling of duplicate quotation and other relevant errors.

### 8. Verification

Report exact:

- typecheck
- lint
- tests
- build

results.

### 9. Scope confirmation

Explicitly confirm:

> PurchaseOrder and all downstream modules were NOT implemented.

Most importantly:

**Do not redesign the UI. Follow the actual existing CalibrationRequest Portal UI pattern.**