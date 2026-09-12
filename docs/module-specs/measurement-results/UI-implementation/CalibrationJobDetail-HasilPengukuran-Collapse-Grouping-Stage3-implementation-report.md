# STAGE 3 — "Hasil Pengukuran": Fix Collapse + Group by Capability — Implementation Report

**Date:** 2026-09-10
**Scope:** Portal UI only — `apps/portal/src/app/management/calibration-jobs/[id]/page.tsx`,
`use-measurement-results-query.ts`, and the shared `components/ui/accordion.tsx`. No API/schema changes.
**Predecessor:** [CalibrationJobDetail-StatusStrip-Collapsible-Stage2-implementation-report.md](./CalibrationJobDetail-StatusStrip-Collapsible-Stage2-implementation-report.md).

**HARD STOP after this report — awaiting review before deploy.**

---

## 0. TL;DR

| # | Item | Outcome |
|---|---|---|
| 1 | Collapse root cause | Shadcn's `AccordionContent` hides a closed panel **only** via `data-[state=closed]:animate-accordion-up`, a keyframe with no `forwards` fill. With `forceMount` (which Stage 2 put on Hasil Pengukuran *and* Alat Referensi to protect in-progress edits), Radix keeps `hidden={false}` forever, so after the 0.2s collapse animation the panel **snaps back to full height**. Chevron rotated fine; content never stayed hidden. |
| 2 | Affected sections | Both `forceMount` sections — Hasil Pengukuran **and** Alat Referensi. The user happened to report it on Hasil Pengukuran; the fix covers both. The three non-`forceMount` sections (Identitas, Koreksi Identitas, AKD/AKL) were unaffected because Radix truly unmounts them. |
| 3 | Fix | One line in `accordion.tsx`: add `data-[state=closed]:hidden` to `AccordionContent`. `display:none` when closed → panel actually disappears while the DOM node (and its React state) stays mounted under `forceMount`. |
| 4 | Side effect of the fix | Non-`forceMount` panels now close **instantly** instead of playing the 0.2s slide-up (the open slide-down animation is unchanged). Applies to the 3 other sections here and to `leads-ui.tsx`'s `NeedsReviewAccordion` — the only other `AccordionContent` consumer in Portal. Judged acceptable; documented here. |
| 5 | Note-text preservation | With `forceMount` + `display:none`, the `<textarea>` in `QualityReviewPanel` stays mounted → `notes` state survives collapse/expand. Same mechanism protects `ReferenceEquipmentEditor`'s `selection` state. Verified by code inspection (§3); a live click-through is still recommended (§6). |
| 6 | Capability data | **Already on the wire.** `GET /calibration-jobs/:id/measurement-parameters` already returns `capabilityName` + `capabilityItemName` on every parameter **and** a pre-sorted `capabilityGroups[]` tree (`calibration-jobs.service.ts` `toParameterSummary` / `listMeasurementParameters`). Only the Portal TS interface was missing the fields — **no API change**. |
| 7 | Grouping | Flat result rows are bucketed by `capabilityName`; each bucket gets a static header row (`NAME · N parameter`) styled to match the Calibration Parameter catalog's capability header (`bg-slate-100/70`, uppercase `text-[11px]` slate-500, count in normal-case slate-400). One `<tbody>` per group, same as the catalog page. No chevron, no toggle, no drag handle. |
| 8 | Ordering | Group order = `capabilityGroups[]` order from the API (already sorted by `DeviceTypeCapabilityOrder.sortOrder`, unknowns last, id tie-break). Row order within a group is left exactly as the API returns it — `GET .../measurement-results` already sorts by `parameter.sortOrder → paramId → testPoint.sequence → replicateIndex`. |
| 9 | Row content | Unchanged — Parameter / Replicate / Nilai columns, same `nameById` / `pointLabelById` lookups, same value fallback. Only group header rows were added above them. |
| 10 | Typecheck | `apps/portal` `tsc --noEmit` → exit 0. |
| 11 | Tests | `apps/portal` `vitest run` → **146/146 passed**, 15 files. No API changes → API suite not re-run (existing `listMeasurementParameters` tests already cover the `capabilityName` fields). |
| 12 | Screenshot | **Not captured** — no browser automation tool in this session; the Windows dev stack also has an unrelated EPERM/`.next` rename flake. Grouped layout is described in §5. |

