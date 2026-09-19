# MedCal FCM Web Push --- Implementation Roadmap

**Project:** MedCal\
**Scope:** Portal + Technician PWA + NestJS API + Firebase Cloud
Messaging\
**Status:** Phase 2 complete; next phase is backend sending, followed by
notification assignment/targeting.

------------------------------------------------------------------------

## 1. Architecture

The target end-to-end flow is:

``` text
Business Event
      ↓
MedCal API
      ↓
Notification Type / Recipient Policy
      ↓
User(s) assigned to receive that notification
      ↓
Active FCM tokens for those users
      ↓
Firebase Admin SDK
      ↓
Firebase Cloud Messaging
      ↓
Portal / Technician PWA
      ↓
Foreground UI or Service Worker notification
```

### Security boundary

-   `userId` and `companyId` are always derived server-side from the
    authenticated session/context.
-   The browser must never be trusted to submit `userId` or `companyId`
    as notification recipient identity.
-   RBAC permissions and notification recipient assignment are separate
    concerns.

------------------------------------------------------------------------

## 2. Phase Status

  -----------------------------------------------------------------------
  Phase                   Scope                   Status
  ----------------------- ----------------------- -----------------------
  Phase 0                 Architecture, security  ✅ DONE
                          and implementation      
                          audit                   

  Phase 1                 Firebase project, Web   ✅ DONE
                          Push/VAPID and          
                          environment             
                          configuration           

  Phase 2                 Firebase Web SDK,       ✅ DONE
                          Service Worker,         
                          permission and FCM      
                          token registration      

  Phase 3                 Backend Firebase Admin  🟡 NEXT
                          SDK + actual FCM        
                          sending                 

  Phase 4                 Notification Types +    ⬜ TODO
                          Recipient Assignment    

  Phase 5                 Notification Targeting  ⬜ TODO
                          / recipient resolution  

  Phase 6                 Foreground/background   ⬜ TODO
                          notification UX         

  Phase 7                 Business-event          ⬜ TODO
                          integration, starting   
                          with New Lead           

  Phase 8                 Technician PWA          ⬜ TODO
                          notification            
                          integration             

  Phase 9                 End-to-end and          ⬜ TODO
                          authorization testing   

  Phase 10                Production hardening,   ⬜ TODO
                          cleanup and             
                          observability           
  -----------------------------------------------------------------------

------------------------------------------------------------------------

# Phase 0 --- Architecture & Audit

**Status: DONE**

Completed:

-   Portal / Technician PWA / API architecture review.
-   Firebase Web Push architecture defined.
-   Authentication and RBAC interaction reviewed.
-   Security rule established: recipient identity is server-derived.
-   FCM token storage and registration flow defined.
-   Business notification delivery kept separate from core business
    transactions.

------------------------------------------------------------------------

# Phase 1 --- Firebase Project & Web Push Configuration

**Status: DONE**

Completed:

-   Firebase project configured.
-   Firebase Cloud Messaging API (V1) enabled.
-   Web Push certificate / VAPID key configured.
-   Firebase Web configuration added to public client environment.
-   Firebase Admin service-account configuration reserved for backend
    only.

### Client variables

``` text
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_FIREBASE_VAPID_KEY
```

### Server-only credential

``` text
FIREBASE_SERVICE_ACCOUNT_JSON
```

------------------------------------------------------------------------

# Phase 2 --- Firebase Web SDK + FCM Token Registration

**Status: DONE**

Completed for Portal and Technician PWA:

-   Firebase Web SDK configuration.
-   Messaging initialization.
-   Browser notification permission flow.
-   `getToken()` using VAPID key.
-   FCM Service Worker route.
-   Backend token registration endpoint.
-   FCM token persistence.
-   Production proxy bypass for `/firebase-messaging-sw.js`.
-   Authentication context fix in `CompanyRoleGuard`.

### Production verification completed

``` text
GET /firebase-messaging-sw.js → 200 OK
Service Worker → valid JavaScript
getToken() → successful
POST /notifications/push-tokens → successful
userId/companyId → server-derived successfully
UI → "Notifications enabled"
```

Phase 2 is therefore considered complete.

------------------------------------------------------------------------

# Phase 3 --- Backend FCM Sending

**Status: NEXT**

Goal:

> Prove that the MedCal API can send a notification to one registered
> FCM token.

Work:

-   Initialize Firebase Admin SDK in NestJS API.
-   Add server-side messaging service.
-   Implement single-token send.
-   Implement batch/multi-token send where appropriate.
-   Handle invalid/unregistered FCM tokens.
-   Add safe structured logging.
-   Do not expose service-account credentials to client builds.
-   Do not connect business events yet.

### First acceptance test

``` text
API
 ↓
Firebase Admin
 ↓
FCM
 ↓
one registered browser token
 ↓
notification received
```

Do not proceed to business-event integration until this basic send is
verified.

------------------------------------------------------------------------

# Phase 4 --- Notification Types + Recipient Assignment

**Status: TODO**

This phase is intentionally separate from RBAC.

### RBAC answers

> What may the user do?

### Notification assignment answers

> What notification is the user allowed/expected to receive?

These must not be conflated.

## Notification Type

Create a controlled set of notification types, for example:

``` text
NEW_LEAD
LEAD_ASSIGNED
CALIBRATION_ASSIGNED
REPORT_READY
```

The exact list must be finalized before implementation.

## Recipient Assignment

Admin/authorized management users need a UI to determine which users
receive each notification type.

