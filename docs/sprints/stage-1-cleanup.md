# Sprint: Stage 1 Cleanup & Polish

Addresses remaining gaps from the Stage 1 rework: enemy visual identity, town layout improvements, missing test coverage, and balance validation.

**Goal**: Stage 1 looks, plays, and feels like a western ghost town under siege. Every enemy is instantly readable. The town layout rewards smart positioning. Both singleplayer and multiplayer paths are fully tested.

**Prerequisite**: `stage-1-improvements.md` (complete)

---

## Task Breakdown

### Phase 1: Enemy Visual Identity

Stage 1 enemies are the first things a new player sees. They currently render as plain colored circles — visually indistinguishable at a glance and incongruent with the 22 sprite-based enemies used in later stages. This phase gives each enemy a distinct silhouette, color, and directional indicator using compound PixiJS Graphics shapes.

**Design principles** (from bullet-hell readability research):
- Each enemy type needs **one strong shape feature** — at 8-16px radius you communicate one idea, not detail
- Colors must **contrast with the desert background** (`red_dirt` ≈ warm tan) — push toward saturated primaries
- Melee enemies use warm/aggressive hues (orange-red); threats get high saturation; area denial uses warning amber
- Every enemy must show **facing direction** so the player can read intent before the telegraph

---

#### 1.1 Improve Enemy Color Palette

**Files**: `packages/client/src/render/enemyRenderDefs.ts`

Update `ENEMY_COLORS` for the five Stage 1 types. The current earth-tone palette blends into the desert tilemap. Replace with higher-saturation colors spread across the hue wheel:

| Enemy | Current | New | Rationale |
|-------|---------|-----|-----------|
| Drifter | `0xc4956a` (muted tan) | `0xd4a574` (warm tan, +saturation) | Baseline fodder, warm but distinct from ground |
| Knife Drifter | `0xb07850` (brown) | `0xdd6633` (orange-red) | Melee = aggressive warmth, clearly different from Drifter |
| Deadeye | `0x774444` (dark maroon) | `0xcc2222` (deep crimson) | Threat tier = danger red, high saturation pops at distance |
| Spitter | `0x66aa55` (muted green) | `0x44dd55` (toxic green) | Organic/toxic association, max hue distance from reds |
| Dustdevil | `0xaa8844` (sandy) | `0xddaa22` (warning amber) | Area denial = hazard yellow, matches universal warning convention |

**Acceptance**: Colors are visually distinct from each other and from the `red_dirt` background at all zoom levels. No two Stage 1 enemies can be confused at a glance.

---

#### 1.2 Compound Shape Rendering for Stage 1 Enemies

**Files**: `packages/client/src/render/EnemyRenderer.ts`, possibly a new helper `packages/client/src/render/stage1Shapes.ts`

Replace the `createCircle()` fallback for Stage 1 enemies with compound PixiJS Graphics shapes that communicate each enemy's role through silhouette alone.

**Drifter** — "Circle with hat brim":
- Body: filled circle (r=8)
- Hat brim: flat rounded rectangle on top (12px wide, 3px tall), slightly darker than body
- Facing: small dark dot (2px) offset toward facing direction (eye)
- Reads as: "generic bandit with a hat" — the western baseline

**Knife Drifter** — "Circle with blade wedge":
- Body: filled circle (r=8)
- Blade: pointed triangle extending forward in facing direction (8px long)
- Color: blade is lighter (steel gray `0xcccccc`) against the orange-red body
- Reads as: "this one has a knife, it wants to get close"
- Animation: blade wedge scales up 1.5x during TELEGRAPH state

**Deadeye** — "Diamond with scope line":
- Body: rotated square / diamond shape (10px diagonal) — the only non-round Stage 1 enemy
- Scope: thin line (1px) extending from body in aim direction (12px long), darker than body
- Already has LaserSightRenderer for the full telegraph — scope line is the idle/chase indicator
- Reads as: "angular, dangerous, different from the round fodder"

