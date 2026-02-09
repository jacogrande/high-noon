# Sprint 7: Multiplayer Netcode — Client-Side Prediction & Optimization

**Goal**: Transform the multiplayer client from a "dumb renderer" (100ms+ input latency) into a responsive predicted client with sub-frame movement feel, server reconciliation, and protocol optimizations.

**Depends on**: Sprint 6 (all 7 epics complete)

---

## Epic Overview

| # | Epic | Package(s) | Priority | Depends On |
|---|------|-----------|----------|------------|
| 1 | ~~Sprint 6 Bug Fixes~~ | shared, client, server | ~~P0~~ DONE | — |
| 2 | ~~Clock Synchronization~~ | shared, client, server | ~~P0~~ DONE | — |
| 3 | ~~Input Sequencing & Snapshot Protocol v3~~ | shared, client, server | ~~P0~~ DONE | — |
| 4 | ~~Client-Side Prediction~~ | shared, client | ~~P0~~ DONE | Epic 3 |
| 5 | Server Reconciliation & Misprediction Smoothing | client | P0 | Epic 4 |
| 6 | Snapshot Interpolation Improvements | client | P1 | Epic 2 |
| 7 | Server & Client Optimizations | shared, client, server | P1 | Epic 1 |
| 8 | Multiplayer UX Polish | client, server | P2 | Epics 4-5 |

---

## Epic 1: Sprint 6 Bug Fixes — COMPLETE

All 6 actionable bugs from the sprint 6 tech review are already fixed in the current codebase:

| Ticket | Fix | Location |
|--------|-----|----------|
| 1.1 `localPlayerEid` cleared on removal | `playerRenderer.localPlayerEid = null` in removal block | `MultiplayerGameScene.ts:258` |
| 1.2 Remote damage flash preserves blue tint | `baseTint` computed before flash logic | `PlayerRenderer.ts:269-279` |
| 1.3 `lastPlayerHitDir` cleanup | `world.lastPlayerHitDir.delete(info.eid)` in `removePlayer()` | `playerRegistry.ts:82` |
| 1.4 Disconnect handler registered before join | Handler ordering: disconnect → game-config → snapshot → join() | `MultiplayerGameScene.ts:163-181` |
| 1.5 `maxClients` = `MAX_PLAYERS` | `override maxClients = MAX_PLAYERS` (imported from shared) | `GameRoom.ts:79` |
| 1.6 Freeze neutral input | `Object.freeze(createInputState())` | `GameRoom.ts:33` |

**Ticket 1.7** (filter `lastPlayerHitDir` for local player) is deferred to **Epic 8, Ticket 8.2** — it only matters once camera effects are wired into multiplayer, which hasn't happened yet.

---

## Epic 2: Clock Synchronization — COMPLETE

Establish a shared time reference between client and server using Cristian's algorithm. This enables server-time-based interpolation (more accurate than receive-time) and is a prerequisite for render time calculation in future lag compensation.

### Ticket 2.1: Add ping/pong messages to server

**Files**:
- `server/src/rooms/GameRoom.ts`
- `shared/src/net/clock.ts` (new)

Add a `ping`/`pong` message pair to the Colyseus room.

**Server behavior**:
- On `'ping'` message from client: immediately reply with `'pong'` containing `{ clientTime, serverTime: Date.now() }`
- `clientTime` is echoed back so the client can compute RTT

**Shared types** (`shared/src/net/clock.ts`):
```ts
export interface PingMessage {
  clientTime: number
}

export interface PongMessage {
  clientTime: number
  serverTime: number
}
```

**Acceptance**:
- Server responds to ping within <1ms of receipt
- Message types exported from shared
- No simulation impact (pong is outside the tick loop)

---

### Ticket 2.2: Client-side clock sync (Cristian's algorithm)

**File**: `client/src/net/ClockSync.ts` (new)

Implement a `ClockSync` class that maintains a server-time offset estimate.

**Algorithm**:
1. Send `ping` with `clientTime = performance.now()` every 5 seconds
2. On `pong`: compute `rtt = now - clientTime`, `offset = serverTime - (clientTime + rtt/2)`
3. Collect samples. Keep the 10 with lowest RTT (best precision).
4. Use the median offset of the best samples as the current estimate.
5. Apply drift correction: if new offset differs from current by < 500ms, blend gradually (`offset += error * 0.1`). If > 500ms, snap immediately.

**Public API**:
```ts
class ClockSync {
  start(sendPing: () => void): void          // Begin periodic pings
  onPong(clientTime: number, serverTime: number): void
  getServerTime(): number                     // performance.now() + offset
  getRTT(): number                            // Latest RTT estimate
  stop(): void                                // Stop pinging
}
```

