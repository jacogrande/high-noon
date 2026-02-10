# rooms/

Colyseus room definitions.

## Responsibilities

- Define room types (game room)
- Handle player join/leave lifecycle
- Bridge between Colyseus and shared simulation
- Input validation, clamping, and per-player routing

## Key Files

- `GameRoom.ts` - Main gameplay room (fixed-timestep sim loop, input routing, snapshot broadcast)
- `schema/` - Colyseus schema definitions for synced state

## GameRoom Lifecycle

```
onCreate()    → Create GameWorld, register systems, start sim interval (60Hz)
onJoin()      → validate character, addPlayer to ECS with per-player runtime state, send authoritative game-config
onMessage()   → Validate + clamp input, push to per-player queue
onLeave()     → removePlayer from ECS, cleanup slot
onDispose()   → Clear slots, log
```

## Input Handling

Inputs are validated (`isValidInput` rejects NaN/Infinity/non-numbers), rate-limited (per-client token bucket), and clamped (`clampInput` enforces safe ranges) before queuing. Each `serverTick` pops one input per player from their queue (or uses frozen neutral input if empty).

```typescript
this.onMessage('input', (client, data) => {
  if (!isValidInput(data)) return
  slot.inputQueue.push(clampInput(data))
})
```

## State Sync Strategy

**Sync via schema** (automatic, 10Hz):
- Game phase (lobby/playing)
- Player metadata (name, ready)
- Server tick counter

**Sync via binary snapshots** (manual, 20Hz):
- Full entity state via `encodeSnapshot` → `sendBytes`
- Per-client HUD payloads are sent at 10Hz (`hud` message) with character-aware ability/cylinder fields.

## Dependencies

- `colyseus` - Room base class
- `./schema` - State schemas
- `@high-noon/shared` - Simulation, protocol, snapshot encoding
