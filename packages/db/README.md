# @medcal/db

Prisma schema & client for medcal CBMS.

- Schema: [`prisma/schema.prisma`](./prisma/schema.prisma)
- Aligned with approved ERD (`docs/ERD/`) and ADR-000
- PostgreSQL via `DATABASE_URL`

```bash
# from packages/db (after monorepo install)
pnpm generate
pnpm migrate:dev
```

Better Auth tables may be added later alongside domain `User`.
