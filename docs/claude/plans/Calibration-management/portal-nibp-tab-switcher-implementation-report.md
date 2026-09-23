# Portal Parameter Detail Page: Tab Switcher for NIBP-style Sibling Config

## Status: implemented, verified, approved

Two-checkpoint implementation following a Stage 1 read-only audit + design proposal. Both
checkpoints were reviewed with screenshots before proceeding to the next; a follow-up
question about save/tab-persistence behavior was verified empirically before this report was
written.

## Files touched

Only two files, across both checkpoints:

- `apps/portal/src/app/management/device-calibration-parameters/device-calibration-parameters-ui.tsx`
  (+125/-  — Checkpoint 1 + a shared helper used by Checkpoint 2)
- `apps/portal/src/app/management/device-calibration-parameters/[id]/page.tsx`
  (+194/-70 — Checkpoint 2)

`git diff --stat`: 2 files changed, 249 insertions(+), 70 deletions(-). No schema, migration,
or API changes; no other app (tech-pwa) touched.

## Step 0 audit corrections (recap)

The task's stated premises didn't fully match the code and were corrected before designing:

- `calibration-jobs/[id]`'s "tabs" are actually a multi-open Radix **Accordion**
  (`type="multiple"`), not a mutually-exclusive tab switcher — client state, no URL
  involvement, mixed mount/unmount behavior per section.
- The `/device-calibration-parameters` list page had **no existing collapsed row** for NIBP
  siblings — each sibling rendered as its own independent row. This meant Stage 2 needed to
  *build* the collapsed row, not just redirect an existing one.
