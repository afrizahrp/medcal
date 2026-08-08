# ADR-001: Next.js version pin (16.2.12)

**Status:** Accepted (supersedes 14.2.35 pin)  
**Date:** 2026-08-03 (revised)  
**Context:** medcal frontend apps (`web`, `portal`, `tech-pwa`)

---

## Decision

**Lock Next.js `16.2.12`** on all Next apps. Do not float with `^`.

- Pair with **React `19.2.8`** / **React DOM `19.2.8`** (exact pin).
- Minimum acceptable on the 16.2 line for the July 2026 coordinated security release: **`16.2.11+`**. We pin the latest 16.2 patch (`16.2.12`).
- Do **not** use `16.3.0-canary` / `preview` for production until a new ADR.

## Why not stay on 14.2.35

- Next.js **14.x is EOL** (since Oct 2025) and did **not** receive the July 2026 CVE backports.
- Staying on 14 would accumulate security + migration debt while the product is still early.

## Why 16 over 15

- **16.x** is Active LTS (~support through Oct 2027).
- **15.x** is Maintenance LTS and approaches EOL (~Oct 2026). Jumping 14 → 16 once is cheaper than 14 → 15 → 16.

## Consequences

- `apps/web`, `apps/portal`, `apps/tech-pwa` depend on `"next": "16.2.12"`.
- Node **≥ 20.9.0** (Next 16 engines).
- Revisit this ADR only for a newer **stable** 16.2.x+/17.x pin after security or LTS changes.

## Related

- Previous interim pin: Next `14.2.35` (mitigations via Host / `__NEXT_PRIVATE_ORIGIN`) — obsolete for the framework line; keep reverse-proxy Host hygiene as general practice.