Conceptual UI:

``` text
Notification: New Lead

☑ Afriza
☑ Sales A
☐ Sales B
☐ Technician A

[Save]
```

Another notification can have a different recipient set.

### Recommended data model concept

``` text
NotificationType
        ↓
NotificationRecipient
        ↓
User
```

`NotificationRecipient` should represent the assignment of a user to a
notification type, including whether the assignment is enabled.

Do NOT implement this as a single global:

``` text
User.receive_notifications = true
```

because notification eligibility is type-specific.

### Important

Notification assignment is **not** the same as:

-   Role
-   Permission
-   Company membership
-   FCM token

------------------------------------------------------------------------

# Phase 5 --- Notification Targeting / Recipient Resolution

**Status: TODO**

Once notification types and assignments exist:

``` text
Business Event
      ↓
Notification Type
      ↓
Find assigned users
      ↓
Find their active FCM tokens
      ↓
Send through Firebase Admin
```

Example:

``` text
NEW_LEAD
   ↓
assigned recipients:
   User A
   User B
   ↓
FCM tokens:
   User A → desktop token
   User A → mobile token
   User B → desktop token
   ↓
FCM
```

The backend remains authoritative for recipient selection.

------------------------------------------------------------------------

# Phase 6 --- Foreground & Background Notification UX

**Status: TODO**

Handle both:

### Foreground

``` text
FCM
 ↓
Web application
 ↓
foreground message handler
 ↓
in-app notification/UI
```

### Background / inactive

``` text
FCM
 ↓
Service Worker
 ↓
browser notification
```

Also implement/test:

-   title
-   body
-   icon
-   click action
-   deep link to relevant MedCal page
-   duplicate notification prevention where necessary

------------------------------------------------------------------------

# Phase 7 --- Business Event Integration

**Status: TODO**

Start with the most important event:

## New Lead

``` text
New Lead created
      ↓
NEW_LEAD notification type
      ↓
Resolve assigned recipients
      ↓
Resolve active FCM tokens
      ↓
Firebase Admin
      ↓
Push notification
```

Example notification:

``` text
New Lead

Permintaan kalibrasi baru dari RS XYZ.
```

The initial implementation should target only the users assigned to
`NEW_LEAD`.

Do not broadcast to all users.

### Transaction rule

Push delivery is a side effect.

A failed push must not roll back a successful business transaction.

Example:

``` text
Create Lead
   ↓
DB transaction succeeds
   ↓
Push attempt
   ↓
FCM failure
```

The Lead must remain created.

------------------------------------------------------------------------

# Phase 8 --- Technician PWA Integration

**Status: TODO**

Target:

``` text
technician.kalibrasimedika.co.id
```

Technician flow:

``` text
Business event
 ↓
API
 ↓
Recipient targeting
 ↓
Firebase Admin
 ↓
FCM
 ↓
Technician mobile browser/PWA
 ↓
Notification
 ↓
Open assigned task
```

Potential future events:

-   calibration task assigned
-   schedule changed
-   report ready
-   other technician-specific events

Only implement events that have a defined business requirement.

------------------------------------------------------------------------

# Phase 9 --- End-to-End Testing

**Status: TODO**

Required tests:

### Registration

``` text
Browser → getToken → API → DB
```

### Single-token delivery

``` text
API → FCM → Browser
```

### Multi-device

One user with multiple active tokens receives the intended notification
on all eligible devices.

### Recipient isolation

If:

``` text
NEW_LEAD → User A
```

then User B must not receive the notification.

### RBAC isolation

A user without the management capability to change notification
assignments must not be able to modify recipient assignments.

### Invalid token

Invalid/unregistered tokens must be handled without breaking
notification processing.

### Background delivery

Notification must arrive while the PWA is inactive, subject to
browser/OS permissions.

### Click action

Clicking the notification must open the intended MedCal route.

------------------------------------------------------------------------

# Phase 10 --- Production Hardening

**Status: TODO**

Finalize:

-   structured FCM logging
-   token cleanup/deactivation
-   invalid-token handling
-   retry strategy where justified
-   monitoring
-   notification failure metrics
-   credential protection
-   safe logging (never log full FCM tokens unnecessarily)
-   authorization around Notification Recipient Management
-   operational documentation

------------------------------------------------------------------------

## 3. Important Design Boundaries

### RBAC

``` text
"Can this user perform action X?"
```

### Notification Assignment

``` text
"Should this user receive notification type Y?"
```

### FCM Token

``` text
"Which browser/device can receive notification for this user?"
```

These are three different layers.

------------------------------------------------------------------------

## 4. Recommended Implementation Order

Do not jump directly from token registration to New Lead notifications.

Use this order:

``` text
✅ Web SDK + token registration

→ Backend can send one test notification

→ Notification Type model

→ Notification Recipient Assignment UI

→ Recipient resolution

→ Token lifecycle handling

→ Foreground/background UX

→ New Lead integration

→ Technician-specific events

→ E2E testing

→ Production hardening
```

This sequencing keeps debugging isolated by layer and prevents
business-event debugging from being mixed with Firebase infrastructure
debugging.

------------------------------------------------------------------------

## 5. Current Milestone

**FCM client registration infrastructure is production-verified.**

The next implementation target is:

> **Phase 3 --- Backend FCM Sending**

After Phase 3 is proven, implement:

> **Phase 4 --- Notification Types + Recipient Assignment**

Only after those are stable should `NEW_LEAD` be connected to push
delivery.
