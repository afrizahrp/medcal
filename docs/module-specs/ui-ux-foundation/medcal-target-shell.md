# MedCal Target Shell Specification

## 1. Purpose

This document defines the target UI/UX specification for the **MedCal Management Shell**.

It is the bridge between:

**Reconnaissance → Target Shell Specification → Implementation Plan → Coding**

This specification is based on the reconnaissance of:

- Bumi Indah `easy-app` as the primary proven admin-shell reference.
- DashTail as a secondary visual/interaction reference.
- The existing MedCal Portal architecture as the protected target architecture.

This document defines **what the Management Shell should look and behave like**. It does not authorize architectural changes to authentication, proxying, RBAC, API contracts, or existing domain behavior.

---

# 2. Scope

## In Scope

This specification covers the **Management** application shell only:

- authenticated management layout
- desktop sidebar
- collapsed sidebar
- sidebar pin/collapse control
- mobile navigation drawer
- management header
- contact-message notification
- web-chat notification
- email notification
- user avatar
- user dropdown
- sign-out presentation
- navigation active/hover states
- menu ordering
- typography
- spacing
- colors
- general shell density
- responsive behavior

## Out of Scope

The following are not part of this shell implementation:

- Customer/client portal shell
- Better Auth redesign
- authentication mechanism changes
- proxy redesign
- RBAC redesign
- tenant/company authorization changes
- API redesign
- database changes
- migration to Zustand
- migration to TanStack Query
- new notification architecture
- new permission/menu API
- merging Lead Inbox and Chat Inbox
- business-domain redesign

The customer portal will receive its own shell/design treatment later.

---

# 3. Design References

## Primary Reference — Bumi Indah

Use the production Bumi Indah admin application as the primary visual and interaction reference:

- Frontend: `D:\bi-erp\easy-app`
- Backend: `D:\bi-erp\server-bi-erp`
- Deployed admin: `https://apps.bumiindah.co.id`

Adopt its proven admin-shell language where appropriate:

- classic vertical sidebar
- compact admin density
- active/hover navigation
- nested navigation capability
- sidebar collapse
- responsive mobile sidebar
- sticky header
- header tool cluster
- profile dropdown
- branded authentication chrome

Do not copy its authentication architecture.

## Secondary Reference — DashTail

Use DashTail for additional modern dashboard inspiration.

DashTail is not the architectural reference.

Prefer Bumi Indah's production choices where Bumi Indah and DashTail overlap or differ.

---

# 4. Protected MedCal Architecture

The shell must be implemented **on top of** the existing MedCal architecture.

The following are protected:

- Better Auth
- `apps/portal/src/proxy.ts`
- authentication boundary
- `use-require-session.ts`
- `GET /me` session contract
- `@medcal/auth/client`
- `apiFetch`
- API RBAC
- `CompanyRoleGuard`
- tenant/company isolation
- permission catalog
- registration whitelist/security controls
- chat identity/security rules
- existing domain APIs
- existing Lead Inbox behavior
- existing Chat behavior
- existing notification functionality

Do not replace these with Bumi Indah's JWT/Bearer/sessionStorage architecture.

The desired shell is a **presentation and interaction layer**, not an authentication or authorization rewrite.

---

# 5. Target Application Structure

The target is the MedCal **Management** experience.

Conceptually:

```text
Management
│
├── Management Shell
│   │
│   ├── Sidebar
│   │   ├── Logo
│   │   ├── Pin / Collapse
│   │   └── Navigation
│   │
│   ├── Header
│   │   ├── Contact Messages notification
│   │   ├── Web Chat notification
│   │   ├── Email notification
│   │   └── User menu
│   │
│   └── Main Content
│
└── Existing Management Pages
    ├── Dashboard
    ├── Leads
    └── Chat
```

The shell must not own domain business logic that belongs to individual pages.

---

# 6. Sidebar

## 6.1 General

