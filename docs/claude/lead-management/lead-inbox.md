## Summary

This is a comprehensive read-only audit. Nothing was modified. Findings below are organized by your six focus areas, with exact file paths and verbatim quotes.

---

### 1. Existing "Lead Inbox" UI — searched `apps/web`, `apps/portal`, `apps/tech-pwa`

**`apps/portal`** **is confirmed still a skeleton, including the** **`management`****/****`client`** **route groups (note: it's a route-group split, not literally** **`(management)`** **parenthesized — see below).**

- `d:\medcal\apps\portal\src\app\management\page.tsx` — entire content:

```
export default function ManagementHome() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-xl font-semibold">Management dashboard</h1>
      <p className="mt-2 text-slate-600">Skeleton — F6 foundation only, business modules land later.</p>
    </main>
  );
}

```

- `d:\medcal\apps\portal\src\app\client\page.tsx` — same pattern, "Customer portal … Skeleton — F6 foundation only, business modules land later."
- `d:\medcal\apps\portal\src\app\management\nav-config.ts` — exactly **one** nav item: `{ label: "Dashboard", href: "/", roles: [...] }`. No "Lead"/"Inbox" nav entry exists anywhere.
- `d:\medcal\apps\portal\src\app\management\layout.tsx` / `client\layout.tsx` — real, working header/session-gate chrome (email + role display, sign-out button, role-filtered nav), but the `<main>{children}</main>` body renders only the one-line skeleton page above. This is real infrastructure (auth-gated shell), not a placeholder page itself — but there is no inbox/table/list content behind it.
- `d:\medcal\apps\portal\src\proxy.ts` — real host-based routing (`apps.*` → `/management`, `portal.*` → `/client`) via Next.js 16 `proxy.ts` (renamed from `middleware.ts`). Note: the routes are literal path segments `app/management/` and `app/client/`, **not** a parenthesized `app/(management)/` route group — the F6 section of `02-foundation-implementation-plan.md` explicitly notes "parenthesized route groups are invisible to the URL and cannot be rewrite targets," so a literal folder was used instead.
- The "Fase-0 skeleton … Better Auth + inbox ContactMessage menyusul" placeholder text you described is **no longer present** — F6 replaced the bare Fase-0 stub with working sign-in/session/host-routing chrome, but the page body text is still explicitly a skeleton ("business modules land later").

**No inbox/contact-message list, table, filters, search, pagination, status badges, source/channel display, or assignment UI exists anywhere in** **`apps/portal`****,** **`apps/web`****, or** **`apps/tech-pwa`****.** Grep for `inbox|ContactMessage|Lead|conversation|assign|ChatSession|ChatMessage` across `apps/web/src` matched only marketing-site files (WhatsApp FAB, contact form, service pages) — no list/table/filter component exists. `apps/tech-pwa/src` contains only sign-in/session skeleton files, nothing lead-related.

**Backend-side note (relevant context, not UI):** `d:\medcal\apps\api\src\modules\contact-messages\contact-messages-query.controller.ts` exposes `GET /contact-messages` returning `ContactMessagesService.findAll(companyId)` — a plain `prisma.contactMessage.findMany({ where: { companyId }, orderBy: { createdAt: "desc" } })` with **no query params, no status filter, no search, no pagination** (`d:\medcal\apps\api\src\modules\contact-messages\contact-messages.service.ts`). So even the API has no filter/search/pagination support yet — a real inbox UI would need backend work too, not just frontend.

---

### 2. WhatsApp integration

`d:\medcal\packages\notifications\src\whatsapp\index.ts` — full file content:

```
/** WhatsApp deep-link / API wrapper stub (bipmed patterns) */
export function buildWhatsAppDeepLink(
  phoneE164: string,
  text: string,
): string {
  const phone = phoneE164.replace(/\D/g, "");
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

```

That is the **entire** WhatsApp implementation in the repo — a single deep-link builder, nothing else. It's re-exported via `packages/notifications/src/index.ts` (`export * as whatsapp from "./whatsapp"`).

The only consumer found is `d:\medcal\apps\web\src\components\whatsapp-fab.tsx`, a floating "Chat via WhatsApp" button on the public marketing site that builds a `wa.me` link client-side (imports `waLink` from `apps/web/src/data/site.ts`, not even the `packages/notifications` builder).

Searching `apps/api` for `webhook|whatsapp|WHATSAPP|inbound` (case-insensitive) returned **zero matches** — no webhook receiver, no inbound message handler, no WhatsApp Business API client exists anywhere in `apps/api`. `apps/api/src/modules/` only contains `contact-messages`, `me`, and `whitelist` modules (confirmed via full directory listing). No `apps/web-api` match either — `apps/web-api/src/index.ts` is its only source file.

This matches the locked architecture decision (see §5 below): WhatsApp is explicitly **passive** **`wa.me`** **handoff only**, with receiving/dashboard-replies explicitly rejected for MVP.

---

### 3. Email integration

`d:\medcal\packages\notifications\src\email\index.ts` — full file content:

```
/** Email channel adapter stub — Nest NotificationsModule calls this */
export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
};

export async function sendEmail(_input: SendEmailInput): Promise<void> {
  // Wire SMTP / provider in a later phase
  return;
}

