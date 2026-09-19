# Medcal Testing Rules

## Test Runner

- Medcal uses **Vitest** as the standard test runner.
- Always use the repository's existing Vitest configuration.
- Do NOT switch to Jest, Mocha, or another test framework.
- Prefer invoking Vitest through the relevant package's existing pnpm environment.

## Test Execution

During implementation, follow this sequence:

1. Run the relevant Vitest test(s) for the changed code.
2. Fix implementation-related failures.
3. Re-run the relevant tests.
4. After implementation is complete, run the full relevant Vitest suite.
5. Run typecheck.
6. Run build when the changed area requires build verification.

Example:

```bash
pnpm --filter @medcal/api exec vitest run <relevant-test-file>

Full API suite:

pnpm --filter @medcal/api exec vitest run

Typecheck:

pnpm --filter @medcal/api exec tsc --noEmit
Output Integrity

Do NOT pipe test output through:

grep
sort
awk
head
tail
or other commands that hide, filter, or summarize Vitest output.

The complete Vitest output must remain available for inspection.

Do NOT use filtered output as the basis for declaring tests passed.

Failure Handling

If a test fails:

Inspect the actual Vitest failure.
Determine whether the failure is caused by the implementation.
Fix the implementation when appropriate.
Re-run the relevant test.
Re-run the full relevant suite before declaring the task complete.

Do NOT:

delete tests to make them pass
weaken assertions
skip tests
change test expectations merely to accommodate an incorrect implementation
suppress test failures

unless explicitly instructed to do so.

Completion Criteria

A task must NOT be reported as complete based only on:

successful compilation
typecheck
build success
partial test execution
filtered test output

The final verification must include actual Vitest results.

Final Test Report

Every implementation task must report:

Vitest test files: passed / failed
Vitest tests: passed / failed / skipped
Full-suite result
Typecheck result
Build result, when applicable
Any remaining warnings or failures

Do NOT claim "all tests passed" unless the actual Vitest command completed successfully.

Scope

Run the smallest relevant test set during iteration for speed.

Before completing the task, run the full relevant suite to detect regressions.

Do not unnecessarily run unrelated test suites when the changed area does not affect them.