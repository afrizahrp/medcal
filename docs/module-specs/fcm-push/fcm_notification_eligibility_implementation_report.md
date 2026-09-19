# Notification Eligibility (`UserMembership.receiveNotifications`) — Implementation Report

**Date:** 2026-08-22  
**Status:** Complete  
**Builds on:** [`fcm_token_registration_user_assignment_implementation_report.md`](./fcm_token_registration_user_assignment_implementation_report.md)

---

## 1. Existing `UserMembership` Structure (Before)

```prisma
model UserMembership {
  id        String         @id @default(cuid())
  userId    String
  companyId String
  role      MembershipRole
  isDefault Boolean        @default(false)
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt

  @@unique([userId, companyId])
  @@index([companyId])
}
```

**Confirmed:** Role and company membership lived on `UserMembership`. No notification eligibility flag existed. No `User.receiveNotifications`. No notification-specific permissions in RBAC catalog.

---

## 2. Where `receiveNotifications` Was Added

**Model:** `UserMembership` in [`packages/db/prisma/schema.prisma`](../../../packages/db/prisma/schema.prisma)

```prisma
receiveNotifications Boolean @default(false)
```

**Semantic:** Whether this user's membership in **this company** is eligible to receive push notifications.

**NOT added to:** `User`, `RolePermission`, permission catalog, or role management.

---

## 3. Default Value

```text
receiveNotifications = false
```

- Prisma schema: `@default(false)`
- Migration SQL: `DEFAULT false`
- New memberships via `assignMembership()`: inherit DB default (`false`) — no silent opt-in
- Existing memberships after migration: **all `false`** (safe; no mass enable)

---

## 4. Migration Created

| File | Purpose |
|------|---------|
| [`packages/db/prisma/migrations/20260822180000_add_user_membership_receive_notifications/migration.sql`](../../../packages/db/prisma/migrations/20260822180000_add_user_membership_receive_notifications/migration.sql) | `ALTER TABLE "UserMembership" ADD COLUMN "receiveNotifications" BOOLEAN NOT NULL DEFAULT false` |

**Apply locally:**

```bash
pnpm --filter @medcal/db run migrate:deploy
pnpm --filter @medcal/db run generate
```

> Note: Run `generate` when dev server is stopped if Windows reports EPERM on Prisma engine file lock.

---

## 5. User Detail UI Changes

**File:** [`apps/portal/src/app/management/users/[id]/page.tsx`](../../../apps/portal/src/app/management/users/[id]/page.tsx)

Added section **Notifikasi** (after Role, before Hapus Membership):

- Checkbox **Terima Notifikasi**
- Helper text: eligibility is for push notifications on assignments in this company
- Saves via `PATCH /users/:id/memberships/notification-settings`
- Requires `membership:manage` permission (same as role changes)

---

## 6. API Changes

### New endpoint

```http
PATCH /users/:id/memberships/notification-settings
Authorization: session + membership:manage
```

**Body:**

```json
{ "receiveNotifications": true }
```

**Response:** Updated `UserMembership` row

**Errors:** `MEMBERSHIP_NOT_FOUND` (404), `INVALID_NOTIFICATION_SETTINGS` (400)

### Extended responses

`GET /users`, `GET /users/:id` now include in `membership`:

```json
{
  "role": "ADMIN",
  "isDefault": false,
  "receiveNotifications": false
}
```

### Unchanged

- `PATCH /leads/:id/assign` — still assigns `assignedToUserId` to a specific USER
- `lead:assign` — authorization only (who may assign), **not** notification eligibility

---

## 7. Backend Authorization

| Action | Gate |
|--------|------|
| Toggle `receiveNotifications` | `membership:manage` via `CompanyRoleGuard` |
| Assign lead | `lead:assign` |
| Register FCM token | Session (own tokens only) |

**No** `notification:receive` or similar permission added.

Backend derives `companyId` from deployment env — client cannot set another user's eligibility without `membership:manage`.

---

## 8. Recipient Eligibility Logic

**New service:** [`apps/api/src/modules/push-tokens/notification-recipient.service.ts`](../../../apps/api/src/modules/push-tokens/notification-recipient.service.ts)

```typescript
resolveEligibleUserIds(companyId, userIds[])
```

**Filters to users where ALL hold:**

1. `UserMembership` exists for `(companyId, userId)`
2. `receiveNotifications === true`
3. `User.status === ACTIVE`

**Updated:** [`notification-dispatch.service.ts`](../../../apps/api/src/modules/push-tokens/notification-dispatch.service.ts)

```text
sendToUsers(userIds)
  → resolveEligibleUserIds(companyId, userIds)   // eligibility
  → getActiveTokensForUserIds(companyId, eligible) // tokens
  → sendPushBatch()                                 // FCM
  → deactivateByToken on invalid                    // cleanup
```

