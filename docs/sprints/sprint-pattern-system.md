# Sprint: Pattern System & Content Authoring

Phase 3 of the March roadmap. Build a composable, data-driven bullet pattern system that replaces hardcoded attack logic, then migrate all enemy and boss attacks to use it. Adds hitbox fairness validation, visual readability improvements, difficulty pacing tools, multiplayer combat scaling, and performance validation for high bullet counts.

See: [Bullet Hell Combat Research](../research/bullet-hell-combat.md), [ROADMAP_MARCH.md Phase 3](../../ROADMAP_MARCH.md)

---

## Goals

1. **Pattern Primitive Library** — Composable bullet pattern generators (aimed, ring, spread, spiral, scatter) that produce bullet spawn descriptors from tunable parameters
2. **Data-Driven Content** — Pattern definitions as data in `packages/shared/src/sim/content/`, not inline math in attack systems
3. **Enemy Pattern Migration** — All regular enemy projectile attacks use the pattern system instead of hardcoded angle calculations
4. **Boss Pattern Overhaul** — All 5 bosses use layered pattern compositions (base + pressure + tempo) with anti-safespot aimed layers
5. **Hitbox & Fairness** — Player collider audit, minimum gap width validation, dodgeability guarantees
6. **Visual Clarity** — Bullet z-ordering, non-linear trajectory trails, background contrast audit
7. **Difficulty Pacing** — Intensity curves within encounters, spatial vs. temporal density separation, difficulty axis tagging
8. **Multiplayer Scaling** — Per-player density scaling, boss threat distribution, arena sizing
9. **Performance Validation** — Stress-test at 2,000+ bullets, audit hot path allocations, spatial hash tuning

---

## Non-Goals

- New enemy types (Sprint 18 covered this)
- New bosses or miniboss system (separate sprint)
- Art/sprite rework (Phase 7 parallel track)
- Audio overhaul (separate sprint)
- Controller support or input abstraction (Phase 1)
- Netcode changes (pattern data flows through existing snapshot/event system)

---

## Current State

**Enemy attacks (12 types):** All projectile attacks hardcoded in `enemyAttack.ts` — each enemy fires bullets via inline `Math.atan2` + `spawnBullet` calls. No pattern abstraction; every enemy computes its own angles.

**Boss attacks (5 bosses):** Each boss module (e.g., `boomstick.ts`) contains inline attack logic — fan spreads, rings, dynamite throws. Boss patterns are functional but not composable or data-driven. Boomstick has fan + ring + boom; Mad Dog has sweep/slam/whirlwind/lunge; etc.

**Pattern types currently in use:**
- Aimed single shot (Swarmer, Grunt, Drifter, Ghost Rider, Deadeye)
- Aimed spread/fan (Shooter: 3-way, Spitter: 6-way, Boomstick: 5-7 way)
- Radial ring (Boomstick: 8-10 way)
- Rush/dive (Charger, Coyote, Vulture)
- Custom non-projectile (Lasso, Dynamite, Healer, Dustdevil)

**Missing pattern types:** Spiral, scatter, wall, expanding ring, alternating offset rings, multi-burst, homing

**No pattern composition:** Boss attacks are monolithic — no layering of base + pressure + tempo patterns. No anti-safespot detection.

---

## Phase 1: Pattern Primitive Library

**Goal:** Create composable pattern generator functions that produce arrays of bullet spawn descriptors from tunable parameters. All game logic in `packages/shared`.

### 1.1 Define `BulletSpawnDescriptor` Interface

Create `packages/shared/src/sim/content/patterns.ts`:

```ts
/** Output of a pattern generator — describes one bullet to spawn */
export interface BulletSpawnDescriptor {
  /** Angle in radians (float, not integer degrees) */
  angle: number
  /** Speed in px/s */
  speed: number
  /** Acceleration px/s² (0 = constant speed) */
  accel: number
  /** Drag coefficient (0 = no drag) */
  drag: number
  /** Damage per hit */
  damage: number
  /** Delay before spawning in seconds (0 = immediate, enables staggered bursts) */
  delay: number
}

/** A pattern generator takes an origin, target info, and config, returns spawn descriptors */
export type PatternGenerator = (ctx: PatternContext) => BulletSpawnDescriptor[]

export interface PatternContext {
  /** Origin position */
  originX: number
  originY: number
  /** Target position (for aimed patterns) */
  targetX: number
  targetY: number
  /** Angle from origin to target (pre-computed) */
  baseAngle: number
  /** World RNG for deterministic randomness */
  rng: { nextRange(min: number, max: number): number; nextInt(max: number): number }
  /** Current attack cycle count (for rotating seed angles) */
  cycle: number
}
```

