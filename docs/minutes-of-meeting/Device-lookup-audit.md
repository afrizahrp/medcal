# Task: Technician Device Lookup

Implement the **Technician Device Lookup** task in the Medcal project.

## IMPORTANT — EXECUTION RULES

**DO NOT AUDIT AGAIN. DO NOT REDESIGN. DO NOT ADD FEATURES. IMPLEMENT ONLY THE DEFINED SCOPE.**

You must inspect the existing code and current implementation **before making any changes**.

The goal is to implement the already-defined Technician Device Lookup flow, using the existing Medcal architecture, naming conventions, UI patterns, query hooks, endpoints, and data model wherever possible.

Do not introduce a new architecture or parallel mechanism if an existing mechanism can be reused.

---

## 1. Scope

The scope of this task is:

> Allow a Technician to **look up and select the Device** associated with the relevant work/transaction from the existing Device data.

This task is specifically about **Technician Device Lookup**.

### Explicitly OUT OF SCOPE

Do not implement or redesign:

* `qty > 1` → selecting/determining a Device for each individual unit.
* Multi-device allocation per quantity.
* New Device management/master-data functionality.
* Changes to requisition/quotation/business workflow.
* Changes to Device identity rules already finalized.
* AKD/AKL logic.
* Unrelated UX improvements.
* Unrelated API cleanup/refactoring.
* Changes to PDF/reporting.
* Changes to other roles unless strictly required to support the Technician lookup flow.

The `qty > 1` per-unit Device selection mechanism will be handled as a **separate task**.

---

## 2. Existing Device Identity Decision

Preserve the existing `deviceId`.

Do not replace or rename `deviceId` merely because other Device identity fields exist.

Use the existing Device identity model and relationships already present in the codebase.

Before editing, trace:

* Device entity/model
* Device ID
* Device number/code/serial/other existing identity fields
* Existing relations to customer/site/location/asset/etc.
* Existing Technician-facing APIs
* Existing query hooks
* Existing Device selectors/lookups

Use the existing canonical relationship instead of creating a duplicate identity mechanism.

---

## 3. Required Investigation Before Implementation

Inspect the repository first.

Trace the complete current flow:

```text
Technician UI
    ↓
Tech PWA query hook / API client
    ↓
Backend endpoint
    ↓
Service/use-case
    ↓
Device query/data access
    ↓
Database
```

Identify:

1. Where the Technician currently receives the relevant transaction/work data.
2. Whether a Device is already returned anywhere in that flow.
3. Whether `deviceId` is already available.
4. Whether there is already a Device lookup endpoint/query that can be reused.
5. Existing UI components/patterns for searchable selectors.
6. Existing authorization/role constraints for Technician.
7. Existing loading, empty, and error-state patterns.
8. Existing cache/query invalidation patterns.

Do not modify anything during this investigation phase.

After understanding the existing flow, implement the smallest change required.

---

## 4. Functional Requirement

The Technician must be able to:

1. Open the relevant Technician workflow.
2. Access the Device selection/lookup.
3. Search/find the applicable Device using the existing Device identity information available in the system.
4. Select the Device.
5. Persist/use the selected `deviceId` through the existing workflow.
6. Re-open the workflow and see the selected Device correctly.

The lookup should use the existing Device records and existing authorization rules.

Do not create a new Device record as part of this task.

---

## 5. Lookup Behavior

Reuse the existing search/select UX pattern in Tech PWA where possible.

The lookup should:

* Support searching using the Device identity fields that are already intended for Technician lookup.
* Return only Devices the Technician is authorized to access in the relevant context.
* Avoid loading an unnecessarily large Device dataset into the browser if an existing server-side search mechanism is available.
* Preserve the existing API/query conventions.
* Show an appropriate empty state when no Device matches.
* Show the existing loading state while searching/loading.
* Show the existing error state if lookup fails.

Do not invent additional search fields unless the existing data model and current UX clearly require them.

---

## 6. Context Filtering

This is important.

The lookup must not become a generic unrestricted Device selector.

Inspect the existing transaction/work context and determine the correct existing relationship/filter for the Technician.

For example, if the current workflow already establishes a customer/site/location/work-order context, use that existing context to constrain the Device lookup.

