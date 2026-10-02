# Lead / Contact Message Flow — Comprehensive Forensic Audit

| | |
|---|---|
| **Date** | 2026-10-02 |
| **Repo HEAD** | `b8b7cff` (branch `main`) |
| **Mode** | AUDIT ONLY — no code, schema, route, config, deployment, test, or git changes were made |
| **Scope IN** | Message ingestion (web + email/IMAP), Lead/ContactMessage persistence, registration-origin, application-level notification dispatch, Contact Message UI update mechanism, Management Leads UI, `/leads` routing |
| **Scope OUT** | FCM / Firebase Cloud Messaging (token registration, `firebase-admin`, service worker, `notificationclick`, device push delivery). Marked **OUT OF SCOPE — FCM** where encountered |
| **Evidence labels** | **CONFIRMED** = directly supported by source/config/history · **PROBABLE** = strong inference, not runtime-proven · **UNKNOWN** = needs runtime/log/production evidence |
| **Secrets** | Only variable *names* and "configured / not configured" appear in this report. No secret values are reproduced |

---

## 1. Executive Summary

**Overall status: PARTIALLY OPERATIONAL — the web-originated flow is wired end-to-end; the email-originated flow does not exist as a Lead/Contact Message flow.**

1. **Website → Contact Message → Lead → Management UI is wired end-to-end in source** (contact form, WhatsApp lead, web chat, chat session). Persistence, application-level notification dispatch and a Socket.IO "new message" signal to the Management UI all exist. **No BLOCKER was confirmed.** Whether it works in production is **UNKNOWN** (live env, nginx install state, role grants and runtime logs were not available).
2. **Email → IMAP → Contact Message → Lead → UI does not exist.** IMAP ingestion only writes `Email` rows (`leadId = null`, optional `suggestedLeadId`). It never creates a `Lead` or a `ContactMessage`, never raises a notification, never emits a realtime event, and shows no badge. It runs **only** when a user clicks "Synchronize Inbox" (`POST /emails/sync`); there is no scheduler. Each run re-reads only the **last 50** INBOX messages with no cursor, so a backlog > 50 is permanently skipped. This is documented as "by design" in an earlier audit, but it contradicts the end-to-end flow this audit was asked to validate (Scenario B).
3. **Existing-Lead follow-up (Scenario C) works only when phone AND organization both match** (`lead-matching.ts:63`). Email-only matches are classified POSSIBLE → the message is persisted with `leadId = null` (an "orphan" awaiting Needs Review). Chat/web-chat never send phone/organization, so every repeat from a known email becomes an orphan.
4. **Registration-origin is not a Lead/Message concept.** In this codebase it is the HTTP `Origin` header of `/sign-up/email`, mapped transiently to `INTERNAL_STAFF | CUSTOMER_PORTAL | null` for signup policy. It is persisted nowhere. A Lead/ContactMessage "registration-origin" does not exist; the nearest concept is `ContactMessage.getFrom` (channel), which is *not* copied to `Lead`.
5. **`/leads` 404:** the routing mechanism is real in source but narrower than previously claimed, and the earlier "bell prefetch" theory is weakened. It is **independent** of ingestion, persistence, dispatch and realtime. The actual observed 404 remains **UNKNOWN**.
6. **Top reliability risks:** unhandled-promise-rejection paths that can crash the API / public web-api process (PROBABLE crash), a 50-message IMAP window, no idempotency on public POSTs, non-atomic contact-form path, and real-looking credentials in git-tracked `.env*.example` files.

**Severity totals:** BLOCKER **0** · HIGH **4** · MEDIUM **12** · LOW **10**.

---

## 2. Actual Architecture / Flow Diagram

```text
                    ┌──────────────── WEB CHANNELS (IN SCOPE) ────────────────┐
Visitor browser ──► apps/web  ──► apps/web-api  (Express 4, :3002)
                              │   • per-channel express-rate-limit (in-memory)
                              │   • reCAPTCHA v3 (fail-closed if secret unset)
                              │   • x-internal-secret + COMPANY_ID from env
                              ▼   fetch(API_URL/internal/...)  — no timeout/retry/idempotency key
                    apps/api (NestJS, :3001)
                      POST internal/contact-messages  ─┐
                      POST internal/chat-sessions ─────┤ (chat: ONE prisma.$transaction)
                                                       ▼
        ContactMessagesService.create()  (contact-messages.service.ts:76-204)
          validate → topic check → Customer match → findLeadMatchCandidates()
             STRONG(1)  → attach leadId
             POSSIBLE   → leadId = null (orphan → Needs Review)
             NONE       → lead.create  → contactMessage.create   (NOT atomic on this path)
                                                       │ (after write; only when tx === prisma)
              ┌────────────────────────────────────────┴───────────────────────────┐
              ▼                                                                      ▼
  void notifyNewContactMessage()                                   publishContactMessageCreated({companyId})
  (no .catch; no persistence;                                      process-local EventEmitter
   recipients = UserMembership.receiveNotifications)                     │
   → NotificationDispatchService                                          ▼
   → [OUT OF SCOPE — FCM]                                   ChatGateway.afterInit (chat.gateway.ts:91-95)
                                                            io.to(company room).emit("contact_message_created")
                                                            (room join requires chat:read)
                                                                          ▼
                                                   apps/portal  management-chat-socket.tsx (websocket only)
                                                   → notifyContactMessagesChanged()
                                                   → management-shell.tsx invalidates React Query keys
                                                   → Leads UI refetch  (GET /contact-messages, /statistics, lead detail)

                    ┌──────────────── EMAIL CHANNEL (IN SCOPE) ───────────────┐
Staff clicks "Synchronize Inbox" ──► POST /emails/sync  (manual only; no cron/worker/IDLE)
   → imap-client.ts (node-imap, INBOX, search ALL, last 50 UIDs, full RFC822) → mailparser
   → ImapSyncService: prisma.email.create (dedup: Message-ID unique) + suggestedLeadId (exact normalized email, single match)
   ✗ no Lead   ✗ no ContactMessage   ✗ no notification   ✗ no realtime event   ✗ no badge
   → staff manually PATCH /emails/:id {leadId}  (associateLead)

                    ┌──────────────── ROUTING ───────────────┐
Browser /leads ─► nginx apps.* (:3003, Host preserved) ─► apps/portal src/proxy.ts
   host apps.*   → rewrite /management/leads  (EXISTS)
   host portal.* → rewrite /client/leads      (DOES NOT EXIST → 404)
   other host    → DEV_DEFAULT_HOST_GROUP (default management)
API calls: NEXT_PUBLIC_API_URL (separate origin, no /api prefix) — never pass through the Next router
```

Key runtime facts: one `api` container (`docker-compose.prod.yml`, `restart: unless-stopped`); Socket.IO shares the REST HTTP server; no Redis adapter; no queue; no scheduler for email.

---

## 3. IMAP Audit

### 3.1 Connection (CONFIRMED)
- Library: `imap@^0.8.19` (node-imap) + `mailparser@^3.7.2`, lazily `require()`d in `apps/api/src/modules/emails/imap-client.ts:33-34`.
- Config (names only): `IMAP_HOST`, `IMAP_PORT` (default 993), `IMAP_TLS` (default true), `IMAP_USER`, `IMAP_PASS`, `IMAP_TLS_REJECT_UNAUTHORIZED` (default true); declared in `packages/config/src/index.ts:23-37`. `COMPANY_ID` selects the target company. Missing `IMAP_HOST|USER|PASS` → HTTP 503 `EMAIL_NOT_CONFIGURED`.
- Timeouts: `connTimeout` 30 s, `authTimeout` 15 s (`imap-client.ts:36-47`). **No overall/fetch-phase timeout** → a stall mid-fetch hangs the HTTP request until the library errors (node-imap defaults UNKNOWN).

### 3.2 Trigger / scheduling (CONFIRMED)
- Only trigger: `POST /emails/sync` (`emails.controller.ts:57-62`), called only by the "Synchronize Inbox" button (`email-page-client.tsx:83,119,189`; mutation `use-emails-query.ts:222-241`). No `refetchInterval`, no auto-sync on page load.
- Repo-wide search of `apps/` finds **no** `ScheduleModule`, `@Cron`, `@Interval`, IDLE, queue or worker for email; the only `setInterval` is the 60 s permission-cache refresh (`main.ts:34`). The earlier audit states the same ("Manual IMAP sync only … No cron/worker", `docs/cursor/plan/email-managements/FINAL-FORENSIC-AUDIT-REPORT.md:476`).
- The route requires only `email:read`, a low bar for an operation that calls an external server and writes rows.
- Header Email icon has no unread badge (`header-controls.tsx:47-53`).

