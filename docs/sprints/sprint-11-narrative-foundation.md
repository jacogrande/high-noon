# Sprint 11: Narrative Foundation — Plot Threads, Dialogue, and Boss Intros

**Goal**: Give each run a story. A plot thread is selected at run start, driving which bosses appear, what objectives mean, and what NPCs say at camp. Bosses get a pre-fight staredown. Camp visitors speak in context. The run ends with a resolution line. One fully-fleshed thread ("The Raid") proves the system; a second thread ("The Stranger") proves it scales.

**Depends on**: Current main (camp visitor system, chat bubbles, boss registry, stage progression, objective system, wave spawner)

---

## Current State

**What exists:**
- `stageProgressionSystem` drives the full stage → clearing → camp → next stage lifecycle
- Camp visitors are fully functional: `selectCampVisitor()` picks from weighted pool, `generateVisitorOffers()` rolls items, `pickVisitorGreeting()` gives a random line
- `ChatBubblePool` renders world-space speech bubbles with typewriter effect, already integrated with `NPCRenderer` dialogue triggers
- Boss registry (`BossModule` interface) has `displayName`, `spawn()`, `tick()`, `attack()` — but no dialogue or intro hooks
- `world.run.stages[]` defines encounters per stage with `bossPool` arrays — boss selection is random via `world.rng`
- Objectives track `status: 'success' | 'soft_failure'` but the outcome is not recorded anywhere after the stage ends
- Discovery NPCs (`npcs.ts`) have 4 types with ambient dialogue lines triggered by proximity
- `waves.ts` defines `STAGE_1_ENCOUNTER`, `STAGE_2_ENCOUNTER`, `STAGE_3_ENCOUNTER` with hardcoded boss pools
- `GameHUD.tsx` shows wave/stage text and "RUN COMPLETE" on final stage clear

**What doesn't exist:**
- Plot thread definitions (no `narrative/` content directory)
- Narrative state on `GameWorld` (no `world.narrative`)
- Boss pre-fight dialogue or camera ritual
- Narrative-driven boss selection (boss pool filtered by thread)
- Outcome tracking across stages (success/soft-failure not persisted between stages)
- Camp visitor dialogue that references the plot
- Resolution text at run end
- Boss name/title display on encounter start

---

## Design Constraints

1. **All narrative logic in `packages/shared`** — thread selection, boss pool filtering, dialogue selection, outcome tracking. Client only renders text and camera effects.
2. **Deterministic** — thread selection and all branching use `world.rng`. Same seed = same story.
3. **Brevity** — Western characters quip, they don't monologue. Boss taunts are 1 line. Camp dialogue is 2–3 lines per visitor. Resolution text is 1–2 sentences. Total script for this sprint: ~60 lines.
4. **Backward compatible** — If no narrative state exists (e.g., old saves or tests), the system falls through to existing random boss selection and generic greetings.
5. **Modular threads** — Each `PlotThread` is a self-contained data object. Adding a new thread requires zero code changes — just a new entry in the thread registry.
6. **No new ECS components** — Narrative state lives on `GameWorld` as a plain object, not in the ECS. It's metadata about the run, not per-entity state.
7. **Boss intro is presentation-only** — The shared sim spawns the boss normally. The client detects the boss spawn and plays a camera ritual + text overlay. No simulation pause or special boss state.
8. **Two threads this sprint** — "The Raid" and "The Stranger". More threads are pure content additions in future sprints.

---

## Epic Overview

| # | Epic | Package(s) | Priority | Estimate |
|---|------|-----------|----------|----------|
| 1 | Narrative state and thread definitions | shared | P0 | Medium |
| 2 | Thread-driven boss selection | shared | P0 | Small |
| 3 | Outcome tracking and path branching | shared | P0 | Medium |
| 4 | Camp dialogue system | shared, client | P0 | Medium |
| 5 | Boss pre-fight intro | client | P0 | Medium |
| 6 | Resolution screen | client | P1 | Small |
| 7 | "The Raid" thread content | shared | P0 | Medium |
| 8 | "The Stranger" thread content | shared | P1 | Medium |
| 9 | Tests | shared | P0 | Medium |

---

## Epic 1: Narrative State and Thread Definitions

### Ticket 1.1 — Create narrative content directory

Create `packages/shared/src/sim/content/narrative/` with:

- `types.ts` — core data types
- `registry.ts` — thread registry and lookup
- `index.ts` — barrel exports

### Ticket 1.2 — Define `PlotThread` data type

