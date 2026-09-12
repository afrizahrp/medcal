# FCM Comparative Forensic Audit
## Proven Implementation: `D:\bi-erp\server-bi-erp`
## Target Investigation: MedCal

You are performing a **forensic comparative audit only**.

DO NOT modify any file.
DO NOT implement fixes.
DO NOT refactor.
DO NOT install packages.
DO NOT change environment variables.
DO NOT commit.
DO NOT push.
DO NOT deploy.

The purpose of this audit is to determine:

> **Why does FCM notification delivery work in `D:\bi-erp\server-bi-erp`, but the equivalent MedCal FCM backend test succeeds at Firebase (`messageId`) while no browser notification appears?**

We have already spent significant time debugging MedCal. Do NOT repeat generic Firebase advice. Use the proven working implementation in `D:\bi-erp\server-bi-erp` as the primary reference implementation.

---

# 1. TARGET PROJECTS

## Proven working implementation

```text
D:\bi-erp\server-bi-erp
```

This implementation is considered **PROVEN WORKING** because it has successfully delivered FCM notifications to a real browser/device.

You MUST first understand exactly how this implementation works.

## MedCal

Current repository:

```text
D:\medcal
```

MedCal currently has:

- Firebase Web SDK
- browser notification permission
- Firebase Messaging Service Worker
- FCM token registration
- NestJS Firebase Admin sending
- `/notifications/test`
- `onBackgroundMessage`
- `showNotification`
- valid registered browser token

Yet:

```text
MedCal backend → Firebase Admin → FCM
```

returns:

```text
HTTP 200
success: true
messageId: projects/pkm-fcm/messages/...
```

but:

```text
Browser notification
```

does NOT appear.

---

# 2. CRITICAL AUDIT RULE

Do NOT assume the MedCal implementation is correct merely because it is structurally similar to Firebase documentation.

The working reference is:

```text
D:\bi-erp\server-bi-erp
```

Therefore:

> The proven working implementation has higher evidentiary value than assumptions based on documentation.

For every difference you find, classify it as:

- IDENTICAL
- DIFFERENT — likely relevant
- DIFFERENT — likely irrelevant
- UNKNOWN / requires runtime verification

Do not silently classify something as irrelevant.

---

# 3. FIRST: FULL FCM DISCOVERY IN SERVER-BI-ERP

Before looking at MedCal deeply, map the entire FCM implementation in:

```text
D:\bi-erp\server-bi-erp
```

Find ALL relevant code.

Search for:

```text
firebase
firebase-admin
firebase/messaging
messaging
getToken
onMessage
onBackgroundMessage
showNotification
ServiceWorker
serviceWorker
PushSubscription
FCM
notification
webpush
sendToDevice
send
sendEach
sendEachForMulticast
registration token
vapid
```

Also search for:

```text
firebase-messaging-sw
service-worker
notificationclick
clients.openWindow
push
```

Do not assume filenames.

Identify:

1. Backend Firebase Admin initialization.
2. Exact package versions.
3. Firebase project configuration.
4. Service-account configuration method.
5. FCM sending service.
6. Exact Firebase Admin `Message` object.
7. Whether `webpush` is used.
8. Whether `notification` is used.
9. Whether `data` is used.
10. Whether `webpush.notification` is used.
11. Whether `webpush.fcmOptions` is used.
12. Whether headers such as TTL / Urgency are used.
13. Exact browser token storage model.
14. Exact token registration flow.
15. Exact Web SDK initialization.
16. Exact `getToken()` invocation.
17. Exact Service Worker registration.
18. Exact Service Worker source.
19. Exact background handler.
20. Exact notification display logic.
21. Exact notification click logic.
22. Any custom push event handler.
23. Any frontend `onMessage`.
24. Any browser permission logic.
25. Any token refresh / re-registration logic.
26. Any stale-token cleanup.
27. Any middleware / proxy / nginx / reverse-proxy handling affecting the Service Worker.

---

# 4. PROVE WHAT "WORKING" MEANS IN SERVER-BI-ERP

Do not merely find code.

Determine what evidence exists that the FCM implementation actually works.

Look for:

- production test code
- logs
- test scripts
- documented successful browser test
- notification payload examples
- token registration logs
- message delivery tests
- screenshots / reports / docs in repository
- environment conventions
- service-worker production path

State exactly what is proven versus inferred.

Example:

```text
FACT:
server-bi-erp sends Message object X.

FACT:
Production browser receives notification.

INFERENCE:
Therefore Message object X is compatible with the working browser setup.

UNKNOWN:
Exact Firebase Console payload was not captured.
```

Do NOT claim something is proven merely because code exists.

---

# 5. THEN AUDIT MEDCAL

Audit the corresponding MedCal implementation.

Relevant known areas include:

```text
apps/portal/src/lib/fcm/
apps/portal/src/app/firebase-messaging-sw.js/
packages/notifications/
apps/api/src/modules/push-tokens/
packages/auth/
```

But discover the actual implementation instead of assuming those are exhaustive.

---

# 6. BUILD A SIDE-BY-SIDE COMPARISON

Create a table with at least these columns:

```text
Area
server-bi-erp implementation
MedCal implementation
Difference
Relevance
Evidence
```

Compare:

## Firebase client

- Firebase SDK version
- modular vs compat
- Firebase initialization
- project ID source
- VAPID key source
- messaging initialization
- `isSupported()`
- token retrieval
- `getToken()` options
- Service Worker registration
- Service Worker scope

## Service Worker

- file path
- static vs dynamic
- route handling
- proxy behavior
- Firebase compat version
- Firebase initialization
- `firebase.messaging()`
- `onBackgroundMessage`
- `onBackgroundMessage` payload parsing
- `showNotification`
- notification options
- icon
- badge
- data handling
- notification click handling
- `clients.openWindow`
- `skipWaiting`
- `clients.claim`
- push event listeners
- exceptions / logging

## Backend

- Firebase Admin SDK version
- Firebase Admin initialization
- project identity
- credential mechanism
- singleton behavior
- messaging initialization
- exact `Message` object
- `notification`
- `data`
- `webpush`
- `webpush.notification`
- `webpush.fcmOptions`
- TTL
- urgency
- priority
- Android config
- APNS config
- target token source
- token lookup
- token validation
- token freshness
- token ownership
- user-to-token relationship

## Token lifecycle

- token generation
- registration API
- DB schema
- upsert behavior
- uniqueness
- refresh
- re-registration
- stale token handling
- multi-device behavior
- deletion
- deactivation

## Runtime / infrastructure

- Docker
- environment variable injection
- build-time vs runtime Firebase variables
- nginx
- reverse proxy
- CDN
- Service Worker headers
- `Cache-Control`
- `Content-Type`
- `Service-Worker-Allowed`
- service-worker routing
- origin/domain
- HTTPS

---

# 7. MOST IMPORTANT: COMPARE THE ACTUAL MESSAGE SENT TO FCM

This is a high-priority part of the audit.

For SERVER-BI-ERP determine the exact object passed to:

```ts
messaging.send(...)
```

or equivalent.

For MedCal determine the exact object passed to:

```ts
messaging.send(...)
```

Do NOT summarize loosely.

Show them side-by-side in redacted form:

```ts
SERVER-BI-ERP:

{
  token: "...",
  notification: {...},
  webpush: {...},
  data: {...}
}
```

versus:

```ts
MEDCAL:

{
  token: "...",
  notification: {...},
  webpush: {...},
  data: {...}
}
```

Then identify every difference.

---

# 8. COMPARE THE ACTUAL CLIENT RECEIVER

This is equally important.

For SERVER-BI-ERP identify the exact code path that receives the push:

```text
FCM
 ↓
Browser
 ↓
Service Worker
 ↓
Firebase Messaging
 ↓
handler
 ↓
showNotification
```

For MedCal identify the same path.

Compare:

- exact Service Worker source
- Firebase compat version
- handler implementation
- notification payload parsing
- error handling
- click handling
- whether the handler is actually invoked
- whether the worker registers at the same scope

---

# 9. DO NOT ASSUME DOCUMENTATION EQUIVALENCE

If both systems use:

```ts
notification: {
  title,
  body
}
```

that does NOT automatically mean they are equivalent.

Check:

- SDK version
- service worker implementation
- browser behavior
- Firebase project
- VAPID
- token origin
- webpush options
- infrastructure

Likewise, if one system uses `webpush` and the other doesn't, determine whether this difference is actually relevant by examining the proven working implementation.

---

# 10. HIGH-VALUE COMPARISON QUESTIONS

Explicitly answer each:

### Q1
Does server-bi-erp use `webpush.notification`?

### Q2
Does server-bi-erp use a top-level `notification`?

### Q3
Does server-bi-erp use both?

### Q4
Does server-bi-erp use `data`?

### Q5
Does server-bi-erp use `webpush.fcmOptions.link`?

### Q6
Does server-bi-erp use custom TTL/Urgency?

### Q7
Does server-bi-erp use the same Firebase Admin SDK major version as MedCal?

### Q8
Does server-bi-erp use the same Firebase Web SDK major version as MedCal?

### Q9
Does server-bi-erp use compat or modular Web SDK?

### Q10
Does the server-bi-erp Service Worker use `onBackgroundMessage()`?

### Q11
Does it explicitly call `showNotification()`?

### Q12
Does it rely on FCM automatic notification display instead?

### Q13
Does server-bi-erp use `skipWaiting()` or `clients.claim()`?

