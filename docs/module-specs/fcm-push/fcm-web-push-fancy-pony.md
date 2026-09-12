# FCM Web Push — Forensic Delivery Audit

**Scope:** Diagnosis only. No files modified, no fixes applied, no commits/deploys. This document is the deliverable — there is no code change to execute.

---

## 1. Verified Facts

**Given by user (production, already confirmed):**
- `Notification.permission === "granted"` in Chrome 151/Windows
- SW registered at `/firebase-messaging-sw.js`, reported "activated and running"
- Token POST → `201 Created`
- `POST /notifications/test` → `200 { success: true, messageId: "projects/pkm-fcm/messages/..." }`
- Tab was backgrounded during the test; no OS notification appeared after several minutes

**Found in repo (this audit):**

| Layer | Finding | File |
|---|---|---|
| Client init | Modular SDK, `initializeApp()` from 6 `NEXT_PUBLIC_FIREBASE_*` env vars, no `measurementId` | `apps/portal/src/lib/fcm/config.ts`, `messaging.ts:14-19` |
| Token fetch | `getToken(messaging, { vapidKey, serviceWorkerRegistration })` — registration object correctly threaded through, not implicit | `apps/portal/src/lib/fcm/messaging.ts:98-108` |
| SW registration | `navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' })` | `apps/portal/src/lib/fcm/messaging.ts:43-57` |
| SW source | **Not a static file** — a Next.js App Router route handler (`export const dynamic = "force-dynamic"`) that renders the SW body per-request, injecting env vars server-side | `apps/portal/src/app/firebase-messaging-sw.js/route.ts` |
| SW headers | `Content-Type: application/javascript; charset=utf-8`, `Cache-Control: no-store`, `Service-Worker-Allowed: /` — all correct | same file, lines 36-40 |
| SW SDK version | compat `12.18.0`, matches installed `firebase` npm package (`^12.18.0`) — no version drift | route.ts:8, `package.json:25` |
| SW handler | `onBackgroundMessage` implemented, calls `self.registration.showNotification(title, options)` — structurally correct | route.ts:25-32 |
| SW lifecycle | **No `self.skipWaiting()` and no `clients.claim()` anywhere in the SW** | route.ts (absent) |
| Foreground handler | **No `onMessage()` listener exists anywhere in the client code** (grep confirmed — only unrelated Socket.IO chat handlers share the name) | n/a |
| Competing SW | None — no next-pwa/Serwist/Workbox, no other `navigator.serviceWorker.register()` call in the repo, no static `public/sw.js` | repo-wide search |
| CSP | None configured anywhere (no `Content-Security-Policy` header in Next config, middleware, or nginx) | repo-wide search |
| Proxy exclusion | `apps/portal/src/proxy.ts` explicitly excludes `firebase-messaging-sw.js` from host-based rewrite, with a dedicated regression test | `proxy.ts:33-37`, `proxy.test.ts:18-19` |
| Production nginx | The only nginx config for `apps.kalibrasimedika.co.id` in-repo is `infra/nginx/apps.kalibrasimedika.co.id.conf.example`, explicitly commented **"PROPOSED — NOT YET APPLIED — not wired into any deploy script"** | `infra/nginx/apps.kalibrasimedika.co.id.conf.example` |
| Backend payload | `admin.messaging().send({ token, notification: { title, body } })` — **no `webpush`, `data`, `android`, or `apns` field**; `/notifications/test` never passes `data` | `packages/notifications/src/push/index.ts:98-105`, `notifications-test.controller.ts:69-72` |
| Admin SDK | `firebase-admin ^14.3.0`, initialized from `FIREBASE_SERVICE_ACCOUNT_JSON` env var | `packages/notifications/src/push/firebase-admin.ts:22-44` |
| Git history | Four of the last five commits on `main` are iterative fixes in exactly this area: `1fa2abf fix(portal): fix runtime cache permissions`, `f5cdcc5 fix(fcm): handle background web push notifications`, `deafcbb feat(fcm): add backend notification test endpoint`, `0a86cbe fix(fcm): bypass proxy for messaging service worker` | `git log` |

---

## 2. Receive-Path Diagram

```
Admin SDK .send()
  { token, notification:{title,body} }
        │
        ▼
FCM backend ── accepts, returns messageId  ✅ VERIFIED
        │
        ▼
Push service delivers to browser's push subscription
        │
        ▼
Browser dispatches `push` event to the ACTIVE service worker
  at scope "/" for this origin
        │
        ▼
[UNVERIFIED] Is the ACTIVE worker the one in the current
  repo source, or a stale prior version still controlling
  the page because skipWaiting()/clients.claim() are absent?
        │
        ▼
firebase-messaging-compat.js internal push listener
  → invokes onBackgroundMessage(payload)
        │
        ▼
self.registration.showNotification(title, options)
        │
        ▼
Windows Action Center / Chrome notification  ❌ NOT OBSERVED
```

