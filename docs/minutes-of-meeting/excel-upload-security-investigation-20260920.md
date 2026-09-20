# Excel Upload Security Investigation

**Date:** 2026-09-20
**Scope:** Customer `.xlsx` upload for Calibration Request/Requisition creation, and the identical import pipeline reused by Requisition Revision.
**Status:** Investigation only. No code, schema, dependency, or architecture changes were made.

---

## 1. Current Upload Flow

Create and Revision share **one** backend pipeline end to end.

1. **Portal UI** — `apps/portal/src/app/management/calibration-requests/import/import-page-client.tsx`
   File input uses `accept=".xlsx"` (advisory only — an OS file-picker filter, not enforced). Flow is two-step: upload → preview → confirm.

2. **Upload/preview request** — `apps/portal/.../use-calibration-requests-query.ts` (`useImportPreview`)
   Sends the raw file via `fetch` with `FormData` and `credentials: "include"` (not the shared `apiFetch` wrapper, since that forces JSON content-type) to `POST {API}/calibration-requests/import/preview`, deliberately bypassing the app's normal JSON API client because it needs multipart.

3. **API endpoint** — `apps/api/src/modules/calibration-requests/calibration-requests.controller.ts`
   NestJS route, guarded by `CompanyRoleGuard` (session via Better Auth, single-tenant `companyId` resolved server-side from env, active-membership check) and `@RequirePermission("calibrationRequest", "create")`. File is received via `@UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_IMPORT_BYTES, files: 1 } }))`, which is `@nestjs/platform-express`'s wrapper around **multer** (`multer@2.2.0`, transitive dependency — not a direct one). No `storage` option is configured, so multer uses its **default in-memory storage**: the file exists only as `file.buffer` for the duration of the request.

4. **Parsing/matching** — `apps/api/src/modules/calibration-requests/calibration-request-import.service.ts`, `preview()`
   Validates presence/size/extension/MIME (see §2), then calls `parseWorkbook(buffer)`, which does `new ExcelJS.Workbook(); await workbook.xlsx.load(buffer)`. Rows are walked (capped at `MAX_DATA_ROWS = 1000`), mapped via a fixed header-alias table, and matched against `DeviceType`/`DeviceTypeAlias` in the DB. The function is explicitly documented "side-effect free... writes nothing." The full preview result (matched/unmatched rows, suggestions) is returned directly in the HTTP response.

5. **Client-held state** — Nothing is kept server-side between preview and confirm. The browser holds the parsed/matched rows in React state, renders them as an editable table, and the user edits/reviews there.

6. **Confirm** — `POST {API}/calibration-requests/import/confirm` sends the **reviewed rows as JSON only** (no file), validated with a Zod schema (`calibrationRequestImportConfirmSchema`), then calls the same `CalibrationRequestsService.create()` used by manual (non-import) requisition creation.

7. **Revision reuse** — Per `docs/minutes-of-meeting/mom-1-revision-excel-import-implementation-20260920.md`, the Revise dialog's "Import Excel" button calls the **identical, unmodified** `import/preview` endpoint and `CalibrationRequestImportService.preview()`. The only new code for that feature is a pure client-side function (`revision-desired-scope.ts`) that maps preview rows onto the revision's current item list. `Save Revision` still posts to the pre-existing `/calibration-requests/:id/revise` endpoint. Zero backend changes were introduced for Revision import.

There is **no temporary file storage** anywhere in this pipeline — the uploaded workbook never touches disk, is never written under any `public/` path, and there is nothing to clean up on either success or failure, because nothing is ever persisted. (This is unlike the separate, unrelated certificate/attachment file-store module in `apps/files/`, which does write to disk under a gitignored/bind-mounted path — that module is not part of this flow and was out of scope.)

---

## 2. Current Security Controls

