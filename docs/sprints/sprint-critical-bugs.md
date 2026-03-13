# Sprint: Critical Bugs (Phase 1)

## Goal

Fix three ship-blocking bugs: entity ID recycling safety, memory leaks from stale entity references, and config validation on world creation.

## Depends On

- Existing ECS world (`packages/shared/src/sim/world.ts`)
- Entity removal functions (`prefabs.ts`, `playerRegistry.ts`, `health.ts`, `stageProgression.ts`)
- bitECS v0.3.40 (automatic entity recycling at 1% threshold)

## Current State

- **Entity recycling**: bitECS auto-recycles entity IDs once ~1,000 entities have been removed (1% of 100k world size). However, 33 Maps/Sets on `GameWorld` store entity IDs as keys and are NOT cleaned up when entities are removed — causing silent data corruption when IDs are reused.
- **Memory leaks**: `playerKillCounts`, `playerStats` never cleaned on player removal or world reset. `lastPlayerDamageFraction` not cleaned on player removal. `consecratedAccum` in `LastRitesState` not cleared on zone expiry.
- **Config validation**: `createGameWorld()` accepts arbitrary input with no validation. No assertions on invariants after `resetWorld()`.

## Design Constraints

- ALL fixes in `packages/shared` (game logic only)
- Never use `Math.random()` in shared — use `world.rng`
- bitECS queries at module scope
- `NO_TARGET = 0xFFFF` sentinel convention
- Changes must not break the 1,444 existing tests
- Entity cleanup must be centralized — no more ad-hoc `map.delete()` scattered across systems

---

## Epic Overview

| # | Epic | Package | Priority | Size |
|---|------|---------|----------|------|
| 1 | Centralized entity cleanup hook | shared | P0 | M |
| 2 | Memory leak fixes | shared | P0 | S |
| 3 | Config validation | shared | P1 | S |
| 4 | Tests | shared | P0 | M |

---

## Epic 1: Centralized Entity Cleanup Hook

### Problem

Entity removal happens in 5+ places (`removeBullet`, `removePlayer`, `handleEnemyDeath`, `clearEnemiesCore`, objective removal, boss afterimage removal). Each has its own ad-hoc cleanup of Maps/Sets. When a new Map is added to `GameWorld`, developers must remember to add cleanup in every removal path — and they regularly forget (see: `playerKillCounts`, `playerStats`).

### Solution

Create a single `cleanupEntity(world, eid)` function that removes the entity's entry from ALL entity-keyed Maps/Sets. Call it from every removal path, right before `removeEntity(world, eid)`.

### Ticket 1.1: Create `cleanupEntity` function

**File:** `packages/shared/src/sim/entityCleanup.ts` (NEW)

```typescript
import type { GameWorld } from './world'

/**
 * Remove all entity-keyed state for `eid` from the world's Maps and Sets.
 * Call this BEFORE `removeEntity(world, eid)` in every removal path.
 *
 * When adding a new entity-keyed Map/Set to GameWorld, add cleanup here too.
 */
export function cleanupEntity(world: GameWorld, eid: number): void {
  // Bullet state
  world.bulletCollisionCallbacks.delete(eid)
  world.bulletPierceHits.delete(eid)
  world.hookPierceCount.delete(eid)

  // Lag compensation
  if (world.lagComp) {
    world.lagComp.shotTickByPlayer.delete(eid)
    world.lagComp.bulletShotTick.delete(eid)
    world.lagComp.bulletSpawnTick.delete(eid)
    world.lagComp.bulletSweepStart.delete(eid)
  }

  // Player state
  world.playerInputs.delete(eid)
  world.rollDodgedBullets.delete(eid)
  world.lastPlayerHitDir.delete(eid)
  world.lastPlayerDamageFraction.delete(eid)
  world.playerUpgradeStates.delete(eid)
  world.playerCharacters.delete(eid)
  world.lastRitesZones.delete(eid)
  world.playerKillCounts.delete(eid)
  world.playerStats.delete(eid)
  world.interactionHoldTicksByPlayer.delete(eid)
  world.interactionTargetByPlayer.delete(eid)
  world.interactionLastInputSeqByPlayer.delete(eid)
  world.interactionPromptByPlayer.delete(eid)
  world.interactionFeedbackByPlayer.delete(eid)

  // Entity state
  world.lastDamageByEntity.delete(eid)
  world.floorSpeedMul.delete(eid)
  world.bossState.delete(eid)
  world.hitscanVirtualBulletOwners.delete(eid)
  world.overkillProcessed.delete(eid)

  // Sets
  world.npcEntities.delete(eid)

  // Also clean this eid from inside bulletPierceHits values (eid may be a target)
  // Skip — O(n) scan per removal is too expensive for a per-bullet operation.
  // Pierce hits are keyed by bullet eid; target eids inside are transient per-frame.
}
```

