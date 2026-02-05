# Sprint 2: Enemies & AI

## Goal

Add enemies to the arena that the player can fight. Enemies spawn in waves, use a finite state machine for behavior, fire projectiles the player must dodge, and die when hit by player bullets. This sprint builds the foundation for all future enemy content.

## Success Criteria

- [ ] Enemies spawn at room edges and approach the player
- [ ] Enemies telegraph attacks before firing
- [ ] Enemy bullets can damage the player (HP system)
- [ ] Player bullets kill enemies (health + death)
- [ ] Multiple enemy archetypes with distinct behaviors (grunt, shooter, charger)
- [ ] Wave spawner controls encounter pacing
- [ ] Enemies separate from each other (no stacking)
- [ ] All game logic in `packages/shared` (deterministic)
- [ ] Enemy sprites render with interpolation
- [ ] Camera shake on enemy death
- [ ] Debug overlay shows enemy count and wave info

## Singleplayer vs Multiplayer Notes

All enemy logic runs in `packages/shared` as deterministic ECS systems. This is critical:

**Singleplayer (now):** The shared sim runs directly on the client. Input → stepWorld → render. Enemies are local entities updated each tick.

**Multiplayer (future):** The same shared sim runs on the authoritative server. The server steps the world and emits events:
- `SpawnEnemy { id, archetype, posQ, seed }` — client creates the entity locally
- `Damage { targetId, amount, sourceId, serverTick }` — authoritative damage
- Enemy positions sync via snapshots at 10-20Hz; clients interpolate between snapshots

**What this means for Sprint 2:**
- Enemy AI systems take no external input (they read world state, not player input) — this is already server-compatible
- Enemy spawning is driven by world state (wave timer, enemy count), not client events
- The `spawnEnemy` prefab is a pure function on `GameWorld` — the server calls it identically
- Seeded RNG for spawn positions/timing ensures determinism for replays
- Collision layers (`PLAYER_BULLET` hits `ENEMY`, `ENEMY_BULLET` hits `PLAYER`) are already defined in `CollisionLayer`

**No multiplayer code is written in this sprint.** The architecture just ensures nothing prevents it later.

---

## Architecture

```
packages/shared/src/sim/
  components.ts          ← add Enemy, EnemyAI, Health, Detection, AttackConfig
  prefabs.ts             ← add spawnGrunt, spawnShooter, spawnCharger
  world.ts               ← add attackTokens, flowField to GameWorld
  content/
    enemies.ts           ← NEW: enemy type definitions and balance values
  systems/
    enemyDetection.ts    ← NEW: aggro, LOS, target selection
    enemyAI.ts           ← NEW: FSM state transitions
    enemySteering.ts     ← NEW: movement per-state (seek, flee, orbit, separation)
    enemyAttack.ts       ← NEW: telegraph/attack/recovery, projectile spawning
    health.ts            ← NEW: damage processing, death, i-frames
    waveSpawner.ts       ← NEW: wave timing, budget, spawn positioning
    flowField.ts         ← NEW: Dijkstra map from player position

packages/client/src/
  render/
    EnemyRenderer.ts     ← NEW: enemy sprite management
  scenes/
    GameScene.ts         ← register new systems, add EnemyRenderer
```

### System Execution Order (updated)

```
playerInputSystem         (existing — player input)
rollSystem                (existing — roll state)
weaponSystem              (existing — player weapon firing)
bulletSystem              (existing — bullet lifetime/distance)

waveSpawnerSystem         NEW — spawn enemies based on timer/budget
flowFieldSystem           NEW — recompute Dijkstra map if player moved cells
enemyDetectionSystem      NEW — aggro checks, LOS, target selection
enemyAISystem             NEW — FSM transitions
enemySteeringSystem       NEW — desired velocity per-state
enemyAttackSystem         NEW — telegraph/attack/recovery, spawn enemy bullets

movementSystem            (existing — applies velocity to ALL entities)
bulletCollisionSystem     (existing — bullets vs walls)
healthSystem              NEW — process damage, death, i-frames
collisionSystem           (existing — entity pushout)
```

---

## Phase 1: Health & Damage Foundation

**Goal:** Player and enemies can take damage and die. This must exist before anything else.

### Tasks

#### 1.1 Health Component (`shared/src/sim/components.ts`)
```typescript
const Health = {
  current: Float32Array,
  max: Float32Array,
  iframes: Float32Array,      // remaining invulnerability time (seconds)
  iframeDuration: Float32Array, // how long i-frames last when triggered
}
```