**File**: `packages/shared/src/sim/content/narrative/types.ts`

```typescript
/** A plot thread defines the narrative arc of a complete 3-stage run. */
export interface PlotThread {
  id: string                        // 'the_raid', 'the_stranger', etc.
  name: string                      // 'The Raid' — displayed to player
  /** One-line premise shown at run start */
  premise: string

  /** Per-stage configuration. Index 0 = Stage 1, etc. */
  stages: PlotStageConfig[]
}

export interface PlotStageConfig {
  /** Boss types allowed for this stage in this thread */
  bossPool: number[]                // EnemyType values
  /** Objective type override (null = use default from encounter) */
  objectiveType?: string
  /** Objective description override (narrative framing) */
  objectiveDescription?: string
  /** Branching: what happens on soft failure */
  softFailureNext?: PlotBranchModifier
}

export interface PlotBranchModifier {
  /** Replace the next stage's objective description */
  objectiveDescription?: string
  /** Replace the next stage's boss pool */
  bossPool?: number[]
  /** Extra dialogue key to unlock at next camp */
  unlockDialogue?: string
}

/** Tracks narrative state for the current run. */
export interface NarrativeState {
  threadId: string
  /** Outcome per completed stage (index 0 = Stage 1 result) */
  outcomes: Array<'success' | 'soft_failure'>
  /** Dialogue keys that have already been shown (prevent repeats) */
  shownDialogue: Set<string>
  /** Keys unlocked by branching (soft-failure consequences) */
  unlockedKeys: Set<string>
}
```

### Ticket 1.3 — Add `NarrativeState` to `GameWorld`

**File**: `packages/shared/src/sim/world.ts`

- Add `narrative: NarrativeState | null` to `GameWorld` interface (after `run`)
- Initialize as `null` in `createGameWorld()` — set when a run starts with a thread

### Ticket 1.4 — Create thread registry

**File**: `packages/shared/src/sim/content/narrative/registry.ts`

```typescript
const THREADS: Map<string, PlotThread> = new Map()

export function registerThread(thread: PlotThread): void {
  THREADS.set(thread.id, thread)
}

export function getThread(id: string): PlotThread | undefined {
  return THREADS.get(id)
}

export function getAllThreads(): PlotThread[] {
  return [...THREADS.values()]
}

/** Pick a random thread for a new run. */
export function selectThread(rng: SeededRng): PlotThread {
  const all = getAllThreads()
  return all[rng.nextInt(all.length)]!
}
```

### Ticket 1.5 — Wire narrative initialization into run start

**File**: `packages/shared/src/sim/systems/stageProgression.ts` (or wherever `world.run` is initialized)

When a new run starts:
1. Call `selectThread(world.rng)` to pick a thread
2. Create `NarrativeState` and assign to `world.narrative`
3. Use the thread's stage 1 config to filter the boss pool in `world.run.stages[0]`

### Ticket 1.6 — Export from shared barrel

**File**: `packages/shared/src/index.ts`

Export narrative types and registry functions.

---

## Epic 2: Thread-Driven Boss Selection

Replace random boss selection with thread-filtered selection.

### Ticket 2.1 — Filter boss pool in wave spawner

**File**: `packages/shared/src/sim/systems/waveSpawner.ts`

Currently boss selection (around line 238) picks randomly from `encounter.bossPool`. Change to:

```typescript
function selectBoss(world: GameWorld, encounterPool: number[]): number {
  const narrative = world.narrative
  if (narrative) {
    const thread = getThread(narrative.threadId)
    const stageConfig = thread?.stages[world.run!.currentStage]
    if (stageConfig?.bossPool.length) {
      // Intersect thread pool with encounter pool (thread narrows, doesn't add)
      const filtered = encounterPool.filter(t => stageConfig.bossPool.includes(t))
      if (filtered.length > 0) {
        return filtered[world.rng.nextInt(filtered.length)]!
      }
    }
  }
  // Fallback: original random selection
  return encounterPool[world.rng.nextInt(encounterPool.length)]!
}
```

This is backward compatible — if `world.narrative` is null, behavior is unchanged.

---

## Epic 3: Outcome Tracking and Path Branching

Record stage outcomes and apply soft-failure consequences to the next stage.

### Ticket 3.1 — Record stage outcome on stage clear

**File**: `packages/shared/src/sim/systems/stageProgression.ts`

When `encounter.completed` triggers the clearing transition (around line 116–126):