### Ticket 1.2: Wire `cleanupEntity` into `removeBullet`

**File:** `packages/shared/src/sim/prefabs.ts`

Replace the ad-hoc cleanup in `removeBullet()` with a call to `cleanupEntity(world, eid)` followed by `removeEntity(world, eid)`. Remove the individual `world.bulletCollisionCallbacks.delete(eid)`, `world.bulletPierceHits.delete(eid)`, etc. lines.

### Ticket 1.3: Wire `cleanupEntity` into `removePlayer`

**File:** `packages/shared/src/sim/playerRegistry.ts`

Replace the ad-hoc cleanup in `removePlayer()` with `cleanupEntity(world, eid)` before `removeEntity(world, eid)`. Remove the individual `world.playerInputs.delete(eid)`, etc. lines. This automatically picks up the previously missing `playerKillCounts`, `playerStats`, and `lastPlayerDamageFraction` cleanup.

### Ticket 1.4: Wire `cleanupEntity` into enemy death handler

**File:** `packages/shared/src/sim/systems/health.ts`

In `handleEnemyDeath()` (or whatever the enemy death cleanup function is called), replace ad-hoc cleanup with `cleanupEntity(world, eid)` before `removeEntity(world, eid)`.

### Ticket 1.5: Wire `cleanupEntity` into stage cleanup

**File:** `packages/shared/src/sim/systems/stageProgression.ts`

In `clearEnemiesCore()`, call `cleanupEntity(world, eid)` before each `removeEntity(world, eid)` in the enemy/bullet/NPC removal loops. Remove duplicate ad-hoc Map/Set cleanup that follows.

### Ticket 1.6: Wire `cleanupEntity` into any remaining removal paths

Audit for any other `removeEntity()` calls (objective system, boss afterimages, etc.) and add `cleanupEntity()` before each.

### Ticket 1.7: Add barrel export

**File:** `packages/shared/src/sim/index.ts` (or appropriate barrel)

Export `cleanupEntity` so it's accessible from other packages if needed.

---

## Epic 2: Memory Leak Fixes

### Ticket 2.1: Fix `resetWorld` to clear `playerKillCounts` and `playerStats`

**File:** `packages/shared/src/sim/world.ts`

In `resetWorld()`, add:
```typescript
world.playerKillCounts.clear()
world.playerStats.clear()
```

These were the only two entity-keyed Maps missing from `resetWorld()`.

### Ticket 2.2: Clear `consecratedAccum` on Last Rites zone expiry

**File:** `packages/shared/src/sim/systems/lastRites.ts`

When a Last Rites zone expires (active becomes false), clear `zone.consecratedAccum` to release stale enemy entity references:
```typescript
zone.consecratedAccum.clear()
```

### Ticket 2.3: Audit `activeWaveThreatEids` cleanup

**File:** `packages/shared/src/sim/systems/waveSpawner.ts` (or encounter state)

Verify that `encounter.activeWaveThreatEids` is cleared when waves end or encounters reset. If it persists across waves with stale IDs, clear it on wave completion.

---

## Epic 3: Config Validation

### Ticket 3.1: Create `validateWorldConfig` function

**File:** `packages/shared/src/sim/worldValidation.ts` (NEW)

```typescript
import type { GameWorld } from './world'

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Validate world state after creation or reset.
 * Call in dev/debug builds to catch misconfigurations early.
 */
export function validateWorld(world: GameWorld): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Seed
  if (!Number.isFinite(world.initialSeed)) {
    errors.push(`initialSeed must be finite, got ${world.initialSeed}`)
  }

  // Player count
  if (world.activePlayerCount < 1 || world.activePlayerCount > 8) {
    errors.push(`activePlayerCount must be 1-8, got ${world.activePlayerCount}`)
  }

  // Max projectiles
  if (world.maxProjectiles <= 0) {
    errors.push(`maxProjectiles must be > 0, got ${world.maxProjectiles}`)
  }

  // Character ID
  const validCharacters = ['sheriff', 'undertaker', 'prospector']
  if (!validCharacters.includes(world.characterId)) {
    warnings.push(`Unknown characterId '${world.characterId}'`)
  }

  // Friendly fire mode
  const validFFModes = ['none', 'reduced', 'full']
  if (!validFFModes.includes(world.friendlyFireMode)) {
    errors.push(`Invalid friendlyFireMode '${world.friendlyFireMode}'`)
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}
```

