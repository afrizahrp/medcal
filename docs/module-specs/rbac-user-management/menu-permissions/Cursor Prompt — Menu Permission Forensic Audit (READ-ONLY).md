# Cursor Prompt — Menu Permission Forensic Audit (READ-ONLY)

## OBJECTIVE

Perform a **read-only forensic audit** of the current MedCal menu/navigation and authorization architecture.

The purpose of this audit is to determine:

1. How menu/navigation is currently modeled and implemented.
2. How menu visibility is currently determined.
3. How the existing RBAC permission system is currently modeled and enforced.
4. Whether menu visibility is currently role-based, permission-based, or a mixture.
5. Whether the legacy `sys_Menu` / `sys_MenuPermission` concept can be adopted by MedCal.
6. Which parts of the legacy design are compatible with MedCal.
7. Which parts are incompatible, redundant, unsafe, or unnecessary.
8. Whether MedCal actually needs database-driven menu definitions.
9. Whether a `MenuPermission` mapping is required.
10. What the minimum architectural change would be if Menu Permission is implemented.
11. What must NOT be changed because the existing G1–G5 User Management + RBAC architecture is already finalized.

**THIS IS AN AUDIT ONLY.**

Do not implement anything.

Do not modify code.

Do not modify schema.

Do not create migrations.

Do not create new tables.

Do not create new permissions.

Do not rename existing permissions.

Do not refactor existing RBAC.

Do not redesign Better Auth.

Do not redesign `UserMembership`.

Do not introduce a new role system.

Do not introduce a parallel authorization system.

Do not "improve" unrelated code.

---

# 1. CURRENT ARCHITECTURAL BASELINE — MUST BE PRESERVED

The current MedCal User Management + RBAC implementation has already passed the G1–G5 implementation/audit phase.

Treat the following as **LOCKED architecture** unless repository evidence proves an actual defect relevant to Menu Permission.

### Authentication

Better Auth is the authentication/session layer.

Do not replace or extend it with another authentication mechanism.

### Role authority

The authoritative role source is:

`UserMembership.role`

There is no second `User.role` authorization model.

### Permission authority

The existing permission mechanism is:

`createAccessControl`
+
`hasPermission`
+
`CompanyRoleGuard`
+
`@RequirePermission`

Do not introduce another permission engine.

### Tenant authority

Company context is server-controlled through:

`process.env.COMPANY_ID`

Do not introduce client-controlled `company_id`.

Do not trust:

- request body company_id
- query-string company_id
- browser state
- localStorage
- frontend role state

### G5 lifecycle

Application access requires:

`User.status === ACTIVE`

AND

a valid `UserMembership` for the active `COMPANY_ID`.

The lifecycle is:

```text
REGISTER
→ User = INVITED
→ no membership
→ no application access

ADMIN PROVISIONING
→ UserMembership created
→ User = ACTIVE
→ application access

ACTIVE
→ DISABLED
→ no application access

DISABLED
→ ACTIVE
→ access restored
```

Do not alter this architecture.

---

# 2. IMPORTANT DISTINCTION

The audit MUST explicitly distinguish these concepts:

```text
Authentication
Role
Permission
Menu
Menu visibility
Page access
Action authorization
Tenant isolation
```

Do not assume that:

```text
visible menu = authorized action
```

and do not assume:

```text
hidden menu = security boundary
```

The backend remains authoritative.

Menu visibility is primarily a UX/navigation concern unless the repository demonstrates another explicit architectural purpose.

---

# 3. INSPECT CURRENT MENU IMPLEMENTATION

Systematically inspect the repository for all menu/navigation definitions.

At minimum investigate:

- `apps/portal/src/app/management/nav-config.ts`
- `apps/portal/src/app/management/layout.tsx`
- `apps/portal/src/app/client/nav-config.ts`
- `apps/portal/src/app/client/...`
- `apps/portal/src/proxy.ts`
- any shared navigation components
- any sidebar/menu components
- any route configuration
- any permission utility used by frontend
- any role filtering helper
- any menu-related database model
- any seed/bootstrap menu data
- any hardcoded navigation arrays

Search the entire repository rather than assuming the above files are exhaustive.

