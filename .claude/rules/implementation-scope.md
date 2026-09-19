# Medcal Implementation Scope Rules

## Mandatory Behavior

For every implementation task:

- Read the applicable project rules first.
- Read the explicitly referenced source-of-truth document/section.
- Inspect existing code before modifying it.
- Implement only the requested scope.

## Scope Lock

The task prompt is the authoritative implementation scope.

Do not:

- expand the scope
- implement adjacent roadmap items
- implement "nice to have" improvements
- refactor unrelated code
- change existing behavior without requirement
- create speculative compatibility mechanisms

If something appears desirable but is outside scope:

DO NOT IMPLEMENT IT.

Report it under "Out of Scope / Not Implemented" if relevant.

## Existing Implementation

Prefer the existing Medcal patterns over introducing new abstractions.

Reuse existing:

- services
- DTO conventions
- validation patterns
- measurement models
- UI components
- test utilities
- PDF/LK mapping mechanisms

Do not duplicate existing mechanisms.

## Database

Before schema changes:

1. Inspect the existing Prisma schema.
2. Inspect relevant migrations.
3. Confirm the field/model does not already exist.
4. Create only the migration required by the current task.

Never modify an already-applied migration.

Do not backfill data unless explicitly required.

## Tests

Follow `.claude/rules/testing.md`.

Do not declare completion based solely on:
- typecheck
- build
- compilation
- focused tests
- filtered test output

## Blockers

If implementation cannot be completed within the defined architecture:

STOP.

Report:

1. Exact blocker.
2. Existing code causing the blocker.
3. Why the defined scope cannot resolve it.
4. The minimum decision required.

Do not silently redesign the architecture.