### 3.3 Ingestion pipeline (CONFIRMED)
| Step | Where | Behavior |
|---|---|---|
| Connect/open | `imap-client.ts:59+` | `openBox("INBOX", true)` read-only; mailbox hard-coded; flags never changed |
| Select | `:68` | `search(["ALL"])` → `results.slice(-50)` (`SYNC_LIMIT = 50`, `:21`) |
| Fetch | `:138-145` | `fetch(uids, { bodies: "", struct: true })` full body every time |
| Parse | `:82-128` | `simpleParser`; attachments parsed in memory and **discarded**; no size cap; HTML stored raw (sanitized at render, `email/[id]/page.tsx:9,199`) |
| Extract | `:157-164` | first `from`/`to` mailbox only; `toEmail` falls back to `IMAP_USER`; CC list joined; BCC never captured; `receivedAt = parsed.date ?? now` (Date header, not INTERNALDATE) |
| Dedup key | `:91-93` | RFC `Message-ID`, else `uid-${uid}` |
| Persist | `imap-sync.service.ts:55-108` | per-message `prisma.email.create` (no transaction/batch); `status UNREAD`, `leadId null`, `suggestedLeadId` |
| Cursor | — | **None** (no UIDVALIDITY, last-UID, SINCE/UNSEEN, or persisted sync state) |

### 3.4 Idempotency (CONFIRMED)
- `Email.messageId String? @unique` (`Email_messageId_key`, migration `20260820121500_add_email_system`) + app pre-check per company + `P2002` catch counted as duplicate (`imap-sync.service.ts:63-66,101-104`). Safe for repeated/concurrent syncs.
- The unique index is global while the pre-check is per-company: safe only because deployment is single-tenant.
- Duplicate protection covers only `Email`; there is nothing to deduplicate for Lead/ContactMessage/notification/push because none are produced.

### 3.5 Failure handling
| Failure | Actual | Label |
|---|---|---|
| Connect/auth/timeout/search/fetch error | rejects → logged (`IMAP sync failed: <msg>`) → generic 502 `IMAP_SYNC_FAILED`; UI shows generic "Gagal menyinkronkan inbox." No retry/backoff | CONFIRMED |
| Mid-fetch stall | no overall timeout; request hangs | CONFIRMED (absence) / behavior UNKNOWN |
| Malformed MIME | per-message catch, warning log, message omitted; not counted in result counters (`skippedMalformed` counts empty-sender + persist errors only); re-attempted each sync while within last 50 | CONFIRMED |
| Empty `fromEmail` | silently skipped every sync (`imap-sync.service.ts:56-59`) | CONFIRMED |
| Non-P2002 persist error | logged, counted `skippedMalformed`, retried next sync if still in window | CONFIRMED |
| DB error in `findFirst`/`findSuggestion` | uncaught → 500, aborts loop, keeps rows already created | CONFIRMED |
| Concurrent syncs | no lock/mutex; each opens its own IMAP connection; protected only by unique index | CONFIRMED |
| Process restart | no in-memory state → nothing lost, nothing resumed (no catch-up/startup sync) | CONFIRMED |

### 3.6 Permanent-loss / duplicate paths (from code; no tests cover them)
1. **Backlog > 50 between manual syncs is never fetched** (CONFIRMED by code; occurrence depends on mailbox volume — UNKNOWN).
2. `permanentDelete` of an INBOX email hard-deletes the row (`emails.service.ts:475-484`) → next sync re-ingests it if still in the last 50 (CONFIRMED mechanism).
3. `uid-N` fallback key is globally unique but UIDVALIDITY changes can reuse UIDs → a new message may be dropped as "duplicate" (PROBABLE; only when Message-ID is absent).
4. Self-sent mail BCC'd/copied to INBOX with the same Message-ID would be dropped as duplicate (PROBABLE; depends on SMTP-returned ID equality — UNKNOWN).
5. Performance: `LeadSuggestionService.findSuggestion` loads **all** company Leads per message (`lead-suggestion.service.ts:22-25`) → up to 50 full scans per sync.

### 3.7 Production config (names only)
- `IMAP_*` and `SMTP_*` are documented in `.env.example:110-130` and `.env.production.example:247-267`; `docker-compose.prod.yml:50-51` loads `.env.production` into `api`. All documented IMAP vars are read by code; mailbox name, window size and interval are hard-coded (not configurable).
- `.env.production.example`: `IMAP_PASS` (line ~257) and `SMTP_PASS` (~265) appear **without `=`** — if copied verbatim the variable is unset (LOW; likely placeholder).
- No pm2/systemd/GitHub-workflow/scheduler config references IMAP. The live `.env.production` was not available (UNKNOWN whether IMAP is configured in production).
- Test coverage (`imap-sync.service.test.ts`): covers persist, dedup, empty sender, 502 mapping. **Not covered:** `imap-client.ts` fetch/parse, window limit (title claims it; nothing asserts it), concurrency/P2002 race, non-duplicate persist errors, DB failure mid-batch, missing-config 503, `uid-N` key, permanent-delete re-ingest. The "no secret leak" test does not assert absence of the secret.

---

## 4. Lead & Contact Message Persistence Audit

### 4.1 Entry points that create ContactMessage / Lead (CONFIRMED)
| Channel | Public route (web-api `index.ts`) | Internal route (API) | `getFrom` | Creates |
|---|---|---|---|---|
| Contact form | `POST /public/contact-messages` (:153) | `POST internal/contact-messages` | `CONTACTFORM` (server-set) | Message (+Lead if NONE) |
| WhatsApp lead | `POST /public/whatsapp-lead` (:236) | same | `WHATSAPP` (server-set, fixed text) | Message (+Lead) |
| One-shot web chat | `POST /public/web-chat` (:194) | same | `CHAT_PERSON` | Message (+Lead) — **no caller in `apps/web`** (legacy/unused) |
| Chat session | `POST /public/chat-sessions` (:281) | `POST internal/chat-sessions` | — | ChatSession + ChatMessage + Message + Lead in **one `$transaction`** |
| Staff resolution | — | `PATCH /contact-messages/:id/lead` (ATTACH / CREATE_NEW) | — | links / creates Lead |
| Lead→Customer | — | `POST /leads/:id/convert` (one `$transaction`) | — | Customer (not Lead) |
| **Email** | — | — | `EMAIL` enum exists, **never written** | **Nothing** |

Guards: `InternalServiceGuard` compares `x-internal-secret` with `INTERNAL_API_SECRET` and derives `companyId` from `COMPANY_ID` only. Validation runs twice (web-api schema, then `contactMessageCreateSchema` in the service). `contactMessageCreateSchema` has no message max length; web-api caps 5000.

### 4.2 Matching rules (`lead-matching.ts`, CONFIRMED)
- Normalizers: email trim+lowercase; phone digits-only with leading `0`→`62`; organization trim+lowercase+collapse spaces.
- **STRONG = phone AND organization match** (`:63`). **POSSIBLE = any one of phone / org / email** (`:65`). Exactly one STRONG → attach. Multiple STRONG → degrade to POSSIBLE. Any other non-empty set → POSSIBLE. Empty → NONE → create Lead.
- POSSIBLE → `leadId = null` (`contact-messages.service.ts:159-160`); candidates recomputed at read time for Needs Review (`leads.service.ts:144-162`).
- Matching loads **every** Lead of the company in memory (`lead-matching.ts:53`).
- Customer match (`matchStatus`, `matchedCustomerId`) is a separate concern using `CustomerContact.email` (exact, then non-public domain).

