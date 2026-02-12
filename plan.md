# Sprint 6: Multiplayer Foundation — Progress

## Epic Checklist

- [x] **Epic 1: Per-Player Input Routing** *(shared)* — `9a6f2a5`
  - [x] `playerInputs: Map<number, InputState>` on GameWorld
  - [x] 5 input-consuming systems read `world.playerInputs.get(eid)` per entity
  - [x] `stepWorld()` backward-compat: single `input` param populates map for all players
- [x] **Epic 2: Player Registry** *(shared)* — `9a6f2a5`
  - [x] `players: Map<string, { eid, slot }>` on GameWorld
  - [x] `addPlayer()` / `removePlayer()` / `getPlayerEntity()` in `playerRegistry.ts`
  - [x] Offset spawn positions per slot
  - [x] Tests: 14 passing in `playerRegistry.test.ts`
- [x] **Epic 3: Multi-Player AI Targeting** *(shared)* — `d978206`
  - [x] `enemyDetectionSystem` — nearest alive player with target stability + leash hysteresis
  - [x] `flowField` — multi-source BFS from all alive players
  - [x] `enemySteering` / `enemyAttack` — use per-entity `targetEid`
  - [x] Tests: 10 passing in `enemyDetection.test.ts`
- [x] **Epic 4: Snapshot Serialization** *(shared)* — `d978206`
  - [x] Binary encode/decode in `net/snapshot.ts`
  - [x] `WorldSnapshot` / `PlayerSnapshot` / `BulletSnapshot` / `EnemySnapshot` types
  - [x] Tests: 11 passing in `snapshot.test.ts`
- [x] **Epic 5: Colyseus Server Room** *(server)* — `d978206`
  - [x] Colyseus server bootstrap at `ws://localhost:2567`
  - [x] `GameRoom` with 60Hz sim loop, input queuing, 20Hz snapshot broadcast
  - [x] `GameRoomState` Schema (lobby metadata)
  - [x] Input validation type guard
- [x] **Epic 6: Client Networking** *(client)* — uncommitted
  - [x] `NetworkClient` class (connect/join, sendInput, onSnapshot, disconnect)
  - [x] `SnapshotBuffer` with interpolation state
  - [x] `MultiplayerGameScene` — shadow ECS world, snapshot-driven rendering
  - [x] `/play-multi` route + `MultiplayerGame.tsx` page
  - [x] Server EID → client EID mapping for players, bullets, enemies
- [x] **Epic 7: Multi-Player Rendering** *(client)* — uncommitted
  - [x] Per-entity `deathStartTime` (was shared class-level field)
  - [x] Fix `playerEntity` tracking (only set on first creation, not overwritten)
  - [x] Remote player blue tint via `localPlayerEid`
  - [x] `MultiplayerGameScene` wires `localPlayerEid` on local player identification

## Verification

- [x] `bun run typecheck` — clean
- [x] `bun run build` — clean
- [x] `bun test packages/shared/` — 345 tests, 0 failures

## Status: All 7 epics complete. Epics 6 & 7 uncommitted.

---

# Sprint 7 — Epic 2 & 3 Review

**Date**: 2026-02-08
**Branch**: main (uncommitted)
**Scope**: Epic 2 (Clock Sync) + Epic 3 (Input Sequencing & Snapshot v3)

---

## Verification Results

| Check | Status | Details |
|-------|--------|---------|
| Types | PASS | `bun run typecheck` — clean across all packages |
| Tests | PASS | 355 pass / 0 fail (14 snapshot + 7 InputBuffer + 334 existing) |
| Build | PASS | (implied by typecheck — no separate build step needed for review) |

---

## Code Review Findings

### Medium Priority

**M1. `seq` not validated as positive integer (server)**
`GameRoom.ts:61` — `isFiniteNumber(d.seq)` accepts negative numbers, zero, and floats (e.g. `seq: -5` or `seq: 3.14`). A malicious client could send `seq: 0` which should be reserved for "never received," or `seq: -1` which would confuse `acknowledgeUpTo`. The `clampInput` function passes `seq` through unclamped.

*Impact*: Low in practice — a client would only sabotage its own reconciliation. The server processes inputs in queue order regardless of seq value. But it's a defense-in-depth gap.

*Fix*: Either `Math.max(0, input.seq | 0)` in `clampInput`, or add `d.seq > 0` to `isValidInput`. The plan says "starts at 1" but nothing enforces it server-side.

**M2. `const bytes` redeclared in shared README code sample**
`packages/shared/README.md:295,299` — The snapshot code example declares `const bytes` twice, which is a syntax error if copy-pasted. Should use separate variable names or show as two independent examples.

