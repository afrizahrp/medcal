# Web Chat Floating Bubble — Design Review

> Review-only. No code, schema, migrations, tests, or config modified. First-pass verified 2026-08-16; **second-pass design + code-level security audit added 2026-08-16** against current repo state (`d:\medcal`): `apps/web`, `apps/web-api`, `apps/api`, `packages/db`, `packages/shared`, `docs/claude/lead-management/`, `docs/Architecture/`.
>
> Lead Inbox v1 (matching, STRONG/POSSIBLE/NONE, Needs Review, Attach/Create New, Lead Detail) is stable and **not** revisited here.

---

## Context

Lead Inbox v1 is done. The next gap is the visitor-facing entry point: MedCal's public website has no way for a visitor to start a conversation today — the WhatsApp FAB is intentionally disabled, and the only contact surface is the full `/kontak` page form. The goal is a lightweight floating "Web Chat" bubble that funnels into the *existing* `ContactMessage` pipeline (via `getFrom=CHAT_PERSON`) exactly the way the Contact Form already does via `getFrom=CONTACTFORM` — not a new realtime chat platform. BIPMED's floating-bubble screenshot is the UX reference for the *interaction pattern only* (closed bubble → click → open panel), not for literal visuals, copy, or a promise of realtime human availability, which MedCal's current backend cannot support.

---

## Correction to stated premise (first pass)

The original prompt stated "The Web Chat backend flow already exists and ultimately creates a ContactMessage with source WEBCHAT." Verified against code: this was **not yet true**. `GetMessageFrom.CHAT_PERSON` (and `CHAT_AI`) exist only as unused Prisma enum values — no controller, service, or `apps/web-api` route anywhere sets `getFrom: "CHAT_PERSON"` today. The only channel that actually writes `ContactMessage` rows end-to-end is the Contact Form (`CONTACTFORM`), via `apps/web/src/app/kontak/kontak-form.tsx` → `apps/web-api`'s `publicContactFormSchema` (hardcodes `getFrom` server-side, strips any client-supplied value) → `POST internal/contact-messages` → `apps/api`'s `ContactMessagesService`. This is good news, not a blocker: it means Web Chat's backend is a **small, well-precedented addition** (mirror the same public-schema-hardcodes-getFrom pattern with `getFrom="CHAT_PERSON"`), not a gap to explain away.

---

## Revised Decisions (second pass, locked 2026-08-16)

