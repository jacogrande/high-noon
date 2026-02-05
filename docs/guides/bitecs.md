# bitECS Guide

## Overview

bitECS is a minimal, flexible Entity Component System library optimized for performance. It uses a data-oriented design with Structure of Arrays (SoA) for cache-friendly iteration.

## Installation

```bash
bun add bitecs
```

## Core Concepts

### Entities

Entities are just numerical IDs - they have no data themselves:

```typescript
import { createWorld, addEntity, removeEntity } from 'bitecs'

const world = createWorld()
const playerId = addEntity(world)
const enemyId = addEntity(world)

// Later...
removeEntity(world, enemyId)
```

Entity IDs are recycled after removal. Track this carefully if storing IDs externally.

### Components

Components are data stores indexed by entity ID. Use Structure of Arrays (SoA) for performance:

```typescript
// Define component stores
const Position = {
  x: [] as number[],
  y: [] as number[],
}

const Velocity = {
  x: [] as number[],
  y: [] as number[],
}

const Health = {
  current: [] as number[],
  max: [] as number[],
}

// For better memory efficiency, use TypedArrays
const MAX_ENTITIES = 10000

const Position = {
  x: new Float32Array(MAX_ENTITIES),
  y: new Float32Array(MAX_ENTITIES),
}
```

### Adding Components to Entities

```typescript
import { addComponent } from 'bitecs'

const player = addEntity(world)
addComponent(world, player, Position)
addComponent(world, player, Velocity)
addComponent(world, player, Health)

// Set initial values
Position.x[player] = 400
Position.y[player] = 300
Velocity.x[player] = 0
Velocity.y[player] = 0
Health.current[player] = 100
Health.max[player] = 100
```

### Queries

Queries find entities with specific component combinations:

```typescript
import { query } from 'bitecs'

// Find all entities with Position and Velocity
for (const eid of query(world, [Position, Velocity])) {
  Position.x[eid] += Velocity.x[eid]
  Position.y[eid] += Velocity.y[eid]
}

// Find all entities with Health
for (const eid of query(world, [Health])) {
  if (Health.current[eid] <= 0) {
    removeEntity(world, eid)
  }
}
```

### Systems

bitECS doesn't have a formal system concept. Systems are just functions:

```typescript
function movementSystem(world: World) {
  for (const eid of query(world, [Position, Velocity])) {
    Position.x[eid] += Velocity.x[eid]
    Position.y[eid] += Velocity.y[eid]
  }
}

function healthSystem(world: World) {
  for (const eid of query(world, [Health])) {
    if (Health.current[eid] <= 0) {
      removeEntity(world, eid)
    }
  }
}

// Run systems in order
function step(world: World) {
  movementSystem(world)
  healthSystem(world)
}
```

## High Noon Integration

### Recommended Component Structure

```typescript
// packages/shared/src/sim/components.ts

export const Position = {
  x: new Float32Array(MAX_ENTITIES),
  y: new Float32Array(MAX_ENTITIES),
}

export const Velocity = {
  x: new Float32Array(MAX_ENTITIES),
  y: new Float32Array(MAX_ENTITIES),
}

export const Player = {
  id: new Uint8Array(MAX_ENTITIES),  // Player slot 0-7
  aimAngle: new Float32Array(MAX_ENTITIES),
}

export const Enemy = {
  type: new Uint8Array(MAX_ENTITIES),
  aiState: new Uint8Array(MAX_ENTITIES),
}

export const Bullet = {
  ownerId: new Uint16Array(MAX_ENTITIES),
  damage: new Uint8Array(MAX_ENTITIES),
  lifetime: new Float32Array(MAX_ENTITIES),
}

export const Health = {
  current: new Float32Array(MAX_ENTITIES),
  max: new Float32Array(MAX_ENTITIES),
}

export const Collider = {
  radius: new Float32Array(MAX_ENTITIES),
  layer: new Uint8Array(MAX_ENTITIES),  // Bitmask for collision layers
}
```

### System Organization

```
packages/shared/src/sim/systems/
  movement.ts     # Apply velocity to position
  collision.ts    # Detect and resolve collisions
  bullet.ts       # Update bullet lifetime, spawn/despawn
  damage.ts       # Apply damage, check death
  ai.ts           # Enemy behavior
  weapon.ts       # Weapon cooldowns, firing
  pickup.ts       # Item collection
```

### Example Systems

