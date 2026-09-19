# EMAIL → LEAD MANAGEMENT
# PHASE 2 IMPLEMENTATION REPORT

**STATUS:** PHASE 2 COMPLETE — STOPPED (awaiting Phase 3 instruction)  
**TANGGAL:** 20 Agustus 2026  
**BASELINE:** `LOCKED-FINAL-IMPLEMENTATION-PLAN-EMAIL-LEAD-MANAGEMENT.md`  
**PRIOR PHASE:** `PHASE-1-IMPLEMENTATION-REPORT.md` (APPROVED)  
**MODE:** STRICT IMPLEMENTATION — no architectural expansion  

---

## 1. Ringkasan eksekutif

Phase 2 (Backend) mengimplementasikan modul Email backend sesuai locked plan:

- `EmailsModule`, `EmailsController`, `EmailsService`
- `ImapSyncService` — manual sync INBOX only, last 50, dedup `messageId`
- `LeadSuggestionService` — strict auto-suggest only (exact email match)
- SMTP send/reply via `packages/notifications` (bukan Nodemailer di EmailsModule)
- Draft lokal, trash soft-delete, restore
- Lead association (`email:manage`), Lead email history (confirmed only)
- Integrasi `GET /leads/:id/emails`, capabilities di `GET /me`
- Backend tests (23 tests Email, semua PASS)

Tidak ada Portal UI, live IMAP/SMTP Hostinger, atau production deployment. Phase 3 **belum** dimulai.

---

## 2. Locked plan yang diikuti

| Lock | Status |
|------|--------|
| Manual IMAP sync only (`POST /emails/sync`) | YA |
| INBOX only, last 50 messages | YA |
| Strict auto-suggest Lead matching | YA |
| `leadId` never auto-set | YA |
| Exactly four permissions | YA |
| Lead association uses `email:manage` | YA |
| SMTP only in `packages/notifications` | YA |
| No cron/worker/queue | YA |
| No attachments / rich text | YA |
| No Portal UI | YA |
| No production deploy | YA |

---

## 3. Implemented

### 3.1 EmailsModule structure

```
apps/api/src/modules/emails/
├── emails.module.ts
├── emails.controller.ts
├── emails.service.ts
├── imap-sync.service.ts
├── imap-client.ts
├── lead-suggestion.service.ts
├── email-normalize.util.ts
├── email-errors.ts
├── emails.service.test.ts
├── imap-sync.service.test.ts
├── lead-suggestion.service.test.ts
└── email-normalize.util.test.ts
```

### 3.2 EmailsController endpoints

| Method | Path | Permission | Purpose |
|--------|------|------------|---------|
| GET | `/emails` | `email:read` | List (folder/status/search/pagination) |
| GET | `/emails/statistics` | `email:read` | Folder counts |
| GET | `/emails/:id` | `email:read` | Email detail + leadCandidates |
| POST | `/emails` | `email:send` | Send email |
| POST | `/emails/draft` | `email:send` | Save draft |
| POST | `/emails/:id/send` | `email:send` | Send draft |
| PATCH | `/emails/:id` | varies* | Update (see §3.7) |
| DELETE | `/emails/:id` | `email:delete` | Move to trash |
| POST | `/emails/:id/restore` | `email:delete` | Restore from trash |
| DELETE | `/emails/:id/permanent` | `email:delete` | Hard delete (trash only) |
| POST | `/emails/sync` | `email:read` | Manual IMAP sync |

\* PATCH handler uses `@RequirePermission("email", "read")` at route level; `EmailsService.update()` enforces `email:send` for draft fields and `email:manage` for `leadId` mutations.

### 3.3 ImapSyncService

- Trigger: `POST /emails/sync` only (no background sync)
- Mailbox: INBOX only
- Limit: last 50 messages (`imapSyncLimit()`)
- Duplicate detection: `messageId` unique constraint + pre-check
- TLS: `IMAP_TLS_REJECT_UNAUTHORIZED` default true
- Lead suggestion on create: `suggestedLeadId` only; `leadId` always null
- Missing `fromEmail`: skipped as malformed
- Missing RFC Message-ID: fallback `uid-{uid}` (reference pattern from server-bi-erp)

