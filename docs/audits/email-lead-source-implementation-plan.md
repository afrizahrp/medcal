# Email as Lead Source — Implementation Audit & Plan

| | |
|---|---|
| **Date** | 2026-10-03 |
| **Type** | Audit + implementation plan only. **No source, schema, migration, route, UI, IMAP, notification, Socket.IO, FCM or work-order/PO change. No commit/push.** |
| **Decision (final, not reopened)** | Email is a Lead Source. FCM is out of scope. Website sources must not regress. |
| **Basis** | Code read in this task (not only the prior audit): `apps/api/src/modules/{emails,contact-messages,leads,chat}`, `packages/db/prisma/schema.prisma`, `packages/shared`, `packages/auth`, `apps/portal` email + socket code, `docker-compose.prod.yml`. |

Legend: **CONFIRMED** = verified in code/schema/config · **RECOMMENDED** = recommendation built on verified facts · **UNKNOWN** = cannot be determined without runtime/data evidence.

---

## 1. Current Architecture

| Layer | Component | Facts (all CONFIRMED) |
|---|---|---|
| Transport | `imap-client.ts` `fetchInboxFromHostinger()` | `imap` + `mailparser` (`simpleParser`). One mailbox, hard-coded `INBOX`, one set of `IMAP_*` env vars (single company per process, `COMPANY_ID`). Opens the box **read-only** (`openBox(…, true)`) so `\Seen` is never set. |
| Ingestion | `imap-sync.service.ts` `ImapSyncService.syncInbox(companyId, fetchFn)` | Injectable `fetchFn` seam (used by tests). Loops messages: skip if no `fromEmail`; dedupe by `findFirst({companyId, messageId})`; `LeadSuggestionService.findSuggestion`; `prisma.email.create`; `P2002` → counted as duplicate. |
| Suggestion | `lead-suggestion.service.ts` | Loads **all** Leads of the company per email, exact normalized-email match, exactly one → `suggestedLeadId`; never sets `leadId`. |
| Persistence | `Email` model | Single model for INBOX/SENT/DRAFTS/TRASH. `messageId String? @unique` (**globally** unique, not per company). `suggestedLeadId` (system), `leadId` (staff-confirmed only), `contactMessageId` (nullable FK, `onDelete: SetNull`), `parentEmailId` (MedCal-internal thread), `rfcInReplyTo`, `rfcReferences`. |
| API | `emails.controller.ts` | `POST /emails/sync` is guarded by `email:read` (a mutation under a read permission). Lead association (`associateLead`) needs `email:manage`. |
| UI | `apps/portal/.../management/email` | "Synchronize Inbox" button → `POST /emails/sync`. Detail page renders `sanitizeEmailHtml` output via `dangerouslySetInnerHTML` (the only such use in the portal). Shows `suggestedLead` for staff to confirm. |
| Lead domain | `Lead`, `ContactMessage`, `lead-matching.ts`, `ContactMessagesService.create()` | `ContactMessage.getFrom` enum **already contains `EMAIL`**; `contactMessageCreateSchema` already accepts `EMAIL`; `leadListQuerySchema` already filters by `EMAIL`. Nothing consumes it yet. |
| Notification / realtime | `notifyNewContactMessage`, `publishContactMessageCreated`, `ChatGateway.afterInit` | Covered in §12–13. |

**Scheduler:** none for email. No `@nestjs/schedule`, no `@Cron`. The only timer in `apps/api` is `setInterval` in `main.ts` (RolePermission cache refresh, 60 s). **CONFIRMED.**

## 2. Current Email Flow (verified)

```
Operator clicks "Synchronize Inbox" (only trigger)
  → POST /emails/sync (email:read)
  → fetchInboxFromHostinger():
        connect → openBox INBOX (read-only) → imap.search(["ALL"]) → results.slice(-50)
        → fetch full raw message for those 50 → simpleParser
        messageId = Message-ID header, else "uid-<UID>"
  → per message: no From → skipped | Message-ID exists → duplicate
        → suggestion (load all Leads) → Email row (INBOX, UNREAD, leadId=null)
  → STOP. No Lead, no ContactMessage, no notification, no realtime event.
```

### Defects found in the current flow

| # | Finding | Class |
|---|---|---|
| E1 | **Silent loss window.** Only the last 50 UIDs are ever considered (`SYNC_LIMIT = 50`, `slice(-50)`). If >50 messages arrive between two syncs, the older ones are never ingested — permanently, with no error. | CONFIRMED |
| E2 | **Unsafe fallback key.** Missing Message-ID → `uid-<UID>`. UIDs are only unique within a `UIDVALIDITY` epoch and the key has no mailbox/epoch. After a mailbox reset, a *new* message can get a previously used `uid-N`, hit the unique constraint / `findFirst`, and be **silently discarded as a "duplicate"**. Also the unique index is global across companies. | CONFIRMED (code); real-world frequency UNKNOWN |
| E3 | No cursor: every sync re-downloads and re-parses 50 full raw messages (`bodies: ""`). | CONFIRMED |
| E4 | `findFirst`-then-`create` dedupe is race-prone, but the unique index + `P2002` handler makes duplicate *Emails* safe. It would **not** be safe once Lead creation sits behind it (§13). | CONFIRMED |
| E5 | Message with empty/unparseable From is `skippedMalformed` and dropped — the customer communication is lost (only a counter increments). | CONFIRMED |
| E6 | Attachments are ignored (not stored, not listed). Inbound HTML is stored unsanitized in `Email.body`; `body` holds `html || textAsHtml || text` (mixed semantics). | CONFIRMED |
| E7 | Inbound `parentEmailId` is never set by sync (only SENT replies set it); `rfcInReplyTo`/`rfcReferences` are stored but unused for threading. | CONFIRMED |
| E8 | Only the first To and the CC list are stored; BCC/Reply-To/Authentication-Results/auto-reply headers are not extracted. | CONFIRMED |
| E9 | Lead matching/suggestion loads every Lead per message (O(messages × leads)); `findNeedsReview` recomputes candidates for every unresolved ContactMessage. | CONFIRMED (perf risk; scale UNKNOWN) |

