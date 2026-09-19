# Handoff — Medcal Session Summary (2026-09-05 → 2026-09-06)

**Purpose:** context transfer for continuing work in another session/tool. This session covered
a very large amount of ground — feature completion for the entire CalibrationJob domain, and
the first production deployment of `apps/tech-pwa`. Read this before touching anything;
several items below are **actively in-progress and unresolved**.

---

## ⚠️ IMMEDIATE UNRESOLVED ITEM — read this first

**A production data cleanup is in progress and NOT YET COMMITTED.**

- Context: a trial requisition imported from `bipmed-device.xlsx` had a data-entry error
  (`Qty=3` on 3 rows that should have been `Qty=1`, since each row named a physically distinct
  unit — model MF-9271/9272/9273), which fanned out into 9 `CalibrationJob` rows instead of the
  intended 3.
- Decision made: since no real customer transactions exist yet in the production DB, and a
  separate full-DB backup was already taken, we agreed to a **full wipe** of the commercial-chain
  trial data (`CalibrationRequest` → `Quotation` → `PurchaseOrder` → `WorkOrder` →
  `CalibrationJob` → everything downstream) rather than surgical per-row deletion. Master data
  (`Device`, `DeviceType`, `Equipment`, `User`, `Company`, etc.) is explicitly NOT touched.
- Claude Code produced a SQL script `trial-data-wipe.sql` (21 `DELETE` statements in FK-safe
  order, wrapped in a transaction with `\set ON_ERROR_STOP on`, plus BEFORE/AFTER row-count
  verification, plus a `DELETE FROM "DocumentNumberSequence"` for CRQ/QUO/PUR/SPK year 2026 —
  the `CUSTOMER` (CUS) sequence row is deliberately preserved since a trial `Customer` record is
  being kept).
- **Current blocker:** the script contains a `psql` meta-command (`\set ON_ERROR_STOP on`) which
  is NOT valid plain SQL — it only works when run via the actual `psql` CLI, not pgAdmin's Query
  Tool (which is what was tried first, causing a syntax error at `\set`). The user was mid-way
  through switching to running it via `psql` directly on the VPS when this handoff was requested.
- **What still needs to happen:**
  1. Confirm the script file actually exists on the VPS (likely at `/medcal/trial-data-wipe.sql`
     or wherever Claude Code's VPS-side session wrote it — NOT the Windows-local scratchpad path
     referenced in chat, which is irrelevant to execution).
  2. Run it via `psql -h localhost -p 5432 -U postgres -d pkmdb -f trial-data-wipe.sql` **with the
     final statement still set to `ROLLBACK;`** (dry run) — get password via `read -s PGPASSWORD`
     immediately before, never typed as a plain argument or pasted verbatim in a way that lands
     in shell history or chat logs.
  3. Review the BEFORE/AFTER row counts printed by the dry run.
  4. Only if correct, change the final statement to `COMMIT;` and re-run for real.
  5. Confirm master-data row counts are byte-identical before/after, and in-scope table counts
     are all 0 afterward.
- Expected result: `CalibrationRequest CRQ/2026/09/00001` (+5 items), `Quotation
  QUO/2026/09/00001` (+5 items, was APPROVED), `PurchaseOrder PUR/2026/09/00001` (+5 items, was
  APPROVED) all deleted; everything from `WorkOrder` downward was already 0 rows (trial never
  reached that stage); no `FileObject` rows existed (0), so no on-disk file cleanup needed.

---

## 1. Feature work completed this session (CalibrationJob domain)

Starting point at session start: per an earlier full audit, `CalibrationJob` and everything
downstream of it was **schema-only** — zero runtime, zero UI, zero RBAC grants. By end of
session, this entire domain is built, tested, and now deployed to production (tech-pwa) for the
first time.

