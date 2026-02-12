# MP Feature Parity: Skill Tree & Level-Up

**Date**: 2026-02-10
**Branch**: mp-feature-parity (uncommitted)
**Scope**: Add skill tree node selection to multiplayer, matching singleplayer UX

---

## Changes Summary

### Protocol Extensions (shared)

- `SelectNodeRequest { nodeId: string }` — client → server RPC
- `SelectNodeResponse { success: boolean; nodeId: string }` — server → client result
- Extended `HudData` with XP/level fields: `xp`, `level`, `pendingPoints`, `xpForCurrentLevel`, `xpForNextLevel`
- Extended `HudData` with wave fields: `waveNumber`, `totalWaves`, `waveStatus`

### Server (GameRoom.ts)

- Added `select-node` message handler
  - Validates slot existence
  - Calls `takeNode()` (server-authoritative, includes validation)
  - Writes stats to ECS on success
  - Always sends `select-node-result` response
- Extended `sendHudUpdates()` to include XP/level/wave data in every HUD push (20Hz)

### Client (MultiplayerModeController.ts)

- Added `upgradeStateCache: UpgradeState | null` for local UI state
- Initialized cache from `GameConfig` on spawn
- `selectNode(nodeId)` — optimistic update + send RPC
- `select-node-result` handler — sync `nodesTaken` and `pendingPoints` on success
- HUD handler syncs `xp`/`level`/`pendingPoints` from server to cache
- Level-up detection: compare `latestHud.level` to `lastProcessedLevel`, emit `level-up` event
- `getSkillTreeData()` — derives UI state from cache (matches singleplayer pattern)
- `hasPendingPoints()` — reads from `latestHud.pendingPoints`

### Client (MultiplayerGame.tsx)

- Mirrors singleplayer `Game.tsx` pattern:
  - Polls `hasPendingPoints()` in render callback
  - Opens `SkillTreePanel` when points available
  - `handleNodeSelect()` calls `scene.selectNode()` + refreshes tree data
  - Closes panel when `pendingPoints` reaches 0

### Client (NetworkClient.ts)

- Added `sendSelectNode(nodeId)` method
- Added `select-node-result` message listener + event emission

---

## Design Rationale

**Why optimistic update?**
Matches singleplayer UX — node selection is instant, no visible latency. If validation fails server-side, the `select-node-result` handler won't re-add the node (it's already in the cache), and the next HUD sync will correct `pendingPoints`.

**Why cache upgrade state client-side?**
The server owns authoritative state, but the client needs a local copy to compute `canTakeNode()` for UI (locked/available/taken states). The cache is synced from:
1. Initial `GameConfig` (on spawn)
2. HUD updates (xp/level/pendingPoints @ 20Hz)
3. `select-node-result` (nodesTaken + pendingPoints on success)

**Why not send full tree state in HUD?**
Bandwidth. `nodesTaken` is a small set (max 15 nodes), and only changes on skill selection. XP/level changes frequently (every kill), so those sync via HUD. The server sends the authoritative `pendingPoints` count, and the client derives UI state locally using the shared `canTakeNode()` logic.

---

## Verification Results

| Check | Status | Details |
|-------|--------|---------|
| `bun run typecheck` | PASS | Clean across all packages |
| `bun run build` | PASS | Shared + client build without warnings |
| `bun run build:server` | PASS | Server build clean |
| `bun test` | PASS | 634 tests pass, 0 fail |

---

## Known Limitations

1. **No multiplayer-specific tests** — `select-node` protocol has no unit tests. The server handler relies on `takeNode()` validation (which is well-tested), but the RPC flow itself is untested.
2. **Reconnect does NOT sync skill tree state** — `GameConfig` is only sent on initial join. If a player reconnects, they get a fresh `upgradeStateCache` that won't reflect nodes taken during the previous session. The HUD will show correct `pendingPoints`, but the tree UI will show all nodes as untaken.
3. **No input validation on nodeId** — The server accepts any string for `nodeId`. `takeNode()` validates it exists, but a malicious client could spam invalid nodeIds without rate limiting.
4. **Race condition on rapid selection** — If a player clicks two nodes in <50ms (one server round-trip), the second optimistic update will succeed locally but fail server-side (only 1 pending point). The UI won't reflect the failure until the next HUD sync corrects `pendingPoints`.

---

## Next Steps (if merging)

1. Add integration test for `select-node` RPC flow
2. Fix reconnect: include `nodesTaken` in `GameConfig` or send on reconnect
3. Add input validation: `typeof data.nodeId === 'string' && data.nodeId.length < 50`
4. Consider rate limiting or debouncing node selection client-side