**Acceptance**:
- Offset converges within 3-5 pings (15-25 seconds)
- `getServerTime()` is within ~RTT/2 of actual server time
- Re-syncs every 5 seconds to handle drift
- Unit testable (mock `performance.now`)

---

### Ticket 2.3: Wire clock sync into MultiplayerGameScene

**Files**:
- `client/src/scenes/MultiplayerGameScene.ts`
- `client/src/net/NetworkClient.ts`

Wire the `ClockSync` into the multiplayer pipeline:
1. `NetworkClient` gains `sendPing()` and `on('pong', ...)` support
2. `MultiplayerGameScene.connect()` creates `ClockSync`, starts pinging after connection
3. `ClockSync` is accessible for render-time calculation in Epic 6

**Acceptance**:
- Clock sync begins automatically on connection
- Console logs initial offset and RTT on convergence
- `clockSync.stop()` called in `destroy()`

---

### Ticket 2.4: Add server timestamp to snapshot header

**Files**:
- `shared/src/net/snapshot.ts`

Add a `serverTime` field to the snapshot header. This enables clients to use server-time-based interpolation instead of receive-time.

**Wire format change**:
- Bump `SNAPSHOT_VERSION` to 2
- New header (14 bytes): version(1) + tick(4) + **serverTime(4, float32 ms)** + playerCount(1) + bulletCount(2) + enemyCount(2)
- `HEADER_SIZE` changes from 10 to 14

**Encoder**: Write `Date.now() & 0xFFFFFFFF` as uint32 (wraps every ~49 days, fine for relative timing).

**Decoder**: Read and return `serverTime` in `WorldSnapshot`.

**`WorldSnapshot` type**: Add `serverTime: number`.

**Acceptance**:
- `encodeSnapshot` requires a `serverTime` parameter (or reads from a clock)
- `decodeSnapshot` returns `serverTime` in the snapshot
- Existing snapshot tests updated for v2 format
- `bun test packages/shared` — all pass

---

## Epic 3: Input Sequencing & Snapshot Protocol v3 — COMPLETE

Add monotonic sequence numbers to client inputs and include per-player acknowledgment in snapshots. This is the wire-protocol foundation for reconciliation.

### Ticket 3.1: Add sequence number to input messages

**Files**:
- `shared/src/net/input.ts`
- `client/src/scenes/MultiplayerGameScene.ts`

**Changes to `InputState`**:
```ts
export interface NetworkInput extends InputState {
  seq: number  // Monotonically increasing, starts at 1
}
```

`NetworkInput` extends `InputState` with a `seq` field. This is the type sent over the wire. The internal `InputState` (used by systems) remains unchanged — systems don't care about sequence numbers.

**Client changes**:
- `MultiplayerGameScene` maintains `private inputSeq = 0`
- Each `update()` tick: `inputSeq++`, attach seq to the input before sending
- `net.sendInput({ ...inputState, seq: this.inputSeq })`

**Acceptance**:
- Every input message includes a monotonically increasing `seq`
- First input has seq=1 (not 0, to distinguish from "never received")
- `InputState` type unchanged (backward compatible for single-player)

---

### Ticket 3.2: Server tracks last processed sequence per player

**Files**:
- `server/src/rooms/GameRoom.ts`

**Changes to `PlayerSlot`**:
```ts
interface PlayerSlot {
  client: Client
  eid: number
  inputQueue: NetworkInput[]   // Now includes seq
  lastProcessedSeq: number     // Tracks ack
}
```

**Server tick changes**:
- When popping an input from the queue, record `slot.lastProcessedSeq = input.seq`
- When queue is empty (neutral input): `lastProcessedSeq` stays at its previous value (no new input processed)

**Acceptance**:
- `lastProcessedSeq` starts at 0 (no inputs processed yet)
- After processing input with seq=42, `lastProcessedSeq === 42`
- Neutral inputs do not advance the sequence number

---

### Ticket 3.3: Include `lastProcessedSeq` in player snapshot entries

**Files**:
- `shared/src/net/snapshot.ts`
- `server/src/rooms/GameRoom.ts`

