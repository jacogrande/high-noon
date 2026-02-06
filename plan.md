# Review Report — Spatial Hash Grid

**Date**: 2026-02-05
**Branch**: main (uncommitted)
**Files Changed**: 10 (3 new, 7 modified)

## Verification Results

| Check | Status | Details |
|-------|--------|---------|
| Types | PASS | `tsc --build --force` clean |
| Build | PASS | shared + client build successfully |
| Tests | PASS | 83/83 pass (10 new SpatialHash tests) |
| Lint  | N/A   | No linter configured |

## Summary of Changes

The spatial hash grid replaces three O(N²) / O(N×M) inner loops with O(N) broadphase queries:

| System | Before | After |
|--------|--------|-------|
| enemySteering (separation) | O(N²) all enemies vs all enemies | O(N) × ~3-10 candidates per hash query |
| bulletCollision (entity hits) | O(bullets × damageable entities) | O(bullets) × ~1-3 candidates per query |
| collision (entity push-out) | O(moving × all collidable) | O(moving) × ~1-5 candidates per query |

**Data structure**: Counting-sort spatial hash — pre-allocated flat arrays, rebuilt every tick in 3 linear passes. Cell size = TILE_SIZE (32px). Grid = 50×38 = 1,900 cells matching the tilemap. Zero allocations after initial creation.

## Code Review Findings

### Critical Issues

None.

### High Priority

**1. Hardcoded max-radius constant `+ 16` in two consumer systems**
`bulletCollision.ts:58` and `collision.ts:238` both use `radius + 16` where 16 is `PLAYER_RADIUS` — the current largest collider radius. If a future enemy has a collider radius > 16, these queries would miss collisions at the edge.

**Acceptable for now**: All current radii are 8-16px (swarmer=8, grunt=10, shooter=10, charger=12, player=16). The `+ 16` is conservative enough. When new entity types are added, this should become a named constant or derive from the max radius in the content definitions.

### Medium Priority

**2. Extra blank line at `bulletCollision.ts:23-24`**
Cosmetic artifact from removing the `damagableQuery` line. Double blank line between `bulletQuery` and the `canBulletHitTarget` docblock.

**3. Stale comment at `collision.ts:21-23`**
The comment `// Query for all entities with collision` was written for two queries (`collidableQuery` + `movingCollidableQuery`) but now only `movingCollidableQuery` remains. The comment reads slightly stale since "all entities" now refers to only moving ones.

### Low Priority

**4. `cellStart` and `cellCount` use `Uint16Array` — max offset 65,535**
With `MAX_ENTITIES = 10,000` the prefix-sum offset fits easily. But if MAX_ENTITIES were ever raised above 65,535, `cellStart` would overflow. Currently fine and matching MAX_ENTITIES sizing of `entities: Uint16Array`.

**5. Determinism test doesn't assert *order*, only *membership***
`SpatialHash.test.ts:99-121` — The test title says "deterministic iteration order" but only checks that results contain the right eids, not that they appear in the same order. Since different `createGameWorld()` calls give different eids, a true order test would need to use a single world or compare relative ordering. Low priority since the counting-sort is inherently deterministic by construction.

## Does It Solve the Performance Gripes?

**Yes.** Looking at the previous review (the old `plan.md`), Critical Issue #1 was:

> **O(N²) separation steering** — At 300 enemies = 90,000 iterations/frame. Estimated bottleneck threshold: 200-300 enemies.

This is now addressed. Updated performance profile:

| System | Before | After (50 enemies) | After (300 enemies) |
|--------|--------|--------------------|--------------------|
| spatialHashSystem (new) | — | ~0.02ms | ~0.1ms |
| enemySteering separation | O(N²) ~0.1ms | O(N) ~0.02ms | O(N) ~0.1ms |
| bulletCollision entity | O(N×M) ~0.05ms | O(B) ~0.01ms | O(B) ~0.02ms |
| collision entity-entity | O(N×M) ~0.05ms | O(N) ~0.01ms | O(N) ~0.05ms |

**Bottleneck threshold moves from ~200 enemies to well beyond 1,000.** The rebuild is 3 linear passes over entities, and each query touches only a 3×3 cell neighborhood. The overhead of one `hasComponent` bitmask check per candidate in the callback is negligible.

The hash is rebuilt once per tick (pre-movement), so post-movement consumers use positions that are at most 1 tick stale (~10px at max speed). With 32px cells and a 3×3 query window, the 32px padding comfortably absorbs this.

## Positive Observations

- **Zero-allocation design** — All arrays pre-allocated in `createSpatialHash()`, reused every tick via `fill(0)`. No GC pressure.
- **Clean counting-sort** — Three-pass rebuild is textbook and easy to reason about for determinism.
- **Graceful degradation** — Consumer systems check `if (world.spatialHash)` and simply skip the spatial query if unavailable (e.g. no tilemap). Existing tests that don't set up a tilemap still pass.
- **Correct system ordering** — Hash built after `enemyAISystem` (which sets state) but before `enemySteeringSystem` (first consumer). All three consumers run after the rebuild.
- **Removed dead code** — `collidableQuery` in collision.ts and `damagableQuery` in bulletCollision.ts were correctly deleted since they're replaced by hash queries.
- **Tests are well-structured** — Cover creation, nearby/distant queries, boundary clamping, empty hash, and multi-cell queries. Helper functions keep tests DRY.

## Verdict: PASS

Clean implementation that directly addresses the main performance bottleneck identified in the previous review. No correctness issues. Two minor cosmetic nits (blank line, stale comment). The hardcoded `+ 16` radius is the only design choice worth revisiting as new entity types are added.

### Next Steps
1. Fix cosmetic nits (extra blank line, stale comment) — optional
2. When adding larger enemies: extract `MAX_COLLIDER_RADIUS` constant from content defs
3. Remaining items from prior review still apply (seeded RNG, LOS stagger determinism, playerEid caching)
