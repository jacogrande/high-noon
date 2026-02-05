# systems/

Individual ECS systems that operate on the game world.

## Current Systems

- `playerInput.ts` - Convert input to player velocity, initiate rolls
- `roll.ts` - Manage roll state, i-frames, and locked velocity
- `weapon.ts` - Handle firing, cooldowns, spawn bullets
- `bullet.ts` - Track bullet distance traveled, despawn at range/lifetime
- `movement.ts` - Apply velocity to position, store previous for interpolation
- `collision.ts` - Circle vs tilemap and circle vs circle collision detection/resolution

## Planned Systems
- `damage.ts` - Apply damage, check death conditions
- `ai.ts` - Enemy behavior and decision-making
- `pickup.ts` - Item collection and effects

## Execution Order

Systems run in a specific order each tick:

1. Player input processing (converts input to velocity, initiates rolls)
2. Roll system (applies roll velocity, manages i-frames)
3. Weapon system (spawns bullets at current position before movement)
4. Bullet system (tracks distance traveled, despawns at range/lifetime)
5. AI decisions (future)
6. Movement (applies velocity, stores prev position)
7. Collision resolution (pushes entities out of walls/each other)
8. Damage application (future)
9. Cleanup (future)

## Design Pattern

Systems should:
- Use `defineQuery` to create queries outside the function
- Take `world`, `dt`, and optionally `input` as parameters
- Store previous state for interpolation where needed
- Never directly cause I/O or rendering
- Be deterministic given the same world state

```typescript
import { defineQuery } from 'bitecs'

const playerQuery = defineQuery([Player, Velocity, Speed])

export function playerInputSystem(
  world: GameWorld,
  _dt: number,
  input?: InputState
): void {
  if (!input) return
  for (const eid of playerQuery(world)) {
    Velocity.x[eid] = input.moveX * Speed.max[eid]!
    Velocity.y[eid] = input.moveY * Speed.max[eid]!
  }
}
```