### 1.2 Implement Pattern Primitives

Each primitive is a factory function that returns a `PatternGenerator`:

```ts
/** Single or multi-shot aimed at target */
export function aimed(config: {
  count: number           // bullets per volley
  spread: number          // total spread angle in radians (0 = single shot)
  speed: number
  accel?: number
  drag?: number
  damage: number
  leadFactor?: number     // 0 = direct aim, 1 = full velocity lead
  jitter?: number         // random angle offset range in radians
}): PatternGenerator

/** N bullets equally spaced around a circle */
export function ring(config: {
  count: number           // bullets in ring
  speed: number
  accel?: number
  drag?: number
  damage: number
  seedAngle?: number      // fixed seed angle (if undefined, uses baseAngle)
  randomSeed?: boolean    // if true, randomize seed angle each fire
  offset?: number         // per-cycle rotation in radians (enables spirals via repeated rings)
}): PatternGenerator

/** Linear wall of bullets perpendicular to aim direction */
export function wall(config: {
  count: number
  spacing: number         // distance between bullets in px (at spawn radius)
  speed: number
  accel?: number
  drag?: number
  damage: number
  perpendicular?: boolean // true = wall perpendicular to aim, false = along aim
}): PatternGenerator

/** Spiral: ring with rotating seed angle over time */
export function spiral(config: {
  count: number           // bullets per emission
  speed: number
  accel?: number
  drag?: number
  damage: number
  rotationRate: number    // radians per emission cycle
  arms: number            // number of spiral arms (1-4 typical)
}): PatternGenerator

/** Controlled random scatter within a cone */
export function scatter(config: {
  count: number
  coneAngle: number       // total cone width in radians
  speedMin: number
  speedMax: number
  accel?: number
  drag?: number
  damage: number
  minSeparation: number   // minimum angle between any two bullets (prevents clusters)
}): PatternGenerator
```

### 1.3 Pattern Composition Functions

```ts
/** Fire multiple patterns simultaneously */
export function layered(...patterns: PatternGenerator[]): PatternGenerator

/** Fire patterns in sequence with delays between them */
export function sequence(
  patterns: { pattern: PatternGenerator; delayAfter: number }[]
): PatternGenerator

/** Repeat a pattern N times with delay between emissions */
export function burst(
  pattern: PatternGenerator,
  count: number,
  interval: number,     // seconds between emissions
): PatternGenerator
```

### 1.4 Gap Width Validation

```ts
/**
 * Validates that a pattern's generated bullets never create gaps
 * narrower than minGapWidth (2x player collider radius).
 * Used in content definition tests, not at runtime.
 */
export function validateMinGap(
  pattern: PatternGenerator,
  playerColliderRadius: number,
  sampleCount?: number,  // number of random contexts to test (default 100)
): { valid: boolean; narrowestGap: number; context?: PatternContext }
```

### 1.5 Tests

- Unit test: each primitive generates correct number of descriptors with expected angle distribution
- Unit test: `aimed` with spread=0 produces single bullet at baseAngle
- Unit test: `ring(count: 8)` produces 8 bullets spaced 45° apart
- Unit test: `spiral` rotates seed angle by `rotationRate` per cycle increment
- Unit test: `scatter` respects `minSeparation` constraint (no two bullets within minSep angle)
- Unit test: `layered` merges descriptors from all sub-patterns
- Unit test: `burst` adds incremental delays to each emission
- Unit test: `validateMinGap` catches a ring with too many bullets (gaps < threshold)
- Unit test: all angles are floating-point (verify no integer-degree quantization)

**Acceptance:** `bun run typecheck` clean, all pattern primitive tests pass.

---

## Phase 2: Pattern Registry & Content Definitions

**Goal:** Create a registry of named pattern definitions that enemies and bosses reference by ID. Extend `EnemyDefinition` to reference patterns.

### 2.1 Pattern Definition Interface

Add to `packages/shared/src/sim/content/patterns.ts`:

```ts
export interface PatternDefinition {
  /** Unique pattern ID for registry lookup */
  id: string
  /** Human-readable name */
  name: string
  /** Difficulty axis tags for encounter design */
  axes: DifficultyAxis[]
  /** The pattern generator */
  generator: PatternGenerator
  /** Bullet visual config */
  bulletSpriteId: BulletSpriteIdValue
  /** Bullet collision size multiplier */
  bulletSize: number
}

export type DifficultyAxis = 'precision' | 'reading' | 'multitasking' | 'planning'
```

### 2.2 Pattern Registry

```ts
const patternRegistry = new Map<string, PatternDefinition>()

export function registerPattern(def: PatternDefinition): void
export function getPattern(id: string): PatternDefinition | undefined
export function allPatterns(): Iterable<PatternDefinition>
```

### 2.3 Register Base Patterns

Create `packages/shared/src/sim/content/patternDefs.ts` — named pattern definitions for all existing enemy attack types:

| Pattern ID | Primitive | Config | Used By |
|------------|-----------|--------|---------|
| `swarmer_shot` | `aimed` | count:1, speed:240, accel:120, drag:0.30 | Swarmer |
| `grunt_shot` | `aimed` | count:1, speed:320, accel:220, drag:0.14 | Grunt |
| `drifter_shot` | `aimed` | count:1, speed:190 | Drifter |
| `deadeye_snipe` | `aimed` | count:1, speed:650, no accel/drag | Deadeye |
| `ghost_rider_shot` | `aimed` | count:1, speed:500 | Ghost Rider |
| `shooter_fan` | `aimed` | count:3, spread:0.35, speed:460, drag:0.06 | Shooter |
| `spitter_spray` | `aimed` | count:6, spread:1.8, speed:130, drag:0.3 | Spitter |

### 2.4 Extend EnemyDefinition

Add optional `patternId` field to `EnemyDefinition` in `enemyRegistry.ts`:

```ts
export interface EnemyDefinition {
  // ... existing fields ...

  /** Pattern ID for projectile attacks (replaces inline projectile config) */
  readonly patternId?: string
}
```

Enemies with `patternId` set use the pattern system. Enemies without it continue using the existing inline attack logic (backward compatible migration).

### 2.5 Tests

- Unit test: pattern registry stores and retrieves definitions correctly
- Unit test: all registered patterns produce valid BulletSpawnDescriptors
- Unit test: pattern definitions match current enemy attack parameters (no balance change)

**Acceptance:** `bun run typecheck` clean, registry tests pass.

---

## Phase 3: Enemy Pattern Migration

**Goal:** Migrate all regular enemy projectile attacks from hardcoded `enemyAttack.ts` logic to use the pattern system. Zero gameplay change — output must be identical.

### 3.1 Pattern Execution System

Create `packages/shared/src/sim/systems/patternExecutor.ts`:

```ts
/**
 * Takes a PatternDefinition + PatternContext, generates BulletSpawnDescriptors,
 * and calls spawnBullet for each. Handles delayed bullets via world queue.
 */
export function executePattern(
  world: GameWorld,
  eid: number,             // attacking entity
  patternDef: PatternDefinition,
  ctx: PatternContext,
): number                  // returns number of bullets spawned
```

### 3.2 Integrate with enemyAttack.ts

In the projectile fallback branch of `enemyAttackSystem`:

```ts
// Before (current):
const baseAngle = Math.atan2(targetY - ey, targetX - ex)
const count = AttackConfig.projectileCount[eid]!
// ... inline bullet spawning loop ...

// After:
if (def?.patternId) {
  const patternDef = getPattern(def.patternId)!
  const ctx: PatternContext = { originX: ex, originY: ey, targetX, targetY, ... }
  activeBulletCount += executePattern(world, eid, patternDef, ctx)
  transition(eid, AIState.RECOVERY)
} else {
  // Legacy fallback — existing inline code (for enemies not yet migrated)
}
```

### 3.3 Delayed Bullet Queue

For `burst` and `sequence` patterns that emit bullets over time:

- Add `world.pendingBullets: { tick: number; desc: BulletSpawnDescriptor; eid: number; patternDef: PatternDefinition }[]`
- Process pending bullets at the start of each `enemyAttackSystem` tick
- Delayed bullets are deterministic (use tick count, not wall clock)

