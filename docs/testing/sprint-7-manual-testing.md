# Sprint 7: Multiplayer Netcode — Manual Testing Guide

## Prerequisites

- bun installed
- All dependencies installed (`bun install`)
- Two terminal windows for server + client
- A modern browser (Chrome recommended for DevTools)
- Two browser tabs for multi-client tests

## Setup

### Terminal 1 — Server

```bash
bun run dev:server
```

Wait for:
```
[GameRoom] Created with seed <number>
```

Server listens on `ws://localhost:2567`.

### Terminal 2 — Client

```bash
bun run dev
```

Client serves at `http://localhost:5173` (Vite default).

---

## Test 1: Single-Player Regression

Sprint 7 touches shared code (queries.ts). Verify single-player still works.

**Steps:**
1. Navigate to `http://localhost:5173/play`
2. Play for 30+ seconds

**Verify:**
- Player moves with WASD, aims with mouse, fires with left-click
- Enemies spawn in waves
- HUD shows HP, ammo cylinder, showdown cooldown, wave info
- Camera shake on taking damage, camera kick on firing
- Killing enemies awards XP

---

## Test 2: Client-Side Prediction (Epic 4)

**Steps:**
1. Navigate to `/play-multi` with server running
2. Move with WASD

**Verify:**
- Movement feels **immediate** — no perceptible input lag
- Movement is comparable in responsiveness to single-player
- No visible teleporting or snapping during normal movement
- Stopping movement brings the player to a clean halt (no drift)

**How it works:** The client runs prediction systems locally on the player entity, so movement is applied instantly. The server confirms or corrects on each snapshot.

---

## Test 3: Server Reconciliation (Epic 5)

This tests that server corrections are applied smoothly.

**Steps:**
1. Connect to `/play-multi`
2. Move around the arena, especially near walls and arena edges
3. Try rolling (Space) into walls

**Verify:**
- No visible rubber-banding or position jumps during normal play
- If a small correction occurs (server disagrees with prediction), the player smoothly slides to the correct position rather than teleporting
- Rolling near walls doesn't cause the player to visibly snap backward

**Edge case — large misprediction:**
- If the client and server diverge significantly (e.g., due to network spike), the player should **teleport** cleanly to the correct position rather than slowly drifting

---

## Test 4: Snapshot Interpolation (Epic 6)

**Steps:**
1. Open two tabs: Tab A and Tab B at `/play-multi`
2. Move Tab B's player around the arena
3. Watch Tab B's player from Tab A

**Verify:**
- The remote player (blue-tinted) moves **smoothly** — not in 20Hz jerky steps
- Enemies move smoothly
- Bullets travel smoothly
- No visible position discontinuities during normal play

**How it works:** The client uses server-time-based interpolation (via clock sync) between two buffered snapshots, rendering at a ~100ms delay from real-time.

---

## Test 5: Clock Synchronization (Epic 2)

This is infrastructure — not directly visible, but testable via console.

**Steps:**
1. Connect to `/play-multi`
2. Open browser DevTools console
3. Watch for `[ClockSync]` log messages during the first few seconds

**Verify:**
- Clock sync converges within ~5 seconds (probe phase logs appear, then convergence)
- After convergence, interpolation uses server time (Test 4 smoothness depends on this)
- No `NaN` or obviously wrong offset values in logs

---

## Test 6: HUD Data Sync (Epic 8, Ticket 8.1)

This was a major gap in sprint 6 — HUD showed zeros for ammo/showdown.

**Steps:**
1. Connect to `/play-multi`
2. Look at the HUD overlay

**Verify:**
- **HP bar** shows current health (not zero)
- **Cylinder ammo** shows loaded rounds (e.g., 6/6 on spawn)
- **Showdown cooldown** indicator is visible and progresses
- Fire several shots — ammo count decreases
- **Reload**: empty the cylinder, ammo refills after reload time
- **Reload progress**: while reloading, the reload indicator fills up
- Activate showdown (Q key) — showdown timer/duration displays correctly

**Comparison with single-player:**
- HUD data in multiplayer should look similar to single-player
- XP, wave number, and level still show 0 — these require upgrade/encounter state syncing which is out of scope

---

## Test 7: Camera Shake on Damage (Epic 8, Ticket 8.2)

**Steps:**
1. Connect to `/play-multi`
2. Let an enemy hit you

**Verify:**
- The screen **shakes** briefly when you take damage
- Shake intensity is subtle (trauma 0.15) — visible but not disorienting
- Shake decays naturally over ~0.5s
- Multiple rapid hits accumulate shake (screen gets shakier)

**Comparison with single-player:**
- Shake should feel identical to single-player damage shake

---

## Test 8: Camera Kick on Fire (Epic 8, Ticket 8.2)