- The Titik Ukur grouped-block table was already confirmed sibling-agnostic (resolves via
  `deviceTypeId` + `capabilityId`, not the URL's specific sibling id) — this part of the
  premise held and is unaffected by this work.

## Design decisions applied

1. **Tabs, not the accordion pattern.** A plain button-group + conditional render (no new
   dependency — no `@radix-ui/react-tabs` in the codebase, so none was added), mutually
   exclusive, matching the visual mock rather than literally reusing
   `calibration-jobs/[id]`'s multi-open accordion.
2. **List-page collapsed row and detail-page tab switcher built together, in sequence** — list
   row first (Checkpoint 1), tab switcher second (Checkpoint 2) — since the two are
   interdependent (the collapsed row's link target only matters together with the tab
   switcher's own default-tab rule).
3. **Unsaved-edit confirm dialog.** Switching tabs while the edit form has unsaved changes
   shows the existing app-wide `ConfirmDialog` (reused from
   `../calibration-requests/calibration-requests-ui`, not a new component) —
   "Ada perubahan belum disimpan pada {sibling}, tetap pindah ke {target}?" — never silently
   discards. Confirmed → `formFromRow(target)` resets the form; Cancel → stays on the current
   tab with the edit intact.

Also approved as designed: `activeSiblingId` as local client state (no URL/query param), no
extra refetch on tab switch (siblings are already fetched together via the existing
`siblingsQuery`), the Titik Ukur card left completely untouched, the Edit/Status mutation
targeting `activeSibling.id` (not a merged/ambiguous object), and the default tab resolved by
looking up the lowest `sortOrder` sibling (via a shared `sortSiblingsByOrder` helper) rather
than trusting array position.

## Checkpoint 1 — list-page collapsed row

`device-calibration-parameters-ui.tsx`:

- Hoisted `GROUPED_TITIK_UKUR_CAPABILITY_CODES` (previously a local const duplicated in
  `[id]/page.tsx`) into this shared file as the single source of truth, plus two new exported
  helpers: `isGroupedTitikUkurCapability(code)` and `sortSiblingsByOrder(rows)`.
- `CapabilitySection` now branches: a capability on the allowlist with >1 parameter renders
  one new `GroupedParameterRow` instead of one `SortableParameterRow` per sibling.
- `GroupedParameterRow`: joined sibling names ("Systole / Mean / Diastole") + a "N parameter"
  badge; UOM/Decimal aggregated only when identical across siblings (else "—"); Tolerance
  shows "— (per titik ukur)" since that's genuinely per-test-point, not per-parameter; Status
  badge shown only when all siblings agree (else "Campuran"); links to the
  **lowest-sortOrder sibling's id**, resolved via `sortSiblingsByOrder`, not hardcoded array
  position.
- Non-grouped capabilities are untouched — verified with a Vital Signs (Heart
  Rate/SpO2) fixture rendering flat, same drag handles, in the same screenshot pass.

Verified: `tsc --noEmit` clean; screenshot of the real `DeviceTypeParameterTable` component
(via a temporary, since-deleted fixture harness) showing the collapsed NIBP row alongside an
unaffected flat capability.

## Checkpoint 2 — detail-page tab switcher

`[id]/page.tsx`:

- New state: `activeSiblingId` (defaults to the lowest-sortOrder sibling via lookup) and
  `pendingSiblingId` (holds the target tab while the confirm dialog is open).
- `activeSibling` derived as `siblings.find(s => s.id === activeSiblingId) ?? siblings[0]`
  when grouped with >1 sibling, else falls back to the URL's own `row` — so non-grouped
  parameters are completely unaffected (no tabs render, everything behaves exactly as
  before).
- Every config-card field, the Status select, `entryStyleLocked`, `PageHeader`
  title/breadcrumb, and the Edit/Save mutation (`updateMutation.mutateAsync({id:
  activeSibling.id, ...})`) now target `activeSibling` instead of `row`.
- `save()` refetches both `parameterQuery` and `siblingsQuery` (the edited sibling may not be
  the URL's own row — e.g. editing Mean while the URL still names Systole).
- Tab bar: one button per sibling (`sibling.capabilityItem.name`), `role="tab"`/
  `aria-selected`, rendered only when `isGroupedCapability && siblings.length > 1`.
- Removed the local duplicate `GROUPED_TITIK_UKUR_CAPABILITY_CODES`; now imports
  `isGroupedTitikUkurCapability` and `sortSiblingsByOrder` from the shared UI file.
- Phase 4C's non-grouped Titik Ukur handlers (`submitTestPoint`, `saveTestPoint`,
  `toggleTestPointActive`, `moveTestPoint`) were deliberately **left keyed to the URL's own
  `row!.id`** — they only run when `!isGroupedTestPoints`, i.e. never for a grouped capability,
  so this is correct as-is, not an oversight.

Verified against the **real production route** (`/device-calibration-parameters/param-...`,
proxy-rewritten to `/management/...`), with the full page tree exercised — `ManagementLayout`'s
auth gate, `useNav`, `useRequireSession` — via network-level route interception (fake
session/`/me`/data responses), not a fixture-only harness. This is a stronger test than
Checkpoint 1's harness: it proves the tab switcher works inside the actual auth-gated page,
not just the isolated component.

Screenshots taken (all since deleted along with the verification script — `git status` clean
of anything but the two source files):
1. Landing on Systole's id → Systole tab active by default, config card shows Systole's data,
   title "Systole".
2. Clicking the Mean tab → every field swaps to Mean's own values (Kode → NIBP_MEAN,
   description → Mean-specific text), title updates to "Mean", same URL (no navigation, no
   refetch of the page).
3. Editing Mean's Nama, then clicking Diastole's tab → the `ConfirmDialog` appears
   ("Ada perubahan belum disimpan pada Mean, tetap pindah ke Diastole?"), correctly blocking
   the switch until confirmed or cancelled.

## Follow-up verification: does the tab stay on the edited sibling after Save?

Explicitly re-verified empirically (not just by code review) before writing this report:
edited Mean's Nama to "Mean (Saved Edit)" and saved. Result — **the tab selection correctly
stays on Mean**: the Mean tab remained highlighted, the title/breadcrumb updated to
"Mean (Saved Edit)", the success message "Perubahan tersimpan." appeared, and the read-only
config card showed the freshly saved value. No reset to the URL's own row.

Why this works structurally: `activeSiblingId` is independent state, set only by
`switchToSibling` (called from tab clicks or the confirm dialog's "Tetap pindah") — `save()`
never touches it. After `save()`'s refetch, `siblings` gets fresh data but `activeSiblingId`'s
string value is untouched, so `siblings.find(s => s.id === activeSiblingId)` still resolves to
the same (now updated) sibling. No bug found; no fix needed.

## Confirmation of scope boundaries

- **Titik Ukur card**: unaffected — still resolves via `deviceTypeId` + `capabilityId`
  (`siblings`), never reads `activeSibling`. Verified structurally (code) and visually
  (screenshots show it rendering identically regardless of active tab).
- **No other capability's page affected**: the tab bar and `activeSibling` derivation only
  activate when `isGroupedCapability && siblings.length > 1` — for every other capability,
  `activeSibling` falls back to `row` and the page behaves exactly as it did before this
  change (verified in Checkpoint 1's screenshot with Heart Rate/SpO2 rendering flat).
- **tech-pwa**: not touched — `git diff --stat` confirms only the two Portal files above
  changed.
- **No schema/migration change**: confirmed — both files are React components / UI helpers
  only; no Prisma schema, migration, or API endpoint was added or modified.

## Final verification summary

| Check | Result |
|---|---|
| `tsc --noEmit` (portal) | Clean, 0 errors |
| List-page collapsed row (screenshot) | Correct — grouped vs. flat capabilities both verified |
| Detail-page tab default (Systole) | Correct |
| Detail-page tab switch (config card swap) | Correct — all fields, title, breadcrumb |
| Unsaved-edit confirm dialog | Correct — blocks the switch, uses existing `ConfirmDialog` |
| Tab persistence after Save | Correct — confirmed empirically, no reset |
| Titik Ukur card unaffected | Correct |
| Other capabilities unaffected | Correct |
| tech-pwa unaffected | Correct — zero files touched |
| Working tree | Clean except the two intended files |

No outstanding issues. Considered closed.
