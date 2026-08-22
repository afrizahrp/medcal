# FULL UI/UX + ARCHITECTURE RECONNAISSANCE
## Bumi Indah × DashTail × Cursor AI Jobs

We are preparing to polish the UI/UX of the **Cursor AI Jobs** application.

Before making any implementation changes, perform a comprehensive reconnaissance of:

1. **Bumi Indah** — our primary/proven UI/UX and application-shell reference.
2. **DashTail** — our secondary modern dashboard/design reference.
3. **Cursor AI Jobs** — the actual target application whose existing architecture must be preserved.

The goal is:

> Understand → Compare → Decide → Implement later.

This task is **RESEARCH ONLY**.

---

# 0. ABSOLUTE RULES

## DO NOT MODIFY THE CODEBASE

During this reconnaissance:

- DO NOT modify source files.
- DO NOT create files.
- DO NOT delete files.
- DO NOT rename files.
- DO NOT refactor.
- DO NOT install packages.
- DO NOT update dependencies.
- DO NOT modify package.json.
- DO NOT modify configuration.
- DO NOT modify environment files.
- DO NOT modify authentication.
- DO NOT modify proxy/middleware.
- DO NOT modify API routes.
- DO NOT modify database code.
- DO NOT modify Zustand stores.
- DO NOT modify query hooks.
- DO NOT modify cookies/storage handling.
- DO NOT modify UI components.

Do not "fix" anything you discover.

We only want a reconnaissance report.

---

# 1. OVERALL OBJECTIVE

We want to determine what the **best version of Cursor AI Jobs** should look and behave like.

Do NOT simply clone Bumi Indah.

Do NOT simply clone DashTail.

Instead:

### Bumi Indah

Use Bumi Indah as the **primary reference for proven patterns already used successfully in our ecosystem**.

### DashTail

Use DashTail as a **secondary reference for modern dashboard UI/UX ideas**.

### Cursor AI Jobs

Treat the existing Jobs implementation as the **source of truth for its current architecture and business behavior**.

The final result should be a selective combination:

```text
Bumi Indah
    ↓
Proven UX / application-shell patterns

DashTail
    ↓
Modern visual / interaction inspiration

Cursor AI Jobs
    ↓
Existing business logic + protected architecture

        ↓

Target:
Polished Cursor AI Jobs
```

---

# 2. PRIMARY REFERENCE — BUMI INDAH

The Bumi Indah project is available in the workspace:

`D:\website-bumiindah\bumiindah-website.code-workspace`

The deployed application is:

`https://apps.bumiindah.co.id`

Study both the source implementation and the actual running application where useful.

Do not rely solely on screenshots.

---

# 3. BUMI INDAH — AUTHENTICATION TO DASHBOARD

Study the complete flow:

```text
Login
  ↓
Register
  ↓
Authentication
  ↓
Session
  ↓
Authenticated Application Shell
  ↓
Initial Dashboard
```

Do not stop at Login.

---

# 4. BUMI INDAH — LOGIN

Study:

### Visual

- background
- logo
- branding
- typography
- form width
- spacing
- input treatment
- password visibility
- primary button
- secondary actions
- error presentation
- loading state
- responsive behavior

### UX

Trace:

- initial load
- focus
- validation
- submit
- loading
- failed authentication
- successful authentication
- redirect
- refresh
- already-authenticated behavior

Identify reusable patterns.

---

# 5. BUMI INDAH — REGISTER

Study:

- route
- layout
- form structure
- fields
- validation
- password rules
- confirmation
- loading
- error
- success
- redirect
- Login ↔ Register relationship

Determine whether Login and Register share reusable components.

---

# 6. BUMI INDAH — AUTH ARCHITECTURE

Trace the complete authentication lifecycle.

Determine:

- where credentials are submitted
- what the API returns
- how session state is established
- cookie usage
- browser storage usage
- current-user retrieval
- authentication persistence
- refresh behavior
- logout
- unauthenticated redirect
- authenticated route protection

Do not expose credentials, secrets, tokens, or sensitive values.

Describe architecture only.

---

# 7. BUMI INDAH — PROXY / MIDDLEWARE

Locate and understand:

- proxy
- middleware
- route protection
- public routes
- authenticated routes
- redirects
- cookie forwarding
- API forwarding
- authentication checks

Explain responsibilities accurately based on the code.

Do not assume proxy/middleware responsibilities.

