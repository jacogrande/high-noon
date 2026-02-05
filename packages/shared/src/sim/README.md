# sim/

The core game simulation using bitECS.

## Responsibilities

- ECS world creation and management
- Component definitions (Position, Velocity, Health, etc.)
- Game systems (movement, collision, weapons, AI)
- Fixed timestep stepping
- Seeded RNG for deterministic spawns

## Key Files

- `world.ts` - ECS world, entity IDs, component storage
- `step.ts` - Fixed timestep accumulator, simulation stepping
- `rng.ts` - Seeded PRNG for deterministic behavior
- `components.ts` - All component definitions
- `systems/` - Individual system implementations
- `content/` - Data-driven game content definitions

## Design Pattern

Systems are pure functions that:
1. Query entities with specific components
2. Update component data
3. Emit events for side-effects (damage dealt, entity spawned, etc.)

```typescript
function movementSystem(world: World, dt: number): void {
  for (const eid of query(world, [Position, Velocity])) {
    Position.x[eid] += Velocity.x[eid] * dt
    Position.y[eid] += Velocity.y[eid] * dt
  }
}
```

## Dependencies

- `bitecs` - ECS library
- `../math` - Vector operations
- `../net` - Event types
