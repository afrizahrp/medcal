# IMPLEMENTATION REPORT — Phase 2: Tech-PWA Capability-Grouped Hasil Pengukuran

Audit baseline: [Audit_TechPWA_Measurement_Result_Capability_Grouping.md](./Audit_TechPWA_Measurement_Result_Capability_Grouping.md)

Phase 1 (backend read-model): [Implement_TechPWA_Measurement_Result_Capability_Grouping_Phase1-report.md](./Implement_TechPWA_Measurement_Result_Capability_Grouping_Phase1-report.md)

## Status: Phase 2 complete

Tech-PWA now presents measurement parameters grouped by capability, using the
additive `capabilityGroups` field from:

`GET /calibration-jobs/:id/measurement-parameters`

Backend, editors, persistence, payload, validation, schema, and taxonomy were
not modified in this phase.

## Scope

In:

- Frontend type mirror for `capabilityGroups`
- Hasil Pengukuran list renderer
- Job-detail `MeasurementsSection` summary
- Presentation helper that walks API order without sorting
- Focused unit tests for that helper

Out:

- Backend / API
- Measurement editor page
- `MeasurementGridEntry`
- Mutation hooks / measurement payload
- Status calculation formulas (only which helper is chosen, by `kind`)
- Schema, migrations, seeds, Device Calibration configuration
- Capability accordion / expand-collapse / drag-and-drop

## Files changed

- `apps/tech-pwa/src/lib/calibration/measurement.ts`
- `apps/tech-pwa/src/lib/calibration/measurement.test.ts`
- `apps/tech-pwa/src/app/jobs/[id]/measurements/page.tsx`
- `apps/tech-pwa/src/app/jobs/[id]/measurements/measurements-ui.tsx`
- `apps/tech-pwa/src/app/jobs/[id]/job-detail-ui.tsx`
- `apps/tech-pwa/src/app/jobs/[id]/page.tsx`

## Exact UI changes

### Before

```text
Hasil Pengukuran
  Pembacaan langsung
    parameter…
  Grid titik uji
    parameter…
```

### After

```text
Hasil Pengukuran
  {capability.name from API}
    parameter…
  {capability.name from API}
    parameter…
```

Applies to:

1. Main list: `/jobs/:id/measurements` (`measurements/page.tsx`)
2. Job-detail summary: `MeasurementsSection` in `job-detail-ui.tsx`

Capability is a **static visual section** (heading + list). No accordion, no
expand/collapse state, no drag-and-drop.

Parameter rows reuse `MeasurementParameterListRow` (list) and
`MeasurementStatusRow` (summary). List navigation is unchanged:

```text
/jobs/:jobId/measurements/:parameterId
```

Job-detail still has no per-parameter navigation; only the existing
“Catat Hasil Pengukuran” link.

Empty-state subtitle was neutralized from “pembacaan langsung atau grid titik
uji” to “parameter pengukuran yang didukung”.

## How `capabilityGroups` is consumed

Types in `measurement.ts` mirror the Phase 1 response:

```text
capabilityGroups?: [
  {
    capability: { id, code, name },
    sortOrder,
    parameters: [
      { …existing parameter fields, kind: "DIRECT" | "GRID", testPoints[] }
    ]
  }
]
```

The field is optional so a pre-Phase-1 payload can fall back.

Helpers:

- `hasCapabilityGroups(groups)` — true when the value is an array (including empty)
- `capabilityGroupSections(groups)` — maps API order to section views; does not sort

Both screens call those helpers. They do **not** rebuild groups from
`parameters[]` + `gridParameters[]`, and they do **not** group by
`capabilityName`.

`kind` selects existing behavior only:

| kind | status helper | result map | `pointCount` |
| --- | --- | --- | --- |
| `DIRECT` | `parameterEntryStatus` | `rowsByParameter` | omitted |
| `GRID` | `gridEntryStatus` | `gridRowsByParameter` | `testPoints.length` |

DIRECT and GRID parameters in the same capability stay in the API parameter
order under that one section.

## Confirmation: no frontend re-sorting

`capabilityGroupSections` is:

```text
groups.map → parameters.map
```

No `sort`, no localeCompare, no alphabetical capability ordering. Unit tests
assert that names which would reverse under alphabetical sort keep API order.

## Confirmation: direct/grid behavior preserved

- Eligibility still comes from the backend (`parameters[]` / `gridParameters[]`).
- Editor still resolves Pattern A vs B from those arrays
  (`[parameterId]/page.tsx` was not modified).
- `MeasurementGridEntry` was not modified.
- Write hooks and payload were not modified.
- `kind` is not a visual grouping.

## Fallback

If `capabilityGroups` is missing (`undefined` / `null`, not an array), the
previous Pembacaan langsung / Grid titik uji rendering is kept.

If the field is present (including `[]`), it is the source of truth. Empty
groups show the empty state; the UI does not invent grouping from names.

## Tests / typecheck / build

```text
pnpm --filter @medcal/tech-pwa test
```

Result: **30 passed** (2 files), including:

- `hasCapabilityGroups` true for `[]`, false for missing
- mixed DIRECT/GRID under one capability, API order preserved
- capabilities/parameters are not alphabetically re-sorted

Typecheck:

```text
pnpm --filter @medcal/tech-pwa typecheck
```

Fails on a **pre-existing** error: `src/components/auth/auth-card.tsx` cannot
resolve `../../../public/logo.png`. Phase 2 source files did not add type
errors.

`next build` was not run because typecheck already fails on that unrelated asset.

There is no React Testing Library in tech-pwa; UI-level checks are unit tests
on the presentation walk used by both renderers. Browser verification was not
available in the implementation session.

## Deviations from the Phase 2 spec

1. Legacy input-method fallback when `capabilityGroups` is absent (explicitly
   allowed by the spec).
2. Small empty-state copy change (see UI changes).
3. No component-level React tests (existing test setup is node unit tests only).
4. Typecheck/build of the full Tech-PWA app still blocked by the pre-existing
   `logo.png` import.

## Intentionally not done

- Backend changes
- Editor / grid / persistence changes
- Capability expand/collapse
- Frontend taxonomy or ordering configuration
- Unrelated audit items (write-path integrity, seed repairs)