---

# 8. BUMI INDAH — ZUSTAND

Identify all relevant Zustand stores.

Study:

- state
- actions
- selectors
- initialization
- hydration
- persistence
- reset
- logout cleanup

Determine:

### What belongs in Zustand?

versus:

### What belongs in server/query state?

Pay special attention to the separation between:

```text
Client/UI State
        ↓
     Zustand

Server/API State
        ↓
    Query Hooks
```

If this separation exists, document it as a reusable architectural pattern.

---

# 9. BUMI INDAH — QUERY HOOKS

Identify:

- query library
- query hooks
- mutation hooks
- query keys
- invalidation
- caching
- refetching
- loading
- error handling

Determine how the application obtains things such as:

- current user
- company/tenant
- permissions
- notifications
- dashboard data

if applicable.

Again distinguish client state from server state.

---

# 10. BUMI INDAH — COOKIES / STORAGE

Study:

- cookies
- localStorage
- sessionStorage
- other browser persistence

Create:

| Mechanism | Purpose | Reader | Writer | Persistence | Security Consideration |
|---|---|---|---|---|---|

Never expose real secrets or token values.

---

# 11. BUMI INDAH — APPLICATION SHELL

Study the initial authenticated dashboard carefully.

The scope specifically includes:

## Sidebar

Study:

- logo
- sidebar dimensions
- expanded state
- collapsed state
- pin button
- **pin button positioned beside/right of the logo**
- hover states
- active states
- icons
- labels
- parent menu
- child menu
- subchild menu
- indentation
- expand/collapse indicators
- navigation behavior
- persistence
- responsive behavior

Pay special attention to:

### Parent → Child → Subchild navigation

Determine:

- how hierarchy is represented
- how active routes propagate
- how parent state behaves when a child is active
- how expansion state works
- how collapsed mode handles nested menus
- whether state is stored/persisted

---

# 12. BUMI INDAH — SIDEBAR INTERACTION

Study separately:

### Hover

What happens when hovering:

- parent
- child
- subchild
- active item
- inactive item

### Active route

How is the current route represented?

Analyze:

- icon
- text
- background
- border
- indicator
- parent highlight
- child highlight

### Collapsed sidebar

Determine:

- label behavior
- tooltip behavior
- nested navigation behavior
- active state
- hover behavior
- icon treatment

---

# 13. BUMI INDAH — HEADER

Study the dashboard header.

Identify:

- company/context indicator
- theme control
- email/message icon
- notification icon
- chat icon
- user avatar
- other controls

For each interactive control determine:

- click behavior
- dropdown
- drawer
- modal
- navigation
- query/state used
- loading state

---

# 14. BUMI INDAH — NOTIFICATIONS

Study the notification interaction.

Determine:

- icon
- unread indicator
- click behavior
- dropdown/drawer
- query hook
- loading
- empty state
- read/unread state
- persistence
- state management

Identify which patterns could be useful for Jobs.

---

# 15. BUMI INDAH — USER MENU / SIGN OUT

Study the avatar interaction.

Analyze:

- avatar
- user identity
- email
- role
- company
- menu/drawer
- sign-out action
- logout API/action
- session cleanup
- Zustand cleanup
- query cleanup
- storage cleanup
- redirect

Document the actual flow.

---

# 16. BUMI INDAH — DESIGN LANGUAGE

Extract the application's design system/patterns:

- color hierarchy
- typography
- spacing
- border radius
- shadows
- borders
- iconography
- hover
- active
- disabled
- transitions
- animation
- density
- component dimensions

Do not merely list CSS values.

Identify the design principles.

---

# 17. SECONDARY REFERENCE — DASHTAIL

Use:

`https://dash-tail.vercel.app/en/dashboard`

DashTail is a **secondary reference only**.

The demo account supplied for interactive exploration is:

Email:

`dashtail@codeshaper.net`

Password:

`password`

Use these credentials ONLY to inspect the public/demo application.

DO NOT:

- put credentials into source code
- create `.env` entries
- commit credentials
- reproduce credentials in the report unnecessarily
- use the credentials anywhere outside DashTail reconnaissance

If the live URL is unavailable or behaves differently from the expected demo, inspect whatever publicly accessible DashTail pages/source/reference are available and clearly state the limitation.

---

# 18. DASHTAIL — STUDY THE DASHBOARD

Explore the authenticated DashTail application where possible.

