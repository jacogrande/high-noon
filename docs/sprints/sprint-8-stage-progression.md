# Sprint 8: Stage Progression — 3 Stages with Wave-Based Advancement

**Goal**: Implement a 3-stage run where completing all waves in a stage transitions the player to the next stage. Each stage has 3 waves (for testing). No bosses, no side objectives — just clean stage progression with enemy cleanup and encounter reset between stages.

**Depends on**: Current main (wave spawner, encounter system, HUD)

---

## Current State

The game has a single `STAGE_1_ENCOUNTER` with 4 waves. When the final wave completes (`enc.completed = true`), the HUD shows "COMPLETE" and nothing else happens. There is no concept of multiple stages.

**What exists:**
- `StageEncounter` — array of `WaveDefinition[]`
- `EncounterState` — runtime state tracking current wave, budget, kill counts
- `setEncounter(world, encounter)` — initializes encounter state on world
- `waveSpawnerSystem` — runs each tick, spawns enemies, detects wave clears
- HUD shows `WAVE X / Y` and `COMPLETE`
- Single-player: `SingleplayerModeController` calls `setEncounter(world, STAGE_1_ENCOUNTER)` once
- Multiplayer: `GameRoom.maybeStartMatch()` calls `setEncounter(world, STAGE_1_ENCOUNTER)` once

**What doesn't exist:**
- Multiple encounter definitions (stage 2, stage 3)
- Stage progression state on GameWorld
- Enemy cleanup between stages
- Stage transition detection
- HUD display for current stage

---

## Epic Overview

| # | Epic | Package(s) | Priority |
|---|------|-----------|----------|
| 1 | Stage progression state & data | shared | P0 |
| 2 | Stage transition system | shared | P0 |
| 3 | Enemy cleanup between stages | shared | P0 |
| 4 | Stage encounter definitions (3 waves each) | shared | P0 |
| 5 | HUD updates | shared, client | P1 |
| 6 | Multiplayer sync | shared, server, client | P1 |
| 7 | Tests | shared | P0 |

---

## Epic 1: Stage Progression State & Data

Add a `RunState` to `GameWorld` that tracks which stage the player is on and whether the run is complete.

### Ticket 1.1 — Define `RunState` interface

Add to `packages/shared/src/sim/world.ts`:

```typescript
export interface RunState {
  /** Current stage index (0-based) */
  currentStage: number
  /** Total number of stages in this run */
  totalStages: number
  /** Ordered list of encounters, one per stage */
  stages: StageEncounter[]
  /** Whether all stages are complete (run won) */
  completed: boolean
  /** Transition state between stages */
  transition: 'none' | 'clearing' | 'ready'
  /** Timer for transition delay (seconds remaining) */
  transitionTimer: number
}
```

### Ticket 1.2 — Add `run` field to `GameWorld`

Add `run: RunState | null` to the `GameWorld` interface. Initialize as `null` in `createGameWorld()`.

### Ticket 1.3 — Add `startRun()` function

Create a `startRun(world, stages)` function that:
1. Sets `world.run` with the provided stage encounters
2. Calls `setEncounter(world, stages[0])` to kick off stage 1
3. This replaces direct `setEncounter()` calls in singleplayer/multiplayer init

```typescript
export function startRun(world: GameWorld, stages: StageEncounter[]): void {
  world.run = {
    currentStage: 0,
    totalStages: stages.length,
    stages,
    completed: false,
    transition: 'none',
    transitionTimer: 0,
  }
  setEncounter(world, stages[0])
}
```

---

## Epic 2: Stage Transition System

A new `stageProgressionSystem` that watches for encounter completion and drives stage transitions.

### Ticket 2.1 — Create `stageProgressionSystem`

New file: `packages/shared/src/sim/systems/stageProgression.ts`

System logic (runs every tick):
1. **Early out** if `world.run` is null, already completed, or encounter not yet completed
2. **On encounter completion** (`enc.completed && run.transition === 'none'`):
   - Set `run.transition = 'clearing'`
   - Set `run.transitionTimer = 3.0` (3 second pause for cleanup)
3. **During 'clearing'** phase:
   - Tick down `transitionTimer`
   - On first tick of clearing: destroy all remaining enemies (Epic 3)
   - When timer hits 0:
     - If more stages remain: advance `currentStage`, call `setEncounter(world, stages[next])`, set `transition = 'none'`
     - If no more stages: set `run.completed = true`

### Ticket 2.2 — Register system in `registerAllSystems`

Insert `stageProgressionSystem` right after `waveSpawnerSystem` in the system order. It needs to read `enc.completed` which the wave spawner sets.

Do NOT add to prediction or replay systems — stage progression is server/canonical only.