Report the actual files discovered.

---

# 4. MAP CURRENT MENU STRUCTURE

Produce a factual inventory of current menus.

For every menu item discovered, report:

| Field | Value |
|---|---|
| Menu label | |
| Route / href | |
| Parent | |
| Application area | |
| Current visibility rule | |
| Role restriction | |
| Permission restriction | |
| Backend authorization | |
| Notes | |

Do not invent missing values.

If a menu has no explicit permission requirement, state:

`NONE FOUND`

If visibility is controlled by role, report the exact roles.

Do not normalize role names.

---

# 5. CURRENT FRONTEND AUTHORIZATION AUDIT

Determine exactly how frontend menu visibility currently works.

Specifically inspect:

- role-based filtering
- permission-based filtering
- hardcoded role checks
- hardcoded email checks
- localStorage authorization
- session-derived authorization
- client-side permission state
- route-based authorization
- proxy/middleware behavior

Determine whether the frontend currently uses:

```text
Role
Permission
Role + Permission
Hardcoded condition
No authorization filtering
```

for each navigation area.

Pay special attention to:

`filterNavByRole`

and determine exactly where and how it is used.

Do not change it.

---

# 6. BACKEND PAGE / API AUTHORIZATION AUDIT

For every currently visible management menu, trace the corresponding backend API/page authorization.

Determine:

1. Is authentication required?
2. Is membership required?
3. Is `User.status === ACTIVE` enforced?
4. Is permission enforced?
5. Is `CompanyRoleGuard` used?
6. Is tenant scope enforced?
7. Can a user manually enter the URL?
8. If the menu is hidden, does the backend still protect the resource?

Build a matrix:

| Menu | Route | Backend Resource | Auth | ACTIVE | Membership | Permission | Guard | Tenant Safe | Result |
|---|---|---|---|---|---|---|---|---|---|

The goal is to prove:

```text
Menu visibility ≠ security boundary
Backend authorization = security boundary
```

---

# 7. CURRENT PERMISSION CATALOG

Inspect the actual current permission definitions.

Use the repository as the source of truth.

Report the exact resource/action strings.

The existing catalog currently includes permissions such as:

```text
contactMessage:read
whitelist:manage
lead:read
lead:update
chat:read
chat:reply
chat:close
users:read
users:manage
membership:manage
```

However:

**DO NOT ASSUME THIS LIST IS COMPLETE.**

Verify the repository and report the actual current catalog.

Do not rename or normalize permission names.

Do not create new permissions during this audit.

---

# 8. CURRENT ROLE → PERMISSION MATRIX

Extract the actual role-to-permission relationship.

Produce:

| Role | Permission |
|---|---|
| SUPERADMIN | |
| ADMIN | |
| SUPERVISOR | |
| TECHNICIAN | |
| FINANCE | |
| CUSTOMER | |

Only report what actually exists in code.

If a role has `{}` permissions, report `{}`.

Do not assign hypothetical business permissions.

---

# 9. LEGACY DESIGN REVIEW

The following legacy design is provided as a **reference only**.

It MUST NOT be copied or implemented.

## Legacy `sys_Menu`

Conceptually contains:

```text
id
parent_id
menu_description
href
module_id
menu_type
has_child
icon
iStatus
createdBy
createdAt
updatedBy
updatedAt
company_id
branch_id
```

The legacy system also had:

```text
sys_MenuPermission
```

with:

```text
id
userCompanyRole_id
menu_id
can_view
can_create
can_edit
can_delete
can_print
can_approve
iStatus
createdBy
createdAt
updatedBy
updatedAt
company_id
branch_id
```

This legacy structure is **NOT an implementation specification**.

It is an object for architectural comparison only.

---

# 10. LEGACY `sys_Menu` COMPATIBILITY ANALYSIS

For every legacy field, classify whether it should be:

- KEEP
- MODIFY
- REMOVE
- NOT NEEDED
- UNVERIFIED

Create this table:

