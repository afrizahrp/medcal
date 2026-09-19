# FCM Forensic Comparison Report
## server-bi-erp (Proven Working) vs MedCal

**Audit type:** Read-only forensic comparison  
**Date:** 2026-08-21  
**Reference implementation:** `D:\bi-erp\server-bi-erp` + `D:\bi-erp\easy-app`  
**Target:** `D:\medcal`  
**Symptom:** MedCal backend returns `messageId` (FCM accepts) but browser notification does not appear.

---

## 1. Executive Verdict

MedCal's FCM backend send path is structurally valid and returns `messageId`, confirming Firebase Admin → FCM delivery succeeds. Compared to the proven working server-bi-erp implementation, the **first material divergence** is not backend payload construction but the **browser receive path**: MedCal's service worker lacks `skipWaiting()` / `clients.claim()` and depends entirely on `onBackgroundMessage` → `showNotification()`, while server-bi-erp aggressively activates SW updates and, when `payload.notification` is present, **relies on FCM/browser automatic notification display** instead of manual `showNotification()`. MedCal git history shows `onBackgroundMessage` was added only recently (`f5cdcc5`), making a **stale active service worker** the leading evidence-backed explanation for the symptom. Backend payload differences (missing `data`, `fcmOptions.link`, icon) are real versus bi-erp but are **unlikely to cause total delivery failure** given both systems send top-level `notification` + `webpush.notification`. Production infrastructure for MedCal remains **unverified** (nginx config in-repo marked "NOT YET APPLIED"). **Verdict: YELLOW** — root cause is plausibly identified; runtime confirmation required before code changes.

---

## 2. Proven Working Implementation — server-bi-erp

### Architecture

server-bi-erp is a NestJS backend; the browser client lives in the separate Next.js app **`D:\bi-erp\easy-app`**. FCM is active end-to-end across both repos.

```
Browser (easy-app)
  NotificationManager (ChatPIC only)
    → register SW /firebase-messaging-sw.js scope /
    → getToken(vapidKey)  [no explicit serviceWorkerRegistration]
    → POST /fcm/token (JWT Bearer)

Backend (server-bi-erp)
  POST /fcm/test
    → sendNotificationToUser(userId)
    → getUserTokens(userId) from DB
    → sendEachForMulticast(MulticastMessage)

FCM → Push service → Browser SW → notification
```

### Evidence: FACT vs INFERENCE vs UNKNOWN

| Claim | Classification | Source |
|-------|----------------|--------|
| Backend sends FCM via `sendEachForMulticast()` | **FACT** | `src/fcm/fcm.service.ts:233` |
| Message includes top-level `notification`, `data`, `webpush.notification`, `webpush.fcmOptions.link` | **FACT** | `fcm.service.ts:199-222` |
| Production chat/contact triggers call FCM with `ENABLE_FCM_NOTIFICATION = true` | **FACT** | `chat.service.ts`, `contactmessage.service.ts` |
| Documented expected logs: `2 succeeded, 0 failed`, `notificationsSent: 2` | **FACT** | `DEBUGGING_STEPS.md` |
| Browser actually receives and displays notifications in production | **INFERENCE** | Docs + trigger code exist; no automated e2e test |
| Exact Firebase Console payload for a live message | **UNKNOWN** | Not captured in repo |

### Test notification trace (`POST /fcm/test`)

1. **Trigger:** `fcm.controller.ts:74-94` — JWT auth, `userId = req.user.id`
2. **Payload construction:** Hardcoded title/body/icon/badge/clickAction + `data: { type: 'test', url: '/dashboard' }`
3. **Token lookup:** `getUserTokens(userId)` — all active tokens for user from DB
4. **Message build:** `sendNotificationToUser()` builds full MulticastMessage (see §5)
5. **Send:** `admin.messaging().sendEachForMulticast(message)`
6. **Receive:** Static SW at `easy-app/public/firebase-messaging-sw.js`
7. **Display:** `onBackgroundMessage` runs; if `payload.notification` present → **skips** manual `showNotification()` (relies on auto-display); forwards to focused clients via `postMessage`

### Key files