### Ticket 2.3 — Add `stageCleared` tick flag

Add `stageCleared: boolean` to `GameWorld` (reset each tick like other flags). The stage progression system sets this to `true` on the tick that a stage's clearing phase begins. This lets client-side code react (camera effects, announcements, etc.) without polling.

---

## Epic 3: Enemy Cleanup Between Stages

When a stage completes, all remaining enemies and enemy bullets need to be destroyed before the next stage starts.

### Ticket 3.1 — Create `clearAllEnemies(world)` utility

Add to `packages/shared/src/sim/world.ts` (or a new `packages/shared/src/sim/cleanup.ts`):

```typescript
export function clearAllEnemies(world: GameWorld): void {
  const enemies = enemyQuery(world)
  for (const eid of enemies) {
    removeEntity(world, eid)
  }
}
```

Also clear enemy bullets (bullets not owned by any player). Use the existing `Bullet` + `Owner` component pattern — any bullet with `Owner.eid` set to an enemy or `NO_OWNER` gets removed.

### Ticket 3.2 — Clear encounter-related world state

When clearing between stages, also reset:
- `world.flowField` — rebuild for new stage
- `world.spatialHash` — clear stale enemy references
- Fodder-related tracking (`encounter` gets replaced by `setEncounter` already)

Do NOT reset: player state, upgrade state, hooks, RNG (continuity across stages).

---

## Epic 4: Stage Encounter Definitions

Define 3 test encounters with 3 waves each. These are intentionally simple — just escalating difficulty to test the progression flow.

### Ticket 4.1 — Restructure wave definitions

In `packages/shared/src/sim/content/waves.ts`:

Replace `STAGE_1_ENCOUNTER` (4 waves) with three 3-wave encounters:

```typescript
/** Stage 1: Town Outskirts — easy intro */
export const STAGE_1_ENCOUNTER: StageEncounter = {
  waves: [
    // Wave 1: Swarmers only, 1 shooter
    // Wave 2: Mixed fodder, 1 shooter + 1 charger
    // Wave 3: Heavier fodder, 2 shooters
  ]
}

/** Stage 2: Badlands — medium pressure */
export const STAGE_2_ENCOUNTER: StageEncounter = {
  waves: [
    // Wave 1: Grunt-heavy, 2 shooters
    // Wave 2: Mixed + goblin types, 2 shooters + 1 charger
    // Wave 3: High budget, 2 shooters + 2 chargers
  ]
}

/** Stage 3: Devil's Canyon — hard finish */
export const STAGE_3_ENCOUNTER: StageEncounter = {
  waves: [
    // Wave 1: Dense goblins, 2 chargers + 1 shooter
    // Wave 2: Max fodder pressure, 3 shooters + 1 charger
    // Wave 3: All-out, 3 shooters + 2 chargers, high budget
  ]
}

/** Default 3-stage run */
export const DEFAULT_RUN_STAGES: StageEncounter[] = [
  STAGE_1_ENCOUNTER,
  STAGE_2_ENCOUNTER,
  STAGE_3_ENCOUNTER,
]
```

Each stage should ramp fodder budget, max alive count, threat count, and introduce tougher fodder pool mixes. Keep `threatClearRatio` around 0.5-1.0 so waves don't drag.

### Ticket 4.2 — Tune spawn delays

- Stage 1 wave 1: `spawnDelay: 0` (immediate start)
- All other waves: `spawnDelay: 4-6` seconds
- First wave of stages 2 and 3: `spawnDelay: 0` (the 3-second clearing phase provides enough breathing room)

---

## Epic 5: HUD Updates

### Ticket 5.1 — Add stage info to HUD state

Update `HUDState` (client), `HudData` (shared net), and all producers:

```typescript
// Add to HUDState and HudData:
stageNumber: number    // 1-indexed for display
totalStages: number
stageStatus: 'active' | 'clearing' | 'completed' | 'none'
```

### Ticket 5.2 — Update HUD producers

**SingleplayerModeController.getHUDState():**
```typescript
stageNumber: run ? run.currentStage + 1 : 0,
totalStages: run ? run.totalStages : 0,
stageStatus: run ? (run.completed ? 'completed' : run.transition !== 'none' ? 'clearing' : 'active') : 'none',
```

**GameRoom.sendHudUpdates():** Same derivation from `world.run`.

**MultiplayerModeController.getHUDState():** Read from `latestHud`.

### Ticket 5.3 — Update GameHUD display

Change the wave indicator area to show both stage and wave:

```
STAGE 1 / 3 — WAVE 2 / 3        (during active play)
STAGE CLEAR                       (during clearing transition)
RUN COMPLETE                      (all stages done)
```