| Sub-domain | Status | Notes |
|---|---|---|
| `CalibrationJob` schema (nullable `deviceId`, identity snapshot fields, `unitOrdinal`/`unitTotal`) | ✅ Done | Migrations applied |
| Fan-out runtime (`WorkOrder` → IN_PROGRESS creates `CalibrationJob` rows) | ✅ Done | Qty-driven, idempotent, tested |
| AKD/AKL (NIE) escalation + TECHNICIAN_MANAGER approval | ✅ Done | API + Portal UI |
| **Identity Correction** (BA / Berita Acara workflow) | ✅ Done | Schema, service/API, Portal UI, tech-pwa submit wizard — see §2 for the critical model correction made mid-session |
| Device assignment (superseded) | ✅ Removed | Fully replaced by Identity Correction per locked decision — plain `assignDevice` endpoint now returns 410 GONE |
| `JobReferenceEquipmentUsed` (reference-equipment traceability) | ✅ Done | Schema (real FK, not free-text), service/API with validity checking + TECHNICIAN_MANAGER override, Portal (read-only), tech-pwa (record + view) |
| Portal pagination "stale page → empty list" bug | ✅ Fixed | Shared `usePaginationSync` + `ViewAdjustedBanner`, rolled out to 19/20 candidate pages; `users` page deferred (needs a `useUsers` query-hook migration first); `leads`/`email` got a reduced (no anti-flash) version due to child-component empty-state delegation |
| FCM push-notification error messages (Portal + tech-pwa) | 🟡 In progress | Task was started (Stage 1 approved: specific messages by error type, `tech-pwa` in scope too); implementation status not confirmed complete this session |

### Critical model correction made mid-session — READ THIS if touching Identity Correction

The signature-photo model was initially built **wrong**: one photo per signer (TECHNICIAN +
CUSTOMER separately). The actual physical reality is **both signatures are on ONE sheet of
paper**, photographed once. This was caught and corrected end-to-end:

- **Correct model:** the photo belongs to `IdentityCorrection` (the BA record) as a whole —
  `ownerType: "IDENTITY_CORRECTION", ownerId: correction.id`. `IdentityCorrectionSignature` rows
  remain two per correction (status/name/reason each), but neither owns a photo.
- Backend (`identity-correction-file-owner-policy.ts`, the approve guard) and Portal UI were
  both fixed. **tech-pwa was built AFTER this fix**, so it was designed correctly from the start
  — no residual bug there.
- If any future work touches this area, verify `ownerId` is always `correction.id`, never a
  signature row's id.

---

## 2. Production deployment (VPS) — status as of this session

**VPS:** `srv1000177` (168.231.119.205), Ubuntu, Docker + native PostgreSQL + Nginx (shared with
two other unrelated projects: `bipmed`, `bumiindah` — never touch their Nginx blocks/containers).
SSH access via `afriza@168.231.119.205` (member of `sudo` and `docker` groups). Claude Code runs
**on the VPS itself**, connected via Claude Desktop's SSH remote-session feature (not on the
user's laptop) — this was a deliberate choice for direct access to the real deployment
environment.

### Containers running (production)
| Container | Port | Status |
|---|---|---|
| `medcal-api` | 127.0.0.1:3001 | ✅ healthy, pre-existing |
| `medcal-web-api` | 127.0.0.1:3002 | ✅ healthy, pre-existing |
| `medcal-portal` | 127.0.0.1:3003 | ✅ healthy, pre-existing |
| `medcal-web` | 127.0.0.1:3010 | ✅ healthy, pre-existing |
| **`medcal-tech-pwa`** | **127.0.0.1:3004** | **✅ healthy — newly deployed this session** |
| `mssql2019` | 1433 | unrelated, pre-existing, do not touch |

Native PostgreSQL (not containerized) — `apps/api` reaches it via
`extra_hosts: host.docker.internal:host-gateway`. `tech-pwa` needs no DB access at all (browser
calls `apps/api` directly).

### `tech-pwa` deployment (F5.7) — this session's main deployment work
- New `apps/tech-pwa/Dockerfile` created, mirroring `apps/portal/Dockerfile`'s pattern
  (`turbo prune` multi-stage build, `NEXT_PUBLIC_*` as build args — including into the
  dynamic `firebase-messaging-sw.js` Route Handler, which despite its own source comment
  claiming "runtime injection" is actually build-time inlined by Next.js; **this misleading
  comment was flagged but deliberately NOT fixed — tracked as a small separate follow-up**).
- `docker-compose.prod.yml` updated: new `tech-pwa` service block, no `env_file` (confirmed via
  grep that tech-pwa has zero non-`NEXT_PUBLIC_` runtime env reads), no `depends_on` (browser
  calls `api` directly, not container-to-container).
- Shares the same Firebase project/app as `portal` — no separate `NEXT_PUBLIC_FIREBASE_APP_ID`
  needed.
