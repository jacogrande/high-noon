# schema/

Colyseus schema definitions for synchronized state.

## Responsibilities

- Define the structure of automatically-synced room state
- Keep synced state minimal — entity state goes via binary snapshots
- Provide typed access to lobby metadata on both server and client

## Key Files

- `GameRoomState.ts` - Root state schema (`GameRoomState`) and per-player metadata (`PlayerMeta`)

## Design Philosophy

**Keep it small.** Schema sync is used only for lobby metadata (phase, player names, tick counter). Player/enemy + ability state is sent via binary snapshots at 20Hz using `encodeSnapshot`/`sendBytes`, while bullets use dedicated lifecycle events.

**What is synced via schema (10Hz):**
- Game phase (`lobby` / `playing`)
- Player metadata (name, character, ready flag)
- Server tick counter

**What is synced via binary snapshots (20Hz):**
- All entity positions, health, state
- Enemy data + ability payloads (Last Rites zones, dynamites)

**What is synced via bullet lifecycle events:**
- `bullet-spawn`
- `bullet-despawn`

## Current Schema

```typescript
import { Schema, type, MapSchema } from '@colyseus/schema'

class PlayerMeta extends Schema {
  @type('string') name: string = ''
  @type('string') characterId: string = 'sheriff'
  @type('boolean') ready: boolean = false
}

class GameRoomState extends Schema {
  @type('string') phase: string = 'lobby'
  @type({ map: PlayerMeta }) players = new MapSchema<PlayerMeta>()
  @type('uint32') serverTick: number = 0
}
```

## Dependencies

- `@colyseus/schema` - Schema decorators and types
