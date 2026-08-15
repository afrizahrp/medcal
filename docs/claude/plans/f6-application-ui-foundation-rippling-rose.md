# MedCal — Contact Form & ContactMessage Security / Architecture Study

> Audit/study only. No code, schema, or config changes made. Scope strictly: Contact Form → `apps/web-api` (Express) → `apps/api` (NestJS) → `ContactMessage` → directly-referenced tables only (`ContactTopic`/`topicId`, `Company` as tenant, `CustomerContact` as the email-match target). Lead, Web Chat, AI, WhatsApp conversation, Email inbox, Customer matching beyond what `ContactMessage.create()` itself does, Calibration Request, and assignment are explicitly out of scope and not analyzed here.

---

## 1. Reference Architecture (BIPMED, as actually traced)

Confirmed by direct source trace (both `D:\website-bumiindah` and, because the real backend lives there, `D:\bi-erp`):

```text
Browser (client-bip-website contact form)
   │  reCAPTCHA v3 client token (skipped entirely for WhatsApp-origin submissions)
   ▼
Next.js API route  app/api/contact/route.ts
   │  validates CSRF token + reCAPTCHA server-side (again: skipped for WhatsApp path)
   │  company_id := process.env.NEXT_PUBLIC_COMPANY_ID   ← set server-side here, GOOD instinct
   ▼
Express  POST /api/contact  (server-bumiindah-website)
   │  NO auth (public by design) — only a generic 1000req/15min IP limiter shared by ALL /api/* routes
   │  forwards to NestJS by default; falls back to a local JSON file / local-DB write if NestJS is unreachable
   ▼
NestJS  POST /cms/contactmessages/public  @Public()  (bi-erp/server-bi-erp — the actual persistence owner)
   │  global ValidationPipe(whitelist,transform) — real class-validator DTO check
   │  company_id: plain optional string on the DTO, NOT cross-checked against anything — accepts whatever
   │    the request body says, since this specific route is unauthenticated and nothing downstream verifies it
   ▼
ContactMessage row created; FCM push fired to staff (fire-and-forget, failure swallowed, doesn't block the write)
```

**The core BIPMED characteristic to preserve conceptually:** Express is a thin forwarder; NestJS is the sole persistence owner. **The core BIPMED characteristic to reject:** the local-JSON/local-DB fallback, and the fact that "unauthenticated + accepts a company_id field" is treated as acceptable at the NestJS boundary because *something upstream* is supposed to set it correctly — nothing enforces that assumption at the layer that actually writes to the database.

---

## 2–3. MedCal Current Implementation (traced fresh from source, this session)

```text
Browser  apps/web/src/app/kontak/kontak-form.tsx
   │  no CAPTCHA, no CSRF token — plain fetch, client sets getFrom:"CONTACTFORM" itself (harmless: it's a
   │  fixed literal in the component, not user-editable, but structurally the client IS choosing this value)
   ▼
Express  POST /public/contact-messages  (apps/web-api/src/index.ts)
   │  contactMessageCreateSchema.safeParse(req.body)  — real Zod validation, rejects on failure (400)
   │  companyId := process.env.COMPANY_ID  (server-side, not from the request — correct, matches BIPMED's
   │    good instinct at the Next.js layer)
   │  "// TODO: verify captcha before forward"  — CAPTCHA is explicitly NOT implemented yet
   │  forwards validated body + x-internal-secret + x-company-id headers to apps/api
   │  NO local fallback of any kind if apps/api is unreachable — returns 502 to the browser instead
   ▼
NestJS  POST /internal/contact-messages  (apps/api/src/modules/contact-messages/contact-messages.controller.ts)
   │  @AllowAnonymous() + @UseGuards(InternalServiceGuard)
   │  InternalServiceGuard: checks x-internal-secret === INTERNAL_API_SECRET, then sets
   │    request.companyId = request.headers["x-company-id"]  ← accepted AS-IS, no independent verification
   │  NO NestJS-level body validation (no ValidationPipe, no class-validator, no re-parse of the Zod schema —
   │    the TypeScript type ContactMessageCreateInput is compile-time only, provides zero runtime protection)
   │  NO rate limiting, NO helmet, at the apps/api layer itself (both exist only in apps/web-api)
   ▼
ContactMessagesService.create(companyId, body)
   │  looks up Company by companyId — if not found, returns a 200-status JSON body {error:"Unknown companyId",
   │    statusCode:400} — a SOFT error; Nest does not actually set the HTTP status to 400 here, since the
   │    handler returns a plain object rather than throwing, so the real response is HTTP 200 with an error
   │    payload inside it — a genuine correctness bug independent of security
   │  does an exact-email + email-domain match against CustomerContact (matchStatus/matchedCustomerId)
   │  writes ContactMessage
   ▼
Response to browser: {id, matchStatus}  (or the soft-error object above, still HTTP 200)
```

**Read path** (`GET /contact-messages`, `contact-messages-query.controller.ts`): `CompanyRoleGuard` — `companyId` resolved from `process.env.COMPANY_ID` cross-checked against the caller's own `UserMembership` via a real Better Auth session. **Never reads companyId from any client input.** This is already strictly correct and must not be weakened.