**Wire format change** (builds on ticket 2.4's v2 header):
- `PlayerSnapshot` gains `lastProcessedSeq: number` (uint32)
- `PLAYER_SIZE` changes from 17 to 21 bytes (+4)
- Encoder writes `lastProcessedSeq` after flags
- Decoder reads it into `PlayerSnapshot.lastProcessedSeq`

**Server encoding**:
The `encodeSnapshot` function needs access to per-player seq data. Two options:
- **Option A**: Pass a `Map<eid, lastProcessedSeq>` to `encodeSnapshot`
- **Option B**: Store `lastProcessedSeq` on a component in the ECS world

**Chosen: Option A** — Pass a map. This keeps ECS clean (seq numbers are a network concern, not game logic).

```ts
export function encodeSnapshot(
  world: GameWorld,
  serverTime: number,
  playerSeqs?: Map<number, number>
): Uint8Array
```

**GameRoom.broadcastSnapshot()** builds the seq map from slots and passes it.

**Acceptance**:
- Each player entry in the snapshot includes their lastProcessedSeq
- Client can read `snapshot.players[i].lastProcessedSeq`
- Snapshot tests updated (round-trip preserves seq)
- v1 decoder throws version mismatch (clients must upgrade with server)

---

### Ticket 3.4: Client-side pending input buffer

**File**: `client/src/net/InputBuffer.ts` (new)

A ring buffer that stores recent inputs tagged with sequence numbers, for replay during reconciliation.

```ts
export class InputBuffer {
  private buffer: NetworkInput[] = []
  private maxSize: number

  constructor(maxSize = 128)

  /** Store an input for potential replay */
  push(input: NetworkInput): void

  /** Remove all inputs with seq <= ackedSeq */
  acknowledgeUpTo(ackedSeq: number): void

  /** Get all unacknowledged inputs (for replay), ordered by seq */
  getPending(): readonly NetworkInput[]

  /** Number of pending inputs */
  get length(): number

  clear(): void
}
```

**Implementation notes**:
- Buffer size 128 = ~2 seconds at 60Hz (generous for any realistic latency)
- `acknowledgeUpTo` removes from the front (inputs are ordered by seq)
- `getPending` returns a readonly view (no allocation)

**Acceptance**:
- Unit tests: push/ack/getPending round-trip
- Unit tests: ack removes correct inputs, getPending returns remainder
- Unit tests: buffer overflow evicts oldest
- `bun test` passes

---

## Epic 4: Client-Side Prediction — COMPLETE

Run a subset of the shared simulation on the client for the local player. This eliminates the RTT delay on movement — the player responds to input immediately.

### Ticket 4.1: Define prediction system subset

**File**: `shared/src/sim/systems/index.ts`

Add a new registration function for the minimal system set needed for movement prediction:

```ts
/**
 * Register only the systems needed for client-side movement prediction.
 * This predicts: player input → velocity, roll, wall collision, position.
 * It does NOT predict: enemies, bullets, health, waves, upgrades.
 */
export function registerPredictionSystems(systems: SystemRegistry): void {
  systems.register(playerInputSystem)
  systems.register(rollSystem)
  systems.register(movementSystem)
  systems.register(collisionSystem)
}
```

**Why these 4 systems**:
- `playerInputSystem`: Reads input, sets velocity direction and magnitude, initiates rolls
- `rollSystem`: Manages roll state machine, i-frames, speed multiplier, dodge detection
- `movementSystem`: Applies `Velocity` to `Position` (stores `prevX/Y`), the core movement step
- `collisionSystem`: Push-out against walls and other entities (prevents walking through walls)

**Why NOT other systems**:
- `weaponSystem`, `cylinderSystem`, `showdownSystem`: Weapon prediction is a future epic. For now, shots are server-authoritative.
- `bulletSystem`, `bulletCollisionSystem`: Bullets are spawned and resolved server-side.
- `enemyAISystem`, `enemyDetectionSystem`, etc.: Enemies are server-authoritative, rendered via interpolation.
- `healthSystem`, `buffSystem`: Damage is server-authoritative.
- `waveSpawnerSystem`: Spawning is server-authoritative.
- `spatialHashSystem`: Needed only if prediction systems use spatial queries. `collisionSystem` uses the tilemap directly, not the spatial hash. Skip for now.

**Acceptance**:
- `registerPredictionSystems` exported from shared
- Only registers 4 systems
- `bun run typecheck` clean

---

### Ticket 4.2: Prediction world in MultiplayerGameScene

**File**: `client/src/scenes/MultiplayerGameScene.ts`

Transform the scene from a dumb renderer to a hybrid predicted/interpolated client.

**New fields**:
```ts
// Prediction
private predictionSystems: SystemRegistry
private inputBuffer: InputBuffer
private inputSeq = 0

// Misprediction visual smoothing (Epic 5)
private errorX = 0
private errorY = 0
```

**Initialization** (in constructor or `connect`):
```ts
this.predictionSystems = createSystemRegistry()
registerPredictionSystems(this.predictionSystems)
this.inputBuffer = new InputBuffer()
```

**Key architectural decision**: The scene uses ONE `GameWorld` (the existing shadow world). The local player entity in this world is driven by prediction. Remote entities are driven by snapshot interpolation. This works because:
- Prediction systems only read input for the local player EID
- `playerInputSystem` reads `world.playerInputs.get(eid)` — we only set the local player's input
- Remote player entities have no input set, so prediction systems skip them (they check for input existence)

**Acceptance**:
- Prediction systems are created and registered
- InputBuffer is created
- No behavior change yet (wired in ticket 4.3)

---

### Ticket 4.3: Apply prediction on local player each tick

**File**: `client/src/scenes/MultiplayerGameScene.ts`

Change the `update(dt)` method to:

1. Capture input as before
2. Tag with sequence number
3. Store in pending input buffer
4. Send to server
5. **Apply input to local player and step prediction systems**

```ts
update(dt: number): void {
  if (!this.connected) return
  if (this.myClientEid < 0) return

  // 1. Capture input
  // (existing reference position + camera setup code)
  const inputState = this.input.getInputState()

  // 2. Tag with sequence number
  this.inputSeq++
  const networkInput: NetworkInput = { ...inputState, seq: this.inputSeq }

  // 3. Buffer for reconciliation
  this.inputBuffer.push(networkInput)

  // 4. Send to server
  this.net.sendInput(networkInput)

  // 5. Predict: apply input to local player, step prediction systems
  this.world.playerInputs.set(this.myClientEid, inputState)
  stepWorld(this.world, this.predictionSystems, /* no input param — we set it manually */)
  // Note: stepWorld clears playerInputs and increments tick.
  // We need to handle tick carefully — see ticket 4.4.
}
```

**Tick management concern**: `stepWorld` increments `world.tick`. But the shadow world's tick is also written by snapshot application (`this.world.tick = snapshot.tick`). We need a separate `predictionTick` counter or decouple the tick from the world for prediction. See ticket 4.4.

**Acceptance**:
- Local player position updates immediately on input (no waiting for server snapshot)
- Movement feels responsive (same as single-player)

---

### Ticket 4.4: Decouple prediction tick from snapshot tick

**File**: `client/src/scenes/MultiplayerGameScene.ts`

**Problem**: `stepWorld` increments `world.tick`, but snapshot application overwrites it. The prediction and interpolation systems both write `world.tick` leading to conflicts.

**Solution**: Track prediction tick separately:
```ts
private predictionTick = 0
```

Before stepping prediction systems, save and restore `world.tick`:
```ts
// In update():
const savedTick = this.world.tick
this.world.tick = this.predictionTick
stepWorld(this.world, this.predictionSystems)
this.predictionTick = this.world.tick  // stepWorld incremented it
this.world.tick = savedTick            // Restore for interpolation
```

Alternatively, since the prediction systems don't actually read `world.tick` for anything gameplay-critical (it's mainly used for animations like damage flash `Math.floor(world.tick / 3) % 2`), we can just let `stepWorld` increment and accept that `world.tick` advances faster than the server. The snapshot application will correct it.

