# schema/

Colyseus schema definitions for synchronized state.

## Responsibilities

- Define the structure of automatically-synced room state
- Keep synced state minimal for bandwidth efficiency
- Provide typed access to state on both server and client

## Key Files

- `RoomState.ts` - Root state schema
- `PlayerState.ts` - Per-player synced data

## Design Philosophy

**Keep it small.** Colyseus schema sync is great for structured data that changes frequently and needs to be consistent. But syncing thousands of entities (bullets) is wasteful.

**What to sync:**
- Player positions and health
- Key enemy positions (bosses, elite enemies)
- Run metadata (seed, wave, score)
- Room/round state

**What NOT to sync (use events instead):**
- Bullet positions
- Particle effects
- Transient visual entities

## Example Schema

```typescript
import { Schema, type, MapSchema } from '@colyseus/schema'

class PlayerState extends Schema {
  @type('number') x: number = 0
  @type('number') y: number = 0
  @type('number') health: number = 100
}

class RoomState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>()
  @type('number') tick: number = 0
  @type('number') seed: number = 0
}
```

## Dependencies

- `@colyseus/schema` - Schema decorators and types