| Layer | Path |
|-------|------|
| Backend service | `D:\bi-erp\server-bi-erp\src\fcm\fcm.service.ts` |
| Backend controller | `D:\bi-erp\server-bi-erp\src\fcm\fcm.controller.ts` |
| Service worker | `D:\bi-erp\easy-app\public\firebase-messaging-sw.js` |
| Client manager | `D:\bi-erp\easy-app\lib\fcm-manager.ts` |
| SW registration | `D:\bi-erp\easy-app\components\notification-manager.tsx` |
| Package versions | `firebase-admin ^13.5.0` (server), `firebase ^12.4.0` (client) |
| Firebase project | `bumiindah-app` |

---

## 3. MedCal Current Implementation

### Architecture

```
Browser (apps/portal)
  usePushNotifications (header menu, manual enable)
    → register SW /firebase-messaging-sw.js scope /
    → getToken(vapidKey, serviceWorkerRegistration)
    → POST /notifications/push-tokens (session cookie)

Backend (apps/api via packages/notifications)
  POST /notifications/test
    → push.sendPush({ token, notification })
    → messaging.send(Message)

FCM → Push service → Browser SW → onBackgroundMessage → showNotification()
```

### Test notification trace (`POST /notifications/test`)

1. **Trigger:** `notifications-test.controller.ts:52-72` — `CompanyRoleGuard` + `notification:test` permission (SUPERADMIN default)
2. **Token source:** **From request body** `{ token, title, body }` — not DB lookup
3. **Send:** `push.sendPush()` → `messaging.send(Message)` (single token)
4. **Receive:** Dynamic SW from `apps/portal/src/app/firebase-messaging-sw.js/route.ts`
5. **Display:** `onBackgroundMessage` **always** calls `self.registration.showNotification(title, options)`
6. **Foreground:** No `onMessage()` listener — tab-focused tests show nothing

### Key files

| Layer | Path |
|-------|------|
| Backend send | `packages/notifications/src/push/index.ts` |
| Admin init | `packages/notifications/src/push/firebase-admin.ts` |
| Test endpoint | `apps/api/src/modules/push-tokens/notifications-test.controller.ts` |
| Token service | `apps/api/src/modules/push-tokens/push-tokens.service.ts` |
| Client FCM | `apps/portal/src/lib/fcm/messaging.ts`, `register.ts`, `use-push-notifications.ts` |
| Service worker | `apps/portal/src/app/firebase-messaging-sw.js/route.ts` |
| Proxy exclusion | `apps/portal/src/proxy.ts` |
| Package versions | `firebase-admin ^14.3.0`, `firebase ^12.18.0` |
| Firebase project | `pkm-fcm` (from user-reported messageId) |

### Update vs prior internal audit

Commit `76914ae fix(fcm): add explicit web push notification payload` added the `webpush.notification` block to `sendPush()`. The prior audit [`docs/claude/FCM/fcm-web-push-fancy-pony.md`](../../claude/FCM/fcm-web-push-fancy-pony.md) noted backend sent only top-level `notification`; **that finding is now outdated** for current `main`.

---

## 4. Side-by-Side Comparison