```

This is a no-op stub — `sendEmail` does nothing (`return;`) and is not called anywhere else in the codebase (no other match for `sendEmail` in `apps/api` or elsewhere beyond this file and the doc mentions). No SMTP config exists in any `.env.example`/config file found via repo-wide search for `smtp|nodemailer|imap` (only doc references matched, no code). No inbound-email webhook/parsing code exists. No "reply by email" mechanism exists in code — the docs (§5 below) explicitly flag this as deferred/accepted-limitation, not built.

---

### 4. Web Chat / live chat widget

**No chat code exists anywhere in the codebase.** No `ChatSession`/`ChatMessage` Prisma models exist in `packages/db/prisma/schema.prisma` (confirmed via `grep -n "ChatSession\|ChatMessage\|ChatSessionToken"` → zero matches in the schema file). No WebSocket gateway exists in `apps/api` (its module list is only `contact-messages`, `me`, `whitelist`, plus auth/health/guards). No chat widget component exists in `apps/web`, `apps/portal`, or `apps/tech-pwa` (full file listings show only marketing pages, sign-in pages, and layout/nav files — nothing chat-related).

This is fully consistent with the documented plan: Chat is explicitly scoped as an **MVP-phase**, not-yet-built capability (see §5 below, and confirmed absent from the Foundation-phase Prisma schema).

---

### 5. Architecture docs — Lead Pipeline / Lead Inbox design

**`docs/Architecture/01-bipmed-medcal-architecture-adoption-matrix.md`** (read in full) — this is the canonical, locked source. Key verbatim excerpts:

> "MedCal adopts BIPMED's proven **intake pattern** (`ContactMessage` + `GetMessageFrom` + `ContactStatus`) and its **Express-as-public-edge-only / NestJS-as-sole-business-layer** boundary... Human Live Chat and FCM push notifications are MVP capabilities, not deferred. WhatsApp remains a passive `wa.me` handoff only."

Lead/Contact table:

> "Intake model | `ContactMessage` + `GetMessageFrom` (CONTACTFORM/WHATSAPP/CHAT\_AI/CHAT\_PERSON/EMAIL) + `ContactStatus` | ... **ADOPT** the core model; **REDESIGN** attribution readiness | ... plus a `matchStatus` extension field ... | MVP" "Lead vs. Customer dedup | Not modeled in BIPMED at all ... | **REDESIGN** | Email-domain match (public-domain blocklist) + mandatory admin confirmation before merging into an existing `Customer`; no silent auto-merge | MVP"

WhatsApp table:

> "WhatsApp Business API | None in BIPMED | — | — | **DO NOT INTRODUCE** | Passive `wa.me` only; no receiving, no dashboard replies, in MVP. `whatsapp/` adapter is a future extension point only | Confirmed, not MVP"

Human Chat table (explicit ChatSession/ChatMessage MVP-phase confirmation):

> "Chat/Lead relationship | `ChatSession`/`ChatMessage` entirely disconnected from `ContactMessage` — no FK ... | **ADAPT** | Chat conversations expressing service intent link to/create a `ContactMessage` (`getFrom=CHAT_PERSON`), per MedCal's own already-locked D04 rule | **MVP**" "AI involvement | `ChatMode` enum ... | **DO NOT COPY the schema now** | No `mode` field in MVP; human-responder-only ... | **MVP (human-only)**"

Consistency-check table explicitly reconfirms:

> "`ChatSession`/`ChatMessage` are MVP | Pass — confirmed, referenced consistently throughout" "WhatsApp remains passive-only in MVP | Pass — confirmed, `whatsapp/` adapter explicitly scoped to no active messaging"

Roadmap section:

> "**Foundation:** monorepo/package layout (done), Better Auth in `apps/api`, `EmailWhitelist` + registration gate, RBAC ..., mobile-first UI guidelines, Docker Compose deployment (done), domain topology ... `packages/auth` dependency boundary." "**MVP:** `ContactMessage`/`GetMessageFrom` intake, Lead/Customer dedup with admin confirmation, WhatsApp passive handoff, Human Live Chat (human-only, staff + anonymous-visitor paths, unread/read, assignment, notifications), FCM push, basic minimal audit fields on `EmailWhitelist`."

Outbound email persistence flagged as a known gap, not silently missing:

> "Outbound reply persistence | SMTP fire-and-forget, no `Email` row created for replies | Simple | Can't analyze past conversations later | **DEFER, flagged** | MVP follows the same fire-and-forget pattern (`business-domain.md` D18 already treats this as Later: 'log optional') — accepted as a known limitation, not silently inherited without notice | Later"

Company/subdomain resolution (relevant to where a "Lead Inbox" would live):

> "`apps.kalibrasimedika.co.id` → `apps/portal` (management route group) ... `portal.kalibrasimedika.co.id`→ `apps/portal` (client route group) — same service, host-routed"

**`docs/Architecture/02-foundation-implementation-plan.md`** (read in full) — confirms current implementation status: F1–F4 and F6 complete, F5 partially done (VPS-only). Explicitly states scope boundary:

> "## 4. Explicitly out of scope for this Foundation pass — Per the locked matrix's Phase column, do **not** build yet: `ChatSession`/`ChatMessage`/`ChatSessionToken` (MVP, not Foundation), FCM *send* logic beyond token storage (MVP), WhatsApp handoff (MVP), MFA (Later), host-based route-group split for `apps.*` vs `portal.*` (Foundation-adjacent but only needed once `apps/portal` UI work starts)."

F6 audit finding, directly describing the portal's prior/current state:

> "**Audit findings:** `apps/web` was already complete... `apps/portal`/`apps/tech-pwa` were Fase-0 stubs with no `@medcal/auth` dependency, no middleware, no API client... No endpoint exposed `UserMembership.role` to a caller about themselves." "**`packages/ui`** — left deferred (unchanged 4-line `cx()` stub). No components exist in portal/tech-pwa yet to justify extraction."

**`docs/claude/lead-management/final-before-locked.md`** — a prior decision memo (predates/feeds the Adoption Matrix), confirms Human Chat scope decisions verbatim:

> "1. HUMAN CHAT SCOPE — Human Live Chat is an MVP capability available to anonymous visitors on the public MedCal website. The purpose is real human communication and lead/message capture. There is NO AI first responder in MVP... Do NOT create a durable anonymous Better Auth user. Instead, use a narrowly scoped anonymous chat continuity mechanism..."

Internal Management Application module list (this is the closest thing to a named "Lead Inbox" location in the docs):

> "apps.kalibrasimedika.co.id ↓ Internal Management Application ├── Dashboard ├── **Lead** ├── Customer ├── Calibration Management ├── Finance ├── Reports └── modul lain sesuai permission/role"

**`docs/cursor/entity-catalog.md`** and **`docs/cursor/business-domain.md`** — the underlying domain model docs referenced by the Adoption Matrix. Key excerpts:

> "**ContactMessage** (a.k.a. LeadSubmission) | Yes | Unified inbound inbox — **same pattern as bi-erp** | N:1 Company; optional → Lead; optional → Customer (match); optional topic | `getFrom` enum di bawah" (entity-catalog.md:226)

> "**Lead** | Yes | Pipeline prospect setelah qualify | N:1 Company; optional ← ContactMessage; optional → Customer | Created only if not confirmed existing customer" (entity-catalog.md:228)

> "**ChatSession / ChatMessage** | **Yes (MVP)** | Realtime chat stack (bi-erp), human-only | Session 1 → N Message; optional → ContactMessage | No `mode`/AI field in MVP — future ADR only" (entity-catalog.md:230)

> "Inbox workflow via **ContactStatus** (PENDING → READ → REPLIED → CLOSED)" (business-domain.md:299) "Assign lead to admin/sales; convert Lead → Customer (+ optional Calibration Request)" (business-domain.md:303)

> "**Refinement policy:** field tambahan CBMS pada `ContactMessage` (mis. `matchStatus`, link Lead/Customer, `companyId` wajib) **boleh**; mengubah/mengganti enum `GetMessageFrom`, memecah inbox jadi model channel baru, atau menggabungkan chat session ke ContactMessage sebagai pengganti core bi-erp **tidak boleh** tanpa ADR." (business-domain.md:293) — i.e., a formal ADR is required before splitting the "inbox" into a separate channel-model, which is directly relevant if the Lead Inbox design is tempted to add a new channel abstraction.

**`docs/ERD/overview.md`** and **`docs/ERD/attributes.md`** — the ERD reference (source cited in the Prisma schema header itself, see §6). Both files fully quoted above in-session; key points:

- `Company ||--o{ ContactMessage : captures`, `ContactMessage ||--o| Lead : may_create`, `Lead }o--o| Customer : converts_to`, `Lead ||--o| CalibrationRequest : may_spawn`.
- `ChatSession`/`ChatMessage`/`ChatSessionToken` explicitly called out as "MVP (human-only, see Adoption Matrix) — only the full mailbox `Email` stack remains a later port from bi-erp" (overview\.md:94).
- §5 "Intentionally absent from MVP ERD" table lists `NewsletterSubscriber`, `Branch`, `DebitNote`/`Refund`, `StandardInstrument`, `Folder`/`ShareLink`, `ReminderPolicy` — no Lead-Inbox-specific entity is listed as intentionally absent, since Lead/ContactMessage themselves are already present in Foundation-phase ERD.

---

### 6. `packages/db/prisma/schema.prisma` — header and lead-to-billing relationship

**Top-of-file header comment** (lines 1–8):

```
// medcal MVP Prisma schema
// Sources: docs/ERD (approved 2026-08-02), entity-catalog, ADR-000
// Notes:
// - No branchId (Company only)
// - ContactMessage + GetMessageFrom aligned with server-bi-erp
// - Billable SoR = Certificate.billingStatus
// - MVP billing = Invoice + Payment + CreditNote
// - Better Auth may add/replace auth tables later; User here is domain-facing

