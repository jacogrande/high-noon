# Core Scene System (Implemented Runtime)

Date: 2026-02-10

## Purpose

The client runtime now uses one gameplay scene API (`CoreGameScene`) for both modes:

- singleplayer (`/play`)
- multiplayer (`/play-multi`)

This replaces mode-specific public scenes and keeps feature behavior on one shared path.

## What Changed

Old public scene split:

- `GameScene` (singleplayer)
- `MultiplayerGameScene` (multiplayer)

Current public scene:

- `CoreGameScene` (`packages/client/src/scenes/CoreGameScene.ts`)

Mode-specific behavior is delegated to controllers that implement one contract:

- `SceneModeController` (`packages/client/src/scenes/core/SceneModeController.ts`)
- `SingleplayerModeController` (`packages/client/src/scenes/core/SingleplayerModeController.ts`)
- `MultiplayerModeController` (`packages/client/src/scenes/core/MultiplayerModeController.ts`)

## Runtime Topology

```text
React Page (/play or /play-multi)
  -> GameApp + GameLoop
  -> CoreGameScene
      -> SceneModeController (singleplayer OR multiplayer)
          -> shared scene-core modules
             - GameplayEvents
             - GameplayEventProcessor
             - syncRenderersAndQueueEvents
             - SimulationDriver
             - feedbackSignals
```

## Public API (Stable Surface)

`CoreGameScene` is the only scene class pages should import.

```ts
const scene = await CoreGameScene.create({
  gameApp,
  mode: 'singleplayer',
  characterId: 'undertaker',
})
// or
const scene = await CoreGameScene.create({
  gameApp,
  mode: 'multiplayer',
  characterId: 'prospector',
})

scene.update(dt)
scene.render(alpha, fps)
scene.getHUDState()
scene.hasPendingPoints()
scene.getSkillTreeData()
scene.selectNode(nodeId)
scene.isDisconnected()
scene.destroy()
```

`characterId` is now part of the stable API surface:

- In singleplayer it selects which shared character definition initializes world/player runtime.
- In multiplayer it is sent as a join preference, then replaced by server-authoritative `game-config.characterId`.

## Controller Contract

Each mode controller implements:

- `initialize(options?)`
- `update(dt)` (fixed-tick gameplay step)
- `render(alpha, fps)` (presentation step)
- HUD/skill-tree selectors
- `isDisconnected()` for multiplayer UX
- `destroy()`

This keeps page-level lifecycle code identical between modes.

## Update vs Render Separation

The pipeline is intentionally split:

- `update(dt)` handles simulation/network progression at fixed tick rate.
- `render(alpha, fps)` handles interpolation and drawing at display refresh rate.

This is critical for multiplayer responsiveness:

- socket callbacks stay lightweight (`pendingSnapshot` only)
- authoritative snapshot apply/reconciliation happens on fixed update ticks
- render never blocks on snapshot decode/apply work

## Multiplayer Data Flow (Current)

### Update tick (authoritative + prediction)

1. Process at most one pending authoritative snapshot.
2. Apply lifecycle for players/bullets/enemies to the local shadow world.
3. Reconcile local player (rewind to server state, acknowledge processed inputs, replay unacked local inputs, accumulate render-only error offset `errorX/errorY`).
4. Collect current input, enqueue/send with sequence number.
5. Run local prediction step.
6. Generate local feedback events (fire/reload/dry-fire/showdown).
7. Update camera at tick rate.

### Character authority flow (multiplayer)

1. Page chooses `characterId` via `CharacterSelect`.
2. `CoreGameScene` passes it to `MultiplayerModeController`.
3. Controller sends it in `NetworkClient.join({ characterId })`.
4. `GameRoom` validates the character, initializes per-player upgrade state, and sends `game-config` with authoritative `characterId`.
5. Client applies authoritative character runtime before local snapshot ingestion/prediction setup.
6. HUD and prediction setup use authoritative local character (cylinder vs melee ability state).

### Render frame (presentation)

1. Interpolate remote entities from snapshot buffer.
2. Decay visual reconciliation offset over time.
3. Apply local-player render override (do not mutate authoritative/predicted ECS state for visuals).
4. Render players/bullets/enemies/showdown.
5. Process shared gameplay effects (particles/sounds/floating text/camera feedback).

## Shared Parity Modules

Feature feedback parity between modes now depends on shared scene-core modules:

- `GameplayEvents.ts`: typed gameplay events and queue
- `GameplayEventProcessor.ts`: camera/audio/particles/text processing
- `PresentationPolicy.ts`: mode-level presentation policy (sim hit-stop vs render pause, death sequence, debug hotkeys)
- `DeathSequencePresentation.ts`: shared fade/game-over presentation flow
- `SceneDebugHotkeys.ts`: shared debug hotkey handler
- `syncRenderersAndQueueEvents.ts`: renderer sync and effect events
- `feedbackSignals.ts`: transition detection helpers
- `SimulationDriver.ts`: full-world/local-player simulation drivers

When adding visual/audio feedback, prefer these shared modules first.

## Source of Truth Rules

- Server remains authoritative for multiplayer simulation outcomes.
- Local player input is predicted immediately on client.
- Reconciliation uses render-only smoothing before visible correction.
- Remote entities are snapshot-interpolated.
- UI state in multiplayer may combine server HUD data with local predicted state for immediate feedback.
- Character choice is server-authoritative in multiplayer and persisted across reconnect for the same slot.

## Adding New Gameplay Features Without Drift

Use this sequence:

1. Add core gameplay behavior in `packages/shared` (systems/components/snapshots).
2. Add feedback signal detection in `feedbackSignals.ts` if needed.
3. Emit gameplay events through `GameplayEvents` from both mode controllers.
4. Handle effects in `GameplayEventProcessor` once.
5. Keep mode-specific logic only where transport/authority differs.
6. Add tests around shared helpers (`SimulationDriver`, `feedbackSignals`, etc.).

If a change requires duplicating effect logic in both controllers, treat that as an architecture smell and move it into scene-core shared modules.
