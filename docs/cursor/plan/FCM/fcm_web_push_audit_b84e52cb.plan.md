---
name: FCM Web Push Audit
overview: Audit komprehensif arsitektur FCM Web Push untuk MedCal monorepo - mengidentifikasi status existing, keputusan yang diperlukan, dan rencana implementasi.
todos:
  - id: decision-1
    content: "Approve: Add lead:notify permission vs derive from lead:read"
    status: pending
  - id: decision-2
    content: "Approve: Customer app in FCM scope (Yes/No/Future)"
    status: pending
  - id: decision-3
    content: "Approve: Synchronous vs Queue notification sending"
    status: pending
  - id: decision-4
    content: "Approve: User notification preferences for MVP (Yes/No)"
    status: pending
isProject: false
---

# FCM Web Push / PWA Architecture Audit - MedCal

---

## 1. Executive Summary

MedCal repository sudah memiliki fondasi solid untuk FCM Web Push:

- **FCMToken model sudah ada** di Prisma schema dengan struktur yang tepat
- **Push notification stub** sudah ada di `packages/notifications`
- **PWA manifest** sudah ada di tech-pwa dan portal
- **Tidak ada Firebase packages** yang terinstall
- **Tidak ada service worker** yang diimplementasikan

**VERDICT: YELLOW** - Fondasi sudah ada, namun implementasi FCM belum dimulai. Beberapa keputusan arsitektur diperlukan sebelum implementasi.

---

## 2. Existing Firebase / FCM Footprint

### FACT: Tidak Ada Firebase Packages

Pencarian di semua `package.json` tidak menemukan:
- `firebase`
- `firebase-admin`
- `@firebase/*`

### FACT: FCMToken Model Sudah Ada

```prisma
// packages/db/prisma/schema.prisma (lines 485-501)
model FCMToken {
  id         String    @id @default(cuid())
  companyId  String
  userId     String
  token      String    @unique
  deviceType String
  app        PushApp
  isActive   Boolean   @default(true)
  lastUsedAt DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
}

enum PushApp {
  WEB
  PORTAL
  TECH_PWA
}
```

### FACT: Push Notification Stub Exists

```typescript
// packages/notifications/src/push/index.ts
export type SendPushInput = {
  endpoint: string;
  title: string;
  body: string;
  url?: string;
};

export async function sendPush(_input: SendPushInput): Promise<void> {
  return; // Stub - belum diimplementasi
}
```

### FACT: ReminderChannel Enum Includes PUSH

```prisma
enum ReminderChannel {
  EMAIL
  PUSH      // <-- Sudah direncanakan
  WHATSAPP
}
```

---

## 3. Applications in Scope

