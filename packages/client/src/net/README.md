# net/

Client networking: connection management, clock sync, input buffering, and snapshot interpolation.

## Current Files

- `NetworkClient.ts` - Colyseus connection wrapper with auto-reconnect
- `SnapshotBuffer.ts` - Snapshot interpolation buffer for smooth rendering between server updates
- `ClockSync.ts` - Server clock synchronization via ping/pong RTT estimation
- `InputBuffer.ts` - Input sequence buffer for server reconciliation (stores unacknowledged inputs)

## NetworkClient

Wraps `colyseus.js` Client/Room with a typed event interface:

```typescript
const net = new NetworkClient('ws://localhost:2567')
net.on('game-config', (config) => { /* { seed, sessionId, playerEid, characterId, roster? } */ })
net.on('lobby-state', (state) => { /* { phase, serverTick, players[] } */ })
net.on('player-roster', (roster) => { /* [{ eid, characterId }] */ })
net.on('snapshot', (snapshot) => { /* decoded WorldSnapshot */ })
net.on('incompatible-protocol', (reason) => { /* input/snapshot protocol mismatch */ })
net.on('disconnect', () => { /* connection permanently lost */ })
await net.join({ characterId: 'undertaker' }) // Resolves after game-config (10s timeout)
net.sendInput(inputState)
net.sendCharacter('prospector')
net.sendReady(true)
net.sendCampReady(true)
net.disconnect()              // Intentional leave, clears listeners
```

- Snapshot messages arrive as binary (`sendBytes` on server) and are decoded via `decodeSnapshot` from shared
- Current snapshot protocol (`v6`) includes jump state payload (`z`, `zVelocity`, jump edge-state flag) for reconciliation parity
- Snapshot decode errors are caught and logged (don't crash the game loop)
- Protocol mismatches (snapshot or input shape/version) trigger `incompatible-protocol`, force room leave, disable reconnect, and then emit `disconnect`
- Join options include optional `characterId` (server-authoritative; echoed in `game-config`)
- `lobby-state` is derived from Colyseus schema sync (`phase`, `serverTick`, `players` with `sessionId/name/characterId/ready`)
- Lobby/camp controls use `set-character` / `set-ready` / `set-camp-ready` room messages via `sendCharacter()` / `sendReady()` / `sendCampReady()`
- `player-roster` updates provide authoritative server EID → `characterId` mappings for remote player presentation parity
- `game-config` listeners stay active after join and can fire again after reconnect.
- `getLatestGameConfig()` provides the most recent authoritative config (useful for preconnected scene bootstrap)
- **Auto-reconnect**: on unexpected disconnect, attempts reconnection with exponential backoff (5 attempts, 500ms-8s delay) using the Colyseus reconnection token. After reconnect, the client explicitly requests `game-config` to avoid config-loss races and only fires `disconnect` after all attempts fail.

## SnapshotBuffer

Stores recent snapshots with receive timestamps and computes interpolation state for rendering:

```typescript
const buffer = new SnapshotBuffer(100)  // 100ms interpolation delay
buffer.push(snapshot)                   // Called on each server snapshot

const interp = buffer.getInterpolationState(serverTime)
// interp = { from: WorldSnapshot, to: WorldSnapshot, alpha: number }
```

- Buffer size: 8 snapshots (~266ms at 30Hz)
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