### 3.4 Migrate Enemy Definitions

Update each enemy's `registerEnemy` call in `enemies.ts` to include `patternId`:

- Swarmer → `patternId: 'swarmer_shot'`
- Grunt → `patternId: 'grunt_shot'`
- Shooter → `patternId: 'shooter_fan'`
- Drifter → `patternId: 'drifter_shot'`
- Deadeye → `patternId: 'deadeye_snipe'`
- Spitter → `patternId: 'spitter_spray'`
- Ghost Rider → `patternId: 'ghost_rider_shot'`

Custom attack enemies (Lasso, Dynamite, Healer, Vulture, Dustdevil, Rattlesnake) keep `attackStyle: 'custom'` — they don't use the projectile pattern system.

### 3.5 Tests

- Integration test: Swarmer fires identical bullets through pattern system as through old code
- Integration test: Shooter 3-way spread matches old behavior exactly
- Integration test: Spitter 6-way spray matches old behavior
- Integration test: fodder projectile cap still enforced
- Integration test: Deadeye aim-lock + fire still works through pattern system
- Regression test: full wave playthrough produces same entity count and positions (snapshot comparison)

**Acceptance:** `bun run typecheck` clean, `bun test` all green, zero gameplay change for migrated enemies.

---

## Phase 4: Boss Pattern Overhaul

**Goal:** Convert all 5 boss attack handlers to use composable pattern definitions with layered patterns. Each boss phase introduces genuinely new patterns, not just faster versions. Add anti-safespot aimed layers.

### 4.1 Boss Pattern Definitions

Create `packages/shared/src/sim/content/bossPatterns.ts` — named patterns for each boss phase:

**Boomstick (Stage 1):**

| Phase | Attack | Pattern Composition |
|-------|--------|-------------------|
| P1 | Fan | `aimed({ count: 5, spread: 1.0, speed: 520, accel: 140, drag: 0.10 })` |
| P1 | Ring | `ring({ count: 8, speed: ~400, randomSeed: true })` |
| P2 | Fan+Aimed | `layered(aimed({ count: 6, spread: 1.0 }), aimed({ count: 1, speed: 600 }))` |
| P2 | Ring+Boom | `ring({ count: 8 })` + dynamite (kept as custom handler) |
| P3 | Fan+Ring | `layered(aimed({ count: 7, spread: 1.0 }), ring({ count: 10, offset: π/10 }))` |

**Mad Dog (Stage 2):**

| Phase | Attack | Pattern Composition |
|-------|--------|-------------------|
| P1 | Sweep | `wall({ count: 5, speed: 350 })` — existing sweep adapted to wall primitive |
| P1 | Slam | Keep as AoE (non-pattern) |
| P2 | Whirlwind | `spiral({ count: 3, speed: 300, rotationRate: 0.15, arms: 3 })` |
| P2 | Lunge | Keep as rush (non-pattern) |
| P3 | Ground Pound | `ring({ count: 12, speed: 250 })` + AoE shockwave |
| P3 | Fury | `burst(aimed({ count: 2, spread: 0.3 }), 3, 0.15)` |

**Coyote Jane, Daltons, Hollow Man, Old Scratch:** Similar conversion — extract hardcoded attacks into pattern definitions, add layered patterns in later phases.

### 4.2 Anti-Safespot System

Add to boss `tick()` methods:

```ts
/** Detect if player is camping (stayed within radius for duration) */
interface SafespotDetector {
  lastPlayerX: number
  lastPlayerY: number
  stationaryTime: number
}
```

- Track player position each tick
- If player stays within 30px radius for >2.5s, add an aimed layer to the next attack
- The aimed layer targets the player directly, breaking any safe spot
- Reset timer when player moves significantly

### 4.3 Phase Transition Bullet Cancel

On boss phase transition:
- Remove all enemy bullets currently in-flight (iterate `bulletQuery`, remove entities with `CollisionLayer.ENEMY_BULLET`)
- Emit `world.bulletCancelEvent` for client-side VFX (bullets dissolve/sparkle)
- Brief 0.5s breathing room before new phase attacks begin

### 4.4 Boss Vulnerability Windows