| Legacy field | MedCal applicability | Recommendation | Reason |
|---|---|---|---|
| id | | | |
| parent_id | | | |
| menu_description | | | |
| href | | | |
| module_id | | | |
| menu_type | | | |
| has_child | | | |
| icon | | | |
| iStatus | | | |
| createdBy | | | |
| createdAt | | | |
| updatedBy | | | |
| updatedAt | | | |
| company_id | | | |
| branch_id | | | |

Important:

Do not automatically recommend `company_id` or `branch_id`.

Determine whether they are actually necessary in MedCal's current architecture.

Consider the existing server-side tenant model before making a recommendation.

---

# 11. LEGACY `sys_MenuPermission` COMPATIBILITY ANALYSIS

Analyze each legacy concept:

```text
userCompanyRole_id
menu_id
can_view
can_create
can_edit
can_delete
can_print
can_approve
company_id
branch_id
```

Classify each as:

- KEEP
- MODIFY
- REMOVE
- REPLACE WITH EXISTING RBAC
- NOT NEEDED
- UNVERIFIED

Create:

| Legacy concept | MedCal compatibility | Recommendation | Reason |
|---|---|---|---|

Pay special attention to:

```text
can_view
can_create
can_edit
can_delete
can_print
can_approve
```

Determine whether these are appropriate for MedCal's existing permission architecture.

Do NOT assume generic CRUD permissions are sufficient.

Do NOT introduce a new permission table.

Do NOT introduce new permissions merely to make the legacy model fit.

---

# 12. MENU ≠ CRUD PERMISSION

Explicitly investigate whether the legacy model incorrectly couples:

```text
Menu
+
CRUD permissions
```

with:

```text
Business actions
```

Look for existing MedCal actions such as:

```text
assign
convert
reply
close
approve
submit
export
```

Only report actions actually present in the repository.

Determine whether the current permission model already supports these concepts.

Do not create new ones.

---

# 13. DETERMINE THE CORRECT MEDCAL MENU MODEL

Based ONLY on repository evidence and the legacy comparison, determine which architecture is most appropriate:

### Option A

Hardcoded menu configuration + permission-based visibility.

### Option B

Database-driven menu registry + permission mapping.

### Option C

Hybrid model.

Do not choose based on preference.

Provide evidence.

For the selected option explain:

1. Why it fits MedCal.
2. What existing infrastructure can be reused.
3. What would need to change.
4. What would NOT need to change.
5. What risks it introduces.
6. Whether it is necessary now or can wait.

---

# 14. DETERMINE WHETHER `MenuPermission` IS ACTUALLY NECESSARY

This is a key audit question.

Do NOT assume that because the legacy application had:

```text
sys_MenuPermission
```

MedCal must have it.

Determine whether menu visibility can instead be derived from:

```text
Menu
→ required permission
→ existing RBAC permission catalog
→ UserMembership.role
```

or whether there is a genuine requirement for a separate mapping layer.

If a mapping is needed, explain why.

If it is not needed, explain why.

Do not implement either option.

---

# 15. CHECK FOR BUSINESS REQUIREMENTS IMPLIED BY CURRENT UI

Inspect current UI behavior and routes for evidence of:

- menu hierarchy
- modules
- dashboards
- management pages
- technician pages
- customer pages
- role-specific navigation
- company-specific navigation
- branch-specific navigation

Do not invent future requirements.

Clearly distinguish:

```text
FACT
INFERENCE
UNVERIFIED
```

---

# 16. TENANT / COMPANY / BRANCH ANALYSIS

Specifically determine whether Menu configuration needs:

```text
company_id
branch_id
```

Consider the current architecture:

```text
process.env.COMPANY_ID
+
UserMembership
+
CompanyRoleGuard
```

Determine whether menu definitions themselves are tenant data or global application metadata.

Do not assume the legacy answer is still correct.

---

# 17. SECURITY AUDIT

Check for these specific risks:

- frontend-only authorization
- hidden menu treated as security
- hardcoded admin checks
- role spoofing
- permission spoofing
- localStorage authorization
- client-controlled company context
- URL bypass
- API bypass
- menu exposing inaccessible functionality
- frontend/backend permission mismatch
- role/permission duplication
- stale role definitions
- authorization logic duplicated in multiple places

Rank findings:

```text
CRITICAL
HIGH
MEDIUM
LOW
INFORMATIONAL
```