Study:

### Layout

- overall composition
- content width
- page padding
- sidebar/header relationship
- background
- visual density
- whitespace

### Sidebar

- collapse
- active menu
- hover
- nested menus
- icons
- labels
- spacing
- section grouping
- responsive behavior

### Header

- height
- context area
- notifications
- theme
- profile
- dropdown/popover
- responsive behavior

### Dashboard content

Study:

- page title
- subtitle
- KPI/cards
- badges
- grids
- information hierarchy
- empty states
- responsive layout
- visual density

Only identify patterns that could realistically benefit Jobs.

---

# 19. DASHTAIL — DO NOT OVER-ADOPT

DashTail is a generic admin template.

Identify things that should NOT automatically be copied:

- decorative widgets
- excessive animation
- unnecessary dashboard cards
- unnecessary theme complexity
- generic template conventions
- architecture that Jobs does not need
- unnecessary dependencies
- visual elements without UX value

Separate:

### Useful design pattern

from:

### Template decoration

---

# 20. THREE-WAY DESIGN COMPARISON

Compare:

### Bumi Indah
Proven implementation.

### DashTail
Modern design reference.

### Cursor AI Jobs
Current implementation.

Create:

| Area | Bumi Indah | DashTail | Current Jobs | Best Direction |
|---|---|---|---|---|
| Login | | | | |
| Register | | | | |
| Auth flow | | | | |
| Sidebar | | | | |
| Sidebar collapse | | | | |
| Pin button | | | | |
| Parent menu | | | | |
| Child menu | | | | |
| Subchild menu | | | | |
| Hover | | | | |
| Active route | | | | |
| Header | | | | |
| Notifications | | | | |
| User menu | | | | |
| Sign out | | | | |
| Page header | | | | |
| Cards | | | | |
| Spacing | | | | |
| Typography | | | | |
| Responsive | | | | |

---

# 21. NOW AUDIT CURSOR AI JOBS

After understanding both references, inspect the actual Jobs codebase.

Do NOT modify anything.

First establish:

- framework
- app structure
- routes
- layouts
- authentication implementation
- proxy/middleware
- API architecture
- Zustand
- query hooks
- cookies
- storage
- UI component system
- styling system
- existing application shell

---

# 22. IMPORTANT — CLAUDE CODE ARCHITECTURE IS PROTECTED

The existing Jobs architecture has already been implemented and reviewed through Claude Code.

Treat the following as **protected unless there is an explicit reason to change them**:

- proxy
- middleware
- authentication boundary
- API routing
- server/client boundaries
- cookie handling
- existing query architecture
- Zustand architecture
- security-related code
- tenant/company scoping
- authorization logic

Do not replace an existing architecture simply because Bumi Indah uses a different implementation.

The question is:

> Can the desired UX pattern be implemented ON TOP OF the existing architecture?

Prefer:

```text
Existing architecture
        +
UI/UX improvement
```

instead of:

```text
Existing architecture
        ↓
replace it with another architecture
```

---

# 23. CURSOR JOBS — AUTH AUDIT

Inspect:

- Login
- Register if present
- session
- current user
- cookies
- storage
- authentication API
- redirects
- proxy
- middleware
- logout

Document what is already correct.

Do not redesign it.

---

# 24. CURSOR JOBS — STATE AUDIT

Inspect Zustand.

Determine:

- current stores
- responsibilities
- state shape
- persistence
- hydration
- reset
- relationship with query hooks

Determine whether state responsibilities are cleanly separated.

Do not refactor.

---

# 25. CURSOR JOBS — QUERY AUDIT

Inspect:

- query hooks
- mutations
- query keys
- invalidation
- current-user query
- job queries
- loading/error states

Document the existing patterns.

Do not replace them.

---

# 26. CURSOR JOBS — COOKIE/STORAGE AUDIT

Determine:

- what cookies are used
- what browser storage is used
- why
- where read/write happens
- whether refresh works correctly
- logout cleanup

Never expose secret values.

---

# 27. CURSOR JOBS — CURRENT UI AUDIT

Inspect:

- Login
- Register
- authenticated layout
- sidebar
- header
- dashboard/jobs landing page
- loading states
- empty states
- error states
- responsive behavior

Determine what already exists and what is missing.

---

# 28. ADOPTION MATRIX

Create a final matrix:

| Area | Bumi Indah Pattern | DashTail Pattern | Jobs Current | Recommendation | Architectural Risk |
|---|---|---|---|---|---|
| Login | | | | | |
| Register | | | | | |
| Auth | | | | | |
| Proxy | | | | | |
| Zustand | | | | | |
| Query hooks | | | | | |
| Cookies | | | | | |
| Storage | | | | | |
| Sidebar | | | | | |
| Collapse | | | | | |
| Pin button | | | | | |
| Nested navigation | | | | | |
| Hover | | | | | |
| Active route | | | | | |
| Header | | | | | |
| Notifications | | | | | |
| User menu | | | | | |
| Sign out | | | | | |
| Dashboard | | | | | |
| Responsive | | | | | |

Use:

- **ADOPT**
- **ADAPT**
- **KEEP CURRENT**
- **DO NOT ADOPT**
- **PROTECTED**
- **INVESTIGATE**

---

# 29. PROTECTED ARCHITECTURE MATRIX

Create a separate list:

## "DO NOT TOUCH"

Explicitly identify Jobs code that should remain untouched during UI/UX polishing.

Especially:

- proxy
- authentication boundary
- API routing
- cookies
- query architecture
- Zustand architecture
- security controls
- tenant/company scope
- authorization

Explain why each is protected.

---

# 30. SAFE UI/UX CHANGE MATRIX

Then identify:

## "SAFE TO POLISH"

Examples:

- typography
- spacing
- colors
- button styling
- input styling
- card styling
- sidebar appearance
- sidebar hover
- sidebar active state
- sidebar collapse presentation
- header appearance
- profile menu presentation
- loading states
- empty states
- error presentation
- responsive layout

For each item explain whether it can be changed without disturbing existing architecture.

---

# 31. FINAL TARGET EXPERIENCE

Based on the reconnaissance, describe what the ideal Jobs experience should become.

Cover:

```text
Login
  ↓
Register
  ↓
Authenticated session
  ↓
Application shell
  ├── Header
  │    ├── Context
  │    ├── Notifications
  │    └── User menu / Sign out
  │
  ├── Sidebar
  │    ├── Logo
  │    ├── Pin / Collapse
  │    ├── Parent
  │    ├── Child
  │    └── Subchild
  │
  └── Main content
       └── Jobs dashboard
```

This is a conceptual model only.

Use the actual findings to refine it.

---

# 32. IMPLEMENTATION ORDER

Do NOT implement yet.

Recommend the safest implementation sequence.

Prefer something along the lines of:

1. Login UI
2. Register UI
3. Authenticated application shell
4. Sidebar
5. Sidebar collapse/pin
6. Parent/child/subchild navigation
7. Hover/active states
8. Header
9. Notifications
10. User menu
11. Sign out interaction
12. Dashboard initial view
13. Loading/error/empty states
14. Responsive polish
15. Final consistency pass

Adjust this order if the codebase indicates a better sequence.

---

# 33. FINAL REPORT STRUCTURE

Your final response MUST contain these sections:

## A. Executive Summary

What we learned.

## B. Bumi Indah Findings

Proven UI/UX and architecture patterns.

## C. DashTail Findings

Useful modern design patterns.

## D. Cursor AI Jobs Current Architecture

What already exists.

## E. Authentication & State Architecture

Login → session → proxy → cookies → Zustand → query hooks → logout.

## F. Application Shell Comparison

Sidebar + header + notifications + user menu.

## G. Adoption Matrix

What to adopt/adapt/keep/protect.

## H. Protected Architecture

What must not be disturbed.

## I. Safe UI/UX Improvements

What can be polished safely.

## J. Recommended Implementation Order

The sequence we should use later.

## K. Open Questions / Further Investigation

Anything that requires additional investigation before coding.

---

# FINAL PRINCIPLE

Do NOT make Cursor AI Jobs a copy of Bumi Indah.

Do NOT make it a copy of DashTail.

Instead:

> **Bumi Indah provides proven behavior and application-shell patterns.**

> **DashTail provides additional modern visual and interaction inspiration.**

> **Cursor AI Jobs provides the existing business logic and protected architecture.**

The target is a **polished Cursor AI Jobs experience built on top of its existing architecture**.

Most importantly:

**DO NOT IMPLEMENT ANYTHING IN THIS TASK.**

First:

**Understand → Compare → Decide.**

Only after this reconnaissance report is reviewed should we create implementation prompts.