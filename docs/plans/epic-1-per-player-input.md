# Epic 1: Per-Player Input Routing — Implementation Plan

## Problem

All 5 input-consuming systems receive a single `InputState` via their function parameter and blindly apply it to every player entity in their query. This means every player moves/shoots/rolls identically. Multiplayer requires each player entity to have its own input.

## Current Architecture

```
stepWorld(world, systems, input?)
  → for each system:
      system(world, dt, input)   // same InputState broadcast to all
        → for each player eid:
            read input.*          // every player gets identical input
```

**System type:** `(world: GameWorld, dt: number, input?: InputState) => void`

**Input consumers (5 systems):**
| System | What it reads from `input` |
|---|---|
| `playerInputSystem` | `moveX`, `moveY`, `aimAngle`, `ROLL` button |
| `weaponSystem` | `SHOOT` button, `aimAngle` (via `Player.aimAngle`) |
| `cylinderSystem` | `RELOAD` button |
| `showdownSystem` | `ABILITY` button, `cursorWorldX/Y` |
| `debugSpawnSystem` | `DEBUG_SPAWN` button |

**Non-input systems (13 systems):** Accept `input?` in their signature but never read it. They are already entity-agnostic.

## Target Architecture

```
stepWorld(world, systems, input?)
  → if input provided (single-player):
      populate world.playerInputs for all player eids
  → for each system:
      system(world, dt)          // no input parameter
        → for each player eid:
            read world.playerInputs.get(eid)  // per-entity input
```

### Key Design Decision: Remove `input` from System signature

**Option A (chosen):** Systems read exclusively from `world.playerInputs`. The `System` type becomes `(world, dt) => void`. The `stepWorld` function handles the single-player bridge: when called with an `input` argument, it writes that input into `world.playerInputs` for all player entities before running systems. After systems run, it clears the map.

**Why this is better than leaving `input?` on systems:**
- Single source of truth — no ambiguity about "which input do I use?"
- Cleaner system signatures — 13 non-input systems no longer carry a phantom parameter
- Per-entity from day one — the system loop naturally maps `eid → input`, making multiplayer just "populate the map from the network" instead of "rewrite every system"
- Tests become more realistic — they set up `world.playerInputs` the same way the real code path does

### `debugSpawnSystem` Special Case

`debugSpawnSystem` uses `world.debugSpawnWasDown` (world-level, not per-entity) for edge detection, and spawns test bullets near ALL players. For multiplayer, this is fine — any connected player pressing the debug key triggers it. The system reads from any player's input that has `DEBUG_SPAWN` set. No structural change needed beyond reading from `world.playerInputs`.

---

## Changes by File

### 1. `shared/src/net/input.ts` — No changes

`InputState`, `createInputState()`, `hasButton()` remain unchanged. They are the per-player input data type.

### 2. `shared/src/sim/world.ts` — Add `playerInputs` map

```ts
// Add to GameWorld interface:
playerInputs: Map<number, InputState>

// Add to createGameWorld():
playerInputs: new Map(),

// Add to resetWorld():
world.playerInputs.clear()
```

The map is keyed by entity ID (number), valued by `InputState`. In single-player, it has one entry. In multiplayer, one per connected player.

### 3. `shared/src/sim/step.ts` — Bridge layer + signature change

```ts
// System type changes:
export type System = (world: GameWorld, dt: number) => void

// stepWorld changes:
export function stepWorld(
  world: GameWorld,
  systems: SystemRegistry,
  input?: InputState
): void {
  // Single-player bridge: populate playerInputs from the single input
  if (input) {
    const players = playerQuery(world)
    for (const eid of players) {
      world.playerInputs.set(eid, input)
    }
  }

  // Run all registered systems (no input parameter)
  for (const system of systems.getSystems()) {
    system(world, TICK_S)
  }

  // Clear after tick (server will re-populate from network each tick)
  world.playerInputs.clear()

  // Increment tick counter
  world.tick++
  world.time += TICK_S
}
```

**Backward compatibility:** `stepWorld(world, systems, inputState)` still works — callers don't change. The server will call `stepWorld(world, systems)` without input (it populates `world.playerInputs` directly from the network before calling step).

**Note:** Import `playerQuery` from `./queries` (already exists, queries `[Player, Position]`).

### 4. `shared/src/sim/systems/playerInput.ts` — Read from `world.playerInputs`

Per-entity loop reads `world.playerInputs.get(eid)` instead of the shared `input` parameter:

```ts
export function playerInputSystem(world: GameWorld, _dt: number): void {
  const players = playerQuery(world)

  for (const eid of players) {
    const input = world.playerInputs.get(eid)
    if (!input) continue    // no input for this player this tick

    // ... rest unchanged, using local `input`
  }
}
```

Remove `input?: InputState` from signature. The body is nearly identical — just move the null check inside the loop.

### 5. `shared/src/sim/systems/weapon.ts` — Same refactor

```ts
export function weaponSystem(world: GameWorld, dt: number): void {
  const entities = weaponQuery(world)

  for (const eid of entities) {
    const input = world.playerInputs.get(eid)
    if (!input) continue

    // ... rest unchanged
  }
}
```

