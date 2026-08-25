# PHASE A — DISCOVERY ONLY (Audit Task 1 of 4)

## HARD RULE — READ THIS FIRST AND OBEY IT THE ENTIRE SESSION
You are in READ-ONLY AUDIT MODE.
- Do NOT edit, create, delete, rename, move, or refactor ANY file except the ONE output file
  named at the bottom of this prompt.
- Do NOT run any command that writes to disk, installs packages, generates code, runs
  migrations, or modifies git state (no `git add`, `git commit`, `npm install`, `prisma
  migrate`, `prisma generate`, `pnpm install`, etc.).
- You MAY run strictly read-only commands (`ls`, `find`, `grep`, `cat`, `git log --oneline`,
  `git diff --stat` without writing, `prisma format --check` type read-only checks) if needed
  to inspect the repo.
- If you are unsure whether a command writes to disk, DO NOT RUN IT. Skip it and note the
  limitation in your output file instead.
- This is Phase A of 4. Your ONLY job in this phase is DISCOVERY — building a structural map.
  Do NOT analyze correctness, do NOT judge quality, do NOT flag bugs yet. Just map what exists.

## Context (facts — do not re-derive, just use these)
- Monorepo root: `D:\medcal`
- `D:\medcal\apps\api` — shared backend, serves both frontends below
- `D:\medcal\apps\portal` — Portal Management App, live at apps.kalibrasimedika.co.id
- `D:\medcal\apps\tech-pwa` — Technician App (PWA), target technician.kalibrasimedika.co.id
  (nginx/TLS deferred to production — do not investigate that)
- System is SINGLE-TENANT (one company: Kalibrasi Medika). `companyId` is expected to come
  from `.env`, not multi-tenant SaaS.
- Currency: single currency (IDR) only, no multi-currency.
- Customer-facing self-service portal is OUT OF SCOPE (not built yet, deferred).
- Business lifecycle in scope: Calibration Request → Quotation → Purchase Order → Work Order →
  Invoice → Payment.
- Planning docs are consolidated at:
  `D:\medcal\docs\claude\plans\Calibration-management\`

## Your Checklist for This Phase (do these in order)

1. List every file inside `D:\medcal\docs\claude\plans\Calibration-management\` with a
   one-line description of what each file appears to cover (based on filename + skim of
   headings only — do not deep-read yet).

2. List the top-level folder structure of `apps/api` (routes/controllers, services, Prisma
   schema location — just the directory tree + file count per folder, 2 levels deep max).

3. List the top-level folder structure of `apps/portal` (page/route structure, 2 levels deep).

4. List the top-level folder structure of `apps/tech-pwa` (page/route structure, 2 levels
   deep).

5. Find every file/location where `documentNumberingSequence` (or equivalent name — search
   case-insensitively and also try `DocumentNumberingSequence`, `numbering_sequence`,
   `docNumberingSequence`) appears. List file path + line number for each occurrence. Do not
   analyze the logic yet — just locate it.

6. Find the Prisma schema file(s) and list which models exist that are relevant to: Customer,
   Calibration Request, Quotation, Purchase Order, Work Order, Invoice, Payment. For each
   model found, just note: file path, model name, and a one-line "this model appears to
   represent X" — no deeper analysis.

7. Note anything you expected to find based on the context above but could NOT find (e.g. no
   Quotation model at all, no tech-pwa routes for a certain flow). List these as
   "Not Found / Possibly Missing" — do not conclude WHY yet, just flag it for Phase B.

## Output

Write your findings to exactly this ONE new file (do not touch any other file):

`D:\medcal\docs\claude\plans\Calibration-management\audit-phase-A-discovery.md`

Use this structure:

```markdown
# Phase A — Discovery Notes

## 1. Planning Docs Inventory
[file list + one-liners]

## 2. apps/api Structure
[tree + notes]

## 3. apps/portal Structure
[tree + notes]

## 4. apps/tech-pwa Structure
[tree + notes]

## 5. documentNumberingSequence Occurrences
[file:line list]

## 6. Relevant Prisma Models Found
[table: Model name | File | One-line description]

## 7. Not Found / Possibly Missing
[list]

## Commands I Could NOT Run (and why)
[list any read-only-uncertain commands you skipped]
```

Do not add a verdict, do not add risk ratings, do not add recommendations. This phase is
mapping only. Stop after writing this file — do not proceed to analysis.

## FINAL REMINDER
Read-only audit. The repository must be unchanged except for the single new file above.