## 3. Target Architecture

```
IMAP (poll, cursor)                         ── EmailSyncState (cursor, uidValidity, lastError)
  ↓ fetch UID > cursor, bounded batch
Normalize (sender, subject, body, headers)
  ↓
Persist Email  ─ idempotent (Message-ID, synthetic fallback) ─ ALWAYS first, own write
  ↓ eligibility (pure function; persisted outcome on Email)
  ├─ SKIPPED (internal / automated / bounce / no-reply / historical)  → Email only
  └─ ELIGIBLE → promotion transaction:
        advisory lock(companyId+email) → resolve Lead (thread-inherit → exact email → create)
        → ContactMessage(getFrom=EMAIL) → Email.contactMessageId (+ suggestedLeadId)
  ↓ after commit (never inside the tx; never able to fail the tx)
  notifyNewContactMessage()  +  publishContactMessageCreated()  (once per batch)
  ↓
Existing: Leads page / Contact Messages / Needs Review / unread badge (React Query invalidation)
```

Design principle: **reuse the existing ContactMessage path end-to-end.** No new conversation model, no second realtime mechanism, no new notification path.

## 4. Data Model Impact

### 4.1 Canonical business object (§Phase 2-A) — RECOMMENDED: **both, with a strict division of roles**

| Object | Role for email | Why |
|---|---|---|
| `Email` | Canonical **mail record**: raw/normalized message, RFC headers, mailbox state, thread links, reply/send | It already exists for all folders, carries RFC metadata and the SENT side, and is what the Email UI uses. `ContactMessage` cannot hold HTML, headers or SENT mail and has no mailbox semantics. |
| `ContactMessage` (`getFrom = EMAIL`) | Canonical **lead-intake event**: what Lead Inbox, Needs Review, unread badge, statistics, push and realtime already count | Every existing intake counter (`countUnread`, `getStatistics`, Leads list, Needs Review, notifications) is built on `ContactMessage`. Emitting one per accepted inbound email makes email "just another source" with **zero** changes to those consumers. |
| Link | `Email.contactMessageId` (exists, nullable, `SetNull`) | No duplicate representation: `ContactMessage.message` is the plain-text projection; the full mail stays in `Email`. |

### 4.2 Schema changes (RECOMMENDED, minimal, additive; **none made here**)

| Change | Needed because | Alternative considered |
|---|---|---|
| New `EmailSyncState` (`companyId`, `mailbox`, `uidValidity`, `lastProcessedUid`, `lastSyncAt`, `lastSuccessAt`, `lastError`, `intakeEnabledAt`; `@@unique([companyId, mailbox])`) | No existing persistence holds sync state; `Email` does not store UID. Deriving a cursor from `Email` rows would require a new `Email` column anyway and still cannot hold `UIDVALIDITY`/error/cutoff. | Add `imapUid`+`imapUidValidity` to `Email` only → cannot represent errors/cutoff, and conflates message data with sync state. |
| `Email.intakeStatus` enum (`PENDING`, `PROMOTED`, `SKIPPED`, `FAILED`) + `intakeReason String?` | Retry of a failed promotion and "do not reconsider skipped mail every cycle" must be derivable. Eligibility depends on headers that are **not** stored today, so it cannot be recomputed later from the row. | Pure derivation from `contactMessageId IS NULL` → cannot distinguish "internal, intentionally skipped" from "failed, retry me" → infinite re-evaluation or silent loss. |
| (Optional) `Email.imapUid Int?` | Diagnostics/audit only. | Skip unless support needs it. |

Everything else needed already exists: `GetMessageFrom.EMAIL`, `ContactMessage.leadId`, `Email.contactMessageId`, `suggestedLeadId`, `rfcInReplyTo/References`, `parentEmailId`. **No changes to `Lead`, `ContactMessage`, tolerance/measurement models or Phase 4 invariants.** Migration must be a single new migration, never editing applied ones, no backfill (see §19).

## 5. Normalization Rules

| Element | Rule | Class |
|---|---|---|
| **Sender identity** | Authoritative = the first mailbox of the **From** header (`firstMailbox(parsed.from)`, already the extraction point). Normalize address with the existing shared `normalizeEmail` (`trim().toLowerCase()`); drop display name (kept as `name`). Reuse `contactMessageCreateSchema` limits (`email` valid, ≤100). Unparseable/empty From → persist the Email (see §17), `intakeStatus=FAILED, reason=NO_SENDER`, never a Lead. | RECOMMENDED |
| Existing util | `emails/email-normalize.util.ts` (`normalizeEmailAddress`) additionally strips *all* inner whitespace; `@medcal/shared normalizeEmail` is what Lead matching uses. Use **one** of them for Email matching consistently — the shared one, to equal `lead-matching.ts`. | CONFIRMED divergence / RECOMMENDED |
| **Multiple senders** | Only first From mailbox is used (matches current code). | CONFIRMED / RECOMMENDED |
| **Reply-To** | Not stored today. Do not use for matching (spoofable, often a no-reply/relay). Optionally record for staff reply UX later. | RECOMMENDED |
| **Forwarded** | The sender is the forwarder; treat as an ordinary message. Do **not** parse forwarded content for identity. | RECOMMENDED (see Decision D7) |
| **Subject** | Store raw (`Email.subject` raw; `ContactMessage.subject` raw truncated to the 150-char schema limit — the full text stays in `Email`). Normalized subject = strip repeated `Re:/RE:/Fwd:/FW:/Balas:/Tr:`-style prefixes, collapse whitespace; used **only** as a last-resort thread fallback and for display, never as an identity key, never stored. | RECOMMENDED |
| **Body** | Keep `Email.body` (html-ish) and `Email.textBody` (plain). `ContactMessage.message` ← `textBody`; if absent/blank → strip tags from `body`; if still blank → `"(empty message)"` (schema requires `min(1)`). `mailparser` already derives `text` from HTML when no text part exists. No quote/signature stripping in v1 (risk of discarding content; low value). | RECOMMENDED |
| **Multipart/empty** | `simpleParser` flattens multipart; empty body still creates a ContactMessage (a subject-only email is a legitimate inquiry). | RECOMMENDED |
| **Extra headers to capture at parse time** | `Auto-Submitted`, `Precedence`, `List-Id`/`List-Unsubscribe`, `X-Auto-Response-Suppress`, `Return-Path`, `Authentication-Results` — **only to decide eligibility**; not persisted individually (the outcome is persisted in `intakeStatus/intakeReason`). | RECOMMENDED |

