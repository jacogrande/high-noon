# Code Quality Review

**Date**: 2026-02-26
**Scope**: Full codebase (`packages/shared`, `packages/client`, `packages/server`)

---

## Summary

The codebase is well-architected overall — deterministic simulation is properly isolated in shared, the ECS pattern is applied consistently, seeded RNG discipline is perfect (`Math.random()` never appears in sim code), and cross-package boundaries are correct at the dependency graph level. The most significant structural issues are a handful of god objects (`GameWorld` at ~90 properties, two mode controllers at 1400-1800 lines, `GameRoom` at 2092 lines), a duplicated damage pipeline, and several module-level mutable singletons that break multi-instance safety. Three issues are critical: an unprotected debug endpoint, a shared snapshot buffer that can silently corrupt, and a virtual bullet ID counter that leaks across worlds.

---

## Critical

### 1. Unprotected debug endpoint can kill all enemies in live games

**File**: `packages/server/src/rooms/GameRoom.ts:761-772`

The `debug-spawn-pause` message handler has no authentication or environment gate. Any connected client can send this message to toggle spawn pauses and instantly kill every enemy in the room (`Health.current[eid] = 0` for all active enemies).

**Impact**: Full game-state manipulation available to all clients in production. Any player with a WebSocket client can grief every live room.

**Fix**:
```typescript
this.onMessage('debug-spawn-pause', (client) => {
  if (!process.env.DEBUG_COMMANDS) return
  if (client.sessionId !== this.ownerSessionId) return
  this.world.spawnsPaused = !this.world.spawnsPaused
  // ...
})
```

---

### ~~2. Shared snapshot buffer returns a view, not a copy~~ FIXED

**File**: `packages/shared/src/net/snapshot.ts:110, 314`

`encodeSnapshot` returns a `Uint8Array` *view* into a module-level `let sharedBuffer`. If the server ever processes two rooms on the same JS thread without an await between them, or if any caller stores the reference without copying, the buffer is silently overwritten. The current safety relies entirely on caller discipline — `GameRoom.ts:2083-2086` has a comment explaining why it is safe today, but the guarantee lives in the caller, not the function's contract.

**Impact**: Silent data corruption in snapshots. Any future refactor that adds an `await` between encode and send, or adds a second snapshot path (e.g., forced reconnect snapshot), can corrupt the buffer with no type-system warning.

**Fix**: Return a copy instead of a view:
```typescript
// Current — returns a view into shared mutable buffer
return new Uint8Array(sharedBuffer, 0, offset)

// Safe — returns an owned copy
return new Uint8Array(sharedBuffer.slice(0, offset))
```

Alternatively, accept an output buffer parameter, or at minimum document the zero-copy contract in the function's JSDoc and add a runtime assertion that the buffer is consumed before the next tick.

---

### ~~3. Module-level mutable `nextVirtualBulletId` leaks across worlds~~ FIXED

**File**: `packages/shared/src/sim/systems/weapon.ts:44`

```typescript
let nextVirtualBulletId = -1
```

This module-level counter is shared across all `GameWorld` instances in a process and is never reset. On the server, each `GameRoom` creates a new `GameWorld`, but the module is loaded once per process. The counter decrements forever, causing non-deterministic test behavior and eventual collision with real entity IDs on long-running servers.

**Impact**: Non-deterministic behavior between test runs; eventual entity ID collision causing wrong hooks to fire or wrong bullet lookups.

**Fix**: Move the counter onto `GameWorld`:
```typescript
// world.ts — add to GameWorld interface:
nextVirtualBulletId: number  // initialized to -1 in createGameWorld

// weapon.ts — replace module-level variable with:
const virtualBulletId = world.nextVirtualBulletId--
```

---

## High

### 4. `GameWorld` is a god object (~90 properties, 1025 lines)

**File**: `packages/shared/src/sim/world.ts:420-647`

`GameWorld` mixes at least eight distinct concerns in a single flat structure:

1. Core ECS state (`tick`, `time`, `tilemap`, `spatialHash`)
2. Character ability state (`lastRitesZones`, `lastRites`, `dustClouds`, `rockslideShockwaves`, `dynamites`)
3. Boss-specific state (`hollowManVeils`, `hollowManStorm`, `oldScratchStorm`, `bossShockwaves`, `bossTelegraphs`, `groundCracks`, `trapZones`)
4. Lag compensation state (8 fields: `lagCompEnabled` through `lagCompGetEnemyStateAtTick`)
5. Per-tick event buffers (20+ arrays like `healerPulses`, `healEvents`, `rattlesnakeBites`, `vultureDiveImpacts`)
6. Run/stage lifecycle state (`run`, `encounter`, `narrative`, `campVisitor`, `draftState`)
7. Economy state (`goldNuggets`, `goldCollected`, `killCount`, `shovelCount`)
8. Interaction state (5 maps: `interactionHoldTicksByPlayer` etc.)

The `resetWorld` and `createGameWorld` functions must be manually kept in sync — any new field requires touching three separate places with no compiler enforcement.

**Impact**: Every new feature adds more surface area. Future refactors will miss resetting state. The duplication is a maintenance time bomb.

**Fix**: Group related state into sub-objects with their own init/reset helpers:
```typescript
export interface LagCompState {
  enabled: boolean
  maxRewindTicks: number
  shotTickByPlayer: Map<number, number>
  // ...
}

export interface GameWorld extends IWorld {
  tick: number
  time: number
  tilemap: Tilemap | null
  lagComp: LagCompState
  lifecycle: RunLifecycleState
  // ...
}
```

---

### 5. Multiplayer controller missing 5 renderers that singleplayer has

**File**: `packages/client/src/scenes/core/MultiplayerModeController.ts`

`MultiplayerModeController` does not instantiate or tick:
- `TrapZoneRenderer` (bear traps, caltrops)
- `MapObstacleRenderer` (crates, barrels, boulders)
- `DustStormEffect`
- `TumbleweedRenderer`
- `CollisionDebugRenderer`

These features exist in the shared simulation but are invisible to multiplayer players.

**Impact**: Visual feature gap in multiplayer; potential PixiJS leaks if added later without corresponding destroy calls.

**Fix**: Extract renderer construction and lifecycle into a shared `RendererBundle` helper, instantiated by both controllers. Additions to the visual set then propagate to both modes automatically.

---

### 6. Duplicate damage pipeline across hitscan and projectile paths

**Files**: `packages/shared/src/sim/systems/bulletCollision.ts:286-288`, `packages/shared/src/sim/systems/weapon.ts:409`

The damage transform chain (Showdown bonus, FrontArmor reduction, Final Arrangement, hook transforms, friendly fire) is duplicated across two files. `weapon.ts:409` itself admits the ordering must match:

```
// Order: friendly fire → final arrangement (matches projectile path in bulletCollision.ts)
```

**Impact**: Any change to damage pipeline ordering must be synchronized across three files manually. A divergence causes projectile vs hitscan damage inconsistency, breaking competitive fairness.

**Fix**: Create a `resolveDamage(world, params)` function in a shared `damage.ts` module that encapsulates all pre-application transforms and returns a final damage value. Both `bulletCollision.ts` and `weapon.ts` call it.

---

### 7. Multiplayer controller hardcodes camera recoil

**File**: `packages/client/src/scenes/core/MultiplayerModeController.ts:1179`

Passes hardcoded `fireTrauma: 0.15` and `fireKickStrength: 5`. Singleplayer correctly uses `CHARACTER_RECOIL[this.world.characterId]` at line 836.

**Impact**: Wrong camera recoil for any non-default character in multiplayer.

**Fix**:
```typescript
const recoil = CHARACTER_RECOIL[this.authoritativeCharacterId]
this.dryFireCooldown = emitCylinderPresentationEvents({
  // ...
  fireTrauma: recoil.fireTrauma,
  fireKickStrength: recoil.cameraKickStrength,
  fireSlowdownMs: recoil.fireSlowdownMs,
})
```

---

### 8. Player name has no sanitization or length cap

**File**: `packages/server/src/rooms/GameRoom.ts:793`