Add `BossState.vulnerable` flag per boss:
- During RECOVERY state after certain attacks, boss takes 1.5x damage
- Visual indicator: boss glows/flashes during vulnerable window
- Telegraphed: predictable after specific attacks (e.g., after Boomstick's ring volley)
- Rewards aggressive play — DPS-check incentive during the window

### 4.5 Soft Enrage Timer

Add to boss `tick()`:

```ts
// Track fight duration
bossState.fightDuration += dt
const enrageProgress = Math.min(bossState.fightDuration / ENRAGE_TARGET, 1.0)

// Gradually scale pattern parameters
const densityMultiplier = 1.0 + enrageProgress * 0.5   // up to 1.5x density
const speedMultiplier = 1.0 + enrageProgress * 0.3     // up to 1.3x speed
```

- Enrage target: 5 minutes for stage 1-2 bosses, 8 minutes for stage 3-4 bosses
- Gradual ramp — not a sudden wall
- At 100% enrage: patterns noticeably denser/faster but still dodgeable

### 4.6 Tests

- Unit test: each boss phase fires the correct pattern definition
- Unit test: anti-safespot adds aimed layer after 2.5s of camping
- Unit test: phase transition removes all enemy bullets
- Unit test: vulnerability window applies 1.5x damage during RECOVERY
- Unit test: soft enrage scales density/speed linearly with fight duration
- Integration test: Boomstick full fight (P1→P2→P3→death) with pattern system matches expected damage/bullet counts

**Acceptance:** `bun run typecheck` clean, boss tests pass, all 5 bosses playable with new pattern system.

---

## Phase 5: Hitbox & Fairness Tuning

**Goal:** Audit and tune collision radii for fairness. Ensure every pattern is dodgeable.

### 5.1 Player Collider Audit

- Read current player collider radius from `PLAYER_RADIUS` in `content/player.ts`
- Compare to player sprite dimensions
- Target: collider = 30-50% of sprite radius
- If ratio is outside target, adjust `PLAYER_RADIUS` and re-test all encounters

### 5.2 Dodgeability Validation

For every registered pattern:
- Compute minimum gap width at a reference distance (150px from origin)
- Assert gap >= 2 × `PLAYER_RADIUS`
- If any pattern fails, adjust its `count` or `spread` to open gaps
- Add this as a test that runs in CI

### 5.3 Roll & Threading Solutions

Audit each boss attack pattern:
- Verify at least one "roll solution" (single dodge roll provides safety)
- Verify at least one "threading solution" (movement-only escape without rolling)
- Document both solutions in pattern definition comments

### 5.4 Tests

- Unit test: `validateMinGap` passes for all registered patterns
- Unit test: player collider ratio is within 30-50% of sprite radius
- Manual test checklist: each boss attack dodgeable with single roll

**Acceptance:** All patterns pass gap validation, player collider ratio documented and within target.

---

## Phase 6: Readability & Visual Clarity

**Goal:** Improve bullet visual clarity so players always know what killed them.

### 6.1 Bullet Z-Ordering

In `packages/client/src/render/BulletRenderer.ts`:
- Enemy bullets rendered in a layer above all other game objects (entities, effects, terrain)
- Within bullet layer: smaller/faster bullets drawn over bigger/slower bullets
- Player bullets rendered below enemy bullets

### 6.2 Non-Linear Trajectory Trails

- Add trail rendering for any bullet with `accel !== 0` or `drag !== 0`
- Trail: 3-4 fading afterimage sprites behind the bullet, updated each render frame
- Trail color matches bullet tint but at reduced alpha (0.3 → 0.1 fade)

### 6.3 Background Contrast Audit

- Review all tilemap backgrounds: ensure mid-tone values (40-60% brightness)
- Enemy bullets should use high-saturation warm colors (red, orange, yellow)
- Player bullets use cool tones (white, light blue)
- Flag any background tile that exceeds 70% brightness or uses saturated warm colors

### 6.4 Bullet Grouping

- Audit all pattern definitions: eliminate any that produce single stray bullets
- Every emission should produce a recognizable formation (line, arc, ring, fan)
- If a pattern produces 1 bullet, it must be visually distinct (large, bright, trailed)

### 6.5 Tests

- Visual regression: screenshot test of bullet z-ordering (enemy bullets always on top)
- Unit test: trail system activates for bullets with non-zero accel or drag
- Manual test checklist: play through each stage, verify no background competes with bullets

**Acceptance:** Enemy bullets render on top, trails on accelerating bullets, no single-stray-bullet emissions.

---

## Phase 7: Difficulty Pacing & Encounter Design

**Goal:** Add tools for intensity curves within encounters and difficulty axis tagging.

### 7.1 Intensity Curve in Encounters

Extend `WaveDefinition` in `packages/shared/src/sim/content/waves.ts`:

```ts
export interface WaveDefinition {
  // ... existing fields ...

  /** Intensity hint: 'low' | 'medium' | 'high' | 'peak' */
  intensity?: 'low' | 'medium' | 'high' | 'peak'

  /** Valley duration in seconds after this wave (breathing room, default 1.5s) */
  valleyDuration?: number
}
```

Wave spawner respects `valleyDuration` — inserts a gap between waves where no new enemies spawn. Default sequence: moderate → high → valley → peak.

### 7.2 Spatial vs. Temporal Density Separation

Add to encounter tuning:

```ts
export interface DensityConfig {
  /** Bullets per area (controls pattern count/spread per enemy) */
  spatialDensity: number   // 1.0 = baseline
  /** Spawn rate multiplier (controls how fast enemies attack) */
  temporalDensity: number  // 1.0 = baseline
}
```

These scale independently per wave, giving encounter designers two orthogonal knobs.

### 7.3 Difficulty Axis Tagging

Each `PatternDefinition` already has `axes: DifficultyAxis[]` from Phase 2. Add a helper:

```ts
/** Returns the dominant difficulty axes for an encounter's waves */
export function analyzeEncounterDifficulty(encounter: StageEncounter): {
  axisDistribution: Record<DifficultyAxis, number>
  warnings: string[]  // e.g., "all waves test same axis — add variety"
}
```

Use this in tests to flag monotonous encounters.

### 7.4 New Pattern Introduction Rule

Add validation: when a pattern ID first appears in a stage's waves, it must appear at `intensity: 'low'` or `intensity: 'medium'` before appearing at `intensity: 'high'` or `intensity: 'peak'`.

### 7.5 Tests

- Unit test: `valleyDuration` creates spawn gap between waves
- Unit test: `analyzeEncounterDifficulty` detects monotonous axis distribution
- Unit test: new pattern introduction validation catches violations

**Acceptance:** Encounter definitions have intensity hints and valley durations, difficulty analysis helper functional.

---

## Phase 8: Game Feel Integration

**Goal:** Scale hit stop and camera effects proportionally to combat intensity.

### 8.1 Hit Stop Duration by Intensity

Update `HitStop` event processing:

| Event | Duration (frames @ 60Hz) |
|-------|------------------------|
| Standard enemy kill | 2-3 |
| Elite/threat kill | 3-5 |
| Boss phase transition | 6-10 |
| Player takes damage | 2-3 |
| Boss kill | 10-15 |

Currently hit stop is a single duration — make it configurable per event type.

### 8.2 Camera Trauma Proportional to Damage

In the bullet collision system, when a player takes damage:

```ts
const traumaFromDamage = Math.min(damage / playerMaxHp * 0.8, 0.5)
world.cameraTrauma = Math.min(world.cameraTrauma + traumaFromDamage, 1.0)
```

Scale trauma to damage dealt as a fraction of max HP. Cap at 0.5 from a single hit.

### 8.3 Rapid-Fire Hit Stop Stacking

For weapons that fire rapidly (e.g., multi-hit in one frame):
- Stack multiple light hit stops (2 frames each) rather than one long freeze
- Cap total stacked freeze at 6 frames to prevent "slideshow" feel

### 8.4 Tests

- Unit test: hit stop duration varies by event type
- Unit test: camera trauma scales with damage dealt
- Unit test: rapid-fire hit stops cap at 6 frames total

**Acceptance:** Hit stop and camera trauma scale appropriately across all combat events.

---

## Phase 9: Multiplayer Combat Scaling

**Goal:** Scale bullet patterns for co-op without visual noise overload.

### 9.1 Per-Player Density Scaling

Add to `coopScaling.ts`:

```ts
/** Bullet density multiplier per player count */
export function getPatternDensityScale(playerCount: number): number {
  // 1 player = 1.0x, 2 players = 1.25x, 3 = 1.4x, 4 = 1.5x
  // Sub-linear scaling — increase enemy count instead of per-enemy density
  return 1.0 + Math.log2(playerCount) * 0.5
}
```

Pattern executor multiplies bullet count by density scale (rounded to nearest int).

### 9.2 Boss Threat Distribution

For boss aimed patterns in multiplayer:
- Distribute aimed attacks across players via round-robin targeting
- Each player gets targeted by 1/N of the aimed components
- Keep radial patterns (rings, spirals) identical — they threaten everyone equally
- Result: individual threat level stays constant, total density scales moderately

### 9.3 Arena Sizing for Player Count

Extend camera bounds calculation:

```ts
export function getScaledArenaBounds(baseBounds: Bounds, playerCount: number): Bounds {
  const scale = 1.0 + (playerCount - 1) * 0.15  // 15% per additional player
  // ... expand bounds by scale factor around center ...
}
```

4-player sessions get ~45% larger viewable area to maintain dodge space per player.

### 9.4 Tests

- Unit test: density scale returns correct values for 1-4 players
- Unit test: boss aimed attacks distribute across N targets
- Unit test: arena bounds expand with player count
- Integration test: 2-player wave spawns correct adjusted bullet count

**Acceptance:** Multiplayer bullet density scales sub-linearly, boss attacks distribute across players.

---

## Phase 10: Performance Validation

**Goal:** Verify the pattern system performs at scale. No regressions from the new abstraction layer.

### 10.1 Hot Path Allocation Audit

- Profile `executePattern` for per-call allocations — should produce zero garbage after warmup
- Pre-allocate `BulletSpawnDescriptor[]` arrays in a pool
- Verify `spawnBullet` entity creation uses ECS pool (no `new` calls)
- Check pattern generators create no closures or temporary objects per call

### 10.2 Stress Test: 2,000+ Bullets

- Create a test harness that spawns 2,000 simultaneous bullets via pattern system
- Measure: ECS tick time, bullet system update time, collision system time
- Target: < 4ms total for bullet update + collision at 2,000 bullets (leaves 12.7ms for everything else at 60Hz)
- Run in both Node (shared sim) and browser (full render pipeline)

### 10.3 Spatial Hash Tuning

- Verify spatial hash cell size >= largest bullet collider radius in use
- With new pattern-spawned bullets (potentially different sizes), re-validate cell size
- Benchmark collision checks at 1,000 and 2,000 bullets — ensure O(n) scaling, not O(n²)

### 10.4 Browser GC Profiling

- Run a 5-minute intense combat session in Chrome DevTools
- Track GC pauses — target zero major GC pauses during combat
- If GC pauses detected: identify allocation source and pool it

### 10.5 Tests

- Benchmark test: 2,000 bullet update + collision completes in < 4ms
- Unit test: `executePattern` produces zero allocations after warmup (use allocation tracking)
- Benchmark test: spatial hash scales linearly with bullet count

**Acceptance:** 2,000+ bullets at 60fps, zero GC pauses during combat, pattern system adds < 0.5ms overhead vs. old inline code.

---

## Implementation Order

| # | Phase | Estimate | Depends On | Parallelizable |
|---|-------|----------|------------|----------------|
| 1 | Pattern Primitive Library | Large | — | No (foundation) |
| 2 | Pattern Registry & Content Defs | Medium | Phase 1 | No |
| 3 | Enemy Pattern Migration | Medium | Phase 2 | Yes (with 4) |
| 4 | Boss Pattern Overhaul | Large | Phase 1 | Yes (with 3) |
| 5 | Hitbox & Fairness Tuning | Small | Phase 2 | Yes (with 3, 4, 6, 8) |
| 6 | Readability & Visual Clarity | Medium | — | Yes (with 3, 4, 5, 8) |
| 7 | Difficulty Pacing & Encounters | Medium | Phases 3, 4 | No |
| 8 | Game Feel Integration | Small | — | Yes (with 3, 4, 5, 6) |
| 9 | Multiplayer Combat Scaling | Medium | Phase 2 | Yes (with 3, 4) |
| 10 | Performance Validation | Medium | All | No (final gate) |

**Critical path:** Phase 1 → Phase 2 → Phase 3/4 (parallel) → Phase 7 → Phase 10

Phases 5, 6, 8 are independent and can run any time after Phase 1/2. Phase 9 can start after Phase 2.

---

## Files Created

| File | Package | Purpose |
|------|---------|---------|
| `content/patterns.ts` | shared | Pattern primitives, types, composition, validation |
| `content/patternDefs.ts` | shared | Named pattern definitions for all enemies |
| `content/bossPatterns.ts` | shared | Named pattern definitions for all boss phases |
| `systems/patternExecutor.ts` | shared | Executes patterns → spawnBullet calls |

## Files Modified

| File | Package | Changes |
|------|---------|---------|
| `content/enemyRegistry.ts` | shared | Add `patternId` field to `EnemyDefinition` |
| `content/enemies.ts` | shared | Add `patternId` to each enemy registration |
| `systems/enemyAttack.ts` | shared | Pattern system integration, delayed bullet queue |
| `content/bosses/boomstick.ts` | shared | Convert to pattern definitions |
| `content/bosses/madDog.ts` | shared | Convert to pattern definitions |
| `content/bosses/coyoteJane.ts` | shared | Convert to pattern definitions |
| `content/bosses/daltonBoys.ts` | shared | Convert to pattern definitions |
| `content/bosses/hollowMan.ts` | shared | Convert to pattern definitions |
| `content/bosses/oldScratch.ts` | shared | Convert to pattern definitions |
| `content/bosses/registry.ts` | shared | Add vulnerability/enrage state to BossModule |
| `content/waves.ts` | shared | Add intensity, valleyDuration, density config |
| `content/player.ts` | shared | Potentially adjust PLAYER_RADIUS |
| `systems/bulletCollision.ts` | shared | Camera trauma scaling on player damage |
| `systems/waveSpawner.ts` | shared | Valley duration between waves |
| `render/BulletRenderer.ts` | client | Z-ordering, trail rendering |
| `engine/GameApp.ts` | client | Layer ordering for bullet z-index |
| `net/coopScaling.ts` | shared | Density scaling, arena sizing |
| `world.ts` | shared | Add pendingBullets queue, bulletCancelEvent |

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Pattern abstraction adds overhead vs. inline math | Benchmark in Phase 10; pre-allocate descriptor arrays; pattern generators are pure functions with no allocation |
| Boss pattern conversion changes feel/balance | Compare old vs. new bullet counts, angles, and speeds in tests; tune constants to match pre-migration behavior before adding new patterns |
| Gap validation false positives at extreme ranges | Validate at reference distance (150px); document that very close or very far ranges may have different gap characteristics |
| Delayed bullet queue creates desync in multiplayer | Queue is tick-indexed (deterministic), processed in shared sim; same code runs on client and server |
| Anti-safespot detection triggers during normal play | Generous threshold (30px radius, 2.5s duration); only bosses use it; easy to tune per boss |
| Multiplayer density scaling makes patterns too easy/hard | Sub-linear scale (log2) is conservative; test with 2 and 4 players; per-boss override if needed |
| Phase transition bullet cancel disrupts game state | Only removes ENEMY_BULLET layer entities; player bullets unaffected; emit event for client VFX |

---

## Summary

This sprint transforms High Noon's combat from hardcoded bullet spawning to a composable, data-driven pattern system. The key insight from the bullet hell research is that **patterns are composed from primitives** — aimed, ring, spread, spiral, scatter — and the art is in how those primitives layer together.

| Phase | Delivers |
|-------|---------|
| **Pattern Primitives** | 5 composable generators + layered/burst/sequence composition |
| **Content Authoring** | Named pattern registry with difficulty axis tags |
| **Enemy Migration** | 7 enemy types use pattern system (zero behavior change) |
| **Boss Overhaul** | 5 bosses with layered patterns, anti-safespot, vulnerability windows, soft enrage |
| **Hitbox Fairness** | Player collider audit, minimum gap validation in CI |
| **Visual Clarity** | Bullet z-ordering, trajectory trails, background contrast |
| **Difficulty Pacing** | Intensity curves, valley durations, axis analysis |
| **Game Feel** | Scaled hit stop/trauma by event type |
| **Multiplayer Scaling** | Sub-linear density, boss threat distribution, arena sizing |
| **Performance** | 2,000+ bullets at 60fps validated |

After this sprint, adding a new attack pattern is a single `registerPattern()` call with tunable parameters — no attack system code changes required.
