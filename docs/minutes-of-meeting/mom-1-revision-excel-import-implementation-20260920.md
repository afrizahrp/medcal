# MOM #1 — Import Excel for Requisition Revision — Implementation Report

Date: 2026-09-20

## Addendum (2026-09-20) — Fix: Empty Device Selector on ADDED Rows

**Root cause:** `buildImportedDesiredRows()` correctly set `deviceTypeId` on
an ADDED row from `match.deviceTypeId`, and the identity/removal logic was
never wrong. The bug was downstream, in `ReviseRequestDialog`'s
`DeviceTypeItemSelect`: it renders the selected option by looking up
`deviceTypes.find((type) => type.id === value)`, and `deviceTypes` was built
only from `typesQuery.data` (the device-types list query) plus the device
types already embedded on `request.items`. A device type resolved by the
Excel matcher for a brand-new ADDED row (e.g. "Ventilator", not currently on
the requisition) had no guarantee of being present in either source —
`typesQuery` may not have loaded it yet or may not include it on its current
page — so the selector had no option to match against and rendered blank,
even though `row.deviceTypeId` itself was correct all along.

**Fix:** `buildImportedDesiredRows()` now also returns `resolvedDeviceTypes:
DeviceTypeOption[]` — one entry per distinct `deviceTypeId` the existing
matcher resolved in the file, built directly from the same
`match.deviceTypeName`/`match.deviceTypeCode` the matcher already returned
(no second lookup, no new matching mechanism). `ReviseRequestDialog` stores
this in a new `importedDeviceTypes` state (set alongside `rows` in
`handleImportFile`) and merges it into the same `deviceTypes` array the
manual "Add Device" flow already builds and passes to
`DeviceTypeItemSelect`, deduplicated against `typesQuery.data` and
`request.items`. The selector now always has an option for whatever the
matcher resolved, whether exact-name or alias, regardless of `typesQuery`'s
load state or pagination.

**Files touched:** `apps/portal/src/app/management/calibration-requests/[id]/revision-desired-scope.ts`
(new return field), `apps/portal/src/app/management/calibration-requests/[id]/page.tsx`
(new `importedDeviceTypes` state, merged into `deviceTypes`),
`apps/portal/src/app/management/calibration-requests/[id]/import-revision-mapping.test.ts`
(2 new tests). No backend, revision-engine, or Excel-matching changes.

**Tests:** added 2 focused tests — exact-name ADDED row (`Bedside Monitor ×1`
current → `Ventilator ×1` in Excel) asserting `resolvedDeviceTypes` contains
`{ id: "dt-vent", name: "Ventilator", code: "VEN" }` and the old item is
marked `removed`; and the same for an alias match (`method: "ALIAS"`),
proving the fix does not depend on exact-name resolution. All 5 pre-existing
tests in the same file still pass unchanged. Full portal suite:
**22 files / 229 tests passed, 0 failed** (227 previous + 2 new). Typecheck
clean.

---

## 1. Existing Excel Import Pattern Reused

Studied and reused, unchanged, in full:

- **Parsing/matching (backend):** `apps/api/src/modules/calibration-requests/calibration-request-import.service.ts` — `parseWorkbook()` (header aliasing, `Nama Alat`/`Qty` required columns, per-row validation) and `buildMatchIndex()`/`matchRow()` (exact name / alias / fuzzy `DeviceType` matching). Reached through the existing, unmodified `POST /calibration-requests/import/preview` endpoint — a side-effect-free preview that only resolves `customerDeviceName` text to a `deviceTypeId`; it has no notion of "which requisition," so it is equally valid for the Create flow and the Revise flow.
- **Hook (portal):** `useImportPreview()` in `apps/portal/src/app/management/calibration-requests/use-calibration-requests-query.ts` — reused as-is.
- **UI pattern:** the file-input/button/loading-state pattern from `apps/portal/src/app/management/calibration-requests/import/import-page-client.tsx` (hidden `<input type="file" accept=".xlsx">` triggered by a visible `Button`, `Mutation.isPending` driving a "Memproses…" label).
- **Excel format:** unchanged — same `Nama Alat` / `Model` / `Qty` / `Serial No` / `AKD/AKL` columns and same `medcal-requisition-template.xlsx` template as Create. No revision-specific template was introduced; none was needed.

**Zero backend changes.** The existing `import/preview` endpoint already returns everything the revision-import needs (resolved `deviceTypeId` per row); the "map to current requisition scope" step needs the current requisition's items, which the portal already has loaded, so it belongs client-side only.

## 2. Files Changed

- `apps/portal/src/app/management/calibration-requests/[id]/page.tsx` — extended `ReviseRequestDialog` with an "Import Excel" entry point next to "Add Device"; moved `DesiredItemRow`/`rowFromItem` into the new module below (no behavior change) so the mapping logic is unit-testable.
- `apps/portal/src/app/management/calibration-requests/[id]/revision-desired-scope.ts` (new) — plain `.ts` module (no JSX) holding `DesiredItemRow`, `rowFromItem`, and the new pure function `buildImportedDesiredRows()`.
- `apps/portal/src/app/management/calibration-requests/[id]/import-revision-mapping.test.ts` (new) — Vitest coverage for `buildImportedDesiredRows()`.

