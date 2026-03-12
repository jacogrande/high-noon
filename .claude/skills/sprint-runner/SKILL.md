---
name: sprint-runner
description: "Execute sprint planning documents by parallelizing independent epics across subagents, committing per-ticket, reviewing per-epic, and running tests at the end. Use this skill whenever the user asks to implement a sprint, run a sprint file, execute a sprint plan, or references a sprint document in docs/sprints/. Also trigger when the user says things like 'build this sprint', 'implement this plan', 'run the analytics sprint', or provides a path to a sprint markdown file."
---

# Sprint Runner

You are an orchestrator that turns sprint planning documents into working code. Sprint files are detailed implementation plans with epics, tickets, dependency graphs, and file manifests. Your job is to execute them efficiently by parallelizing independent work, maintaining code quality through reviews, and ensuring everything integrates cleanly.

## How Sprint Files Work

Sprint files in this project follow a consistent structure:

- **Goal & Dependencies**: What the sprint achieves and what it builds on
- **Current State**: What exists and what doesn't — read this carefully to understand the starting point
- **Design Constraints**: Non-negotiable rules (e.g., "no changes to packages/shared", "GDPR opt-in before data collection")
- **Epic Overview**: A table of epics with package scope, priority, and size estimates
- **Epics with Tickets**: Each epic has numbered tickets (e.g., 1.1, 1.2, 2.1) with file paths, code snippets, and behavior descriptions
- **Implementation Order**: An explicit dependency graph showing which tickets depend on which
- **Files Changed**: A manifest of every file created or modified
- **Testing**: Unit tests, integration tests, and manual verification checklists

The Implementation Order section is your primary guide for dependencies. It tells you exactly what can be parallelized and what must be sequential.

## Execution Flow

### Phase 1: Read and Analyze

Before writing any code, thoroughly understand the sprint:

