# Sprint: Multiplayer Enhancements — Co-op Scaling, Lobbies, & Social Systems

**Goal**: Transform multiplayer from a functional netcode layer into a polished co-op experience. Players can find friends via lobby codes, play through properly-scaled encounters, communicate via pings, survive via revives, and compare performance at the end of a run.

**Depends on**: Sprint 7 (netcode), Sprint 14 (session robustness), Sprint 8 (stage progression)

**Source**: `docs/brainstorm/future-sprints.md` §3D — Multiplayer Enhancements

---

## Epic Overview

| # | Epic | Package(s) | Priority | Depends On |
|---|------|-----------|----------|------------|
| 1 | Co-op Scaling | shared, server | P0 | — |
| 2 | Private Lobby Codes | server, client, shared | P0 | — |
| 3 | Friendly Fire Policy | shared, server | P0 | — |
| 4 | Disconnect / Rejoin Improvements | shared, server, client | P0 | — |
| 5 | Camp Pacing | server, client | P1 | — |
| 6 | Revive System | shared, server, client | P1 | Epic 1 |
| 7 | Ping System | shared, server, client | P1 | — |
| 8 | Shared Loot / Draft Picks | shared, server, client | P1 | Epic 5 |
| 9 | Quick Play Matchmaking | server, client | P2 | Epic 2 |
| 10 | Anti-Grief Measures | server, client | P2 | — |
| 11 | Post-Run Stats | shared, server, client | P2 | — |

---

## Epic 1: Co-op Scaling

Enemy HP, wave size, and boss attack patterns scale by active player count. This is Tier 0 — multiplayer is a selling point and currently balanced exclusively for single-player.

### Technical Constraints

**Snapshot HP encoding**: `clampHP()` in `snapshot.ts:110-112` caps HP to `Uint8` (max 255). Player base HP is well under 255, but enemies — especially bosses — may exceed it at 4-8 player scaling. Two options:

- **Option A**: Keep Uint8, scale enemy *damage resistance* instead of raw HP (avoids format change, conceptually messier)
- **Option B**: Widen enemy HP to Uint16 in snapshot, bump `SNAPSHOT_VERSION` to 11 (clean, +1 byte per enemy)

**Recommendation**: Option B. The snapshot already has `incompatible-protocol` detection; a version bump is safe and future-proof.

### Ticket 1.1: Player count scaling config

**Files**:
- `shared/src/sim/content/coopScaling.ts` (new)

Define a scaling table read by all systems that need player-count awareness:

```ts
export interface CoopScalars {
  enemyHpMultiplier: number    // applied to Health.max on spawn
  waveBudgetMultiplier: number // applied to EncounterWave.fodderBudget
  bossHpMultiplier: number     // applied to boss Health.max on spawn
  xpMultiplier: number         // per-kill XP scaled so leveling isn't faster in co-op
  goldMultiplier: number       // same for gold
}

export function getCoopScalars(playerCount: number): CoopScalars
```

Scaling curve (from brainstorm): 2p = +50% HP, 4p = +150% HP, 8p = +300% HP. Interpolate linearly between breakpoints. Budget scales at ~60% of HP rate (more enemies but not overwhelming). XP/gold scales inversely so per-player economy is roughly constant.

**Acceptance**:
- `getCoopScalars(1)` returns all 1.0 multipliers (single-player unchanged)
- Exported from shared; pure function, no world dependency
- Unit tests for each breakpoint

---

### Ticket 1.2: Wire scaling into enemy spawn

**Files**:
- `shared/src/sim/systems/waveSpawner.ts`
- `shared/src/sim/content/enemies.ts` (or wherever `spawnEnemy` sets initial HP)
- `shared/src/sim/world.ts` (add `activePlayerCount` field to `GameWorld`)

On spawn, multiply enemy `Health.max` and `Health.current` by `coopScalars.enemyHpMultiplier`. Multiply wave `fodderBudget` by `coopScalars.waveBudgetMultiplier`.

`world.activePlayerCount` is set by the server (GameRoom) each tick based on connected, non-dead player count. In single-player mode, defaults to 1.

**Acceptance**:
- With 4 players, a Swarmer with base 10 HP spawns with 25 HP
- Wave budget is scaled so more fodder appear
- Single-player runs are byte-identical (multiplier 1.0, no behavioral change)

---

### Ticket 1.3: Widen enemy HP in snapshot protocol

**Files**:
- `shared/src/net/snapshot.ts`

Bump `SNAPSHOT_VERSION` to 11. Change per-enemy HP encoding from `Uint8` (1 byte, max 255) to `Uint16` (2 bytes, max 65535). Update `ENEMY_SIZE` from 15 to 16 bytes. Update `encodeSnapshot` and `decodeSnapshot`.

**Acceptance**:
- Enemies with HP > 255 encode/decode correctly
- `incompatible-protocol` fires if client is on version 10 and server on 11
- All existing snapshot tests updated and passing
- `bun test packages/shared` passes

---

### Ticket 1.4: Boss pattern scaling

**Files**:
- `shared/src/sim/systems/bosses/*.ts` (per-boss AI files)

Bosses gain additional attack patterns or target selection when `world.activePlayerCount >= 3`:

- **Multi-target attacks**: Boss AoE sweep that covers wider arc, or split projectiles aimed at multiple players
- **Add frequency**: Bosses that summon adds do so more frequently (scale `spawnCooldown` inversely with player count)
- **Phase thresholds**: Adjust HP phase thresholds proportionally so phases aren't trivialized by burst DPS from 8 players

This ticket is intentionally open-ended per boss. Start with one boss (recommend: the simplest currently implemented boss) as a proof of concept, then replicate the pattern.

**Acceptance**:
- At least one boss has measurably different behavior at 4+ players
- Boss HP scales via the same `bossHpMultiplier` from Ticket 1.1
- Single-player boss behavior is unchanged

---

### Ticket 1.5: Server sets activePlayerCount each tick

**Files**:
- `server/src/rooms/GameRoom.ts`

At the top of each tick, compute `world.activePlayerCount` as the number of connected players whose entity is alive (not `hasComponent(world, Dead, eid)`). Update before systems run so scaling reads are fresh.

In single-player (`SinglePlayerModeController`), `activePlayerCount` stays at 1.

**Acceptance**:
- Player disconnect reduces count → enemies immediately spawn weaker
- Player reconnect restores count
- Value is available before `waveSpawnerSystem` runs in the tick

---

### Epic 1 Implementation Notes

**Status**: Complete (Tickets 1.1-1.5)

**Files created**:
- `packages/shared/src/sim/content/coopScaling.ts` — Scaling table with linear interpolation between 4 breakpoints (1p/2p/4p/8p). `getCoopScalars()` is a pure function. `applyCoopHpScale()` helper applies HP scaling post-spawn.
- `packages/shared/src/sim/content/coopScaling.test.ts` — 10 unit tests covering all breakpoints, interpolation, edge cases, monotonicity.

**Files modified**:
- `packages/shared/src/sim/world.ts` — Added `activePlayerCount: number` and `friendlyFireMode: 'none' | 'reduced' | 'full'` to `GameWorld`. Defaults: 1, 'none'.
- `packages/shared/src/sim/systems/waveSpawner.ts` — `spawnEnemy()` applies HP scaling via `applyCoopHpScale()`. Wave budget scaled by `waveBudgetMultiplier` at wave activation.
- `packages/shared/src/sim/systems/objectiveSystem.ts` — All three objective spawn sites (attacker, runner, duelist) now apply co-op HP scaling.
- `packages/shared/src/net/snapshot.ts` — Bumped `SNAPSHOT_VERSION` to 11. Enemy HP encoding widened from Uint8 (max 255) to Uint16 (max 65535). `ENEMY_SIZE` 15 → 16.
- `packages/shared/src/net/snapshot.test.ts` — Updated byte size assertion (540 → 570).
- `packages/shared/src/sim/content/index.ts` — Added `coopScaling` export.
- `packages/server/src/rooms/GameRoom.ts` — Sets `world.activePlayerCount = slots.size` before systems run each tick.

