# Enemy AI Design

This document outlines enemy AI design for High Noon, covering archetypes, behavior patterns, detection systems, attack design, encounter composition, and ECS implementation. All enemy logic lives in `packages/shared` for deterministic simulation.

---

## Overview

High Noon enemies serve three purposes:

1. **Pressure** — Force the player to move, dodge, and reposition
2. **Puzzle** — Require the player to prioritize targets and read attack patterns
3. **Satisfaction** — Die in crunchy, satisfying ways that reward player skill

Enemy AI should be **simple per-unit but complex in combination**. A lone grunt is trivial. Three grunts, a turret, and a shield bearer in a tight room is a spatial puzzle.

### Design Principles

- **Readable** — Players must identify enemy type and current state at a glance
- **Fair** — Every attack has a visible telegraph; no hitscan, no instant damage
- **Deterministic** — Same inputs + same seed = same enemy behavior (replay-safe)
- **Composable** — Enemy types combine via data, not code; new archetypes from new component configurations
- **Performant** — AI logic is cheap per-entity; expensive operations (pathfinding, LOS) are shared or amortized

---

## 1. Enemy Archetypes

Archetypes are not hardcoded classes — they are **component presets** applied via prefab functions. Every archetype is a combination of shared components.

### Grunt (Fodder)

The baseline enemy. Teaches the player that enemies exist and die.

| Property | Value |
|----------|-------|
| HP | 2-3 |
| Speed | 60-80% of player |
| Behavior | Walk toward player, fire single shots |
| Attack | Single bullet, slow speed, every 1.5-2s |
| Telegraph | Brief pause + flash before firing |

**Why it's fun:** Satisfying to mow down. Alone it's trivial; in groups of 5+ it creates crossfire pressure.

**Contemporary examples:** Bullet Kin (Enter the Gungeon), Bandits (Nuclear Throne), Gapers (Binding of Isaac)

### Charger

Commits to a direction and sprints. Punishes stationary players.

| Property | Value |
|----------|-------|
| HP | 4-5 |
| Speed | 150-200% of player during charge |
| Behavior | Approach until in range, telegraph, charge in locked direction |
| Attack | Contact damage during charge, possible AoE slam at end |
| Telegraph | Wind-up pose (0.4-0.6s), ground indicator showing charge path |
| Recovery | Stunned for 0.5-1.0s after charge (punish window) |

**Why it's fun:** Forces the player to dodge laterally. The locked direction + recovery window creates a clear risk/reward: dodge the charge, punish during recovery.

**Contemporary examples:** Gun Nut (Enter the Gungeon), Thugs (Hades), Assassins (Nuclear Throne)

### Shooter (Ranged)

Maintains distance from the player. Creates crossfire when combined with melee enemies.

| Property | Value |
|----------|-------|
| HP | 3-4 |
| Speed | 50-70% of player |
| Behavior | Maintain preferred range (150-250px), flee if player gets too close |
| Attack | 2-3 bullet spread, moderate speed, every 2-3s |
| Telegraph | Weapon glow + brief aim-lock (0.3-0.4s) |
| Movement | Orbits/strafes laterally when at preferred range |

**Why it's fun:** Forces the player to close distance or dodge from afar. Orbiting movement makes them harder to hit with straight shots.

**Contemporary examples:** Crows (Nuclear Throne), Slingers (Hades), various gun enemies (Gungeon)

### Turret (Stationary)

Doesn't move. Fires continuously or in bursts. Pure area denial.

| Property | Value |
|----------|-------|
| HP | 5-8 |
| Speed | 0 (StaticBody) |
| Behavior | Rotate toward player, fire in patterns |
| Attack | Burst of 3-5 bullets in a spread, or rotating beam |
| Telegraph | Barrel glow + charging sound (0.5s) |
| Vulnerability | May have an exposed weak point or periodic "cooling" phase |

**Why it's fun:** Creates zones the player must navigate around. Prioritize destroying it or dodge through its pattern.

**Contemporary examples:** Snipers (Nuclear Throne), Brimstone enemies (Isaac), wall-mounted guns (Gungeon)

### Swarmer

Tiny, fast, fragile. Appears in packs of 6-12. Contact damage only.

| Property | Value |
|----------|-------|
| HP | 1 |
| Speed | 80-120% of player |
| Behavior | Beeline toward player, basic separation from other swarmers |
| Attack | Contact damage only |
| Telegraph | None (they ARE the telegraph — you see them coming) |

