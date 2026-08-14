# Documentation Backport — Locked BIPMED → MedCal Architecture Adoption Matrix

## Context

The BIPMED → MedCal Architecture Adoption Matrix (`C:\Users\Afriz\.claude\plans\this-is-a-read-only-steady-goblet.md`) is now FINAL and LOCKED. It resolved several points that the current MedCal documentation (`docs/cursor/*.md`, `docs/claude/*.md`) either doesn't mention yet or documents differently (most notably: Human Chat/ChatSession is now MVP not Later, push notifications are FCM not native Web Push, and a new anonymous `ChatSessionToken` mechanism and `EmailWhitelist`/`superadmin` whitelist gate exist that aren't in the docs at all). This task is **documentation-only**: create one canonical architecture document holding the full matrix, and backport only the specific deltas into the existing domain docs — no code, schema, or config changes, and no reopening of any locked decision.

This is a pure documentation task (no functional verification possible/needed) — "done" means the impact map below is fully applied and every affected doc cross-references the canonical source instead of duplicating it.

## A. Documentation Impact Map

| File | Classification | Why |
|---|---|---|
| `docs/architecture/01-bipmed-medcal-architecture-adoption-matrix.md` | **CREATE** | New canonical home for the full locked matrix (resolutions, adoption tables, diagrams, roadmap, do-not-copy register). Does not exist yet. |
| `docs/cursor/business-domain.md` (D04 Inbound Messaging, D18 Notification Delivery) | **UPDATE** | D04 still says `ChatSession`/`ChatMessage` is "later — bi-erp" / "Chat realtime stack (later port)" — matrix locks Human Chat as **MVP**, human-only, WS inside NestJS, with a new anonymous `ChatSessionToken` concept. D18 describes push generically ("push (service worker)") with no committed mechanism — matrix locks **FCM**, not native Web Push. |
| `docs/cursor/business-domain.md` (D02 IAM) | **ADD** | No mention of the registration whitelist gate or `superadmin`/`whitelist:manage` permission, which the matrix locks as Foundation. |
| `docs/cursor/entity-catalog.md` (D02, D04, D18, §5 enum registry, §8 MVP checklist) | **UPDATE** | Explicitly called out by the matrix itself: "`entity-catalog.md`'s `PushSubscription`/token entity corrected to an FCM-token shape... as a documentation backport." Also: `ChatSession`/`ChatMessage` marked "Later*" → must become MVP with the `ChatSessionToken` addition; `EmailWhitelist` entity is missing entirely from D02. |
| `docs/cursor/medcal-app_Action Plan.md` (Nest modules list, notification/Web Push mentions, Fase 0/1 checklists) | **UPDATE** | "Web Push" language throughout should read FCM; Nest module list has no `chat`/`whitelist` module; Fase 0 checklist doesn't mention the whitelist gate as a Foundation deliverable. |
| `docs/cursor/000-project-bootstrap.md` and `docs/claude/0 000-project-bootstrap.md` (identical ADR-000 copies) | **NO CHANGE** (light cross-ref only) | No content in ADR-000 contradicts the matrix — Company-only, companyId-from-env, lead dedup, invoice M:N, Quotation-before-WO, and Certificate-only billable SoR are all reaffirmed by the matrix, not altered. Will only get a one-line "Related architecture decision" pointer added, not a content rewrite. |
| `docs/cursor/design-principles.md` | **NO CHANGE** | Nothing in it (KISS, company-only, layer boundaries, messaging≠pipeline, explicit billing, UI/stack pin) is contradicted by the matrix. |
| Production subdomain topology (`apps.*`/`portal.*` single-app routing, `technician.*`, `api.*`, `web-api` no public hostname) | **DEFER** | The matrix's own resolution #1 explicitly says: "No documentation update beyond this record is required... only the routing detail... is new information worth noting... **when they're next touched** — it is a clarification, not a contradiction requiring a structural change." Honoring that instruction: leave Action Plan's app/service list as-is now; do not front-run it. |
| `docs/claude/website/1 CLAUDE.md` | **NO CHANGE** | Website agent-instructions doc; its architecture rules (web-api no business logic, companyId from env, no Branch, ContactMessage/GetMessageFrom, Certificate billable SoR) already match the matrix. No chat/FCM/whitelist claims exist there to contradict. |
| `docs/claude/website/2 CLAUDE-homepage-finish.md`, `3 brand-content-brief.md`, `4 seo-prelaunch-checklist-dan-keyword-research.md`, `5 seo-metadata-and-service-ia-resume.md` | **NO CHANGE** | Content/SEO/brand documents, not architecture — no claims in scope of the matrix. |
| `docs/claude/Claud-response-BIPMED → MedCal Architecture Adoption Matrix.md` | **NO CHANGE** | This is a historical critique/review record from *before* the matrix was finalized (dated review of an earlier brief). Preserved as-is per "do not silently remove historical decisions"; it is superseded by the now-locked matrix but not factually wrong as a record of that review. |

