# rooms/

Colyseus room definitions.

## Responsibilities

- Define room types (match, lobby)
- Handle player join/leave lifecycle
- Bridge between Colyseus and shared simulation
- Message routing between clients and game logic

## Key Files

- `MatchRoom.ts` - Main gameplay room
- `LobbyRoom.ts` - Pre-game lobby (optional)
- `schema/` - Colyseus schema definitions for synced state

## MatchRoom Lifecycle

```
onCreate()    → Initialize simulation, start tick loop
onJoin()      → Add player entity, assign ID
onMessage()   → Route input to match loop
onLeave()     → Remove player, handle disconnect
onDispose()   → Cleanup when room empty
```

## Message Handling

```typescript
this.onMessage('input', (client, data) => {
  const playerId = this.playerIds.get(client.sessionId)
  this.matchLoop.queueInput(playerId, data)
})
```

## State Sync Strategy

**Sync via schema** (automatic):
- Player health, position (quantized)
- Run metadata (seed, wave number)

**Sync via messages** (manual):
- Spawn events
- Damage events
- Transient entities

## Dependencies

- `colyseus` - Room base class
- `./schema` - State schemas
- `../match` - Match loop integration
- `@high-noon/shared` - Simulation, protocol