**Why it's fun:** Tests crowd management. Satisfying to clear with AoE or sweep shots. Dangerous if ignored while fighting other enemies.

**Contemporary examples:** Flies/Spiders (Isaac), basic enemies (Vampire Survivors)

### Shield Bearer

Blocks frontal attacks. Requires flanking or piercing weapons.

| Property | Value |
|----------|-------|
| HP | 6-8 |
| Speed | 50% of player |
| Behavior | Approach player slowly, shield always faces player |
| Attack | Shield bash at close range (contact damage + knockback) |
| Telegraph | Shield glows before bash (0.4s) |
| Mechanic | Frontal 90-degree arc absorbs bullets; rear is vulnerable |

**Why it's fun:** Creates a positioning puzzle. The player must circle around or wait for an opening. Protecting other enemies behind them makes target priority interesting.

**Contemporary examples:** Greatshields (Hades), IDPD Shielders (Nuclear Throne)

### Bomber (AoE)

Creates area-denial zones that linger.

| Property | Value |
|----------|-------|
| HP | 2-3 |
| Speed | 60% of player |
| Behavior | Approach to medium range, lob explosive that creates danger zone |
| Attack | Arcing projectile → ground AoE that persists for 2-3s |
| Telegraph | Lob animation (0.3s) + ground indicator before detonation (0.5s) |

**Why it's fun:** Restricts player movement options. Combined with chargers or swarmers, the shrinking safe zone creates tension.

### Teleporter

Appears, attacks, vanishes. Tests snap reactions.

| Property | Value |
|----------|-------|
| HP | 3-4 |
| Speed | 0 while attacking (teleports to reposition) |
| Behavior | Teleport to position near player, attack, teleport away |
| Attack | Ring of bullets on arrival, or focused burst |
| Telegraph | Shimmer/portal effect at destination (0.5s before arrival) |
| Cooldown | 2-3s between teleports |

**Why it's fun:** Unpredictable positioning. Players must watch for shimmer tells and react quickly. High priority target.

**Contemporary examples:** Wizards (Gungeon), Hollowpoints (Gungeon), Satyr Cultists (Hades)

### Support (Buffer)

Buffs or heals allies. Stays behind front-line enemies.

| Property | Value |
|----------|-------|
| HP | 3-4 |
| Speed | 40% of player |
| Behavior | Stay behind other enemies, flee when player approaches, buff allies |
| Attack | Buff aura (speed/damage boost to nearby allies) or ranged heal |
| Telegraph | Glowing aura effect while buffing |

**Why it's fun:** Creates target priority decisions. Do you push past the front line to take out the support, or clear the buffed enemies first?

**Contemporary examples:** Gunjurers (Gungeon)

---

## 2. AI State Machine

Every enemy runs a finite state machine. States are intentionally few — complex behavior emerges from enemy combinations, not per-enemy complexity.

### Core States

```
           detect
  IDLE ─────────────► CHASE
   ▲                    │
   │ lost target    in range
   │                    │
   │                    ▼
   │               TELEGRAPH
   │                    │
   │              timer expires
   │                    │
   │                    ▼
   │                 ATTACK
   │                    │
   │             attack complete
   │                    │
   │                    ▼
   └──────────────  RECOVERY ◄──── STUNNED
                                     ▲
                                     │ damage > stagger threshold
                                     │ (from any state)
```

### State Descriptions

| State | Behavior | Duration | Transitions |
|-------|----------|----------|-------------|
| **IDLE** | Stationary or patrol. Not aware of player. | Indefinite | Player enters aggro range → CHASE |
| **CHASE** | Move toward player using steering/pathfinding. | Until in range or target lost | In attack range → TELEGRAPH. Player leaves aggro range × 2 → IDLE |
| **TELEGRAPH** | Freeze in attack pose. Visual wind-up. | 0.2-0.6s (configurable per type) | Timer expires → ATTACK |
| **ATTACK** | Execute the attack (spawn bullets, deal damage). | 0.1-0.3s | Attack complete → RECOVERY |
| **RECOVERY** | Vulnerable cool-down. Cannot act. | 0.3-1.0s (configurable) | Timer expires → CHASE |
| **STUNNED** | Hit-stunned. Cannot act. Brief visual feedback. | 0.1-0.3s | Timer expires → CHASE |
| **FLEE** | Move away from player. Used by supports/low-HP. | Until at safe range | At safe range → CHASE or IDLE |

