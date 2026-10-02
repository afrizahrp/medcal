We need a **COMPREHENSIVE FORENSIC AUDIT** of the Contact Message / Lead flow.

This is an **AUDIT / INVESTIGATION ONLY**.

### ABSOLUTE RULES

DO NOT:

* modify code
* refactor code
* fix bugs
* add tests
* change routes
* change database schema
* change UI
* change configuration
* change deployment
* install dependencies
* remove code
* commit anything

Do not implement any recommendation.

The only output should be a detailed audit report with evidence, findings, root causes, dependencies, risks, and recommended remediation directions.

---

# IMPORTANT SCOPE CHANGE

For this audit, **FCM / Firebase Cloud Messaging is OUT OF SCOPE**.

Do not investigate or modify:

* FCM registration
* FCM token handling
* Firebase messaging
* notificationclick
* service-worker push handling
* FCM notification dispatch
* browser push subscription
* push notification delivery

If FCM-related code appears while tracing the system, note it as:

> OUT OF SCOPE — FCM

and continue tracing the non-FCM flow.

Do NOT let FCM findings dominate or expand the audit.

---

# PRIMARY OBJECTIVE

Audit the complete **Contact Message / Lead lifecycle** and determine whether the following four areas are correctly connected and operational:

1. **IMAP**
2. **Notification Dispatch**
3. **Contact Message Push**
4. **Registration Origin**

Additionally, audit their relationship with:

5. Contact Message ingestion
6. Lead creation / persistence
7. Lead/message association
8. Management Leads UI
9. `/leads` routing
10. Background polling / realtime update mechanisms
11. Email/message processing
12. Retry / failure handling
13. Idempotency / duplicate prevention
14. Queue / worker / asynchronous processing, if present
15. Database persistence and transaction boundaries
16. Relevant production configuration

The goal is to understand the **actual architecture and runtime flow**, not merely verify that files/classes/functions exist.

---

# PART 1 — MAP THE ACTUAL ARCHITECTURE

First, build a complete dependency map.

Identify:

* frontend application(s)
* backend application(s)
* database
* IMAP integration
* email parser
* Lead module
* Contact Message module
* notification dispatch mechanism
* contact-message push/update mechanism
* polling mechanism, if any
* websocket/SSE mechanism, if any
* queue/worker mechanism, if any
* scheduled jobs / cron, if any
* management Leads UI
* `/leads` route and proxy
* relevant environment variables
* relevant production services/processes

Do not assume architecture from filenames.

Trace actual imports, calls, registrations, providers, workers, schedulers, and runtime configuration.

Produce an architecture diagram such as:

```text
External Source
      ↓
    IMAP
      ↓
Message ingestion
      ↓
Parser / normalization
      ↓
Lead / Contact Message persistence
      ↓
┌───────────────┬───────────────────┐
│               │                   │
Notification    Contact Message     Other
Dispatch        Push/Update         consumers
│               │
└───────┬───────┘
        ↓
Management Leads UI
        ↓
/leads routing
```

Replace this with the actual architecture discovered.

---

# PART 2 — IMAP AUDIT

Audit the complete IMAP pipeline.

Determine:

### Connection

* Which service/module connects to IMAP?
* Which library is used?
* Which host/port/security mode?
* Which environment variables control it?
* How is authentication handled?
* How often is the mailbox checked?
* Is it polling, IDLE, scheduled job, or another mechanism?

### Message ingestion

Trace:

```text
IMAP mailbox
    ↓
message retrieval
    ↓
message parsing
    ↓
sender/recipient extraction
    ↓
subject/body extraction
    ↓
attachments, if applicable
    ↓
Lead / Contact Message creation
```

Determine exactly where each step occurs.

### Failure handling

Check:

* connection failures
* authentication failures
* malformed emails
* malformed MIME
* duplicate emails
* timeouts
* partial processing
* retry behavior
* logging
* recovery after process restart

### Idempotency

Determine how the system prevents the same email from creating duplicate:

* Lead
* Contact Message
* notification
* push/update

Identify the exact deduplication key/mechanism.

### Production configuration

Determine whether the required IMAP configuration actually exists in:

* `.env`
* `.env.example`
* `.env.production.example`
* deployment configuration
* worker configuration
* container/process configuration

Do not expose secrets.

Report only variable names and whether required values appear configured.

---

# PART 3 — CONTACT MESSAGE / LEAD PERSISTENCE

Trace exactly what happens after an incoming message is accepted.

Determine:

```text
incoming message
    ↓
Lead?
Contact Message?
Conversation?
Existing Lead lookup?
New Lead?
Existing conversation?
```

Answer precisely:

1. When is a Lead created?
2. When is a Contact Message created?
3. Can multiple messages belong to one Lead?
4. How is an existing Lead identified?
5. How is a new Lead identified?
6. How are sender/email addresses matched?
7. What happens when matching fails?
8. What happens when matching is ambiguous?
9. What happens when the same message arrives twice?
10. What database transaction boundaries exist?

Inspect:

* Prisma schema
* repositories/services
* controllers
* workers
* jobs
* database constraints
* unique indexes
* transaction usage

