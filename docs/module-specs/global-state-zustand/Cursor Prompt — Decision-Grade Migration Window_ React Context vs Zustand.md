# DECISION-GRADE ARCHITECTURE DECISION
## Migration Window: React Context → Zustand

## Objective

Tentukan secara evidence-based apakah Global Auth/Authz saat ini sebaiknya:

### OPTION A
**KEEP React Context**

atau

### OPTION B
**MIGRATE TO ZUSTAND NOW**

atau

### OPTION C
**KEEP Context temporarily with explicit migration trigger**

Tujuan utama bukan membandingkan library secara umum.

Tujuan utama adalah menentukan:

> **KAPAN migration window paling murah dan paling aman untuk Global Auth/Authz: SEKARANG atau NANTI?**

---

# SOURCE OF TRUTH

Gunakan sumber berikut, dengan prioritas:

1. **Actual repository code**
2. Consumer Footprint Audit — Global Auth & Authz State
3. Forensic Verification Report — Global Auth & Authz Implementation
4. Implementation Report — Global Auth & Authz State
5. Original Audit Report — Global Auth & Authz State
6. Current product/business roadmap yang tersedia di repository

Jika ada conflict:

```text
Actual code
    >
Forensic verification
    >
Consumer footprint audit
    >
Implementation report
    >
Original audit
```

Jangan menganggap report selalu benar.

---

# CURRENT VERIFIED BASELINE

Gunakan baseline berikut sebagai starting point, tetapi **verifikasi kembali terhadap repository**:

```text
CURRENT GLOBAL AUTH/AUTHZ FOOTPRINT

Direct Auth consumers:
9

Indirect Auth consumers:
3

Total Auth consumers:
10 unique components

Direct Authz consumers:
7

Indirect Authz consumers:
3

Total Authz consumers:
9 unique components

Unique runtime consumer components:
12

Unique consumer files:
9

Current domains:
5

High-leverage consumers:
6

Management routes amplified by shared layout:
~20

useAuthz():
0 consumers

useMe():
0 consumers

useRequireSession():
7 consumers
```

Consumer footprint audit menyatakan bahwa sebagian besar Authz saat ini masih dikonsumsi melalui:

```text
useRequireSession()
        ↓
me.capabilities
```

bukan melalui dedicated `useAuthz()`.

**Verifikasi semua angka tersebut.**

---

# FUTURE ROADMAP BASELINE

Gunakan roadmap yang sudah ada:

1. Send quotation
2. Process PO
3. Receipt & calibration result processing
4. Create/post invoice
5. Create/post credit note
6. Create/post payment
7. Reporting
8. CashBank
9. Certification progress
10. Certificate issuance

Consumer footprint audit memperkirakan:

```text
+15–30 Auth/Authz consumers
```

ketika domain-domain tersebut dibangun.

**Jangan menganggap +15–30 sebagai fakta.**

Re-evaluate berdasarkan architecture aktual dan pola module yang sudah ada, terutama Email sebagai existing example.

Mark semua future numbers sebagai:

```text
FORECAST
```

---

# IMPORTANT ARCHITECTURAL POSITION

Jangan menggunakan argumen:

> "Context masih cukup sekarang."

sebagai alasan final.

Itu bukan pertanyaan yang sedang dijawab.

Juga jangan menggunakan:

> "Zustand lebih scalable."

sebagai alasan final.

Itu juga tidak cukup.

Pertanyaan sebenarnya:

```text
CURRENT MIGRATION COST
        vs
EXPECTED FUTURE MIGRATION COST
        vs
COST OF KEEPING CONTEXT
```

Bandingkan ketiganya.

---

# PHASE 1 — Re-Verify Current Implementation

Audit code aktual:

```text
packages/auth
apps/portal
apps/tech-pwa
packages/shared
```

Verifikasi:

- AuthProvider
- AuthContext
- useAuth
- useAuthz
- useMe
- useRequireSession
- Me types
- membership
- capabilities
- provider placement
- current consumers
- current React Query usage

Pastikan tidak ada perubahan baru sejak Consumer Footprint Audit.

Jika ada perubahan:

```text
REPORT BASELINE
vs
CURRENT REPOSITORY
```

laporkan perbedaannya.

---

# PHASE 2 — Identify CURRENT Migration Surface

