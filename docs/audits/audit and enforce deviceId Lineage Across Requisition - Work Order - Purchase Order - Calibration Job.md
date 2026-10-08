## Audit and Enforce `deviceId` Lineage Across Requisition → Work Order → Purchase Order → Calibration Job

Perform a **strict end-to-end audit** of the current implementation to determine exactly why `deviceId` is not being carried into the Calibration Job, despite this requirement having been discussed and established multiple times.

This is **not a request for another high-level review**. Trace the actual code, schema, DTOs, services, mappings, persistence operations, and data flow from the originating Requisition through to the Calibration Job.

### Mandatory invariant

`deviceId` **MUST exist and be preserved throughout the entire lineage**:

**Requisition → WorkOrderItem → PurchaseOrderItem → Calibration Job**

The `deviceId` originating from the Requisition must be the **same device identity** ultimately associated with the Calibration Job. It must not be regenerated, inferred, reconstructed from other fields, or silently dropped at any intermediate layer.

Specifically verify and enforce that:

1. **Requisition**

   * `deviceId` is explicitly present and correctly populated at the source.
   * Identify where it originates and how it is persisted.

2. **WorkOrderItem**

   * `deviceId` is explicitly carried from the Requisition into `WorkOrderItem`.
   * Verify the creation/mapping logic, DTOs, ORM schema, and persistence path.
   * It must not be lost during transformation or bulk creation.

3. **PurchaseOrderItem**

   * `deviceId` is explicitly inherited from the corresponding `WorkOrderItem` / Requisition lineage.
   * Verify all relevant creation, mapping, update, and persistence paths.
   * Do not assume that matching by `productId`, `instrumentId`, description, sequence, or another indirect attribute is sufficient.

4. **Calibration Job**

   * The Calibration Job must receive the exact `deviceId` from the upstream lineage.
   * Trace the actual code path that creates the Calibration Job and identify precisely where `deviceId` is currently lost, omitted, overwritten, or never introduced.
   * If the current Calibration Job schema/domain model does not contain `deviceId`, treat that as an implementation gap that must be addressed.

### Audit requirements

Do not stop at the first missing field. Trace the **complete data lineage** and identify every boundary where `deviceId` can be lost, including:

* database schema/model definitions
* migrations
* Prisma/ORM relations
* TypeScript types/interfaces
* DTOs
* validation schemas
* service-layer mappings
* create/update operations
* bulk operations
* event/payload transformations
* Work Order creation
* Purchase Order creation
* Calibration Job creation
* API responses where relevant
* frontend payload construction where relevant

Also inspect whether there are **multiple code paths** capable of creating these entities. If so, ensure the invariant is enforced across all applicable paths rather than fixing only one happy path.

### Expected outcome

Before making changes, report:

* the exact point(s) where `deviceId` is currently lost;
* the complete current lineage;
* the intended lineage;
* any schema/model changes required;
* any existing implementation that contradicts this invariant;
* all affected creation/update paths.

Then implement the necessary fix.

Do **not** work around the problem by deriving `deviceId` later from another entity. The ownership/lineage must be explicit.

After implementation, verify the invariant with appropriate tests and/or a focused end-to-end verification:

`Requisition.deviceId`
→ `WorkOrderItem.deviceId`
→ `PurchaseOrderItem.deviceId`
→ `CalibrationJob.deviceId`

The final result must make it structurally difficult for `deviceId` to disappear silently between these entities.

Treat this as a **data-lineage integrity requirement**, not an optional enhancement. Do not weaken, reinterpret, or defer the requirement.
