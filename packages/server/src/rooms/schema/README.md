# schema/

Colyseus schema definitions for synchronized state.

## Responsibilities

- Define the structure of automatically-synced room state
- Keep synced state minimal — entity state goes via binary snapshots
- Provide typed access to lobby metadata on both server and client

## Key Files

- `GameRoomState.ts` - Root state schema (`GameRoomState`) and per-player metadata (`PlayerMeta`)

## Design Philosophy

**Keep it small.** Schema sync is used only for lobby metadata (phase, player names, tick counter). All entity state (positions, health, enemies, bullets) is sent via binary snapshots at 30Hz using `encodeSnapshot`/`sendBytes`.

**What is synced via schema (10Hz):**
- Game phase (`lobby` / `playing`)
- Player metadata (name, character, ready flag)
- Server tick counter

**What is synced via binary snapshots (30Hz):**
- All entity positions, health, state
- Enemy and bullet data

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
