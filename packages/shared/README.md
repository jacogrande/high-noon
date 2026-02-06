# @high-noon/shared

The shared game core. Everything gameplay-critical lives here so it can run on both server (authoritative) and client (prediction/replays).

## Responsibilities

- Deterministic game simulation (ECS world, systems, fixed timestep)
- Network protocol definitions and serialization
- Game content definitions (weapons, enemies, items)
- Math utilities and vector operations
- Replay recording/playback infrastructure

## Design Principles

- **Deterministic**: Given the same inputs and seed, produce identical results
- **Pure-ish systems**: Gameplay updates are pure functions over data
- **Events for side-effects**: Systems emit events rather than causing side-effects directly
- **No rendering or I/O**: This package has no dependencies on browser/server APIs

## Commands

```bash
bun run build      # Compile TypeScript to dist/
bun run dev        # Watch mode compilation
bun run typecheck  # Type check without emitting
bun test           # Run unit tests
```

## Dependencies

- `bitecs` - Entity Component System

## Dependents

- `@high-noon/client` - Imports for client-side prediction and rendering
- `@high-noon/server` - Imports for authoritative simulation

## Modules

### `math/` - Vector Math

2D vector utilities for game math:

```typescript
import { create, add, normalize, distance } from '@high-noon/shared'

const pos = create(100, 200)
const vel = create(5, 0)
const nextPos = add(pos, vel)
```

Functions: `create`, `add`, `sub`, `scale`, `normalize`, `length`, `dot`, `lerp`, `angle`, `fromAngle`, `distance`, `distanceSq`, `rotate`, `negate`, `perpendicular`, `equals`

### `sim/` - Game Simulation

ECS world and components:

```typescript
import {
  createGameWorld,
  createSystemRegistry,
  stepWorld,
  movementSystem,
  playerInputSystem,
} from '@high-noon/shared'

const world = createGameWorld()
const systems = createSystemRegistry()
systems.register(playerInputSystem)
systems.register(movementSystem)

stepWorld(world, systems, input)  // Advance by one tick
```

**Components:**
- `Position` - World position with previous for interpolation
- `Velocity` - Movement speed in pixels/second
- `Player` - Player entity marker with ID and aim angle
- `PlayerState` - Current state (IDLE, MOVING, ROLLING)
- `Speed` - Movement speed values
- `Roll` - Roll state (duration, elapsed, direction, i-frame ratio)
- `Collider` - Collision radius and layer
- `Bullet` - Projectile data (owner, damage, lifetime, range, distanceTraveled)
- `Weapon` - Weapon stats (fire rate, bullet speed, damage, range)
- `Invincible` - Tag for i-frame entities
- `Health` - Health with i-frames (current, max, iframes, iframeDuration)
- `Dead` - Tag for dead entities (players stay in world; non-players are removed)
- `Enemy` - Enemy marker with type and tier
- `EnemyAI` - AI state machine (state, stateTimer, targetEid, initialDelay)
- `Detection` - Aggro/attack ranges and LOS config
- `AttackConfig` - Attack timing, damage, projectile config, locked aim direction
- `Steering` - Movement behavior weights and separation

**Constants:**
- `TICK_RATE` = 60 (ticks per second)
- `TICK_S` = 1/60 (seconds per tick)
- `TICK_MS` = 16.67 (milliseconds per tick)

**Enums:**
- `PlayerStateType` - IDLE, MOVING, ROLLING
- `AIState` - IDLE, CHASE, TELEGRAPH, ATTACK, RECOVERY, STUNNED, FLEE
- `EnemyType` - SWARMER, GRUNT, SHOOTER, CHARGER
- `EnemyTier` - FODDER, THREAT

**Systems:**
- `playerInputSystem` - Converts input to velocity, initiates rolls
- `rollSystem` - Manages roll velocity, i-frames, and recovery
- `weaponSystem` - Handles firing, cooldown, and bullet spawning
- `bulletSystem` - Tracks bullet distance traveled, handles despawning
- `flowFieldSystem` - BFS pathfinding from player position (8-directional, recomputes on tile boundary change)
- `enemyDetectionSystem` - Aggro acquisition/loss with hysteresis (2x range), staggered LOS checks
- `enemyAISystem` - FSM state transitions (IDLE/CHASE/TELEGRAPH/ATTACK/RECOVERY/STUNNED), initial delay gating
- `enemyAttackSystem` - Attack execution: projectile spawning (Swarmer/Grunt/Shooter), charger charge with locked aim + contact damage
- `enemySteeringSystem` - Flow field seek, separation, shooter preferred-range orbiting
- `movementSystem` - Applies velocity to position, stores previous for interpolation
- `bulletCollisionSystem` - Bullet vs wall and bullet vs entity collision with layer filtering
- `healthSystem` - Damage processing, i-frame countdown, death handling
- `collisionSystem` - Resolves circle vs tilemap and circle vs circle collisions
- `debugSpawnSystem` - Debug bullet spawning (K key)