**Spitter** — "Fat oval with nubs":
- Body: horizontal ellipse (rx=12, ry=10) — largest silhouette, reads as "wide, slow"
- Nubs: 3 small circles (2px each) evenly spaced around the rim
- Reads as: "fat, has multiple projectile sources, shoots a spread"

**Dustdevil** — "Circle with spiral":
- Body: filled circle (r=8)
- Spiral: a single arc/swirl line inside the body, rotated over time (`world.tick * 0.1`)
- When spawning zones: brief flash to full amber
- Reads as: "spinning, turbulent, environmental hazard"

**Implementation approach**: Add a `createStage1Shape(type, radius, color)` function that returns a `Graphics` object with the appropriate compound shape. Call it from the circle-rendering branch in `EnemyRenderer.sync()` when the enemy type is a Stage 1 type.

For facing direction, the `render()` loop already has access to `Velocity.x[eid]` / `Velocity.y[eid]` and `EnemyAI.targetEid[eid]`. Compute facing angle and apply it as rotation to the shape's directional child elements (hat brim stays on top, blade/scope rotates with facing).

**Acceptance**: Each Stage 1 enemy has a unique silhouette. The "solid black fill test" — if you fill all five types with black, they are still distinguishable by outline. Shapes render correctly at all zoom levels. Performance is unchanged (PixiJS Graphics batches compound shapes efficiently).

---

#### 1.3 Knife Drifter Attack Animation

**Files**: `packages/client/src/render/EnemyRenderer.ts`

