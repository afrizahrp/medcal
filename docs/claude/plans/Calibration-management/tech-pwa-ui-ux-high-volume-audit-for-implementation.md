# Tech-PWA — Comprehensive UI/UX Audit

## Objective

Perform a **comprehensive, strict, code-grounded UI/UX audit** of the entire `apps/tech-pwa` application before making any implementation changes.

This is an **AUDIT-FIRST task**.

Do **NOT** immediately redesign or modify the UI.

The purpose of this task is to understand the current Tech-PWA as a complete product and identify UX/UI inconsistencies, friction points, architectural UI patterns, and opportunities for improvement before we decide what should actually be changed.

---

# 1. Critical Guardrails

## 1.1 Audit first — implementation later

Do not implement fixes during this task unless a tiny non-functional adjustment is absolutely required to inspect something.

The expected output is an **audit report and implementation recommendations**, not a code change.

Do not modify business logic simply because a UI pattern could be improved.

Do not modify:

* business rules
* domain rules
* workflow rules
* validation rules
* approval/reapproval logic
* RBAC/authorization
* API contracts
* database schema
* calculation logic
* calibration logic
* certificate logic
* job lifecycle/state machine

unless you discover that a UI/UX issue is directly caused by one of these.

If such dependency exists, document it explicitly as a finding rather than silently changing it.

---

## 1.2 Preserve existing domain behavior

Tech-PWA is an operational application used by technicians.

The audit must distinguish between:

### UI/UX problems

Examples:

* confusing hierarchy
* poor information density
* inconsistent spacing
* unclear primary action
* excessive scrolling
* duplicated information
* unclear status presentation
* poor mobile interaction
* inconsistent component behavior
* inconsistent terminology
* weak feedback after actions

and:

### Domain/business behavior

Examples:

* what a technician is allowed to do
* when a job can transition state
* required signatures
* calibration rules
* approval rules
* validation requirements
* identity correction workflow

Do not "fix" a domain behavior by disguising it as a UX improvement.

---

# 2. Audit Scope

Inspect the **entire `apps/tech-pwa` application**, not only the most recently modified screen.

Review:

* application shell
* authentication/session experience
* navigation
* dashboard/home
* job list
* job detail
* job workflow
* customer/site information
* equipment/device information
* calibration workflow
* calibration parameters
* calibration result entry
* identity correction
* signatures
* attachments/photos/documents
* certificates where applicable
* job completion/finalization
* notifications/feedback
* dialogs/modals/drawers
* forms
* tables/lists/cards
* empty states
* loading states
* error states
* success states
* confirmation flows
* destructive actions
* offline/PWA behavior where applicable
* responsive/mobile behavior
* touch interaction
* keyboard/accessibility behavior where applicable

Also inspect shared UI components and patterns used across Tech-PWA.

---

# 3. Start With Architecture, Not Screenshots

Before judging individual screens, understand:

1. routing structure
2. page hierarchy
3. shared layouts
4. shared components
5. design-system primitives
6. state management patterns
7. form patterns
8. loading/error handling
9. modal/drawer patterns
10. navigation patterns
11. responsive breakpoints
12. PWA-specific behavior
13. data-fetching patterns
14. optimistic/pessimistic interaction patterns
15. reusable UI utilities/hooks

Map the application structure first.

The goal is to understand whether the current UI is built from coherent reusable patterns or whether individual screens have gradually developed their own patterns.

---

# 4. UX Audit Framework

For every major workflow, evaluate the experience from the perspective of an actual field technician.

Pay particular attention to:

## A. Information hierarchy

Determine:

* What is the most important information?
* Is it visually dominant?
* Can the technician understand the current context immediately?
* Is secondary information competing with primary information?
* Are important statuses obvious?
* Is critical information buried?

---

## B. Task flow

For each major workflow:

* What is the technician trying to accomplish?
* What is the primary action?
* What decisions must they make?
* How many steps/taps are required?
* Are there unnecessary transitions?
* Are there unnecessary confirmations?
* Is context lost between screens?
* Can the technician easily understand where they are?

Do not optimize merely for fewer clicks.

A longer flow can be correct if it prevents mistakes.

Evaluate **cognitive load**, not just click count.

---

## C. Mobile-first field usage

Tech-PWA is a PWA used in operational/field conditions.

Audit specifically for:

* one-handed use
* touch target size
* thumb reach
* scrolling fatigue
* dense tables
* long forms
* keyboard interaction
* sticky actions
* fixed bottom actions
* accidental taps
* modal usability on mobile
* portrait orientation
* small screens
* poor connectivity
* intermittent loading
* outdoor/high-attention environments

Identify where desktop-oriented UI patterns have leaked into the mobile technician experience.

---

# 5. Visual Consistency Audit

Identify inconsistencies in:

### Typography

* heading hierarchy
* font sizes
* font weights
* labels
* helper text
* status text
* numerical data

### Spacing