Answers to the required questions:
1. *Lead created when?* Only on NONE (no overlapping Lead on any signal) or staff CREATE_NEW.
2. *ContactMessage created when?* Every accepted web submission and every first chat message.
3. *Many messages per Lead?* Yes (1-to-N, migration `20260815173840_lead_contact_message_1_to_n`).
4. *Existing Lead identified by?* phone+organization (STRONG) only.
5. *New Lead identified by?* No overlap on phone, org **or** email.
6. *Email matching?* Normalized lowercase equality; only produces POSSIBLE.
7. *Match fails?* NONE → new Lead.
8. *Ambiguous?* POSSIBLE → orphan message, no new Lead, staff must resolve.
9. *Same message twice?* Not deduplicated on web channels (see M-04). Chat messages: `@@unique([sessionId, clientMessageId])` + P2002 handling.
10. *Transactions?* Chat session: single `$transaction`. Contact form/WhatsApp/web-chat: **none** (`tx = prisma`, separate statements).

### 4.3 Schema (CONFIRMED)
- `ContactMessage` (schema.prisma ~820-861): `leadId?` nullable, FK `ON DELETE SET NULL` (deleting a Lead orphans its messages); indexes `[companyId,createdAt|email|status|getFrom]`, `[leadId]`; **no unique constraint on any identity field**; `phoneNormalized` stored but unused by matching; `confirmedByUserId/confirmedAt` and MatchStatus `CONFIRMED_EXISTING/DISMISSED` are never written.
- `Lead` (~904-927): identity snapshot only (`name,email,phone,organizationName`); indexes `[companyId,status]`, `[companyId,createdAt]` only — **no email/phone index, no uniqueness**; no channel/origin field; snapshot never updated after creation.
- `ChatSession.contactMessageId @unique` (1 session ↔ ≤1 message). `ChatMessage.seq` was later altered BIGINT→INT (`20260823045950_add_tax_master`); comment in `chat-serialization.ts:3-9` is stale.

### 4.4 Concurrency / integrity (see §12)
- Check-then-create under READ COMMITTED with no unique index → concurrent first submissions can create duplicate Leads (**PROBABLE**).
- `resolveLeadMatch` CREATE_NEW creates the Lead first, then a `leadId: null`-guarded `updateMany`; count 0 → deletes the new Lead; a crash between steps leaves an orphan Lead. The compare-and-set itself is atomic (double-resolve → `CONTACT_MESSAGE_ALREADY_LINKED`).
- `convertToCustomer`: transactional, but no row lock/unique on `Lead.customerId`; duplicate-email/tax-ID checks are check-then-create. Converting does not touch the Lead's messages; a CONVERTED Lead can still receive STRONG matches.

---

## 5. Registration Origin Audit

**Definition (CONFIRMED):** "registration-origin" = the `Origin` header of a Better Auth `/sign-up/email` request, converted by `resolveRegistrationContext` (`packages/shared/src/utils/index.ts:43-90`) to `INTERNAL_STAFF | CUSTOMER_PORTAL | null`.

| Lifecycle step | Where |
|---|---|
| Detected | HTTP `Origin` header |
| Normalized | `apps.` → INTERNAL_STAFF; `portal.`/`customer.` → CUSTOMER_PORTAL; `localhost`/`127.0.0.1` → by `DEV_DEFAULT_HOST_GROUP` (`"client"` → CUSTOMER_PORTAL, else INTERNAL_STAFF); any other host (incl. `technician.`, apex, `evil.com`) → `null` |
| Enforced | `registration-origin.hook.ts:41` (`@BeforeHook("/sign-up/email")`) and `registration-gate.hook.ts` (`@BeforeCreate("user")`), shared policy `registration-gate.ts:49-64`; null → `ORIGIN_NOT_ALLOWED`; CUSTOMER_PORTAL → allowed for any domain; INTERNAL_STAFF → exact `kalibrasimedika.co.id` domain + ACTIVE `EmailWhitelist` row |
| Persisted | **Nowhere.** No origin/context field on `User`, `EmailWhitelist`, `Lead`, `ContactMessage` (repo-wide grep: only docs/tests/comments) |
| Exposed via API | Not exposed |
| Consumed by UI/business logic | Not consumed beyond the signup gate |

**Findings**
- **Terminology gap (CONFIRMED):** a "registration-origin preserved on Lead/Contact Message" does not exist. The lead's channel is `ContactMessage.getFrom` (enum `CONTACTFORM|WHATSAPP|CHAT_AI|CHAT_PERSON|EMAIL`) and is **not** copied to `Lead`; a Lead's first channel is derivable only by reading its earliest message.
- **No link from User to Lead/ContactMessage (CONFIRMED):** Lead→Customer conversion creates a Customer, not a User; portal linking goes through `CustomerUserLink`. Origin cannot be recovered after signup.
- **Competing/duplicated definitions (CONFIRMED):** host prefixes are duplicated in `apps/portal/src/proxy.ts:3-4` (matches `Host`) and `resolveRegistrationContext` (matches `Origin`); sync is by convention only (drift risk, LOW). "origin" also means CORS (`TRUSTED_ORIGINS`, `CHAT_WIDGET_ORIGINS`) — unrelated. `GetMessageFrom`/`ContactStatus`/`LeadStatus` are duplicated as Prisma enums, zod literals and UI string constants (mismatch risk; none found today).
- **Caller guard:** `registration-origin-callers.test.ts` scans for `signUpEmail` calls lacking Origin; `bootstrap-superadmin.ts:108-121` sets Origin explicitly.
- Origin can be: *missing* (non-browser caller without Origin → null → rejected, by design); *incorrect* (any unknown host → rejected); *overwritten/lost on conversion* — N/A because never stored.

---

## 6. Notification Dispatch Audit (application level; FCM OUT OF SCOPE)

| Question | Finding | Label |
|---|---|---|
| Trigger | `ContactMessagesService.create` when `tx === prisma` (`:198-201`); `ChatSessionsService.createSession` after commit (`chat-sessions.service.ts:98-101`) | CONFIRMED |
| Emission style | `void this.notifyNewContactMessage(...)` — fire-and-forget, **no `.catch`** (`:199`) | CONFIRMED |
| Receiver | `NotificationDispatchService.sendToCompanyRecipients` (`notification-dispatch.service.ts:79`) | CONFIRMED |
| Recipient resolution | users with `UserMembership.receiveNotifications = true` and ACTIVE status (`notification-recipient.service.ts:33-49`); explicitly "separate from RBAC" → **no permission check** (a non-reader can receive sender name/topic/120-char preview) | CONFIRMED |
| Opt-in | `receiveNotifications` default false (`schema.prisma:684`); set true on device token registration (`push-tokens.service.ts:~45`) or by `membership:manage` | CONFIRMED |
| Payload | `push.formatContactMessagePush`: title "Pesan Baru dari {sender}", body "{topic}: {preview ≤120}", data `CONTACT_MESSAGE_NEW`, `contactMessageId`, `leadId`, `companyId` | CONFIRMED |
| Persisted state | **No notification record/outbox.** Only `FCMToken` rows are touched downstream (OUT OF SCOPE — FCM) | CONFIRMED |
| Sync/async, queue, retry | async fire-and-forget; no queue; no retry | CONFIRMED |
| Idempotency | none; duplicates only if duplicate messages are created | CONFIRMED |
| Failure effect on persistence | none (runs after writes), **but** a rejected promise is unhandled (see F-03) | CONFIRMED / crash PROBABLE |
| Missing service | if `notificationDispatch` not injected the method silently returns (`:211-213`) | CONFIRMED |
| Lead assignment | `LeadsService.assignToUser` **awaits** `sendToUsers` inline after the update (`leads.service.ts:202-220`) → recipient/token-lookup throw → 500 after assignment persisted | CONFIRMED |
| Other channels | `contact.formatContactAck` has **no callers** (no acknowledgement to the visitor); no staff email/WhatsApp notification on new leads; `email.sendEmail` only for staff-composed mail | CONFIRMED |
| Email-originated | **No notification of any kind** | CONFIRMED |

---

## 7. Contact Message Push / UI Update Audit

**Mechanism (CONFIRMED): Socket.IO over the API's HTTP server, signalling React Query invalidation.** It is *not* FCM, SSE or polling.