| Application | Domain | PWA Support | FCM Scope |
|------------|--------|-------------|-----------|
| Portal (Management) | apps.kalibrasimedika.co.id | Yes - manifest exists | **IN SCOPE** |
| Tech-PWA | technician.kalibrasimedika.co.id | Yes - manifest exists | **IN SCOPE** |
| Web (Public) | kalibrasimedika.co.id | Has manifest | **OUT OF SCOPE** - unauthenticated |
| Web-API | kalibrasimedika.co.id/public/* | N/A | N/A |

**INFERENCE**: Portal dan Tech-PWA adalah target utama karena keduanya memerlukan authenticated push notifications untuk internal users.

**DECISION REQUIRED**: Apakah Customer application (masa depan) harus menggunakan infrastruktur FCM yang sama?

---

## 4. PWA + Service Worker Architecture

### FACT: Manifest Files Exist

- [apps/tech-pwa/public/manifest.webmanifest](apps/tech-pwa/public/manifest.webmanifest) - Basic PWA manifest
- [apps/portal/public/site.webmanifest](apps/portal/public/site.webmanifest) - Basic manifest

### FACT: No Service Worker Exists

Pencarian tidak menemukan:
- `sw.js`
- `firebase-messaging-sw.js`
- `service-worker.js`
- Service worker registration code

### INFERENCE: Service Worker Architecture Required

```
PWA App
  ↓
Service Worker Registration (di layout atau dedicated hook)
  ↓
firebase-messaging-sw.js (di /public)
  ↓
FCM Token Request
  ↓
Token Registration ke API
```

### Files Yang Perlu Dibuat:

1. `apps/portal/public/firebase-messaging-sw.js`
2. `apps/tech-pwa/public/firebase-messaging-sw.js`
3. Service worker registration hook di masing-masing app

### FACT: nginx Sudah Support Static Files

nginx config di [infra/nginx/apps.kalibrasimedika.co.id.conf.example](infra/nginx/apps.kalibrasimedika.co.id.conf.example) sudah proxy ke Next.js yang serve static files dari `/public`.

---

## 5. Current Authentication / User Identity Flow

### FACT: Better Auth Session-Based

```typescript
// apps/portal/src/lib/use-require-session.ts
import { useSession } from "@medcal/auth/client";

export function useRequireSession(): { me: Me | null; status: SessionStatus } {
  const { data: session, isPending } = useSession();
  // ...
  apiFetch<Me>("/me")
  // ...
}
```

### FACT: /me Endpoint Returns Identity

```typescript
// apps/api/src/modules/me/me.controller.ts
return {
  user: session.user,
  membership: { role: membership.role, companyId: membership.companyId },
  capabilities,
};
```

### INFERENCE: FCM Registration Point

FCM token registration harus terjadi **setelah** `useRequireSession()` returns `status: "ready"` dan `me` tersedia.

**RECOMMENDED FLOW:**

```
User Login
  ↓
useSession() -> session available
  ↓
/me -> user.status === "ACTIVE"
  ↓
Request Notification Permission
  ↓
Get FCM Token
  ↓
POST /notifications/push-tokens
```

---

## 6. User Lifecycle and FCM Eligibility

### FACT: User Status Enum

```prisma
enum UserStatus {
  INVITED
  ACTIVE
  DISABLED
}
```

### FACT: Only ACTIVE Users Can Access System

```typescript
// apps/api/src/common/guards/company-role.guard.ts
if (membership.user.status !== "ACTIVE") {
  throw new ForbiddenException(FORBIDDEN_MESSAGE);
}
```

### INFERENCE: FCM Eligibility Matrix

| User Status | FCM Registration | Receive Notifications |
|-------------|-----------------|----------------------|
| UNAUTHENTICATED | NO | NO |
| INVITED | NO | NO |
| ACTIVE | YES | YES |
| DISABLED | NO - tokens should be deactivated | NO |

### Token Behavior on Status Change:

| Event | Recommended Action |
|-------|-------------------|
| User becomes ACTIVE | Allow registration |
| User becomes DISABLED | Set `isActive = false` on all tokens |
| User signs out | **DO NOT** delete token (multi-device support) |
| Session expires | Token remains valid |
| Browser permission revoked | Token becomes invalid, cleanup on next send |

---

## 7. Recommended FCM Registration Data Model

### FACT: Existing Model is Adequate

```prisma
model FCMToken {
  id         String    @id @default(cuid())
  companyId  String    // Tenant isolation
  userId     String    // Owner
  token      String    @unique // FCM token
  deviceType String    // browser/device info
  app        PushApp   // WEB, PORTAL, TECH_PWA
  isActive   Boolean   @default(true)
  lastUsedAt DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
}
```

### INFERENCE: Model Supports Requirements

- Multiple browsers per user
- Multiple devices per user
- Token refresh (upsert on unique token)
- Token rotation (replace old token)
- Duplicate prevention (@unique on token)
- Invalid token cleanup (isActive flag)
- Application separation (PushApp enum)

### Optional Enhancement (DECISION REQUIRED):

Add `browserFingerprint` or `userAgent` field untuk better device identification?

---

## 8. Token Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                      TOKEN LIFECYCLE                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐    ┌─────────────────┐    ┌────────────────┐     │
│  │  INSTALL  │───▶│ Permission      │───▶│ FCM Token      │     │
│  │  (PWA)    │    │ Granted         │    │ Obtained       │     │
│  └──────────┘    └─────────────────┘    └────────┬───────┘     │
│                                                   │              │
│                                                   ▼              │
│                                          ┌───────────────┐       │
│                                          │ POST /push-   │       │
│                                          │ tokens        │       │
│                                          └───────┬───────┘       │
│                                                  │               │
│                    ┌─────────────────────────────┼───────┐       │
│                    │                             │       │       │
│                    ▼                             ▼       ▼       │
│            ┌─────────────┐              ┌───────────┐  ┌─────┐  │
│            │ Token       │              │ lastSeen  │  │Token│  │
│            │ Refreshed   │              │ Updated   │  │Invalid│ │
│            └──────┬──────┘              └───────────┘  └──┬──┘  │
│                   │                                       │      │
│                   ▼                                       ▼      │
│            ┌─────────────┐                        ┌───────────┐  │
│            │ Upsert with │                        │ isActive  │  │
│            │ new token   │                        │ = false   │  │
│            └─────────────┘                        └───────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. Recommended API Contract

### INFERENCE: Endpoint Design

```
POST   /notifications/push-tokens
       Body: { token: string, deviceType: string, app: PushApp }
       Auth: Required (session-based)
       Response: { id: string }

DELETE /notifications/push-tokens/:tokenId
       Auth: Required (must own token)
       Response: 204 No Content

PATCH  /notifications/push-tokens/:tokenId/heartbeat
       Auth: Required (must own token)
       Purpose: Update lastUsedAt
       Response: 204 No Content
```

### Security Constraints:

- User can only register tokens for themselves
- User can only delete their own tokens
- companyId derived from membership, not client input
- Token uniqueness enforced at DB level

---

## 10. Notification Sending Architecture

### FACT: No Event System Exists

Pencarian tidak menemukan:
- EventEmitter patterns
- Bull/BullMQ queues
- CQRS implementation

### FACT: Email Sending is Synchronous

[packages/notifications/src/email/index.ts](packages/notifications/src/email/index.ts) sends email synchronously dalam request.

### INFERENCE: Synchronous Push is Acceptable for MVP

```typescript
// Proposed flow in LeadsService or ContactMessagesService
async create(...) {
  // ... create lead/message ...
  
  // Send push notification (synchronous)
  await this.pushNotificationService.notifyNewLead(companyId, lead);
  
  return result;
}
```

### DECISION REQUIRED: Queue vs Synchronous?

Untuk MVP, synchronous sending acceptable. Queue diperlukan jika:
- Volume tinggi (>100 notifications/minute)
- Reliability requirements (retry logic)
- Performance isolation

---

## 11. Recipient Selection Policy

### CRITICAL DECISION REQUIRED

Bagaimana menentukan siapa yang menerima notifikasi lead baru?

**Option A: Permission-Based (`lead:notify`)**

```typescript
// Add to permissionCatalog
lead: ["read", "update", "notify"]

// Recipient selection
const recipients = await findUsersWithPermission(companyId, "lead", "notify");
```

**Pros:**
- Granular control
- Consistent with existing RBAC
- Manageable via Permission Management UI

**Cons:**
- Requires adding new permission
- Decoupled from lead:read (user might have notify but not read)

**Option B: Derived from `lead:read`**

```typescript
const recipients = await findUsersWithPermission(companyId, "lead", "read");
```

**Pros:**
- Simple, no new permission needed

**Cons:**
- All users with lead:read get ALL lead notifications
- No opt-out mechanism

**Option C: User Preference Model**

```prisma
model NotificationPreference {
  id        String @id
  userId    String
  eventType String // "lead:new", "chat:message", etc.
  enabled   Boolean
}
```

**Pros:**
- User control over notifications
- Fine-grained

**Cons:**
- New model required
- UI for preference management needed

**RECOMMENDATION: Option A (`lead:notify`)**

Alasan:
- Consistent dengan arsitektur permission existing
- Tidak memerlukan user preference management (complexity)
- Admin dapat control via Permission Management UI
- Dapat di-combine dengan user preferences di masa depan

---

## 12. Permission vs Notification Capability Analysis

### FACT: Current Permission Catalog

```typescript
// packages/auth/src/access-control.ts
const ac = createAccessControl({
  contactMessage: ["read"],
  whitelist: ["manage"],
  lead: ["read", "update"],      // NO notify
  chat: ["read", "reply", "close"],
  users: ["read", "manage"],
  membership: ["manage"],
  menu: ["manage"],
  email: ["read", "send", "delete", "manage"],
  permission: ["manage"],
} as const);
```

### DECISION REQUIRED: Add Notification Permissions?

**Proposed Permission Extensions:**

```typescript
lead: ["read", "update", "notify"],        // New: notify
chat: ["read", "reply", "close", "notify"], // New: notify
// Future:
workOrder: ["read", "update", "notify"],
certificate: ["read", "notify"],
```

### Implications:

1. Permission catalog harus di-update
2. RolePermission seeding perlu di-update
3. Permission Management UI sudah support (no change needed)

---

## 13. Foreground / Background Notification Behavior

### Scenario Matrix

| Scenario | Handler | Behavior |
|----------|---------|----------|
| PWA focused | Firebase onMessage() | Show in-app toast/banner |
| PWA backgrounded | Service Worker | OS notification |
| Browser tab closed | Service Worker | OS notification |
| Browser restarted | Service Worker (if registered) | OS notification |

### INFERENCE: Implementation Pattern

```typescript
// In React app (foreground)
import { onMessage } from "firebase/messaging";

onMessage(messaging, (payload) => {
  // Show in-app notification (toast/banner)
  showNotificationToast(payload);
});

// In firebase-messaging-sw.js (background)
messaging.onBackgroundMessage((payload) => {
  self.registration.showNotification(payload.notification.title, {
    body: payload.notification.body,
    data: payload.data,
  });
});
```

---

## 14. Notification Payload and Deep-Link Design

### INFERENCE: Minimal Payload (Security)

**DO NOT include sensitive data in push payload.**

```typescript
// Recommended payload structure
{
  notification: {
    title: "Lead Baru",
    body: "Ada lead baru dari PT ABC"
  },
  data: {
    type: "lead:new",
    entityId: "clxyz123",
    route: "/management/leads/clxyz123"
  }
}
```

### Deep-Link Behavior:

| Scenario | Behavior |
|----------|----------|
| Click notification (app open) | Navigate to route |
| Click notification (app closed) | Open app, navigate to route |
| Unauthenticated | Redirect to sign-in, then route |
| Session expired | Re-authenticate, then route |
| Disabled user | Show access denied |

### Service Worker Click Handler:

```javascript
// firebase-messaging-sw.js
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const route = event.notification.data?.route;
  if (route) {
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then((clientList) => {
        // Focus existing window or open new
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus().then(() => client.navigate(route));
          }
        }
        return clients.openWindow(route);
      })
    );
  }
});
```

---

## 15. Firebase Client vs Server Configuration

### Client-Safe Configuration (NEXT_PUBLIC_*)

```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=medcal.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=medcal
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=medcal.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
NEXT_PUBLIC_FIREBASE_VAPID_KEY=BEl... (public VAPID key)
```

### Server-Only Credentials (NEVER expose)

```env
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
# OR
FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/service-account.json
```

### FACT: Environment Variable Pattern Established

[apps/portal/next.config.js](apps/portal/next.config.js) and docker-compose.prod.yml already use `NEXT_PUBLIC_*` pattern.

---

## 16. Production / Docker / nginx Requirements

### Files That Need Modification (Implementation Phase):

1. **docker-compose.prod.yml** - Add FIREBASE_* build args for portal
2. **.env.production.example** - Document all Firebase env vars
3. **nginx configs** - No change needed (static files already served)
4. **Dockerfiles** - No change (Next.js handles /public)

### Service Worker Serving:

FACT: Next.js serves files from `/public` at root path. Service worker at `/firebase-messaging-sw.js` will be served correctly.

### HTTPS:

FACT: Already configured via Let's Encrypt. FCM requires HTTPS - already satisfied.

---

## 17. Zustand Boundary

### CONSTRAINT: Do NOT Introduce Zustand

Per task requirements, FCM implementation must not depend on Zustand.

### INFERENCE: FCM State Management Options

**Option 1: React Context (Recommended)**

```typescript
// FCMProvider wraps authenticated routes
<FCMProvider>
  <AuthenticatedApp />
</FCMProvider>
```

**Option 2: Standalone Hook**

```typescript
// useFCM() manages its own state
const { token, permission, requestPermission } = useFCM();
```

**Option 3: Component-Local State**

FCM registration as side-effect in layout component.

**RECOMMENDATION: Standalone Hook + Optional Context**

- Hook untuk FCM token management
- Context optional untuk sharing state jika needed
- Tidak bergantung pada global state manager

---

## 18. Security Model

### Token Security

| Concern | Mitigation |
|---------|------------|
| Cross-user token registration | API validates userId from session |
| Token deletion authorization | API checks token ownership |
| Disabled user tokens | Deactivate on status change |
| Pending user tokens | Reject registration until ACTIVE |
| Duplicate tokens | @unique constraint |
| Invalid token cleanup | isActive flag + periodic cleanup |

### Credential Protection

| Credential | Location | Protection |
|------------|----------|------------|
| Firebase Admin SDK | Server only | Never in client bundle |
| Service Account JSON | .env.production | Not in git |
| VAPID Public Key | NEXT_PUBLIC_* | Safe to expose |
| Firebase Config | NEXT_PUBLIC_* | Safe to expose |

### Notification Data Security

- DO NOT include PII in push payload
- DO NOT include business data in push payload
- Entity ID + route only
- Fetch authoritative data from API on interaction

---

## 19. Files That Would Need Modification

### New Files to Create:

```
apps/portal/public/firebase-messaging-sw.js
apps/tech-pwa/public/firebase-messaging-sw.js
apps/portal/src/lib/fcm/index.ts (or hooks/useFCM.ts)
apps/tech-pwa/src/lib/fcm/index.ts
apps/api/src/modules/notifications/notifications.module.ts
apps/api/src/modules/notifications/notifications.controller.ts
apps/api/src/modules/notifications/notifications.service.ts
apps/api/src/modules/notifications/push-tokens.controller.ts
packages/notifications/src/push/fcm.ts
```

### Files to Modify:

```
packages/auth/src/access-control.ts        # Add lead:notify permission
packages/notifications/package.json        # Add firebase-admin
packages/notifications/src/push/index.ts   # Implement sendPush
apps/portal/package.json                   # Add firebase
apps/tech-pwa/package.json                 # Add firebase
apps/api/src/app.module.ts                 # Import NotificationsModule
apps/api/package.json                      # Add @medcal/notifications dependency if missing
docker-compose.prod.yml                    # Add Firebase env vars
```

---

## 20. Files That Must Remain Untouched

Per task constraints:

- Authentication system
- RBAC system (except adding new permissions)
- RolePermission model structure
- Permission Management UI
- Menu Registry
- Existing API guards
- User lifecycle management

---

## 21. Implementation Sequence

### Phase 1: Backend Infrastructure

1. Add `firebase-admin` to `packages/notifications`
2. Implement FCM Admin SDK integration in `packages/notifications/src/push`
3. Create NotificationsModule with push-tokens CRUD endpoints
4. Add Firebase env vars to .env.production.example

### Phase 2: Permission Setup

1. Add `lead:notify` permission to catalog
2. Seed default RolePermission grants via migration or admin UI

### Phase 3: Frontend FCM Integration (Portal)

1. Add `firebase` package to portal
2. Create firebase-messaging-sw.js
3. Create useFCM hook
4. Integrate token registration after authentication

### Phase 4: Frontend FCM Integration (Tech-PWA)

1. Same as Phase 3 for tech-pwa

### Phase 5: Notification Sending

1. Implement notification sending in relevant services (LeadsService, etc.)
2. Add recipient selection logic using `lead:notify` permission

### Phase 6: Testing and Cleanup

1. Test all scenarios (foreground, background, click handling)
2. Implement invalid token cleanup mechanism
3. Monitor and iterate

---

## 22. Risks / Edge Cases

| Risk | Mitigation |
|------|------------|
| FCM token expires | Token refresh on onTokenRefresh callback |
| User blocks notifications | Graceful degradation, no error |
| Multiple tabs open | Single registration via localStorage flag |
| Service worker scope issues | Ensure SW at root path |
| Token spam (same user, many registrations) | Upsert logic on token uniqueness |
| Notification delivery failure | Log failures, cleanup invalid tokens |
| Cross-origin issues | CORS already configured for API |

---

## 23. Decisions Requiring Explicit Approval

### DECISION 1: Notification Permission Model

**Question:** Gunakan `lead:notify` permission atau derive dari `lead:read`?

**Recommendation:** Add `lead:notify` permission

**Impact:** Perlu update permission catalog dan seed RolePermission

---

### DECISION 2: Customer Application FCM

**Question:** Apakah Customer application (masa depan) termasuk dalam scope FCM ini?

**Recommendation:** Design untuk extensibility, implementasi hanya Portal dan Tech-PWA untuk MVP

---

### DECISION 3: Queue vs Synchronous Sending

**Question:** Apakah notifikasi dikirim synchronous atau via queue?

**Recommendation:** Synchronous untuk MVP, queue jika volume tinggi

---

### DECISION 4: User Notification Preferences

**Question:** Apakah user dapat opt-out dari notifikasi tertentu?

**Recommendation:** Tidak untuk MVP. Permission-based control cukup. User preferences sebagai future enhancement.

---

## 24. Final Recommendation

### FINAL VERDICT: YELLOW

**Alasan:**
- Fondasi sudah solid (FCMToken model, push stub, PWA manifests)
- Tidak ada blocking architectural issues
- Beberapa keputusan diperlukan sebelum implementasi
- Implementasi straightforward setelah keputusan dibuat

**Recommended Next Steps:**
1. Approve decisions #1-4 di atas
2. Proceed dengan Implementation Phase 1 (Backend Infrastructure)
3. Iterate through remaining phases

**Estimated Complexity:** Medium
- Backend: ~2-3 days
- Frontend (per app): ~1-2 days
- Testing: ~1 day

---

## Appendix: File References

- [Prisma Schema](packages/db/prisma/schema.prisma) - FCMToken model (lines 485-501)
- [Push Stub](packages/notifications/src/push/index.ts) - Current implementation
- [Access Control](packages/auth/src/access-control.ts) - Permission catalog
- [Me Controller](apps/api/src/modules/me/me.controller.ts) - User identity endpoint
- [Company Role Guard](apps/api/src/common/guards/company-role.guard.ts) - Authorization flow
- [Tech-PWA Manifest](apps/tech-pwa/public/manifest.webmanifest) - PWA configuration
- [Docker Compose Prod](docker-compose.prod.yml) - Production deployment
