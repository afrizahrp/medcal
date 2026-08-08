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

## Production sketch (later)

- One Postgres
- Deploy `web` + `web-api` per public site (each with fixed `COMPANY_ID`)
- Single `api` + `portal` + `tech-pwa` (or same cluster) talking to shared DB
