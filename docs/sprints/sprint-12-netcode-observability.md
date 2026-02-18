# Sprint 12: Netcode Observability + Baseline

**Goal**: Make multiplayer behavior measurable before more tuning. Establish per-shot tracing with rewind metadata, client/server hit-agreement metrics (distinguishing correctness from clarity), reconciliation/jitter telemetry overlays with time-series graphs, desync detection via state hashing, and replay capture for bad sessions.

**Dates**: Feb 23 – Mar 6

**Depends on**: Current main (Sprint 7 netcode complete, MultiplayerTelemetry exists)

**Exit criteria**: Clear p50/p95 dashboards for hit agreement, correction distance, rubber-banding, and end-to-end shot latency. Desync detection operational. Server tick budget and per-phase timing visible.

---

## Prior Art & Design Rationale

This sprint's design draws from production netcode observability practices in shipping titles:

- **Valorant** (Riot): Per-shot traces include client simulation time, server rewind distance, and a `hitResult` enum. Their key insight: most player "hit reg" complaints are **clarity** issues (misleading visual feedback), not **correctness** issues (wrong server outcome). They separate these in telemetry. They also instrument per-subsystem server frame budgets for regression tracking.
- **Overwatch** (Blizzard): Uses command frames (time quantized to 16ms). Custom bounding boxes span entity positions across a time interval, reducing unnecessary rollbacks. Lag compensation capped at 250ms.
- **Halo: Reach** (Bungie): Embedded network profiling data into all replays — any replay can show packets sent to every player at every frame. Added a "lag button" for playtesters to press when something felt off, correlating subjective reports with network conditions.
- **Source Engine** (Valve): The `net_graph` is the gold standard for dev-facing overlays — scrolling bar charts where each bar is a packet, color-coded by health (green/yellow/red), plus `sv`/`var`/`lerp` gauges.
- **Apex Legends** (Respawn): Server acts as a "time machine" with constant state rollback. Internal diagnostic code renders hitbox trajectories but only in internal playtests. They analyze one week of telemetry at a time to catch regressions.
- **Desync debugging** (Forrest Smith / RTS engines): Periodic state hashing with binary-search narrowing to find exact divergence tick. Hash subsystems separately (positions, health, weapons, RNG) to isolate which system diverged.

---

## Current State

**What exists:**
- `MultiplayerTelemetry` tracks snapshot recv/applied/dropped counts, reconciliation corrections/snaps, and predicted bullet spawn/match/timeout counts
- `DebugRenderer` has a `netTelemetry?: string` field and renders green monospace text overlay, toggled via backtick
- `ClockSync` computes RTT and server-time offset via Cristian's algorithm (ping every 5s, median of 10 samples)
- `MultiplayerReconciler` returns `{ hadCorrection, correctionErrorMagnitude, snapped }` per reconciliation
- `PredictedEntityTracker` matches predicted bullets to server bullets with tolerance windows (40px + latency, fallback 180px)
- `shootSeq` is a monotonic counter on `MultiplayerModeController` incremented on shoot press-edges
- Server sends `shot-result` messages with hitscan impact data (`hitEnemyEid`, `hitPlayerEid`, impact position)
- Snapshot protocol v10 includes `lastProcessedSeq` per player (input acknowledgment)
- Deterministic simulation via `packages/shared` with seeded RNG — enables input-based replay and state hashing

**What doesn't exist:**
- Per-shot end-to-end latency tracing with rewind metadata (how far did the server rewind? was it clamped?)
- Correctness vs clarity distinction in hit feedback (Valorant insight)
- Client/server hit-agreement tracking with no-reg rate
- Misprediction error histograms or percentile tracking
- RTT variance / jitter trending, packet loss estimation
- Bandwidth monitoring (bytes in/out per second)
- Server tick budget monitoring with per-phase timing (input/sim/replication)
- Snapshot interpolation delay monitoring (how often adaptive delay adjusts, how often buffer runs dry)
- Input queue depth visibility
- Desync detection via periodic state hashing
- Session replay capture for post-hoc debugging
- Scrolling time-series graphs (Source net_graph style)
- Subjective lag reporting ("lag button" for playtesting)
- Any persistent metrics (everything is transient console logs)

---

## Design Constraints

1. **Zero gameplay impact** — All telemetry is read-only observation. No simulation changes, no additional network messages in the hot path (shot traces piggyback on existing `shot-result`).
2. **Dev-only by default** — Overlays and recording are gated behind debug mode. No perf cost in production builds beyond the collection ring buffers.
3. **Deterministic sim unaffected** — No new state in `packages/shared` except the state hash utility (pure function, no side effects). Metrics live in client and server packages.
4. **Additive to existing telemetry** — Extend `MultiplayerTelemetry` and `DebugRenderer` rather than replacing them.
5. **Structured and queryable** — All server-side logs are single-line JSON, parseable by `jq`. All client-side metrics use ring buffers with percentile computation.

---

## Epic Overview

| # | Epic | Package(s) | Priority | Estimate |
|---|------|-----------|----------|----------|
| 1 | Per-shot tracing pipeline | client, server | P0 | Medium |
| 2 | Hit-agreement metrics | client | P0 | Medium |
| 3 | Reconciliation & jitter telemetry | client | P0 | Medium |
| 4 | Enhanced debug overlay | client | P0 | Medium |
| 5 | Desync detection via state hashing | shared, client, server | P0 | Medium |
| 6 | Session replay capture | client | P1 | Large |
| 7 | Server-side diagnostics logging | server | P1 | Medium |

