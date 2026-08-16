# apps/web-api Build Readiness Audit

**Type:** Read-only diagnosis. No files were modified. Build commands were run (read-only) to reproduce/verify; nothing else changed.

## Verdict

## GREEN

`apps/web-api` builds cleanly today, both in isolation and as part of the full monorepo build. The previously-documented failure was real at the time it was recorded, but was already fixed by a later commit — before any of the current WhatsApp/chat feature work existed. It is stale information, not a live defect.

---

## Exact build command(s)

Run against the current working tree (commit `b97dd36`, clean, no uncommitted changes):

```
pnpm --filter @medcal/web-api build      → tsc -p tsconfig.json → exit 0
pnpm --filter @medcal/web-api typecheck  → tsc --noEmit         → exit 0
pnpm --filter @medcal/notifications typecheck → tsc --noEmit    → exit 0
pnpm turbo run build --filter=@medcal/web-api → 1/1 tasks successful
pnpm turbo run build --continue --force  (full repo, cache bypassed) → 5/5 tasks successful, including @medcal/api and @medcal/web-api
```

All five produced clean exits with zero TypeScript errors and zero build failures. The `--force` full-repo run specifically rules out a stale-cache false positive — it recompiled every package from scratch, `@medcal/notifications` included, and everything still passed.

---

## Root error

**There is no current error.** No error to report from today's build. What follows is the trace of the error that *used to exist*, per the task's request to independently verify the previously-documented failure.

---

## Evidence

Git history on `apps/web-api/src/index.ts` (newest → oldest):
```
b97dd36  feat(whatsapp): implement WhatsApp identity dialog and related rate limiting
54ec9cc  feat(chat): implement chat module with real-time messaging and session management
8fc70e3  feat: add Web Chat bubble component and backend schema
4796b7f  feat: add ContactTopic model with seeding script and foreign key relationship  ← import fixed here
c09247e  Add F5 Audit report for infrastructure and deployment topology                 ← broken import, and the commit where the F5/F6 doc's build-failure note was written
```

