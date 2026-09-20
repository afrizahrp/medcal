# Forensic Investigation: Recurring `/leads` 404

**Type:** Investigation report only. No code was changed. No fix was implemented.

---

## 1. Observed symptom

A `404` referencing the `leads` route recurs during sessions where the active task is unrelated to the Leads feature.

## 2. Exact 404 request(s) — distinguished

Three distinct `leads`-shaped requests exist in this codebase, and they are **not the same thing**:

| Request | Exists? | Owner | Notes |
|---|---|---|---|
| `GET /leads` (Next.js page, portal app) | Yes, but only under one of two host-resolved branches | `apps/portal` | Real filesystem route is `management/leads`; `/leads` is a *virtual* path produced by a proxy rewrite (see §5). |
| `GET /leads`, `/leads/:id`, `/leads/needs-review`, `/leads/:id/emails`, `PATCH /leads/:id/status`, `/assign`, `POST /leads/:id/convert` (backend API) | Yes, fully registered | `apps/api` (`LeadsController`, `@Controller("leads")`) | No `/api` prefix exists anywhere in the Nest app (`main.ts` has no `setGlobalPrefix`), so the real backend path is bare `/leads`, not `/api/leads`. `/api/leads` does not exist anywhere in the repo. |
| `GET /leads` resolved to the **client** proxy group | **Does not exist** | `apps/portal/src/app/client/` | This is the confirmed dangling case — see §5/§9. |

## 3. Source/origin of each request

- **Frontend link origin:** `apps/portal/src/components/management/header-controls.tsx:28` — `<Link href="/leads">`, the "Contact Messages" bell icon. This component is rendered inside `management-shell.tsx`, which wraps **every page in the management app** — meaning a live `<Link href="/leads">` is present in the DOM regardless of which management feature (work orders, customers, quotations, devices, etc.) is currently being worked on.
- Secondary origins of the same literal string: `apps/portal/src/app/management/page.tsx:36` (dashboard "Messages" channel link, gated by `capabilities?.leadRead`), and breadcrumbs/deep-links inside `leads/[id]/page.tsx` and `management/email/[id]/page.tsx`.
- **Backend API calls** to `/leads/...` originate from `apps/portal/src/app/management/leads/use-contact-messages-query.ts` and `apps/portal/src/app/management/customers/use-customers-query.ts` (lead-to-customer conversion) — these hit `NEXT_PUBLIC_API_URL` (a separate origin, `apps/api`), not the Next.js router, and are unrelated to a page-level 404.

## 4. Complete request chain

```
Browser renders any /management/* page (management-shell.tsx)
  → header-controls.tsx renders <Link href="/leads"> unconditionally
  → Next.js <Link> auto-prefetch (or direct click) issues a request for "/leads"
  → apps/portal/src/proxy.ts intercepts ALL requests (no middleware.ts; Next 16 renamed it to proxy.ts)
  → host-group resolution:
        host starts with "apps."   → group = "management"
        host starts with "portal." → group = "client"
        neither (e.g. localhost)  → group = process.env.DEV_DEFAULT_HOST_GROUP === "client" ? "client" : "management"
  → url.pathname rewritten to `/${group}/leads`
  → group === "management" → /management/leads       → EXISTS → 200
  → group === "client"     → /client/leads            → DOES NOT EXIST → Next.js 404
```

## 5. Relevant code locations

