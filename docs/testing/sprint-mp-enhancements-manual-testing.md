# Multiplayer Enhancements Sprint — Manual Testing Guide

## Prerequisites

- bun installed
- All dependencies installed (`bun install`)
- Two terminal windows for server + client
- A modern browser (Chrome recommended for DevTools)
- **Three browser tabs** for most multi-client tests (some tests require 3+ players)

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

### Multi-Client Setup

Most tests in this guide require 2-3 simultaneous players. Open multiple tabs at the appropriate URL. Each tab is an independent client with its own session.

- **Private lobby**: Tab A navigates to `/play-multi`. Copy the 6-char room code. Tab B navigates to `/play-multi?code=XXXXXX`.
- **Quick play**: Navigate to `/play-multi?mode=quickplay` in each tab.

---

## Automated Verification

Before manual testing, confirm all automated checks pass:

```bash
bun run typecheck          # TypeScript — should be clean
bun run build              # Shared + client build — should succeed
bun test                   # 1388+ tests pass (3 pre-existing audio failures OK)
```

---

## Test 1: Single-Player Regression

The enhancements touch many shared systems. Verify single-player is unaffected.

**Steps:**
1. Navigate to `http://localhost:5173/play`
2. Play through at least one stage clear and one camp phase

**Verify:**
- Player moves with WASD, aims with mouse, fires with left-click
- Enemies spawn in waves with normal HP (no co-op scaling at 1 player)
- HUD shows HP, ammo, wave info, gold, XP
- Stage clears → camp transition → "Ride Out" advances to next stage
- Death shows the single-player RunEndPanel with kills, gold, level, items
- No regressions in movement, shooting, rolling, abilities

---

## Test 2: Home Page & Navigation

**Steps:**
1. Navigate to `http://localhost:5173/`

**Verify:**
- Title "HIGH NOON" displayed
- Three multiplayer options visible:
  - **Quick Play** button (links to `/play-multi?mode=quickplay`)
  - **Create Lobby** button (links to `/play-multi`)
  - **Join Lobby** input field with 6-character code entry
- "Play" single-player button still works
- Entering a 6-char code and pressing Enter navigates to `/play-multi?code=XXXXXX`

---

## Test 3: Private Lobby Codes (Epic 2)

**Steps:**
1. Open Tab A at `/play-multi`
2. Observe the lobby screen

**Verify:**
- A 6-character room code is displayed (uppercase letters + digits, no 0/O/I/L)
- Code can be copied (click-to-copy or select)
- Tab A sees itself in the player list