Keep it minimal — one line at the top center.

---

## Epic 6: Multiplayer Sync

### Ticket 6.1 — Update `GameRoom` to use `startRun()`

Replace `setEncounter(this.world, STAGE_1_ENCOUNTER)` with `startRun(this.world, DEFAULT_RUN_STAGES)`.

### Ticket 6.2 — Add stage fields to HudData broadcast

Add `stageNumber`, `totalStages`, `stageStatus` to the HUD data broadcast. Derive from `world.run` the same way as singleplayer.

### Ticket 6.3 — Update `MultiplayerModeController` HUD consumption

Read the new stage fields from `latestHud` and expose them in `getHUDState()`.

---

## Epic 7: Tests

### Ticket 7.1 — Unit test `stageProgressionSystem`

New file: `packages/shared/src/sim/systems/stageProgression.test.ts`

Test cases:
- System no-ops when `world.run` is null
- System no-ops when run is already completed
- Encounter completion triggers 'clearing' transition
- Clearing timer counts down correctly
- Enemy cleanup happens during clearing phase
- Next stage starts after clearing timer expires
- Run completes after final stage
- Player state (HP, upgrades, position) persists across stage transitions

### Ticket 7.2 — Unit test `clearAllEnemies`

- Removes all enemy entities
- Removes enemy-owned bullets
- Does not remove player entities
- Does not remove player-owned bullets

### Ticket 7.3 — Integration test: full 3-stage run

Create a test that fast-forwards through all 3 stages (spawn enemies, instantly kill threats each wave) and verifies:
- Stage advances 1 → 2 → 3 → completed
- `run.completed` is true at the end
- Wave counter resets for each stage
- Enemy count is 0 at start of each new stage

### Ticket 7.4 — Update existing waveSpawner tests

The existing `waveSpawner.test.ts` tests use `STAGE_1_ENCOUNTER` which is changing from 4 waves to 3. Update test expectations to match the new 3-wave structure.

---

## Implementation Order

```
Ticket 1.1  RunState interface
Ticket 1.2  GameWorld.run field
Ticket 1.3  startRun() function
  ↓
Ticket 4.1  Stage encounter definitions (3 stages × 3 waves)
Ticket 4.2  Tune spawn delays
  ↓
Ticket 3.1  clearAllEnemies() utility
Ticket 3.2  Clear encounter state between stages
  ↓
Ticket 2.1  stageProgressionSystem
Ticket 2.2  Register in system order
Ticket 2.3  stageCleared tick flag
  ↓
Ticket 7.1  Test stageProgressionSystem
Ticket 7.2  Test clearAllEnemies
Ticket 7.3  Integration test: full run
Ticket 7.4  Update existing wave spawner tests
  ↓
Ticket 5.1  HUD state additions
Ticket 5.2  HUD producers (SP + MP)
Ticket 5.3  GameHUD display
  ↓
Ticket 6.1  GameRoom uses startRun()
Ticket 6.2  HUD broadcast additions
Ticket 6.3  MP client HUD consumption
  ↓
Ticket 1.3* Update SingleplayerModeController to use startRun()
```

---

## Files Changed

| File | Change |
|------|--------|
| `packages/shared/src/sim/world.ts` | Add `RunState`, `GameWorld.run`, `startRun()`, `clearAllEnemies()` |
| `packages/shared/src/sim/systems/stageProgression.ts` | **NEW** — stage progression system |
| `packages/shared/src/sim/systems/index.ts` | Export + register `stageProgressionSystem` |
| `packages/shared/src/sim/content/waves.ts` | 3 stage encounters + `DEFAULT_RUN_STAGES` |
| `packages/shared/src/net/hud.ts` | Add stage fields to `HudData` |
| `packages/client/src/scenes/types.ts` | Add stage fields to `HUDState` |
| `packages/client/src/scenes/core/SingleplayerModeController.ts` | Use `startRun()`, derive stage HUD |
| `packages/client/src/ui/GameHUD.tsx` | Show stage + wave info |
| `packages/server/src/rooms/GameRoom.ts` | Use `startRun()`, broadcast stage HUD |
| `packages/client/src/scenes/core/MultiplayerModeController.ts` | Read stage HUD from server |
| `packages/shared/src/sim/systems/stageProgression.test.ts` | **NEW** — tests |
| `packages/shared/src/sim/systems/waveSpawner.test.ts` | Update for 3-wave encounters |

---

## Out of Scope

- Boss encounters between stages
- Side objectives / soft failure conditions
- Different tilemaps per stage (all stages use the same arena for now)
- Camp / shop between stages
- Player healing between stages
- Narrative events or dialogue
- Procedural stage generation
- Stage-specific enemy types