* page padding
* section spacing
* card spacing
* form spacing
* vertical rhythm
* modal spacing

### Components

* buttons
* inputs
* selects
* cards
* badges
* alerts
* dialogs
* drawers
* tabs
* accordions
* tables
* action menus

### Status representation

Check whether the same concept is represented consistently.

For example:

* status colors
* badges
* icons
* labels
* success/error/warning states
* disabled states
* pending states

Do not invent new terminology unless the existing terminology is demonstrably inconsistent.

---

# 6. Interaction Consistency

Check whether the same user intent behaves consistently across the application.

Examples:

* opening details
* expanding sections
* editing
* saving
* cancelling
* deleting
* confirming
* navigating back
* closing dialogs
* viewing documents
* submitting forms
* handling errors

If two screens solve the same UX problem differently, document both implementations and recommend whether they should converge.

---

# 7. State Design Audit

For every important screen/workflow, inspect:

### Initial/loading state

Is it clear what is happening?

### Empty state

Does the user understand:

* why there is no data?
* what they can do next?

### Error state

Does the user understand:

* what failed?
* whether their data was saved?
* what they can do next?

### Success state

Does the user receive enough confirmation?

### Disabled state

Is it clear why an action is unavailable?

### Pending state

Is it clear that an operation is still processing?

### Offline/intermittent connectivity

Where applicable, determine whether the current UX correctly communicates network-dependent operations.

---

# 8. Form UX Audit

Inspect every significant form.

Evaluate:

* field grouping
* label clarity
* required indicators
* validation timing
* validation messages
* error placement
* keyboard/input types
* numeric fields
* date/time fields
* long text fields
* default values
* auto-focus
* save behavior
* unsaved changes
* accidental navigation
* submit feedback

Pay special attention to forms used while performing calibration work.

---

# 9. Workflow-Specific Audit

Do a deep audit of the actual technician workflows.

At minimum trace:

### Job → Job Detail → Work Execution

### Job → Equipment/Device

### Device → Calibration Parameters

### Calibration Parameter → Input Result

### Identity Correction

### Signature workflow

### Job completion/finalization

For each workflow document:

```text
Entry point
↓
User intent
↓
Screen sequence
↓
Primary actions
↓
Required decisions
↓
Potential confusion
↓
Potential error
↓
Feedback
↓
Completion
```

Identify where the technician can:

* lose context
* make an incorrect entry
* misunderstand status
* miss required information
* accidentally leave a workflow
* perform unnecessary navigation
* repeat the same action
* misunderstand whether an operation succeeded

---

# 10. Information Density

Do not assume that "less information = better UX."

For each screen determine whether the density is:

* too low
* appropriate
* too high

Consider the operational context.

Technicians often need a lot of information, but it must be structured correctly.

Identify opportunities to improve density through:

* grouping
* hierarchy
* progressive disclosure
* accordions
* tabs
* sticky summaries
* contextual actions

rather than simply deleting information.

---

# 11. Progressive Disclosure

Identify screens where the user is presented with too much information at once.

Also identify the opposite problem:

> information that is hidden behind too many interactions.

For each finding, explain:

* what is currently visible
* what is hidden
* why the current balance creates friction
* what disclosure model would be more appropriate

Do not implement it yet.

---

# 12. Navigation Audit

Evaluate:

* global navigation
* contextual navigation
* back behavior
* breadcrumbs where applicable
* page hierarchy
* deep-link behavior
* browser back behavior
* PWA navigation behavior

Answer:

> Can a technician always understand where they are and how to get back without losing work?

---

# 13. Accessibility Audit

Perform a practical accessibility review covering:

* semantic HTML
* keyboard navigation
* focus management
* focus visibility
* labels
* aria usage where appropriate
* color contrast
* color-only status indicators
* touch target size
* screen-reader implications
* dialog focus trapping
* form errors
* disabled controls
* loading announcements where applicable

Do not turn this into a generic WCAG checklist.

Focus on issues that actually affect this application.

---

# 14. PWA / Field Experience

Audit PWA-specific UX:

* install experience where applicable
* standalone mode
* viewport behavior
* mobile browser chrome interaction
* refresh/reload behavior
* offline behavior
* network recovery
* stale data
* loading transitions
* retry behavior
* long-running operations
* accidental app termination/navigation

Identify anything that could create uncertainty for a technician working in the field.

---

# 15. Code-Level Consistency

Search the codebase for repeated UI patterns and determine whether they are actually standardized.

Look for:

* duplicated components
* slightly different versions of the same component
* duplicated CSS/classes
* inconsistent button variants
* inconsistent modal implementations
* inconsistent form validation
* inconsistent toast/notification patterns
* inconsistent loading indicators
* inconsistent error handling

Distinguish:

### Intentional variation

from

### Accidental inconsistency

This distinction is important.

---

# 16. Do Not Over-Design

Avoid recommendations such as:

* "make it prettier"
* "add animations"
* "use more colors"
* "modernize everything"
* "make it look like [generic SaaS product]"