| Control | State |
|---|---|
| **AuthN/AuthZ** | Server-enforced on both `import/preview` and `import/confirm` via `CompanyRoleGuard` + `@RequirePermission("calibrationRequest","create")`. The portal's client-side `AccessDenied` gate is cosmetic only; the server does not rely on it. Solid. |
| **File-size limit** | Enforced twice: multer `FileInterceptor` (`fileSize: MAX_IMPORT_BYTES` = 5 MiB) and again defensively in `preview()`. Nginx's staged (not-yet-deployed) config allows up to 25 MiB, which doesn't undermine the app-level cap. |
| **Row-count limit** | `MAX_DATA_ROWS = 1000`, enforced during parsing — a resource-exhaustion guard, though it only takes effect *after* the workbook has already been fully decompressed and loaded (see §3). |
| **File-type check** | `.xlsx` suffix string match (spoofable) + MIME allowlist that **explicitly accepts `application/octet-stream`** as a fallback (an easy bypass — any generically-typed upload passes as long as the filename ends in `.xlsx`). No magic-byte/content-signature check exists. The only real content gate is incidental: `ExcelJS.xlsx.load()` throwing `MALFORMED_WORKBOOK` if the buffer isn't a valid OOXML zip. |
| **Macro/active-content execution** | None possible. `exceljs` is a pure data reader/writer for OOXML — it does not parse, execute, or expose VBA/macro parts. Even a workbook containing `xl/vbaProject.bin` would just have that part ignored; only cell values are ever extracted into the preview response. |
| **Storage/serving risk** | None — file is never persisted, so there is no stored-file web-exposure, path-traversal, or "malware sitting on disk" risk for this pipeline. |
| **Malware/AV scanning** | **Does not exist anywhere in the repository.** Verified by direct grep across all source, `package.json` files, Dockerfiles, compose files, and scripts for `clamav`, `clamscan`, `clamdscan`, `virustotal`, `malware`, `virus scan`. Every hit found is in unrelated planning/audit markdown docs, and every one explicitly frames virus scanning as **deferred/out-of-scope**, for a *different* feature (the PDF certificate upload module), never implemented, never scheduled. |
| **Decompression/zip-bomb guard** | **Does not exist.** See §3 — this is the one concrete unmitigated gap. |
| **Runtime isolation** | `api` service runs in Docker (`docker-compose.prod.yml`), bound to `127.0.0.1` only (never `0.0.0.0`), reachable solely via a same-host Nginx reverse proxy. No container memory limit (`mem_limit`/`deploy.resources.limits`) is configured for `api`. `restart: unless-stopped` will bring the container back after a crash. |

---

## 3. Security Gaps

### 3.1 Decompression-bomb / unbounded memory expansion (the one real gap)

`.xlsx` is a ZIP container. `ExcelJS.Workbook().xlsx.load(buffer)` fully decompresses every ZIP entry into memory before any of the app's own checks (row cap, header validation) run. **Mainline `exceljs` (the version Medcal uses, `^4.4.0`) has no built-in cap on decompressed size.** This was verified by web search: GitHub issues [`exceljs/exceljs#1420`](https://github.com/exceljs/exceljs/issues/1420) and [`#1899`](https://github.com/exceljs/exceljs/issues/1899) are real user reports of "JavaScript heap out of memory" crashes from oversized workbooks. A community-maintained fork, `exceljs-hardened`, was created specifically to add `maxEntryUncompressedSize`/`maxTotalUncompressedSize` options that upstream `exceljs` still lacks. No CVE was found against mainline `exceljs@4.4.x` itself — the fork's own CVE (`CVE-2026-78207`, prototype pollution) is unrelated and doesn't apply to Medcal (Medcal doesn't use the fork).

**Concrete risk:** a crafted `.xlsx` well under the 5 MiB compressed-size cap can expand to gigabytes when decompressed, before `MAX_DATA_ROWS` or any other guard ever executes. With no container memory limit configured on `api`, this can OOM-crash the entire `api` process — which serves every other endpoint, not just calibration-requests import. Since the endpoint requires an authenticated session (`CompanyRoleGuard`), the actual attacker population is limited to logged-in customers/staff with `calibrationRequest:create` permission, but that still includes every external customer able to reach the Create-Requisition or Revise-Requisition screens — i.e. exactly the population this feature is meant to serve.

### 3.2 Weak content-type validation

The MIME check's `application/octet-stream` fallback means the "MIME validation" step provides essentially no protection beyond the filename-suffix check. There is no magic-byte (`PK\x03\x04`) pre-check before handing the buffer to ExcelJS. In practice, ExcelJS's own parse-or-throw behavior ends up being the real content gate — which happens to work, but was never designed as a security control.

### 3.3 No allowlist enforcement against macro-bearing OOXML

A file that is structurally a `.xlsm` (macro-enabled) but renamed to `.xlsx` would very likely still parse successfully (ExcelJS reads sheet XML and ignores unrecognized parts like `xl/vbaProject.bin`). Since macros are never executed, this isn't an execution risk today, but it means the app's own stated intent — "Hanya file .xlsx yang didukung" ("only .xlsx is supported") — isn't actually enforced at the content level.