```typescript
// movement.ts
export function movementSystem(world: World, dt: number) {
  for (const eid of query(world, [Position, Velocity])) {
    Position.x[eid] += Velocity.x[eid] * dt
    Position.y[eid] += Velocity.y[eid] * dt
  }
}

// bullet.ts
export function bulletSystem(world: World, dt: number, events: GameEvent[]) {
  for (const eid of query(world, [Bullet, Position])) {
    Bullet.lifetime[eid] -= dt

    if (Bullet.lifetime[eid] <= 0) {
      removeEntity(world, eid)
    }
  }
}

// collision.ts
export function collisionSystem(world: World, events: GameEvent[]) {
  const bullets = query(world, [Bullet, Position, Collider])
  const enemies = query(world, [Enemy, Position, Collider, Health])

  for (const bulletEid of bullets) {
    const bx = Position.x[bulletEid]
    const by = Position.y[bulletEid]
    const br = Collider.radius[bulletEid]

    for (const enemyEid of enemies) {
      const ex = Position.x[enemyEid]
      const ey = Position.y[enemyEid]
      const er = Collider.radius[enemyEid]

      const dx = bx - ex
      const dy = by - ey
      const distSq = dx * dx + dy * dy
      const radiusSum = br + er

      if (distSq < radiusSum * radiusSum) {
        // Collision!
        Health.current[enemyEid] -= Bullet.damage[bulletEid]
        removeEntity(world, bulletEid)

        events.push({
          type: 'damage',
          targetId: enemyEid,
          amount: Bullet.damage[bulletEid],
          sourceId: Bullet.ownerId[bulletEid],
        })
        break
      }
    }
  }
}
```

### Main Simulation Loop

```typescript
// packages/shared/src/sim/step.ts
import { createWorld } from 'bitecs'

export function createGameWorld() {
  return createWorld()
}

export function stepSimulation(world: World, dt: number): GameEvent[] {
  const events: GameEvent[] = []

  // Systems run in order
  inputSystem(world)
  weaponSystem(world, dt, events)
  movementSystem(world, dt)
  bulletSystem(world, dt, events)
  collisionSystem(world, events)
  damageSystem(world, events)
  aiSystem(world, dt)

  return events
}
```

### Prefabs (Entity Templates)

Create factory functions for common entity types:

```typescript
// prefabs.ts
export function spawnPlayer(world: World, playerId: number, x: number, y: number) {
  const eid = addEntity(world)

  addComponent(world, eid, Position)
  addComponent(world, eid, Velocity)
  addComponent(world, eid, Player)
  addComponent(world, eid, Health)
  addComponent(world, eid, Collider)

  Position.x[eid] = x
  Position.y[eid] = y
  Player.id[eid] = playerId
  Health.current[eid] = 100
  Health.max[eid] = 100
  Collider.radius[eid] = 16
  Collider.layer[eid] = LAYER_PLAYER

  return eid
}

export function spawnBullet(
  world: World,
  ownerId: number,
  x: number,
  y: number,
  vx: number,
  vy: number,
  damage: number
) {
  const eid = addEntity(world)

  addComponent(world, eid, Position)
  addComponent(world, eid, Velocity)
  addComponent(world, eid, Bullet)
  addComponent(world, eid, Collider)

  Position.x[eid] = x
  Position.y[eid] = y
  Velocity.x[eid] = vx
  Velocity.y[eid] = vy
  Bullet.ownerId[eid] = ownerId
  Bullet.damage[eid] = damage
  Bullet.lifetime[eid] = 2.0 // seconds
  Collider.radius[eid] = 4
  Collider.layer[eid] = LAYER_BULLET

  return eid
}
```

## Performance Tips

1. **Use TypedArrays** - Better memory layout and performance than regular arrays
2. **Keep components small** - Only store data that systems actually need
3. **Query once per system** - Don't call `query()` repeatedly in inner loops
4. **Avoid component churn** - Reuse entities when possible (object pooling at ECS level)
5. **Batch operations** - Process all entities in a system before moving to next system

## When to Use ECS

ECS shines when you have:
- Many similar entities (bullets, enemies, particles)
- Entities that share behaviors in different combinations
- Need for cache-friendly iteration
- Desire to add/remove behaviors without inheritance hierarchies

For a bullet-hell roguelite like High Noon, ECS is ideal for managing thousands of bullets and enemies efficiently.

## Resources

- [bitECS GitHub](https://github.com/NateTheGreatt/bitECS)
- [bitECS API Docs](https://github.com/NateTheGreatt/bitECS/blob/main/docs/API.md)
- [bitECS FAQ](https://github.com/NateTheGreatt/bitECS/blob/master/docs/FAQ.md)
