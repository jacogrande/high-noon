# @high-noon/server

The authoritative game server using Colyseus.

## Responsibilities

- Accept player connections and assign player IDs
- Run the authoritative game simulation at 60 Hz
- Process and validate player inputs
- Broadcast snapshots and events to clients
- Matchmaking and lobby management

## Architecture

Each match runs in a Colyseus Room:

```
Client connects → Join/create Room → Receive state
                                   → Send inputs
                                   → Receive snapshots + events
```

The server runs the shared simulation and is the source of truth for all gameplay outcomes.

## Dependencies

- `@high-noon/shared` - Simulation, protocol, content
- `colyseus` - Room-based multiplayer framework

## Directory Structure

```
src/
  rooms/     # Colyseus room definitions
  match/     # Match loop, input handling
  services/  # Matchmaking, persistence
```

## Key Design Constraints

1. **Keep synced state small** - Only sync essential data via Colyseus schema
2. **Use events for transient data** - Bullets, particles sent as events
3. **Validate all inputs** - Never trust client data
4. **Input sequencing** - Client inputs include monotonic `seq` numbers (`NetworkInput`). The server tracks `lastProcessedSeq` per player and includes it in snapshot broadcasts, enabling client-side prediction reconciliation.

## Configuration

TypeScript config must include:
```json
{
  "compilerOptions": {
    "useDefineForClassFields": false,
    "experimentalDecorators": true
  }
}
```

This is required for Colyseus schema decorators.