**Company vs. prospect's organization — confirmed still cleanly separate in the schema and the form**: `ContactMessage.companyId` (the internal tenant, `Company.id` is `@id @db.Char(3)`) is a completely different field from `ContactMessage.organizationName` (free-text, labeled "Institusi" in the actual form UI — the prospect's own hospital/lab name). No code path anywhere confuses the two. This distinction is sound today and must be preserved as MedCal builds further on this.

---

## 4. What Should NOT Be Adopted From BIPMED

### A. Client-controlled `company_id` on create

**BIPMED**: `CreateContactMessageDto.company_id` is `@IsString() @IsOptional()` on a `@Public()` endpoint — a direct `curl` to `POST /cms/contactmessages/public` can set any `company_id` string, or omit it, with zero server-side verification. A malicious client absolutely can submit another company's ID; nothing in `contactmessage.service.ts`'s `create()` checks it against a known-tenant list.

**MedCal**: structurally similar risk *shape* (a client-suppliable header, `x-company-id`, trusted without independent verification) but currently **safe in practice** only because the sole caller (`apps/web-api`) hardcodes it from its own `COMPANY_ID` env var — an end user never gets to influence that header. This is fragile: it depends entirely on no other caller ever reaching `InternalServiceGuard` with a different value, and on the shared secret never leaking.

**Concrete recommendation — better than either "verify against a whitelist" or "trust the header":** MedCal's deployment is already architecturally **single-tenant-per-process** (`CompanyRoleGuard` already proves this — it *never* reads `companyId` from anywhere except `process.env.COMPANY_ID`). `InternalServiceGuard` should do the exact same thing: **stop accepting `x-company-id` from the request entirely**, and set `request.companyId = process.env.COMPANY_ID` directly, identical to the read path. This isn't a compromise or a whitelist-check bolt-on — it removes the client-trust surface completely, because the value was never meant to vary per-request in this deployment model in the first place. (This is a design recommendation for later implementation — not something this audit is authorized to change.)

### B. Client-controlled `company_id` on read

**BIPMED**: `GET /cms/contactmessages?company_id=XYZ` — the query parameter **overrides** the authenticated user's own session-derived company list, with no check that the requester is actually authorized for the requested `company_id`. Rows with `company_id = null` are additionally visible to every authenticated user regardless of their own company assignments ("backward compatibility").

**MedCal**: `CompanyRoleGuard` never reads `companyId` from any client input on the read path — confirmed via direct code read this session, unchanged from prior audits. `ContactMessage.companyId` is also a non-nullable `String` in MedCal's schema, so the "null row visible cross-tenant" bug class is structurally impossible here regardless.

**Recommendation: do not add a `company_id` query parameter to the eventual paginated/filtered inbox endpoint.** If multi-company support is ever needed, it must come from the session's own membership list, never from a request parameter that can be independently supplied.

### C. Local DB / local JSON fallback

**BIPMED**: two independent fallback layers exist — the Next.js edge writes to a local `contact-messages.json` file if the Express hop is unreachable; the Express layer itself has a `createViaLocalDB` path (writing to *its own* local Prisma-backed `ContactMessage` table, `server-bumiindah-website`'s own schema copy) if the NestJS hop is unreachable. Both create a second source of truth. Neither documents (nor appears to implement) any reconciliation/replay mechanism for when the downstream service recovers — a message written to the JSON file or the local DB during an outage simply stays there, invisible to the real staff inbox (which only ever queries NestJS's database), until someone manually notices and migrates it.

**MedCal**: no fallback of any kind. `apps/web-api` returns a `502` to the browser if `apps/api` is unreachable — the user sees a failure and can retry; nothing is silently absorbed into a side-channel.

**Recommendation: keep it this way.** This is already the correct architecture (single persistence owner, no dual-write, no silent alternate store) and matches MedCal's own already-locked Adoption Matrix, which independently calls out exactly this BIPMED pattern as a Do-Not-Copy anti-pattern. This reference trace confirms that decision was correct — do not introduce a fallback later "for resilience" without a very deliberate, reconciled design.

### D. Generic rate limiting

**BIPMED**: one shared limiter (1000 req / 15 min per IP) applies to *all* `/api/*` routes at the Express layer — no dedicated, tighter policy for the public contact-create endpoint specifically. The stricter `writeLimiter` that does exist in that codebase is wired only to product/translation/keyword admin routes, not `/api/contact`. At the NestJS layer, there is **no rate limiting at all** (confirmed via repo-wide search for a throttler module — zero hits).

**MedCal**: no rate limiting anywhere in the traced chain — not in `apps/web-api`, not in `apps/api`.

**What the current limit actually protects (BIPMED)**: broad API abuse/scraping across the whole surface, not contact-form spam specifically — a burst of 50 fake contact submissions in one minute would sail through untouched by that limiter.

