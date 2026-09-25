Ya. Ini versi **satu single-block Markdown**, siap copy-paste langsung ke Claude Code. Substansinya sama, hanya saya rapikan supaya tidak terpecah saat dicopy.

````markdown
# Task — Plan Isolated Customer Portal MVP + Infrastructure

## Objective

Rencanakan implementasi **Customer Portal MVP** sebagai application yang **fully isolated dari Management Portal**, mengikuti architectural pattern `apps/tech-pwa`.

Target MVP:

```text
Customer
   ↓
Scan QR pada certificate
   ↓
Customer Portal
   ↓
Certificate verification/access
   ↓
View certificate
```

Customer Portal harus menjadi application terpisah:

```text
apps/
├── api
├── portal              # Management Portal
├── customer-portal     # NEW — Customer Portal
├── tech-pwa
├── web
└── web-api
```

**JANGAN IMPLEMENTASI.**

Task ini hanya menghasilkan implementation plan yang cukup detail untuk kemudian diberikan sebagai implementation task terpisah.

---

# Existing Architecture Context

Audit sebelumnya menemukan:

- `apps/portal` adalah Next.js 16 App Router.
- `apps/portal` saat ini melayani:
  - `apps.kalibrasimedika.co.id` → Management Portal
  - `portal.kalibrasimedika.co.id` → `/client` customer-facing skeleton.
- F6 foundation untuk `apps/portal` sudah complete/locked.
- `apps/portal/client` memang disiapkan sebagai future customer-facing surface.
- `apps/tech-pwa` adalah application terpisah.
- `apps/tech-pwa` menggunakan shared packages seperti:
  - `@medcal/auth`
  - `@medcal/ui`
  - `@medcal/shared`
- `apps/web-api` adalah public edge service.
- `apps/api` adalah NestJS backend.
- `Certificate.verificationToken` sudah ada di Prisma schema dan unique.
- Existing public endpoint pattern menggunakan:
  - `apps/web-api`
  - rate limiting/CORS
  - forwarding ke `apps/api`
  - `x-internal-secret`
  - `@AllowAnonymous()`
  - `InternalServiceGuard`.

Refer to the completed audit rather than re-inventing these findings.

---

# Architectural Decision

Customer Portal **MUST be isolated as a separate application**, similar to `tech-pwa`.

Do NOT reuse:

```text
apps/portal/src/app/client
```

as the implementation surface.

Instead plan:

```text
apps/customer-portal
```

The goal of isolation is:

- independent application lifecycle
- independent deployment
- independent routing
- independent auth boundary where appropriate
- reduced coupling to Management Portal
- smaller blast radius
- ability to evolve Customer Portal independently

Shared packages may still be reused where appropriate.

Isolation does NOT mean duplicating shared infrastructure unnecessarily.

---

# Audit Before Planning

Before writing the plan, inspect the actual repository.

Pay special attention to `apps/tech-pwa` as the reference implementation.

Audit:

## 1. `apps/tech-pwa`

Determine the exact pattern for:

- application structure
- `package.json`
- Next.js configuration
- TypeScript configuration
- middleware/proxy
- authentication
- environment variables
- API client
- shared packages
- build command
- Dockerfile
- Docker compose integration
- production deployment
- port allocation
- health check
- nginx integration
- SSL/certificate handling
- any `infra/add-ssh` preparation associated with the application

Do not merely copy names.
Understand why each piece exists.

---

# 2. `apps/portal`

Audit only for reusable shared conventions:

- auth package usage
- UI package usage
- API client conventions
- environment configuration
- shared layouts/components
- existing certificate-related domain/API usage

Do NOT use `apps/portal/client` as the Customer Portal implementation target.

---

# 3. Authentication

Determine how an isolated application should authenticate.

Important distinction:

```text
Management Portal authentication
        ≠
Customer Portal authentication
```

The Customer Portal may reuse the underlying `@medcal/auth` package if appropriate, but must not accidentally inherit Management Portal authorization assumptions.

Analyze:

- Better Auth setup
- session handling
- cookie/domain behavior
- cross-subdomain implications
- customer identity
- management user identity
- public QR certificate access
- authenticated customer access if needed
- anonymous certificate verification

Do not design a completely new authentication system without repository evidence.

