# Sprint: Stage 1 Improvements

Implements the Stage 1 rework from `docs/mechanics/stage-1-design.md`. Four focused enemy archetypes, cactus obstacles, 3-wave encounter structure, and supporting client rendering.

**Goal**: Stage 1 teaches four skills through four enemies, feels like a western ghost town, and never feels like a tutorial.

---

## Task Breakdown

### Phase 1: Shared Foundation (No Client Changes)

Everything in `packages/shared`. Must typecheck and existing tests must pass after each task.

---

#### 1.1 Add New EnemyType Enum Values

**Files**: `packages/shared/src/sim/components.ts`

Add four new entries to the `EnemyType` enum:
```
DRIFTER: 24        // Pistol variant (ranged fodder)
KNIFE_DRIFTER: 25  // Melee variant (melee fodder)
DEADEYE: 26        // Sniper threat
SPITTER: 27        // Pattern sprayer threat
DUSTDEVIL: 28      // Area denial fodder
```

Update `EnemyTier` assignments in the enemy definitions (task 1.2).

**Acceptance**: `bun run typecheck` passes. No runtime changes.

---

#### 1.2 Define Enemy Stats & Register

**Files**: `packages/shared/src/sim/content/enemies.ts`

Add `registerEnemy()` calls for all 5 new types. Stats from the design doc:

**Drifter (Pistol)** — Fodder, budget cost 1:
- Speed 70, radius 8, HP 10
- `attackStyle: 'projectile'`, 1 bullet, speed 190, accel 0, drag 0
- Telegraph 0.4s, recovery 0.6s, cooldown 2.0s, damage 3
- Aggro 280, attack range 200, preferred range 0 (approaches)
- `BulletSpriteId.SLUG`

**Knife Drifter** — Fodder, budget cost 1:
- Speed 85, radius 8, HP 12
- `attackStyle: 'melee'`, reach 10, attack duration 0.25s
- Telegraph 0.35s, recovery 0.5s, cooldown 1.8s, damage 4
- Knockback: 150 speed, 0.1s duration
- Aggro 250, attack range 30

**Deadeye** — Threat, budget cost 3:
- Speed 40, radius 10, HP 15
- `attackStyle: 'projectile'`, 1 bullet, speed 650, accel 0, drag 0
- Telegraph **1.1s**, recovery 1.0s, cooldown 3.8s, damage 9
- Aggro 400, attack range 300, preferred range 260
- `BulletSpriteId.SLUG` (new sniper sprite later, SLUG for now)
- Note: the long telegraph + fast bullet is the core mechanic. Aim is locked at TELEGRAPH entry (existing `aimX`/`aimY` system).

**Spitter** — Threat, budget cost 3:
- Speed 48, radius 12, HP 22
- `attackStyle: 'projectile'`, **6 bullets**, spread angle **1.8 rad (~103 degrees)**, speed 130, accel 0, drag 0.3
- Telegraph 0.5s, recovery 0.8s, cooldown 3.0s, damage 3
- Aggro 300, attack range 180, preferred range 130
- `BulletSpriteId.SLUG_ANIM`

**Dustdevil** — Fodder, budget cost 2:
- Speed 68, radius 8, HP 13
- `attackStyle: 'custom'` (zone placement, implemented in 1.4)
- Telegraph 0.4s, recovery 1.0s, cooldown 4.5s, damage 0 (zone does damage)
- Aggro 300, attack range 100, preferred range 0

Also add spawn helper functions in `packages/shared/src/sim/prefabs.ts` for each new type (following existing `spawnFromRegistry` pattern).

**Acceptance**: All 5 types registered. `getEnemyDef(EnemyType.DRIFTER)` etc. return correct definitions. Typecheck passes.

---

#### 1.3 Deadeye Laser Telegraph Data

**Files**: `packages/shared/src/sim/systems/enemyAttack.ts`, `packages/shared/src/sim/world.ts`

The Deadeye's lock-on laser needs shared-side data so the client can render it:

1. Add `world.laserTelegraphs: Array<{ eid: number, x: number, y: number, aimX: number, aimY: number, progress: number }>` to `GameWorld`.
2. In `enemyAttack.ts`, during the TELEGRAPH state for Deadeye-type enemies:
   - On TELEGRAPH entry: lock aim direction toward player (existing `AttackConfig.aimX/aimY` system already does this)
   - Each tick: push a laser telegraph entry with the enemy's position, locked aim direction, and `progress = stateTimer / telegraphDuration`
