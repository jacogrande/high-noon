# Sprint 18: Enemies

Expand the enemy roster from 6 spawnable combat archetypes to 12 with six new Western-themed enemies. Each enemy has a unique sprite sheet, distinct AI behavior, and works identically in single-player and multiplayer via the shared deterministic simulation.

---

## Goals

1. **Content Registry Pattern** — Refactor enemy definitions into a centralized registry so adding new types is one-file-one-entry instead of updating 8+ scattered lookup tables
2. **6 New Enemy Types** — Lasso Bandit, Dynamite Tosser, Armored Bandit, Healer Shaman, Rattlesnake, Vulture
3. **Custom Sprite Sheets** — One 32×32-cell sprite sheet per new enemy following the existing `ENEMY_SPRITE_INFO` layout (idle/walk/death/attack × 3 directions)
4. **Custom AI Behaviors** — New mechanics: rooting CC, area denial, directional armor, healing aura, poison DOT, flying/dive-bombing
5. **Wave Integration** — Wire new enemies into stage encounters with appropriate fodder/threat balance
6. **Multiplayer Parity** — All game logic in `packages/shared`, all rendering in `packages/client`

---

## Non-Goals

- Boss rework or new bosses (separate sprint)
- Miniboss system (separate sprint)
- Content registry for bosses (bosses already have their own registry)
- Co-op scaling (separate sprint — Tier 0)
- New ECS components beyond what's needed for these 6 enemies

---

## Current State

**Existing combat enemy types (6):** Swarmer, Grunt, Shooter, Charger, Goblin Barbarian, Goblin Rogue
**Special-purpose types (3):** Runner (objective), Duelist (duel ring), Coyote (boss summon)
**Boss types (5):** Boomstick, Mad Dog, Coyote Jane, Dalton, Hollow Man

**Pain point:** Adding a new enemy currently requires updating:
- `EnemyType` enum in `components.ts`
- `enemies.ts` content constants (10-20 lines)
- `prefabs.ts` spawn function (~30 lines)
- `waveSpawner.ts` SPAWN_FN + BUDGET_COST tables
- `enemyAttack.ts` attack dispatch logic
- `EnemyRenderer.ts` ENEMY_COLORS + ENEMY_SPRITE_ID + ENEMY_SPRITE_SCALE tables
- `AssetLoader.ts` ENEMY_SPRITES manifest
- `ENEMY_DROP_CHANCE` table in `enemies.ts`

This sprint front-loads a registry refactor to make each subsequent enemy a single file.

---

## Phase 1: Enemy Registry Pattern

**Goal:** Centralize all per-enemy-type data into a single registry so new types are self-contained.

### 1.1 Define `EnemyDefinition` Interface

Create `packages/shared/src/sim/content/enemyRegistry.ts`:

```ts
export interface EnemyDefinition {
  // Identity
  type: number              // EnemyType enum value
  name: string              // Display name
  tier: number              // EnemyTier.FODDER or THREAT

  // Stats
  speed: number
  radius: number
  hp: number
  budgetCost: number
  dropChance: number

  // Detection
  aggroRange: number
  attackRange: number
  losRequired: boolean

  // Attack
  telegraphDuration: number
  recoveryDuration: number
  cooldown: number
  damage: number

  // Attack behavior (discriminated union)
  attackStyle: 'projectile' | 'melee' | 'rush' | 'custom'

  // Projectile config (when attackStyle = 'projectile')
  projectileSpeed?: number
  projectileAccel?: number
  projectileDrag?: number
  projectileCount?: number
  spreadAngle?: number

  // Melee config (when attackStyle = 'melee')
  meleeReach?: number
  attackDuration?: number
  knockbackSpeed?: number
  knockbackDuration?: number

  // Rush config (when attackStyle = 'rush')
  rushSpeed?: number
  rushDuration?: number

  // Steering
  preferredRange: number
  separationRadius: number

  // Spawn timing
  initialDelayMin: number
  initialDelayMax: number

  // Rendering (client reads from shared registry)
  color: number
  spriteId: string
  spriteScale: number
}
```

### 1.2 Migrate Existing Types

Convert each existing enemy's scattered constants into an `EnemyDefinition` entry. The registry is a `Map<number, EnemyDefinition>` indexed by `EnemyType`.

