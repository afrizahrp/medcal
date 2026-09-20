IMPLEMENT THE APPROVED DECISION — ExcelJS Decompression-Bomb Protection

Use the approved decision report:
docs/minutes-of-meeting/excel-import-decompression-bomb-decision-20260920.md

IMPLEMENT ONLY OPTION A:
ZIP central-directory declared-size pre-check before ExcelJS parsing.

IMPORTANT:
- DO NOT RE-AUDIT.
- DO NOT RE-DESIGN.
- DO NOT evaluate the other options again.
- DO NOT use exceljs-hardened.
- DO NOT introduce worker_threads.
- DO NOT add antivirus/ClamAV.
- DO NOT change the Excel import workflow.
- DO NOT change Revision logic.
- DO NOT change API/UI/database behavior except the new rejection case.
- DO NOT modify Docker/VPS configuration in this task.
- DO NOT add unrelated security hardening.

FIRST inspect the existing implementation, then implement the approved decision exactly.

IMPLEMENTATION:

1. In:
   apps/api/src/modules/calibration-requests/calibration-request-import.service.ts

   Add a ZIP central-directory pre-check that runs BEFORE:
   `workbook.xlsx.load(buffer)`

2. Use `unzipper`'s existing `Open.buffer()` API to inspect ZIP central-directory metadata without extracting/decompressing workbook entries.

3. Promote the EXACT already-resolved `unzipper` version from its current transitive dependency to an explicit direct dependency in:
   apps/api/package.json

   Do NOT upgrade or change the resolved version.

4. Validate:
   - each ZIP entry's declared uncompressed size
   - total declared uncompressed size across the archive

5. The validation must happen BEFORE ExcelJS performs workbook decompression.

6. Reject the workbook if:
   - any individual entry exceeds the chosen safe per-entry threshold, OR
   - total declared uncompressed size exceeds the chosen safe archive-wide threshold.

7. Thresholds:
   - inspect the actual Medcal Excel template and existing import constraints first
   - choose conservative thresholds comfortably above legitimate Medcal requisition spreadsheets
   - but sufficiently below a size that could threaten the API process
   - document the chosen values and rationale in code comments / report
   - do not arbitrarily copy the defaults from exceljs-hardened

8. Preserve existing behavior:
   - existing 5 MiB compressed upload limit remains unchanged
   - existing 1000-row limit remains unchanged
   - existing Excel parsing/matching remains unchanged
   - valid existing .xlsx files must continue to work
   - Create and Revision continue using the same shared pipeline

9. Error behavior:
   Follow the existing import service error style.

   Add a specific error code for this condition, e.g.:
   `WORKBOOK_TOO_LARGE_UNCOMPRESSED`

   It must be distinguishable from:
   - FILE_TOO_LARGE
   - MALFORMED_WORKBOOK
   - TOO_MANY_ROWS

10. Fail closed:
   If ZIP central-directory inspection cannot safely determine the required metadata, reject the workbook rather than bypassing the protection.

TESTS:

Add focused tests in:
apps/api/src/modules/calibration-requests/calibration-request-import.service.test.ts

Required tests:

A. Oversized single-entry ZIP
- Build a minimal ZIP fixture manually.
- Central directory declares an uncompressed size above the per-entry threshold.
- Assert the import is rejected.
- Ensure rejection occurs before ExcelJS parsing.

B. Oversized total ZIP
- Build a ZIP with multiple entries.
- Each individual entry is below the per-entry threshold.
- Combined declared uncompressed size exceeds the archive-wide threshold.
- Assert rejection.

C. Legitimate existing XLSX
- Existing valid Excel import fixture continues to pass.

D. Malformed/non-ZIP upload
- Confirm it remains rejected safely.
- Preserve existing MALFORMED_WORKBOOK behavior where applicable.

E. Regression:
- Existing import tests must continue passing.
- Revision Excel import must continue working because it uses the same endpoint/service.

TESTING:
- Run the focused import service tests.
- Run the relevant API test suite.
- Run API typecheck.
- Do not claim tests passed unless actually executed.

REPORT:
Create/update:
docs/minutes-of-meeting/excel-import-decompression-bomb-implementation-20260920.md

Include:
1. What was implemented
2. Exact thresholds chosen and why
3. How the pre-check works
4. Why it executes before ExcelJS decompression
5. Files changed
6. Dependency change
7. Tests executed/results
8. Any remaining limitations

FINAL RULE:

IMPLEMENT ONLY THE APPROVED ZIP PRE-CHECK.
NOTHING ELSE.