## 6. Idempotency Strategy

Findings that constrain the design:
- `Email.messageId @unique` (global) already exists and is enforced by the DB → duplicate Email rows are impossible regardless of app logic. **CONFIRMED.**
- The fallback `uid-<UID>` is the weakness (E2).
- IMAP UID is unique only per `(mailbox, UIDVALIDITY)`.

**Recommended uniqueness model (two layers):**

| Layer | Key | Purpose |
|---|---|---|
| Logical identity (DB-enforced) | `Email.messageId` — the RFC `Message-ID`, trimmed, otherwise unchanged (Message-ID local parts are case-sensitive; do not lowercase) | Same message fetched twice / after restart / after manual sync / after mailbox reset → one row |
| Missing/duplicate Message-ID | **Synthetic id** `synthetic:<sha256(companyId|from|date|subject|sha256(raw body))>` instead of `uid-N` | Stable across UID changes; two genuinely different messages get different keys |
| Transport position | `(mailbox, uidValidity, uid)` → **cursor only** (EmailSyncState), not an identity key | Efficiency; never used to *discard* a message |

Scenario matrix:

| Scenario | Outcome |
|---|---|
| Same message fetched twice | `P2002`/pre-check → counted duplicate; **promotion state read from the existing row** (an unpromoted duplicate may still be retried) |
| Process restart mid-batch | Cursor not advanced past unpersisted messages (§7); re-fetch is idempotent |
| Manual + scheduled sync together | Single-flight lock (§16) + unique key |
| UID changes / `UIDVALIDITY` changes | Message-ID unchanged → deduped; cursor reset and bounded re-scan |
| Message-ID missing | Synthetic id (above) |
| Message-ID duplicated across **different** content (buggy sender) | Second message would be wrongly treated as duplicate. **Mitigation:** on key hit, compare stored `(fromEmail, sha256(body))`; if they differ, store under the synthetic id and log `MESSAGE_ID_COLLISION`. | RECOMMENDED |
| Same Message-ID, two companies | Not applicable today (single company per process; one `IMAP_*`); the global unique is acceptable. Do **not** change it to composite without a reason — UNKNOWN whether any production data would be affected. | CONFIRMED / RECOMMENDED |

## 7. IMAP Cursor / Sync State

- Mailbox config: one INBOX, one set of env vars, one company per process. **CONFIRMED.** Key the state by `(companyId, mailbox)` anyway; do not build multi-mailbox support now.
- **Fetch rule (RECOMMENDED):** `UID SEARCH UID <lastProcessedUid+1>:*`, fetch in bounded batches ordered by UID (e.g. 25–50), process oldest-first.
- **Cursor advance rule:** advance `lastProcessedUid` only to the highest UID of a **contiguous prefix of successfully persisted-or-intentionally-skipped Emails**. A message whose *Email persist* failed (DB error) blocks the cursor and is retried next cycle. A message that fails *promotion* does **not** block the cursor (its Email row exists; retried via `intakeStatus`, §17).
- **Verification note:** `node-imap`'s `openBox` callback exposes `box.uidvalidity`; this is library behavior not exercised in this repo — verify at implementation (RECOMMENDED / to verify).

| Event | Behavior |
|---|---|
| First run / enablement | Set `intakeEnabledAt = now`; set cursor to current max UID (only future mail). Existing mail is never promoted (§19). |
| `UIDVALIDITY` changed | Log, store new value, reset cursor to a bounded window (`SINCE intakeEnabledAt`), rely on Message-ID dedupe |
| Messages deleted/expunged on server | No effect; local Email rows are retained (desired) |
| Reconnect / timeout | Retry with backoff; cursor untouched |
| Crash mid-sync | Next run re-fetches from the stored cursor; idempotent |
| Concurrent sync | Prevented by lock (§16) |
| >N messages burst | Loop batches until caught up or time budget reached (fixes E1) |

## 8. Lead Matching Strategy

### 8.1 What the existing code does (CONFIRMED) and why it cannot be reused unchanged
`findLeadMatchCandidates` + `classifyLeadMatch`: STRONG = phone **and** organization; any single signal (including exact email) = POSSIBLE → `leadId = null` (Needs Review). Email-only inbound has no phone/organization → **an exact-email match can never become STRONG**, so reusing `ContactMessagesService.create()` as-is would leave every repeat email from a known customer orphaned in Needs Review — the exact defect the previous audit flagged.

`Lead.email` has **no unique constraint**; duplicates are possible. **CONFIRMED.**

### 8.2 Deterministic rules for the EMAIL source (RECOMMENDED), in order
1. **Eligibility gate** (§10) — ineligible mail never reaches matching.
2. **Thread inheritance:** if `In-Reply-To`/`References` resolves to an existing `Email` with a `contactMessageId` whose ContactMessage has a `leadId` (or a staff-confirmed `Email.leadId`) → attach to **that Lead**. Handles replies from an alias/forwarding address.
3. **Exact normalized email** against `Lead.email` (same company), query-filtered (`email equals … mode insensitive`) rather than loading all Leads:
   - exactly **1** → attach;
   - **0** → create a new Lead (§9);
   - **>1** → `leadId = null` → Needs Review (existing behavior for ambiguity; never pick arbitrarily).