### 3.4 No malware/AV scanning layer

Confirmed absent at every layer (application, Dockerfile, VPS setup, scripts). Given findings 2 and 3 above (no macro execution, no persistence, no re-serving of the file to any other user), this is a real gap in defense-in-depth but **not** currently an exploitable one — there is no vector today by which an embedded malicious payload (macro, OLE object, embedded executable) could ever execute or reach another user. See §4 for why this is classified as recommended/optional rather than must-fix.

---

## 4. Required Protection

### MUST FIX

**1. Decompression-bomb / unbounded-memory guard around ExcelJS parsing**
- **Risk:** Authenticated customer DoS against the shared `api` container via a small, crafted `.xlsx` that decompresses to gigabytes in memory. Affects every endpoint on `api`, not just import.
- **Current state:** No guard exists; mainline `exceljs` has no built-in option for this (only the unrelated `exceljs-hardened` fork does).
- **Required change:** Code change in `apps/api/src/modules/calibration-requests/calibration-request-import.service.ts` (the `parseWorkbook()` function / `workbook.xlsx.load(buffer)` call site). No single obvious drop-in fix exists in the current dependency — see §6 for the decision this requires.
- **Affects:** Create + Revision equally (identical shared code path).

### STRONGLY RECOMMENDED

**2. Reject the `application/octet-stream` MIME fallback; add a magic-byte ZIP-signature pre-check**
- **Risk:** Content validation currently relies almost entirely on ExcelJS's incidental parse failure rather than an intentional check.
- **Current state:** MIME allowlist explicitly permits the bypass value; no signature check exists.
- **Required change:** Code change, same file as above.
- **Affects:** Create + Revision.

**3. Explicitly reject workbooks containing macro parts (e.g. `xl/vbaProject.bin`)**
- **Risk:** Low today (no execution vector), but the app's stated "only .xlsx" intent isn't actually enforced at the content level.
- **Current state:** Not checked.
- **Required change:** Code change, same file.
- **Affects:** Create + Revision.

**4. Add a container memory limit to the `api` service**
- **Risk:** Without a cap, any future memory spike (not just this one) risks host-level memory pressure rather than a contained, recoverable container restart.
- **Current state:** No `mem_limit`/`deploy.resources.limits` set in `docker-compose.prod.yml` for `api`.
- **Required change:** VPS/compose configuration change (not a code change), applied alongside the eventual production deployment of the compose stack (per `docs/Deployment/`, containerization is implemented but not yet deployed to the production VPS).
- **Affects:** All `api` endpoints (general hardening, not import-specific).

**5. Dependency-vulnerability monitoring on `exceljs`**
- **Risk:** No current CVE applies, but the Excel-parser ecosystem (see the unrelated `xlsx`/SheetJS CVE history found during this investigation) has a track record of parser vulnerabilities.
- **Required change:** Operational — add `exceljs` to routine `pnpm audit`/advisory monitoring. No code change.
- **Affects:** Create + Revision (shared dependency).

### OPTIONAL / defense-in-depth

**6. Signature-based malware/AV scan of the in-memory buffer before parsing**
- **Risk today:** None currently exploitable — the file is never persisted, never re-served to any user, and ExcelJS never executes macros/VBA, so there is no execution or distribution vector for embedded malware in the current architecture.
- **When it would become necessary:** If Medcal ever starts persisting the original uploaded file (e.g. for audit/evidence retention), a scan becomes materially more important, since a stored file could later be downloaded and opened by a human in Excel/Office (which *does* execute macros).
- **Required change if pursued:** A genuine architectural dependency — e.g. a ClamAV daemon/sidecar on the VPS or a hosted scanning API — to be explicitly decided by the team, not installed speculatively. **Not recommended to add now** given the current architecture doesn't need it; flagged here only because the investigation was explicitly asked to assess it.
- **Affects:** Would affect Create + Revision if implemented.

**7. Structured logging/alerting on rejected uploads**
- Log `UNSUPPORTED_FILE_TYPE` / `MALFORMED_WORKBOOK` / `TOO_MANY_ROWS` rejections for anomaly/probing visibility. Small code change, low priority.

**8. Endpoint-specific rate limiting on `import/preview`**
- This endpoint is more parser-resource-intensive than a typical JSON endpoint; rate-limiting would reduce the practical impact of repeated zip-bomb attempts even after fix #1 lands. Code/infra change, low priority.

