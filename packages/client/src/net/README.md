# net/

Client networking: connection management and snapshot interpolation.

## Current Files

- `NetworkClient.ts` - Colyseus connection wrapper (join, sendInput, snapshot/disconnect events)
- `SnapshotBuffer.ts` - Snapshot interpolation buffer for smooth rendering between 20Hz server updates

## NetworkClient

Wraps `colyseus.js` Client/Room with a typed event interface:

```typescript
const net = new NetworkClient('ws://localhost:2567')
net.on('game-config', (config) => { /* { seed, sessionId, playerEid } */ })
net.on('snapshot', (snapshot) => { /* decoded WorldSnapshot */ })
net.on('disconnect', () => { /* connection lost */ })
await net.join(options)
net.sendInput(inputState)
net.disconnect()  // leaves room, clears listeners
```

Snapshot messages arrive as binary (`sendBytes` on server) and are decoded via `decodeSnapshot` from shared.

## SnapshotBuffer

Stores recent snapshots with receive timestamps and computes interpolation state for rendering:

```typescript
const buffer = new SnapshotBuffer(100)  // 100ms interpolation delay
buffer.push(snapshot)                   // Called on each server snapshot

const interp = buffer.getInterpolationState()
// interp = { from: WorldSnapshot, to: WorldSnapshot, alpha: number }
```

- Buffer size: 10 snapshots (500ms at 20Hz)
- Interpolation delay: 100ms (2x snapshot interval for jitter resilience)
- Alpha is clamped to [0, 1]
- Returns null until 2+ snapshots are buffered

## Future

- Client-side prediction for local player
- Server reconciliation (rewind + replay unacknowledged inputs)
- Clock synchronization for render time estimation

## Dependencies

- `colyseus.js` - Multiplayer client SDK
- `@high-noon/shared` - Protocol types, snapshot decoding
