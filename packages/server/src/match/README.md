# match/

Match loop and gameplay orchestration.

## Responsibilities

- Run the fixed 60 Hz tick loop
- Buffer and process player inputs
- Step the shared simulation
- Emit snapshots and events to clients
- Performance monitoring

## Key Files

- `matchLoop.ts` - Tick scheduling, simulation stepping
- `inputBuffer.ts` - Per-player input ring buffers, seq/ack
- `interest.ts` - (Optional) Only send relevant entities to each player

## Tick Loop

```typescript
setInterval(() => {
  // 1. Collect inputs from buffers
  const inputs = this.inputBuffer.drain()

  // 2. Apply inputs to simulation
  applyInputs(this.world, inputs)

  // 3. Step simulation
  const events = stepSimulation(this.world, TICK_MS)

  // 4. Broadcast results
  this.broadcastSnapshot()
  this.broadcastEvents(events)

  this.tick++
}, TICK_MS)
```

## Input Buffer

Per-player ring buffer handling:
- Inputs arrive with sequence numbers
- Buffer inputs until tick processes them
- Track last acknowledged input per player
- Discard old/duplicate inputs

## Interest Management

For larger player counts, only send data relevant to each player:
- Nearby entities
- Global events (boss spawns, wave starts)
- Player's own state always included

## Dependencies

- `@high-noon/shared` - Simulation, protocol
- `../rooms` - Integration with Colyseus room