**Chosen approach**: Let `world.tick` be overwritten by snapshots in `interpolateFromBuffer`. Prediction may cause tick to drift ahead, but `interpolateFromBuffer` always resets it from the interpolated snapshot pair. This is the simplest approach.

**Acceptance**:
- No desync between predicted tick and rendered tick
- Animation timers (damage flash) still work correctly

---

### Ticket 4.5: Skip local player during snapshot interpolation

**File**: `client/src/scenes/MultiplayerGameScene.ts`

**Problem**: Currently, `interpolateFromBuffer` writes `Position.x/y` for ALL players, including the local player. This would overwrite the predicted position with the server's (delayed) position, causing rubber-banding.

**Fix**: In the player interpolation loop inside `interpolateFromBuffer`, skip the local player:

```ts
// Interpolate players
for (const p of to.players) {
  const clientEid = this.playerEntities.get(p.eid)
  if (clientEid === undefined) continue

  // Skip local player — driven by prediction, not interpolation
  if (clientEid === this.myClientEid) continue

  const prev = this.fromPlayerIndex.get(p.eid)
  // ... existing interpolation code
}
```

The local player's position is now driven exclusively by prediction. Reconciliation (Epic 5) handles corrections.

**Acceptance**:
- Local player position is not overwritten by interpolation
- Remote players still interpolate smoothly
- Camera follows the predicted (immediate) position

---

## Epic 5: Server Reconciliation & Misprediction Smoothing