### 6. `shared/src/sim/systems/cylinder.ts` — Same refactor

```ts
export function cylinderSystem(world: GameWorld, dt: number): void {
  const entities = cylinderQuery(world)

  for (const eid of entities) {
    const input = world.playerInputs.get(eid)

    // Fire cooldown always ticks (input-independent)
    if (Cylinder.fireCooldown[eid]! > 0) {
      Cylinder.fireCooldown[eid] = Math.max(0, Cylinder.fireCooldown[eid]! - dt)
    }

    if (!input) continue  // remaining logic needs input

    // ... rest unchanged
  }
}
```

**Subtle difference:** Fire cooldown decrement and roll-cancel-reload are input-independent mechanics that should still run even when a player has no input this tick (e.g., brief network dropout). The reload timer advancing is also input-independent. Only manual reload initiation (`RELOAD` button) needs input. So we split: tick cooldowns/timers always, gate button reads on `if (!input)`.

### 7. `shared/src/sim/systems/showdown.ts` — Same refactor

```ts
export function showdownSystem(world: GameWorld, dt: number): void {
  // Reset per-tick flags
  world.showdownKillThisTick = false
  world.showdownActivatedThisTick = false
  world.showdownExpiredThisTick = false

  const players = showdownPlayerQuery(world)

  for (const eid of players) {
    const input = world.playerInputs.get(eid)

    // Cooldown + active duration management (input-independent)
    // ... existing code for cooldown decrement, kill detection, expiry ...

    // Activation (input-dependent)
    if (input) {
      // ... existing activation code using `input` ...
    }
  }
}
```

This system already partially handles `input` being absent (the activation block is gated on `if (input)`). Just move input lookup inside the loop.

### 8. `shared/src/sim/systems/debugSpawn.ts` — Same refactor

```ts
export function debugSpawnSystem(world: GameWorld, _dt: number): void {
  // Check if ANY player pressed debug spawn
  let isDown = false
  for (const [, input] of world.playerInputs) {
    if (hasButton(input, Button.DEBUG_SPAWN)) {
      isDown = true
      break
    }
  }

  const justPressed = isDown && !world.debugSpawnWasDown
  world.debugSpawnWasDown = isDown

  if (!justPressed) return

  // Spawn near all players (unchanged)
  const players = playerQuery(world)
  for (const eid of players) { ... }
}
```

### 9. Non-input systems (13 systems) — Signature-only change

These systems accept `input?: InputState` but never read it. Drop the parameter:

```ts
// Before:
export function movementSystem(world: GameWorld, dt: number, _input?: InputState): void
// After:
export function movementSystem(world: GameWorld, dt: number): void
```

Affected: `movementSystem`, `rollSystem`, `bulletSystem`, `bulletCollisionSystem`, `healthSystem`, `collisionSystem`, `spatialHashSystem`, `flowFieldSystem`, `enemyDetectionSystem`, `enemyAISystem`, `enemySteeringSystem`, `enemyAttackSystem`, `waveSpawnerSystem`, `buffSystem`.

Most of these don't even name the `input` parameter (they use `_input` or omit it). Check each — only update ones that explicitly have it in their signature.

### 10. Test updates

Tests that call input-consuming systems directly need to populate `world.playerInputs` instead of passing `input` as an argument.

**Add a test helper** (inline in each test file or in a shared test-utils):

```ts
function setInput(world: GameWorld, eid: number, input: InputState): void {
  world.playerInputs.set(eid, input)
}
```

**Example migration (weapon.test.ts):**

```ts
// Before:
weaponSystem(world, 1 / 60, input)

// After:
world.playerInputs.set(playerEid, input)
weaponSystem(world, 1 / 60)
```

**"no input" tests** now mean "don't populate playerInputs" rather than passing `undefined`:

```ts
// Before:
weaponSystem(world, 1 / 60, undefined)

// After:
weaponSystem(world, 1 / 60)  // playerInputs is empty
```

**Affected test files:**
- `weapon.test.ts` — ~20 call sites
- `cylinder.test.ts` — ~15 call sites
- `showdown.test.ts` — check for input passing
- Any integration tests using `stepWorld(world, systems, input)`

---

## Execution Order

1. **`world.ts`** — Add `playerInputs` field (no breakage, just a new empty map)
2. **`step.ts`** — Change `System` type + `stepWorld` bridge (breaks all system signatures)
3. **All 5 input systems** — Refactor to read `world.playerInputs.get(eid)` (fixes the break)
4. **Non-input systems** — Drop unused `input` param from signatures (fixes remaining type errors)
5. **Tests** — Update to populate `world.playerInputs` instead of passing `input` arg
6. **Typecheck + test run** — Verify everything passes

Steps 3 and 4 can be done in parallel but must all complete before step 5 makes sense to verify.

## Risk Assessment

- **Low risk:** This is a pure refactor — no behavior change in single-player. The `stepWorld` bridge ensures identical behavior.
- **Test coverage:** Existing tests cover all 5 input systems thoroughly. Migrating them validates the refactor.
- **No client changes:** `GameScene.ts` calls `stepWorld(world, systems, inputState)` — this still works unchanged.