Hitung secara faktual berapa banyak code yang harus disentuh jika Context → Zustand dilakukan **SEKARANG**.

Hitung:

### Provider layer

- AuthProvider
- AuthContext
- auth client
- shared package exports
- provider tree

### Hooks

- useAuth
- useAuthz
- useMe
- useRequireSession

### Consumers

- direct Auth
- direct Authz
- indirect Authz
- indirect Auth
- FCM consumers
- layout consumers
- header consumers

### Tests

- existing auth tests
- affected tests
- tests that need to be added

### Types

- Me
- MeUser
- MeMembership
- MeCapabilities
- AuthBootstrapStatus

### Package boundaries

- @medcal/auth
- @medcal/shared
- portal
- tech-pwa

Produce:

| Area | Files | Consumers | Complexity | Risk |
|---|---:|---:|---|---|
| Provider | | | | |
| Hooks | | | | |
| Consumers | | | | |
| Types | | | | |
| Tests | | | | |
| FCM | | | | |
| Portal | | | | |
| Tech PWA | | | | |

---

# PHASE 3 — Identify FUTURE Migration Surface

Now model what happens if we **do NOT migrate now**.

Assume the roadmap domains are implemented using the patterns already present in the repository.

For each domain:

```text
Quotation
PO
Receipt
Calibration
Invoice
CN
Payment
Reporting
CashBank
Certification
Certificate
```

determine:

1. expected Auth consumer
2. expected Authz consumer
3. expected shared component consumer
4. likely capabilities
5. whether direct global-state subscription is actually required
6. whether TanStack Query handles the state instead
7. whether the domain increases Context consumer count
8. whether it increases Context provider complexity

Use:

```text
CURRENT PATTERN
```

as the primary basis for forecast.

Do not invent architecture unrelated to the current repository.

---

# PHASE 4 — Migration Window Analysis

Compare three scenarios.

## Scenario A — Migrate NOW

Current footprint:

```text
9 direct Auth
7 direct Authz
12 unique runtime components
9 files
```

Calculate migration surface.

---

## Scenario B — Migrate after 3 major domains

Assume the first 3 major business domains are implemented.

Calculate expected additional:

- consumers
- files
- shared components
- selectors
- capabilities
- tests

Then calculate migration surface.

---

## Scenario C — Migrate after all 10 planned domains

Calculate expected migration surface.

Clearly label assumptions as:

```text
FORECAST
```

---

# PHASE 5 — Migration Cost Matrix

Create:

| Scenario | Consumer Count | Files | Provider Changes | Hook Changes | Test Impact | Risk | Estimated Migration Effort |
|---|---:|---:|---:|---:|---:|---|---|
| Migrate now | | | | | | | |
| After 3 domains | | | | | | | |
| After 10 domains | | | | | | | |

Do not invent precise day estimates unless supported by actual code complexity.

If using estimates, explain assumptions.

Prefer:

```text
LOW
MEDIUM
HIGH
```

and optionally a range.

---

# PHASE 6 — Cost of KEEPING Context

Do not only calculate migration cost.

Calculate the cost of **not migrating**.

Evaluate:

### 1. Provider complexity

Does AuthProvider become responsible for more unrelated client state?

### 2. Context value size

How many independent state dimensions are likely to be exposed?

### 3. Re-render fan-out

How many consumers may receive updates they don't care about?

### 4. Selector limitations

Can individual consumers subscribe selectively?

### 5. Auth/Authz separation

Will we need multiple Contexts?

Example:

```text
AuthProvider
AuthzProvider
NotificationProvider
LeadProvider
...
```

If so, assess whether this is desirable.

### 6. Consumer API churn

If we continue using Context:

```text
useAuth()
useAuthz()
useMe()
useRequireSession()
```

how much API surface accumulates?

### 7. Prop drilling

Will Context actually eliminate current prop drilling as modules grow?

### 8. Cross-app sharing

Portal + tech-pwa + future applications.

### 9. Testing

Does Context introduce increasing provider setup complexity?

---

# PHASE 7 — Cost of Migrating to Zustand NOW

Design a **minimal Zustand target architecture**, conceptually only.

Do NOT modify code.

Determine:

```text
Auth
Authz
Selectors
Actions
Server-state boundary
```

Example conceptual boundary:

```text
Better Auth
    ↓
TanStack Query
    ↓
Zustand
    ↓
Auth/Authz selectors
    ↓
Consumers
```

