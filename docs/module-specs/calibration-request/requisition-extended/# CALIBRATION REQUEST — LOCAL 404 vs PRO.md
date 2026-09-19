# CALIBRATION REQUEST — LOCAL 404 vs PRODUCTION WORKS

# STRICT AUDIT + ROOT-CAUSE FIX

# DO NOT INVENT OR REDESIGN ROUTES

We found the following behavior in LOCAL DEVELOPMENT:

    GET /calibration-requests                              -> 200

    GET /calibration-requests/<valid-id>                  -> 404

    GET /calibration-requests/new                          -> 404

Example:

    /calibration-requests/cmtcfhwqi000do10nwtqufhts

    /calibration-requests/new

IMPORTANT CONTEXT:

The EXACT SAME Calibration Request flow works correctly in PRODUCTION.

Therefore, DO NOT assume that the routes are missing or that the application
architecture is wrong.

The primary task is to determine why LOCAL returns 404 while PRODUCTION
works.

============================================================

1. DO NOT CHANGE CODE YET
   \============================================================

First perform a read-only audit.

Do not immediately create:

- new pages
- new routes
- redirects
- notFound changes
- middleware changes
- API changes

First identify the difference between local and production.

============================================================ 2. AUDIT LOCAL ROUTES
============================================================

Inspect:

    apps/portal/src/app/

Find the actual Calibration Request routes.

Search for:

    calibration-requests
    CalibrationRequest
    router.push
    href
    notFound
    redirect

Determine the canonical routes currently implemented in source.

Do not assume:

    /calibration-requests/new
    /calibration-requests/[id]

must exist merely because the browser requests them.

============================================================ 3. COMPARE WITH PRODUCTION
============================================================

Production is known to work.

Determine why.

Inspect the currently deployed production source/build if available.

Compare:

LOCAL SOURCE
vs
PRODUCTION DEPLOYED BUILD / SOURCE / COMMIT

Specifically compare:

- git commit
- branch
- deployment version
- apps/portal route tree
- generated Next.js route manifest
- relevant Calibration Request files
- proxy.ts / middleware
- environment variables relevant to routing
- feature flags
- base path
- route configuration
- API base URL
- authentication configuration

DO NOT expose secrets.

Only report variable names and safe metadata.

============================================================ 4. CHECK GIT STATUS / RECENT CHANGES
============================================================

Run:

    git status

and inspect recent history affecting:

    apps/portal/src/app/calibration-requests
    calibration-requests
    proxy.ts
    middleware
    portal routing

Determine whether LOCAL contains changes that are not present in production.

Also determine whether production is running an older/newer commit.

This is especially important because the issue may be:

    source/build mismatch
    stale Next.js build
    stale dev server
    different commit
    deleted route
    renamed route
    environment difference

============================================================ 5. CHECK NEXT.JS DEV ROUTE RESOLUTION
============================================================

Inspect the actual filesystem route structure.

Then inspect whether Next.js dev has recognized the routes.

Do not assume filesystem presence means Next.js has loaded them.

If appropriate, restart the LOCAL portal dev server after identifying a
potential stale build/cache problem.

Check for:

    .next
    generated route manifests
    stale build artifacts

If a safe cache cleanup is required, explain it first and only clean LOCAL
development artifacts.

Do NOT touch production.

============================================================ 6. CHECK THE REQUESTED ID
============================================================

For:

    cmtcfhwqi000do10nwtqufhts

determine whether the record exists in the LOCAL development database.

Do NOT modify the database.

If the ID does not exist locally, distinguish clearly between:

A. route itself returns 404

and

B. route exists but the record is not found and correctly returns 404.

This distinction is critical.

============================================================ 7. CHECK /NEW SEPARATELY
============================================================

Investigate:

    /calibration-requests/new

independently.

Determine:

- Is this route actually implemented?
- Does production expose this route?
- Is production using a different create route?
- Is the local UI linking to a stale/incorrect URL?
- Is there middleware/redirect behavior?

Compare the actual production behavior rather than guessing.

============================================================ 8. CHECK PRODUCTION WITHOUT MODIFYING IT
============================================================

Production is the working reference.

DO NOT:

- deploy anything
- restart production
- modify production files
- run migrations
- change production DB
- change production configuration

Only inspect/read whatever safe information is already available.

If direct production source/build inspection is not available, use:

- current git history
- deployment metadata
- repository state
- existing production logs
- route structure

Do not invent a comparison result if production internals cannot be inspected.

============================================================ 9. ROOT CAUSE CLASSIFICATION
============================================================

Before making any fix, classify the root cause as one of:

1. LOCAL STALE BUILD/CACHE
2. LOCAL DEV SERVER STATE
3. LOCAL SOURCE REGRESSION
4. LOCAL ENVIRONMENT DIFFERENCE
5. DATABASE DATA DIFFERENCE
6. PRODUCTION RUNNING DIFFERENT COMMIT
7. ROUTING/MIDDLEWARE DIFFERENCE
8. OTHER — explain

Do not change application code if the actual cause is only stale local
build/cache/server state.

============================================================ 10. IMPLEMENT ONLY THE SMALLEST REQUIRED FIX
============================================================

After root cause is established:

- If stale local build/cache -> fix/restart local environment only.
- If source regression -> make the smallest source fix.
- If incorrect local navigation -> fix the incorrect link.
- If route implementation is genuinely missing in source -> restore the
  correct existing route architecture.
- If database record is missing -> DO NOT seed/fabricate data as a routing fix.

Do not redesign Calibration Requests.

============================================================ 11. STRICT BUSINESS LOGIC SCOPE
============================================================

DO NOT modify:

- CalibrationRequest schema
- Requisition
- Quotation
- Price List
- Work Order
- SPK
- WOL
- Device
- DeviceType
- DeviceTypeAlias
- Equipment Requirements
- Calibration Parameters
- numbering
- RBAC semantics
- approval/state machine
- API business logic

unless the root cause proves an existing route import/API dependency is
broken.

============================================================ 12. VERIFICATION
============================================================

After the fix, verify LOCAL:

    /calibration-requests
    /calibration-requests/new
    /calibration-requests/<valid-id>

For the valid ID:

    cmtcfhwqi000do10nwtqufhts

only use it if the record actually exists locally.

Also verify an invalid ID still correctly returns not-found behavior.

Run:

    pnpm --filter @medcal/portal typecheck

and:

    pnpm --filter @medcal/portal build

Do not claim the issue is fixed based only on typecheck/build.

Actually verify the routes in the running LOCAL development environment.

============================================================ 13. FINAL REPORT
============================================================

Return:

## ROOT CAUSE

Explain why LOCAL returns 404 while PRODUCTION works.

## PRODUCTION REFERENCE

Explain what was compared and what was found.

## FIX

State exactly what was changed.

If no source code change was required, explicitly say:

    "No application code change was required."

## ROUTES

Report:

    Calibration Request list:
    Calibration Request create:
    Calibration Request detail:

## VERIFICATION

Report:

- local route result
- valid ID result
- invalid ID result
- typecheck
- build

## DATABASE

Explicitly state whether any DB data was changed.

Expected:

    No database data changed.

## BUSINESS LOGIC

Explicitly confirm:

    No Calibration Request business logic changed.
    No Requisition business logic changed.
    No Quotation / Price List / Work Order logic changed.

IMPORTANT:

Do not claim PASS until you have identified the actual difference between
LOCAL and the known-working PRODUCTION behavior.
