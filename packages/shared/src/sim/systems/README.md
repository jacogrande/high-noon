# systems/

Individual ECS systems that operate on the game world.

## Current Systems

- `playerInput.ts` - Convert input to player velocity, initiate rolls
- `roll.ts` - Manage roll state, i-frames, locked velocity, and dodge detection (onRollDodge hook)
- `showdown.ts` - Showdown ability: mark enemy, speed bonus, kill detection, cooldown, onShowdownActivate hook
- `cylinder.ts` - Revolver cylinder: reload state machine, fire cooldown, auto-reload
- `weapon.ts` - Handle firing, cooldowns, spawn bullets (cylinder-aware), onCylinderEmpty hook
- `bullet.ts` - Track bullet distance traveled, despawn at range/lifetime
- `bulletCollision.ts` - Bullet vs entity (circle-circle, layer filtering, Showdown pierce/bonus damage, hook-based pierce) and bullet vs tilemap
- `movement.ts` - Apply velocity to position, store previous for interpolation
- `health.ts` - Iframe countdown, death processing (Dead tag for players, removeEntity for others), XP awards, onKill hook
- `buffSystem.ts` - Timed buff state ticking (Last Stand timer); stat bonuses applied idempotently in writeStatsToECS
- `collision.ts` - Circle vs tilemap and circle vs circle collision detection/resolution
- `debugSpawn.ts` - Debug: spawn test enemy bullets on DEBUG_SPAWN button press
- `flowField.ts` - BFS pathfinding toward the player for enemy navigation
- `enemyDetection.ts` - Enemy target acquisition and LOS checks
- `enemyAI.ts` - Enemy AI state machine (idle, chase, telegraph, attack, recovery, stunned, flee)
- `enemySteering.ts` - Enemy steering behaviors (seek, separation)
- `enemyAttack.ts` - Enemy attack execution (projectiles, charger contact damage)
- `spatialHash.ts` - Rebuild spatial hash for broadphase collision queries
- `waveSpawner.ts` - Director-wave hybrid enemy spawning system

## Execution Order

Systems run in a specific order each tick:

1. `playerInputSystem` - Converts input to velocity, initiates rolls
2. `rollSystem` - Applies roll velocity, manages i-frames
3. `showdownSystem` - Showdown activation, kill check, speed bonus
4. `cylinderSystem` - Reload state machine, fire cooldown
5. `weaponSystem` - Spawns bullets at current position before movement
6. `debugSpawnSystem` - Test enemy bullets, edge-detected
7. `waveSpawnerSystem` - Enemy wave spawning
8. `bulletSystem` - Tracks distance traveled, despawns at range/lifetime
9. `flowFieldSystem` - BFS pathfinding toward player
10. `enemyDetectionSystem` - Target acquisition, LOS
11. `enemyAISystem` - AI state machine transitions
12. `spatialHashSystem` - Rebuild spatial hash
13. `enemySteeringSystem` - Steering behaviors
14. `enemyAttackSystem` - Attack execution
15. `movementSystem` - Applies velocity, stores prev position
16. `bulletCollisionSystem` - Entity hits then wall hits, Showdown pierce/bonus
17. `healthSystem` - Iframe countdown, death processing, XP, onKill hook
18. `buffSystem` - Timed buff ticking (Last Stand)
19. `collisionSystem` - Push-out resolution

## registerAllSystems

Both client and server use `registerAllSystems(systems)` to register all 19 systems in the canonical execution order. This prevents order divergence between client and server.

```typescript
import { createSystemRegistry, registerAllSystems } from '@high-noon/shared'

const systems = createSystemRegistry()
registerAllSystems(systems)
```

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
