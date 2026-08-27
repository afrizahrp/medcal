# IMPLEMENTATION — WorkOrder Backend MVP

## MODE

IMPLEMENTATION MODE — backend only.

Implement WorkOrder MVP berdasarkan domain contract yang sudah LOCKED di bawah ini.

Sebelum mengubah code, inspect actual current repository/schema dan existing implementation pattern dari:

- CalibrationRequest
- Quotation
- PurchaseOrder
- CalibrationJob

Ikuti pola backend yang sudah digunakan project.

Do NOT redesign existing CalibrationRequest, Quotation, or PurchaseOrder.

Do NOT implement Portal UI.

Do NOT implement CalibrationJob.

Do NOT implement MeasurementEntry.

Do NOT implement Certificate, Invoice, Payment, CreditNote, or other downstream modules.

Do NOT introduce allocation/split/partial-quantity workflow.

---

# FINAL WORKORDER MVP CONTRACT

## 1. SOURCE

WorkOrder hanya dapat dibuat dari:

PurchaseOrder.status = APPROVED

Tidak ada standalone WorkOrder.

Creation flow:

PurchaseOrder APPROVED
↓
Create WorkOrder
↓
WorkOrder PLANNED

PO approval TIDAK otomatis membuat WorkOrder.

WorkOrder dibuat melalui explicit API action.

---

# 2. CARDINALITY

MVP:

1 PurchaseOrder → 1 active WorkOrder

A PurchaseOrder may have historical CANCELLED WorkOrder records.

Therefore:

- active/current WorkOrder untuk satu PO maksimal satu;
- CANCELLED WorkOrder tidak dihitung sebagai active;
- jika WorkOrder sudah CANCELLED, PO yang sama boleh membuat WorkOrder baru;
- jika sudah ada active WorkOrder, create harus ditolak.

Use application/service guard.

Do NOT blindly add a normal unique constraint on purchaseOrderId if that would prevent recreating a WorkOrder after cancellation.

Determine the safest database constraint/index strategy from the actual PostgreSQL schema.

---

# 3. WORKORDER ITEM IS REQUIRED

IMPORTANT:

WorkOrderItem MUST exist as a domain boundary in MVP.

Do NOT simplify the model by making WorkOrder directly depend only on PurchaseOrderItem.

Final relationship:

PurchaseOrder
1:1
↓
WorkOrder
1:N
↓
WorkOrderItem

When creating a WorkOrder:

ALL PurchaseOrderItems must be copied into WorkOrderItem.

There is NO item selection.

There is NO subset selection.

There is NO split.

There is NO partial quantity.

There is NO allocation engine.

For MVP:

PurchaseOrder
↓
all PurchaseOrderItems
↓
WorkOrderItems

Every PurchaseOrderItem belonging to the source PO must result in exactly one corresponding WorkOrderItem.

---

# 4. WORKORDER ITEM = OPERATIONAL SNAPSHOT

WorkOrderItem should represent the item that is actually going to be executed.

Inspect the existing schema and copy the appropriate fields from PurchaseOrderItem into WorkOrderItem according to the actual model.

At minimum preserve the item identity/reference necessary to trace:

WorkOrderItem
↓
PurchaseOrderItem
↓
QuotationItem
↓
CalibrationRequestItem

Do NOT invent unnecessary fields.

Do NOT introduce allocation fields merely for future use unless they already exist in schema.

If existing WorkOrderItem fields support future allocation/split/partial quantity, leave them unused for now.

MVP quantity behavior:

WorkOrderItem.quantity = PurchaseOrderItem.quantity

No quantity modification is allowed during WorkOrder creation.

---

# 5. DEVICE SOURCE

PKM does NOT have a Device master as the business source of truth.

Do NOT make Device master a prerequisite for creating WorkOrder.

The business device information comes through the approved quotation → PO item chain.

The intended source is:

PurchaseOrderItem
↓
WorkOrderItem

and PurchaseOrderItem itself should reflect the approved Quotation data.

Inspect the actual current schema carefully.

Do NOT:

- auto-create Device master records;
- require a Device master lookup;
- invent a Device registration workflow;
- silently convert device identifiers into Device records.

If the current schema contains a Device FK that conflicts with the actual PKM business model, report the exact conflict before applying a workaround.

Do not redesign Device management in this task.

---

# 6. QUOTATION / PO TRACEABILITY

The WorkOrder must remain traceable to:

PurchaseOrder
↓
Quotation
↓
CalibrationRequest

Use existing relations/FKs where available.

The client must NOT provide arbitrary:

- companyId
- customerId
- quotationId

as independent sources of truth when those values can be derived from the approved PurchaseOrder.

The source PurchaseOrder is authoritative.

At WorkOrder creation:

- purchaseOrderId comes from the selected PO;
- companyId comes from authenticated company context;
- customerId should be derived from the PO;
- quotationId should be derived from the PO where required by the existing schema.

Do not trust client-supplied duplicate relationships.

---

# 7. COMMERCIAL DATA

WorkOrder is an operational document, NOT a commercial document.

Commercial source remains:

Quotation
↓
PurchaseOrder snapshot

Do NOT allow WorkOrder to change or renegotiate:

- unitPrice
- item discount
- header discount
- taxCode
- taxRate
- taxAmount
- subtotal
- totalAmount
- currency

If WorkOrder/WorkOrderItem schema already contains commercial snapshot fields, preserve them according to the existing schema, but do not create new pricing logic.

The PO remains the commercial source of truth.

---

# 8. SERVICE MODE

LOCKED DECISION:

serviceMode is copied from CalibrationRequest when WorkOrder is created.

Conceptually:

CalibrationRequest.serviceMode
↓
Quotation / PO lifecycle
↓
WorkOrder.serviceMode

At WorkOrder creation:

WorkOrder.serviceMode = source CalibrationRequest.serviceMode

ServiceMode is operational data, not commercial data.

It MAY be updated while WorkOrder is non-terminal:

- PLANNED
- ASSIGNED
- IN_PROGRESS

It MUST be locked once WorkOrder reaches:

- DONE
- CANCELLED

Follow the actual existing schema/type/enum for serviceMode.

Do not invent another representation.

---

# 9. WORKORDER STATUS

Final MVP status vocabulary:

PLANNED
ASSIGNED
IN_PROGRESS
DONE
CANCELLED

There is NO:

- DRAFT
- APPROVED
- TECHNICALLY_DONE
- COMPLETED
- CLOSED

DONE = WorkOrder process is completely finished.

CANCELLED = WorkOrder process was stopped/cancelled.

Both are terminal states.

Allowed lifecycle:

PLANNED
↓
ASSIGNED
↓
IN_PROGRESS
↓
DONE

Cancellation:

PLANNED → CANCELLED
ASSIGNED → CANCELLED
IN_PROGRESS → CANCELLED

Terminal:

DONE → no transition
CANCELLED → no transition

Specifically:

DONE → CANCELLED = NOT ALLOWED

CANCELLED → any state = NOT ALLOWED

Do not add any other status.

If the existing Prisma enum contains legacy values, preserve them if necessary for migration safety, but the WorkOrder API must only use the final MVP statuses above.

---

# 10. STATUS ACTIONS

Implement explicit service/controller actions following the existing project pattern.

Expected actions conceptually:

Create:
POST /work-orders

Update:
PATCH /work-orders/:id

Assign:
POST /work-orders/:id/assign

Start:
POST /work-orders/:id/start

Done:
POST /work-orders/:id/done

Cancel:
POST /work-orders/:id/cancel

Verify the actual route naming conventions used by the project before implementing.

Do NOT blindly copy these paths if the existing project uses a different convention.

The API must enforce valid status transitions server-side.

UI is not the authorization boundary.

---

# 11. ASSIGNMENT

Use the existing WorkOrder assignment fields/model if already present.

Determine from the actual schema how ASSIGNED is represented.

MVP requirement:

A WorkOrder can move:

PLANNED → ASSIGNED

when the appropriate assignee/technician information is provided.

Do not implement:

- technician scheduling engine;
- workload optimization;
- automatic technician allocation;
- advanced dispatching.

If the existing assignment structure supports the MVP, use it.

Do not invent a new assignment architecture.

---

# 12. OPERATIONAL FIELDS

Preserve/use the existing WorkOrder operational fields where applicable, including fields such as:

- serviceMode
- addressText
- geoLat
- geoLng
- locationNotes
- scheduledStart
- scheduledEnd
- assignment fields

Do not add fields simply because they may be useful in the future.

Do not add a generic `notes` field unless it already exists or the current schema clearly requires it.

---

# 13. CREATE WORKORDER

Create must happen inside a transaction.

The service should:

1. validate company scope;
2. load the PurchaseOrder;
3. verify PO belongs to current company;
4. verify PO status = APPROVED;
5. verify source PO is eligible;
6. check active WorkOrder duplicate;
7. load the complete PurchaseOrder;
8. load all PurchaseOrderItems;
9. derive customer/quotation/request relationships from PO;
10. derive serviceMode from CalibrationRequest;
11. allocate WorkOrder document number;
12. create WorkOrder;
13. create ALL WorkOrderItems as snapshot copies;
14. commit atomically.