Client-supplied `options.name` is stored directly into Colyseus Schema and broadcast to every other player via `player-roster`, `votekick-vote`, and `draft` HUD messages. No length cap, no whitespace trim, no character allowlist. A client can supply a 10,000-character name or embed special characters.

**Impact**: UI layout breakage, log injection, or client-side crashes if any consumer does string operations without expecting very long input.

**Fix**:
```typescript
const MAX_NAME_LENGTH = 24
const rawName = options?.name ?? ''
meta.name = String(rawName)
  .trim()
  .replace(/[^\x20-\x7E]/g, '') // Printable ASCII only
  .slice(0, MAX_NAME_LENGTH) || client.sessionId.slice(0, 8)
```

---

### 9. `select-node` message has no phase guard

**File**: `packages/server/src/rooms/GameRoom.ts:685-694`

A player can send `select-node` during the lobby phase before a run starts. `getUpgradeStateForPlayer` and `takeNode` will execute against an ECS entity that may not be fully initialized.

**Impact**: Skill tree nodes can be taken outside the valid game flow, triggering `buffSystem` hooks or stat mutations before `startRun` has set up the encounter.

**Fix**:
```typescript
this.onMessage('select-node', (client, data: SelectNodeRequest) => {
  if (this.state.phase !== 'playing') return
  // ...
})
```

---

### 10. Rendering metadata coupled into shared `EnemyDefinition`

**File**: `packages/shared/src/sim/content/enemyRegistry.ts`

`EnemyDefinition` includes `color: number`, `spriteId?: string`, and `spriteScale: number` — client-only rendering fields that live in the authoritative shared data definition. The server carries this dead weight, and it sets a precedent for pulling browser-only code into shared.

**Impact**: If a future developer adds a `Texture` or `Sprite` reference, it will pull browser-only code into the server bundle. The existing comment ("client-only metadata") acknowledges this but doesn't enforce it.

**Fix**: Split the definition types — keep gameplay-pure stats in shared, put rendering metadata in a parallel `EnemyRenderDef` type in the client package keyed by `EnemyType`. If deferred, at minimum add a `// DO NOT add rendering types here` comment to the interface.

---

### 11. `healthSystem` handles 8+ concerns in a single pass

**File**: `packages/shared/src/sim/systems/health.ts:1-182`

In a single pass over `healthQuery` it handles: i-frame ticking, death detection, downed-state transitions, kill hook firing, kill counting, kill streak tracking, gold reward queuing, XP awarding, item drop rolling, HP potion drop rolling, Last Rites pulse queuing, and ECS entity cleanup.

**Impact**: Extremely difficult to test individual behaviors in isolation. Adding a new on-death effect means editing an already complex function.

**Fix**: Split into `iframeSystem` (ticks `Health.iframes`) and `deathSystem` (processes entities with `Health.current <= 0`). Inside `deathSystem`, dispatch to focused helpers:
```typescript
function handleEnemyDeath(world, eid) { /* drops, XP, gold queue */ }
function handlePlayerDeath(world, eid) { /* downed / dead tag */ }
```

---

### 12. Shared tsconfig includes DOM lib

**File**: `tsconfig.base.json` → inherited by `packages/shared/tsconfig.json`

The root config includes `"lib": ["ES2022", "DOM", "DOM.Iterable"]` and shared does not override it. All DOM types (`window`, `document`, `localStorage`) are available in shared TypeScript code with no type error. This defeats the "shared must be platform-agnostic" invariant.

**Impact**: TypeScript will not catch any accidental use of browser APIs in the deterministic sim.

**Fix**: Add a `lib` override in `packages/shared/tsconfig.json`:
```json
{
  "compilerOptions": {
    "lib": ["ES2022"]
  }
}
```

---

### 13. `SoundManager` mutates global `Howler` singleton without cleanup

**File**: `packages/client/src/audio/SoundManager.ts:15-17, 51, 60`

`SoundManager` mutates `Howler` (a process-global singleton) in `applyPrefs()`, `setMasterVolume()`, and the `muted` setter. `destroy()` calls `howl.unload()` per sound but never resets `Howler.volume()` or `Howler.mute()`, so a destroyed instance can leave global mute state active for the next instance.