4. Customer dedupe fields (`matchStatus`, `matchedCustomerId` via `CustomerContact` exact/domain) are computed by the existing code in `create()` unchanged and apply equally.

### 8.3 Edge cases
| Case | Handling |
|---|---|
| Shared/generic customer inbox (`info@rs-x.co.id`) | Matches a single Lead by exact email → attached. Different people behind the same address collapse into one Lead — acceptable; staff can see the per-message `name`. (D3) |
| Multiple Leads share an email | Needs Review (rule 3, >1) |
| Customer uses an alias / different address | Thread inheritance (rule 2) when replying; otherwise a new Lead + possible later manual merge (no merge feature exists; out of scope) |
| Domain match | Do **not** auto-attach by domain (only `matchedCustomerId` hint exists, already computed) |
| Internal Medcal address (`@kalibrasimedika.co.id`, `COMPANY_EMAIL_DOMAIN` exists in `@medcal/shared`) | Ineligible → no Lead |
| Automated senders | Ineligible (§10) |

### 8.4 Implementation seam (RECOMMENDED)
Add an **optional, default-off** parameter to `ContactMessagesService.create()` (e.g. `options.leadStrategy: "EMAIL_EXACT"` + optional pre-resolved `leadId`), or a thin sibling method that shares its internals. Default behavior for CONTACTFORM/WHATSAPP/CHAT is **unchanged** (existing tests `contact-messages.lead-matching.test.ts` stay green). Do not change `classifyLeadMatch`.

## 9. Lead Creation Rules

| Lead field | Value | Source | Class |
|---|---|---|---|
| `companyId` | process `COMPANY_ID` | existing | CONFIRMED |
| `name` (required) | From display name; else address local-part; ≤100 chars | derived, not invented | RECOMMENDED |
| `email` (required) | normalized From address | | CONFIRMED |
| `phone`, `organizationName` | **null** — not derivable from a header; do not guess from signatures or domain | "do not invent field values" | RECOMMENDED |
| `status` | default `NEW` | schema default | CONFIRMED |
| `assignedToUserId`, `customerId` | null | schema | CONFIRMED |
| **Source** | There is **no `source` column on Lead.** Source is represented by `ContactMessage.getFrom = EMAIL` on the Lead's first message (Lead list already filters by `getFrom` through `contactMessages`). | schema + `leads.service.ts` | CONFIRMED |

Lead creation stays inside the existing `create()` path (same shape as its NO MATCH branch) so Lead/ContactMessage invariants ("Lead snapshot from the first ContactMessage") hold.

## 10. ContactMessage Strategy (§Phase 8)

**Rule (RECOMMENDED): every *eligible* inbound external email creates exactly one ContactMessage (`getFrom = EMAIL`, `status = PENDING`).** Reasoning: each customer message needs attention, and unread counters/notifications/statistics are *per message* by existing design (the Contact Messages list is deliberately **not** deduped per Lead — CONFIRMED in `contact-messages.service.ts`).

Eligibility is evaluated **after Email persistence and before Lead creation** (so mail is never lost and meaningless Leads are never created):

| Class | Detection (RECOMMENDED) | Outcome |
|---|---|---|
| Internal staff mail | From domain = `COMPANY_EMAIL_DOMAIN` | `SKIPPED/INTERNAL` |
| Own SENT echo | From = `IMAP_USER`/own address | `SKIPPED/SELF` |
| Bounce/DSN | `Return-Path: <>`, From local-part `mailer-daemon`/`postmaster`, content-type report | `SKIPPED/BOUNCE` |
| Auto-reply / OOO | `Auto-Submitted ≠ no`, `X-Auto-Response-Suppress` | `SKIPPED/AUTOMATED` |
| Newsletter / bulk | `List-Unsubscribe`, `List-Id`, `Precedence: bulk/list/junk` | `SKIPPED/BULK` |
| No-reply sender | local-part `no-reply|noreply|donotreply` | `SKIPPED/NOREPLY` |
| Spam-like | **Not attempted** — no spam score available; Hostinger likely filters upstream (UNKNOWN). Staff trash/mark flow remains. | out of scope |
| Historical (received before `intakeEnabledAt`) | date | `SKIPPED/HISTORICAL` |
| Reply in a known thread | thread resolves | **eligible** (new ContactMessage, inherited Lead) |
| Unconvertible (invalid address, etc.) | schema failure | `FAILED/<reason>` (surfaced, retried only if cause is transient) |

Skipped mail still appears in the Email UI exactly as today. Detection must be a pure function with a closed reason list so it is fully unit-testable.

## 11. Conversation Threading Strategy

- **Existing capability (CONFIRMED):** `Email.parentEmailId` (internal chain), `rfcInReplyTo`, `rfcReferences`, SENT rows persist the SMTP `Message-ID`, so outbound and inbound share a lookup space. `ChatSession` is web-chat only (1 ContactMessage per session) and is **not** reusable for email. `ContactMessage` has no thread id.
- **Recommendation: no new conversation model.** Thread = the `Email` chain, resolved at ingest:
  1. look up `In-Reply-To` Message-ID, then the **last** `References` entry (then earlier ones), in `Email.messageId` (same company);
  2. found → set `Email.parentEmailId` (currently never set for inbound — E7);
  3. Lead for the new ContactMessage = inherited (§8.2 rule 2) → "customer email #1, #2, #3" share one Lead via `ContactMessage.leadId`; each is its own ContactMessage.
  4. No parent found → treat as a new conversation (subject fallback is **not** used to merge; too error-prone).
