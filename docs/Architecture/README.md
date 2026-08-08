# Architecture

Ringkasan monorepo medcal (Fase 0 scaffold).

```
Browser
  ├─ apps/web          (Next 16.2.12)  → public B2B site
  ├─ apps/portal       (Next 16.2.12)  → customer + admin
  └─ apps/tech-pwa     (Next 16.2.12)  → technician PWA
         │
         ▼
  apps/web-api         (Express)       → public edge only
         │  COMPANY_ID from env
         ▼
  apps/api             (NestJS)        → business modular monolith
         │
         ▼
  packages/db          (Prisma + Postgres)
```

## Packages

| Package | Role |
| ------- | ---- |
| `@medcal/db` | Prisma schema + client |
| `@medcal/shared` | Types, Zod schemas, errors, constants |
| `@medcal/config` | Env / app config helpers |
| `@medcal/auth` | Better Auth wiring (portal/PWA) |
| `@medcal/notifications` | Email / WA / push / contact stubs |
| `@medcal/ui` | Shared UI primitives |
| `@medcal/typescript-config` | Shared TS configs |
| `@medcal/eslint-config` | Shared ESLint |

## Related

- ADR-000 bootstrap decisions
- ADR-001 Next.js version pin
- `docs/design-principles.md`