**Design decisions**:
1. **HP scaling post-spawn, not in prefab**: Scaling is applied after entity creation so prefab functions stay pure. The `applyCoopHpScale` helper mutates `Health.max` and `Health.current` in-place.
2. **Connected count, not alive count**: `activePlayerCount` uses `slots.size` (connected players) not alive players. Dead players are still in the run — scaling shouldn't collapse when someone dies mid-wave. Disconnected players are removed from `slots` on timeout, which naturally reduces the count.
3. **Uint16 for enemy HP**: Clean option over damage-resistance hacks. +1 byte per enemy per snapshot is negligible. Version bump uses existing `incompatible-protocol` detection.
4. **Ticket 1.4 (boss pattern scaling)**: HP scaling already works via `spawnEnemy`. Boss behavioral changes (multi-target, add frequency) deferred to per-boss implementation when boss AI is revisited.
5. **XP/gold multipliers**: Defined in `CoopScalars` but not yet wired into xp/gold systems — will be addressed when those systems are touched.
6. **`friendlyFireMode` field**: Added to GameWorld but not yet wired into bulletCollision — that's Epic 3.

**Code review findings addressed**:
- Objective-spawned enemies (runners, attackers, duelists) now receive HP scaling
- `activePlayerCount` uses connected count instead of alive count
- Stale version comments in snapshot.ts updated to v11

---

## Epic 2: Private Lobby Codes

Players need to play with friends without public matchmaking. A 4-6 character room code displayed in the lobby, shareable via Discord/text.

### Current State

No room code system exists. `NetworkClient.ts:132` calls `client.joinOrCreate('game', options)` which uses Colyseus's default room matching. `GameRoom` has no filtering logic.

### Ticket 2.1: Server-side room code generation and filtering

**Files**:
- `server/src/rooms/GameRoom.ts`
- `shared/src/net/lobby.ts`

On `onCreate`, generate a random 6-character alphanumeric code (uppercase, no ambiguous chars like 0/O/I/l). Store as `this.roomCode`. Expose via `filterBy(['roomCode'])` in the room definition so Colyseus can match on it.

Add `roomCode` to the Colyseus schema state (`GameRoomState`) so clients can display it.

**Shared types** (`lobby.ts`):
```ts
export interface JoinOptions {
  name: string
  roomCode?: string  // if provided, join specific room
}
```

**Acceptance**:
- `joinOrCreate('game', { roomCode: 'ABC123' })` joins only the room with that code
- `joinOrCreate('game', {})` without code uses normal matching (joins any open room or creates new)
- Code is 6 chars, uppercase alphanumeric, excludes ambiguous characters
- Code visible in lobby UI

---

### Ticket 2.2: Client lobby code UI

**Files**:
- `client/src/ui/` (lobby screen component)
- `client/src/net/NetworkClient.ts`

Add to the lobby screen:
1. **Display code**: Show the room code prominently with a "Copy" button
2. **Join by code**: Text input field + "Join" button to enter a friend's code
3. **Create private**: "Create Private Game" button that generates a new room and shows the code

Update `NetworkClient` to accept optional `roomCode` in join options and pass it to Colyseus `joinOrCreate`.

**Acceptance**:
- Player A creates a room, sees code "XYZ789"
- Player B enters "XYZ789", lands in the same room
- Invalid/expired code shows a clear error message
- Code is copyable to clipboard

---

### Epic 2 Implementation Notes

**Status**: Complete (Tickets 2.1-2.2)

**Files created**: None (all changes to existing files)

**Files modified**:
- `packages/shared/src/net/lobby.ts` — Added `roomCode: string` to `LobbyState`, exported `ROOM_CODE_CHARS` (31-char charset, no ambiguous chars 0/O/1/I/L) and `ROOM_CODE_LENGTH` (6).
- `packages/server/src/rooms/schema/GameRoomState.ts` — Added `@type('string') roomCode` to Colyseus Schema.
- `packages/server/src/rooms/GameRoom.ts` — Added `roomCode` to `JoinOptions`, server-side room code validation (`isValidRoomCode`, `generateRoomCode`), `onAuth` validates incoming room codes (case-insensitive), `onCreate` reads code from options or generates one, sets `setMetadata({ roomCode })` for `filterBy` matching.
- `packages/server/src/index.ts` — Added `filterBy(['roomCode'])` to room definition. Colyseus uses this to match join requests to rooms with the same code.
- `packages/client/src/net/NetworkClient.ts` — Added `roomCode` to `JoinOptions`, added `createPrivateRoom()` method (generates code client-side, creates room with it), updated `normalizeLobbyState` to extract `roomCode`.
- `packages/client/src/ui/MultiplayerLobby.tsx` — Added room code display section with copy-to-clipboard button, `roomCode` prop.
- `packages/client/src/pages/MultiplayerGame.tsx` — Reads `?code=` URL parameter for join-by-code flow, passes `roomCode` to lobby component.

**Design decisions**:
1. **`filterBy` + client-generated code**: Colyseus `filterBy(['roomCode'])` stores the roomCode from the creating client's options. `joinOrCreate` with a matching code finds the right room. The code is generated client-side (for `filterBy` compatibility) but validated server-side (charset, length, case normalization).
2. **Server always generates a code**: Even public rooms get a server-generated code (displayed in lobby). This means any room can be shared by code. Private vs. public distinction is in the join *path* (direct URL vs. matchmaking), not in the room's code existence.
3. **Case-insensitive matching**: `onAuth` normalizes codes to uppercase for comparison, so users can type `abcdef` and match `ABCDEF`.
4. **URL-based join**: Join-by-code uses query parameter `?code=ABCDEF` on the multiplayer route. A dedicated "Join by Code" UI modal could be added later.
5. **Ambiguous character exclusion**: `ROOM_CODE_CHARS` excludes 0/O, 1/I/L to prevent confusion when reading codes aloud or in small fonts.

**Code review findings addressed**:
- Added `setMetadata({ roomCode })` for `filterBy` to work correctly
- Added charset validation (`isValidRoomCode`) on server
- Case-insensitive comparison in `onAuth`
- Clipboard error handling (graceful failure)
- Removed unnecessary dynamic import in client
- Reordered code generation before `setState` to eliminate race window

---

## Epic 3: Friendly Fire Policy

Design decision required before multiplayer launch. The brainstorm recommends choosing between none (casual), optional (per-room toggle), or reduced (25% damage).

### Ticket 3.1: Implement configurable friendly fire

**Files**:
- `shared/src/sim/systems/bulletCollision.ts`
- `shared/src/sim/world.ts`

Add `world.friendlyFireMode: 'none' | 'reduced' | 'full'` to `GameWorld`. Default: `'none'`.

Modify `canBulletHitTarget()` in `bulletCollision.ts:36-42`:

```ts
// Current: PLAYER_BULLET can only hit ENEMY
// New: if friendlyFireMode !== 'none' and bullet owner !== target, allow hit
```

When mode is `'reduced'`, multiply damage by `FRIENDLY_FIRE_DAMAGE_SCALE` (0.25). When `'full'`, apply full damage. When `'none'`, no change from current behavior.

Self-damage is always prevented (bullet owner === target entity).

**Acceptance**:
- `friendlyFireMode = 'none'`: identical to current behavior (no player-vs-player hits)
- `friendlyFireMode = 'reduced'`: player bullets deal 25% damage to other players
- Bullet owner check prevents self-damage
- Dynamite area damage follows the same policy
- Unit tests for each mode