---

## 1. Files changed

```
git diff --stat
 apps/portal/src/app/management/calibration-jobs/[id]/page.tsx  | 69 +++++++++++---
 apps/portal/src/app/management/calibration-jobs/use-measurement-results-query.ts | 13 ++
 apps/portal/src/components/ui/accordion.tsx                    |  7 +-
```

- **`components/ui/accordion.tsx`** — Part 1 fix (1 class added + comment).
- **`use-measurement-results-query.ts`** — Part 2 types: `capabilityName` / `capabilityItemName` on
  `PortalMeasurementParameter`, new `PortalMeasurementCapabilityGroup`, `capabilityGroups` on
  `PortalMeasurementParametersResponse`.
- **`[id]/page.tsx`** — Part 2 grouping logic + render in `QualityReviewPanel`; `PortalMeasurementResult`
  type import.

---

## 2. Part 1 — collapse bug: root cause

`AccordionContent` (shadcn canonical, unchanged since it was added):

```tsx
<AccordionPrimitive.Content
  className="overflow-hidden text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
  {...props}
>
```

Radix `Collapsible.Content` (which `Accordion.Content` wraps) renders
`<div hidden={!isOpen}>{isOpen && children}</div>` where `isOpen = context.open || isPresent`, and
`isPresent` is driven by `Presence(forceMount || context.open)`. **When `forceMount` is set, `isPresent`
is permanently `true`**, so `hidden` is always `false` and the children always render at full height.

The *only* thing shadcn uses to visually collapse a panel is the `accordion-up` keyframe
(`from height: var(--radix-accordion-content-height) → to height: 0`). `tailwindcss-animate` defines it
**without `animation-fill-mode: forwards`**, so once the 0.2s animation ends the element returns to its
natural (full) height. Net result with `forceMount`: brief squeeze, then snap back. The chevron
(`[&[data-state=open]>svg]:rotate-180`, pure CSS on the trigger) kept working, which is why it looked like
"the chevron does nothing."

This is exactly the mistake in the Stage 2 report's assumption that the keyframe "collapses forceMounted
content to zero height without unmounting it" — it does not persist.

## 3. Part 1 — the fix

```tsx
className="overflow-hidden text-sm data-[state=closed]:hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
```

`data-[state=closed]:hidden` → `display:none` on the Content element whenever Radix marks it closed.
`display:none` removes it from layout **without unmounting**, so under `forceMount` the React subtree
(and every `useState` inside it — `QualityReviewPanel.notes`, `ReferenceEquipmentEditor.selection`) is
preserved across a collapse/expand cycle. On expand, `data-state="open"` drops the `hidden` and
`animate-accordion-down` still plays.

**Why fix it in the shared component and not `page.tsx`:** shadcn's `AccordionContent` hard-codes the
`className` on the Radix `Content` element and only forwards the caller's `className` to the inner padding
`<div>` (which has no `data-state`). A `data-[state=closed]:hidden` passed from `page.tsx` would never
reach the element that carries the state attribute. Adding it to the primitive is the minimal correct
place.

**Side effect (documented, accepted):** for non-`forceMount` panels Radix still keeps the node mounted for
~0.2s after close to play the exit animation; `display:none` now hides it immediately, so those panels
close instantly. Consumers: the 3 other sections on this page + `leads-ui.tsx` `NeedsReviewAccordion`.
Open animation unaffected everywhere. No layout/border regression (caller `className` forwarding
untouched).

## 4. Part 2 — capability data availability

Checked `apps/api/src/modules/calibration-jobs/calibration-jobs.service.ts`:

- `measurementParameterSelect` already pulls `capabilityItem.capability { id, code, name }`.
- `toParameterSummary()` already emits `capabilityName` and `capabilityItemName` on **every**
  `MeasurementParameterSummary` (so both `parameters[]` and `gridParameters[]` carry them).
