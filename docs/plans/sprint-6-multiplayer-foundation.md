# Sprint 6: Multiplayer Foundation

## Context

Sprints 1-5 built a complete single-player roguelite: movement, shooting, rolling, enemies with AI and wave spawning, camera effects, XP/upgrades, the Sheriff character with a skill tree, and Showdown ability. All game logic lives in `packages/shared` and runs deterministically.

The server package is an empty skeleton (just `VERSION = '0.0.1'`). The client has no networking code. Before gameplay features grow further, we need to lay the multiplayer foundation so that future work doesn't create single-player-only coupling that's painful to undo.

## Goal

Two players can connect to a Colyseus server, join the same room, and move + shoot in a shared arena. The server runs the authoritative simulation; clients send input and render server state.

## Success Criteria

- [ ] `playerInputSystem` and all input-consuming systems read per-entity input from `world.playerInputs` map
- [ ] Single-player mode still works unchanged (`stepWorld(world, systems, inputState)` backward compat)
- [ ] Player registry on GameWorld maps sessionId to entity ID
- [ ] Colyseus GameRoom accepts 2 clients and runs shared sim at 60Hz
- [ ] Binary snapshot encode/decode in `packages/shared/src/net/snapshot.ts`
- [ ] Server broadcasts snapshots at 20Hz via `sendBytes`
- [ ] Client connects to server, sends input each tick, receives and renders snapshots
- [ ] Both players see each other moving and shooting in real-time
- [ ] `bun run typecheck && bun run build && bun test` pass

## Deferred to Later Sprints

- Client-side prediction and server reconciliation
- Snapshot interpolation buffer (v1 hard-snaps to latest state)
- Event-driven bullet spawning (v1 includes bullets in snapshots)
- Delta/differential compression
- Interest management / area-of-interest filtering
- Reconnection handling
- Input sequence numbers (only needed for prediction)
- Per-player upgrade state (v1 has no waves/leveling in multiplayer)

---

## Epic 1: Per-Player Input Routing

**Package:** `shared`
**Scope:** Medium
**Depends on:** Nothing

Currently `playerInputSystem`, `weaponSystem`, `cylinderSystem`, `showdownSystem`, and `debugSpawnSystem` all receive a single `InputState` parameter and apply it to every player entity. For multiplayer, each player entity needs its own input.

### Approach

- Add `playerInputs: Map<number, InputState>` to `GameWorld` (keyed by entity ID)
- All 5 input-consuming systems read `world.playerInputs.get(eid)` instead of the `input` parameter
- `stepWorld()` keeps its optional `input` parameter for backward compat: when provided (single-player), it populates `world.playerInputs` for all player entities before running systems
- `debugSpawnSystem` is disabled in multiplayer (debug feature; `world.debugSpawnWasDown` is world-level, not per-entity)

### Key Files

| File | Change |
|------|--------|
| `shared/src/sim/world.ts` | Add `playerInputs` to GameWorld interface + createGameWorld + resetWorld |
| `shared/src/sim/step.ts` | Populate `world.playerInputs` from optional `input` param for backward compat |
| `shared/src/sim/systems/playerInput.ts` | Read `world.playerInputs.get(eid)` per entity |
| `shared/src/sim/systems/weapon.ts` | Same refactor |
| `shared/src/sim/systems/cylinder.ts` | Same refactor |
| `shared/src/sim/systems/showdown.ts` | Same refactor |
| `shared/src/sim/systems/debugSpawn.ts` | Same refactor or skip in multiplayer |

---

## Epic 2: Player Registry

**Package:** `shared`
**Scope:** Small
**Depends on:** Nothing (parallel with Epic 1)

GameWorld needs a mapping from session ID to entity ID so the server can route input to the correct entity and clean up on disconnect.

### Approach