No files under `apps/api` were touched for this task.

## 3. What Was Added to the Revision UI

- An `[ Import Excel ]` button, styled and positioned next to the existing `[ + Add Device ]` button inside the same `ReviseRequestDialog` — no new dialog/page.
- Selecting a `.xlsx` file calls the existing `previewMutation` (`import/preview`), then runs `buildImportedDesiredRows(request.items, preview.rows)` and replaces the dialog's local `rows` state with the result — **no API call that touches the database**.
- The resulting rows render through the exact same list/badges (`Unchanged` has no badge, `Changed`/`Added`/`Removed` badges) and remain fully editable: qty can still be hand-adjusted, devices can still be changed, rows can still be manually removed or un-removed, and more rows can still be added manually after an import.
- `Save Revision` is unchanged: it still calls `useReviseCalibrationRequest()` → `POST /calibration-requests/:id/revise`, sending only the active (non-removed) rows, exactly as it did before this task.
- Any row the parser/matcher could not resolve (parse error, or a device name with no confident `DeviceType` match) blocks the import entirely — the dialog's `rows` state is left untouched and the unresolved rows are listed as an error message. Nothing is silently guessed or dropped.

## 4. Excel Row → Desired-Scope Mapping

Implemented in `buildImportedDesiredRows()` (`revision-desired-scope.ts`):

1. Run each preview row through the identity rule: if its resolved `deviceTypeId` matches a `deviceTypeId` still present on the requisition's **current** items (`request.items`), and that current item hasn't already been claimed by an earlier row in the same file, the imported row **retains that item's `id`** and is treated by the existing revision engine as update-in-place (e.g. qty change).
2. Every other resolved row (new device type, or a repeat of a device type already claimed) becomes a **new** desired-scope row with no `id` — the existing engine treats it as an addition.
3. Any current item whose `deviceTypeId` never appeared in the file is kept in the result, marked `removed: true` — the same mechanism the manual "✕" button already uses, so it is still visible with an "Undo" affordance and is excluded from the payload only if the user leaves it removed.
4. A row with a parser/matcher error, or with no resolvable `deviceTypeId`, adds a message to a blocking `errors[]` array; if any error exists, the whole import is rejected (nothing is applied to `rows`) rather than partially applied.

This matches the MOM's worked example exactly: Blood Pressure Monitor ×1 → unchanged (id retained, qty same); Ventilator ×1→×3 → changed (id retained, qty updated); Patient Monitor → added (no id); Audiometer (absent from file) → removed (id retained, `removed: true`).

No `deviceTypeId`-only guessing across ambiguous cases occurs beyond what the existing matcher already resolves — deviceTypeId is only used to look up the *current requisition's own items*, not as a global identity across requisitions.

## 5. Tests and Results

New file `apps/portal/src/app/management/calibration-requests/[id]/import-revision-mapping.test.ts`, 5 tests, all against the pure `buildImportedDesiredRows()`:

1. MOM worked example end-to-end: unchanged / changed / added / removed all correctly represented in one call.
2. A row the matcher could not resolve (`match.deviceTypeId: null`) is rejected with a row-numbered, device-name-containing error — not guessed.
3. A row carrying a pre-existing parser/matcher error (e.g. missing qty) is surfaced as a blocking error, not dropped.
4. Two file rows resolving to the same current item's `deviceTypeId` claim that item's id only once; the extra row becomes an added row — no double-claiming.
5. Calling the function never mutates the `currentItems` array passed in (asserted via a before/after `JSON.stringify` snapshot) — confirming the no-DB-mutation-before-save requirement at the mapping layer.

**Results:**

- New test file: **5/5 passed**.
- Full portal suite (`pnpm --filter @medcal/portal exec vitest run`): **22 files / 227 tests passed, 0 failed** (222 pre-existing + 5 new).
- Existing Create-Requisition Excel import backend tests (`calibration-request-import.service.test.ts`, `calibration-requests.service.test.ts`): **63/63 passed**, confirming the untouched `import/preview`/`import/confirm` flow still works exactly as before.
- Typecheck (`pnpm --filter @medcal/portal exec tsc --noEmit`): clean, no errors.

Not separately re-run: the full API suite (unchanged by this task; already verified clean in the immediately prior phase) and portal build — the changed code is plain TS/TSX already covered by the passing typecheck and the existing dev-server-driven manual verification pattern used for prior UI phases in this MOM.

## 6. Blockers

None. The task was completable entirely within the existing architecture: the existing `import/preview` endpoint, the existing revision engine/endpoint, and the existing `ReviseRequestDialog` state model needed no changes — only an additional entry point that produces the same `DesiredItemRow[]` shape the dialog already consumes.