**Files touched:**
- New: `packages/shared/src/sim/content/enemyRegistry.ts`
- Refactor: `packages/shared/src/sim/prefabs.ts` — generic `spawnEnemy(world, type, x, y)` that reads from registry
- Refactor: `packages/shared/src/sim/systems/waveSpawner.ts` — use registry for SPAWN_FN + BUDGET_COST
- Refactor: `packages/shared/src/sim/systems/enemyAttack.ts` — dispatch by `attackStyle` instead of hardcoded type checks
- Refactor: `packages/client/src/render/EnemyRenderer.ts` — read color/spriteId/scale from registry
- Refactor: `packages/client/src/assets/AssetLoader.ts` — build ENEMY_SPRITES from registry
- Keep: individual `spawn*` functions as thin wrappers calling `spawnFromRegistry(world, EnemyType.SWARMER, x, y)` for backward compat
- Keep: `enemies.ts` as the file that defines and registers the 6 base enemy definitions

### 1.3 Validation

Add runtime validation on `createGameWorld()` that checks:
- Every `EnemyType` value has a registry entry
- No duplicate type IDs
- Stats are sane (HP > 0, speed >= 0, radius > 0, etc.)

### 1.4 Tests

- Unit test: registry lookup returns correct definition for all existing types
- Unit test: `spawnFromRegistry` sets all ECS components correctly (compare to old spawn functions)
- Unit test: validation catches invalid definitions (negative HP, missing fields)

**Acceptance:** `bun run typecheck` clean, `bun test` passes, all existing enemy behavior unchanged.

---

## Phase 2: New Enemy — Lasso Bandit (Threat)

**Fantasy:** A bandit who throws a lasso that roots the player, forcing defensive roll timing.

### Design

| Stat | Value |
|------|-------|
| HP | 25 |
| Speed | 75 px/s |
| Tier | THREAT |
| Budget Cost | 3 |
| Aggro Range | 350 |
| Attack Range | 200 |
| Telegraph | 0.5s |
| Recovery | 0.7s |
| Cooldown | 3.5s |
| Damage | 3 |
| Root Duration | 1.5s |
| Color | 0xcc8844 (rope brown) |
| Sprite Scale | 2.0 |

### Behavior

- **Attack style: `custom`** — `lassoAttack` handler
- On ATTACK: spawns a slow lasso projectile (200px/s, large hitbox radius 8) aimed at player's predicted position
- **Lasso projectile** uses existing bullet system but with a new `BulletEffect.ROOT` flag
- On hit: applies `Root` component to player (new component — prevents movement input for `rootDuration` seconds, player can roll to break free early)
- Lasso bandit maintains preferred range of 180px — orbits at mid-distance, retreats if player gets close

### New ECS Components

```ts
// Add to components.ts
export const Root = {
  duration: new Float32Array(MAX_ENTITIES),   // remaining root time
  elapsed: new Float32Array(MAX_ENTITIES),    // time spent rooted
}
```

### New System: `rootSystem`

- Ticks `Root.duration` down each frame
- While rooted: zero player velocity (but allow aim + shoot)
- If player activates roll while rooted: break free immediately (remove Root component), consume roll charge
- Remove component when duration expires

### Sprite Sheet

Create `packages/client/public/assets/sprites/enemies/lasso_bandit.png`:
- 32×32 cell grid following `ENEMY_SPRITE_INFO` layout
- Visual: dusty brown duster, wide-brim hat, coiled lasso in hand
- Attack animation: overhead lasso swing and throw

### Files

- `packages/shared/src/sim/content/enemies/lassoBandit.ts` — definition + registration
- `packages/shared/src/sim/components.ts` — add `Root` component
- `packages/shared/src/sim/systems/rootSystem.ts` — root tick + roll-to-break
- `packages/shared/src/sim/systems/enemyAttack.ts` — add `lassoAttack` handler
- `packages/shared/src/sim/systems/movementSystem.ts` — check Root before applying velocity
- `packages/client/public/assets/sprites/enemies/lasso_bandit.png` — sprite sheet

---

## Phase 3: New Enemy — Dynamite Tosser (Fodder)

**Fantasy:** Area denial enemy that lobs dynamite with a visible fuse arc and blast radius.

### Design

| Stat | Value |
|------|-------|
| HP | 16 |
| Speed | 65 px/s |
| Tier | FODDER |
| Budget Cost | 2 |
| Aggro Range | 350 |
| Attack Range | 250 |
| Telegraph | 0.6s |
| Recovery | 0.5s |
| Cooldown | 3.0s |
| Blast Damage | 6 |
| Blast Radius | 48px |
| Fuse Time | 1.0s |
| Color | 0xdd4400 (explosive orange) |
| Sprite Scale | 2.0 |

