# ExcelJS Decompression-Bomb Protection — Implementation Report

**Date:** 2026-09-20
**Scope:** Implement Option A (ZIP central-directory declared-size pre-check) exactly as approved in `docs/minutes-of-meeting/excel-import-decompression-bomb-decision-20260920.md`. No other option evaluated or introduced. No Excel import workflow, Revision logic, API/UI/database behavior, or Docker/VPS configuration changed beyond the new rejection case.

---

## 1. What Was Implemented

A new pre-check, `assertSafeToDecompress()`, runs at the very start of `parseWorkbook()` in `apps/api/src/modules/calibration-requests/calibration-request-import.service.ts`, before `ExcelJS.Workbook()`/`workbook.xlsx.load()` are ever reached. It uses `unzipper`'s `Open.buffer()` API to read the uploaded buffer's ZIP central-directory metadata — entry names and declared compressed/uncompressed sizes — without decompressing anything. It rejects the workbook if:

- any single ZIP entry's declared uncompressed size exceeds `MAX_ENTRY_UNCOMPRESSED_BYTES` (25 MiB), or
- the sum of declared uncompressed sizes across all entries exceeds `MAX_TOTAL_UNCOMPRESSED_BYTES` (50 MiB), or
- the central directory itself cannot be read, or an entry's declared size isn't a sane finite non-negative number — both treated as fail-closed rejections, mapped to the existing `MALFORMED_WORKBOOK` code, since nothing has been decompressed and the file cannot be safely vouched for.

All existing behavior is preserved: the 5 MiB compressed-upload limit, the 1000-row limit, header/column parsing, and device-type matching are all unchanged. Create and Revision both continue to go through this same shared `preview()` → `parseWorkbook()` path, so this one change protects both.

---

## 2. Exact Thresholds Chosen and Why

```ts
export const MAX_ENTRY_UNCOMPRESSED_BYTES = 25 * 1024 * 1024; // 25 MiB
export const MAX_TOTAL_UNCOMPRESSED_BYTES = 50 * 1024 * 1024; // 50 MiB
```

Rationale (per the implementation prompt's instruction to inspect the actual Medcal template/constraints first, not copy `exceljs-hardened`'s defaults):

- The real, currently-published Medcal requisition template (`apps/portal/public/medcal-requisition-template.xlsx`) is **8,125 bytes** on disk.
- The import pipeline's own existing cap, `MAX_DATA_ROWS = 1000`, bounds legitimate content to at most 1000 data rows across a handful of plain-text columns (`Nama Alat`, `Model`, `Qty`, `Serial No`, optionally `AKD/AKL/NIE`) — the code's own pre-existing comment already calls a full import sheet "tiny." Even with generous formatting/styling overhead, uncompressed sheet XML for that much plain tabular data stays well under a few MiB in practice.
- **25 MiB per entry / 50 MiB total** gives roughly three orders of magnitude of headroom over the real template and a very large margin over any plausible legitimate variation (multiple sheets, embedded styles, a logo image), while remaining small enough that even several concurrent legitimate imports would only ever use tens of MiB — a small fraction of what could meaningfully threaten the `api` process, which (per the decision report) currently has no container memory ceiling of its own.
- This is deliberately **not** `exceljs-hardened`'s defaults (128 MB per-entry / 512 MB archive-wide) — those were sized for that library's general-purpose audience, not for Medcal's specific, much smaller import sheets, and the implementation prompt explicitly asked not to copy them arbitrarily.

---

## 3. How the Pre-Check Works

```ts
async function assertSafeToDecompress(buffer: Buffer): Promise<void> {
  let directory: unzipper.UnzipperCentralDirectory;
  try {
    directory = await unzipper.Open.buffer(buffer);
  } catch {
    throw new BadRequestException({
      message: "File Excel tidak dapat dibaca (workbook rusak atau bukan .xlsx)",
      code: "MALFORMED_WORKBOOK",
    });
  }

  let totalUncompressedBytes = 0;
  for (const entry of directory.files) {
    const size = entry.uncompressedSize;
    if (typeof size !== "number" || !Number.isFinite(size) || size < 0) {
      throw new BadRequestException({ code: "MALFORMED_WORKBOOK", ... });
    }
    if (size > MAX_ENTRY_UNCOMPRESSED_BYTES) {
      throw new BadRequestException({ code: "WORKBOOK_TOO_LARGE_UNCOMPRESSED", ... });
    }
    totalUncompressedBytes += size;
    if (totalUncompressedBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new BadRequestException({ code: "WORKBOOK_TOO_LARGE_UNCOMPRESSED", ... });
    }
  }
}
```