```typescript
if (world.narrative) {
  const outcome = world.objective?.status === 'soft_failure' ? 'soft_failure' : 'success'
  world.narrative.outcomes.push(outcome)
}
```

### Ticket 3.2 — Apply branch modifiers on stage advance

**File**: `packages/shared/src/sim/systems/stageProgression.ts`

When advancing to the next stage (around line 185–196), check if the previous stage had a soft failure with branch modifiers:

```typescript
if (world.narrative) {
  const thread = getThread(world.narrative.threadId)
  const prevStage = world.run!.currentStage - 1
  const prevOutcome = world.narrative.outcomes[prevStage]
  const prevConfig = thread?.stages[prevStage]

  if (prevOutcome === 'soft_failure' && prevConfig?.softFailureNext) {
    const mod = prevConfig.softFailureNext
    if (mod.objectiveDescription && world.objective) {
      world.objective.description = mod.objectiveDescription
    }
    if (mod.unlockDialogue) {
      world.narrative.unlockedKeys.add(mod.unlockDialogue)
    }
    // Boss pool override applied in Epic 2's selectBoss()
  }
}
```

---

## Epic 4: Camp Dialogue System

Give camp visitors plot-aware lines instead of generic greetings.

### Ticket 4.1 — Define dialogue pool type

**File**: `packages/shared/src/sim/content/narrative/types.ts`

```typescript
/** A single dialogue entry with optional conditions. */
export interface NarrativeDialogue {
  key: string                       // Unique ID for dedup
  speaker: 'visitor' | 'narrator'   // Who says it
  text: string                      // The line (1 sentence)
  /** Only show if this key was unlocked by a branch modifier */
  requiresKey?: string
  /** Only show after specific stage outcome */
  requiresOutcome?: { stage: number; outcome: 'success' | 'soft_failure' }
}

/** Dialogue pool for a specific camp beat. */
export interface CampDialoguePool {
  /** Camp index (0 = after Stage 1, 1 = after Stage 2) */
  campIndex: number
  /** Lines in priority order (first matching line wins) */
  lines: NarrativeDialogue[]
}
```

### Ticket 4.2 — Add dialogue pools to PlotThread

Extend `PlotThread`:
```typescript
export interface PlotThread {
  // ... existing fields
  /** Dialogue pools for camp phases */
  campDialogue: CampDialoguePool[]
  /** One-line boss taunt per boss type (shown during intro) */
  bossTaunts: Record<number, string>
  /** Resolution text per final outcome */
  resolution: {
    success: string
    softFailure: string
  }
}
```

### Ticket 4.3 — Select camp dialogue in stage progression

**File**: `packages/shared/src/sim/systems/stageProgression.ts`

When generating camp state (around line 150–164), after selecting the visitor:

```typescript
if (world.narrative) {
  const thread = getThread(world.narrative.threadId)
  const pool = thread?.campDialogue.find(p => p.campIndex === world.run!.currentStage)
  if (pool) {
    const line = pickNarrativeLine(world.narrative, pool.lines)
    if (line) {
      world.narrative.shownDialogue.add(line.key)
      world.campNarrativeLine = line.text  // New field on GameWorld
    }
  }
}
```

### Ticket 4.4 — Add `pickNarrativeLine()` helper

**File**: `packages/shared/src/sim/content/narrative/registry.ts`

```typescript
export function pickNarrativeLine(
  state: NarrativeState,
  lines: NarrativeDialogue[],
): NarrativeDialogue | null {
  for (const line of lines) {
    if (state.shownDialogue.has(line.key)) continue
    if (line.requiresKey && !state.unlockedKeys.has(line.requiresKey)) continue
    if (line.requiresOutcome) {
      const actual = state.outcomes[line.requiresOutcome.stage]
      if (actual !== line.requiresOutcome.outcome) continue
    }
    return line
  }
  return null
}
```

### Ticket 4.5 — Display narrative line in CampPanel

**File**: `packages/client/src/ui/CampPanel.tsx`

Add a `narrativeLine?: string` prop. When present, render it as a short italicized text block between "STAGE CLEAR" and the visitor section. Styled like a Western telegram — monospace, muted gold color, centered.

---

## Epic 5: Boss Pre-Fight Intro

When a boss spawns, the camera pans to it, a title card appears, and optional dialogue plays.

### Ticket 5.1 — Detect boss spawn on client

**File**: `packages/client/src/render/EnemyRenderer.ts`

The enemy renderer already detects new entities during `sync()`. Add boss spawn detection:

```typescript
// In sync(), when a new entity appears:
if (isBoss(type)) {
  this.pendingBossIntro = { eid, type, x: Position.x[eid]!, y: Position.y[eid]! }
}
```

Expose `pendingBossIntro` for the mode controller to consume and clear.

### Ticket 5.2 — Add boss intro event type

**File**: `packages/client/src/scenes/core/GameplayEvents.ts`

```typescript
| { type: 'boss-intro'; bossName: string; taunt: string; x: number; y: number }
```

### Ticket 5.3 — Emit boss intro event

**File**: `packages/client/src/scenes/core/PlayerPresentationEvents.ts`

Add `emitBossIntroEvents()`:
- Check `enemyRenderer.pendingBossIntro`
- Look up `displayName` from boss registry
- Look up taunt from `world.narrative.threadId` → thread → `bossTaunts[bossType]`
- Push `'boss-intro'` event
- Clear `pendingBossIntro`

Wire into both `SingleplayerModeController` and `MultiplayerModeController` alongside existing cue emitters.

### Ticket 5.4 — Create `BossIntroOverlay` component

**File**: `packages/client/src/ui/BossIntroOverlay.tsx`

A cinematic overlay that plays for ~3 seconds:

**Timeline:**
- 0.0–0.5s: Screen letterboxes (black bars slide in from top/bottom)
- 0.3–1.5s: Boss name fades in (large, centered, Western serif font)
- 1.0–2.5s: Taunt text fades in below name (smaller, italic)
- 2.5–3.0s: Everything fades out, letterboxes retract

**Props:**
```typescript
interface BossIntroOverlayProps {
  bossName: string
  taunt: string
  onComplete: () => void   // Called when animation finishes
}
```

**Style:** Full-screen, z-index 65 (above HUD, below pause menu). `pointerEvents: 'none'` so the player can still move during the intro (Western staredown — you CAN draw first).

### Ticket 5.5 — Wire boss intro into GameplayEventProcessor

**File**: `packages/client/src/scenes/core/GameplayEventProcessor.ts`

Handle `'boss-intro'`:
- Add camera trauma (0.2) for dramatic feel
- Set `this.pendingBossIntro = { name, taunt }` for the page to read
- The page renders `<BossIntroOverlay>` when `pendingBossIntro` is set

### Ticket 5.6 — Wire into `Game.tsx` and `MultiplayerGame.tsx`

Add state for boss intro and render `BossIntroOverlay` conditionally. Auto-dismiss after 3 seconds via `onComplete`.

---

## Epic 6: Resolution Screen

Show a brief ending line when the run completes.

### Ticket 6.1 — Add resolution text to run-complete flow

**File**: `packages/shared/src/sim/systems/stageProgression.ts`

When `run.completed = true` (final stage cleared), compute resolution:

```typescript
if (world.narrative) {
  const thread = getThread(world.narrative.threadId)
  const allSuccess = world.narrative.outcomes.every(o => o === 'success')
  world.resolutionText = allSuccess ? thread?.resolution.success : thread?.resolution.softFailure
}
```

Add `resolutionText: string | null` to `GameWorld`.

### Ticket 6.2 — Display resolution in GameHUD or death screen equivalent

**File**: `packages/client/src/ui/GameHUD.tsx`

When `stageStatus === 'completed'` and `resolutionText` is present, show the resolution text below "RUN COMPLETE" in a cinematic font. Fade in over 1 second.

---

## Epic 7: "The Raid" Thread Content

The first complete plot thread — proving the narrative system works end-to-end.

### Ticket 7.1 — Define "The Raid" thread

**File**: `packages/shared/src/sim/content/narrative/theRaid.ts`

**Premise**: "A gang is raiding the town. Stop them before they burn it all down."

**Stage 1 — "First Blood"**
- Boss pool: Reverend Boomstick, Mad Dog Maguire (melee/ranged raid leaders)
- Objective: Protect (defend the town hall)
- Soft failure → "The mayor was captured. Track the gang to their hideout."