```text
create() → publishContactMessageCreated({companyId})        contact-message-events.ts (in-process EventEmitter)
        → ChatGateway.afterInit listener                      chat.gateway.ts:91-95
        → server.to(roomForCompany).emit("contact_message_created", {companyId})
        → management-chat-socket.tsx:154-162  (websocket transport only, withCredentials)
        → notifyContactMessagesChanged()                      lib/contact-messages-sync.ts:8-11
        → management-shell.tsx:58-73 invalidates ["contact-messages-statistics"], ["contact-messages"], [LEAD_DETAIL_QUERY_KEY] (refetchType:"all")
```

| Question | Answer |
|---|---|
| Discovery latency | near-immediate while the socket is connected; **no polling fallback** (other portal pages poll at 6 s; Leads does not) |
| Endpoints | `GET /contact-messages`, `/contact-messages/statistics`, `/contact-messages/unread-count`, `/chat-sessions/unread-count`, `/leads/needs-review`, `/leads/:id` |
| Triggers | socket event; mount (`refetchOnMount:"always"`); mutations |
| Caching | global `staleTime 15 s`, `refetchOnWindowFocus:false` (`providers.tsx:45-48`); topics 5 min |
| Tab backgrounded | socket normally stays up; desktop OK; mobile/suspended sockets miss events; no `visibilitychange`/focus refetch |
| Network interruption | Socket.IO client auto-reconnects and re-joins, **but no catch-up refetch on reconnect** → events fired during the gap are lost until reload/remount/stale refetch |
| Browser refresh | full refetch — the only complete recovery path |
| Can messages be missed? | **Yes** (reconnect gap; roles without `chat:read`; server-initiated disconnect — `socket.disconnect(true)` on auth failure is not auto-reconnected) |
| Duplicates? | No client-side duplication (list is server-authoritative); offset-pagination row shift possible across pages |
| Pagination | offset (`skip/take`, id tie-breaker; max 100); a new row while on page ≥ 2 can repeat/skip rows; no cursor |
| Auto-recovery | partial (transport reconnect only) |

**Room-join permission mismatch (CONFIRMED in code; impact UNKNOWN):** the gateway joins the company room only when `requireChatPermission(role,"read")` passes (`chat.gateway.ts:124-129`), while list data requires `contactMessage:read` and UI visibility (bell/menu) requires `lead:read` (`header.tsx:45`, `seed-menu.ts:56-60`). A role with `contactMessage:read`/`lead:read` but not `chat:read` sees data but gets **no live updates**. Real grants are DB-driven (`RolePermission`) → UNKNOWN.

**Single-process (CONFIRMED):** the emitter and Socket.IO server have no cross-instance bridge; fine with one `api` container, breaks if scaled.

**Unread count (CONFIRMED):** `countUnread = count(status = PENDING)` per company, global (no per-user read state). `useUnreadCount` is a plain `useState/useEffect` fetch (not React Query), refreshed only on mount and on the bus; `.catch(() => setCount(0))` resets the badge to **0 on any error** (network/401/403 indistinguishable from "no unread").

Email: **no event, no badge** (see §3.2).

---

## 8. Management Leads UI Audit

- **Backend origin (CONFIRMED):** `apiFetch` = `${NEXT_PUBLIC_API_URL}${path}`, `credentials:"include"` (`packages/shared/src/http/api-fetch.ts:19-25`). `NEXT_PUBLIC_API_URL` is a docker **build arg** (`docker-compose.prod.yml:142`) — baked at image build. No `/api` prefix assumptions anywhere (`main.ts` has no `setGlobalPrefix`; nginx `api.*` proxies `/` unchanged). Cross-origin cookie auth requires `TRUSTED_ORIGINS` and `COOKIE_DOMAIN`.
- **Endpoints used:** listed in §7 plus mutations `PATCH /contact-messages/:id/status`, `PATCH /leads/:id/status`, `PATCH /contact-messages/:id/lead`, `POST /leads/:id/convert`, `GET /leads/:id/emails`, `GET /contact-topics` (public), `GET /menu/nav?application=MANAGEMENT`. `GET /leads` exists but is **unused** by the UI.
- **Schemas (CONFIRMED):** list response `{data,page,pageSize,total,totalPages}` matches `ContactMessageListResponse`; row shape matches Prisma include; enums match `schema.prisma:63-76`. No mismatch found.
- **States:** first-load skeleton only (`isLoading`); later fetches dim the table. 403 → `<AccessDenied/>`; any other error → text "Gagal memuat daftar pesan." with **no retry button**; an invalid manual `?status=` → 400 → same generic error; statistics/needs-review/topics errors are silently ignored. Empty state text present. Lead detail handles 404/403 separately.
- **Orphan messages not openable (CONFIRMED):** `getContactMessageDetailHref` returns `null` for a non-chat message with `lead: null` (`leads-ui.tsx:93-102`) — Needs Review rows stay PENDING (and counted) until resolved.
- **Needs Review staleness (CONFIRMED):** `["leads-needs-review"]` is not invalidated by `contact_message_created`; a new POSSIBLE-match orphan appears in the list/stats but not in the accordion until remount + 15 s stale.
- **Needs Review load (CONFIRMED):** `findNeedsReview` loads all `leadId:null` messages and does per-message candidate lookups (N+1; unbounded).
- **Mark-read:** PENDING→READ via status PATCH, lead detail auto-mark on open, or chat `markRead`. `updateStatus` non-READ update lacks `companyId` in `where` after a company-scoped `findFirst` (LOW, not exploitable).

---

## 9. `/leads` Routing Audit

