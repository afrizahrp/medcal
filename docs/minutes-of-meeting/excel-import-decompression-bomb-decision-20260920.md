# ExcelJS Decompression-Bomb Protection — Decision Report

**Date:** 2026-09-20
**Scope:** Resolve the mechanism choice for the MUST-FIX decompression-bomb gap identified in `docs/minutes-of-meeting/excel-upload-security-investigation-20260920.md`, evaluating exactly three candidates. Investigation/decision only — no code, dependency, Docker, or API changes were made.

---

## 1. Current Technical Context

The vulnerable call site is `apps/api/src/modules/calibration-requests/calibration-request-import.service.ts`, `parseWorkbook()` (lines 157–267). The exact call is line 162:

```ts
await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
```

wrapped only in a bare `catch {}` (lines 163–168) that remaps any thrown error to a `MALFORMED_WORKBOOK` `BadRequestException`. There is no timeout, no pre-inspection of the buffer, and no streaming — this is a single, unbounded, fully-buffered parse call. `MAX_IMPORT_BYTES` (5 MiB, compressed input) and `MAX_DATA_ROWS` (1000, checked *after* `load()` succeeds) do not bound decompressed size in any way.

Re-verified facts load-bearing for this decision:

- **`exceljs` version:** declared `^4.4.0` in `apps/api/package.json`, resolved to exactly `4.4.0` in `pnpm-lock.yaml` — no drift.
- **`exceljs@4.4.0`'s own dependencies** (read directly from `node_modules/.pnpm/exceljs@4.4.0/node_modules/exceljs/package.json`): `archiver@^5.0.0` (writing), `jszip@^3.10.1`, **`unzipper@^0.10.11`** (Node-path zip reading), `saxes@^5.0.1` (XML parsing), plus `dayjs`, `fast-csv`, `readable-stream`, `tmp`, `uuid`. `unzipper` is exceljs's actual zip-decoding library on Node and is already resolved in Medcal's lockfile as a transitive dependency.
- **NestJS/multer:** `FileInterceptor("file", { limits: { fileSize: MAX_IMPORT_BYTES, files: 1 } })`, default in-memory storage. No `@nestjs/throttler`, no RxJS `timeout()`, no circuit-breaker, no request-level timeout anywhere in `apps/api/src` — any watchdog approach would be a wholly new pattern for this codebase.
- **Docker runtime:** `apps/api/Dockerfile` → `node:22-alpine`, runs via `tsx src/main.ts`. No `NODE_OPTIONS`/`--max-old-space-size` anywhere. `docker-compose.prod.yml`'s `api` service has no `mem_limit`/`deploy.resources.limits`/`cpus` at all — zero memory ceiling today at any layer.
- **Tests:** `calibration-request-import.service.test.ts` builds all fixtures via exceljs's own writer (`wb.xlsx.writeBuffer()`), which cannot construct an adversarial zip. No existing test covers `MALFORMED_WORKBOOK`, `FILE_TOO_LARGE`, or `TOO_MANY_ROWS`.
- **Blast radius:** only `calibration-request-import.service.ts` parses attacker-controlled input via exceljs. `apps/api/src/generate-requisition-template.ts` also imports exceljs, but only to write a static template — not attacker-facing.
- **Create + Revision:** confirmed still sharing the identical `import/preview` endpoint/service — one fix in this one file covers both.

---

## 2. Option A — ZIP Pre-Check

**Mechanism:** before `workbook.xlsx.load(buffer)` is called, independently read the buffer's ZIP End-Of-Central-Directory + Central-Directory records (metadata only, no decompression) and inspect each entry's declared `uncompressedSize`. Reject if any single entry or the archive-wide total exceeds a threshold.

**Feasibility:** exceljs's own Node-path zip reader, `unzipper`, already exposes exactly this via its `Open.buffer()` API — it reads the central directory lazily and only decompresses an entry if `.stream()`/`.extract()` is explicitly called on it. Because `unzipper` is already resolved in the lockfile as exceljs's own dependency, reusing it for a pre-check adds no new supply-chain surface — it only needs to be declared as an explicit direct dependency instead of an implicit transitive one.

**Does it happen before dangerous decompression?** Yes, structurally. Central-directory metadata is tiny and fixed-cost regardless of the archive's real or claimed decompressed size, so the reject decision is made with zero bytes ever inflated.