When a server snapshot arrives, reconcile the predicted local player state with the authoritative server state. If they differ, smoothly correct the visual position.

### Ticket 5.1: Reconciliation on snapshot receipt

**File**: `client/src/scenes/MultiplayerGameScene.ts`

When a snapshot arrives (in the `snapshot` handler), perform reconciliation for the local player:

```ts
private onSnapshot(snapshot: WorldSnapshot): void {
  this.world.tick = snapshot.tick
  this.applyEntityLifecycle(snapshot)
  this.snapshotBuffer.push(snapshot)

  // Reconcile local player
  if (this.myClientEid >= 0) {
    this.reconcileLocalPlayer(snapshot)
  }
}
```

**`reconcileLocalPlayer` algorithm**:
1. Find the local player in the snapshot (match by `myServerEid`)
2. Read `lastProcessedSeq` from the player entry
3. Save the current predicted position (`oldPredX`, `oldPredY`)
4. **Rewind**: Set local player's `Position.x/y` to the server's authoritative position
5. **Discard**: Call `inputBuffer.acknowledgeUpTo(lastProcessedSeq)` to remove processed inputs
6. **Replay**: For each remaining pending input, apply it to the local player and step prediction systems
7. **Compute error**: `errorX += oldPredX - newPredX`, `errorY += oldPredY - newPredY`
8. If error magnitude > `SNAP_THRESHOLD` (96 pixels): snap immediately (reset error to 0)
9. If error magnitude < `EPSILON` (0.5 pixels): ignore

```ts
private reconcileLocalPlayer(snapshot: WorldSnapshot): void {
  const serverPlayer = snapshot.players.find(p => p.eid === this.myServerEid)
  if (!serverPlayer) return

  const lastAcked = serverPlayer.lastProcessedSeq
  const oldPredX = Position.x[this.myClientEid]!
  const oldPredY = Position.y[this.myClientEid]!

  // 1. Accept server authority
  Position.x[this.myClientEid] = serverPlayer.x
  Position.y[this.myClientEid] = serverPlayer.y
  Position.prevX[this.myClientEid] = serverPlayer.x
  Position.prevY[this.myClientEid] = serverPlayer.y
  PlayerState.state[this.myClientEid] = serverPlayer.state

  // 2. Discard acknowledged inputs
  this.inputBuffer.acknowledgeUpTo(lastAcked)

  // 3. Replay unacknowledged inputs
  const pending = this.inputBuffer.getPending()
  for (const input of pending) {
    this.world.playerInputs.set(this.myClientEid, input)
    for (const system of this.predictionSystems.getSystems()) {
      system(this.world, TICK_S)
    }
    this.world.playerInputs.clear()
  }

  // 4. Compute misprediction error
  const newPredX = Position.x[this.myClientEid]!
  const newPredY = Position.y[this.myClientEid]!
  const dx = oldPredX - newPredX
  const dy = oldPredY - newPredY
  const errorMag = Math.sqrt(dx * dx + dy * dy)

  if (errorMag > SNAP_THRESHOLD) {
    // Teleport — error too large to smooth
    this.errorX = 0
    this.errorY = 0
  } else if (errorMag > EPSILON) {
    // Accumulate visual offset
    this.errorX += dx
    this.errorY += dy
  }
}
```

**Note**: We call prediction systems directly (not `stepWorld`) to avoid incrementing `world.tick` during replay. This keeps the tick in sync with the server.

**Constants**:
```ts
const SNAP_THRESHOLD = 96   // pixels — teleport if error exceeds this
const EPSILON = 0.5          // pixels — ignore sub-pixel errors
```

**Acceptance**:
- After reconciliation, the local player's position matches `serverPos + replay(pendingInputs)`
- Old acknowledged inputs are removed from the buffer
- Input buffer shrinks as the server acknowledges inputs
- No visible snap or teleport during normal play (low latency)

---

### Ticket 5.2: Misprediction visual smoothing

**File**: `client/src/scenes/MultiplayerGameScene.ts`

Apply the error offset during rendering so mispredictions are corrected smoothly over ~100ms instead of snapping.

**In `render()`**, decay the error offset:
```ts
// Decay misprediction error (frame-rate independent)
const CORRECTION_SPEED = 15  // Higher = faster snap-back
const factor = 1 - Math.exp(-CORRECTION_SPEED * realDt)
this.errorX *= (1 - factor)
this.errorY *= (1 - factor)

// Kill tiny residuals
if (Math.abs(this.errorX) < 0.1) this.errorX = 0
if (Math.abs(this.errorY) < 0.1) this.errorY = 0
```

