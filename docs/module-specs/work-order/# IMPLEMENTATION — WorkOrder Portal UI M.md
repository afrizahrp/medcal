# IMPLEMENTATION — WorkOrder Portal UI MVP

## MODE

IMPLEMENTATION MODE — PORTAL UI ONLY.

The WorkOrder backend MVP is already implemented and tested.

Build the **WorkOrder Portal UI MVP** following the existing UI patterns already established by:

- CalibrationRequest
- Quotation
- PurchaseOrder

The current repository is the source of truth.

Before editing, inspect the actual implementation of those three modules, especially:

- list pages
- detail pages
- create/edit forms
- status badges
- action buttons
- confirmation dialogs
- permission checks
- API client/query/mutation patterns
- loading states
- empty states
- error handling
- toast/notification patterns
- navigation/sidebar
- card/layout patterns
- table patterns
- responsive behavior

Do NOT create a new UI architecture.

Do NOT redesign CalibrationRequest, Quotation, or PurchaseOrder UI.

Do NOT implement CalibrationJob.

Do NOT implement MeasurementEntry.

Do NOT implement allocation/split/partial-quantity UI.

Do NOT modify backend business rules unless required to fix a concrete Portal integration issue.

---

# FINAL WORKORDER MVP CONTRACT

The final lifecycle is:

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

Cancellation:

PLANNED → CANCELLED
ASSIGNED → CANCELLED
IN_PROGRESS → CANCELLED

Terminal states:

DONE
CANCELLED

There is NO:

- CLOSED
- TECHNICALLY_DONE
- COMPLETED
- DRAFT
- APPROVED

Do not expose unsupported statuses or transitions in the UI.

---

# 1. PRIMARY USER FLOW

The main creation flow starts from an APPROVED PurchaseOrder.

Conceptually:

PurchaseOrder Detail
↓
[Create WorkOrder]
↓
WorkOrder Create
↓
PLANNED

Only allow the action when the PurchaseOrder is eligible according to the backend.

The backend remains authoritative.

Do not duplicate complex eligibility logic in the Portal.

---

# 2. CREATE WORKORDER

Create a WorkOrder creation form following the existing form pattern used by Quotation and PurchaseOrder.

The user should NOT be asked to manually re-enter information already present in the PurchaseOrder.

Conceptually:

WorkOrder

Source Purchase Order
[ PUR-YYYY/MM/NNNNN ] READ-ONLY

Customer
[ Customer Name ] READ-ONLY

Quotation
[ QUO-YYYY/MM/NNNNN ] READ-ONLY

Service Mode
[ existing serviceMode selector ]

Operational information
[ existing fields supported by schema ]

Schedule
[ existing scheduled fields ]

Location
[ existing address / geo / location fields ]

---

Purchase Order Items

Item
Qty
Device / Device Identifier
Description

---

[ Create WorkOrder ]

Use the actual fields/components available in the repository.

Do NOT invent additional fields.

3. WORKORDER IS OPERATIONAL, NOT COMMERCIAL

The WorkOrder UI must NOT behave like a second Quotation or PurchaseOrder editor.

Commercial information is inherited from the PurchaseOrder.

Do NOT create editable controls for:

unitPrice
item price
item discount
header discount
taxCode
taxRate
taxAmount
subtotal
totalAmount
currency

If commercial values are useful for audit/context, they may be shown READ-ONLY using the existing document/detail patterns.

Do not make them editable.

4. WORKORDER ITEM

WorkOrderItem MUST be displayed.

The relationship is:

PurchaseOrder
↓
WorkOrder
↓
WorkOrderItem

For MVP:

ALL PurchaseOrderItems become WorkOrderItems.

Therefore the UI must display the complete WorkOrder item list.

Do NOT implement:

item selection
item checkbox allocation
partial selection
split
partial quantity
allocation percentage
allocation status
deallocation
item reassignment

The user should not be able to remove or add WorkOrderItems manually.

5. DEVICE DISPLAY

PKM does NOT use Device master as the business source of truth.

