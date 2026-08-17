# Bumi Indah Login Page — UI/UX Reconnaissance

We are going to use the existing Bumi Indah application as a **reference implementation** for polishing the UI/UX of another application (`cursor ai jobs`).

Your task in this phase is **RESEARCH ONLY**.

## Critical Rules

- DO NOT modify any files.
- DO NOT create any files.
- DO NOT refactor anything.
- DO NOT install packages.
- DO NOT change dependencies.
- DO NOT change configuration.
- DO NOT suggest implementation changes yet.
- Do not judge the design based purely on personal preference.
- Treat the existing Bumi Indah implementation as a **proven reference pattern** that we want to understand before deciding what to adopt elsewhere.

Start specifically with the **Login Page**.

---

## Step 1 — Locate the Login Page

Explore the repository/workspace and identify:

- the login page/route
- the page component
- layout components surrounding it
- authentication-related UI components
- reusable UI components used by the login page
- styles / CSS / Tailwind classes / theme definitions involved
- assets used by the login page
- relevant hooks or client-side logic that affect the UI

Do not modify anything.

Explain the relevant file structure and how the Login Page is composed.

---

## Step 2 — Analyze the Visual Structure

Study the actual implementation and describe the Login Page in terms of:

### Layout

- overall page structure
- horizontal/vertical composition
- container width
- alignment
- spacing
- positioning
- responsive behavior
- relationship between branding and form

### Branding

Identify:

- logo usage
- brand colors
- typography
- visual identity
- background treatment
- illustrations/images if any
- how strongly branding is emphasized

### Form

Analyze:

- email/username field
- password field
- labels
- placeholders
- helper text
- validation messages
- password visibility control
- remember-me functionality if present
- forgot-password flow
- submit button
- secondary actions

### Components

Identify which existing reusable components are being used for:

- inputs
- buttons
- cards/panels
- alerts
- icons
- loading states
- dialogs
- validation/error feedback

Determine whether these appear to come from a shared design system.

---

## Step 3 — Analyze Interaction & UX

Do not only inspect static appearance.

Trace the Login Page behavior for:

- initial loading
- submitting credentials
- successful login
- invalid credentials
- validation errors
- network/API failure
- disabled states
- keyboard interaction
- focus states
- password visibility
- navigation after login
- mobile behavior

Identify any UX patterns that are particularly deliberate or reusable.

---

## Step 4 — Identify Design Patterns Worth Reusing

Create a section called:

### "Patterns Worth Adopting"

Only list patterns that are clearly useful and reusable.

For each pattern explain:

1. **Pattern**
2. **How Bumi Indah implements it**
3. **Why it works**
4. **Where it could potentially be reused**
5. **Whether it is appropriate for `cursor ai jobs`**

Examples of categories:

- page shell
- authentication layout
- spacing system
- typography hierarchy
- button hierarchy
- input treatment
- status/error feedback
- loading state
- responsive behavior
- visual hierarchy
- component composition

Do NOT yet propose exact code changes to `cursor ai jobs`.

---

## Step 5 — Distinguish "Pattern" vs "Implementation Detail"

This distinction is important.

For example:

**Pattern:**
> Primary actions use a visually dominant button with clear loading/disabled feedback.

**Implementation detail:**
> Button uses component `X` with Tailwind classes `...`.

We care primarily about the **pattern**, because the target application may use different components.

Document both when useful, but clearly separate them.

---

## Step 6 — Identify Things NOT Worth Adopting

Create:

### "Do Not Adopt / Context-Specific"

Identify things that appear specific to Bumi Indah and should NOT automatically be copied elsewhere.

Examples might include:

- business-specific branding
- authentication-specific behavior
- unnecessary visual decoration
- domain-specific terminology
- architecture-specific components
- patterns that would be inappropriate for an internal Jobs application

Do not assume something should be adopted merely because it exists.

---

## Step 7 — Produce an Adoption Summary

Finish with:

### Bumi Indah Login → Cursor AI Jobs

Provide a concise table:

| Pattern | Bumi Indah | Potentially Useful for Jobs | Recommendation | Reason |
|---|---|---|---|---|

Use these recommendation categories:

- **ADOPT**
- **ADAPT**
- **KEEP CURRENT**
- **DO NOT ADOPT**
- **NEEDS MORE INVESTIGATION**

Do not make any code changes.

---

## Step 8 — What to Investigate Next

At the end, identify the **next 3–5 Bumi Indah UI areas** that should be studied to build a complete UI/UX reference library.

Prioritize areas that are likely to have reusable patterns for an application such as `cursor ai jobs`, for example:

- dashboard shell
- navigation/sidebar
- data table/list
- detail page
- status indicators
- forms
- modal/dialog
- notification/toast
- loading/empty/error states

Do not inspect all of them yet unless necessary to understand the Login Page.

---

## Expected Output

Return a structured reconnaissance report with:

1. Login Page location and architecture
2. Visual structure
3. Component usage
4. Interaction/UX behavior
5. Reusable design patterns
6. Context-specific patterns to avoid
7. Adoption matrix for Cursor AI Jobs
8. Recommended next area to investigate

Again:

**RESEARCH ONLY. NO FILE MODIFICATIONS.**