**For camera follow** (already using `Position.x[myClientEid]`): Add the error offset to the position fed to the camera:
```ts
const renderX = Position.x[this.myClientEid]! + this.errorX
const renderY = Position.y[this.myClientEid]! + this.errorY
this.camera.update(renderX, renderY, worldMouse.x, worldMouse.y, realDt)
```

**For the local player sprite**: The `PlayerRenderer` reads `Position.x/y` directly from ECS arrays. We need to temporarily offset the local player's position during rendering, then restore it:

```ts
// Before rendering:
if (this.myClientEid >= 0 && (this.errorX !== 0 || this.errorY !== 0)) {
  Position.x[this.myClientEid] += this.errorX
  Position.y[this.myClientEid] += this.errorY
}

// Render...
this.playerRenderer.render(this.world, alpha, realDt)

// After rendering, restore:
if (this.myClientEid >= 0 && (this.errorX !== 0 || this.errorY !== 0)) {
  Position.x[this.myClientEid] -= this.errorX
  Position.y[this.myClientEid] -= this.errorY
}
```

**Acceptance**:
- Mispredictions are smoothed over ~100ms (not instant snaps)
- No visible jitter during normal play
- Large teleports (>96px) snap immediately
- Camera and player sprite both use the smoothed position

---

### Ticket 5.3: Handle Roll state during reconciliation

**Problem**: The roll system changes `PlayerState.state`, `Roll.duration/elapsed/directionX/Y`, and adds/removes the `Invincible` component. If the server says the player is rolling but the client predicted differently (or vice versa), we need to reconcile roll state.

**Fix**: When reconciling, also restore roll-related state from the snapshot:
- `PlayerState.state` — already restored in 5.1
- The roll system reads `PlayerState.state` to know if a roll is active
- If server says ROLLING and client predicted IDLE, the replay will re-initiate the roll from the pending inputs

**What we need to sync**: The snapshot only sends `state` (uint8 enum: IDLE=0, MOVING=1, ROLLING=2). For full reconciliation of the roll:
- If server says ROLLING: the replay of pending inputs should handle re-entering the roll
- If timing differs slightly: the smoothing system (5.2) handles the visual correction

**For this sprint**: Accept that roll reconciliation may have slight visual artifacts on high-latency connections. Full roll state sync (elapsed, direction) would require expanding the snapshot format and is deferred.

**Acceptance**:
- Roll direction changes are reflected after reconciliation
- No crash or infinite loop if roll state diverges
- Slight rubber-banding during rolls on high-latency is acceptable for now

---

## Epic 6: Snapshot Interpolation Improvements

Upgrade the interpolation system to use server time instead of receive time, and improve the buffer data structure.

### Ticket 6.1: Server-time-based interpolation

**Files**:
- `client/src/net/SnapshotBuffer.ts`

**Problem**: Current interpolation uses `performance.now()` receive timestamps. These include network jitter — if a packet arrives 20ms late, the interpolation timing is off. Server-time-based interpolation is more accurate.

**Changes**:
- `TimestampedSnapshot` gains `serverTime: number` (from snapshot header, via clock sync)
- `push(snapshot, serverTime)` stores the server time
- `getInterpolationState(clockSync)` calculates render time as:
  ```
  renderTime = clockSync.getServerTime() - interpolationDelay
  ```
- Bracket search uses `serverTime` instead of `receiveTime` for finding the interpolation pair
- Fall back to `receiveTime` if clock sync hasn't converged yet (first 15 seconds)

**Acceptance**:
- Interpolation is smoother under network jitter
- No regression if clock sync is not ready (graceful fallback)
- `bun run typecheck` clean

---

### Ticket 6.2: Replace `shift()` with circular buffer

**File**: `client/src/net/SnapshotBuffer.ts`

**Problem**: `buffer.shift()` is O(n). With `MAX_BUFFER_SIZE = 10`, this shifts 9 elements every push. Minor but wasteful.

**Fix**: Replace the array with a circular buffer:
```ts
private buffer: (TimestampedSnapshot | null)[]
private head = 0
private tail = 0
private size = 0
```

Or simpler: reduce `MAX_BUFFER_SIZE` to 5 (only need ~250ms of history for 100ms delay at 20Hz) and accept the shift. The perf difference is negligible for 5 elements.

**Chosen**: Reduce to `MAX_BUFFER_SIZE = 5`, keep the simple array. Revisit if profiling shows an issue.

**Acceptance**:
- Buffer holds at most 5 snapshots
- Interpolation still works correctly
- No visible rendering differences

---

## Epic 7: Server & Client Optimizations