```

**Lead → downstream domain relationship** (schema, `d:\medcal\packages\db\prisma\schema.prisma:428-445`):

```
model Lead {
  id               String     @id @default(cuid())
  companyId        String
  contactMessageId String?    @unique
  status           LeadStatus @default(NEW)
  assignedToUserId String?
  customerId       String?
  ...
  contactMessage      ContactMessage?      @relation(fields: [contactMessageId], references: [id])
  assignedTo          User?                @relation("LeadAssignee", fields: [assignedToUserId], references: [id])
  customer            Customer?            @relation(fields: [customerId], references: [id])
  calibrationRequests CalibrationRequest[]
  ...
}

```

`LeadStatus` enum: `NEW | CONTACTED | QUALIFIED | REJECTED | CONVERTED`. `ContactStatus` enum (on `ContactMessage`): `PENDING | READ | REPLIED | CLOSED`. `MatchStatus` enum: `NONE | EXACT_EMAIL | DOMAIN_CANDIDATE | CONFIRMED_EXISTING | DISMISSED`.

This confirms explicitly, at the schema level, that a Lead is meant to convert into a `Customer` (`customerId` FK, set on convert per docs) and can optionally spawn a `CalibrationRequest` directly (`calibrationRequests CalibrationRequest[]`), which is the entry point into the full delivery chain: `CalibrationRequest → Quotation → WorkOrder → CalibrationJob → QualityReview → Certificate → Invoice/Payment/CreditNote`. No comment near the billing/calibration models specifically calls out Lead by name beyond this — the relationship is expressed structurally via the FK/relation fields and the acquisition-section header comment (`// Acquisition — ContactMessage (bi-erp) + Lead`, line 394) rather than prose.

**Confirmed absence:** no `ChatSession`, `ChatMessage`, or `ChatSessionToken` model exists anywhere in the current schema (verified via full-file grep) — consistent with the docs' repeated statement that Chat is MVP-phase, not yet implemented, while Foundation-phase work (F1–F4, F6) is what's actually done.

All three audits are in. Let me spot-check the highest-stakes findings directly before writing the final report.

