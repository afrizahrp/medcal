# IMPLEMENT — Rollout usePaginationSync to Remaining 20 List Pages

## Mode
The design (`usePaginationSync` + `ViewAdjustedBanner`) is already validated on two pilot pages
(Equipment Requirements, Price List Items) — Stage 1/Stage 2 checkpoints for the mechanism
itself are done. This task is mechanical rollout, not new design. Still: do NOT blindly
copy-paste the wiring into every file without checking each page's actual shape first — some of
the 20 pages may not fit the standard pattern (see Step 2). Flag any page that doesn't fit
rather than forcing the pattern onto it.

**Scope lock:** wire `usePaginationSync` + `ViewAdjustedBanner` into the 20 pages listed below.
Do NOT modify `use-pagination-sync.ts`, `view-adjusted-banner.tsx`, or the two already-done pilot
pages. Do NOT implement Fix Option 3 (`router.push`-for-first-change) — still deferred, separate
task. Do NOT touch tech-pwa or any API file.

## The 20 pages (from the rollout checklist)

```
calibration-jobs
calibration-requests
customers
device-calibration-parameters
device-capabilities
device-categories
device-models
device-type-aliases
device-types
devices
email
equipment-types
equipment-units
leads
purchase-orders
quotations
tax
uoms
users
work-orders
```

## Step 1 — Known gotcha from the pilot (apply this check to every page)

The pilot found that **hook call placement matters**: `usePaginationSync` must be called
before any early return in the component (e.g. an `AccessDenied`/capability-gate return) to
satisfy the Rules of Hooks — Price List Items needed a placement fix that Equipment
Requirements didn't. Check this explicitly for each of the 20 pages before wiring, don't assume
a uniform position works everywhere.

## Step 2 — Per-page fit check (do this before wiring, not after)

For each page, confirm before wiring:
1. It actually uses server-side pagination with a `totalPages`-bearing response (some of the
   20 — e.g. `device-capabilities`, `device-categories`, `tax`, `uoms` — may be small
   reference-data lists with no pagination at all, or client-side-only pagination/filtering. If
   a page has no `totalPages` concept, `usePaginationSync` doesn't apply — skip it and say so
   explicitly, don't force it in).
2. Its list rendering has a genuine empty-state branch to guard with `didClamp` (mirroring the
   pilot's "Menyesuaikan halaman…" intermediate state) — confirm the exact branch per page
   rather than assuming identical structure to the pilots.
3. Whether its `totalPages` comes from grouped/aggregated data (like Equipment Requirements) or
   plain row pagination (like Price List Items) — both are already proven to work, just confirm
   which shape applies so the wiring (`onClamp` callback target) is correct.

## Step 3 — Wire each fitting page

For each page confirmed in Step 2 to fit the pattern:
1. Add the `usePaginationSync` call (correctly placed per Step 1's rule) + render
   `<ViewAdjustedBanner>` conditionally on `didClamp`, matching the pilot's placement
   convention (near the top of the list surface, above the search/filter row).
2. Add the `didClamp`-guarded intermediate state replacing the bare empty-state branch, per the
   pilot's exact pattern.
3. Do this one page at a time (not all 20 in one uninspected batch) — after each page, confirm
   it typechecks before moving to the next, so a mistake in page 3 doesn't get compounded into
   pages 4-20 before being caught.

## Step 4 — Verification

1. Run `apps/portal` full typecheck.
2. Run `apps/portal` full test suite.
3. Run `next build` (production build) — confirm all routes still compile, per the pilot's
   verification approach.
4. Produce a final summary table: page name → wired / skipped-with-reason (per Step 2's fit
   check) → typecheck status.

## Output / final message format

Present, per page: whether it fit the pattern and was wired, or was skipped with a specific
reason (no server pagination, different shape, etc.) — do not silently skip without saying so.
End with the full verification results (typecheck, test suite, build) and final `git status`
listing every changed file.
