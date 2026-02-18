# Sprint 14: Session Robustness + Backend Stability

**Goal**: Prevent room/session failures and keep gameplay alive through disruptions. Players who drop should reconnect seamlessly, rooms should never leave ghost state, and the server should survive extended soak runs.

**Dates**: Apr 6 – Apr 17

**Depends on**: Sprint 12 (observability for diagnosing issues), Sprint 13 (smoothing for reconnect state blending)

**Exit criteria**: No unexpected room disposal during normal play, stable reconnect flow with visual feedback, passing multi-hour soak tests with multiple concurrent rooms.

---

## Current State

**What exists:**
- `GameRoom.onLeave()` calls `this.allowReconnection(client, 30)` for non-consented disconnects — 30-second grace period
- On successful reconnect: server updates slot with new client reference, resets input queue/tokens/rate limiter/tickMapper, resends `game-config` and current bullets
- Player EID is preserved in the ECS world during reconnection window
- `NetworkClient` stores reconnect token in `sessionStorage` and attempts `client.reconnect(token)` before `joinOrCreate()`
- Auto-reconnect with exponential backoff: 5 attempts, 500ms base, 8s max
- Protocol mismatch handling: triggers `incompatible-protocol` event, disables reconnect
- `GameRoom.onDispose()` clears slots, rewind history, bullet maps, shot result cache
- Input queue management: max 30 inputs, token bucket rate limiting (120/sec, 60-token burst), backlog trimming to 3 with transient action preservation
- `isDisconnected()` flag on NetworkClient

**What doesn't exist:**
- Client-side reconnecting UI (no visual feedback during reconnect attempts)
- Full state resync after reconnect (enemy positions, zone states, HUD data may be stale until next snapshot)
- Room lifecycle guards (no protection against simultaneous leave/join races, no dead room cleanup)
- Soak/load testing infrastructure
- Rate-limit feedback to client (inputs silently dropped)
- Graceful server shutdown notification
- Room auto-disposal when all players leave during reconnect window
- Stale entity cleanup (if reconnect times out, ECS entities cleaned up but Colyseus schema state may lag)
- Multi-room resource monitoring
- Client-side session persistence across hard refresh (token in sessionStorage but no world state)

---

## Design Constraints

1. **No gameplay changes** — All session robustness work is infrastructure. The shared simulation is untouched.
2. **Backward compatible** — New messages/state must not break existing clients. Old clients that don't handle reconnect gracefully should still work (just without the polish).
3. **Colyseus patterns** — Follow Colyseus room lifecycle conventions. Don't fight the framework.
4. **Observable** — All reconnection events, room lifecycle transitions, and failure modes should be logged (building on Sprint 12 server diagnostics).
5. **Fail-safe defaults** — When in doubt, prefer cleaning up state over leaving zombies. A player re-joining fresh is better than a stuck ghost entity.

---

## Epic Overview

| # | Epic | Package(s) | Priority | Estimate |
|---|------|-----------|----------|----------|
| 1 | Client reconnection UX | client | P0 | Medium |
| 2 | Reconnection state resync | client, server | P0 | Medium |
| 3 | Room lifecycle hardening | server | P0 | Medium |
| 4 | Stale state cleanup | server | P0 | Small |
| 5 | Graceful server shutdown | server | P1 | Small |
| 6 | Soak & load test harness | tools, server | P1 | Large |
| 7 | Client-side resilience | client | P2 | Small |

---

## Epic 1: Client Reconnection UX

Give the player clear visual feedback during reconnection attempts.

### Ticket 1.1 — Create ReconnectOverlay component

**File**: `packages/client/src/ui/ReconnectOverlay.tsx` (new)

A full-screen overlay shown during reconnection attempts:

```typescript
interface ReconnectOverlayProps {
  attempt: number           // Current attempt (1-5)
  maxAttempts: number       // Total attempts (5)
  status: 'reconnecting' | 'failed'
  onRetry?: () => void      // Manual retry after failure
  onQuit: () => void        // Return to menu
}
```