### Transition Rules

**IDLE → CHASE:** Player enters `aggroRange`. If `losRequired` is set, also requires line-of-sight via Bresenham raycast against the tilemap.

**CHASE → TELEGRAPH:** Player is within `attackRange` AND `attackCooldown` has expired. Attack cooldown prevents enemies from chain-attacking with no gap.

**TELEGRAPH → ATTACK:** `stateTimer` exceeds `telegraphDuration`. The telegraph duration is the primary difficulty tuning lever — shorter = harder.

**Any → STUNNED:** Incoming damage exceeds `staggerThreshold`. Not every hit staggers; only significant damage interrupts the state machine. Bosses may be stagger-immune.

**CHASE hysteresis:** Enemies chase until they lose their target, defined as the player being outside `aggroRange × 2.0`. This prevents oscillating between IDLE and CHASE when the player is near the aggro boundary.

---

## 3. Detection and Targeting

### Aggro Ranges

Two-tier detection creates natural pacing:

- **Outer ring (aggro range):** Enemy enters CHASE state. Typical radius: 200-400px.
- **Inner ring (attack range):** Enemy begins TELEGRAPH → ATTACK cycle. Typical radius: 80-200px (melee) or 150-300px (ranged).

The gap between aggro and attack range is where the player sees enemies approaching and can prepare.

### Line-of-Sight

LOS checks use Bresenham's line algorithm against the tilemap collision layer. This is cheap enough to run per-enemy per-tick for room-sized maps.

```
For each tile along the line from enemy to player:
  if tile is solid → LOS blocked
If no solid tiles → LOS clear
```

Not all enemies require LOS. Swarmers and chargers ignore it (they just run at the player). Ranged enemies and turrets should respect it to create gameplay around cover.

### Aggro Propagation

When one enemy detects the player, it can alert nearby allies within a radius. This prevents the situation where a player is in combat with one enemy while another 10px away remains oblivious.

Implementation: when an enemy transitions from IDLE → CHASE, scan nearby enemies (within alert radius) and transition them to CHASE as well.

---

## 4. Movement and Steering

### Steering Behaviors

Enemy movement combines multiple steering forces:

```
finalVelocity = normalize(
    seek(player)         * seekWeight
  + separation(allies)   * separationWeight
  + flee(player)         * fleeWeight          // only when too close
  + arrive(targetRange)  * arriveWeight        // decelerate near target
) * maxSpeed
```

**Seek:** Direction toward player. The default for chargers and grunts.