**Read **[d:\medcal\apps\api\src\common\guards\internal-service.guard.ts](vscode-webview://05n2l5ilkectl2dod3nu286ml8n77sop593pv1r3b04sifos69lc/index.html?id=ab278e73-a340-4822-b33f-acac89cadd3d\&parentId=1\&origin=863ceb96-65ae-4738-b33f-4aa7d814e70f\&swVersion=6\&extensionId=Anthropic.claude-code\&platform=electron\&vscode-resource-base-authority=vscode-resource.vscode-cdn.net\&parentOrigin=vscode-file%3A%2F%2Fvscode-app\&purpose=webviewView\&session=9947a556-ceb6-475a-b441-41f62239996e#)

**Read **[d:\medcal\packages\auth\src\access-control.ts](vscode-webview://05n2l5ilkectl2dod3nu286ml8n77sop593pv1r3b04sifos69lc/index.html?id=ab278e73-a340-4822-b33f-acac89cadd3d\&parentId=1\&origin=863ceb96-65ae-4738-b33f-4aa7d814e70f\&swVersion=6\&extensionId=Anthropic.claude-code\&platform=electron\&vscode-resource-base-authority=vscode-resource.vscode-cdn.net\&parentOrigin=vscode-file%3A%2F%2Fvscode-app\&purpose=webviewView\&session=9947a556-ceb6-475a-b441-41f62239996e#)

**Grep** "model Lead \\{|model ContactMessage \\{" (in d:\medcal\packages\db\prisma\schema.prisma)

53 lines of output

Findings confirmed. Now writing the complete audit report.

**Read **[C:\Users\Afriz\\.claude\plans\f6-application-ui-foundation-rippling-rose.md](vscode-webview://05n2l5ilkectl2dod3nu286ml8n77sop593pv1r3b04sifos69lc/index.html?id=ab278e73-a340-4822-b33f-acac89cadd3d\&parentId=1\&origin=863ceb96-65ae-4738-b33f-4aa7d814e70f\&swVersion=6\&extensionId=Anthropic.claude-code\&platform=electron\&vscode-resource-base-authority=vscode-resource.vscode-cdn.net\&parentOrigin=vscode-file%3A%2F%2Fvscode-app\&purpose=webviewView\&session=9947a556-ceb6-475a-b441-41f62239996e#)

This is a completed, unrelated phase — I'll replace the file's content with the new Lead Inbox audit report.

**Write** [C:\Users\Afriz\\.claude\plans\f6-application-ui-foundation-rippling-rose.md](vscode-webview://05n2l5ilkectl2dod3nu286ml8n77sop593pv1r3b04sifos69lc/index.html?id=ab278e73-a340-4822-b33f-acac89cadd3d\&parentId=1\&origin=863ceb96-65ae-4738-b33f-4aa7d814e70f\&swVersion=6\&extensionId=Anthropic.claude-code\&platform=electron\&vscode-resource-base-authority=vscode-resource.vscode-cdn.net\&parentOrigin=vscode-file%3A%2F%2Fvscode-app\&purpose=webviewView\&session=9947a556-ceb6-475a-b441-41f62239996e#)

276 lines

````
# Lead Inbox — Audit & Design

> Audit-only deliverable. No code, schema, migration, or UI changes were made to produce this document. All findings below are traced to exact files/line ranges in `d:\medcal` as of this session.

---

## 1. Executive Summary

**What exists today:** `ContactMessage` is a real, working, tenant-scoped inbound-message table (schema, create endpoint via `apps/web-api`, a read endpoint gated by RBAC). A `Lead` model already exists in the Prisma schema — full fields, relations to `Company`/`Customer`/`User`/`CalibrationRequest` — but it is **pure scaffolding**: zero application code (service, controller, RBAC resource) reads or writes it anywhere in the repo. There is no Lead Inbox UI, no WhatsApp/Email/Web-Chat send-or-receive integration (all three are stub functions with no callers in `apps/api`), and no pagination/filter/search capability on the one list endpoint that does exist.

**What is missing, and matters most:** the `Lead ↔ ContactMessage` relationship in the current schema is **one-to-one** (`Lead.contactMessageId String? @unique`). This directly contradicts the stated design principle for this work — *"a single Lead may have multiple interactions across different channels"* — the schema as it stands today cannot represent that without a change. This is the single most important decision this audit surfaces (see §9, Decision 1).

**Security finding worth flagging now (not fixing):** `InternalServiceGuard` resolves `companyId` from a client-supplied `x-company-id` header, trusted only by a shared secret with no cross-check against the secret or any session. Today this is safe only because the sole caller (`apps/web-api`) hardcodes `companyId` server-side from its own env var — but the guard itself would honor a different `companyId` from any caller holding the secret. Any new internal-trust endpoint for Lead Inbox must not repeat this pattern without equivalent hardening.

---

## 2. Current Architecture (actual, traced)

```text
Public web contact form (apps/web)
        │  fetch, no auth
        ▼
apps/web-api  (Express, public edge)
        │  validates body (Zod, contactMessageCreateSchema)
        │  companyId := process.env.COMPANY_ID   (server-side, not client input)
        │  x-internal-secret + x-company-id headers
        ▼
POST /internal/contact-messages   (apps/api, NestJS)
        │  InternalServiceGuard: checks secret, TRUSTS x-company-id header
        │  @AllowAnonymous() — no Better Auth session on this path
        ▼
ContactMessagesService.create(companyId, body)
        │  no Zod/class-validator pipe in Nest itself (validation only happened in web-api)
        ▼
prisma.contactMessage.create(...)   →  ContactMessage row (companyId, getFrom, status=PENDING, matchStatus=NONE, ...)


Authenticated staff read path:
apps/portal (management group)  — session-gated shell exists (F6), NO inbox UI behind it
        │  (not yet built — no fetch call exists for this endpoint anywhere in the frontend)
        ▼
GET /contact-messages   (apps/api)
        │  CompanyRoleGuard: session → UserMembership(userId, COMPANY_ID env) → role → hasPermission(contactMessage:read)
        │  companyId resolved ONLY from env + session membership, never from client input
        ▼
ContactMessagesService.findAll(companyId)
        │  prisma.contactMessage.findMany({ where: { companyId }, orderBy: { createdAt: "desc" } })
        │  NO pagination, NO filters, NO search, returns raw Prisma entities (no DTO mapping)
        ▼
Full ContactMessage[] JSON array


Lead model (packages/db/prisma/schema.prisma) — EXISTS, UNUSED:
Lead { companyId, contactMessageId (unique, 0-or-1), status: LeadStatus, assignedToUserId, customerId, → CalibrationRequest[] }
        no service, no controller, no RBAC resource, no `prisma.lead.*` call anywhere in apps/api


Channel adapters (packages/notifications) — ALL STUBS, no callers in apps/api:
whatsapp/  → buildWhatsAppDeepLink() — wa.me link only, no send/receive. Used only by apps/web-api and a marketing-site FAB button.
email/     → sendEmail() — literal no-op `return;`, zero callers anywhere.
push/      → sendPush() — literal no-op, zero callers.
contact/   → formatContactAck() — string formatter, zero callers.
```

---

## 3. ContactMessage Audit

| Area | Current State | Finding | Classification |
|---|---|---|---|
| Schema | `id, companyId, getFrom (enum), status (enum ContactStatus), subject?, topicId (bare Int, no FK), message, name, email, phone?, organizationName?, utmJson?, matchStatus (enum), matchedCustomerId?, confirmedByUserId?, confirmedAt?, createdAt, updatedAt`. Indexes: `[companyId,createdAt] [companyId,email] [companyId,status] [companyId,getFrom]`. | Solid, tenant-scoped, well-indexed for an inbox list. `topicId` is an orphaned FK-less int — no `Topic` model exists. | **LOCKED** (keep as-is); `topicId` → **RISK** (dead/unusable field until a Topic model exists or the field is repurposed) |
| Channel enum | `GetMessageFrom { CONTACTFORM, WHATSAPP, CHAT_AI, CHAT_PERSON, EMAIL }` | Matches the four channels named in this task plus AI/human chat split. Already the right shape for a Lead Inbox "Source" column. | **LOCKED** |
| Message workflow status | `ContactStatus { PENDING, READ, REPLIED, CLOSED }` | Defined, defaulted to `PENDING`, but **never mutated anywhere in the codebase** — no endpoint changes it. | **PROPOSED** (Lead Inbox needs to actually write this) |
| Lead relation | `Lead.contactMessageId String? @unique` — one Lead maps to **at most one** ContactMessage. | Directly conflicts with the "Lead = aggregate of many interactions" principle this task states. | **RISK / UNDEFINED** — see §9 Decision 1 |
| Create endpoint | `POST /internal/contact-messages` — `@AllowAnonymous()`, `InternalServiceGuard` (secret + client-supplied `x-company-id`, trusted). | Works correctly today because only `apps/web-api` calls it and hardcodes `companyId` server-side. The guard itself doesn't enforce that. | **LOCKED** (mechanism); **RISK** (trust model, if reused for a new internal-trust endpoint) |
| Read endpoint | `GET /contact-messages` — `CompanyRoleGuard`, `@RequirePermission("contactMessage","read")`, returns raw entity array, `orderBy createdAt desc`, no `skip/take`. | No pagination/filter/search/sort options at all. No `GET /:id`. No `PATCH` for status. No soft-delete. | **PROPOSED** (all of pagination, filtering, search, detail-fetch, status-update need to be built) |
| Validation | Zod schema (`contactMessageCreateSchema` in `packages/shared`) is only applied in `apps/web-api`; the Nest controller has no `ValidationPipe`/Zod pipe — body is trusted TypeScript-typed only. | A caller that reaches `/internal/contact-messages` directly (holding the secret) bypasses all validation. | **RISK** |
| RBAC | Only `contactMessage:read` exists, granted to `SUPERADMIN`/`ADMIN` only. No `create`/`update`/`assign`/`delete` action defined. No `lead` resource exists at all. | Lead Inbox has zero RBAC scaffolding to build on beyond the read permission. | **PROPOSED** (extend the catalog) |
| Frontend | No inbox list/table/filter/detail view exists anywhere (`apps/web`, `apps/portal`, `apps/tech-pwa`). `apps/portal`'s management shell (F6) is real (session-gated header/nav) but its body is a one-line "Skeleton — business modules land later" page; nav config has exactly one item ("Dashboard"). | Nothing to reuse for UI beyond the auth-gated shell/layout itself. | **PROPOSED** (build from scratch on top of the F6 shell) |
| Tenant isolation | Read path: companyId from session+membership only, verified secure. Create path: companyId from a trusted-but-client-suppliable header, safe only by caller discipline. | See §8 for full analysis. | **LOCKED** (read path); **RISK** (create/internal-trust path, if extended) |

---

## 4. Domain Model Assessment

```text
Company (internal tenant, Char(3) PK — e.g. "PKM")
   │  RBAC/ownership boundary. UserMembership, all business tables scope to this.
   │  This is NEVER the Lead's own organization. No confusion risk in the schema
   │  itself (different PK shape, different relation fanout to billing/RBAC),
   │  but very real confusion risk in ANY UI that labels a column "Company"
   │  without specifying which one.
   │
   ├── ContactMessage (the inbound interaction / message)
   │     companyId → Company (tenant)
   │     name, email, phone   → the SENDER's own identity (a person)
   │     organizationName?    → free-text string, the ONLY place the prospect's
   │                            own company/employer is captured today.
   │                            NOT a structured entity. NOT validated. NOT an FK.
   │     getFrom               → channel (CONTACTFORM/WHATSAPP/CHAT_AI/CHAT_PERSON/EMAIL)
   │     status                → message workflow (PENDING/READ/REPLIED/CLOSED), unused today
   │     matchStatus, matchedCustomerId, confirmedByUserId, confirmedAt
   │                           → automated/manual matching against an existing Customer
   │     topicId               → orphaned Int, no Topic model exists
   │     lead?                 → optional 1:1 back-relation to Lead
   │
   ├── Lead (schema exists, ZERO app code touches it)
   │     companyId → Company (tenant)
   │     contactMessageId? UNIQUE → at most one ContactMessage (see Decision 1)
   │     status → LeadStatus (NEW/CONTACTED/QUALIFIED/REJECTED/CONVERTED) — pipeline stage
   │     assignedToUserId? → staff member working the lead
   │     customerId? → set once converted
   │     calibrationRequests[] → a Lead can spawn work directly
   │
   ├── Customer (the converted/onboarded external organization — structured)
   │     name, legalName, taxId, address, status
   │     contacts: CustomerContact[] (named people at that customer)
   │
   └── CustomerContact (a named person at a Customer, post-conversion)
```

**Where "Contact" / "Company (the prospect's)" / "Topic" / "Interaction" currently live:**

- **Contact** (as a standalone concept): does not exist pre-conversion. The sender's identity is inlined directly on `ContactMessage` (`name`, `email`, `phone`). Post-conversion, `CustomerContact` is the real structured contact-person entity.
- **Company (the prospect's/lead's own organization)** — **exists only as `ContactMessage.organizationName`, a free-text nullable string.** No entity. No relation. No validation. It is not duplicated onto `Lead`, so today the only way to know a Lead's prospect-company name is to join back through `Lead.contactMessage.organizationName`. This directly answers the follow-up instruction: *report current state first* — confirmed, it is a **free-text field on the originating message, not a Contact field, not a Company/Organization entity, not a relation.** It does not yet exist as anything more structured.
- **Topic**: does not exist as an entity. `ContactMessage.topicId` is a bare, unrelated `Int?` with no FK target anywhere in the schema.
- **Interaction / Conversation / Message-thread**: does not exist as a concept distinct from the single `ContactMessage` row. There is no thread/history model — one row is one inbound event, full stop. `ChatSession`/`ChatMessage` are documented (`docs/cursor/entity-catalog.md`) as MVP-phase, human-only, and explicitly **not yet in the schema or code** — confirmed absent by full-file schema search.
- **Where the current implementation mixes concepts:** `ContactMessage` is doing double duty as both "the inbound message" and "the only durable record of the lead's identity/org/channel" — because `Lead` carries none of that itself, only a pointer back. This is the core boundary blur the task asked to identify (not fix).

---

## 5. Proposed Lead Inbox v1 (conceptual model, no code)

```text
Lead   (the aggregate — one prospect/opportunity)
 ├── identity        → name, email, phone           (currently on ContactMessage; needs a home on Lead)
 ├── prospect company → organizationName             (currently free-text on ContactMessage only)
 ├── topic            → subject / topicId            (topicId is unusable until a Topic model exists —
 │                                                      recommend treating "topic" as free-text `subject`
 │                                                      for v1, not resurrecting topicId)
 ├── status           → LeadStatus (pipeline stage — already exists, unused)
 ├── assignedTo       → User (already exists, unused)
 ├── companyId        → internal tenant (already correct, keep as-is)
 ├── timestamps       → createdAt / updatedAt (already exists)
 └── interactions[]   → EVERY ContactMessage tied to this Lead, across channels
                         (requires Decision 1 — see §9 — the schema today caps this at one)
```

**Field-by-field placement assessment** (per the task's own conceptual columns: Date, Name, Email, Phone, Company, Topic, Source, Status):

| Field | Belongs to | Why |
|---|---|---|
| Date | Lead (`createdAt`) for the inbox list; each interaction also has its own timestamp | List sorts by lead recency, not per-message |
| Name | Lead-level identity (promoted from the first/primary interaction) | A Lead should not lose its name if the originating message is archived |
| Email | Lead-level identity | Primary channel for matching to `Customer` (existing `matchStatus` logic already keys off email) |
| Phone | Lead-level identity | Same reasoning; also needed for WhatsApp channel correlation |
| Company | Lead-level, but **must be explicitly the prospect's organization**, never `companyId`. Needs its own clearly-named field (e.g. keep `organizationName` string for v1, or promote later) | This is the exact distinction called out — internal tenant vs. prospect org must never share a UI label or a code field |
| Topic | Latest-interaction / derived display field for v1 (free-text `subject`, not `topicId`) | No structured Topic entity exists; inventing one now is overengineering for v1 |
| Source | Derived/display — either the Lead's *primary* source (first interaction's channel) or a computed "channels: [WhatsApp, Email]" chip if multi-channel is adopted (Decision 1) | Source is a property of an interaction, not inherently the Lead, but the inbox needs a summarized view |
| Status | Lead (`LeadStatus`) — pipeline status, distinct from any per-message `ContactStatus` | See §7 |

**Minimum additional fields for a useful B2B inbox (beyond the task's listed columns), kept deliberately small:**
- `lastInteractionAt` (derived, for sorting/"most recently active" — avoids a real-time aggregate query on every list render)
- `unreadCount` or a boolean `hasUnread` (derived from unread `ContactMessage.status = PENDING` on that Lead's interactions) — only if genuinely needed for MVP; flagged as evaluate-not-assume in §6
- Nothing else. No `priority`, `tags`, `pipeline stage percentage`, `deal value`, or CRM-style fields — none of that is evidenced anywhere in the docs as a BIPMED requirement, and inventing it would be overengineering.

---

## 6. Inbox Behavior (MVP-focused)

- **List**: paginated (`skip`/`take` — does not exist today, must be added), default sort `lastInteractionAt desc` (or `createdAt desc` if multi-channel/Decision 1 is deferred).
- **Search**: by name/email/phone/organizationName — simple `contains` filters are sufficient for v1; no full-text search infra exists or is justified yet.
- **Filters**: by `LeadStatus`, by `source`/channel, by `assignedToUserId` (only if assignment is adopted — see below), by date range.
- **Sorting**: `lastInteractionAt`/`createdAt` toggle is enough for v1; nothing more.
- **Opening a lead**: detail view showing Lead identity fields + a reverse-chronological list of its interactions (each with channel badge, timestamp, message body). Today's `GET /contact-messages` has no `GET /:id` — must be added, along with a new `GET /leads/:id` (or equivalent) that includes its interactions.
- **Viewing interactions**: read-only display of each linked `ContactMessage`'s `message`/`getFrom`/`createdAt`/`status`. No reply-composition UI is justified for v1 given Email/WhatsApp send are both unimplemented stubs (§2) — replying happens outside the system (WhatsApp deep-link handoff, manual email) per the locked Adoption Matrix ("WhatsApp remains passive `wa.me` handoff only").
- **Status changes**: `LeadStatus` transitions via explicit staff action (see §7) — this is the one write-path v1 genuinely needs beyond create.
- **Assignment**: `Lead.assignedToUserId` already exists in the schema. **Justified for v1** only if BIPMED's actual sales process requires named-owner accountability — the docs' Internal Management Application module list (`docs/claude/...`) shows "Lead" under a permission-gated module, consistent with assignment being expected, but this is not explicitly locked anywhere — flag as **UNDEFINED**, not assumed.
- **Unread/new behavior**: only justified if `ContactStatus` is actually wired up (it currently is not). Recommend: yes, minimal — mark an interaction `READ` when its detail is opened by staff, roll up to a Lead-level "has unread" indicator. Do not build more than that (no per-user read-receipts, no "seen by" list).

---

## 7. Lead Lifecycle

```text
ContactMessage arrives (any channel)
        │
        ▼
   Lead created/attached  (status: NEW)
        │  staff reviews inbox
        ▼
   CONTACTED   (staff has reached out — via WhatsApp/Email/phone, outside-system)
        │
        ▼
   QUALIFIED   (staff has determined it's a real opportunity)
        │                                   │
        ▼                                   ▼
   CONVERTED                            REJECTED
   (Lead.customerId set;                (dead end, no further action;
    Customer created or matched;         kept for record, not deleted)
    optionally spawns CalibrationRequest)
```

This is the schema's own `LeadStatus` enum (`NEW/CONTACTED/QUALIFIED/REJECTED/CONVERTED`) — already defined, already the right shape, **reuse as-is, do not invent a new lifecycle.**

**Explicitly three distinct status concepts, must not be conflated:**

1. **Lead status** (`LeadStatus`) — pipeline stage of the business opportunity. Lives on `Lead`. Changed deliberately by staff.
2. **Message status** (`ContactStatus`: `PENDING/READ/REPLIED/CLOSED`) — workflow state of one specific inbound interaction. Lives on `ContactMessage`. Changed automatically (READ on open) or manually (REPLIED/CLOSED once handled).
3. **Conversation status** — does not exist as its own concept today, and per §5/§9 Decision 1, whether it's needed at all depends on whether multi-channel-per-Lead is adopted. If adopted, "conversation status" is likely just a derived rollup (e.g., "any interaction still PENDING?") rather than a new stored field — recommend NOT storing a redundant conversation status field; derive it.

---

## 8. Security / Tenant Isolation Audit

Answering the required questions directly:

1. **Where does company context come from?** Two different mechanisms depending on the path (see §2 diagram) — read path: session + `UserMembership`; create path: a request header trusted via shared secret.
2. **Is it derived from the authenticated user/session?** Yes, for every authenticated (`CompanyRoleGuard`) route, including the existing `GET /contact-messages`. `process.env.COMPANY_ID` (this deployment is single-tenant-per-process) is cross-checked against the caller's own `UserMembership` row — never trusted from the request itself.
3. **Can the client submit an arbitrary company ID?** Not on the authenticated path. **On the internal-trust path (`InternalServiceGuard`), yes structurally** — `request.companyId = request.headers["x-company-id"]` with no validation beyond "is the shared secret correct." Today's only caller (`apps/web-api`) never lets an end user influence that header (hardcoded from its own env var), so there is no live exploit path today — but the guard itself provides no defense if a second internal caller (or a leaked-secret attacker) sent a different value.
4. **Can a user query another company's leads by manipulating request parameters?** No — confirmed the read path never reads `companyId` from anything client-supplied.
5. **Are repository/database queries consistently scoped?** Yes, for the one existing query (`findAll(companyId)` always filters `where: { companyId }`). No query in the codebase omits the filter.
6. **Are admin/superadmin exceptions clearly defined?** `SUPERADMIN` and `ADMIN` both get `contactMessage:read`; no role gets more. No superadmin cross-tenant-bypass exists in the RBAC catalog (would need a real design decision if BIPMED ever needs a superadmin to see multiple companies — not needed today since `COMPANY_ID` is a single env-bound value per deployment).

**Security gaps identified (not fixed, per constraints):**
- `InternalServiceGuard`'s `x-company-id` trust model (RISK, §3/§8.3) — must be re-examined before adding any new internal-trust write endpoint for Lead Inbox (e.g. a future WhatsApp/email webhook receiver).
- No `ValidationPipe`/schema validation inside `apps/api` itself on the create path — relies entirely on `apps/web-api` having validated first. A Lead Inbox create/update endpoint should not repeat this gap.
- `Lead`/`ContactMessage` have no RBAC resource for `create`/`update`/`assign` — these need to be added deliberately (not just reuse `contactMessage:read` for everything) so, e.g., "assign a lead" and "read the inbox" can be governed by different permissions if BIPMED's roles need that granularity later.

---

## 9. Decisions Required (UNDEFINED — must be resolved before coding)

1. **Multi-channel Lead aggregate vs. current 1:1 schema.** `Lead.contactMessageId` is `@unique` today — one Lead can link to at most one `ContactMessage`. The stated design principle ("Lead #1024 → Contact Form, WhatsApp, Email, Web Chat") requires either (a) changing `contactMessageId` from a unique 1:1 FK to a reverse one-to-many (`ContactMessage.leadId` non-unique, pointing at `Lead`), or (b) accepting 1:1 for v1 and deferring true multi-channel aggregation. **This is the single biggest fork in the whole design** and should be resolved first — everything else in this document (inbox list shape, detail view, "source" as singular vs. plural) depends on the answer.
2. **Where does the prospect's Company name live going forward?** Keep it as free-text `organizationName` on `ContactMessage` only (status quo, cheapest), promote a copy onto `Lead` itself (avoids a join for the inbox list), or introduce a lightweight structured "Prospect Organization" concept (highest effort, not evidenced as required by any doc). Recommend the middle option for v1 but this is a real product decision, not something to assume.
3. **Is `assignedToUserId` (Lead ownership) in scope for v1**, or is Lead Inbox v1 read/triage-only with assignment deferred? Schema supports it; nothing in the locked docs mandates it for the very first version.
4. **Is unread/new tracking (via `ContactStatus`) in scope for v1**, or is a flat reverse-chronological list sufficient initially?
5. **RBAC granularity**: does Lead Inbox need separate `lead:read` / `lead:update` / `lead:assign` actions, or is a single `lead:manage` sufficient for v1 (mirroring the existing `whitelist:manage` pattern)? No precedent locks this either way.
6. **`topicId`**: formally drop/ignore this orphaned field for Lead Inbox purposes (recommended), or is a real `Topic` lookup table actually planned soon (would change the "Topic" column's design)?
7. **Internal-trust endpoint pattern for any new inbound-channel webhook** (if/when WhatsApp/Email receiving is ever built): must decide whether to keep reusing `InternalServiceGuard`'s header-trust pattern (and harden it) or introduce a different trust mechanism — flagged here because it's adjacent to Lead Inbox but is really a channel-integration decision, not a v1 blocker.

---

## 10. Recommended Implementation Order

```text
1. Resolve Decision 1 (multi-channel schema shape) — everything else depends on it
2. Resolve Decisions 2–6 (prospect-company field, assignment, unread, RBAC granularity, topicId)
3. Prisma schema change (only after 1–2 are decided) + migration
4. RBAC catalog extension (packages/auth/src/access-control.ts) — add `lead` resource/actions
5. Backend: LeadsModule (service + controller), reusing CompanyRoleGuard exactly as
   ContactMessagesModule does; add pagination/filter/search to the query layer
   (no existing helper to reuse — first one in the repo, per §2's confirmed gap)
6. API: GET /leads (list, paginated/filtered), GET /leads/:id (detail + interactions),
   PATCH /leads/:id (status/assignment changes)
7. Wire Lead creation into the existing ContactMessage create path (or a follow-up
   hook) so new inbound messages actually produce/attach-to a Lead — today nothing does this
8. Lead Inbox UI in apps/portal's management group (real content behind the
   already-built F6 session-gated shell — apps/portal/src/app/management/)
9. Lead detail / interaction-thread view
10. (Separately scoped, not v1) inbound channel integrations — WhatsApp/Email
    receiving — deferred per the locked Adoption Matrix ("WhatsApp passive
    handoff only" in MVP); revisit InternalServiceGuard hardening first if ever built
11. Tests — no existing pagination/list-endpoint test pattern to follow (per API
    audit); registration-gate.integration.test.ts and whitelist.service.test.ts
    are the closest real-Postgres, no-mocking convention to mirror
```

---

## Final Recommendation

**What Lead Inbox v1 should actually be:** a thin, tenant-scoped read+triage surface over the *already-modeled* `Lead`/`ContactMessage` schema — a paginated, filterable, searchable list of `Lead` rows (identity + prospect-company string + derived source/status), opening into a detail view that shows every linked interaction chronologically. It should **not** be a rename of `ContactMessage`, should **not** invent a CRM pipeline beyond the existing five-state `LeadStatus`, and should **not** build any inbound-channel send/receive logic (WhatsApp/Email remain locked as passive/stub for MVP).

**What must be decided before the first line of code:** Decision 1 (§9) — whether `Lead` becomes a true one-to-many aggregate over `ContactMessage`, matching the stated design principle, or whether v1 ships with today's 1:1 cap and multi-channel aggregation is explicitly deferred. Every other design choice in this document (list columns, detail view shape, "source" singular-vs-plural, even the RBAC action granularity) is downstream of that one answer. Decisions 2–6 are smaller but should be resolved in the same sitting — none of them require new research, only a product call.

````

**Claude’s Plan **[C:\Users\Afriz\\.claude\plans\f6-application-ui-foundation-rippling-rose.md](vscode-webview://05n2l5ilkectl2dod3nu286ml8n77sop593pv1r3b04sifos69lc/index.html?id=ab278e73-a340-4822-b33f-acac89cadd3d\&parentId=1\&origin=863ceb96-65ae-4738-b33f-4aa7d814e70f\&swVersion=6\&extensionId=Anthropic.claude-code\&platform=electron\&vscode-resource-base-authority=vscode-resource.vscode-cdn.net\&parentOrigin=vscode-file%3A%2F%2Fvscode-app\&purpose=webviewView\&session=9947a556-ceb6-475a-b441-41f62239996e#)

User approved the plan

The audit and design document is complete. Per this task's explicit constraints ("audit and design only... do not modify the repository"), I'm stopping here — the exited plan mode was just approval of the report itself, not a signal to start building Lead Inbox.

**Key takeaway:** the single biggest fork is **Decision 1** — `Lead.contactMessageId` is currently a unique 1:1 FK, meaning one Lead can only ever link to *one* `ContactMessage`. That directly contradicts the stated principle that a Lead should aggregate interactions across multiple channels (Contact Form + WhatsApp + Email + Web Chat). Everything else in the design — list shape, detail view, RBAC granularity — depends on how that gets resolved.

Also confirmed, per your follow-up note: the prospect's "Company" (e.g. "RS Harapan Sehat") currently exists only as a free-text, unvalidated `organizationName` string on `ContactMessage` — it is **not** a structured entity, not a relation, and is completely separate from `Company.id` (the internal 3-character tenant code used for RBAC/isolation). No code path confuses the two today, but no UI exists yet either, so this needs to stay explicit once you build the inbox.

The full report (in the plan file) has 10 sections including a `LOCKED`/`PROPOSED`/`UNDEFINED`/`RISK` classification table, the complete security/tenant-isolation audit, and 7 concrete decisions to resolve before any code gets written.

Want me to go through the 7 decisions in §9 with you now so we can lock them in before implementation starts?