# medcal

Calibration Business Management System (CBMS) monorepo.

## Stack

- Turborepo + pnpm
- Next.js **16.2.12** + React **19.2.8** (pinned; see [`docs/ADR/001-nextjs-version.md`](./docs/architecture/001-nextjs-version.md))
- Express (`web-api` — public edge only)
- NestJS (`api` — modular monolith business layer)
- Prisma + PostgreSQL (`@medcal/db`)

## Quick start

```bash
cp .env.example .env
docker compose up -d
corepack enable && corepack prepare pnpm@9.15.9 --activate
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev
```

## Apps

| App | Role | Default port |
| --- | ---- | ------------ |
| `apps/web` | B2B website | 3000 |
| `apps/web-api` | Public edge (Express) | 3002 |
| `apps/api` | Nest business API | 3001 |
| `apps/portal` | Customer + admin portal | 3003 |
| `apps/tech-pwa` | Technician PWA | 3004 |

## Docs

See [`docs/`](./docs/) — design principles, Architecture, API, Deployment, business domain, entity catalog, ERD, ADR.