Every node up through "FCM backend accepts" is confirmed working. Everything after "browser dispatches push event" is unverified from the browser side — the audit found no code-level defect in the current repo source, which shifts suspicion toward **what's actually running in the browser and in production**, not what's in the codebase.

---

## 3. Most Likely Failure Point

**A stale/prior service worker version is still the controller for the page, and it predates the fix that added `onBackgroundMessage`/`showNotification`.**

Evidence:
- The SW has no `self.skipWaiting()` and no `clients.claim()`. Per the standard SW lifecycle, a newly-fetched SW enters `installed` (waiting) state and will not activate until every open tab/client controlled by the old worker is fully closed (not just reloaded). If any Portal tab has been open continuously across deployments, the browser can report a worker as "activated and running" while it is actually an **old** worker — the user's verification step ("SW is activated and running") does not by itself prove *which source version* is active.
- Git history shows `f5cdcc5 fix(fcm): handle background web push notifications` as a **recent** commit — meaning a version of this SW existed *before* background-message handling was correct. If a browser session picked up the pre-fix worker and has never fully released it, it would still silently accept pushes and do nothing with them, exactly matching the symptom (200 OK from FCM, HTTP 200 in console, zero notification).
- `1fa2abf fix(portal): fix runtime cache permissions` (the most recent commit) suggests a caching-related issue was juggled very recently in the same delivery path — worth checking whether it fully resolved SW update propagation or only a symptom of it.

This hypothesis is the only one consistent with **all** verified facts simultaneously: it doesn't require any defect in the current repo code (which is structurally correct end-to-end), and it explains why a fix landed in git (`f5cdcc5`) without the production symptom necessarily going away yet (stale workers don't retroactively update themselves).

---

## 4. Evidence Supporting the Diagnosis

- SW registration/getToken wiring, headers, payload shape, and `onBackgroundMessage` body are all individually correct in the current source — ruling out the most common code-level causes.
- No competing service worker, no CSP restriction, no proxy interference (explicitly excluded and tested).
- The SW route is dynamically rendered per-request (`force-dynamic`, `Cache-Control: no-store`) specifically so env values aren't stale — but this protects the *config values* inside the SW script, not the *installed worker instance* in a given browser tab. These are two different staleness problems, and only the first was engineered against.
- The commit trail directly names this failure mode (`fix(fcm): handle background web push notifications`), meaning the team has already identified and patched a version of this exact bug — the open question is whether every already-registered browser (including the one used for the current test) has actually picked up the patched worker.

---

## 5. Alternative Hypotheses, Ranked

1. **(Most likely) Stale active SW predating the `onBackgroundMessage` fix** — see above.
2. **Production `apps.kalibrasimedika.co.id` is not actually routed to the Portal container the way the repo assumes.** The only nginx config in-repo for this host is explicitly marked "not yet applied." If the real deployed proxy differs (e.g., serves a cached/static copy of `firebase-messaging-sw.js`, or the request never reaches the Next.js route handler at all), the browser could be running a completely different SW body than what's in the repo. This is unverified and needs a direct `curl`/DevTools check against production, not repo inspection.
3. **Windows/Chrome notification suppression at the OS level** — Focus Assist, per-site "Quiet" notification setting in `chrome://settings/content/notifications`, or Windows notification settings for Chrome disabled/muted. Permission being `"granted"` at the Notification API level does not guarantee the OS actually surfaces the toast (Chrome can silently suppress into the notification tray/Action Center without an on-screen toast, which is easy to mistake for "nothing happened").
4. **Payload shape edge case** — sending only `notification` (no `webpush` block, no `data`) is valid and Firebase docs treat it as sufficient for background display via `onBackgroundMessage`. This is a low-probability cause given the SW code explicitly reads `payload.notification`, but it remains unverified whether the FCM backend's implicit web-push envelope (TTL/urgency defaults) is being silently dropped by the push service for this project — needs a raw payload capture, not code inspection.
5. **(Least likely) `firebase-admin` / compat SDK version mismatch causing a payload the SW can't parse** — versions are consistent (12.18.0 compat matches `^12.18.0` npm), so this is essentially ruled out by the audit.

---

## 6. Exact Browser-Side Checks To Perform

1. Open `chrome://serviceworker-internals/` (or DevTools → Application → Service Workers) on `apps.kalibrasimedika.co.id`, and check:
   - How many SW registrations exist for this origin/scope.
   - The registration's **Source** — click "Source" or inspect the running script text and diff it byte-for-byte against the current `route.ts` output (fetch `https://apps.kalibrasimedika.co.id/firebase-messaging-sw.js` directly in a new tab and compare).
   - Whether a worker is stuck in **"waiting to activate"** — if so, the active one is the old one.
