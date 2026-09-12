You are auditing the existing **MedCal User Management + RBAC implementation**.

## OBJECTIVE

Perform a **read-only forensic audit** of the current implementation.

Do **NOT** implement, refactor, redesign, migrate, or improve anything yet.

Your job is to determine:

1. What User Management functionality already exists.
2. How authentication, users, memberships, roles, permissions, companies, and menu access are currently modeled.
3. Whether the existing RBAC implementation is internally consistent and correctly enforced.
4. What is missing for a production-ready User Management + RBAC feature.
5. Any security, authorization, tenant-isolation, or privilege-escalation risks.
6. Exactly which files/modules would need changes for the next implementation phase.

---

## IMPORTANT CONSTRAINTS

### 1. DO NOT INVENT ARCHITECTURE

Do not introduce:

- a new authentication system
- a second JWT/session mechanism
- a new `User.role`
- a new role table
- a new permission table
- a new `company_id` mechanism
- a parallel RBAC implementation
- client-controlled authorization
- localStorage-based authorization
- frontend-only permission enforcement

Inspect the existing implementation first and work from what is actually present in the repository.

### 2. AUTHENTICATION IS NOT RBAC

The current architecture uses:

- **Better Auth** for authentication/session management.
- **NestJS** for server-side authentication/session validation and authorization.
- RBAC is separate from authentication.
- `UserMembership.role` is the authoritative role source.
- Better Auth access-control statements are used as the permission mechanism.
- NestJS guards enforce the authorization chain.

Do not replace or duplicate this architecture.

### 3. COMPANY / TENANT ISOLATION

The application uses `company_id` / company membership boundaries.

Verify that authorization is based on the authenticated user's actual membership/company context.

Specifically check for any endpoint where:

- `company_id` is trusted directly from the browser without server-side validation.
- a user can override their company context.
- a user can access another company's users/memberships/permissions.
- an ID from another tenant can be queried or modified.
- frontend filtering is being incorrectly relied upon for tenant isolation.

Do not assume that because the frontend hides something, it is secure.

---

# AUDIT SCOPE

Inspect the repository systematically.

Start by identifying:

- authentication implementation
- Better Auth configuration
- session handling
- User model
- UserMembership model
- Company model
- role definitions
- Better Auth access-control statements
- permission definitions
- NestJS guards
- decorators
- authorization helpers/services
- management APIs
- management UI
- navigation/menu configuration
- any existing permission checks
- bootstrap/seed logic
- EmailWhitelist implementation
- existing tests

---

# PART 1 — CURRENT ARCHITECTURE

Produce a factual map of the current implementation.

Document:

### Authentication

- How users authenticate.
- Where sessions are created.
- Where sessions are validated.
- Which layer owns authentication.
- Which layer owns authorization.

### User

Identify:

- User schema/model.
- Important fields.
- Lifecycle/status fields.
- Whether users can currently be created, disabled, deleted, etc.

### Membership

Identify:

- UserMembership schema/model.
- Relationship to User.
- Relationship to Company.
- Role representation.
- Whether one user can belong to multiple companies.
- How membership is resolved during requests.

### Roles

List the actual roles currently present in code/database.

For each role, identify:

- name
- intended responsibility
- current permissions
- where the role is enforced

Do not invent roles that are not currently implemented.

### Permissions

Extract the actual permission/action/resource definitions.

For example, if the code uses:

`users:manage`

or

`whitelist:manage`

report the exact strings.

Do not normalize or rename them.

### Guards

Trace the actual authorization flow.

Show the request path conceptually:

`request → session → user → membership → role → permission → company scope → controller/service`

Use the actual implementation, not an assumed architecture.

---

# PART 2 — USER MANAGEMENT AUDIT

Determine what User Management currently supports.

Check separately:

- list users
- search users
- pagination
- view user
- create user
- invite/register user
- activate user
- deactivate user
- delete user
- reset password
- change password
- change role
- assign company
- remove company membership
- change membership status
- manage email whitelist
- prevent duplicate users
- prevent duplicate memberships

For every capability classify it as:

- IMPLEMENTED
- PARTIALLY IMPLEMENTED
- NOT IMPLEMENTED

For IMPLEMENTED items, cite the exact files and relevant functions/components.

For PARTIALLY IMPLEMENTED items, explain precisely what is missing.

---

# PART 3 — RBAC AUDIT

Audit RBAC end-to-end.

Determine:

### Role authority

Confirm whether `UserMembership.role` is actually the sole role authority.

Look for any conflicting role sources such as:

- `User.role`
- JWT role claims
- session role claims
- frontend role state
- hardcoded admin checks
- email-based authorization
- company-based implicit privilege

Flag every conflicting source.

### Permission enforcement

For each protected management endpoint determine:

- authentication required?
- company membership required?
- role required?
- permission required?
- server-side enforcement present?
- frontend-only enforcement present?

Build a matrix.

Example:

| Endpoint | Auth | Membership | Permission | Server Guard | Tenant Safe | Status |
|---|---|---|---|---|---|---|

Use the actual endpoints discovered in the repository.

---

# PART 4 — MENU / UI ACCESS CONTROL

Audit the frontend menu/navigation system.