### Behavior

- **Attack style: `custom`** — `dynamiteTossAttack` handler
- On ATTACK: spawns a `Dynamite` entity at a predicted landing position (leading the player by ~0.3s)
- Dynamite entity is visible (red circle with shrinking fuse indicator), ticks down for `fuseTime`
- On detonation: deals blast damage to all entities within `blastRadius` (players AND enemies — environmental hazard)
- Dynamite Tosser maintains preferred range of 200px — stays at medium distance
- Multiple dynamite sticks can be active simultaneously (capped at 3 per tosser to prevent spam)

### New ECS Components

```ts
export const Dynamite = {
  fuseRemaining: new Float32Array(MAX_ENTITIES),
  blastRadius: new Float32Array(MAX_ENTITIES),
  damage: new Uint8Array(MAX_ENTITIES),
  ownerEid: new Uint16Array(MAX_ENTITIES),
}
```

### New System: `dynamiteSystem`

- Ticks `Dynamite.fuseRemaining` down each frame
- When fuse reaches 0: query all entities with `Health` + `Position` within `blastRadius`, apply damage, spawn visual explosion effect event, remove dynamite entity
- Damage hits both players and enemies (friendly fire on enemies — creates interesting dynamics)

### Rendering

- Dynamite entity rendered as a small dark cylinder with a blinking red dot (fuse)
- Blast radius shown as a faint red circle that pulses faster as fuse burns down
- Explosion: brief orange-white flash expanding to blast radius then fading

### Sprite Sheet

Create `packages/client/public/assets/sprites/enemies/dynamite_tosser.png`:
- Visual: rugged miner/outlaw with bandolier of dynamite sticks, lit match
- Attack animation: overhead throw motion

### Files

- `packages/shared/src/sim/content/enemies/dynamiteTosser.ts` — definition
- `packages/shared/src/sim/components.ts` — add `Dynamite` component
- `packages/shared/src/sim/systems/dynamiteSystem.ts` — fuse tick + detonation
- `packages/shared/src/sim/systems/enemyAttack.ts` — add toss handler
- `packages/client/src/render/DynamiteRenderer.ts` — fuse visual + blast preview + explosion
- `packages/client/public/assets/sprites/enemies/dynamite_tosser.png` — sprite sheet

---

## Phase 4: New Enemy — Armored Bandit (Threat)

**Fantasy:** Directional armor forces the player to flank or use piercing — teaches positioning.

### Design

| Stat | Value |
|------|-------|
| HP | 40 |
| Speed | 55 px/s |
| Tier | THREAT |
| Budget Cost | 3 |
| Aggro Range | 300 |
| Attack Range | 180 |
| Telegraph | 0.4s |
| Recovery | 0.6s |
| Cooldown | 2.5s |
| Damage | 5 |
| Bullet Speed | 380 px/s |
| Front Armor | 0.25 (75% damage reduction from front) |
| Color | 0x888899 (steel grey) |
| Sprite Scale | 2.5 |

### Behavior