- `listMeasurementParameters()` already returns `capabilityGroups[]` — a tree pre-sorted by
  `DeviceTypeCapabilityOrder.sortOrder` (`buildMeasurementCapabilityGroups`: null sortOrder →
  `MAX_SAFE_INTEGER`, `capability.id.localeCompare` tie-break; parameters within a group by
  `parameterSortOrder` then name).

The Portal's `use-measurement-results-query.ts` interfaces simply did not declare any of it. **Added the
fields to the Portal types only — zero API/DB/shared changes.** The measurement *results* rows
(`PortalMeasurementResult`) still carry no capability info and don't need to: each row's
`deviceCalibrationParameterId` is mapped to its parameter's `capabilityName` client-side, the same way
the existing `nameById` map already resolves parameter names.

## 5. Part 2 — grouped rendering (in `QualityReviewPanel`)

New derived state (all client-side, no extra fetch):

```ts
const capabilityByParamId = new Map(parameters.map((p) => [p.id, p.capabilityName]));
const capabilityOrder = new Map(
  (parametersQuery.data?.capabilityGroups ?? []).map((g, i) => [g.capability.name, i]),
);
// bucket rows by capability (insertion order preserved within a bucket),
// then order buckets by capabilityOrder, unknown ("Lainnya") last
const groupedRows = /* Map<string, PortalMeasurementResult[]> → sorted entries */;
```

Render: `<thead>` unchanged; then one `<tbody>` per group, each opening with a header row:

```
┌───────────────────────────────────────────────┐
│ PENGUKURAN KONDISI LINGKUNGAN · 3 parameter    │   ← bg-slate-100/70, uppercase text-[11px]
├───────────────────────────────────────────────┤   slate-500; "· 3 parameter" normal-case slate-400
│ Suhu Ruangan            1        24.1          │
│ Suhu Ruangan            2        24.2          │
│ Kelembapan              1        55            │
│ Iluminasi               1        420           │
├───────────────────────────────────────────────┤
│ KESELAMATAN LISTRIK · 2 parameter              │
├───────────────────────────────────────────────┤
│ Resistansi Pembumian    1        0.12          │
│ Arus Bocor Chassis      1        18.5          │
├───────────────────────────────────────────────┤
│ PENGUKURAN TANDA VITAL · 4 parameter           │
├───────────────────────────────────────────────┤
│ Heart Rate · 60 BPM     1        60            │
│ …                                             │
└───────────────────────────────────────────────┘
```

- `· N parameter` = count of **distinct** `deviceCalibrationParameterId` in that group's rows (not the
  replicate row count).
- Header row: static `<tr><td colSpan={3}>` — no `ChevronDown/Right`, no `onClick`, no `GripVertical`.
- Data rows: byte-for-byte the previous markup (Parameter with optional ` · <test point>` suffix,
  Replicate, Nilai with `measuredValue ?? measuredText ?? measuredBool` fallback).
- If a job's DeviceType can't be resolved, `capabilityGroups` and `parameters` are both `[]`,
  `capabilityByParamId` is empty, every row falls into a single `"Lainnya"` group — degrades to a
  one-group flat table rather than erroring.

## 6. Verification

```
cd apps/portal && npx tsc --noEmit          → exit 0
cd apps/portal && npx vitest run            → 15 files / 146 tests passed
```

**Not run (no browser tool this session):**

1. Click the Hasil Pengukuran chevron → confirm the panel now collapses and stays collapsed.
2. Type into the "Catatan keputusan" textarea, collapse Hasil Pengukuran, re-expand → confirm the text is
   still there. (Same explicit check Stage 2 required; addressed structurally in §3 — `forceMount` keeps
   the textarea mounted, `display:none` just hides it.)
3. Open the pilot Bed Side Monitor job → confirm the grouped table shows the environment /
   electrical-safety / vital-signs capability headers with correct per-group parameter counts and correct
   group order.

Recommend running all three by hand before deploy.
