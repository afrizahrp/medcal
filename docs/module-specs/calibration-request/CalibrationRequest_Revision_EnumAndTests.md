# CalibrationRequest MODULE — REVISION PASS (resolve 2 open issues)

## Mode
This is still an IMPLEMENTATION task (not audit). Scope stays the same as before: only the
CalibrationRequest module files already created/modified. Do not touch anything else.

## Issue 1 — Confirm the ACTUAL CalibrationRequestStatus enum (discrepancy found)

There is a conflict between two sources:
- The final audit report (`audit-technician-portal-e2e.md`, Section 3) states the enum is:
  `DRAFT → IN_QUOTATION → QUOTED → ACCEPTED → IN_PROGRESS → FULFILLED → CANCELLED` (7 values)
- Your implementation report states you found:
  `DRAFT → SUBMITTED → IN_QUOTATION → FULFILLED` + `CANCELLED` (5 values)

These cannot both be right. Resolve this now:

1. Open `packages/db/prisma/schema.prisma` and find the literal `enum CalibrationRequestStatus`
   block. Paste the EXACT current content (all values, in the order they appear) with the
   exact line number, in your response — do not paraphrase or summarize it.
2. If the enum genuinely has only the 5 values you implemented against (DRAFT, SUBMITTED,
   IN_QUOTATION, FULFILLED, CANCELLED), no code changes are needed — just confirm this
   explicitly and note that the earlier audit's Section 3 table was inaccurate (this is useful
   feedback, not a blocker).
3. If the enum actually has more values (e.g. QUOTED, ACCEPTED, IN_PROGRESS) that your
   `calibration-requests.service.ts` does not currently handle, then:
   - Do NOT implement full transition logic for states that depend on modules that don't
     exist yet (e.g. QUOTED/ACCEPTED likely depend on the Quotation module).
   - But DO add explicit `// TODO:` comments in the service noting which enum values exist in
     schema but have no transition method yet, so this isn't silently incomplete.
   - Update your summary to list which states are and are not yet reachable through this
     module's API.

## Issue 2 — Tests were skipped, they must actually run

Your report says tests were skipped due to missing `DATABASE_URL`. But the B1/B2/B3 fix task
(done in an earlier session against the same repo) successfully ran
`document-number.service.test.ts` and `customers.service.test.ts` with real pass/fail results
— so a working test database setup exists in this project.

IMPORTANT: This project's local database is a NATIVE Postgres install, not Docker. Docker in
this repo (see `apps/api/Dockerfile`) is used only for production deployment builds — do NOT
run `docker-compose up`, do NOT check for or start any Docker container. Follow these steps
instead:

1. Read the `.env` file at the repo root (and/or `packages/db/.env` if a separate one exists)
   to find the `DATABASE_URL` value — note the host/port it points to.
2. Check whether the native Postgres service on that host/port is currently running. Use a
   read-only check appropriate for the OS (e.g. `pg_isready -h <host> -p <port>`, or checking
   the OS service status — do not use a command that starts/stops/modifies anything for this
   check).
3. If it's not running, start the native Postgres service using the OS's normal
   service-management method (e.g. `systemctl start postgresql` on Linux, the Windows
   Services panel/`net start` for a Windows Postgres service, or however this machine's
   Postgres was installed — check for a README or setup doc in the repo first in case there's
   a documented command; if genuinely unsure how to start it, STOP and ask rather than
   guessing at a command that could target the wrong service).
4. Once the database is confirmed reachable, actually run
   `calibration-requests.service.test.ts` plus `customers.service.test.ts` and
   `document-number.service.test.ts` again, and report the REAL pass/fail results — not
   "structurally complete." If a test fails, fix the implementation (not the test) unless the
   test itself is provably wrong, and report what you changed.
5. If after genuinely trying you still cannot get the database reachable (e.g. it requires
   credentials or a setup step you don't have access to), say so explicitly and explain
   exactly what's missing — don't silently leave it as "skipped."

## Output

Update the existing report at
`D:\medcal\docs\claude\plans\Calibration-management\Reports_Implementation_CalibrationRequest_Module.md`
with corrected findings for both issues above (Section "CalibrationRequest Schema Fields" and
"Verification Results"). Do not create a new file. In your chat summary, lead with the exact
enum content from Issue 1, then the real test results from Issue 2.
