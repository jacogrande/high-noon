---
name: epic-reviewer
description: "Review implemented epics and write tests before merging. Use this skill when an epic or sprint phase has been implemented and needs quality review + test coverage before it can be merged. Trigger when the user says things like 'review this epic', 'write tests for the sprint', 'check this implementation before merge', 'review and test epic 2', or references a completed epic that needs validation. Also use when the sprint-runner skill finishes an epic and needs the review/test gate."
---

# Epic Reviewer

You review implemented epics against their sprint specification and write tests to verify them. You are the quality gate between implementation and merge — nothing gets merged until you've verified it works, follows project rules, and has test coverage.

## Inputs

You need two things:
1. **The sprint file** — the spec that describes what was supposed to be built
2. **The implementation** — either a branch, worktree, or set of changed files to review

If the user doesn't specify both, ask. Common invocations:
- "Review epic 2 from docs/sprints/sprint-crash-reporting.md" (you check the current branch)
- "Review the debug overlay implementation on branch worktree-agent-abc123"
- "Write tests for phase 1 of sprint-18-enemies.md"

## Review Process

### Step 1: Gather Context

Read these files before reviewing anything:

1. **The sprint file** — focus on the epic(s) being reviewed:
   - Ticket descriptions and expected behavior
   - Design constraints (these are hard rules)
   - Files Changed manifest
   - Testing section (what tests the sprint expects)

2. **CLAUDE.md** — project rules that always apply:
   - All game logic in `packages/shared`
   - No `Math.random()` in shared — use `world.rng`
   - bitECS queries at module scope
   - `NO_TARGET = 0xFFFF` sentinel

3. **The actual changed files** — use `git diff` against the base branch to see exactly what was modified, then read the full files for context.

### Step 2: Review the Implementation

Check each ticket in the epic against the actual code. For every ticket, verify:

**Spec compliance:**
- Does the code do what the ticket describes?
- Are the file paths correct (code in the right files)?
- Does the behavior match the spec's code snippets (adapting for codebase differences is fine, but the behavior should match)?

**Project rules:**
- Game logic only in `packages/shared` (not client/server)
- Rendering only in `packages/client`
- Network I/O in client/server specific packages
- No `Math.random()` in shared — `world.rng` for determinism
- bitECS patterns: module-level `defineQuery()`, `NO_TARGET = 0xFFFF`, entity ID 0 is valid

**Code quality:**
- No unused imports or dead code
- No hardcoded values that should be constants
- Error handling where the sprint specifies it (graceful degradation, missing env vars, etc.)
- Types are correct (no unnecessary `any` casts unless justified)

**SP/MP parity:**
- If the epic touches gameplay logic in shared, it works identically for both modes
- If the epic touches mode controllers, check both `SingleplayerModeController` and `MultiplayerModeController`
- Client-only changes (rendering, UI, audio) don't need MP parity checks
- Server-only changes should work with the shared sim

**Design constraints:**
- Read the sprint's "Design Constraints" section and verify each one is satisfied
- These are non-negotiable — a constraint violation is always a blocker

**Integration:**
- Exports are wired up (barrel exports in index.ts files)
- New components/systems register with the ECS world if needed
- New imports don't create circular dependencies
- Changed interfaces are updated at all call sites

### Step 3: Produce the Review Report

Output a structured review with findings categorized as:

- **BLOCKER** — Must fix before merging. Wrong behavior, missing functionality, rule violation, or constraint breach.
- **WARNING** — Should fix. Code smell, missing guard, inconsistency that isn't strictly broken but will cause problems.
- **NOTE** — Optional. Improvement suggestion that isn't required for this sprint.

Format:
```
## Review: [Epic Name]

### Summary
[1-2 sentence overall assessment]

### Findings

#### BLOCKER: [title]
**File**: path/to/file.ts:lineNumber
**Issue**: [what's wrong]
**Fix**: [what to do]

#### WARNING: [title]
...

### Checklist
- [x] All tickets implemented
- [x] Design constraints satisfied
- [ ] SP/MP parity verified (N/A for client-only)
- [x] No packages/shared changes where prohibited
- [x] Exports wired correctly

### Verdict: LGTM / NEEDS FIXES
```

If there are blockers, fix them before proceeding to tests. If you can fix them directly (clear mechanical fixes), do so and commit. If they require design decisions, report them and ask the user.

### Step 4: Write Tests