### Ticket 3.2: Call validation in `createGameWorld` (dev mode)

**File:** `packages/shared/src/sim/world.ts`

At the end of `createGameWorld()`, call `validateWorld()` and log warnings. In dev builds, throw on errors:

```typescript
if (__DEV__) {
  const result = validateWorld(world)
  for (const w of result.warnings) console.warn(`[World] ${w}`)
  if (!result.valid) {
    throw new Error(`World validation failed: ${result.errors.join(', ')}`)
  }
}
```

Note: `__DEV__` may not be available in the shared package. If not, use a simple `typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'` check, or just always run validation (it's cheap).

### Ticket 3.3: Add post-reset validation

**File:** `packages/shared/src/sim/world.ts`

At the end of `resetWorld()`, assert key invariants:
- `world.tick === 0`
- `world.time === 0`
- RNG state matches initial seed
- Character ID matches upgrade state

### Ticket 3.4: Add barrel export

Export `validateWorld` and `ValidationResult` from the shared package barrel.

---

## Epic 4: Tests

### Ticket 4.1: Test `cleanupEntity` removes all state

**File:** `packages/shared/src/sim/entityCleanup.test.ts` (NEW)

Test that `cleanupEntity` removes entries from every Map/Set on the world. Create a world, populate Maps with a test entity ID, call `cleanupEntity`, verify all Maps no longer contain the ID.

### Ticket 4.2: Test entity ID recycling safety

**File:** `packages/shared/src/sim/entityCleanup.test.ts`

Test the recycling scenario: create entity A, store data in Maps, remove entity A (with cleanup), create entity B (which may reuse A's ID), verify B doesn't inherit A's state.

### Ticket 4.3: Test memory leak fixes

**File:** `packages/shared/src/sim/entityCleanup.test.ts`

- Test that `removePlayer` cleans up `playerKillCounts` and `playerStats`
- Test that `resetWorld` clears `playerKillCounts` and `playerStats`

### Ticket 4.4: Test config validation

**File:** `packages/shared/src/sim/worldValidation.test.ts` (NEW)

- Test valid world passes validation
- Test invalid `activePlayerCount` produces error
- Test invalid `maxProjectiles` produces error
- Test unknown `characterId` produces warning
- Test invalid `friendlyFireMode` produces error

### Ticket 4.5: Test Last Rites cleanup

**File:** `packages/shared/src/sim/systems/lastRites.test.ts` (existing or new)

Test that `consecratedAccum` is cleared when the zone expires.

---

## Implementation Order

```
1.1 (cleanupEntity function)
  → 1.2 (wire into removeBullet)
  → 1.3 (wire into removePlayer)
  → 1.4 (wire into enemy death)
  → 1.5 (wire into stage cleanup)
  → 1.6 (wire into remaining paths)
  → 1.7 (barrel export)

2.1 (resetWorld fix) — independent
2.2 (lastRites fix) — independent
2.3 (activeWaveThreatEids audit) — independent

3.1 (validateWorld function) — independent
  → 3.2 (wire into createGameWorld)
  → 3.3 (wire into resetWorld)
  → 3.4 (barrel export)

4.1-4.5 (tests) — after epics 1-3
```

## Files Changed

### New Files
- `packages/shared/src/sim/entityCleanup.ts`
- `packages/shared/src/sim/entityCleanup.test.ts`
- `packages/shared/src/sim/worldValidation.ts`
- `packages/shared/src/sim/worldValidation.test.ts`

### Modified Files
- `packages/shared/src/sim/prefabs.ts` — wire cleanupEntity into removeBullet
- `packages/shared/src/sim/playerRegistry.ts` — wire cleanupEntity into removePlayer
- `packages/shared/src/sim/systems/health.ts` — wire cleanupEntity into enemy death
- `packages/shared/src/sim/systems/stageProgression.ts` — wire cleanupEntity into clearEnemiesCore
- `packages/shared/src/sim/systems/lastRites.ts` — clear consecratedAccum on zone expiry
- `packages/shared/src/sim/world.ts` — resetWorld fixes, validation calls
- `packages/shared/src/sim/index.ts` — barrel exports
- Any files with remaining `removeEntity()` calls (objective system, boss afterimages)

## Testing

### Unit Tests
- `entityCleanup.test.ts`: cleanup coverage, recycling safety, player removal
- `worldValidation.test.ts`: valid/invalid config, warnings vs errors

### Integration
- Existing 1,444 tests must pass
- `bun run typecheck` clean
- `bun run build` clean

### Manual Verification
- Play a long single-player run (1000+ enemy kills) — no corruption
- Multiplayer: player disconnect + reconnect — no stale stats