**Recommendation (a model, not a number):** rate-limit the public create path specifically, at the edge (`apps/web-api`, since that's the layer already responsible for "captcha/rate-limit/forward" per its own header comment) — keyed by IP at minimum, tight enough to stop scripted bulk submission (order of a handful of submissions per minute, not hundreds), independent from any general API-wide limiter that might be added later for other purposes. `apps/api`'s internal endpoint doesn't need its own rate limit if it's genuinely only reachable via the trusted edge — but see item F below on whether that assumption should be enforced, not just assumed.

### E. CAPTCHA / bot protection

**BIPMED**: reCAPTCHA v3 verified server-side at the Next.js edge (`app/api/contact/route.ts`) — real, not client-trusted. **But it is explicitly skipped for any submission where `getFrom === 'WHATSAPP'`** — that entire code path (the "message me on WhatsApp about this product" CTA) has zero bot protection. Verification happens once, at one layer; nothing downstream (Express, NestJS) re-checks anything CAPTCHA-related — by the time the request reaches NestJS, the CAPTCHA outcome isn't even present anymore, it was consumed at the first hop.

**MedCal**: CAPTCHA is explicitly a `// TODO` — not implemented at all yet, at any layer.

**What must actually be verified server-side (not "use reCAPTCHA because BIPMED does"):** a CAPTCHA token must be (1) sent from the browser alongside the form payload, (2) verified server-side against the provider's API *before* the message is persisted, at the layer closest to the public boundary (`apps/web-api`, matching that layer's own stated responsibility), and (3) that verification result must never be something a client can spoof by simply omitting the check or claiming success — i.e., the absence of a token, or a failed verification, must hard-reject the request (400), not silently proceed. BIPMED's WhatsApp-path bypass is a cautionary example, not a pattern — if MedCal ever adds a similar "click to WhatsApp" shortcut that also creates a `ContactMessage`, it must not get a free pass from this check just because it's a different UI entry point into the same create endpoint.

### F. Public NestJS endpoint

**BIPMED**: `POST /cms/contactmessages/public` is public because the whole request chain is designed to route through the Next.js+Express edge first, but **nothing prevents a client from calling it directly**, bypassing CSRF, reCAPTCHA, and the Express rate limiter entirely — the NestJS endpoint itself has no additional gate (no shared secret, no service-identity check, no rate limit) beyond `class-validator` DTO shape checking. It trusts that callers will have gone through the edge; it does not verify they did.

**MedCal**: structurally better already — `apps/api`'s equivalent (`POST /internal/contact-messages`) is **not** purely public; it requires `InternalServiceGuard`'s shared-secret header. A client cannot call it directly without knowing `INTERNAL_API_SECRET`. This is the right shape; BIPMED's public NestJS endpoint is the pattern to explicitly avoid.

**Answer to "how should MedCal expose this safely if Express is the intended forwarder":** exactly as it does today — keep the shared-secret-gated internal endpoint, do not make it `@Public()`/unauthenticated the way BIPMED's is. The one gap (item A) is that the secret alone gates *access*, but the `x-company-id` value isn't independently verified once access is granted — fix that (§4A), don't remove the gate.

---

## 5. Express → NestJS Forwarding Security

**Browser → Express — trust boundary:**

| Field | Trust level | Why |
|---|---|---|
| `name`, `email`, `phone`, `organizationName` (prospect company), `message`, `subject`, `topicId` | Untrusted user input | Must be validated/sanitized at the edge (shape, length, format) — already partially done via `contactMessageCreateSchema` (Zod) in MedCal today |
| `getFrom` | Untrusted in principle, harmless in practice today | The current form hardcodes `"CONTACTFORM"` client-side — not attacker-controlled *content*, but structurally still "whatever the client sends," so the edge should still validate it's one of the allowed enum values (already does, via Zod `.enum([...])`) rather than assuming the frontend always behaves |
| internal `companyId` | **Never trust from the client** | Must always be server-derived (env var), both at the Express layer (already correct) and, per §4A, at the NestJS layer too |
| `createdBy`, `status` | **Never trust from the client** | Neither field is present in MedCal's current `contactMessageCreateSchema` at all — correct, keep it that way; if either is ever added to a future update/reply flow, it must come from the authenticated staff session, never the request body |

**Express → NestJS — how Express should authenticate itself:**

MedCal already uses the simplest secure mechanism appropriate here: a **shared secret in a custom header** (`x-internal-secret`), checked via `InternalServiceGuard`, combined with the fact that this is service-to-service traffic on infrastructure MedCal controls (not crossing an untrusted network boundary in the way a public API would). Evaluating the alternatives explicitly:

- **Signed service token (JWT-style, short-lived)** — more complex than needed for a single, fixed internal caller; worth it only if the number of trusted internal callers grows or if token rotation/expiry becomes a real requirement. Not justified today.
- **mTLS** — significant operational overhead (cert issuance/rotation) for a same-host or same-private-network deployment; not justified unless the two services cross a network boundary MedCal doesn't otherwise trust.
- **Private network access alone (no app-level secret)** — insufficient by itself; if `apps/api`'s port were ever exposed more broadly than intended (a misconfiguration, not a hypothetical — this exact class of mistake is why defense-in-depth matters), there'd be no second layer of protection.
- **Shared secret + network restriction (current MedCal direction, per the F5 Docker/Nginx work already locked)** — this is the right level: cheap, simple, and already combined with `apps/api` being bound to `127.0.0.1` only in production (per the already-locked deployment topology), so the secret is a second layer on top of network isolation, not the only layer. **Recommendation: keep this, don't add complexity.**

**Should NestJS accept `ContactMessage` creation directly from arbitrary public clients, or only from the trusted edge?**