**Stage 2 — "The Chase"**
- Boss pool: The Dalton Boys (the gang's enforcers)
- Objective: Intercept (stop the fleeing gang runners)
- Success path objective description: "The gang's runners are escaping with the loot. Stop them."
- Soft failure path objective description: "The mayor is being moved to the gang's hideout. Find them."

**Stage 3 — "The Showdown"**
- Boss pool: Coyote Jane (the mastermind)
- Objective: default (Intercept from encounter)

**Camp dialogue:**
- Camp 1 (after Stage 1):
  - Success: "You held the line, Sheriff. But the gang's not done — they rode east toward the badlands."
  - Soft failure: "The mayor's gone. Witnesses saw riders heading for the canyon. You'd best follow."
- Camp 2 (after Stage 2):
  - Success: "Their trail leads to a canyon hideout. One more ride and this is over."
  - Soft failure: "You couldn't stop them all. The gang's regrouping — expect traps."

**Boss taunts:**
- Boomstick: "The Lord's work ain't pretty, stranger."
- Mad Dog: "You picked the wrong town."
- Dalton Boys: "Two against one. Them's Dalton odds."
- Coyote Jane: "You made it this far? My coyotes will fix that."

**Resolution:**
- Success: "The gang scattered to the winds. The town stands. For now, that's enough."
- Soft failure: "The town survived, but at a cost. Some debts can't be repaid in gold."

### Ticket 7.2 — Register "The Raid" in thread registry

Import and call `registerThread(THE_RAID)` from the narrative barrel.

---

## Epic 8: "The Stranger" Thread Content

A second thread with a different tone — proves the system supports variety.

### Ticket 8.1 — Define "The Stranger" thread

**File**: `packages/shared/src/sim/content/narrative/theStranger.ts`

**Premise**: "A stranger rode into town with a warning. Something's coming from the canyon."

**Stage 1 — "The Warning"**
- Boss pool: Mad Dog Maguire (wild, uncontrolled aggression)
- Objective: Duel (stranger challenges you to prove your worth)
- Soft failure → "The stranger vanished. Whatever spooked him is still out there."

**Stage 2 — "Into the Badlands"**
- Boss pool: Reverend Boomstick, The Dalton Boys
- Objective: Protect (defend a camp of refugees the stranger gathered)

**Stage 3 — "The Canyon's Teeth"**
- Boss pool: Coyote Jane (the canyon predator)
- Objective: default

**Camp dialogue, boss taunts, resolution** — follow same structure as The Raid with different lines.

### Ticket 8.2 — Register "The Stranger" in thread registry

---

## Epic 9: Tests

### Ticket 9.1 — Narrative state unit tests

**File**: `packages/shared/src/sim/content/narrative/narrative.test.ts`

- `selectThread()` returns a valid thread
- `selectThread()` with same seed returns same thread
- `pickNarrativeLine()` skips already-shown lines
- `pickNarrativeLine()` respects `requiresKey` conditions
- `pickNarrativeLine()` respects `requiresOutcome` conditions
- `pickNarrativeLine()` returns null when all lines exhausted

### Ticket 9.2 — Boss selection integration tests

**File**: `packages/shared/src/sim/systems/waveSpawner.test.ts` (or new file)

- Thread-filtered boss pool narrows selection correctly
- Empty intersection falls back to full encounter pool
- Null narrative state uses default behavior

### Ticket 9.3 — Outcome tracking tests

**File**: `packages/shared/src/sim/systems/stageProgression.test.ts` (or new file)

- Objective success records `'success'` in narrative outcomes
- Objective soft failure records `'soft_failure'`
- Branch modifier unlocks dialogue key on soft failure
- Resolution text computed correctly for all-success vs mixed paths

### Ticket 9.4 — Thread content tests

**File**: `packages/shared/src/sim/content/narrative/theRaid.test.ts`

- Thread has valid boss pools (all boss types exist in registry)
- Thread has 3 stage configs matching 3-stage run
- Camp dialogue pools cover both camp indices
- Resolution text exists for both outcomes
- Boss taunts exist for all bosses in all stage pools

---

## Verification

1. `bun run typecheck` — no type errors
2. `bun test packages/shared/` — all tests pass including new narrative tests
3. `bun run build` — builds cleanly
4. Manual test (singleplayer):
   - Start a new run → thread premise text appears briefly
   - Stage 1 boss matches thread's pool (not random from all bosses)
   - Boss spawns → letterbox + name card + taunt plays for ~3 seconds
   - Clear Stage 1 → camp shows narrative line matching your outcome
   - Soft-fail objective → camp line acknowledges failure
   - Clear Stage 3 → resolution text appears below "RUN COMPLETE"
   - Same seed → same thread → same bosses → same dialogue (deterministic)
5. Manual test (multiplayer):
   - Boss intro plays for all connected clients
   - Camp narrative line visible to all players
   - Thread selection is server-authoritative (same thread for all players)
