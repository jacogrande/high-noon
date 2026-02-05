# systems/

Individual ECS systems that operate on the game world.

## Responsibilities

Each system handles one aspect of gameplay:

- `movement.ts` - Apply velocity to position
- `collision.ts` - Detect and resolve collisions
- `bullet.ts` - Bullet lifetime, spawning, despawning
- `damage.ts` - Apply damage, check death conditions
- `weapon.ts` - Weapon cooldowns, firing logic
- `ai.ts` - Enemy behavior and decision-making
- `pickup.ts` - Item collection and effects
- `player.ts` - Player input processing

## Execution Order

Systems run in a specific order each tick:

1. Input processing (player intentions)
2. AI decisions
3. Weapon/ability activation
4. Movement
5. Collision detection
6. Damage application
7. Cleanup (remove dead entities)

## Design Pattern

Systems should:
- Take `world` and `dt` (delta time) as parameters
- Return or accumulate events for side-effects
- Never directly cause I/O or rendering
- Be deterministic given the same world state
