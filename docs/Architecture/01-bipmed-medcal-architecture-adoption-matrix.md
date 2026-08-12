# BIPMED → MedCal Architecture Adoption Matrix (FINAL — LOCKED)

**Status:** Finalized architecture decision document. This is the **canonical, single source** for the complete BIPMED → MedCal adoption matrix. Domain/technical docs (`docs/cursor/business-domain.md`, `docs/cursor/entity-catalog.md`, `docs/cursor/medcal-app_Action Plan.md`, ADR-000) reference this document for the full rationale — they only carry the decisions relevant to their own subject, not the full matrix.

**Do not reopen these decisions.** Changes require a new ADR, not an edit to this file.

---

## Resolution of the two final open points

### 1. Application ↔ subdomain mapping — RESOLVED: Option A

**Recommendation: one `apps/portal` Next.js application serves both `apps.kalibrasimedika.co.id` and `portal.kalibrasimedika.co.id`.** Do not create a separate `apps/management` application.

**Why, against every requested criterion:**
- **Existing documentation/repository structure:** `business-domain.md`'s own surface matrix already lists "Dashboard," "Customer Portal," "Mini ERP UI," and "Document Vault UI" as separate *conceptual* surfaces, but the Action Plan's actual scaffolded monorepo (Fase 0, already built) has exactly one app for all of this — `apps/portal`, explicitly documented as "Next.js Customer + Admin + SW." Splitting now would mean partially un-scaffolding completed Foundation work to match a subdomain decision made after that scaffold existed — the lower-disruption path is routing one app to two hostnames, not creating a second app.
- **PWA/service-worker scope:** the concern that motivated wanting separate "surfaces" is satisfied by the **hostname**, not by a separate codebase. A PWA's manifest/service-worker scope is origin-bound; `apps.*` and `portal.*` are different origins regardless of whether one Next.js codebase or two serves them. A dynamic manifest route (returning different `manifest.json` content based on the incoming `Host` header) plus Next.js middleware selecting a route group (`app/(management)` vs `app/(client)`) per hostname gives each subdomain its own clean, independent PWA identity from a single deployed service.
- **Authentication:** identical either way — Better Auth is centralized in `apps/api` regardless of which frontend renders the UI. Not a differentiator.
- **RBAC / security boundary — the deciding factor:** authorization was already confirmed to live entirely in NestJS RBAC, not in the frontend or the subdomain itself (the same principle already established for `technician.*`: "the subdomain is NOT itself an authorization boundary"). A client user reaching `apps.kalibrasimedika.co.id` is stopped by two independent, real controls: (a) Next.js middleware selects the client route group for a session without staff permissions, so the management UI isn't even rendered, and (b) even if a request somehow reached a management API call, NestJS's RBAC guard rejects it server-side because the caller's role/permissions don't include the required capability — the same guard that protects every other endpoint. Since the real security boundary is already server-side and role-based, splitting into two applications would not add any security that doesn't already exist, only operational overhead.
- **Maintainability / code reuse:** two apps would require extracting shared components (layout, Better Auth client wiring, API client, notification handling) into `packages/ui` *now*, which directly conflicts with MedCal's own locked principle: "Premature extraction ke `packages/ui`" is explicitly listed under things not to do until proven need (Action Plan §2). One app with internal route groups reuses everything naturally with no extraction forced.
- **Deployment complexity:** one Docker Compose service (`portal`, already in the existing service list) can serve both hostnames — the reverse proxy simply routes both `apps.*` and `portal.*` to the same container; no new service, image, or CI/CD pipeline is needed. This also guarantees the two surfaces can never drift out of version-sync with each other, since they're always the same deployed artifact.
- **Whether splitting creates unnecessary complexity now:** yes, clearly — it would front-load an application split, a shared-package extraction, and a second deployment pipeline for a separation that RBAC already provides, contradicting MedCal's own KISS principle ("hindari overengineering sebelum kebutuhan terukur").