| Area | server-bi-erp | MedCal | Difference | Relevance | Evidence |
|------|---------------|--------|------------|-----------|----------|
| **Firebase Web SDK version** | `^12.4.0` (modular) | `^12.18.0` (modular) | Minor version bump | Likely irrelevant | package.json both repos |
| **SW compat SDK version** | **10.7.1** (CDN) | **12.18.0** (CDN, aligned) | Major mismatch (bi-erp only) | Unknown — bi-erp works despite mismatch | SW source files |
| **SDK style** | Modular client + compat SW | Modular client + compat SW | Same pattern | Identical pattern | code inspection |
| **Firebase init (client)** | `lib/firebase-config.ts` | `apps/portal/src/lib/fcm/config.ts` (env vars) | MedCal env-only, no hardcoded fallback | Likely irrelevant if env set | config files |
| **VAPID key source** | `NEXT_PUBLIC_FIREBASE_VAPID_KEY` + hardcoded fallback | `NEXT_PUBLIC_FIREBASE_VAPID_KEY` env-only | bi-erp has fallback | Likely irrelevant if env set | fcm-manager.ts vs config.ts |
| **`isSupported()` check** | Not explicit in getToken path | Yes, before getToken | MedCal more defensive | Likely irrelevant | messaging.ts |
| **`getToken()` options** | `{ vapidKey }` only | `{ vapidKey, serviceWorkerRegistration }` | MedCal passes explicit registration | Likely irrelevant (MedCal is more explicit) | messaging.ts vs fcm-manager.ts |
| **SW registration path** | `/firebase-messaging-sw.js` | `/firebase-messaging-sw.js` | Same | Identical | both clients |
| **SW scope** | `/` | `/` | Same | Identical | both clients |
| **SW updateViaCache** | `none` (bi-erp) | Not set (browser default) | bi-erp disables cache | Possibly relevant | notification-manager.tsx |
| **SW file delivery** | Static `/public/firebase-messaging-sw.js` | Dynamic Next.js App Router route | Static vs dynamic | Requires runtime verification | route.ts vs public file |
| **SW hardcoded config** | Yes (apiKey etc. in SW file) | Injected from env at request time | Different | Likely irrelevant if prod env correct | SW sources |
| **`onBackgroundMessage`** | Yes | Yes | Both have handler | Identical capability | SW sources |
| **SW display logic** | Skip `showNotification` if `payload.notification` present | Always `showNotification()` | **Opposite strategies** | **Likely relevant** — see §9 | SW lines 136-148 vs route.ts:25-31 |
| **`skipWaiting()`** | Yes (install + message handler) | **No** | Missing in MedCal | **Likely relevant** | SW lifecycle |
| **`clients.claim()`** | Yes (activate handler) | **No** | Missing in MedCal | **Likely relevant** | SW lifecycle |
| **SW update forcing (client)** | postMessage `SKIP_WAITING` to waiting worker | **No** | Missing in MedCal | **Likely relevant** | notification-manager.tsx |
| **`notificationclick` handler** | Yes (navigate/openWindow) | **No** | MedCal missing | Irrelevant for display symptom | SW sources |
| **Foreground `onMessage`** | Yes (toast only, no showNotification) | **No** | MedCal missing | Relevant only if tab foreground | fcm-manager.ts |
| **firebase-admin version** | `^13.5.0` | `^14.3.0` | Different major | Likely irrelevant (both return messageId) | package.json |
| **Admin credential source** | File path `FIREBASE_SERVICE_ACCOUNT_PATH` | Env JSON `FIREBASE_SERVICE_ACCOUNT_JSON` | Different mechanism | Irrelevant for symptom | init code |
| **Send API** | `sendEachForMulticast()` | `messaging.send()` | Different API, same FCM | Likely irrelevant | fcm.service.ts vs index.ts |
| **Top-level `notification`** | Yes | Yes | Same | Identical | both backends |
| **`data` payload** | Always (stringified) | Optional; **not in /notifications/test** | MedCal test omits data | Likely irrelevant for basic display | send code |
| **`webpush.notification`** | Yes (rich: icon, badge, tag, vibrate, data) | Yes (title/body only) | MedCal minimal | Likely irrelevant for display | send code |
| **`webpush.fcmOptions.link`** | Yes | **No** | Missing in MedCal | Irrelevant for display (click UX) | send code |
| **TTL / Urgency headers** | Not set | Not set | Same | Identical | both backends |
| **Test endpoint token source** | DB lookup by authenticated `userId` | Token from request body | **Structurally different** | Requires verification — wrong token possible | controllers |
| **Token registration auth** | JWT Bearer | Session cookie + CompanyRoleGuard | Different auth | Irrelevant if token valid | controllers |
| **Multi-tenant** | ChatPIC + company_id filter | companyId + userId in schema | Different model | Irrelevant for test endpoint | schemas |
| **Stale token cleanup** | Deactivate on invalid FCM error | Deactivate on invalid FCM error | Same | Identical | both services |
| **Proxy SW exclusion** | N/A (no host rewrite) | Yes, tested in proxy.test.ts | MedCal-specific | Correct in repo | proxy.ts |
| **Nginx prod config** | Deployed (apps.bumiindah.co.id) | Example only, "NOT YET APPLIED" | **Unknown prod routing** | Requires runtime verification | nginx examples |
| **Competing SW** | Legacy sw-handlers.js exists but separate | None found | bi-erp has legacy | Not affecting MedCal | repo search |