No contradictions requiring a STOP were found — every matrix item maps cleanly onto an UPDATE/ADD/NO CHANGE/DEFER above.

## B. Files to create

**`docs/architecture/01-bipmed-medcal-architecture-adoption-matrix.md`**
Full content ported from the locked matrix file: the two resolution write-ups (app↔subdomain mapping, anonymous chat token), the consistency check table, executive summary, the complete adoption matrix (all 18 capability tables), target architecture diagrams (A–H), Foundation/MVP/Later roadmap, explicit do-not-copy register, and "no open questions" closing note. This becomes the single place the full matrix lives — nothing below duplicates it wholesale, they only reference it.

## C. Files to update

1. **`docs/cursor/business-domain.md`**
   - Add a "Related architecture decision" link near the top pointing to the new canonical doc.
   - D02 IAM: add `EmailWhitelist`/registration-gate + `superadmin`/`whitelist:manage` to Responsibilities/Main Business Objects, cross-referencing the canonical doc for the full rule.
   - D04: change ChatSession/ChatMessage from "later — bi-erp"/"later port" to MVP, human-only; add the anonymous `ChatSessionToken` concept (narrow, not an IAM identity, not auto-merged); note WS lives in NestJS (`apps/api`), not a separate service.
   - D18: correct "push (service worker)" language to state FCM is the push mechanism (matching the matrix's explicit doc-mismatch callout).

2. **`docs/cursor/entity-catalog.md`**
   - Add "Related architecture decision" link near the top.
   - D02 table: add `EmailWhitelist` entity (email, active/revoked, createdBy/At, revokedBy/At — no companyId).
   - D04 table: change `ChatSession`/`ChatMessage` from "Later*" to MVP; add `ChatSessionToken` (or equivalent mapping note) as the anonymous-visitor mechanism; explicitly note no `mode` field (no speculative AI schema).
   - D18 table: replace `PushSubscription` "Web Push endpoint" shape with an FCM-token shape (token/deviceType/isActive/lastUsedAt), per the matrix's direct instruction.
   - §5 enum registry / §8 MVP checklist: move Chat entities into the MVP list; note FCM token fields.

3. **`docs/cursor/medcal-app_Action Plan.md`**
   - Add "Related architecture decision" link near the top.
   - Replace "Web Push" references (stack table, notification sequence diagram, Fase 1 checklist) with FCM.
   - Add `chat` (and `whitelist`, if not folded into an existing module) to the "Nest modules (arah modul)" list.
   - Fase 0 / Foundation checklist: add the `EmailWhitelist` registration gate as a named Foundation deliverable (it's currently only implied by "Better Auth stub / package wiring").
   - Leave the app/service/subdomain topology section untouched (deferred per the impact map).

4. **`docs/cursor/000-project-bootstrap.md`** and **`docs/claude/0 000-project-bootstrap.md`** (both identical copies)
   - Add a single "Related architecture decision" line pointing to the canonical doc. No content changes — ADR-000's decisions are reaffirmed, not altered, by the matrix.

## D. Files intentionally left unchanged

`docs/cursor/design-principles.md`, `docs/claude/website/*.md` (all 4), `docs/claude/Claud-response-BIPMED → MedCal Architecture Adoption Matrix.md` — reasons given in the impact map (A) above.

## Execution notes

- Preserve each document's existing language (Indonesian/English mix, terminology, table structures) — edits are additive/corrective, not rewrites.
- Where an old statement is superseded (Later → MVP, Web Push → FCM), replace it in place with a clear note of what changed, rather than leaving both old and new claims side by side.
- Do not paste the full adoption matrix table into any of the domain docs — only the canonical doc gets the full table; domain docs get the specific decision relevant to their own section plus a link.
- No code, Prisma schema, or package config will be touched.

## Verification

Documentation-only change — verify by re-reading each updated file after editing to confirm: (1) no duplicate/contradictory statements remain about Chat MVP status or push mechanism, (2) the canonical doc is linked from each updated file, (3) nothing outside `docs/` was touched.