---

### Ticket 3.2: Room-level friendly fire toggle

**Files**:
- `server/src/rooms/GameRoom.ts`
- `shared/src/net/lobby.ts`
- `client/src/ui/` (lobby settings)

Add `friendlyFire` to room creation options and `GameRoomState` schema. Room creator can toggle before match start. Server sets `world.friendlyFireMode` from the room option on match start.

Displayed in lobby as a toggle (default: off).

**Acceptance**:
- Host can toggle friendly fire in lobby
- All clients see the current setting
- Setting is locked once match begins
- Sent in `game-config` message so clients know the mode

### Epic 3 Implementation Notes

**Status**: Complete (Tickets 3.1-3.2)

**Files modified**:
- `packages/shared/src/sim/damage.ts` — Added `FRIENDLY_FIRE_DAMAGE_SCALE = 0.25` constant, shared by all FF damage paths.
- `packages/shared/src/sim/systems/bulletCollision.ts` — `canBulletHitTarget()` now accepts `FriendlyFireMode` type and gates `PLAYER_BULLET → PLAYER` hits by mode. Projectile bullet hits apply `FRIENDLY_FIRE_DAMAGE_SCALE` in 'reduced' mode via `clampDamage()`.
- `packages/shared/src/sim/systems/weapon.ts` — Hitscan path extended: `playerTargetQuery` added alongside `enemyTargetQuery`. `getHitscanCandidates()` includes player targets when `friendlyFireMode !== 'none'`. `resolveHitscanPellet()` applies FF damage scaling to player-vs-player hitscan hits.
- `packages/shared/src/sim/systems/dynamite.ts` — Dynamite AoE friendly fire: damages other players in blast radius (skips self, handled separately). Uses `clampDamage()` with `FRIENDLY_FIRE_DAMAGE_SCALE` for 'reduced' mode.
- `packages/shared/src/sim/world.ts` — `friendlyFireMode: FriendlyFireMode` field on `GameWorld`. Default: `'none'`.
- `packages/shared/src/net/lobby.ts` — `FriendlyFireMode` type, `friendlyFire` field on `LobbyState`.
- `packages/server/src/rooms/schema/GameRoomState.ts` — `friendlyFire` Colyseus Schema field.
- `packages/server/src/rooms/GameRoom.ts` — `set-friendly-fire` message handler sets mode during lobby phase. Server syncs to `world.friendlyFireMode` and Schema state.
- `packages/client/src/net/NetworkClient.ts` — `sendFriendlyFire(mode: FriendlyFireMode)` method. `normalizeLobbyState` extracts `friendlyFire` from room state.

**Design decisions**:
1. **Three damage paths covered**: Projectile bullets (bulletCollision.ts), hitscan shots (weapon.ts), and dynamite AoE (dynamite.ts) all respect the FF policy. These are the three ways player-owned damage can hit other players.
2. **Melee/stomp/rockslide excluded**: These systems only target enemies via `forEachAliveEnemyInRadius`. Adding player-vs-player melee FF would be a significant gameplay design change and is not in scope per the ticket's acceptance criteria ("Dynamite area damage follows the same policy"). Could be added in a future Epic if desired.
3. **Host-only toggle deferred**: Currently any connected player can change the FF mode during lobby. True host-only enforcement requires tracking a "host" concept (first player, or room creator). Deferred — in practice, the creating player is typically the one configuring settings. Can be gated in Epic 10 (Anti-Grief).
4. **Shared constant**: `FRIENDLY_FIRE_DAMAGE_SCALE` lives in `damage.ts` and is imported by all three damage paths, avoiding magic number duplication.
5. **Hitscan player targeting uses current position**: No lag compensation for player-vs-player hitscan (historical position rewind is only for enemy targets). Players are peer-predicted and their current positions are authoritative.
6. **Self-damage prevention**: Projectile bullets skip owner via `Bullet.ownerId` check. Hitscan skips owner via `targetEid === ownerEid` guard. Dynamite self-damage is a separate code path (Controlled Demolition node interaction).

**Code review findings addressed**:
- CRITICAL: Hitscan weapon path now includes player targets when FF enabled
- HIGH: `Math.round` → `clampDamage` in dynamite FF
- MEDIUM: Extracted `FRIENDLY_FIRE_DAMAGE_SCALE` to shared `damage.ts`
- MEDIUM: `sendFriendlyFire` uses `FriendlyFireMode` type instead of literal union
- MEDIUM: `canBulletHitTarget` parameter typed as `FriendlyFireMode`

---

## Epic 4: Disconnect / Rejoin Improvements

A 30-second reconnect window already exists (`GameRoom.ts` `allowReconnection(client, 30)`). This epic addresses the gaps: what happens to the player entity during disconnect, how difficulty adapts, and what the UX looks like.

### Current State

- 30s reconnect window preserves full entity/slot state
- On timeout: entity removed, bullets swept, slot deleted
- No AI takes over the disconnected player
- Difficulty does not scale back down when a player leaves
- No client-side UX for reconnection state

### Ticket 4.1: AI takeover for disconnected players

**Files**:
- `shared/src/sim/systems/disconnectedPlayerAI.ts` (new)
- `shared/src/sim/world.ts`
- `server/src/rooms/GameRoom.ts`

When a player disconnects but is within the reconnect window, mark their entity with a new `Disconnected` tag component. Add a simple AI system that:
- Moves toward the nearest alive player (follow the group)
- Dodges enemy bullets within a close radius (reactive roll)
- Does not shoot (prevents AI from wasting ammo / doing unintended damage)

On reconnect, remove the `Disconnected` tag and resume normal input processing.

**Acceptance**:
- Disconnected player entity moves toward allies, doesn't stand still
- Entity uses dodge roll when enemy bullets approach
- On reconnect, player resumes full control immediately
- AI behavior runs in shared package (deterministic)

---

### Ticket 4.2: Dynamic difficulty scale-down on disconnect

**Files**:
- `server/src/rooms/GameRoom.ts`
- `shared/src/sim/content/coopScaling.ts` (from Epic 1)

When `activePlayerCount` decreases (disconnect timeout, not during reconnect window), already-spawned enemies retain their HP but *newly spawned* enemies use the updated lower scalar. This prevents a sudden difficulty cliff while gradually easing the remaining players in.

If the disconnected player had items that granted team-wide buffs, those buffs should be removed when the entity is cleaned up.

**Acceptance**:
- Player disconnect → `activePlayerCount` drops → next wave is easier
- Already-alive enemies keep their current HP (no mid-fight HP reduction)
- Rejoining player restores the count and future spawns scale back up

---

### Ticket 4.3: Client reconnection UX

**Files**:
- `client/src/ui/` (reconnection overlay component)
- `client/src/net/NetworkClient.ts`

Add a reconnection overlay that appears on unexpected disconnect:
- Shows "Connection lost — reconnecting..." with a countdown timer (30s)
- Shows attempt number (1/5) and connection state
- On reconnect: brief "Reconnected!" flash then dismiss
- On failure: "Connection lost. Return to menu." button

**Acceptance**:
- Overlay appears immediately on disconnect (no delay)
- Countdown synced to server's 30s window
- Game rendering pauses or greys out behind the overlay
- Smooth transition back to gameplay on reconnect

### Epic 4 Implementation Notes

**Status**: Complete (Tickets 4.1-4.3)

**Files created**:
- `packages/shared/src/sim/systems/disconnectedPlayerAI.ts` — AI system that drives disconnected player entities. Follows nearest alive connected ally, dodges closest threatening enemy bullet via reactive roll, never shoots.