Address performance issues identified in the tech review.

### Ticket 7.1: Reduce `getAlivePlayers()` allocations

**File**: `shared/src/sim/queries.ts`

**Problem**: `getAlivePlayers()` allocates a new filtered array each call. Called by 4 systems per tick = 240 times/sec on server.

**Fix**: Add tick-based caching with preallocated result array:
```ts
let cachedAlivePlayers: number[] = []
let cachedTick = -1

export function getAlivePlayers(world: GameWorld): readonly number[] {
  if (world.tick === cachedTick) return cachedAlivePlayers
  cachedTick = world.tick

  const players = playerQuery(world)
  cachedAlivePlayers.length = 0
  for (const eid of players) {
    if (!hasComponent(world, Dead, eid)) {
      cachedAlivePlayers.push(eid)
    }
  }
  return cachedAlivePlayers
}
```

**Acceptance**:
- Only 1 allocation per tick (down from 4)
- Existing behavior unchanged
- All shared tests pass

---

### Ticket 7.2: Add reconnection support

**Files**:
- `server/src/rooms/GameRoom.ts`
- `client/src/net/NetworkClient.ts`
- `client/src/scenes/MultiplayerGameScene.ts`

**Server**: In `onLeave`, use `allowReconnection` with a 30-second grace period:
```ts
override async onLeave(client: Client, consented: boolean) {
  if (!consented) {
    // Dropped connection — allow reconnect
    try {
      await this.allowReconnection(client, 30)
      console.log(`[GameRoom] ${client.sessionId} reconnected`)
      return  // Player slot preserved
    } catch {
      // Timed out — clean up
    }
  }

  // Intentional leave or reconnect timeout
  removePlayer(this.world, client.sessionId)
  this.state.players.delete(client.sessionId)
  this.slots.delete(client.sessionId)
  console.log(`[GameRoom] ${client.sessionId} left (players=${this.slots.size})`)
}
```

**Client**: Store `roomId` and `sessionId` for potential reconnection in a future iteration. For this sprint, just don't crash if the connection drops — show a "Reconnecting..." state in the UI.

**Acceptance**:
- If a client drops unintentionally, the server holds their slot for 30 seconds
- If the client reconnects within 30s, they resume with their existing player entity
- If they don't reconnect, normal cleanup occurs
- Server console logs reconnection events

---

### Ticket 7.3: NetworkClient cleanup on disconnect

**File**: `client/src/net/NetworkClient.ts`

**Problem**: `disconnect()` sets `room = null` but leaves old listeners. If the client instance is reused, old handlers persist.

**Fix**: Clear listeners in `disconnect()` (already done in current code — verify).

Also add proper error handling for the room connection:
```ts
async join(options?: Record<string, unknown>): Promise<void> {
  try {
    this.room = await this.client.joinOrCreate('game', options)
  } catch (err) {
    throw new Error(`Failed to connect: ${err instanceof Error ? err.message : 'Unknown error'}`)
  }
  // ... register handlers
}
```

**Acceptance**:
- After `disconnect()`, no stale event listeners
- Connection errors produce meaningful error messages

---

## Epic 8: Multiplayer UX Polish

Improve the multiplayer experience beyond core netcode.

### Ticket 8.1: Sync HUD data in snapshots

**Files**:
- `shared/src/net/snapshot.ts`
- `client/src/scenes/MultiplayerGameScene.ts`

**Problem**: HUD shows all 0s in multiplayer for XP, wave, cylinder, showdown. Only HP and isDead are synced.

**Fix**: Expand the player snapshot entry to include HUD-relevant fields:

Additional fields per player (+10 bytes, PLAYER_SIZE 21→31):
```
cylinderRounds   (uint8)
cylinderMax      (uint8)
isReloading      (uint8, 0/1)
reloadProgress   (uint8, 0-255 mapped to 0-1)
showdownActive   (uint8, 0/1)
showdownCooldown (uint16, fixed-point seconds × 100)
showdownTimeLeft (uint16, fixed-point seconds × 100)
rollState        (uint8, includes roll cooldown info if needed)
```

Wait — this adds significant complexity and snapshot size. For 8 players that's 80 extra bytes per snapshot.

**Alternative (simpler)**: Send a separate `'hud'` message to each client at 10Hz with their personal HUD data. This avoids bloating the broadcast snapshot.

