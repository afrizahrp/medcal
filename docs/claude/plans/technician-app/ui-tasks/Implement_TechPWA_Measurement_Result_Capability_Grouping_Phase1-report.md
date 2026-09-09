# IMPLEMENTATION REPORT — Phase 1: Measurement Parameters Capability Groups

Audit baseline: [Audit_TechPWA_Measurement_Result_Capability_Grouping.md](./Audit_TechPWA_Measurement_Result_Capability_Grouping.md)

## Status: Phase 1 complete

Backend/read-model only. `GET /calibration-jobs/:id/measurement-parameters` now exposes
capability identity and configured ordering without changing direct/grid eligibility or
Tech-PWA UI.

Phase 2 (renderer grouping on Hasil Pengukuran) is documented in
[Implement_TechPWA_Measurement_Result_Capability_Grouping_Phase2-report.md](./Implement_TechPWA_Measurement_Result_Capability_Grouping_Phase2-report.md).

## Scope

In:

- Additive `capabilityGroups` on the existing measurement-parameters response
- Backend grouping by `DeviceCapability.id`
- Ordering from `DeviceTypeCapabilityOrder` and `DeviceCalibrationParameter.sortOrder`
- Focused API tests

Out:

- Tech-PWA list/detail renderers
- Measurement editor / `MeasurementGridEntry`
- Persistence, payload, validation
- Schema, migration, seed, taxonomy
- Unrelated audit findings (write-path integrity, seed `DeviceCapabilityItem.code`)

## Files changed

- `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts`
- `apps/api/src/modules/calibration-jobs/calibration-jobs.service.test.ts`

Controller signature unchanged: it already returned `JobMeasurementParametersResult`.

## API response

`GET /calibration-jobs/:id/measurement-parameters`

Existing fields kept:

```text
deviceType: { id, name } | null
parameters: MeasurementParameterSummary[]
gridParameters: MeasurementGridParameterSummary[]
```

Additive field:

```text
capabilityGroups: MeasurementCapabilityGroup[]
```

Shape:

```text
capabilityGroups: [
  {
    capability: { id, code, name },
    sortOrder: number | null,   // DeviceTypeCapabilityOrder.sortOrder
    parameters: [
      {
        id, code, name,
        decimalPlaces,
        uom, toleranceMin, toleranceMax, toleranceNote,
        capabilityName, capabilityItemName,
        kind: "DIRECT" | "GRID",
        testPoints: MeasurementTestPointSummary[]
          // [] on DIRECT
          // active points ordered by sequence on GRID
      }
    ]
  }
]
```

When the job DeviceType cannot be resolved:

```text
{ deviceType: null, parameters: [], gridParameters: [], capabilityGroups: [] }
```

`kind` exists only on grouped parameters. `parameters[]` / `gridParameters[]` item shapes
are unchanged.

## How capability ordering is obtained

1. Eligible parameters are loaded with the same filters as before.
2. `DeviceTypeCapabilityOrder` is read for the job's DeviceType
   (`capabilityId`, `sortOrder`).
3. Parameters are bucketed by `capabilityItem.capability.id`.
4. Groups are sorted by persisted `sortOrder` ascending.
5. Groups with no order row go last.
6. Tie-break is `capability.id`, **not** display name.

`capability.code` and `capability.name` are display metadata only. Two capabilities with
the same name remain two groups.

## How parameter ordering is obtained

Inside each group, parameters are sorted by `DeviceCalibrationParameter.sortOrder`
(capability-scoped). Direct and grid rows in the same capability keep their relative
configured order.

Tie-break matches the existing ungrouped Prisma `orderBy`: name, then id.

Test points: `CalibrationTestPoint.sequence` (active only), same as `gridParameters`.

The grouped tree is **not** a global sort of `parameters[] + gridParameters[]` by
parameter `sortOrder`. That would mix capabilities because `sortOrder` restarts per
capability.

## How direct/grid behavior is preserved

The two catalog queries are unchanged:

| Array | Eligibility |
| --- | --- |
| `parameters` | `NUMBER`, `DIRECT_REPLICATES`, active, **no** test-point children |
| `gridParameters` | same, **plus** at least one active test point; `SUCT_VACUUM_GAUGE` excluded |

`LOGGER_SUMMARY` stays out of both arrays via `entryStyle`.

`capabilityGroups` is built only from those two result sets:

- rows from `parameters` → `kind: "DIRECT"`, `testPoints: []`
- rows from `gridParameters` → `kind: "GRID"`, nested test points copied

No change to measurement create/update/list, tolerance, or natural key.

## Tests

Command:

```text
pnpm exec vitest run src/modules/calibration-jobs/calibration-jobs.service.test.ts -t "Measurement Parameters"
```

Working directory: `apps/api`.

Result: **4 passed**, 87 skipped.

Also: `pnpm --filter @medcal/api typecheck` — pass.

Coverage:

1. Multiple capabilities with configured capability order (names reversed vs sortOrder).
2. Multiple parameters inside a capability in configured parameter order.
3. DIRECT and GRID under the same capability, relative order preserved.
4. Test points ordered by `sequence` even if inserted out of order.
5. Two capabilities with the same display name stay separate groups (id/code).
6. Existing eligibility: inactive, non-NUMBER, `LOGGER_SUMMARY`, `SUCT_VACUUM_GAUGE`
   still excluded from both the old arrays and `capabilityGroups`.

## Backward compatibility

- `parameters[]` and `gridParameters[]` remain and keep their previous ordering
  (each array independently: `sortOrder`, then `name`).
- Clients that ignore `capabilityGroups` continue to work.
- Tech-PWA types and renderers were **not** updated in this phase, so the UI still
  shows Pembacaan Langsung / Grid Titik Uji until Phase 2.

## Intentionally not done

- Phase 2 UI grouping on Hasil Pengukuran / job-detail summary.
- Frontend type mirror for `capabilityGroups`.
- Write-path DeviceType/active checks (audit finding, out of scope).
- Seed repairs (`DeviceCapabilityItem.code`, logger `entryStyle`, test-point seed).

## Phase 2 note

Safe next step is presentation-only:

1. Mirror `capabilityGroups` on the Tech-PWA measurement types.
2. Render capability sections from that tree on:
   - `apps/tech-pwa/src/app/jobs/[id]/measurements/page.tsx`
   - `MeasurementsSection` in `job-detail-ui.tsx`
3. Keep parameter navigation, `kind`/testPoints dispatch, status helpers, and editors
   unchanged. No capability accordion.