---

## 5. Exact FCM Message Comparison

### server-bi-erp — test notification (`POST /fcm/test`)

Effective object passed to `sendEachForMulticast()` (redacted):

```ts
// SERVER-BI-ERP (redacted)
{
  notification: {
    title: "🔔 Test Notification",
    body: "Ini adalah test notification dari Bumi Indah App!",
  },
  data: {
    type: "test",
    url: "/dashboard",
    clickAction: "/dashboard",
  },
  webpush: {
    notification: {
      title: "🔔 Test Notification",
      body: "Ini adalah test notification dari Bumi Indah App!",
      icon: "https://apps.bumiindah.co.id/icons/icon-192x192.png",
      badge: "https://apps.bumiindah.co.id/icons/icon-96x96.png",
      requireInteraction: true,
      vibrate: [200, 100, 200],
      tag: "fcm-message",
      data: { type: "test", url: "/dashboard", clickAction: "/dashboard" },
    },
    fcmOptions: {
      link: "/dashboard",
    },
  },
  tokens: ["<fcm-token-from-db-1>", "<fcm-token-from-db-2>"],
}
```

### MedCal — test notification (`POST /notifications/test`)

Effective object passed to `messaging.send()` (redacted):

```ts
// MEDCAL (redacted)
{
  token: "<fcm-token-from-request-body>",
  notification: {
    title: "<from request>",
    body: "<from request>",
  },
  webpush: {
    notification: {
      title: "<from request>",
      body: "<from request>",
    },
  },
  // no data field in /notifications/test
  // no webpush.fcmOptions.link
  // no icon, badge, tag, vibrate
}
```

### Differences summary

| Field | server-bi-erp | MedCal |
|-------|---------------|--------|
| `token` vs `tokens` | Array via multicast | Single token |
| `data` | Always present | Absent in test |
| `webpush.notification.icon/badge/tag/vibrate` | Present | Absent |
| `webpush.fcmOptions.link` | Present | Absent |
| Token source | DB lookup | Request body |

**Assessment:** MedCal's payload is a **subset** of bi-erp's. Both include the minimum fields Firebase docs cite for web notification display (`notification` + `webpush.notification`). Missing fields affect UX (click target, icon) not FCM acceptance — confirmed by MedCal's successful `messageId`.

---

## 6. Exact Service Worker Comparison

### server-bi-erp receive path

```
FCM push event
  → firebase-messaging-compat.js (v10.7.1)
  → messaging.onBackgroundMessage(payload)
  → if payload.notification:
       SKIP self.registration.showNotification()  ← relies on auto-display
     else:
       self.registration.showNotification(...)
  → if focused client: postMessage({ type: 'FCM_MESSAGE', payload })
```

Relevant code (`easy-app/public/firebase-messaging-sw.js`):

```js
messaging.onBackgroundMessage(async (payload) => {
  // ... duplicate guard, URL routing ...
  if (!payload.notification) {
    await self.registration.showNotification(notificationTitle, notificationOptions);
  } else {
    // Skipping manual show; payload.notification present (auto by browser/FCM)
  }
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
```

### MedCal receive path

```
FCM push event
  → firebase-messaging-compat.js (v12.18.0)
  → messaging.onBackgroundMessage(payload)
  → ALWAYS self.registration.showNotification(title, options)
  → no notificationclick handler
  → no skipWaiting / clients.claim
```

Relevant code (`apps/portal/src/app/firebase-messaging-sw.js/route.ts` generated body):

```js
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "MedCal";
  const options = {
    body: payload.notification?.body || "",
    data: payload.data || {},
  };
  return self.registration.showNotification(title, options);
});
```

### Critical SW difference

