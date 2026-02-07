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

Systems are registered and executed via `SystemRegistry`:

```typescript
const systems = createSystemRegistry()
systems.register(playerInputSystem)
systems.register(movementSystem)

stepWorld(world, systems, input)
```

## Dependencies

- `bitecs` - ECS library
- `../math` - Vector operations
- `../net` - Input types
