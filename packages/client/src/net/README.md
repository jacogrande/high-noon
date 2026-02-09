# net/

Client networking: connection management, clock sync, input buffering, and snapshot interpolation.

## Current Files

- `NetworkClient.ts` - Colyseus connection wrapper with auto-reconnect
- `SnapshotBuffer.ts` - Snapshot interpolation buffer for smooth rendering between 20Hz server updates
- `ClockSync.ts` - Server clock synchronization via ping/pong RTT estimation
- `InputBuffer.ts` - Input sequence buffer for server reconciliation (stores unacknowledged inputs)

## NetworkClient

Wraps `colyseus.js` Client/Room with a typed event interface:

```typescript
const net = new NetworkClient('ws://localhost:2567')
net.on('game-config', (config) => { /* { seed, sessionId, playerEid } */ })
net.on('snapshot', (snapshot) => { /* decoded WorldSnapshot */ })
net.on('disconnect', () => { /* connection permanently lost */ })
await net.join(options)       // Resolves after game-config received (10s timeout)
net.sendInput(inputState)
net.disconnect()              // Intentional leave, clears listeners
```

- Snapshot messages arrive as binary (`sendBytes` on server) and are decoded via `decodeSnapshot` from shared
- Snapshot decode errors are caught and logged (don't crash the game loop)
- **Auto-reconnect**: on unexpected disconnect, attempts reconnection with exponential backoff (5 attempts, 500ms-8s delay) using the Colyseus reconnection token. Only fires `disconnect` event after all attempts fail.

## SnapshotBuffer

Stores recent snapshots with receive timestamps and computes interpolation state for rendering:

```typescript
const buffer = new SnapshotBuffer(100)  // 100ms interpolation delay
buffer.push(snapshot)                   // Called on each server snapshot

const interp = buffer.getInterpolationState(serverTime)
// interp = { from: WorldSnapshot, to: WorldSnapshot, alpha: number }
```

- Buffer size: 10 snapshots (500ms at 20Hz)
- Interpolation uses server-time-based rendering when clock sync is converged
- Alpha is clamped to [0, 1]
- Returns null until 2+ snapshots are buffered

## ClockSync

Estimates server time offset via periodic ping/pong:

```typescript
const clock = new ClockSync()
clock.start((clientTime) => net.sendPing(clientTime))
clock.onPong(clientTime, serverTime)
clock.getServerTime()   // Current estimated server time
clock.isConverged()     // True after enough samples
clock.stop()
```

## InputBuffer

Stores sent inputs for server reconciliation replay:

```typescript
const buffer = new InputBuffer()
buffer.push(networkInput)                       // Store each sent input
buffer.acknowledgeUpTo(serverLastProcessedSeq)  // Discard acknowledged inputs
buffer.getPending()                             // Get unacknowledged inputs for replay
```

## Dependencies

- `colyseus.js` - Multiplayer client SDK
- `@high-noon/shared` - Protocol types, snapshot decoding