**Files modified**:
- `packages/shared/src/sim/components.ts` — Added `Disconnected` tag component and added to `AllComponents`.
- `packages/shared/src/sim/systems/index.ts` — Registered `disconnectedPlayerAISystem` in `registerAllSystems` (before `playerInputSystem`) and `registerPredictionSystems` (for client-side prediction determinism).
- `packages/server/src/rooms/GameRoom.ts` — Added `addComponent(Disconnected)` on client disconnect (before reconnect window), `removeComponent(Disconnected)` on successful reconnect. Imported `addComponent`, `removeComponent`, `Disconnected`.

**Design decisions**:
1. **Synthetic input injection**: The AI generates a `NetworkInput` and writes it directly to `world.playerInputs`. All downstream systems (movement, roll, collision) work unchanged — no separate AI movement path needed.
2. **Spatial hash one-tick lag**: `spatialHashSystem` runs after the AI, so bullet positions are one tick stale. This is the same accepted trade-off as `floorSpeedMul` and is imperceptible.
3. **Closest-threat dodge**: The AI picks the closest threatening bullet (not first-found) and dodges to the perpendicular side that moves away from the bullet's origin. This produces better dodge behavior than always picking the same perpendicular direction.
4. **No shooting**: The AI never sets SHOOT, ABILITY, or RELOAD buttons. This prevents unintended ammo waste and friendly fire from an AI-controlled player.
5. **Prediction registration**: Included in `registerPredictionSystems` so client-side prediction of disconnected ally positions matches the server, avoiding visible snapping on snapshot arrival.
6. **All-disconnected fallback**: If all players disconnect simultaneously, entities stand still. Without a reference point, any movement heuristic would be arbitrary.

**Ticket 4.2 (difficulty scale-down)**: Already implemented by Epic 1. `activePlayerCount = slots.size` — slots are preserved during the 30s reconnect window (scaling unchanged), deleted on timeout (scaling naturally drops for future spawns). Existing enemies keep their HP.

**Ticket 4.3 (reconnection UX)**: Already implemented. `ReconnectOverlay.tsx` shows connection status, attempt counter, retry/quit buttons. Wired into `MultiplayerGame.tsx` via `reconnect-state` event from `NetworkClient`.

**Code review findings addressed**:
- Added spatial hash one-tick-lag comment in file header
- Changed dodge to pick closest threat instead of first-found (fixes `forEachInRadius` early-exit non-issue + improves quality)
- Simplified roll check to `hasComponent(world, Roll, eid)` only (redundant `PlayerState` check removed)
- Added perpendicular side selection (dodge away from bullet origin, not always left-perpendicular)
- Added `registerPredictionSystems` registration for client determinism
- Documented `seq: 0` safety and all-disconnected fallback

---

## Epic 5: Camp Pacing

Currently camp advances only when ALL players send `set-camp-ready`. No timer, no parallel interaction indicator. One AFK player blocks everyone.

### Ticket 5.1: Camp auto-advance timer

**Files**:
- `server/src/rooms/GameRoom.ts`

Start a 90-second countdown when camp phase begins. Broadcast remaining time to all clients. When timer expires, force `world.campComplete = true` even if not all players are ready.

Players who haven't interacted with the skill tree or purchased anything get auto-applied defaults (no skill point spent, no purchase — they just miss the opportunity).

**Acceptance**:
- Camp auto-advances after 90s regardless of ready state
- Timer is broadcast at 1Hz so clients can display countdown
- Ready-check still works: if all players ready before timer, advance immediately
- Timer resets if a player disconnects and reconnects during camp

---

### Ticket 5.2: Camp ready status broadcast

**Files**:
- `server/src/rooms/GameRoom.ts`
- `shared/src/net/lobby.ts`
- `client/src/ui/` (camp HUD)

Broadcast per-player ready status to all clients during camp so everyone can see who they're waiting on. Message format:

```ts
export interface CampStatusMessage {
  readyPlayers: string[]     // session IDs of ready players
  totalPlayers: number
  remainingSeconds: number   // from Ticket 5.1 timer
}
```

Client displays: "Waiting for 2 players... (45s)" with player name indicators showing who is/isn't ready.

**Acceptance**:
- All clients see real-time ready status of every player
- Clear visual of who is holding up the group
- Timer countdown visible to all

---

### Ticket 5.3: Parallel camp interaction

**Files**:
- `server/src/rooms/GameRoom.ts`
- `client/src/ui/` (camp scene)

Ensure all players can interact with camp systems simultaneously:
- Each player has their own skill tree interaction (already per-player via `UpgradeState`)
- Visitor purchases are first-come-first-served with shared inventory visibility
- Stash interactions are per-player

The server already handles `camp-purchase`, `select-node`, and `tinkerer-mod-select` per-session. This ticket is primarily about client UI — show what other players are doing (e.g., "Player 2 is browsing the skill tree").

**Acceptance**:
- All players can open skill tree / interact with visitors concurrently
- Purchases deplete shared stock (if applicable) with real-time visibility
- No deadlock: two players clicking the same visitor simultaneously doesn't break

---

### Implementation Notes (Epic 5)

**Status**: Complete

**Design Decisions**:
- Camp status uses a dedicated `camp-status` message type (not piggybacked on snapshots) since camp phase has no simulation ticks
- Timer is server-authoritative — `campTimerRemaining` lives on `GameRoom`, broadcast at 1Hz via `campStatusBroadcastAccum`
- `CampStatusMessage` in `shared/src/net/campStatus.ts` keeps the type shared between server and client
- `CAMP_AUTO_ADVANCE_SECONDS = 90` as a shared constant for potential client-side display use
- Ready count is derived from `this.campReadySessions.size` in GameRoom; no per-player name list (privacy-friendly)

**Files Changed**:
- `shared/src/net/campStatus.ts` — new: `CampStatusMessage` interface and `CAMP_AUTO_ADVANCE_SECONDS` constant
- `shared/src/net/index.ts` — re-export campStatus
- `server/src/rooms/GameRoom.ts` — `tickCampTimer()`, `broadcastCampStatus()`, timer fields, auto-advance guard
- `client/src/net/NetworkClient.ts` — `camp-status` event handling
- `client/src/ui/CampPanel.tsx` — ready count + timer display (only shown for multiplayer)
- `client/src/pages/MultiplayerGame.tsx` — `campStatus` state, event wiring, cleanup on retry

**Review Fixes**:
- CRITICAL: Added `campAutoAdvanced` flag to prevent repeated `world.campComplete = true` after timer expires
- HIGH: Fixed accumulator drift (`-= 1` instead of `= 0` for `campStatusBroadcastAccum`)
- HIGH: Added `setCampStatus(null)` to `handleRetry` to clear stale camp status on reconnect
- MEDIUM: Show "Advancing..." when `remainingSeconds <= 0` instead of "Auto-advance in 0s"

**Tickets Already Implemented**:
- Ticket 5.3 (parallel camp interaction) was already working — server handles camp messages per-session, UI already supports concurrent use

---

## Epic 6: Revive System

Downed players can be revived by teammates. 10-second bleed-out timer. Hold interact near a downed ally to revive.

### Technical Constraints

The current `Dead` tag is binary — alive or dead. Revive requires a new intermediate `Downed` state with a timer. `MultiplayerReconciler` must handle downed→revived transitions during reconciliation without desyncing.

### Ticket 6.1: Downed state ECS components

**Files**:
- `shared/src/sim/components.ts`
- `shared/src/sim/prefabs.ts`

Add new components:

```ts
export const Downed = defineComponent({
  bleedTimer: Types.f32,      // seconds remaining before permanent death
  reviveProgress: Types.f32,  // 0-1, progress toward revival
  reviverEid: Types.ui16,     // entity ID of the player reviving (NO_TARGET if none)
})
```

When a player's HP hits 0 in co-op (playerCount > 1), add `Downed` instead of `Dead`. Set `bleedTimer = 10.0`. If `bleedTimer` reaches 0 with no revive, convert to `Dead`.