The Knife Drifter's blade wedge should animate during combat states to telegraph intent:
- **TELEGRAPH**: blade pulses (scale oscillates 1.0–1.3x)
- **ATTACK**: blade extends to full reach (stretch to 1.5x length), body squashes slightly (like Charger's existing `setScale(1.4, 0.7)` pattern)
- **RECOVERY**: blade retracts, body returns to normal

Reference the Charger's squash-and-stretch in the existing `render()` method for implementation pattern.

**Acceptance**: Knife Drifter attack reads visually distinct from its idle/chase state. The blade extension clearly signals "this is attacking now."

---

### Phase 2: Town Layout Improvements

The current town layout is structurally sound (3-tier strip placement, road network, cross alleys) but produces towns that feel like mazes of solid blocks rather than inhabited western settlements. These changes improve combat readability and spatial authenticity.

**Research-backed design principles**:
- Buildings in top-down bullet-hells should provide **cover without creating dead zones** — the player must always be able to read threats and find escape routes
- Western towns had a clear **density gradient**: wall-to-wall commercial buildings on Main Street, sparser residential at edges
- The center plaza is the **boss arena** — it must be framed by the town, not lost in it
- Every position needs **at least 2 escape routes** (no dead-end alleys)
- Alternate between exposure and protection with a **3-5 tile cover rhythm**

---

#### 2.1 Add Porches to Frontage Buildings

**Files**: `packages/shared/src/sim/content/maps/buildingProfiles.ts`

Add a 1-tile `halfWalls` row along the Main Street facade for the four main commercial buildings: Saloon, General Store, Sheriff, and Bank. This creates the iconic western boardwalk — walkable cover that blocks bullets but allows visibility.

Example for Saloon (currently 5x8 solid walls):
```
Before:  WWWWW    (W = WALL, 5 wide × 8 tall solid block)
         WWWWW
         ...

After:   WWWWW    (back wall, still solid)
         WWWWW
         ...
         WWWWW    (front wall, 1 row shorter)
         HHHHH    (H = HALF_WALL porch row, facing Main Street)
```

The porch row is `halfWalls` not `walls`, so:
- Players can walk on it (not solid collision)
- Bullets are blocked by it (half-wall collision)
- It provides cover while maintaining visibility for the player

Reduce `heightTiles` of wall fill by 1 for these four buildings and add the porch row as `halfWalls`. The bounding box (`widthTiles`, `heightTiles`) stays the same — the porch is part of the building footprint.

**Acceptance**: `bun run typecheck` passes. Map generation produces buildings with porches on Main Street. Porches are walkable, provide bullet cover, and face the street. Existing tests still pass.

---

#### 2.2 Increase Map Obstacle Density

**Files**: `packages/shared/src/sim/content/maps/mapConfig.ts`

Raise `STAGE_1_MAP_CONFIG.mapObstacles.count` from 8 to 14. Lower `minSpacing` from 5 to 4.

The current density is too low for a teaching stage. The design doc calls for "scattered low cover (destructible barrels/crates)" — 8 obstacles across a 1600×1216 arena means the player rarely has nearby cover. 14 obstacles with tighter spacing creates the **cover rhythm** (3-5 tiles between cover points) that teaches new players to use the environment.

Also adjust the obstacle pool weights to favor cover objects:

```typescript
pool: [
  { def: CRATE_DEF, weight: 4 },       // was 3 — primary destructible cover
  { def: BARREL_DEF, weight: 3 },       // was 2 — secondary cover
  { def: LOW_WALL_DEF, weight: 2 },     // was 1 — durable half-cover
  { def: FENCE_RAIL_DEF, weight: 2 },   // unchanged — jumpable cover
  { def: CACTUS_DEF, weight: 2 },       // unchanged — hazard variety
]
```

**Acceptance**: Generated maps have noticeably more cover scattered through the town. Main Street and alley mouths regularly have 1-2 obstacles nearby. The center clear zone remains obstacle-free.

---

#### 2.3 Add Center Landmark

**Files**: `packages/shared/src/sim/content/maps/mapObstacleDefs.ts`, `packages/shared/src/sim/content/maps/mapGenerator.ts`, `packages/client/src/render/MapObstacleRenderer.ts`

The center of the map (boss arena) is currently empty space with nothing to orient the player. Add a **hitching post** or **water trough** cluster at the edge of the center clear zone as a landmark.

Define a new `MapObstacleType.HITCHING_POST`:
- 3×1 tiles of `HALF_WALL` (jumpable, shootable cover)
- Indestructible (landmark persists through the fight)
- Placed deterministically at 2 positions on opposite edges of the center clear radius (north and south, or east and west)

This is not a random obstacle from the pool — it's placed explicitly by the generator when `config.obstacles.buildings` is defined (town maps only). The generator stamps them at `(centerX ± clearR, centerY)` or `(centerX, centerY ± clearR)` after building placement.

Client rendering: horizontal wooden beam with vertical posts at each end (similar to fence rail but with posts).

**Acceptance**: Every generated Stage 1 map has consistent landmarks at the center clear zone edges. The player can orient using them during the boss fight. Landmarks provide light cover without obstructing the arena.

---

#### 2.4 Widen Minimum Building Gaps

**Files**: `packages/shared/src/sim/content/maps/buildingPlacer.ts`

Change `ALLEY_GAP` from 1 to 2 for the frontage tier strips. Keep 1-tile gaps for back row and far lots (those aren't primary combat spaces).

With the current 1-tile gap, the space between frontage buildings is too narrow for comfortable combat movement (player radius is ~8px, 1 tile = 32px — barely 2 player widths). A 2-tile gap (64px) allows the player to dodge through building gaps without feeling trapped, satisfying the "no dead ends, minimum 2 escape routes" principle.

Implementation: Pass a different `gap` value for the frontage `placeStrip()` calls vs the outer tier calls. The `placeStrip()` function already accepts a `gap` parameter.

**Acceptance**: Frontage building gaps are wide enough for comfortable dodge-roll-width passage. No 1-tile chokepoints exist on Main Street frontage. Back row gaps remain tight for variety.

---

#### 2.5 Enforce Building-Type-to-Position Rules

**Files**: `packages/shared/src/sim/content/maps/buildingPlacer.ts`

Currently, unique buildings (saloon, general store, sheriff, bank, barber) are shuffled randomly across all four inner strips (west/east frontage, west/east back row). This means the saloon might end up in the back row behind other buildings, invisible from Main Street.

Add placement preference rules:
- **Frontage-preferred**: Saloon, General Store must be placed in frontage strips (inner strips 0 or 1). They are the town's "face" — the player should see them from Main Street.
- **Adjacent pair**: Sheriff and Bank should be placed in the same strip (historically adjacent for security). When distributing unique buildings, place them consecutively in the same strip.
- **Barber**: No preference (can go anywhere).

Implementation: Instead of shuffling all unique buildings together and distributing round-robin, partition them:
1. Pick which side (west/east) gets the Saloon+General Store pair (random)
2. Pick which side gets the Sheriff+Bank pair (the other side, or same side if tall buildings fit)
3. Place Barber wherever there's room
4. Continue with filler distribution as before

**Acceptance**: Saloon and General Store are always visible from Main Street. Sheriff and Bank are always adjacent. Town layout feels intentional, not random. Generated towns pass the "glance test" — the player can identify landmark buildings within 0.5 seconds.

---

### Phase 3: Test Coverage

Fill the gaps identified in the Stage 1 test audit. Focus on integration paths that validate the actual combat experience, not just data definitions.

---

#### 3.1 Dustdevil Attack Integration Test

**Files**: `packages/shared/src/sim/content/stage1.test.ts` or new `packages/shared/src/sim/systems/dustdevilAttack.test.ts`

Test the full path: Dustdevil enters ATTACK state → `enemyAttackSystem` runs → `world.dustZones` gains a new entry → zone has correct position/radius/duration/dps → `world.dustZonesSpawnedThisTick` is populated for client VFX.

Test cases:
- Dustdevil attack spawns exactly one zone at the enemy's position
- Zone has correct properties (`radius = 55`, `remaining = 2.8`, `dps = 8`)
- `dustZonesSpawnedThisTick` is populated on the attack tick and cleared on the next tick
- Enemy transitions to RECOVERY after attack

**Acceptance**: All tests pass. The Dustdevil attack→zone pipeline is verified end-to-end.

---

#### 3.2 Spitter Multi-Projectile Test

**Files**: `packages/shared/src/sim/systems/enemyAttack.test.ts` or `stage1.test.ts`

Test the Spitter's 6-bullet spread pattern:
- Spitter attack spawns exactly 6 bullets
- Bullets fan out across a ~1.8 radian arc centered on the aim direction
- Each bullet has speed 130, drag 0.3, damage 3
- Fodder projectile cap gates Spitter firing (if cap exceeded, no bullets spawn)

**Acceptance**: Spitter spread pattern is verified. Bullet count, speed, and spread angle match the design doc.

---

#### 3.3 Deadeye LOS and Fast Projectile Test

**Files**: `packages/shared/src/sim/systems/enemyAttack.test.ts` or `stage1.test.ts`

Test Deadeye-specific mechanics:
- Deadeye requires line-of-sight (`losRequired: true`) — does not attack through walls
- Deadeye's bullet spawns at 650 px/s (verify via `Velocity` magnitude on the bullet entity)
- Deadeye telegraph duration is 1.1s (verify AI state timer)
- Laser telegraph data is written to `world.laserTelegraphs` during TELEGRAPH state

**Acceptance**: LOS gating, projectile speed, telegraph duration, and laser data are all verified.

---

#### 3.4 Wave Progression Integration Test

**Files**: `packages/shared/src/sim/systems/waveSpawner.test.ts` or new `stage1Integration.test.ts`

End-to-end test that runs the Stage 1 encounter through all 3 waves:
1. Set up a world with `STAGE_1_ENCOUNTER`
2. Tick the simulation, verify Wave 1 spawns only Drifters/Knife Drifters
3. Kill all Wave 1 enemies, verify Wave 2 starts (spawns Deadeyes as threats)
4. Kill Wave 2 threats (clearing `threatClearRatio: 1.0`), verify Wave 3 starts
5. Verify Wave 3 includes a boss from the pool `[BOOMSTICK, MAD_DOG, DALTON]`
6. Kill all Wave 3 enemies + boss, verify encounter completes

This is the most important test — it validates the actual player experience.

**Acceptance**: Full 3-wave progression works. Wave transitions happen at correct kill thresholds. Boss spawns from the correct pool. Encounter completion is detected.

---

#### 3.5 Town Map Generation Validation

**Files**: `packages/shared/src/sim/content/maps/mapGenerator.test.ts`

Add Stage 1 specific map validation:
- All 5 unique buildings (saloon, general_store, sheriff, bank, barber) are placed
- No building overlaps with the center clear zone
- No 1-tile dead-end alleys (every walkable tile has ≥2 adjacent walkable tiles, excluding map borders)
- Map obstacles don't overlap with buildings or the center clear zone
- Cactus tiles are present in the floor layer
- Road tiles connect from top to bottom of the map (main street is contiguous)

**Acceptance**: Map generation consistently produces valid, playable town layouts. No pathfinding traps.

---

### Phase 4: Balance & Polish

---

#### 4.1 Playtest Validation Checklist

Manual verification against the design doc targets. Run Stage 1 in singleplayer and document results.

| Metric | Target | Actual |
|--------|--------|--------|
| Average clear time | 2-3 minutes | ___ |
| Deaths (first attempt, experienced player) | 0-1 | ___ |
| HP loss (new player, first attempt) | 50-70% | ___ |
| Wave 1 clear time | 30-45s | ___ |
| Wave 2 clear time | 45-60s | ___ |
| Wave 3 clear time | 60-90s | ___ |
| Initial spawn delay feels fair | Yes/No | ___ |
| Deadeye telegraph is readable | Yes/No | ___ |
| Spitter gaps are navigable | Yes/No | ___ |
| Dustdevil zones are avoidable | Yes/No | ___ |
| Cactus contact damage is noticeable | Yes/No | ___ |
| Cover is useful and accessible | Yes/No | ___ |
| No off-screen deaths | Yes/No | ___ |

If metrics deviate significantly, file specific tuning tasks.

**Acceptance**: All checklist items filled in. Major deviations have follow-up tasks created.

---

#### 4.2 Multiplayer Parity Smoke Test

Verify Stage 1 works correctly in a 2-player multiplayer session:
- Both players see the same enemies spawn at the same positions
- Dustdevil zones appear for both players at the correct positions
- Deadeye laser telegraphs render for both players
- Cactus tile damage applies to both players
- Wave progression advances correctly with 2 players killing enemies
- Co-op HP scaling applies (enemies should have more HP with 2 players)
- Enemy death is synchronized (no ghost enemies lingering on one client)

**Acceptance**: No desync between clients. All Stage 1 mechanics render and resolve identically for both players.

---

## Files Changed (Estimated)

### Phase 1 (Enemy Visuals)
| File | Change |
|------|--------|
| `packages/client/src/render/enemyRenderDefs.ts` | Update 5 color values |
| `packages/client/src/render/EnemyRenderer.ts` | Stage 1 shape rendering branch, facing indicators, Knife Drifter animation |
| `packages/client/src/render/stage1Shapes.ts` (new) | Compound Graphics shape factory for 5 enemy types |

### Phase 2 (Town Layout)
| File | Change |
|------|--------|
| `packages/shared/src/sim/content/maps/buildingProfiles.ts` | Add halfWall porches to 4 buildings |
| `packages/shared/src/sim/content/maps/mapConfig.ts` | Raise obstacle count to 14, lower minSpacing to 4 |
| `packages/shared/src/sim/content/maps/mapObstacleDefs.ts` | Add HITCHING_POST def, update pool weights |
| `packages/shared/src/sim/content/maps/mapGenerator.ts` | Place center landmarks for town maps |
| `packages/shared/src/sim/content/maps/buildingPlacer.ts` | Widen frontage gaps, enforce building-type-to-position rules |
| `packages/client/src/render/MapObstacleRenderer.ts` | Add hitching post rendering |

### Phase 3 (Tests)
| File | Change |
|------|--------|
| `packages/shared/src/sim/content/stage1.test.ts` | Dustdevil attack, Spitter spread, Deadeye LOS tests |
| `packages/shared/src/sim/systems/waveSpawner.test.ts` | Full wave progression integration test |
| `packages/shared/src/sim/content/maps/mapGenerator.test.ts` | Town layout validation tests |

### Phase 4 (Balance)
No code changes — manual playtest documentation.

---

## Appendix: Research Summary

### Roguelite First-Stage Design (Enter the Gungeon, Hades, Nuclear Throne)

- **Handcrafted micro, procedural macro**: Gungeon found that purely procedural room layouts felt wrong. They handcraft individual room designs and use procedural generation only for room-to-room connections. Lesson: the combat arena layout should be designed (building profiles, placement rules), not random.
- **Teach one thing at a time**: Gungeon Floor 1 introduces enemy types incrementally — simple bullet dodging first, then pattern reading, then combined challenges. Our 3-wave structure already follows this pattern.
- **Generous first stage**: Hades' Tartarus gives the player extra boons and health. Nuclear Throne's Desert has the weakest enemies and most open terrain. The first stage should be beatable on first attempt by most players. Our target of 0-1 deaths aligns.
- **Cover as teaching tool**: Gungeon places destructible tables and flippable objects in early rooms specifically to teach the player that cover exists and is useful. Our low obstacle count (8) may not be teaching this lesson effectively — hence the bump to 14.

### Top-Down Western Town Layout

- **Main Street = primary sight line**: The main street is the longest unobstructed corridor in the town. In combat terms, it's "no man's land" — exposed to fire from both sides. Players should learn to cross it quickly or use cover.
- **Density gradient**: Real western towns had wall-to-wall buildings on Main Street, sparser buildings behind. Our 3-tier strip layout already implements this — frontage is densest, far lots are sparsest.
- **The Dead Line**: Historical dividing line between "respectable" and "rough" sides of town. Our cross alleys naturally create this division. Building type placement (Phase 2.5) would reinforce it.
- **Building adjacency tells stories**: Bank next to Sheriff = law protects wealth. Saloon across from Church = moral tension. Enforcing building-type-to-position rules creates this narrative without any text.
- **Porches define the streetscape**: Western buildings had covered boardwalks (porches) along Main Street. In gameplay terms, these are half-wall cover strips that define the transition between "inside" (safe behind building) and "outside" (exposed on Main Street). Adding porches (Phase 2.1) is the single highest-impact visual and gameplay improvement for town authenticity.

### Enemy Visual Readability in Bullet-Hells

- **Silhouette-first**: At 8-16px radius, shape is the primary differentiator. Color is secondary. Each enemy needs one strong shape feature (hat brim, blade, diamond, oval, spiral).
- **Color must contrast with background**: Desert/tan background requires saturated primaries for enemies. Earth-tone enemies blend in and create readability failures.
- **Facing indicators are critical**: The player needs to know which direction an enemy will attack from before the telegraph starts. A small directional element (eye dot, blade, scope line) on the idle enemy is essential.
- **Threat tier = visual intensity**: Threats (Deadeye) should have higher saturation, larger size, and an angular shape to signal "I'm different from the round fodder." The player learns to prioritize threats visually.
- **Universal color associations**: Red = danger/melee-aggression. Green = toxic/organic. Yellow = warning/hazard. These conventions are near-universal across games and transfer instantly to new players.
