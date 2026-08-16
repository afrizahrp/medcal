# Lead Inbox Design Review

> Review-only. No code, schema, migrations, or files modified. Verified directly against the current repository state (`d:\medcal`) as of 2026-08-16 — schema file, migration history, `apps/api` application code, RBAC catalog, and locked documentation (`docs/claude/lead-management/lead-inbox.md`, `docs/claude/lead-management/final-before-locked.md`, `docs/Architecture/01-bipmed-medcal-architecture-adoption-matrix.md`). Distinguishes **CURRENT CODE** from **DOCUMENTED INTENT** throughout, per your instruction not to assume docs are newer than the schema.
>
> **All decisions confirmed 2026-08-16.** Decision 1 (Lead → 1:N aggregate) = **YES**; Decision 2 (identity field placement) = **Option B, denormalized snapshot on Lead**; Decision 3 (assignment in scope for v1) = **NO, deferred**; Decision 4 (unread tracking via `ContactStatus`) = **YES**; Decision 5 (RBAC granularity) = **Option B, per-verb**; identity-matching auto-attach on STRONG MATCH = **YES**; matching scope = **exact normalized fields only, no fuzzy matching**. Every section below reflects the final, fully-locked design — nothing remains open.

---

## 1. Current State

**Lead — schema only, zero application code.**

```prisma
model Lead {
  id               String     @id @default(cuid())
  companyId        String
  contactMessageId String?    @unique
  status           LeadStatus @default(NEW)
  assignedToUserId String?
  customerId       String?
  createdAt        DateTime   @default(now())
  updatedAt        DateTime   @updatedAt

  company             Company              @relation(fields: [companyId], references: [id], onDelete: Cascade)
  contactMessage      ContactMessage?      @relation(fields: [contactMessageId], references: [id])
  assignedTo          User?                @relation("LeadAssignee", fields: [assignedToUserId], references: [id])
  customer            Customer?            @relation(fields: [customerId], references: [id])
  calibrationRequests CalibrationRequest[]

  @@index([companyId, status])
}
```

- `contactMessageId` is `@unique` → **hard 1:1 cap today**, not 1:N.
- No identity fields on `Lead` itself (no name/email/phone/org) — identity lives entirely on `ContactMessage`.
- No `apps/api/src/modules/lead*` directory exists. Confirmed via full-repo grep: zero controllers, zero services, zero endpoints touch `Lead`. It is pure schema.

**ContactMessage — real, evolved past the last audit's snapshot.**

```prisma
model ContactMessage {
  id                String         @id @default(cuid())
  companyId         String
  getFrom           GetMessageFrom @default(CONTACTFORM)
  status            ContactStatus  @default(PENDING)
  subject           String?
  topicId           Int?
  message           String
  name              String
  email             String
  phone             String?
  organizationName  String?
  utmJson           Json?
  matchStatus       MatchStatus    @default(NONE)
  matchedCustomerId String?
  confirmedByUserId String?
  confirmedAt       DateTime?
  createdAt         DateTime       @default(now())
  updatedAt         DateTime       @updatedAt

  company         Company       @relation(fields: [companyId], references: [id], onDelete: Cascade)
  matchedCustomer Customer?     @relation("ContactMatchCandidate", fields: [matchedCustomerId], references: [id])
  lead            Lead?
  confirmedBy     User?         @relation("MatchConfirmer", fields: [confirmedByUserId], references: [id])
  topic           ContactTopic? @relation(fields: [topicId], references: [id], onDelete: SetNull)

  @@index([companyId, createdAt])
  @@index([companyId, email])
  @@index([companyId, status])
  @@index([companyId, getFrom])
}
```

- **`topicId` is no longer orphaned.** `docs/claude/lead-management/lead-inbox.md` (Decision 6) flagged it as an "orphaned Int, no model" — that was true when the doc was written, but the Contact Form implementation work since then added a real `ContactTopic` model with a proper FK (`onDelete: SetNull`). **This decision is already resolved by code, superseding the doc.**
- `matchStatus`/`matchedCustomerId`/`confirmedByUserId`/`confirmedAt` genuinely exist in both `schema.prisma` and the applied `init` migration — not aspirational.
- `ContactMessagesService.create()` **already runs identity-matching logic today**, but only for **ContactMessage → Customer** dedup, not ContactMessage → Lead: exact email match against `CustomerContact` → `matchStatus = EXACT_EMAIL`; non-public-domain suffix match → `matchStatus = DOMAIN_CANDIDATE`; otherwise `NONE`. This is real, running code — the closest existing precedent for any matching logic in the system, and it only compares **email**, never phone/name/organization.
- `confirmedByUserId`/`confirmedAt` are write targets with no writer yet — no confirm/merge endpoint exists in `apps/api`. The fields are provisioned but the "mandatory admin confirmation before merge" step from the locked Adoption Matrix rule is not implemented.
- `ContactMessage.lead` is the implicit inverse of `Lead.contactMessageId` — no separate FK column lives on `ContactMessage` itself.