- Image built successfully: `medcal-tech-pwa:latest`, 2.29 GB.
- Two permission hiccups during setup, both resolved without any scope creep:
  1. `/medcal` was root-owned → fixed with `sudo chown -R afriza:afriza /medcal`.
  2. `afriza`'s `docker` group membership existed in `/etc/group` but the shell session hadn't
     picked it up yet → worked around with `sg docker -c "..."` rather than requiring a session
     restart.
- **DNS:** `technician.kalibrasimedika.co.id` A record already existed pointing at the VPS.
- **Nginx + SSL:** installed and working, but required a manual fix mid-process —
  - First attempt: `nginx -t` failed because the example config's HTTPS block referenced a
    certificate that didn't exist yet (chicken-and-egg — cert is created by Certbot, but the
    config referenced it before Certbot ran).
  - Fix: temporarily reduced the config to just the port-80 block, reloaded, then ran
    `certbot --nginx -d technician.kalibrasimedika.co.id`, which succeeded and auto-appended the
    HTTPS block with correct cert paths.
  - **Second issue found via live browser test:** the resulting config's HTTPS block had
    `location / { return 301 https://... }` (a leftover from the simplified HTTP-only version
    Certbot copied) instead of `proxy_pass http://127.0.0.1:3004`, causing an infinite redirect
    loop (`ERR_TOO_MANY_REDIRECTS`). Fixed manually by rewriting the file's HTTPS `location /`
    block to proxy correctly, then `nginx -t` + `reload` again.
  - **Verified live and working**: `https://technician.kalibrasimedika.co.id` now serves the app
    correctly (confirmed via real browser on a phone) — cert valid until 2026-12-04, Certbot
    auto-renewal scheduled.
- **Note on `git pull` on the VPS:** at one point `git pull` failed with "untracked working tree
  file would be overwritten" for `infra/nginx/technician.kalibrasimedika.co.id.conf.example` —
  this is because the file was created directly on the VPS (untracked locally there) while a
  file of the same name/path was already pushed to GitHub from elsewhere. Needs manual
  reconciliation (diff the two versions, keep whichever is authoritative, likely they're
  identical since both came from the same approved Stage 1 design) before `git pull` will
  succeed again on the VPS. **This was not yet resolved when the session ended** — check this
  before assuming the VPS repo is in sync with GitHub.

### Explicitly NOT done yet (per architecture doc's own F5 sequencing)
- `apps/web`/`apps/web-api`/`apps/portal` were already containerized before this session
  (pre-existing). Only `tech-pwa` was added this session.
- Real device testing beyond one phone browser check — the multi-screen Identity Correction
  wizard, camera capture flow, and Reference Equipment Used recording screen have NOT been
  clicked through end-to-end on a real device yet (only code-reasoned/typechecked verification
  during development). **This is the highest-value next manual QA step** before wider pilot use.

---

## 3. Locked business decisions (do not re-litigate these)

- **Device master data is never deleted** — all FKs to `Device`/`Equipment` use `onDelete:
  Restrict`, not `SetNull` or `Cascade`, consistently across `CalibrationJob`,
  `IdentityCorrection`, `JobReferenceEquipmentUsed`.
- **New physical `Device` rows are plain data entry, no regulatory gate** — but only for a
  DeviceType that's *already* Kemenkes/KAN-licensed (that licensing happens at the DeviceType
  level, resolved long before any requisition). New reference `Equipment` units work the same
  way in principle, but see next point.
- **Reference equipment candidates for a job come SOLELY from that job's WorkOrder's confirmed
  `WorkOrderEquipment` list** — never a fresh company-wide search. A job cannot use equipment
  that wasn't already confirmed onto its WorkOrder.