### 3.4 LeadSuggestionService

```typescript
// Exact normalized email match only
normalizeEmailAddress(email) = email.toLowerCase().trim().replace(/\s+/g, "")

// Outcomes:
// 1 exact match  → suggestedLeadId = lead.id, leadId = null
// 0 or 2+ matches → suggestedLeadId = null, candidates[] populated
// Never: domain/fuzzy/name/subject matching, auto Lead creation, auto leadId
```

Detail response includes `leadCandidates` for multiple-match UI (Phase 3).

### 3.5 EmailsService — SMTP send/reply

Flow:

```
EmailsService.send()
  → packages/notifications.sendEmail()
  → persist Email (folder=SENT, messageId, sentAt, sentByUserId)
```

Reply semantics:

- `parentEmailId` = MedCal Email cuid (internal thread)
- `rfcInReplyTo` = parent RFC Message-ID (never MedCal cuid)
- `rfcReferences` = built from parent references + parent messageId

SMTP failure: no SENT record created; returns `502 SMTP_DELIVERY_FAILED`.

### 3.6 Drafts (local only)

- Save: `POST /emails/draft` → `folder=DRAFTS`
- Update: `PATCH /emails/:id` with draft fields (requires `email:send`)
- Send: `POST /emails/:id/send` → SMTP + SENT record; original draft deleted
- Not synced to Hostinger IMAP Drafts

### 3.7 Trash (local soft delete)

- Delete: `DELETE /emails/:id` → sets `deletedAt`; **does not** change `folder`
- List trash: `GET /emails?folder=TRASH` filters `deletedAt IS NOT NULL`
- Restore: `POST /emails/:id/restore` → clears `deletedAt`; email returns to original folder
- Permanent delete: `DELETE /emails/:id/permanent` (requires email in trash)
- Does not delete from Hostinger IMAP

### 3.8 Lead association

Requires `email:manage` (not `email:send`):

- Confirm suggestion: `PATCH /emails/:id { leadId: "..." }` → sets `leadId`, clears `suggestedLeadId`
- Change Lead: `PATCH /emails/:id { leadId: "other" }`
- Remove: `PATCH /emails/:id { leadId: null }` → clears both `leadId` and `suggestedLeadId`
- Dismiss suggestion: `PATCH /emails/:id { suggestedLeadId: null }` (requires `email:read` only)

### 3.9 ContactMessage integration

- Compose/send accepts optional `contactMessageId`
- Validates ContactMessage belongs to same `companyId`
- If ContactMessage has confirmed `leadId`, outbound email inherits it (explicit context, not auto-create)
- ContactMessage domain unchanged

### 3.10 Lead email history

- `GET /leads/:id/emails` (requires `lead:read`)
- Returns only emails with confirmed `leadId` (not `suggestedLeadId` only)
- Scoped by `companyId`

### 3.11 Me capabilities

`GET /me` now includes:

```typescript
emailRead: hasPermission(role, "email", "read"),
emailSend: hasPermission(role, "email", "send"),
emailDelete: hasPermission(role, "email", "delete"),
emailManage: hasPermission(role, "email", "manage"),
```

### 3.12 Tenant isolation

All queries scoped by `companyId` from `CompanyRoleGuard` (never client-supplied). Cross-company access returns `404 EMAIL_NOT_FOUND` / `404 LEAD_NOT_FOUND`.

### 3.13 Guard enhancement

`CompanyRoleGuard` now sets `request.userId = session.user.id` for outbound `sentByUserId`. New decorators:

- `@UserId()` — `apps/api/src/common/decorators/user-id.decorator.ts`
- `@MembershipRoleParam()` — `apps/api/src/common/decorators/membership-role.decorator.ts`

---

## 4. Files changed

### New (Phase 2)