**ContactTopic — real, global, already shipped.**

```prisma
model ContactTopic {
  id        Int      @id @default(autoincrement())
  name      String   @unique
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  messages ContactMessage[]

  @@index([isActive])
}
```
No `companyId` — intentionally global lookup data, seeded once, no admin CRUD by design.

**Customer — real, unrelated matching logic lives outside it (no dedicated module).**

```prisma
model Customer {
  id, companyId, name, legalName?, taxId?, address?, status: CustomerStatus @default(ACTIVE)
  contacts CustomerContact[], userLinks CustomerUserLink[], devices Device[]
  leads Lead[], matchedMessages ContactMessage[] @relation("ContactMatchCandidate")
  calibrationRequests, quotations, workOrders, certificates, invoices, creditNotes, reminderEvents, fileObjects
  @@index([companyId, status])
  @@index([companyId, name])
}
```
No `apps/api/src/modules/customer*` exists — `Customer` is Prisma-model-only. The email-matching logic that does exist is inline in `ContactMessagesService`, not a reusable `CustomerService.findByEmail()`-style method.

**Enums (current code):**
```prisma
enum LeadStatus     { NEW, CONTACTED, QUALIFIED, REJECTED, CONVERTED }
enum ContactStatus  { PENDING, READ, REPLIED, CLOSED }
enum GetMessageFrom { CONTACTFORM, WHATSAPP, CHAT_AI, CHAT_PERSON, EMAIL }
```
`MatchStatus` also exists (values observed in service logic: `NONE` default, `DOMAIN_CANDIDATE`, `EXACT_EMAIL`) — a third, distinct status axis from the two above.

**API surface today (apps/api):**
- `POST internal/contact-messages` — `@AllowAnonymous() + InternalServiceGuard`, `companyId` from `@CompanyId()` decorator (`process.env.COMPANY_ID` only, never client input).
- `GET contact-messages` — `@RequirePermission("contactMessage","read") + CompanyRoleGuard`, `service.findAll(companyId)` = **unpaginated, unfiltered, unsearched `findMany` ordered by `createdAt desc`.** No list controls exist at all today.
- `GET contact-topics` — `@AllowAnonymous()`, public reference data.
- No mutation endpoints exist for `ContactMessage.status`, no confirm/merge endpoint, no Lead endpoints whatsoever.

**RBAC catalog (`packages/auth/src/access-control.ts`):** only two resources are defined —
```
contactMessage: ["read"]
whitelist: ["manage"]
```
`SUPERADMIN` → both; `ADMIN` → `contactMessage:read`; everyone else → neither. **There is zero `lead:*` permission scaffolding today.**

**Guards:** `CompanyRoleGuard` derives `companyId` from the session's `UserMembership` (never client input); `InternalServiceGuard` derives it from `process.env.COMPANY_ID` and validates a shared secret header, explicitly documented as having removed a prior client-supplied `x-company-id` header as an "unnecessary trust surface." Both are already correct for this design — no changes needed here.

**Assignment/PIC:** no concept exists anywhere in application code. `Lead.assignedToUserId` is schema-only, unused. No `WorkOrderAssignment`-style dedicated table exists for Lead.

**Unread tracking:** none beyond `ContactStatus` itself — no per-user read table, no `isRead`/`readAt` field.

**Web Chat:** `ChatSession`/`ChatMessage`/`ChatTopic` do not exist anywhere in the schema (confirmed by full-file grep — zero matches). This is 100% future work, not partially built.

---

## 2. Locked Decisions

Pulled from `docs/claude/lead-management/lead-inbox.md` §9 and `docs/Architecture/01-bipmed-medcal-architecture-adoption-matrix.md`, cross-checked against current code:

| # | Decision | Status |
|---|---|---|
| 1 | Lead as 1:N multi-channel aggregate vs. today's 1:1 (`contactMessageId @unique`) | **CONFIRMED 2026-08-16 — YES, reverse to 1:N** (§3 Option B) |
| 2 | Where the prospect's organization name (and other identity fields) lives long-term | **CONFIRMED 2026-08-16 — Option B, denormalized snapshot on `Lead`**, source-of-truth stays on `ContactMessage` |
| 3 | Whether `Lead.assignedToUserId` (ownership) is in scope for v1 | **CONFIRMED 2026-08-16 — NO, deferred past v1** |
| 4 | Whether unread/new tracking is in scope for v1 | **CONFIRMED 2026-08-16 — YES, reuse `ContactStatus.PENDING→READ`** |
| 5 | RBAC granularity for Lead (`lead:read/update/assign` vs. single `lead:manage`) | **CONFIRMED 2026-08-16 — Option B, per-verb** (`lead:read`, `lead:update`; no `lead:assign` in v1 per Decision 3) |
| 6 | `topicId` — drop or build a real Topic table | **RESOLVED by code, not docs** — `ContactTopic` shipped with a real FK since the doc was written |
| 7 | Internal-trust pattern for future inbound-channel webhooks | Adjacent, out of scope for Lead Inbox itself |
| — | Web Chat is MVP, human-only, no AI mode, no `mode` field | **LOCKED** (Adoption Matrix + `final-before-locked.md`) |
| — | Chat expressing service intent links to/creates `ContactMessage` with `getFrom=CHAT_PERSON` | **LOCKED** (Adoption Matrix, "per MedCal's own already-locked D04 rule") |
| — | Visitor/anonymous chat identity: no durable Better Auth anon user; a narrowly scoped, revocable, non-authenticating signed chat-session cookie only | **LOCKED** (`final-before-locked.md`, explicit and detailed) |
| — | Lead/Customer dedup: email-domain match + mandatory admin confirmation before merge, no silent auto-merge | **LOCKED** (Adoption Matrix) — **partially implemented**: the matching computation exists (`matchStatus`), the confirmation step does not (no endpoint writes `confirmedByUserId`/`confirmedAt`) |

---

## 3. Proposed Lead Aggregate

Given Decision 1 is open and the schema is currently 1:1, three shapes were evaluated:

**Option A — reverse the relation, keep identity on ContactMessage only.**
`ContactMessage.leadId String?` (FK to `Lead`, replacing the current `Lead.contactMessageId @unique`). `Lead` gains no new fields beyond what it has. Lead's own row stays a thin aggregate root — pure status/assignment/customer-link — with all identity (`name`/`email`/`phone`/`organizationName`) read by joining to whichever `ContactMessage` rows are attached. Cheapest schema change (one FK direction flip), matches Decision 2's "keep on ContactMessage" branch.

**Option B — reverse the relation, promote a denormalized identity snapshot onto Lead.**
Same FK flip as A, plus `Lead.name`/`Lead.phone`/`Lead.organizationName`/`Lead.email` populated at Lead-creation time from the first `ContactMessage`, used as the inbox list's display source of truth (cheap to query, no join needed for the list view) while individual `ContactMessage` rows retain their own values as the historical record of what was actually submitted on each interaction. Matches Decision 2's "promote a copy" branch, which the docs already lean toward.

**Confirmed: Option B.** The Lead Inbox MVP (§5 below) is fundamentally a list view — a denormalized identity snapshot on `Lead` avoids an N+1 join on every inbox render and matches how BIPMED's own (single-channel) inbox worked, per the earlier reference audit. The historical/audit trail still lives correctly on each `ContactMessage`, so nothing is lost — only a display-convenience copy is added. `Lead.name`/`Lead.email`/`Lead.phone`/`Lead.organizationName` are populated from the first `ContactMessage` at Lead-creation time (§7 item 2).

---

## 4. Identity Matching

**This is explicitly the least-evidenced area.** The only existing precedent in the codebase is `ContactMessagesService.create()`'s Customer-dedup logic, and it is narrow: **email only** (exact match, or public-domain-excluded suffix match), no phone, no name, no organization. There is no existing phone-normalization, no fuzzy-name comparison, nothing that resembles the "phone + organization + name" tiered model your prompt hypothesizes. Nothing in `docs/claude/lead-management/lead-inbox.md` or the Adoption Matrix specifies attach rules for ContactMessage→Lead — only the separate ContactMessage→Customer dedup rule is locked.

Given that, here is a proposed tiered matching design, offered as a **starting hypothesis for your confirmation, not a locked rule**:

- **Normalize before comparing:** phone (strip formatting to a canonical `+62...` digit string — the form currently collects raw strings like `"08xx-xxxx-xxxx"` with zero normalization applied anywhere today), email (lowercase, trim), organization name (lowercase, trim, collapse whitespace — no stemming/fuzzy matching for MVP).
- **Exact match only for MVP** on every field compared (confirmed 2026-08-16 — no fuzzy/similarity matching). Nothing in the repo today does fuzzy string comparison, and introducing it would be new infrastructure disproportionate to an MVP inbox.
- **STRONG MATCH** — normalized phone matches AND normalized organization matches → auto-attach to that Lead.
- **POSSIBLE MATCH** — normalized phone matches but organization doesn't (or vice versa), or email matches but neither phone nor org does → do not auto-attach; flag on the new `ContactMessage` (or surface in the inbox) as "possible duplicate of Lead #X," require a staff click to confirm/attach.
- **NO MATCH** — nothing matches → create a new `Lead`.
- **Multiple candidates match** → do not auto-attach to any; always fall into POSSIBLE MATCH with all candidates listed, require staff to pick one or create new.

This mirrors the already-locked Customer dedup philosophy ("no silent auto-merge... mandatory admin confirmation") extended one layer earlier, which is the one real precedent this codebase has for identity-matching risk tolerance.

**Confirmed 2026-08-16** — the tiered design above is locked as-is: STRONG MATCH auto-attaches, POSSIBLE MATCH requires staff confirmation, NO MATCH creates a new Lead, exact-normalized-match only (no fuzzy matching). See §10 for the final record.

---

## 5. Lead Inbox MVP

Reviewing the field list against what's actually populated today:

| Field | Justified? | Note |
|---|---|---|
| Date | Yes | `ContactMessage.createdAt` / proposed `Lead.createdAt` |
| Name | Yes | Real field, populated on every submission |
| Email | Yes | Real field, required on the form |
| Phone | Yes | Real field, optional on the form |
| Prospect Company | Yes | `organizationName`, optional |
| Topic | Yes | Real FK now (`ContactTopic`), resolved per §2 |
| Source | Yes | `getFrom` enum, already populated correctly |
| Lead Status | Yes | `LeadStatus` enum exists, unused today |
| Assigned PIC | **Deferred (Decision 3 = No)** | Not in v1 — no assign endpoint, no column consumed |
| Unread indicator | **Yes (Decision 4 = Yes)** | Reuses `ContactStatus.PENDING→READ`, no new field |
| Last interaction | **Yes (Decision 1 = Yes)** | Meaningful now that Lead is confirmed 1:N |

