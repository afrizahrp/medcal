# MEDCAL — Phase 2 Implementation Report

## Excel Import + DeviceType Alias

**Date:** 2026-08-29
**Status:** Implemented and verified against the local development database (`pkmdb`). Not deployed.
**Spec:** `docs/claude/plans/Calibration-management/calibrationrequest/MEDCAL — PHASE 2 IMPLEMENTATION.md`
**Prior audits:** `implementation_report_requisition_phase1.md`, `implementation_report_excel_import_alias_audit.md`

---

## 1. Scope

Delivered:

- **`DeviceTypeAlias`** — new global master model + CRUD API + minimal management UI.
- **Excel import** for Calibration Requests — two-phase `preview` → `confirm`:
  parse `.xlsx` → validate rows → match DeviceType (exact name → alias → fuzzy
  suggestion → unmatched) → **explode Qty into device-granular items** → preview
  (no writes) → user resolves unmatched / acknowledges warnings → transactional
  create that **reuses `CalibrationRequestsService.create`**.
- RBAC: new `deviceTypeAlias` resource (read/create/update/delete), ADMIN-granted.
- Portal: "Import Excel" flow on the Requisition list; "Type Aliases" admin page.

Explicitly NOT done (per spec guardrails §30–§34): no `qty` column on
`CalibrationRequestItem`, no `matchedBy` column, no raw-Excel file storage, no
fuzzy auto-commit, no change to Quotation / PurchaseOrder / WorkOrder /
CalibrationJob / Device / DeviceType structure.

---

## 2. Schema changes

`packages/db/prisma/schema.prisma`:

```prisma
model DeviceType {
  // ...
  aliases DeviceTypeAlias[]   // NEW back-relation
}

// NEW model
model DeviceTypeAlias {
  id              String   @id @default(cuid())
  deviceTypeId    String
  alias           String                        // original text, for display
  normalizedAlias String                        // lower + trim + collapse whitespace
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  deviceType DeviceType @relation(fields: [deviceTypeId], references: [id], onDelete: Cascade)

  @@unique([normalizedAlias])   // one alias → AT MOST one DeviceType (ambiguity impossible)
  @@index([deviceTypeId])
  @@index([isActive])
}
```

- **Global** — no `companyId`, mirroring `DeviceType` / `DeviceCategory` / `Uom`.
- `@@unique([normalizedAlias])` is the §8 ambiguity guard: the DB physically
  cannot hold "Tensimeter → A" and "Tensimeter → B".
- `onDelete: Cascade` — deleting a DeviceType removes its aliases (DeviceType
  delete is already blocked by `DEVICE_TYPE_HAS_CALIBRATION_REQUESTS` etc.).
- **`CalibrationRequestItem` unchanged** — still no `qty`, still
  `deviceId String?` nullable, `customerDeviceName String?`, `model String?`
  from Phase 1. **No `matchedBy` column added.**

---

## 3. Migration

`packages/db/prisma/migrations/20260829153920_add_device_type_alias/migration.sql`
— additive only (one `CREATE TABLE`, three indexes, one FK). Applied to local
`pkmdb` via `prisma migrate dev`. `prisma migrate status` → "Database schema is
up to date" (47 migrations). Not deployed to production.

> Also present from Phase 1 in this branch:
> `20260829102845_add_customer_device_name_model_nullable_device_id_to_calibration_request_item`.

---

## 4. DeviceTypeAlias design

| Concern | Decision |
| --- | --- |
| Scope | Global. |
| Uniqueness | `@@unique([normalizedAlias])` — global, single-target. |
| Normalization | `normalizeDeviceTerm()` (shared) — `trim` → `toLowerCase` → collapse internal whitespace. Nothing else stripped. |
| Display | `alias` stores the original text verbatim. |
| Active/inactive | `isActive` boolean; the import matcher only reads `isActive: true` aliases. |
| Duplicate handling | Service pre-checks `normalizedAlias` and returns `409 DUPLICATE_ALIAS` with the conflicting alias + its DeviceType name; the DB unique index is the hard backstop. |
| Management | `apps/api/src/modules/device-type-aliases/` — `POST / GET / GET :id / PATCH / DELETE /device-type-aliases`, each `@RequirePermission("deviceTypeAlias", <action>)` behind `CompanyRoleGuard`. Service pattern copied verbatim from `DeviceTypesService`. |

