# Final SEO + Lead Generation Audit — MedCal Public Website (apps/web)

**Type:** Read-only pre-production audit, conducted prior to production deployment. No files were modified during this audit. Findings that were later acted on are captured in `docs/Deployment/audits/04-production-containerization-forensic-audit.md` and the implementation itself; this file is the original audit record.

**Answer to the primary question:** *Not fully — ready on the SEO side, one lead-gen infrastructure gap.* The site's SEO surface (routing, metadata, canonicals, structured data, indexability) is well-built and largely production-ready. But the lead-generation pipeline had one confirmed structural gap — `apps/web` had no production environment configuration at all — that would have silently broken every conversion path (Contact Form, Web Chat, WhatsApp) if deployed without it being fixed first. That was the one BLOCKER; everything else was WARNING-level polish. (This blocker was subsequently resolved by the production containerization work — see the forensic audit and implementation summary in this same folder.)

---

## Executive verdict (at time of audit)

## YELLOW

Deployable only after the production env-var gap (BLOCKER below) is closed. Everything else found is a warning-level or polish item that does not need to gate deployment, but several should be fixed soon after launch.

---

## BLOCKERS

**B1 — apps/web had no production environment configuration; lead-gen endpoints would silently point at `localhost` in a production build.**
`apps/web/src/lib/use-visitor-chat.ts:39-40`, `apps/web/src/components/whatsapp-identity-dialog.tsx:22`, and `apps/web/src/app/kontak/kontak-form.tsx:31,76` all resolved their API base URL as `process.env.NEXT_PUBLIC_WEB_API_URL ?? "http://localhost:3002"` / `NEXT_PUBLIC_API_URL ?? "http://localhost:3001"`. These are `NEXT_PUBLIC_*` vars, which Next.js inlines into the client bundle **at build time**. At the time of this audit, `.env.production.example` only defined vars for `apps/api`, and `docker-compose.prod.yml` explicitly stated `apps/web` was "intentionally not included yet." If the production build pipeline for apps/web were run without these vars explicitly set at build time, Contact Form, Web Chat, and WhatsApp identity dialog would all call `http://localhost:...` in production — every lead-conversion path breaks silently while the pages themselves still render and index fine.
Evidence: VERIFIED FROM REPOSITORY. **Status: resolved** — see the containerization work.

---

## WARNINGS

**W1 — `siteUrl` (canonical/sitemap/robots/OG base) is a hardcoded literal, not environment-driven.**
`apps/web/src/data/seo.ts`: `export const siteUrl = "https://kalibrasimedika.co.id";` — used by `robots.ts`, `sitemap.ts`, `layout.tsx` `metadataBase`, and `structured-data.ts`. Safe in that no `localhost`/Vercel default can leak into production metadata, but means any preview/staging build would emit production canonical URLs regardless of what host it's actually served from.

**W2 — No analytics/conversion tracking exists.**
Full grep across `apps/web/src` for gtag, GTM, Google Analytics, PostHog, Mixpanel, Plausible, Clarity: zero matches. Classification: **absent**. Recommended for post-launch, not a blocker.

**W3 — Sitemap `lastModified` is meaningless.**
`apps/web/src/app/sitemap.ts` sets `lastModified: new Date()` for every category route — the request/build timestamp, not real content-change dates.

**W4 — `PostalAddress` in the Organization/ProfessionalService JSON-LD is incomplete.**
`apps/web/src/data/structured-data.ts`: address object has only `streetAddress`, missing `addressLocality`/`addressRegion`/`postalCode`/`addressCountry`. Weakens eligibility for local-business rich results.

**W5 — 6 of 8 service category pages have no hero/context image.**
`apps/web/src/data/category-images.ts` only defines images for `monitoring-pasien` and `blood-bank`.

**W6 — Long-tail/secondary keywords have no dedicated landing page.**
`service-categories.json` defines `keywords.secondary[]` per category, and `products.json` defines individual equipment items — but there are no per-product/per-equipment routes.

**W7 — Heading hierarchy skips a level on `/layanan`.**
Single H1, but category cards below it use H3 directly — no H2 in between.

**W8 — `SectionCta` shared component emits inconsistent heading levels** (H2 in `banner` variant, H3 in `plain` variant) depending on which variant a page uses, rather than document position.

**W9 — Featured-categories images on the homepage are not prioritized and default to lazy-loading**, despite sitting near the top of the homepage. Possible LCP contributor — REQUIRES BROWSER/PRODUCTION TEST to confirm actual impact.

**W10 — Legacy backend route `/public/web-chat` was still live and unused** at time of audit. (Investigated further in the web-api build-readiness audit in this folder — confirmed unrelated to any build issue, still a cleanup candidate.)

**W11 — Contact form surfaces raw backend error JSON to the visitor on failure**, unlike WhatsApp/Web Chat which show a generic message.

**W12 — Footer only links the first 3 of 8 service categories** — not an orphan-page problem (all 8 reachable elsewhere), but the weakest internal-link path for categories 4–8.

**W13 — Preview/staging blocking has no explicit mechanism.** No `noindex` logic gated on environment/hostname was found anywhere.

---

## PASS

