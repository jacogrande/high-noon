# Sprint 6: Multiplayer Foundation — Manual Testing Guide

## Prerequisites

- bun installed
- All dependencies installed (`bun install`)
- Two terminal windows for server + client
- A modern browser (Chrome recommended for DevTools)

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

## Test 1: Home Page

**Steps:**
1. Open `http://localhost:5173/`

**Verify:**
- Title "HIGH NOON" displayed
- Version number shown (e.g. "v0.1.0")
- "Play" button links to `/play`
- "Multiplayer" button links to `/play-multi`

## Test 2: Single-Player (Regression)

**Steps:**
1. Click "Play" (or navigate to `/play`)
2. Wait for asset loading progress bar to complete

**Verify:**
- Tilemap renders (brown floor, darker wall borders)
- Player character spawns at arena center
- WASD movement works, player animates
- Mouse aim rotates the weapon
- Left-click fires bullets
- Enemies spawn in waves (swarmers rush, shooters fire from range)
- HUD shows: HP bar, XP bar, wave counter, cylinder ammo, showdown cooldown
- Taking damage flashes the player sprite red
- Camera follows the player with slight aim offset toward mouse
- Getting hit causes brief screen shake

**Debug overlay (single-player only):**
- Press backtick (`` ` ``) to toggle debug overlay
- Overlay shows: FPS, tick, entity count, player state/HP/position/velocity, camera position/trauma
- Collision debug shapes appear over entities
- Press `K` to spawn a test enemy bullet aimed at the player
- Press `P` to toggle enemy pause (kills all enemies, stops spawning)

**Death:**
- Let enemies kill the player
- "GAME OVER" text should appear
- Simulation stops (enemies freeze)
- Death animation plays (sprite fades/spins)

**Back navigation:**
- Click "← Back" in top-left to return to Home

## Test 3: Multiplayer — Single Client

**Steps:**
1. Ensure server is running (`bun run dev:server`)
2. Navigate to `/play-multi`

**Verify loading phases:**
- "Loading..." with progress bar appears first
- Progress bar fills as assets load
- "Connecting..." appears after assets load
- Game canvas appears once connected

**Server console should show:**
```
[GameRoom] <sessionId> joined (eid=<N>, players=1)
[GameRoom] Phase → playing
```

**Verify gameplay:**
- Player spawns in the arena
- WASD movement works (with slight latency — input → server → snapshot round-trip)
- Mouse aim rotates weapon
- Left-click fires bullets
- Enemies spawn and attack
- Camera follows the local player
- HUD shows HP (other HUD fields show 0 — only HP and isDead are live in multiplayer v1)

**Back navigation:**
- Click "← Back" to return to Home
- Server should log: `[GameRoom] <sessionId> left (players=0)`

## Test 4: Multiplayer — Two Clients

This is the core multiplayer test. Use two browser tabs (or two browsers).

**Steps:**
1. Ensure server is running
2. Open Tab A: `http://localhost:5173/play-multi`
3. Wait for Tab A to connect and start playing
4. Open Tab B: `http://localhost:5173/play-multi`

**Server console should show two join messages:**
```
[GameRoom] <sessionA> joined (eid=<N>, players=1)
[GameRoom] Phase → playing
[GameRoom] <sessionB> joined (eid=<M>, players=2)
```

**Verify in Tab A:**
- Your player renders normally (white/default tint)
- A second player appears with a **blue tint** (0x88BBFF) — this is the remote player
- The remote player moves when you control Tab B
- Remote player's weapon rotates based on their aim

**Verify in Tab B:**
- Your player renders normally (white/default tint)
- The first player (from Tab A) appears with a blue tint
- Moving in Tab B is visible in Tab A and vice versa

**Both players shooting:**
- Both players can fire bullets independently
- Bullets from both players hit enemies
- Enemy aggro can switch between players (nearest-player targeting)

**Player death (independent animations):**
- Let one player die — only that player's death animation should play
- The other player should continue playing normally
- Dead player's sprite fades; alive player is unaffected

**Disconnect:**
- Close Tab B
- Tab A should continue running normally
- The blue-tinted remote player should disappear from Tab A
- Server logs: `[GameRoom] <sessionB> left (players=1)`

## Test 5: Multiplayer — Connection Error

**Steps:**
1. Stop the server (Ctrl+C in Terminal 1)
2. Navigate to `/play-multi`

**Verify:**
- "Loading..." phase completes normally (assets are local)
- "Connecting..." appears briefly
- Error screen shows "Connection Failed" with an error message
- "Retry" button is present
- "Back to Menu" link is present

**Retry flow:**
1. Start the server again (`bun run dev:server`)
2. Click "Retry"
3. Should re-attempt connection and succeed

## Test 6: Multiplayer — Mid-Game Disconnect

**Steps:**
1. Start server + connect a client to `/play-multi`
2. Stop the server (Ctrl+C) while the game is running

**Verify:**
- Game freezes (no new snapshots arrive)
- Console logs `[MP] Disconnected from server`
- No crash or error modal (the scene just stops updating)

## Test 7: Snapshot Interpolation

This tests smooth rendering between 20Hz server snapshots.

**Steps:**
1. Connect to `/play-multi` with server running
2. Move the player around the arena

**Verify:**
- Movement appears smooth (not jerky/teleporting at 20Hz)
- Enemies move smoothly
- Bullets travel smoothly
- No visible "snapping" or position jumps during normal play

**How it works:** The SnapshotBuffer stores snapshots with timestamps and interpolates between the two nearest snapshots at render time (100ms interpolation delay, 2x the 50ms snapshot interval).

## Test 8: Input Validation (Server-Side)

This isn't directly testable via the UI, but you can verify via browser DevTools.

**Steps:**
1. Connect to multiplayer
2. Open browser DevTools console
3. The game sends input at 60Hz — the server validates every message

**What the server rejects:**
- Non-object messages
- NaN or Infinity in any field
- Non-number fields (strings, booleans, etc.)

**What the server clamps:**
- `moveX`/`moveY` to [-1, 1]
- `aimAngle` to [-PI, PI]
- `cursorWorldX`/`cursorWorldY` to [-10000, 10000]
- `buttons` truncated to integer

## Test 9: Max Players

The server allows up to `MAX_PLAYERS` (8) connections.

**Steps:**
1. Open 8 browser tabs all connecting to `/play-multi`
2. Verify all 8 connect successfully
3. Open a 9th tab

**Verify:**
- The 9th tab should fail to connect (Colyseus enforces `maxClients`)
- Error screen appears with connection failure

## Known Limitations (Not Bugs)

These are expected in multiplayer v1 (sprint 6):

| Item | Status |
|------|--------|
| HUD shows 0 for XP, wave, cylinder, showdown | Expected — only HP and isDead are synced |
| No client-side prediction (input feels laggy) | Expected — planned for future sprint |
| No death screen / game over in multiplayer | Expected — only isDead flag is synced |
| Debug overlay (backtick) not wired in multiplayer | Expected — only available in single-player GameScene |
| All players share the same arena/encounter | Expected — single GameRoom runs one encounter |
| No lobby / ready-up flow | Expected — auto-starts on first join |
| Camera shake/kick not triggered in multiplayer | Expected — these are driven by local events not present in dumb-client mode |