For MVP, explicitly identify whether:

```text
QR → public certificate verification
```

can remain anonymous while:

```text
customer portal authenticated features
```

remain protected.

Do not broaden anonymous access beyond the required certificate route.

---

# 4. Certificate API Flow

Plan the backend flow based on existing architecture:

```text
Customer Portal
      │
      ▼
apps/web-api
GET /public/certificates/:token
      │
      │ internal service authentication
      ▼
apps/api
CertificatesModule
      │
      ▼
Certificate.verificationToken
```

Determine:

- exact controller/module structure
- DTO/response shape
- authorization boundary
- data minimization
- certificate status handling
- missing/invalid token behavior
- rate limiting
- whether PDF/file access is direct or proxied
- whether existing file/document services can be reused

Do not create or modify the endpoint.

This is planning only.

---

# 5. QR Flow

Plan the intended QR architecture.

Expected conceptual flow:

```text
Certificate PDF
      │
      └── QR
           │
           ▼
https://<customer-domain>/certificate/<token>
           │
           ▼
Customer Portal
           │
           ▼
web-api
           │
           ▼
Certificate lookup
```

Investigate existing PDF generation architecture.

Determine:

- where certificate PDF generation currently happens
- where QR generation should logically be introduced
- whether a QR library already exists
- if a new dependency is needed
- how the verification URL should be constructed
- whether raw `verificationToken` should be exposed or transformed

Do NOT decide to expose the raw token merely because it already exists.

Explicitly identify the security trade-off.

---

# 6. Nginx / Domain

This is a required part of the plan.

Inspect:

```text
infra/nginx/
```

including:

```text
api.kalibrasimedika.co.id.conf.example
apps.kalibrasimedika.co.id.conf.example
kalibrasimedika.co.id.conf.example
technician.kalibrasimedika.co.id.conf.example
```

Use `technician.kalibrasimedika.co.id` as the closest precedent for an independently deployed application where appropriate.

Plan the new customer domain.

Likely candidate:

```text
customer.kalibrasimedika.co.id
```

BUT do not assume this is final.

Determine the appropriate domain/subdomain based on current naming conventions.

Plan:

- nginx server block
- upstream
- proxy headers
- websocket requirements if any
- SPA/Next.js routing requirements
- SSL/TLS
- DNS dependency
- production deployment dependency
- health endpoint if needed

Do NOT modify nginx.

---

# 7. `infra/add-ssh`

Inspect the existing:

```text
infra/add-ssh/
```

especially:

```text
F5_7_Containerize_TechPWA_Staged.md
```

Understand how infrastructure preparation for `tech-pwa` was documented/staged.

Determine what equivalent preparation is required for Customer Portal.

Plan only.

Do not execute VPS commands.

Do not add SSH keys.

Do not change server configuration.

The plan should explicitly distinguish:

### Repository changes

vs.

### VPS/server changes

vs.

### DNS changes

vs.

### Nginx changes

---

# 8. Docker / Containerization

Use `tech-pwa` as the primary precedent.

Determine:

- Dockerfile pattern
- production build
- runtime image
- port
- environment variables
- healthcheck
- compose service
- network
- dependencies
- volume requirements
- whether customer-portal needs anything different

Plan:

```text
apps/customer-portal
       ↓
Docker image
       ↓
production compose service
       ↓
nginx
       ↓
customer domain
```

Do not modify any Docker files.

---

# 9. Monorepo / Workspace

Inspect:

- root `package.json`
- workspace configuration
- turbo/build orchestration if present
- lockfile conventions
- lint/typecheck/test configuration
- CI/build scripts

Determine exactly what needs to be added for:

```text
apps/customer-portal
```

Do not add the app.

---

# 10. Security Review

The plan MUST include a specific security section.

Cover:

### Token security

- entropy
- enumeration resistance
- raw token exposure
- token rotation/revocation
- expiration if applicable

### Public endpoint

- rate limiting
- CORS
- input validation
- response minimization
- abuse protection

### Certificate access

Ensure the endpoint does not accidentally expose:

- internal customer data
- unrelated devices
- internal IDs
- management-only metadata
- unrelated job data

### Application isolation

Ensure Customer Portal cannot accidentally inherit:

- Management Portal routes
- management session assumptions
- management roles
- management authorization