**Steps:**
1. Connect to `/play-multi`
2. Aim at something and left-click to fire

**Verify:**
- Each shot produces a brief camera **kick** (recoil) in the fire direction
- Kick is one-per-click — holding the mouse button does NOT cause continuous screen shaking
- Kick decays quickly (the camera springs back smoothly)
- Rapid clicking produces rapid kicks

**Known difference from single-player:**
- Single-player triggers kick on actual bullet consumption. Multiplayer triggers on mouse press (rising edge). If the server rejects the shot (e.g., out of ammo), you may see a kick with no bullet — this is a minor visual artifact.

---

## Test 9: Disconnect Overlay (Epic 8, Ticket 8.3)

**Steps:**
1. Connect to `/play-multi` and start playing
2. Stop the server (Ctrl+C in Terminal 1)

**Verify:**
- Within ~100ms, the game transitions to the error screen
- Error screen shows **"Connection Failed"** with message **"Connection lost"**
- **"Retry"** button is present
- **"Back to Menu"** link is present
- The game does not crash

**Retry flow:**
1. Restart the server (`bun run dev:server`)
2. Click "Retry"
3. Should re-load assets, reconnect, and start a new game session

---

## Test 10: Reconnection Window (Epic 7, Ticket 7.2)

The server now allows 30 seconds for a disconnected client to reconnect before cleaning up their slot.

**Steps:**
1. Open two tabs at `/play-multi` — Tab A and Tab B
2. Note Tab B's player in Tab A (blue tint)
3. Close Tab B
4. Watch Tab A for 30 seconds

**Verify:**
- Tab B's player does **not** immediately disappear from Tab A
- Server logs: `[GameRoom] <sessionId> reconnected` if Tab B reconnects within 30s
- After 30 seconds without reconnection, server logs: `[GameRoom] <sessionId> left`
- Tab B's player disappears from Tab A after the timeout

**Note:** The client now attempts auto-reconnect with exponential backoff. This test still validates the server-side 30s reconnection window, but you should also see reconnect attempts from the client before the error screen appears.

---

## Test 11: Connection Error Handling (Epic 7, Ticket 7.3)

**Steps:**
1. Stop the server
2. Navigate to `/play-multi`

**Verify:**
- "Loading..." completes (assets are local)
- "Connecting..." appears briefly
- Error screen shows **"Connection Failed"** with a descriptive message (e.g., "Failed to connect: ...")
- The error message is human-readable, not a raw stack trace
- "Retry" and "Back to Menu" buttons work

---

## Test 12: Two-Client Full Gameplay

The comprehensive integration test.

**Steps:**
1. Start server
2. Open Tab A at `/play-multi`
3. Open Tab B at `/play-multi`
4. Play for 1–2 minutes in both tabs

**Verify:**
- Both players see each other (remote player has blue tint)
- Both players can move independently with immediate response
- Both players can fire bullets that hit enemies
- Enemy aggro switches between players (nearest targeting)
- HUD in both tabs shows correct ammo/HP/showdown data
- Camera shake triggers independently per player when they take damage
- Camera kick triggers independently per player when they fire
- Killing one player's process doesn't crash the other

**Player death:**
- Let one player die
- Dead player sees isDead state in HUD
- Other player continues playing normally
- Remote dead player's death animation plays

---

## Automated Verification

Before manual testing, confirm all automated checks pass:

```bash
bun run typecheck        # TypeScript — should be clean
bun run build            # Shared + client build — should succeed
bun test packages/shared # 348 tests — all pass
```

---

## Known Limitations (Not Bugs)

These are expected in sprint 7:

| Item | Status |
|------|--------|
| XP, wave number, level show 0 in multiplayer HUD | Expected — upgrade/encounter state not synced yet |
| Auto-reconnect may still fail after max attempts | Expected — client retries are best-effort, then shows error overlay |
| Camera kick may occur slightly before server-confirmed bullet on packet loss | Expected — local prediction prioritizes immediate feedback |
| Debug overlay not wired in multiplayer | Expected — only available in single-player GameScene |
| No lobby / ready-up flow | Expected — auto-starts on first join |
| pendingPoints always 0 in multiplayer | Expected — upgrade system not synced |

---

## Changes from Sprint 6 Testing Guide

| Sprint 6 | Sprint 7 |
|----------|----------|
| Input feels laggy (server round-trip) | Input feels immediate (client-side prediction) |
| HUD shows 0 for ammo/showdown | HUD shows real cylinder/showdown data from server |
| No camera shake/kick in multiplayer | Camera shake on damage, kick on fire |
| Mid-game disconnect: game freezes silently | Mid-game disconnect: "Connection lost" overlay with retry |
| Remote players jerk at 20Hz | Remote players interpolated smoothly via server-time clock sync |
| No reconnection support | 30s reconnection window on server |