The Management Shell uses a **classic vertical sidebar**.

The sidebar is persistent on desktop and becomes a drawer on mobile.

## 6.2 Expanded Width

Use the Bumi Indah reference as the baseline:

**approximately 248px**

Do not treat the exact pixel value as an immutable requirement if the actual MedCal logo/content requires a small adjustment.

The visual result should remain consistent with the Bumi Indah density.

## 6.3 Collapsed Width

Use approximately:

**72px**

The collapsed sidebar should preserve:

- logo/brand recognition
- navigation icons
- active state
- access to the pin/collapse control

Do not squeeze text into the collapsed rail.

## 6.4 Logo

The logo sits at the top of the sidebar.

The logo area must remain visually stable between expanded and collapsed states.

Use the appropriate MedCal/BIP branding assets.

Do not introduce unrelated DashTail branding.

## 6.5 Pin / Collapse Control

The pin/collapse control belongs **inside the sidebar, beside the logo**.

It does not belong in the global header.

Conceptually:

```text
┌──────────────────────────────┐
│  [ MedCal Logo ]        [📌] │
├──────────────────────────────┤
│  Messages                    │
│  Chat                        │
│  Email                       │
└──────────────────────────────┘
```

The control manages the sidebar presentation.

The control's placement intentionally differs from the current Bumi Indah production implementation, which places the sidebar toggle in the header.

For MedCal, proximity to the controlled element is preferred.

## 6.6 Pin Semantics

The exact semantics should remain simple:

- Expanded/pinned → sidebar stays expanded while navigating.
- Collapsed → sidebar remains collapsed on desktop.
- Hover must not unexpectedly expand a deliberately collapsed/pinned sidebar unless the final interaction design explicitly requires it.

Do not introduce complex auto-hide behavior unless required.

## 6.7 Navigation

For Management v1, navigation is intentionally simple and **hard-coded**.

Do not introduce Bumi Indah's `sys_menu` / permission-menu endpoint.

Current conceptual order:

```text
Messages
Chat
Email
```

This order is deliberate and must remain consistent with the header notification order.

Authorization remains server-side. Static navigation is a UI concern only.

---

# 7. Navigation States

Every sidebar item must have clear:

- default
- hover
- active
- focus
- disabled, where applicable

states.

## Hover

Hover should provide immediate visual feedback without being excessively animated.

## Active

The current route should be visually obvious.

Active state should be consistent across:

- icon
- label
- background/accent
- parent state when nested navigation is eventually introduced

## Focus

Keyboard focus must remain visible and usable.

Do not remove browser/accessibility focus indication without replacing it with an equivalent visible state.

---

# 8. Nested Navigation Capability

Management v1 does **not** need artificial parent/child/subchild menus.

The architecture should nevertheless allow future hierarchy.

For example, if Leads later becomes:

```text
Leads
├── Inbox
├── Pipeline
└── Archived
```

the shell should be able to adopt the Bumi Indah-style hierarchy without a complete navigation rewrite.

Do not create nested menus merely because Bumi Indah supports them.

**Adopt the capability, not unnecessary hierarchy.**

---

# 9. Desktop Behavior

Desktop has two primary sidebar states:

### Expanded

```text
┌────────────────┬───────────────────────────┐
│ Logo       📌  │ Header                    │
│                ├───────────────────────────┤
│ Messages       │                           │
│ Chat           │ Main Content              │
│ Email          │                           │
│                │                           │
└────────────────┴───────────────────────────┘
```

### Collapsed

```text
┌──────┬────────────────────────────────────┐
│ Logo │ Header                             │
│  📌  ├────────────────────────────────────┤
│  💬  │                                    │
│  ◯   │ Main Content                       │
│  ✉   │                                    │
└──────┴────────────────────────────────────┘
```

The main content area must expand naturally when the sidebar collapses.

Avoid layout jumps that cause content to become difficult to use.

---

# 10. Mobile Behavior — HIGH PRIORITY