3. Clear `world.laserTelegraphs` at the start of each tick.

The aim-lock-at-telegraph-entry behavior already exists (used by Charger for rush direction). The Deadeye reuses this: when entering TELEGRAPH, `aimX/aimY` are set to the player's current position. The bullet fires along this locked direction. If the player moved, the bullet misses.

**Acceptance**: When a Deadeye enters TELEGRAPH, `world.laserTelegraphs` contains an entry each tick with increasing progress 0→1. The bullet fires in the locked aim direction. Typecheck passes.

---

#### 1.4 Dustdevil Zone System

**Files**:
- `packages/shared/src/sim/systems/dustdevilZone.ts` (new)
- `packages/shared/src/sim/world.ts`
- `packages/shared/src/sim/systems/enemyAttack.ts`

The Dustdevil creates lingering damage zones on the ground:

1. Add `world.dustZones: Array<{ x: number, y: number, radius: number, remaining: number, dps: number }>` and `world.dustZonesSpawnedThisTick: Array<{ x: number, y: number, radius: number }>` to `GameWorld`.

2. In `enemyAttack.ts`, handle `attackStyle: 'custom'` for DUSTDEVIL type:
   - On ATTACK state entry: push a new zone at the Dustdevil's current position
   - Zone properties: radius 55px, duration 2.8s, DPS 8

3. New `dustdevilZoneSystem(world, dt)`:
   - Tick down `remaining` on each zone
   - Remove expired zones
   - For each alive, grounded player overlapping a zone: apply `dps * dt` damage (respecting i-frames)
   - Populate `dustZonesSpawnedThisTick` for client VFX

4. Add `dustdevilZoneSystem` to the system pipeline in `stepWorld`, after `enemyAttackSystem` and before `movementSystem`.

Pattern follows the existing `dynamite.ts` and `trapZoneSystem.ts` approaches.

**Acceptance**: Spawning a Dustdevil that reaches ATTACK state creates a zone. Standing in the zone deals damage over time. Zone expires after duration. Tests cover zone creation, damage, and expiry.

---

#### 1.5 Cactus Obstacle Type

**Files**:
- `packages/shared/src/sim/content/maps/mapObstacleDefs.ts`
- `packages/shared/src/sim/content/maps/mapConfig.ts`
- `packages/shared/src/sim/systems/hazardTile.ts` (possibly)

Add a cactus obstacle that damages players on contact:

1. Add `CACTUS: 6` to `MapObstacleType` enum.