Only from the trusted edge — exactly as it's built today (`InternalServiceGuard` + `@AllowAnonymous()` is not the same as BIPMED's `@Public()`; it still requires the secret). The tradeoff: making it truly public (BIPMED's approach) would mean CAPTCHA/rate-limiting/CSRF all live *only* at a layer the attacker can trivially skip by calling NestJS directly — which is precisely BIPMED's demonstrated weakness (§4F). Keeping it edge-gated means every protection Express adds (once CAPTCHA/rate-limiting are actually implemented, per §4D/§4E) is structurally unbypassable, not just conventionally expected to be respected.

---

## 6. Trust Boundary Diagram (MedCal, target state)

```text
UNTRUSTED
┌─────────────────────────────┐
│ Browser                     │
│ name, email, phone,         │
│ organizationName, subject,  │
│ message, topicId, getFrom   │  ← all user-controlled, none trusted as-is
└──────────────┬───────────────┘
               │ raw HTTP POST
               ▼
PUBLIC EDGE — apps/web-api (Express)
┌─────────────────────────────┐
│ • Zod schema validation      │  (already real — contactMessageCreateSchema)
│ • CAPTCHA verification       │  (currently TODO — must be implemented here)
│ • dedicated rate limit       │  (currently absent — must be implemented here)
│ • companyId := env var       │  (already correct — never from the client)
│ • x-internal-secret attached │  (already correct)
└──────────────┬───────────────┘
               │ authenticated service-to-service call
               │ (shared secret + network isolation)
               ▼
TRUSTED BACKEND — apps/api (NestJS)
┌─────────────────────────────┐
│ • InternalServiceGuard:      │
│   verify secret; companyId   │
│   should come from env, NOT  │  ← §4A fix belongs here
│   from the x-company-id      │
│   header                     │
│ • re-validate body shape     │  ← currently missing (§2/§3 finding) — the
│   (don't rely solely on the  │    TS type is compile-time only, no runtime
│   edge having validated)     │    protection if this endpoint is ever reached
│                               │    any other way
│ • business rules: customer-  │
│   match lookup, matchStatus  │
└──────────────┬───────────────┘
               │
               ▼
DATABASE — PostgreSQL / ContactMessage
   companyId always server-derived, never client-supplied at any point in the chain
```

Security responsibility is explicitly **not** all in the browser (BIPMED's CAPTCHA-at-one-layer-only pattern is the cautionary example — §4E), and Express validation does **not** replace NestJS validation (§2/§3's finding that `apps/api` has zero runtime validation today is the gap to close, independent of whether `apps/web-api` already checked the same thing).

---

## 7. Validation Responsibility by Layer

| Field | Frontend (UX only) | Express (edge) | NestJS (authoritative) | DB constraint |
|---|---|---|---|---|
| `email` | `type="email"`, `required` (already present in `kontak-form.tsx`) | Zod `.email().max(100)` (already present) | Should re-validate (currently doesn't — gap) | none beyond column type today |
| `phone` | `type="tel"` | Zod `.max(20).optional()` (already present) | Should re-validate | none |
| `name` | `required` | Zod `.min(1).max(100)` (already present) | Should re-validate | none |
| `organizationName` (prospect company) | plain text input | Zod `.max(100).optional()` (already present) | Should re-validate | none |
| `message` | `required` | Zod `.min(1)` (already present) | Should re-validate | none |
| `topicId` | n/a (no topic UI exists yet in MedCal — see §9) | Zod `.int().optional()` (already present, but not validated against any real lookup since no `Topic` model exists yet) | Once a `Topic` model exists: verify the ID actually resolves | FK constraint, once the model exists |
| `getFrom` | hardcoded literal in the current form | Zod `.enum([...])` (already present) | Should re-validate | Postgres enum type (already enforced at the column level) |
| internal `companyId` | n/a — never sent by the client | Set server-side from env (already correct) | **Must stop reading from `x-company-id` header; set from env directly (§4A)** | FK to `Company`, non-nullable (already correct) |
| `createdBy` | n/a | Not present in the schema today — correctly absent | N/A | N/A |
| `status` | n/a | Not accepted on create (schema defaults to `PENDING`) — correctly absent from the create DTO | N/A | enum default `PENDING` (already correct) |

**Public clients must not be able to freely choose `companyId`, `status`, `createdBy`, or `updatedBy`** — confirmed today: `status`/`createdBy`/`updatedBy` are already absent from `contactMessageCreateSchema`, so this is already correctly enforced by omission. The one field that *is* client-influenceable where it shouldn't be, even indirectly, is `companyId` via the `x-company-id` header (§4A) — the fix is the same principle applied one layer deeper than it currently is.

---

## 8. ContactMessage Domain — Field-by-Field Comparison

| Aspect | BIPMED | MedCal | Classification |
|---|---|---|---|
| Primary key | `id String @id @db.VarChar(100)` (app-generated string) | `id String @id @default(cuid())` | **KEEP MEDCAL** — cuid is a sound, collision-resistant default; no reason to match BIPMED's shape |
| Tenant field | `company_id String? @db.Char(5)`, **nullable** | `companyId String` (required), `@db.Char(3)` on the `Company` model it references | **KEEP MEDCAL** — MedCal's non-nullable tenant FK structurally prevents the "null row visible to everyone" bug BIPMED has (§4B) |
| `subject` | `String? @db.VarChar(150)` | `String?` (no explicit length in Prisma; Postgres `text` by default unless annotated) | **UNDEFINED** — worth deciding whether to add an explicit `@db.VarChar` cap for consistency with the rest of the model, not urgent |
| `topicId`/`topic_id` | `Int?`, **real FK** to `ContactTopic` | `Int?`, **orphaned**, no FK, no model | **ADOPT** the FK relationship — see §9 |
| `message` | `String @db.Text` | `String` (no explicit `@db.Text` annotation seen) | **UNDEFINED** — minor, likely already `text`-equivalent by Prisma's `String` default in Postgres; confirm during actual implementation, not a design decision |
| `name`, `email`, `phone` | `VarChar(100)`, `VarChar(100)`, `VarChar(20)` | Matches in the Zod schema (`.max(100)`, `.max(100)`, `.max(20)`) though Prisma column lengths weren't explicitly re-confirmed this session | **ADOPT** (already aligned via the Zod layer) |
| `company` (prospect org) | `String? @db.VarChar(100)`, plain free text | `organizationName String?`, plain free text | **ADOPT** — equivalent concept, equivalent (correct) implementation as an unstructured field for v1 |
| `status` | `ContactStatus` enum, DB-mapped to numeric strings (`@map("0")` etc. — a MySQL-era convention) | `ContactStatus` enum, native Postgres enum, no numeric mapping | **KEEP MEDCAL** — native enum is cleaner than string-mapped integers, no reason to match BIPMED's legacy mapping convention |
| `getFrom` | `GetMessageFrom` enum, same four+one values | Identical enum | **ADOPT** (already matching) |
| `matchStatus`/`matchedCustomerId`/`confirmedByUserId`/`confirmedAt` | **Does not exist in BIPMED** | Exists, actively written on create (`matchStatus`/`matchedCustomerId`), read/acted on nowhere yet | **KEEP MEDCAL (already ahead)** — no BIPMED pattern to compare against |
| `createdBy`/`updatedBy` | `String? @db.VarChar(100)` — free text, client-suppliable (`createdBy: sanitizedData.name` in BIPMED's own frontend!) | Does not exist on `ContactMessage` at all | **DO NOT ADOPT** — BIPMED's `createdBy` on a *public, unauthenticated* create is essentially just "whatever name the submitter typed," not a real audit trail (it's not a `User` FK); MedCal correctly has no such field on this public-create model. If a real audit trail is wanted later, it belongs on `confirmedByUserId`-style fields tied to actual staff sessions, not a copy of BIPMED's free-text `createdBy` |
| Indexes | `[email]`, `[createdAt]` | `[companyId,createdAt]`, `[companyId,email]`, `[companyId,status]`, `[companyId,getFrom]` | **KEEP MEDCAL** — every index is correctly tenant-prefixed; BIPMED's bare `[email]` index would be a cross-tenant leak vector if ever used for a lookup query without an accompanying `company_id` filter |

---

## 9. ContactTopic — Minimum MedCal Implementation

**BIPMED's actual implementation** (confirmed via source trace): a real Prisma model (`id SmallInt, name, name_en, def_message, def_message_en`), populated by a **one-off seed script** (`seed-contact-topics.ts`, 7 hardcoded rows), used in exactly two places: (1) the public form's topic dropdown, which also auto-fills the message textarea from `def_message`/`def_message_en` when a topic is selected, and (2) the staff inbox as a display column + an API-level filter (`topic_id` query param exists on the list endpoint, though the specific list UI checked didn't actually surface a topic filter control — the capability exists in the API without being exposed in that particular screen). **No admin CRUD UI exists anywhere for managing topics** — they're static, seeded once.

**MedCal today**: `topicId Int?` with no relation, no model — every value written to it (if any ever were) would be meaningless, since there's nothing to validate it against or join to.

**Minimum recommended MedCal implementation** (deliberately matching BIPMED's actual proportions, not inventing more): a small `Topic` model (id, name — bilingual only if MedCal's UI is bilingual, which isn't confirmed in scope here so treat as UNDEFINED) with a proper `@relation` from `ContactMessage.topicId`, populated via a seed script with a handful of MedCal-relevant categories (e.g., calibration types/service inquiries relevant to BIPMED's medical-device calibration business), **no admin CRUD screen** — BIPMED itself doesn't have one and doesn't need one, so building one for MedCal now would be overengineering relative to the proven reference.

---

## 10. GetMessageFrom — Contact Form Path Only

Confirmed (both repos, source-level): only **`CONTACTFORM`** is genuinely wired to a real, currently-functioning creation path through the Contact Form. `WHATSAPP` is wired in BIPMED (via a separate WhatsApp-CTA save-then-redirect flow, not the contact form itself) but MedCal has no equivalent WhatsApp-intake code path yet — this is out of scope per your Non-Goals (WhatsApp conversation), so no recommendation is made here beyond noting the enum value already exists and is structurally ready if that path is ever built. `EMAIL`, `CHAT_AI`, `CHAT_PERSON` are confirmed **not** wired to any creation path in BIPMED at all — dead enum values with UI treatment (icons, filter options) but no code that ever sets them. **For the Contact Form specifically: `CONTACTFORM` is the only value that belongs in this path.** No other value should be settable by the Contact Form UI (and today, correctly, none of the others are — the current `kontak-form.tsx` hardcodes `"CONTACTFORM"`).

---

## 11. ContactStatus — Actual vs. Theoretical Behavior

Confirmed via BIPMED source trace: default `PENDING` on create. **`READ` is never set automatically** anywhere in the traced code — opening a message in the staff detail page does not PATCH the status; it's a manual dropdown + explicit "Update" button click. **`REPLIED` has a backend code path that sets it automatically** (a `send-email` endpoint), **but the actual staff UI never calls that endpoint** — its "Reply via Email" button deep-links to a separate email-compose module instead, and "Reply via WhatsApp" opens an external `wa.me` link — so in the UI as actually built and used, staff reply externally and then manually flip the status dropdown themselves. Delete exists at the API level (`ADMIN`-only) but its confirm button is commented out/disabled in the UI, making it effectively unreachable today. Status changes do trigger a fresh FCM notification, but only in one specific direction (reopening to `PENDING` from something else), not on every transition.

**For MedCal: adopt the observed behavior, not the unused backend capability.** A manual status dropdown, external reply (matching MedCal's own locked WhatsApp-passive-handoff decision and the fact that email-sending is currently just a no-op stub in `packages/notifications`), no automatic `READ`-on-open, is the correct, proportionate design for a first version — building an auto-reply-triggers-REPLIED mechanism now would be building something BIPMED itself has but doesn't actually use.

---

## 12. Notifications (ContactMessage creation only)

**BIPMED**: Firebase Cloud Messaging (web push) fired synchronously-but-fire-and-forget inside `contactmessage.service.ts`'s `create()` — the FCM call happens after the Prisma write, wrapped so that a notification failure is caught and swallowed (logged, not thrown), meaning it **never blocks or rolls back the `ContactMessage` creation**. Payload includes a title (`📬 Pesan Baru dari {name}`), a body preview, and a click-through URL to the message's detail page. It targets "Chat PICs" for that company specifically (tenant-scoped recipient list) — not a broadcast to all staff company-wide.

**MedCal today**: `packages/notifications` is entirely unused stubs (`sendEmail`/`sendPush` are literal no-ops); `contact-messages.service.ts` has zero notification code — nothing fires on create at all right now.

**Recommendation**: when MedCal wires this up, follow BIPMED's shape exactly on the one principle that matters most — **notification failure must not fail the `ContactMessage` transaction** (write first, notify after, catch-and-log any notification error, never wrap them in the same failable unit) — and keep the recipient list tenant-scoped (whichever staff are relevant to that `companyId`, not a global broadcast). The specific transport (FCM vs. something else) is outside this audit's scope to recommend, since it touches the broader notifications/push infrastructure decision, not `ContactMessage` specifically.

---

## 13. Security Improvement Matrix

| Area | BIPMED behavior | Risk | MedCal recommendation | Priority |
|---|---|---|---|---|
| `companyId` on create | Client-suppliable string, zero verification, public unauthenticated endpoint | High — a malicious/misconfigured caller can write into any tenant | Stop accepting `x-company-id` as input in `InternalServiceGuard`; derive from `process.env.COMPANY_ID` directly, same as the read path | **High** |
| Tenant read scope | Query param overrides session-derived scope, no authorization check; null rows globally visible | High — direct cross-tenant data read | No change needed — MedCal's `CompanyRoleGuard` is already correct; do not add a client-suppliable `company_id` filter later | **Preserve (no action needed now, but a future regression risk to watch)** |
| Express → NestJS trust | No auth at all on the public NestJS endpoint; Express-layer protections are trivially bypassable by calling NestJS directly | High (in BIPMED) | MedCal already gates this correctly (shared secret); keep as-is, just fix the `companyId` handling inside it (see row 1) | **Low (already mitigated)** |
| CAPTCHA | Real server-side verification, but skipped entirely on one submission path (WhatsApp CTA) | Medium — a known, demonstrated bypass exists even in the "working" reference | Implement CAPTCHA verification in `apps/web-api` for the Contact Form path; if any future alternate entry point is added, do not exempt it without a deliberate, documented reason | **High (currently a bare TODO in MedCal)** |
| Rate limiting | One broad, shared limiter; no dedicated policy for contact-create | Medium — bulk spam submission is easy | Add a dedicated, tighter limiter on `apps/web-api`'s `/public/contact-messages` specifically | **Medium** |
| Validation | Real, global `ValidationPipe` at the NestJS layer in BIPMED | — (BIPMED is fine here) | MedCal's `apps/api` currently has **zero** runtime validation on this endpoint (TS types are compile-time only) — add real validation (re-parse the Zod schema, or an equivalent Nest pipe) inside `apps/api` itself, don't rely solely on `apps/web-api` having already checked | **High** |
| Fallback persistence | Local JSON file + local DB, two extra sources of truth, no reconciliation | Medium — data can silently go missing from the real inbox during an outage | Keep MedCal's current no-fallback design (fail loudly with a 502) | **Preserve (no action needed)** |
| Public endpoint | Fully public NestJS endpoint, no gate beyond hoping callers went through the edge | High (in BIPMED) | MedCal already correct (secret-gated); no change | **Low (already mitigated)** |
| Sanitization | HTML sanitization middleware exists at the Express layer in BIPMED | — | Confirm MedCal's edge does equivalent sanitization on free-text fields (`message`, `subject`, `organizationName`) before persistence — not confirmed present in `apps/web-api` today beyond Zod's type/length checks, which don't sanitize HTML/script content | **Medium** |
| Notification | Fire-and-forget, failure-swallowed, tenant-scoped recipients | — (sound pattern) | Adopt the same shape once notifications are wired up; not urgent since nothing fires today | **Low (deferred until notifications are built)** |

---

## 14. Adoption Matrix — Contact Form / ContactMessage

| BIPMED Feature / Pattern | MedCal Decision | Reason |
|---|---|---|
| `ContactMessage` model shape | **ADOPT** (with MedCal's existing improvements kept) | Core fields equivalent; MedCal's tenant-FK and match-status fields are already sound extensions |
| `ContactTopic` | **ADOPT** | Real, proven, cheap pattern; MedCal's `topicId` is currently an orphaned no-op field |
| `ContactStatus` | **ADOPT** (observed behavior only, not unused backend capability) | Manual-only transitions, no auto-READ, external reply — matches what BIPMED actually does, not what it theoretically could |
| `GetMessageFrom` | **ADOPT** | Enum shape already matches; only `CONTACTFORM` is in-scope for this path |
| Server-side validation | **IMPROVE** | BIPMED does this correctly at its NestJS layer; MedCal's `apps/api` currently does not — needs to be added |
| CAPTCHA | **ADAPT** | Verify the concept (server-side, pre-persistence), reject BIPMED's WhatsApp-path bypass as a pattern |
| CSRF | **ADAPT** | BIPMED protects its own Next.js-route-to-Express hop with a CSRF token; MedCal's equivalent hop (`kontak-form.tsx` → `apps/web-api`) has none today — evaluate whether it's needed given the current same-origin-ish deployment, don't blindly copy the mechanism without confirming the threat model matches |
| Rate limiting | **IMPROVE** | BIPMED's is too broad/generic; MedCal has none — needs a dedicated, tighter policy at the edge |
| Express forwarding (thin, no persistence) | **ADOPT** | Already MedCal's exact design |
| NestJS persistence owner | **ADOPT** | Already MedCal's exact design |
| `companyId` handling on create | **IMPROVE** | Fix per §4A/§13 row 1 — stop trusting the header, derive from env |
| Tenant read isolation | **KEEP MEDCAL** | Already stricter/correct than BIPMED; do not weaken |
| Local DB fallback | **DO NOT ADOPT** | Confirmed anti-pattern, already correctly absent from MedCal |
| Local JSON fallback | **DO NOT ADOPT** | Same reasoning |
| Notification | **ADOPT (shape only, once built)** | Fire-and-forget, non-blocking, tenant-scoped; nothing exists yet in MedCal to adopt into today |
| Status behavior | **ADOPT (observed only)** | See `ContactStatus` row above |
| Inbox API shape (pagination/filter/search/stats) | **ADOPT** | Proven, MVP-appropriate design — but this is Inbox UI/API work, only mentioned here because `ContactMessage.status`/`getFrom` are the fields it filters on; building the inbox itself is out of this audit's scope |

---

## 15. Final Architecture Proposal (no code)

The originally sketched diagram in your prompt is directionally correct. Corrected/annotated based on repository evidence:

```text
                    ┌──────────────────┐
                    │   Contact Form   │
                    │  apps/web browser │
                    └────────┬─────────┘
                             │  untrusted: name, email, phone,
                             │  organizationName, subject, message,
                             │  topicId, getFrom (hardcoded client-side today)
                             ▼
                    ┌──────────────────────────┐
                    │  apps/web-api (Express)  │
                    │                          │
                    │  • Zod schema validation │  ← already real
                    │  • CAPTCHA verification  │  ← TODO, must be added
                    │  • dedicated rate limit  │  ← missing, must be added
                    │  • companyId := env var  │  ← already correct
                    │  • sanitization check    │  ← confirm/add for free-text fields
                    └────────┬─────────────────┘
                             │  authenticated service-to-service
                             │  (x-internal-secret + network isolation,
                             │   NOT client-suppliable company_id)
                             ▼
                    ┌──────────────────────────┐
                    │  apps/api (NestJS)       │
                    │                          │
                    │  • InternalServiceGuard: │
                    │    companyId FROM ENV,   │  ← fix: stop reading
                    │    not from the header   │    x-company-id header
                    │  • re-validate body shape│  ← add: currently absent
                    │  • business rules        │  ← already present
                    │    (customer-match)      │    (matchStatus logic)
                    └────────┬─────────────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ ContactMessage   │
                    │ + Topic (new)    │
                    │ PostgreSQL       │
                    └──────────────────┘
```

The one structural correction to your sketch: the arrow from Express to NestJS should be explicitly labeled as carrying **service identity, not tenant identity** — `companyId` should not be something that flows through that arrow as data at all once §4A's fix is applied; it should be independently derived on both sides from each service's own environment configuration.

---

## 16. Explicit Non-Goals (confirmed respected)

Lead, Lead Pipeline, Lead↔ContactMessage relationship, Web Chat, `ChatSession`/`ChatMessage`, AI, WhatsApp conversation (beyond noting the `WHATSAPP` enum value's existence, per §10), Email inbox integration, Customer matching beyond what `ContactMessage.create()` itself already does (the `matchStatus`/`matchedCustomerId` lookup, which is directly part of this model and was in-scope to describe, not to redesign), Calibration Request, sales pipeline, and assignment workflow were not analyzed or redesigned in this document.

---

## A. What We Should Copy From BIPMED

- The thin-Express/NestJS-owns-persistence topology (already MedCal's design — confirmed sound by comparison).
- A real `ContactTopic`/`Topic` model, seeded statically, no admin CRUD — proven proportionate.
- The "notification failure never blocks the write" principle for whatever notification mechanism MedCal eventually wires up.
- Server-side CAPTCHA verification as a *concept* (not BIPMED's specific bypass-riddled implementation).
- Manual-only status transitions, external reply — matches BIPMED's actual (not theoretical) behavior and is the right proportion for a v1.

## B. What We Should NOT Copy From BIPMED

- Local JSON/local-DB fallback persistence (dual source of truth, no reconciliation).
- Client-controlled `company_id` on create, trusted without independent server-side verification.
- Client-controlled `company_id`/query-param override on read.
- A fully public (unauthenticated) NestJS create endpoint with no gate beyond assumed caller discipline.
- CAPTCHA verification that's skippable via an alternate submission path.
- `createdBy` as a free-text, client-suppliable field on a public-create model (not a real audit trail).
- A single broad rate limiter standing in for endpoint-specific abuse protection.

## C. How Express → NestJS Should Work Securely

Keep the current shared-secret model (`x-internal-secret`, checked by `InternalServiceGuard`), combined with network-level isolation (`apps/api` bound to a private interface in production, per the already-locked deployment topology) — this is already the right level of complexity for a single, fixed, trusted internal caller; neither JWT-style service tokens nor mTLS are justified by the current architecture's actual threat model. The one required change: `companyId` must stop traveling through this boundary as request data (`x-company-id` header) and instead be independently derived from each service's own environment configuration on both sides, matching how the authenticated read path already works.

## D. MedCal ContactMessage Target Architecture

As diagrammed in §15: Contact Form → `apps/web-api` (validation, CAPTCHA, rate-limit, env-derived tenant) → `apps/api` (env-derived tenant confirmation, re-validation, business rules) → `ContactMessage` (+ a new `Topic` model). No new persistence layer, no fallback store, no client-influenceable tenant identity anywhere in the chain.

## E. Decisions That Need To Be Locked Before Coding

1. **CAPTCHA provider/mechanism** — which service, what server-side verification flow, applied uniformly to every Contact Form submission path with no exemptions.
2. **Rate-limit policy specifics** — exact threshold and window for the dedicated contact-create limiter (a model was recommended in §4D; the number itself is a product/ops call).
3. **`InternalServiceGuard` change** — confirm the recommended fix (derive `companyId` from env, stop accepting `x-company-id`) is acceptable, since it's a behavior change to an existing guard, not new functionality.
4. **NestJS-layer validation mechanism** — whether to re-use the existing Zod schema (`contactMessageCreateSchema`) via a custom pipe, or introduce `class-validator` DTOs matching BIPMED's pattern; either is defensible, but one should be chosen for consistency with the rest of `apps/api`.
5. **`Topic` model shape** — bilingual fields (like BIPMED's `name`/`name_en`) or single-language, and what the initial seed list should actually contain for MedCal's calibration-service domain.
6. **Sanitization approach for free-text fields** — confirm whether Zod's type/length checks are considered sufficient, or whether explicit HTML/script sanitization (matching BIPMED's middleware) should be added at the edge.
7. **CSRF applicability** — whether the `apps/web` → `apps/web-api` hop needs a CSRF token given MedCal's actual deployment/origin model, rather than assuming BIPMED's need for one automatically transfers.
8. **The soft-error bug** (`{error:"Unknown companyId",statusCode:400}` returned with an actual HTTP 200) — confirm this should be fixed to a real thrown exception with the correct status code; noted here as a correctness finding surfaced during this audit, not a security issue, but worth deciding alongside the other changes since it's in the same function.

## F. Recommended Implementation Order

```text
1. Fix InternalServiceGuard: derive companyId from env, stop trusting x-company-id header
2. Add real request validation inside apps/api (re-validate, don't rely solely on the edge)
3. Fix the soft-error response (Unknown companyId) to return an actual HTTP 400
4. Add Topic model + seed script + FK from ContactMessage.topicId
5. Implement CAPTCHA verification in apps/web-api (server-side, pre-forward, no bypass paths)
6. Add a dedicated rate limiter for the contact-create endpoint in apps/web-api
7. Confirm/add sanitization for free-text fields at the edge
8. Wire up notification-on-create (fire-and-forget, non-blocking, tenant-scoped) — once the
   broader notifications infrastructure decision is made (out of this audit's scope to decide)
9. Build the Inbox API (pagination/filter/search/stats) on top of the now-hardened create path
```