Every recommendation must have a concrete UX reason.

Prioritize:

1. clarity
2. task efficiency
3. error prevention
4. information hierarchy
5. consistency
6. field usability
7. accessibility
8. maintainability

Visual polish comes after these.

---

# 17. Findings Classification

Classify every finding as one of:

### P0 — Critical UX Risk

Potential to cause:

* incorrect operational action
* data loss
* wrong calibration input
* wrong device/job context
* inability to complete critical workflow

### P1 — High

Significant friction or confusion in a core technician workflow.

### P2 — Medium

Meaningful usability or consistency issue but does not block the workflow.

### P3 — Low

Polish, minor inconsistency, or low-impact improvement.

Do NOT assign priorities merely because something looks visually imperfect.

Explain the operational/user impact.

---

# 18. Finding Format

For every significant finding use:

```markdown
## [ID] Finding title

Severity:
P0 / P1 / P2 / P3

Area:
<workflow/page/component>

Current behavior:
<what the code currently does>

UX problem:
<what is confusing/friction/problematic>

User impact:
<impact on technician>

Evidence:
<file paths + relevant components/code>

Root cause:
<UI pattern / component architecture / workflow / other>

Recommendation:
<what should change>

Risk of changing:
<what could accidentally be affected>

Dependencies:
<other screens/components/workflows affected>
```

---

# 19. Cross-Screen Pattern Findings

After individual findings, create a separate section:

## Cross-Screen UX Patterns

Identify recurring problems such as:

* inconsistent page headers
* inconsistent action placement
* inconsistent status badges
* inconsistent forms
* inconsistent dialogs
* inconsistent loading states
* inconsistent error messages
* inconsistent navigation
* inconsistent spacing
* inconsistent responsive behavior

For each recurring pattern, identify all affected areas.

This is important because we should prefer **systematic fixes** over one-off patches.

---

# 20. Proposed UX Direction

After the audit, propose a coherent UX direction for Tech-PWA.

Do NOT produce a visual redesign yet.

Instead define principles such as:

* information hierarchy
* navigation model
* page structure
* action hierarchy
* mobile interaction model
* form model
* status model
* feedback model
* progressive disclosure model

The result should describe **how Tech-PWA should behave**, not merely how it should look.

---

# 21. Implementation Roadmap

At the end, group recommendations into implementation phases.

Example:

### Phase 1 — Critical UX Fixes

P0/P1 issues affecting core workflows.

### Phase 2 — UX Consistency

Shared components and cross-screen patterns.

### Phase 3 — Workflow Optimization

Reduce friction and cognitive load in major technician workflows.

### Phase 4 — Responsive/PWA Improvements

Mobile and field-use improvements.

### Phase 5 — Visual Polish

Typography, spacing, visual refinement, micro-interactions.

Do not assume these phases are mandatory; derive them from the actual audit findings.

---

# 22. Important: Avoid Premature Refactoring

Do not refactor components simply because they could theoretically be cleaner.

A refactor should only be recommended when it provides a measurable UX/product benefit or prevents repeated inconsistency.

For every proposed shared-component change, identify:

* current consumers
* expected benefit
* migration impact
* regression risk

---

# 23. Deliverables

Produce a comprehensive Markdown report containing:

1. Executive Summary
2. Tech-PWA UX Architecture Overview
3. Application / Route Map
4. Major User Workflow Map
5. UI Pattern Inventory
6. Comprehensive Findings
7. Cross-Screen Consistency Findings
8. Mobile / Field UX Findings
9. PWA Findings
10. Accessibility Findings
11. Form UX Findings
12. State Management UX Findings
13. Critical Workflow Findings
14. Root-Cause Analysis
15. Proposed UX Direction
16. Recommended Component/System Improvements
17. Prioritized Implementation Roadmap
18. Risks and Dependencies
19. Items That Should NOT Be Changed
20. Final Audit Summary

---

# 24. Evidence Standard

This must be a **code-grounded audit**.

Do not make claims based only on assumptions or generic UX principles.

Every significant finding must point to concrete evidence in the repository:

* file path
* component
* route
* relevant implementation pattern
* where useful, exact code behavior

If something cannot be verified from the codebase, explicitly state:

> "Not verified from available source."

Do not invent behavior.

---

# 25. Final Requirement

Before proposing any implementation, answer these questions:

1. What are the biggest UX problems across Tech-PWA?
2. Which problems are isolated and which are systemic?
3. Which shared components/patterns should be standardized?
4. Which workflows have the highest cognitive load?
5. Which issues could cause technician mistakes?
6. Which issues are merely visual polish?
7. Which improvements can be made without touching business/domain logic?
8. Which improvements require deeper architectural changes?
9. What should be fixed first?
10. What should deliberately be left unchanged?

Again:

**AUDIT FIRST. DO NOT IMPLEMENT YET.**

The output of this task will be reviewed before any UI/UX implementation begins.