**What can and cannot be safely inferred from ZIP metadata before decompression:**
- *Per-entry uncompressed size* — readable from the central directory (or its ZIP64 extra field for sizes ≥ 4 GiB) without decompressing. Reliable for detecting the classic "declare-huge" bomb.
- *Total declared uncompressed size* — the sum across all central-directory entries, also readable without decompression. This is the correct check against the "zip quine"/overlapping-entry technique (Fifield's "A better zip bomb"): that technique achieves a huge *real* expansion ratio from a tiny file, but it does so by declaring — honestly, in the central directory — a large total uncompressed size across many entries. The total-size check catches it; it isn't lying about size, it's exploiting overlap to make a small compressed payload expand enormously.
- *Suspicious compression ratio* — computable cheaply (declared uncompressed ÷ compressed size per entry), and useful as an additional signal, though the size-cap check alone is sufficient for this use case.
- *Malformed/missing ZIP metadata* — a ZIP file with no valid central directory / EOCD record is not a valid `.xlsx` at all and would already fail to parse; treating malformed metadata as a rejection is safe and consistent with the existing `MALFORMED_WORKBOOK` behavior.
- *Trust caveat:* the declared `uncompressedSize` field is a plain integer written by whoever authored the file — it is not cryptographically bound to the actual compressed byte stream. A maximally adversarial, parser-implementation-specific mismatch (declaring a small size while the real inflate output is larger) is a theoretical edge case that most zip readers reject or warn on when central-directory and local-file-header values disagree. In practice, every realistic decompression-bomb shape *wants* the declared size to be honestly large (that's the entire point of the attack), so this residual edge case is not a practically exploitable gap for this threat, given a correct, ZIP64-aware reader — which is why reusing `unzipper` (already correct here) rather than hand-rolling EOCD/ZIP64 parsing matters.

**Evaluation against the 12 criteria:**
1. Implementation complexity: moderate — one new function (~30–50 lines) plus a call-site insertion.
2. Files/types changed: `calibration-request-import.service.ts` (new pre-check + call site) and `apps/api/package.json` (promote `unzipper` to an explicit direct dependency, same already-resolved version — no new package, no version bump).
3. Runtime reliability: deterministic, synchronous-in-effect, no timing races.
4. Prevents memory exhaustion before it happens: yes — reject-then-parse, not parse-then-detect.
5. Bypasses/limitations: relies on `unzipper`'s own correctness (mature, widely used); doesn't address non-decompression resource use in the later XML/SAX stage (out of scope for this specific gap).
6. Maintenance burden: low — self-contained, no external service, no behavior change for legitimate files (thresholds sit far above any real Medcal import sheet, which the code's own comment already calls "tiny").
7. Dependency risk: minimal — no new package, only an already-present transitive dependency made explicit.
8. Compatibility with existing files/templates: no change to accepted `.xlsx` structure or valid-file behavior; purely additive rejection of degenerate cases.
9. Testability: straightforward — hand-build a ZIP whose central directory declares an oversized entry/total and assert rejection pre-parse.
10. Operational impact on VPS: none — pure application code change.
11. Changes current import behavior: adds one new rejection path/error code for a previously-unhandled degenerate case; no change for legitimate files.
12. No new architecture: correct — an additional validation step in the same request-handling flow, same file.

---

## 3. Option B — Timeout / Memory Watchdog

**As literally proposed** (`Promise.race([workbook.xlsx.load(buffer), rejectAfter(ms)])`): the calling code stops *waiting* after `ms` elapses, but this does **not** cancel, abort, or free the underlying work. `workbook.xlsx.load()` exposes no `AbortSignal`/cancellation token. The streams it opens internally (via `unzipper`) keep running, keep allocating decompressed buffers, and keep feeding `saxes`'s XML parser — entirely independent of whether the calling `await` gave up.

**This does not prevent memory exhaustion. It only stops the request handler from waiting for the result, while the dangerous work continues, unobserved, in the background.** It is worse than doing nothing in one respect: the client receives a fast error, inviting retries, and each abandoned `load()` keeps consuming memory independently — concurrent abandoned requests could pile up memory usage faster than a single unbounded request would.

A structurally different, *actually preventive* variant exists: run `workbook.xlsx.load(buffer)` inside a Node `worker_thread` with `resourceLimits: { maxOldGenerationSizeMb, maxYoungGenerationSizeMb }`. This imposes a real, V8-enforced heap ceiling — the worker is terminated when exceeded, and the parent can also `.terminate()` it on a timeout, genuinely killing in-flight work rather than merely abandoning it.

**Direct answer to the core requirement:** a bare `setTimeout`/`Promise.race` wrapper is detection-after-the-fact *at best, and often not even that* — it cannot outrun a fast bomb (a crafted archive can plausibly exhaust memory in well under a second, faster than any timeout threshold generous enough to avoid false-positiving on legitimate large files). Only the `worker_thread` + `resourceLimits` variant satisfies "prevents rather than merely detects."

**Evaluation:**
- Files changed (worker-thread variant): a new worker entry file, buffer/result message-passing, a rewritten call site in `parseWorkbook()`, and — since no `worker_threads` usage exists anywhere in this codebase today — likely new shared infrastructure if the pattern is meant to be reused.
- Complexity: high relative to Option A — a new concurrency primitive and new failure modes (worker crash vs. normal rejection vs. legitimate parse error) with no existing precedent to build on.
- Reliability: genuinely preventive once correctly built, but with materially more moving parts than Option A for an equivalent guarantee.
- Testability: harder — asserting on worker termination/resource-limit behavior is slower and more involved than a synchronous metadata check.
- Operational impact: each worker is a fresh V8 isolate with its own overhead; should complement, not replace, a Compose-level `mem_limit` regardless.
- Verdict: the naive form does not meet the requirement at all. The worker-thread form does, but at meaningfully higher cost than Option A for the same (in fact broader, since it also bounds any pathological SAX-parsing case) outcome — better positioned as a future complement to Option A than as this gap's fix.

---

## 4. Option C — exceljs-hardened

**What it is:** an unofficial, single-maintainer fork (`mateocallec/exceljs-hardened` on GitHub), forked from upstream `exceljs@4.4.0`, created because its maintainer judged upstream unmaintained/unresponsive. Its own documentation states the API is unchanged from upstream `exceljs@4.4.0` and that it's a drop-in replacement (`require("exceljs")` → `require("exceljs-hardened")`), and explicitly recommends migrating back to official `exceljs` if upstream becomes active again — it presents itself as a stopgap, not a permanent choice.

**Its actual fix mechanism, verified:** `load()` reads each entry's declared uncompressed size from the central directory **before decompression**, rejecting if a configurable per-entry (default 128 MB) or archive-wide (default 512 MB) limit would be exceeded, via new `maxEntryUncompressedSize`/`maxTotalUncompressedSize` options. **This is the identical mechanism as Option A**, already implemented inside the library. Choosing Option C is not a different technical approach — it is "get Option A, pre-built by a third party," rather than building the same check directly.

**Evaluation:**
- Compatibility: claimed drop-in per its own docs; not independently verified against Medcal's exact usage in this investigation (no dependency install was performed, per scope). Narrow blast radius if pursued — only two files import `exceljs` (`calibration-request-import.service.ts` for parsing, `generate-requisition-template.ts` for writing).
- Dependency risk: materially higher than Option A — a single-maintainer fork that doesn't track every upstream change, with a smaller install base and less ecosystem scrutiny than mainline `exceljs`, explicitly framed by its own author as temporary.
- Maintenance burden: ongoing risk the fork falls further behind upstream or is itself abandoned, requiring a future re-migration.
- Files changed if pursued: `apps/api/package.json` (dependency swap), two import statements, plus full re-verification of every existing test against the new package.
- Verdict: technically sound (identical mechanism to Option A) but strictly worse than Option A on dependency risk and maintenance burden, for no additional protective benefit — the protection itself is the same and can be built directly from already-vetted, already-present code.

---

## 5. Side-by-Side Comparison

| Criterion | A — ZIP pre-check | B — Timeout/watchdog (naive) | B′ — worker_thread + resourceLimits | C — exceljs-hardened |
|---|---|---|---|---|
| Prevents (not just detects) OOM | Yes — rejects before any decompression | No — underlying work continues after "timeout" | Yes — V8-enforced heap ceiling, worker terminable | Yes — same mechanism as A, pre-built |
| Applied before dangerous decompression | Yes | No | Yes (bounds it, doesn't prevent starting) | Yes |
| Files/areas changed | 1 service file + explicit dep declaration | 1 service file (but doesn't work) | New worker file + call-site rewrite + new pattern | package.json + 2 import sites + full retest |
| New dependency | No (already transitively present) | No | No | Yes (new, single-maintainer fork) |
| New pattern for this codebase | No | N/A (insufficient) | Yes (first worker_thread usage) | No (same usage shape as exceljs) |
| Implementation complexity | Moderate | Low (but ineffective) | High | Low (swap) but high verification burden |
| Testability | Straightforward (hand-built adversarial zip) | N/A | Harder (async worker termination) | Same test need as A, plus package-swap regression risk |
| Dependency/maintenance risk | Low | N/A | Low (built-in Node API) | Higher (unofficial fork) |
| Changes existing valid-file behavior | No | No | No | No (claimed) |
| VPS/Docker change required | No | No | No (benefits from one regardless) | No |

---

## 6. Recommended Approach

**Option A** — implemented directly in Medcal's own code, using `unzipper`'s already-present central-directory API, promoted from a transitive to an explicit direct dependency in `apps/api/package.json`.

**Reasoning:** it is the only option that is simultaneously (1) genuinely preventive — rejecting before any decompression occurs, satisfying the core requirement — (2) minimal in code and dependency footprint — reusing a library already vetted and present in the tree rather than adding a new one or a new concurrency pattern — (3) deterministic and fail-closed, with no timing races — and (4) easy to test with a hand-built adversarial fixture. Option B's naive form does not work at all; its only working form (worker_thread) is strictly more complex than Option A for an equivalent decompression-bomb guarantee. Option C delivers the exact same protective mechanism as Option A, but via a riskier, less-established dependency, for no additional protection.

**Smallest sufficient combination:** Option A alone closes the MUST-FIX gap. Pairing it, as a separate and independently reviewed change, with a Compose-level `mem_limit`/`deploy.resources.limits.memory` on the `api` service (already flagged STRONGLY RECOMMENDED in the prior report) is cheap and catches anything Option A doesn't by design (e.g. pathological post-decompression XML structure). Option B's worker-thread variant is not needed once Option A is in place and is only worth revisiting later if Medcal wants to generically bound all CPU/memory-heavy parsing, not just this one gap.

---

## 7. Exact Implementation Boundary

**Files expected to change:**
- `apps/api/src/modules/calibration-requests/calibration-request-import.service.ts` — add a pre-check function invoked before `new ExcelJS.Workbook()`/`workbook.xlsx.load()` inside (or immediately ahead of) `parseWorkbook()`. On rejection, throw `BadRequestException` with a new error code (e.g. `WORKBOOK_TOO_LARGE_UNCOMPRESSED`), following the existing shape used by `FILE_TOO_LARGE`/`MALFORMED_WORKBOOK`.
- `apps/api/package.json` — add `unzipper` as an explicit direct dependency, pinned to the version already resolved in `pnpm-lock.yaml` (no version change, no new package fetched).

**What will NOT change:**
- API contract/response shape (only a new rejection error code, following the existing pattern).
- DB schema, UI, Revision logic, or the `confirm()` flow.
- `MAX_IMPORT_BYTES`/`MAX_DATA_ROWS` (kept as-is; this fix is complementary).
- `generate-requisition-template.ts` (write path, not attacker-facing — untouched).

**Expected tests** (new, in `calibration-request-import.service.test.ts`):
1. A hand-built ZIP whose central directory declares an oversized single-entry `uncompressedSize` → rejected before any parse.
2. A hand-built ZIP whose central directory declares an oversized *total* across entries → rejected.
3. Existing valid `.xlsx` fixtures (via `buildXlsx()`) still pass unaffected.
4. (Adjacent, currently missing, optional to flag for whoever implements this) coverage for the pre-existing untested paths `MALFORMED_WORKBOOK` / `FILE_TOO_LARGE` / `TOO_MANY_ROWS`.

**Expected production/VPS changes:** none required for Option A itself. The paired Compose memory-limit recommendation, if adopted, is a separate `docker-compose.prod.yml` change with its own independent review — not bundled into this fix.

---

## 8. Risks / Limitations

- Declared-size metadata remains, in principle, attacker-authored rather than cryptographically verified data; the theoretical "declares small, actually huge" edge case is not fully eliminated by definition, though it is not practically exploitable here given a correct ZIP64-aware reader (`unzipper`) and the fact that every realistic decompression-bomb shape relies on an honestly large declared size.
- This fix addresses **decompression/resource-exhaustion** only. It does not, and was never intended to, address **malware execution** — a separate concern already resolved in the prior report: ExcelJS never executes macros/VBA regardless of this fix.
- Without the paired container memory limit (a separate, already-recommended change), a legitimately-declared-but-still-huge upload just under whatever threshold is chosen could still pressure memory — threshold tuning should stay well above real Medcal import sheets and well below anything that could threaten the container.
- Does not bound pathological XML-parsing time/CPU after decompression (a separate, lower-priority concern already noted as OPTIONAL rate-limiting in the prior report).

---

## 9. Final Decision

Implement a ZIP central-directory declared-size pre-check (**Option A**) as a new validation step in `apps/api/src/modules/calibration-requests/calibration-request-import.service.ts`, executed before `workbook.xlsx.load()`, using `unzipper`'s existing `Open.buffer()` central-directory API (promoted to an explicit direct dependency in `apps/api/package.json` at its already-resolved version — no version change). Reject with a new `BadRequestException` error code when any single entry's or the archive's total declared uncompressed size exceeds a threshold set well above real Medcal import sheets. This is a single-file, single-dependency-declaration change requiring no schema, API contract, UI, Docker, or VPS changes, and should be paired — as an independent, separately reviewed change — with the already-recommended Compose-level memory limit on the `api` service for defense-in-depth.