**If this ever needs to change** (e.g., the two surfaces need genuinely divergent tech stacks, wildly different scaling profiles, or separate team ownership), that is itself a new ADR at that time — not something to pre-build for today.

**No documentation update beyond this record is required** — the existing "Customer + Admin" description of `apps/portal` was already correct; only the routing detail (host-based route-group selection per subdomain) is new information worth noting in `entity-catalog.md`/Action Plan when they're next touched, but it is a clarification, not a contradiction requiring a structural change.

### 2. Anonymous public website chat — RESOLVED: narrow chat-continuity token, not an identity system

**Mechanism:** a signed, opaque `ChatSessionToken` issued by `apps/api` the first time a visitor opens the chat widget with no existing valid token, stored as its own cookie — **distinct in name and purpose from the Better Auth session cookie** — scoped to the shared parent domain (`.kalibrasimedika.co.id`), `HttpOnly`, `Secure`, `SameSite=Lax`, with its own (shorter/independently-tunable) expiry.

**What it is:**
- A credential that unlocks access to **exactly one `ChatSession` row** — nothing else. It carries no role, no permissions, no `userId`, and never participates in NestJS RBAC.
- Validated on WS connect/reconnect and on any REST call scoped to that one conversation (e.g., fetching prior messages) by checking the token against the `ChatSession` record directly — a narrow, chat-domain-owned check, structurally separate from `auth.api.getSession()` and from `packages/auth` entirely. This chat-domain validation logic lives with the Chat module in `apps/api`, not in `packages/auth`.
- Revocable/expirable by design: TTL-based expiry and/or invalidation when staff close the conversation, so it cannot be replayed indefinitely.
- **Not mergeable into a real account automatically.** If the visitor becomes a lead/customer, that happens through the already-locked, explicit `ContactMessage`/email-domain-match-plus-admin-confirmation flow — never an automatic "promote this anonymous session to a user" step.

**How this connects to the already-decided Chat WebSocket architecture:** the WS gateway's `handleConnection` now has two validation branches, not one — if the connecting client presents a Better Auth session cookie, validate via the in-process `auth.api.getSession()` (staff/authenticated path); if it presents (or needs to be issued) a `ChatSessionToken` instead, validate/issue via the narrow chat-continuity check above (anonymous visitor path). Both branches terminate in the same `ChatSession`/`ChatMessage` domain model.

**`ChatSession`/`ChatMessage` schema implication:** no new fields beyond what a `ChatSessionToken`-to-`ChatSession` mapping requires (e.g., a hashed token column or a join, at implementation time — not specified further here, per "documentation only, no schema change"). This does not reopen or require the previously-rejected `mode` field.

---

## Final consistency check