Do not invent new business rules.

If the current code already contains the correct context relationship, reuse it.

---

## 7. Persistence

The selected Device must continue to use:

```text
deviceId
```

as the persisted identity.

Do not introduce:

```text
newDeviceId
```

or another replacement identity field.

Do not remove `deviceId`.

If a migration is genuinely required to support the lookup, create only the minimum migration necessary.

Do not create migrations merely for cleanup or speculative future functionality.

---

## 8. API / Backend

Inspect the existing backend first.

If an existing endpoint already provides the required Device lookup capability:

> Reuse it.

If the existing endpoint cannot support the required Technician lookup:

> Extend it minimally.

Only create a new endpoint if there is genuinely no appropriate existing endpoint to extend/reuse.

Follow the existing project conventions for:

* route naming
* DTO/schema
* authorization
* validation
* pagination/search
* service/use-case structure
* error handling
* response format

Do not refactor unrelated backend code.

---

## 9. Tech PWA

Implement the lookup in the existing Technician PWA flow.

Reuse existing:

* components
* query hooks
* API client
* selector/dropdown patterns
* form state
* validation
* loading states
* error states

Do not introduce a new UI library or a new interaction pattern if an existing equivalent already exists.

Keep the UI change focused strictly on Device lookup.

---

## 10. Query Hook / Cache

Follow the existing React Query/query-hook conventions.

The selected Device should correctly propagate through the existing state/query flow.

Do not introduce unnecessary duplicated state.

Ensure that:

* lookup results are correctly scoped
* stale data does not incorrectly appear for another work item/context
* the selected Device is reflected after save
* existing cache invalidation/refetch patterns are preserved

---

## 11. Validation

Before considering the task complete, verify:

### UI

* Technician can open Device lookup.
* Technician can search for a Device.
* Matching Devices are displayed.
* Technician can select a Device.
* Selected Device is visible after selection.
* Save/submit works through the existing workflow.
* Reopening the workflow shows the persisted Device.

### Negative cases

* No matching Device.
* Lookup/loading state.
* Lookup/API failure.
* Technician attempting to access a Device outside the allowed context.
* Existing Device remains correctly selected when editing an existing record.

### Regression

Verify that existing Technician workflow behavior remains unchanged outside this scope.

---

## 12. Tests

Inspect the existing test structure first.

Add or update only the tests necessary for this task.

At minimum cover:

1. Device lookup returns matching Devices.
2. Search/filter behavior.
3. Technician authorization/context filtering.
4. Device selection.
5. Persisted `deviceId`.
6. Existing selected Device loads correctly.
7. Empty result.
8. Relevant API/UI error path.

Do not rewrite unrelated tests.

Run the relevant focused test suite first.

Then run the broader relevant suite if practical.

---

## 13. Migration Rule

Only create a migration if the implementation genuinely requires a database/schema change.

If no schema change is required:

> Do not create a migration.

If a migration is required:

* explain exactly why;
* modify only the required field/index/constraint;
* preserve existing data;
* do not perform unrelated schema cleanup.

---

## 14. Final Verification

After implementation, verify the complete flow:

```text
Technician
  ↓
Device Lookup
  ↓
Search existing Device
  ↓
Select Device
  ↓
deviceId
  ↓
Existing workflow persistence
  ↓
Reload
  ↓
Same Device is displayed
```

Also verify that the implementation does **not** accidentally introduce:

* a second Device identity
* unrestricted Device access
* per-unit quantity allocation
* unrelated UI changes
* unrelated API changes
* AKD/AKL dependencies
* new business rules

---

## 15. Final Report

When finished, report:

### Changed

List the exact files/components/endpoints/migrations changed and what each change does.

### Reused

List existing mechanisms that were reused.

### Migration

State explicitly:

* `Migration required: YES/NO`
* If YES, explain why.

### Tests

Report:

* tests added/changed
* focused test result
* broader test result if run

### Scope Check

Explicitly confirm:

* `deviceId` preserved
* no `newDeviceId` introduced
* `qty > 1` per-unit Device selection NOT implemented
* no unrelated redesign
* no unrelated feature added

If something cannot be implemented because the existing architecture does not support it, stop and report the exact blocker rather than inventing a new business rule.