**M3. Sprint doc still says "Protocol v2" in ASCII diagram**
`docs/sprints/sprint-7-multiplayer-netcode.md:922` — The implementation order ASCII art still says `Epic 3 (Input Seq + Protocol v2)` while the epic header and table were updated to v3.

### Low Priority

**L1. `broadcastSnapshot` allocates a new Map every broadcast (20Hz)**
`GameRoom.ts:217` — `new Map<number, number>()` is created on every broadcast call. For 2-8 players at 20Hz this is ~160 tiny allocations/sec. Not a perf concern today, but could be a class-level `private playerSeqs = new Map()` that gets `.clear()`ed and repopulated.

**L2. ClockSync has no unit tests**
`ClockSync.ts` has injectable `now` for testability but no test file exists. The class is simple enough, but the `onPong` logic (sort, trim, median, snap/blend) has enough branches to warrant coverage.

**L3. `InputBuffer.acknowledgeUpTo` scans linearly**
Fine for 128 elements, but since seqs are monotonically increasing, a binary search would be O(log n) instead of O(n). Not worth fixing now — the linear scan is simple and 128 is tiny.

---

## Positive Observations

**Clean separation**: `NetworkInput` lives in shared (not client) — correct since both server and client reference it. `InputState` is unchanged for single-player — zero impact on the existing game.

**Wire format correctness**: Encoder/decoder offsets are symmetric. The `playerSeqs?.get(eid) ?? 0` default means `encodeSnapshot(world, time)` still works for tests and single-player without breaking the format.

**Server seq tracking**: Neutral input correctly does NOT advance `lastProcessedSeq` — this is critical. If it did, the client would discard unacknowledged inputs on idle server ticks.

**Test quality**: The snapshot spec test (`826 = 14 + 42 + 380 + 390`) catches format drift. The InputBuffer tests cover all 7 expected behaviors including edge cases (gaps, overflow, no-op ack).

**`tsconfig.json` fix**: Adding `exclude: ["src/**/*.test.ts"]` to the client package matches the shared package pattern and is the correct solution for `bun:test` type resolution.

**InputBuffer API**: `getPending()` returning `readonly NetworkInput[]` prevents external mutation. The `splice(0, n)` approach for acknowledgment is correct and simple.

---

## Verdict: PASS

Three medium issues to fix before committing:
1. Validate `seq > 0` in `isValidInput` or truncate in `clampInput`
2. Fix the duplicate `const bytes` in the shared README example
3. Fix "Protocol v2" → "Protocol v3" in the sprint doc ASCII diagram

---

# Procedural Per-Stage Maps — Review

**Date**: 2026-02-11
**Branch**: main (uncommitted)
**Files Changed**: 22 (3 new, 17 modified, 2 test files updated)

## Verification Results

| Check | Status | Details |
|-------|--------|---------|
| Tests | PASS | 663/663 pass, 0 fail |
| Types | PASS | `tsc --build --force` clean |
| Build | PASS | shared + client build succeeds |

## Code Review Findings

### Critical Issues

**C1. Flood fill connectivity is single-pass** (`mapGenerator.ts:225-286`)
Removing a wall adjacent to an unreachable pocket doesn't guarantee that pocket connects to the main area. Needs iterative re-flood until no unreachable pockets remain.

### High Priority

**H1. `swapTilemap` doesn't zero velocity** (`world.ts:440-453`)
Players teleported to new center but velocity persists. Could cause brief visual glitch.

**H2. Enemy hazard avoidance ignores MUD** (`enemySteering.ts:36-39`)
`isHazardFloor()` only checks LAVA and BRAMBLE. Should document whether this is intentional.

**H3. Tilemap change detection duplicated** in SP and MP mode controllers.

### Medium Priority

**M1. No unit tests for mapGenerator** — Poisson, noise, flood fill, determinism untested.
**M2. `floorSpeedMul` ordering dependency** — hazardTileSystem must run before input/steering. Should document.
**M3. Map generation synchronous during camp-complete** — potential frame hitch.

### Low Priority

**L1.** Magic numbers in map configs (noise thresholds).
**L2.** `getFloorPathfindCost` silently falls back to 1 for unknown types.

## Positive Observations

- Excellent determinism: SeededRng used throughout, seed derivation isolated per stage
- Clean architecture: map generation fully isolated in `content/maps/`
- All 663 existing tests pass with updated StageEncounter interface
- Both SP and MP mode controllers properly handle tilemap swaps with lighting refresh
- Server and client use same generation path for multiplayer parity

## Verdict: CONDITIONAL PASS

Fix C1 (iterative flood fill), H1 (zero velocity), and add basic mapGenerator tests.

### Next Steps
1. Fix flood fill to iterate until fully connected
2. Zero velocity in `swapTilemap`
3. Add `mapGenerator.test.ts` (determinism, center walkability, connectivity)
4. Document MUD avoidance behavior in enemySteering