### 9.1 What the source says (CONFIRMED)
- `apps/portal/src/proxy.ts:18-30` (Next 16 `proxy`; no `middleware.ts` has ever existed): host starts `apps.` → `management`; `portal.` → `client`; otherwise `DEV_DEFAULT_HOST_GROUP === "client" ? client : management` — **not gated by `NODE_ENV`** (the production example's comment says "Ignored in production"; code does not ignore it). It then `NextResponse.rewrite`s to `/${group}${pathname}` (browser URL stays `/leads`). Matcher excludes `_next`, `favicon.ico`, manifests, `firebase-messaging-sw.js`, `sign-in`, and static extensions.
- App tree: only `app/management/leads/{page,leads-page-client,leads-ui,use-contact-messages-query}` and `[id]/page.tsx`. **No `app/client/leads`.** `next.config.js` has no rewrites/redirects/basePath. `app/client` contains only `layout.tsx` and `page.tsx`.
- All links use the *visible* path `/leads`: `header-controls.tsx:28`, `management/page.tsx:55`, `leads-ui.tsx:99`, `leads-page-client.tsx:187`, `email/[id]/page.tsx:343,370,434`, `leads/[id]/page.tsx:181,192,205`, DB menu `seed-menu.ts:56`. No link to `/management/leads` in code.

| Request | Host | Result |
|---|---|---|
| `/leads` | `apps.*` (prod) / `apps.localhost:3003` | → `/management/leads` → page renders (after client session/nav load) |
| `/leads` | plain `localhost`/`127.0.0.1` | works unless `DEV_DEFAULT_HOST_GROUP=client` → Next 404 |
| `/leads` | `portal.*` / `portal.localhost` | → `/client/leads` → **404** (by design: leads is management-only) |
| `/management/leads` typed in browser | any | → `/management/management/leads` (or `/client/management/leads`) → **404** — internal source path, not a URL |
| `/leads` (API, `api.*` origin) | `api.*` | NestJS `LeadsController` — unrelated to Next routing |

### 9.2 Re-verification of the earlier claim (`docs/claude/lead-management/investigate-the-recurring-404-drifting-pumpkin.md`, commit `45ba97c`, 2026-09-20)
- **Supported by source:** `/client/leads` does not exist; proxy would send `portal.*`/`client`-default requests there; asymmetry has existed since `6288ba9` (leads) vs `e931597` (proxy), no `proxy.test` assertion for client-group existence.
- **Weakened by source:** the theory that the *global header bell prefetch* generates the 404 on unrelated tasks. The bell renders only inside `ManagementShell` (`app/management/layout.tsx`); a prefetch from a management page carries the same `Host`, so it resolves to the same `management` group. A 404 needs a `portal.*` host or `DEV_DEFAULT_HOST_GROUP=client`. `portal.*` has no nginx server block (`infra/nginx/apps...conf.example:2-4`, `api...conf.example:111-114`). The `client` layout renders no bell.
- **Second contributor (UNKNOWN):** nginx configs exist only as `*.conf.example` marked "NOT YET APPLIED"; whether installed on the VPS is unknown. If `apps.*` isn't proxied with `Host $host` preserved (the file notes this is load-bearing), the group would fall to the default.
- **Verdict:** the routing mechanism is CONFIRMED to exist; **the actual runtime 404 is UNKNOWN** — it needs the failing request's `Host` header, the deployed `DEV_DEFAULT_HOST_GROUP`, nginx install state and a server log line.

### 9.3 Coupling to the lead flow
`/leads` routing is a Next.js page-level concern on the portal host. API traffic goes to a different origin (`NEXT_PUBLIC_API_URL`) and never passes through `proxy.ts`. Therefore it is **independent of** ingestion, persistence, notification dispatch and the Socket.IO push (CONFIRMED). It can interfere only with *opening the Leads page* (UI navigation), not with message creation or the realtime signal.

---

## 10. End-to-End Scenarios

### Scenario A — Website visitor → Contact Message → Lead → Management UI
| Arrow | Actual code | Failure behavior |
|---|---|---|
| Visitor → website form | `apps/web` → `POST {NEXT_PUBLIC_WEB_API_URL}/public/contact-messages` | network error: client-side only |
| web-api gate | rate limiter (in-memory, default 5/60 s/IP), `COMPANY_ID` present, zod, `verifyRecaptcha` (`recaptcha.ts:17-41`) | missing `RECAPTCHA_SECRET_KEY` → every submission fails closed; **network exception in Google `fetch` is outside try/catch** inside an async Express 4 handler → request hangs / unhandled rejection (F-03) |
| web-api → API | `fetch(API_URL/internal/contact-messages)` with `x-internal-secret`; no timeout/retry/idempotency | upstream 5xx/timeout after success → client retry duplicates (M-04) |
| API validation/guard | `InternalServiceGuard`, `contactMessageCreateSchema`, topic active check | 400/500 `COMPANY_NOT_CONFIGURED` if `COMPANY_ID` wrong |
| Persist | `create()`: Customer match, Lead match, `lead.create` then `contactMessage.create` (not atomic) | failure of 2nd → orphan Lead (M-02); concurrent → duplicate Lead (M-03) |
| Notification | `void notifyNewContactMessage` | silently dropped if no dispatch service/Firebase/tokens; rejection unhandled (F-03) |
| UI signal | `publishContactMessageCreated` → Socket.IO | missed on reconnect gap / role lacking `chat:read` (M-05, M-06) |
| UI | invalidation → refetch `GET /contact-messages` | stale needs-review accordion (M-07) |
**Result:** wired and functional in source; production behavior UNKNOWN.

### Scenario B — Incoming email → IMAP → Contact Message → Lead → UI
| Arrow | Actual | Result |
|---|---|---|
| Email → mailbox | external | — |
| IMAP fetch | only when staff clicks Sync; last 50 UIDs | **missed if nobody clicks / backlog > 50** (F-02) |
| Parser | mailparser | per-message skip on malformed MIME |
| Persist | `Email` row only (`leadId:null`, `suggestedLeadId` when exactly one exact-email Lead match) | **No Contact Message, no Lead** (F-01) |
| Notification | none | — |
| UI update | none (no event, no badge) | staff must open Email page and associate manually (`PATCH /emails/:id {leadId}`) |
**Result:** this flow does not exist as specified. Email is a separate inbox with optional manual Lead association.

### Scenario C — Existing Lead receives another message
| Step | Actual |
|---|---|
| Identify Lead | phone **and** organization both equal → STRONG, attach to same Lead (no duplicate Lead) |
| Email-only / phone-only / org-only match | POSSIBLE → `leadId = null` orphan; no new Lead (duplicate Lead avoided, but message not attached) |
| Chat / web-chat repeat | no phone/org sent → always POSSIBLE → orphan |
| Contact form repeat missing phone or org | POSSIBLE → orphan |
| Multiple STRONG candidates | POSSIBLE → orphan |
| Notification / UI | same as Scenario A; the orphan appears in the list and, after remount, in Needs Review |
**Result:** a duplicate Lead is *not* created in these paths (only in a race, M-03), but "same Lead" attachment happens only on full phone+org identity (M-01).

---

## 11. Failure Matrix

| Failure | Expected | Actual | Evidence | Severity |
|---|---|---|---|---|
| IMAP unavailable | clear error; retry later; no data loss | 502 `IMAP_SYNC_FAILED`; generic UI toast; manual retry; nothing lost (idempotent) except >50 backlog | `imap-sync.service.ts:38-47` | MEDIUM (coupled with F-02) |
| IMAP authentication failure | actionable config alert | same 502; underlying cause only in logs (node-imap message logged verbatim — content UNKNOWN) | `imap-sync.service.ts:45` | MEDIUM |
| Malformed email | skip, count, alert | skipped silently (warning log); not counted in result | `imap-client.ts:119-125` | LOW |
| Duplicate email | skip | P2002/pre-check → counted `duplicates`; safe | `imap-sync.service.ts:63-66,101-104` | — (OK) |
| DB failure (email) | rollback/clean error | uncaught → 500, partial rows kept | `imap-sync.service.ts:63,73` | MEDIUM |
| DB failure (web path) | message not accepted; client can retry | 5xx surfaced; web-api echoes; retry may duplicate if first write committed | `index.ts` forwards | MEDIUM |
| Lead creation failure | whole submission fails | contact form: error before message create → nothing persisted (OK); chat: atomic rollback (OK) | `contact-messages.service.ts:162`, `chat-sessions.service.ts:60-96` | — |
| Contact Message creation failure after Lead create | roll back Lead | **Lead remains with no message** (contact-form/WhatsApp/web-chat path) | `:162,:174` | MEDIUM |
| Notification dispatch failure | log; do not affect persistence | persistence unaffected; rejected promise has no handler → unhandled rejection (crash PROBABLE on Node ≥15) | `:199`; dispatch/recipient services have no try/catch | HIGH (F-03) |
| UI update failure (socket) | UI recovers automatically | event lost; no reconnect catch-up; only reload/remount/15 s stale refetch recovers | `management-chat-socket.tsx`; `providers.tsx:45-48` | MEDIUM |
| `/leads` route failure | route resolves for management users | 404 only on `portal.*`, `client` default, or typed `/management/leads`; runtime cause UNKNOWN; does not affect ingestion | `proxy.ts:18-30` | LOW (mechanism) / UNKNOWN (observed) |
| Network interruption (browser) | auto-recover with catch-up | transport reconnects, no catch-up; badge may show 0 on failed fetch | `use-unread-count.ts` | MEDIUM |
| Network interruption (web-api→API) | bounded wait + safe retry | no timeout; no idempotency key | `index.ts` | MEDIUM |
| reCAPTCHA network failure | return controlled 5xx | unhandled rejection in async Express 4 handler | `recaptcha.ts:24`; `index.ts:166,207,249,298` | HIGH (F-03) |
| Worker/process restart | resume without loss | email: nothing resumed (no cursor); Socket.IO clients reconnect (no catch-up); in-memory rate limits reset; docker auto-restarts | `docker-compose.prod.yml` (`restart: unless-stopped`) | MEDIUM |
| Concurrent identical submissions | exactly one Lead | possible duplicate Leads (no unique constraint) | schema; `lead-matching.ts:53` | MEDIUM (PROBABLE) |

---

## 12. Data Integrity Risks

| Risk | Detail | Label |
|---|---|---|
| Duplicate ContactMessage | no idempotency key on public routes; web-api no timeout/retry; client/proxy retry after upstream success duplicates | CONFIRMED absence / occurrence PROBABLE |
| Duplicate Lead | check-then-create with no unique/identity index; concurrent first submissions | PROBABLE |
| Orphan Lead | contact-form path: Lead created, message create fails; `resolveLeadMatch` CREATE_NEW crash window | CONFIRMED mechanism |
| Orphan ContactMessage | POSSIBLE match (`leadId null`); Lead deletion (`ON DELETE SET NULL`) | CONFIRMED (by design for POSSIBLE) |
| Incorrect Lead association | exact-only matching → under-association (not wrong association); a CONVERTED Lead can still receive STRONG matches; matching ignores Lead status | CONFIRMED |
| Lost email | >50 backlog never fetched; no cursor | CONFIRMED mechanism |
| Duplicate/re-ingested email | `permanentDelete` + re-sync within window | CONFIRMED mechanism |
| Dropped legit email | `uid-N` key collision after UIDVALIDITY change; self-sent copy w/ same Message-ID | PROBABLE |
| Lost/incorrect registration-origin | not stored → cannot be lost; but also no channel on Lead snapshot | CONFIRMED |
| Lead snapshot staleness | `Lead.name/email/phone/org` never updated after first message | CONFIRMED |
| Dead state | `confirmedByUserId/At`, MatchStatus `CONFIRMED_EXISTING/DISMISSED`, `phoneNormalized` unused | CONFIRMED |

---

## 13. Reliability Risks

- **Missed messages:** email manual/50-window (F-02); socket gap and role mismatch for UI (M-05, M-06).
- **Duplicate notifications:** only as a consequence of duplicate messages (no dedup/outbox) (M-04).
- **Stale UI:** no polling, no focus/online refetch, stale needs-review accordion, badge reset-to-0 on error, offset pagination shift.
- **Retry gaps:** no retry for IMAP, for web-api→API, or for notification dispatch; no outbox.
- **Worker restart:** no in-process state to lose; also nothing resumes; in-memory rate limits reset; Socket.IO clients lose events during restart.
- **Race conditions:** duplicate Leads (M-03); concurrent IMAP syncs (protected by unique index); `convertToCustomer` duplicate checks; CREATE_NEW crash window.
- **Process crash:** unhandled rejections (F-03).
- **Scale-out:** in-process EventEmitter + Socket.IO and in-memory rate limiter assume one instance (UNKNOWN whether production runs >1; compose defines one).

---

## 14. Production Configuration Risks

| Item | Finding | Label |
|---|---|---|
| IMAP vars | documented in both examples; wired via `env_file`; live values not inspected | UNKNOWN (configured?) |
| `IMAP_PASS`/`SMTP_PASS` lines in `.env.production.example` lack `=` | unset if copied verbatim | LOW |
| Duplicate env blocks in `.env.production.example` | a production block (≈ lines 39-128) and a dev-style block (≈ 157-231) repeat keys, incl. `NEXT_PUBLIC_API_URL` (≈ line 207 localhost), `API_URL` (≈161), `TRUSTED_ORIGINS` (≈219), `COOKIE_DOMAIN` (≈222). If copied verbatim and last-wins applies, a baked `NEXT_PUBLIC_API_URL` could point every portal call (not just Leads) at localhost | PROBABLE risk / live file UNKNOWN |
| `NEXT_PUBLIC_API_URL` baked at build (docker build arg) | rebuild required to change | CONFIRMED |
| nginx | `infra/nginx/*.conf.example` marked "NOT YET APPLIED"; `portal.*` has no block | UNKNOWN (installed?) |
| `DEV_DEFAULT_HOST_GROUP` | not gated by `NODE_ENV` | CONFIRMED |
| Tracked secret-like values | git-tracked `.env.example` and `.env.production.example` contain non-placeholder-length values for `DATABASE_URL`, `INTERNAL_API_SECRET`, `RECAPTCHA_SECRET_KEY`, `CHAT_SESSION_TOKEN_SECRET`, `BETTER_AUTH_SECRET` (value lengths 36-70; one tracked `DATABASE_URL` looks like a real credential). `.env` itself is gitignored (`.gitignore:20`) | PROBABLE exposure (treat as exposed) |
| `.env.example` documents `WEB_CHAT_RATE_LIMIT_*` only in comments | defaults apply | LOW |
| Process model | one `api`, `web-api`, `web`, `portal`, `tech-pwa`, `customer-portal`; `restart: unless-stopped`; no pm2/systemd/scheduler/worker | CONFIRMED |
| Node unhandled-rejection mode | no handler in `apps/api/src`; Node flags in production | UNKNOWN |
| Rate limiting | per-process in-memory; resets on restart | CONFIRMED |
| `trust proxy` | `"loopback"` in web-api (`index.ts:28`) | CONFIRMED (correct only behind local nginx) |
| Google reCAPTCHA / `COMPANY_ID` | missing either → submissions fail closed / 500 | CONFIRMED |

---

## 15. Git / Regression Findings

HEAD `b8b7cff` (2026-10-02). Timeline (CONFIRMED from `git log`):

| Subsystem | Introduced | Later changes |
|---|---|---|
| Repo init | `9207a06` 2026-08-08 | — |
| Portal `proxy.ts` host split | `e931597` 2026-08-14 | `0a86cbe` 08-21 (bypass FCM service worker; `proxy.test.ts`), `f264e95` 08-22 (public assets) |
| Whitelist / registration | `3af90d6` 08-14 | `7a7f78d` 08-19; `d624f15` 08-24 (origin-aware hook); `279ec96` 09-25 |
| Lead Inbox / leads module | `6288ba9` 08-16 | `5c56a83` 08-22; `e7cf8b5` 08-24 (convert to Customer); `7ca58fc` 09-02 |
| Chat / Socket.IO | `54ec9cc` 08-16 | `051aaf9`,`1784b81` 08-17; `4c8a25f`,`a8306b5` 08-24; `9be0f99` 08-25 |
| Contact-message realtime event | `9be0f99` 2026-08-25 — **commit titled "Add comprehensive audit document…" but also contains `contact-message-events.ts`, gateway relay, shell subscriber, lead-detail React Query rewrite**; message search misses it | — |
| Management list (React Query) pattern | `5555803` 08-18 | `39a9ae5` 09-05 |
| Email system / IMAP | `0465963` 08-20 (migration `20260820121500_add_email_system`) | `a922799` 08-27; `7ca58fc` 09-02 (`imap-client.ts`, `imap-sync.service.ts` each have a single commit) |
| Push tokens / dispatch | `d0b84d1` 08-20 | `deafcbb`,`08c8d2a`,`76914ae`,`5c56a83`,`c1d6187` (OUT OF SCOPE — FCM) |
| Earlier `/leads` 404 analysis | `45ba97c` 2026-09-20 | untracked this-audit prompt file dated 2026-10-02 |

Findings:
1. **No commit since 2026-09-02 changes Lead/ContactMessage/chat/email logic.** Last relevant: `7ca58fc` (formatting + tie-breaker). `6da5188` (2026-09-28) touched `leads-ui.tsx` only for `PaginationBar`/`pageSizeLabel` and added a dashboard menu entry. `da1207a`, `279ec96` touched whitelist tests / `me-types.ts`.
2. **Uncommitted work does not touch these flows (CONFIRMED by diff review):** modifications in work-orders, purchase-orders, certificate panel, document-number; `schema.prisma` adds `SpkParent` and back-relations on Company/User/Customer/PurchaseOrder/WorkOrder (no Lead/ContactMessage/Email/ChatSession/origin models); `packages/shared/src/schemas/index.ts` adds only shared-SPK schemas (+85 lines); untracked migration `20261004000000_add_spk_parent_child`. No recent task plausibly regressed these flows.
3. **Coexisting implementations:** old Lead-deduplicated list API (`GET /leads`, `LeadListRow`) coexists with the per-message list (`GET /contact-messages`); UI no longer uses `GET /leads`. Three permission names (`lead:read`, `contactMessage:read`, `chat:read`) gate one feature.
4. **Partial migration signs:** `GetMessageFrom.EMAIL` declared but never produced; `/public/web-chat` no UI caller; dead `formatContactAck`; unused MatchStatus values; stale BigInt comment.
5. **Routing asymmetry** between `leads` (management-only, added `6288ba9`) and the two-group proxy has existed since feature creation, not introduced by a later regression.
6. Latest lead-flow-table migrations: `20260820121500_add_email_system`, `20260817090000_chat_session_last_read_by_admin`; no pending lead-flow migration.

---

## 16. Confirmed Findings

### HIGH
- **F-01 — Email is not wired to Lead / Contact Message / notification / UI signal.** Ingestion writes `Email` only (`imap-sync.service.ts:75-96`, `leadId:null`); `contactMessage.create` exists once (`contact-messages.service.ts:174`); `GetMessageFrom.EMAIL` never written. *(Documented as "by design" in an earlier audit; HIGH relative to the required Scenario B / missed-message risk. Needs an owner decision on intent.)*
- **F-02 — IMAP ingestion is manual-only with a fixed 50-message window and no cursor.** `POST /emails/sync` only; `SYNC_LIMIT = 50`, `slice(-50)` (`imap-client.ts:21,68`); no `ScheduleModule/@Cron/@Interval`. Backlog > 50 between syncs is permanently skipped; no overall fetch timeout; no sync lock.
- **F-03 — Unhandled-rejection paths on process-critical code (crash = PROBABLE).** (a) `void this.notifyNewContactMessage(...)` with no `.catch` (`contact-messages.service.ts:199`), downstream services have no try/catch; (b) `verifyRecaptcha`'s `fetch` is outside any try/catch (`recaptcha.ts:24`), called inside async Express 4 handlers (`index.ts:166,207,249,298`); no `unhandledRejection` handler in `apps/api/src`. Mitigation: `restart: unless-stopped`.
- **F-04 — Secret-like values in git-tracked `.env.example` / `.env.production.example`** (names + lengths verified; values deliberately not reproduced; PROBABLE they are live). Outside the flow-severity scale; classified HIGH for production-config risk.

### MEDIUM
- **M-01** STRONG match needs phone AND organization (`lead-matching.ts:63`) → repeat messages by email only become orphans; chat/web-chat always orphan on repeat.
- **M-02** Contact-form/WhatsApp/web-chat path is non-atomic (`:162`/`:174`, `tx = prisma`) → orphan Lead on failure; chat path atomic.
- **M-03** No unique/identity constraint on Lead; matching is check-then-create → duplicate-Lead race (occurrence PROBABLE).
- **M-04** No idempotency key on public POSTs; web-api→API `fetch` has no timeout/retry; in-memory per-process rate limit.
- **M-05** Realtime room join requires `chat:read` (`chat.gateway.ts:124-129`) vs `contactMessage:read`/`lead:read` for data/UI → some roles get no live updates (grants UNKNOWN).
- **M-06** No catch-up on socket reconnect; no focus/online refetch; `refetchOnWindowFocus:false`; server-initiated disconnect is terminal; unread badge → 0 on any error; no connection indicator.
- **M-07** `["leads-needs-review"]` not invalidated by `contact_message_created`; orphan rows not openable (`leads-ui.tsx:93-102`); Needs Review unbounded + N+1.
- **M-08** Single-process EventEmitter/Socket.IO; in-memory rate limiter (breaks under scale-out).
- **M-09** Production-config ambiguity: duplicate env blocks, baked `NEXT_PUBLIC_API_URL`, nginx only `.example` (live state UNKNOWN).
- **M-10** Offset pagination row shift; full-table Lead scans per message (`lead-matching.ts:53`) and per email suggestion (`lead-suggestion.service.ts:22-25`).
- **M-11** Notification recipients selected by `receiveNotifications` opt-in with no RBAC check; `assignToUser` awaits dispatch inline after persisting.
- **M-12** IMAP edge cases: concurrent syncs unlocked; `permanentDelete` re-ingest; `uid-N` key collision (PROBABLE); global unique index vs per-company pre-check; DB errors mid-batch abort sync with partial writes.

### LOW
- **L-01** `formatContactAck` has no callers — visitors never get an acknowledgement.
- **L-02** Dead/unused: `confirmedByUserId/At`, MatchStatus `CONFIRMED_EXISTING/DISMISSED`, `phoneNormalized`, `GET /leads`, `/public/web-chat`, `GetMessageFrom.EMAIL`.
- **L-03** `DEV_DEFAULT_HOST_GROUP` not gated by `NODE_ENV`.
- **L-04** Host-prefix duplication between `proxy.ts` and `resolveRegistrationContext` (drift risk).
- **L-05** `updateStatus` update lacks `companyId` in `where` (after scoped `findFirst`).
- **L-06** `email:read` guards `POST /emails/sync` (mutating external call).
- **L-07** `IMAP_PASS`/`SMTP_PASS` lines without `=` in `.env.production.example`; `WEB_CHAT_RATE_LIMIT_*` only in comments in `.env.example`.
- **L-08** IMAP result counters under-report malformed MIME; generic UI error text.
- **L-09** Stale `chat-serialization.ts:3-9` BigInt comment; redundant plain index beside `Email_messageId_key`.
- **L-10** `/client/leads` asymmetry untested (`proxy.test.ts` asserts matching only); no `NODE_ENV`-aware behavior.

---

## 17. Probable Findings

| ID | Inference | Basis |
|---|---|---|
| P-1 | Unhandled rejection crashes the API / web-api process on Node ≥ 15 (default `--unhandled-rejections=throw`) | F-03 absence of catch/handler; Node flags UNKNOWN |
| P-2 | Duplicate Leads occur under concurrent first submissions | M-03 schema/logic |
| P-3 | Retry after upstream-success + web-api 502/timeout duplicates message & notification | M-04 |
| P-4 | Tracked `.env*.example` secrets are real/live | value lengths; one resembles a real DB credential |
| P-5 | `NEXT_PUBLIC_API_URL`/`TRUSTED_ORIGINS` could be overridden by the later duplicate block if the example was copied verbatim | M-09 |
| P-6 | `uid-N` Message-ID fallback collides after UIDVALIDITY reset; self-sent INBOX copy dropped | M-12 |
| P-7 | Roles lacking `chat:read` miss live updates | M-05 (grants UNKNOWN) |
| P-8 | Earlier "bell prefetch causes recurring 404" theory is not the likely cause | §9.2 |

---

## 18. Unknowns / Evidence Gaps

1. Live `.env.production` contents (IMAP configured? `COMPANY_ID`? `DEV_DEFAULT_HOST_GROUP`? `NEXT_PUBLIC_API_URL` actually baked?).
2. Whether `infra/nginx/*.conf.example` are installed on the VPS and whether `Host $host` is preserved for `apps.*`.
3. Host header, environment and server log line of the observed `/leads` 404.
4. Non-ADMIN `RolePermission` grants for `lead`, `contactMessage`, `chat`, `email`.
5. Production Node version / unhandled-rejection mode; actual crash history in container logs.
6. Number of `api` / `web-api` instances in production.
7. node-imap behavior on mid-fetch stall; real mailbox volume vs the 50-message window; whether staff regularly click Sync.
8. Whether any external system/seed writes Leads/ContactMessages with other `getFrom`.
9. SMTP-returned Message-ID equality with the delivered header (self-sent copies).
10. Live Socket.IO behavior behind nginx (upgrade headers, `proxy_read_timeout 75s`, idle disconnects).
11. Whether the tracked secret-like values are active in any environment.
12. No runtime/reproduction was performed; no tests were run (audit only).

---

## 19. Recommended Remediation (not implemented)

| ID | What / Why |
|---|---|
| F-03 | Attach `.catch` (logging) to fire-and-forget dispatch; wrap `verifyRecaptcha` fetch in try/catch (fail closed with 502/503) or use an async-error wrapper for Express 4; add a process-level `unhandledRejection` log handler. *Why: a transient Google/DB error should never take down public intake.* |
| F-04 | Rotate every credential that appears in tracked files, replace with placeholders, untrack; confirm `.env*` ignore rules. |
| F-01 | Owner decision: either formalize email as a separate inbox (and drop `EMAIL` from lead-flow expectations/UI wording), or add an explicit email→ContactMessage/Lead conversion policy with notification + realtime event. |
| F-02 | If email must be reliable: persist last-UID + UIDVALIDITY, fetch by UID range, add a scheduled/IDLE trigger and a lock, add overall timeout, surface sync status/last-run/errors, and add an unread badge. Otherwise document the limitation prominently. |
| M-01 | Product decision on matching tiers (e.g., treat exact normalized email as STRONG for repeat senders) and/or auto-attach chat follow-ups to the existing session's Lead; keep Needs Review as fallback. |
| M-02/M-03 | Run the contact-form path in a transaction (as chat does); add a deterministic identity/uniqueness strategy or advisory lock to prevent duplicate Leads. |
| M-04 | Add an idempotency key (client-generated) honored by `internal/*`, timeouts on web-api→API calls, and shared (not in-memory) rate limiting if scaled. |
| M-05 | Align the realtime room-join permission with `contactMessage:read`/`lead:read`, or document required role grants. |
| M-06/M-07 | Refetch on socket `connect`/`visibilitychange`/`online`; add a low-frequency polling fallback; invalidate `leads-needs-review` on the bus event; distinguish error vs zero in unread badge; make orphan rows openable; add retry button. |
| M-08 | If ever scaled, replace EventEmitter/Socket.IO fan-out with a Redis adapter. |
| M-09 | Split production vs dev blocks in the example file; verify the deployed `NEXT_PUBLIC_API_URL`; install and verify nginx; gate `DEV_DEFAULT_HOST_GROUP` by `NODE_ENV`. |
| `/leads` | Capture the failing request's Host + env + log to establish the actual cause before changing routing; add a `proxy.test` assertion for client-group behavior. |
| LOW | Remove dead code/fields only when separately scoped (per project scope-lock rules). |

---

## 20. Priority Classification

| Severity | Count | Items |
|---|---|---|
| **BLOCKER** | **0** | none confirmed |
| **HIGH** | **4** | F-01, F-02, F-03, F-04 |
| **MEDIUM** | **12** | M-01 … M-12 |
| **LOW** | **10** | L-01 … L-10 |

*Rationale:* no core business flow is confirmed broken in source (hence no BLOCKER). HIGH items concern missed/never-ingested email, process-crash risk on the public intake path, and credential exposure. MEDIUM items degrade correctness/recovery with workarounds (Needs Review, reload, manual sync). LOW items are debt/noise.

---

## CORE BUSINESS FLOW STATUS

1. **Can a website visitor/customer submit a Contact Message?** **Yes in source** (contact form, WhatsApp, web chat, chat session). Depends on `COMPANY_ID`, `INTERNAL_API_SECRET`, `RECAPTCHA_SECRET_KEY` (fails closed when unset) and a reachable Google endpoint (unhandled-rejection risk, F-03). Production state UNKNOWN.
2. **Is the message persisted?** **Yes** (ContactMessage row; chat in a single transaction). Email is persisted only as an `Email` row, not a Contact Message.
3. **Is it associated with the correct Lead?** **Partially.** New identities create a Lead; follow-ups attach only on phone+organization match; otherwise `leadId = null` (Needs Review). No *wrong* association found, but under-association and a duplicate-Lead race exist (M-01, M-03).
4. **Is registration-origin preserved correctly?** **Not applicable / not stored.** Registration-origin is a transient signup-policy input and is not persisted on any entity; the lead's channel (`getFrom`) lives on ContactMessage only and is not copied to Lead.
5. **Is application-level notification dispatch triggered?** **Yes for website/chat** (fire-and-forget, no persistence/retry, unhandled-rejection risk). **No for email.** FCM delivery: OUT OF SCOPE — FCM.
6. **Does the Management UI receive/update the Contact Message?** **Yes for website/chat** via Socket.IO + query invalidation while connected (gaps: reconnect, role without `chat:read`, stale needs-review). **No for email** (no event/badge).
7. **Can a management user open the Leads UI?** **Yes** on the `apps.*` host (or default management group) with `lead:read`; 403 shows AccessDenied. Actual runtime UNKNOWN.
8. **Can the `/leads` routing issue interfere with any of the above?** **No** for 1–6 (API traffic is a separate origin). It can only block *opening the page* on `portal.*`/`client`-default hosts or via a typed `/management/leads` URL.
9. **Is there any confirmed blocker?** **No.** (Email-to-Lead flow absence is HIGH and by design per earlier docs; runtime `/leads` 404 cause is UNKNOWN.)
10. **Is there any data-integrity risk?** **Yes** — orphan messages (M-01), orphan Leads (M-02), duplicate-Lead race (M-03), duplicate messages on retry (M-04), email permanently skipped beyond the 50-message window and re-ingestion after permanent delete (F-02, M-12).

---

## ROOT CAUSE SUMMARY

| Issue | Trigger | Root Cause | Impact | Evidence |
|---|---|---|---|---|
| Email never reaches Leads/Contact Messages | Any inbound email | IMAP path only writes `Email`; no code path produces `GetMessageFrom.EMAIL` or calls `ContactMessagesService.create`; "strict auto-suggest only" design | Inbound email invisible to Lead inbox, no notification/badge | `imap-sync.service.ts:75-96`; `contact-messages.service.ts:174`; `FINAL-FORENSIC-AUDIT-REPORT.md:476` |
| Emails missed | >50 messages between manual syncs, or nobody clicks Sync | No scheduler, no cursor, `slice(-50)`, `SYNC_LIMIT=50` | Permanent skip of older messages; delayed visibility | `imap-client.ts:21,68`; `app.module.ts`; `use-emails-query.ts:222-241` |
| Possible process crash on public intake / API | Google/DB error during reCAPTCHA or dispatch | Floating promises and un-caught `fetch` in async Express 4 handler; no process handler | Request hang or process restart; lost in-flight requests; rate-limit reset | `contact-messages.service.ts:199`; `recaptcha.ts:24`; `index.ts:166,207,249,298` |
| Credentials in tracked files | Repo access / history | Real-looking values committed in example env files | Secret exposure | `.env.example`, `.env.production.example` (lengths verified) |
| Follow-up message not attached to existing Lead | Repeat sender with email only (or chat) | STRONG requires phone AND org; chat sends neither | Orphan `ContactMessage(leadId=null)`; manual Needs Review | `lead-matching.ts:63-66`; `contact-messages.service.ts:159-160` |
| Orphan Lead / duplicate Lead | 2nd write fails; or two simultaneous submissions | Non-atomic contact path; no unique/identity constraint; check-then-create | Stray or duplicate Leads | `contact-messages.service.ts:162,174`; `schema.prisma` Lead indexes |
| Duplicate message/notification | Client or proxy retry after upstream success | No idempotency key; no timeout/retry policy in web-api | Duplicate rows + pushes | `index.ts` forwarding; no dedup field |
| Live updates missed | Socket gap or role lacking `chat:read` | No reconnect catch-up; room join gated by `chat:read` | Stale list until reload | `chat.gateway.ts:124-129`; `management-chat-socket.tsx`; `providers.tsx:45-48` |
| Stale Needs Review / badge 0 on error | New POSSIBLE orphan; failed count fetch | Bus doesn't invalidate needs-review; `.catch(()=>setCount(0))` | Orphans unnoticed; misleading badge | `management-shell.tsx:58-73`; `use-unread-count.ts` |
| Observed `/leads` 404 (unconfirmed) | Request resolved to `client` group or typed `/management/leads` | `proxy.ts` rewrite + no `app/client/leads`; default group via `DEV_DEFAULT_HOST_GROUP`; nginx install state unknown | Page-level 404 only; flow unaffected | `proxy.ts:18-30`; app tree; `infra/nginx/*.example` |

---

## IMPLEMENTATION ORDER

**Must fix before continuing feature development**
1. F-04 — rotate and untrack the exposed credentials.
2. F-03 — add error handling for the floating dispatch promise and the reCAPTCHA `fetch` (public intake stability).
3. Decision gate for F-01 / F-02 — decide whether email is a Lead source; if yes, design the ingestion trigger/cursor (needs an explicit scoped task per project rules).
4. Capture runtime evidence for `/leads` 404 (Host, env, nginx state, log) and verify the deployed `NEXT_PUBLIC_API_URL` / duplicate-env-block risk (M-09).

**Can defer to hardening**
- M-01 matching-tier policy, M-02/M-03 atomicity and uniqueness, M-04 idempotency/timeouts, M-05 permission alignment, M-06/M-07 UI recovery and Needs Review freshness, M-11 recipient RBAC, M-12 IMAP edge cases, M-10 performance.

**Technical debt**
- L-01 … L-10, M-08 (scale-out assumptions), dead fields/routes, host-prefix duplication, test gaps (IMAP client, window limit, concurrency, secret-leak assertion, `proxy` client-group behavior).

**Out of scope — FCM**
- FCM token registration, `firebase-admin`, service worker / `notificationclick`, device push delivery, `FCMToken` handling, `NEXT_PUBLIC_FIREBASE_*`, `FIREBASE_SERVICE_ACCOUNT_JSON`, push payload delivery beyond the application dispatch boundary.

---
*End of audit. No remediation has been implemented. No repository files other than this report were created or modified by this audit.*