2. Define `CACTUS_DEF: MapObstacleDef`:
   - 1x1 tile, `halfWalls` (not full wall — player can walk into it but takes damage)
   - HP: undefined (indestructible — it's a cactus)
   - Jumpable: true
   - New field on `MapObstacleDef`: `contactDamage?: number` (set to 3 for cactus)

3. Add contact damage handling. Two approaches:
   - **Option A (simpler)**: Cactus stamps a BRAMBLE tile. Reuses existing hazard damage system. Visual is a cactus sprite, but damage uses bramble DPS (5). Downside: bramble also slows.
   - **Option B (cleaner)**: Add `CACTUS` to `TileType` enum. `hazardTileSystem` handles it: damage on contact (5 DPS), no speed reduction. Add pathfind cost of 3 (enemies avoid but can path through).
   - **Recommended**: Option B. Gives us a distinct tile type we can render differently.

4. Add `CACTUS_DEF` to `STAGE_1_OBSTACLE_POOL` with weight 2. Increase total obstacle count from 6 to 8 in `STAGE_1_MAP_CONFIG` to accommodate.

5. Update `isWoodObstacle()` — cactus returns false.

**Acceptance**: Stage 1 maps generate with cactus obstacles. Walking into a cactus deals contact damage. Cactus is jumpable. Typecheck passes.

---

#### 1.6 Rework Stage 1 Encounter Definition

**Files**: `packages/shared/src/sim/content/waves.ts`

Replace `STAGE_1_ENCOUNTER` with the new 3-wave structure:

**Wave 1 — "Welcome to the Dust"**:
```typescript
{
  fodderBudget: 8,
  fodderPool: [
    { type: EnemyType.DRIFTER, weight: 3 },
    { type: EnemyType.KNIFE_DRIFTER, weight: 2 },
  ],
  maxFodderAlive: 3,
  threats: [],
  spawnDelay: 0,
  threatClearRatio: 0, // no threats — wave ends when budget exhausted + all dead
}
```

**Wave 2 — "Don't Stand Still"**:
```typescript
{
  fodderBudget: 8,
  fodderPool: [
    { type: EnemyType.DRIFTER, weight: 3 },
    { type: EnemyType.KNIFE_DRIFTER, weight: 1 },
  ],
  maxFodderAlive: 4,
  threats: [
    { type: EnemyType.DEADEYE, count: 1 },
    { type: EnemyType.SPITTER, count: 1 },
  ],
  spawnDelay: 2,
  threatClearRatio: 1.0,
}
```

**Wave 3 — "The Exam"**:
```typescript
{
  fodderBudget: 12,
  fodderPool: [
    { type: EnemyType.DRIFTER, weight: 3 },
    { type: EnemyType.KNIFE_DRIFTER, weight: 2 },
    { type: EnemyType.DUSTDEVIL, weight: 2 },
  ],
  maxFodderAlive: 5,
  threats: [
    { type: EnemyType.DEADEYE, count: 1 },
    // Boss from pool (BOOMSTICK, MAD_DOG, DALTON)
  ],
  spawnDelay: 3,
  threatClearRatio: 1.0,
}
```

Keep existing `bossPool` and `objective`. The boss entry in wave 3's threats array uses the bossPool selection (existing system handles this — the first entry in `bossPool` replaces the BOOMSTICK placeholder at encounter start).

**Wave completion rule for Wave 1**: The wave system currently requires `threatClearRatio` kills to advance. Wave 1 has no threats. Need to verify: does the system advance when `threats` is empty and all fodder budget is spent + dead? If not, add a check: `if (threats.length === 0 && fodderBudgetExhausted && aliveFodder === 0) → advance`.

**Acceptance**: Playing Stage 1 produces 3 waves with correct enemy types and counts. Wave 1 clears correctly despite having no threats. Typecheck passes.

---

#### 1.7 Redistribute Existing Enemies to Later Stages

**Files**: `packages/shared/src/sim/content/waves.ts`

Enemies removed from Stage 1 need homes. Adjust Stage 2 and 3 encounter definitions:

- **Stage 2 Wave 1**: Add Swarmer, Grunt, Rattlesnake to fodder pools (these were in old Stage 1). Add Lasso Bandit as a threat if not already present. This is where players first encounter CC.
- **Stage 2 Wave 2**: Add Goblin Rogue, Dynamite Tosser to fodder. These build on Stage 1 skills.
- **Stage 3**: Add Armored Bandit, Healer Shaman as threats (already there). Increase Goblin Barbarian weight.

The exact tuning is flexible — the key constraint is that Swarmer, Grunt, Rattlesnake, Goblin Rogue, Dynamite Tosser all still appear somewhere in the run.

**Acceptance**: All 4 stage encounters typecheck. Every previously-used enemy type appears in at least one stage. No enemy types are orphaned.

---

### Phase 2: Client Rendering

Client-side visuals for new enemies and effects. All in `packages/client/src/render/`.

---

#### 2.1 Enemy Render Definitions

**Files**: `packages/client/src/render/enemyRenderDefs.ts`

Add entries for the 5 new enemy types:

- `ENEMY_COLORS[EnemyType.DRIFTER]` — dusty brown (e.g., `0x8B7355`)
- `ENEMY_COLORS[EnemyType.KNIFE_DRIFTER]` — darker brown (`0x6B5335`)
- `ENEMY_COLORS[EnemyType.DEADEYE]` — red/crimson (`0xCC3333`)
- `ENEMY_COLORS[EnemyType.SPITTER]` — sickly green (`0x669944`)
- `ENEMY_COLORS[EnemyType.DUSTDEVIL]` — sandy orange (`0xCC9944`)

These are fallback circle colors. Sprite assets can be added later.

**Acceptance**: New enemies render as colored circles with correct colors. No rendering errors.

---

#### 2.2 Deadeye Laser Sight Renderer

**Files**: `packages/client/src/render/LaserSightRenderer.ts` (new)

Renders the Deadeye's lock-on laser during TELEGRAPH:

1. Each frame, read `world.laserTelegraphs` (synced from shared sim).
2. For each entry, draw a line from the enemy position extending in the aim direction.
3. Visual stages based on `progress` (0→1):
   - 0.0–0.3: Faint red dashed line, thin (1px), low alpha (0.3)
   - 0.3–0.7: Solid red line, medium width (2px), alpha (0.6), subtle pulse
   - 0.7–1.0: Bright red line, thick (3px), alpha (1.0), fast pulse, particles
4. Line length: 400px (extends well past the enemy's attack range for visual clarity).
5. On `progress >= 1.0` (ATTACK frame): brief bright flash along the line, then gone.

Implementation: Use PIXI `Graphics` drawing (dashed line segments). Reuse the pattern from `BossAttackRenderer.ts` which already renders `'line'` telegraphs with dashes, pulsing, and particles.

Register in the renderer bundle and call `update()` each frame.

**Acceptance**: During Deadeye TELEGRAPH, a red laser line is visible from the enemy toward the player's locked position. Line intensifies over the telegraph duration.

---

#### 2.3 Dustdevil Zone Renderer

**Files**: `packages/client/src/render/DustZoneRenderer.ts` (new)

Renders lingering dust zones on the ground:

1. Each frame, read `world.dustZones`.
2. For each zone, draw a filled circle on the ground layer (below entities):
   - Color: sandy orange (`0xCC8833`), alpha 0.25–0.35
   - Radius matches zone radius (55px)
   - Edge: slightly darker ring border
3. Animate: gentle pulsing alpha based on `sin(time)`, subtle rotation of a noise texture or particle swirl.
4. Fade-out: when `remaining < 0.5s`, lerp alpha toward 0.
5. Spawn VFX: on `dustZonesSpawnedThisTick`, burst of dust particles outward.

Implementation: Use PIXI `Graphics` circles on the background layer. One Graphics object per active zone, pooled and recycled.

**Acceptance**: Dust zones appear as visible ground hazards. They pulse gently, fade before expiring, and spawn with a dust burst.

---

#### 2.4 Cactus Obstacle Rendering

**Files**: `packages/client/src/render/ObstacleRenderer.ts` (or wherever obstacles are rendered)

Add visual handling for `MapObstacleType.CACTUS`:

1. If sprite assets exist: render cactus sprite at obstacle tile position.
2. Fallback: render a green circle/polygon with spines (simple geometric cactus).
3. Cactus tiles should be visually distinct from regular ground — slight green tint or cactus-shaped icon on the tile.
4. Since cactus uses a CACTUS TileType in the tilemap, the tilemap renderer also needs a tile color/texture for CACTUS tiles (green-brown tint).

**Acceptance**: Cactus obstacles are visually identifiable on the Stage 1 map. Player can see them and understand they're hazardous.

---

### Phase 3: Testing & Polish

---

#### 3.1 Unit Tests for New Enemies

**Files**: `packages/shared/src/sim/__tests__/stage1Enemies.test.ts` (new)

Test cases:

**Drifter**:
- Spawns with correct HP, speed, damage
- Fires a single bullet when in range after telegraph
- Bullet speed is correct (190)
- Knife variant uses melee attack, not projectile

**Deadeye**:
- Locks aim direction at TELEGRAPH entry
- Fires bullet in locked direction (not current player position)
- Bullet speed is very fast (650)
- If player moves during telegraph, bullet misses
- `world.laserTelegraphs` populated during TELEGRAPH
- Maintains preferred range (doesn't close to melee)

**Spitter**:
- Fires 6 bullets in a spread arc
- Bullets are slow (130 speed)
- Spread angle covers ~103 degrees
- Gaps between bullets are navigable

**Dustdevil**:
- Creates zone on ATTACK
- Zone has correct radius, duration, DPS
- Zone damages player standing inside
- Zone expires after duration
- Multiple zones can coexist

**Cactus**:
- Cactus tiles deal contact damage
- Player can jump over cactus
- Enemies path around cactus (higher pathfind cost)

**Acceptance**: All tests pass. `bun test` green.

---

#### 3.2 Wave Progression Tests

**Files**: `packages/shared/src/sim/__tests__/stage1Waves.test.ts` (new)

Test the 3-wave encounter flow:

- Wave 1 spawns only Drifters (pistol + knife)
- Wave 1 advances when all fodder dead and budget exhausted
- Wave 2 spawns Drifters + Deadeye + Spitter
- Wave 2 advances when both threats dead
- Wave 3 spawns all 4 fodder types + Deadeye threat + boss
- Wave 3 / encounter ends when boss dead
- No old enemy types (Swarmer, Grunt, etc.) appear in Stage 1

**Acceptance**: Full Stage 1 encounter can be simulated to completion in tests.

---

#### 3.3 Balance Pass & Tuning

Not a code task — a playtest checklist. After implementation, verify:

- [ ] Drifters feel satisfying to kill (1-2 shots)
- [ ] Deadeye laser is visible and readable
- [ ] Deadeye shot is dodgeable by moving (not by reaction)
- [ ] Spitter wall has clear, generous gaps
- [ ] Dustdevil zones are escapable (not instant death)
- [ ] Cactus patches are visible and avoidable
- [ ] Wave 1 is easy and confidence-building
- [ ] Wave 2 introduces new threats without overwhelming
- [ ] Wave 3 + boss is challenging but fair
- [ ] Total Stage 1 time: 2-3 minutes
- [ ] No enemy type feels redundant or confusing

---

## Dependency Graph

```
1.1 EnemyType Enum
 └──► 1.2 Enemy Stats & Register
       ├──► 1.3 Deadeye Laser Data
       ├──► 1.4 Dustdevil Zone System
       └──► 1.6 Stage 1 Encounter
             └──► 1.7 Redistribute to Later Stages

1.5 Cactus Obstacle (independent of enemies)

Phase 2 (client) depends on Phase 1 completion:
  1.3 ──► 2.2 Laser Sight Renderer
  1.4 ──► 2.3 Dust Zone Renderer
  1.5 ──► 2.4 Cactus Renderer
  1.2 ──► 2.1 Enemy Render Defs

Phase 3 depends on Phase 1 + 2:
  All ──► 3.1 Unit Tests
  1.6 ──► 3.2 Wave Tests
  All ──► 3.3 Balance Pass
```

## Suggested Implementation Order

1. **1.1** → **1.2** → **1.5** (enum, stats, cactus — fast, foundational)
2. **1.3** → **1.4** (Deadeye laser data, Dustdevil zones — new systems)
3. **1.6** → **1.7** (encounter restructure — ties it all together)
4. **2.1** → **2.2** → **2.3** → **2.4** (client rendering)
5. **3.1** → **3.2** → **3.3** (testing and polish)

Tasks 1.3 and 1.4 can be parallelized. Tasks 2.1–2.4 can mostly be parallelized.

## Files Changed (Summary)

| File | Change |
|------|--------|
| `shared/src/sim/components.ts` | Add 5 EnemyType values |
| `shared/src/sim/content/enemies.ts` | 5 `registerEnemy()` calls + constants |
| `shared/src/sim/prefabs.ts` | 5 spawn helper functions |
| `shared/src/sim/world.ts` | Add `laserTelegraphs`, `dustZones`, `dustZonesSpawnedThisTick` |
| `shared/src/sim/systems/enemyAttack.ts` | Deadeye laser data + Dustdevil zone spawn |
| `shared/src/sim/systems/dustdevilZone.ts` | **New** — zone tick, damage, expiry |
| `shared/src/sim/systems/stepWorld.ts` | Add `dustdevilZoneSystem` to pipeline |
| `shared/src/sim/tilemap.ts` | Add `CACTUS` TileType |
| `shared/src/sim/systems/hazardTile.ts` | Handle CACTUS tile damage |
| `shared/src/sim/content/hazards.ts` | CACTUS_DPS constant, pathfind cost |
| `shared/src/sim/content/maps/mapObstacleDefs.ts` | CACTUS type + def + pool update |
| `shared/src/sim/content/maps/mapConfig.ts` | Stage 1 obstacle count bump |
| `shared/src/sim/content/waves.ts` | 3-wave Stage 1 + Stage 2/3 adjustments |
| `client/src/render/enemyRenderDefs.ts` | 5 color entries |
| `client/src/render/LaserSightRenderer.ts` | **New** — Deadeye laser line |
| `client/src/render/DustZoneRenderer.ts` | **New** — ground zone circles |
| `client/src/render/ObstacleRenderer.ts` | Cactus visual handling |
| `shared/src/sim/__tests__/stage1Enemies.test.ts` | **New** — enemy behavior tests |
| `shared/src/sim/__tests__/stage1Waves.test.ts` | **New** — wave progression tests |