### Q14
How does server-bi-erp ensure the browser is using the current Service Worker?

### Q15
How is the FCM token obtained in server-bi-erp?

### Q16
How is the token stored?

### Q17
How does server-bi-erp choose the token when sending?

### Q18
Does server-bi-erp ever accept a token directly from an API request body?

### Q19
Does server-bi-erp send using a token looked up from the database?

### Q20
Could MedCal's test endpoint be structurally different from the proven implementation?

---

# 11. TRACE ONE REAL WORKING MESSAGE IN SERVER-BI-ERP

Find the closest equivalent to:

> "send a test notification to one browser"

Trace it all the way:

```text
trigger
 ↓
service
 ↓
token lookup
 ↓
Message construction
 ↓
Firebase Admin
 ↓
FCM
 ↓
Service Worker
 ↓
notification
```

Document every step.

Then map MedCal's corresponding path.

---

# 12. IDENTIFY THE FIRST DIVERGENCE

This is the most important output.

Determine:

> At what exact layer do server-bi-erp and MedCal first diverge in a way that can plausibly explain the missing notification?

Examples:

```text
FIRST DIVERGENCE:
Backend message construction

or

FIRST DIVERGENCE:
Service Worker implementation

or

FIRST DIVERGENCE:
Token selection

or

FIRST DIVERGENCE:
Firebase project/configuration

or

FIRST DIVERGENCE:
No meaningful divergence found
```

Do NOT list ten possibilities without identifying the first material divergence.

---

# 13. EXPERIMENT DESIGN

After identifying the first divergence, design the smallest possible experiment to prove/disprove it.

Example:

```text
Working:
server-bi-erp payload X

MedCal:
payload Y

Experiment:
send payload X from MedCal backend to the same token

Expected:
notification appears if payload difference is causal
```

Do NOT implement the experiment.

Just specify exactly what should be tested.

---

# 14. SECURITY AUDIT

Also compare:

- service-account credential handling
- frontend exposure
- token logging
- token ownership
- arbitrary-token sending
- cross-user targeting
- tenant isolation
- token authorization
- sensitive payload leakage

Do not recommend weakening security to make testing easier.

---

# 15. OUTPUT FORMAT

Produce exactly these sections:

## 1. Executive Verdict

One concise paragraph.

## 2. Proven Working Implementation — server-bi-erp

Explain the actual proven architecture.

## 3. MedCal Current Implementation

Explain the actual current architecture.

## 4. Side-by-Side Comparison

Detailed table.

## 5. Exact FCM Message Comparison

Show the exact redacted message objects.

## 6. Exact Service Worker Comparison

Show the relevant receive/display implementations.

## 7. Token Lifecycle Comparison

Explain generation → registration → storage → send.

## 8. Runtime / Production Infrastructure Comparison

Compare Docker/env/nginx/SW delivery.

## 9. First Material Divergence

Identify the FIRST meaningful difference that plausibly explains the symptom.

## 10. Root Cause Ranking

Rank only evidence-backed hypotheses.

## 11. Minimal Experiment

Specify the smallest test that can prove the leading hypothesis.

## 12. Recommended Fix

Recommendation only. DO NOT IMPLEMENT.

## 13. Files That Would Need Modification

Only if a fix is actually required.

## 14. Files That Must Remain Untouched

Explicitly list unrelated areas.

## 15. Final Verdict

Use exactly one:

```text
GREEN
YELLOW
RED
```

---

# 16. HARD RULES

1. **Do not modify either project.**
2. **Do not install dependencies.**
3. **Do not generate code changes.**
4. **Do not commit.**
5. **Do not push.**
6. **Do not deploy.**
7. **Do not assume Firebase documentation means the two implementations are equivalent.**
8. **Do not rely only on static similarity.**
9. **Inspect the proven working implementation first.**
10. **Use the proven working implementation as the primary comparator.**
11. **Do not claim a difference is causal without evidence.**
12. **Do not recommend adding random payload fields.**
13. **Do not recommend rewriting the FCM architecture.**
14. **Do not change MedCal's auth/RBAC/lead logic.**
15. **Do not expose secrets or full FCM tokens in the report.**
16. **Redact service-account credentials, private keys, tokens, cookies, and authorization headers.**
17. **If server-bi-erp contains a working implementation that materially differs from MedCal, show the exact difference.**
18. **If no meaningful difference is found, explicitly say so.**
19. **Prefer one decisive experiment over multiple speculative changes.**
20. **The objective is root-cause identification, not code generation.**

FINAL QUESTION TO ANSWER:

> **"What does `D:\bi-erp\server-bi-erp` do differently from MedCal that explains why its FCM notification actually appears in the browser while MedCal's backend message is accepted by FCM but never appears?"**