At commit `c09247e` (the commit that added the F5 audit doc, dated 2026-08-14), `apps/web-api/src/index.ts` line 6 read:
```ts
import { buildWhatsAppDeepLink } from "@medcal/notifications";
```
This is a **named import of `buildWhatsAppDeepLink` directly from the package root**. But `packages/notifications/src/index.ts` (unchanged since the repo's initial commit `9207a06`) has only ever exported:
```ts
export * as contact from "./contact";
export * as email from "./email";
export * as push from "./push";
export * as whatsapp from "./whatsapp";
```
— i.e., a **namespace re-export** (`whatsapp.buildWhatsAppDeepLink(...)`), not a flat re-export of `buildWhatsAppDeepLink` itself. `import { buildWhatsAppDeepLink } from "@medcal/notifications"` genuinely does not resolve against that barrel — this is exactly the "missing export" TypeScript error the implementation-plan doc recorded.

The very next commit that touched this file, `4796b7f` ("feat: add ContactTopic model..."), corrected it:
```diff
- import { buildWhatsAppDeepLink } from "@medcal/notifications";
+ import { whatsapp } from "@medcal/notifications";
...
- res.json({ url: buildWhatsAppDeepLink(phone, text) });
+ res.json({ url: whatsapp.buildWhatsAppDeepLink(phone, text) });
```
This fix has been in place for 3 commits now (`4796b7f` → `8fc70e3` → `54ec9cc` → `b97dd36`, the current `HEAD`) and the current file (verified by direct read) still uses `import { whatsapp } from "@medcal/notifications";` at line 6, with `whatsapp.buildWhatsAppDeepLink(phone, text)` at its one call site (line 127, inside the `GET /public/whatsapp-link` route).

---

## @medcal/notifications trace

1. **Symbol imported today:** `whatsapp` (a namespace object), not `buildWhatsAppDeepLink` directly.
2. **Where it's exported from:** `packages/notifications/src/index.ts:4` — `export * as whatsapp from "./whatsapp";`.
3. **Does the source file exist:** Yes — `packages/notifications/src/whatsapp/index.ts` exists and exports `buildWhatsAppDeepLink(phoneE164, text)`, a simple `wa.me` deep-link builder. Content verified directly, matches the function signature used at the call site.
4. **Does the barrel export it:** Yes, via the namespace re-export described above — `whatsapp.buildWhatsAppDeepLink` resolves correctly.
5. **Does `package.json`'s `exports` field permit it:** `packages/notifications/package.json` has no `exports` field at all (only `"main": "./src/index.ts"` and `"types": "./src/index.ts"`) — the whole package resolves through its single entry point, which is exactly the barrel checked above. No export-map restriction is in play.
6. **Does the package build/typecheck on its own:** Yes — `pnpm --filter @medcal/notifications typecheck` passes cleanly (exit 0).
7. **Is build order relevant:** Not in a way that matters here — `@medcal/notifications`'s `package.json` has no `build` script at all (only `typecheck`), and like every other workspace package in this repo it's consumed as raw TypeScript (`"main": "./src/index.ts"`) rather than a compiled artifact — so there's no separate build step whose ordering could go stale.
8. **Is the import stale/unused:** The import that *was* stale (`buildWhatsAppDeepLink` as a flat named import) has been corrected. The current import (`whatsapp` namespace) is live and actively used, not dead code.

---

## Whether the issue is pre-existing or feature-related

**Pre-existing and already resolved — unrelated to the current WhatsApp/chat feature work.** The broken import existed only in the commit that introduced the F5 infrastructure audit doc (`c09247e`, 2026-08-14) and was corrected in the very next commit that touched the file (`4796b7f`, part of unrelated Contact Form/ContactTopic work — the fix looks incidental to that commit's real purpose, not a deliberate "fix the notifications import" commit). The current WhatsApp identity dialog feature (`b97dd36`, the most recent commit) did not introduce any new dependency on `@medcal/notifications` beyond the same single `whatsapp.buildWhatsAppDeepLink` call that already existed and already worked — confirmed by checking `apps/web-api/src/public-whatsapp-lead-schema.ts` and the WhatsApp-lead route in `index.ts`, neither of which reference `@medcal/notifications` at all (the lead endpoint's WhatsApp-specific logic is just a hardcoded `WHATSAPP_DEFAULT_MESSAGE` constant and a `getFrom: "WHATSAPP"` tag, no deep-link building happens server-side for that flow — the deep link is built client-side in `apps/web`'s `whatsapp-identity-dialog.tsx` via its own `waLink()` helper in `apps/web/src/data/site.ts`, not through this package at all).

So: the F5/F6 implementation-plan doc's build-failure note is an accurate historical record of a real, transient bug — not a symptom of anything still wrong today, and not something the WhatsApp feature work re-broke or depends on.

---

## Production impact

None currently. `apps/web-api` is fully buildable today with the standard `tsc` compile (`pnpm --filter @medcal/web-api build` → `dist/index.js`, matching its own `"start": "node dist/index.js"` script). This removes what would have been a real prerequisite blocker for containerizing `apps/web-api` (identified as a dependency in the prior production-env/Docker-wiring audit's §9 and §13 "smallest corrections needed" list, step 2). That step can now be considered satisfied — the remaining blockers for `apps/web-api`'s production deployment are the ones already identified in that prior audit: no chosen hostname, no Dockerfile, no compose service, no `.env.production` section — none of which are build-correctness issues, all of which are deployment-topology decisions/artifacts that don't exist yet.

---

## Minimal conceptual fix

Not applicable — nothing to fix. (For completeness, had the bug still existed, the conceptual fix would have been exactly what commit `4796b7f` already did: import the `whatsapp` namespace object and call `whatsapp.buildWhatsAppDeepLink(...)` instead of trying to import `buildWhatsAppDeepLink` as a flat named export that the barrel never provided.)

---

## Dependencies before production deployment

Build correctness is no longer one of them. What remains, per the prior production-env/Docker-wiring audit, is unchanged by this finding:
1. Choose `apps/web-api`'s production hostname (must be a subdomain of `kalibrasimedika.co.id`, per the ChatSessionToken cross-origin cookie requirement already traced in that audit).
2. Create `apps/web-api`'s Dockerfile (no existing template for it beyond reusing `apps/api/Dockerfile`'s prune/install pattern).
3. Add a `web-api` service to `docker-compose.prod.yml` and a `.env.production` section for its own variables (`WEB_API_PORT`, `API_URL` pointed at production `apps/api`, `INTERNAL_API_SECRET`, `CHAT_SESSION_TOKEN_SECRET`, `CHAT_WIDGET_ORIGINS`, per-route rate-limit vars, `COOKIE_DOMAIN`) — none of which exist yet.
4. Only after those exist does wiring `apps/web`'s own `NEXT_PUBLIC_WEB_API_URL`/`NEXT_PUBLIC_API_URL` build-time values (from the prior audit) become meaningful.

---

## Exact files/commands reviewed

`apps/web-api/src/index.ts`, `packages/notifications/package.json`, `packages/notifications/src/index.ts`, `packages/notifications/src/whatsapp/index.ts`, `apps/web-api/package.json`, `apps/web-api/src/public-whatsapp-lead-schema.ts`, `apps/web/src/components/whatsapp-identity-dialog.tsx`, `apps/web/src/data/site.ts`; git log/diff on `apps/web-api/src/index.ts` and `packages/notifications/src/index.ts` across commits `9207a06`→`b97dd36`; live command runs: `pnpm --filter @medcal/web-api build`, `pnpm --filter @medcal/web-api typecheck`, `pnpm --filter @medcal/notifications typecheck`, `pnpm turbo run build --filter=@medcal/web-api`, `pnpm turbo run build --continue --force`.

## Evidence classification

- **VERIFIED BY BUILD/TEST**: the current-state build/typecheck success (all five command runs above, including a forced full-repo rebuild).
- **VERIFIED FROM REPOSITORY**: the git history tracing the original bug (commit `c09247e`) and its fix (commit `4796b7f`), and the confirmation that the current WhatsApp feature (`b97dd36`) doesn't touch `@medcal/notifications` beyond the already-working call.
- No INFERENCE or REQUIRES-BROWSER-TEST items in this report — every claim here was directly reproduced or read from source/history.