**Layout:**
- Semi-transparent dark backdrop: `rgba(0, 0, 0, 0.6)`
- Z-index: 80 (above all game overlays including pause menu)
- Centered content:
  - "CONNECTION LOST" title
  - "Reconnecting... (attempt 2/5)" with animated dots
  - Progress indicator (could be simple text or a minimal bar)
  - After all attempts fail: "Could not reconnect" with RETRY and QUIT TO MENU buttons
- Game renders underneath (frozen at last state) so the player sees where they were

### Ticket 1.2 — Expose reconnection state from NetworkClient

**File**: `packages/client/src/net/NetworkClient.ts`

Add observable reconnection state:

```typescript
export interface ReconnectState {
  isReconnecting: boolean
  attempt: number
  maxAttempts: number
  status: 'idle' | 'reconnecting' | 'failed' | 'succeeded'
}

// New event:
onReconnectStateChange?: (state: ReconnectState) => void
```

Emit state changes from the existing auto-reconnect logic:
- Before each attempt: `{ isReconnecting: true, attempt: n, status: 'reconnecting' }`
- On success: `{ isReconnecting: false, attempt: n, status: 'succeeded' }`
- On final failure: `{ isReconnecting: false, attempt: maxAttempts, status: 'failed' }`

### Ticket 1.3 — Wire ReconnectOverlay into multiplayer page

**File**: `packages/client/src/pages/MultiplayerGame.tsx`

```typescript
const [reconnectState, setReconnectState] = useState<ReconnectState | null>(null)

// In connect setup:
net.onReconnectStateChange = setReconnectState

// In render:
{reconnectState?.status === 'reconnecting' && (
  <ReconnectOverlay
    attempt={reconnectState.attempt}
    maxAttempts={reconnectState.maxAttempts}
    status="reconnecting"
    onQuit={handleQuitToMenu}
  />
)}
{reconnectState?.status === 'failed' && (
  <ReconnectOverlay
    attempt={reconnectState.attempt}
    maxAttempts={reconnectState.maxAttempts}
    status="failed"
    onRetry={handleManualRetry}
    onQuit={handleQuitToMenu}
  />
)}
```

### Ticket 1.4 — Pause local prediction during reconnection

**File**: `packages/client/src/scenes/core/MultiplayerModeController.ts`

While disconnected, the client should stop running prediction systems and sending inputs. The last rendered frame stays on screen:

```typescript
// In update():
if (this.net.isDisconnected()) {
  // Don't predict, don't send input, don't process snapshots
  return
}
```

On successful reconnect, resume prediction from the first server snapshot received.

**Acceptance**:
- Player sees "CONNECTION LOST" within 1 second of disconnect
- Attempt counter increments visibly
- After failure, RETRY and QUIT buttons are functional
- Successful reconnect dismisses overlay and resumes gameplay
- No input sent to server during reconnect gap

---

## Epic 2: Reconnection State Resync

Ensure the client has complete, consistent state after reconnecting.

### Ticket 2.1 — Server sends full state burst on reconnect

**File**: `packages/server/src/rooms/GameRoom.ts`

When a client reconnects (in the `allowReconnection` success path), send a full state package:

```typescript
// After reconnect succeeds:
// 1. Re-send game-config (already done)
client.send('game-config', { ... })

// 2. Send immediate full snapshot (don't wait for next broadcast tick)
const snapshot = encodeSnapshot(this.world, Date.now(), this.buildSeqMap())
client.send('snapshot', snapshot)

// 3. Send current HUD state
client.send('hud', this.buildHudMessage(slot.eid))

// 4. Send all active bullets (already done)
this.sendBulletBurst(client)

// 5. Send encounter/wave state
client.send('encounter-state', {
  waveIndex: this.world.encounter?.currentWave ?? 0,
  enemiesAlive: this.getAliveEnemyCount(),
  status: this.world.encounter?.state ?? 'idle'
})
```

### Ticket 2.2 — Client handles reconnect state burst

**File**: `packages/client/src/scenes/core/MultiplayerModeController.ts`

On reconnect, the client needs to reset local state before processing the burst:

```typescript
private onReconnect(): void {
  // 1. Clear prediction state
  this.inputBuffer.clear()
  this.inputSeq = 0
  this.shootSeq = 0
  this.errorX = 0
  this.errorY = 0
  this.errorVelX = 0
  this.errorVelY = 0

  // 2. Clear snapshot buffer (old snapshots are from before disconnect)
  this.snapshotBuffer.clear()

  // 3. Clear predicted entities
  this.predictedEntityTracker.clear()

  // 4. Mark as reconnecting — process next snapshot as full reset
  this.awaitingReconnectSnapshot = true
}
```

