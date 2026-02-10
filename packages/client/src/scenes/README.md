# scenes/

Core scene architecture for gameplay runtime.

## Current Files

- `CoreGameScene.ts` - Single public scene API used by both `/play` and `/play-multi`
- `types.ts` - Shared scene-facing UI data types (`HUDState`, skill tree types)
- `core/SceneModeController.ts` - Mode controller contract
- `core/SingleplayerModeController.ts` - Single-player mode implementation
- `core/MultiplayerModeController.ts` - Multiplayer mode implementation
- `core/*` utilities - Shared feedback/simulation helpers used by both controllers

## CoreGameScene

`CoreGameScene` is the only exported runtime scene class.

```typescript
const scene = await CoreGameScene.create({ gameApp, mode: 'singleplayer' })
// or:
const scene = await CoreGameScene.create({ gameApp, mode: 'multiplayer' })

scene.update(dt)
scene.render(alpha, fps)
scene.destroy()
```

Both modes expose the same API for pages/UI:
- `getHUDState()`
- `hasPendingPoints()`
- `getSkillTreeData()`
- `selectNode()`
- `isDisconnected()`

## Mode Controllers

`CoreGameScene` delegates mode-specific behavior to `SceneModeController` implementations:

- `SingleplayerModeController`:
  - Local full-world simulation
  - Skill tree/progression interactions
  - Hit stop and game-over sequence
- `MultiplayerModeController`:
  - Network connect/snapshot processing
  - Client prediction + reconciliation
  - Interpolation and disconnect handling

## Shared Core Utilities

Both controllers share the same feedback/sync helpers:

- `GameplayEvents.ts` - Event buffer + typed gameplay events
- `GameplayEventProcessor.ts` - Shared camera/audio/particle processing
- `PresentationPolicy.ts` - Shared presentation policy (sim hit-stop vs render pause, death sequence, debug hotkeys)
- `DeathSequencePresentation.ts` - Shared fade/game-over presentation controller
- `SceneDebugHotkeys.ts` - Shared debug hotkey handler wiring
- `syncRenderersAndQueueEvents.ts` - Shared renderer lifecycle + enemy/bullet effect event generation
- `SimulationDriver.ts` - Shared simulation stepping abstractions
- `feedbackSignals.ts` - Shared transition detection helpers