But do not blindly adopt this example.

Determine the actual best architecture from code.

Important:

**Do not duplicate `/me` server state in both TanStack Query and Zustand without explicit justification.**

Determine which layer owns:

- raw `/me`
- user
- membership
- capabilities
- bootstrap status
- derived selectors

---

# PHASE 8 — TanStack Query Interaction

The current forensic audit identified:

> `/me` still uses `useEffect`, while nav/email already use TanStack Query.

Evaluate this in the architecture decision.

Determine whether:

```text
GET /me
```

should become TanStack Query server state.

Then determine:

```text
What belongs in TanStack Query?
What belongs in Zustand?
What should be derived?
```

Avoid:

```text
TanStack Query
+
Zustand
```

holding duplicate authoritative copies of the same server data unless there is a clear reason.

---

# PHASE 9 — Authz Growth Analysis

This is especially important.

Current:

```text
useAuthz() = 0
```

Most Authz consumers currently access:

```text
useRequireSession()
    ↓
me.capabilities
```

Determine whether this represents a good migration window.

Analyze:

```text
Current:
useRequireSession()
    ↓
me.capabilities
```

versus future:

```text
useAuthz()
    ↓
invoice capabilities
payment capabilities
certificate capabilities
quotation capabilities
...
```

Question:

> **Is it materially cheaper to establish the clean Auth/Authz selector boundary now, before the 10 business domains are implemented?**

Answer with evidence.

---

# PHASE 10 — Performance Analysis

Do not fabricate benchmarks.

Use actual subscription architecture.

Current Context:

```text
all consumers
    ↓
full context value
```

Determine:

- number of direct subscribers
- number of indirect consumers
- number of high-leverage consumers
- likely update fan-out

Then compare conceptually with Zustand selectors.

Classify:

```text
CURRENT IMPACT:
LOW / MEDIUM / HIGH

NEAR-TERM IMPACT:
LOW / MEDIUM / HIGH
```

Do not claim current performance is bad without evidence.

---

# PHASE 11 — Architecture Risk

Evaluate risks of:

## Keep Context

- increasing provider complexity
- increasing consumer count
- re-render fan-out
- migration later
- API churn
- prop drilling
- multiple contexts

## Migrate Zustand Now

- migration bugs
- dependency introduction
- new abstraction
- SSR/client boundaries
- testing
- developer learning curve
- over-centralization
- accidental server-state duplication

Score:

```text
LOW
MEDIUM
HIGH
```

---

# PHASE 12 — Migration Timing Decision

Determine which is the cheapest architectural window:

```text
NOW
```

or:

```text
AFTER 3 DOMAINS
```

or:

```text
AFTER 10 DOMAINS
```

Do NOT automatically choose NOW.

Do NOT automatically defer.

Use actual evidence.

The decision must consider:

```text
migration surface
+
future consumer growth
+
state growth
+
provider complexity
+
re-render exposure
+
testing cost
+
cross-app sharing
+
TanStack Query integration
```

---

# PHASE 13 — Decision Rule

Use this logic:

### Choose MIGRATE NOW if:

- current migration surface is still small;
- future Authz consumer growth is substantial;
- migration later would touch materially more consumers;
- Authz API is still immature (`useAuthz()` has 0 consumers);
- Context provides limited selective subscription;
- Zustand provides meaningful selector/subscription benefits;
- migration can be isolated inside `@medcal/auth`;
- operational/dependency overhead is low;
- total lifecycle cost is lower now.

### Choose KEEP CONTEXT if:

- future consumer growth is low;
- Context remains simple;
- re-render exposure remains immaterial;
- provider complexity remains low;
- migration later is demonstrably still cheap;
- Zustand provides little practical advantage.

### Choose DEFER WITH TRIGGER if:

Context is currently acceptable but there is a clearly identifiable migration point.

If choosing this option, define **objective triggers**, not vague statements.

---

# PHASE 14 — Objective Migration Triggers

If recommending deferment, define triggers such as:

- number of direct subscribers
- number of independent state domains
- number of high-leverage consumers
- provider value complexity
- measurable rerender issue
- number of Authz selectors
- number of applications
- number of contexts required

But:

> Do NOT arbitrarily use `>15 consumers` as a universal rule.

Thresholds must be justified by this codebase.

---

# PHASE 15 — Final Recommendation