If any step fails:

No partial WorkOrder or WorkOrderItem records may remain.

Use the existing transaction/document-number pattern from Quotation/PurchaseOrder.

---

# 14. CLIENT CREATE PAYLOAD

The client must NOT be allowed to submit commercial or source-of-truth values.

Create payload should contain only fields genuinely required to create an operational WorkOrder.

Conceptually:

purchaseOrderId
serviceMode / operational fields where appropriate
scheduling/location/assignment data if supported by the existing contract

The client must NOT provide authoritative:

- companyId
- customerId
- quotationId
- items
- quantity
- price
- discount
- tax
- subtotal
- total
- currency

The server derives/snapshots these from the source PO.

Use actual shared Zod schema conventions.

---

# 15. UPDATE

Only non-terminal WorkOrders may be updated:

PLANNED
ASSIGNED
IN_PROGRESS

DONE and CANCELLED are fully locked.

Commercial/source fields are never editable through WorkOrder update.

At minimum, update only operational fields supported by the current schema.

serviceMode is editable while non-terminal.

Do not allow changing:

purchaseOrderId
quotationId
customerId
WorkOrderItems commercial snapshot
document number

unless the existing domain explicitly requires otherwise.

---

# 16. WORKORDER ITEM UPDATE

For MVP, WorkOrderItem quantities and source item identity are NOT editable.

Do not implement:

- quantity split;
- partial quantity;
- allocation;
- deallocation;
- item reassignment;
- merge;
- split;
- partial completion.

WorkOrderItem is created as the full snapshot of the source PO item.

If future allocation fields already exist, leave them untouched/unpopulated unless required by the existing schema.

---

# 17. CANCEL

Implement:

PLANNED → CANCELLED
ASSIGNED → CANCELLED
IN_PROGRESS → CANCELLED

Do NOT allow:

DONE → CANCELLED
CANCELLED → CANCELLED
CANCELLED → any state

Do not delete the WorkOrder.

Cancellation preserves the audit trail.

If an existing cancellation reason field exists, use it.

Do not invent a new cancellation model.

---

# 18. DONE

Implement:

IN_PROGRESS → DONE

DONE is terminal.

After DONE:

- no update;
- no reassignment;
- no cancellation;
- no status reversal.

Do not create CLOSED.

Do not create TECHNICALLY_DONE.

---

# 19. CALIBRATIONJOB BOUNDARY

Do NOT implement CalibrationJob in this task.

Do NOT automatically create CalibrationJob when WorkOrder is created.

Do NOT automatically create CalibrationJob when WorkOrder becomes IN_PROGRESS.

Do NOT automatically create CalibrationJob when WorkOrder becomes DONE.

Only preserve the existing relation/boundary so CalibrationJob can be implemented later.

The future conceptual relationship is:

1 WorkOrder → N CalibrationJob

Do not modify CalibrationJob schema unless absolutely required to make WorkOrder schema compile/migrate.

If the existing CalibrationJob Device FK conflicts with the current PKM device model, report it rather than introducing Device master behavior.

---

# 20. DOCUMENT NUMBERING

Use the existing DocumentNumberService.

WorkOrder document type:

WORK_ORDER

Expected prefix:

SPK

Expected business format:

SPK/YYYY/MM/NNNNN

Sequence must follow the same company-scoped numbering pattern used by existing modules.

Do not implement a new numbering mechanism.

Do not trust client-supplied WorkOrder number.

---

# 21. PERMISSIONS

Use the existing WorkOrder permission catalog if present.

Expected conceptual permissions:

workOrder:read
workOrder:create
workOrder:update
workOrder:cancel
workOrder:assign

Use the actual naming from the repository.

Follow existing:

- CompanyRoleGuard
- permission guard
- SUPERADMIN bypass

Do not create a parallel authorization system.

Do not grant permissions to roles unless required by the existing seed pattern and current contract.

If seed changes are necessary, follow the exact pattern already used by Quotation/PurchaseOrder.

---

# 22. COMPANY SCOPING

All WorkOrder operations must be company-scoped.

companyId comes from authenticated company context / CompanyRoleGuard.

Never trust:

companyId from client payload.

Every:

- create
- list
- get
- update
- status transition
- assignment

must respect company scope.

---

# 23. LIST / GET

Implement standard backend endpoints following existing Quotation/PurchaseOrder patterns.

At minimum:

- list WorkOrders;
- get WorkOrder detail.

Include enough relation data for the Portal later to display:

- WorkOrder number
- status
- customer
- PurchaseOrder
- Quotation
- CalibrationRequest
- serviceMode
- operational fields
- WorkOrderItems
- device information available through the existing document chain
- scheduling/assignment information

Do not over-fetch unrelated modules.

Follow existing pagination/search conventions.

---

# 24. ERROR HANDLING

Follow existing service error patterns.

At minimum handle:

- PurchaseOrder not found;
- PurchaseOrder belongs to another company;
- PurchaseOrder not APPROVED;
- active WorkOrder already exists;
- invalid status transition;
- terminal WorkOrder modification;
- unauthorized action;
- missing/invalid source relationships.

Use clear business error codes/messages consistent with existing modules.

For duplicate active WorkOrder, use a dedicated business error code following the project's existing naming convention.

Do not silently overwrite an existing WorkOrder.

---

# 25. MIGRATION

Before migration:

Inspect current schema and migration history.

Expected schema changes may include:

- final WorkOrder status `DONE`;
- WorkOrder/WorkOrderItem relations required for the MVP;
- constraints/indexes needed for 1 PO → 1 active WorkOrder;
- any required field nullability changes.

Do not remove legacy enum values if doing so would create unnecessary migration risk.

Do not make unrelated schema changes.

Do not change CalibrationRequest/Quotation/PurchaseOrder schema unless strictly required by an identified WorkOrder relationship.

Review generated migration SQL before applying.

Apply migration only after confirming existing data is safe.

---

# 26. TESTS

Create comprehensive WorkOrder service tests following the testing style of Quotation/PurchaseOrder.

At minimum test:

### Creation

- approved PO can create WorkOrder;
- non-approved PO is rejected;
- missing PO is rejected;
- cross-company PO is rejected;
- WorkOrder starts as PLANNED;
- WorkOrder number is generated correctly;
- customer is derived from PO;
- quotation relation is derived from PO;
- serviceMode is copied from CalibrationRequest;
- all PO items become WorkOrderItems;
- WorkOrderItem quantity matches PurchaseOrderItem;
- source item traceability is preserved;
- commercial snapshot values are not client-controlled.

### Cardinality

- active WorkOrder prevents second WorkOrder;
- CANCELLED WorkOrder does not block creation of a replacement;
- historical CANCELLED WorkOrder remains intact.

### Status

Test every allowed transition:

PLANNED → ASSIGNED
PLANNED → CANCELLED
ASSIGNED → IN_PROGRESS
ASSIGNED → CANCELLED
IN_PROGRESS → DONE
IN_PROGRESS → CANCELLED

Test invalid transitions:

PLANNED → IN_PROGRESS
PLANNED → DONE
ASSIGNED → DONE
DONE → CANCELLED
DONE → any state
CANCELLED → any state

### Update

- operational fields can be updated while non-terminal;
- serviceMode can be updated while non-terminal;
- DONE cannot be updated;
- CANCELLED cannot be updated;
- source/commercial fields cannot be changed.

### Transaction

Verify that if WorkOrderItem creation fails, WorkOrder creation is rolled back.

### Authorization

Verify company scoping and permissions.

Do not report skipped tests as passing.

---

# 27. TYPECHECK / BUILD

Run actual checks:

pnpm --filter @medcal/shared typecheck

pnpm --filter @medcal/api typecheck

pnpm --filter @medcal/api build

Run the WorkOrder test suite.

Also run affected existing tests for:

- PurchaseOrder
- Quotation
- access control

Do not weaken existing tests to make WorkOrder pass.

---

# 28. FINAL REPORT

After implementation, report:

1. Exact files created/changed.
2. Migration name and purpose.
3. Final WorkOrder schema.
4. Final WorkOrderItem schema.
5. PO → WO cardinality enforcement.
6. WorkOrder → WorkOrderItem relationship.
7. Source/snapshot chain.
8. Device source handling.
9. serviceMode behavior.
10. Status enum and every allowed transition.
11. Terminal states.
12. Assignment behavior.
13. Permissions.
14. Document numbering.
15. API endpoints.
16. Create payload.
17. Update behavior.
18. Tests with exact pass/fail/skipped counts.
19. Shared typecheck.
20. API typecheck.
21. API build.
22. Any unresolved issue.

Explicitly confirm:

```text
PurchaseOrder APPROVED
        ↓
Create WorkOrder
        ↓
PLANNED
        ↓
ASSIGNED
        ↓
IN_PROGRESS
        ↓
DONE
```