Identify any race conditions or duplicate-processing risks.

---

# PART 4 — REGISTRATION ORIGIN AUDIT

Audit **registration-origin** specifically.

Determine:

* What does `registration-origin` mean in this codebase?
* Where is it defined?
* What values can it have?
* Where is it assigned?
* Where is it persisted?
* Where is it read?
* Is it derived from:

  * website registration
  * contact form
  * email
  * customer registration
  * another source?

Trace the full lifecycle:

```text
origin detected
    ↓
origin normalized
    ↓
origin persisted
    ↓
origin exposed through API
    ↓
origin consumed by UI/business logic
```

Determine whether origin can be:

* missing
* incorrect
* overwritten
* inconsistent
* lost during conversion
* lost during message ingestion

Search for all references and identify whether there are multiple competing definitions of "origin".

If there are enum/string mismatches, identify them.

---

# PART 5 — NOTIFICATION DISPATCH AUDIT

IMPORTANT:

Audit **notification dispatch**, but NOT FCM.

We need to understand the application-level notification/event dispatch pipeline independently of delivery through Firebase.

Determine:

* What event triggers notification dispatch?
* Where is the event emitted?
* What service receives it?
* What payload is constructed?
* Who are the recipients?
* How are recipients determined?
* How is notification state persisted?
* Is dispatch synchronous or asynchronous?
* Is there a queue?
* Is there retry?
* Is there idempotency?
* Can the same Lead/message generate duplicate notifications?
* What happens if dispatch fails?
* Does notification failure affect Lead/message persistence?

Trace:

```text
Lead / Contact Message event
        ↓
notification event
        ↓
dispatch service
        ↓
recipient resolution
        ↓
notification record / delivery mechanism
```

Again:

DO NOT follow into FCM implementation.

Stop at the application-level notification dispatch boundary and explicitly mark FCM as OUT OF SCOPE.

---

# PART 6 — CONTACT MESSAGE PUSH / UI UPDATE AUDIT

Audit how the Management UI learns that a new Contact Message exists.

Do NOT assume this is FCM.

Identify the actual mechanism:

* polling
* websocket
* SSE
* server action
* query invalidation
* React Query
* custom event
* database polling
* another mechanism

Trace:

```text
new Contact Message persisted
        ↓
backend signal / endpoint
        ↓
frontend query/update mechanism
        ↓
Leads UI state update
        ↓
user sees new message
```

Determine:

1. How quickly does the UI discover new messages?
2. What endpoint/query is used?
3. What triggers refresh?
4. Is there caching?
5. What is the stale time?
6. What happens after tab backgrounding?
7. What happens after network interruption?
8. What happens after browser refresh?
9. Can messages be missed?
10. Can messages appear twice?
11. Is pagination/cursor handling correct?
12. Does the UI recover automatically?

Explicitly distinguish this mechanism from FCM.

---

# PART 7 — MANAGEMENT LEADS UI

Audit the frontend side.

Inspect:

* `/management/leads`
* Lead detail
* Contact Message list
* Contact Message detail
* message query hooks
* mutation hooks
* notification indicators
* unread counts
* refresh behavior
* loading states
* error states
* empty states

Trace which API endpoints are actually called.

Verify that the frontend is using the correct backend origin.

Identify:

* stale endpoints
* incorrect URLs
* `/api` prefix assumptions
* incorrect route assumptions
* mismatched response schemas
* missing error handling

---

# PART 8 — `/leads` ROUTING

Use the previous `/leads` investigation as context, but audit it again in relation to the complete Lead flow.

Verify:

```text
/management/leads
      ↓
proxy.ts
      ↓
host group
      ↓
management/client
```

Determine whether the `/leads` 404 issue is:

* independent from Contact Message ingestion
* independent from Lead persistence
* independent from notification dispatch
* independent from Contact Message push
* or actually coupled to any of them.

Do NOT assume the previous 404 finding is the root cause.

Require runtime evidence where possible.

---

# PART 9 — END-TO-END TRACE

Construct at least these complete scenarios.

## Scenario A — Website Contact Message

```text
Audience/customer
    ↓
website
    ↓
contact form
    ↓
backend
    ↓
Lead/Contact Message
    ↓
database
    ↓
notification dispatch
    ↓
management UI update
    ↓
management user sees message
```

For every arrow identify:

* actual code
* actual endpoint/function
* data structure
* failure behavior

---

## Scenario B — Incoming Email

```text
External sender
    ↓
email
    ↓
IMAP
    ↓
message parser
    ↓
Lead/Contact Message
    ↓
database
    ↓
notification dispatch
    ↓
management UI update
```

Trace every step.

---

## Scenario C — Existing Lead receives another message

Determine:

```text
incoming message
    ↓
existing Lead identification
    ↓
new Contact Message
    ↓
same Lead
    ↓
notification
    ↓
UI update
```

Verify that a second message does NOT accidentally create a duplicate Lead.

---

# PART 10 — FAILURE MATRIX

Create a table covering at least:

| Failure                          | Expected behavior | Actual behavior | Evidence | Severity |
| -------------------------------- | ----------------- | --------------- | -------- | -------- |
| IMAP unavailable                 |                   |                 |          |          |
| IMAP authentication failure      |                   |                 |          |          |
| malformed email                  |                   |                 |          |          |
| duplicate email                  |                   |                 |          |          |
| DB failure                       |                   |                 |          |          |
| Lead creation failure            |                   |                 |          |          |
| Contact Message creation failure |                   |                 |          |          |
| notification dispatch failure    |                   |                 |          |          |
| UI update failure                |                   |                 |          |          |
| `/leads` route failure           |                   |                 |          |          |
| network interruption             |                   |                 |          |          |
| worker restart                   |                   |                 |          |          |

Do not assign severity casually.

Explain the concrete user/business impact behind each severity.

---

# PART 11 — PRODUCTION READINESS

Inspect relevant production configuration.

Check:

* environment variables
* worker processes
* PM2/systemd/docker processes
* cron/scheduler
* IMAP configuration
* notification infrastructure
* API URL
* frontend URL
* reverse proxy
* database connectivity
* queue configuration
* process restart behavior

Do not modify anything.

Identify configuration that is:

* required
* optional
* missing
* ambiguous
* environment-specific
* documented but not actually wired

---

# PART 12 — GIT / REGRESSION HISTORY

Inspect Git history for:

* IMAP
* Lead inbox
* Contact Message
* registration-origin
* notification dispatch
* polling/realtime update
* routing
* proxy
* related migrations

Determine:

1. When each subsystem was introduced.
2. Whether later commits changed assumptions.
3. Whether there are signs of partial migrations.
4. Whether multiple implementations coexist.
5. Whether old code paths remain active.
6. Whether any recent task could have accidentally affected these flows.

Do not modify Git state.

---

# PART 13 — CRITICAL DISTINCTION

Do NOT conflate these concepts:

### A. Message ingestion

"Did we receive and persist the message?"

### B. Notification dispatch

"Did the application generate/distribute a notification event?"

### C. Contact Message push/update

"Did the Management UI learn that a new message exists?"

### D. FCM

"Did Firebase/browser push deliver a notification?"

For this audit:

```text
A = IN SCOPE
B = IN SCOPE
C = IN SCOPE
D = OUT OF SCOPE
```

A failure in D must NOT be used to explain a failure in A/B/C unless there is direct architectural evidence.

---

# PART 14 — REQUIRED FINAL REPORT

Produce a comprehensive report with:

## 1. Executive Summary

State whether the end-to-end Contact Message / Lead pipeline is currently:

* operational
* partially operational
* unreliable
* broken

Do not give a simplistic yes/no without explaining the evidence.

## 2. Actual Architecture

Include a diagram.

## 3. Component-by-component audit

### IMAP

### Lead / Contact Message persistence

### Registration Origin

### Notification Dispatch

### Contact Message Push / UI update

### Management Leads UI

### `/leads` routing

## 4. End-to-end flows

Website → Lead → UI

Email → Lead → UI

Existing Lead → additional message → UI

## 5. Failure matrix

## 6. Data integrity risks

Specifically identify:

* duplicates
* lost messages
* orphaned messages
* incorrect Lead association
* incorrect registration origin

## 7. Reliability risks

Specifically identify:

* missed messages
* duplicate notifications
* stale UI
* retry gaps
* worker restart issues
* race conditions

## 8. Production configuration risks

## 9. Git/history findings

## 10. Confirmed findings

Only findings directly supported by evidence.

## 11. Probable findings

Clearly distinguish inference from confirmed facts.

## 12. Unknowns / evidence gaps

Explicitly list what cannot be determined without runtime logs, production access, or reproduction.

## 13. Recommended remediation

Describe WHAT should be fixed and WHY.

DO NOT implement anything.

## 14. Priority

Categorize findings into:

### BLOCKER

Prevents a core business flow from functioning.

### HIGH

Can cause data loss, missed messages, incorrect Lead association, or serious user-facing failure.

### MEDIUM

Functional degradation or reliability issue with workaround.

### LOW

Technical debt, noise, maintainability, or non-critical UX issue.

Do not inflate severity.

---

# FINAL REQUIRED CONCLUSION

End the report with these exact sections:

## CORE BUSINESS FLOW STATUS

Answer separately:

1. Can a website visitor/customer submit a Contact Message?
2. Is the message persisted?
3. Is it associated with the correct Lead?
4. Is registration-origin preserved correctly?
5. Is application-level notification dispatch triggered?
6. Does the Management UI receive/update the Contact Message?
7. Can a management user open the Leads UI?
8. Can the `/leads` routing issue interfere with any of the above?
9. Is there any confirmed blocker?
10. Is there any data-integrity risk?

## ROOT CAUSE SUMMARY

For every confirmed issue:

> **Issue → Trigger → Root Cause → Impact → Evidence**

## IMPLEMENTATION ORDER

Give the recommended order of remediation, but DO NOT implement anything.

Explicitly separate:

* Must fix before continuing feature development
* Can defer to hardening
* Technical debt
* Out of scope (FCM)

Again:

**AUDIT ONLY. ZERO CODE CHANGES.**