Mobile behavior is a **first-class requirement**, not a final responsive polish step.

Mobile must not simply use the collapsed desktop sidebar.

Instead:

```text
┌──────────────────────────────┐
│ ☰   MedCal        🔔  👤    │
├──────────────────────────────┤
│                              │
│        Main Content          │
│                              │
└──────────────────────────────┘
```

The sidebar becomes a **mobile navigation drawer**.

## Mobile requirements

- compact header
- menu trigger
- drawer/overlay
- same navigation order as desktop
- clear active item
- easy dismissal
- no horizontal page overflow
- content remains readable
- notification controls remain accessible
- user menu remains accessible

The drawer should feel like the same Management Shell, not a separate application.

---

# 11. Header

The Management header is a sticky application header.

Use Bumi Indah's header language as the visual baseline.

The header should contain, in this exact functional order:

```text
Contact Messages → Web Chat → Email → User
```

This order must correspond to the sidebar's primary communication order:

```text
Messages → Chat → Email
```

The header must not contain the sidebar pin/collapse control.

---

# 12. Contact Message Notification

The first notification control represents **Contact Messages**.

It is functional.

Do not replace existing functionality with a placeholder.

The implementation should reuse the existing notification/data behavior where available.

The UI responsibility is:

- icon
- unread indicator
- accessible click target
- appropriate popover/dropdown/drawer behavior according to the existing implementation
- loading state
- empty state
- error state

Do not create a new notification backend or authentication mechanism.

---

# 13. Web Chat Notification

The second notification control represents **Web Chat**.

It is functional.

Preserve the existing chat identity/security architecture.

The UI should provide:

- unread indication where supported
- clear interaction
- appropriate navigation or panel behavior
- loading/error/empty handling where applicable

Do not move chat authorization into the client.

---

# 14. Email Notification

The third notification control represents **Email**.

It is functional.

Use the existing email-related data/interaction behavior where available.

Do not invent a second email notification architecture.

---

# 15. Notification Ordering

The exact order is:

```text
1. Contact Messages
2. Web Chat
3. Email
```

This ordering is part of the Management Shell specification.

Do not reorder these controls for visual reasons.

---

# 16. User Menu

The user menu uses an **avatar + dropdown**.

Do not use a drawer.

Conceptually:

```text
                         ┌──────────────────────┐
                         │ Avatar  User Name    │
                         │         email        │
                         │         role         │
                         ├──────────────────────┤
                         │ Sign Out             │
                         └──────────────────────┘
```

The exact displayed identity information should use the existing authenticated user/session data.

Do not duplicate authentication state in a new client store.

---

# 17. Sign Out

The UI presentation may change.

The underlying authentication behavior must not.

Use the existing MedCal sign-out mechanism.

Do not:

- implement a second logout endpoint
- manually manipulate Better Auth cookies
- introduce another session store
- clear unrelated browser state
- change proxy behavior

The expected user experience is:

```text
Avatar
  ↓
User Dropdown
  ↓
Sign Out
  ↓
Existing Better Auth signOut()
  ↓
Existing redirect to sign-in
```

---

# 18. Typography

Use the Bumi Indah `easy-app` visual language as the starting point.

The goal is:

- clean
- compact
- professional
- readable
- admin-oriented

Do not blindly copy typography if it conflicts with established MedCal brand requirements.

Avoid introducing a new typography system solely for this shell.

---

# 19. Spacing and Density

Use Bumi Indah's compact admin density as the baseline.

Characteristics:

- controlled whitespace
- compact navigation
- readable page padding
- clear separation between chrome and content
- no excessive decorative whitespace
- no excessive dashboard-card density

DashTail's compact page padding may be used as secondary inspiration.

The shell should feel efficient for users who work in it repeatedly.

---

# 20. Color and Visual Language

Use Bumi Indah `easy-app` as the visual baseline.

The target should retain:

- light application canvas
- strong blue primary/action hierarchy
- white header/sidebar surfaces
- subtle borders
- restrained shadows
- clear active navigation
- restrained hover states

Do not introduce DashTail's violet/purple default theme unless there is an explicit MedCal branding reason.

Do not create a multi-theme system.

---

# 21. Main Content Area

The shell must provide a consistent main-content container.

It should support:

- page title
- optional subtitle
- page actions
- tables
- inboxes
- chat
- future dashboard modules

The shell should not impose a dashboard-card layout on every page.

Content density should be appropriate to the page.

---

# 22. Dashboard Landing

The initial Management dashboard should retain the existing domain separation.

Do not merge:

- Lead Inbox
- Chat Inbox

They represent distinct product areas.

The shell may improve the presentation and hierarchy of the dashboard landing page, but domain semantics remain unchanged.

---

# 23. Loading / Empty / Error States

The shell and existing pages should progressively adopt consistent UI states.

At minimum:

### Loading

Use a deliberate loading treatment rather than unexplained blank space.

### Empty

Explain what the user is seeing and, where useful, what action is available.

### Error

Show a clear, non-technical message while preserving useful recovery actions.

Do not redesign API error contracts as part of shell work.

---

# 24. State Management Rule

Do **not** introduce Zustand merely because Bumi Indah uses it.

For shell v1:

- local React state is acceptable for transient UI state
- a small persisted preference may be used for sidebar collapse/pin if appropriate
- existing session/auth state remains Better Auth
- remote/server data remains on the existing `apiFetch` / hook architecture

Consider Zustand only if a concrete cross-page client-state requirement emerges.

---

# 25. Query / Server-State Rule

Do **not** migrate MedCal Portal to TanStack Query merely to match Bumi Indah.

Existing:

- `apiFetch`
- existing hooks
- existing server contracts

remain the source of truth.

React Query can be considered later if actual caching, synchronization, or repeated server-state problems justify it.

---

# 26. Cookies / Storage Rule

Do not change the Better Auth cookie/session architecture.

Sidebar preference persistence may use a small client-side mechanism if required.

Do not store authentication secrets/tokens in browser storage as part of this shell work.

Do not duplicate session state.

---

# 27. Management vs Client

This specification applies **only to Management**.

Do not apply this shell automatically to:

`apps/portal/src/app/client`

The client/customer portal will receive its own shell specification later.

Shared low-level primitives may eventually be reused, but:

- Management navigation
- Management header
- Management density
- Management notifications
- Management user controls

should not automatically become the customer portal experience.

---

# 28. Responsive Acceptance Criteria

The shell is not complete unless it works at:

- desktop wide
- desktop normal
- tablet
- mobile portrait
- mobile landscape

Specifically verify:

- no horizontal overflow
- sidebar does not consume the entire mobile viewport unnecessarily
- drawer opens/closes correctly
- active navigation remains clear
- header controls remain usable
- notification controls remain accessible
- user dropdown fits the viewport
- page content remains readable
- tables/inboxes do not destroy the shell layout

Mobile behavior is a **priority acceptance criterion**.

---

# 29. Architecture Safety Rules

Any future implementation must satisfy:

1. Do not change Better Auth.
2. Do not change `proxy.ts`.
3. Do not change API RBAC.
4. Do not move authorization to the client.
5. Do not trust client-supplied company/tenant identifiers.
6. Do not duplicate authentication state.
7. Do not introduce a second session mechanism.
8. Do not change existing Lead/Chat security boundaries.
9. Do not merge Lead and Chat domains.
10. Do not introduce infrastructure solely to reproduce a visual effect.

---

# 30. Recommended Implementation Boundaries

The implementation should preferably be organized around clear shell responsibilities.

Potential areas include:

```text
apps/portal/src/app/management/layout.tsx
apps/portal/src/app/management/nav-config.ts
apps/portal/src/components/...
```

