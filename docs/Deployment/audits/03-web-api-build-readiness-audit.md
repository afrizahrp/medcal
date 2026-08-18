# apps/web-api Build Readiness Audit

**Type:** Read-only diagnosis, conducted to independently re-verify a build failure recorded in `docs/Architecture/02-foundation-implementation-plan.md`'s F6 verification log, before committing to containerizing apps/web-api. Build commands were run (read-only) to reproduce/verify; nothing else changed. **Status: confirmed stale — apps/web-api builds cleanly and has since been successfully containerized** (see the forensic containerization audit and the actual `apps/web-api/Dockerfile`).

## Verdict

## GREEN

`apps/web-api` builds cleanly, both in isolation and as part of the full monorepo build. The previously-documented failure was real at the time it was recorded, but was already fixed by a later commit — before any of the WhatsApp/chat feature work that came after it. It was stale information, not a live defect.

## Exact build command(s) and results

Run against the working tree at commit `b97dd36` (clean, no uncommitted changes at time of audit):

```
pnpm --filter @medcal/web-api build      → tsc -p tsconfig.json → exit 0
pnpm --filter @medcal/web-api typecheck  → tsc --noEmit         → exit 0
pnpm --filter @medcal/notifications typecheck → tsc --noEmit    → exit 0
pnpm turbo run build --filter=@medcal/web-api → 1/1 tasks successful
pnpm turbo run build --continue --force  (full repo, cache bypassed) → 5/5 tasks successful, including @medcal/api and @medcal/web-api
```

All five produced clean exits with zero TypeScript errors and zero build failures. The `--force` full-repo run specifically ruled out a stale-cache false positive.

## Root error

There was no current error at time of audit. What follows is the trace of the error that *used to exist*, per the task's request to independently verify the previously-documented failure.

## Evidence — the bug and its fix, both in git history

Git history on `apps/web-api/src/index.ts` (newest → oldest at time of audit):
```
b97dd36  feat(whatsapp): implement WhatsApp identity dialog and related rate limiting
54ec9cc  feat(chat): implement chat module with real-time messaging and session management
8fc70e3  feat: add Web Chat bubble component and backend schema
4796b7f  feat: add ContactTopic model with seeding script and foreign key relationship  ← import fixed here
c09247e  Add F5 Audit report for infrastructure and deployment topology                 ← broken import
```

At commit `c09247e`, `apps/web-api/src/index.ts` line 6 read:
```ts
import { buildWhatsAppDeepLink } from "@medcal/notifications";
```
A named import of `buildWhatsAppDeepLink` directly from the package root. But `packages/notifications/src/index.ts` (unchanged since the repo's initial commit) has only ever exported a namespace re-export:
```ts
export * as contact from "./contact";
export * as email from "./email";
export * as push from "./push";
export * as whatsapp from "./whatsapp";
```
`import { buildWhatsAppDeepLink } from "@medcal/notifications"` genuinely does not resolve against that barrel — this is exactly the "missing export" error the implementation-plan doc recorded.

The very next commit that touched this file, `4796b7f`, corrected it:
```diff
- import { buildWhatsAppDeepLink } from "@medcal/notifications";
+ import { whatsapp } from "@medcal/notifications";
...
- res.json({ url: buildWhatsAppDeepLink(phone, text) });
+ res.json({ url: whatsapp.buildWhatsAppDeepLink(phone, text) });
```

## @medcal/notifications trace

1. Symbol imported: `whatsapp` (a namespace object), not `buildWhatsAppDeepLink` directly.
2. Exported from: `packages/notifications/src/index.ts:4` — `export * as whatsapp from "./whatsapp";`.
3. Source file exists: `packages/notifications/src/whatsapp/index.ts` — exports `buildWhatsAppDeepLink(phoneE164, text)`, a `wa.me` deep-link builder.
4. Barrel exports it correctly via the namespace re-export.
5. `packages/notifications/package.json` has no `exports` field — resolves through its single `"main"` entry point (the barrel above).
6. Package typechecks cleanly on its own.
7. No separate build step for this package (no `build` script — raw TypeScript, same pattern as every workspace package) — no build-order issue possible.
8. Not stale — actively used, not dead code.

## Whether the issue was pre-existing or feature-related

Pre-existing and already resolved — unrelated to the WhatsApp/chat feature work that came after it. The broken import existed only in the commit that introduced the F5 infrastructure audit doc and was corrected in the very next commit that touched the file (unrelated Contact Form/ContactTopic work). The WhatsApp identity dialog feature did not introduce any new dependency on `@medcal/notifications` — its deep link is built client-side in `apps/web`'s own `waLink()` helper, not through this package at all.

## Production impact

None. This removed what would have been a real prerequisite blocker for containerizing apps/web-api. The remaining blockers at the time were deployment-topology decisions (hostname, Dockerfile, compose service, env template) — not build-correctness issues. **All of those have since been resolved** — see the forensic containerization audit.

## Exact files/commands reviewed

`apps/web-api/src/index.ts`, `packages/notifications/package.json`, `packages/notifications/src/index.ts`, `packages/notifications/src/whatsapp/index.ts`, `apps/web-api/package.json`, `apps/web-api/src/public-whatsapp-lead-schema.ts`, `apps/web/src/components/whatsapp-identity-dialog.tsx`, `apps/web/src/data/site.ts`; git log/diff on `apps/web-api/src/index.ts` and `packages/notifications/src/index.ts` across commits `9207a06`→`b97dd36`; live command runs listed above.