**Proposed MVP shape** (small, matches the "keep it deliberately small" instruction):
- **List:** paginated (cursor or offset — either is fine, no existing pagination pattern elsewhere in `apps/api` to match against, so this is a free choice), server-side search on name/email/phone/organization (simple `ILIKE`, no full-text search infra needed), filters on `LeadStatus` + `getFrom` (source) + `ContactTopic`, sort by `createdAt` (newest first, default) — no other sort justified for MVP.
- **Detail view:** the Lead's identity snapshot + its attached `ContactMessage`(s) as a simple reverse-chronological timeline (trivial under Option B's schema; a single row under today's 1:1 schema).
- **Read/unread:** in scope (Decision 4 = Yes). Reuses `ContactStatus.PENDING→READ` exactly as it already exists (matches BIPMED's own confirmed manual-only behavior) — no new field needed.
- **Status transitions:** `LeadStatus` (`NEW→CONTACTED→QUALIFIED→REJECTED|CONVERTED`) is staff-driven via a dropdown/action, no auto-transitions — consistent with how `ContactStatus` already behaves in the reference comparison (manual only, no auto-READ-on-open).
- **Assignment:** deferred (Decision 3 = No). No assign dropdown, no `PATCH .../assign` endpoint, no `lead:assign` permission in v1 — `Lead.assignedToUserId` stays unused, revisit post-MVP once notification/ownership semantics are designed.

Explicitly **not proposed**, matching your instruction and consistent with the absence of any evidence for them in the repo: tags, priority, deal value, scoring, pipeline stages beyond `LeadStatus`, generic "activity" abstraction.

---

## 6. Web Chat Relationship

The locked direction (`final-before-locked.md`, Adoption Matrix) is: `ChatSession` → many `ChatMessage`, human-only, no AI mode, no `mode` field; a chat expressing service intent creates/links a `ContactMessage` with `getFrom=CHAT_PERSON`. **None of this exists in the schema yet** — confirmed by full-file grep, zero `Chat*` models present.

This relationship is **sufficient for the Lead Inbox design as scoped**, on one condition: Lead Inbox must be built against `ContactMessage` as the unified interaction record (per your explicit standing principle), not against `ChatSession` directly. Once `ChatSession`/`ChatMessage` are eventually built, a chat-originated `ContactMessage(getFrom=CHAT_PERSON)` should flow through the exact same Lead-matching logic proposed in §4 — no separate chat-specific matching path is justified, since `ContactMessage` is already the deliberate convergence point for all channels. This is a reason to build the Lead↔ContactMessage relationship (§3) generically now, so Web Chat has nothing special to integrate with later beyond emitting a normal `ContactMessage` row.

No part of this review proposes building `ChatSession`/`ChatMessage` — that remains explicitly future/out-of-scope work, consistent with your instructions.

---

## 7. Required Schema Changes

Only changes with a stated reason — nothing speculative:

1. **`ContactMessage.leadId String?` replacing `Lead.contactMessageId String? @unique`** (FK direction reversed, uniqueness removed) — required now that Decision 1 = Yes (Option B, §3). *Why:* the current unique constraint is what structurally caps Lead at 1:1; there is no way to represent multi-channel aggregation without this change.
2. **`Lead.name`, `Lead.email`, `Lead.phone`, `Lead.organizationName`** (denormalized snapshot, all nullable except perhaps name) — *Why:* avoids an N+1 join for the inbox list view; implements Decision 2 (confirmed Option B).
3. **Normalized-phone column** (e.g. `ContactMessage.phoneNormalized String?`, computed at write time) — *Why:* the matching design in §4 requires comparing normalized values; storing it avoids re-normalizing on every match query. A normalized-organization comparison value (lowercase/trim/collapse-whitespace) can be computed inline at query time rather than stored, since it's a simple deterministic transform of `organizationName`, not a fixed-format field like phone.
4. **Index to support Lead Inbox search/filter** — e.g. `@@index([companyId, status])` on `Lead` already exists; would additionally want something like `@@index([companyId, createdAt])` to support the default sort, mirroring the pattern already used on `ContactMessage`. *Why:* consistent with existing indexing conventions in this schema (every list-shaped query in this codebase already has a matching companyId-scoped index).
5. **`Lead.assignedToUserId`** — already exists, no schema change needed. **Deferred (Decision 3 = No)** — not wired to application code in v1.
6. No new field is proposed for unread tracking — reusing `ContactMessage.status` (`ContactStatus`) is sufficient (Decision 4 = Yes, §5); a new field is not justified by evidence.

Nothing else. No new tables (no separate "match candidate" table, no "assignment history" table) — none are justified by the current evidence or by the "avoid speculative abstractions" instruction.

---

## 8. Required API Changes

**Existing, reusable as-is:** `GET contact-topics`, `CompanyRoleGuard`, `InternalServiceGuard`, the `contactMessageCreateSchema` Zod pattern, the `@RequirePermission` decorator pattern.

**New, minimum set for Lead Inbox:**
- `GET leads` — paginated, search (name/email/phone/organizationName), filter (`status`, `getFrom`, `topicId`), sort by `createdAt`. Mirrors the shape `contact-messages`' `findAll` should have had but doesn't — this is also an opportunity to note `ContactMessagesService.findAll()` itself has no pagination/search/filter today, a pre-existing gap this work would otherwise need to solve twice.
- `GET leads/:id` — detail + attached `ContactMessage` timeline (real 1:N under the now-confirmed Decision 1 schema change).
- `PATCH leads/:id/status` — `LeadStatus` transition, staff-driven.
- `PATCH leads/:id/assign` — **deferred, not built in v1** (Decision 3 = No).
- `PATCH contact-messages/:id/status` — mark `PENDING→READ` etc., needed now that Decision 4 = Yes.
- The create path (`ContactMessagesService.create`) needs the §4 matching logic added — this is a service-layer change to an existing method, not a new endpoint.

No confirm/merge endpoint for Customer dedup is proposed here — that's the separately-locked, separately-unimplemented Customer conversion flow, out of this review's scope per your instructions (§5: "Do NOT invent automatic customer conversion").

---

## 9. Security / RBAC

No `lead:*` permission exists today — `packages/auth/src/access-control.ts` defines only `contactMessage:["read"]` and `whitelist:["manage"]`. Building Lead Inbox requires **at minimum** a `read` action on a new `lead` resource, gated the same way `contactMessage:read` is today (`CompanyRoleGuard`, session/membership-derived `companyId`, never client input — this pattern is already correct and should be reused unchanged).

**Confirmed 2026-08-16 — Decision 5: Option B, per-verb.** `packages/auth/src/access-control.ts` gains a `lead` resource with `["read", "update"]` actions (no `assign` in v1, per Decision 3). This matches how `contactMessage` was already scoped (single `read` action, granted only where a real endpoint exists) rather than a blanket `manage` — adding exactly as many actions as there are mutating endpoints in v1 (`GET leads`/`GET leads/:id` → `read`; `PATCH leads/:id/status` → `update`).

No new guard type is needed — `CompanyRoleGuard` already does exactly the tenant-isolation job Lead Inbox needs, and `InternalServiceGuard`'s pattern (shared secret, `companyId` from `process.env` only) is already correct for any future inbound-channel write path.

---

## 10. Decisions — Final Record (all confirmed 2026-08-16)

**Decision 1 — Lead as multi-channel aggregate.** **Option B: reverse to 1:N** (`ContactMessage.leadId`, per §3). Matches the stated design principle ("One Lead may have MANY ContactMessages"); schema change is small and additive (one FK direction flip, no data loss).

**Decision 2 — Where prospect identity fields live.** **Option B: denormalized snapshot copy on `Lead`** (§3), source-of-truth stays on `ContactMessage`. Avoids N+1 joins on the inbox list.

**Decision 3 — Is Lead assignment (`assignedToUserId`) in scope for v1?** **Option B: deferred.** Lead Inbox v1 is read + status-only; no `PATCH leads/:id/assign` endpoint, no `lead:assign` permission, `Lead.assignedToUserId` stays unused for v1 (§5, §7 item 5, §8, §9 all reflect this).

**Decision 4 — Is unread/new tracking in scope for v1?** **Option A: yes.** Reuses `ContactStatus.PENDING→READ` as the unread signal (§5, §7 item 6) — free, no schema change required.

**Decision 5 — RBAC granularity.** **Option B: per-verb** (`lead:read`, `lead:update`; no `lead:assign` in v1 per Decision 3) — matches how `contactMessage` was already scoped (§9).

**Identity matching auto-attach behavior.** **Option A:** STRONG MATCH (normalized phone + organization both match) auto-attaches to the existing `Lead`; POSSIBLE MATCH always requires staff confirmation; NO MATCH creates a new `Lead`. Honors the locked "no silent auto-merge" principle for the genuinely ambiguous case.

**Field normalization scope for matching.** **Option A: exact match only** on normalized phone/email/organization (§4) — no fuzzy/similarity matching in v1. Consistent with the existing (email-only) matching precedent in `ContactMessagesService`; no fuzzy-matching infrastructure exists anywhere in this codebase today.

Nothing remains open. This section is a record of what was decided, not a request.

---

## 11. Recommended Implementation Order

A dependency-ordered sequence. All decisions (§10) are confirmed — this is now ready to execute once you give the go-ahead to move from review into implementation.

1. **Schema migration** — reverse the Lead↔ContactMessage relation (§7 item 1), add the identity snapshot fields `Lead.name/email/phone/organizationName` (§7 item 2), add `ContactMessage.phoneNormalized` (§7 item 3), add the supporting index (§7 item 4).
2. **RBAC catalog** — add the `lead` resource with `["read", "update"]` actions (§9), before any Lead endpoint exists to gate.
3. **Lead module (apps/api)** — `LeadsController`/`LeadsService`, `GET leads` (list, search, filter, paginate), `GET leads/:id` (detail + timeline), `PATCH leads/:id/status`. No assign endpoint in v1. Reuse `CompanyRoleGuard` unchanged.
4. **Matching logic in `ContactMessagesService.create`** — implement the §4 tiered comparison, write `leadId` on STRONG MATCH, otherwise flag POSSIBLE/create new Lead. Sequenced after the Lead module exists so it has something to attach to.
5. **`PATCH contact-messages/:id/status`** — needed for the confirmed unread-via-`ContactStatus` mechanism (§5).
6. **Lead Inbox UI** — list/detail/filters/search per §5 (no assignment UI in v1), built last since it's the only piece with no backend dependency risk once steps 1–5 exist.

Deferred, revisit post-MVP: Lead assignment (`assignedToUserId` wiring, `PATCH .../assign`, `lead:assign` permission) — Decision 3.

Web Chat (`ChatSession`/`ChatMessage`) and the Customer-merge confirmation endpoint remain explicitly out of this sequence — both are separately scoped, not-yet-designed work per your instructions.
