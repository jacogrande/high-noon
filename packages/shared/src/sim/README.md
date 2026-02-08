# sim/

The core game simulation using bitECS.

## Responsibilities

- ECS world creation and management
- Component definitions (Position, Velocity, Player, Health, Dead, etc.)
- Game systems (movement, player input, combat, health)
- Fixed timestep stepping with system registry
- Entity prefab factories

## Key Files

- `world.ts` - ECS world creation and type definitions
- `step.ts` - System registry and world stepping
- `components.ts` - All component definitions
- `prefabs.ts` - Entity factory functions (spawnPlayer, etc.)
- `tilemap.ts` - Tilemap data structure and collision helpers
- `upgrade.ts` - Skill tree state, stat recomputation, and ECS stat writing
- `hooks.ts` - HookRegistry for behavioral node effects (transform + notify hooks)
- `systems/` - Individual system implementations
- `content/` - Data-driven game content definitions

## Design Pattern

Systems are pure functions that:
1. Query entities with specific components using `defineQuery`
2. Update component data
3. Emit events for side-effects (damage dealt, entity spawned, etc.)

```typescript
import { defineQuery } from 'bitecs'

const movingQuery = defineQuery([Position, Velocity])

function movementSystem(world: GameWorld, dt: number): void {
  for (const eid of movingQuery(world)) {
    Position.prevX[eid] = Position.x[eid]!
    Position.prevY[eid] = Position.y[eid]!
    Position.x[eid] = Position.x[eid]! + Velocity.x[eid]! * dt
    Position.y[eid] = Position.y[eid]! + Velocity.y[eid]! * dt
  }
}
```

## System Registry

Systems are registered and executed via `SystemRegistry`. Use `registerAllSystems` to register all 19 systems in canonical order:

```typescript
import { createSystemRegistry, registerAllSystems, stepWorld } from '@high-noon/shared'

const systems = createSystemRegistry()
registerAllSystems(systems)

stepWorld(world, systems, input)  // Single-player (passes input to all players)
stepWorld(world, systems)         // Server (reads world.playerInputs per-entity)
```

## Player Registry

For multiplayer, players are registered by session ID:

```typescript
import { addPlayer, removePlayer } from '@high-noon/shared'

const eid = addPlayer(world, sessionId)
removePlayer(world, sessionId)
```

## Shared Queries

`queries.ts` provides cached queries used by multiple systems:

- `playerQuery` — All player entities with Position
- `getAlivePlayers(world)` — Alive players only (per-tick WeakMap cache)

## Dependencies

- `bitecs` - ECS library
- `../math` - Vector operations
- `../net` - Input types
