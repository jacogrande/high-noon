# systems/

Individual ECS systems that operate on the game world.

## Current Systems

- `playerInput.ts` - Convert input to player velocity, initiate rolls
- `roll.ts` - Manage roll state, i-frames, and locked velocity
- `weapon.ts` - Handle firing, cooldowns, spawn bullets
- `bullet.ts` - Track bullet distance traveled, despawn at range/lifetime
- `movement.ts` - Apply velocity to position, store previous for interpolation
- `bulletCollision.ts` - Bullet vs entity (circle-circle, layer filtering) and bullet vs tilemap
- `health.ts` - Iframe countdown, death processing (Dead tag for players, removeEntity for others)
- `collision.ts` - Circle vs tilemap and circle vs circle collision detection/resolution
- `debugSpawn.ts` - Debug: spawn test enemy bullets on DEBUG_SPAWN button press

## Planned Systems
- `ai.ts` - Enemy behavior and decision-making
- `pickup.ts` - Item collection and effects

## Execution Order

Systems run in a specific order each tick:

1. Player input processing (converts input to velocity, initiates rolls)
2. Roll system (applies roll velocity, manages i-frames)
3. Weapon system (spawns bullets at current position before movement)
4. Debug spawn (test enemy bullets, edge-detected)
5. Bullet system (tracks distance traveled, despawns at range/lifetime)
6. AI decisions (future)
7. Movement (applies velocity, stores prev position)
8. Bullet collision (entity hits then wall hits, despawns bullets)
9. Health system (iframe countdown, death processing)
10. Collision resolution (pushes entities out of walls/each other)

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