Do not inflate severity.

---

# 18. DO NOT FIX FINDINGS

Even if you discover:

- incorrect menu filtering
- missing permission
- stale navigation
- UX mismatch
- architecture weakness
- security concern

DO NOT FIX IT.

Report it only.

This is a forensic audit.

---

# 19. DO NOT CREATE ANYTHING

During this task:

- no code changes
- no schema changes
- no migration
- no seed changes
- no generated files
- no new permission
- no new menu
- no refactor
- no UI modification
- no tests added
- no dependency changes

You may inspect existing tests and existing database schema definitions.

---

# 20. OUTPUT FORMAT

Return a forensic report with exactly these sections:

## 1. Executive Verdict

Answer:

- Is current Menu access architecture internally consistent?
- Is it role-based or permission-based?
- Is backend authorization safe?
- Is the legacy `sys_Menu` model compatible?
- Is legacy `sys_MenuPermission` compatible?
- Does MedCal need a separate Menu Permission layer?
- What should be preserved?

---

## 2. Current Menu Architecture

Show:

```text
current frontend navigation
→ visibility rule
→ route
→ backend authorization
```

---

## 3. Current Menu Inventory

Table of actual menu items/routes.

---

## 4. Current Permission Catalog

Exact current resource/action strings.

---

## 5. Current Role → Permission Matrix

Exact current roles and grants.

---

## 6. Menu → Backend Authorization Matrix

Include:

- auth
- ACTIVE
- membership
- permission
- guard
- tenant scope

---

## 7. Legacy `sys_Menu` Compatibility

Field-by-field analysis.

---

## 8. Legacy `sys_MenuPermission` Compatibility

Field/concept-by-concept analysis.

---

## 9. Menu vs Permission Architecture

Clearly explain:

```text
Menu
vs
Permission
vs
Role
vs
Authorization
```

---

## 10. Tenant / Company / Branch Analysis

Determine whether menu definitions should be global or tenant-specific.

---

## 11. Security Findings

Ranked findings with:

- severity
- file
- component/function
- evidence
- impact

---

## 12. Architecture Recommendation

Recommend ONE of:

```text
A. Hardcoded menu + permission visibility
B. Database-driven menu + permission mapping
C. Hybrid
```

Explain why.

Do NOT implement it.

---

## 13. What Can Be Reused

Explicitly list existing MedCal components that should remain unchanged.

For example:

```text
Better Auth
UserMembership.role
createAccessControl
hasPermission
CompanyRoleGuard
@RequirePermission
COMPANY_ID
G1–G5 lifecycle
```

Only include components confirmed in the repository.

---

## 14. What Should NOT Be Adopted From Legacy

Explicitly identify legacy concepts that should not be carried into MedCal.

Especially evaluate:

```text
company_id on menu
branch_id on menu
company_id on permission
branch_id on permission
can_view
can_create
can_edit
can_delete
can_print
can_approve
userCompanyRole_id directly on menu permission
```

---

## 15. Implementation Prerequisites

List ONLY the decisions that must be made before implementation.

Do not implement them.

---

## 16. Exact Files Likely To Change

Identify the actual files that would likely need modification in a future implementation.

Separate:

```text
Almost certainly
Possibly
Do not touch
```

---

# 21. EVIDENCE RULE

Every important conclusion must be supported by repository evidence.

For every finding provide:

```text
FACT / INFERENCE / GAP / RISK
file path
class/function/component
actual behavior
why it matters
```

If repository evidence is insufficient:

`UNVERIFIED — requires confirmation`

Do not invent architecture.

Do not infer product requirements merely because the legacy system had them.

---

# 22. FINAL HARD CONSTRAINT

The purpose of this task is NOT to build Menu Permission.

The purpose is to answer:

> **"Given the already-final MedCal User Management + RBAC implementation, what is the correct Menu Permission architecture, and which parts of the old `sys_Menu` / `sys_MenuPermission` design can legitimately be reused?"**

Do not answer this by designing from scratch.

First inspect the actual repository.

Then compare it with the legacy model.

Then produce the forensic recommendation.

**STOP after the audit report.**

Do not implement anything.