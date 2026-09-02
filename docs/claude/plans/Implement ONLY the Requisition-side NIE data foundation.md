Implement ONLY the Requisition-side NIE / AKD / AKL data foundation.

Context / locked business decisions:

- Medical-device identity has three distinct concepts:
  1. MedCal Device.code = system identity
  2. Device.serialNumber = physical device identity
  3. AKD/AKL/NIE = medical-device distribution permit identity
- At Requisition stage, the customer may provide the AKD/AKL/NIE or may not know it yet.
- Therefore NIE information at Requisition is nullable and represents customer-provided/declaration information.
- It is NOT yet the authoritative technical verification value.
- The authoritative verified snapshot will later exist at CalibrationJob.

Scope for this step ONLY:

1. Requisition data model

- Add the minimum required field(s) to store the customer's declared AKD/AKL/NIE.
- Add a declaration status with these values:
  - NOT_PROVIDED
  - CUSTOMER_DECLARED_NONE
  - CUSTOMER_PROVIDED
- Follow existing project naming, enum, migration, and schema conventions.

2. Requisition UI / input

- Allow the user to enter the customer's AKD/AKL/NIE when creating/editing a Requisition item.
- The field must remain nullable.
- Do not make it mandatory at Requisition.
- Do not implement technical verification yet.

3. Excel import

- Inspect the existing Requisition Excel import structure before changing it.
- If each Excel row represents one physical device/item, add nullable AKD/AKL/NIE support to the import.
- If a row can represent quantity > 1 and therefore cannot reliably represent one NIE per physical device, do NOT invent a data rule.
- In that case, preserve the current import behavior and report the limitation clearly.

4. Validation

- Add only basic validation appropriate for a customer-declared value.
- Do not attempt to validate the NIE against Kemenkes or any external registry.
- Do not infer whether a device legally requires NIE at this stage.

5. Downstream documents

- Do NOT add independent authoritative NIE fields to Quotation, PO, WO, or DLN in this step.
- Do NOT create duplicated authoritative values.
- Do NOT modify CalibrationJob yet.
- Downstream visibility/read-through will be handled in a later step.

6. Audit / workflow

- Do NOT implement AuditLog yet.
- Do NOT implement approval workflow.
- Do NOT implement NOT_APPLICABLE approval.
- Do NOT implement EXCEPTION_PENDING.
- Do NOT implement Identity Correction.
- Do NOT modify Technician App.

Important:

- Do not refactor unrelated code.
- Do not change existing business behavior outside this scope.
- Reuse existing architecture and conventions wherever possible.

After implementation:

1. Run the relevant migration, type-check, build, and tests.
2. Report exactly which files were changed.
3. Show the final Requisition data structure for AKD/AKL/NIE and declaration status.
4. Explain how the Excel import handles quantity > 1.
5. Confirm that no authoritative NIE data was added to Quotation, PO, WO, DLN, or CalibrationJob.
6. Stop here. Do not proceed to the next phase.
