# Client-Side Prediction, Server Reconciliation, and Lag Compensation

Deep technical research on netcode techniques for realtime multiplayer action games.
Focused on the authoritative-server + client-prediction architecture used in High Noon.

---

## Table of Contents

1. [Client-Side Prediction](#1-client-side-prediction)
2. [Server Reconciliation](#2-server-reconciliation)
3. [Input Handling](#3-input-handling)
4. [Entity Interpolation](#4-entity-interpolation)
5. [Extrapolation / Dead Reckoning](#5-extrapolation--dead-reckoning)
6. [Lag Compensation](#6-lag-compensation)
7. [Clock Synchronization](#7-clock-synchronization)
8. [Putting It All Together](#8-putting-it-all-together)
9. [Sources](#9-sources)

---

## 1. Client-Side Prediction

### The Problem

In a naive authoritative server model, the player presses a key, the input travels to the server (half RTT), the server processes it and produces a new state, that state travels back (half RTT), and the client finally renders the result. At 100ms RTT, the player sees their own movement delayed by 100ms. For a twitchy action game, this feels unacceptable.

### The Solution

Client-side prediction eliminates the perceived delay for the local player by applying inputs immediately on the client, running the same simulation locally that the server will run. Because the simulation is deterministic (given the same state + same input = same output), the client's predicted state will usually match what the server eventually produces.

The key insight from [Gabriel Gambetta's series](https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html): the client does not wait for the server. It applies input immediately, sends that input to the server, and keeps a buffer of unacknowledged inputs for later reconciliation.

### Algorithm

```
ON_INPUT(input):
  input.seq = ++localSeqCounter
  input.tick = currentTick

  // 1. Send to server
  network.send(input)

  // 2. Save for later reconciliation
  pendingInputs.push(input)

  // 3. Apply locally (predict)
  applyInput(localPlayerState, input)
  advanceSimulation(localWorld, dt)
```

### What to Predict

Not everything should be predicted. The rule of thumb:

| Predict | Do Not Predict |
|---------|----------------|
| Local player position | Remote player positions |
| Local player velocity | Damage / health changes |
| Local player state (rolling, jumping) | Kill confirmations |
| Weapon state (fire cooldown, ammo) | Enemy spawns |
| Bullet spawns (cosmetic-only) | Loot drops / pickups |

Predicting too much increases the severity and frequency of misprediction snaps. Predicting too little makes the game feel laggy.

**Bullet prediction in High Noon:** Bullets can be spawned cosmetically on the client at fire time. The server is authoritative over whether the bullet actually exists and does damage. When the server snapshot arrives confirming the bullet, the client links its cosmetic bullet to the authoritative one. If the server rejects it (e.g., player was actually dead, or out of ammo on server), the cosmetic bullet is quietly removed.

### Prediction of Complex State

For actions with duration (dodge rolls, dashes, ability animations), the client must predict the entire state machine:

```typescript
// When predicting a roll:
// - Set Roll.active[eid] = 1
// - Set Roll.elapsed[eid] = 0
// - Set Roll.dirX/dirY from input
// - Each predicted tick, advance Roll.elapsed
// - When Roll.elapsed >= Roll.duration, clear roll state

// During reconciliation, if server says roll started at tick T,
// replay must advance roll elapsed correctly from tick T onward.
```

---

## 2. Server Reconciliation

### The Problem

Prediction will sometimes be wrong. The server may have additional information (another player's collision, a wall the client didn't account for, an enemy hitting the player). When the authoritative server state arrives, the client must correct its prediction without visible teleportation.

### Rewind-and-Replay (The Core Algorithm)

This is the canonical technique from [Gabriel Gambetta](https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html). Every server snapshot includes the sequence number of the last input the server processed for this client.

```
ON_SERVER_SNAPSHOT(snapshot):
  // 1. Accept authoritative state for local player
  localPlayerState = snapshot.players[localEid]
  lastAckedSeq = snapshot.lastProcessedSeq

  // 2. Discard acknowledged inputs
  pendingInputs = pendingInputs.filter(input => input.seq > lastAckedSeq)

  // 3. Re-apply unacknowledged inputs on top of authoritative state
  for (const input of pendingInputs):
    applyInput(localPlayerState, input)
    advanceSimulation(localWorld, dt)

  // 4. The resulting state is the new predicted state
  // Compare to what we were rendering. If different, we mispredicted.
```

**Step 2** is critical: we discard all inputs the server has already processed. These inputs are "proven correct" by the authoritative state.

**Step 3** replays only the inputs the server has NOT yet seen. This handles the case where the client is ahead of the server by N ticks -- it replays those N ticks on top of the server's confirmed state.

### Data Structure: Input Ring Buffer

```typescript
interface PendingInput {
  seq: number
  tick: number
  input: InputState
  // Optional: snapshot of predicted state AFTER this input,
  // for misprediction detection without full replay
  predictedState?: { x: number; y: number }
}

class InputBuffer {
  private buffer: PendingInput[] = []  // or ring buffer for perf

  push(entry: PendingInput): void {
    this.buffer.push(entry)
  }

  /** Remove all entries with seq <= ackedSeq */
  acknowledge(ackedSeq: number): void {
    // Find first entry with seq > ackedSeq
    let cutoff = 0
    while (cutoff < this.buffer.length && this.buffer[cutoff].seq <= ackedSeq) {
      cutoff++
    }
    // Remove acknowledged entries
    if (cutoff > 0) {
      this.buffer.splice(0, cutoff)
    }
  }

  /** Get all unacknowledged inputs for replay */
  getUnacknowledged(): PendingInput[] {
    return this.buffer
  }
}
```

### Smooth Misprediction Correction

Naive reconciliation teleports the player when a misprediction occurs. A better approach: separate the logical (simulation) position from the visual (rendered) position.

```typescript
interface PredictionState {
  // Logical position (authoritative + replayed inputs)
  simX: number
  simY: number

  // Visual offset (error from misprediction)
  errorX: number
  errorY: number

  // Rendered position = sim + error (error decays to zero)
  get renderX(): number { return this.simX + this.errorX }
  get renderY(): number { return this.simY + this.errorY }
}

ON_SERVER_SNAPSHOT(snapshot):
  const oldPredictedX = localPlayer.simX
  const oldPredictedY = localPlayer.simY

  // Reconcile (rewind + replay) ...
  reconcile(snapshot)

  const newPredictedX = localPlayer.simX
  const newPredictedY = localPlayer.simY

  // Misprediction delta
  const dx = oldPredictedX - newPredictedX
  const dy = oldPredictedY - newPredictedY
  const errorMag = Math.sqrt(dx * dx + dy * dy)

  if (errorMag > SNAP_THRESHOLD) {
    // Error too large (teleport/major desync): snap immediately
    localPlayer.errorX = 0
    localPlayer.errorY = 0
  } else if (errorMag > EPSILON) {
    // Small misprediction: add to visual error, let it decay
    localPlayer.errorX += dx
    localPlayer.errorY += dy
  }

ON_RENDER(dt):
  // Exponential decay of visual error
  // Use frame-rate independent smoothing: factor = 1 - e^(-lambda * dt)
  const factor = 1 - Math.exp(-CORRECTION_SPEED * dt)
  localPlayer.errorX *= (1 - factor)
  localPlayer.errorY *= (1 - factor)

  // Render at renderX, renderY
```

Recommended values:
- `SNAP_THRESHOLD`: 64-128 pixels (teleport if error is enormous)
- `EPSILON`: 0.5 pixels (ignore sub-pixel errors)
- `CORRECTION_SPEED`: 10-20 (higher = faster snap, lower = smoother but more "floaty")

The exponential decay `1 - e^(-lambda * dt)` is frame-rate independent, which matters because render FPS varies. See [Freya Holmer's analysis](https://mastodon.social/@acegikmo/111931613710775864) of frame-rate independent lerp.

---

## 3. Input Handling

### Input Sequence Numbers

Every input the client sends must carry a monotonically increasing sequence number. This serves three purposes:

1. **Server acknowledgment**: The server includes the last processed sequence number in each snapshot, telling the client which inputs have been consumed.
2. **Reordering detection**: If inputs arrive out of order, the server can detect and reorder them.
3. **Duplicate detection**: If the client resends inputs (redundancy), the server can skip already-processed ones.

```typescript
interface NetworkInput {
  seq: number          // Monotonically increasing
  tick: number         // Client tick when this input was generated
  buttons: number      // Bitmask: fire, roll, reload, ability, etc.
  moveX: number        // -1..1 normalized
  moveY: number        // -1..1 normalized
  aimAngle: number     // Radians
  cursorWorldX: number // World-space cursor (for hit detection)
  cursorWorldY: number
}
```

### Input Redundancy (Handling Packet Loss)

Over UDP (or WebSocket over TCP with potential head-of-line blocking), inputs can be lost. The standard solution is **input redundancy**: each packet contains the current input plus the last N inputs.

```
Packet layout:
  [inputCount: u8]
  [input[0]: current input]
  [input[1]: previous input (seq - 1)]
  [input[2]: two frames ago (seq - 2)]
  ...
```

The server checks each input's sequence number and only processes inputs it has not yet seen. Typical redundancy: 3-5 inputs per packet.

For High Noon's WebSocket transport (TCP-based, reliable ordered), packet loss is not a concern for individual messages, but TCP head-of-line blocking can cause input to arrive in bursts. The input queue on the server (already capped at 30 in `GameRoom`) handles this by buffering.

### Input Delay vs. Prediction Tradeoff

There is a spectrum between two extremes:

| Approach | Latency Feel | Visual Artifacts |
|----------|-------------|-----------------|
| Pure prediction (0 input delay) | Instant response | Misprediction snaps |
| Pure input delay (N frames delay) | N-frame lag | Zero artifacts |
| Hybrid (small delay + prediction) | Slight lag | Fewer artifacts |

**GGPO-style fighting games** allow players to tune this slider. For an action game like High Noon, 0-1 frames of input delay with prediction is standard. The misprediction artifacts are rare enough in practice (the local player usually predicts their own movement correctly).

### Server-Side Input Buffer

The server needs an input buffer per player to handle jitter in input arrival:

```typescript
class ServerInputBuffer {
  private queue: InputState[] = []
  private lastProcessedSeq: number = 0

  push(input: NetworkInput): void {
    // Skip already-processed or duplicate inputs
    if (input.seq <= this.lastProcessedSeq) return
    // Insert in sequence order (handles reordering)
    // ... binary insert by seq ...
    this.queue.push(input)
  }

  /** Pop the next expected input. Returns neutral input if buffer is empty. */
  pop(): InputState {
    if (this.queue.length === 0) {
      return NEUTRAL_INPUT  // No input this tick; player holds still
    }
    const input = this.queue.shift()!
    this.lastProcessedSeq = input.seq
    return input
  }
}
```

When the server's input buffer runs empty, it must do something:
- **Repeat last input**: Assumes the player is still doing what they were doing. Can cause over-shooting.
- **Use neutral input**: Player stops. Causes under-shooting but is conservative.
- **Wait (add input delay)**: Add 1-2 ticks of server-side input delay so the buffer usually has something. Adds latency but reduces jitter.

The Rocket League approach (from [Jared Cone's GDC 2018 talk](https://ubm-twvideo01.s3.amazonaws.com/o1/vault/gdc2018/presentations/Cone_Jared_It_Is_Rocket.pdf)) uses **input decay**: progressively reduce the repeated input's magnitude each tick the buffer is empty, so the player decelerates rather than stopping abruptly or continuing at full speed.

---

## 4. Entity Interpolation

### The Problem

Remote players (other players, enemies, NPC-controlled entities) cannot be predicted because the client does not have their input. The server sends snapshots at a limited rate (e.g., 20Hz). Rendering remote entities only when snapshots arrive produces stuttery 20fps motion.

### The Solution: Interpolation Delay

Instead of rendering remote entities at "now," render them slightly in the past, at a point where we have two known states to interpolate between.

From [Gabriel Gambetta's Entity Interpolation article](https://www.gabrielgambetta.com/entity-interpolation.html): the client renders other entities with a constant time delay (typically 100ms) and linearly interpolates between the two snapshots bracketing that delayed time.

### Render Time Calculation

```
renderTime = currentTime - interpolationDelay
```

Where `interpolationDelay` is typically 2-3x the snapshot interval:
- Snapshots arrive every 50ms (20Hz)
- Interpolation delay = 100ms (2 snapshot intervals)
- This means we can lose one full snapshot and still have data to interpolate toward

### Algorithm

```typescript
getInterpolatedState(renderTime: number): InterpolationResult {
  const buffer = this.snapshotBuffer

  // Find bracketing snapshots
  // from: last snapshot with serverTime <= renderTime
  // to:   first snapshot with serverTime > renderTime
  let from: Snapshot | null = null
  let to: Snapshot | null = null

  for (let i = buffer.length - 1; i >= 0; i--) {
    if (buffer[i].serverTime <= renderTime) {
      from = buffer[i]
      to = buffer[i + 1] ?? null
      break
    }
  }

  if (!from || !to) {
    // Edge case: no valid pair. Hold last known state or extrapolate.
    return { state: buffer[buffer.length - 1], alpha: 1 }
  }

  // Compute interpolation factor
  const span = to.serverTime - from.serverTime
  const alpha = (renderTime - from.serverTime) / span
  const clampedAlpha = Math.max(0, Math.min(1, alpha))

  return { from, to, alpha: clampedAlpha }
}
```

### Interpolating Entity Properties

```typescript
function lerpEntity(from: EntityState, to: EntityState, alpha: number): EntityState {
  return {
    x: from.x + (to.x - from.x) * alpha,
    y: from.y + (to.y - from.y) * alpha,
    // Angle interpolation: use shortest path
    aimAngle: lerpAngle(from.aimAngle, to.aimAngle, alpha),
    // Discrete states: snap at alpha > 0.5 (or use 'to' state)
    state: alpha > 0.5 ? to.state : from.state,
    hp: to.hp,  // Health snaps to latest
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a
  // Normalize to [-PI, PI]
  while (diff > Math.PI) diff -= 2 * Math.PI
  while (diff < -Math.PI) diff += 2 * Math.PI
  return a + diff * t
}
```

### Hermite Interpolation

Linear interpolation (lerp) produces smooth position but can have velocity discontinuities (visible as direction "kinks" at snapshot boundaries). Hermite interpolation uses velocity data from both snapshots to produce C1-continuous curves:

```typescript
function hermite(
  p0: number, v0: number,  // position and velocity at 'from'
  p1: number, v1: number,  // position and velocity at 'to'
  t: number,               // 0..1 alpha
  dt: number               // time span between snapshots
): number {
  const t2 = t * t
  const t3 = t2 * t
  const h00 = 2*t3 - 3*t2 + 1
  const h10 = t3 - 2*t2 + t
  const h01 = -2*t3 + 3*t2
  const h11 = t3 - t2
  return h00*p0 + h10*v0*dt + h01*p1 + h11*v1*dt
}
```

Glenn Fiedler recommends hermite interpolation in his [Snapshot Interpolation article](https://gafferongames.com/post/snapshot_interpolation/) for physics-heavy games. For a top-down 2D action game, linear interpolation is usually sufficient.

### Buffer Management

The snapshot buffer must handle:

1. **Jitter**: Packets arrive at irregular intervals. Buffer enough to absorb 2-3 packets of jitter.
2. **Packet loss**: If a snapshot is lost, the buffer must still provide a valid pair. The 100ms delay gives a 2-packet safety margin at 20Hz.
3. **Overflow**: Old snapshots must be evicted. Keep only the last 5-10 snapshots.
4. **Underflow**: If no valid pair exists (severe packet loss or connection stall), hold the last known state rather than extrapolating wildly.

The existing `SnapshotBuffer` in the High Noon client uses `performance.now()` for receive timestamps. This works but has a limitation: it does not account for server time. When clock sync is added (see Section 7), timestamps should be in estimated server time, not local wall-clock time.

---

## 5. Extrapolation / Dead Reckoning

### When Interpolation Fails

Interpolation requires two known states. If the latest snapshot is too old (severe packet loss or lag spike), the client must either:

1. **Hold last known state**: Entity freezes at its last position. Safe but looks bad.
2. **Extrapolate**: Project the entity forward using its last known velocity.

### Dead Reckoning Algorithm

```typescript
function extrapolate(
  lastState: EntityState,
  timeSinceLastSnapshot: number
): EntityState {
  return {
    x: lastState.x + lastState.vx * timeSinceLastSnapshot,
    y: lastState.y + lastState.vy * timeSinceLastSnapshot,
    aimAngle: lastState.aimAngle,  // Don't extrapolate rotation
    state: lastState.state,
  }
}
```

### When to Extrapolate vs. Hold

| Situation | Recommendation |
|-----------|----------------|
| < 1 extra snapshot interval late | Extrapolate linearly |
| 1-3 snapshot intervals late | Extrapolate with decay (reduce velocity) |
| > 3 snapshot intervals late | Hold last state, show "connection" indicator |
| Entity was stationary | Always hold (extrapolation = same thing) |
| Entity was turning | Hold (linear extrapolation will overshoot turns) |

### Extrapolation with Decay

To avoid entities flying off into the distance during extended packet loss:

```typescript
const MAX_EXTRAPOLATION_TIME = 250  // ms, roughly 5 snapshots at 20Hz

function extrapolateWithDecay(
  lastState: EntityState,
  timeSinceLastSnapshot: number
): EntityState {
  const t = Math.min(timeSinceLastSnapshot, MAX_EXTRAPOLATION_TIME)
  // Exponential velocity decay during extrapolation
  const decay = Math.exp(-3.0 * t / MAX_EXTRAPOLATION_TIME)

  return {
    x: lastState.x + lastState.vx * t * decay,
    y: lastState.y + lastState.vy * t * decay,
    aimAngle: lastState.aimAngle,
    state: lastState.state,
  }
}
```

### Snap-Back on Recovery

When a new snapshot finally arrives after extrapolation, the entity may need to "snap back" to its real position. Use the same visual smoothing as misprediction correction (Section 2): calculate the error offset between the extrapolated position and the new authoritative position, then decay it exponentially.

### Relevance to High Noon

For a top-down action game over WebSocket (TCP), extended packet loss is less common than with UDP. TCP's reliable delivery means packets arrive eventually, but head-of-line blocking can cause bursty delivery. The interpolation buffer (100ms delay) absorbs most of this. Extrapolation should be implemented as a fallback but should not be the primary rendering strategy.

---

## 6. Lag Compensation

### The "Shooting Where They Were" Problem

The local player sees remote entities rendered in the past (by interpolation delay + network latency). When the player fires at what they see on screen, the target is no longer at that position on the server. Without compensation, shots that look perfect on the client's screen will miss on the server.

From the [Valve Developer Wiki](https://developer.valvesoftware.com/wiki/Lag_Compensation): "Lag compensation is the notion of the server using a player's latency to rewind time when processing a usercmd, in order to see what the player saw when the command was sent."

### Server-Side Rewind (Hitscan Weapons)

The standard approach, used by Counter-Strike, Overwatch, and Valorant:

```
ON_PLAYER_FIRE(client, fireInput):
  // 1. Calculate when the player actually fired
  commandTime = currentServerTime
                - client.latency
                - client.interpolationDelay

  // 2. Rewind all entities to their positions at commandTime
  savedPositions = saveAllEntityPositions()
  rewindEntitiesToTime(commandTime)

  // 3. Perform hit detection against rewound positions
  hitResult = performRaycast(
    fireInput.origin,
    fireInput.direction
  )

  // 4. Restore all entities to current positions
  restoreAllEntityPositions(savedPositions)

  // 5. Apply damage based on hit result
  if (hitResult.hit) {
    applyDamage(hitResult.entity, weapon.damage)
  }
```

### Position History Buffer

The server must store a history of entity positions for rewind:

```typescript
interface PositionRecord {
  tick: number
  serverTime: number
  entities: Map<number, { x: number; y: number; radius: number }>
}

class PositionHistory {
  private history: PositionRecord[] = []
  private maxAge: number = 1000  // 1 second of history

  record(tick: number, serverTime: number, world: GameWorld): void {
    const record: PositionRecord = {
      tick,
      serverTime,
      entities: new Map()
    }
    // Save positions of all relevant entities
    for (const eid of playerQuery(world)) {
      record.entities.set(eid, {
        x: Position.x[eid],
        y: Position.y[eid],
        radius: Collider.radius[eid]
      })
    }
    this.history.push(record)
    // Evict old records
    this.evictOlderThan(serverTime - this.maxAge)
  }

  /** Find the two records bracketing the target time, interpolate between them */
  getPositionsAtTime(targetTime: number): Map<number, { x: number; y: number }> {
    let before: PositionRecord | null = null
    let after: PositionRecord | null = null

    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].serverTime <= targetTime) {
        before = this.history[i]
        after = this.history[i + 1] ?? before
        break
      }
    }

    if (!before) return new Map()

    // Interpolate between before and after
    const span = after.serverTime - before.serverTime
    const alpha = span > 0
      ? (targetTime - before.serverTime) / span
      : 0

    const result = new Map<number, { x: number; y: number }>()
    for (const [eid, pos] of before.entities) {
      const afterPos = after.entities.get(eid)
      if (afterPos) {
        result.set(eid, {
          x: pos.x + (afterPos.x - pos.x) * alpha,
          y: pos.y + (afterPos.y - pos.y) * alpha,
        })
      }
    }
    return result
  }
}
```

### Lag Compensation for Projectile Weapons

Hitscan weapons are straightforward: rewind, raycast, restore. Projectiles are more complex because they travel over time. There are several approaches:

**Approach A: Spawn with fast-forward (recommended for High Noon)**

The server receives a "fire" input. It knows the client fired `latency` ms ago. It spawns the bullet at the fire position and immediately simulates it forward by `latency` ticks, with hit detection performed against rewound entity positions at each step.

```
ON_PROJECTILE_FIRE(client, fireInput):
  latencyTicks = Math.round(client.latency / TICK_MS)

  // Spawn bullet at the position the player was at when they fired
  bullet = spawnBullet(
    fireInput.originX, fireInput.originY,
    fireInput.directionX, fireInput.directionY,
    weapon.bulletSpeed
  )

  // Fast-forward the bullet, checking collisions at each historical tick
  for (let t = 0; t < latencyTicks; t++):
    historicalTick = currentTick - latencyTicks + t
    rewindEntitiesToTick(historicalTick)
    advanceBullet(bullet, TICK_MS)
    if (checkBulletCollisions(bullet)):
      // Hit detected during fast-forward
      applyDamage(...)
      destroyBullet(bullet)
      break
    restoreEntityPositions()
```

**Approach B: Continuous rewind per bullet tick**

Each tick, all active lag-compensated projectiles check collisions against rewound entity positions. The rewind time is:

```
rewindTime = inputQueueDelay + interpolationDelay + clientLatency - timeSinceFired
```

As the projectile ages on the server, the rewind amount decreases until it reaches zero (the projectile has "caught up" to real-time).

**Approach C: Client-authoritative projectile hits (trust the client)**

For casual games, the client can report "I hit entity X at position Y" and the server validates it loosely (was the entity roughly there? was it within weapon range?). This is simpler but more exploitable.

### Lag Compensation Limits

Most games cap the rewind time. Valve's Source Engine caps at 1 second. Beyond that, the advantage given to high-latency players becomes unfair to low-latency players who have already moved to safety. At the cap, the shot is simply evaluated against current server state (disadvantaging the laggy player).

### The Fairness Tradeoff

Lag compensation creates a "favor the shooter" model: if it looked like a hit on the shooter's screen, it registers as a hit. This means the victim can be hit even after they've moved behind cover on their own screen (they see "I was behind the wall!"). This is an inherent tradeoff. [Valve](https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking) explicitly chose to favor the shooter because it produces better gameplay feel overall.

---

## 7. Clock Synchronization

### Why It Matters

Several netcode systems need to know "what time is it on the server right now?":
- Interpolation render time: `renderTime = estimatedServerTime - interpolationDelay`
- Lag compensation rewind: knowing how far back to rewind
- Input timing: stamping inputs with server ticks

### Cristian's Algorithm (NTP-lite)

The simplest approach, based on [Cristian's Algorithm](https://en.wikipedia.org/wiki/Cristian%27s_algorithm):

```typescript
class ClockSync {
  private offset: number = 0  // serverTime = localTime + offset
  private samples: { offset: number; rtt: number }[] = []

  /** Send a ping, record local send time */
  sendPing(): void {
    const sendTime = performance.now()
    network.send({ type: 'ping', clientTime: sendTime })
  }

  /** Receive pong with server timestamp */
  onPong(clientSendTime: number, serverTime: number): void {
    const receiveTime = performance.now()
    const rtt = receiveTime - clientSendTime
    // Assume symmetric latency: server sent response at our midpoint
    const estimatedOffset = serverTime - (clientSendTime + rtt / 2)

    this.samples.push({ offset: estimatedOffset, rtt })

    // Keep best N samples (lowest RTT = most accurate)
    this.samples.sort((a, b) => a.rtt - b.rtt)
    if (this.samples.length > 10) {
      this.samples.length = 10
    }

    // Use median of best samples to reduce jitter
    this.offset = this.samples[Math.floor(this.samples.length / 2)].offset
  }

  /** Get estimated current server time */
  getServerTime(): number {
    return performance.now() + this.offset
  }
}
```

### Continuous Drift Correction

Clocks drift at roughly 1ms per 10 seconds. Re-sync every 5-10 seconds to stay within acceptable error.

Rather than jumping the clock when a new offset is calculated, apply a gradual correction:

```typescript
onNewOffset(newOffset: number): void {
  const error = newOffset - this.offset
  if (Math.abs(error) > 500) {
    // Large error: snap immediately (initial sync or reconnect)
    this.offset = newOffset
  } else {
    // Small error: blend gradually over time
    // Adjust both offset and tick rate slightly
    this.offset += error * 0.1  // 10% correction per sample
  }
}
```

### Tick-Based Time

For a fixed-timestep game, it is often simpler to synchronize tick numbers rather than wall-clock time:

```
estimatedServerTick = localTick + tickOffset
```

Where `tickOffset` is calculated similarly to time offset but in tick units. The server includes its current tick in every snapshot, and the client calculates:

```
tickOffset = serverTick - localTickAtReceiveTime + latencyInTicks
```

### Render Time Calculation

Combining clock sync with interpolation:

```typescript
function getRenderTime(): number {
  const estimatedServerTime = clockSync.getServerTime()
  const renderTime = estimatedServerTime - INTERPOLATION_DELAY
  return renderTime
}

// For tick-based systems:
function getRenderTick(): number {
  const estimatedServerTick = localTick + tickOffset
  const renderTick = estimatedServerTick - interpolationDelayTicks
  return renderTick
}
```

In the Valve Source Engine, the client render time is calculated as:
```
renderTime = serverTime - cl_interp
```
Where `cl_interp` defaults to 100ms (0.1 seconds) and `serverTime` is the estimated current server time accounting for latency.

---

## 8. Putting It All Together

### The Complete Client Frame

Here is how all the pieces combine in a single client frame:

```
CLIENT_FRAME(dt):
  // 1. Collect input
  input = collectInput()
  input.seq = ++seqCounter

  // 2. Send input to server (with redundancy)
  network.sendInput(input, previousInputs)

  // 3. Client-side prediction: apply input to local player
  saveInputForReconciliation(input)
  applyInput(localPlayer, input)
  advanceLocalSimulation(dt)

  // 4. Check for new server snapshots
  if (newSnapshot = network.receiveSnapshot()):
    // 4a. Server reconciliation for local player
    localPlayer.state = newSnapshot.localPlayerState
    discardAcknowledgedInputs(newSnapshot.lastAckedSeq)
    replayUnacknowledgedInputs()
    calculateMispredictionError()

    // 4b. Push snapshot into interpolation buffer for remote entities
    snapshotBuffer.push(newSnapshot)

    // 4c. Update clock sync
    clockSync.update(newSnapshot.serverTime)

  // 5. Calculate render time for remote entities
  renderTime = clockSync.getServerTime() - INTERPOLATION_DELAY

  // 6. Interpolate remote entities
  interpState = snapshotBuffer.getInterpolatedState(renderTime)
  for (remoteEntity in interpState):
    remoteEntity.renderPos = lerp(interpState.from, interpState.to, interpState.alpha)

  // 7. Render
  renderLocalPlayer(localPlayer.simPos + localPlayer.errorOffset)
  renderRemoteEntities(interpolatedPositions)
  renderBullets()  // Mix of predicted local + interpolated remote
  renderEffects()
```

### The Complete Server Tick

```
SERVER_TICK():
  // 1. Process received inputs
  for (player in connectedPlayers):
    input = player.inputBuffer.pop()
    world.playerInputs.set(player.eid, input)
    player.lastProcessedSeq = input.seq

  // 2. Record positions for lag compensation history
  positionHistory.record(currentTick, serverTime, world)

  // 3. Step simulation (shared code)
  stepWorld(world, systems)

  // 4. Broadcast snapshot (at snapshot rate, e.g., every 3 ticks for 20Hz)
  if (currentTick % SNAPSHOT_INTERVAL == 0):
    for (player in connectedPlayers):
      snapshot = encodeSnapshot(world, player.lastProcessedSeq)
      player.sendBytes(snapshot)
```

### Architecture Summary

```
┌──────────────────────────────────────────────────────────────────┐
│                           CLIENT                                 │
│                                                                  │
│  ┌──────────┐    ┌─────────────┐    ┌──────────────────────┐    │
│  │  Input    │───▶│  Prediction │───▶│  Local Player Render │    │
│  │ Capture   │    │  (shared    │    │  (sim pos + error    │    │
│  └──────────┘    │   sim code) │    │   offset, decayed)   │    │
│       │          └──────┬──────┘    └──────────────────────┘    │
│       │                 │                                        │
│       ▼                 ▼                                        │
│  ┌──────────┐    ┌─────────────┐    ┌──────────────────────┐    │
│  │  Network  │    │  Reconcile  │    │  Remote Entity       │    │
│  │  Send     │    │  (rewind &  │    │  Render (interpolate │    │
│  └──────────┘    │   replay)   │    │  between snapshots)  │    │
│                  └──────┬──────┘    └──────────┬───────────┘    │
│                         │                      │                 │
│                         ▼                      ▼                 │
│                  ┌─────────────┐    ┌──────────────────────┐    │
│                  │  Input      │    │  Snapshot Buffer      │    │
│                  │  Buffer     │    │  + Clock Sync         │    │
│                  └─────────────┘    └──────────────────────┘    │
└──────────────────────────┬───────────────────┬───────────────────┘
                           │                   │
                      input│              snapshot│
                           ▼                   │
┌──────────────────────────┴───────────────────┴───────────────────┐
│                          SERVER                                   │
│                                                                   │
│  ┌──────────────┐  ┌────────────┐  ┌──────────────────────────┐  │
│  │  Input Queue  │─▶│  Shared    │─▶│  Snapshot Encode         │  │
│  │  (per player) │  │  Sim Step  │  │  + Broadcast             │  │
│  └──────────────┘  └──────┬─────┘  └──────────────────────────┘  │
│                           │                                       │
│                    ┌──────▼──────┐                                │
│                    │  Position   │                                │
│                    │  History    │                                │
│                    │  (for lag   │                                │
│                    │   comp)     │                                │
│                    └─────────────┘                                │
└──────────────────────────────────────────────────────────────────┘
```

### High Noon-Specific Considerations

1. **Event-driven bullets**: Instead of snapshotting every bullet position (potentially hundreds), replicate bullet spawn events (origin, direction, speed, owner) and let clients simulate bullets locally. The server is authoritative for hit detection and damage.

2. **ECS compatibility**: The prediction and reconciliation system must work with bitECS's SoA (Structure of Arrays) component storage. Saving and restoring state means reading/writing to typed arrays (`Position.x[eid]`, `Velocity.x[eid]`, etc.).

3. **Deterministic shared sim**: Because all game logic lives in `packages/shared`, the client can run exactly the same `stepWorld()` function for prediction as the server runs authoritatively. This maximizes prediction accuracy.

4. **Roll/ability prediction**: State machines (roll, showdown ability) need their full state saved in the input buffer for replay during reconciliation.

5. **WebSocket transport**: TCP-based transport means reliable ordering but potential head-of-line blocking. Input redundancy is not strictly needed, but the input queue buffer on the server (already implemented) handles bursty delivery.

---

## 9. Sources

### Canonical Articles

- [Gabriel Gambetta - Client-Side Prediction and Server Reconciliation](https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html) -- The definitive walkthrough of prediction, sequence numbers, and rewind-and-replay reconciliation.
- [Gabriel Gambetta - Entity Interpolation](https://www.gabrielgambetta.com/entity-interpolation.html) -- Interpolation delay, rendering remote entities "in the past."
- [Gabriel Gambetta - Client-Server Game Architecture](https://www.gabrielgambetta.com/client-server-game-architecture.html) -- Overview of the authoritative server model.
- [Glenn Fiedler (Gaffer On Games) - Snapshot Interpolation](https://gafferongames.com/post/snapshot_interpolation/) -- Jitter buffers, hermite vs linear interpolation, handling packet loss.
- [Glenn Fiedler - State Synchronization](https://gafferongames.com/post/state_synchronization/) -- Sending both input and state, client prediction with server authority.
- [Glenn Fiedler - Fix Your Timestep!](https://gafferongames.com/post/fix_your_timestep/) -- Fixed-timestep simulation with accumulator pattern.
- [Glenn Fiedler - Deterministic Lockstep](https://gafferongames.com/post/deterministic_lockstep/) -- Alternative approach: send only inputs, rely on determinism.

### Engine/Game Documentation

- [Valve Developer Wiki - Source Multiplayer Networking](https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking) -- Comprehensive coverage of prediction, interpolation (cl_interp), and lag compensation in the Source engine.
- [Valve Developer Wiki - Lag Compensation](https://developer.valvesoftware.com/wiki/Lag_Compensation) -- Server-side rewind algorithm, position history, command execution time formula.
- [Valve Developer Wiki - Latency Compensating Methods](https://developer.valvesoftware.com/wiki/Latency_Compensating_Methods_in_Client/Server_In-game_Protocol_Design_and_Optimization) -- The original Yahn Bernier paper on client/server protocol design.

### GDC Talks

- [Overwatch Gameplay Architecture and Netcode (GDC 2017)](https://www.gdcvault.com/play/1024001/-Overwatch-Gameplay-Architecture-and) -- ECS architecture, deterministic simulation, and netcode in a competitive FPS.
- [Jared Cone - It IS Rocket Science! (GDC 2018)](https://ubm-twvideo01.s3.amazonaws.com/o1/vault/gdc2018/presentations/Cone_Jared_It_Is_Rocket.pdf) -- Physics networking, input decay, rollback in Rocket League.

### Rollback / Fighting Games

- [GGPO - Rollback Networking SDK](https://www.ggpo.net/) -- The standard for peer-to-peer rollback netcode in fighting games.
- [SnapNet - Netcode Architectures Part 2: Rollback](https://www.snapnet.dev/blog/netcode-architectures-part-2-rollback/) -- Detailed comparison of rollback vs delay-based netcode.

### Projectile Lag Compensation

- [Nicola Geretti - Netcode Series Part 4: Projectiles](https://medium.com/@geretti/netcode-series-part-4-projectiles-96427ac53633) -- Projectile prediction, spawn fast-forward, and per-tick rewind.
- [Daniel Jimenez Morales - The Art of Hit Registration](https://danieljimenezmorales.github.io/2023-10-29-the-art-of-hit-registration/) -- Server-side rewind implementation walkthrough.

### Clock Synchronization

- [Daposto - Game Networking: Time, Tick, Clock Synchronisation](https://daposto.medium.com/game-networking-2-time-tick-clock-synchronisation-9a0e76101fe5) -- Practical clock sync for games.
- [GameDev.net - Clock Synchronization of Client Programs](https://www.gamedev.net/articles/programming/networking-and-multiplayer/clock-synchronization-of-client-programs-r2493/) -- NTP-lite algorithms for game clients.

### Misprediction Smoothing

- [4AM Games - Smooth Server Reconciliation](https://fouramgames.com/blog/fast-paced-multiplayer-implementation-smooth-server-reconciliation) -- Visual error offset with exponential decay.
- [GameDev.net - Smoothing Corrections to Client-Side Prediction](https://www.gamedev.net/forums/topic/658931-smoothing-corrections-to-client-side-prediction/5168001/) -- Community discussion of correction techniques.

### Dead Reckoning

- [Gamasutra - Dead Reckoning: Latency Hiding for Networked Games](https://www.gamedeveloper.com/programming/dead-reckoning-latency-hiding-for-networked-games) -- When to extrapolate, threshold-based updates, decay methods.