- Add `players: Map<string, { eid: number; slot: number }>` to GameWorld
- New file `shared/src/sim/playerRegistry.ts` with helpers:
  - `addPlayer(world, sessionId)` -- spawns at offset positions, registers in map, returns eid
  - `removePlayer(world, sessionId)` -- removes entity, cleans up map
  - `getPlayerEntity(world, sessionId)` -- lookup
- Spawn positions offset from arena center (player 0 left, player 1 right)

### Key Files

| File | Change |
|------|--------|
| `shared/src/sim/world.ts` | Add `players` map to GameWorld |
| `shared/src/sim/playerRegistry.ts` | **New** -- addPlayer, removePlayer, getPlayerEntity |
| `shared/src/sim/prefabs.ts` | Minor: spawn position helpers |
| `shared/src/sim/index.ts` | Export playerRegistry |

---

## Epic 3: Multi-Player AI Targeting

**Package:** `shared`
**Scope:** Small
**Depends on:** Epic 2

Four enemy systems hardcode `players[0]` as the target. With two players, enemies should target the nearest alive player.

### Approach

- `enemyDetectionSystem` -- find nearest alive player per enemy (not just `players[0]`)
- `flowFieldSystem` -- multi-source BFS: enqueue both player cells as distance-0 seeds (elegant, free)
- `enemySteeringSystem` -- use `EnemyAI.targetEid` position instead of hardcoded `players[0]`
- `enemyAttackSystem` -- aim at `EnemyAI.targetEid` instead of first alive player

### Key Files

| File | Change |
|------|--------|
| `shared/src/sim/systems/enemyDetection.ts` | Nearest-player targeting |
| `shared/src/sim/systems/flowField.ts` | Multi-source BFS |
| `shared/src/sim/systems/enemySteering.ts` | Use targetEid |
| `shared/src/sim/systems/enemyAttack.ts` | Aim at targetEid |

**Note:** Can be deferred if needed -- the game still runs if enemies only target player 0. But fixing it is small and omitting it creates confusing behavior.

---

## Epic 4: Snapshot Serialization

**Package:** `shared`
**Scope:** Medium
**Depends on:** Nothing (parallel with Epics 1-3)

Custom binary encode/decode for world state. This is the transport format between server and clients.

### Snapshot Format (v1)

```
Header:       tick(u32) + playerCount(u8) + bulletCount(u16) + enemyCount(u16)  = 9 bytes
Per player:   eid(u16) + x(f32) + y(f32) + aimAngle(f32) + state(u8) + hp(u8) + flags(u8) = 17 bytes
Per bullet:   eid(u16) + x(f32) + y(f32) + vx(f32) + vy(f32) + layer(u8)                 = 19 bytes
Per enemy:    eid(u16) + x(f32) + y(f32) + type(u8) + hp(u8) + aiState(u8)                = 11 bytes
```

Typical snapshot (2 players, 20 bullets, 30 enemies): ~753 bytes. Well within budget.

### Key Files

| File | Change |
|------|--------|
| `shared/src/net/snapshot.ts` | **New** -- `encodeSnapshot(world)`, `decodeSnapshot(data)`, `WorldSnapshot` type |
| `shared/src/net/index.ts` | Export snapshot module |

---

## Epic 5: Colyseus Server Room

**Package:** `server`
**Scope:** Large
**Depends on:** Epics 1, 2, 4

The actual game server: accepts clients, runs the shared simulation, broadcasts snapshots.

### Approach

- Install `colyseus`, `@colyseus/schema` dependencies
- Server bootstrap: `new Server()`, `define("game", GameRoom)`, `listen(2567)`
- `GameRoom`:
  - `onCreate`: create GameWorld, register systems, setup tilemap, start `setSimulationInterval` with fixed-timestep accumulator
  - `onJoin`: `addPlayer(world, sessionId)`, send game config (seed, player eid)
  - `onLeave`: `removePlayer(world, sessionId)`
  - `onMessage("input")`: push to per-player input queue (capped at 30)
  - `serverTick()`: pop one input per player into `world.playerInputs`, call `stepWorld(world, systems)`, broadcast binary snapshot every 3 ticks (20Hz)
