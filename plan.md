# Review Report — Duel Ring Objective

**Date**: 2026-02-15
**Branch**: main (uncommitted changes)
**Scope**: Duel ring objective implementation across 15 files

## Summary of Changes

### Feature: Duel Ring Objective
A 1v1 Western standoff mechanic. A tough melee challenger (Duelist) spawns inside a ring around the player. Inside the ring, outside enemies can't damage the player and the player can't damage outside enemies. Stepping outside the ring forfeits the duel. Killing the challenger = objective success.

### Files Changed

**Shared — Data & Types**
- `components.ts` — `EnemyType.DUELIST = 8`
- `world.ts` — Extended `ObjectiveType` with `'duel'`, added 6 duel fields to `ObjectiveState`
- `content/enemies.ts` — 18 `DUELIST_*` constants, drop chance entry (0.30)
- `content/waves.ts` — Extended `ObjectiveConfig` with duel fields, wired `STAGE_1_DUEL` into Stage 1
- `content/objectives.ts` — `STAGE_1_DUEL` definition

**Shared — Systems**
- `prefabs.ts` — `spawnDuelist()` function, updated `MAX_COLLIDER_RADIUS`
- `objectiveSystem.ts` — `duelTick()`, duel init/cleanup branches
- `bulletCollision.ts` — Duel zone filtering (player ↔ duelist only)
- `enemyAttack.ts` — Melee/charger duel guards, `isMeleeEnemy()` + `getMeleeConfig()` refactor

**Shared — Network**
- `net/hud.ts` — `forfeitTimer?: number` on objective HUD data

**Client**
- `ui/GameHUD.tsx` — Duel HUD display (golden color, forfeit warning)
- `render/ObjectiveRenderer.ts` — Ring visualization (golden circle, red on forfeit)
- `render/EnemyRenderer.ts` — DUELIST color (0xddaa33)
- `scenes/core/SingleplayerModeController.ts` — Duel HUD state derivation
- `scenes/types.ts` — `forfeitTimer?: number` on client HUD type

**Server**
- `rooms/GameRoom.ts` — Duel objective in HUD broadcast

**Tests**
- `objectiveSystem.test.ts` — 9 new duel tests (30 total objective tests)

## Verification Results

| Check | Status | Details |
|-------|--------|---------|
| Tests | **PASS** | 772/772 tests, 13345 assertions, 0 failures |
| Types | **PASS** | `tsc --build --force` clean |
| Lint  | N/A | No lint script configured |

## Code Review Findings

### Critical Issues

None.

### High Priority

None.

### Medium Priority

1. **Dead ternary in `objectiveSystem.ts:156`**
   ```
   forfeitGrace: config.ringRadius !== undefined ? DUEL_FORFEIT_GRACE : DUEL_FORFEIT_GRACE,
   ```
   Both branches return the same value. Should just be `DUEL_FORFEIT_GRACE`. Looks like a copy-paste artifact — was there meant to be per-config grace period support?

2. **Duelist inflates wave spawner's threat count** (`waveSpawner.ts:193-199`)
   - The wave spawner counts ALL alive enemies by tier. Since the duelist is `EnemyTier.THREAT`, it inflates `enc.threatAliveCount` by 1.
   - This is **cosmetic only** — wave progression uses `activeWaveThreatEids` which doesn't include the duelist, so waves advance correctly.
   - Fix: filter out entities with no spawner tracking, or exclude objective-spawned entities from the count.

3. **Missing test: melee duel guard**
   - Tests cover bullet filtering (player→non-duelist blocked, non-duelist→player blocked, player→duelist allowed). But there's no test for melee enemy contact damage being blocked during duel.
   - The melee guard code at `enemyAttack.ts:210-212` is structurally identical to the charger guard and simple, so risk is low.

### Low Priority

4. **Intercept subtext says "% escaped" but shows progress fraction, not count**
   - `escapedCount / escapeThreshold` is correct but the label `"X% escaped"` is misleading for fractional values like "33% escaped" when 1 of 3 runners escaped. A count display like "1 / 3 escaped" would be clearer. (Not duel-specific, but noticed during review.)

5. **Duel ring visual is minimal**
   - The ring is a 2px-wide circle outline. In a busy combat scene this could be hard to see. Consider:
     - Thicker line width (3-4px)
     - Fill with very low alpha (0.05-0.08) to create a visible zone
     - Tick marks or dashes on the circumference

## Positive Observations

- **All game logic in `packages/shared`** — Correct architecture. Duel filtering, spawning, forfeit logic all deterministic.
- **Deterministic RNG** — `world.rng` used for duelist spawn angle. No `Math.random()`.
- **Clean filtering design** — Duel zone filtering in `bulletCollision.ts` checks component presence (`Enemy`, `Player`) rather than collision layers, which correctly excludes OBJECTIVE targets from interference.
- **Melee config refactor** — `isGoblinMelee()` → `isMeleeEnemy()` and extracted per-type config objects with `kbSpeed`/`kbDuration`. Cleaner than the previous hardcoded goblin constants.
- **Proper cleanup** — `cleanupObjective` has both duel-specific duelist removal AND generic `objectiveRoleQuery` sweep. Belt and suspenders.
- **No entity-0 bug** — Duelist spawns after player entity, so EID >= 1. The `duelistEid: 0` default in protect/intercept init blocks is safe because duel code always checks `obj.type === 'duel'` before reading it.
- **`exactOptionalPropertyTypes` handled correctly** — Conditional spread pattern `{ ...base, forfeitTimer: o.forfeitTimer }` avoids the `undefined` assignment issue.
- **Test coverage is strong** — 9 tests cover init, success, forfeit, timer reset, bullet filtering (3 scenarios), and cleanup. End-to-end bullet tests run actual systems.
- **Cross-objective safety** — Duel filtering only activates when `world.objective.type === 'duel'`, so protect/intercept objectives are completely unaffected.
- **Wave progression is correct** — Even though duelist inflates `threatAliveCount`, wave clear logic uses `activeWaveThreatEids` which is spawner-only. Waves advance normally.

## Verdict: **PASS**

The duel ring implementation is clean, well-tested, and follows existing patterns. The bullet/melee filtering is correctly scoped to avoid interfering with other objective types. All 772 tests pass and typecheck is clean.

### Next Steps
1. Fix the dead ternary on `forfeitGrace` (trivial)
2. Consider filtering duelist from wave threat count display
3. Add melee duel guard test for completeness
4. Manual playtesting: ring visibility, duelist feel, forfeit timing
5. Commit the duel ring changes