Add to `AllComponents` array.

#### 1.2 Health System (`shared/src/sim/systems/health.ts`)
```typescript
healthSystem(world, dt)
```
- Query entities with `Health`
- Decrement `iframes` timer by `dt`
- If `Health.current <= 0`: remove entity (`removeEntity`)
  - For player: set a `dead` flag on world (don't remove, just stop processing)
  - For enemies: remove entity + all components (reclaim entity ID)
- Clean up bullet collision callbacks for removed entities

#### 1.3 Bullet-Entity Collision (`shared/src/sim/systems/bulletCollision.ts`)
Extend the existing `bulletCollisionSystem`:
- Currently only checks bullet vs wall tiles
- Add: bullet vs entities (circle-circle check using `Collider.radius`)
- Check collision layers: `PLAYER_BULLET` only hits entities on `ENEMY` layer; `ENEMY_BULLET` only hits `PLAYER` layer
- On hit: reduce `Health.current` by `Bullet.damage`, trigger `Health.iframes`, remove bullet
- Skip if target has active i-frames (`Health.iframes > 0`)

#### 1.4 Player Health Setup
- Give the player a `Health` component in `spawnPlayer` prefab
- Content values: `PLAYER_HP = 5`, `PLAYER_IFRAME_DURATION = 0.5`
- Visual feedback for damage: brief red flash on player sprite (client-side)

#### 1.5 Death Handling
- Player death: freeze game, show simple "Game Over" state
  - Add `dead: boolean` flag to `GameWorld` interface
  - `GameScene` checks `world.dead` in update loop; skips sim when true
- Enemy death: remove entity, trigger camera shake (via event/callback)

### Deliverables
- Player has HP, takes damage from (future) enemy bullets
- Entities die when HP reaches 0
- I-frames prevent damage stacking
- Bullet-entity collision works with layer filtering

### How to Test
- Unit tests: bullet hitting entity reduces HP, i-frames prevent double-hit
- Manual: shoot player with debug-spawned enemy bullet (temporary test helper)

---

## Phase 2: Enemy Components & Prefabs

**Goal:** Define enemy data structures and create the first enemy type.

### Tasks

#### 2.1 Enemy Components (`shared/src/sim/components.ts`)
```typescript
const Enemy = {
  type: Uint8Array,      // EnemyType enum
  tier: Uint8Array,      // 0=normal, 1=elite
}

const EnemyAI = {
  state: Uint8Array,          // AIState enum
  stateTimer: Float32Array,   // time in current state
  targetEid: Uint16Array,     // entity being targeted
  initialDelay: Float32Array, // random delay before first attack
}

const Detection = {
  aggroRange: Float32Array,
  attackRange: Float32Array,
  losRequired: Uint8Array,    // 0 or 1
}

const AttackConfig = {
  telegraphDuration: Float32Array,
  recoveryDuration: Float32Array,
  cooldown: Float32Array,
  cooldownRemaining: Float32Array,
  damage: Uint8Array,
  projectileSpeed: Float32Array,
  projectileCount: Uint8Array,
  spreadAngle: Float32Array,  // radians, spread fan width
}

const Steering = {
  seekWeight: Float32Array,
  separationWeight: Float32Array,
  preferredRange: Float32Array,
  separationRadius: Float32Array,
}
```

Add all to `AllComponents`.

State and type enums:
```typescript
const AIState = {
  IDLE: 0, CHASE: 1, TELEGRAPH: 2,
  ATTACK: 3, RECOVERY: 4, STUNNED: 5, FLEE: 6,
} as const

const EnemyType = {
  GRUNT: 0, SHOOTER: 1, CHARGER: 2,
} as const
```

#### 2.2 Enemy Content Definitions (`shared/src/sim/content/enemies.ts`)
```typescript
// Grunt: slow, approaches, fires single shots
export const GRUNT_SPEED = 80            // px/s (~40% of player)
export const GRUNT_RADIUS = 10
export const GRUNT_HP = 3
export const GRUNT_AGGRO_RANGE = 300
export const GRUNT_ATTACK_RANGE = 200
export const GRUNT_TELEGRAPH = 0.4       // seconds
export const GRUNT_RECOVERY = 0.5
export const GRUNT_COOLDOWN = 2.0
export const GRUNT_DAMAGE = 1
export const GRUNT_BULLET_SPEED = 150    // ~25% of player bullet
export const GRUNT_SEPARATION_RADIUS = 24

// Shooter: maintains distance, fires spreads
export const SHOOTER_SPEED = 60
export const SHOOTER_RADIUS = 10
export const SHOOTER_HP = 3
export const SHOOTER_AGGRO_RANGE = 350
export const SHOOTER_ATTACK_RANGE = 250
export const SHOOTER_PREFERRED_RANGE = 200
export const SHOOTER_TELEGRAPH = 0.35
export const SHOOTER_RECOVERY = 0.6
export const SHOOTER_COOLDOWN = 2.5
export const SHOOTER_DAMAGE = 1
export const SHOOTER_BULLET_SPEED = 180
export const SHOOTER_BULLET_COUNT = 3
export const SHOOTER_SPREAD_ANGLE = 0.35 // ~20 degrees

// Charger: rushes player, contact damage
export const CHARGER_SPEED = 60           // normal walk
export const CHARGER_CHARGE_SPEED = 300   // during charge (~150% of player)
export const CHARGER_RADIUS = 12
export const CHARGER_HP = 5
export const CHARGER_AGGRO_RANGE = 250
export const CHARGER_ATTACK_RANGE = 150
export const CHARGER_TELEGRAPH = 0.5
export const CHARGER_RECOVERY = 0.8       // long punish window
export const CHARGER_COOLDOWN = 3.0
export const CHARGER_DAMAGE = 2
```

#### 2.3 Enemy Prefabs (`shared/src/sim/prefabs.ts`)
```typescript
function spawnGrunt(world, x, y): number
function spawnShooter(world, x, y): number
function spawnCharger(world, x, y): number
```

Each adds: `Position`, `Velocity`, `Speed`, `Collider`, `Health`, `Enemy`, `EnemyAI`, `Detection`, `AttackConfig`, `Steering`. Sets values from content definitions. Collision layer = `CollisionLayer.ENEMY`.

Also add `spawnEnemyBullet` — like `spawnBullet` but with `CollisionLayer.ENEMY_BULLET`.

### Deliverables
- All enemy components defined
- Content values for 3 archetypes
- Prefab functions create fully configured enemy entities

### How to Test
- Unit test: spawn a grunt, verify all component values are set correctly
- Spawn one manually in GameScene for visual verification

---

## Phase 3: Enemy AI Core (Detection + FSM + Steering)

**Goal:** Enemies detect the player and move toward them using an FSM.

### Tasks

#### 3.1 Flow Field System (`shared/src/sim/systems/flowField.ts`)
Add to `GameWorld`:
```typescript
interface FlowField {
  width: number
  height: number
  cellSize: number
  dirX: Float32Array
  dirY: Float32Array
  dist: Uint16Array
  playerCellX: number
  playerCellY: number
}
```

System: `flowFieldSystem(world, dt)`
- Find player entity position
- Compute which tilemap cell the player is in
- If cell hasn't changed since last computation, skip
- BFS from player cell, storing distance + direction to each reachable cell
- Store result on `world.flowField`

#### 3.2 Detection System (`shared/src/sim/systems/enemyDetection.ts`)
```typescript
enemyDetectionSystem(world, dt)
```
- Query all entities with `Enemy + Detection + Position`
- Find the player entity (query `Player + Position`)
- For each enemy:
  - Calculate distance to player
  - If distance < `aggroRange` (and LOS check passes if `losRequired`):
    - Set `EnemyAI.targetEid` to player entity
  - If distance > `aggroRange * 2.0` (hysteresis):
    - Clear target

**LOS check:** Bresenham line from enemy to player against `world.tilemap`. If any solid tile blocks the line, LOS fails. Run LOS checks every 5 ticks (amortized).

#### 3.3 AI State Machine System (`shared/src/sim/systems/enemyAI.ts`)
```typescript
enemyAISystem(world, dt)
```
- Query entities with `EnemyAI + Enemy + Detection + Position`
- Increment `stateTimer` by `dt`
- Switch on `EnemyAI.state`:

| State | Logic |
|-------|-------|
| IDLE | If `targetEid` set → CHASE |
| CHASE | If in `attackRange` and `cooldownRemaining <= 0` → TELEGRAPH. If target lost → IDLE |
| TELEGRAPH | If `stateTimer >= telegraphDuration` → ATTACK |
| ATTACK | Execute attack (handled by enemyAttackSystem), → RECOVERY |
| RECOVERY | If `stateTimer >= recoveryDuration` → CHASE. Reset `cooldownRemaining` |
| STUNNED | If `stateTimer >= 0.2` → CHASE |

State transitions reset `stateTimer` to 0.

#### 3.4 Steering System (`shared/src/sim/systems/enemySteering.ts`)
```typescript
enemySteeringSystem(world, dt)
```
- Query entities with `EnemyAI + Steering + Position + Velocity + Speed`
- Behavior per state:
  - **IDLE:** Velocity = 0
  - **CHASE:** Seek player (via flow field if available, else direct). Apply separation from other enemies.
  - **TELEGRAPH:** Velocity = 0 (freeze in place during wind-up)
  - **ATTACK:** Velocity = 0 (or charge direction for chargers)
  - **RECOVERY:** Velocity = 0
  - **STUNNED:** Velocity = 0
  - **FLEE:** Direction away from player + separation

**Separation:** For each enemy, check nearby enemies within `separationRadius`. Push away from each with inverse-distance weighting. This prevents stacking.

**Charger special case:** In ATTACK state, set velocity to charge direction × `CHARGER_CHARGE_SPEED`. Direction is locked at the moment of entering TELEGRAPH (aim at player's position at that instant, not tracking).

### Deliverables
- Enemies detect the player and chase
- FSM drives behavior through states
- Enemies navigate around obstacles via flow field
- Enemies don't stack on top of each other
- Chargers rush in a locked direction

### How to Test
- Spawn 5 grunts; verify they approach the player
- Walk behind a wall; verify enemies navigate around it
- Verify enemies don't pile into a single pixel
- Spawn a charger; verify it locks direction and charges

---

## Phase 4: Enemy Attacks

**Goal:** Enemies fire projectiles at the player. Attacks are telegraphed.

### Tasks

#### 4.1 Attack Token System
Add to `GameWorld`:
```typescript
attackTokens: number      // currently available
maxAttackTokens: number   // cap (default 3)
```

Enemies claim a token when entering TELEGRAPH, release when leaving RECOVERY. If no tokens are available, the enemy stays in CHASE and repositions.

#### 4.2 Enemy Attack System (`shared/src/sim/systems/enemyAttack.ts`)
```typescript
enemyAttackSystem(world, dt)
```
- Query entities with `EnemyAI + AttackConfig + Position` where `state === ATTACK`
- On entering ATTACK state:
  - Spawn enemy bullet(s) aimed at player
  - Use `spawnEnemyBullet` with `CollisionLayer.ENEMY_BULLET`
  - Bullet count and spread from `AttackConfig`
  - Immediately transition to RECOVERY
- Decrement `cooldownRemaining` for all enemies each tick

**Grunt attack:** 1 bullet aimed at player's current position.

**Shooter attack:** 3 bullets in a spread fan centered on player direction.

**Charger attack:** No projectile — contact damage instead. The charger's ATTACK state sets high velocity toward the player's position at telegraph-start. If the charger's collider overlaps the player during charge, deal damage (checked in the health system via entity-entity collision).

#### 4.3 Initial Attack Delay
Each enemy gets a random `initialDelay` (0.3-1.0s) set at spawn. The enemy cannot transition from CHASE → TELEGRAPH until this delay has elapsed. This prevents all enemies from firing simultaneously when a room starts.

#### 4.4 Entity-Entity Damage Collision
Add to the collision system or health system:
- Chargers in ATTACK state: if charger collider overlaps player collider, deal `AttackConfig.damage` to player
- Check collision layers: `ENEMY` layer entity in ATTACK state vs `PLAYER` layer entity
- Apply player i-frames after hit

### Deliverables
- Grunts fire single bullets at the player
- Shooters fire 3-bullet spreads
- Chargers rush and deal contact damage
- Attack tokens limit simultaneous attackers
- Initial delay staggers first attacks
- All attacks are telegraphed (freeze + visual cue)

### How to Test
- Stand still; verify grunt fires a single bullet after telegraph
- Verify shooter spread fans out at correct angle
- Verify charger locks direction and deals damage on contact
- Spawn 6+ enemies; verify only 3 attack at once
- Verify first attacks are staggered (not simultaneous)

---

## Phase 5: Wave Spawner

**Goal:** Enemies spawn in controlled waves, creating encounter pacing.

### Tasks

#### 5.1 Wave Definitions (`shared/src/sim/content/waves.ts`)
```typescript
interface WaveEntry {
  type: number       // EnemyType
  count: number
}

interface WaveDefinition {
  entries: WaveEntry[]
  spawnDelay: number  // seconds before wave starts after previous clears
}

interface EncounterDefinition {
  waves: WaveDefinition[]
}
```

Create several test encounters:
- **Easy:** Wave 1: 3 grunts. Wave 2: 2 grunts + 1 shooter.
- **Medium:** Wave 1: 4 grunts. Wave 2: 2 shooters + 1 charger. Wave 3: 3 grunts + 2 shooters.
- **Hard:** Wave 1: 2 chargers + 2 grunts. Wave 2: 3 shooters + 2 grunts. Wave 3: 2 chargers + 2 shooters + 2 grunts.

#### 5.2 Wave Spawner System (`shared/src/sim/systems/waveSpawner.ts`)
Add to `GameWorld`:
```typescript
encounter: {
  definition: EncounterDefinition | null
  currentWave: number
  waveTimer: number
  waveActive: boolean
  completed: boolean
} | null
```

System: `waveSpawnerSystem(world, dt)`
- If no active encounter, skip
- If wave active: check if all enemies from current wave are dead (query `Enemy` count === 0)
  - If cleared: increment `currentWave`, start `spawnDelay` timer
  - If all waves cleared: set `completed = true`
- If in delay: decrement timer; when expired, spawn next wave
- Spawn enemies at valid positions:
  - Pick random positions along room edges (not within `SPAWN_MIN_DISTANCE` of player)
  - Use world RNG seed for deterministic spawn positions

#### 5.3 Spawn Positioning
- Enemies spawn at room edges (1-2 tiles from walls)
- Minimum distance from player: 200px
- Spawn in a brief "materializing" state: enemy exists but is invulnerable and doesn't attack for 0.5s
  - Use `initialDelay` in `EnemyAI` for this grace period
  - Optionally add brief i-frames on spawn via `Health.iframes`

#### 5.4 GameScene Integration
- `GameScene.create` starts an encounter (e.g., the "Medium" encounter for testing)
- Add `setEncounter(world, definition)` function to shared

### Deliverables
- Waves spawn in sequence
- New wave appears after previous is cleared (with delay)
- Enemies spawn at room edges, not on top of player
- Encounter completes when all waves are defeated

### How to Test
- Start game; verify Wave 1 spawns
- Kill all Wave 1 enemies; verify brief delay then Wave 2 spawns
- Complete all waves; verify encounter completes
- Verify no enemies spawn on top of player

---

## Phase 6: Enemy Rendering

**Goal:** Enemies render as sprites with visual feedback for AI states.

### Tasks

#### 6.1 Enemy Sprites (Assets)
- Add enemy placeholder sprites to the asset pipeline
- Minimum: one sprite per enemy type (can be colored shapes initially)
- Grunt: small circle or simple sprite, warm color (red/orange)
- Shooter: similar size, different color (purple)
- Charger: slightly larger, bold color (dark red)

#### 6.2 Enemy Renderer (`client/src/render/EnemyRenderer.ts`)
```typescript
class EnemyRenderer {
  sync(world: GameWorld): void    // create/remove sprites
  render(world: GameWorld, alpha: number): void  // update positions + visuals
}
```

- Create sprites for new `Enemy` entities
- Remove sprites for dead entities
- Interpolate position between `prevX/prevY` and `x/y`
- Visual feedback by AI state:
  - IDLE/CHASE: normal appearance
  - TELEGRAPH: flash white/bright, freeze in place (signals incoming attack)
  - ATTACK: attack animation or lunge
  - RECOVERY: dim/dazed appearance
  - STUNNED: brief flash
- Charger during ATTACK: stretch sprite in charge direction (squash & stretch)
- Damage flash: briefly tint red when taking damage

#### 6.3 GameScene Integration
- Add `EnemyRenderer` to `GameScene`
- Call `sync` and `render` alongside existing player/bullet renderers
- Camera shake on enemy death (small, 0.05 trauma)

#### 6.4 Debug Overlay Updates
Expand `DebugStats` with:
```typescript
enemyCount: number
waveNumber: number
waveStatus: string  // "active" | "delay" | "completed"
attackTokensUsed: number
```

### Deliverables
- Enemies are visible as sprites
- Visual telegraph clearly warns of incoming attack
- Damage and death have visual feedback
- Camera reacts to enemy deaths
- Debug overlay shows enemy/wave info

### How to Test
- Enemies appear as colored sprites
- Telegraph flash is clearly visible before attack
- Killing an enemy triggers camera shake
- Debug overlay shows wave progression

---

## Phase 7: Polish & Tuning

**Goal:** Make combat feel good through tuning and edge-case fixes.

### Tasks

#### 7.1 Camera Juice
- Screen shake on player taking damage (0.15 trauma)
- Screen shake on enemy death (0.05 trauma)
- Hit stop on player taking damage (0.05s freeze)
- Camera kick when player is hit (toward damage source direction)

#### 7.2 Combat Tuning Pass
Play through encounters and tune:
- Enemy speeds (too fast = unfair, too slow = boring)
- Telegraph durations (too long = no threat, too short = unfair)
- Bullet speeds (must be dodgeable on reaction)
- Attack cooldowns (pacing between attacks)
- Wave composition (difficulty curve)
- Separation radius (visual clarity)
- Number of attack tokens (simultaneous pressure)

#### 7.3 Edge Cases
- Enemy spawning when player is near a wall
- Multiple chargers charging simultaneously
- Player dying mid-wave
- All enemies dying in one frame (AoE/piercing future-proofing)
- Alt-tab during active encounter (spiral-of-death protection already exists)

#### 7.4 Test Coverage
- Unit tests for all new shared systems:
  - `healthSystem`: damage, i-frames, death
  - `enemyAISystem`: state transitions
  - `enemyAttackSystem`: bullet spawning, token claiming
  - `waveSpawnerSystem`: wave progression
  - `flowFieldSystem`: pathfinding correctness
  - `enemyDetectionSystem`: aggro, LOS
- Integration test: spawn enemy + player, verify full combat loop

### Deliverables
- Combat feels responsive and fair
- All edge cases handled
- Test coverage for shared systems
- Tuned balance values

### How to Test
- Play through all encounter types
- Try to find unfair deaths (no telegraph, instant damage)
- Verify enemies don't get stuck on walls
- Run `bun test` — all tests pass
- Run `bun run typecheck` and `bun run build` — clean

---

## Implementation Order

| Phase | Files | Risk | Rationale |
|-------|-------|------|-----------|
| 1 | components, health system, bulletCollision extension | Medium | Foundation — everything depends on damage working |
| 2 | components, content/enemies, prefabs | Low | Additive data definitions |
| 3 | flowField, detection, AI, steering systems | High | Core AI loop — most complex phase |
| 4 | attack system, attack tokens, entity-entity collision | Medium | Depends on AI states working |
| 5 | wave spawner, encounter definitions | Low | Orchestration layer on top of working AI |
| 6 | EnemyRenderer, GameScene updates, debug overlay | Low | Client-only rendering |
| 7 | Tuning, juice, tests | Low | Polish pass |

---

## Verification

```bash
bun test             # All shared system tests pass
bun run typecheck    # Clean across all packages
bun run build        # Builds successfully
bun run dev          # Game runs with enemies
```

Manual testing checklist:
1. Game loads; enemies spawn after brief delay
2. Enemies approach the player
3. Enemies telegraph before attacking (visible flash/pause)
4. Enemy bullets travel toward player; player takes damage on hit
5. Player i-frames prevent damage stacking
6. Player bullets kill enemies; enemies disappear
7. Camera shakes on enemy death and player damage
8. Wave 2 spawns after Wave 1 is cleared
9. Encounter completes when all waves are defeated
10. Player death shows game over state
11. Enemies navigate around obstacles (not stuck on walls)
12. Enemies don't stack on each other
13. Max 3 enemies attack simultaneously
14. Chargers lock direction and rush; deal contact damage
15. Shooters fire spread patterns
16. Debug overlay shows enemy count, wave, attack tokens
17. No crashes on rapid input, resize, alt-tab

---

## Task Checklist

### Phase 1: Health & Damage Foundation
- [ ] 1.1 Health component
- [ ] 1.2 Health system
- [ ] 1.3 Bullet-entity collision
- [ ] 1.4 Player health setup
- [ ] 1.5 Death handling

### Phase 2: Enemy Components & Prefabs
- [ ] 2.1 Enemy components (Enemy, EnemyAI, Detection, AttackConfig, Steering)
- [ ] 2.2 Enemy content definitions
- [ ] 2.3 Enemy prefabs (grunt, shooter, charger)

### Phase 3: Enemy AI Core
- [ ] 3.1 Flow field system
- [ ] 3.2 Detection system
- [ ] 3.3 AI state machine system
- [ ] 3.4 Steering system (seek, flee, separation, charger charge)

### Phase 4: Enemy Attacks
- [ ] 4.1 Attack token system
- [ ] 4.2 Enemy attack system (projectile spawning)
- [ ] 4.3 Initial attack delay (staggered first shots)
- [ ] 4.4 Entity-entity damage collision (charger contact damage)

### Phase 5: Wave Spawner
- [ ] 5.1 Wave/encounter definitions
- [ ] 5.2 Wave spawner system
- [ ] 5.3 Spawn positioning (room edges, min distance)
- [ ] 5.4 GameScene integration

### Phase 6: Enemy Rendering
- [ ] 6.1 Enemy sprites/assets
- [ ] 6.2 Enemy renderer (interpolation + state visuals)
- [ ] 6.3 GameScene integration (renderer + camera effects)
- [ ] 6.4 Debug overlay updates

### Phase 7: Polish & Tuning
- [ ] 7.1 Camera juice (damage shake, death shake, hit stop)
- [ ] 7.2 Combat tuning pass
- [ ] 7.3 Edge case handling
- [ ] 7.4 Test coverage

---

## Dependencies Between Phases

```
Phase 1 (Health & Damage)
    │
    ▼
Phase 2 (Enemy Components & Prefabs)
    │
    ▼
Phase 3 (AI Core: Detection + FSM + Steering)
    │
    ▼
Phase 4 (Enemy Attacks)
    │
    ▼
Phase 5 (Wave Spawner)
    │
    ▼
Phase 6 (Enemy Rendering)
    │
    ▼
Phase 7 (Polish & Tuning)
```

Each phase builds on the previous and is independently testable.

---

## Out of Scope (Future Sprints)

- Boss enemies (multi-phase, scripted patterns)
- Elite/champion variants
- Enemy drops (health, ammo, upgrades)
- Damage numbers / hit indicators
- Enemy health bars
- Multiple room types / room transitions
- Seeded RNG for deterministic spawns (needed for replays/multiplayer, but not for singleplayer demo)
- Sound effects for enemies
- Particle effects (death explosions, bullet trails)
- Multiplayer networking (server, prediction, interpolation)

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Flow field complexity | Medium | Start with direct seek; add flow field only if enemies get stuck |
| AI state machine bugs | High | Thorough unit tests for each transition |
| Enemy stacking | Medium | Separation force in steering; test with 10+ enemies |
| Attack token starvation | Low | Fallback: enemies without tokens still reposition, not frozen |
| Bullet-entity collision perf | Low | Simple circle-circle check; spatial hash only if >50 entities |
| Charger feels unfair | Medium | Long telegraph (0.5s), long recovery (0.8s), clear visual |
| Wave pacing feels off | Low | Tunable delays and budgets; easy to iterate |
| Component count growth | Low | bitECS handles many components well; keep SoA arrays |

---

## File Structure After Sprint

```
packages/shared/src/sim/
  components.ts          # +Enemy, EnemyAI, Health, Detection, AttackConfig, Steering
  prefabs.ts             # +spawnGrunt, spawnShooter, spawnCharger, spawnEnemyBullet
  world.ts               # +flowField, attackTokens, encounter, dead flag
  content/
    player.ts
    weapons.ts
    enemies.ts           # NEW
    waves.ts             # NEW
    maps/
      testArena.ts
  systems/
    movement.ts
    collision.ts
    playerInput.ts
    roll.ts
    weapon.ts
    bullet.ts
    bulletCollision.ts   # extended for entity collision
    health.ts            # NEW
    enemyDetection.ts    # NEW
    enemyAI.ts           # NEW
    enemySteering.ts     # NEW
    enemyAttack.ts       # NEW
    waveSpawner.ts       # NEW
    flowField.ts         # NEW
    index.ts

packages/client/src/
  render/
    EnemyRenderer.ts     # NEW
  scenes/
    GameScene.ts         # updated
```