Determine:

1. How menus are defined.
2. How menus are shown/hidden.
3. Whether menu visibility is derived from permissions.
4. Whether roles are hardcoded in the frontend.
5. Whether hidden menus are still protected by backend authorization.
6. Whether users can manually navigate to protected URLs despite hidden menus.
7. Whether the frontend permission model matches the backend permission model.

Important:

**Menu visibility is UX, not security.**

Backend authorization must remain authoritative.

Report any mismatch between frontend visibility and backend authorization.

---

# PART 5 — PRIVILEGE ESCALATION AUDIT

Actively look for privilege-escalation paths.

Test/reason through cases such as:

### Case A
Normal user modifies request payload to claim a higher role.

### Case B
User changes `company_id`.

### Case C
User accesses another user's ID belonging to another company.

### Case D
User calls a management endpoint directly instead of using the UI.

### Case E
User manipulates frontend state/localStorage.

### Case F
User has a valid session but insufficient membership role.

### Case G
User has membership in Company A and attempts to access Company B.

### Case H
User attempts to modify their own role into SUPERADMIN.

### Case I
Existing SUPERADMIN endpoint can create another SUPERADMIN unintentionally.

### Case J
Deactivated/non-active membership still authorizes requests.

Do not merely state that these cases are safe.

Trace the actual code path and explain why.

---

# PART 6 — SUPERADMIN RULES

Audit the current SUPERADMIN behavior carefully.

The current system has a bootstrap-created SUPERADMIN.

Determine:

- Where SUPERADMIN is created.
- Whether there is a uniqueness constraint.
- Whether another SUPERADMIN can be created through normal User Management.
- Whether SUPERADMIN can modify its own role.
- Whether SUPERADMIN can create another SUPERADMIN.
- Whether SUPERADMIN is company-scoped.
- Whether SUPERADMIN authorization is role-based or hardcoded.
- Whether the existing behavior matches the intended architecture.

Do not change the behavior.

Only report what currently exists and any risks.

---

# PART 7 — EMAIL WHITELIST

Audit the existing EmailWhitelist implementation.

Verify:

- schema/model
- CRUD endpoints
- permission protecting the endpoints
- relationship to registration
- duplicate handling
- active/inactive behavior
- company scoping
- authorization
- whether client-supplied company_id can bypass tenant boundaries

The existing permission is expected to be:

`whitelist:manage`

Verify this from the actual code rather than assuming it.

---

# PART 8 — SECURITY REVIEW

Look specifically for:

- IDOR
- broken access control
- horizontal privilege escalation
- vertical privilege escalation
- missing authorization guards
- inconsistent guards
- client-controlled company scope
- client-controlled role
- insecure direct object references
- authorization performed after data retrieval
- overly broad Prisma queries
- missing ownership/membership filters
- accidental cross-company data exposure
- dangerous bootstrap behavior
- privilege persistence after membership deactivation

Rank findings:

- CRITICAL
- HIGH
- MEDIUM
- LOW
- INFORMATIONAL

Do not inflate severity.

---

# PART 9 — TEST COVERAGE

Inspect existing tests.

Identify whether tests cover:

- unauthenticated → 401
- insufficient role → 403
- insufficient permission → 403
- authorized same-company request → 200
- cross-company request → 403
- inactive membership
- role escalation
- company_id manipulation
- user-to-user IDOR
- EmailWhitelist authorization

Report missing tests.

Do not create tests yet.

---

# PART 10 — GAP ANALYSIS

At the end, produce a concise gap analysis:

### Already correct

List the parts that should NOT be redesigned.

### Needs correction

List actual defects.

### Missing functionality

List User Management/RBAC capabilities that are not yet implemented.

### Implementation prerequisites

List what must be decided before implementation.

### Recommended implementation order

Give a dependency-aware order for implementing the missing pieces.

Do not write implementation code.

---

# OUTPUT FORMAT

Return a forensic audit report with these sections:

1. **Executive Verdict**
2. **Current Architecture**
3. **User Management Capability Matrix**
4. **RBAC / Permission Matrix**
5. **Menu Access Control Audit**
6. **Tenant Isolation Audit**
7. **Privilege Escalation Findings**
8. **SUPERADMIN Audit**
9. **EmailWhitelist Audit**
10. **Security Findings**
11. **Test Coverage**
12. **Gap Analysis**
13. **Recommended Implementation Sequence**
14. **Exact Files Likely to Change**

For every important finding provide:

- file path
- class/function/component
- what the code currently does
- why it matters
- severity, if applicable

---

## STRICT EXECUTION RULE

This is an **AUDIT ONLY** task.

Do not modify files.

Do not create files.

Do not run migrations.

Do not change database schema.

Do not refactor.

Do not "fix" anything you discover.

Do not silently improve unrelated code.

Do not speculate about intended behavior when repository evidence is available.

If something is unclear, explicitly mark it as:

`UNVERIFIED — requires confirmation`

The final report must distinguish clearly between:

- **FACT — verified from repository**
- **INFERENCE — derived from repository behavior**
- **GAP — missing implementation**
- **RISK — security/design concern**

The goal is to establish an accurate baseline before we give Cursor a separate implementation task.