| Behavior | server-bi-erp | MedCal |
|----------|---------------|--------|
| Background display strategy | **Auto-display** when `notification` in payload; manual only for data-only | **Always manual** `showNotification()` |
| SW activation | Immediate via `skipWaiting` + `claim` | Standard lifecycle — old worker may persist |
| Client-side SW update | Forces `SKIP_WAITING` on waiting worker | No equivalent |

**Implication:** server-bi-erp can display notifications even if `onBackgroundMessage` body is bypassed or minimal, because FCM may auto-render `notification` payloads on web. MedCal **requires** `onBackgroundMessage` to execute `showNotification()`. A stale SW without this handler → push accepted by FCM, zero visible notification — **exact MedCal symptom**.

---

## 7. Token Lifecycle Comparison

### Generation → Registration → Storage → Send

| Step | server-bi-erp | MedCal |
|------|---------------|--------|
| **Permission** | `Notification.requestPermission()` in fcm-manager | `permission.ts` + manual `enable()` in UI |
| **Who registers** | ChatPIC users only (`useIsChatPIC()`) | Any authenticated user via header menu |
| **getToken** | `{ vapidKey }` | `{ vapidKey, serviceWorkerRegistration }` |
| **Register API** | `POST /fcm/token` (JWT) | `POST /notifications/push-tokens` (cookie) |
| **Client body** | `{ token, deviceType, userAgent, deviceInfo }` | `{ token, deviceType, app: "PORTAL" }` |
| **Server derives user** | `req.user.id` from JWT | `userId`, `companyId` from session guard |
| **DB schema** | `FCMToken { userId Int, token unique, isActive }` | `FCMToken { userId String, companyId, app PushApp, token unique, isActive }` |
| **Upsert** | Update if token exists; multi-device allowed | Create or reactivate; conflict if token owned by other user |
| **Dedup (client)** | localStorage lock + 24h re-register | sessionStorage last token |
| **Send token selection** | DB lookup all active tokens for userId | Test: token from body; production send not yet wired |
| **Invalid token handling** | `isActive: false` on FCM error | `deactivateByToken()` on FCM error |
| **Stale token cleanup** | `cleanupOldTokens(daysOld=30)` method exists | No scheduled cleanup |

### Test endpoint structural difference

- **bi-erp:** Cannot send to arbitrary token — always uses tokens registered to authenticated user in DB
- **MedCal:** Accepts any token string in body (permission-gated) — enables testing but allows token mismatch if caller pastes wrong/stale token

**Relevance:** If MedCal test uses a token that doesn't match the active SW registration (e.g., copied from another browser session), FCM would still accept (token valid for project) but delivery goes to wrong push subscription. **UNKNOWN** — user reports valid registered token.

---

## 8. Runtime / Production Infrastructure Comparison

| Aspect | server-bi-erp / easy-app | MedCal |
|--------|--------------------------|--------|
| **Frontend URL** | `https://apps.bumiindah.co.id` | `https://apps.kalibrasimedika.co.id` |
| **SW URL** | Static: `/firebase-messaging-sw.js` | Dynamic route: same path |
| **SW headers** | Static file (CDN/nginx default) | `Content-Type: application/javascript`, `Cache-Control: no-store`, `Service-Worker-Allowed: /` |
| **Host-based rewrite** | None | `proxy.ts` rewrites to `/management/*` or `/client/*`; SW excluded |
| **Docker Firebase vars** | Not inspected in this audit | Build args for `NEXT_PUBLIC_FIREBASE_*` in `docker-compose.prod.yml` |
| **API Firebase vars** | File path to service account JSON | `FIREBASE_SERVICE_ACCOUNT_JSON` in `.env.production` |
| **Nginx config in repo** | Not compared | `infra/nginx/apps.kalibrasimedika.co.id.conf.example` — **"NOT YET APPLIED"** |
| **HTTPS** | Production HTTPS | Production HTTPS (user tested) |
| **CDN / Cloudflare** | Unknown | Unknown |

**Gap:** MedCal production nginx routing and SW body at runtime are **unverified**. Repo code is correct; deployed state may differ.

---

## 9. First Material Divergence

**FIRST DIVERGENCE: Service Worker lifecycle and display strategy**

At the layer where server-bi-erp and MedCal first differ in a way that plausibly explains "FCM accepts, browser silent":

