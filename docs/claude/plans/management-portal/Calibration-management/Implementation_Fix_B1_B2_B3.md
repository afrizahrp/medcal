# IMPLEMENTATION TASK — Fix Blockers B1, B2, B3 (from audit-technician-portal-e2e.md)

## Scope & Mode
This is an IMPLEMENTATION task, not an audit. You ARE allowed to edit files and run
migrations for this specific scope — but ONLY for the 3 fixes described below. Do NOT start
building any lifecycle module (CalibrationRequest, Quotation, PurchaseOrder, WorkOrder,
Invoice, Payment, Certificate, CreditNote UI/API/controller/service). Do NOT touch B4 (that's
a separate, larger schema decision, out of scope for this task). Do NOT touch any file
outside what's listed below.

## Context
This fixes 3 of the 4 Blocker-for-MVP findings from the audit at
`D:\medcal\docs\claude\plans\Calibration-management\audit-technician-portal-e2e.md`
(Section 14, findings B1, B2, B3). Read that section first for full context before starting.

## Fix 1 — B1: DOCUMENT_TYPE_NUMBER_TABLE incomplete + unsafe type

File: `packages/db/src/document-number/document-type-table.ts`

1. Add missing entries for `PURCHASE_ORDER` and `WORK_ORDER` to
   `DOCUMENT_TYPE_NUMBER_TABLE`, following the same naming convention already used for the
   existing entries (e.g. `CUSTOMER: "Customer"`, `CALIBRATION_REQUEST: "CalibrationRequest"`
   — so likely `PURCHASE_ORDER: "PurchaseOrder"`, `WORK_ORDER: "WorkOrder"`, but check
   `DOCUMENT_TYPE_PREFIX` in the same directory for the established naming pattern first and
   match it exactly).
2. Change the type annotation from `Partial<Record<DocumentType, string>>` to
   `Record<DocumentType, string>` (remove `Partial`). This makes the compiler enforce that
   every `DocumentType` enum member has an entry, preventing this exact bug from recurring.
3. This change alone will not compile until Fix 2 (below) also adds `INVOICE`, `CERTIFICATE`,
   `CREDIT_NOTE` to the enum AND this table — so do Fix 2 in the same pass before verifying
   the build.

## Fix 2 — B2: DocumentType enum missing INVOICE, CERTIFICATE, CREDIT_NOTE

File: `packages/db/prisma/schema.prisma`

1. Add `INVOICE`, `CERTIFICATE`, `CREDIT_NOTE` to the `enum DocumentType` block (currently
   around line 212-218). Match existing naming convention (SCREAMING_SNAKE_CASE).
2. This is a Prisma schema change and REQUIRES a migration. Do this carefully:
   - Check `packages/db/package.json` (or wherever Prisma is configured) for the correct
     migration command for this project (likely `prisma migrate dev --name <description>`
     run from the correct package directory — verify the working directory and exact command
     from existing scripts rather than guessing).
   - Use a clear migration name, e.g. `add_invoice_certificate_creditnote_to_document_type`.
   - After generating the migration, review the generated SQL file before/after applying — it
     should be a simple `ALTER TYPE ... ADD VALUE` (or equivalent) with no data loss. If the
     generated migration looks like it does anything beyond adding enum values (e.g. touches
     unrelated tables, drops columns), STOP and report it instead of applying it.
   - This is a local/dev database migration — confirm you're targeting the local/dev database
     configured in this environment, not any shared or production database. If you are
     unsure which database the Prisma config points to, STOP and ask before running the
     migration.
3. In `packages/db/src/document-number/document-type-table.ts` (same file as Fix 1), add
   `INVOICE`, `CERTIFICATE`, `CREDIT_NOTE` entries to `DOCUMENT_TYPE_NUMBER_TABLE`.
4. In `packages/db/src/document-number/document-type-prefix.ts` (or wherever
   `DOCUMENT_TYPE_PREFIX` is defined), add `INVOICE`, `CERTIFICATE`, `CREDIT_NOTE` entries
   too, following the existing prefix naming convention (check existing prefixes like
   whatever `CUSTOMER`/`QUOTATION` use, e.g. 3-4 letter codes, and pick sensible matching
   prefixes — note them clearly in your summary at the end so the person can confirm/adjust).

## Fix 3 — B3: Permission catalog missing calibration lifecycle resources

File: `packages/auth/src/access-control.ts`

1. Look at the existing `permissionCatalog` structure (around line 40-62) and how an existing
   resource like `customer` or `lead` is defined (its shape: resource name + list of actions).
2. Add new resource entries for: `calibrationRequest`, `quotation`, `purchaseOrder`,
   `workOrder`, `calibrationJob`, `certificate`, `invoice`, `payment`. For each, use a
   sensible action set following the existing pattern in the file (typically something like
   `["read", "create", "update", "cancel"]` — adjust per resource if the existing pattern
   distinguishes further, e.g. add `"approve"` for quotation/purchaseOrder if that pattern
   exists elsewhere in the file for similar approval-type resources).
3. Do NOT wire these permissions into any controller/route yet — that happens when each
   module is actually built. This fix is only about the catalog itself existing and being
   complete, so future modules have something to reference.

## Verification (do this after all 3 fixes are in place)

1. Check `package.json` files (root and `packages/db`, `packages/auth`) for the correct
   typecheck command (e.g. `pnpm typecheck`, `tsc --noEmit`, or similar — verify the actual
   script name rather than guessing) and run it. Fix any type errors that result from these
   changes before proceeding.
2. Run the existing test suites that touch these files if a safe test command exists:
   - `packages/db/src/document-number/document-number.service.test.ts` (should still pass
     unchanged — these fixes don't change its logic)
   - `apps/api/src/modules/customers/customers.service.test.ts` (should still pass unchanged)
   Use whatever the project's actual test command is (check `package.json`); if running tests
   might mutate snapshot files or coverage artifacts, run in a mode that doesn't write those
   (e.g. `--run` without `--update-snapshots`), or note if you're unsure and ask first.
3. Confirm the Prisma migration applied cleanly and `prisma generate` (or equivalent) has
   been run so the generated client reflects the new enum values.

## Output

Do not create a new report file for this task — this is an implementation task, not an
audit. When done, summarize in your final message:
- Exact diffs made to each of the 3 files/areas
- The migration name and a one-line description of what SQL it ran
- The prefix values you chose for INVOICE/CERTIFICATE/CREDIT_NOTE (flag these for the
  person's review since they're a naming judgment call)
- Typecheck and test results (pass/fail)
- Confirm nothing outside this scope (B1/B2/B3) was touched