- `apps/portal/src/proxy.ts` — the host-based rewrite (Next.js 16's replacement for `middleware.ts`). No `NODE_ENV` gate on the `DEV_DEFAULT_HOST_GROUP` fallback.
- `apps/portal/src/proxy.test.ts:23` — asserts `/leads` is *matched* by the proxy (gets rewritten), but has no assertion that it resolves to an existing page under the `client` group. The gap is untested.
- `apps/portal/src/app/management/leads/page.tsx`, `[id]/page.tsx`, `leads-page-client.tsx`, `leads-ui.tsx` — the real, fully-implemented route (management group only).
- `apps/portal/src/app/client/` — contains only `layout.tsx` and `page.tsx`. No `leads` subfolder exists here at all.
- `apps/portal/src/components/management/header-controls.tsx:28` — the globally-rendered link that makes `/leads` reachable/prefetchable from literally any management page.
- `apps/api/src/modules/leads/leads.controller.ts`, `leads.module.ts`, `app.module.ts` — backend route, confirmed registered, single definition, no duplicates repo-wide.
- `apps/api/src/main.ts` — confirms no global `/api` prefix (relevant for distinguishing `/leads` vs `/api/leads` confusion).
- `packages/db/prisma/seed-menu.ts:41-61` — DB-seeded menu entry `href: "/leads"`, gated server-side by `viewResource: "lead"` / `viewAction: "read"` permission in `apps/api/src/modules/menu/menu.service.ts` (`getNavTree`). Unauthorized users get the item dropped from the nav tree entirely (not a dead link), and direct navigation without permission renders `<AccessDenied />`, not a 404 — this rules out RBAC as the 404 mechanism.

## 6. Relevant configuration

- `DEV_DEFAULT_HOST_GROUP=management` is set identically in `.env`, `.env.example`, and `.env.production.example` — the fallback is **not currently misconfigured** in any checked-in env file. For the client-group branch to fire without a `portal.*` host, this variable would have to be overridden to `"client"` in some untracked/local `.env` or process environment not visible in the repo.
- `infra/nginx/*.conf.example` — every nginx config in the repo is explicitly marked (in-file comment) as **"NOT YET APPLIED... a plan for the VPS operator... not wired into any deploy script."** No `vercel.json` exists; this is a self-hosted deployment. If `api.kalibrasimedika.co.id` / `apps.kalibrasimedika.co.id` server blocks were never actually installed on the production VPS per these templates, any request to those hosts (including `/leads`) would fail at the reverse-proxy layer — independent of and prior to reaching the Next.js app at all.
- `docs/Deployment/audits/02-production-env-docker-wiring-audit.md:33` independently corroborates the nginx wiring as "partially built."
- No `next.config.js` in any app (`portal`, `web`, `tech-pwa`) defines `rewrites`/`redirects`/`headers` — `proxy.ts` is the only rewrite mechanism in play.

## 7. Relevant log evidence

**None available in-repo.** No server access logs, nginx access/error logs, or browser network-tab captures were available to this investigation. This is the single largest evidence gap — see §14.

## 8. Relevant Git/history evidence

- `e931597` (2026-08-14, "feat(auth): add browser-safe auth client for better-auth integration") — created `apps/portal/src/app/management/`, `apps/portal/src/app/client/`, and `apps/portal/src/proxy.ts` together, deleting the old flat `app/page.tsx`. The management/client split and the rewrite mechanism were born in the same commit.
- `6288ba9` (2026-08-16, "feat: Implement Lead Inbox...") — added the `/leads` (i.e. `management/leads`) route, two days after the proxy split. **No corresponding `client/leads` route was ever added** — the asymmetry has existed since the feature's creation, not introduced by a later regression.
- `proxy.ts` has exactly 3 commits total (creation + two unrelated fixes for FCM service-worker bypass and manifest icon handling) — no commit ever added or removed a `leads` exclusion; the gap is structural, not a regression.
- No SW/FCM file in git history (`08c8d2a`, `f5cdcc5`, `5c56a83`, `f264e95`, `504a228`, `25997a8`) has ever contained a `notificationclick` handler or any `/leads` reference — confirmed by full commit-by-commit diff walk. This channel is fully ruled out.
- `LeadsController` most recently touched 2026-08-24 (`e7cf8b5`, adding lead→customer conversion) — active feature development, no removal/rename.

## 9. Root cause

The confirmed, code-level defect is an **asymmetric dual-audience route split**: `apps/portal/src/proxy.ts` rewrites every request into either a `management` or `client` namespace based on hostname (or a dev-only fallback env var), but the `leads` feature was only ever built under `app/management/leads` — `app/client/leads` was never created. Any request that the proxy resolves into the `client` group will 404 on `/leads`, while the same literal URL succeeds under the `management` group. This is a genuine, reproducible frontend routing gap (case **B — unintended frontend navigation / structural route mismatch**, bordering **I — deployment/config**, since which branch fires depends on host/env configuration outside the app code itself).

A second, independent contributing condition exists at the infrastructure layer: the nginx reverse-proxy configs that would route `api.*`/`apps.*` traffic to the running containers in production are checked in only as unapplied `.example` templates. If not manually installed on the VPS, this would produce a 404 (or connection failure) for `/leads` and everything else on those hosts, but this is a deployment-completeness question, not an application bug (case **I**).

## 10. Contributing factors

- No `NODE_ENV` guard on the `DEV_DEFAULT_HOST_GROUP` fallback in `proxy.ts` — a local `.env` override or a misconfigured preview/staging deployment could silently flip every un-prefixed request (including localhost dev traffic) onto the `client` branch.
- `header-controls.tsx`'s bell icon renders the `/leads` link **globally**, on every management page, via `management-shell.tsx`. Combined with Next.js `<Link>` default prefetch behavior, this means a request/prefetch for `/leads` is generated passively on nearly every page view in the management app — regardless of what feature is actually being worked on.
- `proxy.test.ts` only tests that `/leads` is matched by the proxy's rewrite matcher, not that both resolved destinations exist — so this asymmetry has no test coverage that would have caught it.
- `leads-ui.tsx` (inside the `leads` route folder) is imported as a shared UI-primitives module by ~15 unrelated management pages (work orders, customers, quotations, devices, equipment, etc.) purely due to historical first-mover naming. This doesn't cause the 404 itself, but it means the `leads` folder name surfaces constantly in unrelated code (imports, stack traces, build errors) even when no one is intentionally touching Leads.

## 11. Why it appears during unrelated tasks

Two independent reasons converge:
1. **The link is global.** `header-controls.tsx` mounts on every single management page. Any browser session open on the management app — no matter which feature is being implemented — has a live, prefetchable `<Link href="/leads">` in the DOM at all times.
2. **The `leads-ui.tsx` module is a de-facto shared dependency.** ~15 unrelated pages import table/pagination primitives from a file that lives inside the `leads` route folder, so the string "leads" (and any build/type issue touching that file) surfaces broadly across the codebase, unrelated to the Leads feature itself.

Whether either of these actually produces a *404* (vs. a harmless successful prefetch) depends entirely on which proxy branch (`management` vs `client`) the request resolves into at that moment — which this investigation could not directly observe without request logs (see §14).

## 12. Production, development, or both

Both are plausible through different mechanisms, and the evidence does not let us pick one with certainty:
- **Development:** if `DEV_DEFAULT_HOST_GROUP` is ever set to `"client"` in a local/untracked env, or if a dev proxy/tunnel forwards a `portal.*`-prefixed `Host` header.
- **Production:** if real traffic ever reaches the portal app with a `portal.*` hostname (the customer-facing "client" surface) requesting `/leads`, since `docs` note this hostname currently "has no DNS" — meaning it *shouldn't* normally receive traffic, but any bookmark, stale link, CDN misconfiguration, or manual host-header tampering could still trigger it. Separately, if the nginx `.example` configs were never actually installed on the VPS, `/leads` (and everything else) could 404 at the proxy layer in production regardless of app code.

## 13. User-visible or background-only

Both are possible: a direct click on the header bell icon or dashboard "Messages" link would be a **user-visible** navigation 404; an automatic Next.js `<Link>` prefetch of the same href would be a **background** request, visible only in the browser's network tab/console, not as a broken-page experience — this would match "frequently reported... while implementing unrelated tasks" if it's being observed via console/network noise rather than an actual broken page.

## 14. Confidence level and remaining uncertainty

**Confidence: Medium-High** on the structural cause (§9, the `client`-group route gap) — this is directly verified in source code and is a clean, reproducible logical gap, not a guess.

**Confidence: Low** on which specific trigger (dev env override vs. production host-header/DNS edge case vs. nginx-not-installed) is the one actually firing in practice. This cannot be resolved from source code alone.

**Missing evidence that would resolve this:**
1. The actual `Host` request header on an occurrence of the 404 (browser DevTools → Network tab → the `/leads` request → Request Headers).
2. The exact response — is it a Next.js "404 This page could not be found" HTML page (app-level, confirms the client-group gap), or a JSON/empty 404 from the API server (would instead implicate `apps/api`), or an nginx default 404 page (would implicate the reverse-proxy layer)?
3. Whether the request is a `GET` for a document navigation or a background RSC/prefetch fetch (check the `Sec-Fetch-Mode` / `Next-Router-Prefetch` request headers, or whether it appears tied to a visible page-load vs. silently in the console).
4. The actual value of `DEV_DEFAULT_HOST_GROUP` (and any local `.env.local`/shell env override) in the environment where the 404 is being observed.
5. Server/nginx access logs from the environment in question, if production.

## 15. Recommended fix direction (not implemented)

Two independent, separately-scoped fix directions — described only, not implemented:

- **Application-level:** Decide, as a product/architecture decision, whether Leads is intended to be management-only or also client-facing. If management-only, `proxy.ts` (or a route-existence check) should be updated so a `client`-group resolution of `/leads` produces an intentional redirect or a controlled "not available" response instead of a bare framework 404 — and `proxy.test.ts` should gain a case asserting the client-group behavior explicitly, so this asymmetry can never regress silently again. This is scoped to `apps/portal/src/proxy.ts` and its test file.
- **Infrastructure-level:** Confirm directly on the production VPS whether the `infra/nginx/*.conf.example` files have actually been installed (`sites-enabled` symlinks present, `nginx -t` passes, `systemctl status nginx` shows the relevant server blocks loaded). If not, that is a deployment-completion task tracked in `docs/Deployment/audits/02-production-env-docker-wiring-audit.md`, not a code change.

---

## Classification (ranked by evidence strength)

1. **B — Unintended frontend navigation / structural route mismatch** (highest confidence, directly verified in source): `proxy.ts` can rewrite `/leads` into a non-existent `client/leads` page.
2. **G — Prefetch/speculative request** (medium confidence, plausible mechanism, not directly observed): Next.js `<Link>` auto-prefetch of the globally-rendered header bell icon could generate background `/leads` requests on every management page view.
3. **I — Reverse-proxy/deployment configuration** (medium confidence for production only): nginx configs are unapplied `.example` templates; if never installed on the VPS, this independently 404s everything on those hosts, `/leads` included.
4. **F — Authentication/permission redirect**: **ruled out** — permission gating produces `<AccessDenied />`, not a 404.
5. **D/E — Service worker / FCM / notification deep-link behavior**: **ruled out** — no `notificationclick` handler, no URL-construction logic, and no `/leads` reference exists anywhere in SW/FCM code or its git history.
6. **H — Stale build/cache**: **ruled out** for the tech-pwa app-shell cache (precache list contains no `/leads`); not fully excluded for a stale portal `.next` build artifact, but no supporting evidence found.

---

## ROOT CAUSE STATEMENT

> The `/leads` 404 is most likely caused by **an asymmetric dual-audience routing split in `apps/portal/src/proxy.ts`, where `/leads` exists only under the "management" host-group and has no counterpart under the "client" host-group**. It is triggered by **any request — including passive Next.js `<Link>` prefetching of the globally-rendered header bell icon (`header-controls.tsx:28`), present on every management page regardless of the feature being worked on — that the proxy's host/env-based resolution routes into the "client" group instead of "management"**, which sends/requests **a rewritten path of `/client/leads`**. The 404 is generated by **Next.js's App Router, because no page exists at `apps/portal/src/app/client/leads`**. This occurs during unrelated tasks because **the triggering link is rendered unconditionally on every management page (not just Leads-specific ones), so its background prefetch or click fires regardless of which feature is currently being implemented**. A secondary, independently-plausible contributor in production is that **the nginx reverse-proxy configuration for the relevant hostnames is checked in only as an unapplied `.example` template**, which could cause `/leads` (and other paths) to 404 at the infrastructure layer before ever reaching the application. Direct request/Host-header log evidence is needed to confirm which mechanism is actually firing in the reported occurrences.