Files: `device-type-aliases.{service,controller,module}.ts` (+ `.service.test.ts`),
registered in `app.module.ts`.

---

## 5. Normalization rules

`packages/shared/src/utils/index.ts` — `normalizeDeviceTerm(value)`:

```ts
value.trim().toLowerCase().replace(/\s+/g, " ")
```

Used for **both** sides of every match: `DeviceType.name`, `DeviceTypeAlias`
values, and each Excel `Nama Alat` cell. `" Tensimeter "`, `"tensimeter"`,
`"TENSIMETER"` → the same key `"tensimeter"`. Punctuation and other meaningful
characters are preserved (`"ECG-12"` stays distinct from `"ECG 12"` only in
whitespace, not the hyphen). Column headers are matched with the same function
against a small fixed alias list.

---

## 6. Matching algorithm

`calibration-request-import.service.ts` → `buildMatchIndex()` + `matchRow()`:

1. Load all `isActive` DeviceTypes and all `isActive` DeviceTypeAliases once.
2. Build `nameMap: normalized(name) → DeviceType` and
   `aliasMap: normalizedAlias → DeviceType`. If two active DeviceTypes normalize
   to the same name, that key is marked `"AMBIGUOUS"` (name is not unique in the
   schema). The alias unique index means `aliasMap` cannot legitimately collide,
   but the same defensive `"AMBIGUOUS"` marking is applied.
