# Sprint 2: Enemies & AI

## Goal

Add enemies to the arena that the player can fight. Enemies spawn in escalating blended waves via a Director-Wave hybrid system: every wave contains a mix of disposable **fodder** (Swarmers, Grunts) and dangerous **threats** (Shooters, Chargers) that coexist on screen. The player mows through fodder with AoE while focus-firing threats. Bullet hell emerges organically from fodder volume. This sprint builds the foundation for all future enemy content.

## Success Criteria

- [ ] Enemies spawn from contextual map-edge points (doors, alleys, edges)
- [ ] Two enemy tiers: **fodder** (Swarmers, Grunts) and **threats** (Shooters, Chargers)
- [ ] Fodder spawns continuously within a wave and reinforces when killed
- [ ] Threats spawn at wave start and don't reinforce — killing them is permanent progress
- [ ] Enemies telegraph attacks before firing
- [ ] Enemy bullets can damage the player (HP system)
- [ ] Player bullets kill enemies (health + death)
- [ ] Bullet hell density scales with enemy count (slow fodder bullets, fast threat bullets)
- [ ] Wave escalation: each wave increases fodder + threat budgets
- [ ] Enemies separate from each other (no stacking)
- [ ] All game logic in `packages/shared` (deterministic)
- [ ] Enemy sprites render with interpolation
- [ ] Camera shake on enemy death
- [ ] Debug overlay shows enemy count, wave info, and active projectile count

## Singleplayer vs Multiplayer Notes

All enemy logic runs in `packages/shared` as deterministic ECS systems. This is critical:

**Singleplayer (now):** The shared sim runs directly on the client. Input → stepWorld → render. Enemies are local entities updated each tick.

**Multiplayer (future):** The same shared sim runs on the authoritative server. The server steps the world and emits events:

- `SpawnEnemy { id, archetype, posQ, seed }` — client creates the entity locally
- `Damage { targetId, amount, sourceId, serverTick }` — authoritative damage
- Enemy positions sync via snapshots at 10-20Hz; clients interpolate between snapshots

**What this means for Sprint 2:**

- Enemy AI systems take no external input (they read world state, not player input) — this is already server-compatible
- Enemy spawning is driven by world state (wave timer, enemy count, budgets), not client events
- The `spawnEnemy` prefab is a pure function on `GameWorld` — the server calls it identically
- Seeded RNG for spawn positions/timing ensures determinism for replays
- Collision layers (`PLAYER_BULLET` hits `ENEMY`, `ENEMY_BULLET` hits `PLAYER`) are already defined in `CollisionLayer`
- The Director-Wave system runs identically in shared — budgets, wave transitions, and spawn timing are pure world state

**Multiplayer scaling (future, not implemented now):**

- Fodder budget `× 1 + 0.3 × (playerCount - 1)`
- Threat budget `× 1 + 0.5 × (playerCount - 1)` (more threats since multiple players split focus)
- Attack tokens: `maxAttackTokens = 2 + playerCount`
- Projectile cap scales: `80 + 20 × playerCount`

**No multiplayer code is written in this sprint.** The architecture just ensures nothing prevents it later.

---

## Architecture

```
packages/shared/src/sim/
  components.ts          ← add Enemy, EnemyAI, Health, Detection, AttackConfig
  prefabs.ts             ← add spawnSwarmer, spawnGrunt, spawnShooter, spawnCharger
  world.ts               ← add attackTokens, flowField, encounter director state
  content/
    enemies.ts           ← NEW: enemy type definitions, tier classifications
    waves.ts             ← NEW: wave definitions with dual budgets (fodder + threat)
  systems/
    enemyDetection.ts    ← NEW: aggro, LOS, target selection
    enemyAI.ts           ← NEW: FSM state transitions
    enemySteering.ts     ← NEW: movement per-state (seek, flee, orbit, separation)
    enemyAttack.ts       ← NEW: telegraph/attack/recovery, projectile spawning
    health.ts            ← NEW: damage processing, death, i-frames
    waveSpawner.ts       ← NEW: Director-Wave system, dual budgets, reinforcement
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

waveSpawnerSystem         NEW — Director: spawn fodder+threats based on wave budget
flowFieldSystem           NEW — recompute Dijkstra map if player moved cells
enemyDetectionSystem      NEW — aggro checks, LOS, target selection
enemyAISystem             NEW — FSM transitions
enemySteeringSystem       NEW — desired velocity per-state
enemyAttackSystem         NEW — telegraph/attack/recovery, spawn enemy bullets

movementSystem            (existing — applies velocity to ALL entities)
bulletCollisionSystem     (existing — bullets vs walls, extended for entity hits)
healthSystem              NEW — process damage, death, i-frames
collisionSystem           (existing — entity pushout)
```

---

## Rendering Philosophy

**Every phase is visually testable.** EnemyRenderer is created in Phase 2 (basic colored shapes) and extended in each subsequent phase as new behaviors come online. Debug overlay grows alongside. This mirrors Sprint 1's approach — never go more than one phase without being able to see what you built.

```
Phase 1: Player HP bar + damage flash + "Game Over" text
Phase 2: EnemyRenderer created — colored circles on screen, debug shows enemy count
Phase 3: Enemies visibly chase player, separation visible, debug shows AI states
Phase 4: Telegraph flash, enemy bullets visible, attack tokens in debug
Phase 5: Waves spawning visibly, reinforcement visible, wave/budget in debug
Phase 6: Final polish — juice, tuning, edge cases, tests
```

---

## Phase 1: Health & Damage Foundation