The exact component structure must be determined from the current codebase before implementation.

Do not assume that the filenames above must be changed.

Before coding, inspect the current implementation and identify the smallest safe change surface.

---

# 31. Visual Reference Priority

When making a design decision:

### Priority 1
Existing MedCal architecture and product semantics.

### Priority 2
Bumi Indah production behavior and visual language.

### Priority 3
DashTail design inspiration.

If a DashTail pattern conflicts with Bumi Indah's proven production behavior, prefer Bumi Indah unless there is a clear UX reason not to.

If Bumi Indah's pattern conflicts with MedCal's product/security requirements, preserve MedCal.

---

# 32. Target Experience

The intended Management experience is:

```text
                    MEDCAL MANAGEMENT
┌──────────────────────────────────────────────────────────┐
│ [Logo] [Pin]          Contact   Chat   Email       User  │
├───────────────────┬──────────────────────────────────────┤
│                   │                                      │
│ Messages          │  Page Title                          │
│ Chat              │  Page Subtitle                       │
│ Email             │                                      │
│                   │  Page Content                        │
│                   │                                      │
│                   │                                      │
└───────────────────┴──────────────────────────────────────┘
```

Collapsed:

```text
┌──────┬──────────────────────────────────────────────────┐
│ Logo │ Contact   Chat   Email                     User  │
│  📌  ├──────────────────────────────────────────────────┤
│  💬  │                                                  │
│  ◯   │              Page Content                        │
│  ✉   │                                                  │
└──────┴──────────────────────────────────────────────────┘
```

Mobile:

```text
┌──────────────────────────────────┐
│ ☰   MedCal       🔔  🔔  🔔  👤 │
├──────────────────────────────────┤
│                                  │
│ Page Title                       │
│                                  │
│ Main Content                     │
│                                  │
└──────────────────────────────────┘

☰ → Mobile Navigation Drawer
```

The exact icons and visual details should follow the established Bumi Indah/MedCal visual language.

---

# 33. Explicit Non-Goals

Do not use this shell project as an excuse to introduce:

- DashTail theme customizer
- multiple layouts
- theme packs
- decorative KPI walls
- generic template widgets
- new authentication framework
- JWT migration
- sessionStorage auth cache
- Zustand platform migration
- TanStack Query migration
- permission-menu API
- FCM architecture
- multi-company switcher

These may be considered later only when a real product requirement exists.

---

# 34. Definition of Done — Shell Specification

The target shell is considered conceptually defined when:

- [x] Management-only scope is clear.
- [x] Client portal is explicitly deferred.
- [x] Sidebar placement is defined.
- [x] Pin is beside the sidebar logo.
- [x] Expanded/collapsed desktop behavior is defined.
- [x] Mobile drawer behavior is defined as a first-class requirement.
- [x] v1 navigation is hard-coded.
- [x] Navigation order is defined.
- [x] Header notification order is defined.
- [x] Notifications are expected to remain functional.
- [x] User menu is a dropdown.
- [x] Sign-out uses existing Better Auth behavior.
- [x] Bumi Indah is the visual baseline.
- [x] DashTail is secondary inspiration.
- [x] Better Auth/proxy/RBAC/API architecture is protected.
- [x] Zustand and TanStack Query are not required for shell v1.
- [x] Nested navigation is a future capability, not a forced v1 requirement.

---

# 35. Next Phase

This specification does **not** authorize implementation.

The next step is to create an **Implementation Plan** that:

1. inspects the current MedCal Portal files again,
2. maps this specification to the existing components,
3. identifies the smallest safe file-change surface,
4. identifies reusable components,
5. identifies new components only where necessary,
6. confirms that protected architecture remains untouched,
7. defines implementation order,
8. defines verification/acceptance tests.

Only after that implementation plan is reviewed should coding begin.

**Target principle:**

> Build the MedCal Management Shell on top of the existing architecture — do not rebuild the architecture to obtain the shell.