- **Web Chat is a low-commitment fallback channel, not a WhatsApp replacement.** BIPMED evidence: WhatsApp remains the dominant high-intent channel despite higher friction; Web Chat serves visitors who specifically don't want to hand over a mobile number / move to WhatsApp. This changes the field requirements below — it is not a cosmetic detail.
- **Phone is dropped entirely from v1 Web Chat.** Not "optional" — simply not asked for. Asking for it (even optionally) undercuts the "no mobile number required" value proposition that differentiates this channel from WhatsApp.
- **v1 required fields are exactly: `name`, `email`, `message`.** No `phone`, no `organizationName`, no `topicId`.
- **`topicId` omitted for v1** — confirmed, not just a leaning (§3 previously flagged this as an open judgment call; it's now locked).
- **`getFrom = CHAT_PERSON`, server-controlled** — unchanged from first pass, now additionally confirmed safe by the code trace below (§13).
- **No `ChatSession`, `ChatMessage`, realtime transport, presence indicator, AI/human mode, or WhatsApp changes** — unchanged, reaffirmed.

---

## 1. Recommended UX

A **floating message composer**, not a live conversational thread. Given no `ChatSession`/`ChatMessage` model exists and building one is explicitly out of scope (locked: "MVP, not Foundation" per `docs/Architecture/02-foundation-implementation-plan.md`), v1 "Web Chat" is structurally a compact, chat-styled single-shot form: visitor fills identity + message once, submits, gets a confirmation — no message history, no back-and-forth in-panel, no read receipts. The BIPMED-style bubble affordance (closed pill in the corner, opens a panel) is appropriate and worth adopting; the implied promise of an ongoing live chat is not, and must be avoided in copy and visual design so the UI doesn't over-promise relative to what actually happens (a message gets queued for staff, same as the Contact Form).

## 2. Closed State

- **Position:** `fixed bottom-5 right-4` (`sm:bottom-6 right-6`) — same slot the disabled `WhatsAppFab` already occupies in `apps/web/src/app/layout.tsx`, so there's exactly one floating affordance, never two competing bubbles.
- **Shape/size:** `h-14 w-14` rounded-full icon button, consistent with the existing FAB precedent, OR a slightly wider pill (icon + short label) if a label is desired — see wording below. A pill is more honest than an icon-only circle, since a "chat" icon alone tends to make visitors expect live chat.
- **Icon:** a message/chat-bubble glyph (lucide `MessageCircle` — `components.json` already configures lucide as the icon set), not a WhatsApp-branded glyph.
- **Color:** use the theme's `brand` token (e.g. `bg-brand-600` hover `bg-brand-700`), not a raw hex — the WA FAB's `bg-[#25D366]` is a one-off, not a pattern worth repeating.
- **Label:** see §4.
- **Availability indicator:** **not recommended as a colored "online" dot** — see §5.
- **Hover (desktop):** subtle scale/shadow lift, label tooltip if icon-only.
- **Behavior:** identical across desktop and mobile — fixed corner position, tap/click opens the panel. No separate mobile-only closed-state variant is needed.

## 3. Open State

- **Panel size (desktop):** a compact card anchored above the bubble, roughly `360–400px` wide, height capped (`max-h-[560px]` or similar) — not full-viewport. This is a form-in-a-panel, not a docked chat app.
- **Header:** short title + close (×) button. No agent avatar/name (implies a specific human is present — not accurate for v1).
- **Title:** see §4 wording.
- **Supporting text:** one line setting expectation honestly, e.g. "Kirim pesan Anda, tim kami akan membalas melalui email atau telepon." This does the job the green dot would otherwise falsely imply.
- **Form fields (revised, locked):** exactly `name`, `email`, `message`. No `phone`, no `organizationName`, no `topicId`. This is a deliberate product decision, not a UX-friction shortcut: Web Chat's differentiator from WhatsApp is precisely that it doesn't ask for a mobile number (see Revised Decisions above). Staff triage via message body and email domain, same as any `NO MATCH`/low-signal Contact Form submission today.
- **Composer:** single multi-line textarea + submit button — not a chat-log input bar, since there's no thread to append to.
- **Close/minimize:** × closes the panel; closing does not discard a filled-but-unsubmitted draft abruptly without at least a lightweight confirmation, but no persistence layer (no ChatSession) means a page refresh will lose the draft — acceptable for v1, should be a known limitation, not silently glossed over.
- **Success state:** replace the form with a confirmation message (mirrors `kontak-form.tsx`'s inline `role="status"` pattern) — "Terkirim! Tim kami akan segera menghubungi Anda." (identical copy already proven elsewhere on the site) — then auto-collapse the bubble back to closed after a short delay or on next explicit close.
- **Error state:** inline error text in the panel (validation) or a generic submit-failed message (server/network) — same `role="status"` pattern, distinct visual treatment (e.g. red-toned text) since `kontak-form.tsx` currently uses the same neutral color for both success and error, which this widget should improve on rather than copy verbatim.

## 4. Wording

Recommend **"Chat dengan kami"** for the closed-state label/bubble tooltip and open-panel title. Reasoning: "Buka percakapan" (BIPMED) implies an ongoing conversation thread MedCal's v1 doesn't have; "Konsultasi" reads as a sales/lead-gen CTA (matches the B2B instinct to sound consultative, but risks feeling salesy per the constraint to avoid that); "Chat dengan kami" is neutral, already-used-register Indonesian (consistent with existing site copy tone in `kontak-form.tsx`), and accurately describes "send us a message" without promising realtime back-and-forth.

## 5. Availability Indicator

**Not recommended as a green "online now" dot.** Nothing in the current or planned v1 architecture supports real human presence detection — no staff-online signal exists anywhere in the codebase, and Lead Inbox v1 explicitly deferred assignment/ownership (Decision 3). A colored presence dot would be a UI claim with no backing system, i.e. misleading. Recommended alternative: a short, honest expectation-setting line instead of an indicator — e.g. "Biasanya membalas dalam 1 hari kerja" (or whatever real SLA the business wants to commit to) placed in the open-panel supporting text (§3), not as a persistent badge on the closed bubble. If the business later wants a true presence signal, that requires the deferred `ChatSession`/staff-presence work and should not be faked now with a static green dot.

## 6. Existing Implementation Reuse

**Reuse as-is:**
- The `ContactMessage` creation pipeline end-to-end: `apps/web-api`'s public-schema-hardcodes-`getFrom` pattern (`publicContactFormSchema` in `apps/web-api/src/public-contact-form-schema.ts` is the direct template — add a sibling schema, e.g. `publicWebChatSchema`, that hardcodes `getFrom: "CHAT_PERSON"`), forwarding to the same `POST internal/contact-messages` → `ContactMessagesService.create()` in `apps/api`. This already runs Lead identity matching (STRONG/POSSIBLE/NONE) — Web Chat messages get that behavior for free, no new logic needed.
- reCAPTCHA v3 flow already implemented in `kontak-form.tsx` (`grecaptcha.execute(...)`) — same token-fetch-and-submit pattern applies to the chat composer's submit handler.
- The inline `role="status"` success/error text pattern from `kontak-form.tsx`.
- Tailwind theme tokens (`brand`, `ink`) already defined in `apps/web/tailwind.config.js` — no new design tokens needed.
- The FAB's fixed-position/z-index/mount-point pattern (`apps/web/src/app/layout.tsx`, same slot as the commented-out `WhatsAppFab`).

**Do NOT rebuild / do NOT introduce:**
- `ChatSession`, `ChatMessage`, or any new DB table — v1 has no message thread to persist.
- WebSocket/realtime transport, presence system, typing indicators.
- Any AI/human mode concept, mode selector, or bot persona (hard constraint, already excluded above by construction — the composer only ever does one thing: submit a `ContactMessage`).
- A new design-system/component library buildout — `packages/ui` is effectively empty and shadcn in `apps/web` has only one primitive (`accordion.tsx`); the chat panel can be hand-built with existing Tailwind tokens without pulling in Dialog/Sheet primitives that don't exist yet, unless implementation judges a portal/overlay dependency (e.g. `@radix-ui/react-dialog` for focus-trap correctness) is worth adding — that's an implementation-time call, not a design-review blocker.

## 7. Mobile Behavior

- **Viewport constraints:** on small screens the panel should expand to near-full-width with safe margins (e.g. `inset-x-4`) rather than a fixed `360px` card, capped at a reasonable height (e.g. `max-h-[75vh]`) so it never fully occludes the page.
- **Keyboard:** when the on-screen keyboard opens (textarea focus), the panel must remain scrollable/reachable — avoid fixed-height layouts that push the submit button off-screen; test with `100dvh`-aware sizing rather than `100vh`.
- **Safe area:** respect `env(safe-area-inset-bottom)` for the closed bubble's bottom offset on notched devices, consistent with the existing FAB's `bottom-5`/`bottom-6` pattern (should adopt safe-area padding if it doesn't already).
- **Obstruction:** ensure the closed bubble doesn't overlap any site's own fixed bottom UI (checked: no other fixed bottom elements exist on `apps/web` today besides the FAB slot itself, so no conflict currently).

## 8. Accessibility

- Closed bubble: real `<button>` (or `<a>`-with-`role="button"` only if truly navigating) with `aria-label="Chat dengan kami"` (matches `WhatsAppFab`'s existing `aria-label` precedent), minimum 44×44px touch target (the existing `h-14 w-14` already satisfies this).
- Panel open: move focus into the panel (first focusable field or the close button) on open; on close (× or Escape), return focus to the bubble trigger.
- Keyboard: full form must be operable via Tab/Shift+Tab; Escape closes the panel; Enter submits from the textarea only via the button (avoid accidental submit-on-Enter in a multi-line textarea).
- `aria-live="polite"` (or the existing `role="status"`) region for success/error messages so screen readers announce the result.
- Contrast: reuse existing `ink`/`brand` tokens, which are presumably already tuned for contrast elsewhere on the site — no new colors to separately audit beyond the success/error distinction called out in §3.

## 9. UX States

CLOSED → OPEN (panel visible, form focused) → SUBMITTING (button disabled, "Mengirim…" label, matching `kontak-form.tsx`'s existing `pending` pattern) → one of:
- SUCCESS (form replaced by confirmation text, auto-return to CLOSED after a short delay or explicit close)
- VALIDATION ERROR (inline, per-field or summary, panel stays OPEN)
- SERVER ERROR (inline generic message, panel stays OPEN, form values preserved so the visitor doesn't retype)
- RECAPTCHA ERROR (same inline error slot as SERVER ERROR — recommend not exposing recaptcha-specific detail to the visitor, mirror whatever generic-failure wording `kontak-form.tsx` already uses for consistency)

## 10. WhatsApp

Confirmed: `WhatsAppFab` (`apps/web/src/components/whatsapp-fab.tsx`) stays commented out / disabled. Not re-enabled, not referenced, not combined with the new bubble. Out of scope for this task, per explicit instruction.

## 11. Implementation Scope (revised)

Minimal file list, not a build plan. Confirmed against the code trace in §13 — no `apps/api`, Prisma, or migration changes are needed anywhere in this list.

- `apps/web/src/components/web-chat-bubble.tsx` (new) — closed/open UI, states, exactly 3 fields (`name`, `email`, `message`).
- `apps/web/src/app/layout.tsx` — mount point (same slot as the commented `<WhatsAppFab />`).
- `apps/web-api/src/public-web-chat-schema.ts` (new, sibling of `public-contact-form-schema.ts`) — **no `phone`, no `organizationName`, no `topicId` fields at all** (not merely optional — absent), plus `captchaToken`. Mirror the exact shape of `publicContactFormSchema` minus the dropped fields, with its own explicit `message` length cap (recommend something deliberately smaller than the Contact Form's 5000, e.g. 2000 — a "quick fallback message" channel shouldn't invite essay-length submissions; exact number is an implementation-time call, not a design blocker).
- `apps/web-api/src/index.ts` (or a new route-registration file if the existing one is kept lean) — new `POST /public/web-chat` route: `publicWebChatSchema.safeParse` → `verifyRecaptcha(token, "webchat_submit")` (**own distinct expected-action string**, not reused from `"contact_submit"`, so the two flows can't be replayed against each other) → forward to `POST {apiUrl}/internal/contact-messages` with `{ ...formData, getFrom: "CHAT_PERSON" }` (literal placed after the spread, same defensive pattern as the Contact Form's `getFrom: "CONTACTFORM"`) — **and its own rate limiter instance** (see §13.5 — this is not optional, it's covering a real gap, not a nice-to-have).
- No changes anywhere in `apps/api`, `packages/db` schema/migrations, RBAC, Lead matching, or Lead Inbox — confirmed by §13: `CHAT_PERSON` is already a valid enum value end-to-end, and Lead matching is channel-agnostic.

## 12. Open Questions

None block finalizing this design. `topicId` inclusion (previously flagged as a judgment call) is now locked — omitted for v1 (see Revised Decisions). No other decision remains open.

---

## 13. Second-Pass Code-Level Security Trace

Full trace performed 2026-08-16 against `apps/web` → `apps/web-api` → `apps/api` for the existing Contact Form pipeline, since the proposed Web Chat route is designed to mirror it exactly. All file/line references below are from direct reads of the actual source, not inference.

### 13.1 Tenant/company scoping — safe, no client influence possible

`companyId` is **never** accepted as client input anywhere in this chain, at any layer:
- `apps/web-api` doesn't even forward its own `COMPANY_ID` env var to `apps/api` — it's only used as a local "is this deployment configured" gate.
- `apps/api`'s `InternalServiceGuard` (`apps/api/src/common/guards/internal-service.guard.ts:18-37`) derives `companyId` **exclusively** from `process.env.COMPANY_ID` on the apps/api process itself, and writes it to `request.companyId`. The controller reads it only via `@CompanyId()` (`apps/api/src/common/decorators/company-id.decorator.ts`), never from `@Body()`.
- The guard's own doc comment confirms this was a deliberate hardening: a prior client-supplied `x-company-id` header was **removed** as "an unnecessary trust surface."
- **Implication for Web Chat:** identical safety — the new `/public/web-chat` route needs no companyId handling of its own; it inherits the same guarantee for free by forwarding through the same `InternalServiceGuard`-protected internal endpoint.

### 13.2 `getFrom` control — safe, server-hardcoded, no schema change needed

- `publicContactFormSchema` has no `getFrom` field at all; `apps/web-api/src/index.ts` sets it via `{ ...formData, getFrom: "CONTACTFORM" }` (literal after spread — wins even if a stray key leaked through).
- `contactMessageCreateSchema` (`packages/shared/src/schemas/index.ts:4-11`) already declares `getFrom: z.enum(["CONTACTFORM","WHATSAPP","CHAT_AI","CHAT_PERSON","EMAIL"])`, and `GetMessageFrom` in `packages/db/prisma/schema.prisma:54-60` already includes `CHAT_PERSON` as a first-class enum value.
- **Confirmed: `getFrom: "CHAT_PERSON"` is accepted today, unchanged, by both the Zod validator and the Prisma column — zero migration, zero schema.prisma edit required.** The Web Chat route just needs to hardcode `"CHAT_PERSON"` the same way the Contact Form route hardcodes `"CONTACTFORM"`.

### 13.3 CAPTCHA enforcement — real, server-side, fails closed, cannot be bypassed by omission

`apps/web-api/src/recaptcha.ts`'s `verifyRecaptcha()` calls Google's real `siteverify` endpoint server-side (not a client-side-only check), validates `success`, `action`, and `score >= RECAPTCHA_MIN_SCORE` (default `0.5`), and **fails closed** if `RECAPTCHA_SECRET_KEY` is unset. `captchaToken` is `z.string().min(1)` (required) in `publicContactFormSchema`, so an omitted token fails Zod validation before `verifyRecaptcha` is even reached — no bypass-by-omission path exists.

**Important scope note:** captcha is enforced **only at the `apps/web-api` edge** — the internal `apps/api` endpoint (`POST internal/contact-messages`) has no captcha check of its own. This is fine as long as `apps/api`'s internal endpoint is not publicly network-reachable (see §13.6) — it was already true of the existing Contact Form pipeline, not a new risk introduced by Web Chat, but worth naming explicitly since Web Chat inherits the same reliance.

**Requirement for Web Chat:** use its **own distinct `expectedAction` string** (e.g. `"webchat_submit"`) in its `verifyRecaptcha()` call, different from the Contact Form's `"contact_submit"`. reCAPTCHA v3 verifies the action string matches what was requested client-side — reusing the same action across two different forms would still "work" but would blur telemetry/scoring and make it harder to reason about which surface a given score distribution came from. Not a security requirement, a hygiene one.

### 13.4 Validation differences — phone is optional at both layers today; Web Chat should go further and drop it

Current `publicContactFormSchema` vs `contactMessageCreateSchema`: field-by-field, they agree almost everywhere; `phone` is **optional** (not required) in both today. That means technically nothing breaks if Web Chat's new schema simply omits `phone` — the internal schema already tolerates its absence. The revised decision to **not even offer** a phone field is a product/UX choice (§ Revised Decisions), not something forced by a validation gap.

Two differences worth carrying into the new schema:
- `message` has a `max(5000)` cap in `publicContactFormSchema` but is **unbounded** in the internal `contactMessageCreateSchema` (only `min(1)`). The internal schema relies on each public-facing caller to set its own sane cap — Web Chat's new schema must set its own explicit cap (§11).
- `topicId` is `required` in `publicContactFormSchema` but `optional` in the internal schema — confirms omitting `topicId` for Web Chat is safe; the internal contract was already designed to tolerate topic-less submissions from non-form channels.

### 13.5 Rate limiting / abuse protection — real gap identified, must be replicated for Web Chat

`apps/web-api` applies a dedicated `express-rate-limit` limiter to the Contact Form route specifically (`apps/web-api/src/index.ts`): default 5 requests / 60s per IP, configurable via env vars, plus global `helmet()`, `cors()`, and a `1mb` body cap.

**`apps/api` has no rate limiting or throttling of any kind anywhere** — no `@nestjs/throttler`, no IP-based limiter, nothing. The internal endpoint's only protection is the `InternalServiceGuard` shared-secret check.

**This is a real, pre-existing architectural fact, not a Web Chat-specific flaw** — but it means the *only* thing standing between a public visitor and unlimited submission volume is whatever rate limiter is applied at the `apps/web-api` edge, per-route. **The proposed `/public/web-chat` route must get its own rate limiter instance** (mirroring `contactFormLimiter`, not reusing the same instance/counter — a shared limiter would let Contact Form and Web Chat traffic exhaust each other's quota). This is called out explicitly in §11 as a required part of implementation, not an optional hardening.

### 13.6 Auth boundary summary

- **Public route (`apps/web-api`), called directly, bypassing the UI:** constrained by schema validation, required+verified CAPTCHA, and per-route rate limiting. Cannot set `companyId` (no such field) or `getFrom` (no such field, hardcoded after parse).
- **Internal route (`apps/api`), called directly, bypassing `apps/web-api`:** the only barrier is `InternalServiceGuard`'s `x-internal-secret` exact-match check. A caller who has (or guesses, or receives via misconfiguration) that secret gets: no CAPTCHA, no rate limit, free choice of `getFrom` from the full enum, and the internal schema's looser limits (unbounded `message`, optional `topicId`) — but **still cannot set `companyId`**, which stays pinned to `apps/api`'s own `COMPANY_ID` env var regardless. This is the existing security model for the Contact Form pipeline today; Web Chat doesn't change it, weaken it, or need to strengthen it beyond replicating the same edge protections (§13.3, §13.5) at its own route.
- **Conclusion:** the security perimeter for this entire pattern is "keep `apps/api`'s internal port off the public network + keep `INTERNAL_API_SECRET` secret" — already true today, unaffected by adding a second public-facing route that forwards to the same internal endpoint, as long as that new route independently re-implements CAPTCHA + rate limiting rather than assuming the internal endpoint provides either.

### 13.7 Lead matching compatibility — channel-agnostic, confirmed safe, one behavioral note

`ContactMessagesService.create()`'s STRONG/POSSIBLE/NONE classification (`apps/api/src/modules/contact-messages/contact-messages.service.ts`, using `findLeadMatchCandidates`/`classifyLeadMatch` from `apps/api/src/modules/leads/lead-matching.ts`) matches purely on `email`/`phone`/`organizationName` — `getFrom` is never read by the matching logic at all, and `Lead` itself has no channel column. **Web Chat messages go through the identical matching pipeline as any other channel, with zero special-casing needed.**

**Behavioral note worth flagging (not a defect, a consequence of the Revised Decisions):** since Web Chat submissions carry no `phone` and no `organizationName`, they can only ever match on `email`. Per the locked matching rule (STRONG requires phone **and** org both matching), a Web Chat message can **never** produce a STRONG MATCH / auto-attach — at best a POSSIBLE MATCH on email alone (surfaced in Needs Review), otherwise a new Lead. This is a natural, correct consequence of the phone-optional-by-design channel, not a bug — but worth stating so it isn't later mistaken for broken matching when someone notices Web Chat leads never auto-attach.

### 13.8 `getFrom` branching — confirmed none exists

`ContactMessagesService.create()` runs the exact same code path (topic lookup, Customer email-domain matching, Lead matching, `ContactMessage` row creation) regardless of `getFrom`'s value — no `if (getFrom === ...)` branch exists anywhere in the service or in `lead-matching.ts`. `getFrom` is stored as a plain tag on the row and nothing else.

---

## 14. Discrepancies vs. First-Pass Review

| First-pass claim | Second-pass finding | Correction |
|---|---|---|
| "small, well-precedented addition... but framing should be corrected" (re: backend already existing) | Confirmed: `CHAT_PERSON` needs **zero** Prisma/migration changes — it's already a valid enum value end-to-end in both `schema.prisma` and `contactMessageCreateSchema`. | Upgrade from "probably fine" to "confirmed, verified by direct code read — no schema work of any kind for this channel." |
| Form fields listed as `name, email, phone (optional), organizationName (optional), message` | Revised decision: `phone` and `organizationName` are **dropped entirely** (not merely optional) — product decision, not a validation constraint (validation already tolerated their absence). | §3 and §11 updated. Also newly noted: this means Web Chat can never produce a STRONG MATCH (§13.7). |
| `topicId` flagged as an open judgment call | Now locked: omitted for v1. Internal schema already treats it as optional, confirming no validation gap from dropping it. | §12 updated — no open questions remain. |
| No mention of rate limiting anywhere in the first-pass review | **New finding:** `apps/api` has zero rate limiting; only `apps/web-api`'s route-specific limiter protects the Contact Form today. This must be explicitly replicated (its own limiter instance) for the new Web Chat route, or the channel would be unprotected against volumetric abuse beyond the shared-secret check. | Added as a required implementation item in §11, not optional. |
| No mention of CAPTCHA action-string collision risk | **New finding:** the Contact Form's CAPTCHA check uses expected action `"contact_submit"`. Web Chat must use its own distinct action string, not reuse it. | Added to §11 and §13.3. |
| First-pass review didn't examine `message` length bounds | **New finding:** internal schema has no `message` max length — only the public-facing schema per-route caps it. Web Chat's new schema must define its own cap explicitly. | Added to §11 and §13.4. |

No other discrepancies found. The first-pass UX/wording/accessibility recommendations (§1–§10) stand unchanged — this second pass only revised the field list (phone/org removal) and added the security trace.