### Noted but out of scope for this report

Two things surfaced during the investigation that are **not** malware/malicious-file risks and were intentionally not pursued further, per the task's explicit scope boundary:
- The preview→confirm trust boundary: the server keeps no state between preview and confirm, so `confirm()` trusts the client-resubmitted row data (subject to Zod schema + `CalibrationRequestsService.create()`'s own existence checks) rather than re-deriving matches from the original file. This is a business-logic/data-integrity question, not a file-security one.
- The portal's upload request uses `credentials: "include"` cross-origin to the API host. This is a CORS/session-handling question, not a file-security one.

---

## 5. Recommended Security Boundary

```
Customer .xlsx (browser, advisory .xlsx filter only)
   → Nginx (client_max_body_size — staged config, not yet applied to production)
   → CompanyRoleGuard: session (Better Auth) + active membership + RequirePermission(calibrationRequest, create)   [existing — solid]
   → Multer FileInterceptor: multipart parse → in-memory buffer, fileSize/files limits                             [existing — solid]
   → [GAP] Strict content-type validation: drop octet-stream fallback + magic-byte ZIP signature check              [recommended]
   → [GAP] Decompression/resource-exhaustion guard around workbook.xlsx.load()                                     [MUST FIX]
   → (not currently needed) malware/AV scan of buffer — revisit only if the file is ever persisted
   → ExcelJS workbook.xlsx.load(buffer)                                                                            [existing]
   → Row/column validation, MAX_DATA_ROWS cap, device-type matching against DB                                     [existing]
   → Preview response → browser review/edit                                                                        [existing]
   → Confirm (JSON, no file involved) → CalibrationRequestsService.create() / Revision's revise endpoint            [existing]
```

**Section E — shared boundary:** Yes, Create and Revision already share one upload-security boundary in practice, since Revision's Import Excel action calls the exact same `POST /calibration-requests/import/preview` endpoint and the same `CalibrationRequestImportService.preview()` function with zero Revision-specific code in that path. Any hardening applied to that one function automatically covers both flows — there is no second boundary to separately harden.

---

## 6. Implementation Scope

Smallest practical scope to close the MUST FIX item (not executed by this task):

- **File touched:** `apps/api/src/modules/calibration-requests/calibration-request-import.service.ts` only (specifically `parseWorkbook()` / the `workbook.xlsx.load(buffer)` call site) — shared by Create and Revision, so one change covers both flows.
- **No schema change, no API contract change, no UI change** required for this fix.
- **Open decision required before implementation** (this investigation deliberately does not pick one, per its own scope limits):
  1. Pre-check the ZIP central directory's declared uncompressed sizes per-entry and in total before calling `exceljs`, rejecting oversized declarations up front, or
  2. Wrap the `xlsx.load()` call with a hard timeout/memory watchdog, or
  3. Evaluate migrating from `exceljs` to `exceljs-hardened` (the community fork with built-in `maxEntryUncompressedSize`/`maxTotalUncompressedSize` options) as a drop-in replacement.

  This is the concrete blocker to raise with the team — not something to resolve unilaterally, since it's a real dependency/architecture choice.

For the STRONGLY RECOMMENDED items: #2 and #3 are small additions to the same file/validation step; #4 is a one-line addition to `docker-compose.prod.yml`; #5 is a process change (CI/audit step), not a code change.

---

## 7. Conclusion

The existing pipeline is well-built against the risks its architecture naturally avoids: the uploaded file is never persisted to disk, never exposed via any web-accessible path, and never able to execute embedded macros/VBA (ExcelJS is a pure data parser). Authentication and authorization are correctly enforced server-side, independent of the portal's cosmetic UI gate, and the Revision flow reuses the exact same hardened endpoint with no gaps introduced.

However, the implementation is **not yet safe for unrestricted customer-supplied `.xlsx` files in production**, because of one concrete, verified, currently-unmitigated gap: mainline `exceljs` has no protection against a small file expanding to an enormous size in memory during parsing, and the `api` container has no memory ceiling to contain the resulting crash. This is a real, easily-triggered denial-of-service vector reachable by any authenticated customer through either Create or Revision. That single fix (§4, MUST FIX #1) is the practical blocker to production readiness; every other item in this report is hardening rather than a hard blocker, and signature-based malware scanning specifically is not warranted by the current architecture at all — there is no vector today by which a malicious payload embedded in a workbook could execute or reach another user.