**Separation:** Push away from nearby allies within `separationRadius`. Prevents enemy stacking, which looks bad and is unfair (multiple enemies occupying the same pixel = multiple damage sources the player can't distinguish).

**Flee:** Direction away from player. Used by ranged enemies when the player closes inside their minimum range, and by supports.

**Arrive:** Like seek, but decelerates as the entity approaches the target distance. Used by ranged enemies maintaining preferred range.

### Pathfinding: Flow Fields

For rooms with obstacles, direct seek will cause enemies to pile against walls. The solution is a **flow field** (Dijkstra map) computed once from the player's position:

1. Treat the tilemap as a grid
2. BFS/Dijkstra from the player's cell, marking distance to each reachable cell
3. Each cell's flow direction = direction toward the neighbor with lowest distance
4. Enemies look up their cell's direction instead of computing individual paths

**When to recompute:** Only when the player moves to a different cell (not every pixel). For a 32px tile size, this means a recompute every ~32px of player movement — roughly 6-10 times per second at full speed.

**Performance:** A 50x50 grid BFS takes <0.5ms. This is shared by all enemies and eliminates per-entity pathfinding entirely.

**Fallback:** For simple rooms with no interior obstacles, direct seek is sufficient. The flow field is only needed when there are walls/pillars enemies must navigate around.

### Movement Patterns

Beyond basic seek, some archetypes use specific movement patterns:

| Pattern | Description | Used by |
|---------|-------------|---------|
| **Seek** | Direct toward player | Grunts, swarmers, chargers |
| **Orbit** | Circle player at preferred range | Shooters |
| **Zigzag** | Approach in a weaving path | Dodgy variants |
| **Flee** | Away from player | Supports, low-HP |
| **Patrol** | Walk a fixed route until alerted | Idle enemies |

---

## 5. Attack Design

### The Three Phases

Every enemy attack follows the same structure. This is the single most important pattern for fairness:

```
TELEGRAPH (wind-up)    →    ATTACK (active)    →    RECOVERY (cool-down)
  Player reads             Damage window             Player punishes
  and prepares             is brief                  during vulnerability
```

#### Telegraph Phase

The warning. Must be visually distinct per-attack-type.

**Communication channels (pick 1-2 per enemy):**
- Animation pose — freeze in recognizable wind-up
- Flash/glow — sprite pulses or glows before attack
- Ground indicator — danger zone appears on floor (for AoE)
- Sound cue — charging sound

**Timing guidelines:**

| Difficulty | Telegraph Duration |
|------------|-------------------|
| Early game | 0.5-0.6s |
| Mid game | 0.3-0.5s |
| Late game / Elite | 0.2-0.4s |
| Boss (big attack) | 0.6-1.0s |
| Boss (fast attack) | 0.2-0.3s |

The minimum telegraph should never go below ~0.2s (human reaction time is ~0.25s, and the player needs time to process + execute a dodge).

#### Attack Phase

The actual damage. Should be brief and clear.

**All attacks use projectiles, not hitscan.** Projectile-based attacks are:
- Dodgeable (skill expression)
- Visible (fairness)
- Tunable (adjust speed for difficulty)
- Deterministic (same seed = same pattern)

**Projectile pattern types:**

| Pattern | Description | Complexity |
|---------|-------------|------------|
| Single | One bullet aimed at player | Low |
| Spread | 3-5 bullets in a fan | Low |
| Ring | 8-16 bullets in all directions | Medium |
| Spiral | Rotating ring pattern | Medium |
| Burst | Multiple single shots in sequence | Medium |
| Aimed spread | Fan centered on player's current position | Medium |
| Predicted | Aimed at where player will be | High |

**Bullet speed guidelines:** Enemy bullets should be 40-70% of player bullet speed. Fast enough to threaten, slow enough to dodge on reaction.

#### Recovery Phase

The vulnerability window. The player's reward for dodging the attack.

- Enemy cannot act during recovery
- Visual cue: slumped/dazed pose, dim color
- Duration: 0.3-1.0s depending on attack power (bigger attack = longer recovery)
- This is when players should feel safe to counterattack

### Attack Coordination

The most important fairness mechanic for multi-enemy encounters.

**Staggered fire timing:** Each enemy in a room gets a random initial delay (0.0-1.0s) before its first attack. This prevents all enemies from firing simultaneously on the first frame.

**Max simultaneous attackers:** A room-level `attackTokens` counter limits how many enemies can be in TELEGRAPH or ATTACK state at once. Recommended: 2-3 simultaneous attackers for rooms with 4+ enemies.

```
When entering TELEGRAPH:
  if attackTokensAvailable > 0:
    claimToken()
    proceed to TELEGRAPH
  else:
    stay in CHASE (circle/reposition until a token frees up)

When leaving RECOVERY:
  releaseToken()
```

This creates the natural-looking "taking turns" pattern seen in Arkham-style combat, adapted for a shooter context.

---

## 6. Encounter Design

### Room Composition

Enemies alone aren't interesting. Encounters are interesting when archetypes are combined to create pressure from multiple directions:

**Basic principles:**

| Principle | Example |
|-----------|---------|
| **Crossfire** | Turret on one side + charger from the other |
| **Priority puzzle** | Support buffing grunts — kill support first? |
| **Zone denial** | Bomber limiting safe space + swarmers closing in |
| **Tank & DPS** | Shield bearer protecting a shooter behind it |
| **Flanking** | Ranged enemies orbit while melee approaches head-on |

### Wave Spawning

Rooms spawn enemies in waves, not all at once:

1. **Wave 1:** Introductory — lighter enemies, gives player time to orient
2. **Wave 2:** Escalation — adds a new archetype or increases count
3. **Wave 3 (optional):** Climax — elite variant or difficult combination

New waves trigger when the previous wave is cleared (or reaches a low threshold like 1-2 remaining).

### Spawn Positioning

- Enemies spawn from room edges, doorways, or designated spawn points
- Never spawn on top of or immediately adjacent to the player
- Minimum spawn distance: ~200px from player
- Brief spawn animation (0.3-0.5s) during which the enemy is visible but invulnerable and doesn't attack — gives the player time to register the new threat

### Encounter Budget

Assign point values to enemy types. Each room has a budget based on floor depth:

| Type | Cost |
|------|------|
| Swarmer | 1 |
| Grunt | 2 |
| Shooter | 3 |
| Charger | 3 |
| Bomber | 4 |
| Shield Bearer | 4 |
| Teleporter | 5 |
| Support | 5 |
| Turret | 5 |
| Elite (any) | base cost × 2 |

**Room budgets by floor:**

| Floor | Budget | Max Enemies | Max Waves |
|-------|--------|-------------|-----------|
| 1 | 8-12 | 6 | 2 |
| 2 | 12-18 | 8 | 2 |
| 3 | 18-24 | 10 | 3 |
| 4 | 24-32 | 12 | 3 |
| 5 | 32-40 | 14 | 3 |

### Difficulty Scaling

Difficulty increases across a run through multiple levers:

| Lever | Effect |
|-------|--------|
| **New archetypes** | Later floors introduce harder enemy types |
| **Shorter telegraphs** | Same enemies, less reaction time |
| **Faster bullets** | Projectiles speed up 10-20% per floor |
| **Tighter rooms** | Less space to dodge |
| **Elite variants** | Color-tinted enemies with 2x HP and modified attacks |
| **Harder compositions** | More synergistic archetype combinations |

**Elite variants:** Any base enemy can become an elite. Elites have double HP, slightly faster attacks, and one additional mechanic (e.g., elite grunt fires a 3-bullet spread instead of single; elite charger leaves a fire trail).

---

## 7. Fairness Tricks

These are the invisible systems that make combat feel fair:

### Staggered First Shots

Each enemy's first attack is delayed by a random 0.3-1.0s after entering CHASE. This prevents the "wall of bullets on room entry" problem.

### Post-Spawn Grace Period

Newly spawned enemies wait 0.5-1.0s before attacking. They may approach during this time but won't fire. This gives the player time to register them visually.

### Damage Grace Period (Player I-Frames)

After taking damage, the player has brief invulnerability (0.3-0.5s, existing via the Invincible component). This prevents multi-hit stacking from overlapping sources.

### Maximum Simultaneous Attackers

The attack token system (Section 5) limits concurrent attacks. Even in a room of 10 enemies, only 2-3 fire at once.

### Readable Bullet Speeds

Enemy bullets should always be slow enough to dodge on reaction if the player is watching. Bullet speed should never exceed ~70% of the player's movement speed.

### No Off-Screen Spawns in Danger Zone

Enemies may spawn off-screen, but never in a position where they can immediately attack the player without the player first seeing them enter the screen.

---

## 8. Boss Design

Bosses are handcrafted encounters with multi-phase behavior.

### Structure

Each boss has 3 phases based on HP thresholds:

| Phase | HP Range | Behavior |
|-------|----------|----------|
| Phase 1 | 100-66% | Core pattern, learnable rhythm |
| Phase 2 | 66-33% | Adds new attack, increases speed |
| Phase 3 | 33-0% | Desperation — faster patterns, more bullets, possible adds |

Phase transitions should include a brief invulnerability window with a visual/audio cue (the boss reacting to damage), giving the player a beat to breathe.

### Boss vs Regular Enemy AI

| Aspect | Regular Enemy | Boss |
|--------|--------------|------|
| State machine | 5-6 states | 8-12 states (phases × attack types) |
| Attack variety | 1 attack type | 3-5 attack patterns per phase |
| Stagger | Staggers on threshold damage | Stagger-immune (or only during specific windows) |
| Pathfinding | Flow field / simple seek | Scripted positioning + custom movement |
| Attack tokens | Shares room-level pool | N/A (solo encounter) |

### Pattern Design

Boss attacks should combine multiple bullet pattern types:

```
Phase 1, Attack A: Aimed spread (3 bullets at player)
Phase 1, Attack B: Ring of 12 bullets (dodge through gap)

Phase 2, Attack A: Aimed spread (5 bullets, faster)
Phase 2, Attack B: Ring + spiral overlay
Phase 2, Attack C: Summon 3 grunts

Phase 3, Attack A: Continuous aimed burst (6 bullets, 0.1s apart)
Phase 3, Attack B: Double ring (inner + outer, offset gaps)
Phase 3, Attack C: Charge across room + bullet trail
```

Bosses should cycle through attacks in a pattern that the player can learn, with minor randomization to prevent pure memorization.

---

## 9. ECS Implementation

All enemy AI lives in `packages/shared/src/sim/`.

### Components

```typescript
// === Identity ===
const Enemy = {
  type: Uint8Array,     // archetype enum (GRUNT, CHARGER, SHOOTER, etc.)
  tier: Uint8Array,     // 0=normal, 1=elite, 2=boss
}

// === Health ===
const Health = {
  current: Float32Array,
  max: Float32Array,
  iframes: Float32Array,       // remaining invulnerability time
}

// === AI State ===
const EnemyAI = {
  state: Uint8Array,           // FSM state enum
  stateTimer: Float32Array,    // time elapsed in current state
  targetEid: Uint16Array,      // entity being targeted (player)
  initialDelay: Float32Array,  // random first-attack delay
}

// === Detection ===
const Detection = {
  aggroRange: Float32Array,
  attackRange: Float32Array,
  losRequired: Uint8Array,     // 0 or 1
}

// === Attack Configuration ===
const AttackConfig = {
  telegraphDuration: Float32Array,
  recoveryDuration: Float32Array,
  cooldown: Float32Array,
  cooldownRemaining: Float32Array,
  damage: Uint8Array,
  projectileSpeed: Float32Array,
  projectileCount: Uint8Array,
  spreadAngle: Float32Array,
}

// === Steering ===
const Steering = {
  seekWeight: Float32Array,
  separationWeight: Float32Array,
  preferredRange: Float32Array,
  separationRadius: Float32Array,
}
```

The existing `Position`, `Velocity`, `Speed`, `Collider` components are reused from the player system.

### System Pipeline

Enemy AI systems execute in this order within the shared `stepWorld`:

```
playerInputSystem         (existing)
rollSystem                (existing)
weaponSystem              (existing)
bulletSystem              (existing)

enemyDetectionSystem      — aggro checks, LOS, target selection
enemyAISystem             — FSM transitions, state timer updates
enemySteeringSystem       — compute desired velocity per-state
enemySeparationSystem     — push enemies apart
enemyAttackSystem         — handle telegraph/attack/recovery, spawn projectiles

movementSystem            (existing — moves all entities with Position+Velocity)
bulletCollisionSystem     (existing)
collisionSystem           (existing)
```

### State Machine in ECS

The enum-in-component approach is simplest for bitECS:

```typescript
const AIState = {
  IDLE: 0,
  CHASE: 1,
  TELEGRAPH: 2,
  ATTACK: 3,
  RECOVERY: 4,
  STUNNED: 5,
  FLEE: 6,
} as const

function enemyAISystem(world: GameWorld, dt: number): void {
  const enemies = enemyAIQuery(world)
  for (const eid of enemies) {
    EnemyAI.stateTimer[eid] += dt

    switch (EnemyAI.state[eid]) {
      case AIState.IDLE:
        // Check if player in aggro range → transition to CHASE
        break
      case AIState.CHASE:
        // Check if in attack range → TELEGRAPH
        // Check if player left aggro range × 2 → IDLE
        break
      case AIState.TELEGRAPH:
        // Timer expired → ATTACK
        break
      case AIState.ATTACK:
        // Spawn projectiles, then → RECOVERY
        break
      case AIState.RECOVERY:
        // Timer expired → CHASE
        break
      case AIState.STUNNED:
        // Timer expired → CHASE
        break
    }
  }
}
```

State transitions reset the timer:
```typescript
function transitionState(eid: number, newState: number): void {
  EnemyAI.state[eid] = newState
  EnemyAI.stateTimer[eid] = 0
}
```

### Prefab Functions

Each archetype is a prefab that sets component values:

```typescript
function spawnGrunt(world: GameWorld, x: number, y: number): number {
  const eid = addEntity(world)
  // Position, Velocity, Speed, Collider (shared with player)
  // Enemy type + tier
  // EnemyAI initial state
  // Detection ranges
  // AttackConfig (single bullet, 1.5s cooldown)
  // Steering weights (seek=1, separation=0.5)
  // Health
  return eid
}
```

### Flow Field (Shared Pathfinding)

The flow field is world-level shared state, not per-entity:

```typescript
interface FlowField {
  width: number
  height: number
  cellSize: number
  dirX: Float32Array   // one per cell
  dirY: Float32Array   // one per cell
  dist: Uint16Array    // distance to player per cell
  playerCellX: number  // last computed player cell
  playerCellY: number
}
```

Recompute when the player moves to a new cell. All enemies read from the same field during their steering system.

---

## 10. Performance Considerations

### Spatial Hashing

For proximity queries (separation, aggro detection, damage), use a spatial hash grid:

- **Cell size:** ~64px (2x largest collider radius)
- **Rebuild:** Clear and re-insert all dynamic entities each tick
- **Static hash:** Built once at room load for walls/obstacles

### Entity Budget

Reasonable limits for a twitchy top-down game where readability matters:

| Scenario | Max Enemies | Rationale |
|----------|-------------|-----------|
| Standard room | 10-12 | Readable, fair |
| Hard room | 14-16 | Challenging but parseable |
| Boss + adds | 1 boss + 6 adds | Boss is focal point |
| Swarm event | 20-30 (swarmers only) | Simple AI, contact damage only |

### AI Update Frequency

- FSM state transitions: every tick (cheap — a switch statement)
- Steering calculations: every tick (vector math)
- LOS checks: every 3-5 ticks (Bresenham is fast but not free)
- Flow field recompute: only when player changes tile cell
- Separation: every tick (required for visual quality)

### Enemy Pooling

Enemies are frequently spawned and despawned. Reuse entity IDs via a pool to avoid entity ID exhaustion in bitECS. Reset all component values on recycle.

---

## Tuning Guidelines

Start with these values and iterate through playtesting:

| Parameter | Starting Value | Notes |
|-----------|---------------|-------|
| Aggro range | 250px | ~8 tiles |
| Attack range (melee) | 40px | Just outside collider |
| Attack range (ranged) | 200px | ~6 tiles |
| Telegraph duration | 0.4s | Shorten for difficulty |
| Recovery duration | 0.5s | The punish window |
| Attack cooldown | 2.0s | Time between attacks |
| Enemy bullet speed | 150 px/s | ~50% of player bullet |
| Separation radius | 24px | Prevents stacking |
| Max simultaneous attackers | 3 | Room-level cap |
| Stagger threshold | 2 damage | Only big hits stagger |
| Spawn grace period | 0.5s | Before first attack |
| LOS check interval | 5 ticks (~83ms) | Amortized cost |

---

## References

### Game-Specific

- [Q&A: The guns and dungeons of Enter the Gungeon](https://www.gamedeveloper.com/design/q-a-the-guns-and-dungeons-of-i-enter-the-gungeon-i-) — Design philosophy for enemy/bullet patterns
- [Performative Game Development: Nuclear Throne (GDC)](https://gdcvault.com/play/1020034/Performative-Game-Development-The-Design) — Game feel and enemy design at Vlambeer
- [An Analysis of Hotline Miami AI](https://medium.com/@RodFernandez91/an-analysis-of-hotline-miami-ai-23c37dbcb156) — 6-state FSM breakdown
- [Coding Enemy AI Patterns Inspired by Hades](https://codegeekology.com/coding-enemy-ai-patterns-inspired-by-hades/) — Practical implementation

### AI Techniques

- [Designing a Simple Game AI using Finite State Machines](https://www.gamedeveloper.com/programming/designing-a-simple-game-ai-using-finite-state-machines) — FSM fundamentals
- [Introduction to Steering Behaviours](https://www.gamedeveloper.com/design/introduction-to-steering-behaviours) — Seek, flee, arrive, separation
- [The Incredible Power of Dijkstra Maps](https://www.roguebasin.com/index.php/The_Incredible_Power_of_Dijkstra_Maps) — Flow field pathfinding for roguelikes
- [Flow Field Pathfinding](https://www.redblobgames.com/pathfinding/tower-defense/) — Red Blob Games visual guide

### Combat Design

- [Enemy Attacks and Telegraphing](https://www.gamedeveloper.com/design/enemy-attacks-and-telegraphing) — Wind-up/attack/recovery framework
- [Keys to Combat Design: Anatomy of an Attack](https://gdkeys.com/keys-to-combat-design-1-anatomy-of-an-attack/) — The three phases of attack design
- [AI Keys to Believable Enemies](https://gdkeys.com/ai-keys-to-believable-enemies/) — Attack slots, coordination, fairness

### ECS & Performance

- [Entity Component System and Game AI Techniques](https://mzaks.medium.com/entity-component-system-and-game-ai-techniques-f439eb69b5d2) — AI patterns in ECS
- [Spatial Partition — Game Programming Patterns](https://gameprogrammingpatterns.com/spatial-partition.html) — Spatial hashing