- **Attack style: `projectile`** — standard 1-bullet aimed at player (uses existing projectile system)
- **Key mechanic: directional armor** — bullets hitting from within a 90° frontal cone deal only 25% damage. Bullets from the sides or rear deal full damage.
- Facing direction = direction toward current target (always faces player during CHASE)
- During TELEGRAPH: facing locks to aim direction (can't be cheesed by circling during wind-up)
- Slower than most enemies — player can outmaneuver

### New ECS Component

```ts
export const FrontArmor = {
  /** Damage multiplier for frontal hits (0.0 = immune, 1.0 = no armor) */
  frontMultiplier: new Float32Array(MAX_ENTITIES),
  /** Half-angle of armor cone in radians (PI/4 = 90° cone) */
  coneHalfAngle: new Float32Array(MAX_ENTITIES),
  /** Current facing angle in radians */
  facingAngle: new Float32Array(MAX_ENTITIES),
}
```

### Integration with Damage System

- In `bulletCollisionSystem` (or `applyDamage`): check if target has `FrontArmor` component
- Calculate angle between bullet travel direction and entity's `facingAngle`
- If angle delta < `coneHalfAngle`: multiply damage by `frontMultiplier`
- Visual feedback: armored hit shows a spark/deflect effect instead of blood

### Rendering

- Shield/armor plate visible on sprite's front side
- Frontal hits: spark particle instead of normal damage flash
- Faint directional indicator showing armor cone (subtle, only during telegraph)

### Sprite Sheet

Create `packages/client/public/assets/sprites/enemies/armored_bandit.png`:
- Visual: heavy-set outlaw with a makeshift metal breastplate, tin pot helmet
- Larger sprite (2.5x scale) to convey bulk
- Attack animation: draws pistol from behind shield

### Files

- `packages/shared/src/sim/content/enemies/armoredBandit.ts` — definition
- `packages/shared/src/sim/components.ts` — add `FrontArmor` component
- `packages/shared/src/sim/systems/bulletCollision.ts` — armor damage reduction check
- `packages/shared/src/sim/systems/enemySteering.ts` — update `facingAngle` toward target
- `packages/client/src/render/EnemyRenderer.ts` — armor hit spark effect
- `packages/client/public/assets/sprites/enemies/armored_bandit.png` — sprite sheet

---

## Phase 5: New Enemy — Healer Shaman (Threat)

**Fantasy:** Support enemy that heals nearby allies, creating "kill the healer first" priority decisions.

### Design

| Stat | Value |
|------|-------|
| HP | 22 |
| Speed | 50 px/s |
| Tier | THREAT |
| Budget Cost | 3 |
| Aggro Range | 400 |
| Attack Range | — (doesn't attack player directly) |
| Heal Pulse Interval | 2.0s |
| Heal Amount | 4 HP per pulse |
| Heal Radius | 80px |
| Color | 0x44ddaa (jade green) |
| Sprite Scale | 2.0 |

### Behavior

- **Attack style: `custom`** — `healPulseAttack` handler
- Does NOT attack the player directly — instead pulses a heal to all nearby enemies
- AI state machine adaptation:
  - CHASE: moves toward the largest cluster of allies (not the player)
  - TELEGRAPH: raises staff, green glow builds
  - ATTACK: heal pulse — all enemies within `healRadius` gain HP (capped at max)
  - RECOVERY: brief cooldown before next heal cycle
- **Flee behavior:** If player gets within 60px, switches to flee state (moves directly away from player at 1.5× speed for 1s)
- Fragile (22 HP) — rewarding to focus fire

### New Steering Behavior

- `seekAllies` steering: instead of seeking player, the shaman seeks the centroid of nearby ally enemies
- Falls back to seeking player position if no allies within 200px (so it doesn't wander off)

### Rendering

- Heal pulse: expanding green ring centered on shaman, fades from 0.5→0 alpha
- Healed enemies: brief green flash (tint 0x44ff88 for 0.1s)
- Staff glow during telegraph

### Sprite Sheet

Create `packages/client/public/assets/sprites/enemies/healer_shaman.png`:
- Visual: cloaked figure with a staff topped with a glowing crystal, feathered headdress
- Attack animation: raises staff overhead, green energy radiates outward

### Files

- `packages/shared/src/sim/content/enemies/healerShaman.ts` — definition
- `packages/shared/src/sim/systems/enemyAttack.ts` — add `healPulseAttack` handler
- `packages/shared/src/sim/systems/enemySteering.ts` — add ally-seek mode for healers + flee behavior
- `packages/client/src/render/EnemyRenderer.ts` — heal pulse ring + healed flash
- `packages/client/public/assets/sprites/enemies/healer_shaman.png` — sprite sheet

---

## Phase 6: New Enemy — Rattlesnake (Fodder)

**Fantasy:** Small, fast, and poisonous — a ground predator that darts in to bite and applies poison DOT.

### Design

| Stat | Value |
|------|-------|
| HP | 8 |
| Speed | 130 px/s |
| Tier | FODDER |
| Budget Cost | 1 |
| Aggro Range | 200 |
| Attack Range | 25 |
| Telegraph | 0.15s |
| Recovery | 0.4s |
| Cooldown | 2.0s |
| Bite Damage | 1 |
| Poison DPS | 2 HP/s |
| Poison Duration | 3.0s |
| Color | 0x889944 (desert olive) |
| Sprite Scale | 1.5 |

### Behavior

- **Attack style: `melee`** with poison effect
- Extremely fast (130px/s), extremely fragile (8 HP) — glass cannon fodder
- Darts toward player, bites at close range, applies poison DOT
- Poison does NOT stack from the same snake — but multiple snakes can each apply their own poison (up to 3 stacks max across all sources)
- Short aggro range (200px) — won't detect from far away, but relentless once aggro'd
- Very short telegraph (0.15s) — hard to react to, but low direct damage

### New ECS Component

```ts
export const Poison = {
  /** Total remaining damage from all poison stacks */
  totalRemaining: new Float32Array(MAX_ENTITIES),
  /** Damage per second across all stacks */
  dps: new Float32Array(MAX_ENTITIES),
  /** Number of active poison stacks */
  stacks: new Uint8Array(MAX_ENTITIES),
}
```

### New System: `poisonSystem`

- Ticks poison damage per second: `applyDamage(world, eid, { amount: Poison.dps[eid] * dt, ... })`
- Decrements `totalRemaining` by damage dealt per tick
- When `totalRemaining` ≤ 0: remove poison component
- Poison bypasses i-frames (continuous tick damage, not burst) — but deals tiny amounts per tick so it doesn't feel unfair
- Antidote: HP potion clears all poison stacks (ties into existing potion system)

### Rendering

- Poisoned player: green-tinted screen edge vignette, small poison icon on HUD
- Snake bite: brief green flash on hit instead of normal red
- Snake movement: slithering animation (lateral movement frames)

### Sprite Sheet

Create `packages/client/public/assets/sprites/enemies/rattlesnake.png`:
- Visual: coiled rattlesnake, low profile, distinct rattle tail
- Small sprite (1.5x scale) matching its low radius
- Attack animation: striking lunge forward

### Files

- `packages/shared/src/sim/content/enemies/rattlesnake.ts` — definition
- `packages/shared/src/sim/components.ts` — add `Poison` component
- `packages/shared/src/sim/systems/poisonSystem.ts` — DOT tick + stack management
- `packages/shared/src/sim/systems/enemyAttack.ts` — snake bite applies poison
- `packages/client/src/render/EnemyRenderer.ts` — poison hit flash
- `packages/client/src/render/PoisonOverlay.ts` — screen vignette effect
- `packages/client/public/assets/sprites/enemies/rattlesnake.png` — sprite sheet

---

## Phase 7: New Enemy — Vulture (Threat)

**Fantasy:** Flying enemy that ignores terrain, circles overhead, and dive-bombs the player.

### Design

| Stat | Value |
|------|-------|
| HP | 15 |
| Speed | 90 px/s (circling), 250 px/s (dive) |
| Tier | THREAT |
| Budget Cost | 3 |
| Aggro Range | 500 |
| Attack Range | 300 |
| Telegraph | 0.6s |
| Recovery | 1.0s |
| Cooldown | 4.0s |
| Dive Damage | 8 |
| Color | 0x554433 (dark brown) |
| Sprite Scale | 2.0 |

### Behavior

- **Attack style: `custom`** — `diveAttack` handler
- **Key mechanic: ignores terrain collision** — flies over walls and obstacles
- CHASE: orbits the player at `preferredRange` (250px) — doesn't path via flow field, uses direct steering
- TELEGRAPH: stops circling, hovers in place, shadow shrinks (telegraphs incoming dive)
- ATTACK: dive-bombs in straight line toward player's position at telegraph-end — contact damage on arrival, brief AoE shockwave (32px radius)
- RECOVERY: lands briefly after dive (vulnerable window), then takes off again
- Cannot be hit by bullets during high-altitude circling — only during telegraph, dive, and recovery (grounded phases)

### New ECS Components

```ts
export const Flying = {
  /** 0 = grounded (hittable), 1 = airborne (unhittable by bullets) */
  airborne: new Uint8Array(MAX_ENTITIES),
}
```

### Integration

- `bulletCollisionSystem`: skip collision check if target has `Flying.airborne[eid] === 1`
- `enemySteering`: flying enemies ignore flow field, use direct-to-target vector
- `wallCollision`: skip for entities with `Flying` component
- State transitions set `airborne`: CHASE=1, TELEGRAPH=0 (hovering low), ATTACK=0 (diving), RECOVERY=0 (landed)

### Rendering

- Airborne vulture: rendered with a shadow sprite offset below (shadow grows as vulture "descends" during telegraph)
- Circling animation: gentle banking sprite, wing flap cycle
- Dive: steep angle sprite, motion blur trail
- Grounded: folded wings, larger target

### Sprite Sheet

Create `packages/client/public/assets/sprites/enemies/vulture.png`:
- Visual: large desert vulture with spread wings
- Attack animation: wings tucked in dive position
- Need both "flying" and "grounded" visual states in the animation frames

### Files

- `packages/shared/src/sim/content/enemies/vulture.ts` — definition
- `packages/shared/src/sim/components.ts` — add `Flying` component
- `packages/shared/src/sim/systems/bulletCollision.ts` — skip airborne entities
- `packages/shared/src/sim/systems/enemySteering.ts` — direct steering for flyers
- `packages/shared/src/sim/systems/wallCollision.ts` — skip flying entities
- `packages/shared/src/sim/systems/enemyAttack.ts` — `diveAttack` handler
- `packages/client/src/render/EnemyRenderer.ts` — shadow rendering + dive trail
- `packages/client/public/assets/sprites/enemies/vulture.png` — sprite sheet

---

## Phase 8: Wave Integration

### 8.1 Update Encounter Definitions

Add new enemies to `packages/shared/src/sim/content/waves.ts`:

**Stage 1 (Introduction):**
- Wave 2+: Rattlesnakes join fodder pool (weight 2, alongside swarmers weight 5)
- Wave 3+: Dynamite Tosser joins fodder pool (weight 1)

**Stage 2 (Escalation):**
- Wave 1+: Lasso Bandits appear as threats (1-2 per wave)
- Wave 2+: Armored Bandits appear as threats (1 per wave)
- Healer Shamans appear starting wave 2 (1 per wave, always paired with 2+ fodder)

**Stage 3 (Peak):**
- Vultures appear as threats (1-2 per wave)
- All new enemy types in rotation
- Healer + Armored Bandit combo (the "tank and healer" pair)

### 8.2 Balance Testing Checklist

For each new enemy type, verify:
- [ ] Spawns correctly via wave spawner
- [ ] AI state machine cycles correctly (IDLE → CHASE → TELEGRAPH → ATTACK → RECOVERY)
- [ ] Takes damage and dies
- [ ] Death drops items at correct rate
- [ ] Does not stack on top of other enemies (separation steering)
- [ ] Telegraph is visually readable
- [ ] Attack is avoidable with player skill
- [ ] Does not desync in multiplayer (deterministic)

### 8.3 Snapshot Protocol

New enemies use existing `EnemyType` IDs which are already encoded in snapshots as Uint8. No protocol changes needed — the client just needs to know how to render new type IDs, which the registry handles.

---

## Phase 9: Sprite Sheet Creation

### Sprite Sheet Format

Each enemy sprite sheet is a PNG following the `ENEMY_SPRITE_INFO` layout:

```
Row layout (32×32 cells):
Rows 0-2:   idle (2 frames × 3 directions: S, E, N)
Rows 3-5:   walk (4 frames × 3 directions: S, E, N)
Rows 6-8:   [reserved/unused]
Rows 9-11:  death (3 frames × 3 directions: S, E, N)
Rows 12-14: attack (4 frames × 3 directions: S, E, N)

West direction = horizontal flip of East row
```

### Sprite Creation Process

Use a Node.js script with `canvas` (or manual pixel art) to generate each sprite sheet:

1. **Lasso Bandit** — Brown duster, wide hat, lasso coil. Attack: overhead lasso swing.
2. **Dynamite Tosser** — Rugged miner, bandolier of sticks, lit match. Attack: overhand throw.
3. **Armored Bandit** — Bulky silhouette, metal breastplate, tin helmet. Attack: pistol draw from behind shield.
4. **Healer Shaman** — Cloaked, feathered staff, glowing crystal. Attack: staff raise with energy pulse.
5. **Rattlesnake** — Low profile serpent, distinct rattle. Attack: striking lunge. Uses only 2 rows for direction (S, E — no distinct N since snakes look similar).
6. **Vulture** — Spread wings, dark plumage. Attack: wings tucked dive. Grounded: folded wings.

### Sprite Registration

Each enemy definition in the registry includes `spriteId` and `spriteScale`. The `AssetLoader` iterates the registry to build its sprite manifest automatically — no manual `ENEMY_SPRITES` entries needed.

---

## Phase 10: Testing

### Unit Tests (shared)

Per new enemy type:
- Spawn function sets all ECS components correctly
- AI transitions work (idle → chase → telegraph → attack → recovery)
- Attack deals expected damage
- Special mechanics work (root breaks on roll, dynamite detonates after fuse, armor reduces frontal damage, heal pulse heals allies, poison ticks correctly, vulture is immune when airborne)

### Integration Tests (shared)

- Wave with new enemy types spawns and clears correctly
- Mixed waves (old + new enemies) behave correctly
- Dynamite friendly fire on enemies works
- Healer doesn't heal dead enemies
- Root doesn't stack from same source
- Poison caps at 3 stacks
- Vulture transitions airborne/grounded correctly

### Manual Testing Checklist

- [ ] Each enemy has correct sprite (not fallback circle)
- [ ] Animations play correctly for all states (idle, walk, telegraph, attack, death)
- [ ] West-facing uses flipped East sprites
- [ ] Telegraph flash is visible and readable
- [ ] New enemies work in multiplayer (start server, join 2 clients)
- [ ] No desync after 5 minutes of play with all enemy types active
- [ ] `bun run typecheck` clean
- [ ] `bun test` passes all
- [ ] `bun run build` succeeds

---

## Implementation Order

| # | Phase | Estimate | Depends On |
|---|-------|----------|------------|
| 1 | Enemy Registry Pattern | Large | — |
| 2 | Lasso Bandit + Root system | Medium | Phase 1 |
| 3 | Dynamite Tosser + Dynamite system | Medium | Phase 1 |
| 4 | Armored Bandit + FrontArmor system | Medium | Phase 1 |
| 5 | Healer Shaman + ally-seek steering | Medium | Phase 1 |
| 6 | Rattlesnake + Poison system | Medium | Phase 1 |
| 7 | Vulture + Flying system | Large | Phase 1 |
| 8 | Wave Integration | Small | Phases 2-7 |
| 9 | Sprite Sheets | Medium | Phases 2-7 |
| 10 | Testing | Medium | All |

Phases 2-7 are independent of each other and can be done in any order. Recommended order: Rattlesnake (simplest), Armored Bandit (extends existing projectile), Lasso Bandit (new CC mechanic), Dynamite Tosser (new entity type), Healer Shaman (new steering), Vulture (most complex — new collision rules).

---

## New EnemyType Values

```ts
// Add to EnemyType enum in components.ts:
LASSO_BANDIT: 15,
DYNAMITE_TOSSER: 16,
ARMORED_BANDIT: 17,
HEALER_SHAMAN: 18,
RATTLESNAKE: 19,
VULTURE: 20,
```

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Registry refactor breaks existing enemies | Run full test suite after each migration step. Keep old spawn functions as wrappers. |
| Vulture's terrain-ignore creates exploits | Vulture is only immune to bullets when airborne; always vulnerable during telegraph/attack/recovery. Time airborne vs grounded carefully. |
| Dynamite friendly-fire feels unfair | Blast radius preview is very visible. Fuse is long enough to dodge. Damage to enemies makes it a player tool too. |
| Poison DOT feels invisible/unfair | Clear visual (green vignette), HUD icon, and potion cure. Low DPS (2/s) means it's pressure, not a death sentence. |
| Root CC feels frustrating | Short duration (1.5s), can be broken with roll, and player can still aim + shoot while rooted. |
| Healer makes waves too long | Healer is fragile (22 HP), always paired with threats. Smart players focus healer first. Cap heal amount so it can't outheal focused DPS. |
| Sprite quality inconsistency | Follow exact same format as existing enemy sprites. Use same 32×32 cell size, same color palette conventions. |

---

## Summary

Sprint 18 adds 6 mechanically distinct enemies to the roster, each reinforcing the Western theme and teaching a different combat skill:

| Enemy | Tier | Teaches |
|-------|------|---------|
| **Lasso Bandit** | Threat | Roll timing, CC awareness |
| **Dynamite Tosser** | Fodder | Positioning, area denial avoidance |
| **Armored Bandit** | Threat | Flanking, piercing item value |
| **Healer Shaman** | Threat | Target prioritization |
| **Rattlesnake** | Fodder | Spatial awareness, resource management (potions) |
| **Vulture** | Threat | Timing windows, patience |

The registry refactor in Phase 1 pays forward — every future enemy (minibosses, Stage 4 enemies, seasonal content) becomes a single-file addition instead of a multi-file scavenger hunt.