When the first snapshot arrives with `awaitingReconnectSnapshot = true`:
- Apply it as a full state reset (not a reconciliation)
- Set local player position directly to server position (no error smoothing)
- Resume normal prediction/reconciliation from the next frame

### Ticket 2.3 — Handle entity ID remapping on reconnect

**File**: `packages/client/src/scenes/core/MultiplayerModeController.ts`

**Problem**: During the reconnect window, enemies may have spawned or died on the server. The client's `enemyEntities` map (server EID → client EID) may be stale. New enemies won't have renderers; dead enemies may have lingering sprites.

**Fix**: On reconnect snapshot, perform a full entity reconciliation:

```typescript
private reconcileAllEntities(snapshot: WorldSnapshot): void {
  const serverEnemyEids = new Set(snapshot.enemies.map(e => e.eid))

  // Remove client entities for enemies no longer in snapshot
  for (const [serverEid, clientEid] of this.enemyEntities) {
    if (!serverEnemyEids.has(serverEid)) {
      this.removeEnemyEntity(clientEid)
      this.enemyEntities.delete(serverEid)
    }
  }

  // Create entities for new enemies in snapshot
  for (const enemy of snapshot.enemies) {
    if (!this.enemyEntities.has(enemy.eid)) {
      this.spawnEnemyEntity(enemy)
    }
  }

  // Same for players (though less likely to change during 30s window)
  // ...
}
```

**Acceptance**:
- After reconnect, all entities match the server's current state
- No ghost sprites from pre-disconnect enemies
- No missing sprites for enemies spawned during disconnect
- HUD shows current values immediately after reconnect
- Prediction resumes smoothly from server-authoritative position

---

## Epic 3: Room Lifecycle Hardening

Prevent race conditions and zombie state in room management.

### Ticket 3.1 — Guard against concurrent join/leave races

**File**: `packages/server/src/rooms/GameRoom.ts`

**Problem**: If a player's reconnect resolves at the same moment a new `onJoin` fires (e.g., rapid disconnect/reconnect), both paths may try to set up the same slot simultaneously.

**Fix**: Add a per-session mutex using a Set of in-progress operations:

```typescript
private pendingReconnects = new Set<string>()

override async onLeave(client: Client, consented: boolean) {
  const sessionId = client.sessionId

  if (!consented && !this.pendingReconnects.has(sessionId)) {
    this.pendingReconnects.add(sessionId)
    try {
      const reconnectedClient = await this.allowReconnection(client, 30)
      this.pendingReconnects.delete(sessionId)
      this.handleReconnect(reconnectedClient, sessionId)
      return
    } catch {
      this.pendingReconnects.delete(sessionId)
      // Fall through to cleanup
    }
  }

  // Cleanup — only if not currently reconnecting
  if (!this.pendingReconnects.has(sessionId)) {
    this.cleanupPlayer(sessionId)
  }
}
```

### Ticket 3.2 — Auto-dispose empty rooms

**File**: `packages/server/src/rooms/GameRoom.ts`

**Problem**: If all players disconnect and none reconnect within the grace period, the room sits idle consuming resources.

**Fix**: After every player cleanup, check if the room is empty:

```typescript
private cleanupPlayer(sessionId: string): void {
  removePlayer(this.world, sessionId)
  this.state.players.delete(sessionId)
  this.slots.delete(sessionId)

  // If no active players AND no pending reconnects, dispose
  if (this.slots.size === 0 && this.pendingReconnects.size === 0) {
    console.log(`[GameRoom] ${this.roomId} — all players gone, disposing`)
    this.disconnect()  // Colyseus will call onDispose
  }
}
```

### Ticket 3.3 — Room tick loop safety

**File**: `packages/server/src/rooms/GameRoom.ts`

Wrap the tick loop in error handling to prevent a single bad tick from killing the room:

```typescript
private tick(): void {
  try {
    // ... existing tick logic
  } catch (err) {
    console.error(`[GameRoom] ${this.roomId} tick error:`, err)
    this.tickErrors++
    if (this.tickErrors > 10) {
      console.error(`[GameRoom] ${this.roomId} — too many tick errors, disposing`)
      this.disconnect()
    }
  }
}
```

Also add a watchdog: if no tick fires for 5 seconds (interval got cleared somehow), log a warning and re-create the interval.

### Ticket 3.4 — Room lifecycle event logging

**File**: `packages/server/src/rooms/GameRoom.ts`

Add structured JSON logging for all lifecycle events:

```typescript
private logLifecycle(event: string, data?: Record<string, unknown>): void {
  console.log(JSON.stringify({
    event: `room:${event}`,
    roomId: this.roomId,
    playerCount: this.slots.size,
    pendingReconnects: this.pendingReconnects.size,
    uptime: Date.now() - this.createdAt,
    ...data
  }))
}
```

Call on: `onCreate`, `onJoin`, `onLeave` (with consented flag), reconnect success/failure, `onDispose`, tick errors, auto-dispose.

**Acceptance**:
- No race conditions when rapid disconnect/reconnect occurs
- Empty rooms auto-dispose after all reconnect windows expire
- Tick errors are caught and logged, not fatal (up to 10 consecutive)
- All lifecycle events produce structured JSON logs

---

## Epic 4: Stale State Cleanup

Ensure no ghost entities or leaked resources survive player disconnection.

### Ticket 4.1 — Sweep orphaned ECS entities on reconnect timeout

**File**: `packages/server/src/rooms/GameRoom.ts`

When `allowReconnection` times out and cleanup runs, verify that all entities owned by the player are removed:

```typescript
private cleanupPlayer(sessionId: string): void {
  const slot = this.slots.get(sessionId)
  if (!slot) return

  const eid = slot.eid

  // Remove player entity
  removePlayer(this.world, sessionId)

  // Sweep bullets owned by this player
  const bullets = bulletQuery(this.world)
  for (const bulletEid of bullets) {
    if (BulletOwner.owner[bulletEid] === eid) {
      removeEntity(this.world, bulletEid)
    }
  }

  // Clean up from rewind history
  this.rewindHistory.removePlayer(eid)

  // Clean up schema state
  this.state.players.delete(sessionId)
  this.slots.delete(sessionId)
}
```

### Ticket 4.2 — Periodic stale entity audit

**File**: `packages/server/src/rooms/GameRoom.ts`

Run a lightweight audit every 60 seconds to detect orphaned state:

```typescript
private auditEntities(): void {
  const activePlayers = new Set([...this.slots.values()].map(s => s.eid))

  // Check for player entities with no slot
  const allPlayers = playerQuery(this.world)
  for (const eid of allPlayers) {
    if (!activePlayers.has(eid)) {
      console.warn(`[GameRoom] ${this.roomId} — orphaned player entity ${eid}, removing`)
      removeEntity(this.world, eid)
    }
  }

  // Check for schema players with no slot
  for (const [sessionId] of this.state.players) {
    if (!this.slots.has(sessionId)) {
      console.warn(`[GameRoom] ${this.roomId} — orphaned schema player ${sessionId}, removing`)
      this.state.players.delete(sessionId)
    }
  }
}
```

Schedule via `this.clock.setInterval(() => this.auditEntities(), 60_000)`.

**Acceptance**:
- Player disconnection fully cleans up all owned entities
- Periodic audit catches any state that slipped through
- Audit logs warnings (indicates a bug elsewhere that should be investigated)
- No memory growth over extended play sessions

---

## Epic 5: Graceful Server Shutdown

Notify clients before the server goes down for maintenance or deploy.

### Ticket 5.1 — Shutdown notification message

**Files**:
- `packages/server/src/rooms/GameRoom.ts`
- `packages/shared/src/net/messages.ts`

Define a `server-shutdown` message type:

```typescript
export interface ServerShutdownMessage {
  reason: 'maintenance' | 'update' | 'error'
  countdownMs: number  // Time until disconnect
}
```

Add a method to broadcast shutdown notification:

```typescript
broadcastShutdown(reason: string, countdownMs: number): void {
  this.broadcast('server-shutdown', { reason, countdownMs })
  // After countdown, disconnect all clients
  this.clock.setTimeout(() => this.disconnect(), countdownMs)
}
```