3. Per row, `key = normalizeDeviceTerm(customerDeviceName)`:
   - **Step 1** — `nameMap[key]` hit → `method = "EXACT_NAME"`, matched.
   - **Step 2** — `aliasMap[key]` hit → `method = "ALIAS"`, matched.
   - **Step 3** — neither → `method = null`, `status = UNMATCHED`, plus up to 3
     **fuzzy `suggestions`** (substring containment, else Levenshtein within
     `max(2, 30% of length)`), each tagged with `via` ("alias: X" / "nama device
     type"). Suggestions are advisory only.
   - An `"AMBIGUOUS"` hit → the row gets a blocking **error** ("Alias … ambigu
     …" / "Ada lebih dari satu Device Type bernama …"), never an arbitrary pick.
4. Fuzzy matches are **never** auto-assigned. The confirm payload only carries a
   `deviceTypeId` the user (or an exact/alias match) put there. (§34)

---

## 7. Import API

Added to `CalibrationRequestsController` (spec §22 — same module):

| Route | Guard | Body | Writes? |
| --- | --- | --- | --- |
| `POST /calibration-requests/import/preview` | `CompanyRoleGuard` + `@RequirePermission("calibrationRequest","create")` + `FileInterceptor("file", { fileSize: 5 MiB, files: 1 })` | multipart `file` | **No** |
| `POST /calibration-requests/import/confirm` | same guard + permission | `calibrationRequestImportConfirmSchema` (zod) | Yes — one transaction |

`confirm` builds the exploded item list and calls
`CalibrationRequestsService.create(companyId, { customerId, leadId?, serviceMode,
expectedDate?, notes?, items })` — the **existing** create path (customer / lead
/ deviceType validation, document-number allocation, `$transaction`). No second
creation path. (§22)

New service: `CalibrationRequestImportService` (provider in
`CalibrationRequestsModule`, injects `CalibrationRequestsService`).

Shared contracts (`packages/shared/src/schemas/index.ts`):
`deviceTypeAlias{Create,Update,ListQuery}Schema`,
`calibrationRequestImportConfirmSchema` + `…ConfirmRowSchema`, and the
preview DTO types (`CalibrationRequestImportPreviewResponse` / `…PreviewRow` /
`…Suggestion`, `CalibrationRequestImportMatchMethod`).

Parser: **`exceljs@^4.4.0`** added to `@medcal/api`. Only `workbook.xlsx.load`
is used (read-only); formulas are read via their cached `result`, never
evaluated; macros are never executed.

---

## 8. Preview behavior

Side-effect free (§9 / §26). For the uploaded workbook:

- Validates: `.xlsx` extension + MIME (`…spreadsheetml.sheet` or
  `application/octet-stream`), size ≤ 5 MiB, loadable workbook (else
  `MALFORMED_WORKBOOK`), a non-empty first sheet (else `EMPTY_WORKBOOK`),
  required columns **Nama Alat** + **Qty** present (else `MISSING_REQUIRED_COLUMN`
  listing which), ≤ 1000 data rows (else `TOO_MANY_ROWS`).
- Header matching tolerates case / whitespace and a short synonym list
  (`nama alat` / `nama alat customer` / `device name` / `customer device name`;
  `qty` / `quantity` / `jumlah`; `model`; `device id` / `deviceid` / `id device`).
- Per row returns: `rowNumber`, `customerDeviceName`, `model`, `deviceId`, `qty`,
  `match { deviceTypeId, deviceTypeName, deviceTypeCode, method }`,
  `suggestions[]`, `warnings[]` (non-blocking, must be acknowledged),
  `errors[]` (blocking).
- `summary`: `sourceRows`, `explodedItems` (Σ qty of error-free rows),
  `matched`, `unmatched`, `rowsWithWarnings`, `rowsWithErrors`.
- Fully-empty rows are skipped silently. Nothing is persisted; verified by test
  and by an authenticated HTTP run (§15).

---

## 9. Qty explosion behavior

`explodeConfirmRows(rows)` (pure, exported, unit-tested). One confirm row of
`qty = N` → **N `ExplodedItem`s**, each with the row's `deviceTypeId`,
`customerDeviceName`, and `model`. `deviceId` is placed on **item 1 only**; items
2…N have no `deviceId`. Example — `Tensimeter | AB-123 | 5 | (blank)`:

```
Item 1..5  deviceTypeId=<Sphygmomanometer>  customerDeviceName="Tensimeter"  model="AB-123"  deviceId=NULL
```

`CalibrationRequestItem` gains **no `qty` column** — quantity is purely row
multiplicity. (§11 / §31)

---

## 10. Warning behavior

- **Qty > 1 with exactly one Device ID** (`row.deviceId && row.qty > 1`) → a
  `warnings[]` entry:
  *"Qty lebih dari 1 tetapi hanya 1 Device ID diberikan. Device ID hanya
  diterapkan ke satu item; item lainnya tidak memiliki Device ID."*
- `confirm` **refuses** (`400 WARNINGS_NOT_ACKNOWLEDGED`) if any confirmed row
  matches that condition and `acknowledgeWarnings !== true`.
- The Device ID is **never replicated** across the exploded items (§12).
- Multiple IDs in one cell (`,` `;` newline) → blocking **error**
  *"Satu baris hanya boleh memiliki satu Device ID"* — the cell is never split
  (§13 / D2).
- Blank Device ID → `null`, never `"000"` / `"-"` / `"N/A"` (§14).

---

## 11. UI

**Alias admin** — `apps/portal/src/app/management/device-type-aliases/`
(`page.tsx`, `use-device-type-aliases-query.ts`,
`device-type-aliases-page-client.tsx`): a single lean inline-CRUD page — list
(alias / device type / status / actions), search, filter by device type +
status, inline add panel, inline edit, activate/deactivate, delete. Gated on
`capabilities.deviceTypeAliasRead`; mutations hidden unless
`deviceTypeAliasCreate`. Menu row `device-management.device-type-aliases`
("Type Aliases", `viewResource: deviceTypeAlias`) added to `seed-menu.ts` and
seeded.

**Import flow** — `apps/portal/src/app/management/calibration-requests/import/`
(`page.tsx`, `import-page-client.tsx`) + an "Import Excel" button beside "New
Requisition" on the list page. Flow: pick Customer + Service Mode +
Expected Date + Notes → choose `.xlsx` → preview table (row #, Nama Alat
Customer, Model, Qty, Device ID, an editable **Device Type** selector per row
with clickable fuzzy-suggestion chips, and a Match badge:
Nama persis / Alias / Saran / Dipilih user / Tidak cocok). Rows with errors are
red and the Device Type cell is disabled; rows still needing a mapping are
amber. **Confirm is disabled** while any blocking error or unmapped row exists;
when warnings exist an explicit acknowledgement checkbox must be ticked. Confirm
→ `import/confirm` → redirect to the created requisition. The confirm button is
disabled while pending and the page navigates away on success (accidental
double-submit guard, D4). `new/page.tsx` was **not** modified.

---

## 12. RBAC

- New catalog entry `deviceTypeAlias: ["read","create","update","delete"]`
  (`packages/auth/src/access-control.ts`).
- `seed-role-permissions.ts` — ADMIN granted all four; re-seeded (idempotent
  upsert, 109 rows). SUPERADMIN keeps its unconditional bypass. No other role
  touched; `CUSTOMER_SERVICE` was **not** granted alias management (they use
  import via `calibrationRequest:create`, which already covers server-side alias
  matching).
- Import endpoints reuse `calibrationRequest:create` — no new permission, no
  weakening. Both endpoints keep `CompanyRoleGuard` and `@CompanyId()`.
- `me.controller.ts` + `packages/auth/src/me-types.ts` — added
  `deviceTypeAlias{Read,Create,Update,Delete}` capability flags for the portal.

**Verified:** unauthenticated `POST /import/preview`, `POST /import/confirm`, and
`GET /device-type-aliases` all return `401` (guard chain intact).

---

## 13. Security

- Extension allow-list (`.xlsx` only — `.xlsm` / `.xls` rejected), MIME check,
  5 MiB size cap (multipart parser + service), ≤ 1000 data rows, ≤ 5000 total
  exploded items (`TOO_MANY_ITEMS`) — all documented as **technical safeguards**,
  not business rules (§16 / D3).
- Malformed workbook / missing sheet / missing columns → structured
  `400` with a `code` and (where relevant) the offending detail.
- exceljs is used read-only; no macro execution; formula cells are read via
  their cached result, never evaluated as logic.
- Excel content treated as untrusted: every cell is coerced through
  `cellToText` / `cellToRaw` / `parseQty` / `parseDeviceId`; Qty accepts only a
  positive integer (rejects `0`, `-1`, `1.5`, `"abc"`, `""`, `"5 unit"`).
- Row errors are row-specific and actionable (§25): *"Row 2: Nama Alat kosong"*,
  *"Row 3: Qty harus bilangan bulat positif"*, *"Row 4: Satu baris hanya boleh
  memiliki satu Device ID"*, *"Row 5: Ada lebih dari satu Device Type bernama …"*.

---

## 14. Test results

`DATABASE_URL` exported in the shell (the repo's `vitest.setup.ts`
`process.loadEnvFile` does not populate it in this environment — a pre-existing
infra quirk affecting every API suite, see Phase 1 report §11).

| Suite | Result |
| --- | --- |
| `device-type-aliases.service.test.ts` | **8/8 pass** — create + normalized key, case/whitespace normalization, duplicate normalized alias → `ConflictException`, unknown deviceType → `BadRequestException`, update re-checks uniqueness, activate/deactivate, list filters (`deviceTypeId` + `isActive`), `NotFound`. |
| `calibration-request-import.service.test.ts` | **15/15 pass** — `explodeConfirmRows` (ID on first only, never invented), reject non-xlsx, reject missing column, exact-name + alias match + qty explosion, unmatched row, blank-name / bad-Qty errors, multi-ID cell rejected, blank Device ID → null, Qty>1 + 1 ID warning, **preview writes nothing**, **REAL xlsx → preview → confirm → 13 items** with field-preservation assertions, warnings-unacknowledged refusal, **transaction rollback** on bad deviceTypeId, company isolation. |
| Regression: `calibration-requests`, `work-orders`, `device-types`, `quotations`, `me` | **all pass** (241 tests in the combined run). |

**Pre-existing failures (NOT caused by this work — reported separately):**
`emails/imap-sync` (IMAP not configured), `push-tokens/notification-dispatch`
(`push.resolvePushIconUrl is not a function` — missing export in
`@medcal/notifications`), `contact-messages/contact-messages.lead-matching`
(fails in isolation on this branch), `chat.gateway.security` (timeout),
`whitelist/registration-gate` (passes in isolation; parallel-run contamination).
None of these modules were modified — `git status` confirms no changes under
`emails/`, `push`, `notification`, `chat`, `contact`, `whitelist`.

---

## 15. REAL XLSX simulation

A real `.xlsx` was generated with exceljs and driven through the **running local
API over authenticated HTTP** (session minted for the local `SUPERADMIN`,
signed better-auth cookie), plus the same dataset through the service layer in
the integration test.

Dataset:

| Nama Alat | Model | Qty | Device ID |
| --- | --- | --- | --- |
| Tensimeter `<S>` | AB-123 | 5 | |
| Bed Side Monitor `<S>` | BSM-501 | 3 | BSM001 |
| Dental Unit `<S>` | DU-100 | 2 | DU001 |
| Tensimeter Digital `<S>` | AB-123 | 2 | |
| Patient Monitor `<S>` | PM-5 | 1 | PM-001 |

Temp master data: DeviceTypes `Sphygmomanometer/Bed Side Monitor/Dental Unit`
(suffixed), aliases `Tensimeter`+`Tensimeter Digital` → Sphygmomanometer,
`Patient Monitor` → Bed Side Monitor.

**`POST /calibration-requests/import/preview` → HTTP 201**

```
summary: {"sourceRows":5,"explodedItems":13,"matched":5,"unmatched":0,
          "rowsWithWarnings":2,"rowsWithErrors":0}
 row 2: "Tensimeter <S>"          qty=5 -> Sphygmomanometer <S>  [ALIAS]       warnings=0
 row 3: "Bed Side Monitor <S>"    qty=3 -> Bed Side Monitor <S>  [EXACT_NAME]  warnings=1
 row 4: "Dental Unit <S>"         qty=2 -> Dental Unit <S>       [EXACT_NAME]  warnings=1
 row 5: "Tensimeter Digital <S>"  qty=2 -> Sphygmomanometer <S>  [ALIAS]       warnings=0
 row 6: "Patient Monitor <S>"     qty=1 -> Bed Side Monitor <S>  [ALIAS]       warnings=0
```

**`POST /calibration-requests/import/confirm` → HTTP 201** — requisition
`CRQ/2026/08/00003`, **13 items**:

| customerDeviceName | count | deviceIds |
| --- | --- | --- |
| Tensimeter `<S>` | 5 | null ×5 |
| Bed Side Monitor `<S>` | 3 | `BSM001`, null, null |
| Dental Unit `<S>` | 2 | `DU001`, null |
| Tensimeter Digital `<S>` | 2 | null, null |
| Patient Monitor `<S>` | 1 | `PM-001` |

---

## 16. Database verification

Post-confirm inspection confirmed:

- **13** `CalibrationRequestItem` rows (5 + 3 + 2 + 2 + 1). ✅
- `customerDeviceName` preserved verbatim on every row — *not* replaced by the
  DeviceType name ("Tensimeter Digital" stays; `deviceType.name` =
  "Sphygmomanometer"). ✅
- `model` preserved where supplied, `null` where the cell was blank. ✅
- Device IDs preserved on exactly one item per source row; `null` on the rest;
  no invented IDs. ✅
- DeviceType mapping correct (alias rows → the alias's DeviceType, exact rows →
  the named DeviceType). ✅
- No duplicate item IDs (all cuid). ✅
- No `qty` column exists on `CalibrationRequestItem` (schema + `information_schema`
  check). ✅
- Preview created **zero** rows. ✅
- Transaction rollback: a confirm with one bad `deviceTypeId` created **nothing**
  (`count` unchanged). ✅

---

## 17. Cleanup verification

- Integration test (`vitest`): `afterAll` deletes every created
  CalibrationRequestItem / CalibrationRequest / DeviceTypeAlias / DeviceType /
  DeviceCategory / Customer by id. It deliberately does **not** delete the shared
  `DocumentNumberSequence` row (other parallel suites allocate from it).
- HTTP simulation: a dedicated teardown script deleted the requisition + its
  items, the 3 temp aliases, the temp customer, the 3 temp DeviceTypes + 3
  DeviceCategories, and the smoke-test `Session` rows. Re-count afterwards:
  `{"leftReq":0,"leftAlias":0,"leftType":0,"leftCust":0,"leftSession":0}`. ✅
- **Residual local-dev artifact (disclosed):** the shared
  `DocumentNumberSequence` for `PKM / CALIBRATION_REQUEST` advanced by the
  requisition numbers issued during testing (the next real local requisition
  will be a few numbers higher). This is local-only, matches how the existing
  `calibration-requests.service.test.ts` already behaves, and has no production
  effect.
- The `exceljs` dependency add is intentional and remains in
  `apps/api/package.json` + `pnpm-lock.yaml`.

---

## 18. Known limitations

- **Preview ↔ Confirm are stateless.** Confirm trusts the client-submitted
  rows (they are still fully re-validated server-side: zod shape, positive-int
  qty, DeviceType existence via `assertDeviceTypesExist`, warning
  acknowledgement, item caps, `$transaction`). There is no server-side
  "import session" token; the accidental-double-submit guard is the UI
  (disable-on-pending + redirect-on-success), consistent with the manual create
  form.
- **Header matching is deliberately narrow** — a small fixed synonym list, not a
  general column-mapping engine (§3). An unrecognised header for an optional
  column (Model / Device ID) is silently ignored; missing a **required** column
  is a hard, explicit error.
- **Fuzzy suggestions are simple** (substring + Levenshtein). They only ever
  populate the preview; they never pre-fill `deviceTypeId`.
- **Multi-sheet workbooks** — only the first worksheet is read.
- `.xls` (legacy binary) and `.xlsm` (macro) are rejected, not converted.
- The pre-existing `vitest.setup.ts` env-loading quirk means API tests need
  `DATABASE_URL` exported in the shell.

---

## 19. Deferred items

Unchanged from the audit — still out of scope and untouched:

- `qty` column on `CalibrationRequestItem`; `CalibrationRequestLine` layer.
- `matchedBy` / match-confidence persisted columns.
- Raw uploaded-Excel storage as a `FileObject`.
- Any Quotation "×N single line" behavior / `assertFullScopeItems` change.
- PurchaseOrder / WorkOrder / CalibrationJob / Surat Jalan / Technician App.
- The WorkOrder → CalibrationJob physical-`Device` materialization seam.
- Fuzzy auto-commit.
- Per-company alias scoping.

---

## Final Verification (spec §36)

| Check | Result |
| --- | --- |
| `prisma validate` | ✅ valid |
| `prisma generate` | ✅ (client regenerated) |
| `prisma migrate status` | ✅ up to date (47 migrations) |
| `@medcal/shared` typecheck | ✅ |
| `@medcal/auth` typecheck | ✅ |
| `@medcal/api` typecheck | ✅ |
| `@medcal/api` build (`tsc -p`) | ✅ |
| `@medcal/portal` typecheck | ✅ (only pre-existing `.next` + `vitest` test-file noise) |
| `@medcal/portal` build (`next build`) | ✅ — `/management/device-type-aliases` and `/management/calibration-requests/import` compiled |
| Alias tests | ✅ 8/8 |
| Import tests | ✅ 15/15 |
| Adjacent regression (calibration-requests / work-orders / device-types / quotations / me) | ✅ all pass |
| Authenticated HTTP round-trip (real .xlsx) | ✅ preview 201 → confirm 201 → 13 items |
| Pre-existing failures (imap-sync, notification-dispatch, lead-matching, chat.gateway, registration-gate) | ⚠️ pre-existing, unrelated modules, not modified |

---

## Final Response (spec §37)

- **A. What was implemented** — `DeviceTypeAlias` global master (model + CRUD API
  + admin UI + RBAC), and a two-phase Excel import (`preview` → `confirm`) for
  Calibration Requests with deterministic DeviceType matching (exact name →
  alias → fuzzy suggestion → unmatched), Qty explosion into device-granular
  items, mandatory preview, warning acknowledgement, and a transactional commit
  that reuses `CalibrationRequestsService.create`.
- **B. Exact schema changes** — new `DeviceTypeAlias` model
  (`id, deviceTypeId, alias, normalizedAlias, isActive, createdAt, updatedAt`;
  `@@unique([normalizedAlias])`; `@@index([deviceTypeId])`, `@@index([isActive])`;
  `deviceType` FK `onDelete: Cascade`) + `DeviceType.aliases` back-relation.
  Nothing else.
- **C. Migration name** — `20260829153920_add_device_type_alias`.
- **D. Alias behavior** — global; matched on `normalizedAlias`
  (lower/trim/collapse-whitespace); one alias → at most one DeviceType, enforced
  by a global unique index; active/inactive; duplicate creation → `409
  DUPLICATE_ALIAS`.
- **E. Excel import behavior** — `.xlsx` only; columns `Nama Alat` + `Qty`
  required, `Model` + `Device ID` optional; per-row validation with actionable
  row-scoped messages; DeviceType matching by exact name then alias then
  suggestion; **Qty N → N `CalibrationRequestItem`s**; one Device ID → first item
  only, warning shown; multiple IDs in a cell → rejected; blank ID → `null`.
- **F. Preview behavior** — side-effect free; returns per-row match + suggestions
  + warnings + errors and a summary; verified to write nothing (test + HTTP).
- **G. Qty explosion result** — the sample 5-row sheet →
  **13 `CalibrationRequestItem` rows** (5+3+2+2+1).
- **H. Real XLSX simulation result** — authenticated HTTP: preview `201`
  (5 matched, 13 exploded, 2 warnings), confirm `201` → `CRQ/2026/08/00003` with
  13 items; all field-preservation checks passed (see §15/§16).
- **I. Database verification** — 13 items; customerDeviceName / model / Device ID
  preserved; DeviceType mapping correct; no invented IDs; no `qty` column;
  preview wrote nothing; rollback verified. (§16)
- **J. Tests** — 8 alias + 15 import added, all pass; adjacent regression passes.
- **K. Build/typecheck** — shared, auth, api, portal typecheck ✅; api `tsc -p`
  build ✅; portal `next build` ✅.
- **L. RBAC verification** — new `deviceTypeAlias` resource, ADMIN-granted;
  unauthenticated calls to all new endpoints return `401`; import reuses
  `calibrationRequest:create`; no role weakened.
- **M. Company isolation verification** — import creates the requisition only in
  the caller's `@CompanyId()` company; test confirms the row is not visible
  under a different companyId; DeviceType/alias are global by design.
- **N. Cleanup verification** — integration test cleans all created rows by id;
  HTTP simulation teardown left `0` residual rows; only the shared local
  document-number counter advanced (disclosed, local-only, matches existing test
  behavior).
- **O. Unexpected architectural issue** — none. One test-hygiene note: an early
  version of the import test deleted the shared `DocumentNumberSequence` row in
  `afterAll` (copied from `calibration-requests.service.test.ts`), which raced
  with parallel suites; removed — the counter is now left intact.

**Explicit confirmations:**

- `CalibrationRequestItem` still has **NO `qty`** column. ✅
- `deviceId` remains **nullable**. ✅
- `customerDeviceName` is **preserved** verbatim (never overwritten by the
  DeviceType name). ✅
- `model` remains **nullable**. ✅
- `DeviceTypeAlias` is **global** (no `companyId`). ✅
- Fuzzy matching **never auto-commits** — it only produces preview suggestions. ✅
- **Preview has no database side effects.** ✅
- **Confirm is transactional** (reuses the existing `create` `$transaction`). ✅
- **Quotation / WorkOrder / CalibrationJob were not redesigned** — the only edits
  to those areas are `string → string | null` type-annotation widenings from
  Phase 1, already documented there; no behavior change in Phase 2.
