# API

## Surfaces

| Surface | Base | Auth | Notes |
| ------- | ---- | ---- | ----- |
| `apps/web-api` | `:3002` | Public (+ captcha later) | Edge only; injects `COMPANY_ID` |
| `apps/api` | `:3001` | Internal / session (later) | Business logic |

## Health

- `GET /health` on `api` and `web-api` (scaffold).

## Inbound contact (scaffold)

```
POST web-api /contact-messages
  → Nest POST /contact-messages
  → ContactMessage (+ GetMessageFrom) via Prisma
```

Payload client **tidak** boleh mengandung `companyId`. Edge membaca `process.env.COMPANY_ID`.

## Conventions (target)

- JSON, camelCase fields matching Prisma client where practical.
- Error shape from `@medcal/shared` errors helpers.
- Versioning: path prefix hanya jika breaking public contract; internal Nest modules evolve in-place.