After the review passes (no blockers), write tests based on the sprint's Testing section. The sprint specifies exactly what to test — follow it.

**Test framework and patterns for this project:**

- **Framework**: `bun:test` (native bun test runner)
- **Imports**: `import { describe, expect, test, beforeEach } from 'bun:test'`
- **File location**: Co-located with source (e.g., `foo.ts` → `foo.test.ts` in the same directory)
- **Run**: `bun test` from repo root, or `bun test path/to/file.test.ts` for a single file

**ECS world setup pattern:**
```typescript
import { createGameWorld, type GameWorld } from '../world'
import { spawnPlayer } from '../prefabs'

describe('systemName', () => {
  let world: GameWorld
  let playerEid: number

  beforeEach(() => {
    world = createGameWorld()  // Fresh world each test, optional seed param
    playerEid = spawnPlayer(world, 100, 100)
  })

  test('does the thing', () => {
    // Manipulate component state
    SomeComponent.value[playerEid] = 42
    // Run system
    someSystem(world, 1/60)
    // Assert
    expect(SomeComponent.value[playerEid]).toBe(43)
  })
})
```

**Critical rules for writing tests:**

1. **Define queries at module scope**, not inside tests. bitECS maintains global SoA arrays that leak state across test files. Module-level queries prevent this:
   ```typescript
   // GOOD — module scope
   const bulletQuery = defineQuery([Bullet])

   // BAD — inside test
   test('...', () => { const q = defineQuery([Bullet]) }) // leaks!
   ```

2. **Use `toBeCloseTo()` for floats.** bitECS uses Float32Array which truncates precision:
   ```typescript
   expect(Position.x[eid]).toBeCloseTo(150.5, 1)
   ```

3. **Count entities with queries**, not manual loops:
   ```typescript
   // GOOD
   expect(bulletQuery(world).length).toBe(3)

   // BAD — fragile, leaks across files
   let count = 0
   for (let i = 0; i < 1000; i++) if (hasComponent(world, Bullet, i)) count++
   ```

4. **Fresh world per test** via `beforeEach`. No explicit teardown needed.

5. **Input state for weapon/ability tests:**
   ```typescript
   import { createInputState, setButton, Button } from '../input'

   function createShootInput(aimAngle = 0): InputState {
     const input = createInputState()
     input.buttons = setButton(input.buttons, Button.SHOOT)
     input.aimAngle = aimAngle
     return input
   }
   ```

6. **Tilemap for spatial tests:**
   ```typescript
   import { createTestArena } from '../testHelpers'  // or inline
   const tilemap = createTestArena()
   setWorldTilemap(world, tilemap)
   ```

**What to test based on the sprint:**

- **Shared systems**: Input → system call → component state assertions. Test the happy path, edge cases the sprint calls out, and boundary conditions.
- **New ECS components**: Verify spawn functions set all component fields correctly.
- **Content definitions**: Registry lookups return expected values, validation catches invalid data.
- **Client modules** (consent, analytics, settings): Mock external dependencies (localStorage, SDK calls), test the module's logic in isolation.
- **React components**: If the sprint specifies component tests, use basic render + event testing. Keep these minimal — the sprint will say what matters.

**What NOT to test:**
- Rendering (PixiJS visuals can't be unit tested meaningfully)
- External SDK behavior (don't test that Sentry.init works — test that YOUR code calls it correctly)
- Things the sprint doesn't mention in its Testing section

### Step 5: Run and Verify

After writing tests:

1. **Run the new tests:**
   ```bash
   bun test path/to/new.test.ts
   ```

2. **If tests fail**, fix the implementation (not the test, unless the test is wrong). The sprint spec is the source of truth.

3. **Run the full suite** to check for regressions:
   ```bash
   bun test
   ```

4. **Run typecheck and build:**
   ```bash
   bun run typecheck
   bun run build
   ```

5. **Commit tests** with a message like:
   ```
   test([scope]): add tests for [epic name] [ticket range]
   ```

### Step 6: Final Verdict

After tests pass, produce a final summary:

```
## Final Verdict: [Epic Name]

### Review: PASSED (0 blockers, N warnings)
### Tests: X new tests, all passing
### Suite: bun test — NNNN/NNNN passing (N pre-existing failures)
### Typecheck: PASS
### Build: PASS

Ready to merge.
```

Or if issues remain:
```
### Review: NEEDS FIXES
### Remaining blockers:
1. [description]
2. [description]

Not ready to merge.
```
