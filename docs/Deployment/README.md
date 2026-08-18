# Deployment

## Local (Fase 0)

1. Copy `.env.example` → `.env`
2. `docker compose up -d` (Postgres)
3. `pnpm install`
4. `pnpm db:generate` && `pnpm db:migrate`
5. `pnpm dev` (Turbo parallel apps)

## Env highlights

| Variable | Used by | Notes |
| -------- | ------- | ----- |
| `DATABASE_URL` | `@medcal/db`, api | Postgres connection |
| `COMPANY_ID` | `web-api` | Server-only; never from browser |
| `API_URL` / internal URLs | web-api → api | Service-to-service |

## Out of scope (for now)

- Kubernetes, Redis, message queues
- Multi-region
- Separate DB per tenant (logical `companyId` only)

## Production

`apps/web`, `apps/api`, `apps/web-api`, and `apps/portal` are containerized and validated locally (not yet deployed to the VPS). PostgreSQL stays native/external on the VPS — never containerized.

```
https://kalibrasimedika.co.id            → apps/web
https://kalibrasimedika.co.id/public/*   → apps/web-api
https://api.kalibrasimedika.co.id        → apps/api
https://apps.kalibrasimedika.co.id       → apps/portal
```

See **[production-containerization-implementation-summary.md](production-containerization-implementation-summary.md)** for the current state (what's implemented, what's validated, exact VPS deployment steps, and remaining risks) and **[audits/](audits/)** for the full design/evidence trail:

1. [SEO + Lead Generation Audit](audits/01-seo-lead-generation-audit.md)
2. [Production Env + Docker Wiring Audit](audits/02-production-env-docker-wiring-audit.md)
3. [apps/web-api Build Readiness Audit](audits/03-web-api-build-readiness-audit.md)
4. [Forensic Production Containerization Audit](audits/04-production-containerization-forensic-audit.md)
5. [apps/portal Delta Audit](audits/05-apps-portal-delta-audit.md)

`apps/tech-pwa` is not yet containerized — out of scope until its own implementation reaches that stage.