### Ticket 5.2 — SIGTERM handler for graceful shutdown

**File**: `packages/server/src/index.ts` (or server entry point)

Handle `SIGTERM` (sent by container orchestrators, deploy scripts):

```typescript
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received, initiating graceful shutdown')

  // Notify all active rooms
  for (const [, room] of gameServer.matchMaker.rooms) {
    room.broadcastShutdown('maintenance', 10_000)  // 10 second warning
  }

  // Stop accepting new connections
  gameServer.gracefullyShutdown()
})
```

### Ticket 5.3 — Client handles shutdown notification

**File**: `packages/client/src/scenes/core/MultiplayerModeController.ts`

On `server-shutdown` message:
1. Show a "Server restarting in X seconds" banner
2. Disable auto-reconnect (reconnecting to a shutting-down server is pointless)
3. After disconnect, show "Server has restarted. Return to menu." with quit button

**Acceptance**:
- `SIGTERM` triggers 10-second countdown notification to all clients
- Clients see countdown banner
- No auto-reconnect attempts after intentional shutdown
- Server process exits cleanly after all rooms dispose

---

## Epic 6: Soak & Load Test Harness

Build infrastructure to simulate extended play sessions and multiple concurrent rooms.

### Ticket 6.1 — Headless bot client

**File**: `packages/tools/src/bot-client.ts` (new)

A minimal client that connects to a game room and simulates player input:

```typescript
export class BotClient {
  private client: Client
  private room: Room
  private inputSeq = 0

  constructor(private serverUrl: string) {}

  async connect(options?: Record<string, unknown>): Promise<void>

  /** Send random movement inputs at 60Hz */
  startPlaying(): void

  /** Send shoot inputs at random intervals */
  startShooting(): void

  /** Disconnect after delay */
  scheduleDisconnect(afterMs: number): void

  /** Track metrics: snapshots received, latency, errors */
  getMetrics(): BotMetrics
}
```

The bot doesn't need to run a simulation or render — it just sends inputs and receives snapshots, tracking whether the connection stays alive.

### Ticket 6.2 — Soak test runner

**File**: `packages/tools/src/soak-test.ts` (new)

A script that creates multiple bots across multiple rooms and monitors stability:

```typescript
// Usage: bun run tools/src/soak-test.ts --rooms=4 --botsPerRoom=2 --duration=3600

interface SoakConfig {
  rooms: number             // Number of concurrent rooms
  botsPerRoom: number       // Bots per room
  durationSeconds: number   // How long to run
  disconnectRate: number    // Probability of random disconnect per minute per bot
  reconnectAfterMs: number  // How long to wait before reconnecting
}
```

Periodically (every 30s) print a status report:

```
[SOAK 00:05:30] rooms=4 bots=8/8 snapshots=12040 errors=0 reconnects=2/2
  Room 1: 2 bots, 3010 snaps, 0 errors
  Room 2: 2 bots, 3015 snaps, 0 errors
  Room 3: 2 bots, 3008 snaps, 0 errors
  Room 4: 2 bots, 3007 snaps, 0 errors
```

### Ticket 6.3 — Exit criteria validation

The soak test should assert the following at completion:

```typescript
// After duration expires:
assert(totalErrors === 0, 'No unexpected errors')
assert(unexpectedDisconnects === 0, 'No unexpected disconnects')
assert(failedReconnects === 0, 'All reconnects succeeded')
assert(roomDisposals === 0, 'No unexpected room disposals')
assert(
  maxMemoryMB < initialMemoryMB * 1.5,
  'No significant memory growth (< 50%)'
)
```

**Acceptance**:
- Bot client can connect, send inputs, receive snapshots
- Soak test runs N rooms × M bots for configurable duration
- Random disconnects are injected and reconnects verified
- Server memory doesn't grow unboundedly over the test
- Status report printed every 30 seconds
- Exit with code 0 on success, 1 on any assertion failure

---

## Epic 7: Client-Side Resilience

Harden the client against edge cases that cause silent failures.

### Ticket 7.1 — Rate-limit warning when inputs are dropped

**Files**:
- `packages/server/src/rooms/GameRoom.ts`
- `packages/client/src/scenes/core/MultiplayerModeController.ts`

