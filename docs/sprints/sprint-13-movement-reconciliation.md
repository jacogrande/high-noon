# Sprint 13: Movement + Reconciliation Smoothness

**Goal**: Reduce visible jitter and correction snaps. Players should never notice the netcode working — movement should feel identical to singleplayer.

**Dates**: Mar 23 – Apr 3

**Depends on**: Sprint 12 (Netcode Observability — baseline metrics established)

**Exit criteria**: p95 correction magnitude and visual jitter drop materially from Sprint 12 baseline. Rubber-band event rate < 1/min at 60ms RTT.

---

## Current State

**What exists:**
- `MultiplayerReconciler` rewrites player position to server authority, replays pending inputs, computes `errorX/errorY` misprediction offset
- Error smoothing uses exponential decay: `error *= (1 - (1 - exp(-CORRECTION_SPEED * dt)))` with `CORRECTION_SPEED = 15`
- `SNAP_THRESHOLD = 96px` — teleport if error exceeds this, otherwise smooth
- `EPSILON = 0.5px` — ignore sub-pixel errors
- `SnapshotBuffer` has adaptive interpolation delay: base 80ms, max 160ms, increases quickly on jitter, decreases slowly
- Jitter detection: tracks receive interval deviation, adjusts `dynamicDelay` via `target = max(base, min(MAX, base + jitter * 2))`
- Remote players interpolated linearly between snapshot pairs using server-time-based alpha
- When snapshot buffer runs dry, alpha extends to ~1.25 for brief extrapolation before freezing
- Camera follows predicted position + error offset, pixel-rounded to prevent tilemap shimmer
- Reconciliation replays use movement-only systems (playerInput, roll, movement, collision) — no weapon/bullet prediction replay

**What doesn't exist:**
- Correction smoothing that adapts to error magnitude (small corrections smooth differently than large ones)
- Extrapolation with velocity for remote entities when buffer is empty
- Dynamic interpolation delay that responds to actual observed starvation vs just jitter
- Any smoothing on aim angle for remote players (snaps between snapshot values)
- Correction speed that adapts to network conditions (same 15 constant at 10ms RTT and 100ms RTT)
- Visual error offset capping (errorX/Y can theoretically grow large via accumulation)
- Server-side input timing adjustment (server processes inputs at fixed rate regardless of arrival timing)

---

## Design Constraints

1. **No shared package changes** — All smoothing is client-side rendering. The deterministic simulation is untouched.
2. **Measurable improvement** — Every change must be validated against Sprint 12 baseline metrics. If a change doesn't improve p95 correction or rubber-band rate, revert it.
3. **Frame-rate independent** — All smoothing uses `dt`-based exponential decay, never frame-count-based.
4. **No added latency** — Smoothing should reduce visual artifacts without making the game feel sluggier. Input-to-screen latency must not increase.
5. **Degrade gracefully** — At very high latency (>150ms RTT), the system should still work, just with more visible corrections. It should never break or oscillate.

---

## Epic Overview

| # | Epic | Package(s) | Priority | Estimate |
|---|------|-----------|----------|----------|
| 1 | Adaptive correction smoothing | client | P0 | Medium |
| 2 | Dynamic interpolation delay tuning | client | P0 | Medium |
| 3 | Remote entity extrapolation | client | P1 | Medium |
| 4 | Remote player aim smoothing | client | P1 | Small |
| 5 | Error offset safety & camera alignment | client | P1 | Small |
| 6 | Reconciliation replay improvements | client | P2 | Medium |

---

## Epic 1: Adaptive Correction Smoothing

Replace the fixed `CORRECTION_SPEED = 15` with rules that vary by error magnitude and network conditions.

### Ticket 1.1 — Tiered correction speed by error magnitude

**File**: `packages/client/src/scenes/core/MultiplayerModeController.ts`

Replace the constant correction speed with a tiered approach:

```typescript
function getCorrectionSpeed(errorMag: number, rtt: number): number {
  // Tiny errors (< 2px): correct very fast — player won't notice
  if (errorMag < 2) return 25

  // Small errors (< 8px): correct quickly
  if (errorMag < 8) return 18

  // Medium errors (< 32px): correct at moderate speed to avoid jarring snap
  if (errorMag < 32) return 10

  // Large errors (< SNAP_THRESHOLD): correct slowly — player will see this
  return 6
}
```