- **Identity Correction is the sole path for setting/changing `CalibrationJob.deviceId`** — this
  applies to first-time assignment too, not just corrections to an already-approved identity
  (the audit-trail requirement — "what proves the customer knew this device's identity" — applies
  identically whether it's the first assignment or the fifth correction).
- **TECHNICIAN_MANAGER decisions (Identity Correction approve/reject) happen in Portal ONLY,
  never in tech-pwa** — confirmed explicitly, not to be revisited without a new discussion.
  (Reference Equipment Used recording is the one exception: TECHNICIAN_MANAGER *can* use
  tech-pwa for that, to remotely authorize an override when a field technician calls them — this
  is a different, later decision, don't conflate the two.)
- **AKD/AKL escalation reason is separate from the identity-correction `reason` field** — the
  identity-correction `reason` column is durable and never overwritten, unlike an earlier design
  flaw in the plain AKD/AKL escalation flow where the escalation note gets overwritten by the
  manager's decision note (a known, accepted small gap there, not fixed).
- **Device name is not a correctable/recordable attribute anywhere in Identity Correction** —
  name normalization is handled entirely by the separate, already-mature "Device Name Alias"
  system (Portal screen already exists, used at Excel-import matching time).
- **`WorkOrderItem.qty` is the fan-out cardinality source** — one `CalibrationJob` per unit,
  `unitOrdinal`/`unitTotal` tracks position. **This is exactly what caused today's trial-data
  bug**: the Excel import had `Qty=3` on 3 separate physical-unit rows (should have been `Qty=1`
  each), producing 9 jobs instead of 3. This is a **data-entry / SOP issue**, not a code bug —
  the system behaved exactly as designed given the (wrong) input. Worth documenting in whatever
  Excel-import guidance exists for future users filling this template.

---

## 4. Plans on file (not yet started)

- **E2E testing (Playwright/Cypress)** — deliberately deferred until ALL core features
  (including the ones below) are complete. Saved to memory: scope narrowly to the full
  happy-path business flow (CalibrationRequest→Quotation→PO→WorkOrder→CalibrationJob→
  Certificate) plus a few high-risk cross-role RBAC scenarios, not exhaustive per-component
  coverage (unit tests already cover that).
- **MeasurementResult** — the actual calibration measurement data (multi-point, multi-replicate
  readings tied to `DeviceCalibrationParameter`) is **completely unbuilt** — still an untyped
  JSON blob with no runtime. This is the single largest remaining gap before the system can
  complete one full calibration cycle end-to-end. An investigation task for this was planned but
  not yet run this session (superseded by the deployment work).
- **Certificate** — schema-only, no runtime, not started.
- **QA / QualityReview** — schema-only, no runtime, not started.
- **`users` page pagination fix** — needs a `useUsers`-style query-hook extraction (currently
  hand-rolled `fetch`+`useState`) before `usePaginationSync` can be wired in, per the pagination
  rollout task's findings.
- **Anti-flash guard for `leads`/`email` pagination pages** — currently get the core clamp+banner
  fix but not the flash-prevention guard, because their empty-state rendering is delegated to a
  child component (`MessageInboxTable`/`EmailInboxTable`) with no prop threaded through yet. Minor
  residual UX gap, not a bug.
- **`firebase-messaging-sw.js/route.ts` misleading comment** — claims runtime injection of
  `NEXT_PUBLIC_FIREBASE_*` values; actually build-time. Filed as a tracked follow-up, not fixed.
- **Fix Option 3 from the pagination investigation** (`router.push`-for-first-navigation-change,
  vs. `router.replace`) — explicitly deferred, addresses the *trigger* of the stale-page bug
  rather than the symptom (which `usePaginationSync` already handles).

---

## 5. Working style / conventions established this session (for whoever continues)

- **Staged tasks**: every non-trivial implementation task for Claude Code follows a two-stage
  pattern — Stage 1 is a written design proposal (no code), explicit HARD STOP, wait for
  explicit human approval; Stage 2 implements exactly what was approved. This caught several
  real issues before they became bugs (the signature-photo model error was caught at a *design*
  review stage in one sub-area, but had already shipped in another before the model was
  corrected — see §1).
- **Production/VPS work gets extra caution**: never paste a password into chat or let an AI
  agent type a `sudo` password; the human runs any command requiring elevated/interactive
  credentials themselves, with the AI providing the exact command and verifying results
  afterward via non-privileged checks.
- **Database resets/deletes always go through an explicit BEFORE-count → proposed
  statement-order → (approval) → AFTER-count verification cycle** — never a blind "just delete
  it" even when the human has already confirmed there's no real data at stake.
- Both Cursor (Claude Opus-based) and Claude Code are used somewhat interchangeably as an
  availability buffer, but big/sensitive tasks stay in Claude Code specifically because it's
  been the tool used throughout this session's staged-review process — switching tools mid
  large-task was explicitly decided against this session due to review-continuity risk.
