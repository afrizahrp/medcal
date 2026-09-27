TASK — AUDIT AND IMPLEMENT REQUIRED DEVICE ID THROUGHOUT CALIBRATION CHAIN

IMPORTANT:
A comprehensive Device ID inheritance audit was already completed previously.
Do NOT repeat that broad audit.

This task is a TARGETED AUDIT + IMPLEMENTATION of one newly locked business
invariant:

============================================================
LOCKED BUSINESS INVARIANT
============================================================

NULL deviceId is NOT a valid business state anywhere in the operational
calibration document chain.

The following entities MUST always have a valid Device.id:

    CalibrationRequestItem
    QuotationItem
    PurchaseOrderItem
    WorkOrderItem
    CalibrationJob
    DeliveryNote

Therefore, for every entity above:

    deviceId MUST be required

and:

    deviceId MUST be a real FK to Device.id

The intended schema semantics are:

    deviceId String
    device   Device @relation(
        fields: [deviceId],
        references: [id],
        onDelete: Restrict
    )

Do NOT interpret "String" as free text.

Device.id itself is a String/CUID.

Serial Number is NOT the identity field.

============================================================
IMPORTANT IDENTITY RULE
============================================================

There is only one Device identity:

    Device.id

Serial Number is a physical attribute:

    Device.serialNumber

The following fields must contain Device.id, not Serial Number:

    CalibrationRequestItem.deviceId
    QuotationItem.deviceId
    PurchaseOrderItem.deviceId
    WorkOrderItem.deviceId
    CalibrationJob.deviceId
    DeliveryNote.deviceId

Never convert Device.id back to Serial Number and then resolve it again
between these stages.

============================================================
AUDIT SCOPE
============================================================

Perform ONLY a targeted audit necessary to safely implement the locked
invariant.

Trace:

    CalibrationRequestItem
        ↓
    QuotationItem
        ↓
    PurchaseOrderItem
        ↓
    WorkOrderItem
        ↓
    CalibrationJob
        ↓
    DeliveryNote

For EACH entity:

1. Inspect Prisma model.
2. Confirm current deviceId type/nullability.
3. Confirm Device relation.
4. Find every create path.
5. Find every update path that can affect deviceId.
6. Find every copy/propagation path from the previous stage.
7. Find tests/fixtures that create the entity.
8. Identify any legitimate path currently producing NULL.
9. Identify any legacy data that may currently contain NULL.
10. Determine the minimum implementation changes required.

DO NOT audit unrelated domain areas.

============================================================
IMPLEMENTATION
============================================================

After the targeted audit, IMPLEMENT the locked invariant.

Do not stop after reporting findings.

------------------------------------------------------------
1. CalibrationRequestItem
------------------------------------------------------------

Already intended to be required.

Ensure:

    deviceId String

with a real FK to Device.id.

Do not revert this to nullable.

Excel Serial No remains only the lookup key:

    Excel Serial No
        ↓
    Device lookup
        ↓
    Device.id
        ↓
    CalibrationRequestItem.deviceId

Do not modify BAI.

------------------------------------------------------------
2. QuotationItem
------------------------------------------------------------

Change:

    deviceId String?

to:

    deviceId String

and make the Device relation required.

Ensure every QuotationItem creation path supplies a valid Device.id.

The existing CalibrationRequest generation path MUST copy:

    CalibrationRequestItem.deviceId
        →
    QuotationItem.deviceId

Do not use Serial Number for this propagation.

If another legitimate QuotationItem creation path exists, make it comply
with the same invariant.

Do not silently insert NULL.

------------------------------------------------------------
3. PurchaseOrderItem
------------------------------------------------------------

Change:

    deviceId String?

to:

    deviceId String

and make the Device relation required.

Ensure PO generation copies the exact Device.id from QuotationItem.

Do not resolve by Serial Number.

Do not allow NULL.

Update only the creation/update paths necessary to satisfy the invariant.

------------------------------------------------------------
4. WorkOrderItem
------------------------------------------------------------

Change:

    deviceId String?

to:

    deviceId String

and make the Device relation required.

Ensure Work Order generation preserves the exact Device.id from the
PurchaseOrderItem.

For quantity/fan-out:

    qty = 1
        → exact Device.id propagates to the single physical job/unit

For qty > 1:

    DO NOT assign the same Device.id to multiple physical units unless
    the existing business model explicitly represents them as the same
    physical Device.

If the current architecture has a legitimate mechanism that resolves
individual Devices before WorkOrderItem creation, preserve that mechanism.

The locked invariant still applies:

    every persisted WorkOrderItem MUST have a valid Device.id

Do not solve this by assigning fake IDs.

------------------------------------------------------------
5. CalibrationJob
------------------------------------------------------------

Change only if the targeted audit confirms this is consistent with the
existing business lifecycle.

The locked business decision is:

    CalibrationJob.deviceId cannot be NULL.

Therefore the final implementation should make:

    deviceId String

with required Device relation.

Preserve existing upstream propagation.

Do NOT use BAI to populate deviceId.

BAI remains physical identity correction/observation and is OUT OF SCOPE.