| Path | Purpose |
|------|---------|
| `apps/api/src/modules/emails/emails.module.ts` | Nest module |
| `apps/api/src/modules/emails/emails.controller.ts` | REST endpoints |
| `apps/api/src/modules/emails/emails.service.ts` | CRUD, send, draft, trash, association |
| `apps/api/src/modules/emails/imap-sync.service.ts` | Manual IMAP sync orchestration |
| `apps/api/src/modules/emails/imap-client.ts` | Hostinger IMAP fetch (INBOX, 50) |
| `apps/api/src/modules/emails/lead-suggestion.service.ts` | Exact email Lead suggestion |
| `apps/api/src/modules/emails/email-normalize.util.ts` | Email normalization |
| `apps/api/src/modules/emails/email-errors.ts` | HTTP error helpers |
| `apps/api/src/modules/emails/*.test.ts` | Backend tests (4 files) |
| `apps/api/src/common/decorators/user-id.decorator.ts` | UserId param decorator |
| `apps/api/src/common/decorators/membership-role.decorator.ts` | Role param decorator |

### Modified (Phase 2)

| Path | Change |
|------|--------|
| `apps/api/src/app.module.ts` | Import `EmailsModule` |
| `apps/api/src/common/guards/company-role.guard.ts` | Set `request.userId` |
| `apps/api/src/modules/leads/leads.controller.ts` | `GET /leads/:id/emails` |
| `apps/api/src/modules/leads/leads.module.ts` | Import `EmailsModule` |
| `apps/api/src/modules/me/me.controller.ts` | Email capabilities |
| `apps/api/package.json` | Add `imap`, `mailparser` deps |

### Not modified (Phase 2 scope)

- Portal UI (`apps/portal/**`)
- Prisma schema (Phase 1 migration sufficient)
- Production env / VPS
- `packages/shared/src/http/api-fetch.ts` (pre-existing typecheck failure)

---

## 5. Dependencies added

| Package | Version | Purpose |
|---------|---------|---------|
| `imap` | ^0.8.19 | IMAP client |
| `mailparser` | ^3.7.2 | Parse inbound MIME |
| `@types/imap` | ^0.8.42 | Types |
| `@types/mailparser` | ^3.4.6 | Types |

No nodemailer in `apps/api` — SMTP remains in `packages/notifications`.

---

## 6. Validation

### Tests

| Suite | Tests | Result |
|-------|-------|--------|
| `src/modules/emails` (all 4 files) | 23 | **PASS** |
| `src/modules/leads/leads.service.test.ts` | 8 | **PASS** |
| Live IMAP Hostinger | — | **NOT EXECUTED** |
| Live SMTP Hostinger | — | **NOT EXECUTED** |

### Test coverage summary

| Area | Covered |
|------|---------|
| Permissions (read/send/delete/manage) | YES |
| Tenant isolation (email + lead cross-company) | YES |
| Lead suggestion (single/no/multiple match) | YES |
| No auto leadId assignment | YES |
| Lead confirm/change/remove | YES |
| IMAP duplicate/new/malformed/error | YES |
| SMTP success/failure/SENT persistence | YES |
| Reply metadata (parentEmailId vs rfcInReplyTo) | YES |
| Draft create/update/send | YES |
| Trash soft-delete/restore | YES |
| Confirmed lead history only | YES |

### Typecheck

| Check | Result |
|-------|--------|
| New Phase 2 code (`apps/api/src/modules/emails/**`) | **PASS** (no new errors) |
| Pre-existing `api-fetch.ts:29` | **FAIL** (unchanged, out of scope) |
| `pnpm --filter @medcal/api typecheck` overall | **FAIL** (blocked by pre-existing only) |

### Build

Blocked by pre-existing `api-fetch.ts` typecheck failure — same as Phase 1. EmailsModule itself compiles cleanly.

---

## 7. IMAP / SMTP live integration

| Integration | Status |
|-------------|--------|
| IMAP Hostinger live | **NOT EXECUTED** — tests use injected fetch function |
| SMTP Hostinger live | **NOT EXECUTED** — tests use mock mailer |
| Config from `.env` | Ready (`IMAP_*`, `SMTP_*` from Phase 1 schema) |

Requires real credentials in local `.env` for manual integration testing. No credentials committed.

---

## 8. Security