**Impact**: During scene transitions (destroy old → create new), if the old instance's mute state leaks, the next game starts muted or at wrong volume.

**Fix**:
```typescript
destroy(): void {
  for (const { howl } of this.howls.values()) {
    howl.unload()
  }
  this.howls.clear()
  Howler.mute(false)
  Howler.volume(1)
}
```

---

## Medium

### 14. `mapGenerator.ts` is 1077 lines

**File**: `packages/shared/src/sim/content/maps/mapGenerator.ts`

Mixes street profile generation, alley generation, building placement, floor tile painting, road network construction, hazard placement, obstacle placement, flood fill connectivity, and spur road generation.

**Fix**: Split into `streetLayout.ts`, `buildingPlacer.ts`, `hazardPlacer.ts`, and keep `mapGenerator.ts` as an orchestrator.

---

### 15. Side-effect registration on import for enemies and bosses

**Files**: `packages/shared/src/sim/content/enemyRegistry.ts:80`, `packages/shared/src/sim/content/bosses/registry.ts:34`

Both registries accumulate side-effect registrations at import time. Tests cannot vary or isolate which enemies/bosses exist. If two test files import in different orders, duplicate-registration panics can occur (`enemyRegistry.ts:85` throws on duplicates).

**Fix**: Convert implicit side effects to explicit calls:
```typescript
export function registerAllEnemies(): void {
  if (isRegistryInitialized()) return
  registerEnemy({ type: EnemyType.SWARMER, ... })
  // ...
}
```

---

### 16. Bare side-effect import for boss registration

**File**: `packages/shared/src/sim/systems/index.ts:29`

```typescript
// Trigger boss module registration
import '../content/bosses'
```

A comment-explained implicit side effect. The content barrel also handles this via `content/index.ts`, making this redundant and misleading.

**Fix**: Remove the bare import. Make registration explicit via a `bootstrapAllContent()` function called from `createGameWorld`.

---

### 17. Non-null assertions on item lookups at module load time

**File**: `packages/shared/src/sim/content/upgrade.ts:19-33`

```typescript
const TIN_STAR_BADGE_ID = getItemDefByKey('tin_star_badge')!.id
const FOOLS_GOLD_NUGGET_ID = getItemDefByKey('fools_gold_nugget')!.id
```

If an item key is renamed or removed, this becomes a runtime crash (`.id` on `undefined`) instead of a type error. Also a load-order dependency.

**Fix**:
```typescript
function requireItemId(key: string): number {
  const def = getItemDefByKey(key)
  if (!def) throw new Error(`Item key '${key}' not found in registry`)
  return def.id
}
```

---

### 18. `clearEnemiesCore` is a partial `resetWorld` that diverges

**File**: `packages/shared/src/sim/systems/stageProgression.ts:42-100`

Clears `world.bossState`, `world.flowField`, `world.spatialHash`, `world.dustClouds`, and a dozen more world-level arrays — but intentionally skips some. Several event buffers (`healerPulses`, `healEvents`, `rattlesnakeBites`, `vultureDiveImpacts`) are cleared in `resetWorld` but not in `clearEnemiesCore`, potentially leaving stale VFX data between stages.

**Fix**: Centralize "clear combat state" in `world.ts` with a `keepLoot` parameter, or extract the list of per-encounter event buffers into a named constant shared by both functions.

---

### 19. Underscore-prefixed parameter that is actually used

**File**: `packages/shared/src/sim/content/nodeEffects.ts:429-438`

```typescript
(_oldHP: number, newHP: number) => {
  const damageTaken = _oldHP - newHP  // reads the "unused" _oldHP
```

**Fix**: Remove the underscore prefix — `oldHP`.

---

### 20. Flow field heap buffers are module-level mutable state

**File**: `packages/shared/src/sim/systems/flowField.ts:29-34`