- Route architecture: 12 clean, flat, purposeful routes, all pre-rendered via `generateStaticParams`, no orphans, no accidental duplicates, no query-parameter indexation risk.
- `robots.ts`/`sitemap.ts`: dynamically generated, correct, no orphans, no phantom entries.
- Canonical tags on every page, including dynamic category routes.
- `metadataBase` correctly set once in root layout.
- Per-page metadata unique, non-generic, non-duplicated, sourced from real content data on all pages including 8 dynamic category pages.
- H1 discipline: exactly one H1 per page, keyword-rich on category pages.
- Breadcrumbs: single component emits both visible nav and matching `BreadcrumbList` JSON-LD from the same data — cannot drift.
- Internal linking: homepage → categories → detail → contact chain intact via multiple redundant paths; no true orphan pages.
- Structured data quality: ProfessionalService, WebSite, Service, BreadcrumbList all genuinely backed by real content; correctly no fabricated FAQPage.
- Images: no missing or generic `alt` text found anywhere audited.
- **CTA hierarchy matches the approved architecture exactly**: Web Chat is the single global floating CTA (one instance, root layout); legacy `whatsapp-fab.tsx` confirmed deleted; WhatsApp exists in exactly one place sitewide (`/kontak` sidebar); `SectionCta` deliberately excludes WhatsApp everywhere else.
- **Web Chat correctness**: uses `/public/chat-sessions` (not the legacy `/public/web-chat`); failed sends never discard the visitor's drafted message; identity capture validated client- and server-side.
- **WhatsApp correctness**: identity dialog requires phone + organizationName (both truly required); backend `getFrom` hardcoded server-side to `WHATSAPP`; wa.me deep link opens strictly *after* a successful backend response.
- **Contact form**: sensible required/optional split, reCAPTCHA v3, correct endpoint, clear success/error states.
- **Rate limiting**: each of the three public lead channels has its own independent, per-route server-side rate limiter.

---

## Route/indexability matrix

| Route | Indexable | Canonical | Sitemap | Robots | Notes |
|---|---|---|---|---|---|
| `/` | Yes | `/` | Yes | Allowed | PASS |
| `/layanan` | Yes | `/layanan` | Yes | Allowed | PASS |
| `/layanan/kalibrasi-{8 slugs}` | Yes | per-slug | Yes (8 entries) | Allowed | PASS, static via generateStaticParams |
| `/kontak` | Yes | `/kontak` | Yes | Allowed | PASS |
| `/sertifikasi-legalitas` | Yes | `/sertifikasi-legalitas` | Yes | Allowed | PASS |

## SEO → Lead conversion matrix

| Page | Search Intent | SEO Status | CTA | Lead Path | Risk |
|---|---|---|---|---|---|
| `/` | Brand/category discovery | Ready | Web Chat (global) + links to `/layanan` | Homepage → category → detail → contact | Low |
| `/layanan` | Category-level commercial | Ready | Web Chat + card links | → detail pages | Low |
| `/layanan/kalibrasi-{slug}` (8) | High-intent, per-equipment-category commercial | Ready (unique metadata/H1/schema per page); W5 thin on 6/8 (no image) | Web Chat + `SectionCta` → `/kontak` | Direct lead-ready | Medium on 6 pages, otherwise Low |
| `/kontak` | Transactional/contact | Ready | Contact Form + WhatsApp + tel: | Terminal lead-capture page | Low, contingent on B1 (now resolved) |
| `/sertifikasi-legalitas` | Trust/credibility, supporting | Ready | Web Chat + `SectionCta` | Supports conversion indirectly | Low |

## Post-launch recommendations

**Should fix soon:** W2 (add basic conversion analytics), W1/W13 (environment-derived `siteUrl` or environment-gated `noindex`), W10 (remove/deprecate `/public/web-chat`), W4 (complete `PostalAddress` fields).

**Optimization after launch:** W5 (category hero images), W6 (secondary-keyword landing pages), W3 (real sitemap `lastModified` dates), W7/W8/W9/W11/W12 (minor polish).

## Exact files reviewed

`apps/web/src/app/layout.tsx`, `page.tsx`, `robots.ts`, `sitemap.ts`, `layanan/page.tsx`, `layanan/[kategori]/page.tsx`, `kontak/page.tsx`, `kontak/kontak-form.tsx`, `sertifikasi-legalitas/page.tsx`, `apps/web/src/data/site.ts`, `service-categories.json`, `products.json`, `seo.ts`, `structured-data.ts`, `category-images.ts`, `web-chat-bubble.tsx`, `whatsapp-identity-dialog.tsx`, `breadcrumb.tsx`, `json-ld.tsx`, `section-cta.tsx`, `site-header.tsx`, `site-footer.tsx`, `featured-categories-section.tsx`, `service-category-card.tsx`, `catalog-search.tsx`, `hero.tsx`, `pain-point-section.tsx`, `apps/web/src/lib/use-visitor-chat.ts`, `apps/web-api/src/index.ts`, `public-chat-session-schema.ts`, `public-whatsapp-lead-schema.ts`, `public-web-chat-schema.ts`, `.env`, `.env.production.example`, `docker-compose.prod.yml`, `apps/web/next.config.js`.