| Control | Status |
|---------|--------|
| TLS verify default on (IMAP + SMTP) | YES |
| Credentials not logged | YES |
| SMTP/IMAP passwords not in source | YES |
| companyId isolation on all queries | YES |
| Permission enforcement server-side | YES |
| Lead association requires `email:manage` | YES |
| No raw HTML trusted in backend | YES (sanitization deferred to Phase 3 portal) |

---

## 9. Deviations

**NONE** against locked Email architecture.

Implementation corrections (not architectural deviations):

1. **PATCH `/emails/:id` permission model** — route uses `email:read`; service enforces `email:send` / `email:manage` per field. Single update endpoint per locked plan.
2. **Trash uses `deletedAt` only** — does not set `folder=TRASH`; original folder preserved for restore (matches locked plan §9.4 semantics).
3. **Message-ID fallback `uid-{uid}`** — when RFC Message-ID missing (reference pattern from server-bi-erp).
4. **`CompanyRoleGuard` extended** — adds `request.userId` for `sentByUserId` (minimal, no new auth architecture).
5. **Live IMAP/SMTP not tested** — integration code complete; tests use mocks/fakes.
6. **Pre-existing typecheck failure not fixed** — `api-fetch.ts` out of Phase 2 scope.

---

## 10. Scope check

| Constraint | Status |
|------------|--------|
| LOCKED PLAN followed | **YES** |
| Portal UI | **NOT implemented** (Phase 3) |
| Automatic IMAP sync | **NOT implemented** |
| cron/worker/queue | **NOT implemented** |
| Automatic Lead assignment | **NOT implemented** |
| Automatic Lead creation | **NOT implemented** |
| Attachments | **NOT implemented** |
| Rich text editor | **NOT implemented** |
| New Email permissions | **NOT added** |
| Second SMTP implementation | **NOT created** |
| Production deployment | **NOT performed** |
| Git commit | **NOT performed** |

---

## 11. Known limitations (after Phase 2)

1. No Portal UI — API only; Phase 3 required for inbox/compose/detail views.
2. Live Hostinger IMAP/SMTP not verified in this session.
3. `seed:menu` for `leads.email` not re-run (menu DB may still show old `viewResource=lead`).
4. Pre-existing monorepo typecheck failure (`api-fetch.ts`) blocks full `pnpm typecheck` / build.
5. `ChatMessage.seq` drift (Int vs bigint) from Phase 1 still unresolved — unrelated to Email.
6. No attachment handling (locked out of scope).
7. No HTML sanitization in backend (Phase 3 portal display layer).

---

## 12. Prerequisites before Phase 3

1. Phase 2 backend API complete and tested (this report).
2. Optional: run `pnpm --filter @medcal/db seed:menu` to activate Email menu entry in DB.
3. Optional: live IMAP/SMTP test with Hostinger credentials in local `.env`.
4. Phase 3 scope: Portal pages under `apps/portal/src/app/management/email/`, HTML sanitization, Suggested Lead UI.
5. Do not start Phase 3 until explicitly instructed.

---

## 13. Git status (saat laporan ini ditulis)

```
 M apps/api/package.json
 M apps/api/src/app.module.ts
 M apps/api/src/common/guards/company-role.guard.ts
 M apps/api/src/modules/leads/leads.controller.ts
 M apps/api/src/modules/leads/leads.module.ts
 M apps/api/src/modules/me/me.controller.ts
?? apps/api/src/common/decorators/membership-role.decorator.ts
?? apps/api/src/common/decorators/user-id.decorator.ts
?? apps/api/src/modules/emails/
 (+ Phase 1 files still uncommitted)
```

Branch: `main`. Tidak ada commit Phase 2.

---

## 14. Konfirmasi locked constraints

- tidak ada automatic Lead assignment
- tidak ada automatic Lead creation
- IMAP sync manual only (`POST /emails/sync`)
- tepat empat Email permissions
- SMTP tetap di `packages/notifications`
- tidak ada attachments
- tidak ada production deployment
- tidak ada Portal UI

---

**Phase 2 COMPLETE.**  
**Jangan mulai Phase 3 sampai diinstruksikan.**

*Document: PHASE-2-IMPLEMENTATION-REPORT*  
*Last updated: 20 Agustus 2026*