`heapIndices`, `heapPriorities`, `heapSize` are module-level mutable state shared across all worlds. Safe only because JS is single-threaded, but `heapSize` is not reset on error — if `flowFieldSystem` throws mid-computation, the next world's tick runs with a corrupted heap.

**Fix**: Add `try/finally { heapSize = 0 }` around heap operations.

---

### 21. Mode controllers are 1400-1800 line god classes

**Files**: `packages/client/src/scenes/core/SingleplayerModeController.ts` (1397 lines), `MultiplayerModeController.ts` (1790 lines)

Both own 15+ renderer instances, particle/FX pools, audio, camera, hit-stop, time-scale, debug rendering, event processing, HUD projection. Constructors span 130-185 lines.

**Fix**: Extract `RendererBundle` (construction + update + destroy lifecycle), `BossCameraDirector` (zoom/letterbox state), and `PlayerFeedbackEmitter` (cylinder/recoil/melee events).

---

### 22. `getHUDState()` allocates on every poll, defeating `memo()`

**Files**: `packages/client/src/scenes/core/SingleplayerModeController.ts:376-556`, `MultiplayerModeController.ts`

Called at 10Hz from the game loop. Runs ECS queries (`bossQuery`), allocates new arrays (`Array.from(state.items.entries()).map(...)`), and returns a fresh object graph every time. `GameHUD` is wrapped in `memo()` but shallow-compares always-new objects, so the memo never skips.

**Fix**: Cache items array (invalidate on change via dirty flag). Store last-known boss EIDs to avoid re-querying. Pre-compute merged minimap marker styles as constants.

---

### 23. `GameRoom.ts` is 2092 lines

**File**: `packages/server/src/rooms/GameRoom.ts`

Mixes tick loop, 20+ message handlers, snapshot encoding, telemetry accumulation, interactables payload building, and lag compensation orchestration.

**Fix**: Extract `GameRoomTelemetry` (26 telemetry fields + logging), `InteractablesManager` (payload building + sending), and consider a message handler registration file.

---

### 24. Duplicated interactables payload building

**File**: `packages/server/src/rooms/GameRoom.ts:1959-2073`

`sendInteractablesUpdates()` and `sendInteractablesToClient()` build identical `InteractablesData` payloads using the same logic.

**Fix**: Extract `buildInteractablesPayload()` and call it from both.

---

### 25. `MutableShotResultState` monkey-patches server fields onto `GameWorld`

**File**: `packages/server/src/rooms/GameRoom.ts:954-967`

`ensureShotResultState()` adds `pendingShotResults` and `hitscanVirtualBulletOwners` to `GameWorld` at runtime via a cast, defeating TypeScript's type safety for the world object.

