# Multiplayer Parity Refactor Notes (2026-02-10)

## Goal
Reduce feature drift and jitter-causing divergence by consolidating gameplay presentation and networking behavior into shared scene-core modules, then exposing a single scene runtime API for both singleplayer and multiplayer.

## Implemented Phases

### Phase 1 — Shared presentation/event pipeline

1. Added shared gameplay event model/buffer (`packages/client/src/scenes/core/GameplayEvents.ts`).
2. Added shared event processor for camera/audio/particles/text (`packages/client/src/scenes/core/GameplayEventProcessor.ts`).
3. Added shared renderer sync + enemy/bullet collision event generation (`packages/client/src/scenes/core/syncRenderersAndQueueEvents.ts`).
4. Added shared feedback transition helpers (`packages/client/src/scenes/core/feedbackSignals.ts`).
5. Added shared simulation stepping adapters (`packages/client/src/scenes/core/SimulationDriver.ts`).

### Phase 2 — Multiplayer decomposition (deeper-smell cleanup)

6. Extracted snapshot lifecycle apply into `SnapshotIngestor` (`packages/client/src/scenes/core/SnapshotIngestor.ts`).
7. Extracted predicted entity ownership/matching into `PredictedEntityTracker` (`packages/client/src/scenes/core/PredictedEntityTracker.ts`).
8. Extracted remote interpolation writes into `RemoteInterpolationApplier` (`packages/client/src/scenes/core/RemoteInterpolationApplier.ts`).
9. Extracted reconciliation + smoothing state into `MultiplayerReconciler` (`packages/client/src/scenes/core/MultiplayerReconciler.ts`).
10. Added multiplayer telemetry counters/overlay/logging (`packages/client/src/scenes/core/MultiplayerTelemetry.ts`).

### Phase 3 — Single public scene API

11. Replaced public two-scene split with one `CoreGameScene` API (`packages/client/src/scenes/CoreGameScene.ts`).
12. Added `SceneModeController`-driven mode delegation and removed legacy public scene files:
    - deleted `packages/client/src/scenes/GameScene.ts`
    - deleted `packages/client/src/scenes/MultiplayerGameScene.ts`
13. Updated page entrypoints to use `CoreGameScene`:
    - `packages/client/src/pages/Game.tsx`
    - `packages/client/src/pages/MultiplayerGame.tsx`

### Phase 4 — Policy parity + review-finding fixes

14. Added shared presentation policy layer:
    - hit feedback split (`simHitStopSeconds` vs `renderPauseSeconds`)
    - death sequence parity
    - debug hotkey policy parity
15. Added server input rate limiting (token bucket) in `GameRoom.ts`.
16. Switched server-bullet tracking to set-backed membership checks in multiplayer tracker.
17. Fixed network README snapshot buffer docs to match code (`5` snapshots).
18. Cleared stale reconnect token after reconnect exhaustion in `NetworkClient.ts`.

## Why This Helps

- New presentation behavior can be added once in shared scene-core modules and reused across both modes.
- Multiplayer render/update separation is explicit and modular, which makes jitter root causes easier to diagnose.
- Reconciliation, interpolation, and predicted-entity ownership are isolated instead of interleaved in one large controller.
- One public scene API removes page-level duplication and lowers future parity drift risk.

## Validation

- Shared parity harness:
  - `packages/client/src/scenes/core/GameplayParity.test.ts`
- Policy parity tests:
  - `packages/client/src/scenes/core/PresentationPolicy.test.ts`
  - `packages/client/src/scenes/core/SceneDebugHotkeys.test.ts`
  - `packages/client/src/scenes/core/DeathSequencePresentation.test.ts`
- Existing scene/net/shared tests pass after migration.