Provide ONE primary recommendation:

```text
MIGRATE TO ZUSTAND NOW
```

or:

```text
KEEP REACT CONTEXT
```

or:

```text
KEEP CONTEXT UNTIL [OBJECTIVE TRIGGER]
```

Then explain:

### Why now?

or:

### Why not now?

Use evidence from the actual repository.

---

# PHASE 16 — If Recommendation Is Zustand NOW

Do NOT implement.

Provide migration blueprint:

```text
1. Define Zustand store boundary
2. Define Auth state
3. Define Authz state
4. Define selectors
5. Define Better Auth integration
6. Define TanStack Query integration
7. Migrate existing consumers
8. Migrate FCM
9. Remove Context
10. Test
11. Forensic verification
```

For each step provide:

- affected files
- risk
- verification
- rollback point

Also identify what should remain OUTSIDE Zustand:

- FCM token
- FCM registration status
- navigation server state
- domain data
- permission catalog
- user admin detail
- unread counts

---

# PHASE 17 — Rollback Strategy

If recommending Zustand NOW, define a rollback strategy that allows:

```text
Zustand migration
      ↓
verification fails
      ↓
restore React Context
```

without requiring domain modules to be reverted.

Prefer migration behind a stable API boundary if possible.

---

# FINAL REPORT FORMAT

## 1. Executive Decision

## 2. Verified Current Baseline

## 3. Current Migration Surface

## 4. Future Consumer Forecast

## 5. Scenario A — Migrate Now

## 6. Scenario B — Migrate After 3 Domains

## 7. Scenario C — Migrate After 10 Domains

## 8. Cost of Keeping Context

## 9. Cost of Migrating Now

## 10. TanStack Query Boundary

## 11. Authz Growth Analysis

## 12. Performance / Subscription Analysis

## 13. Risk Matrix

## 14. Migration Window Decision

## 15. Final Recommendation

## 16. If Zustand: Migration Blueprint

## 17. Rollback Strategy

## 18. Verification Criteria

---

# FINAL OUTPUT

End exactly with:

```text
GLOBAL AUTH/AUTHZ — MIGRATION WINDOW DECISION
==============================================

Current verified footprint:
Auth direct: [X]
Authz direct: [X]
Unique runtime consumers: [X]
High-leverage consumers: [X]

Forecast:
Additional consumers: [X–Y]
Planned domains: [X]

Recommended migration window:
[NOW / AFTER 3 DOMAINS / AFTER 10 DOMAINS / OBJECTIVE TRIGGER]

Decision:
[MIGRATE TO ZUSTAND NOW / KEEP REACT CONTEXT / KEEP UNTIL TRIGGER]

Confidence:
[HIGH / MEDIUM / LOW]

Primary reason:
[concise evidence-based explanation]

TanStack Query:
[KEEP / EXPAND]

P0:
[count]

P1:
[count]

P2:
[count]

Code changes made:
NONE

Safe to proceed:
[YES / NO]
```

# ABSOLUTE RULES

1. **DECISION/AUDIT ONLY — DO NOT MODIFY CODE.**
2. Do not install dependencies.
3. Do not implement Zustand.
4. Do not refactor React Context.
5. Do not change API.
6. Do not change database.
7. Do not treat future consumers as current consumers.
8. Verify the current consumer baseline against actual code.
9. Do not use `>15 consumers` as an arbitrary universal threshold.
10. Do not use "Context is simpler" as sufficient reasoning.
11. Do not use "Zustand scales better" as sufficient reasoning.
12. Compare migration cost NOW vs LATER.
13. Include cost of keeping Context, not only cost of migration.
14. Consider Authz growth separately from Auth growth.
15. Treat `useAuthz() = 0` as a potentially important migration-window signal.
16. Keep TanStack Query as the server-state candidate.
17. Do not duplicate server state unnecessarily between TanStack Query and Zustand.
18. Keep Better Auth as authentication authority.
19. Keep backend authorization as security authority.
20. Keep FCM state outside Global Auth/Authz.
21. Domain business data remains outside Global Auth/Authz.
22. Do not introduce Redis, RabbitMQ, Kubernetes, or other infrastructure.
23. Evaluate low-overhead application libraries separately from infrastructure over-engineering.
24. **The purpose is to determine the cheapest safe migration window, not merely whether Context works today.**