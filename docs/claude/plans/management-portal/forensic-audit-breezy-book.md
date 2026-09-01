# Forensic Audit — Duplicate Sign-In / Double Auth Flow

**Mode: audit only. No code was modified. This file is a findings report, not an implementation plan.**

## Verdict

**Root cause = B** (session establishment/check happens twice), caused by a real timing race inside Better Auth's own client-side session store (`better-auth@1.6.27`), exposed by an app-level pattern gap: no component ever subscribes to `useSession()` until *after* the sign-in page has already navigated away.

Ruled out with code evidence:
- **A** — `signIn.email()` has exactly one call site per app (`apps/portal/src/app/sign-in/page.tsx:24`), gated by a single `onSubmit`, with `disabled={submitting}` set synchronously before the `await`. It cannot fire twice from one click.
- **E / F** — There is no server-side redirect anywhere in the flow. `apps/portal/src/proxy.ts` (Next 16's `middleware.ts` replacement) only does a `NextResponse.rewrite()` keyed on the `Host` header (`apps.*` → `/management`, `portal.*` → `/client`); it never redirects, has no auth awareness, and explicitly excludes `/sign-in` from its matcher. No `middleware.ts` exists anywhere in the repo.
- **G** — No `<React.StrictMode>` wrapper exists in any layout; `reactStrictMode` is not set in `next.config.js`. Not a Strict-Mode artifact.
- **D** (partially true, but downstream not root) — the login page itself doesn't remount or double-render; the *effect that appears to run twice* is one hop downstream, in the guard hook on the destination route.

## The actual mechanism

1. User submits the form → `apps/portal/src/app/sign-in/page.tsx:19-33` (`handleSubmit`):
   ```ts
   const { error: signInError } = await signIn.email({ email, password }); // line 24
   ...
   router.push("/");     // line 32
   router.refresh();     // line 33
   ```
   `signIn.email` is Better Auth's stock client (`packages/auth/src/client.ts`, no wrapping). The session cookie **is** set synchronously by the server response. Critically, **`page.tsx` never calls `useSession()`**, so Better Auth's client-side session store (a nanostores atom) has not been mounted yet at this point.

2. `router.push("/")` lands (after `proxy.ts` rewrites `/` → `/management` or `/client` based on hostname) on `apps/portal/src/app/management/layout.tsx`, which calls `useRequireSession()` (`apps/portal/src/lib/use-require-session.ts`). This is the **first-ever mount** of `useSession()` for this page load.

3. Better Auth's session atom `onMount` (`better-auth` internals, `dist/client/session-atom.mjs:117-135`) does two independent things simultaneously:
   - `setTimeout(() => fetchSessionOnMount(), 0)` — fetch **A** to `/get-session`.
   - Wires up a subscription to `$sessionSignal`, which the *earlier* `signIn.email()` call had already scheduled to flip via `setTimeout(() => signal.set(!val), 10)` (`dist/client/proxy.mjs:29-71`) — this fires fetch **B**.

   Because the signal subscription didn't exist until step 2, that 10ms-delayed flip from the *sign-in* call only gets picked up now, racing against the mount-triggered fetch. `fetchSession()` cancels any in-flight request when a new one starts (`activeRequest?.cancel()`), so A and B produce **two back-to-back pending/resolved transitions** on the shared `session` value.

4. `useRequireSession`'s effect (`use-require-session.ts:31-58`) depends on `[isPending, session, router]`, so it **re-runs on each transition**: each run re-evaluates `if (!session) router.replace("/sign-in")` against a transiently stale value and re-fires `apiFetch("/me")`. This produces the observed symptom — the guard's loading/redirect/ready cycle visibly runs twice before settling on the dashboard, which reads to the user as "sign-in happened twice."

## Files and exact call sites involved

| Step | File:Line | What happens |
|---|---|---|
| Submit | `apps/portal/src/app/sign-in/page.tsx:19-33` | `handleSubmit`: single `signIn.email()` call, then `router.push("/")` + `router.refresh()` |
| Auth client | `packages/auth/src/client.ts` | Bare `createAuthClient({ baseURL })`, no plugins/interceptors |
| Auth server | `packages/auth/src/index.ts:51-71` | Default Better Auth session/cookie config, no custom hooks affecting timing |
| Rewrite (not redirect) | `apps/portal/src/proxy.ts` | Host-based `NextResponse.rewrite()` only; excludes `/sign-in`; not implicated |
| Guard hook (the effect that "runs twice") | `apps/portal/src/lib/use-require-session.ts:31-58` | `useEffect` on `[isPending, session, router]`; calls `router.replace("/sign-in")` if session looks absent, else fetches `/me` |
| Consumer of guard | `apps/portal/src/app/management/layout.tsx` (and `client/layout.tsx`) | First component to ever call `useSession()` this page load — this is where Better Auth's session atom mounts |
| Better Auth internals (vendor, not app code) | `node_modules/.pnpm/better-auth@1.6.27/.../dist/client/session-atom.mjs:117-135`, `dist/client/proxy.mjs:29-71` | `onMount` fetch + 10ms-delayed signal flip from the prior sign-in mutation race each other |

Same pattern is duplicated verbatim in `apps/tech-pwa` (`sign-in/page.tsx`, `lib/use-require-session.ts`) — it has a real `app/page.tsx` at root so the rewrite step doesn't apply there, but the session-atom race is identical.

## Not root cause, but worth noting separately

- `page.tsx:24` has no `try/catch` around `await signIn.email(...)`. If the call throws (vs. returning Better Auth's normal `{ error }` shape), `setSubmitting(false)` is skipped and the submit button stays disabled permanently. Latent bug, unrelated to the double-flow symptom.
- No dedupe/guard exists against a genuine second manual click once `submitting` resets to `false` (line 26) and before navigation visually completes — a secondary contributor if the user perceives no immediate feedback, but not the primary mechanism given the race above fully explains the symptom on its own.

## Confidence

High. The mechanism is reconstructed from actual app code (`page.tsx`, `use-require-session.ts`, `proxy.ts`) plus the installed `better-auth@1.6.27` vendor source (`session-atom.mjs`, `proxy.mjs`), not speculation. The key structural fact — no component calls `useSession()` before the sign-in page navigates away — is directly verifiable and is what causes the atom's `onMount` fetch and the sign-in mutation's delayed signal flip to race for the first time only after redirect, on the guarded route.

No fix has been proposed or implemented, per audit-only scope.