Do NOT create a Device selector.

Do NOT require selecting a Device master record.

Do NOT create Device records.

Display the available device information from the existing document chain / WorkOrderItem relation.

The UI should present the device identifier/information available from:

CalibrationRequestItem
↓
QuotationItem
↓
PurchaseOrderItem
↓
WorkOrderItem

Use the actual API response and existing schema.

Do not invent a new Device model.

If the API currently exposes device information through nested relations, use that existing response.

6. SERVICE MODE

ServiceMode is operational data.

At WorkOrder creation it is copied from CalibrationRequest.

In Portal:

show the current Service Mode;
allow editing while WorkOrder is non-terminal;
lock it when WorkOrder is DONE or CANCELLED.

Non-terminal:

PLANNED
ASSIGNED
IN_PROGRESS

Editable.

Terminal:

DONE
CANCELLED

Locked.

Follow the existing ServiceMode component/enum pattern.

Do not create another representation.

7. OPERATIONAL FIELDS

Use the actual existing WorkOrder schema.

Where supported, display/edit:

serviceMode
addressText
geoLat
geoLng
locationNotes
scheduledStart
scheduledEnd
technician/assignment information

Do NOT add:

generic notes field
new scheduling system
dispatch engine
route optimization
technician workload engine

If a field does not exist in the actual API/schema, do not invent it.

8. WORKORDER LIST PAGE

Implement a WorkOrder list page following the PurchaseOrder/Quotation list-page pattern.

Use the actual API response fields.

Useful columns should include, where available:

WorkOrder Number
Status
Customer
PurchaseOrder
Quotation
Service Mode
Scheduled Start
Scheduled End
Created At

Do not mechanically add every field.

Prioritize fields useful for daily operational management.

Follow existing patterns for:

pagination
search
filters
sorting
loading
empty state
error state

Do not introduce advanced filtering unless the existing application pattern already supports it.

9. WORKORDER DETAIL PAGE

Build the WorkOrder detail page following the existing detail-page pattern.

The detail page should clearly show:

Header
WorkOrder Number
Status
Customer
PurchaseOrder
Quotation
Operational information
Service Mode
Address
Location
Schedule
Assignment/technicians
WorkOrder Items

Display all WorkOrderItems.

For each item show the actual useful operational information available, such as:

description
quantity
device identifier
source PurchaseOrderItem reference if useful

Do not expose editing controls for item source/quantity.

Audit information

Use existing project conventions for:

createdAt
updatedAt
assignedAt
startedAt
doneAt
cancelledAt
assignedBy
etc.

Only display fields that actually exist.

Do not invent audit fields.

10. STATUS BADGE

Use the existing status badge component/pattern.

Recommended display:

PLANNED
ASSIGNED
IN PROGRESS
DONE
CANCELLED

Do not display legacy statuses:

TECHNICALLY_DONE
CLOSED

even if they remain in the database enum.

The Portal should only expose the active MVP vocabulary.

11. STATUS ACTIONS

Actions must depend on current status.

PLANNED

Show:

Assign
Cancel

Do not show Start or Done.

ASSIGNED

Show:

Start
Cancel

Do not show Assign again unless the existing backend explicitly supports reassignment.

IN_PROGRESS

Show:

Mark as Done
Cancel
DONE

No workflow action.

Fully locked.

CANCELLED

No workflow action.

Fully locked.

Do not expose invalid transitions.

12. ASSIGN TECHNICIANS

Use the existing backend endpoint:

POST /work-orders/:id/assign

The backend accepts:

technicians[]:

technicianUserId
roleOnJob (optional)

Follow the actual API contract.

Build the assignment UI using existing project patterns.

Requirements:

technician must be selectable only if eligible according to backend;
support multiple technicians if the API supports it;
do not build a scheduling/dispatch engine;
do not build workload optimization.

Assignment action transitions:

PLANNED → ASSIGNED

The UI should refresh the WorkOrder after successful assignment.

13. START

Use the existing backend action:

POST /work-orders/:id/start

Only expose it for:

ASSIGNED

Successful action:

ASSIGNED → IN_PROGRESS

Use the existing confirmation/action pattern where appropriate.

After success, refresh the WorkOrder detail and relevant list data.

14. MARK DONE

Use the existing backend action:

POST /work-orders/:id/done

Only expose it for:

IN_PROGRESS

Successful action:

IN_PROGRESS → DONE

Use a confirmation dialog.

The confirmation should clearly communicate:

Mark this WorkOrder as DONE?
Once completed, the WorkOrder becomes locked.

After DONE:

no edit;
no assignment;
no cancel;
no status reversal.

Do not introduce CLOSED.

15. CANCEL

Use:

POST /work-orders/:id/cancel

Allowed only from:

PLANNED
ASSIGNED
IN_PROGRESS

Use the existing confirmation dialog pattern.

If the backend supports a cancellation reason, use the actual schema/API.

Do not invent a cancellation reason field.

After cancellation:

WorkOrder remains visible;
it becomes read-only;
no further workflow action is available.

Do NOT delete the WorkOrder.

16. EDIT

WorkOrder can be edited only while non-terminal:

PLANNED
ASSIGNED
IN_PROGRESS

Editable operational fields should follow the actual backend contract.

At minimum:

serviceMode
operational/location fields
schedule fields

Do NOT allow editing:

purchaseOrderId
quotationId
customerId
WorkOrder number
WorkOrderItems
item quantity
commercial values
tax
discount
totals

DONE and CANCELLED are fully locked.

17. CREATE PAYLOAD

When creating WorkOrder, the Portal must send only fields accepted as client-controlled by the backend.

Conceptually:

purchaseOrderId
serviceMode / operational fields
location fields
schedule fields

Do NOT send as authoritative values:

companyId
customerId
quotationId
WorkOrder number
items
qty
unitPrice
discount
taxCode
taxRate
taxAmount
subtotal
totalAmount
currency

The backend derives/snapshots these values.

18. PURCHASE ORDER → WORKORDER ACTION

On PurchaseOrder detail:

Show:

[Create WorkOrder]

only when appropriate according to the backend/API state.

After a WorkOrder already exists:

Do not show a duplicate Create WorkOrder action for an active WorkOrder.

If the existing WorkOrder is CANCELLED and backend allows recreation, the UI should allow creation of a replacement.

Do not implement duplicate business logic independently if the backend already exposes the necessary state.

If the backend returns:

DUPLICATE_ACTIVE_WORK_ORDER_FOR_PURCHASE_ORDER

show a clear user-facing error using existing error handling patterns.

19. NAVIGATION

Add WorkOrder to Portal navigation/sidebar following the existing navigation pattern.

Use the project's existing icon conventions.

Do not redesign navigation.

Visibility must respect:

workOrder:read

Use the actual permission naming from the repository.

20. PERMISSIONS

Use existing WorkOrder permissions:

workOrder:read
workOrder:create
workOrder:update
workOrder:cancel
workOrder:assign

Use actual naming from the repository if different.

Examples:

list/detail → read
Create WorkOrder → create
edit → update
cancel → cancel
assign → assign
start/done → follow existing backend permission convention

UI permission checks are for UX only.

Backend remains authoritative.

Do not create a new authorization system.

21. API INTEGRATION

Use the existing Portal API client/query/mutation architecture.

Do NOT create a new API abstraction.

Use the actual current routes:

GET /work-orders
GET /work-orders/:id
POST /work-orders
PATCH /work-orders/:id
POST /work-orders/:id/assign
POST /work-orders/:id/start
POST /work-orders/:id/done
POST /work-orders/:id/cancel

Verify actual controller routes before implementation.

Use existing query invalidation/refetch conventions.

22. LOADING / ERROR / EMPTY STATES

Follow existing Portal conventions.

Handle:

loading list
loading detail
empty WorkOrder list
not found
permission denied
create failure
update failure
invalid transition
duplicate active WorkOrder
assignment failure
start failure
done failure
cancellation failure