The intuition: small errors should vanish instantly (the player can't perceive 1-2px corrections). Large errors need to be eased in over several frames to avoid a visible snap.

**Acceptance**:
- Sub-2px corrections are invisible to the player
- 10-30px corrections smooth over ~200-300ms instead of ~100ms
- No change to the snap threshold (96px still teleports)

### Ticket 1.2 — RTT-aware snap threshold

**File**: `packages/client/src/scenes/core/MultiplayerModeController.ts`

The static `SNAP_THRESHOLD = 96` doesn't account for network conditions. At high latency, larger corrections are expected and should still be smoothed:

```typescript
function getSnapThreshold(rtt: number): number {
  // Base threshold at low latency
  const base = 96

  // Allow larger smoothed corrections at higher latency
  // At 100ms RTT: threshold = 96 + 48 = 144px
  // At 200ms RTT: threshold = 96 + 96 = 192px
  // Capped to prevent absurd teleport distances
  const latencyBonus = Math.min(rtt * 0.96, 192)
  return base + latencyBonus
}
```

Feed `rtt` from `ClockSync.getRTT()`.

**Acceptance**:
- At <20ms RTT: threshold ~96px (unchanged)
- At 100ms RTT: threshold ~144px (fewer visible snaps)
- Threshold capped at 288px (no infinite growth)
- Snap events decrease at high latency without hiding real desyncs

### Ticket 1.3 — Error velocity damping

**File**: `packages/client/src/scenes/core/MultiplayerModeController.ts`

**Problem**: When reconciliation corrections arrive in rapid succession with alternating directions, the error offset oscillates (rubber-banding). The current system accumulates `errorX += dx` every reconciliation without considering the current error velocity.

**Fix**: Track error velocity and apply damping:

```typescript
private errorVelX = 0
private errorVelY = 0

// In reconciliation, instead of:
//   this.errorX += dx
// Use:
const blendFactor = 0.7  // Dampen sudden direction changes
this.errorVelX = this.errorVelX * (1 - blendFactor) + dx * blendFactor
this.errorVelY = this.errorVelY * (1 - blendFactor) + dy * blendFactor
this.errorX += this.errorVelX
this.errorY += this.errorVelY
```

This acts as a low-pass filter on correction direction changes, reducing oscillation.

**Acceptance**:
- Rapidly alternating corrections produce less visual oscillation
- Single large corrections are still applied promptly (blendFactor doesn't over-dampen)
- Rubber-band event rate decreases in telemetry

---

## Epic 2: Dynamic Interpolation Delay Tuning

Improve the adaptive interpolation delay to reduce both starvation and unnecessary latency.

### Ticket 2.1 — Starvation-responsive delay adjustment

**File**: `packages/client/src/net/SnapshotBuffer.ts`

Currently the adaptive delay responds to receive-interval jitter. Add starvation as an explicit signal:

```typescript
private starvationCount = 0
private starvationWindow = 0  // Frames since last starvation

// In getInterpolationState():
if (/* no valid pair found */) {
  this.starvationCount++
  this.starvationWindow = 0
  // Immediately bump delay by half a snapshot interval
  this.dynamicDelay += this.avgSnapshotInterval * 0.5
  this.dynamicDelay = Math.min(this.dynamicDelay, MAX_INTERPOLATION_DELAY)
}

// In push() — track starvation recovery:
this.starvationWindow++
if (this.starvationWindow > 300) {  // 5 seconds without starvation
  // Allow delay to decrease more aggressively
  this.delayDecayRate = 0.15  // Faster than normal 0.1
}
```

### Ticket 2.2 — Separate delay for snapshot-rich vs snapshot-poor periods

**File**: `packages/client/src/net/SnapshotBuffer.ts`

**Problem**: When a burst of snapshots arrives after a gap (network batch), the delay overshoots. The delay should respond differently to consistent jitter vs burst patterns:

```typescript
private recentArrivalTimes: number[] = []  // Last 10 arrival times

private detectBurst(): boolean {
  if (this.recentArrivalTimes.length < 3) return false
  const gaps = []
  for (let i = 1; i < this.recentArrivalTimes.length; i++) {
    gaps.push(this.recentArrivalTimes[i] - this.recentArrivalTimes[i - 1])
  }
  const avgGap = gaps.reduce((a, b) => a + b) / gaps.length
  const minGap = Math.min(...gaps)
  // Burst = some gaps much smaller than average (packets arrived together)
  return minGap < avgGap * 0.3
}
```

When a burst is detected, don't increase the delay — the burst itself provides enough buffer depth. Only increase delay on sustained high jitter.

**Acceptance**:
- Buffer starvation triggers immediate delay increase
- Packet bursts don't cause delay overshoot
- Delay stabilizes within 2-3 seconds of network condition change
- Interpolation delay observable in Sprint 12 telemetry overlay

### Ticket 2.3 — Minimum buffer depth target

**File**: `packages/client/src/net/SnapshotBuffer.ts`

Instead of only tuning delay based on jitter, also target a minimum buffer depth:

```typescript
const TARGET_BUFFER_DEPTH = 2  // Always want at least 2 snapshots ahead

// In push(), after adding snapshot:
if (this.getUsableDepth() >= TARGET_BUFFER_DEPTH + 1) {
  // Buffer is healthy — allow delay decrease
  this.delayPressure = -1
} else if (this.getUsableDepth() < TARGET_BUFFER_DEPTH) {
  // Buffer is thin — resist delay decrease
  this.delayPressure = +1
}
```

This prevents the delay from decreasing below the point where the buffer is always on the edge of starvation.

**Acceptance**:
- Buffer depth stays at >= 2 usable snapshots during normal play
- Starvation count drops to near-zero at steady-state
- No increase in perceived input latency (delay only grows when necessary)

---

## Epic 3: Remote Entity Extrapolation

When the snapshot buffer runs dry, extrapolate remote entity positions using their last known velocity instead of freezing.

### Ticket 3.1 — Velocity-based extrapolation for remote players

**File**: `packages/client/src/scenes/core/RemoteInterpolationApplier.ts`

When `SnapshotBuffer.getInterpolationState()` returns alpha > 1.0 (extrapolating), use the entity's velocity from the last two snapshots to predict forward:

```typescript
if (alpha > 1.0) {
  const extrapolateTime = (alpha - 1.0) * snapshotInterval
  const cappedTime = Math.min(extrapolateTime, MAX_EXTRAPOLATION_MS)

  // Velocity from last two known positions
  const velX = (toPlayer.x - fromPlayer.x) / snapshotInterval
  const velY = (toPlayer.y - fromPlayer.y) / snapshotInterval

  Position.x[clientEid] = toPlayer.x + velX * cappedTime
  Position.y[clientEid] = toPlayer.y + velY * cappedTime
}
```

### Ticket 3.2 — Extrapolation caps and fade

**File**: `packages/client/src/scenes/core/RemoteInterpolationApplier.ts`

Extrapolation should be bounded to prevent entities flying off-screen:

```typescript
const MAX_EXTRAPOLATION_MS = 150  // Don't predict more than 150ms ahead
const EXTRAPOLATION_DECAY = 0.85  // Slow down extrapolation over time
```

Apply exponential velocity decay during extrapolation so entities naturally decelerate rather than maintaining full speed into potentially wrong positions:

```typescript
const decayFactor = Math.pow(EXTRAPOLATION_DECAY, cappedTime / 16.67)
Position.x[clientEid] = toPlayer.x + velX * cappedTime * decayFactor
Position.y[clientEid] = toPlayer.y + velY * cappedTime * decayFactor
```

### Ticket 3.3 — Extrapolation for enemies

**File**: `packages/client/src/scenes/core/RemoteInterpolationApplier.ts`

Apply the same velocity-based extrapolation to enemies. Use the same caps and decay. Enemies with AI state `IDLE` or `DEAD` should not extrapolate (velocity = 0).

**Acceptance**:
- Remote entities glide forward during brief snapshot gaps instead of freezing
- Extrapolation never exceeds 150ms of predicted movement
- Entities decelerate during extrapolation (don't overshoot)
- When new snapshot arrives, entity smoothly blends back to authoritative position
- No extrapolation for dead or idle entities

---

## Epic 4: Remote Player Aim Smoothing

### Ticket 4.1 — Interpolate aim angle for remote players

**File**: `packages/client/src/scenes/core/RemoteInterpolationApplier.ts`

Currently aim angle for remote players snaps to the latest snapshot value. Interpolate it for smoother weapon rotation:

```typescript
// Angle interpolation with shortest-path wrapping
function lerpAngle(from: number, to: number, t: number): number {
  let diff = to - from
  // Wrap to [-PI, PI]
  while (diff > Math.PI) diff -= 2 * Math.PI
  while (diff < -Math.PI) diff += 2 * Math.PI
  return from + diff * t
}

// In player interpolation:
const aimAngle = lerpAngle(fromPlayer.aimAngle, toPlayer.aimAngle, alpha)
AimDirection.angle[clientEid] = aimAngle
```

**Acceptance**:
- Remote player weapon rotation is smooth between snapshots
- Angle wrapping works correctly (no 360° spin when crossing PI/-PI boundary)
- Aim direction updates are visually continuous

---

## Epic 5: Error Offset Safety & Camera Alignment

### Ticket 5.1 — Cap accumulated error offset

**File**: `packages/client/src/scenes/core/MultiplayerModeController.ts`

**Problem**: In theory, if reconciliation errors accumulate faster than they decay (sustained high correction rate), `errorX/errorY` can grow unbounded, causing the player sprite to appear far from its logical position.

**Fix**: Clamp the error offset:

```typescript
const MAX_ERROR_OFFSET = 48  // pixels — half the snap threshold

// After error accumulation:
const errorMag = Math.sqrt(this.errorX ** 2 + this.errorY ** 2)
if (errorMag > MAX_ERROR_OFFSET) {
  const scale = MAX_ERROR_OFFSET / errorMag
  this.errorX *= scale
  this.errorY *= scale
}
```

### Ticket 5.2 — Align camera target with visual position during correction

**File**: `packages/client/src/scenes/core/MultiplayerModeController.ts`

**Problem**: The camera follows `Position.x[eid] + errorX` (the visual position), but input aiming uses `Position.x[eid]` (the logical position). During large corrections, the cursor and crosshair can feel slightly misaligned because the camera is offset from where the simulation thinks the player is.

**Fix**: Feed the error-corrected position to `Input.setCamera()` so that screen→world mouse conversion accounts for the visual offset:

```typescript
// In render(), after computing visual position:
const visualX = Position.x[this.myClientEid] + this.errorX
const visualY = Position.y[this.myClientEid] + this.errorY
this.camera.update(visualX, visualY, worldMouse.x, worldMouse.y, realDt)
```

Verify that `Input.setCamera()` is called after the camera update so the next frame's mouse conversion uses the corrected camera state.

**Acceptance**:
- Error offset never exceeds 48px magnitude
- Camera and crosshair alignment is consistent during corrections
- No perceptible aim offset during small (<8px) corrections

---

## Epic 6: Reconciliation Replay Improvements

Improve the quality of input replay during reconciliation to reduce prediction errors.

### Ticket 6.1 — Preserve velocity state during reconciliation rewind

**File**: `packages/client/src/scenes/core/MultiplayerReconciler.ts`

**Problem**: When reconciliation resets the player to server position, it also needs to reset velocity. Currently `Velocity.x/y` may retain client-predicted values that diverge from what the server computed, causing the replay to drift.

**Fix**: Reset velocity components from the snapshot before replaying inputs:

```typescript
// In reconcile(), after setting Position:
Velocity.x[clientEid] = 0
Velocity.y[clientEid] = 0
// The first replayed input will set velocity from input direction + speed
// This matches what the server does when processing the same input
```

If the snapshot includes velocity (check snapshot format — currently it doesn't for players), use it. Otherwise, zero is correct because `playerInputSystem` recomputes velocity from input direction each tick.

### Ticket 6.2 — Include roll state in replay initialization

**File**: `packages/client/src/scenes/core/MultiplayerReconciler.ts`

The reconciler already sets `PlayerState.state` from the snapshot. Verify that the roll component state (elapsed, duration, direction) is also synced before replay, since the snapshot includes these fields:

```typescript
// Already in snapshot v10 per player:
// rollElapsedMs, rollDurationMs, rollDirX, rollDirY

if (serverPlayer.state === PlayerStateEnum.ROLLING) {
  if (!hasComponent(world, Roll, clientEid)) {
    addComponent(world, Roll, clientEid)
  }
  Roll.elapsed[clientEid] = serverPlayer.rollElapsedMs / 1000
  Roll.duration[clientEid] = serverPlayer.rollDurationMs / 1000
  Roll.directionX[clientEid] = serverPlayer.rollDirX
  Roll.directionY[clientEid] = serverPlayer.rollDirY
} else {
  if (hasComponent(world, Roll, clientEid)) {
    removeComponent(world, Roll, clientEid)
  }
}
```

Verify this is already implemented in the current `MultiplayerReconciler` — if so, mark as already done. If partially implemented, fill gaps.

### Ticket 6.3 — Skip reconciliation when no pending inputs

**File**: `packages/client/src/scenes/core/MultiplayerModeController.ts`

**Optimization**: If `inputBuffer.getPending().length === 0` after acknowledging processed inputs, the replay step is a no-op. Skip it to avoid unnecessary system ticks and reduce the chance of float drift:

```typescript
const pending = this.inputBuffer.getPending()
if (pending.length === 0) {
  // No unacked inputs — server position is authoritative and current
  // Just snap logical position (error smoothing handles visual)
  return
}
// Otherwise proceed with replay...
```

**Acceptance**:
- Velocity state is consistent before replay begins
- Roll state matches server snapshot before replay
- Zero-pending reconciliation is a fast path (no system ticks)
- p95 correction magnitude decreases vs Sprint 12 baseline

---

## Verification

1. `bun run typecheck` — no type errors
2. `bun run build` — builds cleanly
3. Baseline comparison (using Sprint 12 telemetry):
   - Play 5 minutes at localhost → record p50/p95 correction, rubber-band rate
   - Play 5 minutes at 60ms artificial RTT → record same metrics
   - Compare against Sprint 12 baseline
4. Manual test (multiplayer, 60ms RTT via DevTools):
   - Movement feels smooth, no visible jitter during straight-line movement
   - Direction changes produce brief, small corrections that are barely visible
   - Rolling does not cause snaps or teleports
   - Remote players move smoothly, no freezing during brief packet gaps
   - Remote player aim rotation is smooth (no snapping)
5. Edge cases:
   - 200ms RTT: movement still works, corrections are larger but smoothed
   - Packet loss (Network throttle "slow 3G"): entities extrapolate briefly then recover
   - Tab away for 2 seconds, return: player snaps to correct position, no oscillation

---

## Epic Dependencies

```
Epic 1 (Adaptive Correction)  ────────────► can start immediately
Epic 2 (Interpolation Delay)  ────────────► can start immediately
Epic 3 (Extrapolation)  ──────────────────► can start immediately
Epic 4 (Aim Smoothing)  ──────────────────► can start immediately
Epic 5 (Error Safety)  ───────────────────► after Epic 1
Epic 6 (Replay Improvements)  ────────────► can start immediately
```

All epics are largely independent. Epic 5 refines behavior introduced in Epic 1.

---

## Estimated Scope

| Epic | Files Touched | New Files | Tests |
|------|--------------|-----------|-------|
| 1 | 1-2 | 0 | 2-3 new |
| 2 | 1 | 0 | 2-3 new |
| 3 | 1 | 0 | 1-2 new |
| 4 | 1 | 0 | 1 new |
| 5 | 1 | 0 | 0 (manual) |
| 6 | 1-2 | 0 | 1-2 updated |

**Total**: ~6-8 files touched, 0 new files, 7-11 new/updated tests