In single-player, skip `Downed` and go directly to `Dead` (no change to single-player behavior).

**Acceptance**:
- `Downed` component defined with bleedTimer, reviveProgress, reviverEid
- Player at 0 HP in multiplayer enters Downed state
- Single-player death is unchanged

---

### Ticket 6.2: Revive interaction system

**Files**:
- `shared/src/sim/systems/reviveSystem.ts` (new)

New ECS system that runs each tick:

1. For each `Downed` entity: decrement `bleedTimer` by dt
2. If any alive player is within revive range (48px) and holding INTERACT button, increment `reviveProgress` by `dt / REVIVE_DURATION` (3 seconds to revive)
3. If the reviver moves away or releases INTERACT, decay `reviveProgress` slowly (don't instant-reset — prevents frustrating restarts)
4. If `reviveProgress >= 1.0`: remove `Downed`, set `Health.current` to 30% of max, brief invincibility window (2s)
5. If `bleedTimer <= 0`: remove `Downed`, add `Dead`

**Constants**:
- `BLEED_TIMER = 10.0` seconds
- `REVIVE_DURATION = 3.0` seconds
- `REVIVE_RANGE = 48` pixels
- `REVIVE_HP_PERCENT = 0.3`
- `REVIVE_INVULN = 2.0` seconds

**Acceptance**:
- Player bleeds out in 10s with no intervention
- 3-second hold near downed ally revives at 30% HP
- Interrupted revive decays progress, doesn't reset
- Revived player has 2s of invulnerability
- System runs in shared (deterministic)

---

### Ticket 6.3: Downed state in snapshot protocol

**Files**:
- `shared/src/net/snapshot.ts`

Encode downed state in the player flags byte. Currently flags uses bits 0-3 (`Dead=1, Invincible=2, rollBtn=4, jumpBtn=8`). Add:
- Bit 4: `Downed` (value 16)

Add `reviveProgress` as a Uint8 (0-255, quantized from 0.0-1.0) after `showdownTargetEid` in the per-player record. Bump `PLAYER_SIZE` from 38 to 39.

The `bleedTimer` does not need to be in the snapshot — clients can derive it from the `Downed` flag timing relative to the known 10s constant.

**Acceptance**:
- Downed flag is encoded/decoded correctly
- Revive progress bar data is available to all clients
- Existing snapshot tests updated for new layout
- `SNAPSHOT_VERSION` bumped (coordinate with Ticket 1.3 if both land in same version)

---

### Ticket 6.4: Downed/revive rendering

**Files**:
- `client/src/render/PlayerRenderer.ts`
- `client/src/ui/` (revive prompt HUD)

Visual representation of downed state:
- Downed player sprite plays a "fallen" animation (or tints red + partial transparency)
- Circular progress indicator around the downed player showing revive progress
- "Hold [E] to revive" prompt appears when local player is within range
- Bleed-out timer shown above the downed player (red, counting down)

**Acceptance**:
- Downed players are visually distinct from alive and dead
- Revive progress bar is visible to all players
- Prompt only appears for the local player when in range
- Dead (bled out) players fade away

### Implementation Notes (Epic 6)

**Downed component** (`components.ts`): Used SoA-style `{ bleedTimer: Float32Array, reviveProgress: Float32Array, reviverEid: Uint16Array }` matching the project's bitECS pattern. Added to `AllComponents` array for proper cleanup.

**Health system branching** (`health.ts`): When `world.activePlayerCount > 1`, player HP reaching 0 adds `Downed` instead of `Dead`. Single-player behavior unchanged. Imports `BLEED_TIMER` from reviveSystem to avoid magic numbers.

**Revive system** (`reviveSystem.ts`): Runs after `interactionSystem` so its "Hold [E]: Revive" prompt overrides NPC prompts when a player is near both. NOT added to `registerPredictionSystems` — revive depends on other players' inputs, making it inherently server-authoritative. Clients receive Downed/reviveProgress via snapshots.

**Design decision — Health.iframes vs Invincible tag**: Post-revive protection uses only `Health.iframes = 2.0`, not the `Invincible` component. The roll system manages `Invincible` for dodge i-frames, and adding/removing it from a separate revive timer would require a dedicated cleanup mechanism. `Health.iframes` is checked by all standard damage paths (bullets, hitscan, dynamite, enemy attacks) and provides sufficient protection.

**Design decision — Poison removal on revive**: Poison DOT is cleared when a player is revived. Without this, a poisoned player could be revived at 30% HP and immediately start taking poison damage, potentially re-downing within seconds — a frustrating experience that punishes the reviver's effort.

**Snapshot protocol v12**: Downed flag at bit 4 (value 16) in flags byte. `reviveProgress` as Uint8 (0-255 quantized). `PLAYER_SIZE` bumped 38→39. `bleedTimer` omitted from snapshot — clients can derive it from the 10s constant and Downed flag timing.

**All-players-downed game-over**: After the main revive loop, if `getAlivePlayers()` returns empty while downed players exist, all Downed are immediately converted to Dead. This triggers game-over on every client and handles the `activePlayerCount` disconnect race (last alive player disconnects → their entity eventually takes damage → downed with no reviver possible).

**Downed guards audit**: Added `Downed` guards to all damage/interaction systems that previously only checked `Dead`: poison, bossShockwave, trapZone (5 checks), hellfirePillar, hazardTile, hpPotionUse, itemPickup (both loops), disconnectedPlayerAI, playerInput, interaction, enemyDetection. Also updated `getAlivePlayers()` to exclude Downed (affects enemy targeting, wave spawner scaling, camp visitor generation).

**Rendering** (`PlayerRenderer.ts`): Downed players show pulsing alpha (0.4–0.7), death animation, pulsing red tint, hidden weapon. Revive progress displayed as a green arc ring around the downed player. `deathStartTime` reset on revive to prevent stale death animation state.

---

## Epic 7: Ping System

Contextual pings for team communication. Ping an enemy (marks target), ping a location (waypoint), danger ping. Essential for public matchmaking where players lack voice chat.

### Ticket 7.1: Ping protocol and shared types

**Files**:
- `shared/src/net/ping.ts` (new — note: different from clock `ping`/`pong`)

```ts
export type PingType = 'location' | 'enemy' | 'danger'

export interface PlayerPing {
  type: PingType
  worldX: number
  worldY: number
  targetEid?: number       // for enemy pings
  senderEid: number
  tick: number
  expiresAtTick: number    // auto-remove after 5 seconds (300 ticks)
}
```

Cooldown: max 1 ping per second per player to prevent spam.

**Acceptance**:
- Types exported from shared
- Ping has a 5-second lifetime (300 ticks at 60Hz)
- Cooldown defined as constant

---

### Ticket 7.2: Server ping relay

**Files**:
- `server/src/rooms/GameRoom.ts`

Handle `'ping'` messages from clients (namespace separately from clock pings — use `'player-ping'`):
1. Validate: player is alive, cooldown respected (server-side enforcement)
2. Broadcast `'player-ping'` to all other clients with sender info
3. If `targetEid` is provided, validate entity exists and is an enemy

No simulation impact — pings are purely visual/social.

**Acceptance**:
- Ping relayed to all clients except sender
- Rate limited to 1/second server-side
- Invalid pings (dead player, bad entity) silently dropped

---

### Ticket 7.3: Ping input binding and rendering

**Files**:
- `client/src/input/` (keybinding)
- `client/src/render/PingRenderer.ts` (new)
- `client/src/ui/` (ping wheel or single-key ping)

**Input**: Middle mouse or `G` key for location ping. `G` while aiming at an enemy = enemy ping. `Ctrl+G` or double-tap `G` = danger ping.

**Rendering**:
- Location ping: expanding ring at world position, fades over 5s
- Enemy ping: pulsing diamond above targeted enemy, fades over 5s
- Danger ping: red exclamation mark with pulsing circle, fades over 5s
- Minimap dot at ping location (if minimap exists)
- Brief audio cue on ping receipt (distinct per type)

**Acceptance**:
- Pings visible to all players at correct world positions
- Pings auto-expire after 5s
- Distinct visual per type
- Minimal visual footprint (pings should not obscure gameplay)

### Implementation Notes (Epic 7)

**Architecture**: Pings are purely visual/social overlays — no ECS representation, no simulation impact. Client sends `player-ping` message, server validates and broadcasts to all clients. Each client maintains a local array of active pings in `PingRenderer`.

**Shared types** (`playerPing.ts`): `PlayerPingRequest` (client→server) and `PlayerPingEvent` (server→all clients). Constants: `PING_LIFETIME_S=5`, `PING_COOLDOWN_S=1`, `PING_MAX_ACTIVE=3`. Named `player-ping` to distinguish from clock sync `ping`/`pong`.

**Server relay** (`GameRoom.ts`): Validates ping type, coordinates (isFiniteNumber + clamp), player alive status (Dead/Downed guard), cooldown (1s), and active ping cap (3). Uses tick-based expiry (`pingExpiryTicks[]` array on PlayerSlot) instead of `setTimeout` to avoid dangling closures on player disconnect. Enemy ping validation checks entity ID > 0 (bitECS sentinel guard) and degrades invalid enemy pings to location pings rather than silently dropping.

**Input** (`Input.ts`): G key sets `_pingRequested` flag ('location' or 'danger' with Ctrl). `consumePingRequest()` returns and clears the flag. Separate from simulation input — not part of the ECS `Button` bitmask.

**Rendering** (`PingRenderer.ts`): Three visual styles — location (expanding ring + center dot, blue), enemy (pulsing diamond above target, orange), danger (pulsing circle + exclamation mark, red). Quadratic alpha fade-out over 5s. Enemy pings track target position from ECS each frame. Graphics cleared and destroyed on expiry. Container added to `fx` layer (world-space, above entities).

**Design decision — enemy pings deferred**: The `enemy` ping type exists in the protocol but is not triggerable from the current client UI (G key only sends location/danger). Enemy pings require a cursor→entity hit-test flow that would add significant complexity. The server accepts and validates enemy pings, so a future click-to-ping-enemy feature can be added without protocol changes.

**Design decision — broadcast includes sender**: `this.broadcast('player-ping', event)` sends to all clients including the sender. This provides immediate visual confirmation that the ping was accepted by the server, without needing a separate acknowledgement message.

**Stage transitions**: `pingRenderer.clear()` called on tilemap swap to prevent stale pings persisting across stages.

---

## Epic 8: Shared Loot / Draft Picks

The brainstorm recommends draft picks at camp: each player picks from a shared pool in rotation. Free-for-all is a grief vector.

### Ticket 8.1: Loot distribution model

**Files**:
- `shared/src/sim/content/lootDistribution.ts` (new)
- `server/src/rooms/GameRoom.ts`

Implement draft-pick loot distribution:
1. At camp, generate `N * playerCount` item offers (where N = items per player, e.g., 2)
2. Determine pick order: player with most kills picks first (incentivizes participation), then rotate
3. Each player picks one item per round, snake-draft style (1-2-3-3-2-1)
4. Unpicked items after all rounds are discarded
5. Timer per pick: 15 seconds, then auto-pick highest rarity remaining

For gold: personal gold (each player earns their own). No gold sharing or stealing.

**Acceptance**:
- Draft pick UI shows all available items with pick order indicator
- Each player gets equal number of picks
- Timeout auto-picks to prevent stalling
- Gold is per-player, not shared

---

### Ticket 8.2: Draft pick server orchestration

**Files**:
- `server/src/rooms/GameRoom.ts`

Server manages draft state during camp:
1. Generate offer pool on camp start
2. Track whose turn it is, send `'draft-turn'` message
3. Accept `'draft-pick'` messages, validate it's the picker's turn
4. Broadcast `'draft-result'` to all players
5. Auto-pick on timeout

```ts
// Server → Client
{ type: 'draft-start', offers: Item[], pickOrder: string[] }
{ type: 'draft-turn', sessionId: string, remainingMs: number }
{ type: 'draft-result', sessionId: string, pickedItemIndex: number }
{ type: 'draft-complete' }
```

**Acceptance**:
- Full draft cycle completes without deadlock
- Concurrent camp interactions (skill tree, visitors) still work during draft
- Disconnected player's turn is auto-skipped after timeout

---

### Ticket 8.3: Draft pick client UI

**Files**:
- `client/src/ui/` (draft pick component)

Display during camp phase:
- Grid/list of available items with rarity indicators and descriptions
- Highlight whose turn it is (with player name and countdown)
- Animate items being picked (fly to the picker's portrait)
- "Your turn!" notification with countdown timer
- Click/tap to pick an item during your turn

**Acceptance**:
- All players see the same item pool
- Picked items visually removed from pool
- Clear indication of whose turn it is
- Smooth transition from draft to rest of camp phase

---

### Epic 8 Implementation Notes

**Architecture**: Draft state lives on `GameWorld.draftState` (shared) and is created in `stageProgression.ts:enterCampPhase()` when `alivePlayers.length > 1`. The server orchestrates picks via the `'draft-pick'` onMessage handler. HUD pushes draft state at 10Hz to all clients; no separate draft-specific messages needed.

**Deviation from spec**: Instead of separate `draft-start`, `draft-turn`, `draft-result`, `draft-complete` messages, the entire draft state is embedded in the per-player HUD push. This simplifies the protocol — clients just render from the latest HUD snapshot rather than managing a separate event-driven state machine.

**Key files created/modified**:
- `shared/src/sim/content/lootDistribution.ts` — Core types: `DraftState`, `DraftOffer`, `DraftPhase`. Functions: `generateDraftPool` (weighted random, no duplicates), `buildPickOrder` (snake draft by kill count), `autoPickBestItem` (highest rarity first), `createDraftState`, `advanceDraft`, `getCurrentPicker`.
- `shared/src/sim/world.ts` — Added `draftState: DraftState | null` and `playerKillCounts: Map<number, number>`.
- `shared/src/net/hud.ts` — Added `draft` field to `HudData` with full draft state + `playerNames` record.
- `shared/src/sim/systems/health.ts` — Added per-player kill tracking (`world.playerKillCounts`).
- `shared/src/sim/systems/stageProgression.ts` — Creates draft in `enterCampPhase()`, passes `world.playerKillCounts`.
- `server/src/rooms/GameRoom.ts` — `'draft-pick'` handler with turn/bounds validation, draft timer ticking with auto-pick, draft HUD construction with player names.
- `client/src/ui/DraftPickPanel.tsx` — React component: shows turn indicator, timer, item cards with rarity, PICK button on your turn, picked-by labels.
- `client/src/ui/CampPanel.tsx` — Integrates DraftPickPanel above visitor shop section.
- `client/src/net/NetworkClient.ts` — Added `sendDraftPick()`.
- `client/src/scenes/types.ts` — Added `draft` field to `HUDState`.
- `client/src/pages/MultiplayerGame.tsx` — Wired draft props + handler, stores `localPlayerEid`.

**Design decisions**:
- Snake draft (1-2-3-3-2-1) ensures fairness across rounds.
- Kill-based priority (most kills → first pick) incentivizes participation.
- Pool size = `2 * playerCount + ceil(playerCount * 0.5)` — extra "variety" items give choice without overwhelming.
- `pickedBy` uses `-1` sentinel (plain JS object, not typed array — NO_TARGET=0xFFFF convention doesn't apply).
- Draft runs alongside visitor shop: solo players get the visitor shop only, multiplayer gets both draft and shop.

**Review findings fixed**:
- CRITICAL: Added `world.playerKillCounts` per-player kill tracking (was passing empty map).
- CRITICAL: Simplified `generateDraftPool` to splice candidates immediately (no retry loop needed).
- HIGH: Draft HUD now sent for both `'picking'` and `'complete'` phases.
- HIGH: `advanceDraft` only called when auto-pick succeeds; else force-complete.
- HIGH: Added bounds check for `poolIndex` (negative + out-of-range).
- HIGH: Clamped pick counter display to prevent `totalPicks+1` flash.
- MEDIUM: Changed `DraftPickPanel` to accept `Record<number, string>` instead of `Map` to avoid allocation per render.

---

## Epic 9: Quick Play Matchmaking

"Quick Play" button that creates or joins a room with players at a similar stage.

### Ticket 9.1: Basic matchmaking by stage

**Files**:
- `server/src/index.ts`
- `server/src/rooms/GameRoom.ts`

Extend room filtering to include target stage. When a player clicks "Quick Play":
1. Client sends `joinOrCreate('game', { matchType: 'quickplay', stage: 1 })`
2. Server filters available rooms by stage compatibility (same stage or ±1)
3. If no compatible room, create a new one
4. Room metadata includes current stage for filtering

Later iterations can add MMR, character preference, and region filtering.

**Acceptance**:
- Quick Play joins a stage-appropriate room
- Players don't get dropped into a Stage 3 room when they're on Stage 1
- Falls back to room creation if no match found

---

### Ticket 9.2: Quick Play client UI

**Files**:
- `client/src/ui/` (main menu / multiplayer menu)

Add to the multiplayer menu:
- "Quick Play" button (large, prominent)
- "Create Private Game" button → shows room code (Epic 2)
- "Join by Code" input → joins specific room (Epic 2)
- Brief "Searching for game..." state with cancel option

**Acceptance**:
- Clear multiplayer entry flow: Quick Play vs. Private
- Loading state while matchmaking
- Cancel returns to menu without side effects

---

### Epic 9 Implementation Notes

**Approach**: Uses a sentinel room code `QUICK_PLAY_CODE = 'QUICKPLAY'` with Colyseus' existing `filterBy(['roomCode'])` mechanism. All Quick Play clients join with this sentinel code, so Colyseus matches them into the same room automatically. When the game starts, `this.lock()` prevents further joins.

**Deviation from spec**: Stage-based filtering is not implemented in this iteration. All Quick Play rooms are treated equally — there's no `stage` parameter. This is appropriate because players always start at Stage 1 together; mid-run joins are blocked by the lock.

**Key files modified**:
- `shared/src/net/lobby.ts` — Added `QUICK_PLAY_CODE` constant.
- `server/src/rooms/GameRoom.ts` — `isQuickPlay` field, `onCreate` handles sentinel code, `onAuth` validates QUICKPLAY code + uses `this.locked` to reject mid-game joins, `this.lock()` called before phase transition. Defensive `slots.size >= MAX_PLAYERS` guard in `onJoin`.
- `client/src/net/NetworkClient.ts` — Added `joinQuickPlay()` method using `QUICK_PLAY_CODE`.
- `client/src/pages/Home.tsx` — Multiplayer sub-menu with Quick Play button, Create Private Game link, and Join by Code input.
- `client/src/pages/MultiplayerGame.tsx` — Reads `?mode=quickplay` param, routes to `joinQuickPlay()`.

**Design decisions**:
- Sentinel code approach: simple, leverages existing Colyseus filterBy infrastructure, no custom matchmaker needed.
- `this.lock()` called before `this.state.phase = 'playing'` to minimize race window.
- `this.locked` check in `onAuth` (not just `this.state.phase`) — more reliable since it's the actual Colyseus locking mechanism.
- Quick Play rooms show the standard lobby (character select, ready-up) — same UX as private rooms.

**Review findings fixed**:
- CRITICAL: Moved `this.lock()` before phase transition to close the race window.
- CRITICAL: Changed `onAuth` to use `this.locked` instead of `this.state.phase === 'playing'`.
- HIGH: Fixed character selection to use `selectedCharacter` instead of hardcoded `'sheriff'`.
- HIGH: Added `slots.size >= MAX_PLAYERS` guard in `onJoin` as defense-in-depth.

---

## Epic 10: Anti-Grief Measures

Prevent toxic behavior in public matches.

### Ticket 10.1: AFK detection

**Files**:
- `server/src/rooms/GameRoom.ts`

Track time since last non-neutral input per player. If a player sends no meaningful input (movement, shoot, interact) for 60 seconds during active gameplay (not camp):
1. Send `'afk-warning'` to the player (30s notice)
2. If still AFK after warning: kick with reason "AFK"

Idle during camp phase does NOT trigger AFK detection (players may be reading skill trees).

**Acceptance**:
- 60s of inactivity during combat triggers warning
- 90s total triggers kick
- Camp/lobby phases exempt
- Disconnected players in reconnect window are exempt

---

### Ticket 10.2: Vote-kick system

**Files**:
- `server/src/rooms/GameRoom.ts`
- `shared/src/net/votekick.ts` (new)
- `client/src/ui/` (vote-kick UI)

Any player can initiate a vote-kick against another player:
1. Client sends `'votekick-start'` with target session ID
2. Server broadcasts `'votekick-vote'` to all other players
3. Players vote yes/no within 30 seconds
4. Majority (>50% of non-target players) kicks the target
5. Kicked player cannot rejoin the same room
6. Cooldown: one vote-kick per initiator per 5 minutes

**Acceptance**:
- Vote-kick requires majority approval
- Target cannot vote on their own kick
- One active vote at a time
- Kicked players are blocked from rejoining
- Cooldown prevents vote-kick spam

### Implementation Notes (Epic 10)

**AFK Detection (Ticket 10.1):**
- Server-side tracking via `lastActiveInputTick` and `afkWarned` on `PlayerSlot`
- Resets on non-zero `buttons`, `moveX`, or `moveY` in input handler
- `checkAfk()` runs per-tick inside `serverTick()`, gated to active combat only (`run.transition === 'none'`)
- Skips disconnected and dead players
- Warning at 60s idle, kick at 90s; camp/lobby/looting phases exempt
- Client shows amber banner with auto-dismiss (cleanup on unmount)

**Vote-kick (Ticket 10.2):**
- Shared types in `packages/shared/src/net/votekick.ts`
- Eligible count snapshot at vote-start time (prevents drift if players leave during vote)
- Minimum 3 players required; restricted to `phase === 'playing'`
- Initiator auto-votes yes; 30s window; early resolution when all voters cast
- Vote cancelled if target disconnects; timer cleaned up in `onDispose`
- `kickedSessionIds` blocks rejoining in `onAuth`
- Client: `VotekickPanel` with `key={voteId}` for fresh state per vote

**Review fixes:** snapshot eligible count, 3-player minimum, cancel vote on target leave, phase gate, key prop, timer leak cleanup, test stubs for `setMetadata`/`lock`, LobbyState test fields.

---

## Epic 11: Post-Run Stats

Comparative stats screen shown when a run ends (victory or defeat).

### Current State

No stats tracking exists. Only `world.killCount` (global, not per-player) and `world.goldCollected` are tracked.

### Ticket 11.1: Per-player stat accumulator

**Files**:
- `shared/src/sim/stats.ts` (new)

Track per-player stats in the shared simulation:

```ts
export interface PlayerRunStats {
  damageDealt: number
  damageReceived: number
  enemiesKilled: number
  bossesKilled: number
  shotsFired: number
  shotsHit: number          // accuracy = hit/fired
  goldCollected: number
  itemsCollected: number
  timesDown: number         // revive system
  revivesGiven: number
  rollDodges: number        // successful i-frame dodges
  longestKillStreak: number
}
```

Hook into existing systems:
- `bulletCollision.ts`: increment `damageDealt` on hit, `shotsFired` on fire
- `enemyDeath.ts`: increment `enemiesKilled`, `bossesKilled`
- `goldSystem.ts` / `xpSystem.ts`: increment `goldCollected`
- `reviveSystem.ts` (Epic 6): increment `timesDown`, `revivesGiven`

Store on `world.playerStats: Map<number, PlayerRunStats>` keyed by entity ID.

**Acceptance**:
- All stats accumulate correctly during gameplay
- Stats are deterministic (tracked in shared, not client-side)
- Map is cleaned up when entities are removed (but final snapshot preserved for end screen)

---

### Ticket 11.2: End-of-run stat broadcast

**Files**:
- `server/src/rooms/GameRoom.ts`
- `shared/src/net/stats.ts` (new — or extend `shared/src/net/hud.ts`)

When a run ends (all players dead or final boss defeated), server sends `'run-complete'` message to all clients:

```ts
export interface RunCompleteMessage {
  victory: boolean
  duration: number           // total run time in seconds
  stagesCleared: number
  playerStats: Array<{
    sessionId: string
    characterId: string
    name: string
    stats: PlayerRunStats
  }>
}
```

**Acceptance**:
- Message sent exactly once on run completion
- Contains stats for all players (including those who disconnected — use last known stats)
- Includes run metadata (duration, stages, victory/defeat)

---

### Ticket 11.3: Post-run stats screen UI

**Files**:
- `client/src/ui/` (post-run stats component)

Display after `'run-complete'`:
- Column per player, row per stat
- Highlight "best in category" per stat (most kills, best accuracy, etc.)
- Show overall run summary (time, stages, victory/defeat)
- "Play Again" and "Return to Menu" buttons
- MVP callout (player with highest combined contribution score)

Western theme: styled as a "Wanted" poster or newspaper headline.

**Acceptance**:
- All player stats displayed side-by-side
- Visual highlights for top performers
- Play Again starts a new run in the same room
- Return to Menu disconnects from room

---

### Epic 11 — Implementation Notes

**Ticket 11.1: Per-player stat accumulator**

Created `shared/src/sim/stats.ts` with `PlayerRunStats` interface and `getOrCreatePlayerStats()` lazy-init helper. Added `playerStats: Map<number, PlayerRunStats>` to `GameWorld`. Stats tracked deterministically in shared across 8 systems:
- `health.ts`: enemiesKilled, bossesKilled, kill streaks (_currentStreak + longestKillStreak), timesDown
- `bulletCollision.ts`: damageDealt + shotsHit for projectile bullet hits
- `weapon.ts`: shotsFired (counts pellets, not trigger pulls, for accurate accuracy%), hitscan damageDealt/shotsHit
- `applyDamage.ts`: damageReceived (player targets only)
- `goldReward.ts`: goldCollected (kill rewards)
- `goldRush.ts`: goldCollected (nugget pickups)
- `itemPickup.ts`: itemsCollected
- `reviveSystem.ts`: revivesGiven (credit goes to reviver)
- `roll.ts`: rollDodges (removed `hasHandlers('onRollDodge')` gate so dodges always detected for stats)

`_currentStreak` is an internal field stripped via `Omit<>` in the wire type.

**Ticket 11.2: End-of-run stat broadcast**

Created `shared/src/net/stats.ts` with `RunCompleteMessage` (includes `totalStages`), `PlayerStatEntry` types. Server-side:
- `runCompleteSent` flag + `runStartedAtMs` timestamp on GameRoom, reset in `maybeStartMatch()`
- `maybeBroadcastRunComplete()` called per-tick after `stepWorld()`, detects victory (`run.completed`) or TPK (all non-disconnected slots have Dead component)
- TPK check skips `Disconnected` entities and won't trigger false TPK when all remaining slots are disconnected
- Uses `getOrCreatePlayerStats()` to guarantee zero-filled entries for players who never took action
- Destructures to strip `_currentStreak` before broadcast
- Duration uses wall-clock `Date.now()` diff
- Client: Added `'run-complete'` event to NetworkEventMap and registerRoomHandlers

**Ticket 11.3: Post-run stats screen UI**

Created `MultiplayerRunEndPanel.tsx`: full-screen overlay matching existing western theme, with per-player stat table (10 columns: Kills, DMG, ACC, Taken, Gold, Downs, Revives, Dodges, Streak). Players sorted by kills then damage. Local player row highlighted. Character name colored by class.

Integrated into `MultiplayerGame.tsx`:
- Victory: panel shown immediately on `run-complete` event
- Defeat: 1750ms delay (matching single-player) to let death animation play
- HUD hidden when stats panel visible
- "Back to Menu" disconnects and navigates home
- State and timer cleaned up in `handleRetry` and unmount

**Code review fixes:**
- Added `world.playerStats.clear()` to `resetWorld()` to prevent stat bleed between runs
- Fixed TPK detection to skip `Disconnected` entities (prevents hang when one player disconnects)
- Fixed `shotsFired` to count pellets (`+= pelletCount`) not trigger pulls (prevents >100% accuracy for multi-pellet weapons)
- Used `getOrCreatePlayerStats()` in stat broadcast (prevents silent omission of zero-stat players)
- Added `totalStages` to `RunCompleteMessage` for correct defeat subtitle ("Fell on Stage 2 of 4")
- Moved run-end detection from HUD polling to direct event listener (eliminates stale closure race)

---

## Implementation Order

**Phase 1 (P0 — ship-blocking for multiplayer launch):**
1. Epic 1: Co-op Scaling (Tickets 1.1 → 1.5)
2. Epic 2: Private Lobby Codes (Tickets 2.1 → 2.2)
3. Epic 3: Friendly Fire Policy (Tickets 3.1 → 3.2)
4. Epic 4: Disconnect/Rejoin Improvements (Tickets 4.1 → 4.3)

**Phase 2 (P1 — polished co-op experience):**
5. Epic 5: Camp Pacing (Tickets 5.1 → 5.3)
6. Epic 6: Revive System (Tickets 6.1 → 6.4)
7. Epic 7: Ping System (Tickets 7.1 → 7.3)
8. Epic 8: Shared Loot (Tickets 8.1 → 8.3)

**Phase 3 (P2 — social and quality-of-life):**
9. Epic 9: Quick Play Matchmaking (Tickets 9.1 → 9.2)
10. Epic 10: Anti-Grief Measures (Tickets 10.1 → 10.2)
11. Epic 11: Post-Run Stats (Tickets 11.1 → 11.3)

---

## Risk Register

| Risk | Mitigation |
|------|------------|
| Snapshot format changes (Tickets 1.3, 6.3) cause client/server version mismatch during rollout | `incompatible-protocol` detection already exists; batch format changes into single VERSION bump |
| Co-op scaling HP > 255 breaks Uint8 encoding | Ticket 1.3 explicitly addresses this with Uint16 upgrade |
| Revive system reconciliation desyncs | Downed state must be fully deterministic in shared; reconciler replays revive progress like roll state |
| Draft pick timer stalls camp for disconnected player | Auto-skip disconnected player's turn (Ticket 8.2) |
| Vote-kick griefing (premade group kicks random) | Require majority, add cooldown, log kicks for review |
| Camp timer (90s) too short for new players learning skill tree | Timer only starts counting after camp UI loads; can adjust constant based on playtesting |

---

_This sprint plan covers all 11 items from §3D Multiplayer Enhancements. Epics are ordered by dependency and priority. Phase 1 items are Tier 0 (ship-blocking for EA multiplayer launch). Phase 2/3 items are Tier 1-2 polish._