- Minimal Schema state: `phase` (lobby/playing), `players` MapSchema (name, ready), `serverTick`

### Key Files

| File | Change |
|------|--------|
| `server/package.json` | Add colyseus dependencies |
| `server/src/index.ts` | Server bootstrap |
| `server/src/rooms/GameRoom.ts` | **New** -- main room with match loop |
| `server/src/rooms/schema/GameRoomState.ts` | **New** -- minimal Schema |

---

## Epic 6: Client Networking

**Package:** `client`
**Scope:** Medium
**Depends on:** Epic 5

The client connects to the server, sends input each tick, and receives snapshots.

### Approach

- Install `colyseus.js` dependency
- `NetworkClient` class: connect/join, sendInput, onSnapshot callback, disconnect
- New `MultiplayerGameScene` (separate from single-player `GameScene`):
  - On update: capture input, send to server (does NOT step local sim)
  - On snapshot: decode, write into a local ECS world for rendering (renderers keep using existing queries)
  - On render: render all entities from ECS world (same renderers as single-player)
- Route toggle: `/play` (single-player) vs `/play-multi` (multiplayer)

### Key Files

| File | Change |
|------|--------|
| `client/package.json` | Add colyseus.js |
| `client/src/net/NetworkClient.ts` | **New** -- connection + input/snapshot transport |
| `client/src/scenes/MultiplayerGameScene.ts` | **New** -- multiplayer game loop (no local sim) |
| `client/src/pages/Game.tsx` | Mode toggle or route for multiplayer |

---

## Epic 7: Multi-Player Rendering

**Package:** `client`
**Scope:** Small-Medium
**Depends on:** Epic 6

Renderers need to handle multiple player sprites and render from snapshot state.

### Approach

- `PlayerRenderer` changes from singular `playerEntity` to `playerEntities: Map<number, Sprite>` -- create/destroy sprites as players join/leave
- Camera follows the local player (server tells client their eid on join)
- Bullet and enemy renderers already iterate ECS queries -- if the multiplayer scene writes snapshots into a local ECS world, they work as-is
- `applySnapshot(world, snapshot)` helper writes decoded snapshot data into ECS component arrays for rendering

### Key Files

| File | Change |
|------|--------|
| `client/src/render/PlayerRenderer.ts` | Support N player sprites |
| `client/src/engine/Camera.ts` | Follow local player eid (passed from server) |
| `client/src/net/snapshotApply.ts` | **New** -- write WorldSnapshot into ECS arrays for rendering |

---

## Dependency Graph

```
Epic 1 (Per-Player Input)  ──┐
                              ├── Epic 5 (Server) ── Epic 6 (Client Net) ── Epic 7 (Rendering)
Epic 2 (Player Registry)  ───┤
                              │
Epic 4 (Snapshots)         ───┘

Epic 3 (AI Targeting)      ── can be done anytime after Epic 2
```

**Parallel streams:**
- Epics 1 + 2 + 3 (shared sim refactors)
- Epic 4 (snapshot serialization, new file, no conflicts)
- Epics 5 → 6 → 7 (server → client, sequential)

## Systems That Don't Need Changes

These systems are already entity-agnostic and work with N players:
`movementSystem`, `bulletSystem`, `bulletCollisionSystem`, `healthSystem`, `collisionSystem`, `spatialHashSystem`, `rollSystem`, `buffSystem`

## Verification

1. `bun run typecheck` -- clean across all packages
2. `bun test packages/shared/` -- all existing tests pass (single-player backward compat)
3. `bun run dev` -- single-player mode works exactly as before
4. `bun run dev:server` -- Colyseus server starts on port 2567
5. Open two browser tabs to multiplayer route -- both connect, see each other, can move and shoot