**Goal:** Player and enemies can take damage and die. Player HP is visible on screen.

### Tasks

#### 1.1 Health Component (`shared/src/sim/components.ts`)

```typescript
const Health = {
  current: Float32Array,
  max: Float32Array,
  iframes: Float32Array, // remaining invulnerability time (seconds)
  iframeDuration: Float32Array, // how long i-frames last when triggered
};
```

Add to `AllComponents` array.

#### 1.2 Health System (`shared/src/sim/systems/health.ts`)

```typescript
healthSystem(world, dt);
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

#### 1.5 Death Handling

- Player death: freeze game, show simple "Game Over" state
  - `Dead` tag component (per-entity, multiplayer-safe) instead of world-level flag
  - `GameScene` checks `hasComponent(world, Dead, playerEid)` in update loop; skips sim when true

#### 1.6 Player Health Rendering (client)

- **Player damage flash:** Brief red tint on player sprite when `Health.iframes` activates (client-side, in `PlayerRenderer`)
- **Player HP in debug overlay:** Add `playerHP` and `playerMaxHP` to `DebugStats`
- **"Game Over" text:** Simple PixiJS `Text` shown when local player has `Dead` component (in `GameScene.render`)

### Deliverables

- Player has HP, takes damage from (future) enemy bullets
- Entities die when HP reaches 0
- I-frames prevent damage stacking
- Bullet-entity collision works with layer filtering
- Player HP visible in debug overlay
- Damage flash visible on player sprite
- "Game Over" text appears on player death

### How to Test

- Unit tests: bullet hitting entity reduces HP, i-frames prevent double-hit
- **Manual visual:** Debug-spawn an enemy bullet aimed at player → see HP drop in overlay, red flash on sprite, "Game Over" on death

---

## Phase 2: Enemy Components, Prefabs & Basic Rendering

**Goal:** Define enemy data structures, create four enemy types, and render them as colored shapes. At the end of this phase you can see enemies standing in the arena.

### Enemy Tier Design

Every wave blends two layers that coexist on screen:

**Fodder tier** — Cheap, disposable, dies fast. Creates bullet hell through volume. AoE chews through them. They're the popcorn — constant, satisfying kills.

- **Swarmer:** 1 HP, rushes player, fires slow single bullets. Cheapest unit (budget cost 1).
- **Grunt:** 3 HP, approaches, fires single aimed shots. Slightly tougher fodder (budget cost 2).

**Threat tier** — Fewer, mechanically demanding. Each one requires the player's focused attention. They're the priority targets.

- **Shooter:** 3 HP, maintains distance, fires 3-bullet spreads. Forces dodging (budget cost 3).
- **Charger:** 5 HP, rushes player with a telegraphed charge, contact damage. Punishes stationary play (budget cost 3).

### Tasks

#### 2.1 Enemy Components (`shared/src/sim/components.ts`)

```typescript
const Enemy = {
  type: Uint8Array, // EnemyType enum
  tier: Uint8Array, // EnemyTier enum: 0=fodder, 1=threat
};

const EnemyAI = {
  state: Uint8Array, // AIState enum
  stateTimer: Float32Array, // time in current state
  targetEid: Uint16Array, // entity being targeted
  initialDelay: Float32Array, // random delay before first attack
};

const Detection = {
  aggroRange: Float32Array,
  attackRange: Float32Array,
  losRequired: Uint8Array, // 0 or 1
};

const AttackConfig = {
  telegraphDuration: Float32Array,
  recoveryDuration: Float32Array,
  cooldown: Float32Array,
  cooldownRemaining: Float32Array,
  damage: Uint8Array,
  projectileSpeed: Float32Array,
  projectileCount: Uint8Array,
  spreadAngle: Float32Array, // radians, spread fan width
};

const Steering = {
  seekWeight: Float32Array,
  separationWeight: Float32Array,
  preferredRange: Float32Array,
  separationRadius: Float32Array,
};
```

Add all to `AllComponents`.

State, type, and tier enums:

```typescript
const AIState = {
  IDLE: 0,
  CHASE: 1,
  TELEGRAPH: 2,
  ATTACK: 3,
  RECOVERY: 4,
  STUNNED: 5,
  FLEE: 6,
} as const;

const EnemyType = {
  SWARMER: 0,
  GRUNT: 1,
  SHOOTER: 2,
  CHARGER: 3,
} as const;