1. **MedCal requires an active SW with `onBackgroundMessage` → `showNotification()`** — no fallback to auto-display, no `skipWaiting`/`clients.claim` to guarantee the latest SW controls the page.

2. **server-bi-erp uses `skipWaiting` + `clients.claim` + client-side `SKIP_WAITING`** to ensure current SW is active, and when `payload.notification` is present, **defers to FCM/browser automatic notification display** rather than manual `showNotification()`.

3. **MedCal git history:** `f5cdcc5 fix(fcm): handle background web push notifications` added the handler recently. Browsers that registered a pre-fix SW (without handler) can remain controller indefinitely — FCM returns `messageId`, push arrives, old SW does nothing.

This divergence precedes payload shape differences in causal importance: even a perfect bi-erp payload would fail on MedCal if the active SW never invokes `showNotification()`.

---

## 10. Root Cause Ranking

Evidence-backed hypotheses only, ranked:

| Rank | Hypothesis | Evidence | Confidence |
|------|-----------|----------|------------|
| **1** | Stale active SW predating `onBackgroundMessage` fix; no `skipWaiting`/`claim` | MedCal SW lacks lifecycle handlers; git `f5cdcc5`; prior audit `fcm-web-push-fancy-pony.md`; bi-erp has opposite pattern and works | **High** (pending runtime confirm) |
| **2** | Production SW body/routing differs from repo (nginx/CDN/cache) | Nginx example "NOT YET APPLIED"; dynamic SW depends on env injection | **Medium** (unverified) |
| **3** | OS/browser notification suppression (Focus Assist, Quiet notifications) | User reports permission granted + background tab; OS settings unverified | **Medium** |
| **4** | Test used foreground tab (no `onMessage` in MedCal) | MedCal has no foreground handler; user claims background | **Low** (contradicted by user) |
| **5** | Backend payload too minimal (no data/icon/fcmOptions) | Both have `notification` + `webpush.notification`; FCM accepts | **Low** |
| **6** | firebase-admin 14.x vs 13.x behavioral difference | Both return messageId | **Very low** |
| **7** | Token mismatch (body token ≠ active SW subscription) | MedCal test accepts body token; user claims valid token | **Low** (unverified) |

---

## 11. Minimal Experiment

Execute in order; stop when hypothesis confirmed.

### Experiment A — Stale SW (decisive, ~5 min)

1. Open `apps.kalibrasimedika.co.id` in Chrome
2. DevTools → Application → Service Workers → **Unregister**
3. Hard reload (Ctrl+Shift+R)
4. Re-enable push notifications in header menu (re-register token)
5. Background the tab
6. `POST /notifications/test` with new token

**Expected if hypothesis #1 correct:** Notification appears immediately.

### Experiment B — SW source verification (~2 min)

```bash
curl -i https://apps.kalibrasimedika.co.id/firebase-messaging-sw.js
```

Verify: correct headers, body contains `onBackgroundMessage` and `showNotification`, Firebase config values non-empty.

Also check `chrome://serviceworker-internals/` — any worker "waiting to activate"?

### Experiment C — SW console during push (~3 min)

1. DevTools → Application → Service Workers → **Inspect** active worker
2. Background tab, send test push
3. Watch SW console for `onBackgroundMessage` logs or exceptions

**Expected if handler never runs:** No logs, no notification.

### Experiment D — Payload parity with bi-erp (only if A fails)

One-off script (not committed) calling Firebase Admin with bi-erp-shaped payload to same MedCal token:

```ts
{
  token: "<medcal-token>",
  notification: { title: "Test", body: "Payload parity" },
  data: { type: "test", url: "/management", clickAction: "/management" },
  webpush: {
    notification: {
      title: "Test", body: "Payload parity",
      icon: "https://apps.kalibrasimedika.co.id/favicon.ico",
      tag: "test-parity",
    },
    fcmOptions: { link: "/management" },
  },
}
```