**Join with code:**
3. Open Tab B at `/play-multi?code=XXXXXX` (using Tab A's code)

**Verify:**
- Tab B joins the **same room** as Tab A
- Both tabs show both players in the lobby list
- Server logs show both sessions in the same room

**Invalid code:**
4. Open Tab C at `/play-multi?code=ZZZZZZ` (code that doesn't exist)

**Verify:**
- Tab C creates a **new room** with its own code (does not error)

---

## Test 4: Lobby & Ready Flow

**Steps:**
1. Open Tab A and Tab B in the same lobby (via room code)
2. Neither player clicks Ready

**Verify:**
- Both tabs show the lobby with player list and character selectors
- Character selection updates are synced between tabs

**Start match:**
3. Tab A clicks Ready

**Verify:**
- Match starts (lobby phase transitions to playing)
- Only one player needs to ready up to start the match
- Both clients transition to gameplay

---

## Test 5: Quick Play Matchmaking (Epic 9)

**Steps:**
1. Open Tab A at `/play-multi?mode=quickplay`
2. Open Tab B at `/play-multi?mode=quickplay`

**Verify:**
- Both tabs are placed in the **same room** (quick play matching)
- Room is locked once match starts (no late joins)
- Server logs: room uses `QUICKPLAY` code internally

**Late join blocked:**
3. After match starts, open Tab C at `/play-multi?mode=quickplay`

**Verify:**
- Tab C creates a **new room** (cannot join the locked room)

---

## Test 6: Co-op Scaling (Epic 1)

**Steps:**
1. Start a 1-player game, note enemy HP on first wave (e.g., Swarmer base HP)
2. Start a 2-player game, note enemy HP on first wave

**Verify:**
- 2-player enemies have ~1.5x the HP of 1-player enemies
- More fodder enemies spawn per wave (budget scaled by ~1.3x)
- XP per kill is reduced (~0.65x) so leveling pace is similar

**Player disconnect scaling:**
3. In a 2-player game mid-wave, close Tab B

**Verify:**
- Enemies spawned after disconnect have 1-player HP (scaling adjusts down)
- Already-spawned enemies keep their scaled HP (no retroactive change)

---

## Test 7: Friendly Fire Policy (Epic 3)

Default mode is `'none'` (no friendly fire).

**Steps:**
1. Start a 2-player game
2. Player A aims at Player B and fires

**Verify (mode: none):**
- Bullets pass through the ally without dealing damage
- No HP change on Player B's HUD
- Dynamite explosions near allies cause no ally damage

**Reduced mode** (requires server config change to `'reduced'`):
- Player A shoots Player B: damage is 25% of normal
- Dynamite near ally: 25% damage

**Full mode** (requires server config change to `'full'`):
- Player A shoots Player B: full damage applied
- Self-damage from own dynamite still works normally regardless of mode

---

## Test 8: Disconnect / Rejoin (Epic 4)

**Steps:**
1. Start a 2-player game, note Player B's position
2. Close Tab B's browser tab
3. Watch Tab A for Player B's character

**Verify:**
- Player B does **not** immediately disappear
- Player B's character enters AI mode (idle, may auto-dodge nearby bullets)
- Server logs: `reconnect-timeout` after 30 seconds if Tab B doesn't return

**Rejoin:**
4. Within 30 seconds, reopen Tab B at the same URL

**Verify:**
- Tab B reconnects to the existing session
- Player B's position, inventory, and upgrade tree are preserved
- Server logs: `<sessionId> reconnected`

**Timeout:**
5. Close Tab B and wait 30+ seconds

**Verify:**
- Player B is removed from the game after timeout
- Tab A continues playing normally as 1 player
- Co-op scaling adjusts to 1 player for new spawns

---

## Test 9: Camp Pacing (Epic 5)

**Steps:**
1. Start a 2-player game and clear Stage 1

**Verify:**
- Both players enter camp phase
- Camp timer visible (starts at 90 seconds, counts down)
- Ready count shows "0 / 2 Ready"

**Ready flow:**
2. Tab A clicks "Ride Out"

**Verify:**
- Ready count updates to "1 / 2 Ready"
- Game does **not** advance yet (not all players ready)

3. Tab B clicks "Ride Out"

**Verify:**
- Game advances to the next stage immediately
- Timer stops, camp UI disappears

**Auto-advance:**
4. On the next camp, don't click Ready in either tab. Wait 90 seconds.

**Verify:**
- Timer counts down to 0
- Game auto-advances to the next stage

---

## Test 10: Revive System (Epic 6)

Requires 2 players (revive is co-op only; single-player has instant death).

**Steps:**
1. Start a 2-player game
2. Let Player A take damage until HP reaches 0

**Verify:**
- Player A enters **Downed** state (not immediately dead)
- Player A's character has a visual pulse/flash effect
- A 10-second bleed timer begins (not directly visible but death occurs at 0)

**Revive:**
3. Move Player B within close range of Player A (~48 pixels)
4. Hold E (INTERACT) for 3 seconds

**Verify:**
- "Hold [E]: Revive" prompt appears on Player B's HUD
- Revive progress fills over 3 seconds of continuous holding
- On completion: Player A stands up with 30% HP
- Player A has brief invulnerability (~2 seconds, bullets pass through)
- Player A's poison is cleared if they were poisoned

**Interrupted revive:**
5. Start reviving, then release E at ~1.5 seconds

**Verify:**
- Progress decays slowly (doesn't reset instantly)
- Re-holding E continues from the decayed progress

**Bleed-out:**
6. Let Player A go down again, and do NOT revive within 10 seconds

**Verify:**
- Player A transitions from Downed to permanently Dead
- Cannot be revived after bleed-out

**Total party kill:**
7. Let both players go down simultaneously (or Player A dies, then Player B goes down)

**Verify:**
- When no alive players remain, all Downed players immediately transition to Dead
- Game enters defeat state

---

## Test 11: Ping System (Epic 7)

**Steps:**
1. Start a 2-player game
2. Player A presses G while cursor is over a location in the world

**Verify:**
- A ping marker appears at the cursor's world position
- The ping is visible on **both** Player A and Player B's screens
- Ping animates (pulsing ring or similar)
- Ping disappears after ~5 seconds

**Danger ping:**
3. Player A presses Ctrl+G (or Cmd+G on Mac)

**Verify:**
- A danger-style ping appears (visually distinct from location ping)
- Visible on both clients

**Rate limit:**
4. Spam G rapidly

**Verify:**
- Pings are throttled to ~1 per second (server rejects rapid pings)

**Max active pings:**
5. Place 3 pings in quick succession (within cooldown windows)
6. Place a 4th ping

**Verify:**
- Oldest ping is removed when the 4th ping is placed (max 3 active per player)

---

## Test 12: Shared Loot / Draft Picks (Epic 8)

**Steps:**
1. Start a 2-player game and clear a stage to enter camp
2. If enemies dropped items, observe the draft pick phase

**Verify:**
- DraftPickPanel UI appears showing available items
- Players take turns picking (kill-count priority determines order)
- Each pick has a 15-second timer
- Picking an item adds it to that player's inventory (visible in camp HUD)

**Auto-pick on timeout:**
3. Let the 15-second timer expire without picking

**Verify:**
- System auto-picks the highest rarity item available
- Draft advances to next picker

**Draft completion:**

**Verify:**
- After all picks are made, draft panel disappears
- All picked items appear in respective players' inventories

---

## Test 13: AFK Detection (Epic 10)

**Steps:**
1. Start a 2-player game (during active combat, not camp)
2. In Tab A, stop all input (don't move, shoot, or aim)
3. Wait 60 seconds

**Verify:**
- After ~60 seconds of inactivity, an amber **AFK WARNING** banner appears at the top of Tab A's screen
- Banner text: "AFK WARNING — Move or shoot within Xs or be kicked!"
- Banner auto-dismisses after ~5 seconds

**AFK kick:**
4. Continue doing nothing for another 30 seconds (90 total)

**Verify:**
- Tab A is disconnected and shown the error screen with "Kicked for being AFK"
- Tab B continues playing normally

**Reset on input:**
5. Repeat, but press a movement key at the 55-second mark

**Verify:**
- AFK timer resets — no warning appears at 60 seconds
- Full 60 seconds of inactivity needed again before warning

**Skipped during camp/completed:**

**Verify:**
- AFK timer does NOT run during camp phase, looting phase, or after run completion

---

## Test 14: Vote-Kick System (Epic 10)

Requires **3+ players** (vote-kick is disabled with fewer than 3).

**Steps:**
1. Start a 3-player game (open 3 tabs in the same lobby)

**2-player guard:**
2. With only 2 players connected, attempt to initiate a vote-kick

**Verify:**
- Vote-kick is blocked (requires minimum 3 players)

**Initiate vote:**
3. With 3 players, one player initiates a vote-kick against another

**Verify:**
- All non-target players see the VotekickPanel UI
- Panel shows target name, initiator name, KICK/KEEP buttons
- 30-second countdown timer displayed

**Vote passes:**
4. Both voters click KICK

**Verify:**
- Target player is disconnected with "You have been vote-kicked" message
- All remaining players see the vote result
- Kicked player cannot rejoin the same room

**Vote fails:**
5. Start another vote. One voter clicks KICK, one clicks KEEP

**Verify:**
- Target remains in the game (no majority = vote fails)
- Vote result broadcast shows "failed"

**Cooldown:**
6. After initiating a vote, try to initiate another immediately

**Verify:**
- Initiator cannot start another vote for 5 minutes (cooldown enforced)

**Target disconnect:**
7. Start a vote against a player, then that player disconnects before the vote resolves

**Verify:**
- Vote is automatically cancelled

---

## Test 15: Post-Run Stats — Victory (Epic 11)

**Steps:**
1. Start a 2-player game
2. Play through all stages until the final boss is defeated (or use debug tools)

**Verify:**
- **MultiplayerRunEndPanel** appears immediately on victory
- Header: **"VICTORY"** in gold text with glow effect
- Subtitle: "All X Stages Cleared" with run duration (M:SS format)
- Per-player stat table with 10 columns:
  - PLAYER (character name, colored by class)
  - KILLS, DMG, ACC, TAKEN, GOLD, DOWNS, REVIVES, DODGES, STREAK
- Local player row highlighted with subtle gold background
- Local player has "(you)" tag next to name
- Players sorted by kills (most first), then damage as tiebreaker
- "BACK TO MENU" button navigates to home page

**Stat accuracy:**
- KILLS: matches enemies killed during the run
- ACC: shows percentage or "-" if no shots fired
- DOWNS: shows number of times entering Downed state (0 in solo, tracks in co-op)
- REVIVES: shows revives given (not received)

---

## Test 16: Post-Run Stats — Defeat (Epic 11)

**Steps:**
1. Start a 2-player game
2. Let both players die (all Dead)

**Verify:**
- After a ~1.75 second delay (death animation plays first), the stat panel appears
- Header: **"SLAIN"** in red text with glow effect
- Subtitle: "Fell on Stage X of Y" with run duration
- Same stat table as victory, all stats populated
- "BACK TO MENU" button works

**Edge case — one player disconnected:**
3. In a 2-player game, disconnect one player. Let the remaining player die.

**Verify:**
- Run-complete is broadcast (disconnected player treated as dead for TPK check)
- Stats include both players (disconnected player has their last-known stats)

---

## Test 17: Stats Tracking Correctness (Epic 11)

Focused verification that individual stats accumulate correctly.

**Steps:**
1. Start a 2-player game
2. Player A: fire 10 shots, hit ~5 enemies, kill 3 enemies
3. Player B: don't shoot (only dodge)
4. End the run (die or complete)

**Verify on stat screen:**
- Player A: `shotsFired >= 10`, `shotsHit ~= 5`, `enemiesKilled = 3`, `ACC ~= 50%`
- Player B: `shotsFired = 0`, `ACC = -` (dash, not 0%)
- Player B: `rollDodges > 0` if they rolled through enemy bullets

**Gold tracking:**
- Kill enemies near a player, verify their GOLD stat increases
- Collect gold nuggets, verify GOLD increases

**Streak tracking:**
- Kill 5 enemies in a row without dying → STREAK should be >= 5
- Die and get revived → streak resets, but longest streak preserved

---

## Test 18: Full Integration — 2-Player Complete Run

The comprehensive end-to-end test.

**Steps:**
1. Tab A creates a lobby at `/play-multi`
2. Tab B joins via room code
3. Tab A readies up → match starts
4. Play through Stage 1:
   - Both players shoot enemies
   - One player takes heavy damage
   - If downed, the other revives them
   - Use pings (G key) to communicate
5. Clear Stage 1 → enter camp:
   - Draft pick items if available
   - Spend skill points if available
   - Both click "Ride Out"
6. Play Stage 2
7. Either win or let both players die

**Verify throughout:**
- Co-op scaling: enemies noticeably tougher than single-player
- No desync: both players see each other's actions in real time
- HUD data correct for each player independently
- Camera shake/kick triggers per player
- Revive flow works if someone goes down
- Ping markers visible on both screens
- Camp timer counts down, ready states sync
- Draft picks respect turn order
- End-of-run stats screen shows correct per-player data
- "BACK TO MENU" returns both clients to home page

---

## Test 19: Stress Test — Rapid Actions

**Steps:**
1. Start a 2-player game
2. Both players simultaneously: spam fire, roll, use abilities, ping

**Verify:**
- No crashes or disconnects
- Server tick rate stays stable (check server logs for timing warnings)
- Input rate limiting activates gracefully (dropped inputs logged, not crash)
- Game remains playable despite heavy input load

---

## Known Limitations (Not Bugs)

| Item | Status |
|------|--------|
| Friendly fire mode can only be changed via server config, not lobby UI | Expected — lobby FF toggle is future work |
| Vote-kick UI may not show if vote starts during a panel overlay (camp, skill tree) | Expected — vote panel renders behind full-screen overlays |
| AFK timer doesn't account for aim-only input (mouse movement without buttons) | By design — prevents passive cursor wiggling from suppressing AFK |
| Draft pick auto-pick always chooses highest rarity | By design — simple heuristic, not character-aware |
| Stats panel shows wall-clock duration (includes any server pauses/GC) | Minor — sim-tick-based duration would be more accurate but difference is negligible |
| `timesDown` is always 0 in single-player (no Downed state exists) | By design — single-player has instant death |
| Post-run stats not available in single-player (uses existing RunEndPanel) | Expected — `run-complete` message is multiplayer-only |
| Character colors in stat panel are hardcoded (sheriff=gold, undertaker=purple, prospector=orange) | Expected — will centralize when character roster grows |

---

## Changes from Sprint 7 Testing Guide

| Sprint 7 | Multiplayer Enhancements |
|----------|--------------------------|
| Auto-starts on first join | Lobby with character select, ready-up, room codes |
| No room codes | 6-char private lobby codes + Quick Play matchmaking |
| No friendly fire handling | Configurable FF modes (none/reduced/full) |
| Disconnect = error screen | 30s reconnection with AI takeover of disconnected player |
| No camp pacing | 90s auto-advance timer, ready sync, draft picks |
| Player death = permanent | Co-op revive system with downed state and bleed-out |
| No player communication | Ping system (G = location, Ctrl+G = danger) |
| No anti-grief | AFK detection (60s warn, 90s kick) + vote-kick (3+ players) |
| No post-run stats | Per-player stat table with 10 categories on victory/defeat |
| Same difficulty regardless of player count | Co-op scaling: HP, wave budget, XP/gold scale with player count |