When the server rate-limits or trims a client's input queue, send a warning:

```typescript
// Server, when trimming:
client.send('input-warning', {
  type: 'backlog-trim',
  dropped: trimmedCount,
  queueDepth: slot.inputQueue.length
})

// Server, when rate-limited:
client.send('input-warning', {
  type: 'rate-limited',
  tokensAvailable: slot.inputTokens
})
```

Client logs to telemetry and shows a brief "Input lag detected" indicator if warnings are frequent (> 3 in 5 seconds).

### Ticket 7.2 — Snapshot timeout detection

**File**: `packages/client/src/scenes/core/MultiplayerModeController.ts`

If no snapshot arrives for 3 seconds, trigger a soft disconnect state:

```typescript
private lastSnapshotTime = performance.now()

// In update():
if (performance.now() - this.lastSnapshotTime > 3000) {
  if (!this.snapshotTimeout) {
    this.snapshotTimeout = true
    console.warn('[MP] No snapshot for 3s — possible server issue')
    // Show warning indicator in HUD
  }
}

// In snapshot handler:
this.lastSnapshotTime = performance.now()
this.snapshotTimeout = false
```

This gives the player warning before the full disconnect flow triggers.

### Ticket 7.3 — Clock sync recovery after reconnect

**File**: `packages/client/src/net/ClockSync.ts`

After reconnection, the clock sync samples from before the disconnect are stale. Clear them and re-converge:

```typescript
reset(): void {
  this.samples = []
  this.offset = null
  this.converged = false
  // Will re-converge within 15-25 seconds of resumed pinging
}
```

Call `clockSync.reset()` in the reconnect handler.

**Acceptance**:
- Input warnings appear when the server is trimming the client's queue
- Snapshot timeout shows warning before full disconnect
- Clock sync reconverges quickly after reconnect
- No stale time offset used for interpolation after reconnect

---

## Verification

1. `bun run typecheck` — no type errors
2. `bun run build` — builds cleanly
3. Reconnection manual test:
   - Start multiplayer game → kill network (Chrome DevTools offline toggle)
   - Verify "CONNECTION LOST" overlay appears within 1s
   - Re-enable network → verify reconnect succeeds, overlay dismisses
   - Player resumes at correct position, HUD shows current state
   - Kill network → wait 35 seconds → verify clean failure UI with QUIT button
4. Room lifecycle test:
   - Connect 2 players → disconnect both → verify room disposes after 30s
   - Connect player → kill server with SIGTERM → verify client sees shutdown banner
   - Rapid disconnect/reconnect 5 times → verify no duplicate entities or stuck state
5. Soak test:
   - Run `bun run tools/src/soak-test.ts --rooms=4 --botsPerRoom=2 --duration=300`
   - All assertions pass after 5 minutes
   - Server memory stable (no unbounded growth)
6. Entity audit:
   - After soak test, server logs show zero orphaned entity warnings

---

## Epic Dependencies

```
Epic 1 (Reconnect UX)  ──────────────────► can start immediately
Epic 2 (State Resync)  ──────────────────► can start immediately
Epic 3 (Room Lifecycle)  ────────────────► can start immediately
Epic 4 (Stale Cleanup)  ────────────────► after Epic 3
Epic 5 (Graceful Shutdown)  ─────────────► after Epic 3
Epic 6 (Soak Tests)  ───────────────────► after Epics 3-4
Epic 7 (Client Resilience)  ─────────────► after Epics 1-2
```

Epics 1, 2, and 3 can be developed in parallel. Epic 4 refines Epic 3's cleanup. Epic 6 validates everything.

---

## Estimated Scope

| Epic | Files Touched | New Files | Tests |
|------|--------------|-----------|-------|
| 1 | 3 | 1 | 0 (manual) |
| 2 | 2-3 | 0 | 1-2 new |
| 3 | 1-2 | 0 | 2-3 new |
| 4 | 1 | 0 | 1-2 new |
| 5 | 2-3 | 0 | 0 (manual) |
| 6 | 0 | 2 | 1 (integration) |
| 7 | 3 | 0 | 1-2 new |

**Total**: ~12-15 files touched, 3 new files, 6-10 new tests