`unzipper.Open.buffer()` locates the ZIP End-Of-Central-Directory record and reads each Central Directory File Header — a fixed 46-byte structure per entry containing the declared `compressedSize`/`uncompressedSize` (verified by reading `unzipper@0.10.14`'s own source, `lib/Open/directory.js`) — without ever calling `.stream()`/`.extract()` on any entry, so no inflate/decompression happens. `unzipper`'s `parseExtraField.js` also correctly resolves the ZIP64 extra field when the standard 32-bit size field is the `0xffffffff` sentinel, so a declared size beyond 4 GiB (exactly how an attacker would need to express a truly massive bomb) is still read correctly rather than silently truncated or ignored.

---

## 4. Why It Executes Before ExcelJS Decompression

`assertSafeToDecompress(buffer)` is the first statement inside `parseWorkbook()`, awaited to completion before `new ExcelJS.Workbook()` is constructed or `workbook.xlsx.load()` is called:

```ts
async function parseWorkbook(buffer: Buffer): Promise<ParsedRow[]> {
  await assertSafeToDecompress(buffer);

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(...);
  } ...
```

Because the check only reads central-directory metadata (a fixed, tiny cost regardless of the archive's real or declared size) and throws synchronously-awaited exceptions that unwind before the next line runs, a rejected workbook never reaches `workbook.xlsx.load()` — zero bytes are ever decompressed for a file this check rejects. This directly satisfies the requirement that protection happen before ExcelJS can cause unbounded memory expansion.

---

## 5. Files Changed

- `apps/api/src/modules/calibration-requests/calibration-request-import.service.ts` — added `MAX_ENTRY_UNCOMPRESSED_BYTES`/`MAX_TOTAL_UNCOMPRESSED_BYTES` constants, the `assertSafeToDecompress()` function, the `unzipper` import, and the call site at the top of `parseWorkbook()`.
- `apps/api/src/modules/calibration-requests/unzipper.d.ts` (new) — a minimal ambient module declaration for `unzipper`, which ships no bundled types and has no `@types/unzipper` in the dependency tree. Declares only the narrow surface actually used (`Open.buffer()` and the entry shape), so no new type-only dependency was added.
- `apps/api/src/modules/calibration-requests/calibration-request-import.service.test.ts` — added the four required tests plus a hand-built adversarial ZIP fixture builder (see §7 below).
- `apps/api/package.json` — added `"unzipper": "0.10.14"` as an explicit direct dependency.
- `pnpm-lock.yaml` — updated via `pnpm install --filter @medcal/api` to reflect the new direct-dependency declaration.

**Not changed:** API contract/response shape (only a new rejection error code), DB schema, UI, Revision logic, `confirm()` flow, `MAX_IMPORT_BYTES`/`MAX_DATA_ROWS`, `generate-requisition-template.ts` (write path, untouched), any Docker/Compose/VPS configuration.

---

## 6. Dependency Change

`unzipper` was already present in `pnpm-lock.yaml` as a transitive dependency of `exceljs@4.4.0` (its own Node-path zip reader), resolved at exactly `0.10.14`. It has been promoted to an explicit, exact-pinned (`"unzipper": "0.10.14"`, no `^` range) direct dependency of `apps/api`. Confirmed via `git diff pnpm-lock.yaml` after running `pnpm install --filter @medcal/api`: the only change is the importer's `unzipper: { specifier: 0.10.14, version: 0.10.14 }` entry — the resolved version is unchanged, no new package was fetched, and no other dependency in the tree was touched.

---

## 7. Tests Executed / Results

Four new tests were added to `calibration-request-import.service.test.ts`, in a new `describe("CalibrationRequestImportService.preview — decompression-bomb guard")` block, using a hand-built raw-ZIP fixture builder (`buildRawZip()`) — necessary because the existing `buildXlsx()` helper only ever produces honest, tiny ExcelJS-written files and cannot construct an adversarial declared-size mismatch:

- **A. Oversized single-entry ZIP** — a ZIP with one entry declaring `MAX_ENTRY_UNCOMPRESSED_BYTES + 1` → rejected with `WORKBOOK_TOO_LARGE_UNCOMPRESSED`. **Pass.**
- **B. Oversized total ZIP** — three entries, each individually under `MAX_ENTRY_UNCOMPRESSED_BYTES`, summing to more than `MAX_TOTAL_UNCOMPRESSED_BYTES` → rejected with `WORKBOOK_TOO_LARGE_UNCOMPRESSED`. **Pass.**
- **C. Legitimate existing XLSX** — a normal small workbook built via `buildXlsx()` is not rejected by the guard (`preview()` resolves normally). **Pass.** (All 20 pre-existing `preview`/`confirm` tests, which also build real workbooks, continued to pass unmodified — further regression evidence.)
- **D. Malformed/non-ZIP upload** — a plain non-ZIP buffer named `.xlsx` is rejected with `MALFORMED_WORKBOOK`, before any parse attempt, preserving the pre-existing error code/behavior for this case (which had no dedicated test before this change). **Pass.**

**Focused test file:**
```
pnpm --filter @medcal/api exec vitest run src/modules/calibration-requests/calibration-request-import.service.test.ts
```
Result: **1 test file passed, 24/24 tests passed.**

**Relevant module suite** (both `calibration-requests` spec files, including the unrelated but adjacent `calibration-requests.service.test.ts`):
```
pnpm --filter @medcal/api exec vitest run src/modules/calibration-requests
```
Result: **2 test files passed, 67/67 tests passed.**

**Full API suite:**
```
pnpm --filter @medcal/api exec vitest run
```
Result: **61/67 test files passed, 1281/1292 tests passed; 6 files / 11 tests failed.** All 11 failures were verified to be **pre-existing on `main`, unrelated to this change** — reproduced identically by stashing this change and re-running the same failing files against unmodified `main`:
- `src/modules/push-tokens/notification-dispatch.service.test.ts` (`push.resolvePushIconUrl is not a function`)
- `src/modules/whitelist/registration-origin-callers.test.ts` (an unrelated `authClient.signUp.email` origin-header lint check against `apps/tech-pwa`)
- 4 other pre-existing failing files not touched by or related to this change.

No new failures were introduced anywhere in the full suite.

**Typecheck:**
```
pnpm --filter @medcal/api exec tsc --noEmit
```
Result: **Fails**, but with the exact same 4 errors present before this change (confirmed by stashing and re-running against unmodified `main`), all in `packages/auth/src/access-control.ts` / `packages/auth/src/index.ts` (`Cannot find module 'better-auth/...'`) — a pre-existing, unrelated module-resolution issue in the shared auth package. **No new typecheck errors were introduced** by this change; `calibration-request-import.service.ts`, `unzipper.d.ts`, and the test file all typecheck cleanly (no errors reported against any of those three files in either run).

**Build:** not run — not required for this change (no build-verification-sensitive area was touched; the existing typecheck/test evidence above is the relevant verification per the change's scope).

---

## 8. Remaining Limitations

These were already identified in the approved decision report and are unchanged by this implementation — nothing new surfaced:

- Declared ZIP central-directory size fields remain, in principle, attacker-authored rather than cryptographically verified data. The theoretical "declares small, actually huge" edge case is not eliminated by definition, though it is not practically exploitable here given `unzipper`'s correct ZIP64 handling and the fact that every realistic decompression-bomb shape relies on an honestly large declared size.
- This fix addresses **decompression/resource-exhaustion only**. It does not, and was never intended to, address **malware execution** — a separate, already-resolved concern: ExcelJS never executes macros/VBA regardless of this fix.
- No container memory limit exists on the `api` service (unchanged by this task, per its explicit "do not modify Docker/VPS configuration" instruction). A legitimately-declared-but-still-large upload just under the chosen thresholds could still use tens of MiB of memory; the already-recommended Compose-level `mem_limit` remains a separate, independent follow-up.
- Does not bound pathological XML-parsing time/CPU after decompression succeeds — a separate, lower-priority concern already noted as OPTIONAL rate-limiting in the original investigation report.