2. In DevTools → Application → Service Workers, click **"Unregister"**, then hard-reload (Ctrl+Shift+R) and re-run the test. If notifications now appear, this confirms hypothesis #1.
3. Check `chrome://settings/content/notifications` for `apps.kalibrasimedika.co.id` — confirm it's not in a "quiet" / muted state distinct from the Notification API permission.
4. Check Windows Settings → System → Notifications, and confirm Chrome is allowed to show notifications, and Focus Assist is off.
5. In DevTools → Application → Service Workers → Push, use the "Push" test button (if available) to manually fire a synthetic push event at the currently active worker and observe whether `showNotification` fires — isolates "is the active worker's code broken" from "is FCM delivery broken."
6. With DevTools open and the SW's console selected (`Application → Service Workers → inspect`), re-run the backend test and check for **any exception logged** inside the worker before `showNotification` would run.

## 7. Exact Server-Side Checks To Perform

1. `curl -i https://apps.kalibrasimedika.co.id/firebase-messaging-sw.js` from an external host — confirm:
   - `Content-Type: application/javascript; charset=utf-8`
   - `Cache-Control: no-store`
   - `Service-Worker-Allowed: /`
   - Body matches `route.ts` exactly, with real (non-empty) Firebase config values substituted.
2. Confirm what actually terminates `apps.kalibrasimedika.co.id` in production right now (systemctl/nginx -T on the box, or the actual deployed nginx config — not the `.conf.example` file) and verify it proxies to the Portal container on port 3003 for this path, matching `infra/nginx/apps.kalibrasimedika.co.id.conf.example`'s intent.
3. Check for any CDN/edge layer (Cloudflare, etc.) in front of `apps.kalibrasimedika.co.id` that might cache `/firebase-messaging-sw.js` despite `Cache-Control: no-store` set by the origin (some edges cache-override or normalize headers) — this alone would explain browsers receiving a stale worker indefinitely.
4. Send a second test push with an explicit `data`-only payload (no `notification` key) via a one-off script (do not modify committed backend code) to see if `onBackgroundMessage` fires for pure data messages, isolating whether the problem is specific to the `notification`-payload path.

---

## 8. Is `onBackgroundMessage` Technically Correct?

**Yes**, as written in the repo today. It reads `payload.notification?.title`/`body`, falls back sensibly, and calls `self.registration.showNotification()` with a plain options object. There is no code path inside this handler that would throw before `showNotification` given the payload shape the backend actually sends. This function is not the bug — assuming the browser is actually running this version of the file.

(Side note, not the reported symptom but worth flagging: `apps/tech-pwa`'s equivalent SW never calls `onBackgroundMessage` at all — it relies entirely on implicit FCM auto-display. That's a separate app from Portal and not in scope for this symptom, but is an inconsistency worth a follow-up ticket.)

---

## 9. Does the Backend Payload Need Modification?

**Not required, but adding an explicit `webpush` block is the FCM-recommended pattern for Web and should be considered as a hardening/reliability improvement, not a fix for this specific symptom.**

Per current Firebase documentation, a bare `notification` payload is valid and sufficient for `onBackgroundMessage` to fire — the SW code correctly consumes it. However, Firebase's own Web Push guidance recommends adding a `webpush` field for finer control, specifically:
- `webpush.fcmOptions.link` — sets a default click-through URL (**absent entirely** right now; clicking the resulting notification, if it ever shows, likely does nothing).
- `webpush.headers.Urgency` / `TTL` — none set; browser/OS defaults apply, which is usually fine but is unverified for this push service.
- `webpush.notification` — an alternative to top-level `notification` that some teams use for stricter parity with browser Notification API options (icon, badge, actions), which the current payload doesn't set at all (no icon/badge configured anywhere).

None of these gaps explain a **total absence** of the notification — they're quality/UX gaps, not delivery blockers. They should not be the first thing tried; hypothesis #1 (stale SW) should be ruled out first via the DevTools check in §6.

---

## 10. Minimal Recommended Fix (NOT IMPLEMENTED)

In priority order, to be validated against the browser-side checks in §6 before any code changes:

1. **If §6 confirms a stale/waiting worker**: add `self.skipWaiting()` at the top of the SW script and `self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))`, so future deployments take control immediately instead of waiting for all tabs to close. This is the highest-confidence fix given the evidence.
2. **If §7.3 confirms an edge/CDN cache is overriding `Cache-Control: no-store`**: add cache-busting (e.g., a `?v=<deploy-hash>` query param on the registration URL, changed per release) so a new SW URL is always fetched, independent of any misbehaving intermediate cache.
3. **Regardless of root cause**: add a `webpush.fcmOptions.link` and consider `webpush.notification.icon` to the backend payload in `packages/notifications/src/push/index.ts`, since the notification currently has no click destination or icon once it does display.

No code was changed as part of this audit.