**Tilemap:**
```typescript
import {
  createTestArena,
  setWorldTilemap,
  isSolidAt,
} from '@high-noon/shared'

const tilemap = createTestArena()
setWorldTilemap(world, tilemap)

// Check if a point is solid
if (isSolidAt(tilemap, worldX, worldY)) {
  // Collision!
}
```

**Prefabs:**
```typescript
import {
  spawnPlayer, spawnBullet,
  spawnSwarmer, spawnGrunt, spawnShooter, spawnCharger,
} from '@high-noon/shared'

const playerId = spawnPlayer(world, x, y)  // Creates player with weapon

const bulletId = spawnBullet(world, {
  x, y,           // Position
  vx, vy,         // Velocity
  damage: 10,
  range: 400,     // Max travel distance in pixels
  ownerId: playerId,
})

// Enemy prefabs — each creates a fully configured enemy entity
const swarmerId = spawnSwarmer(world, x, y)   // Fast fragile fodder (1 HP)
const gruntId = spawnGrunt(world, x, y)       // Sturdy melee fodder (3 HP)
const shooterId = spawnShooter(world, x, y)   // Ranged threat (3 HP, 3-bullet spread)
const chargerId = spawnCharger(world, x, y)   // Heavy threat (5 HP, contact damage)
```

**Content:**
- `PLAYER_SPEED` = 250 pixels/second
- `PLAYER_RADIUS` = 16 pixels
- `ROLL_DURATION` = 0.3 seconds
- `ROLL_IFRAME_RATIO` = 0.5 (first 50% invincible)
- `ROLL_SPEED_MULTIPLIER` = 2.0
- `PISTOL_FIRE_RATE` = 5 shots/second
- `PISTOL_BULLET_SPEED` = 600 pixels/second
- `PISTOL_BULLET_DAMAGE` = 10
- `PISTOL_RANGE` = 400 pixels
- `BULLET_RADIUS` = 4 pixels
- `BULLET_LIFETIME` = 5.0 seconds (failsafe)
- `ENEMY_BULLET_RANGE` = 500 pixels
- `PLAYER_HP` = 5
- `PLAYER_IFRAME_DURATION` = 0.5 seconds
- Enemy content (per type): `*_SPEED`, `*_RADIUS`, `*_HP`, `*_AGGRO_RANGE`, `*_ATTACK_RANGE`, `*_TELEGRAPH`, `*_RECOVERY`, `*_COOLDOWN`, `*_DAMAGE`, `*_SEPARATION_RADIUS`, `*_BUDGET_COST`, `*_TIER`
- `CHARGER_CHARGE_SPEED` = 300 pixels/second
- `CHARGER_CHARGE_DURATION` = 0.4 seconds
- `TILE_SIZE` = 32 pixels
- `ARENA_WIDTH` = 25 tiles (800px)
- `ARENA_HEIGHT` = 19 tiles (608px)

### `net/` - Network Protocol

Input state definitions:

```typescript
import { createInputState, hasButton, Button } from '@high-noon/shared'

const input = createInputState()
if (hasButton(input, Button.SHOOT)) {
  // Fire weapon
}
```

**Button flags:** `MOVE_UP`, `MOVE_DOWN`, `MOVE_LEFT`, `MOVE_RIGHT`, `SHOOT`, `ROLL`

## Directory Structure

```
src/
  index.ts           # Barrel export
  math/
    vec2.ts          # 2D vector math
    vec2.test.ts     # Unit tests
    index.ts
  sim/
    components.ts    # ECS component definitions
    world.ts         # World creation
    step.ts          # Fixed timestep logic
    prefabs.ts       # Entity factory functions
    tilemap.ts       # Tilemap data structure and helpers
    systems/
      movement.ts    # Apply velocity to position
      playerInput.ts # Convert input to velocity, initiate rolls
      roll.ts        # Roll velocity, i-frames, recovery
      collision.ts   # Circle vs tilemap/circle collision
      weapon.ts      # Firing, cooldown, bullet spawning
      bullet.ts      # Bullet distance tracking, despawning
      bulletCollision.ts # Bullet vs wall/entity collision
      health.ts      # Damage processing, i-frames, death
      debugSpawn.ts  # Debug bullet spawning
      flowField.ts   # BFS pathfinding from player position
      enemyDetection.ts  # Aggro, LOS, target selection
      enemyAI.ts     # FSM state transitions
      enemyAttack.ts # Attack execution (projectiles, charger charge)
      enemySteering.ts   # Seek, separation, orbiting
      index.ts
    content/
      player.ts      # Player constants
      weapons.ts     # Weapon and bullet constants
      enemies.ts     # Enemy type definitions (4 archetypes, 2 tiers)
      maps/
        testArena.ts # Test arena map
      index.ts
    index.ts
  net/
    input.ts         # Input state types
    index.ts
```