```ts
// Server, every 6 ticks (10Hz):
client.send('hud', {
  cylinderRounds: Cylinder.rounds[eid],
  cylinderMax: Cylinder.maxRounds[eid],
  isReloading: Cylinder.reloading[eid] > 0,
  reloadProgress: Cylinder.reloading[eid] ? Cylinder.reloadTimer[eid] / Cylinder.reloadTime[eid] : 0,
  showdownActive: Showdown.active[eid] > 0,
  showdownCooldown: Showdown.cooldown[eid],
  showdownCooldownMax: SHOWDOWN_COOLDOWN,
  showdownTimeLeft: Showdown.duration[eid],
})
```

**Chosen**: Separate per-client `'hud'` message at 10Hz. Cleaner separation, no snapshot format bloat, only sent to the owning client.

**Acceptance**:
- HUD in multiplayer shows: HP, cylinder ammo, reload state, showdown cooldown/active
- Wave number/status shown (broadcast in Schema state or HUD message)
- Values update at ~10Hz (fast enough for UI)

---

### Ticket 8.2: Camera shake/kick in multiplayer

**File**: `client/src/scenes/MultiplayerGameScene.ts`

**Problem**: Camera shake (on hit) and kick (on fire) aren't triggered in multiplayer because they're driven by local events (bullet collision callbacks, weapon fire) that don't exist in the dumb-client model.

**Fix for shake**: Detect health decreases in the snapshot. If `newHP < prevHP` for the local player, trigger `camera.shake.addTrauma(0.3)`.

**Fix for kick**: Detect that the local player fired (button pressed in input). Since we're now predicting locally, we can trigger kick on input:
```ts
// In update(), after capturing input:
if (hasButton(inputState, Button.SHOOT)) {
  this.camera.kick.apply(-Math.cos(aimAngle) * 3, -Math.sin(aimAngle) * 3)
}
```

**Acceptance**:
- Taking damage in multiplayer triggers screen shake
- Firing in multiplayer triggers camera kick
- Feels similar to single-player

---

### Ticket 8.3: Mid-game disconnect UX

**File**: `client/src/scenes/MultiplayerGameScene.ts`, `client/src/pages/MultiplayerGame.tsx`

**Problem**: When the server disconnects mid-game, the client just freezes silently.

**Fix**: On disconnect event:
1. Show "Connection Lost" overlay in the game HUD
2. After 10 seconds, show "Return to Menu" button
3. If reconnection (ticket 7.2) succeeds, hide the overlay

**Acceptance**:
- Server disconnect shows "Connection Lost" overlay
- Player can navigate back to menu
- No crash or unhandled state

---

## Verification Checklist

After all epics are complete:

- [ ] `bun run typecheck` — clean across all packages
- [ ] `bun run build` — clean
- [ ] `bun test packages/shared/` — all pass (snapshot tests updated for v2)
- [ ] Single-player (`/play`) — unchanged behavior, no regression
- [ ] Multiplayer single client — movement feels responsive (no RTT delay)
- [ ] Multiplayer two clients — local player is predicted, remote player interpolates smoothly
- [ ] Multiplayer latency test — add 100ms artificial delay (Chrome DevTools Network throttling), movement still feels responsive, slight rubber-band on direction changes is acceptable
- [ ] Multiplayer disconnect/reconnect — 30s grace period works
- [ ] HUD shows live data in multiplayer

---

## Implementation Order

```
Epic 1 (Bug Fixes)  ──────────────────────────► can start immediately
Epic 2 (Clock Sync)  ─────────────────────────► can start immediately
Epic 3 (Input Seq + Protocol v3)  ─────────────► can start immediately

Epic 4 (Prediction)  ─────────────────────────► after Epic 3
Epic 5 (Reconciliation)  ─────────────────────► after Epic 4

Epic 6 (Interpolation Improvements)  ─────────► after Epic 2
Epic 7 (Optimizations)  ──────────────────────► after Epic 1
Epic 8 (UX Polish)  ──────────────────────────► after Epics 4-5
```

Epics 1, 2, and 3 can be developed in parallel. Epics 4 and 5 are sequential. Epics 6, 7, and 8 can proceed independently once their dependencies are met.

---

## Estimated Scope

| Epic | Files Touched | New Files | Tests |
|------|--------------|-----------|-------|
| 1 | 3-4 | 0 | 1-2 new |
| 2 | 3 | 2 | 3-5 new |
| 3 | 4 | 1 | 5-8 new |
| 4 | 2 | 0 | 0 (manual) |
| 5 | 1 | 0 | 0 (manual) |
| 6 | 1 | 0 | 1-2 updated |
| 7 | 3-4 | 0 | 1-2 updated |
| 8 | 3-4 | 0 | 0 (manual) |

**Total**: ~15-20 files touched, 3 new files, 10-15 new/updated tests
