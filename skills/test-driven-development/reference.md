# TDD — Reference

Load this when you need detail beyond the SKILL.md spine: how to detect the test runner, common test mistakes, coverage tiers, the rationalizations to reject, why test-first order matters, what to do when stuck, and how to write a TDD evidence report.

## Detect the Test Runner

Don't assume `npm test`. Resolve the runner once before the RED gate — the package manager and the test runner are **not** the same (a project can install with Bun yet run Jest/Vitest).

1. Determine the package manager from, in order: env override, project config, `package.json` `packageManager` field, lockfile, then global config.
2. Inspect `package.json` `scripts.test` and the test files:
   - `scripts.test` invokes `jest`/`vitest` → run through the PM (`npm test`, `pnpm test`, `yarn test`, `bun run test`).
   - `scripts.test` is `bun test`, or tests `import { test, expect } from "bun:test"` → use Bun's **native** runner (`bun test`).

| Runner | test | watch | coverage |
|--------|------|-------|----------|
| npm | `npm test` | `npm test -- --watch` | `npm run test:coverage` |
| pnpm | `pnpm test` | `pnpm test --watch` | `pnpm test:coverage` |
| yarn | `yarn test` | `yarn test --watch` | `yarn test:coverage` |
| Bun (script → jest/vitest) | `bun run test` | `bun run test --watch` | `bun run test:coverage` |
| Bun (native `bun:test`) | `bun test` | `bun test --watch` | `bun test --coverage` |

> `bun test` (built-in runner) ≠ `bun run test` (runs the `package.json` script). Picking the wrong one is a common failure. Confirm which the project expects, then substitute it everywhere the SKILL says "run the test".

## Common Test Mistakes

**Test behavior, not implementation:**
```typescript
// WRONG: tests internal state
expect(component.state.count).toBe(5)
// RIGHT: tests what the user sees
expect(screen.getByText('Count: 5')).toBeInTheDocument()
```

**Semantic selectors, not brittle ones:**
```typescript
// WRONG: tied to a CSS class
await page.click('.btn-xyz-123')
// RIGHT: semantic
await page.click('button:has-text("Submit")')  // or [data-testid="submit"]
```

**Isolated tests, not dependent ones:**
```typescript
// WRONG: relies on state from a previous test
test('creates user', () => { /* creates testUser */ })
test('updates same user', () => { /* uses testUser from above */ })
// RIGHT: each test sets up its own data
test('creates user', () => { const user = createTestUser(); /* ... */ })
test('updates user', () => { const user = createTestUser(); /* ... */ })
```

## Coverage Tiers

| Requirement | Applies to |
|-------------|-----------|
| **80% minimum** | all code |
| **100%** | authentication, payment, security-critical, core business logic |

**Focus on:** critical paths (auth, payment, data integrity), error-handling branches, edge cases, complex business logic.

**Don't obsess over:** trivial getters/setters, framework boilerplate, auto-generated code.

Coverage is a guide, not a goal. High coverage + poor tests = false confidence. Below 80%? Add tests before proceeding.

## Good Tests

| Quality | Good | Bad |
|---------|------|-----|
| Minimal | One thing. "and" in the name? Split it. | `test('validates email and domain and whitespace')` |
| Clear | Name describes behavior | `test('test1')` |
| Shows intent | Demonstrates the desired API | Obscures what the code should do |

## Why Order Matters

**"I'll write tests after to verify it works."** Tests written after code pass immediately, which proves nothing — they might test the wrong thing, test implementation not behavior, or miss edge cases you forgot. You never saw the test catch the bug. Test-first forces you to see it fail.

**"I already manually tested the edge cases."** Manual testing is ad-hoc: no record, can't re-run, easy to forget under pressure. Automated tests are systematic.

**"Deleting X hours of work is wasteful."** Sunk cost fallacy. The time is gone. Keeping code you can't trust is technical debt; rewrite with TDD for high confidence.

**"TDD is dogmatic; pragmatic means adapting."** TDD *is* pragmatic — it finds bugs before commit, prevents regressions, documents behavior, and enables fearless refactoring. Shortcuts = debugging in production = slower.

**"Tests-after achieve the same goals — spirit not ritual."** No. Tests-after answer "what does this do?"; tests-first answer "what *should* this do?" Tests-after are biased by your implementation and only verify remembered edge cases. 30 minutes of tests-after ≠ TDD: you get coverage but lose proof the tests work.

## Rationalizations to Reject

| Excuse | Reality |
|--------|---------|
| "Too simple to test" | Simple code breaks. The test takes 30 seconds. |
| "I'll test after" | Passing immediately proves nothing. |
| "Tests-after achieve same goals" | After = "what does this do?"; first = "what should this do?" |
| "Already manually tested" | Ad-hoc ≠ systematic. No record, can't re-run. |
| "Deleting X hours is wasteful" | Sunk cost. Unverified code is technical debt. |
| "Keep as reference, write tests first" | You'll adapt it — that's testing after. Delete means delete. |
| "Need to explore first" | Fine. Throw away the exploration, start with TDD. |
| "Test hard = design unclear" | Listen to the test. Hard to test = hard to use. |
| "Must mock everything" | Code too coupled. Use dependency injection. |
| "TDD will slow me down" | TDD is faster than debugging. |
| "Existing code has no tests" | You're improving it. Add tests for it. |

## When Stuck

| Problem | Solution |
|---------|----------|
| Don't know how to test | Write the wished-for API. Write the assertion first. Ask your human partner. |
| Test too complicated | Design too complicated. Simplify the interface. |
| Must mock everything | Code too coupled. Use dependency injection. |
| Test setup huge | Extract helpers. Still complex? Simplify the design. |

## TDD Evidence Report

After GREEN and coverage are validated, write a short human-readable report that proves red-then-green happened and preserves that proof across session restarts or squash merges. It is an *index* over the test code, not a replacement for it.

Include:

1. **User story / journeys** — the behavior(s) under test.
2. **Per-behavior record** — one-sentence summary, the validation command actually run, an output excerpt showing **both the RED and the GREEN result**, and what the passing test guarantees.
3. **Guarantees table:**

   | # | What is guaranteed | Test file / command | Type | Result |
   |---|--------------------|---------------------|------|--------|
   | 1 | Empty query returns `[]` without throwing | `search.test.ts:returns empty for empty query` | unit | PASS |
   | 2 | Invalid limit → HTTP 400 | `route.test.ts:validates params` | integration | PASS |

4. **Coverage & known gaps** — the coverage command/result, plus any intentional gaps or skipped tests.

Keep it factual: quote the actual commands and outcomes. Never invent PASS results for tests that were not run.

## Test Tiers

| Tier | What | When |
|------|------|------|
| Unit | Functions, modules, pure logic | Always |
| Integration | API routes, DB operations, service interactions | Always |
| E2E | User flows, browser automation | User-facing features (optional) |

Follow your project's existing test-file organization conventions.