Do not leave stale UI after mutations.

23. RESPONSIVE UI

Follow the existing responsive patterns used by CalibrationRequest, Quotation, and PurchaseOrder.

Do not introduce:

new CSS architecture
new component library
new layout framework
unrelated visual redesign

Reuse existing components wherever possible.

24. NO PDF / EMAIL IN THIS TASK

Do NOT implement:

WorkOrder PDF
WorkOrder email
customer portal
WhatsApp
electronic signature

unless the existing WorkOrder UI already contains an established implementation that only needs wiring.

These are outside this MVP Portal task.

25. NO CALIBRATIONJOB

Do NOT implement CalibrationJob.

Do NOT create CalibrationJob automatically when:

WorkOrder is created;
WorkOrder is assigned;
WorkOrder starts;
WorkOrder becomes DONE.

WorkOrder → CalibrationJob is a future module boundary.

Do not modify CalibrationJob schema.

Do not modify Device master.

26. TESTS

Follow existing Portal test conventions.

Add/update tests for:

Navigation
WorkOrder menu respects permission.
List
renders WorkOrder list;
loading state;
empty state;
error state.
Create
approved PO can initiate WorkOrder creation;
source PO/customer/quotation are read-only;
only client-controlled fields are submitted;
all WorkOrderItems are displayed after creation.
Detail
WorkOrder header renders;
status renders;
PO/Quotation references render;
serviceMode renders;
WorkOrderItems render;
device information renders from available document relation;
operational fields render.
Status actions

PLANNED:

Assign visible;
Cancel visible;
Start hidden;
Done hidden.

ASSIGNED:

Start visible;
Cancel visible.

IN_PROGRESS:

Done visible;
Cancel visible.

DONE:

no workflow actions;
fields locked.

CANCELLED:

no workflow actions;
fields locked.
Assignment
technician selection works;
assignment mutation works;
successful assignment refreshes state.
Start
only available from ASSIGNED;
successful transition to IN_PROGRESS.
Done
only available from IN_PROGRESS;
confirmation works;
successful transition to DONE;
UI becomes locked.
Cancel
available from PLANNED/ASSIGNED/IN_PROGRESS;
unavailable from DONE;
successful transition to CANCELLED;
UI becomes locked.
Duplicate
active WorkOrder duplicate error is handled correctly;
cancelled WorkOrder does not permanently block replacement.

Do not report skipped tests as passing.

27. TYPECHECK / BUILD

Run actual checks:

pnpm --filter @medcal/portal typecheck

pnpm --filter @medcal/portal build

Run relevant Portal tests.

Do not weaken existing tests to make the implementation pass.

28. FINAL REPORT

After implementation, report:

Exact files created/changed.
Routes consumed.
Navigation/menu changes.
List page.
Detail page.
Create flow.
Editable fields.
Locked/read-only fields.
WorkOrderItem presentation.
Device information presentation.
serviceMode behavior.
Assignment behavior.
Status actions.
Permission behavior.
Duplicate active WorkOrder handling.
Tests with exact pass/fail/skipped counts.
Portal typecheck result.
Portal build result.
Any unresolved issue.

Explicitly confirm:

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

or:

PLANNED → CANCELLED
ASSIGNED → CANCELLED
IN_PROGRESS → CANCELLED

Terminal states:

DONE
CANCELLED

Also confirm:

1 PurchaseOrder
↓
1 active WorkOrder
↓
N WorkOrderItems

All PurchaseOrderItems
↓
WorkOrderItems

Allocation:
NOT IMPLEMENTED

Split:
NOT IMPLEMENTED

Partial quantity:
NOT IMPLEMENTED

CalibrationJob:
NOT IMPLEMENTED

Device master:
NOT REQUIRED

serviceMode:
COPIED FROM CALIBRATION REQUEST
EDITABLE WHILE NON-TERMINAL

DONE:
TERMINAL

CANCELLED:
TERMINAL

DONE → CANCELLED:
NOT ALLOWED

Do not modify unrelated modules.

PORTAL UI ONLY.