Do NOT modify:

    technicianObservedSerial
    technicianObservedBrand
    technicianObservedModel
    Identity Correction wizard
    Device Lookup

------------------------------------------------------------
6. DeliveryNote
------------------------------------------------------------

Include DeliveryNote explicitly.

Audit its deviceId field and all creation/update paths.

Because NULL is not a valid business state:

    deviceId must be required
    deviceId must reference Device.id

DeliveryNote must inherit the same Device.id already associated with the
upstream calibration transaction.

Do not use Serial Number as a substitute.

Do not create a second identity mechanism.

============================================================
LEGACY DATA / MIGRATION
============================================================

Before applying NOT NULL constraints, inspect existing data.

For every affected table:

    CalibrationRequestItem
    QuotationItem
    PurchaseOrderItem
    WorkOrderItem
    CalibrationJob
    DeliveryNote

check for:

    deviceId IS NULL

Also check for any legacy values that are not valid Device.id values where
the old implementation may have stored Serial Number text.

Migration rules:

1. If a legacy value is safely resolvable to exactly one Device:
       resolve it to Device.id.

2. If a legacy value is NULL:
       DO NOT invent a Device.

3. If a legacy value is unmatched:
       DO NOT guess.

4. If a legacy value is ambiguous:
       DO NOT guess.

5. If unresolved legacy data exists:
       migration MUST abort safely with an actionable error/report.

Do not silently:
    - set NULL
    - fabricate Device IDs
    - create fake Devices
    - delete records
    - choose an arbitrary Device

The migration must protect data integrity.

============================================================
DISPLAY RULE
============================================================

Any user-facing display that currently reads:

    deviceId

must NOT display the raw Device.id/CUID.

When a Serial Number exists:

    device.serialNumber

must be displayed.

When Serial Number does not exist:

    display empty string / blank.

Do NOT fallback to Device.id.

Do NOT display CUID to users.

This applies only to relevant display/document consumers encountered
while implementing this invariant.

Do not redesign UI.

============================================================
CERTIFICATE
============================================================

Do NOT redesign Certificate.

However, because CalibrationJob.deviceId is now required, the existing
Certificate.deviceId requirement/guard should remain intact.

Do not make Certificate nullable.

Do not modify certificate numbering.

Do not modify QR/verification behavior.

============================================================
BAI / IDENTITY CORRECTION
============================================================

STRICTLY OUT OF SCOPE.

Do not modify:

    BAI
    Identity Correction
    technicianObserved*
    Device Lookup
    physical identity correction workflow

deviceId is system identity.

BAI handles physical observation/correction.

============================================================
TESTS
============================================================

Update/add focused tests for the new invariant.

At minimum verify:

1. CalibrationRequestItem cannot be created without Device.id.

2. Excel Serial No resolves to Device.id.

3. QuotationItem receives the exact same Device.id.

4. PurchaseOrderItem receives the exact same Device.id.

5. WorkOrderItem receives the exact same Device.id.

6. CalibrationJob receives the exact same Device.id.

7. DeliveryNote receives the exact same Device.id.

8. No stage can persist NULL deviceId.

9. Existing qty/fan-out behavior remains correct.

10. Existing BAI behavior remains unchanged.

11. User-facing display shows:
       device.serialNumber
   when available.

12. User-facing display is blank when serialNumber is absent.

13. No user-facing display falls back to Device.id.

Update fixtures/builders that currently create free-text or NULL deviceId
only where required by the new locked invariant.

Do not weaken tests merely to make them pass.

============================================================
MIGRATION DISCIPLINE
============================================================

Create the minimum required migration(s).

The migration may modify only the Device identity constraints and data
transformations necessary for this task.

Do NOT modify unrelated schema.

Do NOT change:
    Device.id
    Device.serialNumber
    Device uniqueness rules
    BAI schema
    unrelated business entities

============================================================
SCOPE DISCIPLINE
============================================================

Do NOT:

- repeat the previous comprehensive audit
- redesign the architecture
- redesign BAI
- redesign Device Lookup
- redesign UI
- change Serial Number semantics
- replace deviceId with serialNumber
- introduce another identity field
- modify document numbering
- modify unrelated modules
- fix unrelated pre-existing failures

If an unrelated problem is discovered, report it only.
Do not fix it.

============================================================
VERIFICATION
============================================================

After implementation:

1. Prisma schema validation.
2. Relevant migration validation.
3. Targeted tests for all affected services.
4. Existing relevant calibration tests.
5. Typecheck for affected packages.
6. Verify migration status.

If the shared development database cannot be modified because of
environment permissions, DO NOT bypass safety controls.

Report that limitation clearly.

============================================================
FINAL RESPONSE
============================================================

Return:

1. Targeted audit findings — concise, only findings relevant to this task.
2. Files changed.
3. Schema changes.
4. Business-flow changes.
5. Migration name(s).
6. Data migration behavior.
7. Tests run and results.
8. Typecheck results.
9. Any unresolved/blocking legacy data.
10. Any unrelated pre-existing failures.

If successful, finish with:

    REQUIRED DEVICE ID INHERITANCE IMPLEMENTED