**Expected:** If notification appears → payload gap was causal (unlikely given rank #5). If still silent → receive path confirmed as root cause.

---

## 12. Recommended Fix

**Do not implement until Experiment A confirms stale SW.**

If Experiment A succeeds (notification appears after unregister):

1. Add to MedCal SW route body (mirror bi-erp):
   - `self.addEventListener('install', () => self.skipWaiting())`
   - `self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))`
   - Optional: message handler for `SKIP_WAITING` from client

2. Add client-side SW update forcing in `messaging.ts` or `use-push-notifications.ts`:
   - After `register()`, if `registration.waiting`, postMessage `{ type: 'SKIP_WAITING' }`

3. **Optional hardening** (not required for display, improves parity with bi-erp):
   - Extend `sendPush()` / test endpoint to include `data`, `webpush.fcmOptions.link`, icon URLs
   - Add foreground `onMessage()` toast for tab-active scenarios

4. **Do not** rewrite FCM architecture, change auth/RBAC, or add random payload fields without experiment evidence.

If Experiment A fails AND Experiment B shows prod SW differs from repo → fix deploy/nginx/CDN first.

---

## 13. Files That Would Need Modification

Only if Experiment A confirms stale SW fix:

| File | Change |
|------|--------|
| [`apps/portal/src/app/firebase-messaging-sw.js/route.ts`](../../apps/portal/src/app/firebase-messaging-sw.js/route.ts) | Add `skipWaiting`, `clients.claim`, optional message handler |
| [`apps/portal/src/lib/fcm/messaging.ts`](../../apps/portal/src/lib/fcm/messaging.ts) | Post `SKIP_WAITING` to waiting worker after registration |

Optional hardening (separate PR):

| File | Change |
|------|--------|
| [`packages/notifications/src/push/index.ts`](../../packages/notifications/src/push/index.ts) | Add `data`, `fcmOptions.link`, icon to match bi-erp pattern |
| [`apps/portal/src/lib/fcm/messaging.ts`](../../apps/portal/src/lib/fcm/messaging.ts) | Add foreground `onMessage()` listener |

---

## 14. Files That Must Remain Untouched

- `packages/auth/` — RBAC, permissions, access control
- Lead / acquisition business logic
- `CompanyRoleGuard` and session auth flow
- `apps/portal/src/proxy.ts` — already correctly excludes SW (has regression test)
- Prisma schema / migrations (no schema change needed for SW fix)
- `apps/tech-pwa/` — separate app; out of scope unless explicitly requested

---

## 15. Final Verdict

```text
YELLOW
```

**Rationale:** MedCal backend FCM send is proven working (`messageId` returned). Code-level receive path in current repo is structurally correct. The proven working server-bi-erp differs materially in SW lifecycle management and display fallback strategy. Stale service worker is the leading evidence-backed root cause, consistent with both this comparison and MedCal's prior internal audit — but **runtime verification (Experiment A) has not been executed in this audit**. No code changes recommended until experiment confirms.

---

## Appendix A: High-Value Comparison Questions (Q1–Q20)

| # | Question | server-bi-erp | MedCal |
|---|----------|---------------|--------|
| Q1 | Uses `webpush.notification`? | **Yes** (rich) | **Yes** (minimal) |
| Q2 | Uses top-level `notification`? | **Yes** | **Yes** |
| Q3 | Uses both? | **Yes** | **Yes** |
| Q4 | Uses `data`? | **Yes** (always) | **Optional**; not in test |
| Q5 | Uses `webpush.fcmOptions.link`? | **Yes** | **No** |
| Q6 | Custom TTL/Urgency? | **No** | **No** |
| Q7 | Same firebase-admin major version? | **No** (13.x vs 14.x) | 14.x |
| Q8 | Same Firebase Web SDK major version? | **No** (12.4 vs 12.18) | 12.18 |
| Q9 | Compat or modular Web SDK? | **Both** (modular client, compat SW) | **Both** |
| Q10 | SW uses `onBackgroundMessage()`? | **Yes** | **Yes** |
| Q11 | Explicitly calls `showNotification()`? | **Only when no `payload.notification`** | **Always** |
| Q12 | Relies on FCM automatic display? | **Yes** (when notification present) | **No** |
| Q13 | Uses `skipWaiting()` or `clients.claim()`? | **Yes, both** | **No** |
| Q14 | Ensures current SW in browser? | skipWaiting + claim + client SKIP_WAITING postMessage | **No mechanism** |
| Q15 | How is FCM token obtained? | `getToken(messaging, { vapidKey })` | `getToken(messaging, { vapidKey, serviceWorkerRegistration })` |
| Q16 | How is token stored? | `FCMToken` table, upsert by token string | `FCMToken` table with companyId + app enum |
| Q17 | How is token chosen when sending? | DB lookup all active for userId | Test: from request body |
| Q18 | Accepts token directly from API body? | **No** (test uses userId → DB) | **Yes** (`/notifications/test`) |
| Q19 | Sends using DB token lookup? | **Yes** (production + test) | **No** (test); registration stores but test bypasses |
| Q20 | Could MedCal test endpoint differ structurally? | **Yes** — different token source and payload richness | — |

---

## Appendix B: Answer to Final Question

> **What does server-bi-erp do differently from MedCal that explains why its FCM notification actually appears in the browser while MedCal's backend message is accepted by FCM but never appears?**

server-bi-erp **guarantees the latest service worker is active** (`skipWaiting`, `clients.claim`, client-side update forcing) and **relies on FCM automatic notification rendering** when the payload includes a top-level `notification` field — so background delivery can succeed even with minimal handler logic. MedCal **depends entirely on a manually invoked `showNotification()` inside `onBackgroundMessage`**, but provides **no mechanism to replace stale service workers** after recent handler fixes landed in git. The most plausible explanation is that MedCal browsers are still controlled by a pre-fix service worker that silently consumes push events without displaying notifications, while FCM correctly reports delivery success via `messageId`.

---

## Appendix C: Security Audit (Comparative)

| Concern | server-bi-erp | MedCal | Assessment |
|---------|---------------|--------|------------|
| **Service account storage** | JSON file on disk (`FIREBASE_SERVICE_ACCOUNT_PATH`) | JSON string in env (`FIREBASE_SERVICE_ACCOUNT_JSON`) | MedCal slightly better (no file on disk); both server-only |
| **Frontend credential exposure** | SW hardcodes public Firebase config (apiKey etc.) | SW injects from env at runtime; no Admin creds | Both correct — only public web config in SW |
| **VAPID key fallback** | Hardcoded fallback in `fcm-manager.ts` if env missing | Env-only; fails closed if missing | MedCal safer; bi-erp fallback is a leak risk if committed |
| **Token in logs** | Debug logs include token length; partial on delete | `sendPush` redacts tokens (`abc12345...wxyz`) | MedCal better |
| **Test endpoint token auth** | JWT + sends only to own DB tokens | Session + `notification:test` permission + **accepts arbitrary token in body** | MedCal allows targeted send to any known token — acceptable for SUPERADMIN test but higher abuse surface |
| **Cross-user targeting** | Test uses own userId → own tokens only | Body token could target another user's subscription if attacker has token string + permission | MedCal: mitigate by permission gate; bi-erp: structurally safer |
| **Tenant isolation** | ChatPIC + company_id filter on broadcast | `companyId` + `userId` on FCMToken; ownership enforced on register/revoke | MedCal stronger multi-tenant model |
| **Token ownership on register** | Upsert allows userId change on existing token | **Conflict** if token owned by different user | MedCal stronger — prevents token hijack |
| **Public webhooks** | `/chat/sessions/notify`, `/chat/messages/notify` unauthenticated | None | bi-erp higher attack surface on notify endpoints |
| **Sensitive payload in push** | Sends messageId, type in data | Test sends title/body only | Both should avoid secrets in payload; MedCal doc recommends fetch-on-click |
| **Arbitrary-token sending (prod)** | `POST /fcm/send` accepts userId (JWT required) | Production broadcast not yet wired | N/A for current symptom |

**Recommendation:** Do not weaken MedCal security for testing (e.g., do not remove permission check or expose service account). Prefer DB token lookup for test endpoint (mirror bi-erp) as a future hardening, not a delivery fix.

---

*Audit performed read-only. No files modified. Secrets and tokens redacted throughout.*