---

## Epic 1: Per-Shot Tracing Pipeline

Track the full lifecycle of every shot from client input through server rewind to visual result. Inspired by Valorant's per-shot traces that include simulation time, rewind distance, and outcome classification.

### Ticket 1.1 — Define ShotTrace data structure

**File**: `packages/client/src/net/ShotTrace.ts` (new)

Define the trace record that follows a shot through the pipeline. Key additions from research: `clientSimTick` (what server tick the client thinks it's at when firing — used for rewind), rewind metadata from the server, and a `hitResult` enum that distinguishes correctness from clarity:

```typescript
/** Outcome classification per Valorant's correctness/clarity model */
export enum HitResult {
  HIT,             // Server confirmed hit on intended target
  MISS,            // Clean miss — no entity in fire line
  NO_REG,          // Client showed hit but server disagreed (clarity failure)
  TARGET_MISMATCH, // Client hit entity A, server hit entity B
  REWIND_CLAMPED,  // Server could not rewind far enough (high latency)
}

export interface ShotTrace {
  // Client-side (filled on fire)
  shootSeq: number            // Monotonic shot ID from client
  inputSeq: number            // The input frame that contained this shot
  clientFireTime: number      // performance.now() when shoot pressed
  clientSimTick: number       // Client's estimated server tick at fire time
  clientAimAngle: number      // Aim angle at fire time
  clientPlayerX: number       // Player position at fire time
  clientPlayerY: number
  clientRTT: number           // RTT at moment of fire (from ClockSync)

  // Server response (filled on shot-result)
  serverAckTime?: number      // performance.now() when shot-result received
  serverReceiveTick?: number  // Server tick when fire command was processed
  rewindTicks?: number        // How many ticks the server rewound
  rewindClamped?: boolean     // Was rewind capped at max allowed?
  serverHitEnemyEid?: number  // What the server says was hit
  serverHitPlayerEid?: number
  serverImpactX?: number      // Server's impact position
  serverImpactY?: number
  serverFrameTimeMs?: number  // Server tick budget usage when shot processed

  // Prediction result (filled by PredictedEntityTracker)
  predictedHitEid?: number    // What the client predicted it would hit
  bulletMatched?: boolean     // Did predicted bullet match server bullet?
  matchLatency?: number       // Time from fire to bullet match (ms)

  // Classification (filled when both client and server data available)
  hitResult?: HitResult       // Final outcome classification
}
```

### Ticket 1.2 — ShotTraceBuffer ring buffer

**File**: `packages/client/src/net/ShotTrace.ts`

A fixed-size ring buffer that stores the last N shot traces for analysis:

```typescript
export class ShotTraceBuffer {
  private buffer: ShotTrace[]
  private head = 0
  private count = 0

  constructor(private capacity = 256)  // ~4 minutes of continuous fire

  /** Start a new trace when the client fires */
  open(shootSeq: number, inputSeq: number, fireTime: number,
       simTick: number, aimAngle: number, playerX: number,
       playerY: number, rtt: number): void

  /** Attach server response to an existing trace */
  attachServerResult(shootSeq: number, result: ShotResultMessage): void

  /** Attach predicted bullet match info */
  attachPredictionResult(shootSeq: number, predictedHitEid: number,
                         matched: boolean, matchLatency: number): void

  /** Classify the outcome once both sides are available */
  private classify(trace: ShotTrace): HitResult

  /** Get completed traces for analysis */
  getCompletedTraces(last?: number): readonly ShotTrace[]

  /** Compute summary stats */
  getSummary(): ShotTraceSummary
}

export interface ShotTraceSummary {
  totalShots: number
  serverAcked: number
  avgLatencyMs: number         // Fire → server ack
  p50LatencyMs: number
  p95LatencyMs: number
  hitAgreementRate: number     // Client predicted hit = server hit
  noRegRate: number            // Client showed hit, server disagreed
  rewindClampRate: number      // % of shots where server couldn't fully rewind
  bulletMatchRate: number      // Predicted bullet matched server bullet
  avgRewindTicks: number       // Average ticks server rewound per shot
}
```

**Classification logic** (in `classify`):

```typescript
private classify(trace: ShotTrace): HitResult {
  if (trace.rewindClamped) return HitResult.REWIND_CLAMPED

  const clientHit = trace.predictedHitEid ?? null
  const serverHit = trace.serverHitEnemyEid ?? trace.serverHitPlayerEid ?? null

  if (clientHit && serverHit && clientHit === serverHit) return HitResult.HIT
  if (!clientHit && !serverHit) return HitResult.MISS
  if (clientHit && serverHit && clientHit !== serverHit) return HitResult.TARGET_MISMATCH
  if (clientHit && !serverHit) return HitResult.NO_REG  // Clarity failure
  return HitResult.MISS  // Server hit but client missed (rare with hitscan)
}
```

### Ticket 1.3 — Wire shot tracing into MultiplayerModeController

**File**: `packages/client/src/scenes/core/MultiplayerModeController.ts`

Integration points:

1. **On fire** (where `shootSeq` is incremented): call `shotTraceBuffer.open(...)` with current player position, aim angle, `performance.now()`, estimated server tick (from ClockSync), and current RTT
2. **On `shot-result` message**: call `shotTraceBuffer.attachServerResult(shootSeq, result)` — the server's `shot-result` message needs to echo back the `shootSeq` plus rewind metadata. See Ticket 1.4.
3. **On predicted bullet match** (in `PredictedEntityTracker`): call `shotTraceBuffer.attachPredictionResult(...)` when a predicted bullet is matched or times out

### Ticket 1.4 — Expand shot-result messages with rewind metadata

**Files**:
- `packages/server/src/rooms/GameRoom.ts`
- `packages/shared/src/net/messages.ts` (or wherever `ShotResultMessage` is typed)

Expand the server's `shot-result` message to include tracing data. This is the server-side half of the per-shot trace:

```typescript
interface ShotResultMessage {
  // Existing fields
  shootSeq: number
  hitEnemyEid?: number
  hitPlayerEid?: number
  impactX: number
  impactY: number

  // New tracing fields
  serverReceiveTick: number    // Server tick when input was processed
  rewindTicks: number          // How many ticks the server rewound for lag comp
  rewindClamped: boolean       // Did rewind hit the max cap?
  serverFrameTimeMs: number    // Server's tick budget usage (ms)
}
```

If the server doesn't currently track `shootSeq`, add it to the input processing path: when a shoot press-edge is detected, record `slot.lastShootSeq = input.shootSeq` and include it in the `shot-result` reply. The rewind data comes from the existing lag compensation logic — just expose what's already computed.

**Acceptance**:
- `shot-result` messages include `shootSeq`, rewind ticks, clamp flag, and server frame time
- Client can correlate every server hit result to its local trace
- No additional network messages (piggybacks on existing `shot-result`)
- Message size increase is small (~12 bytes per shot)

---

## Epic 2: Hit-Agreement Metrics

Track how often client prediction agrees with server authority on hit/miss outcomes. Distinguishes **correctness** (wrong outcome) from **clarity** (misleading visual feedback), following Riot's finding that most hit-reg complaints are clarity issues.

### Ticket 2.1 — HitAgreementTracker

**File**: `packages/client/src/net/HitAgreementTracker.ts` (new)

Classifies each shot into one of four outcomes, with explicit no-reg tracking:

```typescript
export enum HitOutcome {
  TRUE_HIT,      // Client predicted hit, server confirmed hit (on same target)
  TRUE_MISS,     // Client predicted miss, server confirmed miss
  NO_REG,        // Client showed hit, server said miss — "clarity failure"
  FALSE_MISS,    // Client predicted miss, server said hit
  TARGET_SWAP,   // Both sides hit something, but different targets
}

export interface HitAgreementStats {
  total: number
  trueHit: number
  trueMiss: number
  noReg: number
  falseMiss: number
  targetSwap: number
  agreementRate: number       // (trueHit + trueMiss) / total
  noRegRate: number           // noReg / total — the most player-visible problem
  hitAccuracyRate: number     // trueHit / (trueHit + noReg + falseMiss)
}

export class HitAgreementTracker {
  private outcomes: HitOutcome[]     // Ring buffer
  private windowSize: number

  constructor(windowSize = 200)      // Last 200 shots

  record(clientPredictedHit: number | null,
         serverConfirmedHit: number | null): void

  /** Full stats over the rolling window */
  getStats(): HitAgreementStats

  /** Quick agreement rate for overlay display */
  getAgreementRate(): number

  /** No-reg rate — the metric players feel most (client hit, server miss) */
  getNoRegRate(): number
}
```

### Ticket 2.2 — Wire hit agreement into shot trace completion

**File**: `packages/client/src/scenes/core/MultiplayerModeController.ts`

When a `ShotTrace` has both client prediction and server result filled in, classify and record:

```typescript
// In the shot-result handler, after attaching server result:
const trace = this.shotTraceBuffer.get(shootSeq)
if (trace && trace.hitResult !== undefined) {
  const clientHit = trace.predictedHitEid ?? null
  const serverHit = trace.serverHitEnemyEid ?? trace.serverHitPlayerEid ?? null
  this.hitAgreement.record(clientHit, serverHit)
}
```

### Ticket 2.3 — Debug-mode visual hit marker separation

**File**: `packages/client/src/render/BulletRenderer.ts` (or impact effect code)

When debug overlay is active, separate visual feedback from authoritative results by rendering hit markers in different colors:

- **White**: Client-predicted impact (immediate, on fire)
- **Green**: Server-confirmed impact (on `shot-result`, matching client)
- **Red**: No-reg — client showed impact but server disagreed

This makes clarity failures instantly visible during playtesting. Only active in debug mode — normal play shows the standard impact effects.

**Acceptance**:
- Every completed shot trace produces a hit-agreement classification
- No-reg rate is tracked separately from general disagreement
- Debug hit markers make clarity failures visually obvious
- Agreement rate, no-reg rate available for overlay display
- Handles edge cases: client hit enemy A but server hit enemy B = TARGET_SWAP

---

## Epic 3: Reconciliation & Jitter Telemetry

Upgrade the existing `MultiplayerTelemetry` with histograms, percentile tracking, and network health metrics. Inspired by Valorant's separation of RTT, RTT jitter, and processing delays as distinct graphs.

### Ticket 3.1 — RollingHistogram utility

**File**: `packages/client/src/net/RollingHistogram.ts` (new)

A lightweight sliding-window histogram for computing percentiles without unbounded memory:

```typescript
export class RollingHistogram {
  private samples: number[]
  private head = 0
  private count = 0

  constructor(private windowSize = 600)  // 10 seconds at 60Hz

  push(value: number): void

  /** Returns the value at the given percentile (0-1) */
  percentile(p: number): number   // Uses sorted copy of window

  mean(): number
  max(): number
  min(): number
  stddev(): number                // Standard deviation — useful for jitter
}
```

Keep it simple — sort-on-read is fine for a 600-element window called once per overlay refresh (not per frame).

### Ticket 3.2 — Expand MultiplayerTelemetry with histograms

**File**: `packages/client/src/scenes/core/MultiplayerTelemetry.ts`

Add histogram tracking for key metrics, organized into Valorant-style categories:

```typescript
// Connection health
rttHistory: RollingHistogram           // ms, fed from ClockSync each pong
jitterHistory: RollingHistogram        // ms, |rtt[n] - rtt[n-1]| per Valorant's jitter graph
packetLossEstimate: number             // %, estimated from snapshot sequence gaps
bandwidthIn: RollingHistogram          // bytes/sec, snapshot sizes / interval
bandwidthOut: RollingHistogram         // bytes/sec, input message sizes / interval

// Simulation health
snapshotInterval: RollingHistogram     // ms, time between snapshot arrivals
snapshotDeliveryRate: number           // actual snapshots/sec vs expected 20/sec
interpolationDelay: RollingHistogram   // ms, actual adaptive delay from SnapshotBuffer

// Prediction quality
correctionMagnitude: RollingHistogram  // pixels per reconciliation
inputRoundTrip: RollingHistogram       // ms, inputSeq send → ack in snapshot

// Server health (from expanded shot-result and future server metrics message)
serverFrameTime: RollingHistogram      // ms, server tick budget usage (from shot traces)
```

Feed these from existing data sources:
- `correctionMagnitude`: already returned by `MultiplayerReconciler.reconcile()`
- `rttHistory`: read from `ClockSync.getRTT()` each pong
- `jitterHistory`: `Math.abs(currentRTT - previousRTT)` on each pong
- `interpolationDelay`: from `SnapshotBuffer.getCurrentDelay()` (Ticket 3.3)
- `snapshotInterval`: `performance.now()` delta between consecutive snapshot arrivals
- `inputRoundTrip`: `performance.now()` at send minus `performance.now()` when snapshot acks that seq
- `packetLossEstimate`: count missing snapshot sequence numbers over a window
- `bandwidthIn`: track raw byte count of each snapshot message

### Ticket 3.3 — Expose SnapshotBuffer internals for telemetry

**File**: `packages/client/src/net/SnapshotBuffer.ts`

Add read-only getters for telemetry consumption:

```typescript
/** Current adaptive interpolation delay in ms */
getCurrentDelay(): number

/** Number of snapshots currently buffered */
getBufferDepth(): number

/** How many times the buffer ran dry (no valid interpolation pair) since last reset */
getStarvationCount(): number

/** Current interpolation alpha (0-1 normal, >1 extrapolating) */
getLastAlpha(): number

/** Last snapshot sequence number received (for packet loss estimation) */
getLastSnapshotSeq(): number
```

These are purely observational — no behavior changes.

### Ticket 3.4 — Rubber-banding detection metric

**File**: `packages/client/src/scenes/core/MultiplayerTelemetry.ts`

Define a "rubber-band event" using a threshold tuned from research (3+ corrections > 20px within 1 second indicates rubber-banding):

```typescript
// Detection state
private recentLargeCorrections: number[] = []  // timestamps of corrections > threshold
private readonly RUBBER_BAND_MAGNITUDE = 20    // px — minimum correction to count
private readonly RUBBER_BAND_WINDOW = 1000     // ms — time window
private readonly RUBBER_BAND_COUNT = 3         // corrections in window = rubber-banding

// Metrics
rubberBandEvents: number       // Lifetime count of rubber-band events
rubberBandRate: number         // Events per minute (rolling 60s window)
lastCorrectionDirX: number     // For detecting direction reversals
lastCorrectionDirY: number

// Also detect direction reversals as a secondary signal
directionReversals: number     // Corrections > 8px that reverse direction
```

This gives both a frequency metric (how often) and a severity metric (direction reversals indicate the worst visual artifacts).

**Acceptance**:
- All histograms are populated during normal multiplayer play
- Percentile computation returns sensible values after warmup
- Rubber-band detection fires on synthetic large-correction bursts
- Packet loss estimation detects missing snapshot sequences
- No allocation in hot path (ring buffer pre-allocated)

---

## Epic 4: Enhanced Debug Overlay

Upgrade the debug overlay from a text-only display to a Source-engine-style net graph with scrolling time-series, color-coded health indicators, and a lag button.

### Ticket 4.1 — Redesign telemetry overlay layout

**File**: `packages/client/src/scenes/core/MultiplayerTelemetry.ts`

Replace the single-line `getOverlayText()` with structured data output, organized into the three categories Valorant uses (connection, simulation, quality):

```
── CONNECTION ───────────────────
RTT       12ms  p95: 18ms       [▁▂▁▁▃▁▂▁▁▁▂▃▂▁▁]
Jitter    3ms   p95: 8ms        [▁▁▂▁▁▁▃▁▁▁▁▂▁▁▁]
Loss      0.1%  BW in: 4.2kB/s  out: 1.8kB/s

── SIMULATION ──────────────────
Snap rate 19/s  buf: 3/8  delay: 82ms
Interp α  0.45  starve: 0  extrap: 0
Sv frame  1.2ms p95: 3.1ms

── PREDICTION ──────────────────
Correct   2/s   p50: 1.2px  p95: 4.8px  [▁▁▃▁▁▁▁▂▁▁▅▁▁▁▁]
Snaps     0     rubber-band: 0/min
Input RT  18ms  p95: 24ms

── SHOTS ───────────────────────
Agreement 98.5%  no-reg: 0.5%  (last 50)
Latency   p50: 22ms  p95: 38ms
Rewind    avg: 3 ticks  clamped: 0%
Bullets   spawn: 12  match: 11  timeout: 1
```

The bracketed sections are inline sparkline representations of the rolling histogram — one character per sample (last 16 samples), using block characters (▁▂▃▄▅▆▇█) scaled to the window's min/max.

### Ticket 4.2 — Scrolling time-series graph renderer

**File**: `packages/client/src/render/NetGraph.ts` (new)

A PixiJS-based scrolling graph renderer inspired by Source engine's `net_graph`. Renders in the debug overlay layer:

```typescript
export class NetGraph {
  private container: Container
  private graphWidth = 200       // pixels
  private graphHeight = 40       // pixels per metric
  private scrollSpeed = 2        // pixels per frame

  constructor(layer: Container)

  /** Add a named metric series */
  addSeries(name: string, color: number, maxValue: number): void

  /** Push a new sample to a series (called each frame or each event) */
  pushSample(name: string, value: number): void

  /** Render all series as scrolling filled bar charts */
  render(): void

  /** Color-code based on health thresholds */
  setThresholds(name: string, good: number, warn: number, critical: number): void

  show(): void
  hide(): void
}
```

Default series:
- **RTT** (green < 40ms, yellow < 80ms, red > 80ms)
- **Correction magnitude** (green < 4px, yellow < 20px, red > 20px)
- **Interpolation buffer depth** (green >= 2, yellow = 1, red = 0)

Each bar in the scrolling chart represents one sample. Color transitions per Valve's net_graph convention: green = healthy, yellow = degraded, red = critical.

### Ticket 4.3 — Add telemetry overlay toggle

**File**: `packages/client/src/scenes/core/MultiplayerModeController.ts`

Add a separate keybind for the network telemetry overlay (don't overload the existing backtick debug toggle):

- **Key**: `N` (while debug overlay is active) cycles through: off → summary → detailed → graphs → off
- **Summary mode**: RTT, correction rate, hit agreement (3 lines of text)
- **Detailed mode**: Full text overlay from Ticket 4.1
- **Graphs mode**: Scrolling time-series from Ticket 4.2

**Acceptance**:
- Multi-line overlay renders cleanly at various window sizes
- Overlay updates at 4Hz (every 15 frames) for text, 60Hz for graphs
- Toggle cycles through modes without affecting gameplay input
- Zero rendering cost when overlay is off
- Color-coded values provide at-a-glance network health

### Ticket 4.4 — Lag button for playtesting

**File**: `packages/client/src/scenes/core/MultiplayerModeController.ts`

Inspired by Halo: Reach's playtesting approach: add a "lag button" that players/testers press when something feels wrong. This creates a timestamped marker in the replay and telemetry:

- **Key**: `L` (while debug overlay is active)
- Creates a `LagReport` entry:

```typescript
interface LagReport {
  timestamp: number          // performance.now()
  tick: number
  rtt: number
  correctionMag: number      // Current error magnitude
  bufferDepth: number        // Snapshot buffer level
  interpAlpha: number        // Interpolation state
  recentCorrections: number  // Corrections in last second
  playerNote?: string        // Optional text (future: prompt via overlay)
}
```

These reports are embedded in the session replay (Epic 6) and provide ground-truth subjective data about when the netcode "felt bad," correlated with objective metrics.

**Acceptance**:
- Pressing L captures a snapshot of all current network metrics
- Lag reports are stored in the replay data
- Visual flash confirms the report was captured
- Useful for correlating subjective feel with objective telemetry

---

## Epic 5: Desync Detection via State Hashing

Detect client/server simulation divergence early using periodic state hashes. Since the shared simulation is deterministic, any hash mismatch indicates a bug (not normal network behavior).

### Ticket 5.1 — State hash utility

**File**: `packages/shared/src/sim/stateHash.ts` (new)

A pure function that computes a hash of the game state. Hash subsystems separately to narrow down divergence location (per Forrest Smith's desync debugging approach):

```typescript
export interface StateHashResult {
  full: number              // Combined hash of all subsystems
  positions: number         // All entity positions
  health: number            // All health values
  weapons: number           // Weapon/cylinder states
  enemies: number           // Enemy AI states
  rng: number               // RNG state — critical for determinism
}

/** Compute CRC32 hashes of game state, broken down by subsystem */
export function computeStateHash(world: GameWorld): StateHashResult

/** Fast combined hash for routine checks */
export function computeQuickHash(world: GameWorld): number
```

Use CRC32 (fast, good enough for divergence detection). Hash the raw ECS component arrays for speed — no serialization step.

**Important**: This lives in `packages/shared` because both client and server need to compute identical hashes. It's a pure function with no side effects — no simulation impact.

### Ticket 5.2 — Server broadcasts state hash periodically

**File**: `packages/server/src/rooms/GameRoom.ts`

Every 60 ticks (1 second), compute and broadcast the state hash:

```typescript
// In tick():
if (this.world.tick % 60 === 0) {
  const hash = computeQuickHash(this.world)
  this.broadcast('state-hash', {
    tick: this.world.tick,
    hash
  })
}
```

The message is tiny (8 bytes: tick + hash) and sent at 1Hz — negligible bandwidth.

Gate behind a `DESYNC_CHECK` environment variable for production. Always on in dev.

### Ticket 5.3 — Client-side desync detection

**File**: `packages/client/src/scenes/core/MultiplayerModeController.ts`

On receiving a `state-hash` message, compare against the client's state at the same tick:

```typescript
private onStateHash(tick: number, serverHash: number): void {
  // The client's world may be ahead due to prediction — we need the
  // state at the specific server tick. Store recent hashes for comparison.
  const clientHash = this.stateHashHistory.get(tick)
  if (clientHash === undefined) return  // Don't have that tick yet

  if (clientHash !== serverHash) {
    this.telemetry.recordDesync(tick)

    // Log detailed subsystem hashes for debugging
    const detailed = computeStateHash(this.world)
    console.error('[DESYNC]', {
      tick,
      serverHash,
      clientHash,
      subsystems: detailed,
      rtt: this.clockSync.getRTT(),
      pendingInputs: this.inputBuffer.length
    })
  }
}
```

### Ticket 5.4 — State hash history ring buffer

**File**: `packages/client/src/scenes/core/MultiplayerModeController.ts`

Store the client's state hash after each reconciliation (when the client state should match the server):

```typescript
private stateHashHistory = new Map<number, number>()  // tick → hash
private maxHashHistory = 120  // 2 seconds of history

// After reconciliation, before replaying pending inputs:
const hash = computeQuickHash(this.world)
this.stateHashHistory.set(snapshot.tick, hash)

// Prune old entries
if (this.stateHashHistory.size > this.maxHashHistory) {
  const oldestKeep = snapshot.tick - this.maxHashHistory
  for (const [tick] of this.stateHashHistory) {
    if (tick < oldestKeep) this.stateHashHistory.delete(tick)
  }
}
```

**Acceptance**:
- State hash computed at 1Hz on both client and server
- Hash mismatch logged with subsystem breakdown
- No false positives during normal play (deterministic sim should always match after reconciliation)
- Desync count visible in telemetry overlay
- Hash computation takes < 0.5ms (benchmark against entity counts of 50-200)
- No gameplay impact — detection only, no automatic correction

---

## Epic 6: Session Replay Capture

Record enough data to replay and diagnose bad network sessions after the fact. Combines Halo: Reach's approach (embed network profiling in replays) with the deterministic input stream (since `packages/shared` is deterministic, we can replay from inputs + seed).

### Ticket 6.1 — Define replay capture format

**File**: `packages/client/src/net/SessionReplay.ts` (new)

A replay captures the client's view of a multiplayer session. Two layers: a per-tick frame stream (lightweight) and embedded shot traces + lag reports (event-driven):

```typescript
export interface ReplayFrame {
  tick: number
  timestamp: number             // performance.now()
  input: InputState             // What the client sent
  inputSeq: number
  predictedPlayerX: number
  predictedPlayerY: number
  serverPlayerX?: number        // From last snapshot (null between snapshots)
  serverPlayerY?: number
  correctionMag?: number        // If reconciliation happened this frame
  rtt?: number                  // If RTT sample this frame
  snapshotTick?: number         // If snapshot arrived this frame
  stateHash?: number            // If hash was computed this frame
  interpAlpha?: number          // Interpolation state for context
  bufferDepth?: number          // Snapshot buffer level
}

export interface SessionReplay {
  version: 1
  startTime: number
  seed: number
  characterId: string
  frames: ReplayFrame[]
  shotTraces: ShotTrace[]       // From Epic 1's ShotTraceBuffer
  lagReports: LagReport[]       // From Epic 4's lag button
  desyncEvents: Array<{ tick: number; serverHash: number; clientHash: number }>
  metadata: {
    avgRTT: number
    p95RTT: number
    p95Correction: number
    hitAgreement: number
    noRegRate: number
    rubberBandRate: number
    desyncCount: number
    duration: number
  }
}
```

### Ticket 6.2 — SessionReplayRecorder

**File**: `packages/client/src/net/SessionReplay.ts`

```typescript
export class SessionReplayRecorder {
  private frames: ReplayFrame[] = []
  private recording = false
  private maxFrames: number

  constructor(maxDurationSeconds = 300)  // 5 min x 60Hz = 18000 frames

  start(): void
  stop(): SessionReplay

  /** Called every simulation tick */
  recordFrame(frame: ReplayFrame): void

  /** Add a lag report (from lag button) */
  addLagReport(report: LagReport): void

  /** Add a desync event */
  addDesyncEvent(tick: number, serverHash: number, clientHash: number): void

  /** Check if recording is active */
  isRecording(): boolean

  /** Export as JSON blob for download */
  exportJSON(): string
}
```

### Ticket 6.3 — Wire replay recording into MultiplayerModeController

**File**: `packages/client/src/scenes/core/MultiplayerModeController.ts`

- Create `SessionReplayRecorder` on connect, start recording immediately
- Call `recordFrame()` each tick with current prediction/server state
- Feed lag reports and desync events as they occur
- On disconnect or session end, finalize the replay
- Store completed replay in memory (not auto-saved)

### Ticket 6.4 — Replay export keybind

**File**: `packages/client/src/scenes/core/MultiplayerModeController.ts`

Add a debug keybind (`Shift+R` while debug overlay is active) that:

1. Stops the current recording
2. Attaches final metadata (summary stats from all telemetry sources)
3. Downloads the replay as a `.json` file via `URL.createObjectURL` + anchor click
4. Starts a new recording

This allows developers to capture the last N minutes of play when they notice an issue.

**Acceptance**:
- Replay captures all frames at 60Hz for up to 5 minutes
- Export produces a valid JSON file with frames, shot traces, lag reports, and desync events
- Recording has negligible perf impact (pre-allocated array, no per-frame allocation)
- Memory usage bounded: ~18000 frames x ~120 bytes = ~2.2MB
- Lag reports and desync events are timestamped and embedded in the replay

---

## Epic 7: Server-Side Diagnostics Logging

Add structured logging on the server for post-hoc analysis. Inspired by Valorant's per-subsystem telemetry that tracks performance budgets per code area and feeds into analytics for regression detection.

### Ticket 7.1 — Per-phase tick timing

**File**: `packages/server/src/rooms/GameRoom.ts`

Instrument the server tick loop with per-phase timing, following Valorant's subsystem budget approach:

```typescript
private tick(): void {
  const tickStart = performance.now()

  // Phase 1: Process inputs
  const inputStart = performance.now()
  this.processAllInputs()
  const inputTime = performance.now() - inputStart

  // Phase 2: Run simulation
  const simStart = performance.now()
  this.stepSimulation()
  const simTime = performance.now() - simStart

  // Phase 3: Encode & broadcast snapshots
  const replicationStart = performance.now()
  this.broadcastSnapshot()
  const replicationTime = performance.now() - replicationStart

  const totalTime = performance.now() - tickStart

  // Track
  this.metrics.tickDuration.push(totalTime)
  this.metrics.phaseTiming.push({ input: inputTime, sim: simTime, repl: replicationTime })

  if (totalTime > TICK_BUDGET_MS) {
    this.metrics.overbudgetCount++
  }
}
```

Where `TICK_BUDGET_MS = 1000 / 60 ≈ 16.67ms`.

### Ticket 7.2 — Server-side per-room metrics

**File**: `packages/server/src/rooms/GameRoom.ts`

Track per-room metrics that are logged periodically (every 10 seconds) as structured JSON:

```typescript
interface RoomMetrics {
  event: 'room:metrics'
  roomId: string
  uptimeMs: number
  playerCount: number

  // Tick health
  effectiveTickRate: number        // Actual ticks/sec measured over period
  avgTickDurationMs: number        // Average ms per tick
  p95TickDurationMs: number        // p95 ms per tick
  overbudgetTicks: number          // Count exceeding 16.67ms this period
  overbudgetRate: number           // % of ticks over budget

  // Per-phase breakdown
  avgInputPhaseMs: number
  avgSimPhaseMs: number
  avgReplicationPhaseMs: number

  // Input health
  avgInputQueueDepth: number       // Per-player average
  maxInputQueueDepth: number       // Worst-case player
  inputsDropped: number            // Trimmed due to backlog this period
  inputsRateLimited: number        // Rejected by token bucket this period

  // Network
  snapshotsSent: number
  snapshotBytes: number            // Total bytes sent this period
  avgSnapshotSize: number          // Bytes per snapshot

  // Session
  reconnectAttempts: number
  reconnectSuccesses: number
  entityCount: number              // Total ECS entities in world
}
```

Log as single-line JSON to stdout. Parseable by `jq` for ad-hoc analysis, ingestible by any structured log aggregator.

### Ticket 7.3 — Per-shot server-side tracing

**File**: `packages/server/src/rooms/GameRoom.ts`

When processing a hitscan shot, log a structured trace with rewind metadata:

```typescript
if (process.env.TRACE_SHOTS) {
  console.log(JSON.stringify({
    event: 'shot',
    roomId: this.roomId,
    sessionId: client.sessionId,
    shootSeq,
    tick: this.world.tick,
    playerX, playerY, aimAngle,
    rewindTicks,
    rewindClamped,
    hitType: hitResult,          // 'enemy' | 'player' | 'miss'
    hitEid: targetEid ?? null,
    inputAge: this.world.tick - inputTick,  // How old was this input?
    processingLatencyMs: performance.now() - inputReceiveTime,
    serverFrameTimeMs: this.metrics.lastTickDuration
  }))
}
```

Gate behind `TRACE_SHOTS` environment variable so it's off by default.

### Ticket 7.4 — Alert threshold logging

**File**: `packages/server/src/rooms/GameRoom.ts`

Log warnings when metrics cross thresholds (based on production best practices):

| Condition | Log Level | Threshold |
|-----------|----------|-----------|
| Tick rate drop | WARN | Effective Hz < 55 for 10+ consecutive metrics windows |
| Tick budget overrun | WARN | >5% of ticks over budget in the metrics window |
| Input queue flooding | WARN | Any player queue depth > 10 for 2+ consecutive windows |
| High input drop rate | WARN | >10% of inputs dropped in the metrics window |
| Entity count spike | WARN | Entity count > 500 (possible leak) |

These are logged as structured JSON with `level: 'warn'` for easy filtering:

```typescript
if (this.metrics.overbudgetRate > 0.05) {
  console.log(JSON.stringify({
    event: 'room:alert',
    alert: 'tick_overbudget',
    roomId: this.roomId,
    overbudgetRate: this.metrics.overbudgetRate,
    avgTickMs: this.metrics.avgTickDurationMs,
    playerCount: this.slots.size
  }))
}
```

**Acceptance**:
- Room metrics logged every 10s as single-line JSON with per-phase timing
- Shot traces logged per shot when `TRACE_SHOTS=1`, including rewind metadata
- Alert thresholds produce structured warnings
- Tick budget overruns tracked per-phase (identify which subsystem is slow)
- No performance impact when shot tracing is off
- Logs are parseable by `jq` for ad-hoc analysis
- Effective tick rate computed from actual tick intervals (not just wall clock / tick count)

---

## Verification

1. `bun run typecheck` — no type errors across all packages
2. `bun run build` — builds cleanly
3. Manual test (multiplayer, 2 clients):
   - Open debug overlay → press N → summary appears → N again → detailed → N → graphs → N → off
   - RTT, jitter, correction rate, hit agreement, no-reg rate, shot latency all show real values
   - Fire shots → shot latency p50/p95 update, agreement rate updates
   - Scrolling graphs show RTT and correction magnitude in real-time, color-coded
   - Press L → visual flash confirms lag report captured
   - Artificially add 60ms delay (Chrome DevTools) → metrics reflect increased RTT/jitter, yellow/red colors appear
   - Press Shift+R → replay JSON downloads
   - Inspect replay JSON → contains frames, shot traces with rewind metadata, lag reports, metadata summary
4. Desync detection:
   - Normal play → zero desync events
   - Artificially break determinism (modify a system on client only) → desync detected and logged with subsystem hash breakdown
5. Server logs:
   - Room metrics appear every 10s with per-phase timing breakdown
   - Tick budget overruns produce alert logs
   - With `TRACE_SHOTS=1`, shot traces appear with rewind metadata
6. All p50/p95 values stabilize after ~5s of play (histogram warmup)
7. No measurable FPS drop with telemetry active (overlay text at 4Hz, graphs at 60Hz)
8. State hash computation benchmarked at < 0.5ms for 200 entities

---

## Epic Dependencies

```
Epic 1 (Shot Tracing)  ────────────────────► can start immediately
Epic 2 (Hit Agreement)  ───────────────────► after Epic 1
Epic 3 (Reconciliation Telemetry)  ────────► can start immediately
Epic 4 (Debug Overlay)  ───────────────────► after Epics 1-3
Epic 5 (Desync Detection)  ────────────────► can start immediately
Epic 6 (Session Replay)  ──────────────────► after Epics 1 and 5
Epic 7 (Server Diagnostics)  ──────────────► can start immediately
```

Epics 1, 3, 5, and 7 can be developed in parallel. Epic 2 depends on Epic 1's trace data. Epic 4 consumes all metric sources. Epic 6 depends on Epics 1 and 5 for shot traces and desync events.

---

## Estimated Scope

| Epic | Files Touched | New Files | Tests |
|------|--------------|-----------|-------|
| 1 | 3-4 | 1 | 3-5 new |
| 2 | 2-3 | 1 | 2-3 new |
| 3 | 2-3 | 1 | 2-4 new |
| 4 | 2-3 | 1 | 0 (manual) |
| 5 | 3-4 | 1 | 3-5 new |
| 6 | 2 | 1 | 1-2 new |
| 7 | 1-2 | 0 | 0 (manual) |

**Total**: ~15-20 files touched, 6 new files, 11-19 new tests

---

## References

- [Peeking into VALORANT's Netcode — Riot Games Technology](https://technology.riotgames.com/news/peeking-valorants-netcode)
- [VALORANT's 128-Tick Servers — Riot Games Technology](https://technology.riotgames.com/news/valorants-128-tick-servers)
- [The State of Hit Registration — VALORANT Dev Blog](https://playvalorant.com/en-us/news/dev/the-state-of-hit-registration/)
- [Overwatch Gameplay Architecture and Netcode — GDC 2017](https://www.gdcvault.com/play/1024001/-Overwatch-Gameplay-Architecture-and)
- [I Shot You First: Networking Halo: Reach — GDC 2011](https://www.gdcvault.com/play/1014345/I-Shot-You-First-Networking)
- [Apex Legends: Servers and Netcode Developer Deep Dive](https://www.ea.com/en-gb/games/apex-legends/news/servers-netcode-developer-deep-dive)
- [Source Multiplayer Networking — Valve Developer Community](https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking)
- [TF2 Network Graph — Valve Developer Community](https://developer.valvesoftware.com/wiki/TF2_Network_Graph)
- [Synchronous RTS Engines and a Tale of Desyncs — Forrest Smith](https://www.forrestthewoods.com/blog/synchronous_rts_engines_and_a_tale_of_desyncs/)
- [The Art of Hit Registration — Daniel Jimenez Morales](https://danieljimenezmorales.github.io/2023-10-29-the-art-of-hit-registration/)
- [Client-Side Prediction and Server Reconciliation — Gabriel Gambetta](https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html)
- [Snapshot Interpolation — Gaffer On Games](https://gafferongames.com/post/snapshot_interpolation/)
- [Monitor Game Server Tick Rate with OpenTelemetry](https://oneuptime.com/blog/post/2026-02-06-monitor-game-server-tick-rate-opentelemetry/view)