1. **Read the sprint file** end-to-end. Pay special attention to:
   - Design Constraints (these are hard rules you must follow)
   - Current State (understand the codebase you're building on)
   - Implementation Order (this is your dependency graph)

2. **Read project context**. Always read:
   - `CLAUDE.md` in the project root (critical rules like "all game logic in shared")
   - Key files mentioned in the "Depends on" and "Current State" sections
   - Any technology guides referenced (e.g., `docs/guides/bitecs.md`)

3. **Build the dependency graph** from the Implementation Order section. Identify:
   - **Foundation epics**: Tickets that everything else depends on (usually Epic 1)
   - **Independent swimlanes**: Groups of epics that don't share file dependencies and can run in parallel
   - **Sequential chains**: Epics that must run in order

4. **Present your execution plan** to the user. Show:
   - Which epics form the foundation (implemented first, sequentially)
   - Which epics will be parallelized in swimlanes
   - Which epics must wait for others
   - Estimated number of parallel agents

   Example plan format:
   ```
   Phase A (Foundation): Epic 1 — sequential, tickets 1.1 → 1.2 → 1.3
   Phase B (Parallel):
     Swimlane 1: Epic 2 (tickets 2.1 → 2.2 → 2.3)
     Swimlane 2: Epic 3 (tickets 3.1 → 3.2)
     Swimlane 3: Epic 4 (tickets 4.1 → 4.2)
   Phase C (Sequential): Epic 5 — depends on Epics 2-4
   Phase D: Review + Testing
   ```

5. **Wait for user confirmation** before proceeding. They may want to adjust the plan, skip epics, or change priorities.

### Phase 2: Execute Foundation

Foundation epics are implemented directly (not in subagents) since everything else depends on them:

1. Work through foundation tickets in order
2. After each ticket:
   - Verify the changes compile (`bun run typecheck` or equivalent)
   - Commit with a descriptive message referencing the ticket number (e.g., "feat(analytics): consent persistence utility [1.1]")
3. After the foundation epic is complete, spawn a review subagent (see Phase 4 review protocol)
4. Address any review findings before moving to parallel execution

### Phase 3: Execute Parallel Swimlanes

For each independent swimlane, spawn a subagent using `isolation: "worktree"`. This gives each agent its own copy of the repo so they don't conflict.

**Subagent prompt template:**

```
You are implementing a swimlane from a sprint plan for the High Noon game project.

## Context
- Read CLAUDE.md for project rules (especially: all game logic in packages/shared)
- Sprint file: [path to sprint file]
- You are implementing: [Epic name and number]

## Your Tickets
[List the specific tickets with their full descriptions from the sprint file]

## Instructions
1. Read the sprint file section for your epic carefully
2. Read all files mentioned in "Current State" and "Depends on" that are relevant to your work
3. For each ticket in order:
   a. Read any existing files you need to modify
   b. Implement the ticket exactly as specified
   c. Run `bun run typecheck` to verify no type errors
   d. Commit with message: "feat([scope]): [description] [ticket number]"
4. After all tickets are done, verify your epic builds cleanly

## Design Constraints
[Copy the relevant design constraints from the sprint file]

## Files You Will Touch
[List the specific files from the Files Changed manifest for this epic]
```

Key rules for spawning swimlane agents:
- **Always use `isolation: "worktree"`** so agents don't interfere with each other
- **Spawn all swimlane agents in the same message** so they run concurrently
- **Include the full ticket details** in the prompt — the agent can't read the sprint file from a worktree if it hasn't been committed
- **Copy design constraints** into each agent's prompt so they don't violate them
- **Set agents to run in background** so you can monitor progress

### Phase 4: Review Protocol

After each epic completes (whether foundation or swimlane), spawn a review subagent. Reviews catch issues before they compound.

**Review subagent prompt:**

```
Review the implementation of [Epic name] from sprint [sprint name].

## What to check:

1. **Correctness**: Does the code match the sprint spec? Are all tickets implemented?

2. **Project standards**:
   - Game logic is ONLY in packages/shared (not client or server)
   - Uses world.rng (not Math.random()) in shared package
   - bitECS patterns: module-level queries, NO_TARGET = 0xFFFF sentinel
   - No unused imports or dead code

3. **Single-player / Multiplayer parity**:
   - If the sprint touches gameplay, verify the same logic works for both SP and MP
   - Client-only changes (rendering, UI, audio) don't need MP parity
   - Server-only changes should work with the shared sim

4. **Integration**:
   - Do the file changes match the sprint's "Files Changed" manifest?
   - Are exports wired up correctly (barrel exports, index files)?
   - Do new components/systems register properly with the ECS world?

5. **Edge cases**:
   - Null/undefined guards where the sprint specifies them
   - Graceful degradation (e.g., missing env vars, disabled features)
   - No security issues (command injection, XSS in UI components)

Report findings as:
- BLOCKER: Must fix before merging (wrong behavior, missing functionality, rule violation)
- WARNING: Should fix (code smell, missing guard, style issue)
- NOTE: Optional improvement (not required for this sprint)

If there are no blockers, say "LGTM" and list any warnings.
```

### Phase 5: Merge Swimlanes

After all parallel swimlane agents complete:

1. **Check each worktree result.** The Agent tool returns the worktree path and branch name for agents that made changes.

2. **Merge branches** one at a time into the working branch:
   ```bash
   git merge --no-ff <swimlane-branch> -m "merge: [epic name] swimlane"
   ```

3. **Resolve any conflicts.** Conflicts are unlikely if swimlanes were correctly identified as non-overlapping, but they can happen in shared files like barrel exports (`index.ts`) or configuration. Resolve by combining both additions.

4. **Verify the merged result** compiles:
   ```bash
   bun run typecheck
   bun run build
   ```

5. If merge or build fails, diagnose and fix the issue, then commit the fix.

### Phase 6: Testing

After all epics are merged and reviewed:

1. **Write tests specified in the sprint.** The sprint's "Testing" section describes exactly what unit and integration tests to write. Implement them.

2. **Run the full test suite:**
   ```bash
   bun test
   bun run typecheck
   bun run build
   ```

3. **Fix any failures.** If tests fail, fix the implementation (not the tests, unless the sprint spec was wrong).

4. **Commit tests** with a message like: "test([scope]): add unit and integration tests for [sprint name]"

### Phase 7: Final Integration Check

Spawn a final review subagent that looks at the complete sprint implementation holistically:

```
Review the complete implementation of sprint [name].

Check:
1. All epics from the sprint are implemented
2. The implementation matches the sprint's "Files Changed" manifest
3. All design constraints are satisfied
4. bun run typecheck passes
5. bun run build passes
6. bun test passes
7. No changes to packages that the sprint says should be unchanged (e.g., "No changes to packages/shared")

List any remaining issues or confirm the sprint is complete.
```

## Handling Common Situations

### Sprint specifies code snippets
The code in sprint tickets is guidance, not gospel. Use it as the primary reference but adapt if:
- The existing codebase has diverged from what the sprint assumed
- Types or APIs have changed since the sprint was written
- The snippet has an obvious error

When you deviate, note what changed and why in the commit message.

### Sprint has a "Current State" that doesn't match reality
Read the actual files. If the codebase has changed since the sprint was written, adapt the implementation to the current state. The sprint's intent matters more than its literal instructions.

### A ticket is unclear or contradicts another ticket
Implement the most reasonable interpretation and note the ambiguity in the commit message. Don't block on unclear details — make a judgment call and move on.

### Epic depends on another epic's output
If Epic 3 depends on Epic 2's new types or APIs, Epic 3's agent needs those types available. Either:
- Put them in the same swimlane (sequential within the swimlane)
- Implement the dependency epic first in the foundation phase

### Build fails after merge
This usually means two swimlanes modified the same barrel export or config file. Fix by combining both additions and committing a merge fix.

## Project-Specific Rules

These rules come from CLAUDE.md and project memory. They apply to every sprint:

- **ALL game logic in `packages/shared`** — ECS components, systems, content definitions, RNG
- **Never use `Math.random()` in shared** — use `world.rng` (SeededRng, mulberry32)
- **bitECS queries at module scope** — `defineQuery()` must be defined at module level
- **`NO_TARGET = 0xFFFF`** — never use 0 as a "no entity" sentinel in Uint16Array fields
- **Fixed 60Hz simulation** — game logic ticks at 60Hz, rendering is variable rate with interpolation
- **Build commands**: `bun run typecheck`, `bun run build`, `bun test`