const EnemyTier = {
  FODDER: 0,
  THREAT: 1,
} as const;
```

#### 2.2 Enemy Content Definitions (`shared/src/sim/content/enemies.ts`)

**Swarmer (fodder, cost 1):** Cheapest unit. Rushes player, fires weak slow bullets. Dies in 1 hit. The popcorn enemy.

```typescript
export const SWARMER_SPEED = 100; // px/s (~50% of player)
export const SWARMER_RADIUS = 8;
export const SWARMER_HP = 1;
export const SWARMER_AGGRO_RANGE = 400; // wide — always aware
export const SWARMER_ATTACK_RANGE = 150;
export const SWARMER_TELEGRAPH = 0.2; // very short — they're weak
export const SWARMER_RECOVERY = 0.3;
export const SWARMER_COOLDOWN = 1.5;
export const SWARMER_DAMAGE = 1;
export const SWARMER_BULLET_SPEED = 100; // slow — dodgeable, but many of them
export const SWARMER_SEPARATION_RADIUS = 16;
export const SWARMER_BUDGET_COST = 1;
export const SWARMER_TIER = EnemyTier.FODDER;
```

**Grunt (fodder, cost 2):** Tougher fodder. Approaches, fires aimed single shots.

```typescript
export const GRUNT_SPEED = 80; // px/s (~40% of player)
export const GRUNT_RADIUS = 10;
export const GRUNT_HP = 3;
export const GRUNT_AGGRO_RANGE = 300;
export const GRUNT_ATTACK_RANGE = 200;
export const GRUNT_TELEGRAPH = 0.4;
export const GRUNT_RECOVERY = 0.5;
export const GRUNT_COOLDOWN = 2.0;
export const GRUNT_DAMAGE = 1;
export const GRUNT_BULLET_SPEED = 150; // moderate
export const GRUNT_SEPARATION_RADIUS = 24;
export const GRUNT_BUDGET_COST = 2;
export const GRUNT_TIER = EnemyTier.FODDER;
```

**Shooter (threat, cost 3):** Maintains distance, fires spreads. Forces dodging.

```typescript
export const SHOOTER_SPEED = 60;
export const SHOOTER_RADIUS = 10;
export const SHOOTER_HP = 3;
export const SHOOTER_AGGRO_RANGE = 350;
export const SHOOTER_ATTACK_RANGE = 250;
export const SHOOTER_PREFERRED_RANGE = 200;
export const SHOOTER_TELEGRAPH = 0.35;
export const SHOOTER_RECOVERY = 0.6;
export const SHOOTER_COOLDOWN = 2.5;
export const SHOOTER_DAMAGE = 1;
export const SHOOTER_BULLET_SPEED = 180; // faster — dangerous
export const SHOOTER_BULLET_COUNT = 3;
export const SHOOTER_SPREAD_ANGLE = 0.35; // ~20 degrees
export const SHOOTER_BUDGET_COST = 3;
export const SHOOTER_TIER = EnemyTier.THREAT;
```

**Charger (threat, cost 3):** Rushes player, contact damage. Long telegraph, long recovery.

```typescript
export const CHARGER_SPEED = 60;
export const CHARGER_CHARGE_SPEED = 300; // ~150% of player
export const CHARGER_RADIUS = 12;
export const CHARGER_HP = 5;
export const CHARGER_AGGRO_RANGE = 250;
export const CHARGER_ATTACK_RANGE = 150;
export const CHARGER_TELEGRAPH = 0.5;
export const CHARGER_RECOVERY = 0.8; // long punish window
export const CHARGER_COOLDOWN = 3.0;
export const CHARGER_DAMAGE = 2;
export const CHARGER_BUDGET_COST = 3;
export const CHARGER_TIER = EnemyTier.THREAT;
```

#### 2.3 Enemy Prefabs (`shared/src/sim/prefabs.ts`)

```typescript
function spawnSwarmer(world, x, y): number;
function spawnGrunt(world, x, y): number;
function spawnShooter(world, x, y): number;
function spawnCharger(world, x, y): number;
```

Each adds: `Position`, `Velocity`, `Speed`, `Collider`, `Health`, `Enemy` (with `tier`), `EnemyAI`, `Detection`, `AttackConfig`, `Steering`. Sets values from content definitions. Collision layer = `CollisionLayer.ENEMY`.

Also add `spawnEnemyBullet` — like `spawnBullet` but with `CollisionLayer.ENEMY_BULLET`.

#### 2.4 EnemyRenderer — Basic Version (`client/src/render/EnemyRenderer.ts`)

```typescript
class EnemyRenderer {
  sync(world: GameWorld): void; // create/remove sprites for Enemy entities
  render(world: GameWorld, alpha: number): void; // interpolate positions
}
```

Initial version — colored circles (PixiJS `Graphics`) per enemy type:

- **Swarmer:** Small circle (radius 8), pale red/pink — visually cheap
- **Grunt:** Medium circle (radius 10), red/orange
- **Shooter:** Medium circle (radius 10), purple — signals ranged danger
- **Charger:** Larger circle (radius 12), dark red — signals heavy

`sync()` creates/removes sprites when entities appear/disappear. `render()` interpolates position between `prevX/prevY` and `x/y`.

No state visuals yet — just position and type-based color. State visuals come in Phase 3-4.

#### 2.5 GameScene Integration

- Add `EnemyRenderer` to `GameScene`
- Call `sync` and `render` alongside existing player/bullet renderers
- Add `enemyCount` to `DebugStats`
- Hard-spawn a few test enemies in `GameScene.create` (temporary, replaced by wave spawner in Phase 5)

### Deliverables

- All enemy components defined with tier classification
- Content values for 4 archetypes across 2 tiers
- Prefab functions create fully configured enemy entities
- **Enemies appear as colored circles on screen**
- Debug overlay shows enemy count
- Player can shoot and kill enemies (health system from Phase 1)

### How to Test

- Unit test: spawn each type, verify all component values and tier are set correctly
- **Manual visual:** Start game → see colored circles in the arena. Shoot them → they die and disappear. Swarmer dies in 1 hit, Charger takes 5 hits.

---

## Phase 3: Enemy AI Core (Detection + FSM + Steering)

**Goal:** Enemies detect the player and move toward them using an FSM. You can see enemies chasing you around the arena.

### Tasks

#### 3.1 Flow Field System (`shared/src/sim/systems/flowField.ts`)

Add to `GameWorld`:

```typescript
interface FlowField {
  width: number;
  height: number;
  cellSize: number;
  dirX: Float32Array;
  dirY: Float32Array;
  dist: Uint16Array;
  playerCellX: number;
  playerCellY: number;
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
enemyDetectionSystem(world, dt);
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
enemyAISystem(world, dt);
```

- Query entities with `EnemyAI + Enemy + Detection + Position`
- Increment `stateTimer` by `dt`
- Switch on `EnemyAI.state`:

| State     | Logic                                                                               |
| --------- | ----------------------------------------------------------------------------------- |
| IDLE      | If `targetEid` set → CHASE                                                          |
| CHASE     | If in `attackRange` and `cooldownRemaining <= 0` → TELEGRAPH. If target lost → IDLE |
| TELEGRAPH | If `stateTimer >= telegraphDuration` → ATTACK                                       |
| ATTACK    | Execute attack (handled by enemyAttackSystem), → RECOVERY                           |
| RECOVERY  | If `stateTimer >= recoveryDuration` → CHASE. Reset `cooldownRemaining`              |
| STUNNED   | If `stateTimer >= 0.2` → CHASE                                                      |

State transitions reset `stateTimer` to 0.

**Tier-specific behavior:** Fodder enemies have shorter telegraphs and recoveries — they cycle faster, creating a constant stream of slow bullets. Threats have longer, more readable telegraphs — each attack is a moment the player must respect.

#### 3.4 Steering System (`shared/src/sim/systems/enemySteering.ts`)

```typescript
enemySteeringSystem(world, dt);
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

**Separation:** For each enemy, check nearby enemies within `separationRadius`. Push away from each with inverse-distance weighting. This prevents stacking. Fodder has tighter separation radius (they're meant to cluster more).

**Charger special case:** In ATTACK state, set velocity to charge direction × `CHARGER_CHARGE_SPEED`. Direction is locked at the moment of entering TELEGRAPH (aim at player's position at that instant, not tracking).

#### 3.5 EnemyRenderer — AI State Visuals

Extend `EnemyRenderer.render()` to show AI state:

- **IDLE:** Normal color, no movement
- **CHASE:** Normal color, moving toward player (already visible from position interpolation)
- **TELEGRAPH:** Flash white/bright — pulsing tint. This is the "incoming attack" warning.
- **RECOVERY:** Dim/desaturated tint — enemy is vulnerable
- **STUNNED:** Brief flash
- **Threat distinction:** Threat-tier enemies render with a subtle outline or larger size — even at this colored-circle stage, the player should subconsciously distinguish fodder from threats

#### 3.6 Debug Overlay Updates

Add to `DebugStats`:

```typescript
enemyStates: string; // e.g., "IDLE:2 CHASE:5 TELEGRAPH:1 ATTACK:0"
```

### Deliverables

- Enemies detect the player and chase
- FSM drives behavior through states
- Enemies navigate around obstacles via flow field
- Enemies don't stack on top of each other
- Chargers rush in a locked direction
- **AI states are visually distinguishable** (telegraph flash, recovery dim)
- Debug overlay shows AI state distribution

### How to Test

- **Manual visual:** Start game → enemies chase you around the arena. Walk behind a wall → they navigate around it. They don't pile on each other. Enemies flash white periodically (telegraph state). Debug shows state counts.

---

## Phase 4: Enemy Attacks

**Goal:** Enemies fire projectiles at the player. Attacks are telegraphed. You can see and dodge enemy bullets.

### Tasks

#### 4.1 Attack Token System

Add to `GameWorld`:

```typescript
attackTokens: number; // currently available
maxAttackTokens: number; // cap (default 3)
```

**Threats only:** Threats claim a token when entering TELEGRAPH, release when leaving RECOVERY. If no tokens are available, the threat stays in CHASE and repositions.

**Fodder fires freely.** Fodder enemies do NOT consume attack tokens — they all fire whenever their cooldown expires. This is what creates the bullet hell: many weak projectiles from all directions. The token system only gates the dangerous threat attacks to keep them readable.

#### 4.2 Enemy Attack System (`shared/src/sim/systems/enemyAttack.ts`)

```typescript
enemyAttackSystem(world, dt);
```

- Query entities with `EnemyAI + AttackConfig + Position` where `state === ATTACK`
- On entering ATTACK state:
  - Spawn enemy bullet(s) aimed at player
  - Use `spawnEnemyBullet` with `CollisionLayer.ENEMY_BULLET`
  - Bullet count and spread from `AttackConfig`
  - Immediately transition to RECOVERY
- Decrement `cooldownRemaining` for all enemies each tick

**Swarmer attack:** 1 slow bullet aimed at player's current position. Speed 100px/s — very dodgeable individually, but 10+ swarmers firing creates a slow-moving bullet curtain the player weaves through.

**Grunt attack:** 1 moderate-speed bullet aimed at player's current position.

**Shooter attack:** 3 bullets in a spread fan centered on player direction. Faster bullets, forces precision dodging.

**Charger attack:** No projectile — contact damage instead. The charger's ATTACK state sets high velocity toward the player's position at telegraph-start. If the charger's collider overlaps the player during charge, deal damage (checked in the health system via entity-entity collision).

#### 4.3 Initial Attack Delay

Each enemy gets a random `initialDelay` set at spawn:

- **Fodder:** 0.2-0.5s — quick to start firing, creates natural stagger from continuous spawning
- **Threats:** 0.5-1.0s — gives the player time to register the new threat

The enemy cannot transition from CHASE → TELEGRAPH until this delay has elapsed. This prevents synchronized volleys when a wave spawns.

#### 4.4 Entity-Entity Damage Collision

Add to the collision system or health system:

- Chargers in ATTACK state: if charger collider overlaps player collider, deal `AttackConfig.damage` to player
- Check collision layers: `ENEMY` layer entity in ATTACK state vs `PLAYER` layer entity
- Apply player i-frames after hit

#### 4.5 Enemy Bullet Rendering

Enemy bullets already render via the existing `BulletRenderer` (it queries all `Bullet` entities). But visually distinguish enemy bullets from player bullets:

- **Player bullets:** Existing color/style
- **Enemy bullets (fodder):** Smaller, dim/warm color — visually "cheap" to match the enemies firing them
- **Enemy bullets (threats):** Brighter, larger — signals danger. The player's eye should track these.

Extend `BulletRenderer` to check the collision layer and apply different colors/sizes.

#### 4.6 Camera Juice — First Pass

- Screen shake on player taking damage (0.15 trauma)
- Screen shake on enemy death: small for fodder (0.02 trauma), medium for threats (0.08 trauma)
- Hit stop on player taking damage (0.05s freeze)

This juice is needed now to make Phase 4 feel good during testing. Don't wait for Polish.

#### 4.7 Debug Overlay Updates

Add to `DebugStats`:

```typescript
attackTokensUsed: number;
attackTokensMax: number;
activeProjectiles: number;
```

### Deliverables

- Swarmers fire single slow bullets (bullet hell through volume)
- Grunts fire single aimed bullets
- Shooters fire 3-bullet spreads
- Chargers rush and deal contact damage
- Attack tokens limit simultaneous threat attacks only; fodder fires freely
- Initial delay staggers first attacks (shorter for fodder, longer for threats)
- **Enemy bullets are visible and color-coded by tier**
- **Camera shakes on damage and enemy death**
- Debug shows attack tokens and projectile count

### How to Test

- **Manual visual:** Start game with 10 swarmers + 2 shooters (hard-spawned). See constant slow bullet stream from swarmers. See shooters telegraph (white flash) then fire 3-bullet spreads. Dodge bullets. Get hit → red flash, screen shake, HP drops in debug. Kill enemies → screen shake, they disappear. Die → "Game Over."

---

## Phase 5: Director-Wave Spawner

**Goal:** A Director-Wave hybrid system spawns enemies in escalating blended waves. Each wave has a fodder layer and a threat layer. Fodder reinforces continuously; threats are finite. This replaces the hard-spawned test enemies from Phase 2.

### Design Summary

Every wave blends both tiers simultaneously. The ratio shifts over the stage:

- **Wave 1:** Heavy fodder, 1 threat — learning wave
- **Wave 2:** More fodder, 2 threats with new archetype — escalation
- **Wave 3:** Dense fodder, 3 threats with synergy — pressure
- **Wave 4:** Peak fodder AND peak threats — climax before boss

Fodder that dies is immediately replaced from the wave's remaining fodder budget. The screen stays full until the budget runs dry. Threats don't reinforce — killing each threat is permanent, visible progress. The wave ends when all threats are dead and the fodder budget is spent.

### Tasks

#### 5.1 Wave Definitions (`shared/src/sim/content/waves.ts`)

```typescript
interface FodderPool {
  type: number; // EnemyType (SWARMER or GRUNT)
  weight: number; // relative spawn probability
}

interface ThreatEntry {
  type: number; // EnemyType (SHOOTER or CHARGER)
  count: number;
}

interface WaveDefinition {
  fodderBudget: number; // total fodder points to spend
  fodderPool: FodderPool[]; // which fodder types, with weights
  maxFodderAlive: number; // overcrowding cap for fodder
  threats: ThreatEntry[]; // specific threats that spawn at wave start
  spawnDelay: number; // seconds before wave starts after previous clears
}

interface StageEncounter {
  waves: WaveDefinition[];
}
```

Create stage 1 encounter:

```typescript
const STAGE_1_ENCOUNTER: StageEncounter = {
  waves: [
    {
      // Wave 1: Learning — mostly swarmers, 1 shooter
      fodderBudget: 14,
      fodderPool: [
        { type: SWARMER, weight: 3 },
        { type: GRUNT, weight: 1 },
      ],
      maxFodderAlive: 10,
      threats: [{ type: SHOOTER, count: 1 }],
      spawnDelay: 0,
    },
    {
      // Wave 2: Escalation — more fodder, introduce charger
      fodderBudget: 20,
      fodderPool: [
        { type: SWARMER, weight: 2 },
        { type: GRUNT, weight: 1 },
      ],
      maxFodderAlive: 14,
      threats: [
        { type: SHOOTER, count: 1 },
        { type: CHARGER, count: 1 },
      ],
      spawnDelay: 6,
    },
    {
      // Wave 3: Pressure — dense fodder, synergistic threats
      fodderBudget: 28,
      fodderPool: [
        { type: SWARMER, weight: 2 },
        { type: GRUNT, weight: 2 },
      ],
      maxFodderAlive: 18,
      threats: [
        { type: SHOOTER, count: 2 },
        { type: CHARGER, count: 1 },
      ],
      spawnDelay: 5,
    },
    {
      // Wave 4: Climax — peak everything
      fodderBudget: 35,
      fodderPool: [
        { type: SWARMER, weight: 3 },
        { type: GRUNT, weight: 2 },
      ],
      maxFodderAlive: 22,
      threats: [
        { type: SHOOTER, count: 2 },
        { type: CHARGER, count: 2 },
      ],
      spawnDelay: 5,
    },
  ],
};
```

#### 5.2 Director State on GameWorld (`shared/src/sim/world.ts`)

Add to `GameWorld`:

```typescript
encounter: {
  definition: StageEncounter | null
  currentWave: number
  waveTimer: number          // countdown for spawnDelay between waves
  waveActive: boolean
  completed: boolean
  // Active wave tracking
  fodderBudgetRemaining: number
  fodderAliveCount: number
  threatAliveCount: number
  totalFodderSpawned: number
} | null
```

#### 5.3 Wave Spawner System (`shared/src/sim/systems/waveSpawner.ts`)

```typescript
waveSpawnerSystem(world, dt);
```

**Between waves:**

- Decrement `waveTimer`. When expired, activate next wave.
- On wave activation: spawn all threats immediately + initial burst of fodder.

**During active wave:**

- Track alive fodder count and alive threat count (query `Enemy` entities by tier)
- **Fodder reinforcement:** If `fodderAliveCount < maxFodderAlive` AND `fodderBudgetRemaining > 0`:
  - Spawn 2-4 fodder per second (spread across ticks) from weighted pool
  - Deduct cost from `fodderBudgetRemaining`
  - This keeps the screen full — killed fodder is replaced immediately
- **Wave clear check:** Wave is complete when `threatAliveCount === 0` AND `fodderBudgetRemaining === 0` AND `fodderAliveCount === 0`
  - When cleared: start `spawnDelay` timer for next wave
  - When all waves cleared: set `completed = true`

**Spawn rate tuning:**

- Fodder spawn rate: 2-4 enemies/second during active wave, spread across spawn points
- Initial burst: spawn up to `maxFodderAlive / 2` fodder in the first second of a wave
- Threats spawn all at once at wave start (they're the "here we go" moment)

#### 5.4 Spawn Positioning

Spawn points are map-edge positions (contextual: doors, alleys, map borders).

Positioning rules:

- **Minimum distance from player:** 200px — no point-blank spawns
- **Spawn telegraph:** Enemies exist in a brief spawning state for 0.3s (invulnerable, visible but ghosted)
  - Use `initialDelay` in `EnemyAI` for this grace period
  - Optionally add brief i-frames on spawn via `Health.iframes`
- **Fodder spread:** Fodder spawns from multiple points simultaneously (3-5 active points). Creates "they're coming from everywhere" feeling.
- **Threat entrance:** Threats spawn from 1-2 points. They step in with presence — the player should notice them.

For the initial test arena: use positions along the playable area edges. Future stages will define contextual spawn points per zone.

#### 5.5 Projectile Density Control

Add to `GameWorld`:

```typescript
activeProjectileCount: number; // tracked each tick
maxProjectiles: number; // cap (~80-100)
```

In `enemyAttackSystem`: if `activeProjectileCount >= maxProjectiles`, fodder enemies skip their shot (stay in RECOVERY, don't fire). Threats always fire — their bullets are dangerous and few. This prevents truly unreadable screens while maintaining chaos.

#### 5.6 EnemyRenderer — Spawn Visual

Extend `EnemyRenderer` to show spawning state:

- Newly spawned enemies (during `initialDelay`) render at 50% opacity / ghosted
- Fade to full opacity as delay expires
- This telegraphs "enemy incoming" without the enemy being a threat yet

#### 5.7 Debug Overlay — Wave Telemetry

Add to `DebugStats`:

```typescript
fodderAlive: number;
threatAlive: number;
waveNumber: number;
waveStatus: string; // "active" | "delay" | "completed"
fodderBudgetLeft: number;
```

#### 5.8 GameScene Integration

- Remove hard-spawned test enemies from Phase 2
- `GameScene.create` starts the stage encounter via `setEncounter(world, STAGE_1_ENCOUNTER)`
- `GameScene.update` calls `waveSpawnerSystem` as part of the system pipeline

### Deliverables

- Waves spawn blended fodder + threats
- Fodder reinforces continuously — screen stays full
- Threats are finite — killing them is visible progress
- Wave clears when all threats dead + fodder budget spent
- Escalating wave budgets create intensity ramp
- Spawn positioning respects min distance and uses map edges
- Projectile density is capped to maintain readability
- **Spawning enemies are visually ghosted during grace period**
- **Debug overlay shows full wave telemetry**

### How to Test

- **Manual visual:** Start game → Wave 1 spawns: swarmers flood in (ghosted, then solid), 1 shooter steps out. Kill swarmers → new ones replace them immediately. Kill the shooter → fodder thins as budget drains → wave clears. Brief pause → Wave 2: more enemies, charger appears. Play through all 4 waves. Debug shows wave number, fodder budget draining, threat count dropping.

---

## Phase 6: Polish & Tuning

**Goal:** Make combat feel good through tuning and edge-case fixes. The blended fodder/threat model needs careful tuning to hit the right feel.

### Tasks

#### 6.1 Visual Polish

- Charger during ATTACK: stretch sprite in charge direction (squash & stretch)
- Charger during TELEGRAPH: shake/vibrate in place (winding up)
- Shooter during TELEGRAPH: aim line or directional indicator toward player
- Damage flash on enemies: briefly tint red when taking damage (not just death removal)
- Death effect: brief scale-down + fade (even with colored circles, this sells the kill)

#### 6.2 Camera Kick on Player Hit

- Camera kick when player is hit (toward damage source direction)
- This was deferred from Phase 4's first juice pass; now add it

#### 6.3 Combat Tuning Pass

Play through encounters and tune:

- **Fodder spawning rate** — too fast = overwhelming before threats matter; too slow = boring gaps
- **Fodder bullet speed** — must be slow enough to weave through with 10+ on screen (100px/s baseline)
- **Threat telegraph durations** — readable amid fodder chaos
- **Threat bullet speeds** — fast enough to demand attention, not so fast they're invisible in the chaos
- **Fodder reinforcement timing** — how quickly killed fodder is replaced
- **Wave budgets** — difficulty curve across 4 waves
- **Projectile cap** — high enough to feel chaotic, low enough to remain readable
- **Overcrowding caps** — how many fodder on screen at once
- **Attack cooldowns** — pacing between attacks
- **Separation radius** — visual clarity (tighter for fodder, wider for threats)

#### 6.4 Edge Cases

- Enemy spawning when player is near a wall / in a corner
- Multiple chargers charging simultaneously
- Player dying mid-wave
- All enemies dying in one frame (AoE/piercing future-proofing)
- Alt-tab during active encounter (spiral-of-death protection already exists)
- Fodder budget running out mid-reinforcement cycle
- Projectile cap reached while threats need to fire

#### 6.5 Test Coverage

- Unit tests for all new shared systems:
  - `healthSystem`: damage, i-frames, death
  - `enemyAISystem`: state transitions
  - `enemyAttackSystem`: bullet spawning, token claiming (threats), free fire (fodder)
  - `waveSpawnerSystem`: wave progression, fodder reinforcement, wave clear condition
  - `flowFieldSystem`: pathfinding correctness
  - `enemyDetectionSystem`: aggro, LOS
- Integration test: spawn blended wave, verify fodder reinforces, threats don't, wave clears correctly

### Deliverables

- Combat feels responsive and fair
- The blended fodder/threat model feels right — constant action, clear priorities
- All edge cases handled
- Test coverage for shared systems
- Tuned balance values

### How to Test

- Play through all 4 waves multiple times
- Verify the bullet hell from fodder is weave-able (not instant death)
- Verify threats are noticeable amid the chaos (visual distinction + telegraphs)
- Verify wave clear feels satisfying (threats drop, fodder thins, loot moment)
- Try to find unfair deaths (no telegraph, instant damage, spawn-on-player)
- Run `bun test` — all tests pass
- Run `bun run typecheck` and `bun run build` — clean

---

## Implementation Order

| Phase | Files                                                                     | Risk   | Visual Test                                            |
| ----- | ------------------------------------------------------------------------- | ------ | ------------------------------------------------------ |
| 1     | components, health system, bulletCollision, player HP rendering           | Medium | See HP in debug, damage flash, "Game Over"             |
| 2     | components, content/enemies, prefabs, EnemyRenderer (basic), GameScene    | Low    | See colored circles in arena, shoot them dead          |
| 3     | flowField, detection, AI, steering, EnemyRenderer (state visuals)         | High   | See enemies chase you, telegraph flash, separation     |
| 4     | attack system, tokens, entity collision, bullet colors, camera juice      | Medium | See enemy bullets, dodge them, take damage, feel juice |
| 5     | wave spawner, encounter definitions, projectile cap, spawn visuals, debug | Medium | See waves spawn, reinforce, clear, escalate            |
| 6     | visual polish, camera kick, tuning, edge cases, tests                     | Low    | Everything feels good, all tests pass                  |

---

## Verification

```bash
bun test             # All shared system tests pass
bun run typecheck    # Clean across all packages
bun run build        # Builds successfully
bun run dev          # Game runs with enemies
```

Manual testing checklist:

1. Game loads; enemies spawn after brief delay (ghosted, then solid)
2. Swarmers and grunts (fodder) flood in from map edges
3. Shooter or charger (threat) spawns alongside fodder — visually distinct
4. Killing fodder causes immediate reinforcement — screen stays full
5. Killing a threat is permanent — wave gets easier
6. Fodder fires slow bullets from all directions (bullet hell from volume)
7. Threats telegraph before attacking (visible flash/pause)
8. Threat bullets are faster, brighter, and more dangerous than fodder bullets
9. Player damage flash + screen shake + hit stop on taking damage
10. Player i-frames prevent damage stacking
11. Player bullets kill all enemy types
12. Camera shakes: small for fodder death, larger for threat death
13. Wave clears when all threats dead + fodder budget spent
14. Wave 2 starts after delay with higher budgets
15. 4 waves escalate to peak intensity, then encounter completes
16. Player death shows "Game Over"
17. Enemies navigate around obstacles (not stuck on walls)
18. Enemies don't stack on each other
19. Max 3 threats attack simultaneously (tokens); fodder fires freely
20. Projectile cap prevents screen from becoming unreadable
21. Debug overlay shows: HP, enemy count by tier, AI states, wave number, fodder budget, attack tokens, projectiles
22. No crashes on rapid input, resize, alt-tab

---

## Task Checklist

### Phase 1: Health & Damage Foundation

- [x] 1.1 Health component
- [x] 1.2 Health system
- [x] 1.3 Bullet-entity collision
- [x] 1.4 Player health setup
- [x] 1.5 Death handling
- [x] 1.6 Player health rendering (damage flash, HP in debug, "Game Over" text)

### Phase 2: Enemy Components, Prefabs & Basic Rendering

- [x] 2.1 Enemy components (Enemy with tier, EnemyAI, Detection, AttackConfig, Steering)
- [x] 2.2 Enemy content definitions (Swarmer, Grunt, Shooter, Charger with tier + budget cost)
- [x] 2.3 Enemy prefabs (swarmer, grunt, shooter, charger)
- [x] 2.4 EnemyRenderer — basic colored circles with type-based colors
- [x] 2.5 GameScene integration (add renderer, debug enemy count, test spawns)

### Phase 3: Enemy AI Core

- [x] 3.1 Flow field system
- [x] 3.2 Detection system
- [x] 3.3 AI state machine system (tier-aware timing)
- [x] 3.4 Steering system (seek, flee, separation, charger charge)
- [x] 3.5 EnemyRenderer — AI state visuals (telegraph flash, recovery dim, threat distinction)
- [x] 3.6 Debug overlay (AI state distribution)

### Phase 4: Enemy Attacks

- [ ] 4.1 Attack token system (threats only; fodder fires freely)
- [ ] 4.2 Enemy attack system (projectile spawning, tier-specific profiles)
- [ ] 4.3 Initial attack delay (0.2-0.5s fodder, 0.5-1.0s threats)
- [ ] 4.4 Entity-entity damage collision (charger contact damage)
- [ ] 4.5 Enemy bullet rendering (color-coded by tier in BulletRenderer)
- [ ] 4.6 Camera juice — first pass (damage shake, death shake, hit stop)
- [ ] 4.7 Debug overlay (attack tokens, projectile count)

### Phase 5: Director-Wave Spawner

- [ ] 5.1 Wave definitions with dual budgets (fodder + threat)
- [ ] 5.2 Director state on GameWorld
- [ ] 5.3 Wave spawner system (fodder reinforcement, threat persistence, wave clear)
- [ ] 5.4 Spawn positioning (map edges, min distance, spawn telegraph)
- [ ] 5.5 Projectile density control
- [ ] 5.6 EnemyRenderer — spawn ghosting visual
- [ ] 5.7 Debug overlay (wave number, status, fodder budget, tier counts)
- [ ] 5.8 GameScene integration (replace test spawns with encounter)

### Phase 6: Polish & Tuning

- [ ] 6.1 Visual polish (charger stretch, aim indicators, damage flash, death effect)
- [ ] 6.2 Camera kick on player hit
- [ ] 6.3 Combat tuning pass (fodder rate, bullet speeds, budgets, caps)
- [ ] 6.4 Edge case handling
- [ ] 6.5 Test coverage

---

## Dependencies Between Phases

```
Phase 1 (Health & Damage + HP rendering)
    │
    ▼
Phase 2 (Enemy Components & Prefabs + EnemyRenderer basic)
    │
    ▼
Phase 3 (AI Core + EnemyRenderer state visuals)
    │
    ▼
Phase 4 (Attacks + bullet colors + camera juice)
    │
    ▼
Phase 5 (Director-Wave Spawner + spawn visuals + wave debug)
    │
    ▼
Phase 6 (Polish & Tuning)
```

Each phase builds on the previous and is **visually testable** at completion.

---

## Out of Scope (Future Sprints)

- Boss enemies (multi-phase, scripted patterns)
- Elite/champion variants (promoted fodder at higher difficulties)
- Enemy drops (health, ammo, upgrades) — needed for the reward loop but separate sprint
- Damage numbers / hit indicators
- Enemy health bars
- Zone system for map-specific spawn points (using generic map-edge spawns for now)
- Side objectives (defend, rescue, bounty)
- Kill combo counter and escalating rewards
- Seeded RNG for deterministic spawns (needed for replays/multiplayer)
- Sound effects for enemies
- Particle effects (death explosions, bullet trails)
- Multiplayer networking (server, prediction, interpolation)
- Procedural map generation
- Difficulty scaling levers (shorter telegraphs, promoted fodder, etc.)

---

## Risks & Mitigations

| Risk                              | Impact | Mitigation                                                                |
| --------------------------------- | ------ | ------------------------------------------------------------------------- |
| Flow field complexity             | Medium | Start with direct seek; add flow field only if enemies get stuck          |
| AI state machine bugs             | High   | Thorough unit tests for each transition                                   |
| Enemy stacking                    | Medium | Separation force in steering; test with 20+ fodder                        |
| Attack token starvation (threats) | Low    | Threats without tokens still reposition, not frozen                       |
| Bullet-entity collision perf      | Medium | Circle-circle check; spatial hash if >30 entities (likely with swarms)    |
| Fodder reinforcement feels wrong  | Medium | Tunable spawn rate + budget; easy to iterate. Test with extremes.         |
| Projectile count tanks FPS        | Medium | Projectile cap + bullet lifetime limits. Profile with 25+ enemies firing. |
| Charger feels unfair              | Medium | Long telegraph (0.5s), long recovery (0.8s), clear visual                 |
| Bullet hell unreadable            | Medium | Slow fodder bullets (100px/s), color-coded by tier, projectile cap        |
| Wave pacing feels flat            | Medium | Dual budget system gives two tuning axes per wave; iterate on ratios      |
| Component count growth            | Low    | bitECS handles many components well; keep SoA arrays                      |

---

## File Structure After Sprint

```
packages/shared/src/sim/
  components.ts          # +Enemy (with tier), EnemyAI, Health, Detection, AttackConfig, Steering
  prefabs.ts             # +spawnSwarmer, spawnGrunt, spawnShooter, spawnCharger, spawnEnemyBullet
  world.ts               # +flowField, attackTokens, encounter director, activeProjectileCount
  content/
    player.ts
    weapons.ts
    enemies.ts           # NEW — 4 archetypes, 2 tiers, budget costs
    waves.ts             # NEW — StageEncounter with dual-budget wave definitions
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
    waveSpawner.ts       # NEW — Director-Wave hybrid
    flowField.ts         # NEW
    index.ts

packages/client/src/
  render/
    EnemyRenderer.ts     # NEW — tier-distinct visuals, state feedback, spawn ghosting
    BulletRenderer.ts    # extended — tier-coded enemy bullet colors
    PlayerRenderer.ts    # extended — damage flash
  scenes/
    GameScene.ts         # updated — registers new systems, renderers, encounter
```