### File/PDF access

Determine whether a customer can use the certificate lookup to obtain arbitrary `FileObject` records.

---

# 11. Deployment Plan

Produce an explicit deployment dependency chain:

```text
Code
 ↓
Docker image
 ↓
Production compose
 ↓
VPS service
 ↓
Nginx
 ↓
DNS
 ↓
HTTPS
 ↓
Customer Portal
```

Identify which steps are:

- developer/local
- repository
- VPS
- DNS/provider
- Nginx
- certificate/SSL
- SSH/add-ssh

---

# 12. MVP Scope

Keep MVP deliberately narrow.

## Must Have

```text
Customer Portal application
Independent deployment
Customer-facing route
Certificate lookup
Certificate verification
Certificate viewing/access
Public QR entry point
Production domain
HTTPS
Basic abuse protection
```

## Reuse

```text
@medcal/auth
@medcal/shared
@medcal/ui
existing API infrastructure
existing file/document infrastructure
existing deployment patterns
```

## Explicitly NOT MVP

```text
Customer dashboard
Calibration progress
Customer history
Feedback
Notifications
Customer plan
Customer engagement features
Full customer account management
Google Drive integration
```

These may come later.

---

# 13. Implementation Phases

Produce a staged implementation plan.

Suggested structure:

### Phase 1 — Application foundation

`apps/customer-portal`

### Phase 2 — Authentication/access boundary

### Phase 3 — Certificate API

### Phase 4 — Certificate UI

### Phase 5 — QR generation/integration

### Phase 6 — Docker/production deployment

### Phase 7 — Nginx/DNS/HTTPS

### Phase 8 — End-to-end verification

Adjust the phases based on actual repository findings.

For each phase provide:

- files/modules likely affected
- dependencies
- implementation objective
- acceptance criteria
- risks
- prerequisites

---

# 14. Critical Path for 5-Day MVP

Because the customer meeting is around 28/09 or 30/09/2026, identify the minimum critical path.

Clearly distinguish:

```text
Critical Path
```

from:

```text
Can be deferred
```

The goal is to have:

```text
Scan QR
   ↓
Customer Portal
   ↓
Certificate verification
   ↓
Certificate view
```

working in production.

Do not let future Customer Portal features expand this critical path.

---

# 15. Deliverable

Create a planning document, preferably under the existing documentation convention, for example:

```text
docs/...
```

Suggested title:

# Customer Portal MVP — Isolated Application Implementation Plan

The document must contain:

1. Executive Summary
2. Existing Architecture Reference
3. Why Isolated App
4. `tech-pwa` Pattern Analysis
5. Proposed `apps/customer-portal` Structure
6. Authentication Boundary
7. Certificate API Architecture
8. QR Architecture
9. Docker/Container Architecture
10. Nginx/Domain Architecture
11. `infra/add-ssh` / VPS Preparation
12. Security Considerations
13. Implementation Phases
14. 5-Day Critical Path
15. Acceptance Criteria
16. Risks / Open Questions
17. Files Expected to Change

---

# Hard Constraints

**PLAN ONLY.**

Do NOT:

- create `apps/customer-portal`
- modify `apps/portal`
- modify `apps/api`
- modify `apps/web-api`
- modify Prisma schema
- add dependencies
- modify Docker
- modify docker-compose
- modify Nginx
- modify DNS
- modify VPS
- add SSH keys
- implement QR
- implement certificate API
- implement authentication
- create migrations
- run production commands
- commit changes

The only permitted repository modification is the planning document itself, if consistent with repository documentation conventions.

Do not create implementation scaffolding.

---

# Final Output

At the end provide:

## Architecture Decision

One concise statement describing the proposed isolated Customer Portal architecture.

## Critical Path

The minimum implementation sequence required for the MVP.

## Infrastructure Dependencies

Explicit list of:

- DNS
- Nginx
- Docker
- VPS
- SSL
- SSH/add-ssh
- environment variables

## Security Decision

Explain how public QR certificate access is isolated from Management Portal authentication and authorization.

## Open Questions

Only questions that genuinely cannot be answered from the repository.

## Ready for Implementation?

Answer:

```text
YES / YES WITH PREREQUISITES / NO
```

with concrete reasons.

Again: **do not implement anything.**
````