---

## 9. FCM Token Resolution

Unchanged multi-device model:

```text
User (eligible)
  → FCMToken[] (all active rows for companyId + userId)
  → sendPushBatch (one message per token)
```

No per-device selection UI. Eligibility is at membership level; dispatch fans out to all active devices.

---

## 10. Lead Assignment Flow (Final)

```text
PATCH /leads/:id/assign  (lead:assign — authorization)
        ↓
Lead.assignedToUserId = USER_ID
        ↓
NotificationDispatchService.sendToUsers([assignedToUserId])
        ↓
UserMembership.receiveNotifications === true?  (company-scoped)
        ↓ YES                          ↓ NO
FCMToken[] active                   STOP (no push)
        ↓
FCM
```

---

## 11. Tests Performed

### Eligibility (`notification-recipient.service.test.ts`)

| Case | Description | Expected |
|------|-------------|----------|
| A | `receiveNotifications=true`, ACTIVE | Eligible |
| B | `receiveNotifications=false` | Not eligible |
| C | Same role, different setting | Only enabled user |
| D | Same permission context, different setting | Only enabled user |
| F | Company A enabled, Company B disabled | Isolated per company |
| — | DISABLED user + enabled flag | Not eligible |

### Dispatch (`notification-dispatch.service.test.ts`)

| Case | Description | Expected |
|------|-------------|----------|
| — | No eligible users | Zero send, no batch call |
| — | Eligible but no tokens | Zero send |
| E | Eligible user, 2 tokens | Batch send to both devices |
| — | Invalid token | Deactivated |

### Users API (`users.service.test.ts`)

- Update `receiveNotifications` on existing membership
- 404 when membership missing

### Typecheck

- `@medcal/portal` — pass
- `@medcal/api` — pre-existing `api-fetch.ts` error only (unrelated)

Integration tests require `DATABASE_URL` + applied migration.

---

## 12. Confirmation: NOT Role/Permission Based

| Mechanism | Purpose |
|-----------|---------|
| `lead:assign` | **Authorization** — who may assign a lead |
| `RolePermission` / RBAC | Operator capabilities |
| `UserMembership.receiveNotifications` | **Notification eligibility** — who receives push |

Dispatch **never** checks role or permission for recipients. Only `receiveNotifications` + ACTIVE user + active FCM tokens.

---

## 13. Confirmation: Multi-Device

One eligible user with N active `FCMToken` rows → N messages via `sendPushBatch`. Test E in dispatch unit tests verifies laptop + android both receive.

---

## 14. Files Changed

### Created

| File |
|------|
| `packages/db/prisma/migrations/20260822180000_add_user_membership_receive_notifications/migration.sql` |
| `apps/api/src/modules/push-tokens/notification-recipient.service.ts` |
| `apps/api/src/modules/push-tokens/notification-recipient.service.test.ts` |

### Modified

| File | Change |
|------|--------|
| `packages/db/prisma/schema.prisma` | `receiveNotifications` on `UserMembership` |
| `apps/api/src/modules/push-tokens/notification-dispatch.service.ts` | Eligibility gate before token lookup |
| `apps/api/src/modules/push-tokens/notification-dispatch.service.test.ts` | Eligibility + multi-device tests |
| `apps/api/src/modules/push-tokens/push-tokens.module.ts` | Register/export `NotificationRecipientService` |
| `apps/api/src/modules/users/users.service.ts` | Expose + update `receiveNotifications` |
| `apps/api/src/modules/users/users.controller.ts` | `PATCH .../notification-settings` |
| `apps/api/src/modules/users/users.service.test.ts` | Settings update tests |
| `apps/portal/src/app/management/users/[id]/page.tsx` | Notifikasi UI section |

### NOT modified

- `packages/auth/src/access-control.ts` (no new notification permissions)
- Role Management / Permission Management UI
- Lead assignment API contract
- `FCMToken` model

---

## 15. Remaining Issues / Follow-ups

| Item | Priority |
|------|----------|
| Run migration on all environments | Required before deploy |
| Portal Lead UI wire to `PATCH /leads/:id/assign` | Medium (API exists) |
| Contact/WhatsApp/Webchat triggers | Future — reuse same eligibility pipeline |
| Assignment audit trail | Low |
| Bulk-enable notifications for existing staff | Product decision — default remains false |

---

## 16. Three-Question Model (Verified)

```text
1. Who may assign?     → lead:assign (RBAC)
2. Who is assigned?    → Lead.assignedToUserId (USER)
3. Eligible for push?  → UserMembership.receiveNotifications (company-scoped)
```

```text
assignedToUserId
        ↓
UserMembership.receiveNotifications === true  (for Lead.companyId)
        ↓
FCMToken[]
        ↓
FCM
```

**Implementation complete.**