**Fix**: Either declare these as optional fields in `GameWorld` in shared (with comments explaining they're server-populated), or introduce a `ServerWorld` wrapper type that composes `GameWorld` with the extra state.

---

### 26. `RewindHistory` uses `Array.shift()` instead of a ring buffer

**File**: `packages/server/src/net/RewindHistory.ts:59-61`

JSDoc says "ring buffer" but uses `Array.shift()` (O(n) per eviction, running 60 times/second). Current buffer size (19) makes this trivially cheap, but the data structure is misnamed and will not scale.

**Fix**: Use a fixed-size array with head/tail indices.

---

### 27. Graceful shutdown has no re-entrancy guard

**File**: `packages/server/src/index.ts:29-31`

If the process receives a second SIGTERM during the shutdown countdown, `shutdown()` registers another `setTimeout`, and `gracefullyShutdown` is called twice.

**Fix**:
```typescript
let shuttingDown = false
const shutdown = async (signal: string) => {
  if (shuttingDown) return
  shuttingDown = true
  // ...
}
```

---

## Low

### 28. Over-exported balance constants in `enemies.ts`

**File**: `packages/shared/src/sim/content/enemies.ts`

200+ individual constants (`SWARMER_SPEED`, `GRUNT_RADIUS`, etc.) are exported and re-exported through barrel files as public API, but most are only used inside the same file as arguments to `registerEnemy()`. Downstream code could depend on internal balance numbers, making tuning into API breaks.

**Fix**: Remove `export` from constants only used within the file.

---

### 29. `registerBoss` silently overwrites duplicates

**File**: `packages/shared/src/sim/content/bosses/registry.ts:36`

`registerBoss` uses `registry.set()` without checking for existing entries. `registerEnemy` throws on duplicates. Inconsistent behavior.

**Fix**: Add the same duplicate guard as `registerEnemy`.

---

### 30. Boss radii hardcoded in `prefabs.ts` to avoid circular dependency

**File**: `packages/shared/src/sim/prefabs.ts:68-82`

```typescript
const BOOMSTICK_RADIUS = 18  // duplicated from boomstick.ts
const MAD_DOG_RADIUS = 20    // duplicated from madDog.ts
```

If boss radii are updated in their own files, `prefabs.ts` silently uses stale values.

**Fix**: Register bosses in the enemy registry or expose a `getBossMaxRadius()` from the boss registry.

---

### 31. Synthetic sprite registry ID offsets are fragile

**File**: `packages/client/src/render/EnemyRenderer.ts:53-55`

`ENEMY_BAR_BG_ID_OFFSET = 20000` and `ENEMY_BAR_FILL_ID_OFFSET = 30000` are numeric offsets creating pseudo-IDs for health-bar graphics. Implicit constraint: never more than 10,000 enemies alive simultaneously. No enforcement at `SpriteRegistry` level.

**Fix**: Give `SpriteRegistry` a named secondary container for health-bar graphics.

---

### 32. `STATE_LABELS` array must match `AIState` enum with no check

**File**: `packages/client/src/scenes/core/SingleplayerModeController.ts:154`

```typescript
const STATE_LABELS = ['IDL', 'CHS', 'TEL', 'ATK', 'REC', 'STN', 'FLE']
```

If a new AI state is inserted in the middle of the enum, this array silently produces wrong labels.

**Fix**: Build the label array from the enum, or assert `STATE_LABELS.length === Object.keys(AIState).length / 2`.

---

### 33. Missing network cleanup in useEffect for multiplayer connection

**File**: `packages/client/src/pages/MultiplayerGame.tsx:119-264`

The effect creates a new `NetworkClient` on `phase === 'connecting'` but the cleanup function does not call `net.disconnect()`. In React StrictMode, double-mount creates two simultaneous connection attempts.

**Fix**: Add `net.disconnect()` to the cleanup closure.

---

### 34. Room codes use `Math.random()` instead of CSPRNG

**File**: `packages/server/src/rooms/GameRoom.ts:320`

Room codes influence matchmaking and are user-facing. `crypto.getRandomValues` or `crypto.randomUUID()` would be more appropriate for production.

---

### 35. `process.env.NODE_ENV` in shared package

**File**: `packages/shared/src/sim/content/maps/mapGenerator.ts:838`

Platform-specific API in the deterministic sim. Works via Vite's build-time replacement but will be `undefined` in contexts that don't transform it.

**Fix**: Use `typeof process !== 'undefined'` guard, or accept a `debug` flag in `generateMap` options.

---

## Refactor Priority Order

If addressing these incrementally, the recommended order is:

1. **Fix the 3 criticals** (debug endpoint, snapshot buffer, virtual bullet ID) — these are correctness/security bugs that can cause real harm.
2. **Extract damage pipeline** (#6) — the hitscan/projectile duplication is a live divergence risk for competitive fairness.
3. **Shared `RendererBundle`** — fixes the multiplayer missing renderers (#5) and starts breaking up the god-class controllers (#21).
4. **Sub-object `GameWorld`** (#4) — root cause of `resetWorld` sync issues; makes every new feature safer.
5. **Remove DOM lib from shared tsconfig** (#12) — one-line change that prevents an entire category of future bugs.
6. **Server hardening** (#8, #9, #27) — name sanitization, phase guards, shutdown guard. Small, targeted fixes.
7. **Break up `GameRoom.ts`** (#23, #24) — extract telemetry and interactables. Reduces the 2092-line file.
8. **Make registration explicit** (#15, #16) — convert side-effect imports to explicit bootstrap calls for test isolation.