| Check | Status |
|---|---|
| No section contradicts a locked decision | Pass — the two resolutions above are additive, not reversals |
| `ChatSession`/`ChatMessage` are MVP | Pass — confirmed, referenced consistently throughout |
| FCM is the push mechanism | Pass — confirmed, no native-Web-Push language remains live (only noted historically as a resolved past contradiction) |
| WhatsApp remains passive-only in MVP | Pass — confirmed, `whatsapp/` adapter explicitly scoped to no active messaging |
| Better Auth remains in NestJS | Pass — confirmed, in-process validation, no bridge/second service |
| Express remains public-edge-only, zero DB/auth dependency | Pass — confirmed, and the new anonymous-chat mechanism does not involve Express at all (it's issued/validated entirely by `apps/api`) |
| Docker Compose remains the deployment model | Pass — confirmed, no service-count change from either resolution above (still one `portal` service, no new chat/auth service) |
| No speculative AI schema introduced | Pass — `ChatSession.mode` remains omitted; the anonymous-chat resolution adds no AI-related concept |
| No Better Auth `organization` plugin introduced | Pass — untouched by either resolution; `ChatSessionToken` is explicitly not a Better Auth construct at all |

**No contradiction remains.** The Adoption Matrix is finalized below.

---

## Executive summary

MedCal adopts BIPMED's proven **intake pattern** (`ContactMessage` + `GetMessageFrom` + `ContactStatus`) and its **Express-as-public-edge-only / NestJS-as-sole-business-layer** boundary, while explicitly rejecting BIPMED's authentication approach (custom JWT, replaced by Better Auth hosted inside NestJS), its unscoped `company_id` trust pattern, its Express-direct-to-database fallback, and its disconnected Lead/Chat data model where useful to improve on. Human Live Chat and FCM push notifications are MVP capabilities, not deferred. WhatsApp remains a passive `wa.me` handoff only. The production topology is five subdomains under one registrable parent domain (`kalibrasimedika.co.id`), fronted by a reverse proxy that may or may not be exclusively MedCal's own, deployed via Docker Compose exactly as MedCal's own Action Plan already specifies.

## Adoption matrix

Legend: **ADOPT** = use as-is · **ADAPT** = same concept, different implementation · **REDESIGN** = BIPMED's approach insufficient · **DO NOT COPY** = explicitly rejected · **DEFER** = useful, not now.

### Foundation

| Capability | BIPMED Pattern | What Works | Problem/Risk | MedCal Decision | Target Approach | Phase | Dependencies |
|---|---|---|---|---|---|---|---|
| Backend boundary | Express hits Prisma directly as a fallback when the Nest call fails | Express does validation/captcha/rate-limit well | Fallback silently bypasses Nest's notification trigger | **DO NOT COPY** the fallback; **ADOPT** the edge-forwards-to-Nest shape | Express has zero DB access, ever — no fallback path exists at all | Foundation | Confirmed, locked |
| Monorepo/package layout | N/A (BIPMED is not a monorepo) | — | — | **REDESIGN** | Turborepo/pnpm, `apps/{web,web-api,portal,tech-pwa,api}` + `packages/{shared,db,auth,notifications,config,ui}`, layered dependency rule (shared → db → auth → api) | Foundation | Already scaffolded, Fase 0 done |
| Deployment | N/A | — | — | **ADOPT** MedCal's own already-locked plan | Docker Compose, services = web/web-api/portal/tech-pwa/api/postgres, behind a reverse proxy MedCal may or may not own | Foundation | Already scaffolded |

### Authentication

| Capability | BIPMED Pattern | What Works | Problem/Risk | MedCal Decision | Target Approach | Phase | Dependencies |
|---|---|---|---|---|---|---|---|
| Auth framework | Custom JWT + Passport, hashed refresh token, role re-derived from DB per request | Per-request DB role re-derivation avoided stale-JWT-role bugs | Single-refresh-token-per-user breaks multi-device; no internal Better Auth precedent exists anywhere in this org's history | **DO NOT COPY**; **ADOPT** Better Auth | Better Auth server hosted inside `apps/api`; session-per-sign-in gives native multi-device support without extra plugins | Foundation | `packages/auth` → `packages/db` |
| Session validation bridge | N/A (single custom service) | — | — | **ADOPT** the simplest available option | NestJS validates in-process via `auth.api.getSession()`; official `@thallesp/nestjs-better-auth` package (`AuthModule`, `AuthGuard`, `@Session()`/`@AllowAnonymous()`) | Foundation | Domain topology (cookie scoping) |
| Second token system | N/A | — | — | **DO NOT COPY/DO NOT INTRODUCE** | No hand-rolled JWT; Better Auth's own `jwt` plugin deferred until a concrete cross-service need exists | N/A | Deferred |
| Registration gate | Whitelist check exists in BIPMED's schema but is dead code; actual gate is open registration + mandatory email verification | — | Contradicts MedCal's actual requirement | **REDESIGN** | Pre-existing-email whitelist required, no verification step, enforced via a Better Auth sign-up hook | Foundation | `EmailWhitelist` entity |
| Password reset | Email+new-password only, no proof-of-ownership token | — | User-enumeration/account-takeover risk | **DO NOT COPY** | Better Auth's own reset flow (token-based) | Foundation | Better Auth defaults |

### MFA

| Capability | BIPMED Pattern | What Works | Problem/Risk | MedCal Decision | Target Approach | Phase | Dependencies |
|---|---|---|---|---|---|---|---|
| MFA | None in BIPMED | — | — | **DEFER** | Better Auth's plugin model (e.g. `twoFactor`) added later without schema rework; mechanism + role policy decided at the calibration-management/portal phase | Later | Better Auth foundation only |

### Authorization / RBAC

| Capability | BIPMED Pattern | What Works | Problem/Risk | MedCal Decision | Target Approach | Phase | Dependencies |
|---|---|---|---|---|---|---|---|
| Role model | String-role `@Roles()` guard + `sys_UserCompanyRole.findFirst` (no explicit order — nondeterministic on multi-role users) | Simple, globally-applied guard pattern | Company-scoping via query param not membership-checked; nondeterministic role resolution | **ADAPT** | Role→Permission→Resource→Action via Better Auth `admin` plugin + custom `access-control` statements; `companyId` filtering centralized in Nest guards/interceptors, not hand-rolled per service | Foundation | Better Auth, single-tenant model |
| Frontend permission visibility | Dashboard menu driven entirely by backend permission endpoint | Correctly non-authoritative (backend still gates) | None significant | **ADOPT** the principle | UI hides what a role can't use, but every action re-checks server-side; subdomain (`apps.*` vs `portal.*`) is a UX boundary, never a security boundary | Foundation | RBAC layer |
| Multi-tenancy | Multi-company-in-one-schema (BIP/BIS/KBIP) | — | Adds complexity MedCal doesn't need | **DO NOT COPY** | Single company per deployment, `companyId` retained in schema for future-readiness, no Better Auth `organization` plugin | Foundation | ADR-000 |

### User & Permission Management

| Capability | BIPMED Pattern | What Works | Problem/Risk | MedCal Decision | Target Approach | Phase | Dependencies |
|---|---|---|---|---|---|---|---|
| Superadmin/whitelist authority | N/A | — | — | **ADOPT (new)** | No separate "Super User" role; whitelist management is a permission (`whitelist:manage`) assigned to `superadmin` by default | Foundation | RBAC |
| `EmailWhitelist` shape | Dead/unused table in BIPMED's reference project | — | — | **REDESIGN** | Normalized unique email, `active`/`revoked` status (reusable, not consumed), `createdBy`/`createdAt`/`revokedBy`/`revokedAt` audit fields, no `companyId` column | Foundation | — |

### Website Security

| Capability | BIPMED Pattern | What Works | Problem/Risk | MedCal Decision | Target Approach | Phase | Dependencies |
|---|---|---|---|---|---|---|---|
| Public endpoint abuse controls | Contact-form CAPTCHA/rate-limit at Express only; Nest's public endpoint trusts the upstream call with no independent check | Layered defense at the edge | Nest's own public endpoint has zero abuse control if called directly | **ADAPT** | Keep Express-layer captcha/rate-limit; add independent rate-limiting on Nest's public `ContactMessagesModule` endpoint too, not trust-only | Foundation | — |
| CSRF | Bypassed entirely for contact/chat routes in BIPMED's Express layer | — | Acceptable there given reCAPTCHA covers it | **ADOPT** Better Auth's own CSRF model | `trustedOrigins` origin/referer validation as the primary defense for authenticated routes | Foundation | Domain topology |
| WebSocket auth | Custom risk-scoring + per-IP/session rate limiting, audit log | Solid layered defense | — | **ADAPT** | Same in-process Better Auth session check (staff) or narrow `ChatSessionToken` check (anonymous visitor) at WS connect; origin header validated manually server-side | Foundation | Chat architecture |

### Lead / Contact

| Capability | BIPMED Pattern | What Works | Problem/Risk | MedCal Decision | Target Approach | Phase | Dependencies |
|---|---|---|---|---|---|---|---|
| Intake model | `ContactMessage` + `GetMessageFrom` (CONTACTFORM/WHATSAPP/CHAT_AI/CHAT_PERSON/EMAIL) + `ContactStatus` | Proven, simple, working intake core | No attribution/UTM capture at all | **ADOPT** the core model; **REDESIGN** attribution readiness | Same `ContactMessage`/`GetMessageFrom`/`ContactStatus` shape (bi-erp-aligned), plus a `matchStatus` extension field; schema stays attribution-ready (flexible field) even though capture logic is deferred | MVP | — |
| Lead vs. Customer dedup | Not modeled in BIPMED at all (no FK, no matching logic) | — | Duplicate CRM records | **REDESIGN** | Email-domain match (public-domain blocklist) + mandatory admin confirmation before merging into an existing `Customer`; no silent auto-merge | MVP | CRM domain |

### WhatsApp

| Capability | BIPMED Pattern | What Works | Problem/Risk | MedCal Decision | Target Approach | Phase | Dependencies |
|---|---|---|---|---|---|---|---|
| WhatsApp flow | Identity capture → persist as `ContactMessage` (CAPTCHA skipped) → `wa.me` handoff | Simple, no infra dependency | CAPTCHA bypass is a proven spam vector | **ADOPT** the handoff shape; **ADAPT** the spam gap | Same capture-then-handoff flow; do not skip CAPTCHA/rate-limit for WhatsApp-sourced submissions | MVP | Lead/Contact intake |
| WhatsApp Business API | None in BIPMED | — | — | **DO NOT INTRODUCE** | Passive `wa.me` only; no receiving, no dashboard replies, in MVP. `whatsapp/` adapter is a future extension point only | Confirmed, not MVP | — |

### Human Chat

| Capability | BIPMED Pattern | What Works | Problem/Risk | MedCal Decision | Target Approach | Phase | Dependencies |
|---|---|---|---|---|---|---|---|
| Chat/Lead relationship | `ChatSession`/`ChatMessage` entirely disconnected from `ContactMessage` — no FK | Both funnel to the same staff notification pool | No database-level link between a conversation and the resulting lead | **ADAPT** | Chat conversations expressing service intent link to/create a `ContactMessage` (`getFrom=CHAT_PERSON`), per MedCal's own already-locked D04 rule | MVP | — |
| AI involvement | `ChatMode` enum (AI_ONLY/AI_WITH_HUMAN/HUMAN_ONLY) | Extensible for future AI | Speculative schema if AI isn't being built yet | **DO NOT COPY the schema now** | No `mode` field in MVP; human-responder-only; AI is a future ADR + migration, not an idle column | MVP (human-only) | — |
| WebSocket ownership | Hosted in Express, separate from the Nest business layer, forwards events to Nest via a fire-and-forget service call | Works, but is a second auth surface | Duplicated trust boundary | **REDESIGN** | WS lives inside `apps/api` (NestJS), colocated with REST and Better Auth — no second service, no bridge | MVP | Better Auth-in-Nest |
| Staff WS auth | N/A | — | — | **ADOPT the principle, redesign the mechanism** | In-process `auth.api.getSession()` at `handleConnection`, same as REST | MVP | — |
| Anonymous visitor WS auth | N/A | — | — | **NEW (this review)** | Narrow, revocable `ChatSessionToken` cookie, chat-domain-owned, not an IAM identity, not mergeable into a user automatically | MVP | — |
| Unread/read state | `ChatMessageStatus` enum, `useMarkSessionAsRead` pattern | Clear, works | — | **ADOPT the concept** | Persisted read-marker, explicit mark-as-read action, broadcast to the same staff member's other connected devices | MVP | — |

### Messaging / Data

| Capability | BIPMED Pattern | What Works | Problem/Risk | MedCal Decision | Target Approach | Phase | Dependencies |
|---|---|---|---|---|---|---|---|
| Outbound reply persistence | SMTP fire-and-forget, no `Email` row created for replies | Simple | Can't analyze past conversations later | **DEFER, flagged** | MVP follows the same fire-and-forget pattern (`business-domain.md` D18 already treats this as Later: "log optional") — accepted as a known limitation, not silently inherited without notice | Later | — |
| Topic taxonomy | Two independent taxonomies (`ContactTopic` for forms, `ChatTopic` for chat) | — | Minor duplication | **ADOPT as-is** | Same split retained; not worth unifying for MVP | MVP/Later mix | — |

### Tracking / Attribution

| Capability | BIPMED Pattern | What Works | Problem/Risk | MedCal Decision | Target Approach | Phase | Dependencies |
|---|---|---|---|---|---|---|---|
| UTM/referrer/source capture | None at all in BIPMED | — | Genuinely absent, not just under-documented | **DEFER capture, REDESIGN schema-readiness** | No UTM capture logic in MVP; `ContactMessage`/`Lead` schema keeps room for it (flexible field) | Later (schema Foundation-ready) | — |

### Notifications / FCM / PWA

| Capability | BIPMED Pattern | What Works | Problem/Risk | MedCal Decision | Target Approach | Phase | Dependencies |
|---|---|---|---|---|---|---|---|
| Push mechanism | Firebase Admin SDK + `FCMToken` (token/deviceType/isActive/lastUsedAt); `PushSubscription` (Web Push shape) exists but is dead code | FCM path is the one that actually works in BIPMED | MedCal's own `entity-catalog.md` currently models the *dead* Web Push shape, not the working FCM shape | **ADOPT FCM**, correct the doc mismatch | FCM confirmed; `entity-catalog.md` D18 needs its `PushSubscription`/token entity corrected to an FCM-token shape as a documentation backport | MVP | Firebase/GCP project provisioning |
| Notification reliability | Fire-and-forget, try/catch swallow on failure; Express fallback path skips it entirely | — | Silent notification loss | **ADAPT** | Since Express never has a fallback path at all (locked), the specific BIPMED failure mode structurally can't recur; fire-and-forget on the FCM send itself remains MVP-acceptable, revisit with an outbox pattern later if needed | MVP (accepted risk), Later (hardening) | — |
| Notification triggering | On `ContactMessage` create + status→PENDING, notify all `ChatPICAssigned` staff | Simple, works | — | **ADOPT the concept** | Same "notify assigned staff pool" pattern for new Lead/ContactMessage/Chat events | MVP | FCM |

### Frontend State / Data Fetching

| Capability | BIPMED Pattern | What Works | Problem/Risk | MedCal Decision | Target Approach | Phase | Dependencies |
|---|---|---|---|---|---|---|---|
| Server state | React Query hooks per resource, query-key namespacing, polling + WS hybrid for chat | Clean pattern, works well | Email data-fetching inconsistently embedded in components instead of hooks in BIPMED's dashboard | **ADOPT the hook pattern; avoid the inconsistency** | TanStack Query hooks for every resource including email/notifications, no exceptions | Foundation | — |
| Client/UI state | Zustand for tenant filter, session mirror, search/filter UI state | Clean separation from server state | — | **ADOPT** | Zustand for company/session-mirror/filters only; no server data duplicated into it | Foundation | — |

### Application Shell / UI/UX / Mobile-first

| Capability | BIPMED Pattern | What Works | Problem/Risk | MedCal Decision | Target Approach | Phase | Dependencies |
|---|---|---|---|---|---|---|---|
| Shell/navigation | Sidebar + header, menu driven by backend permissions | Works, RBAC-correct | — | **ADOPT the principle** | Same backend-driven visibility; `apps.*` internal nav vs `portal.*` client nav selected by host-based route group, not by two codebases | Foundation | RBAC |
| Design system | BIPMED's own visual identity | N/A — MedCal needs its own brand | — | **DO NOT COPY visuals** | MedCal's own Tailwind + shadcn/ui design language; accessibility already a named principle | Foundation | — |
| Mobile-first | Not evaluated in BIPMED (desktop-oriented dashboard) | — | — | **REDESIGN** | Mobile → Tablet → Desktop enhancement for every surface; desktop-first-class treatment reserved for Dashboard/Reports/Admin/Finance specifically | Foundation | — |

### Prisma / Data Architecture

| Capability | BIPMED Pattern | What Works | Problem/Risk | MedCal Decision | Target Approach | Phase | Dependencies |
|---|---|---|---|---|---|---|---|
| Schema scope | Full multi-domain schema copied wholesale would be inappropriate | — | — | **DO NOT COPY entire schema** | Only the dependency chain needed for Lead/Chat/Auth/Calibration MVP; `packages/auth` owns Better Auth's own tables, depends on `packages/db` | Foundation | — |
| Company scoping | `Char(5)` company_id, inconsistently enforced | — | Unverified membership on query params | **ADAPT** | `companyId` retained per table, enforced centrally via Nest guards/interceptors, single value per deployment | Foundation | ADR-000 |

### Backend Architecture

| Capability | BIPMED Pattern | What Works | Problem/Risk | MedCal Decision | Target Approach | Phase | Dependencies |
|---|---|---|---|---|---|---|---|
| Express/Nest boundary | Blurred by the direct-Prisma fallback | Otherwise clean | Fallback breaks the boundary | **ADOPT the boundary, DO NOT COPY the fallback** | Express: public-edge only, zero DB access, ever. NestJS: sole business layer including Better Auth, RBAC, Chat WS | Foundation | Locked |

### Audit / Observability

| Capability | BIPMED Pattern | What Works | Problem/Risk | MedCal Decision | Target Approach | Phase | Dependencies |
|---|---|---|---|---|---|---|---|
| Audit events | `ChatAuditLog` for chat security events only; no general business audit log | Good for what it covers | No LOGIN/ROLE_CHANGED/WHITELIST_CHANGED-style audit trail | **REDESIGN, deferred detail** | `EmailWhitelist` carries its own minimal audit fields now (Foundation); a general audit-event system (LOGIN, ROLE_CHANGED, LEAD_ASSIGNED, etc.) is Later, not blocking | Foundation (minimal) / Later (general system) | — |

---

## Target architecture diagrams

### A. Public lead flow
```text
Visitor → apps/web (Next.js) → apps/web-api (Express, captcha/rate-limit/forward only)
        → apps/api (NestJS: ContactMessagesModule) → Prisma → PostgreSQL
```

### B. WhatsApp
```text
CTA → identity capture → persist as ContactMessage(getFrom=WHATSAPP) → wa.me handoff
(no CAPTCHA bypass; same abuse controls as the contact form)
```

### C. Human Chat
```text
Staff:    Browser → api.kalibrasimedika.co.id (WS) → in-process Better Auth session check → RBAC → Chat domain
Visitor:  Browser (public site) → api.kalibrasimedika.co.id (WS) → ChatSessionToken check → Chat domain
Both terminate in the same ChatSession/ChatMessage model; optionally linked to ContactMessage.
```

### D. Authentication
```text
User → Better Auth (hosted in apps/api) → session (DB-backed, cookie-scoped to .kalibrasimedika.co.id)
     → protected Next.js UI (apps.*/portal.*/technician.*) → protected NestJS API
```

### E. RBAC
```text
User → Role → Permission → Resource/Action (Better Auth admin plugin + custom access-control,
enforced server-side only; subdomain and frontend visibility are UX, never authorization)
```

### F. Push notification
```text
Lead/Message/Chat event → Nest Notification service → FCM → PWA (apps.*/portal.*/technician.*) → deep link
```

### G. Registration whitelist
```text
Registration request → normalize email → check EmailWhitelist (active, reusable)
  → not found → reject
  → found → create account → Better Auth session (no email verification step)
```

### H. Production topology
```text
kalibrasimedika.co.id       → apps/web (public)
apps.kalibrasimedika.co.id  → apps/portal (management route group)
portal.kalibrasimedika.co.id→ apps/portal (client route group)          same service, host-routed
technician.kalibrasimedika.co.id → apps/tech-pwa
api.kalibrasimedika.co.id   → apps/api (REST + WS + Better Auth)
web-api has no public hostname — internal, called server-side by apps/web only
All behind a reverse proxy MedCal may or may not own; Docker Compose for all MedCal services.
```

---

## Foundation / MVP / Later roadmap

**Foundation:** monorepo/package layout (done), Better Auth in `apps/api`, `EmailWhitelist` + registration gate, RBAC (role/permission/resource/action), `companyId` central enforcement, mobile-first UI guidelines, Docker Compose deployment (done), domain topology + cookie/CORS/`trustedOrigins` configuration, `packages/auth` dependency boundary.

**MVP:** `ContactMessage`/`GetMessageFrom` intake, Lead/Customer dedup with admin confirmation, WhatsApp passive handoff, Human Live Chat (human-only, staff + anonymous-visitor paths, unread/read, assignment, notifications), FCM push, basic minimal audit fields on `EmailWhitelist`.

**Later:** MFA mechanism + role policy, AI chat first responder, `ChatSession.mode` (if AI is ever built), UTM/attribution capture logic, outbound-reply persistence/outbox pattern, general audit-event system, Better Auth `jwt`/`bearer`/`multiSession` plugins (pending concrete need), WebAuthn/passkeys, advanced CRM/analytics.

---

## Explicit Do-Not-Copy register

| BIPMED pattern | Evidence | Why problematic | MedCal alternative |
|---|---|---|---|
| Express-direct-to-Prisma fallback on Nest call failure | `contactService.ts` `createViaLocalDB` fallback | Silently bypasses the notification trigger; breaks the single-business-layer boundary | Express has zero DB access, no fallback path exists |
| Custom JWT + Passport auth | `server-bi-erp`/`server-ngebengkel` both hand-rolled this independently | No multi-device support (single refresh token per user); duplicated, unmaintained-in-parallel auth logic | Better Auth, hosted in NestJS |
| Unscoped `company_id` query-param trust | `ContactMessageService.findAll`/`findOne` | Authenticated user can view another company's data by passing an arbitrary param | `companyId` enforced centrally via guards/interceptors |
| WhatsApp CAPTCHA bypass | Express `contactController.ts` skips reCAPTCHA for `getFrom==='WHATSAPP'` | Proven, least-validated spam vector | Same abuse controls applied regardless of channel |
| Disconnected Lead/Chat data model | No FK between `ContactMessage` and `ChatSession` in BIPMED's schema | Conversations and leads can't be correlated at the DB level | Chat conversations link to/create a `ContactMessage` per existing MedCal rule |
| `ChatMode` speculative AI schema | BIPMED's `ChatSession.mode` enum | Unused complexity if AI isn't being built | Omit until a real AI ADR exists |
| Whitelist table present but unwired | `server-ngebengkel`'s dead `sys_WhiteListEmail` | Illustrates how "the table exists" ≠ "the feature works" | MedCal's whitelist gate is wired into the actual registration hook, not left as an unused table |

---

## Open questions

**None remaining that block finalization.** Every item raised across this review's full history is either confirmed/locked, resolved with a stated recommendation, or explicitly and knowingly deferred to a later phase (see the Later column above) — nothing is silently unresolved.