- Reply to a Medcal-sent email (SENT row) → inherits the Lead from the SENT row's `leadId`/`contactMessage.leadId`.
- Forwarded message: no `In-Reply-To` to us → new conversation by sender (D7).
- Cost: one indexed lookup per message (`@@index([messageId])` exists).

## 12. Notification Integration

Reuse `ContactMessagesService.notifyNewContactMessage(companyId, id)` (CONFIRMED: fire-and-forget safe, never rejects — F-03 fix; recipients = memberships with `receiveNotifications`, resolved in `NotificationDispatchService.sendToCompanyRecipients`).

| Question | Answer |
|---|---|
| Trigger | After the promotion transaction **commits** for a PROMOTED email. Not for SKIPPED/FAILED/historical. |
| Same method as other sources? | Yes — `formatContactMessagePush` uses name/topic/message; an email has no topic (null → handled). Nothing email-specific. |
| **Gap (CONFIRMED)** | `create()` fires notification+realtime only when `tx === prisma`; inside a caller-supplied `tx` it deliberately does not (chat sessions notify post-commit themselves). The email path will run `create()` in a transaction, so **the email ingestion code must call notify + publish itself after commit.** |
| Dedup | Notify once per ContactMessage creation; idempotency of ingestion guarantees a duplicate fetch cannot re-notify (no new ContactMessage is created on a duplicate). |
| Backfill/burst | Suppress notifications for historical/backfill (cutoff §19) and **cap/coalesce** if a large batch is promoted at once (e.g. one summary per batch above a threshold) — otherwise first sync after an outage floods every staff device. (D6 detail; RECOMMENDED) |
| Failure | Must not affect persistence — preserved by calling the existing never-rejecting method outside the tx. FCM untouched. |

## 13. Realtime Integration

Verified chain (CONFIRMED): `publishContactMessageCreated({companyId})` → Node `EventEmitter` → `ChatGateway.afterInit` listener → `server.to(roomForCompany).emit("contact_message_created")` → portal `management-chat-socket.tsx` → `notifyContactMessagesChanged()` → management shell invalidates Leads list / Leads[id] / statistics / unread badge.

- **Reuse as-is.** The event carries only `companyId`, so email needs no new event. **Publish once per sync batch** after commits (the payload is idempotent for the client), not once per message.
- Because the emitter and gateway live in the same Nest process (`apps/api`), a poller running **inside `apps/api`** reaches the gateway; a separate worker process would **not** (the EventEmitter is in-process) → this is a hard constraint on §16 (CONFIRMED).
- **Permission verification (§Phase 11):** the company room is joined only if the socket role has `chat:read` (`handleConnection`). Page access needs `lead:read` / `contactMessage:read` / `email:read`. In the seed catalog (`seed-role-permissions.ts`) and the permission tests, **only ADMIN (and SUPERADMIN's hard-coded bypass) hold `lead:read`, `contactMessage:read`, `email:read` — and ADMIN also holds `chat:read`**; SUPERVISOR/TECHNICIAN/FINANCE/CUSTOMER/CUSTOMER_SERVICE hold none of lead/contactMessage/email read. So **no live mismatch exists for current seeded roles** (CONFIRMED for seed/tests). Grants are DB-driven (`RolePermission`), so **production's actual grants are UNKNOWN**; if an operator ever grants `lead:read` without `chat:read`, that role would see email Leads only on refresh. Do not redesign RBAC (per scope); add a regression test that documents the assumption.

## 14. Transaction Boundaries

Principle: **inbound communication is never lost** — the Email row is committed first and independently.

```
T0  persist Email (+ intakeStatus=PENDING)                     [own write; failure → cursor blocked, retried]
T1  $transaction( advisory lock(companyId+email)               [atomic]
        resolve Lead  → ContactMessage.create → Email.update(contactMessageId, intakeStatus=PROMOTED, suggestedLeadId) )
T2  after T1 commit: notifyNewContactMessage (never rejects)   [best effort]
T3  after batch: publishContactMessageCreated (once)           [best effort, never throws into the sync loop]
```
`create()` already accepts a `tx` (CONFIRMED; used by `ChatSessionsService.createSession`), so T1 reuses it.

| Case | Behavior |
|---|---|
| **A** Email saved, Lead creation fails | T1 rolls back → Email stays `PENDING`/`FAILED` with reason; retried next cycle; nothing lost; no orphan Lead |
| **B** Lead created, ContactMessage fails | Same tx → Lead creation rolled back too (this is exactly why they must be one tx; the existing `resolveLeadMatch` has a manual compensating delete precisely because it is *not* transactional) |
| **C** ContactMessage saved, notification fails | Logged, swallowed (F-03). ContactMessage + unread badge still correct |
| **D** Notification OK, realtime fails | Wrap publish in try/catch; badge self-heals on the portal's next refetch/refocus |

## 15. Concurrency / Duplicate-Lead Race

- Existing race (CONFIRMED): `findLeadMatchCandidates` then `lead.create` is check-then-create without a lock or unique constraint; website intake can already produce duplicate Leads for simultaneous same-person submissions.
- **Email makes it worse only if two sync runs overlap** (A and B both see no Lead). It also introduces a *bursty* pattern (many emails from one new customer processed in one batch — sequentially in-process, so safe, but concurrent with a website submission is not).
- **Protection (RECOMMENDED), no uniqueness migration:**
  1. **Single-flight sync:** one in-process promise guard **plus** a Postgres session advisory lock for the whole sync run (`pg_try_advisory_lock`), so manual + scheduled + any future second instance cannot overlap. Fixes the sync-level race.
  2. **Per-identity transaction lock:** inside T1, `pg_advisory_xact_lock(hashtext(companyId||':'||normalizedEmail))` before the match query → check-then-create is serialized for email-originated creations.
  3. **No DB unique on `Lead(companyId,email)`** now: duplicates may already exist (UNKNOWN count) and a unique index would fail the migration or force a data decision. Provide a read-only duplicate-count query for the owner to decide later.
  4. Residual: a website submission concurrent with an email from the same new address can still double-create (website path takes no lock). Acceptable; not worsened by this work; see Risks.

## 16. Automatic Sync Architecture

Facts: production is Docker Compose with **one `medcal-api` container** (`restart: unless-stopped`, healthcheck, 127.0.0.1:3001) behind nginx; no worker service; no PM2 for Medcal. Single `IMAP_*` mailbox. Realtime emitter is in-process. Existing precedent for in-process timers (`main.ts`). **CONFIRMED.**

| Option | Verdict |
|---|---|
| A. Scheduled polling inside `apps/api` | **RECOMMENDED.** Fits topology, reaches the in-process gateway, simplest ops, uses the same service as the manual button. |
| B. Separate background worker | Rejected for now: new container/process, **cannot publish realtime** (in-process EventEmitter), more deploy surface. Revisit only if API scales to multiple replicas. |
| C. IMAP IDLE | Rejected for v1: long-lived connection management, Hostinger idle/limit behavior UNKNOWN, fragile across restarts; polling at 30–60 s is adequate for lead response. |
| D. Hybrid | Poll + existing manual "Synchronize Inbox" calling the **same** service method (already the case) — i.e., Option A. IDLE can be layered later without changing the pipeline. |

Details (RECOMMENDED):
- A Nest provider (`OnModuleInit`/`OnModuleDestroy`) with a self-rescheduling timer (not overlapping `setInterval`), interval from env (default 60 s), **disabled by default** via an explicit enable flag so dev machines holding real IMAP credentials do not poll/create Leads (a dev `pnpm dev` and the VPS would otherwise both ingest the same mailbox into different DBs).
- Manual sync endpoint keeps working; it triggers the same single-flight run (returns "already running" instead of overlapping).
- Observability: structured log per run (fetched/created/promoted/skipped/failed, duration), `EmailSyncState.lastSuccessAt/lastError`; expose in the existing `/emails/statistics` or a small status field (UI change out of scope; log first).
- Deployment: no compose change needed (same container); one new env var set in `.env.production` (enable flag/interval). **No new dependency required.**
- Guard the sync trigger permission: `POST /emails/sync` is `email:read` — leave unchanged (scope); note as hardening.

## 17. Failure / Retry Strategy

| Failure | Behavior | Retry/State |
|---|---|---|
| IMAP connect/timeout | Run aborts, no cursor change, `lastError` set | Exponential backoff (cap ~15 min), reset on success |
| Auth failure | Same, **stop retrying aggressively** (avoid lockout), log at error | Backoff capped; needs operator (env change) |
| Malformed email (parse error) | Today: logged & dropped (CONFIRMED). **Recommended:** if a UID/Message-ID is known, persist a minimal Email (`FAILED/PARSE_ERROR`) so the message is not invisible; cursor advances | No automatic retry |
| No sender | `FAILED/NO_SENDER`, Email retained | none |
| DB failure on Email persist | Cursor blocked at that UID; whole batch retried | next cycle |
| DB failure in promotion | Email `PENDING`/`FAILED`; retried by a sweep (`intakeStatus IN (PENDING,FAILED-transient)`, attempt-capped) | bounded retries, then stays `FAILED` visible |
| Notification failure | Logged only (F-03 intact) | none |
| Realtime failure | Caught, logged | none |
| Process crash | Cursor + `intakeStatus` make resume idempotent | automatic |
| Partial batch failure | Contiguous-prefix cursor rule (§7) | automatic |

Dead-letter: **no separate table** — `intakeStatus=FAILED` + `intakeReason` + `lastError` is sufficient and avoids over-engineering. A staff-visible list of FAILED emails is a later UI nicety (out of scope).

## 18. Security Considerations

| Topic | Finding | Class |
|---|---|---|
| HTML/XSS | Stored raw; sanitized on output by `sanitizeEmailHtml` (DOMPurify, allowlist: `p br b i u a ul ol li div span strong em`; attrs `href target rel`). No `img/style/script/iframe/form` → **no remote images/tracking pixels**; DOMPurify blocks `javascript:` URLs by default. The sole `dangerouslySetInnerHTML` in the portal is the email detail page; ContactMessage text is rendered through React (escaped). | CONFIRMED |
| Tabnabbing | `target` is allowed but `rel` is not forced → add `noopener noreferrer` via a DOMPurify hook (hardening; existing `isomorphic-dompurify` — no new library). | RECOMMENDED |
| Attachments | Not parsed/stored; no storage or malware surface; users cannot see that attachments existed. Keep ignoring in v1; record attachment count/names in a later phase if wanted. | CONFIRMED / D-note |
| Sender spoofing | `From` is unauthenticated. A spoofed customer address would attach a forged message to that customer's Lead and trigger a notification. Impact is limited (staff-read, no automated outbound), but replying goes to the spoofed address. Mitigation: capture `Authentication-Results` (SPF/DKIM/DMARC) at parse time and **flag/mark** (not drop) failures; do not auto-attach by thread/exact email when auth fails? — **UNKNOWN whether Hostinger adds the header**; verify on a real message before relying on it. | RECOMMENDED / UNKNOWN |
| Internal leakage | Skipping `COMPANY_EMAIL_DOMAIN` senders prevents internal mail becoming Leads/ContactMessages visible in lead views. BCC is not stored. | RECOMMENDED |
| Header/content injection | ContactMessage is text; subject/name flow into push payload as text. Enforce schema max lengths (name 100, subject 150). | CONFIRMED |
| Transport | `IMAP_TLS_REJECT_UNAUTHORIZED` defaults true; mailbox opened read-only (no server-side mutation). | CONFIRMED |
| Credentials | `IMAP_PASS` presence in production was seen (length only) in the credential preflight; not exposed in git. | CONFIRMED (preflight) |
| Volume/abuse | A flood to the inbox creates ContactMessages + notifications. Rate-guard: per-sender and per-batch promotion cap; excess stays `PENDING` for review. | RECOMMENDED |

## 19. Historical Email Handling (§Phase 17)

- Row count and association state of existing `Email` rows: **UNKNOWN** — not queried here (no production data access in this task). Read-only count queries for the owner are in Appendix A.
- Known from code: all existing INBOX rows have `leadId = null` unless staff confirmed (strict auto-suggest), `contactMessageId = null`, `suggestedLeadId` possibly set. SENT/DRAFTS/TRASH rows exist too.
- **Recommendation: future-only. No migration, no backfill.** Reasons: converting history would create a notification flood and Leads from stale, internal, SENT-echo and spam mail; the existing `Email.leadId` semantics were deliberately staff-confirmed; project rules forbid backfilling historical data unless explicitly required. Mechanism: `intakeEnabledAt` cutoff stored in `EmailSyncState`; new column defaults mean pre-existing rows are treated as `SKIPPED/HISTORICAL`-equivalent *without writing to them* (nullable `intakeStatus` = "not part of the intake flow"). 
- Staff can still link historic emails manually via the existing Lead association. A per-email "Create Lead from this email" action is a possible later feature (D5).

## 20. Testing Strategy

Conventions (CONFIRMED): Vitest, real Postgres for service tests (`imap-sync.service.test.ts` pattern), injectable `fetchFn` seam, F-03 tests that assert no `unhandledRejection`. Follow `.claude/rules/testing.md` (no filtered output; full suite + typecheck before completion).

| Area | Cases |
|---|---|
| **Parsing (pure unit)** — extract a `parseRawMessage()` from `imap-client.ts` (currently untestable without network) | text-only, HTML-only, multipart, empty body, no Message-ID, malformed From, multiple From, display name with commas/quotes, header extraction (auto-submitted, list-unsubscribe) |
| **Ingestion** | new email; duplicate fetch; duplicate across two concurrent syncs; missing Message-ID → synthetic id stable across runs; Message-ID collision with different content; mailbox reset (new UIDVALIDITY) does not discard new mail; >50 burst fully ingested (E1 regression) |
| **Cursor/state** | cursor advances only over contiguous persisted prefix; blocked by Email-persist failure, not blocked by promotion failure; UIDVALIDITY change; restart mid-batch |
| **Eligibility** | internal domain, self, bounce, auto-reply, bulk, no-reply, historical, normal external |
| **Lead matching** | exact one → attach; none → create with derived name/null phone/org; two Leads same email → leadId null; case/whitespace variants; thread inheritance from alias; internal address → no Lead; **existing channels unchanged** (reuse `contact-messages.lead-matching.test.ts` unmodified as the regression guard) |
| **Threading** | new conversation; reply via In-Reply-To; reply via References only; reply to SENT row; forwarded (no thread) |
| **Transactions** | Lead create fails → no Lead/ContactMessage, Email PENDING; ContactMessage fails → Lead rolled back; notification rejects → persistence intact + logged once (mirror F-03 tests); realtime throws → sync continues |
| **Concurrency** | two sync runs → one wins lock; two emails same new address in one batch → one Lead; sync vs. website submission (document residual) |
| **Reliability** | IMAP connect/auth failure sets `lastError`, no cursor change; backoff reset on success |
| **Security** | `sanitizeEmailHtml`: `<script>`, `onerror`, `javascript:` href, `<img src=http://…>`, `<svg onload>`, data URIs, `target=_blank` gets `rel`; spoofed-From flagged; very long subject/name truncation |
| **Realtime/permissions** | `contact_message_created` emitted once per batch; ADMIN socket joins room; role with `lead:read` but no `chat:read` documented behavior |
| **Regression** | full `apps/api` suite; the documented pre-existing failures (IMAP-not-configured ×5, etc., see F-04 report) must not be mistaken for regressions — compare against baseline |

## 21. Staged Implementation Plan

| # | Phase | Scope | Likely files | Schema/migration | Tests | Deploy / rollback | Depends on |
|---|---|---|---|---|---|---|---|
| 1 | **Foundation** | `EmailSyncState` + `Email.intakeStatus/intakeReason` (nullable, additive) | `schema.prisma`, 1 new migration | additive migration only; **no backfill** | schema-level/service tests | Run migration; rollback = unused columns/table are harmless | — (needs D5) |
| 2 | **Parse + idempotency** | Extract `parseRawMessage`; header capture; synthetic Message-ID; collision guard; UID-range fetch (replaces `slice(-50)`), `uidvalidity` read | `imap-client.ts`, `imap-sync.service.ts`, `email-normalize.util.ts` | none | parsing + ingestion + E1/E2 regressions | Still manual-trigger; fixes data-loss bugs even without Lead flow; rollback = revert code | 1 |
| 3 | **Cursor & single-flight** | Persist cursor, advisory run lock, backoff state | `imap-sync.service.ts`, new sync-state helper | uses Phase 1 | cursor/restart/concurrency | manual endpoint returns "already running" | 1,2 |
| 4 | **Eligibility + threading** | Pure eligibility fn; In-Reply-To/References → `parentEmailId` | new `email-eligibility.ts`, `email-threading.ts` | none | eligibility + threading | Safe: still no ContactMessage created | 2 |
| 5 | **Lead + ContactMessage promotion** | `EMAIL_EXACT` strategy seam in `ContactMessagesService.create`, promotion tx, advisory identity lock, `intakeStatus` outcomes, retry sweep | `contact-messages.service.ts` (opt-in param), `lead-matching.ts` (additive helper), `emails` module | none | lead matching, transactions, regression of existing channels | **Feature flag off by default**; rollback = flag off (rows already created remain valid ContactMessages) | 1–4 |
| 6 | **Notification + realtime** | Post-commit `notifyNewContactMessage`, per-batch `publishContactMessageCreated`, burst coalescing | `emails` module | none | F-03-style failure tests, realtime emit | Same flag | 5 |
| 7 | **Automatic sync** | In-process poller, enable flag, interval, observability logging | new provider in `emails.module.ts`, env schema in `packages/config` | none | poller lifecycle, overlap | Add env var on VPS; recreate `medcal-api`; rollback = flag off | 3,5,6 |
| 8 | **Historical decision** | Only if confirmed (D5): manual "create lead from email" | UI + service | none | — | — | 5 |
| 9 | **Hardening** | DOMPurify `rel` hook, Authentication-Results flagging, FAILED-email visibility, `Lead.email` duplicate report | portal `sanitize-html.ts`, parse | none | security tests | — | 2 |

Each phase is independently shippable; Phases 2–3 deliver value (fix silent loss) even if 5–7 are deferred.

## 22. Decisions Requiring Confirmation

| ID | Decision | Recommendation |
|---|---|---|
| **D1** | The locked Email plan states *"leadId is NEVER automatically set"* (`Email.leadId` = staff-confirmed only). The new flow auto-creates/attaches **`ContactMessage.leadId`**. Should `Email.leadId` stay staff-confirmed (so existing "confirmed lead history" semantics are untouched) with the auto-association living only on `ContactMessage.leadId`? | Yes — keep `Email.leadId` staff-only; surface auto-linked mail in the Lead view via `contactMessage`. |
| **D2** | Approve the two additive schema changes (`EmailSyncState`, `Email.intakeStatus/intakeReason`)? Without them, retry/skip state cannot be made safe. | Approve. |
| **D3** | Shared/generic inboxes: one Lead per sender address (generic addresses merge people into one Lead) vs. require extra signal? | Accept one Lead per exact address; Needs Review only on true ambiguity. |
| **D4** | Eligibility policy: do **all** external human emails (including replies in known threads) become ContactMessages, and are the skip classes in §10 right (internal, bounce, auto-reply, bulk, no-reply)? | Yes, per §10. |
| **D5** | Historical emails: future-only (recommended) or also allow staff-initiated conversion of existing rows? | Future-only; optional manual action later. |
| **D6** | Automatic sync: in-process polling (60 s), disabled by default, enabled per environment — accepted? Notification policy for bursts (coalesce above a threshold)? | Accept; coalesce above ~5 per batch. |
| **D7** | Forwarded mail: treat the forwarder as the sender (recommended) vs. attempt to extract the original customer? | Forwarder = sender; no extraction. |
| **D8** | Replies from an unknown address inside a known thread inherit that thread's Lead — accepted (also covers alias addresses)? | Accept. |

Not asked (answerable from code): whether `EMAIL` exists in the enum (it does), whether the realtime event can be reused (it can), whether a cursor exists (it does not), the permissions grants (verified), whether polling can reach the gateway (only in-process).

## 23. Risks and Trade-offs

| Risk | Detail | Mitigation |
|---|---|---|
| Behavior change to a locked Email rule | D1 | Keep `Email.leadId` untouched; document |
| Auto-created Lead noise | Newsletters/OOO/forwards slip past header heuristics | Closed eligibility list, `intakeReason` visibility, Lead status `REJECTED` exists for staff cleanup |
| Duplicate Leads | Website vs. email race, pre-existing duplicate Leads | Advisory locks for the email path; duplicate report; no unique index yet |
| Notification flood on first run / outage recovery | Many promotions at once | Cutoff, coalescing, per-batch cap |
| First-run enablement on VPS | Wrong cutoff would promote old mail | Cursor set to current max UID + `intakeEnabledAt`; flag default off; dry-run log mode |
| Dev environment ingestion | Dev with prod IMAP creds would create Leads in dev DB | Enable flag off by default |
| `node-imap` specifics (`uidvalidity`, UID search) not exercised in repo | Library-version behavior | Verify with a real mailbox in Phase 2; integration test against fake IMAP is optional |
| Hostinger limits / IDLE behavior / spam filtering | UNKNOWN | Poll interval configurable; start at 60 s |
| `findLeadMatchCandidates` loads all Leads | Slow as Leads grow | Email path queries by email; wider optimization out of scope |
| Attachments invisible | Customers' attachments (e.g., device lists) are dropped silently | Surface count/names later; flagged to owner |
| Permissions are DB-driven | Prod grants UNKNOWN | Verify with read-only query before enabling |
| Existing known unrelated suite failures | IMAP-not-configured tests etc. | Compare to baseline before blaming this work |

---

## Appendix A — Read-only data checks for the owner (not run here)

```sql
-- existing Email volume and state
select folder, count(*) from "Email" group by 1;
select count(*) filter (where "contactMessageId" is null) as no_cm,
       count(*) filter (where "leadId" is not null)        as confirmed_lead,
       count(*) filter (where "suggestedLeadId" is not null) as suggested,
       count(*) filter (where "messageId" like 'uid-%')    as uid_fallback_ids
from "Email" where folder = 'INBOX';

-- duplicate Lead emails (informs D3 / any future unique index)
select lower(trim(email)) as e, count(*) from "Lead" group by 1 having count(*) > 1;

-- production grants for the realtime room vs page access
select role, resource, action from "RolePermission"
where resource in ('chat','lead','contactMessage','email') order by 1,2,3;
```
`uid_fallback_ids > 0` would directly show real exposure to finding E2.

## Appendix B — Out of Scope / Not Implemented

FCM changes; RBAC redesign; `/leads` routing; Socket.IO changes; Lead merge; quote/signature stripping; attachment storage; spam scoring; IMAP IDLE; multi-mailbox; any schema, migration, route, UI or source change in this task.
